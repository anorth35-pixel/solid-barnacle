import type { GolfHole, PegMovement } from '../types/board.js';
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

  let score = { ...golfScore, holeScores: [...golfScore.holeScores] };
  let remainingPoints = points;

  while (remainingPoints > 0 && !score.isFinished) {
    const holeIndex = score.currentHole - 1;
    const hole = holes[holeIndex];
    if (!hole) break;

    const nextIndex = score.currentPegholeIndex + 1;
    if (nextIndex >= hole.pegholes.length) {
      // Already at cup, shouldn't happen but guard
      break;
    }

    const nextPeghole = hole.pegholes[nextIndex];
    remainingPoints--;

    if (isHazard(nextPeghole)) {
      const result = applyHazard(nextPeghole, nextIndex);
      movement.hazardsHit.push({ peghole: nextPeghole, result });
      score = {
        ...score,
        totalStrokes: score.totalStrokes + 1 + result.penaltyStrokes,
        currentPegholeIndex: result.retreatToIndex ?? nextIndex,
      };
    } else {
      score = {
        ...score,
        totalStrokes: score.totalStrokes + 1,
        currentPegholeIndex: nextIndex,
      };
    }

    // Check if hole completed (landed on or past cup)
    if (score.currentPegholeIndex >= hole.pegholes.length - 1) {
      const holeScore: HoleScore = buildHoleScore(hole, score.totalStrokes, movement.hazardsHit.map((h) => h.peghole.type as any));
      score = {
        ...score,
        holeScores: [...score.holeScores, holeScore],
        totalRelativeToPar: score.totalRelativeToPar + holeScore.relativeToPar,
        holesCompleted: score.holesCompleted + 1,
        currentPegholeIndex: 0,
      };
      movement.holesCompleted.push(score.currentHole);

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

function buildHoleScore(
  hole: GolfHole,
  totalStrokesAtEnd: number,
  _hazardTypes: any[],
): HoleScore {
  // We need strokes just for this hole — this is tracked separately in a real impl
  // For now use a simplified version that counts pegholes traversed
  const strokes = hole.totalPegholes;
  return {
    holeNumber: hole.number,
    par: hole.par,
    strokes,
    relativeToPar: strokes - hole.par,
    hazardPenalties: 0,
    hazardTypes: [],
  };
}
