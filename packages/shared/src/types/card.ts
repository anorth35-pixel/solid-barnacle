export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K';

export interface Card {
  id: string;
  suit: Suit;
  rank: Rank;
  value: number;  // pip value: A=1, 2-9 face, 10/J/Q/K=10
  order: number;  // sort order: A=1 … K=13
}

export type Deck = Card[];
