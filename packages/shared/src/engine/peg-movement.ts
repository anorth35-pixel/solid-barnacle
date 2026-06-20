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

    if (isHazard(nextPeghole) && remaining === 0 && !triggeredThisHole.has(nextIndex)) {
      triggeredThisHole.add(nextIndex);
      const result = applyHazard(
        nextPeghole,
        nextIndex,
        // OOB retreats to action-start within the current hole
        actionStartHole === score.currentHole ? actionStartIndex : 0,
      );
      movement.hazardsHit.push({ peghole: nextPeghole, result });

      const penaltyStrokes = result.penaltyStrokes;
      // Track net penalty strokes (negative from lucky dice, positive from hazards)
      totalPenaltyThisHole += penaltyStrokes;
      score = { ...score, currentHoleStrokes: score.currentHoleStrokes + penaltyStrokes };

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

      // Birdie: started at tee of this hole AND completed it in this action with no net penalty
      const isBirdie = cuppedFromTee && totalPenaltyThisHole <= 0;
      // Eagle: started at tee, landed EXACTLY on cup (remaining = 0), no net penalty
      const isEagle = isBirdie && remaining === 0;
      // Double Eagle: action started from tee of a previous hole, entered this hole mid-action,
      // and landed exactly on the cup with no net penalty on this hole.
      const isDoubleEagle = startedFromTee && holeJustStarted && remaining === 0 && totalPenaltyThisHole <= 0;

      // Scoring model:
      //   Par = 0 penalty strokes (no hazard penalties, regardless of how many scoring events)
      //   Birdie = −1 (completed whole hole in one scoring action from tee, no net penalty)
      //   Eagle  = −2 (started at tee, landed exactly on cup, one action)
      //   Double Eagle = −3 (eagle spanning two consecutive holes in one action)
      //   Bogey+ = net positive penalty strokes from hazards
      const birdieEagleBonus = isDoubleEagle ? -3 : isEagle ? -2 : isBirdie ? -1 : 0;
      const netPenalty = score.currentHoleStrokes; // only hazard penalties remain (no advance counting)

      // Finishing bonus: first player to finish hole 18 gets −2 strokes
      let bonusAdjust = 0;
      if (isFirstFinisher && cupHoleNumber === 18) {
        bonusAdjust = -2;
      }

      const relToPar = netPenalty + birdieEagleBonus + bonusAdjust;
      const holeScore: HoleScore = {
        holeNumber: cupHoleNumber,
        par: hole.par,
        strokes: hole.par + relToPar,
        relativeToPar: relToPar,
        penaltyStrokes: Math.max(0, netPenalty),
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
