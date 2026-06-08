import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../../socket/socket-client.js';
import { useGameStore } from '../../store/game-store.js';
import type { GameConfig, AIDifficulty } from '@cribbgolf/shared';
import styles from './LobbyPage.module.css';

type Tab = 'create' | 'join' | 'ai';

export default function LobbyPage() {
  const [tab, setTab] = useState<Tab>('ai');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [playerCount, setPlayerCount] = useState<2 | 3>(2);
  const [muggins, setMuggins] = useState(true);
  const [aiDifficulty, setAIDifficulty] = useState<AIDifficulty>('medium');
  const [aiCount, setAICount] = useState<1 | 2>(1);
  const navigate = useNavigate();
  const { setRoom, setMySeat } = useGameStore();

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
    if (!name.trim() || code.length !== 6) return;
    getSocket().emit('room:join', { roomCode: code.toUpperCase(), playerName: name.trim() });
  }

  function handleVsAI() {
    if (!name.trim()) return;
    const totalPlayers = (1 + aiCount) as 2 | 3;
    const config: Partial<GameConfig> = {
      playerCount: totalPlayers,
      mugginsEnabled: muggins,
      mode: 'vs-ai',
      aiDifficulty,
    };
    getSocket().emit('room:create', { playerName: name.trim(), config });
    getSocket().once('room:created', ({ roomCode: rc, room: r }: any) => {
      setRoom(r, rc);
      setMySeat(0);
      // Start the game immediately — AI fills the remaining seat(s)
      getSocket().emit('game:start', {});
    });
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'ai', label: '🤖 vs AI' },
    { id: 'create', label: '🏠 Create Room' },
    { id: 'join', label: '🚪 Join Room' },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.hero}>
        <h1 className={styles.title}>⛳ CribbGolf</h1>
        <p className={styles.subtitle}>Cribbage meets the golf course</p>
      </div>

      <div className="card" style={{ maxWidth: 460, margin: '0 auto' }}>
        <div className={styles.tabs}>
          {tabs.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? styles.tabActive : styles.tab}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.form}>
          <label>Your Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your name"
            maxLength={20}
            onKeyDown={(e) => e.key === 'Enter' && (tab === 'ai' ? handleVsAI() : tab === 'create' ? handleCreate() : handleJoin())}
          />

          {tab === 'ai' && (
            <>
              <label>Opponents</label>
              <div className={styles.toggleRow}>
                {([1, 2] as const).map((n) => (
                  <button key={n} className={aiCount === n ? styles.toggleActive : styles.toggle}
                    onClick={() => setAICount(n)}>
                    {n} Computer
                  </button>
                ))}
              </div>

              <label>AI Difficulty</label>
              <div className={styles.toggleRow}>
                {(['easy', 'medium', 'hard'] as AIDifficulty[]).map((d) => (
                  <button key={d} className={aiDifficulty === d ? styles.toggleActive : styles.toggle}
                    onClick={() => setAIDifficulty(d)} style={{ textTransform: 'capitalize' }}>
                    {d}
                  </button>
                ))}
              </div>

              <label className={styles.checkRow}>
                <input type="checkbox" checked={muggins} onChange={(e) => setMuggins(e.target.checked)} />
                Muggins rule
              </label>

              <button className="btn-primary" style={{ width: '100%' }} onClick={handleVsAI}
                disabled={!name.trim()}>
                Play vs Computer
              </button>
            </>
          )}

          {tab === 'create' && (
            <>
              <label>Players</label>
              <div className={styles.toggleRow}>
                {([2, 3] as const).map((n) => (
                  <button key={n} className={playerCount === n ? styles.toggleActive : styles.toggle}
                    onClick={() => setPlayerCount(n)}>
                    {n} Players
                  </button>
                ))}
              </div>
              <label className={styles.checkRow}>
                <input type="checkbox" checked={muggins} onChange={(e) => setMuggins(e.target.checked)} />
                Muggins rule
              </label>
              <button className="btn-primary" style={{ width: '100%' }} onClick={handleCreate}
                disabled={!name.trim()}>
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
