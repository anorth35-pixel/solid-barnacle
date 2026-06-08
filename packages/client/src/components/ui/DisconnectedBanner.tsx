import { useGameStore } from '../../store/game-store.js';
import styles from './DisconnectedBanner.module.css';

export default function DisconnectedBanner() {
  const { disconnectedSeats, gameState } = useGameStore();
  if (!disconnectedSeats.length || !gameState) return null;

  const names = disconnectedSeats.map((s) => gameState.players[s]?.name ?? `Player ${s + 1}`);

  return (
    <div className={styles.banner}>
      ⚠️ {names.join(', ')} disconnected — waiting to reconnect…
    </div>
  );
}
