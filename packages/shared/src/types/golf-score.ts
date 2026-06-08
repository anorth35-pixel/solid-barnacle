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
  currentHole: number;       // 1–18
  currentPegholeIndex: number;
  totalStrokes: number;
  totalRelativeToPar: number;
  holesCompleted: number;
  isFinished: boolean;
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
    totalStrokes: 0,
    totalRelativeToPar: 0,
    holesCompleted: 0,
    isFinished: false,
  };
}
