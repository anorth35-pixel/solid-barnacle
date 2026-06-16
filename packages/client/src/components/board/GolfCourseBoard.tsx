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
  'out-of-bounds': '#ef5350', green: '#a5d6a7', 'three-putt': '#ce93d8', cup: '#ffd54f',
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
const HAZARD_SET = new Set(['rough', 'trees', 'sand', 'water', 'out-of-bounds', 'three-putt']);

// Amoebic shapes designed at ~130px scale, rendered via scale(0.13) ≈ 17px
const S = 0.13;

function HazardShape({ type, cx, cy, holeNum }: { type: PegholeType; cx: number; cy: number; holeNum: number }) {
  const oy = cy < SVG_H / 2 ? -12 : 12;
  const hx = cx;
  const hy = cy + oy;

  if (type === 'sand') {
    return (
      <g transform={`translate(${hx},${hy}) scale(${S})`}>
        {/* Amoebic kidney — 8 bezier segments, alternating convex/concave */}
        <path
          d="M 0,-60 C 32,-76 70,-60 78,-34 C 86,-8 66,14 44,6 C 22,-2 24,28 36,50 C 48,72 38,84 10,78 C -18,72 -34,42 -36,10 C -38,-22 -24,-44 -36,-64 C -48,-84 -30,-90 -12,-76 C -6,-70 -4,-64 0,-60 Z"
          fill={`url(#sg-${holeNum})`} />
        {/* Grain dots */}
        {([[-10,-18],[22,2],[2,32],[-24,12],[32,-14]] as [number,number][]).map(([dx,dy],i) => (
          <circle key={i} cx={dx} cy={dy} r={5} fill="#c4a030" opacity={0.45} />
        ))}
        {/* White highlight lip on convex curve */}
        <path d="M 2,-58 C 30,-73 68,-58 76,-34" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth={6} strokeLinecap="round" />
        {/* Dark shadow on concave steep side */}
        <path d="M -36,-62 C -48,-82 -30,-88 -12,-74" fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth={9} strokeLinecap="round" />
      </g>
    );
  }

  if (type === 'water') {
    return (
      <g transform={`translate(${hx},${hy}) scale(${S})`}>
        {/* Irregular pond — 8 bezier segments with one peninsula */}
        <path
          d="M 0,-56 C 30,-68 66,-56 76,-34 C 86,-12 74,8 56,4 C 38,0 40,22 50,42 C 60,62 48,74 22,70 C -4,66 -22,44 -28,18 C -34,-8 -22,-30 -36,-50 C -50,-70 -28,-80 -8,-66 C -2,-62 -2,-58 0,-56 Z"
          fill={`url(#wg-${holeNum})`} />
        {/* Shore highlight */}
        <path d="M 2,-53 C 28,-65 64,-53 74,-32" fill="none" stroke="rgba(100,180,255,0.35)" strokeWidth={6} strokeLinecap="round" />
        {/* Water shimmer ripples */}
        <path d="M -18,-18 Q -6,-26 8,-18 Q 22,-10 36,-18" fill="none" stroke="#90caf9" strokeWidth={4} strokeLinecap="round" opacity={0.55} />
        <path d="M -26,6 Q -10,-2 6,6 Q 22,14 36,6" fill="none" stroke="#90caf9" strokeWidth={3.5} strokeLinecap="round" opacity={0.45} />
        <path d="M -20,30 Q -6,22 8,30" fill="none" stroke="#90caf9" strokeWidth={3} strokeLinecap="round" opacity={0.35} />
        {/* Glint */}
        <ellipse cx={-22} cy={-34} rx={18} ry={7} fill="rgba(144,202,249,0.22)" transform="rotate(-20,-22,-34)" />
      </g>
    );
  }

  if (type === 'trees') {
    return (
      <g transform={`translate(${hx},${hy}) scale(${S})`}>
        {/* Main canopy mass — organic blob, not circles */}
        <path
          d="M 0,-62 C 28,-78 62,-66 76,-42 C 90,-18 82,12 66,22 C 50,32 32,24 38,44 C 44,64 60,70 44,82 C 28,94 4,86 -14,72 C -32,58 -38,30 -50,14 C -62,-2 -64,-26 -50,-44 C -36,-62 -14,-64 0,-62 Z"
          fill="#1b5e20" />
        {/* Secondary lighter lobe overlapping on upper-right */}
        <path
          d="M 20,-54 C 46,-66 70,-56 78,-34 C 86,-12 74,8 58,12 C 42,16 28,4 32,-16 C 36,-36 22,-48 20,-54 Z"
          fill="#2e7d32" />
        {/* Highlight patch — canopy tops catching light */}
        <path d="M -14,-44 C -2,-58 20,-52 26,-36 C 32,-20 20,-8 6,-12 C -8,-16 -12,-30 -14,-44 Z" fill="#388e3c" opacity={0.7} />
        {/* Dark shadow pocket between masses */}
        <path d="M 26,14 C 36,4 52,8 58,22" fill="none" stroke="#0a2e0a" strokeWidth={11} strokeLinecap="round" opacity={0.45} />
        {/* Canopy gloss ellipses */}
        <ellipse cx={-8} cy={-46} rx={24} ry={10} fill="#43a047" opacity={0.38} transform="rotate(-15,-8,-46)" />
        <ellipse cx={44} cy={-28} rx={15} ry={7} fill="#43a047" opacity={0.3} transform="rotate(10,44,-28)" />
      </g>
    );
  }

  if (type === 'rough') {
    return (
      <g transform={`translate(${hx},${hy}) scale(${S})`}>
        {/* Organic rough patch — irregular multi-lobe dark green */}
        <path
          d="M 0,-44 C 22,-56 50,-48 58,-28 C 66,-8 54,12 36,16 C 18,20 16,34 28,46 C 40,58 28,66 8,60 C -12,54 -24,30 -28,8 C -32,-14 -20,-32 -32,-48 C -44,-64 -24,-70 -8,-58 C -2,-54 -2,-48 0,-44 Z"
          fill="#33691e" opacity={0.85} />
        {/* Lighter texture streak */}
        <path d="M -4,-40 C 16,-52 44,-44 52,-24 C 60,-4 50,12 34,14" fill="none" stroke="#558b2f" strokeWidth={7} strokeLinecap="round" opacity={0.45} />
      </g>
    );
  }

  if (type === 'out-of-bounds')
    return (
      <g>
        <rect x={hx - 12} y={hy - 9} width={24} height={18} rx={3}
          fill="#b71c1c" opacity={0.92} />
        <text x={hx} y={hy + 5} fontSize={6} fill="white"
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

      <defs>
        {/* Sand radial gradient — light centre → dark orange edge */}
        <radialGradient id={`sg-${hole.number}`} cx="38%" cy="32%" r="68%" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#ffe082" />
          <stop offset="55%" stopColor="#f9a825" />
          <stop offset="100%" stopColor="#e65100" />
        </radialGradient>
        {/* Water linear gradient — sky blue → deep navy */}
        <linearGradient id={`wg-${hole.number}`} x1="15%" y1="10%" x2="85%" y2="90%" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#1e88e5" />
          <stop offset="45%" stopColor="#1565c0" />
          <stop offset="100%" stopColor="#0a3880" />
        </linearGradient>
      </defs>

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
            type={ph.type as PegholeType} cx={px} cy={py} holeNum={hole.number} />;
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

function ScoreCell({ strokes, rel, isBirdie, isEagle, isDoubleEagle }: {
  strokes: number; rel: number;
  isBirdie?: boolean; isEagle?: boolean; isDoubleEagle?: boolean;
}) {
  let cls = styles.scPar;
  let notation = '';
  if (isDoubleEagle || rel <= -3) { cls = styles.scDoubleEagle; notation = 'doubleCircle'; }
  else if (isEagle || rel === -2)  { cls = styles.scEagle;       notation = 'doubleCircle'; }
  else if (isBirdie || rel === -1) { cls = styles.scBirdie;      notation = 'circle'; }
  else if (rel === 1)              { cls = styles.scBogey;       notation = 'square'; }
  else if (rel >= 2)               { cls = styles.scDoubleBogey; notation = 'doubleSquare'; }
  return (
    <td className={cls}>
      <span className={notation ? styles[`notation_${notation}`] : ''}>
        {strokes}
      </span>
    </td>
  );
}

function relStr(rel: number) {
  return rel === 0 ? 'E' : rel > 0 ? `+${rel}` : `${rel}`;
}

interface ScorecardProps {
  course: Course;
  golfScores: PlayerGolfScore[];
  playerNames: string[];
}

function Scorecard({ course, golfScores, playerNames }: ScorecardProps) {
  const front = course.holes.slice(0, 9);
  const back  = course.holes.slice(9, 18);

  const frontPar = front.reduce((s, h) => s + h.par, 0);
  const backPar  = back.reduce((s, h) => s + h.par, 0);

  function playerFrontStrokes(gs: PlayerGolfScore) {
    return front.reduce((s, h) => {
      const hs = gs.holeScores.find(x => x.holeNumber === h.number);
      return s + (hs?.strokes ?? 0);
    }, 0);
  }
  function playerBackStrokes(gs: PlayerGolfScore) {
    return back.reduce((s, h) => {
      const hs = gs.holeScores.find(x => x.holeNumber === h.number);
      return s + (hs?.strokes ?? 0);
    }, 0);
  }
  function playerFrontRel(gs: PlayerGolfScore) {
    return front.reduce((s, h) => {
      const hs = gs.holeScores.find(x => x.holeNumber === h.number);
      return s + (hs?.relativeToPar ?? 0);
    }, 0);
  }
  function playerBackRel(gs: PlayerGolfScore) {
    return back.reduce((s, h) => {
      const hs = gs.holeScores.find(x => x.holeNumber === h.number);
      return s + (hs?.relativeToPar ?? 0);
    }, 0);
  }

  const pCount = golfScores.length;

  return (
    <details className={styles.scorecard}>
      <summary className={styles.scorecardToggle}>
        <span>Scorecard</span>
        <span className={styles.scorecardTotals}>
          {golfScores.map((gs, i) => (
            <span key={i} style={{ color: PLAYER_COLORS[i] }}>
              {relStr(gs.totalRelativeToPar)}
            </span>
          ))}
        </span>
      </summary>

      <div className={styles.scorecardInner}>
        {/* Front 9 */}
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thLabel}>Hole</th>
              {front.map(h => <th key={h.number}>{h.number}</th>)}
              <th className={styles.thSplit}>OUT</th>
            </tr>
            <tr>
              <th className={styles.thLabel}>Par</th>
              {front.map(h => <th key={h.number}>{h.par}</th>)}
              <th className={styles.thSplit}>{frontPar}</th>
            </tr>
            <tr>
              <th className={styles.thLabel}>Hdcp</th>
              {front.map(h => <th key={h.number} className={styles.hdcp}>{h.handicap}</th>)}
              <th className={styles.thSplit}></th>
            </tr>
          </thead>
          <tbody>
            {golfScores.map((gs, pi) => {
              const frontStrok = playerFrontStrokes(gs);
              const frontRel   = playerFrontRel(gs);
              return (
                <tr key={pi}>
                  <td className={styles.playerLabel} style={{ color: PLAYER_COLORS[pi] }}>
                    {playerNames[pi]}
                  </td>
                  {front.map(h => {
                    const hs = gs.holeScores.find(x => x.holeNumber === h.number);
                    return hs
                      ? <ScoreCell key={h.number}
                          strokes={hs.strokes} rel={hs.relativeToPar}
                          isBirdie={hs.isBirdie} isEagle={hs.isEagle} isDoubleEagle={hs.isDoubleEagle} />
                      : <td key={h.number} className={styles.blank}>–</td>;
                  })}
                  <td className={styles.splitCell}>
                    {frontStrok > 0 ? `${frontStrok} (${relStr(frontRel)})` : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Back 9 */}
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.thLabel}>Hole</th>
              {back.map(h => <th key={h.number}>{h.number}</th>)}
              <th className={styles.thSplit}>IN</th>
              <th className={styles.thTotal}>TOTAL</th>
            </tr>
            <tr>
              <th className={styles.thLabel}>Par</th>
              {back.map(h => <th key={h.number}>{h.par}</th>)}
              <th className={styles.thSplit}>{backPar}</th>
              <th className={styles.thTotal}>{frontPar + backPar}</th>
            </tr>
            <tr>
              <th className={styles.thLabel}>Hdcp</th>
              {back.map(h => <th key={h.number} className={styles.hdcp}>{h.handicap}</th>)}
              <th className={styles.thSplit}></th>
              <th className={styles.thTotal}></th>
            </tr>
          </thead>
          <tbody>
            {golfScores.map((gs, pi) => {
              const backStrok  = playerBackStrokes(gs);
              const backRel    = playerBackRel(gs);
              const totStrok   = gs.totalStrokes;
              const totRel     = gs.totalRelativeToPar;
              return (
                <tr key={pi}>
                  <td className={styles.playerLabel} style={{ color: PLAYER_COLORS[pi] }}>
                    {playerNames[pi]}
                  </td>
                  {back.map(h => {
                    const hs = gs.holeScores.find(x => x.holeNumber === h.number);
                    return hs
                      ? <ScoreCell key={h.number}
                          strokes={hs.strokes} rel={hs.relativeToPar}
                          isBirdie={hs.isBirdie} isEagle={hs.isEagle} isDoubleEagle={hs.isDoubleEagle} />
                      : <td key={h.number} className={styles.blank}>–</td>;
                  })}
                  <td className={styles.splitCell}>
                    {backStrok > 0 ? `${backStrok} (${relStr(backRel)})` : '–'}
                  </td>
                  <td className={styles.totalCell}>
                    {totStrok > 0 ? `${totStrok} (${relStr(totRel)})` : '–'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Legend */}
        <div className={styles.legend}>
          <span className={`${styles.legendItem} ${styles.scDoubleEagle}`}>
            <span className={styles['notation_doubleCircle']}>2</span> Eagle/Double Eagle
          </span>
          <span className={`${styles.legendItem} ${styles.scBirdie}`}>
            <span className={styles['notation_circle']}>3</span> Birdie
          </span>
          <span className={styles.legendItem}>4 Par</span>
          <span className={`${styles.legendItem} ${styles.scBogey}`}>
            <span className={styles['notation_square']}>5</span> Bogey
          </span>
          <span className={`${styles.legendItem} ${styles.scDoubleBogey}`}>
            <span className={styles['notation_doubleSquare']}>6</span> Dbl Bogey
          </span>
        </div>
      </div>
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
