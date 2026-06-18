import { create } from 'zustand';
import type { GameState, PlayerSeat, RoomSummary, ScoreBreakdown, PegMovement } from '@cribbgolf/shared';
import type { Card, PlayerGolfScore } from '@cribbgolf/shared';

export interface PendingDeclaration {
  seat: PlayerSeat;
  phase: 'hand' | 'crib';
  hand: Card[];
  starterCard: Card;
  isCrib: boolean;
}

export interface Toast {
  id: string;
  type: 'hazard' | 'hole-complete' | 'birdie' | 'eagle' | 'info';
  message: string;
  sub?: string;
}

export interface GameStore {
  socketId: string;
  mySeat: PlayerSeat | null;
  myHand: Card[];
  pendingPathChoice: { holeNumber: number } | null;

  room: RoomSummary | null;
  roomCode: string | null;

  gameState: GameState | null;
  lastBreakdowns: ScoreBreakdown[];
  lastPegMovements: PegMovement[];
  currentScoringBreakdown: ScoreBreakdown | null;
  currentScoringHand: { handCards: Card[]; starterCard: Card | null; isCrib: boolean } | null;
  pendingGolfScores: PlayerGolfScore[] | null;

  pendingDeclaration: PendingDeclaration | null;
  mugginsWindow: { missedItems: any[]; windowCloseAt: number; scoringPlayerId: string } | null;
  disconnectedSeats: number[];
  toasts: Toast[];
  error: string | null;

  setSocketId: (id: string) => void;
  setMySeat: (seat: PlayerSeat) => void;
  setMyHand: (hand: Card[]) => void;
  setPendingPathChoice: (choice: { holeNumber: number } | null) => void;
  setRoom: (room: RoomSummary, code?: string) => void;
  setGameState: (state: GameState) => void;
  patchGameState: (patch: Partial<GameState>) => void;
  addBreakdown: (bd: ScoreBreakdown) => void;
  addPegMovements: (movements: PegMovement[]) => void;
  setCurrentScoringBreakdown: (bd: ScoreBreakdown | null) => void;
  setCurrentScoringHand: (hand: { handCards: Card[]; starterCard: Card | null; isCrib: boolean } | null) => void;
  setPendingGolfScores: (scores: PlayerGolfScore[] | null) => void;
  commitPendingGolfScores: () => void;
  setPendingDeclaration: (d: PendingDeclaration | null) => void;
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
  pendingPathChoice: null,
  pendingDeclaration: null,
  room: null,
  roomCode: null,
  gameState: null,
  lastBreakdowns: [],
  lastPegMovements: [],
  currentScoringBreakdown: null,
  currentScoringHand: null,
  pendingGolfScores: null,
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
  setPendingPathChoice: (choice) => set({ pendingPathChoice: choice }),
  setRoom: (room, code) => set({ room, roomCode: code ?? room.code }),
  setGameState: (state) => {
    set({ gameState: state, lastBreakdowns: [] });
    const mySeat = get().mySeat;
    if (mySeat !== null && (state as any).golfScores?.[mySeat]) {
      const myGs = (state as any).golfScores[mySeat];
      if (myGs.pendingPathChoiceHole != null) {
        set({ pendingPathChoice: { holeNumber: myGs.pendingPathChoiceHole } });
      }
    }
  },

  patchGameState: (patch) => {
    const current = get().gameState;
    if (!current) return;
    const next = { ...current, ...patch };
    set({ gameState: next });
    // Auto-set pendingPathChoice if the server flagged one for this player
    const mySeat = get().mySeat;
    if (mySeat !== null && next.golfScores?.[mySeat]) {
      const myGs = next.golfScores[mySeat] as any;
      if (myGs.pendingPathChoiceHole !== null && myGs.pendingPathChoiceHole !== undefined) {
        if (get().pendingPathChoice?.holeNumber !== myGs.pendingPathChoiceHole) {
          set({ pendingPathChoice: { holeNumber: myGs.pendingPathChoiceHole } });
        }
      }
    }
  },

  addBreakdown: (bd) => set((s) => ({
    lastBreakdowns: [...s.lastBreakdowns.slice(-4), bd],
  })),

  addPegMovements: (movements) => set({ lastPegMovements: movements }),

  setCurrentScoringBreakdown: (bd) => set({ currentScoringBreakdown: bd }),
  setCurrentScoringHand: (hand) => set({ currentScoringHand: hand }),

  setPendingGolfScores: (scores) => set({ pendingGolfScores: scores }),

  commitPendingGolfScores: () => {
    const { gameState, pendingGolfScores } = get();
    if (!gameState || !pendingGolfScores) return;
    set({
      gameState: { ...gameState, golfScores: pendingGolfScores },
      pendingGolfScores: null,
    });
  },

  setPendingDeclaration: (d) => set({ pendingDeclaration: d }),
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
