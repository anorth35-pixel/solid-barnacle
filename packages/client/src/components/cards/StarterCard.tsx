import { motion } from 'framer-motion';
import type { Card } from '@cribbgolf/shared';
import CardComponent from './CardComponent.js';
import styles from './StarterCard.module.css';

interface Props {
  card: Card | null;
}

export default function StarterCard({ card }: Props) {
  if (!card) return null;
  return (
    <motion.div
      className={styles.wrapper}
      initial={{ rotateY: 90, opacity: 0 }}
      animate={{ rotateY: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className={styles.label}>Starter</div>
      <CardComponent card={card} />
    </motion.div>
  );
}
