import { useMemo } from 'react';
import type { Course, GolfHole, GolfPath, PegholeType } from '@cribbgolf/shared';
import type { PlayerGolfScore } from '@cribbgolf/shared';
import styles from './GolfCourseBoard.module.css';

const PLAYER_COLORS = ['#1565c0', '#c62828', '#2e7d32'];

const SVG_W = 200;

const TYPE_COLOR: Record<string, string> = {
  tee: '#bcaaa4', fairway: '#66bb6a', rough: '#558b2f',
  trees: '#33691e', sand: '#f9a825', water: '#29b6f6',
  'out-of-bounds': '#ef5350', green: '#a5d6a7', cup: '#ffd54f',
};

// A=sky blue, B=amber, C=rose
const PATH_COLORS = ['#81d4fa', '#ffe082', '#f48fb1'];

// ── Bezier helpers ────────────────────────────────────────────────────────────

type Pt = [number, number];
type BCP = [Pt, Pt, Pt, Pt]; // cubic bezier control points

function beval(t: number, a: number, b: number, c: number, d: number): number {
  const m = 1 - t;
  return m*m*m*a + 3*m*m*t*b + 3*m*t*t*c + t*t*t*d;
}

function bpt(t: number, [p0, p1, p2, p3]: BCP): Pt {
  return [beval(t, p0[0],p1[0],p2[0],p3[0]), beval(t, p0[1],p1[1],p2[1],p3[1])];
}

function distributeAlongBezier(n: number, cp: BCP): Pt[] {
  if (n <= 0) return [];
  if (n === 1) return [cp[0]];
  return Array.from({ length: n }, (_, i) => bpt(i / (n - 1), cp));
}

function cpToD([p0, cp1, cp2, p3]: BCP): string {
  return `M${fmt(p0[0])},${fmt(p0[1])} C${fmt(cp1[0])},${fmt(cp1[1])} ${fmt(cp2[0])},${fmt(cp2[1])} ${fmt(p3[0])},${fmt(p3[1])}`;
}

function fmt(n: number) { return n.toFixed(1); }

// ── Hole geometry generation ──────────────────────────────────────────────────

function holeHeight(hole: GolfHole): number {
  const maxLen = Math.max(...hole.paths.map(p => p.pegholes.length));
  return Math.max(180, maxLen * 22 + 55);
}

// Central "spine" bezier for the fairway shape — deterministic per hole number
function spineCP(holeNum: number, H: number): BCP {
  const cx = SVG_W / 2;
  const s = holeNum;
  // S-curve variation per hole
  const cp1x = cx + ((s * 7 + 3) % 38) - 19;   // -19…+18 from center
  const cp2x = cx - ((s * 13 + 5) % 34) + 17;  // opposite swing
  return [[cx, 22], [cp1x, H * 0.33], [cp2x, H * 0.67], [cx, H - 22]];
}

// Per-path bezier: A goes left-then-right, C goes right-then-left → they criss-cross
function pathCP(spine: BCP, pathIdx: number, holeNum: number): BCP {
  const [p0, s1, s2, p3] = spine;
  const base: Array<[number, number]> = [
    [-54, +44],  // A: CP1 left of spine, CP2 right  → X-cross with C
    [+14, -10],  // B: mild right-left, stays central
    [+54, -44],  // C: CP1 right, CP2 left           → X-cross with A
  ];
  const jitter = ((holeNum * 5 + pathIdx * 11) % 14) - 7;
  const [dx1, dx2] = base[pathIdx];
  return [p0, [s1[0] + dx1 + jitter, s1[1]], [s2[0] + dx2 - jitter, s2[1]], p3];
}

// ── Hazard SVG shapes ─────────────────────────────────────────────────────────

