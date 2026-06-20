import { describe, it, expect } from 'vitest';
import { advancePeg } from './peg-movement.js';
import { createInitialGolfScore } from '../types/golf-score.js';
import { DEFAULT_COURSE } from './course.js';
import type { GolfHole, GolfPath, Peghole } from '../types/board.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makePeg(index: number, holeNumber: number, type: Peghole['type']): Peghole {
  return { id: `h${holeNumber}-${index}`, holeNumber, pathId: 'A', index, type, isPar: true, x: 0, y: 0 };
}

/**
 * Build a minimal GolfHole with a single path 'A'.
 * types = the sequence of peghole types after the tee (the tee is always prepended).
 * The last entry should be 'cup'.
 */
function makeHole(number: number, par: number, types: Peghole['type'][]): GolfHole {
  const allTypes: Peghole['type'][] = ['tee', ...types];
  const pegholes: Peghole[] = allTypes.map((t, i) => makePeg(i, number, t));
  const path: GolfPath = { id: 'A', label: 'Safe', description: '', pegholes };
  return { number, par, paths: [path], handicap: 1 };
}

/** Score at the tee of hole `number` (index 0), path A selected. */
function atTee(holeNumber: number, extraHoles: GolfHole[] = []): ReturnType<typeof createInitialGolfScore> {
  const gs = createInitialGolfScore('p1');
  return {
    ...gs,
    currentHole: holeNumber,
    currentPegholeIndex: 0,
    currentPathId: 'A',
    selectedPaths: Object.fromEntries(
      [holeNumber, ...extraHoles.map(h => h.number)].map(n => [n, 'A'])
    ),
  };
}

// ── Simple par-3 hole: tee → fairway → green → cup (4 pegholes, needs 3 pts) ─

const PAR3: GolfHole = makeHole(1, 3, ['fairway', 'green', 'cup']);

// par-4 hole: tee + 3 fairways + green + cup = 6 pegholes, needs 5 pts
const PAR4: GolfHole = makeHole(2, 4, ['fairway', 'fairway', 'fairway', 'green', 'cup']);

// ── Par (clean traversal in multiple scoring actions) ──────────────────────────

describe('par', () => {
  it('returns par when hole is completed with no hazards across multiple actions', () => {
    let gs = atTee(1);
    // Move 2 out of 3 needed points
    ({ updated: gs } = advancePeg(gs, 2, [PAR3]));
    // Complete hole in second action
    const { updated, movement } = advancePeg(gs, 1, [PAR3]);
    expect(movement.holesCompleted).toContain(1);
    const hs = updated.holeScores.find(h => h.holeNumber === 1)!;
    expect(hs.relativeToPar).toBe(0);
    expect(hs.isBirdie).toBe(false);
    expect(hs.isEagle).toBe(false);
  });

  it('par when completing hole with leftover points (not a birdie because not one action)', () => {
    // Already mid-hole (not at tee), then complete with no penalty
    let gs = atTee(1);
    ({ updated: gs } = advancePeg(gs, 1, [PAR3])); // advance to index 1
    const { updated } = advancePeg(gs, 5, [PAR3]); // complete with leftover
    const hs = updated.holeScores.find(h => h.holeNumber === 1)!;
    expect(hs.relativeToPar).toBe(0);
    expect(hs.isBirdie).toBe(false);
  });
});

// ── Birdie (one action, tee to cup, no net penalty, any remaining pts ok) ─────

describe('birdie', () => {
  it('scores birdie when hole completed from tee in one action', () => {
    const gs = atTee(1);
    const { updated, movement } = advancePeg(gs, 5, [PAR3]); // 3 needed, 2 leftover
    expect(movement.holesCompleted).toContain(1);
    const hs = updated.holeScores.find(h => h.holeNumber === 1)!;
    expect(hs.isBirdie).toBe(true);
    expect(hs.isEagle).toBe(false);
    expect(hs.relativeToPar).toBe(-1);
    expect(hs.strokes).toBe(PAR3.par - 1);
  });

  it('no birdie when action does not start at tee', () => {
    let gs = atTee(1);
    ({ updated: gs } = advancePeg(gs, 1, [PAR3])); // move to index 1, no longer at tee
    const { updated } = advancePeg(gs, 10, [PAR3]);
    const hs = updated.holeScores.find(h => h.holeNumber === 1)!;
    expect(hs.isBirdie).toBe(false);
    expect(hs.relativeToPar).toBe(0);
  });
});

// ── Eagle (tee → exact landing on cup, remaining === 0) ───────────────────────

