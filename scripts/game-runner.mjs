#!/usr/bin/env node
/**
 * game-runner.mjs — automated CribbGolf player.
 *
 * One instance = one human seat. Run multiple instances for a full game.
 *
 * Creator: node game-runner.mjs --server URL --name Alice --role creator --config 2
 * Joiner:  node game-runner.mjs --server URL --name Bob   --role joiner
 *
 * Exit codes:
 *   0 = game completed normally (game:over received)
 *   1 = unexpected disconnect or room/game error
 *   2 = watchdog timeout (game stuck)
 */

import { io } from 'socket.io-client';
import { parseArgs } from 'node:util';

// ── Args ──────────────────────────────────────────────────────────────────────

const { values: args } = parseArgs({
  options: {
    server:  { type: 'string' },
    name:    { type: 'string' },
    role:    { type: 'string', default: 'joiner' },   // 'creator' | 'joiner'
    config:  { type: 'string', default: '0' },         // index into CONFIGS
    timeout: { type: 'string', default: '300' },       // seconds before giving up
  },
  strict: false,
});

if (!args.server || !args.name) {
  process.stderr.write(
    'Usage: node game-runner.mjs --server <url> --name <name> [--role creator|joiner] [--config N] [--timeout 300]\n'
  );
  process.exit(1);
}

// ── Config rotation ───────────────────────────────────────────────────────────
// Creator rotates through these; joiner picks up whatever room it finds.

const ALL_UNIT_VALUES = { skins: 1, nassau: 1, sandies: 1, barkies: 1, greenies: 1 };

const CONFIGS = [
  // ── 2-player: core modes ──────────────────────────────────────────────────
  // 0: stroke play, no muggins
  { playerCount: 2, mode: 'remote', matchPlay: false,
    mugginsEnabled: false, mugginsWindowMs: 4000, manualScoring: false },

  // 1: stroke play, muggins ON
  { playerCount: 2, mode: 'remote', matchPlay: false,
    mugginsEnabled: true,  mugginsWindowMs: 4000, manualScoring: false },

  // 2: match play
  { playerCount: 2, mode: 'remote', matchPlay: true,
    mugginsEnabled: false, mugginsWindowMs: 4000, manualScoring: false },

  // ── 2-player: stakes combinations ────────────────────────────────────────
  // 3: all stakes enabled
  { playerCount: 2, mode: 'remote', matchPlay: false,
    mugginsEnabled: false, mugginsWindowMs: 4000, manualScoring: false,
    stakesConfig: { enabled: ['skins', 'nassau', 'sandies', 'barkies', 'greenies'], unitValues: ALL_UNIT_VALUES } },

  // 4: skins only
  { playerCount: 2, mode: 'remote', matchPlay: false,
    mugginsEnabled: false, mugginsWindowMs: 4000, manualScoring: false,
    stakesConfig: { enabled: ['skins'], unitValues: { skins: 2 } } },

  // 5: nassau only
  { playerCount: 2, mode: 'remote', matchPlay: false,
    mugginsEnabled: false, mugginsWindowMs: 4000, manualScoring: false,
    stakesConfig: { enabled: ['nassau'], unitValues: { nassau: 5 } } },

  // 6: side bets only (sandies + barkies + greenies)
  { playerCount: 2, mode: 'remote', matchPlay: false,
    mugginsEnabled: false, mugginsWindowMs: 4000, manualScoring: false,
    stakesConfig: { enabled: ['sandies', 'barkies', 'greenies'], unitValues: { sandies: 1, barkies: 1, greenies: 1 } } },

  // 7: skins + muggins
  { playerCount: 2, mode: 'remote', matchPlay: false,
    mugginsEnabled: true, mugginsWindowMs: 4000, manualScoring: false,
    stakesConfig: { enabled: ['skins', 'sandies'], unitValues: { skins: 1, sandies: 1 } } },

  // ── 3-player ──────────────────────────────────────────────────────────────
  // 8: stroke play, no muggins
  { playerCount: 3, mode: 'remote', matchPlay: false,
    mugginsEnabled: false, mugginsWindowMs: 4000, manualScoring: false },

  // 9: stroke play, muggins ON
  { playerCount: 3, mode: 'remote', matchPlay: false,
    mugginsEnabled: true,  mugginsWindowMs: 4000, manualScoring: false },

  // 10: 3-player all stakes
  { playerCount: 3, mode: 'remote', matchPlay: false,
    mugginsEnabled: false, mugginsWindowMs: 4000, manualScoring: false,
    stakesConfig: { enabled: ['skins', 'sandies', 'barkies', 'greenies'], unitValues: { skins: 1, sandies: 1, barkies: 1, greenies: 1 } } },
];

