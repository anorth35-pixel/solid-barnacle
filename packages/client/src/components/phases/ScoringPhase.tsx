import { useEffect, useState, useCallback, useRef } from 'react';
import type { ScoreBreakdown } from '@cribbgolf/shared';
import { useGameStore } from '../../store/game-store.js';
import CardComponent from '../cards/CardComponent.js';
import styles from './ScoringPhase.module.css';

const PLAYER_COLORS = ['#1565c0', '#c62828', '#2e7d32'];

interface Props {
  breakdowns: ScoreBreakdown[];
}

export default function ScoringPhase({ breakdowns }: Props) {
  const {
    gameState, mySeat,
    currentScoringBreakdown, currentScoringHand,
    commitPendingGolfScores, pendingGolfScores,
    setPendingPathChoice,
  } = useGameStore();

  const breakdown = currentScoringBreakdown ?? breakdowns[breakdowns.length - 1];
  const items = breakdown?.items ?? [];

  const [revealedCount, setRevealedCount] = useState(0);
  const [pegCommitted, setPegCommitted] = useState(false);

  const players = gameState?.players ?? [];
  const playerSeat = players.findIndex((p) => p.id === breakdown?.playerId);
  const player = players[playerSeat];

  // Reset when a new breakdown arrives
  const breakdownKey = `${breakdown?.playerId ?? ''}-${items.length}`;
  const prevKeyRef = useRef(breakdownKey);
  if (prevKeyRef.current !== breakdownKey) {
    prevKeyRef.current = breakdownKey;
    setRevealedCount(0);
    setPegCommitted(false);
  }

  const allRevealed = revealedCount >= items.length;
  const isZeroScore = items.length === 0;

  // After all items shown, open path choice for MY seat if needed (before Move Peg)
  const myPendingPathHole = (mySeat !== null && pendingGolfScores)
    ? (pendingGolfScores[mySeat] as any)?.pendingPathChoiceHole ?? null
    : null;

  useEffect(() => {
    if (!allRevealed || pegCommitted || myPendingPathHole == null) return;
    setPendingPathChoice({ holeNumber: myPendingPathHole });
  }, [allRevealed, pegCommitted, myPendingPathHole, setPendingPathChoice]);

  // Reveal next item on button click
  const handleNext = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (revealedCount < items.length) setRevealedCount((c) => c + 1);
  }, [revealedCount, items.length]);

  // Tap feed area to reveal ALL remaining items at once
  const handleSkip = useCallback(() => {
    if (revealedCount < items.length) setRevealedCount(items.length);
  }, [revealedCount, items.length]);

  // Commit peg movement
  const handleMovePeg = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    commitPendingGolfScores();
    setPegCommitted(true);
  }, [commitPendingGolfScores]);

  const runningTotal = items.slice(0, revealedCount).reduce((s, i) => s + i.points, 0);

  if (!breakdown) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.waiting}>Scoring in progress…</p>
      </div>
    );
  }

  const color = PLAYER_COLORS[playerSeat] ?? '#ccc';
  const handCards = currentScoringHand?.handCards ?? [];
  const starterCard = currentScoringHand?.starterCard ?? gameState?.starterCard ?? null;
  const isCrib = currentScoringHand?.isCrib ?? false;

  return (
    <div className={styles.wrapper} onClick={handleSkip} role="presentation">
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.phaseBadge}>
          {isCrib ? 'Crib' : 'Hand'}
        </span>
        <span className={styles.playerName} style={{ color }}>
          {player?.name ?? 'Player'}
        </span>
        <span className={styles.runningTotal}>
          {revealedCount > 0 || isZeroScore
            ? `${isZeroScore ? 0 : runningTotal} pts`
            : ''}
        </span>
      </div>

      {/* Hand cards display */}
      {handCards.length > 0 && (
        <div className={styles.handDisplay} onClick={(e) => e.stopPropagation()}>
          {handCards.map((c) => (
            <CardComponent key={c.id} card={c} small />
          ))}
          {starterCard && (
            <>
              <span className={styles.starterSep}>|</span>
              <CardComponent card={starterCard} small />
            </>
          )}
        </div>
      )}

      {/* Reveal feed */}
      <div className={styles.feed}>
        {isZeroScore && (
          <div className={styles.feedItem}>
            <span className={styles.itemDesc}>No score</span>
            <span className={styles.itemPts} style={{ color: '#888' }}>+0</span>
          </div>
        )}
        {items.slice(0, revealedCount).map((item, i) => (
          <div key={i} className={styles.feedItem}>
            <span className={styles.itemDesc}>{item.description}</span>
            <span className={styles.itemPts}>+{item.points}</span>
          </div>
        ))}
      </div>

      {/* Action buttons */}
      <div className={styles.footer}>
        {pegCommitted ? (
          pendingGolfScores === null ? (
            <span className={styles.statusDone}>⛳ Peg moved</span>
          ) : (
            <span className={styles.statusMoving}>⛳ Moving peg…</span>
          )
        ) : allRevealed ? (
          myPendingPathHole != null ? (
            <span className={styles.pathHint}>Choose your path for hole {myPendingPathHole} →</span>
          ) : (
            <button className={styles.continueBtn} onClick={handleMovePeg}>
              Move Peg ⛳
            </button>
          )
        ) : (
          <button className={styles.nextBtn} onClick={handleNext}>
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
