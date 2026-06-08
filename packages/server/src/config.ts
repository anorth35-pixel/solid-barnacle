export const PORT = parseInt(process.env.PORT ?? '3001', 10);
export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? 'http://localhost:5173';
export const RECONNECT_TIMEOUT_MS = 60_000;
export const MUGGINS_WINDOW_MS = 15_000;
