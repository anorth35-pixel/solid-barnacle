import type { Server, Socket } from 'socket.io';
import type { GameConfig, PlayerSeat } from '@cribbgolf/shared';
import {
  createRoom, joinRoom, setReady, getRoomBySocket, getRoomByCode,
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
    socket.emit('room:joined', { room: summary, yourSeat: room.players.at(-1)!.seat });
    socket.to(room.code).emit('room:updated', { room: summary });
  });

  socket.on('room:ready', ({ ready }: { ready: boolean }) => {
    const room = setReady(socket.id, ready);
    if (!room) return;
    io.to(room.code).emit('room:updated', { room: toSummary(room) });
  });

  socket.on('room:leave', () => {
    handleDisconnect(io, socket);
  });

  // ── Game start ────────────────────────────────────────────────────────────

  socket.on('game:start', () => {
    const room = getRoomBySocket(socket.id);
    if (!room || room.hostSocketId !== socket.id) return;
    if (room.players.some((p) => !p.ready)) return;

    markInGame(room.code);
    const game = new ServerGame(
      room.config,
      room.players.map((p) => ({
        id: p.socketId,
        name: p.name,
        type: 'human' as const,
        seat: p.seat,
      })),
    );
    activeGames.set(room.code, game);
    game.startGame();
    io.to(room.code).emit('game:phase-change', { phase: game.state.phase, state: sanitizeState(game.state, '') });

    // Send private hands
    for (const player of game.state.players) {
      io.to(player.id).emit('game:dealt', { yourHand: player.hand, dealerSeat: game.state.dealerSeat });
    }

    // Kick off AI discards if needed
    triggerAIActions(io, room.code, game);
  });

  // ── Game actions ──────────────────────────────────────────────────────────

  socket.on('game:discard', ({ cardIds }: { cardIds: string[] }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (!game) return;

    const ok = game.discard(socket.id, cardIds);
    if (!ok) { socket.emit('game:error', { code: 'INVALID_DISCARD', message: 'Invalid discard' }); return; }

    const seat = game.state.players.findIndex((p) => p.id === socket.id);
    io.to(room.code).emit('game:discard-done', { seat });

    if (game.state.phase === 'cutting') {
      io.to(room.code).emit('game:phase-change', { phase: 'cutting', state: sanitizeState(game.state, '') });
    }
  });

  socket.on('game:cut', ({ position }: { position: number }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (!game || game.state.phase !== 'cutting') return;

    const events = game.cut(position);
    io.to(room.code).emit('game:starter', { card: game.state.starterCard!, nibsEvent: events[0] });
    io.to(room.code).emit('game:phase-change', { phase: 'pegging', state: sanitizeState(game.state, '') });

    if (events.length > 0) {
      io.to(room.code).emit('game:peg-moved', { movements: game.state.pendingPegMovements });
      game.state.pendingPegMovements = [];
    }

    triggerAIActions(io, room.code, game);
  });

  socket.on('game:peg', ({ cardId }: { cardId: string }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (!game || game.state.phase !== 'pegging') return;

    const result = game.playCard(socket.id, cardId);
    if (!result) { socket.emit('game:error', { code: 'INVALID_PEG', message: 'Invalid card play' }); return; }

    const seat = game.state.players.findIndex((p) => p.id === socket.id);
    io.to(room.code).emit('game:card-played', {
      seat,
      card: game.state.players[seat].playedCards.at(-1)!,
      runningCount: game.state.pegging.runningCount,
      scoreEvents: result.events,
      pegMovements: result.movements,
    });

    const phaseAfterPeg = game.state.phase as string;
    if (phaseAfterPeg === 'hand-scoring') {
      runHandScoringSequence(io, room.code, game);
    } else {
      triggerAIActions(io, room.code, game);
    }
  });

  socket.on('game:go', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (!game || game.state.phase !== 'pegging') return;

    const seat = game.state.players.findIndex((p) => p.id === socket.id) as PlayerSeat;
    const result = game.callGo(socket.id);
    io.to(room.code).emit('game:go', { seat });
    if (result.events.length > 0) {
      io.to(room.code).emit('game:count-reset', { lastSeat: seat, lastCardEvent: result.events[0] });
    }
    const phaseAfterGo = game.state.phase as string;
    if (phaseAfterGo === 'hand-scoring') {
      runHandScoringSequence(io, room.code, game);
    } else {
      triggerAIActions(io, room.code, game);
    }
  });

  socket.on('game:muggins', ({ claimedItems }: { claimedItems: any[] }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (!game || !game.state.muggins) return;

    const movements = game.claimMuggins(socket.id, claimedItems);
    const seat = game.state.players.findIndex((p) => p.id === socket.id);
    io.to(room.code).emit('game:muggins-claimed', { claimerSeat: seat, items: claimedItems, pegMovements: movements });
    game.closeMuggins();
  });

  socket.on('game:muggins-pass', () => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (game?.state.muggins) game.closeMuggins();
    io.to(room.code).emit('game:muggins-closed', {});
  });

  // ── Disconnect ─────────────────────────────────────────────────────────────

  socket.on('disconnect', () => {
    handleDisconnect(io, socket);
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function handleDisconnect(io: Server, socket: Socket): void {
  const result = removePlayer(socket.id);
  if (!result) return;
  const { room, seat } = result;

  if (room.state === 'in-game') {
    io.to(room.code).emit('player:disconnected', { seat, waitingMs: RECONNECT_TIMEOUT_MS });
    const timer = setTimeout(() => {
      activeGames.delete(room.code);
    }, RECONNECT_TIMEOUT_MS);
    reconnectTimers.set(`${room.code}-${seat}`, timer);
  } else {
    io.to(room.code).emit('room:updated', { room: toSummary(room) });
  }
  socket.leave(room.code);
}

async function runHandScoringSequence(io: Server, roomCode: string, game: ServerGame): Promise<void> {
  const pc = game.state.config.playerCount;
  // Score pone(s) first, then dealer
  const order: PlayerSeat[] = [];
  for (let i = 1; i < pc; i++) {
    order.push(((game.state.dealerSeat + i) % pc) as PlayerSeat);
  }
  order.push(game.state.dealerSeat);

  for (const seat of order) {
    await delay(800);
    const bd = game.scoreHand(seat);
    io.to(roomCode).emit('game:hand-score', {
      seat,
      breakdown: bd,
      pegMovements: game.state.pendingPegMovements.splice(0),
    });

    if (game.state.config.mugginsEnabled) {
      const fullBd = bd; // server already computed full score
      const missed = fullBd.missedItems ?? [];
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

    if (game.state.golfScores.some((gs) => gs.isFinished)) {
      io.to(roomCode).emit('game:over', {
        winnerSeat: game.state.winner,
        finalGolfScores: game.state.golfScores,
      });
      return;
    }
  }

  // Score crib
  await delay(800);
  game.state.phase = 'crib-scoring';
  const cribBd = game.scoreCrib();
  io.to(roomCode).emit('game:crib-score', {
    seat: game.state.dealerSeat,
    breakdown: cribBd,
    pegMovements: game.state.pendingPegMovements.splice(0),
  });

  if (game.state.golfScores.some((gs) => gs.isFinished)) {
    io.to(roomCode).emit('game:over', {
      winnerSeat: game.state.winner,
      finalGolfScores: game.state.golfScores,
    });
    return;
  }

  await delay(2000);
  game.advanceRound();
  io.to(roomCode).emit('game:phase-change', { phase: game.state.phase, state: sanitizeState(game.state, '') });

  // Send new private hands
  for (const player of game.state.players) {
    io.to(player.id).emit('game:dealt', { yourHand: player.hand, dealerSeat: game.state.dealerSeat });
  }

  triggerAIActions(io, roomCode, game);
}

function triggerAIActions(io: Server, roomCode: string, game: ServerGame): void {
  const activeSeat = game.state.activePlayerSeat;
  if (activeSeat === null) return;
  const player = game.state.players[activeSeat];
  if (player.type !== 'ai') return;

  const runner = new AITurnRunner(game, activeSeat, (type, data: any) => {
    if (type === 'discard') {
      game.discard(data.playerId, data.cardIds);
      io.to(roomCode).emit('game:discard-done', { seat: activeSeat });
      if (game.state.phase === 'cutting') {
        io.to(roomCode).emit('game:phase-change', { phase: 'cutting', state: sanitizeState(game.state, '') });
      }
    } else if (type === 'peg') {
      const result = game.playCard(data.playerId, data.cardId);
      if (result) {
        io.to(roomCode).emit('game:card-played', {
          seat: activeSeat,
          card: player.playedCards.at(-1)!,
          runningCount: game.state.pegging.runningCount,
          scoreEvents: result.events,
          pegMovements: result.movements,
        });
        if (game.state.phase === 'hand-scoring') runHandScoringSequence(io, roomCode, game);
        else triggerAIActions(io, roomCode, game);
      }
    } else if (type === 'go') {
      const result = game.callGo(data.playerId);
      io.to(roomCode).emit('game:go', { seat: activeSeat });
      if (result.events.length > 0) {
        io.to(roomCode).emit('game:count-reset', { lastSeat: activeSeat, lastCardEvent: result.events[0] });
      }
      if (game.state.phase === 'hand-scoring') runHandScoringSequence(io, roomCode, game);
      else triggerAIActions(io, roomCode, game);
    }
  });

  if (game.state.phase === 'discarding') runner.runDiscard();
  else if (game.state.phase === 'pegging') runner.runPeg();
}

function sanitizeState(state: any, _socketId: string): any {
  // Don't send opponent's hand or deck contents to clients
  return {
    ...state,
    deck: [],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
