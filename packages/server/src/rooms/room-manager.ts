import type { RoomSummary } from '@cribbgolf/shared';
import type { GameConfig, GameMode } from '@cribbgolf/shared';

const ROOM_CODE_CHARS = 'BCDFGHJKLMNPQRSTVWXYZ23456789';

function generateCode(): string {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
  }
  return code;
}

export interface RoomPlayer {
  socketId: string;
  name: string;
  seat: 0 | 1 | 2;
  ready: boolean;
  isHost: boolean;
}

export interface Room {
  code: string;
  hostSocketId: string;
  players: RoomPlayer[];
  config: GameConfig;
  state: 'waiting' | 'in-game' | 'finished';
  createdAt: number;
  lastActivityAt: number;
}

const rooms = new Map<string, Room>();

function toSummary(room: Room): RoomSummary {
  return {
    code: room.code,
    players: room.players.map((p) => ({
      name: p.name,
      seat: p.seat,
      ready: p.ready,
      isHost: p.isHost,
    })),
    config: room.config,
    state: room.state,
  };
}

export function createRoom(
  socketId: string,
  playerName: string,
  configOverride: Partial<GameConfig> = {},
): Room {
  let code: string;
  do { code = generateCode(); } while (rooms.has(code));

  const config: GameConfig = {
    mode: (configOverride.mode ?? 'remote') as GameMode,
    playerCount: configOverride.playerCount ?? 2,
    roomCode: code,
    mugginsEnabled: configOverride.mugginsEnabled ?? true,
    mugginsWindowMs: configOverride.mugginsWindowMs ?? 15_000,
    aiDifficulty: configOverride.aiDifficulty,
  };

  const room: Room = {
    code,
    hostSocketId: socketId,
    players: [{ socketId, name: playerName, seat: 0, ready: false, isHost: true }],
    config,
    state: 'waiting',
    createdAt: Date.now(),
    lastActivityAt: Date.now(),
  };
  rooms.set(code, room);
  return room;
}

export function joinRoom(socketId: string, roomCode: string, playerName: string): Room | null {
  const room = rooms.get(roomCode.toUpperCase());
  if (!room || room.state !== 'waiting') return null;
  if (room.players.length >= room.config.playerCount) return null;

  const seat = room.players.length as 0 | 1 | 2;
  room.players.push({ socketId, name: playerName, seat, ready: false, isHost: false });
  room.lastActivityAt = Date.now();
  return room;
}

export function setReady(socketId: string, ready: boolean): Room | null {
  for (const room of rooms.values()) {
    const player = room.players.find((p) => p.socketId === socketId);
    if (player) {
      player.ready = ready;
      room.lastActivityAt = Date.now();
      return room;
    }
  }
  return null;
}

export function getRoomBySocket(socketId: string): Room | null {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.socketId === socketId)) return room;
  }
  return null;
}

export function getRoomByCode(code: string): Room | null {
  return rooms.get(code.toUpperCase()) ?? null;
}

export function removePlayer(socketId: string): { room: Room; seat: number } | null {
  for (const room of rooms.values()) {
    const idx = room.players.findIndex((p) => p.socketId === socketId);
    if (idx !== -1) {
      const [removed] = room.players.splice(idx, 1);
      if (room.players.length === 0) rooms.delete(room.code);
      return { room, seat: removed.seat };
    }
  }
  return null;
}

export function markInGame(code: string): void {
  const room = rooms.get(code);
  if (room) room.state = 'in-game';
}

export { toSummary };
