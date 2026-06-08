import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/game-store.js';
import { getGolfTermForScore, holesNotCompletedPenalty } from '@cribbgolf/shared';
import styles from './GameOverModal.module.css';

export default function GameOverModal() {
  const { gameState, reset } = useGameStore();
  const navigate = useNavigate();

  if (!gameState || gameState.phase !== 'game-over') return null;

  const { players, golfScores, winner } = gameState;

  const adjustedScores = golfScores.map((gs) => {
    const penalty = gs.isFinished ? 0 : holesNotCompletedPenalty(18 - gs.holesCompleted);
    return {
      ...gs,
      adjustedTotal: gs.totalRelativeToPar + penalty,
      penalty,
    };
  });

  const sorted = [...adjustedScores].sort((a, b) => a.adjustedTotal - b.adjustedTotal);
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
            <tr>
              <th>Player</th>
              <th>Holes</th>
              <th>Score</th>
              {adjustedScores.some((s) => s.penalty > 0) && <th>Penalty</th>}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((gs, i) => {
              const player = players.find((p) => p.id === gs.playerId);
              const medals = ['🥇', '🥈', '🥉'];
              return (
                <tr key={gs.playerId} className={i === 0 ? styles.winner : ''}>
                  <td>{medals[i] ?? ''} {player?.name}</td>
                  <td>{gs.holesCompleted}/18</td>
                  <td className={scoreClass(gs.totalRelativeToPar)}>
                    {gs.totalRelativeToPar >= 0 ? `+${gs.totalRelativeToPar}` : gs.totalRelativeToPar}
                  </td>
                  {adjustedScores.some((s) => s.penalty > 0) && (
                    <td className={gs.penalty > 0 ? styles.penalty : ''}>
                      {gs.penalty > 0 ? `+${gs.penalty}` : '—'}
                    </td>
                  )}
                  <td className={styles.totalCell}>
                    {gs.adjustedTotal >= 0 ? `+${gs.adjustedTotal}` : gs.adjustedTotal}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {adjustedScores.some((s) => s.penalty > 0) && (
          <p className={styles.penaltyNote}>* +2 penalty per unfinished hole</p>
        )}

        <button className="btn-primary" onClick={handlePlayAgain}>
          Play Again
        </button>
      </div>
    </div>
  );
}

function scoreClass(rel: number): string {
  if (rel < 0) return styles.under;
  if (rel === 0) return styles.even;
  return styles.over;
}