const gameConfig = CONFIGS[parseInt(args.config) % CONFIGS.length];
const isCreator  = args.role === 'creator';
const TIMEOUT_MS = parseInt(args.timeout) * 1000;

// ── Logging ───────────────────────────────────────────────────────────────────

const pad = (s) => String(s).padStart(5);
function ts()  { return new Date().toISOString().slice(11, 23); }
function log(msg, ...r)   { console.log(`[${ts()}] [${pad(args.name)}]  ${msg}`, ...r); }
function warn(msg, ...r)  { console.warn(`[${ts()}] [${pad(args.name)}]  WARN: ${msg}`, ...r); }
function fatal(msg, ...r) { console.error(`[${ts()}] [${pad(args.name)}]  FATAL: ${msg}`, ...r); }

// ── Per-game state ────────────────────────────────────────────────────────────

let mySeat        = null;
let myHand        = [];
let myPlayerId    = null;
let roomCode      = null;
let phase         = 'lobby';
let playerCount   = gameConfig.playerCount;
let activePlayerSeat = null;
let dealerSeat    = 0;
let joinedRoom    = false;

// ── Decision helpers ──────────────────────────────────────────────────────────

function pickDiscardIds(hand) {
  const count = hand.length - 4; // 2-player → 2, 3-player → 1
  const shuffled = [...hand].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count).map(c => c.id);
}

function pickPlayableCard(hand, runningCount) {
  const playable = hand.filter(c => runningCount + c.value <= 31);
  if (!playable.length) return null;
  return playable[Math.floor(Math.random() * playable.length)];
}

function pickPath() {
  return ['LR', 'S', 'RL'][Math.floor(Math.random() * 3)];
}

function removeFromHand(cardId) {
  myHand = myHand.filter(c => c.id !== cardId);
}

function checkAndChoosePath(golfScores) {
  if (!golfScores || myPlayerId === null) return;
  const myScore = golfScores.find(g => g.playerId === myPlayerId);
  if (myScore?.pendingPathChoiceHole != null) {
    const hole    = myScore.pendingPathChoiceHole;
    const pathId  = pickPath();
    log(`Hole ${hole} — choosing route ${pathId}`);
    socket.emit('game:choose-path', { holeNumber: hole, pathId });
  }
}

function maybePlayCard(runningCount) {
  if (mySeat !== activePlayerSeat || phase !== 'pegging') return;
  const card = pickPlayableCard(myHand, runningCount);
  if (card) {
    log(`Playing ${card.rank}${card.suit[0]}  (count ${runningCount} → ${runningCount + card.value})`);
    setTimeout(() => socket.emit('game:peg', { cardId: card.id }), 200 + Math.random() * 400);
  } else {
    log(`No playable card — calling Go  (count ${runningCount})`);
    setTimeout(() => socket.emit('game:go'), 200 + Math.random() * 300);
  }
}

// ── Connection ────────────────────────────────────────────────────────────────

const socket = io(args.server, { transports: ['websocket'] });

socket.on('connect', () => {
  myPlayerId = socket.id;
  log(`Connected  id=${socket.id}`);

  if (isCreator) {
    const label = `${gameConfig.playerCount}p match=${gameConfig.matchPlay} muggins=${gameConfig.mugginsEnabled}`;
    log(`Creating room — ${label}`);
    socket.emit('room:create', { playerName: args.name, config: gameConfig });
  } else {
    log('Searching for an open room...');
    socket.emit('room:list');
  }
});

socket.on('connect_error', (err) => {
  fatal(`Connection failed: ${err.message}`);
  process.exit(1);
});

// ── Lobby — creator ───────────────────────────────────────────────────────────

socket.on('room:created', ({ roomCode: code, room }) => {
  roomCode   = code;
  mySeat     = room.players[0]?.seat ?? 0;
  joinedRoom = true;
  log(`Room created: ${code}  (seat ${mySeat})`);
  process.stdout.write(`ROOM_CODE=${code}\n`);  // shell script reads this
  socket.emit('room:ready', { ready: true });
});

