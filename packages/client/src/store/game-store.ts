import { create } from 'zustand';
import type { GameState, PlayerSeat, RoomSummary, ScoreBreakdown, PegMovement } from '@cribbgolf/shared';
import type { Card, PlayerGolfScore } from '@cribbgolf/shared';
import { getGolfTermForScore } from '@cribbgolf/shared';

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

export interface HazardPopupData {
  hazardType: string;
  penaltyStrokes: number;
  diceRoll?: [number, number];
  diceOutcome?: 'advance1' | 'advance2-doubles' | 'fail-penalty';
  description: string;
}

export interface HolePopupData {
  holeNumber: number;
  par: number;
  strokes: number;
  relativeToPar: number;
  term: string;
  emoji: string;
}

export interface ScoringQueueItem {
  breakdown: ScoreBreakdown;
  golfScores: PlayerGolfScore[];
  pegMovements: PegMovement[];
  hand: Card[];
  starterCard: Card | null;
  isCrib: boolean;
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
  scoringQueue: ScoringQueueItem[];

  pendingDeclaration: PendingDeclaration | null;
  mugginsWindow: { missedItems: any[]; windowCloseAt: number; scoringPlayerId: string } | null;
  disconnectedSeats: number[];
  toasts: Toast[];
  pendingHazardPopup: HazardPopupData | null;
  pendingHolePopup: HolePopupData | null;
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
  updateQueuedGolfScores: (golfScores: PlayerGolfScore[]) => void;
  enqueueScoring: (item: ScoringQueueItem) => void;
  advanceScoringQueue: () => void;
  setPendingDeclaration: (d: PendingDeclaration | null) => void;
  openMuggins: (data: { missedItems: any[]; windowCloseAt: number; scoringPlayerId: string }) => void;
  closeMuggins: () => void;
  setDisconnectedSeats: (seats: number[]) => void;
  addToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
  setPendingHazardPopup: (data: HazardPopupData | null) => void;
  setPendingHolePopup: (data: HolePopupData | null) => void;
  triggerMovementAlerts: (movements: any[]) => void;
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
  scoringQueue: [],
  mugginsWindow: null,
  disconnectedSeats: [],
  pendingHazardPopup: null,
  pendingHolePopup: null,
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
    set({
      gameState: state,
      lastBreakdowns: [],
      scoringQueue: [],
      currentScoringBreakdown: null,
      currentScoringHand: null,
      pendingGolfScores: null,
      pendingPathChoice: null,
    });
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

  // Propagate fresh golfScores to all queued scoring items so stale snapshots
  // don't show a path-choice prompt that the server already cleared.
  updateQueuedGolfScores: (golfScores) => set((s) => ({
    scoringQueue: s.scoringQueue.map((item) => ({ ...item, golfScores })),
  })),

  enqueueScoring: (item) => {
    if (!get().currentScoringBreakdown) {
      // Nothing showing — display immediately; dismiss any hazard/hole popups so they don't block
      set({
        currentScoringBreakdown: item.breakdown,
        currentScoringHand: { handCards: item.hand, starterCard: item.starterCard, isCrib: item.isCrib },
        pendingGolfScores: item.golfScores.length > 0 ? item.golfScores : null,
        lastPegMovements: item.pegMovements,
        pendingHazardPopup: null,
        pendingHolePopup: null,
      });
    } else {
      set((s) => ({ scoringQueue: [...s.scoringQueue, item] }));
    }
  },

  advanceScoringQueue: () => {
    const { scoringQueue } = get();
    if (scoringQueue.length === 0) {
      set({ currentScoringBreakdown: null, currentScoringHand: null });
      return;
    }
    const [next, ...rest] = scoringQueue;
    // Dismiss hazard/hole popups when advancing to next scoring event
    set({
      scoringQueue: rest,
      currentScoringBreakdown: next.breakdown,
      currentScoringHand: { handCards: next.hand, starterCard: next.starterCard, isCrib: next.isCrib },
      pendingGolfScores: next.golfScores.length > 0 ? next.golfScores : null,
      lastPegMovements: next.pegMovements,
      pendingHazardPopup: null,
      pendingHolePopup: null,
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

  setPendingHazardPopup: (data) => set({ pendingHazardPopup: data }),
  setPendingHolePopup: (data) => set({ pendingHolePopup: data }),

  triggerMovementAlerts: (movements) => {
    const { mySeat, gameState } = get();
    if (mySeat === null || !gameState) return;
    const myId = gameState.players[mySeat]?.id;
    if (!myId) return;

    for (const m of movements) {
      if (m.playerId !== myId) continue;

      // Show popup for first hazard hit
      const hazards: any[] = m.hazardsHit ?? [];
      for (const h of hazards) {
        const type = h.peghole?.type;
        if (!type || ['fairway', 'green', 'cup', 'tee'].includes(type)) continue;
        set({
          pendingHazardPopup: {
            hazardType: type,
            penaltyStrokes: h.result?.penaltyStrokes ?? 0,
            diceRoll: h.result?.diceRoll,
            diceOutcome: h.result?.diceOutcome,
            description: h.result?.description ?? '',
          },
        });
        break;
      }

      // Show popup for last hole completed
      const holesCompleted: number[] = m.holesCompleted ?? [];
      if (holesCompleted.length > 0) {
        const lastHole = holesCompleted[holesCompleted.length - 1];
        const golfScore = gameState.golfScores.find((s: any) => s.playerId === myId);
        const hs = golfScore?.holeScores.find((h: any) => h.holeNumber === lastHole);
        if (hs) {
          const rel: number = hs.relativeToPar;
          const term = getGolfTermForScore(rel);
          let emoji = '⛳';
          if ((hs as any).isDoubleEagle) emoji = '🦅🦅';
          else if ((hs as any).isEagle)  emoji = '🦅';
          else if ((hs as any).isBirdie) emoji = '🐦';
          else if (rel === 0)            emoji = '✅';
          else if (rel === 1)            emoji = '😤';
          else if (rel >= 2)             emoji = '😬';
          set({
            pendingHolePopup: {
              holeNumber: lastHole,
              par: hs.par,
              strokes: hs.strokes,
              relativeToPar: rel,
              term,
              emoji,
            },
          });
        }
      }

      break; // Only process MY movement
    }
  },

  setError: (err) => set({ error: err }),
  reset: () => set(initialState),
}));
