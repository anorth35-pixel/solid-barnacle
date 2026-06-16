import { useNavigate } from 'react-router-dom';
import { useGameStore } from '../../store/game-store.js';
import { getGolfTermForScore, holesNotCompletedPenalty } from '@cribbgolf/shared';
import type { HoleScore } from '@cribbgolf/shared';
import styles from './GameOverModal.module.css';

const PLAYER_COLORS = ['#1565c0', '#c62828', '#2e7d32'];
const MEDALS = ['🥇', '🥈', '🥉'];

function relStr(rel: number) {
  return rel === 0 ? 'E' : rel > 0 ? `+${rel}` : `${rel}`;
}

function ScoreNotation({ hs }: { hs: HoleScore }) {
  const { strokes, relativeToPar: rel, isBirdie, isEagle, isDoubleEagle } = hs;
  let cls = styles.scPar;
  let notationCls = '';
  if (isDoubleEagle || rel <= -3) { cls = styles.scDoubleEagle; notationCls = styles.doubleCircle; }
  else if (isEagle || rel === -2)  { cls = styles.scEagle;       notationCls = styles.doubleCircle; }
  else if (isBirdie || rel === -1) { cls = styles.scBirdie;      notationCls = styles.circle; }
  else if (rel === 1)              { cls = styles.scBogey;       notationCls = styles.square; }
  else if (rel >= 2)               { cls = styles.scDoubleBogey; notationCls = styles.doubleSquare; }
  return (
    <span className={`${cls} ${notationCls}`}>{strokes}</span>
  );
}

