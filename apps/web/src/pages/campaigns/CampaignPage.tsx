import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useState } from 'react';
import { Button, CopyPill, QueryBoundary } from '../../primitives';
import { TableSurface } from '../table/TablePage';
import { errorMessage } from './AppScreen';
import { RoleBadge } from './CampaignsPage';

// Campaign home: roster for every member; settings + moderation for campaign admins.
export function CampaignPage({ campaignId }: { campaignId: Id<'campaigns'> }) {
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
      <CampaignBody campaignId={campaignId} />
    </QueryBoundary>
  );
}

function CampaignBody({ campaignId }: { campaignId: Id<'campaigns'> }) {
  const roster = useQuery(api.campaigns.listRoster, { campaignId });
  const campaignCharacters = useQuery(api.characters.listForCampaign, { campaignId });
  if (roster === undefined || campaignCharacters === undefined)
    return <p className="py-16 text-center text-text-dim">Loading…</p>;
  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10">
      <TableSurface campaignId={campaignId} />
      <MembersSection
        campaignId={campaignId}
        roster={roster}
        campaignCharacters={campaignCharacters}
      />
      {roster.viewer.canAdminister ? (
        <>
          <PendingSection campaignId={campaignId} pending={roster.pending ?? []} />
          <BlockedSection campaignId={campaignId} blocked={roster.blocked ?? []} />
          <SettingsSection campaignId={campaignId} />
        </>
      ) : null}
      {!roster.viewer.isOwner ? <LeaveSection campaignId={campaignId} /> : null}
    </div>
  );
}

type Roster = NonNullable<ReturnType<typeof useQuery<typeof api.campaigns.listRoster>>>;
type CampaignCharacters = NonNullable<
  ReturnType<typeof useQuery<typeof api.characters.listForCampaign>>
>;

// Shared runner for campaign actions: surfaces rejected mutations (network
// failures, races with concurrent moderation) instead of looking successful,
// and swallows re-clicks while one is in flight.
function useMutationRunner() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const run = (action: () => Promise<unknown>) => {
    if (busy) return;
    setError(null);
    setBusy(true);
    action()
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  return { error, busy, run };
}

function MutationError({ error }: { error: string | null }) {
  return error ? <p className="mt-2 text-sm text-foe">{error}</p> : null;
}

