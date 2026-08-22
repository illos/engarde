import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { Button } from '../../primitives';
import { errorMessage } from '../campaigns/AppScreen';
import { RoleBadge } from '../campaigns/CampaignsPage';

// Character library: characters remain user-owned for their entire lifetime.
// Campaigns receive one revocable binding, never a copy of the character.
export function CharactersPage() {
  const characters = useQuery(api.characters.listMine, {});
  const campaignCards = useQuery(api.campaigns.listMine, {});
  if (characters === undefined || campaignCards === undefined)
    return <p className="py-16 text-center text-text-dim">Loading your characters…</p>;
  const campaigns = campaignCards.filter(
    (campaign): campaign is ActiveCampaign => campaign.status === 'active',
  );
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <section>
        <h1 className="text-3xl">Your characters</h1>
        <p className="mt-2 text-sm text-text-dim">
          Characters belong to you. Each can join one campaign at a time, and its progression
          travels with it.
        </p>
        {characters.length === 0 ? (
          <p className="mt-4 text-text-dim">No characters yet — create your first one below.</p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {characters.map((character) => (
              <CharacterCard
                key={character.characterId}
                character={character}
                campaigns={campaigns}
              />
            ))}
          </ul>
        )}
      </section>
      <CreateCharacter campaigns={campaigns} />
    </div>
  );
}

type Characters = NonNullable<ReturnType<typeof useQuery<typeof api.characters.listMine>>>;
type Campaigns = NonNullable<ReturnType<typeof useQuery<typeof api.campaigns.listMine>>>;
type ActiveCampaign = Campaigns[number] & { status: 'active' };

function CharacterCard({
  character,
  campaigns,
}: {
  character: Characters[number];
  campaigns: ActiveCampaign[];
}) {
  const submit = useMutation(api.characters.submit);
  const withdraw = useMutation(api.characters.withdraw);
  const remove = useMutation(api.characters.removeFromCampaign);
  const [campaignId, setCampaignId] = useState<Id<'campaigns'> | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const run = (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    action()
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <li className="border border-line bg-ink-1 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-xl">{character.name}</h2>
          <p className="font-mono text-xs text-text-mute">Level {character.level}</p>
          {character.concept ? (
            <p className="mt-2 whitespace-pre-wrap text-sm text-text-dim">{character.concept}</p>
          ) : null}
        </div>
        {character.binding ? (
          <div className="flex items-center gap-2">
            <Link
              to="/campaigns/$campaignId"
              params={{ campaignId: character.binding.campaignId }}
              className="text-sm text-accent underline underline-offset-4"
            >
              {character.binding.campaignName}
            </Link>
            <RoleBadge
              label={character.binding.status}
              tone={character.binding.status === 'active' ? 'victory' : 'dim'}
            />
          </div>
        ) : null}
      </div>
      <div className="mt-4 border-t border-line-soft pt-3">
        {character.binding?.status === 'pending' ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() => run(() => withdraw({ characterId: character.characterId }))}
          >
            Withdraw submission
          </Button>
        ) : character.binding?.status === 'active' ? (
          <Button
            size="sm"
            variant="danger"
            disabled={busy}
            onClick={() => {
              if (window.confirm(`Remove ${character.name} from this campaign?`))
                run(() => remove({ characterId: character.characterId }));
            }}
          >
            Remove from campaign
          </Button>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-text-dim">Join a campaign before submitting this character.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <select
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value as Id<'campaigns'> | '')}
              aria-label={`Campaign for ${character.name}`}
              className="h-9 min-w-48 border border-line bg-ink-2 px-2 text-sm focus:border-accent focus:outline-none"
            >
              <option value="">Choose a campaign…</option>
              {campaigns.map((campaign) => (
                <option key={campaign.campaignId} value={campaign.campaignId}>
                  {campaign.name}
                </option>
              ))}
            </select>
            <Button
              size="sm"
              variant="primary"
              disabled={busy || campaignId === ''}
              onClick={() => {
                if (campaignId !== '')
                  run(() => submit({ characterId: character.characterId, campaignId }));
              }}
            >
              Submit
            </Button>
          </div>
        )}
        {error ? <p className="mt-2 text-sm text-foe">{error}</p> : null}
      </div>
    </li>
  );
}

function CreateCharacter({ campaigns }: { campaigns: ActiveCampaign[] }) {
  const create = useMutation(api.characters.create);
  const [name, setName] = useState('');
  const [concept, setConcept] = useState('');
  const [campaignId, setCampaignId] = useState<Id<'campaigns'> | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    create({
      name,
      concept,
      ...(campaignId === '' ? {} : { campaignId }),
    })
      .then(() => {
        setName('');
        setConcept('');
        setCampaignId('');
      })
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <section>
      <h2 className="text-xl">Create a character</h2>
      <p className="mt-1 text-sm text-text-dim">
        Mechanical choices arrive with the rules engine. For now, establish the character and
        optionally submit them to one of your campaigns.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="type-label text-xs text-text-mute">Name</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            className="h-11 border border-line bg-ink-1 px-3 text-base focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="type-label text-xs text-text-mute">Concept</span>
          <textarea
            value={concept}
            onChange={(event) => setConcept(event.target.value)}
            maxLength={300}
            rows={3}
            placeholder="A short description (optional)"
            className="border border-line bg-ink-1 px-3 py-2 text-base placeholder:text-text-mute focus:border-accent focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="type-label text-xs text-text-mute">Campaign</span>
          <select
            value={campaignId}
            onChange={(event) => setCampaignId(event.target.value as Id<'campaigns'> | '')}
            className="h-11 border border-line bg-ink-1 px-3 text-base focus:border-accent focus:outline-none"
          >
            <option value="">Keep unbound</option>
            {campaigns.map((campaign) => (
              <option key={campaign.campaignId} value={campaign.campaignId}>
                {campaign.name}
              </option>
            ))}
          </select>
        </label>
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          disabled={busy || !name.trim()}
        >
          Create character
        </Button>
        {error ? <p className="text-sm text-foe">{error}</p> : null}
      </form>
    </section>
  );
}
