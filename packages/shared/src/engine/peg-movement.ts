import type { GolfHole, PegMovement, PegholeType } from '../types/board.js';
import type { PlayerGolfScore, HoleScore } from '../types/golf-score.js';
import { applyHazard, isHazard } from './hazards.js';

export function advancePeg(
  golfScore: PlayerGolfScore,
  points: number,
  holes: GolfHole[],
): { updated: PlayerGolfScore; movement: PegMovement } {
  const movement: PegMovement = {
    playerId: golfScore.playerId,
    fromHole: golfScore.currentHole,
    fromPegholeIndex: golfScore.currentPegholeIndex,
    toHole: golfScore.currentHole,
    toPegholeIndex: golfScore.currentPegholeIndex,
    pointsUsed: points,
    hazardsHit: [],
    holesCompleted: [],
  };

  let score = {
    ...golfScore,
    holeScores: [...golfScore.holeScores],
  };
  let remaining = points;

  while (remaining > 0 && !score.isFinished) {
    const hole = holes[score.currentHole - 1];
    if (!hole) break;

    const nextIndex = score.currentPegholeIndex + 1;
    if (nextIndex >= hole.pegholes.length) break;  // already at cup

    const nextPeghole = hole.pegholes[nextIndex];

    // Spend 1 cribbage point to move to this peghole
    remaining--;
    score = { ...score, currentHoleStrokes: score.currentHoleStrokes + 1 };

    if (isHazard(nextPeghole)) {
      const result = applyHazard(nextPeghole, nextIndex);
      movement.hazardsHit.push({ peghole: nextPeghole, result });
      // Penalty strokes counted against the hole (don't cost cribbage points, just add to score)
      score = {
        ...score,
        currentHoleStrokes: score.currentHoleStrokes + result.penaltyStrokes,
        currentPegholeIndex: result.retreatToIndex ?? nextIndex,
      };
    } else {
      score = { ...score, currentPegholeIndex: nextIndex };
    }

    // Hole complete: landed at or past the cup (last peghole in the sequence)
    if (score.currentPegholeIndex >= hole.pegholes.length - 1) {
      const hazardTypes = movement.hazardsHit
        .filter((h) => h.peghole.holeNumber === hole.number)
        .map((h) => h.peghole.type as PegholeType);
      const penaltyStrokes = movement.hazardsHit
        .filter((h) => h.peghole.holeNumber === hole.number)
        .reduce((s, h) => s + h.result.penaltyStrokes, 0);

      const holeScore: HoleScore = {
        holeNumber: hole.number,
        par: hole.par,
        strokes: score.currentHoleStrokes,
        relativeToPar: score.currentHoleStrokes - hole.par,
        hazardPenalties: penaltyStrokes,
        hazardTypes,
      };

      movement.holesCompleted.push(hole.number);
      score = {
        ...score,
        holeScores: [...score.holeScores, holeScore],
        totalStrokes: score.totalStrokes + score.currentHoleStrokes,
        totalRelativeToPar: score.totalRelativeToPar + holeScore.relativeToPar,
        holesCompleted: score.holesCompleted + 1,
        currentHoleStrokes: 0,
        currentPegholeIndex: 0,
      };

      if (score.holesCompleted >= 18) {
        score = { ...score, isFinished: true, currentHole: 18 };
      } else {
        score = { ...score, currentHole: score.currentHole + 1 };
      }
    }
  }

  movement.toHole = score.currentHole;
  movement.toPegholeIndex = score.currentPegholeIndex;

  return { updated: score, movement };
}
