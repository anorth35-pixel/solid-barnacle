import type { Card } from '@cribbgolf/shared';
import styles from './CardComponent.module.css';

const SUIT_SYMBOLS: Record<string, string> = {
  clubs: '♣', diamonds: '♦', hearts: '♥', spades: '♠',
};
const RED_SUITS = new Set(['hearts', 'diamonds']);

interface Props {
  card: Card;
  faceDown?: boolean;
  selected?: boolean;
  selectable?: boolean;
  onClick?: () => void;
  small?: boolean;
}

export default function CardComponent({ card, faceDown, selected, selectable, onClick, small }: Props) {
  if (faceDown) {
    return (
      <div className={`${styles.card} ${styles.back} ${small ? styles.small : ''}`} onClick={onClick} />
    );
  }

  const isRed = RED_SUITS.has(card.suit);
  return (
    <div
      className={[
        styles.card,
        isRed ? styles.red : styles.black,
        selected ? styles.selected : '',
        selectable ? styles.selectable : '',
        small ? styles.small : '',
      ].join(' ')}
      onClick={selectable ? onClick : undefined}
    >
      <span className={styles.rankTop}>{card.rank}</span>
      <span className={styles.suit}>{SUIT_SYMBOLS[card.suit]}</span>
      <span className={styles.rankBottom}>{card.rank}</span>
    </div>
  );
}
