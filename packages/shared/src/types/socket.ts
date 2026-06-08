import type { Card } from './card.js';
import type { PlayerSeat } from './player.js';
import type { GameState, GameConfig, GamePhase } from './game.js';
import type { ScoreBreakdown, ScoreItem, ScoreEvent } from './scoring.js';
import type { Peghole, HazardResult, PegMovement } from './board.js';
import type { PlayerGolfScore, HoleScore } from './golf-score.js';

// ── Client → Server ──────────────────────────────────────────────────────────

export interface C2S_RoomCreate { playerName: string; config: Partial<GameConfig> }
export interface C2S_RoomJoin { roomCode: string; playerName: string }
export interface C2S_RoomReady { ready: boolean }
export interface C2S_GameDiscard { cardIds: string[] }
export interface C2S_GameCut { position: number }
export interface C2S_GamePeg { cardId: string }
export interface C2S_GameMuggins { claimedItems: ScoreItem[] }
export interface C2S_ChatMessage { text: string }

// ── Server → Client ──────────────────────────────────────────────────────────

export interface RoomSummary {
  code: string;
  players: Array<{ name: string; seat: PlayerSeat; ready: boolean; isHost: boolean }>;
  config: GameConfig;
  state: 'waiting' | 'in-game' | 'finished';
}

export interface S2C_RoomCreated { roomCode: string; room: RoomSummary }
export interface S2C_RoomJoined { room: RoomSummary; yourSeat: PlayerSeat }
export interface S2C_RoomUpdated { room: RoomSummary }
export interface S2C_RoomError { code: string; message: string }

export interface S2C_GameState { state: GameState }
export interface S2C_GamePhaseChange { phase: GamePhase; state: GameState }
export interface S2C_GameDealt { yourHand: Card[]; dealerSeat: PlayerSeat }
export interface S2C_GameDiscardDone { seat: PlayerSeat }
export interface S2C_GameStarter { card: Card; nibsEvent?: ScoreEvent }

export interface S2C_CardPlayed {
  seat: PlayerSeat;
  card: Card;
  runningCount: number;
  scoreEvents: ScoreEvent[];
  pegMovements: PegMovement[];
}
export interface S2C_GoCall { seat: PlayerSeat }
export interface S2C_CountReset { lastSeat: PlayerSeat; lastCardEvent?: ScoreEvent }

export interface S2C_HandScore { seat: PlayerSeat; breakdown: ScoreBreakdown; pegMovements: PegMovement[] }
export interface S2C_CribScore { seat: PlayerSeat; breakdown: ScoreBreakdown; pegMovements: PegMovement[] }

export interface S2C_MugginsWindow { scoringPlayerId: string; missedItems: ScoreItem[]; windowCloseAt: number }
export interface S2C_MugginsClaimed { claimerSeat: PlayerSeat; items: ScoreItem[]; pegMovements: PegMovement[] }

export interface S2C_PegMoved { movements: PegMovement[] }
export interface S2C_HoleCompleted { seat: PlayerSeat; holeScore: HoleScore }
export interface S2C_HazardHit { seat: PlayerSeat; peghole: Peghole; result: HazardResult }
export interface S2C_CourseState { golfScores: PlayerGolfScore[] }

export interface S2C_GameOver { winnerSeat: PlayerSeat; finalGolfScores: PlayerGolfScore[] }
export interface S2C_PlayerDisconnected { seat: PlayerSeat; waitingMs: number }
export interface S2C_PlayerReconnected { seat: PlayerSeat }
export interface S2C_GameError { code: string; message: string }
