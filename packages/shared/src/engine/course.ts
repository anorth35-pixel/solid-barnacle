import type { Course, GolfHole, GolfPath, Peghole, PegholeType } from '../types/board.js';

// Course: 18 holes, par 3/4/5 (used for scoring only).
// Each hole has 3 paths with different hazard profiles.
// ALL paths have at least one hazard — the strategic choice is which
// hazards to face, not whether to face any.
// Path lengths may be equal, two equal, or all different — no rule.

// ── Helpers ───────────────────────────────────────────────────────────────────

// Build intermediate array: (count-1) fairways + green at end; overwrite with hazards.
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
  pathLR: PegholeType[];
  pathS: PegholeType[];
  pathRL: PegholeType[];
}

const HOLE_DEFS: HoleDef[] = [
  // ── Front Nine ──────────────────────────────────────────────────────────────

  // 1 — par 4, hcp 7
  { par: 4, handicap: 7,
    pathLR: inter(9,  [2,'rough'],   [6,'rough']),       //  9 stops: 2 mild
    pathS: inter(7,  [0,'sand'],    [5,'water']),        //  7 stops: sand then water
    pathRL: inter(11, [4,'trees'],   [8,'sand']) },       // 11 stops: trees then sand

  // 2 — par 5, hcp 11
  { par: 5, handicap: 11,
    pathLR: inter(17, [3,'rough'],   [9,'sand'],  [14,'rough']),  // 17: 2 mild + sand
    pathS: inter(14, [1,'water'],   [7,'trees'], [11,'sand']),   // 14: water + trees + sand
    pathRL: inter(20, [6,'rough'],   [12,'rough'],[16,'sand']) }, // 20: long, 3 hazards

  // 3 — par 3, hcp 17
  { par: 3, handicap: 17,
    pathLR: inter(4,  [1,'rough']),                      //  4 stops: mild mid
    pathS: inter(3,  [0,'sand']),                        //  3 stops: sand at start
    pathRL: inter(5,  [2,'water']) },                     //  5 stops: water mid

  // 4 — par 4, hcp 3
  { par: 4, handicap: 3,
    pathLR: inter(8,  [1,'water'],   [5,'sand']),         //  8: water then sand
    pathS: inter(10, [3,'rough'],   [7,'rough']),        // 10: 2 mild
    pathRL: inter(7,  [0,'rough'],   [4,'trees']) },      //  7: rough then trees

  // 5 — par 4, hcp 1
  { par: 4, handicap: 1,
    pathLR: inter(11, [5,'rough'],   [9,'rough']),        // 11: 2 mild (long grind)
    pathS: inter(9,  [2,'sand'],    [6,'water']),        //  9: sand then water
    pathRL: inter(7,  [0,'trees'],   [4,'water']) },      //  7: trees then water

  // 6 — par 5, hcp 13
  { par: 5, handicap: 13,
    pathLR: inter(20, [7,'trees'],   [13,'rough'],[17,'sand']),   // 20: long, 3 hazards
    pathS: inter(14, [2,'sand'],    [7,'water'], [11,'trees']),  // 14: moderate mix
    pathRL: inter(17, [4,'rough'],   [9,'sand'],  [14,'rough']) }, // 17: 3 mild-moderate

  // 7 — par 3, hcp 15
  { par: 3, handicap: 15,
    pathLR: inter(5,  [0,'rough'],   [3,'rough']), //  5: 2 mild
    pathS: inter(4,  [1,'water']),               //  4: water mid
    pathRL: inter(3,  [0,'trees']) },             //  3: trees at start

  // 8 — par 4, hcp 5
  { par: 4, handicap: 5,
    pathLR: inter(10, [3,'sand'],    [7,'trees']),        // 10: sand then trees
    pathS: inter(7,  [0,'water'],   [5,'rough']),        //  7: water start, rough
    pathRL: inter(9,  [1,'rough'],   [4,'sand'],  [7,'rough']) }, //  9: 3 hazards

  // 9 — par 4, hcp 9
  { par: 4, handicap: 9,
    pathLR: inter(8,  [0,'trees'],   [5,'rough']),        //  8: trees then rough
    pathS: inter(11, [2,'rough'],   [6,'sand'],  [9,'rough']),  // 11: 3 hazards
    pathRL: inter(7,  [1,'water'],   [4,'sand']) },       //  7: water then sand

  // ── Back Nine ───────────────────────────────────────────────────────────────

  // 10 — par 4, hcp 10
  { par: 4, handicap: 10,
    pathLR: inter(9,  [1,'rough'],   [7,'sand']),         //  9: mild then sand
    pathS: inter(7,  [0,'water'],   [3,'trees']),        //  7: water then trees
    pathRL: inter(11, [4,'sand'],    [8,'rough'],  [10,'rough']) }, // 11: 3 hazards

  // 11 — par 5, hcp 14
  { par: 5, handicap: 14,
    pathLR: inter(14, [1,'water'],   [6,'sand'],  [10,'rough']),  // 14: severe start mix
    pathS: inter(20, [4,'rough'],   [10,'trees'],[15,'sand'],[18,'rough']), // 20: long 4 hazards
    pathRL: inter(17, [2,'sand'],    [8,'water'], [13,'trees']) }, // 17: moderate mix

  // 12 — par 3, hcp 18
  { par: 3, handicap: 18,
    pathLR: inter(4,  [2,'sand']),                        //  4: sand near end
    pathS: inter(5,  [0,'rough'],   [4,'rough']),        //  5: 2 mild
    pathRL: inter(3,  [0,'out-of-bounds']) },             //  3: OOB at start (risky!)

  // 13 — par 4, hcp 4
  { par: 4, handicap: 4,
    pathLR: inter(10, [2,'trees'],   [6,'rough']),        // 10: trees then rough
    pathS: inter(8,  [0,'sand'],    [5,'water']),        //  8: sand then water
    pathRL: inter(7,  [1,'rough'],   [4,'trees'],  [6,'sand']) }, //  7: 3 hazards

  // 14 — par 4, hcp 2
  { par: 4, handicap: 2,
    pathLR: inter(7,  [0,'out-of-bounds']),               //  7: OOB right at start
    pathS: inter(9,  [3,'water'],   [7,'rough']),        //  9: water then rough
    pathRL: inter(11, [2,'rough'],   [6,'sand'],  [9,'trees']) }, // 11: 3 hazards

  // 15 — par 5, hcp 12
  { par: 5, handicap: 12,
    pathLR: inter(17, [5,'rough'],   [10,'water'],[14,'rough']),  // 17: water mid
    pathS: inter(14, [0,'rough'],   [5,'trees'], [10,'sand']),   // 14: 3 moderate
    pathRL: inter(20, [3,'sand'],    [8,'rough'], [13,'water'],[17,'rough']) }, // 20: 4 hazards

  // 16 — par 3, hcp 16
  { par: 3, handicap: 16,
    pathLR: inter(3,  [1,'water']),                       //  3: water mid
    pathS: inter(4,  [0,'rough'],   [2,'trees']),        //  4: rough then trees
    pathRL: inter(5,  [1,'sand'],    [3,'water']) },      //  5: sand then water

  // 17 — par 4, hcp 6
  { par: 4, handicap: 6,
    pathLR: inter(8,  [2,'sand'],    [6,'water']),        //  8: sand then water
    pathS: inter(7,  [0,'trees'],   [4,'rough']),        //  7: trees then rough
    pathRL: inter(11, [5,'rough'],   [8,'sand'],  [10,'rough']) }, // 11: long 3 hazards

  // 18 — par 4, hcp 8
  { par: 4, handicap: 8,
    pathLR: inter(9,  [0,'rough'],   [5,'water']),        //  9: rough start, water mid
    pathS: inter(11, [3,'sand'],    [7,'rough'],  [9,'trees']), // 11: 3 hazards
    pathRL: inter(7,  [1,'trees'],   [4,'sand']) },       //  7: trees then sand
];

