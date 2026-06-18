import type { GolfHole, PegMovement, PegholeType } from '../types/board.js';
import type { PlayerGolfScore, HoleScore } from '../types/golf-score.js';
import { applyHazard, isHazard } from './hazards.js';
import { getPlayerPath } from './course.js';

export function advancePeg(
  golfScore: PlayerGolfScore,
  points: number,
  holes: GolfHole[],
  isFirstFinisher: boolean = false,
): { updated: PlayerGolfScore; movement: PegMovement } {
  const startHole = golfScore.currentHole;
  const startPath = getPlayerPath(holes[startHole - 1], golfScore.selectedPaths);

  const movement: PegMovement = {
    playerId: golfScore.playerId,
    fromHole: startHole,
    fromPegholeIndex: golfScore.currentPegholeIndex,
    fromPathId: startPath.id,
    toHole: startHole,
    toPegholeIndex: golfScore.currentPegholeIndex,
    toPathId: startPath.id,
    pointsUsed: points,
    hazardsHit: [],
    holesCompleted: [],
  };

  let score: PlayerGolfScore = {
    ...golfScore,
    holeScores: [...golfScore.holeScores],
    selectedPaths: { ...golfScore.selectedPaths },
  };

  // Record where this scoring action began for OOB retreat
  const actionStartIndex = golfScore.currentPegholeIndex;
  const actionStartHole = golfScore.currentHole;
  const startedFromTee = actionStartIndex === 0;

  let remaining = points;
  let totalPenaltyThisHole = 0;
  let hazardTypesThisHole: PegholeType[] = [];
  let holeJustStarted = false; // whether we crossed into a new hole this action
  let triggeredThisHole = new Set<number>(); // pegholes that already fired a hazard this advancePeg call

  while (remaining > 0 && !score.isFinished) {
    const hole = holes[score.currentHole - 1];
    if (!hole) break;

    const path = getPlayerPath(hole, score.selectedPaths);
    const currentIdx = score.currentPegholeIndex;
    const nextIndex = currentIdx + 1;

    if (nextIndex >= path.pegholes.length) break; // already at cup

    const nextPeghole = path.pegholes[nextIndex];

    remaining--;
    score = { ...score, currentHoleStrokes: score.currentHoleStrokes + 1 };

    if (isHazard(nextPeghole) && !triggeredThisHole.has(nextIndex)) {
      triggeredThisHole.add(nextIndex);
      const result = applyHazard(
        nextPeghole,
        nextIndex,
        // OOB retreats to action-start within the current hole
        actionStartHole === score.currentHole ? actionStartIndex : 0,
      );
      movement.hazardsHit.push({ peghole: nextPeghole, result });

      const penaltyStrokes = result.penaltyStrokes;
      totalPenaltyThisHole += Math.max(0, penaltyStrokes); // negatives tracked separately
      if (penaltyStrokes < 0) {
        // Lucky dice (advance3-strokeoff): apply the stroke credit immediately
        score = { ...score, currentHoleStrokes: Math.max(0, score.currentHoleStrokes + penaltyStrokes) };
      } else {
        score = { ...score, currentHoleStrokes: score.currentHoleStrokes + penaltyStrokes };
      }

      hazardTypesThisHole.push(nextPeghole.type as PegholeType);

      const landIndex = result.retreatToIndex ?? nextIndex;
      score = { ...score, currentPegholeIndex: landIndex, currentPathId: path.id };

      // Apply advance bonus from dice (e.g. advance3 = move 2 more pegholes on top of the base step)
      if (result.advanceBonus > 0) {
        const bonusTarget = Math.min(
          landIndex + result.advanceBonus,
          path.pegholes.length - 1,
        );
        score = { ...score, currentPegholeIndex: bonusTarget };
      }
    } else {
      score = { ...score, currentPegholeIndex: nextIndex, currentPathId: path.id };
    }

    // Hole complete when peg reaches the cup (last peghole)
    if (score.currentPegholeIndex >= path.pegholes.length - 1) {
      const cupHoleNumber = hole.number;
      const cuppedFromTee = startedFromTee && score.currentHole === actionStartHole;
      const noLandedHazard = hazardTypesThisHole.filter((t) =>
        t !== 'rough' && t !== 'trees' // trees/dice ok, only count stroke-adding hazards for birdie
      ).length === 0;

      // Birdie: started at tee of this hole AND completed it in this action with no penalty
      const isBirdie = cuppedFromTee && totalPenaltyThisHole <= 0;
      // Eagle: birdie AND consumed exactly all points (landed exactly on cup)
      const isEagle = isBirdie && remaining === 0;
      // Double Eagle: eagle AND previous hole was also birdie-completed (tracked by caller if needed)
      // We detect it here as: started from tee of previous hole, passed through that cup, now cupping next hole
      const isDoubleEagle = isEagle && holeJustStarted && startedFromTee;

      // Par: no penalty strokes regardless of peghole count
      // (built in: if penaltyStrokes > 0, it can't be birdie anyway)

      const finalStrokes = score.currentHoleStrokes;

      // Finishing bonus: first player to finish hole 18 gets −2 strokes
      let bonusAdjust = 0;
      if (isFirstFinisher && cupHoleNumber === 18) {
        bonusAdjust = -2;
      }

      const holeScore: HoleScore = {
        holeNumber: cupHoleNumber,
        par: hole.par,
        strokes: finalStrokes + bonusAdjust,
        relativeToPar: finalStrokes + bonusAdjust - hole.par,
        penaltyStrokes: Math.max(0, totalPenaltyThisHole),
        hazardTypes: hazardTypesThisHole,
        isBirdie,
        isEagle,
        isDoubleEagle,
        startedFromTee: cuppedFromTee,
      };

      movement.holesCompleted.push(cupHoleNumber);

      const nextHoleNum = score.currentHole + 1;
      const finished = score.holesCompleted + 1 >= 18;

      score = {
        ...score,
        holeScores: [...score.holeScores, holeScore],
        totalStrokes: score.totalStrokes + holeScore.strokes,
        totalRelativeToPar: score.totalRelativeToPar + holeScore.relativeToPar,
        holesCompleted: score.holesCompleted + 1,
        currentHoleStrokes: 0,
        currentPegholeIndex: 0,
        currentPathId: 'A',
        selectedPaths: finished
          ? score.selectedPaths
          : { ...score.selectedPaths, [nextHoleNum]: score.selectedPaths[nextHoleNum] ?? 'A' },
        pendingPathChoiceHole: finished ? null : nextHoleNum,
        isFinished: finished,
        currentHole: finished ? 18 : nextHoleNum,
      };

      // Reset per-hole tracking for the next hole
      totalPenaltyThisHole = 0;
      hazardTypesThisHole = [];
      triggeredThisHole = new Set<number>();
      holeJustStarted = true;
    }
  }

  movement.toHole = score.currentHole;
  movement.toPegholeIndex = score.currentPegholeIndex;
  movement.toPathId = score.currentPathId;

  return { updated: score, movement };
}
