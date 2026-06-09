import type { GameState, GameConfig, PeggingState } from '@cribbgolf/shared';
import type { Player, PlayerSeat } from '@cribbgolf/shared';
import type { Card } from '@cribbgolf/shared';
import type { ScoreBreakdown, ScoreEvent, MugginsState, ScoreItem } from '@cribbgolf/shared';
import type { PegMovement } from '@cribbgolf/shared';
import {
  createDeck, shuffle, deal,
  scoreHand, scorePeggingPlay, scoreNibs,
  createPeggingState, canPlayCard, hasPlayableCard, resetPeggingCount, allHandsEmpty,
  createInitialGolfScore, DEFAULT_COURSE,
  advancePeg,
} from '@cribbgolf/shared';
import { MUGGINS_WINDOW_MS } from '../config.js';

export class ServerGame {
  state: GameState;
  private discardedSeats = new Set<PlayerSeat>();

  constructor(
    config: GameConfig,
    players: Array<{ id: string; name: string; type: Player['type']; seat: PlayerSeat }>,
  ) {
    this.state = {
      id: crypto.randomUUID(),
      config,
      phase: 'lobby',
      players: players.map((p) => ({
        id: p.id,
        name: p.name,
        seat: p.seat,
        type: p.type,
        hand: [],
        playedCards: [],
        isConnected: true,
        isReady: false,
      })),
      deck: [],
      crib: [],
      starterCard: null,
      dealerSeat: 0,
      activePlayerSeat: null,
      pegging: createPeggingState(),
      roundNumber: 1,
      muggins: null,
      winner: null,
      lastScoreEvents: [],
      golfScores: players.map((p) => createInitialGolfScore(p.id)),
      course: DEFAULT_COURSE,
      pendingPegMovements: [],
    };
  }

  startGame(): void {
    this.state.phase = 'dealing';
    this.autoChoosePathsForAI(); // immediately resolve hole-1 path for AI players
    this.dealRound();
  }

  private dealRound(): void {
    const d = shuffle(createDeck());
    const { hands, remaining } = deal(d, this.state.config.playerCount);
    this.state.deck = remaining;
    this.state.crib = [];
    this.state.starterCard = null;
    this.state.pegging = createPeggingState();
    this.state.lastScoreEvents = [];
    this.state.pendingPegMovements = [];
    this.discardedSeats = new Set();

    this.state.players.forEach((p, i) => {
      p.hand = hands[i];
      p.playedCards = [];
    });

    this.state.phase = 'discarding';
  }

  discard(playerId: string, cardIds: string[]): boolean {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player || this.discardedSeats.has(player.seat)) return false;

    const expectedCount = this.state.config.playerCount === 2 ? 2 : 1;
    if (cardIds.length !== expectedCount) return false;

    const cards = cardIds.map((id) => player.hand.find((c) => c.id === id)).filter(Boolean) as Card[];
    if (cards.length !== expectedCount) return false;

    this.state.crib.push(...cards);
    player.hand = player.hand.filter((c) => !cardIds.includes(c.id));
    this.discardedSeats.add(player.seat);