function HazardShape({ type, cx, cy }: { type: PegholeType; cx: number; cy: number }) {
  // Offset hazard visuals slightly to the outside edge so they don't cover the path line
  const ox = cx < SVG_W / 2 ? -16 : 16;

  if (type === 'sand') {
    return (
      <ellipse cx={cx + ox} cy={cy} rx={13} ry={8}
        fill="#f9a825" stroke="#f57f17" strokeWidth={0.5} opacity={0.92} />
    );
  }
  if (type === 'water') {
    const x = cx + ox;
    return (
      <path
        d={`M${x-15},${cy} C${x-19},${cy-9} ${x-3},${cy-13} ${x+5},${cy-9} C${x+17},${cy-6} ${x+19},${cy+3} ${x+13},${cy+9} C${x+7},${cy+15} ${x-11},${cy+13} ${x-17},${cy+6} Z`}
        fill="#1565c0" opacity={0.78}
      />
    );
  }
  if (type === 'trees') {
    const x = cx + ox;
    return (
      <g>
        <circle cx={x - 7} cy={cy - 5} r={7} fill="#1b5e20" opacity={0.88} />
        <circle cx={x + 6} cy={cy + 1} r={6} fill="#1b5e20" opacity={0.88} />
        <circle cx={x - 1} cy={cy + 8} r={5} fill="#1b5e20" opacity={0.88} />
      </g>
    );
  }
  if (type === 'rough') {
    return <ellipse cx={cx + ox} cy={cy} rx={10} ry={6} fill="#33691e" opacity={0.65} />;
  }
  if (type === 'out-of-bounds') {
    return (
      <g>
        <rect x={cx + ox - 12} y={cy - 8} width={24} height={16} rx={3} fill="#b71c1c" opacity={0.88} />
        <text x={cx + ox} y={cy + 4} fontSize={6} fill="white" textAnchor="middle" fontWeight="bold">OOB</text>
      </g>
    );
  }
  return null;
}

// ── HoleSVG ───────────────────────────────────────────────────────────────────

const HAZARD_SET = new Set(['rough', 'trees', 'sand', 'water', 'out-of-bounds']);

interface HoleSVGProps {
  hole: GolfHole;
  selectedPathId: string;
  pegIndex: number | null;  // null = player not on this hole yet / past it
  playerColor: string;
  holeRelativeToPar?: number; // defined when hole is completed
}

