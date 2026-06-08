import type { ScoreBreakdown } from '@cribbgolf/shared';
import styles from './ScoreBreakdownModal.module.css';

interface Props {
  breakdown: ScoreBreakdown;
  playerName: string;
}

export default function ScoreBreakdownModal({ breakdown, playerName }: Props) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.header}>
        <span>{playerName}</span>
        <span className={styles.total}>{breakdown.total} pts</span>
      </div>
      <ul className={styles.items}>
        {breakdown.items.map((item, i) => (
          <li key={i} className={styles.item}>
            <span className={styles.desc}>{item.description}</span>
            <span className={styles.pts}>+{item.points}</span>
          </li>
        ))}
        {breakdown.items.length === 0 && (
          <li className={styles.zero}>No score</li>
        )}
      </ul>
    </div>
  );
}
