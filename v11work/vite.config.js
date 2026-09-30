import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(rootDir, 'index.html'),
        login: resolve(rootDir, 'login.html'),
        account: resolve(rootDir, 'account.html'),
        app: resolve(rootDir, 'app.html'),
        dashboard: resolve(rootDir, 'dashboard.html'),
      },
    },
  },
});
