import { type ErrorComponentProps, Link, Outlet, createRootRoute } from '@tanstack/react-router';

function RootError({ reset }: ErrorComponentProps) {
  return (
    <main role="alert" className="flex min-h-screen items-center justify-center px-6">
      <section className="max-w-lg border border-foe/50 bg-ink-4 p-6 text-center">
        <p className="type-label text-xs text-foe">Unexpected error</p>
        <h1 className="mt-2 text-4xl">En Garde hit a problem</h1>
        <p className="mt-3 text-text-dim">
          Your data is still safe. Retry the page, or return home if the problem continues.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="type-label inline-flex h-11 items-center border border-accent bg-accent px-4 text-xs font-semibold text-on-accent hover:bg-accent-strong"
            onClick={reset}
          >
            Try again
          </button>
          <Link
            to="/"
            className="type-label inline-flex h-11 items-center border border-line px-4 text-xs font-semibold hover:bg-ink-1"
          >
            Return home
          </Link>
        </div>
      </section>
    </main>
  );
}

function RootNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center px-6">
      <section className="max-w-lg border border-line bg-ink-4 p-6 text-center">
        <p className="type-label text-xs text-text-mute">404</p>
        <h1 className="mt-2 text-4xl">Page not found</h1>
        <p className="mt-3 text-text-dim">That route does not exist in En Garde.</p>
        <Link
          to="/"
          className="type-label mt-6 inline-flex h-11 items-center border border-accent bg-accent px-4 text-xs font-semibold text-on-accent hover:bg-accent-strong"
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
