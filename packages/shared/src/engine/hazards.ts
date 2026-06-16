import type { Peghole, HazardResult } from '../types/board.js';

function rollDice(): [number, number] {
  return [
    Math.ceil(Math.random() * 6),
    Math.ceil(Math.random() * 6),
  ];
}

/**
 * Apply dice-based hazard for sand, rough, and three-putt.
 *
 * Dice outcomes (sum of 2d6):
 *   2–4  → advance3: move forward 3 pegholes, −1 stroke (lucky!)
 *   5–9  → stay-penalty: stay here, +1 stroke
 *   10–12 → advance1: move forward 1 peghole normally, no penalty
 *
 * advanceBonus is relative to the base +1 advance that was already consumed:
 *   advance1    → advanceBonus 0 (no extra, just the base step)
 *   stay-penalty → advanceBonus -1 (undo the base step, stay put; +1 penalty)
 *   advance3    → advanceBonus +2 (two more steps beyond the base step)
 */
function diceHazard(currentIndex: number, dice: [number, number]): HazardResult {
  const sum = dice[0] + dice[1];
  if (sum <= 4) {
    // Lucky roll: advance 3 total, no penalty stroke, −1 stroke credited
    return {
      penaltyStrokes: -1,
      retreatToIndex: null,
      advanceBonus: 2,
      diceRoll: dice,
      diceOutcome: 'advance3-strokeoff',
      description: `Dice ${dice[0]}+${dice[1]}=${sum} — Lucky! Advance 3, −1 stroke`,
    };
  }
  if (sum >= 10) {
    // Good roll: advance 1, no penalty
    return {
      penaltyStrokes: 0,
      retreatToIndex: null,
      advanceBonus: 0,
      diceRoll: dice,
      diceOutcome: 'advance1',
      description: `Dice ${dice[0]}+${dice[1]}=${sum} — Advance 1, no penalty`,
    };
  }
  // Bad roll: stay put (+1 penalty). Retreat to stay at current position.
  return {
    penaltyStrokes: 1,
    retreatToIndex: currentIndex,
    advanceBonus: 0,
    diceRoll: dice,
    diceOutcome: 'stay-penalty',
    description: `Dice ${dice[0]}+${dice[1]}=${sum} — Stay here, +1 penalty stroke`,
  };
}

/**
 * applyHazard returns the penalty for landing on a hazard peghole.
 *
 * Real CribbGolf rules:
 *   trees       — no penalty, retreat 2 pegholes
 *   water       — +1 penalty stroke, retreat 1 peghole
 *   out-of-bounds — +2 penalty strokes, retreat to action start (caller supplies actionStartIndex)
 *   sand        — roll 2d6: advance3/−1, or advance1/0, or stay/+1
 *   rough       — same dice mechanic as sand
 *   three-putt  — same dice mechanic, on the green approach
 */
export function applyHazard(
  peghole: Peghole,
  currentIndex: number,
  actionStartIndex: number,
  diceOverride?: [number, number],  // for deterministic tests
): HazardResult {
  switch (peghole.type) {
    case 'trees':
      return {
        penaltyStrokes: 0,
        retreatToIndex: Math.max(0, currentIndex - 2),
        advanceBonus: 0,
        description: 'Trees — retreat 2 pegholes, no penalty stroke',
      };

    case 'water':
      return {
        penaltyStrokes: 1,
        retreatToIndex: Math.max(0, currentIndex - 1),
        advanceBonus: 0,
        description: 'Water hazard — +1 penalty stroke, retreat 1 peghole',
      };

    case 'out-of-bounds':
      return {
        penaltyStrokes: 2,
        retreatToIndex: actionStartIndex,
        advanceBonus: 0,
        description: 'Out of bounds — +2 penalty strokes, return to where scoring action started',
      };

    case 'sand':
    case 'rough':
    case 'three-putt': {
      const dice = diceOverride ?? rollDice();
      return diceHazard(currentIndex, dice);
    }

    default:
      return { penaltyStrokes: 0, retreatToIndex: null, advanceBonus: 0, description: '' };
  }
}

export function isHazard(peghole: Peghole): boolean {
  return ['rough', 'trees', 'sand', 'water', 'out-of-bounds', 'three-putt'].includes(peghole.type);
}
