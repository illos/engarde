import { ConvexAuthProvider } from '@convex-dev/auth/react';
import { RouterProvider, createRouter } from '@tanstack/react-router';
import { ConvexReactClient } from 'convex/react';
import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import { convexUrl } from './backend';
import { routeTree } from './routeTree.gen';
import './styles.css';

const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}

const app = convexUrl ? (
  <ConvexAuthProvider client={new ConvexReactClient(convexUrl)}>
    <RouterProvider router={router} />
  </ConvexAuthProvider>
) : (
  <RouterProvider router={router} />
);

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('missing #root element');
ReactDOM.createRoot(rootElement).render(<StrictMode>{app}</StrictMode>);
