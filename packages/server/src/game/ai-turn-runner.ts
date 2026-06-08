import type { ServerGame } from './server-game.js';
import type { PlayerSeat } from '@cribbgolf/shared';
import { chooseDiscard, choosePegCard } from '@cribbgolf/shared';
import { hasPlayableCard } from '@cribbgolf/shared';

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function thinkTime(): number {
  return 500 + Math.random() * 1000;
}

export class AITurnRunner {
  constructor(
    private game: ServerGame,
    private seat: PlayerSeat,
    private onAction: (type: string, data: unknown) => void,
  ) {}

  async runDiscard(): Promise<void> {
    await delay(thinkTime());
    const player = this.game.state.players[this.seat];
    const difficulty = this.game.state.config.aiDifficulty ?? 'medium';
    const discardCount = this.game.state.config.playerCount === 2 ? 2 : 1;
    const cardIds = chooseDiscard(player.hand, discardCount, difficulty);
    this.onAction('discard', { playerId: player.id, cardIds });
  }

  async runPeg(): Promise<void> {
    await delay(thinkTime());
    const player = this.game.state.players[this.seat];
    const { runningCount } = this.game.state.pegging;
    const difficulty = this.game.state.config.aiDifficulty ?? 'medium';

    if (!hasPlayableCard(player.hand, player.playedCards, runningCount)) {
      this.onAction('go', { playerId: player.id });
      return;
    }

    const cardId = choosePegCard(player.hand, player.playedCards, runningCount, difficulty);
    if (cardId) {
      this.onAction('peg', { playerId: player.id, cardId });
    } else {
      this.onAction('go', { playerId: player.id });
    }
  }
}
