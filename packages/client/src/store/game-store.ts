import { create } from 'zustand';
import type { GameState, PlayerSeat, RoomSummary, ScoreBreakdown, HoleScore, PegMovement } from '@cribbgolf/shared';
import type { Card } from '@cribbgolf/shared';

export interface GameStore {
  // Connection
  socketId: string;
  mySeat: PlayerSeat | null;
  myHand: Card[];

  // Room
  room: RoomSummary | null;
  roomCode: string | null;

  // Game
  gameState: GameState | null;
  lastBreakdowns: ScoreBreakdown[];
  pendingHoleScores: HoleScore[];
  lastPegMovements: PegMovement[];

  // Muggins
  mugginsWindow: { missedItems: any[]; windowCloseAt: number; scoringPlayerId: string } | null;

  // Error / status
  error: string | null;

  // Actions
  setSocketId: (id: string) => void;  // empty string = disconnected
  setMySeat: (seat: PlayerSeat) => void;
  setMyHand: (hand: Card[]) => void;
  setRoom: (room: RoomSummary, code?: string) => void;
  setGameState: (state: GameState) => void;
  addBreakdown: (bd: ScoreBreakdown) => void;
  addHoleScore: (hs: HoleScore) => void;
  addPegMovements: (movements: PegMovement[]) => void;
  openMuggins: (data: { missedItems: any[]; windowCloseAt: number; scoringPlayerId: string }) => void;
  closeMuggins: () => void;
  setError: (err: string | null) => void;
  reset: () => void;
}

const initialState = {
  socketId: '',
  mySeat: null,
  myHand: [],
  room: null,
  roomCode: null,
  gameState: null,
  lastBreakdowns: [],
  pendingHoleScores: [],
  lastPegMovements: [],
  mugginsWindow: null,
  error: null,
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setSocketId: (id) => set({ socketId: id }),
  setMySeat: (seat) => set({ mySeat: seat }),
  setMyHand: (hand) => set({ myHand: hand }),
  setRoom: (room, code) => set({ room, roomCode: code ?? room.code }),
  setGameState: (state) => set({ gameState: state }),
  addBreakdown: (bd) => set((s) => ({ lastBreakdowns: [...s.lastBreakdowns.slice(-4), bd] })),
  addHoleScore: (hs) => set((s) => ({ pendingHoleScores: [...s.pendingHoleScores, hs] })),
  addPegMovements: (movements) => set({ lastPegMovements: movements }),
  openMuggins: (data) => set({ mugginsWindow: data }),
  closeMuggins: () => set({ mugginsWindow: null }),
  setError: (err) => set({ error: err }),
  reset: () => set(initialState),
}));
