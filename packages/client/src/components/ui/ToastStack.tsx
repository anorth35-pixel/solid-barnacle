import { AnimatePresence, motion } from 'framer-motion';
import { useGameStore, type Toast } from '../../store/game-store.js';
import styles from './ToastStack.module.css';

const ICONS: Record<Toast['type'], string> = {
  hazard: '⚠️',
  'hole-complete': '⛳',
  birdie: '🐦',
  eagle: '🦅',
  info: 'ℹ️',
};

export default function ToastStack() {
  const { toasts, dismissToast } = useGameStore();

  return (
    <div className={styles.stack}>
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            className={`${styles.toast} ${styles[toast.type]}`}
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            onClick={() => dismissToast(toast.id)}
          >
            <span className={styles.icon}>{ICONS[toast.type]}</span>
            <div className={styles.content}>
              <span className={styles.message}>{toast.message}</span>
              {toast.sub && <span className={styles.sub}>{toast.sub}</span>}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