// When all seats are filled and ready, start the game
socket.on('room:updated', ({ room }) => {
  if (!isCreator || !roomCode) return;
  const expected = gameConfig.playerCount;
  const allReady = room.players.length === expected && room.players.every(p => p.ready);
  if (allReady) {
    log(`All ${expected} players ready — emitting game:start`);
    socket.emit('game:start');
  }
});

// ── Lobby — joiner ────────────────────────────────────────────────────────────

function tryJoinFirstRoom(rooms) {
  if (joinedRoom) return;
  const open = rooms.filter(r => r.state === 'waiting');
  if (!open.length) return;
  const target = open[0];
  log(`Joining room ${target.code}`);
  joinedRoom = true;
  socket.emit('room:join', { roomCode: target.code, playerName: args.name });
}

socket.on('room:list', ({ rooms }) => {
  if (isCreator || joinedRoom) return;
  if (!rooms.length) {
    log('No open rooms yet — waiting for room:list-updated');
    return;
  }
  tryJoinFirstRoom(rooms);
});

socket.on('room:list-updated', ({ rooms }) => {
  if (isCreator || joinedRoom) return;
  tryJoinFirstRoom(rooms);
});

socket.on('room:joined', ({ room, yourSeat }) => {
  roomCode     = room.code;
  mySeat       = yourSeat;
  playerCount  = room.config.playerCount;
  log(`Joined room ${room.code}  seat=${yourSeat}`);
  socket.emit('room:ready', { ready: true });
});

socket.on('room:error', ({ code, message }) => {
  warn(`Room error ${code}: ${message}`);
  if (code === 'NOT_FOUND') {
    joinedRoom = false;
    socket.emit('room:list');
  }
});

// ── Game — cards ──────────────────────────────────────────────────────────────

socket.on('game:dealt', ({ yourHand, dealerSeat: ds }) => {
  myHand     = yourHand;
  dealerSeat = ds;
  log(`Dealt ${myHand.length} cards  dealer=seat${ds}`);
  // Discard here instead of on phase-change — game:dealt arrives AFTER game:phase-change
  // so myHand is empty when phase-change fires.
  const toDiscard = pickDiscardIds(myHand);
  // Remove discarded cards from hand now so pegging uses only the 4 kept cards.
  myHand = myHand.filter(c => !toDiscard.includes(c.id));
  log(`Discarding ${toDiscard.length} card(s) — keeping ${myHand.length}`);
  setTimeout(() => socket.emit('game:discard', { cardIds: toDiscard }), 200 + Math.random() * 400);
});

socket.on('game:phase-change', ({ phase: newPhase, state }) => {
  phase            = newPhase;
  activePlayerSeat = state?.activePlayerSeat ?? null;
  playerCount      = state?.config?.playerCount ?? playerCount;
  if (mySeat === null && state?.players) {
    const me = state.players.find(p => p.id === socket.id);
    if (me) { mySeat = me.seat; log(`My seat confirmed: ${mySeat}`); }
  }

  log(`Phase → ${newPhase}${activePlayerSeat !== null ? `  active=seat${activePlayerSeat}` : ''}`);

  switch (newPhase) {
    case 'cutting': {
      const poneSeat = (state.dealerSeat + 1) % playerCount;
      if (mySeat === poneSeat) {
        const pos = Math.floor(Math.random() * 30) + 8;
        log(`Cutting at position ${pos}`);
        setTimeout(() => socket.emit('game:cut', { position: pos }), 400 + Math.random() * 500);
      }
      break;
    }
    case 'pegging':
      maybePlayCard(state?.pegging?.runningCount ?? 0);
      break;
  }

  checkAndChoosePath(state?.golfScores);
});

socket.on('game:card-played', ({ seat, card, runningCount, activePlayerSeat: next, golfScores }) => {
  activePlayerSeat = next;
  if (seat === mySeat) removeFromHand(card.id);
  if (golfScores) checkAndChoosePath(golfScores);
  if (next === mySeat) maybePlayCard(runningCount);
});

