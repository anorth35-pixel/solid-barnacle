import { describe, it, expect } from 'vitest';
import { scoreHand, scorePeggingPlay, scoreNibs } from './scoring.js';
import type { Card } from '../types/card.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function c(rank: string, suit: string): Card {
  const ranks: Record<string, [number, number]> = {
    A: [1, 1], '2': [2, 2], '3': [3, 3], '4': [4, 4], '5': [5, 5],
    '6': [6, 6], '7': [7, 7], '8': [8, 8], '9': [9, 9], '10': [10, 10],
    J: [10, 11], Q: [10, 12], K: [10, 13],
  };
  const [value, order] = ranks[rank];
  return { id: `${rank}${suit[0]}`, suit: suit as any, rank: rank as any, value, order };
}

// ── scoreHand ─────────────────────────────────────────────────────────────────

describe('scoreHand', () => {
  it('scores the classic 29-point hand', () => {
    // J of hearts in hand, starter = 5 of hearts → nobs
    // Five 5s + J: 5♠ 5♣ 5♦ J♥ + 5♥ starter
    const hand = [c('5', 'spades'), c('5', 'clubs'), c('5', 'diamonds'), c('J', 'hearts')];
    const starter = c('5', 'hearts');
    const bd = scoreHand('p1', hand, starter, false);
    expect(bd.total).toBe(29);
  });

  it('scores a perfect flush + run', () => {
    // A 2 3 4 of same suit + starter same suit = 5-card flush + run of 4
    const hand = [c('A', 'spades'), c('2', 'spades'), c('3', 'spades'), c('4', 'spades')];
    const starter = c('5', 'spades');
    const bd = scoreHand('p1', hand, starter, false);
    // run of 5 = 5, flush of 5 = 5, 15s: A+4+5+5 no... A=1 so A+4=5 no...
    // run A2345 = 5pts, flush 5pts, 15: 5+4+3+2+A=15 yes (2pts), A+4+5+5? no 5s
    // Actually: A+2+3+4+5 = 15 → 2pts; plus run of 5 → 5pts; flush → 5pts; total at least 12
    expect(bd.items.some((i) => i.reason === 'run' && i.points === 5)).toBe(true);
    expect(bd.items.some((i) => i.reason === 'flush' && i.points === 5)).toBe(true);
  });

  it('scores pairs', () => {
    const hand = [c('K', 'hearts'), c('K', 'spades'), c('K', 'clubs'), c('5', 'diamonds')];
    const starter = c('2', 'hearts');
    const bd = scoreHand('p1', hand, starter, false);
    // Three of a kind = 6 points (3 pairs)
    const pairTotal = bd.items.filter((i) => i.reason === 'pair').reduce((s, i) => s + i.points, 0);
    expect(pairTotal).toBe(6);
  });

  it('scores 15s', () => {
    const hand = [c('5', 'hearts'), c('10', 'spades'), c('2', 'clubs'), c('3', 'diamonds')];
    const starter = c('K', 'hearts');
    const bd = scoreHand('p1', hand, starter, false);
    // 5+10=15, 5+K=15, 5+2+3+K+10? no... 2+3+10=15, 2+3+K=15
    const fifteenTotal = bd.items.filter((i) => i.reason === 'fifteen').reduce((s, i) => s + i.points, 0);
    expect(fifteenTotal).toBeGreaterThanOrEqual(4); // at least 2 fifteens
  });

  it('scores nobs', () => {
    const hand = [c('J', 'hearts'), c('2', 'spades'), c('3', 'clubs'), c('4', 'diamonds')];
    const starter = c('5', 'hearts'); // same suit as Jack
    const bd = scoreHand('p1', hand, starter, false);
    expect(bd.items.some((i) => i.reason === 'nobs')).toBe(true);
  });

  it('does NOT score nobs when jack suit does not match starter', () => {
    const hand = [c('J', 'spades'), c('2', 'clubs'), c('3', 'diamonds'), c('4', 'hearts')];
    const starter = c('5', 'hearts');
    const bd = scoreHand('p1', hand, starter, false);
    expect(bd.items.some((i) => i.reason === 'nobs')).toBe(false);
  });

  it('scores 4-card hand flush (not including starter)', () => {
    const hand = [c('2', 'spades'), c('4', 'spades'), c('6', 'spades'), c('8', 'spades')];
    const starter = c('K', 'hearts'); // different suit
    const bd = scoreHand('p1', hand, starter, false);
    const flush = bd.items.find((i) => i.reason === 'flush');
    expect(flush).toBeDefined();
    expect(flush!.points).toBe(4);
  });

  it('scores 5-card flush when starter matches', () => {
    const hand = [c('2', 'clubs'), c('4', 'clubs'), c('6', 'clubs'), c('8', 'clubs')];
    const starter = c('K', 'clubs');
    const bd = scoreHand('p1', hand, starter, false);
    const flush = bd.items.find((i) => i.reason === 'flush');
    expect(flush!.points).toBe(5);
  });

  it('crib flush requires all 5 cards same suit', () => {
    const hand = [c('2', 'clubs'), c('4', 'clubs'), c('6', 'clubs'), c('8', 'clubs')];
    const starter = c('K', 'hearts'); // different suit
    const bd = scoreHand('p1', hand, starter, true); // is crib
    expect(bd.items.some((i) => i.reason === 'flush')).toBe(false);
  });

  it('crib flush scores 5 when all same suit', () => {
    const hand = [c('2', 'clubs'), c('4', 'clubs'), c('6', 'clubs'), c('8', 'clubs')];
    const starter = c('K', 'clubs');
    const bd = scoreHand('p1', hand, starter, true);
    expect(bd.items.find((i) => i.reason === 'flush')!.points).toBe(5);
  });

  it('scores a double run', () => {
    // Two cards same rank + three consecutive = double run of 3
    const hand = [c('7', 'hearts'), c('7', 'spades'), c('8', 'clubs'), c('9', 'diamonds')];
    const starter = c('2', 'hearts');
    const bd = scoreHand('p1', hand, starter, false);
    // Should have two runs of 3 (7-8-9 twice) = 6 pts for runs
    const runTotal = bd.items.filter((i) => i.reason === 'run').reduce((s, i) => s + i.points, 0);
    expect(runTotal).toBe(6);
  });

  it('returns 0 for a garbage hand', () => {
    const hand = [c('2', 'hearts'), c('4', 'spades'), c('6', 'clubs'), c('8', 'diamonds')];
    const starter = c('K', 'hearts');
    const bd = scoreHand('p1', hand, starter, false);
    expect(bd.total).toBe(0);
  });
});

