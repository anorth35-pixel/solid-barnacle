import type { Card } from '../types/card.js';
import type { PeggingState } from '../types/game.js';
import type { PlayerSeat } from '../types/player.js';

export function createPeggingState(): PeggingState {
  return {
    playStack: [],
    runningCount: 0,
    lastPlayerToPlay: null,
    goCalledBy: [],
    subRoundsComplete: 0,
  };
}

export function canPlayCard(card: Card, runningCount: number): boolean {
  return runningCount + card.value <= 31;
}

export function hasPlayableCard(hand: Card[], playedCards: Card[], runningCount: number): boolean {
  const unplayed = hand.filter((c) => !playedCards.some((p) => p.id === c.id));
  return unplayed.some((c) => canPlayCard(c, runningCount));
}

export function allPlayersGone(pegging: PeggingState, playerCount: number): boolean {
  return pegging.goCalledBy.length + (pegging.lastPlayerToPlay !== null ? 1 : 0) >= playerCount;
}

export function resetPeggingCount(pegging: PeggingState): PeggingState {
  return {
    ...pegging,
    playStack: [],
    runningCount: 0,
    lastPlayerToPlay: null,
    goCalledBy: [],
    subRoundsComplete: pegging.subRoundsComplete + 1,
  };
}

export function nextPeggingPlayer(
  currentSeat: PlayerSeat,
  playerCount: number,
  dealerSeat: PlayerSeat,
): PlayerSeat {
  return ((currentSeat + 1) % playerCount) as PlayerSeat;
}

export function allHandsEmpty(players: Array<{ hand: Card[]; playedCards: Card[] }>): boolean {
  return players.every((p) => p.hand.length === p.playedCards.length);
}