describe('eagle', () => {
  it('scores eagle when starting at tee and landing exactly on cup', () => {
    const gs = atTee(1);
    // PAR3 has 4 pegholes (indices 0-3); need exactly 3 points to land on cup (index 3)
    const { updated, movement } = advancePeg(gs, 3, [PAR3]);
    expect(movement.holesCompleted).toContain(1);
    const hs = updated.holeScores.find(h => h.holeNumber === 1)!;
    expect(hs.isEagle).toBe(true);
    expect(hs.isBirdie).toBe(true);
    expect(hs.relativeToPar).toBe(-2);
    expect(hs.strokes).toBe(PAR3.par - 2);
  });

  it('birdie but not eagle when leftover points remain after cupping', () => {
    const gs = atTee(1);
    const { updated } = advancePeg(gs, 4, [PAR3]); // 1 leftover
    const hs = updated.holeScores.find(h => h.holeNumber === 1)!;
    expect(hs.isBirdie).toBe(true);
    expect(hs.isEagle).toBe(false);
    expect(hs.relativeToPar).toBe(-1);
  });
});

// ── Double eagle (eagle on current hole AND entered it mid-action) ────────────

describe('double eagle', () => {
  it('scores double eagle when one action spans two holes from tee to tee-to-cup', () => {
    // Set up: player is at the tee of hole 1, which needs exactly 3 pts to cup.
    // Hole 2 (PAR4) needs 5 pts. We award 3+5=8 pts so the action:
    //   - eagles hole 1 (3 pts exact)           → holeJustStarted becomes true for hole 2
    //   - eagles hole 2 (5 pts exact, no remain) → isDoubleEagle fires
    const holes = [PAR3, PAR4];
    const gs: ReturnType<typeof atTee> = {
      ...atTee(1),
      selectedPaths: { 1: 'A', 2: 'A' },
    };
    const { updated, movement } = advancePeg(gs, 8, holes);
    expect(movement.holesCompleted).toEqual([1, 2]);
    const hs1 = updated.holeScores.find(h => h.holeNumber === 1)!;
    const hs2 = updated.holeScores.find(h => h.holeNumber === 2)!;
    // Hole 1: birdie (started at tee, one action) but NOT eagle — remaining=5 when cupped, not exact
    expect(hs1.isBirdie).toBe(true);
    expect(hs1.isEagle).toBe(false);
    // Hole 2: double eagle — entered mid-action from previous hole, cupped with remaining=0
    expect(hs2.isDoubleEagle).toBe(true);
    expect(hs2.relativeToPar).toBe(-3);
  });
});

// ── Bogey / hazard penalties ──────────────────────────────────────────────────

