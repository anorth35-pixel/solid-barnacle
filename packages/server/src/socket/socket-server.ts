import type { Server, Socket } from 'socket.io';
import type { GameConfig, PlayerSeat } from '@cribbgolf/shared';
import type { Player } from '@cribbgolf/shared';
import {
  createRoom, joinRoom, setReady, getRoomBySocket,
  markInGame, removePlayer, toSummary, getOpenRooms,
  disconnectPlayer, rejoinPlayer,
} from '../rooms/room-manager.js';
import { ServerGame } from '../game/server-game.js';
import { AITurnRunner } from '../game/ai-turn-runner.js';
import { RECONNECT_TIMEOUT_MS } from '../config.js';

const activeGames = new Map<string, ServerGame>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
// Keyed by player socket id — resolved when client emits game:declare-score
const declarationResolvers = new Map<string, (points: number) => void>();

export function registerSocketHandlers(io: Server, socket: Socket): void {

  // ── Lobby ────────────────────────────────────────────────────────────────

  socket.on('room:list', () => {
    socket.emit('room:list', { rooms: getOpenRooms() });
  });

  socket.on('room:create', ({ playerName, config }: { playerName: string; config: Partial<GameConfig> }) => {
    const room = createRoom(socket.id, playerName, config);
    socket.join(room.code);
    const token = room.players[0].sessionToken;
    socket.emit('room:created', { roomCode: room.code, room: toSummary(room), sessionToken: token, yourSeat: 0 });
    io.emit('room:list-updated', { rooms: getOpenRooms() });
  });

  socket.on('room:join', ({ roomCode, playerName }: { roomCode: string; playerName: string }) => {
    const room = joinRoom(socket.id, roomCode, playerName);
    if (!room) {
      socket.emit('room:error', { code: 'NOT_FOUND', message: 'Room not found or full' });
      return;
    }
    socket.join(room.code);
    const summary = toSummary(room);
    const joinedPlayer = room.players.find((p) => p.socketId === socket.id)!;
    const seat = joinedPlayer.seat;
    const token = joinedPlayer.sessionToken;
    socket.emit('room:joined', { room: summary, yourSeat: seat, sessionToken: token });
    socket.to(room.code).emit('room:updated', { room: summary });
    io.emit('room:list-updated', { rooms: getOpenRooms() });
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
    io.emit('room:list-updated', { rooms: getOpenRooms() });

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

    if (room.config.mode !== 'board-only') {
      // Send each human their private hand
      for (const player of game.state.players.filter((p) => p.type === 'human')) {
        io.to(player.id).emit('game:dealt', {
          yourHand: player.hand,
          dealerSeat: game.state.dealerSeat,
        });
      }
      triggerAIActions(io, room.code, game);
    }
  });

  // ── Board-only: manual point entry ───────────────────────────────────────
  socket.on('game:manual-points', ({ playerId, points }: { playerId: string; points: number }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (!game || game.state.phase !== 'board-play') return;
    if (typeof points !== 'number' || points < 1 || points > 29) return;

    const movements = game.awardManualPoints(playerId, points);

    if ((game.state.phase as string) === 'game-over') {
      io.to(room.code).emit('game:over', {
        winnerSeat: game.state.winner,
        finalGolfScores: game.state.golfScores,
        stakesState: game.state.stakesState,
        finishingBonusAwardedTo: game.state.finishingBonusAwardedTo,
      });
      return;
    }

    io.to(room.code).emit('game:points-awarded', {
      playerId,
      points,
      pegMovements: movements,
      golfScores: game.state.golfScores,
      dealerSeat: game.state.dealerSeat,
    });
  });

  // ── Game actions ──────────────────────────────────────────────────────────

  socket.on('game:choose-path', ({ holeNumber, pathId }: { holeNumber: number; pathId: string }) => {
    const room = getRoomBySocket(socket.id);
    if (!room) return;
    const game = activeGames.get(room.code);
    if (!game) return;
    const ok = game.choosePath(socket.id, holeNumber, pathId);
    if (!ok) return;
    // Broadcast updated golf scores so all clients reflect the choice
    io.to(room.code).emit('game:path-chosen', {
      playerId: socket.id,
      holeNumber,
      pathId,
      golfScores: game.state.golfScores,
    });
  });

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

  socket.on('game:declare-score', ({ declaredPoints }: { declaredPoints: number }) => {
    const resolver = declarationResolvers.get(socket.id);
    if (resolver) resolver(Math.max(0, Math.floor(declaredPoints)));
  });

  // ── Reconnection ───────────────────────────────────────────────────────────

  socket.on('game:rejoin', ({ token }: { token: string }) => {
    const result = rejoinPlayer(token, socket.id);
    if (!result) {
      socket.emit('room:error', { code: 'REJOIN_FAILED', message: 'Session expired or not found' });
      return;
    }
    const { room, seat } = result;
    socket.join(room.code);
    // Cancel the game-delete timer for this seat
    const key = `${room.code}-${seat}`;
    clearTimeout(reconnectTimers.get(key));
    reconnectTimers.delete(key);
    // Let others know
    io.to(room.code).emit('player:reconnected', { seat });
    // Send full game state to the rejoining player
    const game = activeGames.get(room.code);
    if (game) {
      // Sync new socket ID into game state so subsequent game actions resolve correctly
      const player = game.state.players.find((p) => p.seat === seat && p.type === 'human');
      if (player) {
        const oldId = player.id;
        player.id = socket.id;
        // Move any pending declaration resolver to the new socket ID
        const resolver = declarationResolvers.get(oldId);
        if (resolver) {
          declarationResolvers.delete(oldId);
          declarationResolvers.set(socket.id, resolver);
        }
        socket.emit('game:dealt', {
          yourHand: player.hand,
          dealerSeat: game.state.dealerSeat,
        });
      }
      socket.emit('game:phase-change', {
        phase: game.state.phase,
        state: sanitizeState(game.state),
      });
    }
    socket.emit('game:rejoined', { seat, roomCode: room.code });
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
      stakesState: game.state.stakesState,
      finishingBonusAwardedTo: game.state.finishingBonusAwardedTo,
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
      stakesState: game.state.stakesState,
      finishingBonusAwardedTo: game.state.finishingBonusAwardedTo,
    });
    return;
  }

  if (phase === 'hand-scoring') {
    runHandScoringSequence(io, roomCode, game).catch((err) => {
      console.error(`[scoring] room ${roomCode}:`, err);
      // Recovery: advance to next round so the game isn't permanently stuck
      try { game.advanceRound(); } catch (_) { /* ignore */ }
      io.to(roomCode).emit('game:phase-change', {
        phase: game.state.phase,
        state: sanitizeState(game.state),
      });
      for (const player of game.state.players.filter((p) => p.type === 'human')) {
        io.to(player.id).emit('game:dealt', { yourHand: player.hand, dealerSeat: game.state.dealerSeat });
      }
      triggerAIActions(io, roomCode, game);
    });
  } else {
    triggerAIActions(io, roomCode, game);
  }
}