// ── Build functions ───────────────────────────────────────────────────────────

const HAZARD_TYPES: ReadonlySet<string> = new Set([
  'rough', 'trees', 'sand', 'water', 'out-of-bounds',
]);

const PATH_LABELS: Record<string, string> = {
  LR: 'Left-Right (LR)',
  S:  'Straight (S)',
  RL: 'Right-Left (RL)',
};

function buildPath(id: 'LR' | 'S' | 'RL', fairway: PegholeType[], holeNumber: number): GolfPath {
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

  const hazards = fairway.filter(t => HAZARD_TYPES.has(t));
  const hazardDesc = hazards.map(h => describeHazard(h)).join(', ');
  const stopCount = fairway.length;
  const description = `${stopCount} stop${stopCount !== 1 ? 's' : ''} · ${hazardDesc}`;

  return { id, label: PATH_LABELS[id], description, pegholes };
}

function describeHazard(type: PegholeType): string {
  const map: Partial<Record<PegholeType, string>> = {
    rough: 'rough (+1)',
    trees: 'trees (+1)',
    sand: 'sand (+1)',
    water: 'water (+2)',
    'out-of-bounds': 'OOB (+2, return to tee)',
  };
  return map[type] ?? type;
}

function buildHole(def: HoleDef, number: number): GolfHole {
  return {
    number,
    par: def.par,
    handicap: def.handicap,
    paths: [
      buildPath('LR', def.pathLR, number),
      buildPath('S',  def.pathS,  number),
      buildPath('RL', def.pathRL, number),
    ],
  };
}

function buildCourse(): Course {
  const holes = HOLE_DEFS.map((def, i) => buildHole(def, i + 1));
  const frontNinePar = holes.slice(0, 9).reduce((s, h) => s + h.par, 0);
  const backNinePar  = holes.slice(9).reduce((s, h)  => s + h.par, 0);
  return {
    name: 'CribbGolf Country Club',
    holes,
    totalPar: frontNinePar + backNinePar,
    frontNinePar,
    backNinePar,
  };
}

export const DEFAULT_COURSE: Course = buildCourse();

export function getPlayerPath(hole: GolfHole, selectedPaths: Record<number, string>): GolfPath {
  const id = selectedPaths[hole.number] ?? 'LR';
  return hole.paths.find(p => p.id === id) ?? hole.paths[0];
}
