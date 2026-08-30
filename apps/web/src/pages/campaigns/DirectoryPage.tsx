import { api } from '@engarde/backend/convex/_generated/api';
import { Link } from '@tanstack/react-router';
import { usePaginatedQuery } from 'convex/react';
import { Button } from '../../primitives';
import { RoleBadge } from './CampaignsPage';

// Public campaign directory — browse, click a listing, land on its join
// screen (the by-ID route, valid because directory campaigns are public).
export function DirectoryPage() {
  const { results, status, loadMore } = usePaginatedQuery(
    api.campaigns.listDirectory,
    {},
    { initialNumItems: 20 },
  );
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl">Campaign directory</h1>
      <p className="mt-1 text-sm text-text-dim">
        Public campaigns looking for players. Ask to join — the owner approves requests.
      </p>
      {status === 'LoadingFirstPage' ? (
        <p className="mt-6 text-text-dim">Loading…</p>
      ) : results.length === 0 ? (
        <p className="mt-6 text-text-dim">No public campaigns yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {results.map((entry) => (
            <li key={entry.campaignId}>
              <Link
                to="/directory/$campaignId"
                params={{ campaignId: entry.campaignId }}
                className="group block"
              >
                <div
                  className={`border border-line bg-ink-4 p-4 transition-colors group-hover:border-accent ${
                    entry.joinability === 'closed' ? 'opacity-60' : ''
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="truncate font-display text-xl">{entry.name}</h2>
                    <span className="flex shrink-0 items-baseline gap-2">
                      {entry.joinability === 'closed' ? (
                        <RoleBadge label="Closed" tone="dim" />
                      ) : null}
                      <span className="type-label text-xs text-text-mute">
                        {entry.memberCount} member{entry.memberCount === 1 ? '' : 's'}
                      </span>
                    </span>
                  </div>
                  {entry.description ? (
                    <p className="mt-1 truncate text-sm text-text-dim">{entry.description}</p>
                  ) : null}
                  <p className="type-label mt-2 text-xs text-text-mute">
                    Director of record: {entry.ownerName}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {status === 'CanLoadMore' ? (
        <Button className="mt-6" onClick={() => loadMore(20)}>
          Load more
        </Button>
      ) : null}
    </div>
  );
}
