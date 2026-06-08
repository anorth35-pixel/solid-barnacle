import type { Course, GolfHole, GolfPath, Peghole, PegholeType } from '../types/board.js';

// Course: 18 holes with par 3, 4, or 5.
// Each hole has 3 paths of DIFFERENT lengths within the par-determined range:
//   Par 3 paths: 3–5 intermediate pegholes (exclusive of tee and cup)
//   Par 4 paths: 7–11 intermediate pegholes
//   Par 5 paths: 14–20 intermediate pegholes
//
// Path length is independent of hazard count — a short path can be
// dangerous or clean, and a long path can be hazard-free or full of traps.
// Players weigh each path's length AND hazard profile when choosing.

// ---------------------------------------------------------------------------
// Helper: build an intermediate array of given length.
// Starts as (count-1) fairways + green at end; hazards overwrite specific positions.
function inter(count: number, ...hazards: Array<[number, PegholeType]>): PegholeType[] {
  const arr: PegholeType[] = Array(count - 1).fill('fairway');
  arr.push('green');
  for (const [i, t] of hazards) {
    arr[i] = t;
  }
  return arr;
}

interface HoleDef {
  par: 3 | 4 | 5;
  handicap: number;
  pathA: PegholeType[];
  pathB: PegholeType[];
  pathC: PegholeType[];
}

