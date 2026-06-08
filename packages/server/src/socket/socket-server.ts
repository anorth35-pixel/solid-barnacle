import type { Server, Socket } from 'socket.io';
import type { GameConfig, PlayerSeat } from '@cribbgolf/shared';
import type { Player } from '@cribbgolf/shared';
import {
  createRoom, joinRoom, setReady, getRoomBySocket,
  markInGame, removePlayer, toSummary,
} from '../rooms/room-manager.js';
import { ServerGame } from '../game/server-game.js';
import { AITurnRunner } from '../game/ai-turn-runner.js';
import { RECONNECT_TIMEOUT_MS } from '../config.js';

const activeGames = new Map<string, ServerGame>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();

export function registerSocketHandlers(io: Server, socket: Socket): void {

  // ── Lobby ────────────────────────────────────────────────────────────────

  socket.on('room:create', ({ playerName, config }: { playerName: string; config: Partial<GameConfig> }) => {
    const room = createRoom(socket.id, playerName, config);
    socket.join(room.code);
    socket.emit('room:created', { roomCode: room.code, room: toSummary(room) });
  });

  socket.on('room:join', ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
    const room = joinRoom(socket.id, roomCode, playerName);
    if (!room) {
      socket.emit('room:error', { code: 'NOT_FOUND', message: 'Room not found or full' });
      return;
    }
    socket.join(room.code);
    const summary = toSummary(room);
    const seat = room.players.find((p) => p.socketId === socket.id)!.seat;
    socket.emit('room:joined', { room: summary, yourSeat: seat });
    socket.to(room.code).emit('room:updated', { room: summary });
  });

  socket.on('room:ready', ({ ready }: { ready: boolean }) => {
    const room = setReady(socket.id, ready);
    if (!room) return;
    io.to(room.code).emit('room:updated', { room: toSummary(room) });
  });

  socket.on('room:leave', () => handleDisconnect(io, socket));

  // ── Game start ────────────────────────────────────────────────────────────

  socket.on('game:start', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;

    const isVsAI = room.config.mode === 'vs-ai';

    // Non-AI games require all players to be ready
    if (!isVsAI && room.players.some((p) => !p.ready)) return;

    markInGame(room.code);

    const humanPlayers = room.players.map((p) => ({
      id: p.socketId,
      name: p.name,
      type: 'human' as Player['type'],
      seat: p.seat as PlayerSeat,
    }));

    // Fill remaining seats with AI for vs-ai mode
    const aiPlayers: typeof humanPlayers = isVsAI
      ? Array.from({ length: room.config.playerCount - humanPlayers.length }, (_, i) => ({
          id: `ai-${room.code}-${humanPlayers.length + i}`,
          name: `Computer ${i + 1}`,
          type: 'ai' as Player['type'],
          seat: (humanPlayers.length + i) as PlayerSeat,
        }))
      : [];

    const game = new ServerGame(room.config, [...humanPlayers, ...aiPlayers]);
    activeGames.set(room.code, game);
    game.startGame();

    io.to(room.code).emit('game:phase-change', {
      phase: game.state.phase,
      state: sanitizeState(game.state),
    });

    // Send each human their private hand
    for (const player of game.state.players.filter((p) => p.type === 'human')) {
      io.to(player.id).emit('game:dealt', {
        yourHand: player.hand,
        dealerSeat: game.state.dealerSeat,
      });
    }

    triggerAIActions(io, room.code, game);
  });

  // ── Game actions ──────────────────────────────────────────────────────────

  socket.on('game:discard', ({ cardIds }: { cardIds: string[] }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (!game || game.state.phase !== 'discarding') return;

    const ok = game.discard(socket.id, cardIds);
    if (!ok) {
      socket.emit('game:error', { code: 'INVALID_DISCARD', message: 'Invalid discard' });
      return;
    }

    const seat = game.state.players.findIndex((p) => p.id === socket.id);
    io.to(room.code).emit('game:discard-done', { seat });

    if ((game.state.phase as string) === 'cutting') {
      io.to(room.code).emit('game:phase-change', {
        phase: 'cutting',
        state: sanitizeState(game.state),
      });
      // If pone is AI, have them cut
      const aiPone = game.poneNeedsTocut();
      if (aiPone !== null) {
        setTimeout(() => {
          if (game.state.phase !== 'cutting') return;
          const pos = Math.floor(Math.random() * 30) + 8;
          executeCut(io, room.code, game, pos);
        }, 800 + Math.random() * 700);
      }
    }
  });

  socket.on('game:cut', ({ position }: { position: number }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (!game || game.state.phase !== 'cutting') return;
    executeCut(io, room.code, game, position);
  });

  socket.on('game:peg', ({ cardId }: { cardId: string }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (!game || game.state.phase !== 'pegging') return;

    const result = game.playCard(socket.id, cardId);
    if (!result) {
      socket.emit('game:error', { code: 'INVALID_PEG', message: 'Cannot play that card' });
      return;
    }

    const seat = game.state.players.findIndex((p) => p.id === socket.id);
    const playedCard = game.state.players[seat].playedCards.at(-1)!;
    io.to(room.code).emit('game:card-played', {
      seat,
      card: playedCard,
      runningCount: game.state.pegging.runningCount,
      activePlayerSeat: game.state.activePlayerSeat,
      scoreEvents: result.events,
      pegMovements: result.movements,
      golfScores: game.state.golfScores,
    });

    afterPegAction(io, room.code, game);
  });

  socket.on('game:go', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (!game || game.state.phase !== 'pegging') return;

    const result = game.callGo(socket.id);
    const seat = game.state.players.findIndex((p) => p.id === socket.id) as PlayerSeat;

    io.to(room.code).emit('game:go-called', {
      seat,
      countReset: result.countReset,
      activePlayerSeat: game.state.activePlayerSeat,
      scoreEvents: result.events,
      pegMovements: result.movements,
      golfScores: game.state.golfScores,
    });

    afterPegAction(io, room.code, game);
  });

  socket.on('game:muggins', ({ claimedItems }: { claimedItems: any[] }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (!game || !game.state.muggins) return;

    const movements = game.claimMuggins(socket.id, claimedItems);
    const seat = game.state.players.findIndex((p) => p.id === socket.id);
    io.to(room.code).emit('game:muggins-claimed', {
      claimerSeat: seat,
      items: claimedItems,
      pegMovements: movements,
      golfScores: game.state.golfScores,
    });
  });

  socket.on('game:muggins-pass', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (game?.state.muggins) game.closeMuggins();
    io.to(room.code).emit('game:muggins-closed', {});
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────

  socket.on('disconnect', () => handleDisconnect(io, socket));
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

function executeCut(io: Server, roomCode: string, game: ServerGame, position: number): void {
  const events = game.cut(position);
  io.to(roomCode).emit('game:starter', {
    card: game.state.starterCard!,
    nibsEvent: events[0] ?? null,
    pegMovements: game.state.pendingPegMovements.splice(0),
    golfScores: game.state.golfScores,
  });
  io.to(roomCode).emit('game:phase-change', {
    phase: game.state.phase,
    state: sanitizeState(game.state),
  });

  if ((game.state.phase as string) === 'game-over') {
    io.to(roomCode).emit('game:over', {
      winnerSeat: game.state.winner,
      finalGolfScores: game.state.golfScores,
    });
    return;
  }
  triggerAIActions(io, roomCode, game);
}

function afterPegAction(io: Server, roomCode: string, game: ServerGame): void {
  const phase = game.state.phase as string;

  if (phase === 'game-over') {
    io.to(roomCode).emit('game:over', {
      winnerSeat: game.state.winner,
      finalGolfScores: game.state.golfScores,
    });
    return;
  }

  if (phase === 'hand-scoring') {
    runHandScoringSequence(io, roomCode, game);
  } else {
    triggerAIActions(io, roomCode, game);
  }
}

function handleDisconnect(io: Server, socket: Socket): void {
  const result = removePlayer(socket.id);
  if (!result) return;
  const { room, seat } = result;

  if (room.state === 'in-game') {
    io.to(room.code).emit('player:disconnected', { seat, waitingMs: RECONNECT_TIMEOUT_MS });
    const key = `${room.code}-${seat}`;
    clearTimeout(reconnectTimers.get(key));
    const timer = setTimeout(() => {
      activeGames.delete(room.code);
    }, RECONNECT_TIMEOUT_MS);
    reconnectTimers.set(key, timer);
  } else {
    io.to(room.code).emit('room:updated', { room: toSummary(room) });
  }
  socket.leave(room.code);
}

async function runHandScoringSequence(io: Server, roomCode: string, game: ServerGame): Promise<void> {
  const pc = game.state.config.playerCount;
  const order: PlayerSeat[] = [];
  for (let i = 1; i < pc; i++) {
    order.push(((game.state.dealerSeat + i) % pc) as PlayerSeat);
  }
  order.push(game.state.dealerSeat);

  for (const seat of order) {
    await delay(900);
    const bd = game.scoreHand(seat);
    const movements = game.state.pendingPegMovements.splice(0);
    io.to(roomCode).emit('game:hand-score', {
      seat,
      breakdown: bd,
      pegMovements: movements,
      golfScores: game.state.golfScores,
    });

    if ((game.state.phase as string) === 'game-over') {
      io.to(roomCode).emit('game:over', {
        winnerSeat: game.state.winner,
        finalGolfScores: game.state.golfScores,
      });
      return;
    }

    // Muggins window (only opens if missedItems were set — future enhancement)
    if (game.state.config.mugginsEnabled) {
      const missed = bd.missedItems ?? [];
      if (missed.length > 0) {
        const muggins = game.openMugginsWindow(bd.playerId, missed);
        io.to(roomCode).emit('game:muggins-window', {
          scoringPlayerId: bd.playerId,
          missedItems: missed,
          windowCloseAt: muggins.windowCloseAt,
        });
        await delay(game.state.config.mugginsWindowMs ?? 15_000);
        if (!game.state.muggins?.claimed) {
          game.closeMuggins();
          io.to(roomCode).emit('game:muggins-closed', {});
        }
      }
    }
  }

  await delay(900);
  game.state.phase = 'crib-scoring';
  const cribBd = game.scoreCrib();
  const cribMovements = game.state.pendingPegMovements.splice(0);
  io.to(roomCode).emit('game:crib-score', {
    seat: game.state.dealerSeat,
    breakdown: cribBd,
    pegMovements: cribMovements,
    golfScores: game.state.golfScores,
  });

  if ((game.state.phase as string) === 'game-over') {
    io.to(roomCode).emit('game:over', {
      winnerSeat: game.state.winner,
      finalGolfScores: game.state.golfScores,
    });
    return;
  }

  await delay(2500);
  game.advanceRound();

  if ((game.state.phase as string) === 'game-over') {
    io.to(roomCode).emit('game:over', {
      winnerSeat: game.state.winner,
      finalGolfScores: game.state.golfScores,
    });
    return;
  }

  io.to(roomCode).emit('game:phase-change', {
    phase: game.state.phase,
    state: sanitizeState(game.state),
  });

  for (const player of game.state.players.filter((p) => p.type === 'human')) {
    io.to(player.id).emit('game:dealt', {
      yourHand: player.hand,
      dealerSeat: game.state.dealerSeat,
    });
  }

  triggerAIActions(io, roomCode, game);
}

function triggerAIActions(io: Server, roomCode: string, game: ServerGame): void {
  // Handle discarding phase: trigger each AI player who hasn't discarded yet
  if (game.state.phase === 'discarding') {
    for (const player of game.getAIPlayersNeedingDiscard()) {
      const runner = makeAIRunner(io, roomCode, game, player.seat);
      runner.runDiscard();
    }
    return;
  }

  // Handle cutting phase
  if (game.state.phase === 'cutting') {
    const aiPone = game.poneNeedsTocut();
    if (aiPone !== null) {
      setTimeout(() => {
        if (game.state.phase !== 'cutting') return;
        const pos = Math.floor(Math.random() * 30) + 8;
        executeCut(io, roomCode, game, pos);
      }, 800 + Math.random() * 700);
    }
    return;
  }

  // Handle pegging phase
  if (game.state.phase === 'pegging' && game.isAITurn()) {
    const seat = game.state.activePlayerSeat!;
    const runner = makeAIRunner(io, roomCode, game, seat);
    runner.runPeg();
  }
}

function makeAIRunner(io: Server, roomCode: string, game: ServerGame, seat: PlayerSeat): AITurnRunner {
  return new AITurnRunner(game, seat, (type, data: any) => {
    if (type === 'discard') {
      const ok = game.discard(data.playerId, data.cardIds);
      if (!ok) return;
      io.to(roomCode).emit('game:discard-done', { seat });
      if (game.state.phase === 'cutting') {
        io.to(roomCode).emit('game:phase-change', {
          phase: 'cutting',
          state: sanitizeState(game.state),
        });
        const aiPone = game.poneNeedsTocut();
        if (aiPone !== null) {
          setTimeout(() => {
            if (game.state.phase !== 'cutting') return;
            executeCut(io, roomCode, game, Math.floor(Math.random() * 30) + 8);
          }, 800 + Math.random() * 700);
        }
      }
    } else if (type === 'peg') {
      const result = game.playCard(data.playerId, data.cardId);
      if (!result) return;
      const player = game.state.players.find((p) => p.id === data.playerId)!;
      io.to(roomCode).emit('game:card-played', {
        seat,
        card: player.playedCards.at(-1)!,
        runningCount: game.state.pegging.runningCount,
        activePlayerSeat: game.state.activePlayerSeat,
        scoreEvents: result.events,
        pegMovements: result.movements,
        golfScores: game.state.golfScores,
      });
      afterPegAction(io, roomCode, game);
    } else if (type === 'go') {
      const result = game.callGo(data.playerId);
      io.to(roomCode).emit('game:go-called', {
        seat,
        countReset: result.countReset,
        activePlayerSeat: game.state.activePlayerSeat,
        scoreEvents: result.events,
        pegMovements: result.movements,
        golfScores: game.state.golfScores,
      });
      afterPegAction(io, roomCode, game);
    }
  });
}

function sanitizeState(state: any): any {
  return { ...state, deck: [] };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
