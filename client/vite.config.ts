import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const certPath = path.resolve(__dirname, '../server/certs/localhost.crt');
const keyPath = path.resolve(__dirname, '../server/certs/localhost.key');
const hasCerts = fs.existsSync(certPath) && fs.existsSync(keyPath);

let commitCount = process.env.COMMIT_COUNT || '';
if (!commitCount) {
  try {
    commitCount = execSync('git rev-list --count HEAD').toString().trim();
  } catch {
    commitCount = '?';
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __COMMIT_COUNT__: JSON.stringify(commitCount),
  },
  server: {
    port: 5173,
    host: true,
    ...(hasCerts
      ? {
          https: {
            cert: fs.readFileSync(certPath),
            key: fs.readFileSync(keyPath),
          },
        }
      : {}),
    proxy: {
      '/api': {
        target: 'https://127.0.0.1:3001',
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
