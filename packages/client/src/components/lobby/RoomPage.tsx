import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getSocket } from '../../socket/socket-client.js';
import { useGameStore } from '../../store/game-store.js';
import styles from './RoomPage.module.css';

export default function RoomPage() {
  const { code } = useParams<{ code: string }>();
  const { room, mySeat, setRoom, setMySeat, reset } = useGameStore();
  const navigate = useNavigate();
  const [joinName, setJoinName] = useState('');
  const [joinError, setJoinError] = useState('');
  const [joining, setJoining] = useState(false);
  const [copied, setCopied] = useState(false);

  const inRoom = room?.code === code;
  const myPlayer = inRoom ? room?.players.find((p) => p.seat === mySeat) : null;
  const isHost = myPlayer?.isHost ?? false;
  const allReady = room?.players.length === room?.config.playerCount
    && room?.players.every((p) => p.ready || p.isHost);

  // Auto-start once all players are ready (host triggers it)
  useEffect(() => {
    if (isHost && allReady && (room?.players.length ?? 0) >= (room?.config.playerCount ?? 2)) {
      getSocket().emit('game:start', {});
    }
  }, [isHost, allReady, room?.players.length]);

  // Auto-join: listen for room:joined while on this page
  useEffect(() => {
    if (inRoom) return;
    const socket = getSocket();
    function onJoined({ room: r, yourSeat }: any) {
      setRoom(r);
      setMySeat(yourSeat);
      setJoining(false);
    }
    function onError({ message }: { message: string }) {
      setJoinError(message);
      setJoining(false);
    }
    socket.on('room:joined', onJoined);
    socket.on('room:error', onError);
    return () => {
      socket.off('room:joined', onJoined);
      socket.off('room:error', onError);
    };
  }, [inRoom]);

  function handleJoin() {
    if (!joinName.trim()) return;
    setJoinError('');
    setJoining(true);
    getSocket().emit('room:join', { roomCode: code!.toUpperCase(), playerName: joinName.trim() });
  }

  function toggleReady() {
    const ready = !(myPlayer?.ready ?? false);
    getSocket().emit('room:ready', { ready });
  }

  function startGame() {
    getSocket().emit('game:start', {});
  }

  function handleLeave() {
    getSocket().emit('room:leave');
    reset();
    navigate('/');
  }

  function handleCopyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  // ── Not yet in the room — show join form ──────────────────────────────────
  if (!inRoom) {
    return (
      <div className={styles.container}>
        <div className="card" style={{ maxWidth: 400, margin: '0 auto' }}>
          <h2 className={styles.heading}>Join Room <span className={styles.code}>{code}</span></h2>
          <p className={styles.hint}>Enter your name to join this game</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--gray-dark)' }}>Your Name</label>
            <input
              value={joinName}
              onChange={e => { setJoinName(e.target.value); setJoinError(''); }}
              placeholder="Enter your name"
              maxLength={20}
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
            />
            {joinError && (
              <p style={{ color: '#ef5350', fontSize: '0.85rem', margin: 0, fontWeight: 600 }}>
                ⚠️ {joinError}
              </p>
            )}
            <button className="btn-primary" onClick={handleJoin}
              disabled={!joinName.trim() || joining}>
              {joining ? 'Joining…' : 'Join Game'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── In the room — waiting room view ──────────────────────────────────────
  return (
    <div className={styles.container}>
      <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
        <div className={styles.header}>
          <button className={styles.backBtn} onClick={handleLeave}>← Back to Lobby</button>
          <h2 className={styles.heading}>Room: <span className={styles.code}>{code}</span></h2>
        </div>
        <div className={styles.copyRow}>
          <p className={styles.hint}>Share this link with friends to join</p>
          <button className={styles.copyBtn} onClick={handleCopyLink}>
            {copied ? '✓ Copied!' : '📋 Copy Link'}
          </button>
        </div>

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
          {isHost && !allReady && (
            <p style={{ color: 'var(--gray)', fontSize: '0.9rem', margin: 0 }}>
              Waiting for all players to ready up…
            </p>
          )}
          {isHost && allReady && (
            <p style={{ color: 'var(--green-dark)', fontSize: '0.9rem', fontWeight: 700, margin: 0 }}>
              Starting game…
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
