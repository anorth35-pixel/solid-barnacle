import { useMemo, useRef, useEffect } from 'react';
import type { Course, GolfHole, PegholeType } from '@cribbgolf/shared';
import type { PlayerGolfScore } from '@cribbgolf/shared';
import styles from './GolfCourseBoard.module.css';

const PLAYER_COLORS = ['#1565c0', '#c62828', '#2e7d32'];

// Fixed hole SVG height; width varies per hole based on path length
const SVG_H = 120;
const TEE_X = 18;         // left margin for tee centre
const CUP_MARGIN = 22;    // right margin for cup centre
const PPP = 20;            // pixels per peghole (drives hole width)
const HOLE_EXTRA = 56;     // extra pixels for tee/cup areas

// Path colours: A=sky-blue, B=amber, C=rose
const PATH_COLORS = ['#81d4fa', '#ffe082', '#f48fb1'];

const TYPE_COLOR: Record<string, string> = {
  tee: '#bcaaa4', fairway: '#66bb6a', rough: '#558b2f',
  trees: '#33691e', sand: '#f9a825', water: '#29b6f6',
  'out-of-bounds': '#ef5350', green: '#a5d6a7', cup: '#ffd54f',
};

// ── Bezier helpers ────────────────────────────────────────────────────────────
type Pt = [number, number];
type BCP = [Pt, Pt, Pt, Pt];

function beval(t: number, a: number, b: number, c: number, d: number): number {
  const m = 1 - t;
  return m*m*m*a + 3*m*m*t*b + 3*m*t*t*c + t*t*t*d;
}

function bpt(t: number, [p0, p1, p2, p3]: BCP): Pt {
  return [
    beval(t, p0[0], p1[0], p2[0], p3[0]),
    beval(t, p0[1], p1[1], p2[1], p3[1]),
  ];
}

function distribute(n: number, cp: BCP): Pt[] {
  if (n <= 0) return [];
  if (n === 1) return [cp[0]];
  return Array.from({ length: n }, (_, i) => bpt(i / (n - 1), cp));
}

function cpToD([p0, p1, p2, p3]: BCP): string {
  const f = (n: number) => n.toFixed(1);
  return `M${f(p0[0])},${f(p0[1])} C${f(p1[0])},${f(p1[1])} ${f(p2[0])},${f(p2[1])} ${f(p3[0])},${f(p3[1])}`;
}

// ── Hole geometry ─────────────────────────────────────────────────────────────

function holeWidth(hole: GolfHole): number {
  const maxLen = Math.max(...hole.paths.map(p => p.pegholes.length));
  return Math.max(160, maxLen * PPP + HOLE_EXTRA);
}

// Horizontal spine bezier — slight S-curve per hole for visual variety
function spineCP(holeNum: number, W: number): BCP {
  const cy = SVG_H / 2;
  const dy = ((holeNum * 7 + 3) % 24) - 12; // -12..+11
  return [[TEE_X, cy], [W * 0.33, cy + dy], [W * 0.67, cy - dy], [W - CUP_MARGIN, cy]];
}

// Each path shares the same x-progression as the spine (only y varies).
// A goes high→low, C goes low→high → they criss-cross in the middle.
function pathCP(spine: BCP, pathIdx: number, holeNum: number): BCP {
  const [p0, sp1, sp2, p3] = spine;
  const H = SVG_H;
  const baseY: Array<[number, number]> = [
    [H * 0.13, H * 0.87],  // A: upper→lower → X with C
    [H * 0.42, H * 0.58],  // B: gentle centre
    [H * 0.87, H * 0.13],  // C: lower→upper → X with A
  ];
  const jitter = ((holeNum * 5 + pathIdx * 11) % 16) - 8;
  const [y1, y2] = baseY[pathIdx];
  return [p0, [sp1[0], y1 + jitter], [sp2[0], y2 - jitter * 0.5], p3];
}

// ── Hazard shapes ─────────────────────────────────────────────────────────────
const HAZARD_SET = new Set(['rough', 'trees', 'sand', 'water', 'out-of-bounds']);

