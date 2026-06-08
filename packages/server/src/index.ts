import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { PORT, CLIENT_ORIGIN } from './config.js';
import { registerSocketHandlers } from './socket/socket-server.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';
const publicDir = join(__dirname, '..', 'public');

const app = express();
app.use(cors({ origin: isProd ? false : CLIENT_ORIGIN }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

// Serve built frontend in production
if (isProd && existsSync(publicDir)) {
  app.use(express.static(publicDir));
  // SPA fallback: serve index.html for all non-API routes
  app.get('*', (_req, res) => {
    res.sendFile(join(publicDir, 'index.html'));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: CLIENT_ORIGIN, methods: ['GET', 'POST'] },
});

io.on('connection', (socket) => {
  console.log(`[socket] connected: ${socket.id}`);
  registerSocketHandlers(io, socket);
});

httpServer.listen(PORT, () => {
  console.log(`CribbGolf server listening on port ${PORT}`);
});
