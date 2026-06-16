import { useState } from 'react';
import { useGameStore } from '../../store/game-store.js';
import { getSocket } from '../../socket/socket-client.js';
import styles from './BoardOnlyPhase.module.css';

const PLAYER_COLORS = ['#1565c0', '#c62828', '#2e7d32'];
const QUICK_PTS = [1, 2, 3, 4, 5, 6, 8, 12, 16, 24, 29];

export default function BoardOnlyPhase() {
  const { gameState, mySeat } = useGameStore();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [points, setPoints] = useState<number | ''>('');
  const [lastAwarded, setLastAwarded] = useState<{ name: string; pts: number } | null>(null);

  if (!gameState) return null;

  const { players, golfScores, dealerSeat } = gameState;

  function award(pts: number) {
    if (!selectedPlayerId || pts < 1) return;
    getSocket().emit('game:manual-points', { playerId: selectedPlayerId, points: pts });
    const name = players.find(p => p.id === selectedPlayerId)?.name ?? '';
    setLastAwarded({ name, pts });
    setPoints('');
  }

  const selectedGs = golfScores.find(gs => gs.playerId === selectedPlayerId);

  return (
    <div className={styles.container}>
      <h3 className={styles.heading}>Award Points</h3>

      {/* Player selector */}
      <div className={styles.playerRow}>
        {players.map((p, i) => {
          const gs = golfScores.find(g => g.playerId === p.id);
          const isDealer = i === dealerSeat;
          return (
            <button
              key={p.id}
              className={`${styles.playerBtn} ${selectedPlayerId === p.id ? styles.playerBtnActive : ''}`}
              style={{ '--player-color': PLAYER_COLORS[i] } as React.CSSProperties}
              onClick={() => setSelectedPlayerId(p.id)}
            >
              <span className={styles.playerName}>{p.name}</span>
              {isDealer && <span className={styles.dealerBadge}>D</span>}
              <span className={styles.playerHole}>
                Hole {gs?.currentHole ?? 1} · {
                  gs && gs.totalRelativeToPar !== 0
                    ? (gs.totalRelativeToPar > 0 ? `+${gs.totalRelativeToPar}` : gs.totalRelativeToPar)
                    : 'E'
                }
              </span>
            </button>
          );
        })}
      </div>

      {selectedPlayerId && (
        <>
          {/* Quick-tap buttons */}
          <div className={styles.quickGrid}>
            {QUICK_PTS.map(n => (
              <button key={n} className={styles.quickBtn} onClick={() => award(n)}>
                +{n}
              </button>
            ))}
          </div>

          {/* Custom amount */}
          <div className={styles.customRow}>
            <input
              type="number"
              min={1}
              max={29}
              value={points}
              placeholder="Custom…"
              className={styles.customInput}
              onChange={e => setPoints(e.target.value === '' ? '' : parseInt(e.target.value) || '')}
              onKeyDown={e => { if (e.key === 'Enter' && points !== '') award(Number(points)); }}
            />
            <button
              className={styles.awardBtn}
              disabled={points === '' || Number(points) < 1}
              onClick={() => points !== '' && award(Number(points))}
            >
              Award
            </button>
          </div>
        </>
      )}

      {!selectedPlayerId && (
        <p className={styles.hint}>Tap a player above to award them points.</p>
      )}

      {lastAwarded && (
        <p className={styles.lastAwarded}>
          Last: +{lastAwarded.pts} pts → {lastAwarded.name}
        </p>
      )}
    </div>
  );
}
