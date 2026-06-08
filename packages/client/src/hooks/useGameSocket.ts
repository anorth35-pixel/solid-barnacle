import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { connectSocket, getSocket } from '../socket/socket-client.js';
import { useGameStore } from '../store/game-store.js';

export function useGameSocket() {
  const store = useGameStore();
  const navigate = useNavigate();

  useEffect(() => {
    const socket = connectSocket();

    socket.on('connect', () => store.setSocketId(socket.id ?? ''));
    socket.on('disconnect', () => store.setSocketId(''));

    socket.on('room:created', ({ roomCode, room }: any) => {
      store.setRoom(room, roomCode);
    });

    socket.on('room:joined', ({ room, yourSeat }: any) => {
      store.setRoom(room);
      store.setMySeat(yourSeat);
      navigate(`/room/${room.code}`);
    });

    socket.on('room:updated', ({ room }: any) => store.setRoom(room));

    socket.on('room:error', ({ message }: any) => store.setError(message));

    socket.on('game:phase-change', ({ state }: any) => {
      store.setGameState(state);
      if (state.phase === 'discarding') navigate(`/game/${state.id}`);
    });

    socket.on('game:state', ({ state }: any) => store.setGameState(state));

    socket.on('game:dealt', ({ yourHand, dealerSeat }: any) => {
      store.setMyHand(yourHand);
      store.setGameState({ ...store.gameState!, dealerSeat });
    });

    socket.on('game:hand-score', ({ breakdown, pegMovements }: any) => {
      store.addBreakdown(breakdown);
      store.addPegMovements(pegMovements);
    });

    socket.on('game:crib-score', ({ breakdown, pegMovements }: any) => {
      store.addBreakdown(breakdown);
      store.addPegMovements(pegMovements);
    });

    socket.on('game:peg-moved', ({ movements }: any) => store.addPegMovements(movements));

    socket.on('game:muggins-window', (data: any) => store.openMuggins(data));
    socket.on('game:muggins-closed', () => store.closeMuggins());
    socket.on('game:muggins-claimed', () => store.closeMuggins());

    socket.on('game:over', ({ winnerSeat, finalGolfScores }: any) => {
      store.setGameState({ ...store.gameState!, winner: winnerSeat, golfScores: finalGolfScores, phase: 'game-over' });
    });

    socket.on('game:error', ({ message }: any) => store.setError(message));

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
      socket.off('game:hand-score');
      socket.off('game:crib-score');
      socket.off('game:peg-moved');
      socket.off('game:muggins-window');
      socket.off('game:muggins-closed');
      socket.off('game:muggins-claimed');
      socket.off('game:over');
      socket.off('game:error');
    };
  }, []);

  return getSocket();
}