function MembersSection({
  campaignId,
  roster,
  campaignCharacters,
}: {
  campaignId: Id<'campaigns'>;
  roster: Roster;
  campaignCharacters: CampaignCharacters;
}) {
  const setDirector = useMutation(api.campaigns.setDirector);
  const setCampaignAccess = useMutation(api.campaigns.setCampaignAccess);
  const removeMember = useMutation(api.campaigns.removeMember);
  const blockUser = useMutation(api.campaigns.blockUser);
  const approveCharacter = useMutation(api.characters.approve);
  const denyCharacter = useMutation(api.characters.deny);
  const kickCharacter = useMutation(api.characters.kick);
  const withdrawCharacter = useMutation(api.characters.withdraw);
  const removeCharacter = useMutation(api.characters.removeFromCampaign);
  const { error, busy, run: moderate } = useMutationRunner();

  return (
    <section>
      <h1 className="text-3xl">Members</h1>
      <ul className="mt-4 flex flex-col divide-y divide-line-soft border border-line bg-ink-1">
        {roster.members.map((member) => (
          <li key={member.userId} className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-lg">{member.displayName}</p>
                <p className="truncate font-mono text-xs text-text-mute">@{member.handle}</p>
              </div>
              {member.isOwner ? <RoleBadge label="Owner" tone="accent" /> : null}
              {member.campaignAccess === 'admin' && !member.isOwner ? (
                <RoleBadge label="Admin" tone="victory" />
              ) : null}
              <RoleBadge
                label={member.gameRole}
                tone={member.gameRole === 'director' ? 'accent' : 'dim'}
              />
              {roster.viewer.canAdminister ? (
                <span className="flex gap-2">
                  {/* Any active member can take the screen — including the owner
                      reclaiming it after handing director to someone else. */}
                  {member.gameRole !== 'director' ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        moderate(() => setDirector({ campaignId, targetUserId: member.userId }))
                      }
                    >
                      Make Director
                    </Button>
                  ) : null}
                  {roster.viewer.isOwner && !member.isOwner ? (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        moderate(() =>
                          setCampaignAccess({
                            campaignId,
                            targetUserId: member.userId,
                            campaignAccess: member.campaignAccess === 'admin' ? 'user' : 'admin',
                          }),
                        )
                      }
                    >
                      {member.campaignAccess === 'admin' ? 'Revoke Admin' : 'Make Admin'}
                    </Button>
                  ) : null}
                  {!member.isOwner &&
                  (roster.viewer.isOwner || member.campaignAccess !== 'admin') ? (
                    <>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Remove ${member.displayName} from the campaign?`))
                            moderate(() =>
                              removeMember({ campaignId, targetUserId: member.userId }),
                            );
                        }}
                      >
                        Remove
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Block ${member.displayName}? They won't be able to request to join again.`,
                            )
                          )
                            moderate(() => blockUser({ campaignId, targetUserId: member.userId }));
                        }}
                      >
                        Block
                      </Button>
                    </>
                  ) : null}
                </span>
              ) : null}
            </div>
            <ul className="mt-3 flex flex-col gap-2 border-t border-line-soft pt-3">
              {campaignCharacters.characters
                .filter((character) => character.ownerUserId === member.userId)
                .map((character) => (
                  <li
                    key={character.characterId}
                    className="flex flex-wrap items-center gap-2 bg-ink-2 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display">{character.name}</p>
                      <p className="font-mono text-xs text-text-mute">Level {character.level}</p>
                    </div>
                    <RoleBadge
                      label={character.status}
                      tone={character.status === 'active' ? 'victory' : 'dim'}
                    />
                    {character.status === 'pending' && roster.viewer.canAdminister ? (
                      <>
                        <Button
                          size="sm"
                          variant="primary"
                          disabled={busy}
                          onClick={() =>
                            moderate(() =>
                              approveCharacter({
                                campaignId,
                                characterId: character.characterId,
                              }),
                            )
                          }
                        >
                          Approve character
                        </Button>
                        <Button
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            moderate(() =>
                              denyCharacter({
                                campaignId,
                                characterId: character.characterId,
                              }),
                            )
                          }
                        >
                          Deny character
                        </Button>
                      </>
                    ) : null}
                    {character.status === 'pending' && character.isMine ? (
                      <Button
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          moderate(() => withdrawCharacter({ characterId: character.characterId }))
                        }
                      >
                        Withdraw
                      </Button>
                    ) : null}
                    {character.status === 'active' && character.isMine ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Remove ${character.name} from this campaign?`))
                            moderate(() => removeCharacter({ characterId: character.characterId }));
                        }}
                      >
                        Remove character
                      </Button>
                    ) : null}
                    {character.status === 'active' &&
                    roster.viewer.canAdminister &&
                    !character.isMine ? (
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={busy}
                        onClick={() => {
                          if (window.confirm(`Kick ${character.name} from this campaign?`))
                            moderate(() =>
                              kickCharacter({
                                campaignId,
                                characterId: character.characterId,
                              }),
                            );
                        }}
                      >
                        Kick character
                      </Button>
                    ) : null}
                  </li>
                ))}
              {campaignCharacters.characters.every(
                (character) => character.ownerUserId !== member.userId,
              ) ? (
                <li className="text-sm text-text-mute">No characters attached.</li>
              ) : null}
            </ul>
          </li>
        ))}
      </ul>
      <MutationError error={error} />
    </section>
  );
}

function PendingSection({
  campaignId,
  pending,
}: {
  campaignId: Id<'campaigns'>;
  pending: NonNullable<Roster['pending']>;
}) {
  const approve = useMutation(api.campaigns.approveRequest);
  const deny = useMutation(api.campaigns.denyRequest);
  const block = useMutation(api.campaigns.blockUser);
  const { error, busy, run } = useMutationRunner();
  if (pending.length === 0) return null;
  return (
    <section>
      <h2 className="text-xl">Join requests</h2>
      <ul className="mt-3 flex flex-col divide-y divide-line-soft border border-line bg-ink-1">
        {pending.map((request) => (
          <li key={request.userId} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg">{request.displayName}</p>
              <p className="truncate font-mono text-xs text-text-mute">@{request.handle}</p>
            </div>
            <Button
              size="sm"
              variant="primary"
              disabled={busy}
              onClick={() => run(() => approve({ campaignId, targetUserId: request.userId }))}
            >
              Add
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => deny({ campaignId, targetUserId: request.userId }))}
            >
              Deny
            </Button>
            <Button
              size="sm"
              variant="danger"
              disabled={busy}
              onClick={() => run(() => block({ campaignId, targetUserId: request.userId }))}
            >
              Block
            </Button>
          </li>
        ))}
      </ul>
      <MutationError error={error} />
    </section>
  );
}

function BlockedSection({
  campaignId,
  blocked,
}: {
  campaignId: Id<'campaigns'>;
  blocked: NonNullable<Roster['blocked']>;
}) {
  const unblock = useMutation(api.campaigns.unblockUser);
  const { error, busy, run } = useMutationRunner();
  if (blocked.length === 0) return null;
  return (
    <section>
      <h2 className="text-xl">Blocked</h2>
      <ul className="mt-3 flex flex-col divide-y divide-line-soft border border-line bg-ink-1">
        {blocked.map((entry) => (
          <li key={entry.userId} className="flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-display text-lg">{entry.displayName}</p>
              <p className="truncate font-mono text-xs text-text-mute">@{entry.handle}</p>
            </div>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(() => unblock({ campaignId, targetUserId: entry.userId }))}
            >
              Unblock
            </Button>
          </li>
        ))}
      </ul>
      <MutationError error={error} />
    </section>
  );
}

function SettingsSection({ campaignId }: { campaignId: Id<'campaigns'> }) {
  const settings = useQuery(api.campaigns.getSettings, { campaignId });
  const setVisibility = useMutation(api.campaigns.setVisibility);
  const setJoinability = useMutation(api.campaigns.setJoinability);
  const regenerate = useMutation(api.campaigns.regenerateJoinCode);
  const { error, busy, run } = useMutationRunner();
  if (settings === undefined) return null;
  const shareLink = `${window.location.origin}/join/${settings.joinCode}`;
  const isPublic = settings.visibility === 'public';
  const isOpen = settings.joinability === 'open';
  return (
    <section className="border border-line bg-ink-1 p-4">
      <h2 className="text-xl">Campaign settings</h2>
      <dl className="mt-4 grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-3 text-sm">
        <dt className="type-label text-xs text-text-mute">Visibility</dt>
        <dd className="flex items-center gap-3">
          <RoleBadge label={settings.visibility} tone={isPublic ? 'victory' : 'dim'} />
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              run(() => setVisibility({ campaignId, visibility: isPublic ? 'private' : 'public' }))
            }
          >
            {isPublic ? 'Make private' : 'List publicly'}
          </Button>
        </dd>
        <dt className="type-label text-xs text-text-mute">Joining</dt>
        <dd className="flex items-center gap-3">
          <RoleBadge label={settings.joinability} tone={isOpen ? 'victory' : 'dim'} />
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              run(() => setJoinability({ campaignId, joinability: isOpen ? 'closed' : 'open' }))
            }
          >
            {isOpen ? 'Close joining' : 'Reopen joining'}
          </Button>
        </dd>
        <dt className={`type-label text-xs text-text-mute ${isOpen ? '' : 'opacity-50'}`}>
          Share code
        </dt>
        <dd className={isOpen ? '' : 'pointer-events-none opacity-50'}>
          <CopyPill value={settings.joinCode} label="share code" />
        </dd>
        <dt className={`type-label text-xs text-text-mute ${isOpen ? '' : 'opacity-50'}`}>
          Share link
        </dt>
        <dd className={`min-w-0 ${isOpen ? '' : 'pointer-events-none opacity-50'}`}>
          <CopyPill value={shareLink} label="share link" />
        </dd>
      </dl>
      {!isOpen ? (
        <p className="mt-3 text-sm text-text-dim">
          Joining is closed — the code, link, and directory listing won't accept new requests until
          you reopen it.
        </p>
      ) : null}
      <div className="mt-4 border-t border-line-soft pt-4">
        <Button
          size="sm"
          variant="danger"
          disabled={busy}
          onClick={() => {
            if (
              window.confirm(
                'Regenerate the share code? The current code and every share link stop working immediately.',
              )
            )
              run(() => regenerate({ campaignId }));
          }}
        >
          Regenerate share code
        </Button>
      </div>
      <MutationError error={error} />
    </section>
  );
}

function LeaveSection({ campaignId }: { campaignId: Id<'campaigns'> }) {
  const leave = useMutation(api.campaigns.leaveCampaign);
  const navigate = useNavigate();
  const { error, busy, run } = useMutationRunner();
  return (
    <section className="border-t border-line-soft pt-6">
      <Button
        variant="danger"
        disabled={busy}
        onClick={() => {
          if (window.confirm('Leave this campaign?'))
            run(() => leave({ campaignId }).then(() => navigate({ to: '/campaigns' })));
        }}
      >
        Leave campaign
      </Button>
      <MutationError error={error} />
    </section>
  );
}
