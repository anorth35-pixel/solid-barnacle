import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/game-store.js';
import { getGolfTermForScore } from '@cribbgolf/shared';
import styles from './GameOverModal.module.css';

export default function GameOverModal() {
  const { gameState, reset } = useGameStore();
  const navigate = useNavigate();

  if (!gameState || gameState.phase !== 'game-over') return null;

  const { players, golfScores, winner } = gameState;
  const sorted = [...golfScores].sort((a, b) => a.totalRelativeToPar - b.totalRelativeToPar);
  const winnerName = players.find((p) => p.seat === winner)?.name ?? 'Winner';

  function handlePlayAgain() {
    reset();
    navigate('/');
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <div className={styles.trophy}>🏆</div>
        <h2 className={styles.heading}>{winnerName} wins!</h2>

        <table className={styles.table}>
          <thead>
            <tr><th>Player</th><th>Score</th><th>Result</th></tr>
          </thead>
          <tbody>
            {sorted.map((gs, i) => {
              const player = players.find((p) => p.id === gs.playerId);
              return (
                <tr key={gs.playerId}>
                  <td>{i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : '🥉 '}{player?.name}</td>
                  <td>{gs.totalRelativeToPar >= 0 ? `+${gs.totalRelativeToPar}` : gs.totalRelativeToPar}</td>
                  <td>{gs.holesCompleted === 18 ? 'Finished' : `${gs.holesCompleted} holes`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <button className="btn-primary" onClick={handlePlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  );
}
