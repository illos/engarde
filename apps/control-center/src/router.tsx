import {
  type ErrorComponentProps,
  Link,
  Outlet,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import {
  SystemControlCenterAuditPage,
  SystemControlCenterPage,
  SystemControlCenterSetupPage,
} from './ControlCenter';

function ControlCenterShell() {
  return (
    <div className="control-grid min-h-screen bg-ink-0 text-text">
      <header className="border-b border-line bg-ink-1/95">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div>
            <p className="type-label text-xs text-accent">En Garde</p>
            <h1 className="mt-1 text-3xl">System Control Center</h1>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link
              to="/"
              className="inline-flex h-11 items-center text-text-dim hover:text-accent [&.active]:text-accent"
            >
              Overview
            </Link>
            <Link
              to="/audit"
              className="inline-flex h-11 items-center text-text-dim hover:text-accent [&.active]:text-accent"
            >
              Audit
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}

function RootError({ reset }: ErrorComponentProps) {
  return (
    <main role="alert" className="flex min-h-screen items-center justify-center bg-ink-0 px-6">
      <section className="max-w-lg border border-foe/50 bg-ink-1 p-6 text-center">
        <p className="type-label text-xs text-foe">Unexpected error</p>
        <h1 className="mt-2 text-4xl">Control Center unavailable</h1>
        <p className="mt-3 text-text-dim">Retry this view or return to the overview.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="inline-flex h-11 items-center border border-accent-strong bg-accent px-4 font-semibold text-ink-0"
            onClick={reset}
          >
            Try again
          </button>
          <Link to="/" className="inline-flex h-11 items-center border border-line px-4">
            Overview
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
        <h1 className="mt-2 text-4xl">Control page not found</h1>
        <Link
          to="/"
          className="mt-6 inline-flex h-11 items-center border border-accent-strong bg-accent px-4 font-semibold text-ink-0"
        >
          Return to overview
        </Link>
      </section>
    </main>
  );
}

const rootRoute = createRootRoute({
  component: ControlCenterShell,
  errorComponent: RootError,
  notFoundComponent: RootNotFound,
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: SystemControlCenterPage,
});
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SystemControlCenterSetupPage,
});
const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/audit',
  component: SystemControlCenterAuditPage,
});
const routeTree = rootRoute.addChildren([indexRoute, setupRoute, auditRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
