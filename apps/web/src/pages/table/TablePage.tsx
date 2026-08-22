import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Button, QueryBoundary } from '../../primitives';
import { errorMessage } from '../campaigns/AppScreen';
import { RoleBadge } from '../campaigns/CampaignsPage';

// The Table — a campaign's live lobby. Sitting on this page IS being present:
// join on mount, heartbeat while open, leave on unmount; the stale window on
// the server covers tabs that die without a goodbye.
const HEARTBEAT_MS = 15_000;

export function TablePage({ campaignId }: { campaignId: Id<'campaigns'> }) {
  return (
    <QueryBoundary
      fallback={
        <div className="mx-auto max-w-md py-16 text-center">
          <h1 className="text-3xl">Campaign not found</h1>
          <p className="mt-3 text-text-dim">
            Either it doesn't exist or you're not a member of it.
          </p>
        </div>
      }
    >
      <TableBody campaignId={campaignId} />
    </QueryBoundary>
  );
}

function usePresence(campaignId: Id<'campaigns'>) {
  const join = useMutation(api.lobby.join);
  const heartbeat = useMutation(api.lobby.heartbeat);
  const leave = useMutation(api.lobby.leave);
  useEffect(() => {
    // Presence failures are non-fatal: the queries behind the page already
    // surface not-found, and a missed beat only ages the row.
    join({ campaignId }).catch(() => {});
    const interval = setInterval(() => {
      heartbeat({ campaignId }).catch(() => {});
    }, HEARTBEAT_MS);
    return () => {
      clearInterval(interval);
      leave({ campaignId }).catch(() => {});
    };
  }, [campaignId, join, heartbeat, leave]);
}

function TableBody({ campaignId }: { campaignId: Id<'campaigns'> }) {
  usePresence(campaignId);
  const players = useQuery(api.lobby.listPresent, { campaignId });
  const messages = useQuery(api.lobby.listMessages, { campaignId });
  if (players === undefined || messages === undefined)
    return <p className="py-16 text-center text-text-dim">Taking your seat…</p>;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-3xl">The Table</h1>
      <div className="flex flex-col gap-6 sm:flex-row">
        <PlayersPanel players={players} />
        <ChatPanel campaignId={campaignId} messages={messages} />
      </div>
    </div>
  );
}

type Players = NonNullable<ReturnType<typeof useQuery<typeof api.lobby.listPresent>>>;
type Messages = NonNullable<ReturnType<typeof useQuery<typeof api.lobby.listMessages>>>;

function PlayersPanel({ players }: { players: Players }) {
  return (
    <section className="sm:w-64 sm:shrink-0">
      <h2 className="type-label text-xs text-text-mute">At the Table</h2>
      <ul className="mt-3 flex flex-col divide-y divide-line-soft border border-line bg-ink-1">
        {players.map((player) => (
          <li key={player.userId} className="flex items-center gap-3 p-3">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg">{player.displayName}</p>
              <p className="truncate font-mono text-xs text-text-mute">@{player.handle}</p>
            </div>
            {player.role === 'director' ? <RoleBadge label="Director" tone="accent" /> : null}
          </li>
        ))}
      </ul>
      {players.length === 0 ? (
        <p className="mt-3 text-sm text-text-dim">Nobody seated yet.</p>
      ) : null}
    </section>
  );
}

function timeTag(sentAt: number): string {
  return new Date(sentAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function ChatPanel({ campaignId, messages }: { campaignId: Id<'campaigns'>; messages: Messages }) {
  const sendMessage = useMutation(api.lobby.sendMessage);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new messages
  useEffect(() => {
    const pane = scrollRef.current;
    if (pane) pane.scrollTop = pane.scrollHeight;
  }, [messages.length]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0) return;
    setError(null);
    setDraft('');
    sendMessage({ campaignId, body }).catch((cause) => {
      setError(errorMessage(cause));
      setDraft(body);
    });
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <h2 className="type-label text-xs text-text-mute">Table talk</h2>
      <div
        ref={scrollRef}
        className="mt-3 flex h-96 flex-col gap-3 overflow-y-auto border border-line bg-ink-1 p-4"
      >
        {messages.length === 0 ? (
          <p className="m-auto text-sm text-text-dim">No messages yet — say hello.</p>
        ) : (
          messages.map((message) => (
            <div key={message.messageId}>
              <p className="flex items-baseline gap-2">
                <span className="font-display text-base">{message.authorName}</span>
                <time className="font-mono text-xs text-text-mute">{timeTag(message.sentAt)}</time>
              </p>
              <p className="whitespace-pre-wrap break-words text-sm">{message.body}</p>
            </div>
          ))
        )}
      </div>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={1000}
          placeholder="Say something…"
          aria-label="Message"
          className="h-11 min-w-0 flex-1 border border-line bg-ink-2 px-3 text-sm text-text placeholder:text-text-mute focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        />
        <Button type="submit" variant="primary">
          Send
        </Button>
      </form>
      {error ? <p className="mt-2 text-sm text-foe">{error}</p> : null}
    </section>
  );
}
