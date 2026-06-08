import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3001',
        ws: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, '../server/public'),
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@cribbgolf/shared': path.resolve(__dirname, '../shared/src/index.ts'),
    },
  },
});
