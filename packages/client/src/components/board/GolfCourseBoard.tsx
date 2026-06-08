import { useMemo, useRef, useEffect, useState } from 'react';
import type { Course, GolfHole, PlayerGolfScore, PegholeType } from '@cribbgolf/shared';
import styles from './GolfCourseBoard.module.css';

const PLAYER_COLORS = ['#1565c0', '#c62828', '#2e7d32'];
const CELL_W = 36;

const TYPE_COLOR: Record<string, string> = {
  tee: '#ffffff',
  fairway: '#4caf50',
  rough: '#558b2f',
  trees: '#33691e',
  sand: '#f9a825',
  water: '#29b6f6',
  'out-of-bounds': '#ef5350',
  green: '#81c784',
  cup: '#ffd54f',
};

interface FlatPh {
  globalIndex: number;
  holeNumber: number;
  type: string;
  isFirstInHole: boolean;
  isLastInHole: boolean;
}

function flattenCourse(holes: GolfHole[], selectedPaths: Record<number, string>): FlatPh[] {
  const flat: FlatPh[] = [];
  let global = 0;
  for (const hole of holes) {
    const pathId = selectedPaths?.[hole.number] ?? 'A';
    const path = hole.paths.find((p) => p.id === pathId) ?? hole.paths[0];
    for (let i = 0; i < path.pegholes.length; i++) {
      flat.push({
        globalIndex: global++,
        holeNumber: hole.number,
        type: path.pegholes[i].type,
        isFirstInHole: i === 0,
        isLastInHole: i === path.pegholes.length - 1,
      });
    }
  }
  return flat;
}

function getGlobalIndex(holes: GolfHole[], gs: PlayerGolfScore): number {
  let global = 0;
  for (let h = 0; h < gs.currentHole - 1; h++) {
    const hole = holes[h];
    const pathId = (gs.selectedPaths as any)?.[hole.number] ?? 'A';
    const path = hole.paths.find((p) => p.id === pathId) ?? hole.paths[0];
    global += path.pegholes.length;
  }
  return global + gs.currentPegholeIndex;
}

interface PaneProps {
  playerName: string;
  golfScore: PlayerGolfScore;
  course: Course;
  isMe: boolean;
  color: string;
  onChoosePath?: (holeNumber: number) => void;
}

