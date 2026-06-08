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
        penaltyStrokes: 1,
        retreatToIndex: null,
        description: 'Trees — 1 penalty stroke',
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
        retreatToIndex: peghole.index,
        description: 'Water hazard — 2 penalty strokes',
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
