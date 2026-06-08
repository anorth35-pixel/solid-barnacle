import { useMemo } from 'react';
import { motion } from 'framer-motion';
import type { Course, PlayerGolfScore } from '@cribbgolf/shared';
import { getGolfTermForScore } from '@cribbgolf/shared';
import styles from './GolfCourseBoard.module.css';

const PLAYER_COLORS = ['#1565c0', '#c62828', '#2e7d32'];
const HAZARD_COLORS: Record<string, string> = {
  rough: '#5a7a3a',
  trees: '#33691e',
  sand: '#f5e6a3',
  water: '#4fc3f7',
  'out-of-bounds': '#ef9a9a',
  tee: '#ffffff',
  fairway: '#4caf50',
  green: '#81c784',
  cup: '#ffd54f',
};

interface Props {
  course: Course;
  golfScores: PlayerGolfScore[];
  playerNames: string[];
}

export default function GolfCourseBoard({ course, golfScores, playerNames }: Props) {
  return (
    <div className={styles.wrapper}>
      <svg
        viewBox="0 0 1200 620"
        className={styles.svg}
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Fairway background */}
        <rect x="0" y="0" width="1200" height="620" fill="#2d7a2d" rx="12" />
        {/* Hole labels */}
        <text x="10" y="30" fill="white" fontSize="14" fontWeight="bold">Front Nine →</text>
        <text x="10" y="580" fill="white" fontSize="14" fontWeight="bold">Back Nine →</text>

        {course.holes.map((hole) => {
          const col = (hole.number - 1) % 9;
          const isBack = hole.number > 9;
          const baseX = 50 + col * 130;
          const baseY = isBack ? 360 : 60;

          return (
            <g key={hole.number}>
              {/* Hole label */}
              <text
                x={baseX + 45}
                y={isBack ? baseY - 10 : baseY - 10}
                fill="rgba(255,255,255,0.7)"
                fontSize="11"
                textAnchor="middle"
              >
                #{hole.number} Par {hole.par}
              </text>

              {/* Fairway path line */}
              <line
                x1={hole.pegholes[0].x}
                y1={hole.pegholes[0].y}
                x2={hole.pegholes[hole.pegholes.length - 1].x}
                y2={hole.pegholes[hole.pegholes.length - 1].y}
                stroke="rgba(255,255,255,0.15)"
                strokeWidth="20"
                strokeLinecap="round"
              />

              {/* Pegholes */}
              {hole.pegholes.map((ph) => (
                <g key={ph.id}>
                  {/* Hazard indicator */}
                  {['sand', 'water', 'rough', 'trees', 'out-of-bounds'].includes(ph.type) && (
                    <circle
                      cx={ph.x}
                      cy={ph.y}
                      r={11}
                      fill={HAZARD_COLORS[ph.type]}
                      opacity={0.5}
                    />
                  )}
                  {/* Peghole circle */}
                  <circle
                    cx={ph.x}
                    cy={ph.y}
                    r={ph.type === 'cup' ? 9 : ph.type === 'tee' ? 7 : 5}
                    fill={ph.type === 'cup' ? '#ffd54f' : ph.type === 'tee' ? '#fff' : HAZARD_COLORS[ph.type]}
                    stroke="rgba(0,0,0,0.3)"
                    strokeWidth="1"
                  />
                  {/* Cup flag */}
                  {ph.type === 'cup' && (
                    <>
                      <line x1={ph.x} y1={ph.y - 8} x2={ph.x} y2={ph.y - 22} stroke="#ef5350" strokeWidth="1.5" />
                      <polygon
                        points={`${ph.x},${ph.y - 22} ${ph.x + 10},${ph.y - 18} ${ph.x},${ph.y - 14}`}
                        fill="#ef5350"
                      />
                    </>
                  )}
                </g>
              ))}

              {/* Player pegs on this hole */}
              {golfScores.map((gs, pi) => {
                if (gs.currentHole !== hole.number) return null;
                const ph = hole.pegholes[gs.currentPegholeIndex];
                if (!ph) return null;
                return (
                  <motion.circle
                    key={`peg-${pi}`}
                    cx={ph.x}
                    cy={ph.y}
                    r={6}
                    fill={PLAYER_COLORS[pi]}
                    stroke="white"
                    strokeWidth="2"
                    initial={false}
                    animate={{ cx: ph.x, cy: ph.y }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  />
                );
              })}
            </g>
          );
        })}
      </svg>

      {/* Scorecard */}
      <div className={styles.scorecard}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Hole</th>
              <th>Par</th>
              {playerNames.map((n, i) => <th key={i}>{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {course.holes.map((hole) => (
              <tr key={hole.number}>
                <td>{hole.number}</td>
                <td>{hole.par}</td>
                {golfScores.map((gs, pi) => {
                  const hs = gs.holeScores.find((h) => h.holeNumber === hole.number);
                  return (
                    <td key={pi} className={hs ? scoreClass(hs.relativeToPar) : ''}>
                      {hs ? hs.strokes : '-'}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr className={styles.totalRow}>
              <td colSpan={2}>Total</td>
              {golfScores.map((gs, pi) => (
                <td key={pi}>{gs.totalRelativeToPar >= 0 ? `+${gs.totalRelativeToPar}` : gs.totalRelativeToPar}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function scoreClass(rel: number): string {
  if (rel <= -2) return styles.eagle;
  if (rel === -1) return styles.birdie;
  if (rel === 0) return styles.par;
  if (rel === 1) return styles.bogey;
  return styles.doubleBogey;
}
