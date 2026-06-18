import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore } from '../../store/game-store.js';
import styles from './HoleCompletePopup.module.css';

const TERM_STYLE: Record<string, { color: string; glow: string }> = {
  'Double Eagle': { color: '#ffd54f', glow: '0 0 60px rgba(255,213,79,0.7), 0 0 120px rgba(255,213,79,0.4)' },
  'Albatross':    { color: '#ffd54f', glow: '0 0 60px rgba(255,213,79,0.7), 0 0 120px rgba(255,213,79,0.4)' },
  'Eagle':        { color: '#ffd54f', glow: '0 0 40px rgba(255,213,79,0.6), 0 0 80px rgba(255,213,79,0.3)'  },
  'Birdie':       { color: '#81c784', glow: '0 0 40px rgba(129,199,132,0.6), 0 0 80px rgba(129,199,132,0.3)' },
  'Par':          { color: '#ffffff', glow: '0 0 20px rgba(255,255,255,0.3)' },
  'Bogey':        { color: '#ff8a65', glow: '0 0 20px rgba(255,138,101,0.3)' },
  'Double Bogey': { color: '#ef5350', glow: '0 0 20px rgba(239,83,80,0.3)'   },
};

function termStyle(term: string, rel: number) {
  if (TERM_STYLE[term]) return TERM_STYLE[term];
  if (rel >= 3) return { color: '#c62828', glow: '0 0 20px rgba(198,40,40,0.3)' };
  return { color: '#fff', glow: '' };
}

export default function HoleCompletePopup() {
  const { pendingHolePopup, setPendingHolePopup } = useGameStore();

  useEffect(() => {
    if (!pendingHolePopup) return;
    const t = setTimeout(() => setPendingHolePopup(null), 3500);
    return () => clearTimeout(t);
  }, [pendingHolePopup, setPendingHolePopup]);

  const data = pendingHolePopup;
  const ts = data ? termStyle(data.term, data.relativeToPar) : null;

  const relStr = data
    ? (data.relativeToPar === 0 ? 'E' : data.relativeToPar > 0 ? `+${data.relativeToPar}` : `${data.relativeToPar}`)
    : '';

  return (
    <AnimatePresence>
      {data && ts && (
        <motion.div
          className={styles.overlay}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          onClick={() => setPendingHolePopup(null)}
        >
          <motion.div
            className={styles.content}
            initial={{ scale: 0.45, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 1.1, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 22 }}
          >
            <div className={styles.emoji}>{data.emoji}</div>

            <div
              className={styles.term}
              style={{ color: ts.color, textShadow: ts.glow }}
            >
              {data.term}
            </div>

            <div className={styles.holeInfo}>
              Hole {data.holeNumber} · {data.strokes} strokes · par {data.par}
            </div>

            <div className={styles.relScore} style={{ color: ts.color }}>
              {relStr}
            </div>

            <div className={styles.tapHint}>tap to dismiss</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
