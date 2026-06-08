import type { Card } from './card.js';

export type ScoreReason =
  | 'fifteen'
  | 'pair'
  | 'three-of-a-kind'
  | 'four-of-a-kind'
  | 'run'
  | 'flush'
  | 'nobs'
  | 'nibs'
  | 'go'
  | 'thirty-one'
  | 'last-card'
  | 'pegging-pair'
  | 'pegging-run'
  | 'pegging-fifteen';

export interface ScoreItem {
  reason: ScoreReason;
  cards: Card[];
  points: number;
  description: string;
}

export interface ScoreBreakdown {
  playerId: string;
  phase: 'pegging' | 'hand' | 'crib';
  items: ScoreItem[];
  total: number;
  missedItems?: ScoreItem[];
}

export interface ScoreEvent {
  playerId: string;
  points: number;
  reason: ScoreReason;
  breakdown: ScoreBreakdown;
  wonGame: boolean;
}

export interface MugginsState {
  scoringPlayerId: string;
  missedBreakdown: ScoreItem[];
  claimerPlayerId: string | null;
  windowOpenAt: number;
  windowCloseAt: number;
  claimed: boolean;
}
