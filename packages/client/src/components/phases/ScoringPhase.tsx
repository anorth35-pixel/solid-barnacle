import type { ScoreBreakdown } from '@cribbgolf/shared';
import { useGameStore } from '../../store/game-store.js';
import ScoreBreakdownModal from '../scoring/ScoreBreakdownModal.js';
import styles from './ScoringPhase.module.css';

interface Props {
  breakdowns: ScoreBreakdown[];
}

export default function ScoringPhase({ breakdowns }: Props) {
  const { gameState } = useGameStore();
  const players = gameState?.players ?? [];

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.heading}>
        {gameState?.phase === 'crib-scoring' ? 'Crib Scoring' : 'Hand Scoring'}
      </h3>
      <div className={styles.breakdowns}>
        {breakdowns.map((bd, i) => {
          const player = players.find((p) => p.id === bd.playerId);
          return (
            <ScoreBreakdownModal
              key={i}
              breakdown={bd}
              playerName={player?.name ?? 'Player'}
            />
          );
        })}
        {breakdowns.length === 0 && (
          <p className={styles.waiting}>Scoring in progress…</p>
        )}
      </div>
    </div>
  );
}
