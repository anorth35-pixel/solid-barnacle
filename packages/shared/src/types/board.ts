export type PegholeType =
  | 'tee'
  | 'fairway'
  | 'rough'
  | 'trees'
  | 'sand'
  | 'water'
  | 'out-of-bounds'
  | 'green'
  | 'three-putt'
  | 'cup';

export interface Peghole {
  id: string;
  holeNumber: number;
  pathId: string;       // 'A' | 'B' | 'C'
  index: number;        // position within path (0 = tee)
  type: PegholeType;
  isPar: boolean;
  x: number;
  y: number;
}

export interface GolfPath {
  id: string;           // 'A' | 'B' | 'C'
  label: string;        // 'Safe' | 'Moderate' | 'Risky'
  description: string;
  pegholes: Peghole[];  // ordered tee → cup
}

export interface GolfHole {
  number: number;       // 1–18
  par: number;          // 3 | 4 | 5
  paths: GolfPath[];    // exactly 3 paths (A, B, C)
  handicap: number;     // 1–18 difficulty rank
  threeHoleGreen?: boolean; // green has a three-putt peghole
}

export interface Course {
  name: string;
  holes: GolfHole[];
  totalPar: number;
  frontNinePar: number;
  backNinePar: number;
}

export interface HazardResult {
  penaltyStrokes: number;
  retreatToIndex: number | null;  // null means stay
  advanceBonus: number;           // extra pegholes to advance (dice outcome: advance3 = +2 net)
  description: string;
  diceRoll?: [number, number];    // for sand/rough/three-putt dice mechanics
  diceOutcome?: 'advance1' | 'stay-penalty' | 'advance3-strokeoff';
}

export interface PegMovement {
  playerId: string;
  fromHole: number;
  fromPegholeIndex: number;
  fromPathId: string;
  toHole: number;
  toPegholeIndex: number;
  toPathId: string;
  pointsUsed: number;
  hazardsHit: Array<{ peghole: Peghole; result: HazardResult }>;
  holesCompleted: number[];
}
