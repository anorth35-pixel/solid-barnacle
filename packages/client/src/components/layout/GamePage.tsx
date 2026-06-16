import { useGameStore } from '../../store/game-store.js';
import { getSocket } from '../../socket/socket-client.js';
import GolfCourseBoard from '../board/GolfCourseBoard.js';
import PathChoiceDialog from '../board/PathChoiceDialog.js';
import DiscardPhase from '../phases/DiscardPhase.js';
import PeggingPhase from '../phases/PeggingPhase.js';
import ScoringPhase from '../phases/ScoringPhase.js';
import StarterCard from '../cards/StarterCard.js';
import MugginsOverlay from '../scoring/MugginsOverlay.js';
import ScoreDeclarationModal from '../scoring/ScoreDeclarationModal.js';
import GameOverModal from '../scoring/GameOverModal.js';
import ToastStack from '../ui/ToastStack.js';
import DisconnectedBanner from '../ui/DisconnectedBanner.js';
import styles from './GamePage.module.css';

export default function GamePage() {
  const { gameState, mySeat, mugginsWindow, lastBreakdowns, pendingPathChoice, setPendingPathChoice, pendingDeclaration } = useGameStore();

  if (!gameState) {
    return <div className={styles.loading}>Connecting to game…</div>;
  }

  const { phase, players, golfScores, course, starterCard, stakesState, config } = gameState;
  const playerNames = players.map((p) => p.name);
  const playerIds = players.map((p) => p.id);
  const showStarter = starterCard && ['pegging', 'hand-scoring', 'crib-scoring'].includes(phase);

  return (
    <div className={styles.page}>
      <DisconnectedBanner />

      <div className={styles.boardSection}>
        <GolfCourseBoard
          course={course}
          golfScores={golfScores}
          playerNames={playerNames}
          playerIds={playerIds}
          mySeat={mySeat}
          onChoosePath={(holeNumber) => setPendingPathChoice({ holeNumber })}
          stakesState={stakesState}
          stakesConfig={config.stakesConfig}
        />
      </div>

      <div className={styles.phaseSection}>
        {showStarter && (
          <div className={styles.starterArea}>
            <StarterCard card={starterCard} />
          </div>
        )}

        {phase === 'dealing' && (
          <div className={styles.dealing}>⛳ Dealing cards…</div>
        )}
        {phase === 'discarding' && <DiscardPhase key={gameState.roundNumber} />}
        {phase === 'cutting' && <CutPhase />}
        {phase === 'pegging' && <PeggingPhase />}
        {(phase === 'hand-scoring' || phase === 'crib-scoring') && (
          <ScoringPhase breakdowns={lastBreakdowns} />
        )}
        {phase === 'round-end' && (
          <div className={styles.dealing}>Starting next round…</div>
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
            <span className={styles.playerName}>{p.name}{p.type === 'ai' ? ' 🤖' : ''}</span>
            <span className={styles.scoreChip}>
              {golfScores[i]
                ? (golfScores[i].totalRelativeToPar >= 0
                    ? `+${golfScores[i].totalRelativeToPar}`
                    : `${golfScores[i].totalRelativeToPar}`)
                : 'E'}
            </span>
            <span className={styles.holeChip}>H{golfScores[i]?.currentHole ?? 1}</span>
          </div>
        ))}
      </div>

      {mugginsWindow && <MugginsOverlay />}
      {pendingDeclaration && <ScoreDeclarationModal declaration={pendingDeclaration} />}
      {phase === 'game-over' && <GameOverModal />}
      {pendingPathChoice && (
        <PathChoiceDialog
          holeNumber={pendingPathChoice.holeNumber}
          hole={course.holes[pendingPathChoice.holeNumber - 1]}
        />
      )}
      <ToastStack />
    </div>
  );
}

function CutPhase() {
  const { gameState, mySeat } = useGameStore();

  function handleCut() {
    const pos = Math.floor(Math.random() * 35) + 5;
    getSocket().emit('game:cut', { position: pos });
  }

  const pone = gameState
    ? (((gameState.dealerSeat + 1) % gameState.config.playerCount) as typeof mySeat)
    : null;
  const isMyTurn = mySeat === pone;

  return (
    <div className={styles.cutPhase}>
      <h3>Cut the Deck</h3>
      {gameState?.starterCard ? (
        <p>Starter revealed — waiting for pegging…</p>
      ) : (
        <button className="btn-primary" onClick={handleCut} disabled={!isMyTurn}>
          {isMyTurn ? '✂️ Cut the Deck' : 'Waiting for opponent to cut…'}
        </button>
      )}
    </div>
  );
}
