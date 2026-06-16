import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { connectSocket, getSocket } from '../socket/socket-client.js';
import { useGameStore } from '../store/game-store.js';
import { getGolfTermForScore } from '@cribbgolf/shared';

export function useGameSocket() {
  const navigate = useNavigate();

  useEffect(() => {
    const socket = connectSocket();

    // Always read state from the store singleton, not from closure
    const store = () => useGameStore.getState();

    socket.on('connect', () => store().setSocketId(socket.id ?? ''));
    socket.on('disconnect', () => store().setSocketId(''));

    socket.on('room:created', ({ roomCode, room }: any) => {
      store().setRoom(room, roomCode);
    });

    socket.on('room:joined', ({ room, yourSeat }: any) => {
      store().setRoom(room);
      store().setMySeat(yourSeat);
      navigate(`/room/${room.code}`);
    });

    socket.on('room:updated', ({ room }: any) => store().setRoom(room));
    socket.on('room:error', ({ message }: any) => store().setError(message));

    socket.on('game:phase-change', ({ phase, state }: any) => {
      store().setGameState(state);
      if (phase === 'discarding') {
        // Sync myHand from server state directly in case game:dealt arrives late or is missed
        const mySeat = store().mySeat;
        if (mySeat !== null && state.players?.[mySeat]?.hand?.length > 0) {
          store().setMyHand(state.players[mySeat].hand);
        }
        navigate(`/game/${state.id}`);
      }
    });

    socket.on('game:state', ({ state }: any) => store().setGameState(state));

    socket.on('game:dealt', ({ yourHand, dealerSeat }: any) => {
      store().setMyHand(yourHand);
      store().patchGameState({ dealerSeat });
    });

    socket.on('game:starter', ({ card, nibsEvent, pegMovements, golfScores }: any) => {
      store().patchGameState({ starterCard: card, golfScores: golfScores ?? store().gameState?.golfScores });
      if (pegMovements?.length) store().addPegMovements(pegMovements);
    });

    socket.on('game:discard-done', ({ seat }: any) => {
      // Informational — no state change needed; phase-change event handles the transition
    });

    socket.on('game:card-played', ({ seat, card, runningCount, activePlayerSeat, scoreEvents, pegMovements, golfScores }: any) => {
      const gs = store().gameState;
      if (!gs) return;
      const players = gs.players.map((p, i) => {
        if (i !== seat) return p;
        return { ...p, playedCards: [...p.playedCards, card] };
      });
      const playStack = [...gs.pegging.playStack, card];
      store().patchGameState({
        players,
        activePlayerSeat: activePlayerSeat ?? gs.activePlayerSeat,
        pegging: { ...gs.pegging, playStack, runningCount },
        golfScores: golfScores ?? gs.golfScores,
      });
      if (scoreEvents?.length) {
        for (const ev of scoreEvents) {
          if (ev?.breakdown?.total > 0) {
            const desc = ev.breakdown.items.map((it: any) => it.description).join(', ');
            store().addToast({ type: 'info', message: desc, sub: `+${ev.breakdown.total} pts` });
          }
        }
      }
      if (pegMovements?.length) {
        store().addPegMovements(pegMovements);
        checkHazardToasts(pegMovements);
        checkHoleToasts(pegMovements);
      }
    });

    socket.on('game:go-called', ({ seat, countReset, activePlayerSeat, scoreEvents, pegMovements, golfScores }: any) => {
      const gs = store().gameState;
      if (!gs) return;
      const pegging = countReset
        ? { ...gs.pegging, playStack: [], runningCount: 0, goCalledBy: [] }
        : { ...gs.pegging, goCalledBy: [...gs.pegging.goCalledBy, seat as any] };
      store().patchGameState({
        activePlayerSeat: activePlayerSeat ?? gs.activePlayerSeat,
        pegging,
        golfScores: golfScores ?? gs.golfScores,
      });
      if (scoreEvents?.length) {
        for (const ev of scoreEvents) {
          if (ev?.breakdown?.total > 0) {
            const scorer = gs.players.find((p: any) => p.id === ev.playerId);
            store().addToast({ type: 'info', message: `${scorer?.name ?? 'Player'} — Go for 1`, sub: '+1 pt' });
          }
        }
      }
      if (pegMovements?.length) {
        store().addPegMovements(pegMovements);
        checkHoleToasts(pegMovements);
      }
    });

    socket.on('game:score-declaration-needed', (data: any) => {
      store().setPendingDeclaration(data);
    });

    socket.on('game:hand-score', ({ seat, breakdown, pegMovements, golfScores }: any) => {
      store().setPendingDeclaration(null);
      store().addBreakdown(breakdown);
      store().patchGameState({
        phase: 'hand-scoring',
        ...(golfScores ? { golfScores } : {}),
      });
      if (pegMovements?.length) {
        store().addPegMovements(pegMovements);
        checkHazardToasts(pegMovements);
        checkHoleToasts(pegMovements);
      }
    });

    socket.on('game:crib-score', ({ seat, breakdown, pegMovements, golfScores }: any) => {
      store().setPendingDeclaration(null);
      store().addBreakdown(breakdown);
      store().patchGameState({
        phase: 'crib-scoring',
        ...(golfScores ? { golfScores } : {}),
      });
      if (pegMovements?.length) {
        store().addPegMovements(pegMovements);
        checkHoleToasts(pegMovements);
      }
    });

    socket.on('game:muggins-window', (data: any) => store().openMuggins(data));
    socket.on('game:muggins-closed', () => store().closeMuggins());
    socket.on('game:muggins-claimed', ({ golfScores }: any) => {
      store().closeMuggins();
      if (golfScores) store().patchGameState({ golfScores });
    });

    socket.on('player:disconnected', ({ seat }: any) => {
      store().setDisconnectedSeats([...store().disconnectedSeats, seat]);
    });

    socket.on('player:reconnected', ({ seat }: any) => {
      store().setDisconnectedSeats(store().disconnectedSeats.filter((s) => s !== seat));
    });

    socket.on('game:path-chosen', ({ golfScores }: any) => {
      store().patchGameState({ golfScores });
    });

    socket.on('game:over', ({ winnerSeat, finalGolfScores, stakesState, finishingBonusAwardedTo }: any) => {
      store().patchGameState({
        winner: winnerSeat,
        golfScores: finalGolfScores,
        phase: 'game-over',
        ...(stakesState ? { stakesState } : {}),
        ...(finishingBonusAwardedTo !== undefined ? { finishingBonusAwardedTo } : {}),
      });
    });

    socket.on('game:error', ({ message }: any) => store().setError(message));

    function checkHazardToasts(movements: any[]) {
      for (const m of movements) {
        for (const h of m.hazardsHit ?? []) {
          const type = h.peghole?.type;
          if (!type || type === 'fairway' || type === 'green' || type === 'cup' || type === 'tee') continue;
          const result = h.result ?? {};
          const penalty = result.penaltyStrokes ?? 0;
          const dice: [number, number] | undefined = result.diceRoll;
          const outcome: string | undefined = result.diceOutcome;

          // Title line
          const titles: Record<string, string> = {
            rough: '🌿 Rough', trees: '🌲 Trees',
            sand: '🏖️ Sand Trap', water: '💧 Water Hazard',
            'out-of-bounds': '🚫 Out of Bounds', 'three-putt': '⛳ Three-Putt',
          };
          const title = titles[type] ?? type;

          // Sub line
          let sub = '';
          if (dice) {
            const sum = dice[0] + dice[1];
            const outcomeLabel: Record<string, string> = {
              'advance3-strokeoff': `Lucky! Advance 3, −1 stroke`,
              'advance1': `Safe! Advance 1, no penalty`,
              'stay-penalty': `Unlucky. Stay put, +1 stroke`,
            };
            sub = `🎲 ${dice[0]}+${dice[1]}=${sum} — ${outcomeLabel[outcome ?? ''] ?? outcome ?? ''}`;
          } else if (type === 'trees') {
            sub = 'Retreat 2 pegholes, no penalty stroke';
          } else if (type === 'water') {
            sub = `+${penalty} penalty stroke, retreat 1 peghole`;
          } else if (type === 'out-of-bounds') {
            sub = `+${penalty} penalty strokes, back to action start`;
          } else if (penalty > 0) {
            sub = `+${penalty} penalty stroke${penalty > 1 ? 's' : ''}`;
          } else {
            sub = result.description ?? '';
          }

          store().addToast({ type: 'hazard', message: title, sub });
        }
      }
    }

    function checkHoleToasts(movements: any[]) {
      for (const m of movements) {
        for (const holeNum of m.holesCompleted ?? []) {
          const gs = store().gameState;
          const player = gs?.players.find((p: any) => p.id === m.playerId);
          const golfScore = gs?.golfScores.find((s: any) => s.playerId === m.playerId);
          const hs = golfScore?.holeScores.find((h: any) => h.holeNumber === holeNum);
          if (!hs) continue;

          const rel = hs.relativeToPar;
          const term = getGolfTermForScore(rel);
          const relStr = rel === 0 ? 'E' : rel > 0 ? `+${rel}` : `${rel}`;

          // Pick emoji and toast subtype
          let emoji = '⛳';
          let toastType: 'hole-complete' | 'birdie' | 'eagle' = 'hole-complete';
          if (hs.isDoubleEagle) { emoji = '🦅🦅'; toastType = 'eagle'; }
          else if (hs.isEagle)   { emoji = '🦅';    toastType = 'eagle'; }
          else if (hs.isBirdie)  { emoji = '🐦';    toastType = 'birdie'; }
          else if (rel >= 2)     { emoji = '😬'; }
          else if (rel === 1)    { emoji = '😤'; }
          else if (rel === 0)    { emoji = '✅'; }

          store().addToast({
            type: toastType as any,
            message: `${emoji} ${player?.name ?? 'Player'} — ${term}!`,
            sub: `Hole ${holeNum}: ${hs.strokes} strokes · par ${hs.par} · ${relStr}`,
          });
        }
      }
    }

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('room:created');
      socket.off('room:joined');
      socket.off('room:updated');
      socket.off('room:error');
      socket.off('game:phase-change');
      socket.off('game:state');
      socket.off('game:dealt');
      socket.off('game:starter');
      socket.off('game:discard-done');
      socket.off('game:card-played');
      socket.off('game:go-called');
      socket.off('game:score-declaration-needed');
      socket.off('game:hand-score');
      socket.off('game:crib-score');
      socket.off('game:muggins-window');
      socket.off('game:muggins-closed');
      socket.off('game:muggins-claimed');
      socket.off('player:disconnected');
      socket.off('player:reconnected');
      socket.off('game:path-chosen');
      socket.off('game:over');
      socket.off('game:error');
    };
  }, []);

  return getSocket();
}
