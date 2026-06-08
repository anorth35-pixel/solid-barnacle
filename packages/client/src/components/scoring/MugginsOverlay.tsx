import { useEffect, useState } from 'react';
import { useGameStore } from '../../store/game-store.js';
import { getSocket } from '../../socket/socket-client.js';
import styles from './MugginsOverlay.module.css';

export default function MugginsOverlay() {
  const { mugginsWindow, closeMuggins, gameState, mySeat } = useGameStore();
  const [timeLeft, setTimeLeft] = useState(100);

  useEffect(() => {
    if (!mugginsWindow) return;
    const interval = setInterval(() => {
      const pct = ((mugginsWindow.windowCloseAt - Date.now()) / 15_000) * 100;
      setTimeLeft(Math.max(0, pct));
    }, 100);
    return () => clearInterval(interval);
  }, [mugginsWindow]);

  if (!mugginsWindow) return null;

  const scoringPlayer = gameState?.players.find((p) => p.id === mugginsWindow.scoringPlayerId);
  const isScorer = scoringPlayer?.seat === mySeat;

  function claimMuggins() {
    getSocket().emit('game:muggins', { claimedItems: mugginsWindow!.missedItems });
    closeMuggins();
  }

  function passMuggins() {
    getSocket().emit('game:muggins-pass', {});
    closeMuggins();
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>
        <h3 className={styles.heading}>
          {isScorer ? 'You missed points!' : `${scoringPlayer?.name} missed points!`}
        </h3>
        <div className={styles.timerBar}>
          <div className={styles.timerFill} style={{ width: `${timeLeft}%` }} />
        </div>
        <ul className={styles.items}>
          {mugginsWindow.missedItems.map((item, i) => (
            <li key={i} className={styles.item}>
              <span>{item.description}</span>
              <span className={styles.pts}>+{item.points}</span>
            </li>
          ))}
        </ul>
        {!isScorer && (
          <div className={styles.actions}>
            <button className="btn-primary" onClick={claimMuggins}>
              Claim Muggins!
            </button>
            <button className="btn-secondary" onClick={passMuggins}>
              Pass
            </button>
          </div>
        )}
        {isScorer && (
          <p className={styles.waiting}>Opponents may claim your missed points…</p>
        )}
      </div>
    </div>
  );
}