function HazardShape({ type, cx, cy }: { type: PegholeType; cx: number; cy: number }) {
  // Push hazard visual to the outside edge of the fairway (away from center-line)
  const oy = cy < SVG_H / 2 ? -16 : 16;

  if (type === 'sand')
    return <ellipse cx={cx} cy={cy + oy} rx={13} ry={8}
      fill="#f9a825" stroke="#f57f17" strokeWidth={0.5} opacity={0.92} />;

  if (type === 'water') {
    const x = cx, y = cy + oy;
    return (
      <path
        d={`M${x-13},${y} C${x-17},${y-8} ${x-2},${y-12} ${x+5},${y-8} C${x+16},${y-5} ${x+17},${y+4} ${x+11},${y+9} C${x+5},${y+14} ${x-10},${y+12} ${x-15},${y+5} Z`}
        fill="#1565c0" opacity={0.78} />
    );
  }

  if (type === 'trees') {
    const x = cx, y = cy + oy;
    return (
      <g>
        <circle cx={x - 7} cy={y - 4} r={7} fill="#1b5e20" opacity={0.88} />
        <circle cx={x + 6} cy={y + 2} r={6} fill="#1b5e20" opacity={0.88} />
        <circle cx={x - 1} cy={y + 8} r={5} fill="#1b5e20" opacity={0.88} />
      </g>
    );
  }

  if (type === 'rough')
    return <ellipse cx={cx} cy={cy + oy} rx={10} ry={6} fill="#33691e" opacity={0.65} />;

  if (type === 'out-of-bounds')
    return (
      <g>
        <rect x={cx - 11} y={cy + oy - 8} width={22} height={16} rx={3}
          fill="#b71c1c" opacity={0.88} />
        <text x={cx} y={cy + oy + 4} fontSize={6} fill="white"
          textAnchor="middle" fontWeight="bold">OOB</text>
      </g>
    );

  return null;
}

// ── HoleSVG ───────────────────────────────────────────────────────────────────
interface HoleSVGProps {
  hole: GolfHole;
  selectedPathId: string;
  pegIndex: number | null;  // null = player not on this hole
  playerColor: string;
  holeRelativeToPar?: number;
  isCurrentHole?: boolean;
}

