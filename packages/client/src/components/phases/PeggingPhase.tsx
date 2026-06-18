import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGameStore } from '../../store/game-store.js';
import { getSocket } from '../../socket/socket-client.js';
import CardComponent from '../cards/CardComponent.js';
import type { Card } from '@cribbgolf/shared';
import { canPlayCard } from '@cribbgolf/shared';
import styles from './PeggingPhase.module.css';

const PLAYER_COLORS = ['#1565c0', '#c62828', '#2e7d32'];

export default function PeggingPhase() {
  const { myHand, gameState, mySeat } = useGameStore();
  const [scorePopup, setScorePopup] = useState<string | null>(null);

  if (!gameState) return null;
  const { pegging, activePlayerSeat, players } = gameState;
  const isMyTurn = activePlayerSeat === mySeat;
  const myPlayer = players.find((p) => p.seat === mySeat);

  const unplayed = myHand.filter(
    (c) => !myPlayer?.playedCards.some((p) => p.id === c.id),
  );

  const deadPiles = players
    .map((p) => ({
      name: p.name,
      seat: p.seat as number,
      cards: p.playedCards.filter((c) => !pegging.playStack.some((s) => s.id === c.id)),
    }))
    .filter((pile) => pile.cards.length > 0);

  function playCard(card: Card) {
    if (!isMyTurn || !canPlayCard(card, pegging.runningCount)) return;
    getSocket().emit('game:peg', { cardId: card.id });
  }

  function callGo() {
    getSocket().emit('game:go', {});
  }

  const canPlay = unplayed.some((c) => canPlayCard(c, pegging.runningCount));

  return (
    <div className={styles.wrapper}>
      <div className={styles.countDisplay}>
        <span className={styles.countLabel}>Running count</span>
        <span className={styles.count}>{pegging.runningCount}</span>
        <span className={styles.countOf}> / 31</span>
      </div>

      {deadPiles.length > 0 && (
        <div>
          <p className={styles.deadLabel}>Played</p>
          {deadPiles.map((pile) => (
            <div key={pile.seat} className={styles.deadPileRow}>
              <span
                className={styles.deadPileOwner}
                style={{ color: PLAYER_COLORS[pile.seat] ?? '#ccc' }}
              >
                {pile.name}
              </span>
              <div className={styles.deadPile}>
                {pile.cards.map((card) => (
                  <CardComponent key={card.id} card={card} small />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={styles.playStack}>
        <AnimatePresence>
          {pegging.playStack.map((card, i) => (
            <motion.div
              key={card.id}
              initial={{ y: -30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <CardComponent card={card} small />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {isMyTurn && !canPlay && (
        <button className="btn-secondary" onClick={callGo}>
          Go (no playable card)
        </button>
      )}

      {isMyTurn && (
        <div className={styles.turnIndicator}>Your turn</div>
      )}

      <div className={styles.handRow}>
        {unplayed.map((card) => {
          const playable = isMyTurn && canPlayCard(card, pegging.runningCount);
          return (
            <CardComponent
              key={card.id}
              card={card}
              selectable={playable}
              onClick={() => playCard(card)}
            />
          );
        })}
      </div>

      {!isMyTurn && activePlayerSeat !== null && (
        <p className={styles.waiting}>
          Waiting for {players[activePlayerSeat]?.name}…
        </p>
      )}
    </div>
  );
}
