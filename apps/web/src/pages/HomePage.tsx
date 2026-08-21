import { api } from '@engarde/backend/convex/_generated/api';
import { useQuery } from 'convex/react';
import { convexUrl } from '../backend';

// Landing page for the substrate bootstrap: proves the frontend renders and
// reports whether a backend deployment is wired up. Replaced as real surfaces land.
export function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col items-center justify-center gap-8 px-6">
      <h1 className="font-serif text-6xl tracking-tight">En Garde</h1>
      <p className="text-center text-stone-400">
        A table for Draw Steel. Greenfield substrate — surfaces arrive as their backing lands.
      </p>
      <section className="w-full rounded-lg border border-stone-800 bg-stone-900 p-6">
        <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-stone-500">
          Substrate status
        </h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-stone-400">Frontend</dt>
          <dd>rendering</dd>
          <dt className="text-stone-400">Backend</dt>
          <dd>{convexUrl ? <LiveInstanceName /> : 'not configured — run `pnpm dev:backend`'}</dd>
        </dl>
      </section>
    </main>
  );
}

// Only mounted when a deployment URL exists (ConvexProvider is present).
function LiveInstanceName() {
  const name = useQuery(api.instance.getName);
  return <span>{name === undefined ? 'connecting…' : `connected — instance "${name}"`}</span>;
}
