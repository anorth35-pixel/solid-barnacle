import type { GameState, GameConfig, GamePhase, PeggingState } from '@cribbgolf/shared';
import type { Player, PlayerSeat } from '@cribbgolf/shared';
import type { Card } from '@cribbgolf/shared';
import type { ScoreBreakdown, ScoreEvent, MugginsState, ScoreItem } from '@cribbgolf/shared';
import type { PegMovement } from '@cribbgolf/shared';
import {
  createDeck, shuffle, deal,
  scoreHand, scorePeggingPlay, scoreNibs,
  createPeggingState, canPlayCard, hasPlayableCard, resetPeggingCount, allHandsEmpty,
  createInitialGolfScore, DEFAULT_COURSE,
} from '@cribbgolf/shared';
import { advancePeg } from '@cribbgolf/shared';
import type { PlayerGolfScore } from '@cribbgolf/shared';
import { MUGGINS_WINDOW_MS } from '../config.js';

export class ServerGame {
  state: GameState;

  constructor(config: GameConfig, players: Array<{ id: string; name: string; type: Player['type']; seat: PlayerSeat }>) {
    const course = DEFAULT_COURSE;
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
      course,
      pendingPegMovements: [],
    };
  }

  startGame(): ScoreEvent[] {
    this.state.phase = 'dealing';
    return this.dealRound();
  }

  private dealRound(): ScoreEvent[] {
    const d = shuffle(createDeck());
    const { hands, remaining } = deal(d, this.state.config.playerCount);
    this.state.deck = remaining;
    this.state.crib = [];
    this.state.starterCard = null;
    this.state.pegging = createPeggingState();
    this.state.lastScoreEvents = [];
    this.state.pendingPegMovements = [];

    this.state.players.forEach((p, i) => {
      p.hand = hands[i];
      p.playedCards = [];
    });

    this.state.phase = 'discarding';
    return [];
  }

  discard(playerId: string, cardIds: string[]): boolean {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return false;

    const cards = cardIds.map((id) => player.hand.find((c) => c.id === id)).filter(Boolean) as Card[];
    if (cards.length !== cardIds.length) return false;

    this.state.crib.push(...cards);
    player.hand = player.hand.filter((c) => !cardIds.includes(c.id));

    // For 3-player: dealer also takes a card from the deck for the crib
    if (this.allDiscarded()) {
      if (this.state.config.playerCount === 3 && this.state.crib.length < 4) {
        this.state.crib.push(this.state.deck.shift()!);
      }
      this.state.phase = 'cutting';
    }
    return true;
  }

  private allDiscarded(): boolean {
    const expected = this.state.config.playerCount === 2 ? 4 : 3;
    return this.state.crib.length >= expected;
  }

  cut(position: number): ScoreEvent[] {
    const events: ScoreEvent[] = [];
    const deck = this.state.deck;
    const cutIndex = Math.max(1, Math.min(position, deck.length - 1));
    const starter = deck.splice(cutIndex, 1)[0];
    this.state.starterCard = starter;

    const nibsBD = scoreNibs(this.state.players[this.state.dealerSeat].id, starter);
    if (nibsBD) {
      const event = this.awardPoints(this.state.dealerSeat, nibsBD);
      events.push(event);
    }

    this.state.phase = 'pegging';
    // Pone starts pegging
    this.state.activePlayerSeat = ((this.state.dealerSeat + 1) % this.state.config.playerCount) as PlayerSeat;
    return events;
  }

  playCard(playerId: string, cardId: string): { events: ScoreEvent[]; movements: PegMovement[] } | null {
    const playerIdx = this.state.players.findIndex((p) => p.id === playerId);
    if (playerIdx === -1) return null;
    const player = this.state.players[playerIdx];
    const card = player.hand.find((c) => c.id === cardId);
    if (!card) return null;
    if (!canPlayCard(card, this.state.pegging.runningCount)) return null;

    player.playedCards.push(card);
    this.state.pegging.playStack.push(card);
    this.state.pegging.runningCount += card.value;
    this.state.pegging.lastPlayerToPlay = player.seat;
    this.state.pegging.goCalledBy = [];

    const scoreItems = scorePeggingPlay(
      this.state.pegging.playStack.slice(0, -1),
      card,
    );
    const events: ScoreEvent[] = [];
    const movements: PegMovement[] = [];

    let totalPoints = scoreItems.reduce((s, i) => s + i.points, 0);

    // Check if all hands empty after this play
    if (allHandsEmpty(this.state.players)) {
      if (this.state.pegging.runningCount !== 31) {
        totalPoints += 1; // last card
      }
      if (totalPoints > 0) {
        const bd: ScoreBreakdown = {
          playerId: player.id,
          phase: 'pegging',
          items: scoreItems,
          total: totalPoints,
        };
        const ev = this.awardPoints(player.seat, bd);
        events.push(ev);
        movements.push(...this.state.pendingPegMovements.splice(0));
      }
      this.advanceToHandScoring();
    } else if (this.state.pegging.runningCount === 31) {
      if (totalPoints > 0) {
        const bd: ScoreBreakdown = { playerId: player.id, phase: 'pegging', items: scoreItems, total: totalPoints };
        const ev = this.awardPoints(player.seat, bd);
        events.push(ev);
        movements.push(...this.state.pendingPegMovements.splice(0));
      }
      this.state.pegging = resetPeggingCount(this.state.pegging);
    } else if (totalPoints > 0) {
      const bd: ScoreBreakdown = { playerId: player.id, phase: 'pegging', items: scoreItems, total: totalPoints };
      const ev = this.awardPoints(player.seat, bd);
      events.push(ev);
      movements.push(...this.state.pendingPegMovements.splice(0));
    }

    this.advancePeggingTurn();
    return { events, movements };
  }

  callGo(playerId: string): { lastCard: boolean; events: ScoreEvent[] } {
    const player = this.state.players.find((p) => p.id === playerId);
    if (!player) return { lastCard: false, events: [] };

    if (!this.state.pegging.goCalledBy.includes(player.seat)) {
      this.state.pegging.goCalledBy.push(player.seat);
    }

    const activePlayers = this.state.players.filter(
      (p) => !allHandsEmpty([p]) || false,
    );
    const allWentGo = this.state.pegging.goCalledBy.length >= this.state.config.playerCount - 1;

    const events: ScoreEvent[] = [];
    if (allWentGo && this.state.pegging.lastPlayerToPlay !== null) {
      const lastPlayer = this.state.players[this.state.pegging.lastPlayerToPlay];
      const bd: ScoreBreakdown = {
        playerId: lastPlayer.id,
        phase: 'pegging',
        items: [{ reason: 'last-card', cards: [], points: 1, description: 'Go for 1' }],
        total: 1,
      };
      const ev = this.awardPoints(this.state.pegging.lastPlayerToPlay, bd);
      events.push(ev);
      this.state.pegging = resetPeggingCount(this.state.pegging);
    }

    this.advancePeggingTurn();
    return { lastCard: allWentGo, events };
  }

  private advancePeggingTurn(): void {
    if (allHandsEmpty(this.state.players)) return;
    const pc = this.state.config.playerCount;
    let next = ((this.state.activePlayerSeat! + 1) % pc) as PlayerSeat;
    let tries = 0;
    while (tries < pc) {
      const p = this.state.players[next];
      if (hasPlayableCard(p.hand, p.playedCards, this.state.pegging.runningCount)) {
        this.state.activePlayerSeat = next;
        return;
      }
      next = ((next + 1) % pc) as PlayerSeat;
      tries++;
    }
  }

  private advanceToHandScoring(): void {
    this.state.phase = 'hand-scoring';
    this.state.activePlayerSeat = ((this.state.dealerSeat + 1) % this.state.config.playerCount) as PlayerSeat;
  }

  scoreHand(seat: PlayerSeat): ScoreBreakdown {
    const player = this.state.players[seat];
    const bd = scoreHand(player.id, player.hand, this.state.starterCard!, false);
    const movements = this.awardPointsFromBreakdown(seat, bd);
    this.state.pendingPegMovements.push(...movements);
    return bd;
  }

  scoreCrib(): ScoreBreakdown {
    const dealer = this.state.players[this.state.dealerSeat];
    const bd = scoreHand(dealer.id, this.state.crib, this.state.starterCard!, true);
    const movements = this.awardPointsFromBreakdown(this.state.dealerSeat, bd);
    this.state.pendingPegMovements.push(...movements);
    return bd;
  }

  advanceRound(): void {
    if (this.checkWin()) return;
    this.state.dealerSeat = ((this.state.dealerSeat + 1) % this.state.config.playerCount) as PlayerSeat;
    this.state.roundNumber++;
    this.dealRound();
  }

  private checkWin(): boolean {
    const winner = this.state.golfScores.find((gs) => gs.isFinished);
    if (winner) {
      this.state.winner = this.state.players.find((p) => p.id === winner.playerId)!.seat;
      this.state.phase = 'game-over';
      return true;
    }
    return false;
  }

  private awardPoints(seat: PlayerSeat, breakdown: ScoreBreakdown): ScoreEvent {
    const movements = this.awardPointsFromBreakdown(seat, breakdown);
    this.state.pendingPegMovements.push(...movements);
    const gs = this.state.golfScores.find((g) => g.playerId === this.state.players[seat].id)!;
    return {
      playerId: this.state.players[seat].id,
      points: breakdown.total,
      reason: breakdown.items[0]?.reason ?? 'fifteen',
      breakdown,
      wonGame: gs.isFinished,
    };
  }

  private awardPointsFromBreakdown(seat: PlayerSeat, breakdown: ScoreBreakdown): PegMovement[] {
    const player = this.state.players[seat];
    const gsIndex = this.state.golfScores.findIndex((g) => g.playerId === player.id);
    if (gsIndex === -1) return [];

    const { updated, movement } = advancePeg(
      this.state.golfScores[gsIndex],
      breakdown.total,
      this.state.course.holes,
    );
    this.state.golfScores[gsIndex] = updated;
    return [movement];
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
    return this.awardPointsFromBreakdown(claimerSeat, bd);
  }

  closeMuggins(): void {
    this.state.muggins = null;
  }
}
