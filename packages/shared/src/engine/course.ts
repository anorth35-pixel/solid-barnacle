import type { Course, GolfHole, GolfPath, Peghole, PegholeType } from '../types/board.js';

// Course: 18 holes, total par varies by path choice.
// Each hole has 3 paths of DIFFERENT lengths:
//   A (Safe):    longest — no hazards, guaranteed but slower
//   B (Moderate): medium — 1–3 moderate hazards
//   C (Risky):   shortest — most hazards, fast if clean but penalties can hurt
//
// Intermediate peghole counts (exclusive of tee and cup):
//   Short holes  (par-3 style): A=5, B=4, C=3
//   Medium holes (par-4 style): A=11, B=9, C=7
//   Long holes   (par-5 style): A=20, B=17, C=14
//
// Hole par = path A intermediates + 1 (the cup stroke).

// ---------------------------------------------------------------------------
// Helper: build intermediate array — (count-1) fairways + green at end,
// then overwrite specified positions with hazard types.
function inter(count: number, ...hazards: Array<[number, PegholeType]>): PegholeType[] {
  const arr: PegholeType[] = Array(count - 1).fill('fairway');
  arr.push('green');
  for (const [i, t] of hazards) {
    arr[i] = t;
  }
  return arr;
}

interface HoleDef {
  handicap: number;
  pathA: PegholeType[]; // safe, longest
  pathB: PegholeType[]; // moderate, medium
  pathC: PegholeType[]; // risky, shortest
}

// SHORT = par-6 holes (pathA has 5 intermediates)
// MEDIUM = par-12 holes (pathA has 11 intermediates)
// LONG = par-21 holes (pathA has 20 intermediates)

const HOLE_DEFS: HoleDef[] = [
  // ── Front Nine ──────────────────────────────────────────────────────────────
  // 1 — medium, hcp 7
  { handicap: 7,
    pathA: inter(11),
    pathB: inter(9,  [0,'rough'],  [5,'sand']),
    pathC: inter(7,  [0,'water'],  [3,'trees']) },

  // 2 — long, hcp 11
  { handicap: 11,
    pathA: inter(20),
    pathB: inter(17, [2,'rough'],  [8,'sand'],   [13,'rough']),
    pathC: inter(14, [1,'water'],  [6,'trees'],  [10,'sand']) },

  // 3 — short, hcp 17
  { handicap: 17,
    pathA: inter(5),
    pathB: inter(4,  [0,'rough']),
    pathC: inter(3,  [0,'water']) },

  // 4 — medium, hcp 3
  { handicap: 3,
    pathA: inter(11),
    pathB: inter(9,  [2,'rough'],  [6,'rough']),
    pathC: inter(7,  [1,'water'],  [4,'sand']) },

  // 5 — medium, hcp 1
  { handicap: 1,
    pathA: inter(11),
    pathB: inter(9,  [1,'rough'],  [5,'trees']),
    pathC: inter(7,  [0,'sand'],   [3,'water']) },

  // 6 — long, hcp 13
  { handicap: 13,
    pathA: inter(20),
    pathB: inter(17, [4,'trees'],  [10,'rough'], [15,'sand']),
    pathC: inter(14, [2,'sand'],   [7,'water'],  [11,'rough']) },

  // 7 — short, hcp 15
  { handicap: 15,
    pathA: inter(5),
    pathB: inter(4,  [1,'sand']),
    pathC: inter(3,  [1,'water']) },

  // 8 — medium, hcp 5
  { handicap: 5,
    pathA: inter(11),
    pathB: inter(9,  [3,'rough'],  [7,'sand']),
    pathC: inter(7,  [1,'water'],  [5,'trees']) },

  // 9 — medium, hcp 9
  { handicap: 9,
    pathA: inter(11),
    pathB: inter(9,  [0,'trees'],  [4,'rough']),
    pathC: inter(7,  [0,'out-of-bounds']) },

  // ── Back Nine ───────────────────────────────────────────────────────────────
  // 10 — medium, hcp 10
  { handicap: 10,
    pathA: inter(11),
    pathB: inter(9,  [2,'sand'],   [6,'rough']),
    pathC: inter(7,  [2,'water'],  [5,'sand']) },

  // 11 — long, hcp 14
  { handicap: 14,
    pathA: inter(20),
    pathB: inter(17, [1,'rough'],  [8,'trees'],  [14,'sand']),
    pathC: inter(14, [0,'water'],  [5,'sand'],   [10,'water']) },

  // 12 — short, hcp 18
  { handicap: 18,
    pathA: inter(5),
    pathB: inter(4,  [0,'trees']),
    pathC: inter(3,  [0,'out-of-bounds']) },

  // 13 — medium, hcp 4
  { handicap: 4,
    pathA: inter(11),
    pathB: inter(9,  [1,'rough'],  [4,'sand']),
    pathC: inter(7,  [0,'sand'],   [3,'water']) },

  // 14 — medium, hcp 2
  { handicap: 2,
    pathA: inter(11),
    pathB: inter(9,  [3,'trees'],  [7,'rough']),
    pathC: inter(7,  [1,'water'],  [5,'sand']) },

  // 15 — long, hcp 12
  { handicap: 12,
    pathA: inter(20),
    pathB: inter(17, [3,'rough'],  [9,'sand'],   [14,'rough']),
    pathC: inter(14, [2,'water'],  [7,'trees'],  [12,'sand']) },

  // 16 — short, hcp 16
  { handicap: 16,
    pathA: inter(5),
    pathB: inter(4,  [2,'rough']),
    pathC: inter(3,  [0,'sand'],   [1,'water']) },

  // 17 — medium, hcp 6
  { handicap: 6,
    pathA: inter(11),
    pathB: inter(9,  [0,'rough'],  [4,'trees']),
    pathC: inter(7,  [1,'sand'],   [4,'water']) },

  // 18 — medium, hcp 8
  { handicap: 8,
    pathA: inter(11),
    pathB: inter(9,  [5,'rough'],  [8,'sand']),
    pathC: inter(7,  [2,'water'],  [5,'trees']) },
];