function handleDisconnect(io: Server, socket: Socket): void {
  // Check if they're in an active game — don't fully remove, just mark offline
  const activeRoom = getRoomBySocket(socket.id);
  if (activeRoom && activeRoom.state === 'in-game') {
    const result = disconnectPlayer(socket.id);
    if (!result) return;
    const { room, seat } = result;
    io.to(room.code).emit('player:disconnected', { seat, waitingMs: RECONNECT_TIMEOUT_MS });
    const key = `${room.code}-${seat}`;
    clearTimeout(reconnectTimers.get(key));
    const timer = setTimeout(() => {
      activeGames.delete(room.code);
    }, RECONNECT_TIMEOUT_MS);
    reconnectTimers.set(key, timer);
    socket.leave(room.code);
    return;
  }

  // Lobby disconnect — fully remove
  const result = removePlayer(socket.id);
  if (!result) return;
  const { room, seat } = result;
  io.to(room.code).emit('room:updated', { room: toSummary(room) });
  socket.leave(room.code);
}

async function runHandScoringSequence(io: Server, roomCode: string, game: ServerGame): Promise<void> {
  const pc = game.state.config.playerCount;
  const manual = game.state.config.manualScoring;
  const order: PlayerSeat[] = [];
  for (let i = 1; i < pc; i++) {
    order.push(((game.state.dealerSeat + i) % pc) as PlayerSeat);
  }
  order.push(game.state.dealerSeat);

  for (const seat of order) {
    await delay(900);

    let bd;
    if (manual && game.state.players[seat].type === 'human') {
      const actual = game.computeHandBreakdown(seat);
      const player = game.state.players[seat];
      // Send the hand + starter to only this player so they can count it themselves
      io.to(player.id).emit('game:score-declaration-needed', {
        seat,
        phase: 'hand',
        hand: player.hand,
        starterCard: game.state.starterCard,
        isCrib: false,
      });
      const declared = await waitForDeclaration(player.id, 60_000) ?? actual.total;
      bd = game.awardHandBreakdown(seat, actual, declared);
    } else {
      bd = game.scoreHand(seat);
    }

    const movements = game.state.pendingPegMovements.splice(0);
    io.to(roomCode).emit('game:hand-score', {
      seat,
      breakdown: bd,
      pegMovements: movements,
      golfScores: game.state.golfScores,
      hand: game.state.players[seat].hand,
      starterCard: game.state.starterCard,
      isCrib: false,
    });

    if ((game.state.phase as string) === 'game-over') {
      io.to(roomCode).emit('game:over', {
        winnerSeat: game.state.winner,
        finalGolfScores: game.state.golfScores,
      stakesState: game.state.stakesState,
      finishingBonusAwardedTo: game.state.finishingBonusAwardedTo,
      });
      return;
    }

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

  let cribBd;
  const dealer = game.state.players[game.state.dealerSeat];
  if (manual && dealer.type === 'human') {
    const actual = game.computeCribBreakdown();
    io.to(dealer.id).emit('game:score-declaration-needed', {
      seat: game.state.dealerSeat,
      phase: 'crib',
      hand: game.state.crib,
      starterCard: game.state.starterCard,
      isCrib: true,
    });
    const declared = await waitForDeclaration(dealer.id, 60_000) ?? actual.total;
    cribBd = game.awardCribBreakdown(actual, declared);
  } else {
    cribBd = game.scoreCrib();
  }

  const cribMovements = game.state.pendingPegMovements.splice(0);
  io.to(roomCode).emit('game:crib-score', {
    seat: game.state.dealerSeat,
    breakdown: cribBd,
    pegMovements: cribMovements,
    golfScores: game.state.golfScores,
    hand: game.state.crib,
    starterCard: game.state.starterCard,
    isCrib: true,
  });

  if (game.state.config.mugginsEnabled) {
    const missed = cribBd.missedItems ?? [];
    if (missed.length > 0) {
      const muggins = game.openMugginsWindow(cribBd.playerId, missed);
      io.to(roomCode).emit('game:muggins-window', {
        scoringPlayerId: cribBd.playerId,
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

  if ((game.state.phase as string) === 'game-over') {
    io.to(roomCode).emit('game:over', {
      winnerSeat: game.state.winner,
      finalGolfScores: game.state.golfScores,
      stakesState: game.state.stakesState,
      finishingBonusAwardedTo: game.state.finishingBonusAwardedTo,
    });
    return;
  }

  await delay(2500);
  game.advanceRound();

  if ((game.state.phase as string) === 'game-over') {
    io.to(roomCode).emit('game:over', {
      winnerSeat: game.state.winner,
      finalGolfScores: game.state.golfScores,
      stakesState: game.state.stakesState,
      finishingBonusAwardedTo: game.state.finishingBonusAwardedTo,
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

function waitForDeclaration(playerId: string, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      declarationResolvers.delete(playerId);
      resolve(null);
    }, timeoutMs);
    declarationResolvers.set(playerId, (points) => {
      clearTimeout(timer);
      declarationResolvers.delete(playerId);
      resolve(points);
    });
  });
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
