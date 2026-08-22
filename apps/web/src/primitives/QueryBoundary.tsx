import { Component, type ReactNode } from 'react';

function messageFor(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return '';
}

// Convex useQuery throws into render. Known access/not-found failures use the
// page-specific fallback; transport, server, and programming failures retain
// their real category and get a retry affordance instead of masquerading as a
// missing campaign.
export class QueryBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { error: unknown | null }
> {
  override state = { error: null };

  static getDerivedStateFromError(error: unknown) {
    return { error };
  }

  override render() {
    if (this.state.error === null) return this.props.children;
    if (/campaign not found/i.test(messageFor(this.state.error))) return this.props.fallback;
    return (
      <div role="alert" className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-3xl">Unable to load this page</h1>
        <p className="mt-3 text-text-dim">
          The service may be temporarily unavailable. Check your connection and try again.
        </p>
        <button
          type="button"
          className="mt-5 inline-flex h-11 items-center justify-center border border-accent-strong bg-accent px-4 text-sm font-semibold text-ink-0 hover:bg-accent-strong"
          onClick={() => this.setState({ error: null })}
        >
          Try again
        </button>
      </div>
    );
  }
}
