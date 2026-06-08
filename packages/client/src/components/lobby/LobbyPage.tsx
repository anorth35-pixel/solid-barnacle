import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../../socket/socket-client.js';
import { useGameStore } from '../../store/game-store.js';
import type { GameConfig } from '@cribbgolf/shared';
import styles from './LobbyPage.module.css';

export default function LobbyPage() {
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [playerCount, setPlayerCount] = useState<2 | 3>(2);
  const [muggins, setMuggins] = useState(true);
  const navigate = useNavigate();
  const { room, roomCode, setRoom } = useGameStore();

  function handleCreate() {
    if (!name.trim()) return;
    const config: Partial<GameConfig> = { playerCount, mugginsEnabled: muggins, mode: 'remote' };
    getSocket().emit('room:create', { playerName: name.trim(), config });
    getSocket().once('room:created', ({ roomCode: rc, room: r }: any) => {
      setRoom(r, rc);
      navigate(`/room/${rc}`);
    });
  }

  function handleJoin() {
    if (!name.trim() || !code.trim()) return;
    getSocket().emit('room:join', { roomCode: code.trim().toUpperCase(), playerName: name.trim() });
  }

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <h1 className={styles.title}>⛳ CribbGolf</h1>
        <p className={styles.subtitle}>Cribbage meets the golf course</p>
      </div>

      <div className="card" style={{ maxWidth: 440, margin: '0 auto' }}>
        <div className={styles.tabs}>
          <button
            className={tab === 'create' ? styles.tabActive : styles.tab}
            onClick={() => setTab('create')}
          >
            Create Room
          </button>
          <button
            className={tab === 'join' ? styles.tabActive : styles.tab}
            onClick={() => setTab('join')}
          >
            Join Room
          </button>
        </div>

        <div className={styles.form}>
          <label>Your Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
          />

          {tab === 'create' && (
            <>
              <label>Players</label>
              <div className={styles.toggleRow}>
                {([2, 3] as const).map((n) => (
                  <button
                    key={n}
                    className={playerCount === n ? styles.toggleActive : styles.toggle}
                    onClick={() => setPlayerCount(n)}
                  >
                    {n} Players
                  </button>
                ))}
              </div>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={muggins} onChange={(e) => setMuggins(e.target.checked)} />
                Muggins rule enabled
              </label>
              <button className="btn-primary" style={{ width: '100%' }} onClick={handleCreate} disabled={!name.trim()}>
                Create Room
              </button>
            </>
          )}

          {tab === 'join' && (
            <>
              <label>Room Code</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="6-letter code"
                maxLength={6}
                style={{ textTransform: 'uppercase', letterSpacing: '0.2em' }}
              />
              <button className="btn-primary" style={{ width: '100%' }} onClick={handleJoin}
                disabled={!name.trim() || code.length !== 6}>
                Join Room
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