function HoleTrackPane({ playerName, golfScore, course, isMe, color, onChoosePath }: PaneProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const pegRef = useRef<HTMLDivElement>(null);

  const selectedPaths = (golfScore as any).selectedPaths ?? {};
  const flat = useMemo(
    () => flattenCourse(course.holes, selectedPaths),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [course.holes, JSON.stringify(selectedPaths)],
  );
  const currentGI = useMemo(
    () => getGlobalIndex(course.holes, golfScore),
    [course.holes, golfScore.currentHole, golfScore.currentPegholeIndex],
  );

  useEffect(() => {
    const peg = pegRef.current;
    const wrapper = wrapperRef.current;
    if (!peg || !wrapper) return;
    const targetScroll = peg.offsetLeft - wrapper.clientWidth / 2 + CELL_W / 2;
    wrapper.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
  }, [currentGI]);

  const score = golfScore.totalRelativeToPar;
  const scoreStr = score === 0 ? 'E' : score > 0 ? `+${score}` : `${score}`;
  const pendingChoice = (golfScore as any).pendingPathChoiceHole as number | null;

  return (
    <div className={`${styles.pane} ${isMe ? styles.myPane : ''}`}>
      <div className={styles.paneHeader}>
        <span className={styles.playerDot} style={{ background: color }} />
        <span className={styles.playerName}>{playerName}</span>
        <span className={styles.holeTag}>H{golfScore.currentHole}</span>
        <span
          className={styles.scoreTag}
          style={{ color: score < 0 ? '#81c784' : score > 0 ? '#ef9a9a' : '#ccc' }}
        >
          {scoreStr}
        </span>
        {pendingChoice !== null && isMe && (
          <button className={styles.choosePathBtn} onClick={() => onChoosePath?.(pendingChoice)}>
            ⑂ Choose path
          </button>
        )}
      </div>

      <div className={styles.trackWrapper} ref={wrapperRef}>
        <div className={styles.track} style={{ width: flat.length * CELL_W + 40 }}>
          {flat.map((ph, i) => {
            const isCurrent = i === currentGI;
            const isPast = i < currentGI;
            const bg = TYPE_COLOR[ph.type] ?? '#888';
            return (
              <div key={ph.globalIndex} className={styles.cell} ref={isCurrent ? pegRef : undefined}>
                {ph.isFirstInHole && (
                  <div className={styles.holeLabel}>
                    {ph.holeNumber}
                    {ph.holeNumber === pendingChoice && <span className={styles.branchDot} />}
                  </div>
                )}
                {i > 0 && (
                  <div
                    className={`${styles.connector} ${isPast ? styles.connPast : ''} ${ph.isFirstInHole ? styles.connGap : ''}`}
                  />
                )}
                <div
                  className={`${styles.peghole} ${isCurrent ? styles.pegholeCurrent : ''} ${isPast ? styles.pegholePast : ''}`}
                  style={{
                    background: isPast ? 'rgba(255,255,255,0.15)' : bg,
                    border: isCurrent ? `3px solid ${color}` : '2px solid rgba(0,0,0,0.25)',
                    width: isCurrent ? 22 : ph.type === 'cup' ? 18 : 14,
                    height: isCurrent ? 22 : ph.type === 'cup' ? 18 : 14,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function scoreClass(rel: number) {
  if (rel <= -2) return styles.eagle;
  if (rel === -1) return styles.birdie;
  if (rel === 0) return styles.par;
  if (rel === 1) return styles.bogey;
  return styles.doubleBogey;
}

interface ScorecardProps {
  course: Course;
  golfScores: PlayerGolfScore[];
  playerNames: string[];
}

function Scorecard({ course, golfScores, playerNames }: ScorecardProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.scorecard}>
      <button className={styles.scorecardToggle} onClick={() => setOpen((o) => !o)}>
        <span>Scorecard</span>
        <span className={styles.scorecardTotals}>
          {golfScores.map((gs, i) => (
            <span key={i} style={{ color: PLAYER_COLORS[i] }}>
              {gs.totalRelativeToPar > 0 ? `+${gs.totalRelativeToPar}` : gs.totalRelativeToPar === 0 ? 'E' : gs.totalRelativeToPar}
            </span>
          ))}
        </span>
        <span>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Hole</th><th>Par</th>
              {playerNames.map((n, i) => <th key={i}>{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {course.holes.map((hole) => (
              <tr key={hole.number}>
                <td>{hole.number}</td>
                <td>{hole.par}</td>
                {golfScores.map((gs, pi) => {
                  const hs = gs.holeScores.find((h: any) => h.holeNumber === hole.number);
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
      )}
    </div>
  );
}

interface Props {
  course: Course;
  golfScores: PlayerGolfScore[];
  playerNames: string[];
  mySeat: number | null;
  onChoosePath?: (holeNumber: number) => void;
}

export default function GolfCourseBoard({ course, golfScores, playerNames, mySeat, onChoosePath }: Props) {
  const paneOrder = useMemo(() => {
    const all = golfScores.map((_, i) => i);
    if (mySeat === null) return all;
    return [mySeat, ...all.filter((i) => i !== mySeat)];
  }, [golfScores.length, mySeat]);

  return (
    <div className={styles.wrapper}>
      {paneOrder.map((seat) => (
        <HoleTrackPane
          key={seat}
          playerName={playerNames[seat] ?? `Player ${seat + 1}`}
          golfScore={golfScores[seat]}
          course={course}
          isMe={seat === mySeat}
          color={PLAYER_COLORS[seat] ?? '#888'}
          onChoosePath={seat === mySeat ? onChoosePath : undefined}
        />
      ))}
      <Scorecard course={course} golfScores={golfScores} playerNames={playerNames} />
    </div>
  );
}
