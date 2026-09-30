import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login.html'),
        account: resolve(__dirname, 'account.html'),
        app: resolve(__dirname, 'app.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
      },
    },
  },
});
