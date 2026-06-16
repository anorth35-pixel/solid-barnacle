import { useState } from 'react';
import { useGameStore } from '../../store/game-store.js';
import { getSocket } from '../../socket/socket-client.js';
import type { PendingDeclaration } from '../../store/game-store.js';
import CardComponent from '../cards/CardComponent.js';
import styles from './ScoreDeclarationModal.module.css';

interface Props {
  declaration: PendingDeclaration;
}

export default function ScoreDeclarationModal({ declaration }: Props) {
  const [points, setPoints] = useState(0);
  const { setPendingDeclaration } = useGameStore();

  function submit() {
    getSocket().emit('game:declare-score', { declaredPoints: points });
    setPendingDeclaration(null);
  }

  const title = declaration.isCrib ? 'Count your crib' : 'Count your hand';
  const subtitle = declaration.isCrib
    ? 'How many points do you count in your crib?'
    : 'How many points do you count in your hand?';

  return (
    <div className={styles.overlay}>
      <div className={styles.dialog}>
        <h3 className={styles.title}>{title}</h3>
        <p className={styles.subtitle}>{subtitle}</p>

        <div className={styles.cards}>
          <div className={styles.cardGroup}>
            {declaration.hand.map((c) => (
              <CardComponent key={c.id} card={c} />
            ))}
          </div>
          <div className={styles.starterSep}>+</div>
          <div className={styles.cardGroup}>
            <CardComponent card={declaration.starterCard} />
          </div>
        </div>

        <div className={styles.counter}>
          <button
            className={styles.adj}
            onClick={() => setPoints((p) => Math.max(0, p - 1))}
            disabled={points === 0}
          >−</button>
          <span className={styles.pointDisplay}>{points}</span>
          <button
            className={styles.adj}
            onClick={() => setPoints((p) => Math.min(29, p + 1))}
          >+</button>
        </div>
        <p className={styles.hint}>Tap +/− to set your point total, then confirm.</p>

        <button className={styles.confirm} onClick={submit}>
          Confirm — {points} point{points !== 1 ? 's' : ''}
        </button>
      </div>
    </div>
  );
}
