import type { Card } from '../types/card.js';
import type { AIDifficulty } from '../types/game.js';
import { scoreHand } from '../engine/scoring.js';
import { canPlayCard } from '../engine/pegging.js';
import { createDeck } from '../engine/deck.js';

// ── Discard strategy ──────────────────────────────────────────────────────────

export function chooseDiscard(
  hand: Card[],
  discardCount: number,
  difficulty: AIDifficulty,
): string[] {
  if (difficulty === 'easy') {
    return hand.slice(-discardCount).map((c) => c.id);
  }

  // For medium/hard: try all combinations and pick the keep set with highest expected value
  const keepCount = hand.length - discardCount;
  const allStarters = createDeck().filter((c) => !hand.some((h) => h.id === c.id));

  let bestIds: string[] = hand.slice(-discardCount).map((c) => c.id);
  let bestEV = -Infinity;

  const keepCombos = combinations(hand, keepCount);
  for (const keep of keepCombos) {
    let totalPoints = 0;
    for (const starter of allStarters) {
      const bd = scoreHand('ai', keep, starter, false);
      totalPoints += bd.total;
    }
    const ev = totalPoints / allStarters.length;
    if (ev > bestEV) {
      bestEV = ev;
      bestIds = hand.filter((c) => !keep.some((k) => k.id === c.id)).map((c) => c.id);
    }
  }
  return bestIds;
}

// ── Pegging strategy ──────────────────────────────────────────────────────────

export function choosePegCard(
  hand: Card[],
  playedCards: Card[],
  runningCount: number,
  difficulty: AIDifficulty,
): string | null {
  const unplayed = hand.filter((c) => !playedCards.some((p) => p.id === c.id));
  const legal = unplayed.filter((c) => canPlayCard(c, runningCount));
  if (legal.length === 0) return null;
  if (difficulty === 'easy') return legal[0].id;

  // Greedy: pick card that scores most immediate points
  let best = legal[0];
  let bestPts = -1;
  for (const card of legal) {
    const newCount = runningCount + card.value;
    let pts = 0;
    if (newCount === 15 || newCount === 31) pts += 2;
    // Rough pair check
    const topSameRank = legal.filter((c) => c.rank === card.rank).length;
    if (topSameRank > 1) pts += 2;
    if (pts > bestPts) {
      bestPts = pts;
      best = card;
    }
  }
  return best.id;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  return [
    ...combinations(rest, k - 1).map((c) => [first, ...c]),
    ...combinations(rest, k),
  ];
}