function HoleSVG({ hole, selectedPathId, pegIndex, playerColor, holeRelativeToPar }: HoleSVGProps) {
  const H = holeHeight(hole);
  const spine = useMemo(() => spineCP(hole.number, H), [hole.number, H]);
  const spineD = cpToD(spine);

  const pathCPs: BCP[] = useMemo(
    () => hole.paths.map((_, i) => pathCP(spine, i, hole.number)),
    [hole.number, spine],
  );

  const pathPts: Pt[][] = useMemo(
    () => hole.paths.map((p, i) => distributeAlongBezier(p.pegholes.length, pathCPs[i])),
    [hole.paths, pathCPs],
  );

  const selectedIdx = hole.paths.findIndex(p => p.id === selectedPathId);
  const safeSelIdx = selectedIdx >= 0 ? selectedIdx : 0;

  return (
    <svg
      width="100%"
      viewBox={`0 0 ${SVG_W} ${H}`}
      style={{ display: 'block', maxWidth: SVG_W }}
    >
      {/* ── Background: rough ── */}
      <path d={spineD} stroke="#1b4d0f" strokeWidth={108} strokeLinecap="round" fill="none" />

      {/* ── Fairway band ── */}
      <path d={spineD} stroke="#2e7d32" strokeWidth={72} strokeLinecap="round" fill="none" />
      <path d={spineD} stroke="#388e3c" strokeWidth={50} strokeLinecap="round" fill="none" />
      <path d={spineD} stroke="#43a047" strokeWidth={32} strokeLinecap="round" fill="none" />

      {/* ── Tee box ── */}
      <rect x={SVG_W/2 - 10} y={11} width={20} height={13} rx={2}
        fill="#795548" stroke="#5d4037" strokeWidth={0.75} />
      <text x={SVG_W/2} y={21} fontSize={6.5} fill="rgba(255,255,255,0.75)"
        textAnchor="middle" letterSpacing="0.5">TEE</text>

      {/* ── Hazard visual shapes (draw before path lines) ── */}
      {hole.paths.map((path, pi) =>
        path.pegholes.map((ph, phIdx) => {
          if (!HAZARD_SET.has(ph.type)) return null;
          const [px, py] = pathPts[pi][phIdx];
          return (
            <HazardShape
              key={`hz-${pi}-${phIdx}`}
              type={ph.type as PegholeType}
              cx={px}
              cy={py}
            />
          );
        })
      )}

      {/* ── Path lines ── */}
      {hole.paths.map((path, pi) => {
        const isSelected = pi === safeSelIdx;
        return (
          <path
            key={`pl-${pi}`}
            d={cpToD(pathCPs[pi])}
            stroke={PATH_COLORS[pi]}
            strokeWidth={isSelected ? 2.5 : 1.5}
            fill="none"
            opacity={isSelected ? 0.9 : 0.28}
            strokeDasharray={isSelected ? undefined : '5 3'}
          />
        );
      })}

      {/* ── Peghole circles ── */}
      {hole.paths.map((path, pi) =>
        path.pegholes.map((ph, phIdx) => {
          if (ph.type === 'tee' || ph.type === 'cup') return null;
          const [px, py] = pathPts[pi][phIdx];
          const isSelected = pi === safeSelIdx;
          const r = ph.type === 'green' ? 4.5 : 3;
          return (
            <circle
              key={`ph-${pi}-${phIdx}`}
              cx={px} cy={py} r={r}
              fill={TYPE_COLOR[ph.type] ?? '#aaa'}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={0.5}
              opacity={isSelected ? 0.95 : 0.3}
            />
          );
        })
      )}

      {/* ── Putting green ── */}
      <ellipse cx={SVG_W/2} cy={H - 22} rx={26} ry={18} fill="#2e7d32" />
      <ellipse cx={SVG_W/2} cy={H - 22} rx={20} ry={13} fill="#4caf50" />
      <ellipse cx={SVG_W/2} cy={H - 22} rx={13} ry={8} fill="#66bb6a" />
      {/* Flag stick */}
      <line x1={SVG_W/2 + 6} y1={H - 28} x2={SVG_W/2 + 6} y2={H - 40}
        stroke="rgba(255,255,255,0.7)" strokeWidth={1.5} />
      <polygon
        points={`${SVG_W/2 + 6},${H - 40} ${SVG_W/2 + 14},${H - 36} ${SVG_W/2 + 6},${H - 33}`}
        fill="#ef5350"
      />

      {/* ── Hole number & par label ── */}
      <text x={7} y={17} fontSize={11} fill="rgba(255,255,255,0.65)" fontWeight="bold">{hole.number}</text>
      <text x={7} y={28} fontSize={7.5} fill="rgba(255,255,255,0.38)">Par {hole.par}</text>

      {/* ── Completed score badge ── */}
      {holeRelativeToPar !== undefined && (
        <g>
          <rect x={SVG_W - 29} y={5} width={24} height={17} rx={4}
            fill={holeRelativeToPar < 0 ? '#1b5e20' : holeRelativeToPar === 0 ? '#0d47a1' : '#b71c1c'}
            opacity={0.9}
          />
          <text x={SVG_W - 17} y={16.5} fontSize={9.5} fill="white"
            textAnchor="middle" fontWeight="bold">
            {holeRelativeToPar > 0 ? `+${holeRelativeToPar}` : holeRelativeToPar === 0 ? 'E' : holeRelativeToPar}
          </text>
        </g>
      )}

      {/* ── Player peg ── */}
      {pegIndex !== null && (() => {
        const pts = pathPts[safeSelIdx];
        if (!pts || pts.length === 0) return null;
        const safePhIdx = Math.min(Math.max(0, pegIndex), pts.length - 1);
        const [px, py] = pts[safePhIdx];
        return (
          <g>
            <circle cx={px} cy={py} r={11} fill={playerColor} opacity={0.22} />
            <circle cx={px} cy={py} r={7} fill={playerColor} stroke="white" strokeWidth={2} />
          </g>
        );
      })()}
    </svg>
  );
}

