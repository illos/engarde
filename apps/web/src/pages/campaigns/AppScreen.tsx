import { Link } from '@tanstack/react-router';
import { AuthLoading, Authenticated, Unauthenticated } from 'convex/react';
import type { ReactNode } from 'react';
import { convexUrl } from '../../backend';

// Frame for every signed-in surface: header nav + the three auth states.
// Unauthenticated visitors are pointed at the home page's sign-in flow
// rather than being silently redirected — a /join/<code> link keeps its URL
// so the visitor can come back to it after signing in.
export function AppScreen({ children }: { children: ReactNode }) {
  if (!convexUrl) {
    return (
      <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-4 px-6">
        <h1 className="text-4xl">En Garde</h1>
        <p className="text-text-dim">Backend not configured — run `pnpm dev:backend`.</p>
      </main>
    );
  }
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-page flex-col px-4 sm:px-6">
      <header className="flex h-14 items-center justify-between border-b border-line-soft">
        <Link to="/" className="font-display text-xl uppercase tracking-wide">
          En Garde
        </Link>
        <nav className="flex items-center gap-6">
          <Link
            to="/campaigns"
            className="type-label text-xs text-text-dim transition-colors hover:text-text [&.active]:text-accent"
          >
            Campaigns
          </Link>
          <Link
            to="/characters"
            className="type-label text-xs text-text-dim transition-colors hover:text-text [&.active]:text-accent"
          >
            Characters
          </Link>
          <Link
            to="/directory"
            className="type-label text-xs text-text-dim transition-colors hover:text-text [&.active]:text-accent"
          >
            Directory
          </Link>
        </nav>
      </header>
      <AuthLoading>
        <main className="flex flex-1 items-center justify-center">
          <p className="text-text-dim">Restoring your session…</p>
        </main>
      </AuthLoading>
      <Unauthenticated>
        <main className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-text-dim">You need to sign in first.</p>
          <Link to="/" className="text-accent underline underline-offset-4">
            Go to sign in
          </Link>
        </main>
      </Unauthenticated>
      <Authenticated>
        <main className="flex-1 py-8">{children}</main>
      </Authenticated>
    </div>
  );
}

// Client-visible ConvexError payloads are the user-facing message; anything
// else gets a generic line rather than an internal error string.
export function errorMessage(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'data' in error &&
    typeof (error as { data: unknown }).data === 'string'
  ) {
    return (error as { data: string }).data;
  }
  return 'Something went wrong — try again';
}
