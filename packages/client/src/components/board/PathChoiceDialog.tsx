import { useGameStore } from '../../store/game-store.js';
import { getSocket } from '../../socket/socket-client.js';
import type { GolfHole } from '@cribbgolf/shared';
import styles from './PathChoiceDialog.module.css';

const HAZARD_ICONS: Record<string, string> = {
  rough: '🌿',
  trees: '🌲',
  sand: '🏖',
  water: '💧',
  'out-of-bounds': '⛔',
  fairway: '⛳',
};

interface Props {
  holeNumber: number;
  hole: GolfHole;
}

export default function PathChoiceDialog({ holeNumber, hole }: Props) {
  const { setPendingPathChoice } = useGameStore();

  function choose(pathId: string) {
    getSocket().emit('game:choose-path', { holeNumber, pathId });
    setPendingPathChoice(null);
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h3 className={styles.title}>Choose your path — Hole {holeNumber}</h3>
        <p className={styles.subtitle}>Par {hole.par} · Handicap {hole.handicap}</p>
        <div className={styles.paths}>
          {hole.paths.map((path) => {
            const hazardTypes = path.pegholes
              .filter((ph) => ['rough','trees','sand','water','out-of-bounds'].includes(ph.type))
              .map((ph) => ph.type);

            return (
              <button
                key={path.id}
                className={`${styles.pathCard} ${styles[`path${path.id}`]}`}
                onClick={() => choose(path.id)}
              >
                <span className={styles.pathLabel}>{path.label}</span>
                <span className={styles.pathId}>{path.id}</span>
                <span className={styles.pathDesc}>{path.description}</span>
                <span className={styles.hazardIcons}>
                  {hazardTypes.length === 0
                    ? <span title="No hazards">✅</span>
                    : hazardTypes.map((t, i) => (
                        <span key={i} title={t}>{HAZARD_ICONS[t] ?? '⚠️'}</span>
                      ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