describe('hazards', () => {
  // Hole with a water hazard at index 2: tee→fairway→water→green→cup (5 pegholes, 4 pts to cup)
  const WATER_HOLE: GolfHole = makeHole(1, 3, ['fairway', 'water', 'green', 'cup']);

  it('water hazard on landing: +1 penalty, retreat 1, resulting in bogey', () => {
    // Award exactly 2 pts so we land on the water hazard (index 2) with remaining=0
    const gs = atTee(1);
    const { updated } = advancePeg(gs, 2, [WATER_HOLE]);
    // currentPegholeIndex should be 1 (retreated from 2)
    expect(updated.currentPegholeIndex).toBe(1);
    expect(updated.currentHoleStrokes).toBe(1); // +1 penalty from water
  });

  it('bogey when hole eventually completed after water hazard', () => {
    // Step 1: land on water (index 2), takes penalty, retreats to 1
    let gs = atTee(1);
    ({ updated: gs } = advancePeg(gs, 2, [WATER_HOLE]));
    // Step 2: advance from index 1 to cup (3 more pts needed)
    const { updated } = advancePeg(gs, 5, [WATER_HOLE]);
    const hs = updated.holeScores.find(h => h.holeNumber === 1)!;
    expect(hs.relativeToPar).toBe(1); // bogey
    expect(hs.penaltyStrokes).toBe(1);
    expect(hs.isBirdie).toBe(false);
  });

  it('water hazard mid-action (not on last point) is passed through without triggering', () => {
    // Award 3 pts so we pass through water (index 2) on the way — only remaining=0 triggers it
    const gs = atTee(1);
    const { updated } = advancePeg(gs, 3, [WATER_HOLE]);
    // Should land at index 3 (green), no hazard fired
    expect(updated.currentPegholeIndex).toBe(3);
    expect(updated.currentHoleStrokes).toBe(0);
    expect(updated.holeScores).toHaveLength(0); // hole not completed yet
  });

  // Hole with trees at index 1: tee→trees→fairway→cup (4 pegholes)
  const TREES_HOLE: GolfHole = makeHole(1, 3, ['trees', 'fairway', 'cup']);

  it('trees on landing: retreat 2 (to tee), no penalty stroke', () => {
    const gs = atTee(1);
    const { updated } = advancePeg(gs, 1, [TREES_HOLE]);
    expect(updated.currentPegholeIndex).toBe(0); // retreated to max(0, 1-2)
    expect(updated.currentHoleStrokes).toBe(0);
  });

  // OOB at index 2: tee→fairway→out-of-bounds→green→cup
  const OOB_HOLE: GolfHole = makeHole(1, 3, ['fairway', 'out-of-bounds', 'green', 'cup']);

  it('out-of-bounds on landing: +2 penalty, retreat to action start', () => {
    let gs = atTee(1);
    // Move to index 1 first (not at tee for this action)
    ({ updated: gs } = advancePeg(gs, 1, [OOB_HOLE]));
    // Land on OOB at index 2 — should retreat to index 1 (action start)
    const { updated } = advancePeg(gs, 1, [OOB_HOLE]);
    expect(updated.currentPegholeIndex).toBe(1);
    expect(updated.currentHoleStrokes).toBe(2);
  });

  // Sand hazard with deterministic dice override
  const SAND_HOLE: GolfHole = makeHole(1, 3, ['fairway', 'sand', 'green', 'cup']);

  it('sand: penalty strokes stay in the range [−1, +1] regardless of dice', () => {
    // advancePeg doesn't expose a dice override, so we run many trials and verify
    // that the penalty outcome is always one of the three known dice results:
    //   bad roll  → +1 penalty, peg stays at sand index
    //   good roll → 0 penalty, advance 1
    //   lucky     → −1 penalty (stroke credit), advance 3
    const gs = atTee(1);
    for (let i = 0; i < 30; i++) {
      const { updated } = advancePeg({ ...gs }, 2, [SAND_HOLE]);
      // If hole not complete, currentHoleStrokes must be −1, 0, or 1
      if (updated.holeScores.length === 0) {
        expect(updated.currentHoleStrokes).toBeGreaterThanOrEqual(-1);
        expect(updated.currentHoleStrokes).toBeLessThanOrEqual(1);
      } else {
        // Lucky advance3 completed the hole — relativeToPar must include the −1 stroke credit
        const hs = updated.holeScores[0];
        expect(hs.relativeToPar).toBeLessThanOrEqual(0); // lucky dice → never over par
      }
    }
  });
});

// ── Multi-hole advance ────────────────────────────────────────────────────────

describe('multi-hole advance', () => {
  it('completes two holes in one action when points overflow', () => {
    // PAR3 needs 3 pts, PAR4 needs 5 pts; award 10 = complete both with leftover
    const holes = [PAR3, PAR4];
    const gs: ReturnType<typeof atTee> = {
      ...atTee(1),
      selectedPaths: { 1: 'A', 2: 'A' },
    };
    const { updated, movement } = advancePeg(gs, 10, holes);
    expect(movement.holesCompleted).toContain(1);
    expect(movement.holesCompleted).toContain(2);
    expect(updated.holesCompleted).toBe(2);
    expect(updated.holeScores).toHaveLength(2);
  });

  it('isFinished triggers after completing hole 18', () => {
    const hole18 = DEFAULT_COURSE.holes[17];
    const gs = {
      ...createInitialGolfScore('p1'),
      currentHole: 18,
      holesCompleted: 17,
      selectedPaths: { 18: 'A' },
    };
    // pegholes.length points is always enough to sweep through hole 18 from tee
    const { updated } = advancePeg(gs, hole18.paths[0].pegholes.length, DEFAULT_COURSE.holes);
    expect(updated.isFinished).toBe(true);
    expect(updated.holesCompleted).toBe(18);
  });
});

// ── Finishing bonus (stroke play only) ───────────────────────────────────────

describe('finishing bonus', () => {
  it('awards −2 bonus to first finisher of hole 18', () => {
    const hole18 = DEFAULT_COURSE.holes[17];
    const gs = {
      ...createInitialGolfScore('p1'),
      currentHole: 18,
      holesCompleted: 17,
      selectedPaths: { 18: 'A' },
    };
    // Enough points to complete from tee in one action → birdie (−1) + bonus (−2) = −3
    const { updated } = advancePeg(gs, hole18.paths[0].pegholes.length, DEFAULT_COURSE.holes, true);
    const hs = updated.holeScores.find(h => h.holeNumber === 18)!;
    expect(hs.relativeToPar).toBe(-3);
  });

  it('no finishing bonus on holes other than 18', () => {
    const gs = atTee(1);
    const { updated } = advancePeg(gs, 5, [PAR3], true);
    const hs = updated.holeScores.find(h => h.holeNumber === 1)!;
    expect(hs.relativeToPar).toBe(-1); // just birdie, no extra bonus
  });
});