// ── scoreNibs ─────────────────────────────────────────────────────────────────

describe('scoreNibs', () => {
  it('awards 2 points when starter is a Jack', () => {
    const bd = scoreNibs('p1', c('J', 'spades'));
    expect(bd).not.toBeNull();
    expect(bd!.total).toBe(2);
  });

  it('returns null when starter is not a Jack', () => {
    expect(scoreNibs('p1', c('5', 'hearts'))).toBeNull();
  });
});

// ── scorePeggingPlay ──────────────────────────────────────────────────────────

describe('scorePeggingPlay', () => {
  it('scores 15', () => {
    const stack = [c('10', 'hearts')];
    const items = scorePeggingPlay(stack, c('5', 'spades'));
    expect(items.some((i) => i.reason === 'pegging-fifteen')).toBe(true);
  });

  it('scores 31', () => {
    const stack = [c('10', 'hearts'), c('10', 'spades'), c('10', 'clubs')];
    const items = scorePeggingPlay(stack, c('A', 'diamonds'));
    expect(items.some((i) => i.reason === 'thirty-one')).toBe(true);
  });

  it('scores a pair', () => {
    const stack = [c('7', 'hearts')];
    const items = scorePeggingPlay(stack, c('7', 'spades'));
    expect(items.some((i) => i.reason === 'pegging-pair' && i.points === 2)).toBe(true);
  });

  it('scores three of a kind (6 pts)', () => {
    const stack = [c('7', 'hearts'), c('7', 'spades')];
    const items = scorePeggingPlay(stack, c('7', 'clubs'));
    const pair = items.find((i) => i.reason === 'pegging-pair');
    expect(pair?.points).toBe(6);
  });

  it('scores four of a kind (12 pts)', () => {
    const stack = [c('7', 'hearts'), c('7', 'spades'), c('7', 'clubs')];
    const items = scorePeggingPlay(stack, c('7', 'diamonds'));
    const pair = items.find((i) => i.reason === 'pegging-pair');
    expect(pair?.points).toBe(12);
  });

  it('scores a run of 3', () => {
    const stack = [c('5', 'hearts'), c('6', 'spades')];
    const items = scorePeggingPlay(stack, c('7', 'clubs'));
    expect(items.some((i) => i.reason === 'pegging-run' && i.points === 3)).toBe(true);
  });

  it('scores a run of 4', () => {
    const stack = [c('4', 'hearts'), c('5', 'spades'), c('6', 'clubs')];
    const items = scorePeggingPlay(stack, c('7', 'diamonds'));
    expect(items.some((i) => i.reason === 'pegging-run' && i.points === 4)).toBe(true);
  });

  it('scores run regardless of play order', () => {
    // 7 3 5 4 → last 4 form a run (3-4-5-7 is NOT a run; 3-4-5 IS after playing 4 and 5)
    // Actually 7,3,5,4 → last 3: 5,4 no; last 4: 7,3,5,4 → sorted 3,4,5,7 not consecutive
    // Let's try: 5 3 4 → sorted 3,4,5 → run of 3
    const stack = [c('5', 'hearts'), c('3', 'spades')];
    const items = scorePeggingPlay(stack, c('4', 'clubs'));
    expect(items.some((i) => i.reason === 'pegging-run' && i.points === 3)).toBe(true);
  });

  it('returns empty for no score', () => {
    const stack = [c('2', 'hearts')];
    const items = scorePeggingPlay(stack, c('7', 'spades'));
    expect(items).toHaveLength(0);
  });
});

