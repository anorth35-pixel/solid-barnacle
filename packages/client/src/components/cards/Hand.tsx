import { useState } from 'react';
import type { Card } from '@cribbgolf/shared';
import CardComponent from './CardComponent.js';
import styles from './Hand.module.css';

interface Props {
  cards: Card[];
  selectable?: boolean;
  maxSelect?: number;
  onSelect?: (selected: Card[]) => void;
  label?: string;
}

export default function Hand({ cards, selectable, maxSelect, onSelect, label }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(card: Card) {
    if (!selectable) return;
    const next = new Set(selected);
    if (next.has(card.id)) {
      next.delete(card.id);
    } else if (!maxSelect || next.size < maxSelect) {
      next.add(card.id);
    }
    setSelected(next);
    onSelect?.(cards.filter((c) => next.has(c.id)));
  }

  return (
    <div className={styles.wrapper}>
      {label && <div className={styles.label}>{label}</div>}
      <div className={styles.hand}>
        {cards.map((card) => (
          <CardComponent
            key={card.id}
            card={card}
            selectable={selectable}
            selected={selected.has(card.id)}
            onClick={() => toggle(card)}
          />
        ))}
      </div>
    </div>
  );
}
