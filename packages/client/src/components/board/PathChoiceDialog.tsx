import { useState } from 'react';
import { useGameStore } from '../../store/game-store.js';
import { getSocket } from '../../socket/socket-client.js';
import type { GolfHole, GolfPath } from '@cribbgolf/shared';
import styles from './PathChoiceDialog.module.css';

const HAZARD_ICONS: Record<string, string> = {
  rough: '🌿',
  trees: '🌲',
  sand: '🏖',
  water: '💧',
  'out-of-bounds': '⛔',
  fairway: '⛳',
};

const PATH_COLORS = ['#00e5ff', '#ffd740', '#ff6e40'];

const PEGHOLE_COLORS: Record<string, string> = {
  tee: '#bcaaa4', fairway: '#66bb6a', rough: '#558b2f',
  trees: '#33691e', sand: '#f9a825', water: '#29b6f6',
  'out-of-bounds': '#ef5350', green: '#a5d6a7', cup: '#ffd54f',
};

const HAZARD_SET = new Set(['rough', 'trees', 'sand', 'water', 'out-of-bounds', 'three-putt']);

function PathStrip({ path, pathColor, pegIndex }: { path: GolfPath; pathColor: string; pegIndex: number | null }) {
  const pegholes = path.pegholes;
  return (
    <div className={styles.strip}>
      {pegholes.map((ph, i) => {
        const isHazard = HAZARD_SET.has(ph.type);
        const isPeg = pegIndex !== null && i === Math.min(pegIndex, pegholes.length - 1);
        const fill = PEGHOLE_COLORS[ph.type] ?? '#aaa';
        return (
          <div key={i}
            className={`${styles.dot} ${isHazard ? styles.hazardDot : ''} ${isPeg ? styles.pegDot : ''}`}
            style={{
              background: isPeg ? pathColor : fill,
              boxShadow: isPeg ? `0 0 0 3px ${pathColor}44` : undefined,
            }}
            title={`${ph.type}${isPeg ? ' ← peg lands here' : ''}`}
          />
        );
      })}
    </div>
  );
}

interface Props {
  holeNumber: number;
  hole: GolfHole;
}

export default function PathChoiceDialog({ holeNumber, hole }: Props) {
  const { setPendingPathChoice, mySeat, pendingGolfScores } = useGameStore();
  const [hoveredPath, setHoveredPath] = useState<string | null>(null);

  const pegIndex = (mySeat !== null && pendingGolfScores)
    ? pendingGolfScores[mySeat]?.currentPegholeIndex ?? null
    : null;

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
          {hole.paths.map((path, pi) => {
            const hazardTypes = path.pegholes
              .filter((ph) => ['rough','trees','sand','water','out-of-bounds'].includes(ph.type))
              .map((ph) => ph.type);
            const pathColor = PATH_COLORS[pi] ?? '#ccc';
            const isHovered = hoveredPath === path.id;

            return (
              <button
                key={path.id}
                className={styles.pathCard}
                style={{
                  background: pathColor + '22',
                  borderColor: isHovered ? pathColor : pathColor + '55',
                }}
                onClick={() => choose(path.id)}
                onMouseEnter={() => setHoveredPath(path.id)}
                onMouseLeave={() => setHoveredPath(null)}
              >
                <div className={styles.pathTop}>
                  <span className={styles.pathId} style={{ background: pathColor + '33', color: pathColor }}>
                    {path.id}
                  </span>
                  <span className={styles.pathLabel}>{path.label}</span>
                  <span className={styles.hazardIcons}>
                    {hazardTypes.length === 0
                      ? <span title="No hazards">✅</span>
                      : hazardTypes.map((t, i) => (
                          <span key={i} title={t}>{HAZARD_ICONS[t] ?? '⚠️'}</span>
                        ))}
                  </span>
                </div>
                <p className={styles.pathDesc}>{path.description}</p>
                <PathStrip
                  path={path}
                  pathColor={pathColor}
                  pegIndex={isHovered ? pegIndex : null}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
