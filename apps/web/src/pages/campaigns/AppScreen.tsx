import { Link } from '@tanstack/react-router';
import { AuthLoading, Authenticated, Unauthenticated } from 'convex/react';
import type { ReactNode } from 'react';
import { convexUrl } from '../../backend';
import { Surface } from '../../primitives';

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
    <div className="flex min-h-screen flex-col">
      {/* The chrome band — the black instrument frame (design-system.md §5.1).
          Brand renders in the display italic; nav is the engraved label voice.
          The band's bottom edge IS the press rule between chrome and field. */}
      <Surface kind="chrome" as="header" className="bg-ink-0">
        <div className="mx-auto flex h-14 w-full max-w-page items-center justify-between px-4 sm:px-6">
          <Link to="/" className="inline-flex h-11 items-center font-display text-xl italic">
            En Garde
          </Link>
          <nav className="flex items-center gap-6">
            <Link
              to="/campaigns"
              className="type-label inline-flex h-11 items-center border-b-2 border-transparent text-xs text-text-dim transition-colors hover:text-text [&.active]:border-accent-strong [&.active]:text-text"
            >
              Campaigns
            </Link>
            <Link
              to="/characters"
              className="type-label inline-flex h-11 items-center border-b-2 border-transparent text-xs text-text-dim transition-colors hover:text-text [&.active]:border-accent-strong [&.active]:text-text"
            >
              Characters
            </Link>
            <Link
              to="/directory"
              className="type-label inline-flex h-11 items-center border-b-2 border-transparent text-xs text-text-dim transition-colors hover:text-text [&.active]:border-accent-strong [&.active]:text-text"
            >
              Directory
            </Link>
          </nav>
        </div>
      </Surface>
      <AuthLoading>
        <main className="flex flex-1 items-center justify-center">
          <p className="text-text-dim">Restoring your session…</p>
        </main>
      </AuthLoading>
      <Unauthenticated>
        <main className="flex flex-1 flex-col items-center justify-center gap-3">
          <p className="text-text-dim">You need to sign in first.</p>
          <Link
            to="/"
            className="inline-flex h-11 items-center text-accent underline underline-offset-4"
          >
            Go to sign in
          </Link>
        </main>
      </Unauthenticated>
      <Authenticated>
        <main className="mx-auto w-full max-w-page flex-1 px-4 py-8 sm:px-6">{children}</main>
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