function HoleSVG({ hole, selectedPathId, pegIndex, playerColor, holeRelativeToPar, isCurrentHole }: HoleSVGProps) {
  const W = holeWidth(hole);
  const spine = spineCP(hole.number, W);
  const pathCPs: BCP[] = hole.paths.map((_, i) => pathCP(spine, i, hole.number));
  const pathPts: Pt[][] = hole.paths.map((p, i) => distribute(p.pegholes.length, pathCPs[i]));
  const selIdx = Math.max(0, hole.paths.findIndex(p => p.id === selectedPathId));
  const spineD = cpToD(spine);
  const CY = SVG_H / 2;

  return (
    <svg width={W} height={SVG_H} viewBox={`0 0 ${W} ${SVG_H}`}
      style={{ display: 'block', flexShrink: 0 }}>

      {/* Rough + fairway layered thick strokes along the spine */}
      <path d={spineD} stroke="#1a4a0e" strokeWidth={SVG_H * 0.92} strokeLinecap="round" fill="none" />
      <path d={spineD} stroke="#2e7d32" strokeWidth={SVG_H * 0.70} strokeLinecap="round" fill="none" />
      <path d={spineD} stroke="#388e3c" strokeWidth={SVG_H * 0.52} strokeLinecap="round" fill="none" />
      <path d={spineD} stroke="#43a047" strokeWidth={SVG_H * 0.34} strokeLinecap="round" fill="none" />

      {/* Tee box */}
      <rect x={3} y={CY - 9} width={14} height={18} rx={2}
        fill="#795548" stroke="#5d4037" strokeWidth={0.7} />
      <text x={10} y={CY + 4} fontSize={5} fill="rgba(255,255,255,0.8)"
        textAnchor="middle" letterSpacing="0.3">TEE</text>

      {/* Hazard visuals (before paths so paths draw on top) */}
      {hole.paths.map((path, pi) =>
        path.pegholes.map((ph, phIdx) => {
          if (!HAZARD_SET.has(ph.type)) return null;
          const [px, py] = pathPts[pi][phIdx];
          return <HazardShape key={`hz-${pi}-${phIdx}`}
            type={ph.type as PegholeType} cx={px} cy={py} />;
        })
      )}

      {/* Path lines */}
      {hole.paths.map((path, pi) => {
        const isSel = pi === selIdx;
        return (
          <path key={`pl-${pi}`}
            d={cpToD(pathCPs[pi])}
            stroke={PATH_COLORS[pi]}
            strokeWidth={isSel ? 2.5 : 1.5}
            fill="none"
            opacity={isSel ? 0.9 : 0.28}
            strokeDasharray={isSel ? undefined : '5 3'} />
        );
      })}

      {/* Peghole circles */}
      {hole.paths.map((path, pi) =>
        path.pegholes.map((ph, phIdx) => {
          if (ph.type === 'tee' || ph.type === 'cup') return null;
          const [px, py] = pathPts[pi][phIdx];
          const isSel = pi === selIdx;
          return (
            <circle key={`ph-${pi}-${phIdx}`}
              cx={px} cy={py}
              r={ph.type === 'green' ? 4.5 : 3}
              fill={TYPE_COLOR[ph.type] ?? '#aaa'}
              stroke="rgba(0,0,0,0.35)" strokeWidth={0.5}
              opacity={isSel ? 0.95 : 0.3} />
          );
        })
      )}

      {/* Putting green + flag at right edge */}
      <ellipse cx={W - CUP_MARGIN} cy={CY} rx={18} ry={28} fill="#2e7d32" />
      <ellipse cx={W - CUP_MARGIN} cy={CY} rx={12} ry={19} fill="#4caf50" />
      <ellipse cx={W - CUP_MARGIN} cy={CY} rx={7} ry={11} fill="#66bb6a" />
      <line x1={W - CUP_MARGIN + 5} y1={CY - 9}
            x2={W - CUP_MARGIN + 5} y2={CY - 24}
        stroke="rgba(255,255,255,0.75)" strokeWidth={1.5} />
      <polygon
        points={`${W - CUP_MARGIN + 5},${CY - 24} ${W - CUP_MARGIN + 14},${CY - 19} ${W - CUP_MARGIN + 5},${CY - 15}`}
        fill="#ef5350" />

      {/* Hole number + par — top-left */}
      <text x={4} y={13} fontSize={10} fill="rgba(255,255,255,0.65)" fontWeight="bold">{hole.number}</text>
      <text x={4} y={23} fontSize={6.5} fill="rgba(255,255,255,0.38)">Par {hole.par}</text>

      {/* Current hole highlight border */}
      {isCurrentHole && (
        <rect x={1} y={1} width={W - 2} height={SVG_H - 2}
          rx={4} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth={2} />
      )}

      {/* Completed score badge — bottom-right */}
      {holeRelativeToPar !== undefined && (
        <g>
          <rect x={W - 29} y={SVG_H - 18} width={26} height={15} rx={4}
            fill={holeRelativeToPar < 0 ? '#1b5e20' : holeRelativeToPar === 0 ? '#0d47a1' : '#b71c1c'}
            opacity={0.9} />
          <text x={W - 16} y={SVG_H - 7} fontSize={9} fill="white"
            textAnchor="middle" fontWeight="bold">
            {holeRelativeToPar > 0 ? `+${holeRelativeToPar}` : holeRelativeToPar === 0 ? 'E' : holeRelativeToPar}
          </text>
        </g>
      )}

      {/* Player peg */}
      {pegIndex !== null && (() => {
        const pts = pathPts[selIdx];
        if (!pts || pts.length === 0) return null;
        const idx = Math.min(Math.max(0, pegIndex), pts.length - 1);
        const [px, py] = pts[idx];
        return (
          <g>
            <circle cx={px} cy={py} r={12} fill={playerColor} opacity={0.2} />
            <circle cx={px} cy={py} r={7.5} fill={playerColor} stroke="white" strokeWidth={2} />
          </g>
        );
      })()}
    </svg>
  );
}

// ── Scorecard ──────────────────────────────────────────────────────────────────

function scoreClass(rel: number, s: Record<string, string>) {
  if (rel <= -2) return s.eagle;
  if (rel === -1) return s.birdie;
  if (rel === 0) return s.par;
  if (rel === 1) return s.bogey;
  return s.doubleBogey;
}

interface ScorecardProps {
  course: Course;
  golfScores: PlayerGolfScore[];
  playerNames: string[];
}

