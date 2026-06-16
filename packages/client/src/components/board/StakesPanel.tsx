import type { StakesState, StakesConfig } from '@cribbgolf/shared';
import styles from './StakesPanel.module.css';

const PLAYER_COLORS = ['#1565c0', '#c62828', '#2e7d32'];

interface Props {
  stakesState: StakesState;
  stakesConfig: StakesConfig;
  playerNames: string[];
  playerIds: string[];
}

function playerLabel(playerId: string | null, playerIds: string[], playerNames: string[], colors: string[]) {
  if (!playerId) return null;
  const idx = playerIds.indexOf(playerId);
  if (idx === -1) return <span>{playerId}</span>;
  return <span style={{ color: colors[idx], fontWeight: 700 }}>{playerNames[idx]}</span>;
}

export default function StakesPanel({ stakesState, stakesConfig, playerNames, playerIds }: Props) {
  const enabled = stakesConfig.enabled;
  if (!enabled.length) return null;

  const colors = PLAYER_COLORS;

  return (
    <details className={styles.panel}>
      <summary className={styles.toggle}>
        <span>Stakes</span>
        <span className={styles.badge}>
          {enabled.join(' · ')}
          {stakesConfig.unitValue !== 1 || true
            ? ` · $${stakesConfig.unitValue.toFixed(stakesConfig.unitValue % 1 === 0 ? 0 : 2)}/unit`
            : ''}
        </span>
      </summary>

      <div className={styles.body}>

        {/* Skins */}
        {enabled.includes('skins') && stakesState.skins.length > 0 && (
          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>Skins</h4>
            <div className={styles.skinGrid}>
              {stakesState.skins.map((s) => (
                <div key={s.holeNumber} className={styles.skinCell}>
                  <span className={styles.skinHole}>#{s.holeNumber}</span>
                  {s.winnerPlayerId
                    ? playerLabel(s.winnerPlayerId, playerIds, playerNames, colors)
                    : <span className={styles.carry}>→ carry</span>
                  }
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Nassau */}
        {enabled.includes('nassau') && (
          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>Nassau</h4>
            <div className={styles.nassauRow}>
              <span className={styles.nassauLabel}>Front 9</span>
              <span>{playerLabel(stakesState.nassau.front9WinnerId, playerIds, playerNames, colors) ?? <span className={styles.tbd}>TBD</span>}</span>
            </div>
            <div className={styles.nassauRow}>
              <span className={styles.nassauLabel}>Back 9</span>
              <span>{playerLabel(stakesState.nassau.back9WinnerId, playerIds, playerNames, colors) ?? <span className={styles.tbd}>TBD</span>}</span>
            </div>
            <div className={styles.nassauRow}>
              <span className={styles.nassauLabel}>Overall</span>
              <span>{playerLabel(stakesState.nassau.overallWinnerId, playerIds, playerNames, colors) ?? <span className={styles.tbd}>TBD</span>}</span>
            </div>
          </section>
        )}

        {/* Sandies */}
        {enabled.includes('sandies') && (
          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>🏖️ Sandies</h4>
            {stakesState.sandies.length === 0
              ? <span className={styles.none}>None yet</span>
              : stakesState.sandies.filter(b => b.achieved).map((b, i) => (
                  <div key={i} className={styles.betRow}>
                    {playerLabel(b.playerId, playerIds, playerNames, colors)} — Hole {b.holeNumber}
                  </div>
                ))
            }
          </section>
        )}

        {/* Barkies */}
        {enabled.includes('barkies') && (
          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>🌲 Barkies</h4>
            {stakesState.barkies.length === 0
              ? <span className={styles.none}>None yet</span>
              : stakesState.barkies.filter(b => b.achieved).map((b, i) => (
                  <div key={i} className={styles.betRow}>
                    {playerLabel(b.playerId, playerIds, playerNames, colors)} — Hole {b.holeNumber}
                  </div>
                ))
            }
          </section>
        )}

        {/* Greenies */}
        {enabled.includes('greenies') && (
          <section className={styles.section}>
            <h4 className={styles.sectionTitle}>🟢 Greenies</h4>
            {stakesState.greenies.length === 0
              ? <span className={styles.none}>None yet</span>
              : stakesState.greenies.filter(b => b.achieved).map((b, i) => (
                  <div key={i} className={styles.betRow}>
                    {playerLabel(b.playerId, playerIds, playerNames, colors)} — Hole {b.holeNumber}
                  </div>
                ))
            }
          </section>
        )}

      </div>
    </details>
  );
}
