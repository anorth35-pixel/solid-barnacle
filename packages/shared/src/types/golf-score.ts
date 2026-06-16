import type { PegholeType } from './board.js';

export interface HoleScore {
  holeNumber: number;
  par: number;
  strokes: number;          // total cribbage points spent on the hole (including penalty strokes)
  relativeToPar: number;    // strokes - par (negative = under par)
  penaltyStrokes: number;   // strokes added by hazard penalties only
  hazardTypes: PegholeType[];
  isBirdie: boolean;        // completed hole from tee in one scoring action, 0 penalty
  isEagle: boolean;         // birdie + landed exactly on cup (no leftover advance)
  isDoubleEagle: boolean;   // eagled current hole AND landed exactly on next hole's cup
  startedFromTee: boolean;  // whether peg was at tee (index 0) when scoring action began
}

export interface PlayerGolfScore {
  playerId: string;
  holeScores: HoleScore[];
  currentHole: number;
  currentPegholeIndex: number;
  currentPathId: string;                 // path currently being traversed ('A'|'B'|'C')
  currentHoleStrokes: number;
  totalStrokes: number;
  totalRelativeToPar: number;
  holesCompleted: number;
  isFinished: boolean;
  selectedPaths: Record<number, string>; // holeNumber → pathId
  pendingPathChoiceHole: number | null;  // hole number needing a path selection
}

export function getGolfTermForScore(relativeToPar: number): string {
  if (relativeToPar <= -3) return 'Albatross';
  if (relativeToPar === -2) return 'Eagle';
  if (relativeToPar === -1) return 'Birdie';
  if (relativeToPar === 0) return 'Par';
  if (relativeToPar === 1) return 'Bogey';
  if (relativeToPar === 2) return 'Double Bogey';
  if (relativeToPar === 3) return 'Triple Bogey';
  return `+${relativeToPar}`;
}

export function createInitialGolfScore(playerId: string): PlayerGolfScore {
  return {
    playerId,
    holeScores: [],
    currentHole: 1,
    currentPegholeIndex: 0,
    currentPathId: 'A',
    currentHoleStrokes: 0,
    totalStrokes: 0,
    totalRelativeToPar: 0,
    holesCompleted: 0,
    isFinished: false,
    selectedPaths: { 1: 'A' },
    pendingPathChoiceHole: 1,  // show path dialog for hole 1 just like subsequent holes
  };
}

// Penalty strokes added for each hole not completed at game end (per the rules table)
export function holesNotCompletedPenalty(holesNotCompleted: number): number {
  // Each unfinished hole is scored as double bogey (+2), which is a reasonable
  // penalty for not reaching the cup. This approximates the official penalty table.
  return holesNotCompleted * 2;
}
