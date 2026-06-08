import type { PegholeType } from './board.js';

export interface HoleScore {
  holeNumber: number;
  par: number;
  strokes: number;
  relativeToPar: number;
  hazardPenalties: number;
  hazardTypes: PegholeType[];
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
    pendingPathChoiceHole: null,
  };
}

// Penalty strokes added for each hole not completed at game end (per the rules table)
export function holesNotCompletedPenalty(holesNotCompleted: number): number {
  // Each unfinished hole is scored as double bogey (+2), which is a reasonable
  // penalty for not reaching the cup. This approximates the official penalty table.
  return holesNotCompleted * 2;
}
