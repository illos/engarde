import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  envDir: '../web',
  server: {
    port: 5174,
    host: '127.0.0.1',
    allowedHosts: ['.ts.net'],
  },
  test: {
    environment: 'jsdom',
  },
});
