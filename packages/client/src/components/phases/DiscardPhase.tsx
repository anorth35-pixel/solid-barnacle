import { useState } from 'react';
import { useGameStore } from '../../store/game-store.js';
import { getSocket } from '../../socket/socket-client.js';
import Hand from '../cards/Hand.js';
import type { Card } from '@cribbgolf/shared';
import styles from './DiscardPhase.module.css';

export default function DiscardPhase() {
  const { myHand, gameState, mySeat, setMyHand } = useGameStore();
  const [selected, setSelected] = useState<Card[]>([]);
  const [discarded, setDiscarded] = useState(false);

  const discardCount = gameState?.config.playerCount === 2 ? 2 : 1;
  const isDealer = mySeat === gameState?.dealerSeat;

  function handleDiscard() {
    if (selected.length !== discardCount || discarded) return;
    const ids = new Set(selected.map((c) => c.id));
    getSocket().emit('game:discard', { cardIds: [...ids] });
    setMyHand(myHand.filter((c) => !ids.has(c.id)));
    setDiscarded(true);
  }

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.heading}>
        Discard {discardCount} card{discardCount > 1 ? 's' : ''} to{' '}
        {isDealer ? 'your' : "dealer's"} crib
      </h3>
      <Hand
        cards={myHand}
        selectable
        maxSelect={discardCount}
        onSelect={setSelected}
        label="Your hand"
      />
      <button
        className="btn-primary"
        disabled={selected.length !== discardCount || discarded}
        onClick={handleDiscard}
      >
        {discarded ? 'Waiting…' : `Discard ${selected.length}/${discardCount}`}
      </button>
    </div>
  );
}