// ── Mini hole chip (progress strip) ──────────────────────────────────────────

function MiniHoleChip({
  holeNum, par, isCurrent, relativeToPar,
}: { holeNum: number; par: number; isCurrent: boolean; relativeToPar?: number }) {
  let bg = 'rgba(255,255,255,0.07)';
  let fg = 'rgba(255,255,255,0.35)';
  if (isCurrent) { bg = 'rgba(255,255,255,0.22)'; fg = '#fff'; }
  else if (relativeToPar !== undefined) {
    bg = relativeToPar < 0 ? 'rgba(76,175,80,0.3)' : relativeToPar === 0 ? 'rgba(33,150,243,0.25)' : 'rgba(239,83,80,0.25)';
    fg = relativeToPar < 0 ? '#a5d6a7' : relativeToPar === 0 ? '#90caf9' : '#ef9a9a';
  }
  return (
    <div className={styles.miniChip} style={{ background: bg }}>
      <span className={styles.miniNum} style={{ color: fg }}>{holeNum}</span>
      {relativeToPar !== undefined && (
        <span className={styles.miniScore} style={{ color: fg }}>
          {relativeToPar > 0 ? `+${relativeToPar}` : relativeToPar === 0 ? 'E' : relativeToPar}
        </span>
      )}
    </div>
  );
}

// ── Scorecard ──────────────────────────────────────────────────────────────────

function scoreClass(rel: number, styles: Record<string, string>) {
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
                const hs = (gs.holeScores as any[]).find((h) => h.holeNumber === hole.number);
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
              <td key={pi}>{gs.totalRelativeToPar >= 0 ? `+${gs.totalRelativeToPar}` : gs.totalRelativeToPar}</td>
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
  const selectedPaths = (golfScore as any).selectedPaths as Record<number, string> ?? {};
  const currentHole = course.holes[golfScore.currentHole - 1];
  const selectedPathId = selectedPaths[golfScore.currentHole] ?? 'A';
  const pendingChoice = (golfScore as any).pendingPathChoiceHole as number | null;

  const score = golfScore.totalRelativeToPar;
  const scoreStr = score === 0 ? 'E' : score > 0 ? `+${score}` : `${score}`;

  return (
    <div className={`${styles.pane} ${isMe ? styles.myPane : ''}`}>
      {/* Header */}
      <div className={styles.paneHeader}>
        <span className={styles.playerDot} style={{ background: color }} />
        <span className={styles.playerName}>{playerName}</span>
        <span className={styles.holeTag}>Hole {golfScore.currentHole}</span>
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

      {/* Hole view */}
      <div className={`${styles.holeView} ${isMe ? styles.holeViewLarge : styles.holeViewSmall}`}>
        {golfScore.isFinished ? (
          <div className={styles.finishedBadge}>⛳ Finished!</div>
        ) : currentHole ? (
          <HoleSVG
            hole={currentHole}
            selectedPathId={selectedPathId}
            pegIndex={golfScore.currentPegholeIndex}
            playerColor={color}
          />
        ) : null}
      </div>

      {/* 18-hole progress strip */}
      <div className={styles.progressStrip}>
        {course.holes.map((hole) => {
          const hs = (golfScore.holeScores as any[]).find((h) => h.holeNumber === hole.number);
          const isCurrent = !golfScore.isFinished && hole.number === golfScore.currentHole;
          return (
            <MiniHoleChip
              key={hole.number}
              holeNum={hole.number}
              par={hole.par}
              isCurrent={isCurrent}
              relativeToPar={hs?.relativeToPar}
            />
          );
        })}
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