    if (this.allDiscarded()) {
      // For 3-player: dealer draws one extra card from the deck to complete the crib
      if (this.state.config.playerCount === 3) {
        const extra = this.state.deck.shift();
        if (extra) this.state.crib.push(extra);
      }
      this.state.phase = 'cutting';
    }
    return true;
  }

  private allDiscarded(): boolean {
    return this.discardedSeats.size >= this.state.config.playerCount;
  }

  cut(position: number): ScoreEvent[] {
    const events: ScoreEvent[] = [];
    const cutIndex = Math.max(1, Math.min(position, this.state.deck.length - 1));
    const starter = this.state.deck.splice(cutIndex, 1)[0];
    this.state.starterCard = starter;

    const nibsBD = scoreNibs(this.state.players[this.state.dealerSeat].id, starter);
    if (nibsBD) {
      const event = this.awardPoints(this.state.dealerSeat, nibsBD);
      events.push(event);
      if (this.checkWin()) return events;
    }

    this.state.phase = 'pegging';
    this.state.activePlayerSeat = this.poneOf(this.state.dealerSeat);
    return events;
  }

  playCard(playerId: string, cardId: string): { events: ScoreEvent[]; movements: PegMovement[] } | null {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return null;
    if (player.seat !== this.state.activePlayerSeat) return null;

    const card = player.hand.find((c) => c.id === cardId);
    if (!card) return null;
    if (!canPlayCard(card, this.state.pegging.runningCount)) return null;

    player.playedCards.push(card);
    this.state.pegging.playStack = [...this.state.pegging.playStack, card];
    this.state.pegging.runningCount += card.value;
    this.state.pegging.lastPlayerToPlay = player.seat;
    this.state.pegging.goCalledBy = [];

    const prevStack = this.state.pegging.playStack.slice(0, -1);
    const scoreItems = scorePeggingPlay(prevStack, card);

    let totalPoints = scoreItems.reduce((s, i) => s + i.points, 0);
    const events: ScoreEvent[] = [];
    const movements: PegMovement[] = [];

    const handsNowEmpty = allHandsEmpty(this.state.players);

    // 31 exact: score 2, then reset (last-card is not awarded on 31)
    if (this.state.pegging.runningCount === 31) {
      const bd: ScoreBreakdown = { playerId: player.id, phase: 'pegging', items: scoreItems, total: totalPoints };
      if (totalPoints > 0) {
        const ev = this.awardPoints(player.seat, bd);
        events.push(ev);
        movements.push(...this.state.pendingPegMovements.splice(0));
        if (this.checkWin()) return { events, movements };
      }
      this.state.pegging = resetPeggingCount(this.state.pegging);
    } else if (handsNowEmpty) {
      // Last card (not 31): award 1 extra
      totalPoints += 1;
      scoreItems.push({ reason: 'last-card', cards: [card], points: 1, description: 'Last card for 1' });
      const bd: ScoreBreakdown = { playerId: player.id, phase: 'pegging', items: scoreItems, total: totalPoints };
      const ev = this.awardPoints(player.seat, bd);
      events.push(ev);
      movements.push(...this.state.pendingPegMovements.splice(0));
      if (this.checkWin()) return { events, movements };
      this.advanceToHandScoring();
      return { events, movements };
    } else if (totalPoints > 0) {
      const bd: ScoreBreakdown = { playerId: player.id, phase: 'pegging', items: scoreItems, total: totalPoints };
      const ev = this.awardPoints(player.seat, bd);
      events.push(ev);
      movements.push(...this.state.pendingPegMovements.splice(0));
      if (this.checkWin()) return { events, movements };
    }

    this.advancePeggingTurn();
    return { events, movements };
  }

  callGo(playerId: string): { countReset: boolean; events: ScoreEvent[]; movements: PegMovement[] } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { countReset: false, events: [], movements: [] };

    if (!this.state.pegging.goCalledBy.includes(player.seat)) {
      this.state.pegging.goCalledBy = [...this.state.pegging.goCalledBy, player.seat];
    }

    const events: ScoreEvent[] = [];
    const movements: PegMovement[] = [];

    // "All went go" means every player who still has cards AND can't play has called go.
    // Players with no remaining unplayed cards don't need to call go.
    const playersWithCards = this.state.players.filter(
      (p) => p.playedCards.length < p.hand.length,
    );
    const lastPlayed = this.state.pegging.lastPlayerToPlay;
    const othersWithCards = playersWithCards.filter((p) => p.seat !== lastPlayed);
    const allOthersGone = othersWithCards.every((p) =>
      this.state.pegging.goCalledBy.includes(p.seat),
    );

    if (allOthersGone && lastPlayed !== null) {
      // Award 1 point to the last player to have played a card
      const lastPlayer = this.state.players[lastPlayed];
      const bd: ScoreBreakdown = {
        playerId: lastPlayer.id,
        phase: 'pegging',
        items: [{ reason: 'go', cards: [], points: 1, description: 'Go for 1' }],
        total: 1,
      };
      const ev = this.awardPoints(lastPlayed, bd);
      events.push(ev);
      movements.push(...this.state.pendingPegMovements.splice(0));
      if (this.checkWin()) return { countReset: true, events, movements };
      this.state.pegging = resetPeggingCount(this.state.pegging);
      if (allHandsEmpty(this.state.players)) {
        this.advanceToHandScoring();
      } else {
        // Next to play: first player after lastPlayed who still has cards
        this.state.activePlayerSeat = this.firstWithCardsAfter(lastPlayed);
      }
      return { countReset: true, events, movements };
    }

    this.advancePeggingTurn();
    return { countReset: false, events, movements };
  }

  private firstWithCardsAfter(seat: PlayerSeat): PlayerSeat | null {
    const pc = this.state.config.playerCount;
    for (let i = 1; i <= pc; i++) {
      const s = ((seat + i) % pc) as PlayerSeat;
      const p = this.state.players[s];
      if (p.playedCards.length < p.hand.length) return s;
    }
    return null;
  }

  private advancePeggingTurn(): void {
    if (allHandsEmpty(this.state.players)) {
      this.advanceToHandScoring();
      return;
    }
    const pc = this.state.config.playerCount;
    const current = this.state.activePlayerSeat ?? this.state.dealerSeat;
    // Find next player who has an unplayed card that fits under 31
    for (let i = 1; i <= pc; i++) {
      const next = ((current + i) % pc) as PlayerSeat;
      const p = this.state.players[next];
      if (hasPlayableCard(p.hand, p.playedCards, this.state.pegging.runningCount)) {
        this.state.activePlayerSeat = next;
        return;
      }
    }
    // Nobody can play — advance to next player with unplayed cards so they can call go
    for (let i = 1; i <= pc; i++) {
      const next = ((current + i) % pc) as PlayerSeat;
      const p = this.state.players[next];
      if (p.playedCards.length < p.hand.length) {
        this.state.activePlayerSeat = next;
        return;
      }
    }
  }

  private advanceToHandScoring(): void {
    this.state.phase = 'hand-scoring';
    this.state.activePlayerSeat = this.poneOf(this.state.dealerSeat);
  }

  scoreHand(seat: PlayerSeat): ScoreBreakdown {
    const player = this.state.players[seat];
    const bd = scoreHand(player.id, player.hand, this.state.starterCard!, false);
    this.awardPointsFromBreakdown(seat, bd);
    return bd;
  }

  scoreCrib(): ScoreBreakdown {
    const dealer = this.state.players[this.state.dealerSeat];
    const bd = scoreHand(dealer.id, this.state.crib, this.state.starterCard!, true);
    this.awardPointsFromBreakdown(this.state.dealerSeat, bd);
    return bd;
  }

  advanceRound(): void {
    if (this.checkWin()) return;
    this.state.dealerSeat = this.poneOf(this.state.dealerSeat);
    this.state.roundNumber++;
    this.dealRound();
  }

  private checkWin(): boolean {
    if (this.state.winner !== null) return true;
    const winner = this.state.golfScores.find((gs) => gs.isFinished);
    if (winner) {
      this.state.winner = this.state.players.find((p) => p.id === winner.playerId)!.seat;
      this.state.phase = 'game-over';
      return true;
    }
    return false;
  }

  private awardPoints(seat: PlayerSeat, breakdown: ScoreBreakdown): ScoreEvent {
    this.awardPointsFromBreakdown(seat, breakdown);
    const gs = this.state.golfScores.find((g) => g.playerId === this.state.players[seat].id)!;
    return {
      playerId: this.state.players[seat].id,
      points: breakdown.total,
      reason: breakdown.items[0]?.reason ?? 'fifteen',
      breakdown,
      wonGame: gs.isFinished,
    };
  }

  private awardPointsFromBreakdown(seat: PlayerSeat, breakdown: ScoreBreakdown): void {
    const player = this.state.players[seat];
    const gsIndex = this.state.golfScores.findIndex((g) => g.playerId === player.id);
    if (gsIndex === -1 || breakdown.total === 0) return;

    const { updated, movement } = advancePeg(
      this.state.golfScores[gsIndex],
      breakdown.total,
      this.state.course.holes,
    );
    this.state.golfScores[gsIndex] = updated;
    this.state.pendingPegMovements.push(movement);
    // AI players auto-choose their next path immediately
    this.autoChoosePathsForAI();
  }

  choosePath(playerId: string, holeNumber: number, pathId: string): boolean {
    const gsIndex = this.state.golfScores.findIndex((g) => g.playerId === playerId);
    if (gsIndex === -1) return false;
    const gs = this.state.golfScores[gsIndex];
    if (gs.pendingPathChoiceHole !== holeNumber) return false;
    this.state.golfScores[gsIndex] = {
      ...gs,
      selectedPaths: { ...gs.selectedPaths, [holeNumber]: pathId },
      currentPathId: holeNumber === gs.currentHole ? pathId : gs.currentPathId,
      pendingPathChoiceHole: null,
    };
    return true;
  }

  private autoChoosePathsForAI(): void {
    for (const player of this.state.players) {
      if (player.type !== 'ai') continue;
      const gsIndex = this.state.golfScores.findIndex((g) => g.playerId === player.id);
      if (gsIndex === -1) continue;
      const gs = this.state.golfScores[gsIndex];
      if (gs.pendingPathChoiceHole === null) continue;
      // AI picks based on difficulty: easy/medium=A, hard=B for variety
      const pathId = this.state.config.aiDifficulty === 'hard' ? 'B' : 'A';
      this.state.golfScores[gsIndex] = {
        ...gs,
        selectedPaths: { ...gs.selectedPaths, [gs.pendingPathChoiceHole]: pathId },
        currentPathId: gs.pendingPathChoiceHole === gs.currentHole ? pathId : gs.currentPathId,
        pendingPathChoiceHole: null,
      };
    }
  }

  openMugginsWindow(scoringPlayerId: string, missedItems: ScoreItem[]): MugginsState {
    const now = Date.now();
    const muggins: MugginsState = {
      scoringPlayerId,
      missedBreakdown: missedItems,
      claimerPlayerId: null,
      windowOpenAt: now,
      windowCloseAt: now + (this.state.config.mugginsWindowMs ?? MUGGINS_WINDOW_MS),
      claimed: false,
    };
    this.state.muggins = muggins;
    return muggins;
  }

  claimMuggins(claimerPlayerId: string, items: ScoreItem[]): PegMovement[] {
    if (!this.state.muggins || this.state.muggins.claimed) return [];
    this.state.muggins.claimed = true;
    this.state.muggins.claimerPlayerId = claimerPlayerId;

    const claimerSeat = this.state.players.findIndex((p) => p.id === claimerPlayerId) as PlayerSeat;
    const total = items.reduce((s, i) => s + i.points, 0);
    const bd: ScoreBreakdown = { playerId: claimerPlayerId, phase: 'hand', items, total };
    this.awardPointsFromBreakdown(claimerSeat, bd);
    return this.state.pendingPegMovements.splice(0);
  }

  closeMuggins(): void {
    this.state.muggins = null;
  }

  private poneOf(dealerSeat: PlayerSeat): PlayerSeat {
    return ((dealerSeat + 1) % this.state.config.playerCount) as PlayerSeat;
  }

  isAITurn(): boolean {
    const seat = this.state.activePlayerSeat;
    if (seat === null) return false;
    return this.state.players[seat]?.type === 'ai';
  }

  getAIPlayersNeedingDiscard(): Player[] {
    return this.state.players.filter(
      (p) => p.type === 'ai' && !this.discardedSeats.has(p.seat),
    );
  }

  poneNeedsTocut(): PlayerSeat | null {
    if (this.state.phase !== 'cutting') return null;
    const pone = this.poneOf(this.state.dealerSeat);
    return this.state.players[pone].type === 'ai' ? pone : null;
  }
}
