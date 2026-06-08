import type { GolfHole, PegMovement, PegholeType } from '../types/board.js';
import type { PlayerGolfScore, HoleScore } from '../types/golf-score.js';
import { applyHazard, isHazard } from './hazards.js';
import { getPlayerPath } from './course.js';

export function advancePeg(
  golfScore: PlayerGolfScore,
  points: number,
  holes: GolfHole[],
): { updated: PlayerGolfScore; movement: PegMovement } {
  const startPath = getPlayerPath(holes[golfScore.currentHole - 1], golfScore.selectedPaths);

  const movement: PegMovement = {
    playerId: golfScore.playerId,
    fromHole: golfScore.currentHole,
    fromPegholeIndex: golfScore.currentPegholeIndex,
    fromPathId: startPath.id,
    toHole: golfScore.currentHole,
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
  let remaining = points;

  while (remaining > 0 && !score.isFinished) {
    const hole = holes[score.currentHole - 1];
    if (!hole) break;

    const path = getPlayerPath(hole, score.selectedPaths);
    const nextIndex = score.currentPegholeIndex + 1;
    if (nextIndex >= path.pegholes.length) break; // already at cup

    const nextPeghole = path.pegholes[nextIndex];

    remaining--;
    score = { ...score, currentHoleStrokes: score.currentHoleStrokes + 1 };

    if (isHazard(nextPeghole)) {
      const result = applyHazard(nextPeghole, nextIndex);
      movement.hazardsHit.push({ peghole: nextPeghole, result });
      score = {
        ...score,
        currentHoleStrokes: score.currentHoleStrokes + result.penaltyStrokes,
        currentPegholeIndex: result.retreatToIndex ?? nextIndex,
        currentPathId: path.id,
      };
    } else {
      score = { ...score, currentPegholeIndex: nextIndex, currentPathId: path.id };
    }

    // Hole complete when peg reaches the cup (last peghole)
    if (score.currentPegholeIndex >= path.pegholes.length - 1) {
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

      const nextHole = score.currentHole + 1;
      const finished = score.holesCompleted + 1 >= 18;

      score = {
        ...score,
        holeScores: [...score.holeScores, holeScore],
        totalStrokes: score.totalStrokes + score.currentHoleStrokes,
        totalRelativeToPar: score.totalRelativeToPar + holeScore.relativeToPar,
        holesCompleted: score.holesCompleted + 1,
        currentHoleStrokes: 0,
        currentPegholeIndex: 0,
        currentPathId: 'A',
        // Pre-seed next hole with path A so advancement works immediately;
        // human players may override via game:choose-path before their next scoring event
        selectedPaths: finished
          ? score.selectedPaths
          : { ...score.selectedPaths, [nextHole]: score.selectedPaths[nextHole] ?? 'A' },
        // Signal to the server that this player should be prompted for a path choice
        pendingPathChoiceHole: finished ? null : nextHole,
        isFinished: finished,
        currentHole: finished ? 18 : nextHole,
      };
    }
  }

  movement.toHole = score.currentHole;
  movement.toPegholeIndex = score.currentPegholeIndex;
  movement.toPathId = score.currentPathId;

  return { updated: score, movement };
}
