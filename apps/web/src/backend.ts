// The one place the web app reads its backend deployment address. Absent in a
// fresh checkout until `pnpm dev:backend` (convex dev) writes .env.local; the UI degrades to a
// "backend not configured" state rather than crashing.
export const convexUrl: string | undefined = import.meta.env.VITE_CONVEX_URL;
