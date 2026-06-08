import type { Course, GolfHole, GolfPath, Peghole, PegholeType } from '../types/board.js';

// Course: 18 holes, total par 72 (front 9 = 36, back 9 = 36)
// Each hole has 3 paths: A (safe, no hazards), B (moderate), C (risky)
// All 3 paths for a hole have the same number of pegholes (same length).
// Paths differ only in hazard placement — the strategic choice is score vs. variety.

interface HoleDef {
  par: 3 | 4 | 5;
  handicap: number;
  // fairway types for each path (between tee and cup, green included)
  pathA: PegholeType[];
  pathB: PegholeType[];
  pathC: PegholeType[];
}

// Par 3 baseline: [fairway, green] → tee + 2 types + cup = 4 pegholes
// Par 4 baseline: [fairway, fairway, green] → 5 pegholes
// Par 5 baseline: [fairway, fairway, fairway, green] → 6 pegholes

const HOLE_DEFS: HoleDef[] = [
  // Front Nine (par 36)
  // 1 — par 4, hcp 7
  { par: 4, handicap: 7,
    pathA: ['fairway', 'fairway', 'green'],
    pathB: ['rough',   'fairway', 'green'],
    pathC: ['water',   'fairway', 'green'] },
  // 2 — par 5, hcp 11
  { par: 5, handicap: 11,
    pathA: ['fairway', 'fairway', 'fairway', 'green'],
    pathB: ['rough',   'fairway', 'fairway', 'green'],
    pathC: ['water',   'fairway', 'fairway', 'green'] },
  // 3 — par 3, hcp 17
  { par: 3, handicap: 17,
    pathA: ['fairway', 'green'],
    pathB: ['rough',   'green'],
    pathC: ['sand',    'green'] },
  // 4 — par 4, hcp 3
  { par: 4, handicap: 3,
    pathA: ['fairway', 'fairway', 'green'],
    pathB: ['trees',   'fairway', 'green'],
    pathC: ['water',   'fairway', 'green'] },
  // 5 — par 4, hcp 1
  { par: 4, handicap: 1,
    pathA: ['fairway', 'fairway', 'green'],
    pathB: ['rough',   'fairway', 'green'],
    pathC: ['sand',    'fairway', 'green'] },
  // 6 — par 5, hcp 13
  { par: 5, handicap: 13,
    pathA: ['fairway', 'fairway', 'fairway', 'green'],
    pathB: ['fairway', 'rough',   'fairway', 'green'],
    pathC: ['fairway', 'water',   'fairway', 'green'] },
  // 7 — par 3, hcp 15
  { par: 3, handicap: 15,
    pathA: ['fairway', 'green'],
    pathB: ['rough',   'green'],
    pathC: ['water',   'green'] },
  // 8 — par 4, hcp 5
  { par: 4, handicap: 5,
    pathA: ['fairway', 'fairway', 'green'],
    pathB: ['fairway', 'rough',   'green'],
    pathC: ['fairway', 'water',   'green'] },
  // 9 — par 4, hcp 9
  { par: 4, handicap: 9,
    pathA: ['fairway', 'fairway', 'green'],
    pathB: ['trees',   'fairway', 'green'],
    pathC: ['water',   'fairway', 'green'] },
  // Back Nine (par 36)
  // 10 — par 4, hcp 10
  { par: 4, handicap: 10,
    pathA: ['fairway', 'fairway', 'green'],
    pathB: ['rough',   'fairway', 'green'],
    pathC: ['sand',    'fairway', 'green'] },
  // 11 — par 5, hcp 14
  { par: 5, handicap: 14,
    pathA: ['fairway', 'fairway', 'fairway', 'green'],
    pathB: ['fairway', 'rough',   'fairway', 'green'],
    pathC: ['fairway', 'water',   'fairway', 'green'] },
  // 12 — par 3, hcp 18
  { par: 3, handicap: 18,
    pathA: ['fairway', 'green'],
    pathB: ['sand',    'green'],
    pathC: ['water',   'green'] },
  // 13 — par 4, hcp 4
  { par: 4, handicap: 4,
    pathA: ['fairway', 'fairway', 'green'],
    pathB: ['rough',   'fairway', 'green'],
    pathC: ['water',   'fairway', 'green'] },
  // 14 — par 4, hcp 2
  { par: 4, handicap: 2,
    pathA: ['fairway', 'fairway', 'green'],
    pathB: ['rough',   'trees',   'green'],
    pathC: ['water',   'fairway', 'green'] },
  // 15 — par 5, hcp 12
  { par: 5, handicap: 12,
    pathA: ['fairway', 'fairway', 'fairway', 'green'],
    pathB: ['rough',   'fairway', 'fairway', 'green'],
    pathC: ['sand',    'water',   'fairway', 'green'] },
  // 16 — par 3, hcp 16
  { par: 3, handicap: 16,
    pathA: ['fairway', 'green'],
    pathB: ['rough',   'green'],
    pathC: ['water',   'green'] },
  // 17 — par 4, hcp 6
  { par: 4, handicap: 6,
    pathA: ['fairway', 'fairway', 'green'],
    pathB: ['fairway', 'rough',   'green'],
    pathC: ['fairway', 'sand',    'green'] },
  // 18 — par 4, hcp 8
  { par: 4, handicap: 8,
    pathA: ['fairway', 'fairway', 'green'],
    pathB: ['rough',   'fairway', 'green'],
    pathC: ['water',   'fairway', 'green'] },
];

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
  return {
    number,
    par: def.par,
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
