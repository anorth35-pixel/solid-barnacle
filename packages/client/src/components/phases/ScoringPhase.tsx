import { useEffect, useState, useCallback, useRef } from 'react';
import type { ScoreBreakdown } from '@cribbgolf/shared';
import { useGameStore } from '../../store/game-store.js';
import styles from './ScoringPhase.module.css';

const PLAYER_COLORS = ['#1565c0', '#c62828', '#2e7d32'];

const ITEM_DELAY_MS = 1100;   // time between each revealed item
const COMMIT_DELAY_MS = 700;  // pause after last item before peg animates

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

  // Stable key so effect resets when a new breakdown arrives
  const breakdownKey = `${breakdown?.playerId ?? ''}-${items.length}`;
  const prevKeyRef = useRef(breakdownKey);

  if (prevKeyRef.current !== breakdownKey) {
    prevKeyRef.current = breakdownKey;
    // Synchronous reset before first render with new breakdown
    setRevealedCount(0);
    setPegCommitted(false);
  }

  // Auto-advance: reveal one item at a time, then commit peg
  useEffect(() => {
    if (!breakdown) return;

    if (revealedCount < items.length) {
      const t = setTimeout(() => setRevealedCount((c) => c + 1), ITEM_DELAY_MS);
      return () => clearTimeout(t);
    }

    // All items shown — commit the held golfScores to trigger peg animation
    if (!pegCommitted) {
      const t = setTimeout(() => {
        commitPendingGolfScores();
        setPegCommitted(true);
      }, COMMIT_DELAY_MS);
      return () => clearTimeout(t);
    }
  }, [revealedCount, items.length, pegCommitted, breakdown, commitPendingGolfScores]);

  // Tap anywhere to skip straight to the end
  const handleSkip = useCallback(() => {
    if (pegCommitted) return;
    setRevealedCount(items.length);
  }, [items.length, pegCommitted]);

  const runningTotal = items.slice(0, revealedCount).reduce((s, i) => s + i.points, 0);
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
          {pegCommitted
            ? `${breakdown.total} pts`
            : revealedCount > 0
            ? `${runningTotal} pts`
            : ''}
        </span>
      </div>

      {/* Reveal feed */}
      <div className={styles.feed}>
        {isZeroScore && revealedCount === 0 && (
          <div className={styles.feedItem} key="zero">
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

      {/* Footer status */}
      <div className={styles.footer}>
        {pegCommitted ? (
          pendingGolfScores === null ? (
            <span className={styles.statusDone}>⛳ Peg moved</span>
          ) : (
            <span className={styles.statusMoving}>⛳ Moving peg…</span>
          )
        ) : revealedCount < items.length ? (
          <span className={styles.hint}>tap to skip</span>
        ) : null}
      </div>
    </div>
  );
}
