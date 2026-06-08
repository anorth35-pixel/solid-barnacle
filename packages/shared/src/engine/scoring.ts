import type { Card, Rank } from '../types/card.js';
import type { ScoreItem, ScoreBreakdown, ScoreReason } from '../types/scoring.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function combinations<T>(arr: T[], k: number): T[][] {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [first, ...rest] = arr;
  const withFirst = combinations(rest, k - 1).map((c) => [first, ...c]);
  const withoutFirst = combinations(rest, k);
  return [...withFirst, ...withoutFirst];
}

function cardDesc(card: Card): string {
  return `${card.rank}${card.suit[0].toUpperCase()}`;
}

function cardsDesc(cards: Card[]): string {
  return cards.map(cardDesc).join(', ');
}

// ── 15s ───────────────────────────────────────────────────────────────────────

function score15s(cards: Card[]): ScoreItem[] {
  const items: ScoreItem[] = [];
  for (let size = 2; size <= cards.length; size++) {
    for (const combo of combinations(cards, size)) {
      if (combo.reduce((s, c) => s + c.value, 0) === 15) {
        items.push({
          reason: 'fifteen',
          cards: combo,
          points: 2,
          description: `Fifteen-two (${cardsDesc(combo)})`,
        });
      }
    }
  }
  return items;
}

// ── Pairs ─────────────────────────────────────────────────────────────────────

function scorePairs(cards: Card[]): ScoreItem[] {
  const items: ScoreItem[] = [];
  for (const combo of combinations(cards, 2)) {
    if (combo[0].rank === combo[1].rank) {
      items.push({
        reason: 'pair',
        cards: combo,
        points: 2,
        description: `Pair of ${combo[0].rank}s for 2`,
      });
    }
  }
  return items;
}

// ── Runs ──────────────────────────────────────────────────────────────────────

function isConsecutive(orders: number[]): boolean {
  const sorted = [...orders].sort((a, b) => a - b);
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] !== sorted[i - 1] + 1) return false;
  }
  return true;
}

function scoreRuns(cards: Card[]): ScoreItem[] {
  // Find longest runs first, exclude subsets that are part of longer runs
  const items: ScoreItem[] = [];
  const coveredSets = new Set<string>();

  for (let size = cards.length; size >= 3; size--) {
    for (const combo of combinations(cards, size)) {
      const orders = combo.map((c) => c.order);
      if (isConsecutive(orders)) {
        const key = [...orders].sort((a, b) => a - b).join(',');
        // Check no larger run already covers this exact set
        const alreadyCovered = [...coveredSets].some((s) => {
          const covered = s.split(',').map(Number);
          return orders.every((o) => covered.includes(o));
        });
        if (!alreadyCovered) {
          const sorted = [...combo].sort((a, b) => a.order - b.order);
          items.push({
            reason: 'run',
            cards: sorted,
            points: size,
            description: `Run of ${size} (${cardsDesc(sorted)}) for ${size}`,
          });
          coveredSets.add(key);
        }
      }
    }
  }
  return items;
}

// ── Flush ─────────────────────────────────────────────────────────────────────

function scoreFlush(hand: Card[], starter: Card, isCrib: boolean): ScoreItem[] {
  const suits = hand.map((c) => c.suit);
  const allSameSuit = suits.every((s) => s === suits[0]);
  if (!allSameSuit) return [];

  if (isCrib) {
    // Crib flush requires all 5 cards (including starter) same suit
    if (starter.suit !== hand[0].suit) return [];
    return [{
      reason: 'flush',
      cards: [...hand, starter],
      points: 5,
      description: `Flush for 5 (all ${hand[0].suit})`,
    }];
  }

  const cards = starter.suit === hand[0].suit ? [...hand, starter] : hand;
  return [{
    reason: 'flush',
    cards,
    points: cards.length,
    description: `Flush for ${cards.length} (all ${hand[0].suit})`,
  }];
}

// ── Nobs ──────────────────────────────────────────────────────────────────────

function scoreNobs(hand: Card[], starter: Card): ScoreItem[] {
  const jack = hand.find((c) => c.rank === 'J' && c.suit === starter.suit);
  if (!jack) return [];
  return [{
    reason: 'nobs',
    cards: [jack],
    points: 1,
    description: `Nobs — Jack of ${jack.suit} for 1`,
  }];
}

// ── Public API ────────────────────────────────────────────────────────────────

export function scoreHand(
  playerId: string,
  hand: Card[],
  starter: Card,
  isCrib: boolean,
): ScoreBreakdown {
  const all = [...hand, starter];
  const items: ScoreItem[] = [
    ...score15s(all),
    ...scorePairs(all),
    ...scoreRuns(all),
    ...scoreFlush(hand, starter, isCrib),
    ...scoreNobs(hand, starter),
  ];
  return {
    playerId,
    phase: isCrib ? 'crib' : 'hand',
    items,
    total: items.reduce((s, i) => s + i.points, 0),
  };
}

// ── Pegging scoring ───────────────────────────────────────────────────────────

export function scorePeggingPlay(stack: Card[], newCard: Card): ScoreItem[] {
  const items: ScoreItem[] = [];
  const fullStack = [...stack, newCard];
  const runningCount = fullStack.reduce((s, c) => s + c.value, 0);

  if (runningCount === 15) {
    items.push({
      reason: 'pegging-fifteen',
      cards: fullStack,
      points: 2,
      description: 'Fifteen for 2',
    });
  }

  if (runningCount === 31) {
    items.push({
      reason: 'thirty-one',
      cards: fullStack,
      points: 2,
      description: '31 for 2',
    });
  }

  // Pair / trips / quads: check top N cards same rank
  let n = 2;
  while (n <= fullStack.length) {
    const top = fullStack.slice(-n);
    if (top.every((c) => c.rank === newCard.rank)) {
      const prev = items.find((i) => i.reason === 'pegging-pair');
      if (prev) {
        items.splice(items.indexOf(prev), 1);
      }
      const pts = [0, 0, 2, 6, 12][n];
      const label = n === 2 ? 'Pair' : n === 3 ? 'Three of a kind' : 'Four of a kind';
      items.push({
        reason: 'pegging-pair',
        cards: top,
        points: pts,
        description: `${label} for ${pts}`,
      });
      n++;
    } else {
      break;
    }
  }

  // Run: find longest run in tail of stack
  for (let size = fullStack.length; size >= 3; size--) {
    const tail = fullStack.slice(-size);
    if (isConsecutive(tail.map((c) => c.order))) {
      const sorted = [...tail].sort((a, b) => a.order - b.order);
      items.push({
        reason: 'pegging-run',
        cards: tail,
        points: size,
        description: `Run of ${size} for ${size}`,
      });
      break;
    }
  }

  return items;
}

export function scoreNibs(playerId: string, starter: Card): ScoreBreakdown | null {
  if (starter.rank !== 'J') return null;
  const item: ScoreItem = {
    reason: 'nibs',
    cards: [starter],
    points: 2,
    description: 'His Heels (Jack starter) for 2',
  };
  return { playerId, phase: 'hand', items: [item], total: 2 };
}
