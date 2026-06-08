import type { Peghole, HazardResult } from '../types/board.js';

export function applyHazard(peghole: Peghole, currentIndex: number): HazardResult {
  switch (peghole.type) {
    case 'rough':
      return {
        penaltyStrokes: 1,
        retreatToIndex: null,
        description: 'Rough — 1 penalty stroke',
      };
    case 'trees':
      return {
        penaltyStrokes: 0,
        retreatToIndex: Math.max(0, currentIndex - 2),
        description: 'Trees — retreat 2 pegholes',
      };
    case 'sand':
      return {
        penaltyStrokes: 1,
        retreatToIndex: peghole.index,
        description: 'Sand trap — 1 penalty stroke, retreat to entry',
      };
    case 'water':
      return {
        penaltyStrokes: 2,
        retreatToIndex: Math.max(0, peghole.index - 1),
        description: 'Water hazard — 2 penalty strokes, retreat 1 peghole',
      };
    case 'out-of-bounds':
      return {
        penaltyStrokes: 2,
        retreatToIndex: 0,
        description: 'Out of bounds — 2 penalty strokes, return to tee',
      };
    default:
      return { penaltyStrokes: 0, retreatToIndex: null, description: '' };
  }
}

export function isHazard(peghole: Peghole): boolean {
  return ['rough', 'trees', 'sand', 'water', 'out-of-bounds'].includes(peghole.type);
}
