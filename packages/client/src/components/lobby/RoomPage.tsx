import { useParams } from 'react-router-dom';
import { getSocket } from '../../socket/socket-client.js';
import { useGameStore } from '../../store/game-store.js';
import styles from './RoomPage.module.css';

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const { room, mySeat } = useGameStore();

  const myPlayer = room?.players.find((p) => p.seat === mySeat);
  const isHost = myPlayer?.isHost ?? false;
  const allReady = room?.players.length === room?.config.playerCount
    && room?.players.every((p) => p.ready || p.isHost);

  function toggleReady() {
    const ready = !(myPlayer?.ready ?? false);
    getSocket().emit('room:ready', { ready });
  }

  function startGame() {
    getSocket().emit('game:start', {});
  }

  return (
    <div className={styles.container}>
      <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
        <h2 className={styles.heading}>Room: <span className={styles.code}>{code}</span></h2>
        <p className={styles.hint}>Share this code with friends to join</p>

        <div className={styles.players}>
          {Array.from({ length: room?.config.playerCount ?? 2 }).map((_, i) => {
            const p = room?.players.find((pl) => pl.seat === i);
            return (
              <div key={i} className={styles.playerSlot}>
                {p ? (
                  <>
                    <span className={styles.playerName}>{p.name} {p.isHost ? '(host)' : ''}</span>
                    <span className={p.ready ? styles.readyBadge : styles.waitingBadge}>
                      {p.ready || p.isHost ? 'Ready' : 'Waiting'}
                    </span>
                  </>
                ) : (
                  <span className={styles.emptySlot}>Waiting for player…</span>
                )}
              </div>
            );
          })}
        </div>

        <div className={styles.actions}>
          {!isHost && (
            <button className={myPlayer?.ready ? 'btn-secondary' : 'btn-primary'} onClick={toggleReady}>
              {myPlayer?.ready ? 'Not Ready' : 'Ready'}
            </button>
          )}
          {isHost && (
            <button className="btn-primary" onClick={startGame}
              disabled={!allReady || (room?.players.length ?? 0) < (room?.config.playerCount ?? 2)}>
              Start Game
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