// ── advancePeg / hazards ──────────────────────────────────────────────────────

import { advancePeg } from './peg-movement.js';
import { createInitialGolfScore } from '../types/golf-score.js';
import { DEFAULT_COURSE } from './course.js';

describe('advancePeg', () => {
  it('advances the peg forward by the number of points', () => {
    const gs = createInitialGolfScore('p1');
    const { updated } = advancePeg(gs, 2, DEFAULT_COURSE.holes);
    expect(updated.currentPegholeIndex).toBe(2);
  });

  it('completes a hole and advances to the next', () => {
    const gs = createInitialGolfScore('p1');
    const hole = DEFAULT_COURSE.holes[0];
    const pathA = hole.paths[0];
    // pathA.pegholes.length - 1 steps to reach the cup from tee
    const { updated } = advancePeg(gs, pathA.pegholes.length - 1, DEFAULT_COURSE.holes);
    expect(updated.holesCompleted).toBe(1);
    expect(updated.currentHole).toBe(2);
    expect(updated.currentPegholeIndex).toBe(0);
    expect(updated.currentHoleStrokes).toBe(0);
    expect(updated.holeScores).toHaveLength(1);
  });

  it('scores a completed hole relative to par (eagle when started from tee, exact landing)', () => {
    const hole = DEFAULT_COURSE.holes[0];
    const pathA = hole.paths[0];
    const gs = createInitialGolfScore('p1');
    // Exact number of steps to land on the cup with remaining=0 → eagle
    const { updated } = advancePeg(gs, pathA.pegholes.length - 1, DEFAULT_COURSE.holes);
    const hs = updated.holeScores[0];
    expect(hs.strokes).toBe(hole.par + hs.relativeToPar);
    expect(hs.isEagle).toBe(true);
    expect(hs.relativeToPar).toBe(-2);
  });

  it('marks game finished after completing hole 18', () => {
    const gs = createInitialGolfScore('p1');
    const farGs = { ...gs, currentHole: 18, holesCompleted: 17, holeScores: [], selectedPaths: { 18: 'LR' } };
    const hole18 = DEFAULT_COURSE.holes[17];
    const pathA = hole18.paths[0];
    const { updated } = advancePeg(farGs, pathA.pegholes.length, DEFAULT_COURSE.holes);
    expect(updated.isFinished).toBe(true);
    expect(updated.holesCompleted).toBe(18);
  });
});
