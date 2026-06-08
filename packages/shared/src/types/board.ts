export type PegholeType =
  | 'tee'
  | 'fairway'
  | 'rough'
  | 'trees'
  | 'sand'
  | 'water'
  | 'out-of-bounds'
  | 'green'
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
  description: string;
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
