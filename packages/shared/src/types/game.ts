import type { Card } from './card.js';
import type { Player, PlayerSeat } from './player.js';
import type { ScoreEvent, MugginsState } from './scoring.js';
import type { Course, PegMovement } from './board.js';
import type { PlayerGolfScore } from './golf-score.js';

export type GamePhase =
  | 'lobby'
  | 'dealing'
  | 'discarding'
  | 'cutting'
  | 'pegging'
  | 'hand-scoring'
  | 'crib-scoring'
  | 'round-end'
  | 'game-over';

export type GameMode = 'local-2p' | 'vs-ai' | 'remote';
export type AIDifficulty = 'easy' | 'medium' | 'hard';

export interface GameConfig {
  mode: GameMode;
  playerCount: 2 | 3;
  roomCode?: string;
  mugginsEnabled: boolean;
  mugginsWindowMs: number;
  aiDifficulty?: AIDifficulty;
}

export interface PeggingState {
  playStack: Card[];
  runningCount: number;
  lastPlayerToPlay: PlayerSeat | null;
  goCalledBy: PlayerSeat[];
  subRoundsComplete: number;
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
}
