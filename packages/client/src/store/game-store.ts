import { create } from 'zustand';
import type { GameState, PlayerSeat, RoomSummary, ScoreBreakdown, PegMovement } from '@cribbgolf/shared';
import type { Card, PlayerGolfScore } from '@cribbgolf/shared';

export interface Toast {
  id: string;
  type: 'hazard' | 'hole-complete' | 'info';
  message: string;
  sub?: string;
}

export interface GameStore {
  socketId: string;
  mySeat: PlayerSeat | null;
  myHand: Card[];

  room: RoomSummary | null;
  roomCode: string | null;

  gameState: GameState | null;
  lastBreakdowns: ScoreBreakdown[];
  lastPegMovements: PegMovement[];

  mugginsWindow: { missedItems: any[]; windowCloseAt: number; scoringPlayerId: string } | null;
  disconnectedSeats: number[];
  toasts: Toast[];
  error: string | null;

  setSocketId: (id: string) => void;
  setMySeat: (seat: PlayerSeat) => void;
  setMyHand: (hand: Card[]) => void;
  setRoom: (room: RoomSummary, code?: string) => void;
  setGameState: (state: GameState) => void;
  patchGameState: (patch: Partial<GameState>) => void;
  addBreakdown: (bd: ScoreBreakdown) => void;
  addPegMovements: (movements: PegMovement[]) => void;
  openMuggins: (data: { missedItems: any[]; windowCloseAt: number; scoringPlayerId: string }) => void;
  closeMuggins: () => void;
  setDisconnectedSeats: (seats: number[]) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
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
  lastPegMovements: [],
  mugginsWindow: null,
  disconnectedSeats: [],
  toasts: [],
  error: null,
};

export const useGameStore = create<GameStore>((set, get) => ({
  ...initialState,

  setSocketId: (id) => set({ socketId: id }),
  setMySeat: (seat) => set({ mySeat: seat }),
  setMyHand: (hand) => set({ myHand: hand }),
  setRoom: (room, code) => set({ room, roomCode: code ?? room.code }),
  setGameState: (state) => set({ gameState: state, lastBreakdowns: [] }),

  patchGameState: (patch) => {
    const current = get().gameState;
    if (!current) return;
    set({ gameState: { ...current, ...patch } });
  },

  addBreakdown: (bd) => set((s) => ({
    lastBreakdowns: [...s.lastBreakdowns.slice(-4), bd],
  })),

  addPegMovements: (movements) => set({ lastPegMovements: movements }),

  openMuggins: (data) => set({ mugginsWindow: data }),
  closeMuggins: () => set({ mugginsWindow: null }),

  setDisconnectedSeats: (seats) => set({ disconnectedSeats: seats }),

  addToast: (toast) => {
    const id = `${Date.now()}-${Math.random()}`;
    set((s) => ({ toasts: [...s.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3500);
  },

  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  setError: (err) => set({ error: err }),
  reset: () => set(initialState),
}));
