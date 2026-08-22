import { type ErrorComponentProps, Link, Outlet, createRootRoute } from '@tanstack/react-router';

function RootError({ reset }: ErrorComponentProps) {
  return (
    <main role="alert" className="flex min-h-screen items-center justify-center bg-ink-0 px-6">
      <section className="max-w-lg border border-foe/50 bg-ink-1 p-6 text-center">
        <p className="type-label text-xs text-foe">Unexpected error</p>
        <h1 className="mt-2 text-4xl">En Garde hit a problem</h1>
        <p className="mt-3 text-text-dim">
          Your data is still safe. Retry the page, or return home if the problem continues.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 items-center border border-accent-strong bg-accent px-4 font-semibold text-ink-0"
            onClick={reset}
          >
            Try again
          </button>
          <Link to="/" className="inline-flex h-11 items-center border border-line px-4">
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}

function RootNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-ink-0 px-6">
      <section className="max-w-lg border border-line bg-ink-1 p-6 text-center">
        <p className="type-label text-xs text-text-mute">404</p>
        <h1 className="mt-2 text-4xl">Page not found</h1>
        <p className="mt-3 text-text-dim">That route does not exist in En Garde.</p>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center border border-accent-strong bg-accent px-4 font-semibold text-ink-0"
        >
          Return home
        </Link>
      </section>
    </main>
  );
}

export const Route = createRootRoute({
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
  component: () => (
    <div className="min-h-screen">
      <Outlet />
    </div>
  ),
});
