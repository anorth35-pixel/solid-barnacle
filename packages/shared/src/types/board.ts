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
  holeNumber: number;   // 1–18
  index: number;        // position within hole (0 = tee)
  type: PegholeType;
  isPar: boolean;       // counts toward standard par route
  x: number;           // SVG coordinate
  y: number;
}

export interface GolfHole {
  number: number;       // 1–18
  par: number;          // 3, 4, or 5
  pegholes: Peghole[];  // ordered tee → cup
  totalPegholes: number;
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
  toHole: number;
  toPegholeIndex: number;
  pointsUsed: number;
  hazardsHit: Array<{ peghole: Peghole; result: HazardResult }>;
  holesCompleted: number[];
}