// ---------------------------------------------------------------------------

const HAZARD_TYPES: ReadonlySet<string> = new Set([
  'rough', 'trees', 'sand', 'water', 'out-of-bounds',
]);

function buildPath(
  id: 'A' | 'B' | 'C',
  fairway: PegholeType[],
  holeNumber: number,
): GolfPath {
  const types: PegholeType[] = ['tee', ...fairway, 'cup'];
  const pegholes: Peghole[] = types.map((type, index) => ({
    id: `h${holeNumber}-${id}-${index}`,
    holeNumber,
    pathId: id,
    index,
    type,
    isPar: !HAZARD_TYPES.has(type),
    x: 0,
    y: 0,
  }));

  const labels: Record<string, string> = { A: 'Safe', B: 'Moderate', C: 'Risky' };
  const hazards = fairway.filter((t) => HAZARD_TYPES.has(t));
  const hazardDesc = hazards.length === 0
    ? 'Clear fairway — no hazards'
    : hazards.map((h) => describeHazard(h)).join(', ');

  return { id, label: labels[id], description: hazardDesc, pegholes };
}

function describeHazard(type: PegholeType): string {
  const map: Partial<Record<PegholeType, string>> = {
    rough: 'rough (+1 stroke)',
    trees: 'trees (+1 stroke)',
    sand: 'sand trap (+1 stroke)',
    water: 'water hazard (+2 strokes)',
    'out-of-bounds': 'out of bounds (+2 strokes, return to tee)',
  };
  return map[type] ?? type;
}

function buildHole(def: HoleDef, number: number): GolfHole {
  // Par = strokes needed to complete path A cleanly: (intermediates + cup stroke)
  const par = def.pathA.length + 1;
  return {
    number,
    par,
    handicap: def.handicap,
    paths: [
      buildPath('A', def.pathA, number),
      buildPath('B', def.pathB, number),
      buildPath('C', def.pathC, number),
    ],
  };
}

function buildCourse(): Course {
  const holes = HOLE_DEFS.map((def, i) => buildHole(def, i + 1));
  const frontNinePar = holes.slice(0, 9).reduce((s, h) => s + h.par, 0);
  const backNinePar = holes.slice(9).reduce((s, h) => s + h.par, 0);
  return {
    name: 'CribbGolf Country Club',
    holes,
    totalPar: frontNinePar + backNinePar,
    frontNinePar,
    backNinePar,
  };
}

export const DEFAULT_COURSE: Course = buildCourse();

// Helper: get the path a player is using for a given hole
export function getPlayerPath(hole: GolfHole, selectedPaths: Record<number, string>): GolfPath {
  const id = selectedPaths[hole.number] ?? 'A';
  return hole.paths.find((p) => p.id === id) ?? hole.paths[0];
}
