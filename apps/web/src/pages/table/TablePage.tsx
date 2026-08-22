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
      <TableSurface campaignId={campaignId} />
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

export function TableSurface({ campaignId }: { campaignId: Id<'campaigns'> }) {
  usePresence(campaignId);
  const players = useQuery(api.lobby.listPresent, { campaignId });
  const messages = useQuery(api.lobby.listMessages, { campaignId });
  if (players === undefined || messages === undefined)
    return <p className="py-16 text-center text-text-dim">Taking your seat…</p>;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <h1 className="text-3xl">The Table</h1>
      <SessionPanel campaignId={campaignId} />
      <SessionHistoryPanel campaignId={campaignId} />
      <div className="flex flex-col gap-6 sm:flex-row">
        <PlayersPanel players={players} />
        <ChatPanel campaignId={campaignId} messages={messages} />
      </div>
    </div>
  );
}

function SessionPanel({ campaignId }: { campaignId: Id<'campaigns'> }) {
  const session = useQuery(api.sessions.getActive, { campaignId });
  const characters = useQuery(api.characters.listForCampaign, { campaignId });
  const roster = useQuery(api.campaigns.listRoster, { campaignId });
  const grants = useQuery(api.sessions.listControlGrants, { campaignId });
  const start = useMutation(api.sessions.start);
  const end = useMutation(api.sessions.end);
  const addCharacter = useMutation(api.sessions.addCharacter);
  const removeCharacter = useMutation(api.sessions.removeCharacter);
  const offerControl = useMutation(api.sessions.offerControl);
  const respondToControl = useMutation(api.sessions.respondToControl);
  const revokeControl = useMutation(api.sessions.revokeControl);
  const relinquishControl = useMutation(api.sessions.relinquishControl);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [recipient, setRecipient] = useState<Record<string, string>>({});
  const [scope, setScope] = useState<'session' | 'persistent'>('session');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (
    session === undefined ||
    characters === undefined ||
    roster === undefined ||
    grants === undefined
  )
    return <p className="text-sm text-text-dim">Preparing the session…</p>;

  const run = (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    action()
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  const activeCharacters = characters.characters.filter(
    (character) => character.status === 'active',
  );
  const activeIds = new Set(session?.roster.map((entry) => entry.characterId));
  const isDirector = roster.viewer.gameRole === 'director';

  if (session === null) {
    return (
      <section className="border border-line bg-ink-1 p-4">
        <h2 className="text-xl">No active session</h2>
        {isDirector ? (
          <>
            <p className="mt-1 text-sm text-text-dim">
              Choose the starting roster. This selection freezes the resource-generation basis.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {activeCharacters.map((character) => (
                <label key={character.characterId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={Boolean(selected[character.characterId])}
                    onChange={(event) =>
                      setSelected((current) => ({
                        ...current,
                        [character.characterId]: event.target.checked,
                      }))
                    }
                  />
                  {character.name}
                </label>
              ))}
            </div>
            <Button
              className="mt-4"
              variant="primary"
              disabled={busy || !activeCharacters.some((entry) => selected[entry.characterId])}
              onClick={() =>
                run(() =>
                  start({
                    campaignId,
                    characterIds: activeCharacters
                      .filter((entry) => selected[entry.characterId])
                      .map((entry) => entry.characterId),
                  }),
                )
              }
            >
              Start session
            </Button>
          </>
        ) : (
          <p className="mt-1 text-sm text-text-dim">The Director chooses when play begins.</p>
        )}
        {error ? <p className="mt-2 text-sm text-foe">{error}</p> : null}
      </section>
    );
  }

  return (
    <section className="border border-line bg-ink-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl">Session {session.number}</h2>
          <p className="mt-1 text-sm text-text-dim">
            Starting basis: {session.resources.basisCharacterCount} characters · level total{' '}
            {session.resources.basisLevelTotal}. Roster changes do not regenerate it.
          </p>
        </div>
        {isDirector ? (
          <Button
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm('End this session? It becomes immutable history.'))
                run(() => end({ campaignId }));
            }}
          >
            End session
          </Button>
        ) : null}
      </div>
      <ul className="mt-4 grid gap-2 sm:grid-cols-2">
        {session.roster.map((entry) => {
          const character = activeCharacters.find((item) => item.characterId === entry.characterId);
          const otherMembers = roster.members.filter(
            (member) => member.userId !== entry.ownerUserId,
          );
          return (
            <li key={entry.characterId} className="border border-line-soft bg-ink-2 p-3">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-display">{entry.name}</span>
                {entry.canControl ? <RoleBadge label="Control" tone="victory" /> : null}
                {entry.initial ? <RoleBadge label="Initial" tone="dim" /> : null}
                {isDirector ? (
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={busy}
                    onClick={() =>
                      run(() => removeCharacter({ campaignId, characterId: entry.characterId }))
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              {character?.isMine && otherMembers.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-line-soft pt-3">
                  <select
                    aria-label={`Control recipient for ${entry.name}`}
                    className="h-9 min-w-0 flex-1 border border-line bg-ink-1 px-2 text-sm"
                    value={recipient[entry.characterId] ?? ''}
                    onChange={(event) =>
                      setRecipient((current) => ({
                        ...current,
                        [entry.characterId]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Offer control to…</option>
                    {otherMembers.map((member) => (
                      <option key={member.userId} value={member.userId}>
                        {member.displayName}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label="Control scope"
                    className="h-9 border border-line bg-ink-1 px-2 text-sm"
                    value={scope}
                    onChange={(event) => setScope(event.target.value as 'session' | 'persistent')}
                  >
                    <option value="session">This session</option>
                    <option value="persistent">Until revoked</option>
                  </select>
                  <Button
                    size="sm"
                    disabled={busy || !recipient[entry.characterId]}
                    onClick={() => {
                      const target = recipient[entry.characterId] as Id<'users'> | undefined;
                      if (target)
                        run(() =>
                          offerControl({
                            characterId: entry.characterId,
                            granteeUserId: target,
                            scope,
                          }),
                        );
                    }}
                  >
                    Offer
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {isDirector && activeCharacters.some((entry) => !activeIds.has(entry.characterId)) ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-line-soft pt-4">
          {activeCharacters
            .filter((entry) => !activeIds.has(entry.characterId))
            .map((entry) => (
              <Button
                key={entry.characterId}
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(() => addCharacter({ campaignId, characterId: entry.characterId }))
                }
              >
                Add {entry.name}
              </Button>
            ))}
        </div>
      ) : null}
      {grants.length > 0 ? (
        <div className="mt-4 border-t border-line-soft pt-4">
          <h3 className="type-label text-xs text-text-mute">Control grants</h3>
          <ul className="mt-2 grid gap-2">
            {grants.map((grant) => (
              <li key={grant.grantId} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="min-w-0 flex-1">
                  {grant.characterName} → {grant.granteeName} · {grant.scope} · {grant.status}
                </span>
                {grant.granteeUserId === session.viewer.userId && grant.status === 'pending' ? (
                  <>
                    <Button
                      size="sm"
                      variant="primary"
                      disabled={busy}
                      onClick={() =>
                        run(() => respondToControl({ grantId: grant.grantId, accept: true }))
                      }
                    >
                      Accept
                    </Button>
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        run(() => respondToControl({ grantId: grant.grantId, accept: false }))
                      }
                    >
                      Decline
                    </Button>
                  </>
                ) : null}
                {grant.grantorUserId === session.viewer.userId &&
                (grant.status === 'pending' || grant.status === 'accepted') ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => run(() => revokeControl({ grantId: grant.grantId }))}
                  >
                    Revoke
                  </Button>
                ) : null}
                {grant.granteeUserId === session.viewer.userId && grant.status === 'accepted' ? (
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={() => run(() => relinquishControl({ grantId: grant.grantId }))}
                  >
                    Relinquish
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {error ? <p className="mt-2 text-sm text-foe">{error}</p> : null}
    </section>
  );
}

function sessionTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function SessionHistoryPanel({ campaignId }: { campaignId: Id<'campaigns'> }) {
  const history = useQuery(api.sessions.listHistory, { campaignId });
  if (history === undefined)
    return <p className="text-sm text-text-dim">Loading session history…</p>;
  return (
    <section>
      <h2 className="type-label text-xs text-text-mute">Session history</h2>
      {history.length === 0 ? (
        <p className="mt-3 text-sm text-text-dim">No completed sessions yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col divide-y divide-line-soft border border-line bg-ink-1">
          {history.map((session) => (
            <li
              key={session.sessionId}
              className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 p-3"
            >
              <span className="font-display text-lg">Session {session.number}</span>
              <span className="text-sm text-text-dim">
                <time dateTime={new Date(session.startedAt).toISOString()}>
                  {sessionTime(session.startedAt)}
                </time>{' '}
                –{' '}
                <time dateTime={new Date(session.endedAt).toISOString()}>
                  {sessionTime(session.endedAt)}
                </time>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
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
