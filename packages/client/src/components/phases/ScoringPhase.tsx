import { useEffect, useState, useCallback, useRef } from 'react';
import type { ScoreBreakdown } from '@cribbgolf/shared';
import { useGameStore } from '../../store/game-store.js';
import styles from './ScoringPhase.module.css';

const PLAYER_COLORS = ['#1565c0', '#c62828', '#2e7d32'];

const ITEM_DELAY_MS = 1100; // time between each revealed item

interface Props {
  breakdowns: ScoreBreakdown[];
}

export default function ScoringPhase({ breakdowns }: Props) {
  const { gameState, currentScoringBreakdown, commitPendingGolfScores, pendingGolfScores } = useGameStore();

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

  // Auto-reveal items one at a time; stop when all shown (button takes over)
  useEffect(() => {
    if (!breakdown || revealedCount >= items.length) return;
    const t = setTimeout(() => setRevealedCount((c) => c + 1), ITEM_DELAY_MS);
    return () => clearTimeout(t);
  }, [revealedCount, items.length, breakdown]);

  // Tap the feed area to skip item reveal (does NOT commit the peg)
  const handleSkip = useCallback(() => {
    if (revealedCount < items.length) setRevealedCount(items.length);
  }, [revealedCount, items.length]);

  // Explicit button to move peg and continue
  const handleContinue = useCallback((e: React.MouseEvent) => {
    e.stopPropagation(); // don't also trigger handleSkip
    commitPendingGolfScores();
    setPegCommitted(true);
  }, [commitPendingGolfScores]);

  const runningTotal = items.slice(0, revealedCount).reduce((s, i) => s + i.points, 0);
  const allRevealed = revealedCount >= items.length;
  const isZeroScore = items.length === 0;

  if (!breakdown) {
    return (
      <div className={styles.wrapper}>
        <p className={styles.waiting}>Scoring in progress…</p>
      </div>
    );
  }

  const color = PLAYER_COLORS[playerSeat] ?? '#ccc';

  return (
    <div className={styles.wrapper} onClick={handleSkip} role="presentation">
      {/* Header */}
      <div className={styles.header}>
        <span className={styles.phaseBadge}>
          {gameState?.phase === 'crib-scoring' ? 'Crib' : 'Hand'}
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

      {/* Footer: skip hint → continue button → peg status */}
      <div className={styles.footer}>
        {pegCommitted ? (
          pendingGolfScores === null ? (
            <span className={styles.statusDone}>⛳ Peg moved</span>
          ) : (
            <span className={styles.statusMoving}>⛳ Moving peg…</span>
          )
        ) : allRevealed ? (
          <button className={styles.continueBtn} onClick={handleContinue}>
            Move Peg ⛳
          </button>
        ) : (
          <span className={styles.hint}>tap to skip ahead</span>
        )}
      </div>
    </div>
  );
}
