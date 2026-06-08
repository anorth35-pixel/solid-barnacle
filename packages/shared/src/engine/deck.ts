import type { Card, Suit, Rank, Deck } from '../types/card.js';

const SUITS: Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function rankValue(rank: Rank): number {
  if (rank === 'A') return 1;
  if (['J', 'Q', 'K'].includes(rank)) return 10;
  return parseInt(rank, 10);
}

function rankOrder(rank: Rank): number {
  return RANKS.indexOf(rank) + 1;
}

export function createDeck(): Deck {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({
        id: `${rank}${suit[0]}`,
        suit,
        rank,
        value: rankValue(rank),
        order: rankOrder(rank),
      });
    }
  }
  return deck;
}

export function shuffle(deck: Deck): Deck {
  const d = [...deck];
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

export function deal(deck: Deck, playerCount: 2 | 3): { hands: Card[][]; remaining: Deck } {
  const cardsPerPlayer = playerCount === 2 ? 6 : 5;
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  const d = [...deck];
  for (let i = 0; i < cardsPerPlayer * playerCount; i++) {
    hands[i % playerCount].push(d.shift()!);
  }
  return { hands, remaining: d };
}
