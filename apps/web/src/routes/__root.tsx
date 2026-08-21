import { Outlet, createRootRoute } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: () => (
    <div className="min-h-screen bg-stone-950 text-stone-100 antialiased">
      <Outlet />
    </div>
  ),
});
