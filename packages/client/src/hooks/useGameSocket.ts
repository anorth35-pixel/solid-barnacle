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
      if (pegMovements?.length) {
        store().addPegMovements(pegMovements);
        checkHoleToasts(pegMovements);
      }
    });

    socket.on('game:hand-score', ({ seat, breakdown, pegMovements, golfScores }: any) => {
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

    socket.on('game:over', ({ winnerSeat, finalGolfScores }: any) => {
      store().patchGameState({
        winner: winnerSeat,
        golfScores: finalGolfScores,
        phase: 'game-over',
      });
    });

    socket.on('game:error', ({ message }: any) => store().setError(message));

    function checkHazardToasts(movements: any[]) {
      for (const m of movements) {
        for (const h of m.hazardsHit ?? []) {
          const type = h.peghole?.type;
          if (!type || type === 'fairway' || type === 'green' || type === 'cup' || type === 'tee') continue;
          const label: Record<string, string> = {
            rough: 'Rough!', trees: 'Trees!', sand: 'Sand Trap!',
            water: 'Water Hazard!', 'out-of-bounds': 'Out of Bounds!',
          };
          const penalty = h.result?.penaltyStrokes ?? 0;
          store().addToast({
            type: 'hazard',
            message: label[type] ?? type,
            sub: penalty > 0 ? `+${penalty} penalty stroke${penalty > 1 ? 's' : ''}` : h.result?.description ?? '',
          });
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
          const term = getGolfTermForScore(hs.relativeToPar);
          store().addToast({
            type: 'hole-complete',
            message: `${player?.name ?? 'Player'} — Hole ${holeNum}: ${term}`,
            sub: `${hs.strokes} strokes (par ${hs.par})`,
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
      socket.off('game:hand-score');
      socket.off('game:crib-score');
      socket.off('game:muggins-window');
      socket.off('game:muggins-closed');
      socket.off('game:muggins-claimed');
      socket.off('player:disconnected');
      socket.off('player:reconnected');
      socket.off('game:over');
      socket.off('game:error');
    };
  }, []);

  return getSocket();
}
