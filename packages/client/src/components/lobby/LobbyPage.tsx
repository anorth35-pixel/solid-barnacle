import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getSocket } from '../../socket/socket-client.js';
import { useGameStore } from '../../store/game-store.js';
import type { GameConfig, AIDifficulty, StakeType } from '@cribbgolf/shared';
import styles from './LobbyPage.module.css';

const ALL_STAKES: { id: StakeType; label: string; desc: string }[] = [
  { id: 'skins',   label: 'Skins',   desc: 'Win a hole outright to claim the skin' },
  { id: 'nassau',  label: 'Nassau',  desc: 'Three bets: front 9, back 9, overall' },
  { id: 'sandies', label: 'Sandies', desc: 'Par or better after hitting sand' },
  { id: 'barkies', label: 'Barkies', desc: 'Par or better after hitting trees' },
  { id: 'greenies',label: 'Greenies',desc: 'First to reach the green on par 3s' },
];

type Tab = 'create' | 'join' | 'ai' | 'board';

export default function LobbyPage() {
  const [tab, setTab] = useState<Tab>('ai');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [playerCount, setPlayerCount] = useState<2 | 3>(2);
  const [muggins, setMuggins] = useState(true);
  const [manualScoring, setManualScoring] = useState(false);
  const [aiDifficulty, setAIDifficulty] = useState<AIDifficulty>('medium');
  const [aiCount, setAICount] = useState<1 | 2>(1);
  const [enabledStakes, setEnabledStakes] = useState<StakeType[]>([]);
  const [boardPlayerCount, setBoardPlayerCount] = useState<2 | 3>(2);
  const [boardPlayerNames, setBoardPlayerNames] = useState(['', '']);
  const [stakeValues, setStakeValues] = useState<Partial<Record<StakeType, number>>>({
    skins: 1, nassau: 1, sandies: 1, barkies: 1, greenies: 1,
  });

  function toggleStake(id: StakeType) {
    setEnabledStakes((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function stakesConfig() {
    if (enabledStakes.length === 0) return undefined;
    const unitValues: Partial<Record<StakeType, number>> = {};
    for (const s of enabledStakes) {
      unitValues[s] = Math.max(0.25, stakeValues[s] ?? 1);
    }
    return { enabled: enabledStakes, unitValues };
  }

  function setStakeValue(id: StakeType, val: number) {
    setStakeValues(prev => ({ ...prev, [id]: Math.max(0.25, val) }));
  }
  const navigate = useNavigate();
  const { setRoom, setMySeat } = useGameStore();

  function handleCreate() {
    if (!name.trim()) return;
    const config: Partial<GameConfig> = {
      playerCount, mugginsEnabled: muggins, manualScoring, mode: 'remote',
      stakesConfig: stakesConfig(),
    };
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

  function handleBoardOnly() {
    if (!name.trim() || boardPlayerNames.some(n => !n.trim())) return;
    const allNames = [name.trim(), ...boardPlayerNames.slice(0, boardPlayerCount - 1).map(n => n.trim())];
    const config: Partial<GameConfig> = {
      playerCount: boardPlayerCount,
      mugginsEnabled: false,
      manualScoring: false,
      mode: 'board-only',
      stakesConfig: stakesConfig(),
    };
    getSocket().emit('room:create', { playerName: allNames[0], config });
    getSocket().once('room:created', ({ roomCode: rc, room: r }: any) => {
      setRoom(r, rc);
      setMySeat(0);
      getSocket().emit('game:start', {});
    });
  }

  function handleVsAI() {
    if (!name.trim()) return;
    const totalPlayers = (1 + aiCount) as 2 | 3;
    const config: Partial<GameConfig> = {
      playerCount: totalPlayers,
      mugginsEnabled: muggins,
      manualScoring,
      mode: 'vs-ai',
      aiDifficulty,
      stakesConfig: stakesConfig(),
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
    { id: 'board', label: '📋 Board Only' },
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
              <label className={styles.checkRow}>
                <input type="checkbox" checked={manualScoring} onChange={(e) => setManualScoring(e.target.checked)} />
                Manual point counting
              </label>

              <label className={styles.stakesLabel}>Optional Stakes</label>
              <div className={styles.stakesGrid}>
                {ALL_STAKES.map((s) => (
                  <label key={s.id} className={styles.stakeRow} title={s.desc}>
                    <input
                      type="checkbox"
                      checked={enabledStakes.includes(s.id)}
                      onChange={() => toggleStake(s.id)}
                    />
                    <span className={styles.stakeName}>{s.label}</span>
                    <span className={styles.stakeDesc}>{s.desc}</span>
                    {enabledStakes.includes(s.id) && (
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={stakeValues[s.id] ?? 1}
                        onClick={e => e.stopPropagation()}
                        onChange={e => { e.stopPropagation(); setStakeValue(s.id, parseFloat(e.target.value) || 0.25); }}
                        className={styles.stakeValueInput}
                      />
                    )}
                  </label>
                ))}
              </div>

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
              <label className={styles.checkRow}>
                <input type="checkbox" checked={manualScoring} onChange={(e) => setManualScoring(e.target.checked)} />
                Manual point counting
              </label>

              <label className={styles.stakesLabel}>Optional Stakes</label>
              <div className={styles.stakesGrid}>
                {ALL_STAKES.map((s) => (
                  <label key={s.id} className={styles.stakeRow} title={s.desc}>
                    <input
                      type="checkbox"
                      checked={enabledStakes.includes(s.id)}
                      onChange={() => toggleStake(s.id)}
                    />
                    <span className={styles.stakeName}>{s.label}</span>
                    <span className={styles.stakeDesc}>{s.desc}</span>
                    {enabledStakes.includes(s.id) && (
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={stakeValues[s.id] ?? 1}
                        onClick={e => e.stopPropagation()}
                        onChange={e => { e.stopPropagation(); setStakeValue(s.id, parseFloat(e.target.value) || 0.25); }}
                        className={styles.stakeValueInput}
                      />
                    )}
                  </label>
                ))}
              </div>

              <button className="btn-primary" style={{ width: '100%' }} onClick={handleCreate}
                disabled={!name.trim()}>
                Create Room
              </button>
            </>
          )}

          {tab === 'board' && (
            <>
              <p className={styles.boardDesc}>
                Use the app as a scorecard while you deal physical cards.
                Enter each player's name and award points manually during play.
              </p>

              <label>Players at the table</label>
              <div className={styles.toggleRow}>
                {([2, 3] as const).map((n) => (
                  <button key={n}
                    className={boardPlayerCount === n ? styles.toggleActive : styles.toggle}
                    onClick={() => setBoardPlayerCount(n)}>
                    {n} Players
                  </button>
                ))}
              </div>

              <label>Player 1 (you)</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" maxLength={20} />

              {Array.from({ length: boardPlayerCount - 1 }, (_, i) => (
                <div key={i}>
                  <label>Player {i + 2}</label>
                  <input
                    value={boardPlayerNames[i] ?? ''}
                    onChange={e => {
                      const next = [...boardPlayerNames];
                      next[i] = e.target.value;
                      setBoardPlayerNames(next);
                    }}
                    placeholder={`Player ${i + 2} name`}
                    maxLength={20}
                  />
                </div>
              ))}

              <label className={styles.stakesLabel}>Optional Stakes</label>
              <div className={styles.stakesGrid}>
                {ALL_STAKES.map((s) => (
                  <label key={s.id} className={styles.stakeRow} title={s.desc}>
                    <input type="checkbox" checked={enabledStakes.includes(s.id)} onChange={() => toggleStake(s.id)} />
                    <span className={styles.stakeName}>{s.label}</span>
                    <span className={styles.stakeDesc}>{s.desc}</span>
                    {enabledStakes.includes(s.id) && (
                      <input
                        type="number"
                        min="0.25"
                        step="0.25"
                        value={stakeValues[s.id] ?? 1}
                        onClick={e => e.stopPropagation()}
                        onChange={e => { e.stopPropagation(); setStakeValue(s.id, parseFloat(e.target.value) || 0.25); }}
                        className={styles.stakeValueInput}
                      />
                    )}
                  </label>
                ))}
              </div>

              <button className="btn-primary" style={{ width: '100%' }} onClick={handleBoardOnly}
                disabled={!name.trim() || boardPlayerNames.slice(0, boardPlayerCount - 1).some(n => !n.trim())}>
                Start Board Game
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
