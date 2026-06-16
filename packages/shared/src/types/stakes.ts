export type StakeType = 'skins' | 'nassau' | 'sandies' | 'barkies' | 'greenies';

export interface StakesConfig {
  enabled: StakeType[];
  /** Unit value per stake (e.g. $1 or 1 point) */
  unitValue: number;
}

export interface SkinEntry {
  holeNumber: number;
  winnerPlayerId: string | null; // null = carryover (tie)
  carried: boolean;
}

export interface NassauState {
  front9WinnerId: string | null;
  back9WinnerId: string | null;
  overallWinnerId: string | null;
}

export interface SpecialBetEntry {
  holeNumber: number;
  playerId: string;
  achieved: boolean;
}

export interface StakesState {
  skins: SkinEntry[];
  nassau: NassauState;
  /** Sandies: completed hole with at least one sand hazard, ≤ par strokes */
  sandies: SpecialBetEntry[];
  /** Barkies: completed hole having hit trees, ≤ par strokes */
  barkies: SpecialBetEntry[];
  /** Greenies: on par-3s, nearest to pin (first to reach green) */
  greenies: SpecialBetEntry[];
}

export function createInitialStakesState(): StakesState {
  return {
    skins: [],
    nassau: { front9WinnerId: null, back9WinnerId: null, overallWinnerId: null },
    sandies: [],
    barkies: [],
    greenies: [],
  };
}
