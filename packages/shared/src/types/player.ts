import type { Card } from './card.js';

export type PlayerSeat = 0 | 1 | 2;
export type PlayerType = 'human' | 'ai' | 'remote';

export interface Player {
  id: string;
  name: string;
  seat: PlayerSeat;
  type: PlayerType;
  hand: Card[];
  playedCards: Card[];
  isConnected: boolean;
  isReady: boolean;
}