const HOLE_DEFS: HoleDef[] = [
  // ── Front Nine ──────────────────────────────────────────────────────────────
  // 1 — par 4, hcp 7
  { par: 4, handicap: 7,
    pathA: inter(11),                                     // 11 stops, clear
    pathB: inter(8,  [2,'rough'],   [5,'sand']),          //  8 stops, 2 hazards
    pathC: inter(7,  [0,'water'],   [3,'trees']) },       //  7 stops, 2 hazards

  // 2 — par 5, hcp 11
  { par: 5, handicap: 11,
    pathA: inter(20),                                     // 20 stops, clear
    pathB: inter(14, [3,'rough'],   [9,'sand']),          // 14 stops, 2 hazards
    pathC: inter(17, [1,'water'],   [7,'trees'],  [12,'sand']) }, // 17 stops, 3 hazards

  // 3 — par 3, hcp 17
  { par: 3, handicap: 17,
    pathA: inter(5),                                      //  5 stops, clear
    pathB: inter(3,  [0,'rough']),                        //  3 stops, 1 hazard
    pathC: inter(4,  [1,'water']) },                      //  4 stops, 1 hazard

  // 4 — par 4, hcp 3
  { par: 4, handicap: 3,
    pathA: inter(9,  [4,'sand']),                         //  9 stops, 1 hazard
    pathB: inter(7,  [1,'water'],   [4,'rough']),         //  7 stops, 2 hazards
    pathC: inter(11, [3,'rough'],   [7,'rough']) },       // 11 stops, 2 mild hazards

  // 5 — par 4, hcp 1
  { par: 4, handicap: 1,
    pathA: inter(11),                                     // 11 stops, clear
    pathB: inter(7,  [0,'sand'],    [3,'water']),         //  7 stops, 2 hazards
    pathC: inter(9,  [2,'rough'],   [5,'trees'],  [8,'sand']) }, //  9 stops, 3 hazards

  // 6 — par 5, hcp 13
  { par: 5, handicap: 13,
    pathA: inter(14, [7,'rough']),                        // 14 stops, 1 mild hazard
    pathB: inter(20),                                     // 20 stops, clear
    pathC: inter(17, [2,'sand'],    [8,'water'],  [13,'trees']) }, // 17 stops, 3 hazards

  // 7 — par 3, hcp 15
  { par: 3, handicap: 15,
    pathA: inter(4),                                      //  4 stops, clear
    pathB: inter(3,  [0,'sand']),                         //  3 stops, 1 hazard
    pathC: inter(5,  [2,'rough'],   [3,'rough']) },       //  5 stops, 2 mild hazards

  // 8 — par 4, hcp 5
  { par: 4, handicap: 5,
    pathA: inter(7),                                      //  7 stops, clear
    pathB: inter(11, [4,'rough'],   [9,'rough']),         // 11 stops, 2 mild hazards
    pathC: inter(9,  [1,'water'],   [5,'sand']) },        //  9 stops, 2 hazards

  // 9 — par 4, hcp 9
  { par: 4, handicap: 9,
    pathA: inter(9),                                      //  9 stops, clear
    pathB: inter(7,  [0,'out-of-bounds']),                //  7 stops, 1 severe hazard
    pathC: inter(11, [2,'rough'],   [6,'trees'],  [9,'rough']) }, // 11 stops, 3 hazards

  // ── Back Nine ───────────────────────────────────────────────────────────────
  // 10 — par 4, hcp 10
  { par: 4, handicap: 10,
    pathA: inter(11),                                     // 11 stops, clear
    pathB: inter(9,  [3,'sand'],    [7,'rough']),         //  9 stops, 2 hazards
    pathC: inter(7,  [0,'trees'],   [4,'water']) },       //  7 stops, 2 hazards

  // 11 — par 5, hcp 14
  { par: 5, handicap: 14,
    pathA: inter(17, [8,'rough']),                        // 17 stops, 1 mild hazard
    pathB: inter(14, [2,'water'],   [7,'sand']),          // 14 stops, 2 hazards
    pathC: inter(20, [5,'rough'],   [11,'trees'], [16,'sand']) }, // 20 stops, 3 hazards

  // 12 — par 3, hcp 18
  { par: 3, handicap: 18,
    pathA: inter(3),                                      //  3 stops, clear
    pathB: inter(5,  [2,'water']),                        //  5 stops, 1 hazard
    pathC: inter(4,  [0,'out-of-bounds']) },              //  4 stops, 1 severe hazard

  // 13 — par 4, hcp 4
  { par: 4, handicap: 4,
    pathA: inter(9,  [2,'rough']),                        //  9 stops, 1 mild hazard
    pathB: inter(7,  [0,'sand'],    [4,'water']),         //  7 stops, 2 hazards
    pathC: inter(11) },                                   // 11 stops, clear

  // 14 — par 4, hcp 2
  { par: 4, handicap: 2,
    pathA: inter(11),                                     // 11 stops, clear
    pathB: inter(9,  [1,'trees'],   [6,'sand']),          //  9 stops, 2 hazards
    pathC: inter(7,  [0,'water'],   [3,'out-of-bounds']) }, //  7 stops, 2 severe hazards

  // 15 — par 5, hcp 12
  { par: 5, handicap: 12,
    pathA: inter(20),                                     // 20 stops, clear
    pathB: inter(17, [4,'rough'],   [10,'sand'],  [15,'rough']), // 17 stops, 3 hazards
    pathC: inter(14, [1,'water'],   [6,'trees']) },       // 14 stops, 2 hazards

  // 16 — par 3, hcp 16
  { par: 3, handicap: 16,
    pathA: inter(4,  [0,'rough']),                        //  4 stops, 1 mild hazard
    pathB: inter(3),                                      //  3 stops, clear
    pathC: inter(5,  [1,'sand'],    [3,'water']) },       //  5 stops, 2 hazards

  // 17 — par 4, hcp 6
  { par: 4, handicap: 6,
    pathA: inter(11),                                     // 11 stops, clear
    pathB: inter(7,  [0,'rough'],   [4,'trees']),         //  7 stops, 2 hazards
    pathC: inter(9,  [2,'water'],   [6,'sand']) },        //  9 stops, 2 hazards

  // 18 — par 4, hcp 8
  { par: 4, handicap: 8,
    pathA: inter(8,  [3,'rough']),                        //  8 stops, 1 mild hazard
    pathB: inter(11, [5,'rough'],   [9,'sand']),          // 11 stops, 2 hazards
    pathC: inter(7,  [1,'water'],   [4,'trees']) },       //  7 stops, 2 hazards
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

  const labels: Record<string, string> = { A: 'Route A', B: 'Route B', C: 'Route C' };
  const hazards = fairway.filter((t) => HAZARD_TYPES.has(t));
  const hazardDesc = hazards.length === 0
    ? 'Clear fairway — no hazards'
    : hazards.map((h) => describeHazard(h)).join(', ');

  // Include stop count so players can compare path lengths in the dialog
  const stopCount = fairway.length;
  const description = `${stopCount} stop${stopCount !== 1 ? 's' : ''} · ${hazardDesc}`;

  return { id, label: labels[id], description, pegholes };
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
