import { useGameStore } from '../../store/game-store.js';
import GolfCourseBoard from '../board/GolfCourseBoard.js';
import DiscardPhase from '../phases/DiscardPhase.js';
import PeggingPhase from '../phases/PeggingPhase.js';
import ScoringPhase from '../phases/ScoringPhase.js';
import MugginsOverlay from '../scoring/MugginsOverlay.js';
import GameOverModal from '../scoring/GameOverModal.js';
import styles from './GamePage.module.css';

export default function GamePage() {
  const { gameState, myHand, mySeat, mugginsWindow, lastBreakdowns } = useGameStore();

  if (!gameState) {
    return <div className={styles.loading}>Connecting to game…</div>;
  }

  const { phase, players, golfScores, course } = gameState;
  const playerNames = players.map((p) => p.name);

  return (
    <div className={styles.page}>
      <div className={styles.boardSection}>
        <GolfCourseBoard course={course} golfScores={golfScores} playerNames={playerNames} />
      </div>

      <div className={styles.phaseSection}>
        {(phase === 'discarding') && <DiscardPhase />}
        {phase === 'pegging' && <PeggingPhase />}
        {(phase === 'hand-scoring' || phase === 'crib-scoring') && (
          <ScoringPhase breakdowns={lastBreakdowns} />
        )}
        {phase === 'dealing' && (
          <div className={styles.dealing}>⛳ Dealing cards…</div>
        )}
        {phase === 'cutting' && (
          <CutPhase />
        )}
      </div>

      <div className={styles.playerBar}>
        {players.map((p, i) => (
          <div
            key={p.id}
            className={[
              styles.playerBadge,
              p.seat === gameState.activePlayerSeat ? styles.active : '',
              p.seat === mySeat ? styles.me : '',
            ].join(' ')}
          >
            <span className={styles.playerDot} style={{ background: ['#1565c0', '#c62828', '#2e7d32'][i] }} />
            <span>{p.name}</span>
            <span className={styles.scoreChip}>
              {golfScores[i]
                ? (golfScores[i].totalRelativeToPar >= 0
                  ? `+${golfScores[i].totalRelativeToPar}`
                  : golfScores[i].totalRelativeToPar)
                : 'E'}
            </span>
            <span className={styles.holeChip}>Hole {golfScores[i]?.currentHole ?? 1}</span>
          </div>
        ))}
      </div>

      {mugginsWindow && <MugginsOverlay />}
      {phase === 'game-over' && <GameOverModal />}
    </div>
  );
}

function CutPhase() {
  const { gameState, mySeat } = useGameStore();

  function handleCut() {
    const pos = Math.floor(Math.random() * 40) + 5;
    import('../../socket/socket-client.js').then(({ getSocket }) => {
      getSocket().emit('game:cut', { position: pos });
    });
  }

  const pone = gameState
    ? (((gameState.dealerSeat + 1) % gameState.config.playerCount) as typeof mySeat)
    : null;
  const isMyTurn = mySeat === pone;

  return (
    <div className={styles.cutPhase}>
      <h3>Cut the Deck</h3>
      {gameState?.starterCard ? (
        <p>Starter card: {gameState.starterCard.rank}{gameState.starterCard.suit[0].toUpperCase()}</p>
      ) : (
        <button className="btn-primary" onClick={handleCut} disabled={!isMyTurn}>
          {isMyTurn ? 'Cut the Deck' : 'Waiting for pone to cut…'}
        </button>
      )}
    </div>
  );
}
