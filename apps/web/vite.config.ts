import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [tanstackRouter({ target: 'react', autoCodeSplitting: true }), react(), tailwindcss()],
  server: {
    port: 5173,
    // Bind IPv4 loopback explicitly: `tailscale serve` proxies to 127.0.0.1,
    // but Vite's default `localhost` resolves to IPv6 [::1] on this box (→ 502).
    // Still loopback-only (no LAN exposure); the tailnet reaches it via serve.
    host: '127.0.0.1',
    // Accept the tailnet Host header so `tailscale serve` can proxy to Vite
    // for remote (iPad/iPhone) testing. Vite otherwise rejects non-localhost
    // Host headers. Leading dot = suffix match.
    allowedHosts: ['.ts.net'],
  },
  test: {
    environment: 'jsdom',
  },
});
