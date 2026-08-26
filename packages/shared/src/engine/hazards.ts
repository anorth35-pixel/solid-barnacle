import type { Peghole, HazardResult } from '../types/board.js';

function rollDice(): [number, number] {
  return [
    Math.ceil(Math.random() * 6),
    Math.ceil(Math.random() * 6),
  ];
}

/**
 * Up-and-down dice check (Water, Rough, Sand, Three-putt).
 *
 * MAKE: par appears on either die, OR sum of dice equals par.
 *   - Advance 1 peghole.
 *   - Advance 2 pegholes on doubles of par (e.g., 3+3 on a par-3 hole).
 *
 * FAIL: neither condition met.
 *   - Water:       +1 stroke, retreat 1 peghole.
 *   - Rough/Sand:  +1 stroke, peg stays.
 */
function diceHazard(
  peghole: Peghole,
  currentIndex: number,
  par: number,
  dice: [number, number],
): HazardResult {
  const [d1, d2] = dice;
  const sum = d1 + d2;
  const makeUpAndDown = d1 === par || d2 === par || sum === par;

  if (makeUpAndDown) {
    const doublesOfPar = d1 === d2 && d1 === par;
    const advanceBonus = doublesOfPar ? 1 : 0;
    return {
      penaltyStrokes: 0,
      retreatToIndex: null,
      advanceBonus,
      diceRoll: dice,
      diceOutcome: doublesOfPar ? 'advance2-doubles' : 'advance1',
      description: `Dice ${d1}+${d2}=${sum} — Made the up-and-down! Advance ${doublesOfPar ? 2 : 1}`,
    };
  }

  const isWater = peghole.type === 'water';
  return {
    penaltyStrokes: 1,
    retreatToIndex: isWater ? Math.max(0, currentIndex - 1) : currentIndex,
    advanceBonus: 0,
    diceRoll: dice,
    diceOutcome: 'fail-penalty',
    description: `Dice ${d1}+${d2}=${sum} — Missed! +1 stroke${isWater ? ', retreat 1 peghole' : ', peg stays'}`,
  };
}

/**
 * applyHazard returns the result of landing on a hazard peghole.
 *
 * trees         — retreat 2 pegholes, no penalty stroke (immediate, no dice)
 * out-of-bounds — +2 penalty strokes, retreat to tee (immediate, no dice)
 * water         — roll 2d6 up-and-down check; fail = +1/retreat 1
 * rough/sand    — roll 2d6 up-and-down check; fail = +1/stay
 */
export function applyHazard(
  peghole: Peghole,
  currentIndex: number,
  par: number,
  diceOverride?: [number, number],
): HazardResult {
  switch (peghole.type) {
    case 'trees':
      return {
        penaltyStrokes: 0,
        retreatToIndex: Math.max(0, currentIndex - 2),
        advanceBonus: 0,
        description: 'Trees — retreat 2 pegholes, no penalty stroke',
      };

    case 'out-of-bounds':
      return {
        penaltyStrokes: 2,
        retreatToIndex: 0,
        advanceBonus: 0,
        description: 'Out of bounds — +2 penalty strokes, back to tee',
      };

    case 'water':
    case 'sand':
    case 'rough':
    case 'three-putt': {
      const dice = diceOverride ?? rollDice();
      return diceHazard(peghole, currentIndex, par, dice);
    }

    default:
      return { penaltyStrokes: 0, retreatToIndex: null, advanceBonus: 0, description: '' };
  }
}

export function isHazard(peghole: Peghole): boolean {
  return ['rough', 'trees', 'sand', 'water', 'out-of-bounds', 'three-putt'].includes(peghole.type);
}
