import type { Card } from './card.js';
import type { Player, PlayerSeat } from './player.js';
import type { ScoreEvent, MugginsState } from './scoring.js';
import type { Course, PegMovement } from './board.js';
import type { PlayerGolfScore } from './golf-score.js';
import type { StakesConfig, StakesState } from './stakes.js';

export type GamePhase =
  | 'lobby'
  | 'dealing'
  | 'discarding'
  | 'cutting'
  | 'pegging'
  | 'hand-scoring'
  | 'crib-scoring'
  | 'round-end'
  | 'board-play'
  | 'game-over';

export type GameMode = 'local-2p' | 'vs-ai' | 'remote' | 'board-only';
export type AIDifficulty = 'easy' | 'medium' | 'hard';

export interface GameConfig {
  mode: GameMode;
  playerCount: 2 | 3;
  roomCode?: string;
  mugginsEnabled: boolean;
  mugginsWindowMs: number;
  aiDifficulty?: AIDifficulty;
  manualScoring: boolean;
  stakesConfig?: StakesConfig;
  matchPlay: boolean;
}

export interface PeggingState {
  playStack: Card[];
  runningCount: number;
  lastPlayerToPlay: PlayerSeat | null;
  goCalledBy: PlayerSeat[];
  subRoundsComplete: number;
}

export interface MatchHoleResult {
  holeNumber: number;
  winnerPlayerId: string | null; // null = halved
  p0Strokes: number;
  p1Strokes: number;
}

export interface MatchScore {
  holeResults: MatchHoleResult[]; // holes where BOTH players have a completed HoleScore
  standing: number;               // positive = seat-0 player leads, negative = seat-1 leads
  isDecided: boolean;
  winnerId: string | null;
}

export interface GameState {
  id: string;
  config: GameConfig;
  phase: GamePhase;
  players: Player[];
  deck: Card[];
  crib: Card[];
  starterCard: Card | null;
  dealerSeat: PlayerSeat;
  activePlayerSeat: PlayerSeat | null;
  pegging: PeggingState;
  roundNumber: number;
  muggins: MugginsState | null;
  winner: PlayerSeat | null;
  lastScoreEvents: ScoreEvent[];
  golfScores: PlayerGolfScore[];
  course: Course;
  pendingPegMovements: PegMovement[];
  stakesState: StakesState;
  finishingBonusAwardedTo: string | null; // playerId who got the −2 finishing bonus
  matchScore: MatchScore | null;
}
