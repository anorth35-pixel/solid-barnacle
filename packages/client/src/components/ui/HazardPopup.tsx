import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../../store/game-store.js';
import styles from './HazardPopup.module.css';

const HAZARD_INFO: Record<string, { emoji: string; label: string; color: string; bg: string }> = {
  rough:           { emoji: '🌿', label: 'Rough',          color: '#8bc34a', bg: 'rgba(26,45,16,0.98)' },
  trees:           { emoji: '🌲', label: 'Trees',          color: '#558b2f', bg: 'rgba(13,31,10,0.98)' },
  sand:            { emoji: '🏖️', label: 'Sand Trap',      color: '#f9a825', bg: 'rgba(45,34,0,0.98)'  },
  water:           { emoji: '💧', label: 'Water Hazard',   color: '#29b6f6', bg: 'rgba(10,31,45,0.98)' },
  'out-of-bounds': { emoji: '🚫', label: 'Out of Bounds',  color: '#ef5350', bg: 'rgba(45,10,10,0.98)' },
  'three-putt':    { emoji: '⛳', label: 'Three-Putt',     color: '#ff7043', bg: 'rgba(45,16,0,0.98)'  },
};

const OUTCOME_LABELS: Record<string, string> = {
  'advance3-strokeoff': 'Lucky! Advance 3, −1 stroke',
  'advance1':           'Safe! Advance 1 peghole',
  'stay-penalty':       'Unlucky. Stay put, +1 stroke',
};

export default function HazardPopup() {
  const { pendingHazardPopup, setPendingHazardPopup } = useGameStore();

  useEffect(() => {
    if (!pendingHazardPopup) return;
    const t = setTimeout(() => setPendingHazardPopup(null), 5000);
    return () => clearTimeout(t);
  }, [pendingHazardPopup, setPendingHazardPopup]);

  const data = pendingHazardPopup;
  const info = data
    ? (HAZARD_INFO[data.hazardType] ?? { emoji: '⚠️', label: data.hazardType, color: '#ff9800', bg: 'rgba(26,18,0,0.98)' })
    : null;

  return (
    <AnimatePresence>
      {data && info && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => setPendingHazardPopup(null)}
        >
          <motion.div
            className={styles.card}
            style={{ borderColor: info.color, background: info.bg }}
            initial={{ scale: 0.7, y: 50, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.88, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.hazardEmoji}>{info.emoji}</div>
            <div className={styles.hazardName} style={{ color: info.color }}>{info.label}</div>

            {data.diceRoll && (
              <div className={styles.diceRow}>
                <span className={styles.die}>{data.diceRoll[0]}</span>
                <span className={styles.dicePlus}>+</span>
                <span className={styles.die}>{data.diceRoll[1]}</span>
                <span className={styles.diceEq}>= {data.diceRoll[0] + data.diceRoll[1]}</span>
              </div>
            )}

            <div
              className={styles.outcome}
              style={{
                color: data.diceOutcome === 'advance3-strokeoff' ? '#81c784'
                     : data.diceOutcome === 'stay-penalty'       ? '#ef5350'
                     : 'rgba(255,255,255,0.85)',
              }}
            >
              {data.diceOutcome
                ? OUTCOME_LABELS[data.diceOutcome] ?? data.diceOutcome
                : data.description}
            </div>

            {data.penaltyStrokes > 0 && (
              <div className={styles.penalty} style={{ color: info.color }}>
                +{data.penaltyStrokes} stroke{data.penaltyStrokes > 1 ? 's' : ''}
              </div>
            )}

            <button
              className={styles.dismissBtn}
              style={{ borderColor: info.color + '80', color: info.color }}
              onClick={() => setPendingHazardPopup(null)}
            >
              Got it
            </button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