socket.on('game:go-called', ({ seat, countReset, activePlayerSeat: next, golfScores }) => {
  activePlayerSeat = next;
  log(`Seat ${seat} called Go${countReset ? '  (count reset)' : ''}`);
  if (golfScores) checkAndChoosePath(golfScores);
  if (next === mySeat) maybePlayCard(0);
});

socket.on('game:starter', ({ card, golfScores }) => {
  log(`Starter card: ${card.rank}${card.suit[0]}`);
  if (golfScores) checkAndChoosePath(golfScores);
});

// ── Game — scoring ────────────────────────────────────────────────────────────

socket.on('game:hand-score', ({ seat, breakdown, golfScores }) => {
  log(`Hand score  seat=${seat}  pts=${breakdown.total}`);
  if (golfScores) checkAndChoosePath(golfScores);
});

socket.on('game:crib-score', ({ seat, breakdown, golfScores }) => {
  log(`Crib score  seat=${seat}  pts=${breakdown.total}`);
  if (golfScores) checkAndChoosePath(golfScores);
});

// ── Muggins — random claim or pass ───────────────────────────────────────────

socket.on('game:muggins-window', ({ scoringPlayerId, missedItems }) => {
  if (scoringPlayerId === myPlayerId) return; // can't muggins yourself
  const claim = Math.random() < 0.5;
  const pts   = missedItems.reduce((s, i) => s + i.points, 0);
  log(`Muggins window: ${missedItems.length} missed item(s) worth ${pts} pts — ${claim ? 'CLAIMING' : 'passing'}`);
  if (claim) {
    setTimeout(() => socket.emit('game:muggins', { claimedItems: missedItems }), 500 + Math.random() * 800);
  } else {
    setTimeout(() => socket.emit('game:muggins-pass'), 150 + Math.random() * 200);
  }
});

// ── Course events ─────────────────────────────────────────────────────────────

socket.on('game:path-chosen', ({ playerId, holeNumber, pathId, golfScores }) => {
  if (golfScores) checkAndChoosePath(golfScores);
});

socket.on('game:hole-completed', ({ seat, holeScore }) => {
  const rel = holeScore.relativeToPar;
  const label =
    holeScore.isDoubleEagle ? 'Double Eagle (-3)' :
    holeScore.isEagle       ? 'Eagle (-2)'        :
    holeScore.isBirdie      ? 'Birdie (-1)'        :
    rel === 0               ? 'Par'                :
    rel > 0                 ? `Bogey+${rel}`        :
                              `${rel}`;
  log(`Hole ${holeScore.holeNumber} done  seat=${seat}  ${label}  strokes=${holeScore.strokes}`);
});

socket.on('game:hazard-hit', ({ seat, peghole, result }) => {
  log(`Hazard  seat=${seat}  type=${peghole.type}  hole=${peghole.holeNumber}  → ${result.description}`);
});

// ── Game over ─────────────────────────────────────────────────────────────────

socket.on('game:over', ({ winnerSeat, finalGolfScores }) => {
  log(`━━━ GAME OVER ━━━  winner: seat ${winnerSeat}`);
  if (finalGolfScores) {
    for (const gs of finalGolfScores) {
      log(`  playerId=${gs.playerId.slice(0, 8)}  holes=${gs.holesCompleted}  total=${gs.totalStrokes}  rel=${gs.totalRelativeToPar}`);
    }
  }
  socket.disconnect();
  process.exit(0);
});

// ── Errors & disconnect ───────────────────────────────────────────────────────

socket.on('game:error', ({ code, message }) => {
  warn(`Game error ${code}: ${message}`);
  // Minor — keep going
});

socket.on('player:disconnected', ({ seat, waitingMs }) => {
  warn(`Seat ${seat} disconnected — server waiting ${waitingMs}ms for reconnect`);
  // If a bot dropped, the game will stall and the watchdog will catch it
});

socket.on('disconnect', (reason) => {
  if (reason === 'io client disconnect') return; // we called socket.disconnect()
  fatal(`Disconnected unexpectedly: ${reason}`);
  process.exit(1);
});

// ── Watchdog ──────────────────────────────────────────────────────────────────

const watchdog = setTimeout(() => {
  fatal(`Timed out after ${TIMEOUT_MS / 1000}s — stuck in phase '${phase}'  active=seat${activePlayerSeat}`);
  process.exit(2);
}, TIMEOUT_MS);
watchdog.unref();