export default function GameOverModal() {
  const { gameState, reset } = useGameStore();
  const navigate = useNavigate();

  if (!gameState || gameState.phase !== 'game-over') return null;

  const { players, golfScores, winner, course, stakesState, config } = gameState;
  const stakesConfig = config?.stakesConfig;

  const adjustedScores = golfScores.map((gs, i) => {
    const penalty = gs.isFinished ? 0 : holesNotCompletedPenalty(18 - gs.holesCompleted);
    return { ...gs, adjustedTotal: gs.totalRelativeToPar + penalty, penalty, seat: i };
  });
  const sorted = [...adjustedScores].sort((a, b) => a.adjustedTotal - b.adjustedTotal);
  const winnerName = players.find((p) => p.seat === winner)?.name ?? 'Winner';

  const front = course.holes.slice(0, 9);
  const back  = course.holes.slice(9, 18);

  function playerFrontRel(gs: typeof golfScores[0]) {
    return front.reduce((s, h) => {
      const hs = gs.holeScores.find(x => x.holeNumber === h.number);
      return s + (hs?.relativeToPar ?? 0);
    }, 0);
  }
  function playerBackRel(gs: typeof golfScores[0]) {
    return back.reduce((s, h) => {
      const hs = gs.holeScores.find(x => x.holeNumber === h.number);
      return s + (hs?.relativeToPar ?? 0);
    }, 0);
  }

  // Stakes settlement — per-stake dollar values
  function stakesSettlement() {
    if (!stakesState || !stakesConfig || !stakesConfig.enabled.length) return null;
    const uvs = stakesConfig.unitValues ?? {};
    const fmt = (n: number) => `$${Math.abs(n).toFixed(Math.abs(n) % 1 === 0 ? 0 : 2)}`;

    // Accumulate dollars won per player
    const dollars: Record<string, number> = {};
    players.forEach(p => { dollars[p.id] = 0; });

    if (stakesConfig.enabled.includes('skins') && stakesState.skins.length) {
      const sv = uvs.skins ?? 1;
      let carryOver = 0;
      for (const skin of [...stakesState.skins].sort((a, b) => a.holeNumber - b.holeNumber)) {
        if (skin.winnerPlayerId && !skin.carried) {
          dollars[skin.winnerPlayerId] = (dollars[skin.winnerPlayerId] ?? 0) + sv * (1 + carryOver);
          carryOver = 0;
        } else {
          carryOver++;
        }
      }
    }

    if (stakesConfig.enabled.includes('nassau') && stakesState.nassau) {
      const nv = uvs.nassau ?? 1;
      const { front9WinnerId, back9WinnerId, overallWinnerId } = stakesState.nassau;
      [front9WinnerId, back9WinnerId, overallWinnerId].forEach(id => {
        if (id) dollars[id] = (dollars[id] ?? 0) + nv;
      });
    }

    const betDefs: { key: 'sandies' | 'barkies' | 'greenies'; list: typeof stakesState.sandies }[] = [
      { key: 'sandies',  list: stakesState.sandies ?? [] },
      { key: 'barkies',  list: stakesState.barkies ?? [] },
      { key: 'greenies', list: stakesState.greenies ?? [] },
    ];
    for (const { key, list } of betDefs) {
      if (!stakesConfig.enabled.includes(key)) continue;
      const bv = uvs[key] ?? 1;
      for (const bet of list.filter(b => b.achieved)) {
        dollars[bet.playerId] = (dollars[bet.playerId] ?? 0) + bv;
      }
    }

    return (
      <div className={styles.stakesSection}>
        <h3 className={styles.stakesTitle}>Stakes Settlement</h3>
        <div className={styles.stakesGrid}>
          {players.map((p, i) => {
            const net = dollars[p.id] ?? 0;
            return (
              <div key={p.id} className={styles.stakeEntry}>
                <span style={{ color: PLAYER_COLORS[i] }} className={styles.stakeName}>{p.name}</span>
                <span className={net > 0 ? styles.stakePos : net < 0 ? styles.stakeNeg : ''}>
                  {net > 0 ? `+${fmt(net)}` : net < 0 ? `-${fmt(net)}` : 'even'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.overlay}>
      <div className={styles.panel}>

        {/* Winner announcement */}
        <div className={styles.trophy}>🏆</div>
        <h2 className={styles.heading}>{winnerName} wins!</h2>

        {/* Summary table */}
        <table className={styles.summaryTable}>
          <thead>
            <tr>
              <th>Player</th>
              <th>Holes</th>
              <th>Front 9</th>
              <th>Back 9</th>
              <th>Score</th>
              {adjustedScores.some(s => s.penalty > 0) && <th>Penalty</th>}
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((gs, i) => {
              const player = players.find(p => p.id === gs.playerId);
              const color = PLAYER_COLORS[gs.seat] ?? '#888';
              const fRel = playerFrontRel(gs);
              const bRel = playerBackRel(gs);
              return (
                <tr key={gs.playerId} className={i === 0 ? styles.winner : ''}>
                  <td style={{ color }}>
                    {MEDALS[i] ?? ''} {player?.name}
                  </td>
                  <td>{gs.holesCompleted}/18</td>
                  <td className={fRel < 0 ? styles.under : fRel > 0 ? styles.over : ''}>{relStr(fRel)}</td>
                  <td className={bRel < 0 ? styles.under : bRel > 0 ? styles.over : ''}>{relStr(bRel)}</td>
                  <td className={gs.totalRelativeToPar < 0 ? styles.under : gs.totalRelativeToPar > 0 ? styles.over : ''}>
                    {relStr(gs.totalRelativeToPar)}
                  </td>
                  {adjustedScores.some(s => s.penalty > 0) && (
                    <td className={gs.penalty > 0 ? styles.penalty : ''}>
                      {gs.penalty > 0 ? `+${gs.penalty}` : '—'}
                    </td>
                  )}
                  <td className={styles.totalCell}>{relStr(gs.adjustedTotal)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Full 18-hole scorecard */}
        <details className={styles.scorecardDetails} open>
          <summary className={styles.scorecardToggle}>Full Scorecard</summary>
          <div className={styles.scorecardInner}>
            {/* Front 9 */}
            <table className={styles.holeTable}>
              <thead>
                <tr>
                  <th className={styles.labelTh}>Hole</th>
                  {front.map(h => <th key={h.number}>{h.number}</th>)}
                  <th className={styles.splitTh}>OUT</th>
                </tr>
                <tr>
                  <th className={styles.labelTh}>Par</th>
                  {front.map(h => <th key={h.number}>{h.par}</th>)}
                  <th className={styles.splitTh}>{front.reduce((s,h)=>s+h.par,0)}</th>
                </tr>
              </thead>
              <tbody>
                {golfScores.map((gs, seat) => {
                  const frontStrok = front.reduce((s, h) => s + (gs.holeScores.find(x=>x.holeNumber===h.number)?.strokes ?? 0), 0);
                  const frontRel   = front.reduce((s, h) => s + (gs.holeScores.find(x=>x.holeNumber===h.number)?.relativeToPar ?? 0), 0);
                  return (
                    <tr key={gs.playerId}>
                      <td className={styles.labelTd} style={{ color: PLAYER_COLORS[seat] }}>
                        {players[seat]?.name}
                      </td>
                      {front.map(h => {
                        const hs = gs.holeScores.find(x => x.holeNumber === h.number);
                        return hs
                          ? <td key={h.number}><ScoreNotation hs={hs} /></td>
                          : <td key={h.number} className={styles.blank}>–</td>;
                      })}
                      <td className={styles.splitTd}>
                        {frontStrok > 0 ? `${frontStrok} (${relStr(frontRel)})` : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {/* Back 9 */}
            <table className={styles.holeTable}>
              <thead>
                <tr>
                  <th className={styles.labelTh}>Hole</th>
                  {back.map(h => <th key={h.number}>{h.number}</th>)}
                  <th className={styles.splitTh}>IN</th>
                  <th className={styles.totalTh}>TOT</th>
                </tr>
                <tr>
                  <th className={styles.labelTh}>Par</th>
                  {back.map(h => <th key={h.number}>{h.par}</th>)}
                  <th className={styles.splitTh}>{back.reduce((s,h)=>s+h.par,0)}</th>
                  <th className={styles.totalTh}>{course.totalPar}</th>
                </tr>
              </thead>
              <tbody>
                {golfScores.map((gs, seat) => {
                  const backStrok  = back.reduce((s, h) => s + (gs.holeScores.find(x=>x.holeNumber===h.number)?.strokes ?? 0), 0);
                  const backRel    = back.reduce((s, h) => s + (gs.holeScores.find(x=>x.holeNumber===h.number)?.relativeToPar ?? 0), 0);
                  return (
                    <tr key={gs.playerId}>
                      <td className={styles.labelTd} style={{ color: PLAYER_COLORS[seat] }}>
                        {players[seat]?.name}
                      </td>
                      {back.map(h => {
                        const hs = gs.holeScores.find(x => x.holeNumber === h.number);
                        return hs
                          ? <td key={h.number}><ScoreNotation hs={hs} /></td>
                          : <td key={h.number} className={styles.blank}>–</td>;
                      })}
                      <td className={styles.splitTd}>
                        {backStrok > 0 ? `${backStrok} (${relStr(backRel)})` : '–'}
                      </td>
                      <td className={styles.totalTd}>
                        {gs.totalStrokes > 0 ? `${gs.totalStrokes} (${relStr(gs.totalRelativeToPar)})` : '–'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </details>

        {/* Stakes settlement */}
        {stakesSettlement()}

        {adjustedScores.some(s => s.penalty > 0) && (
          <p className={styles.penaltyNote}>* +2 penalty per unfinished hole</p>
        )}

        <button className="btn-primary" onClick={() => { reset(); navigate('/'); }}>
          Play Again
        </button>
      </div>
    </div>
  );
}