function Scorecard({ course, golfScores, playerNames }: ScorecardProps) {
  return (
    <details className={styles.scorecard}>
      <summary className={styles.scorecardToggle}>
        <span>Scorecard</span>
        <span className={styles.scorecardTotals}>
          {golfScores.map((gs, i) => (
            <span key={i} style={{ color: PLAYER_COLORS[i] }}>
              {gs.totalRelativeToPar > 0 ? `+${gs.totalRelativeToPar}` : gs.totalRelativeToPar === 0 ? 'E' : gs.totalRelativeToPar}
            </span>
          ))}
        </span>
      </summary>
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
                const hs = (gs.holeScores as any[]).find(h => h.holeNumber === hole.number);
                return (
                  <td key={pi} className={hs ? scoreClass(hs.relativeToPar, styles) : ''}>
                    {hs ? hs.strokes : '–'}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className={styles.totalRow}>
            <td colSpan={2}>Total</td>
            {golfScores.map((gs, pi) => (
              <td key={pi}>
                {gs.totalRelativeToPar >= 0 ? `+${gs.totalRelativeToPar}` : gs.totalRelativeToPar}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </details>
  );
}

// ── Player pane ───────────────────────────────────────────────────────────────

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

  const selectedPaths = (golfScore as any).selectedPaths as Record<number, string> ?? {};
  const pendingChoice = (golfScore as any).pendingPathChoiceHole as number | null;
  const score = golfScore.totalRelativeToPar;
  const scoreStr = score === 0 ? 'E' : score > 0 ? `+${score}` : `${score}`;

  // Pre-compute widths and cumulative x-offsets once per course change
  const holeWidths = useMemo(() => course.holes.map(holeWidth), [course.holes]);
  const cumX = useMemo(() => {
    const acc: number[] = [];
    holeWidths.reduce((sum, w, i) => { acc[i] = sum; return sum + w; }, 0);
    return acc;
  }, [holeWidths]);

  // Auto-scroll so the current peg is centred in the track wrapper
  useEffect(() => {
    const wrapper = wrapperRef.current;
    if (!wrapper) return;
    const hIdx = golfScore.currentHole - 1;
    if (hIdx < 0 || hIdx >= course.holes.length) return;
    const W = holeWidths[hIdx];
    const selectedPath = course.holes[hIdx].paths.find(
      p => p.id === (selectedPaths[golfScore.currentHole] ?? 'A')
    ) ?? course.holes[hIdx].paths[0];
    const n = selectedPath.pegholes.length;
    const t = n <= 1 ? 0 : golfScore.currentPegholeIndex / (n - 1);
    // All paths share the same x-progression (only y varies), so use bezier x formula
    const pegX = beval(t, TEE_X, W * 0.33, W * 0.67, W - CUP_MARGIN);
    const targetScroll = cumX[hIdx] + pegX - wrapper.clientWidth / 2;
    wrapper.scrollTo({ left: Math.max(0, targetScroll), behavior: 'smooth' });
  }, [golfScore.currentHole, golfScore.currentPegholeIndex, cumX, holeWidths, selectedPaths, course.holes]);

  return (
    <div className={`${styles.pane} ${isMe ? styles.myPane : ''}`}>
      {/* Header */}
      <div className={styles.paneHeader}>
        <span className={styles.playerDot} style={{ background: color }} />
        <span className={styles.playerName}>{playerName}</span>
        <span className={styles.holeTag}>
          {golfScore.isFinished ? '⛳ Done' : `Hole ${golfScore.currentHole}`}
        </span>
        <span className={styles.scoreTag}
          style={{ color: score < 0 ? '#81c784' : score > 0 ? '#ef9a9a' : '#ccc' }}>
          {scoreStr}
        </span>
        {pendingChoice !== null && isMe && (
          <button className={styles.choosePathBtn} onClick={() => onChoosePath?.(pendingChoice)}>
            ⑂ Path
          </button>
        )}
      </div>

      {/* Scrollable horizontal track — all 18 holes */}
      <div className={`${styles.trackWrapper} ${isMe ? styles.trackLarge : styles.trackSmall}`}
        ref={wrapperRef}>
        <div className={styles.track}>
          {course.holes.map((hole) => {
            const isCurrentHole = !golfScore.isFinished && hole.number === golfScore.currentHole;
            const hs = (golfScore.holeScores as any[]).find(h => h.holeNumber === hole.number);
            return (
              <HoleSVG
                key={hole.number}
                hole={hole}
                selectedPathId={selectedPaths[hole.number] ?? 'A'}
                pegIndex={isCurrentHole ? golfScore.currentPegholeIndex : null}
                playerColor={color}
                holeRelativeToPar={hs?.relativeToPar}
                isCurrentHole={isCurrentHole}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

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
    return [mySeat, ...all.filter(i => i !== mySeat)];
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
