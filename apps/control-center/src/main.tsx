import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { RouterProvider } from '@tanstack/react-router';
import { ConvexReactClient } from 'convex/react';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { convexUrl } from './backend';
import { router } from './router';
import './styles.css';

function BackendMissing() {
  return (
    <main className="control-grid flex min-h-screen items-center justify-center bg-ink-0 px-6 text-text">
      <section className="max-w-xl border border-foe/50 bg-ink-1 p-6">
        <p className="type-label text-xs text-foe">Backend unavailable</p>
        <h1 className="mt-2 text-4xl">System Control Center</h1>
        <p className="mt-3 text-text-dim">
          Configure VITE_CONVEX_URL or run the local backend before opening installation controls.
        </p>
      </section>
    </main>
  );
}

const app = convexUrl ? (
  <ConvexAuthProvider client={new ConvexReactClient(convexUrl)}>
    <RouterProvider router={router} />
  </ConvexAuthProvider>
) : (
  <BackendMissing />
);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('missing #root element');
ReactDOM.createRoot(rootElement).render(<StrictMode>{app}</StrictMode>);
