import { api } from '@engarde/backend/convex/_generated/api';
import { Link, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { type FormEvent, useState } from 'react';
import { Button } from '../../primitives';
import { errorMessage } from './AppScreen';

// Account → campaigns: the caller's joined + pending campaigns, plus the two
// ways in (create one; enter a code) and a pointer to the public directory.
export function CampaignsPage() {
  const cards = useQuery(api.campaigns.listMine, {});
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-10">
      <section>
        <h1 className="text-3xl">Your campaigns</h1>
        {cards === undefined ? (
          <p className="mt-4 text-text-dim">Loading…</p>
        ) : cards.length === 0 ? (
          <p className="mt-4 text-text-dim">
            No campaigns yet — create one below, enter a code, or browse the{' '}
            <Link to="/directory" className="text-accent underline underline-offset-4">
              public directory
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-4 flex flex-col gap-3">
            {cards.map((card) => (
              <CampaignCard key={card.campaignId} card={card} />
            ))}
          </ul>
        )}
      </section>
      <JoinByCode />
      <CreateCampaign />
    </div>
  );
}

type Card = NonNullable<ReturnType<typeof useQuery<typeof api.campaigns.listMine>>>[number];

function CampaignCard({ card }: { card: Card }) {
  const cancelRequest = useMutation(api.campaigns.cancelJoinRequest);
  const body = (
    <div className="flex items-center justify-between gap-4 border border-line bg-ink-4 p-4 transition-colors group-hover:border-accent">
      <div className="min-w-0">
        <h2 className="truncate font-display text-xl">{card.name}</h2>
        {card.description ? (
          <p className="mt-1 truncate text-sm text-text-dim">{card.description}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {card.isOwner ? <RoleBadge label="Owner" tone="accent" /> : null}
        {card.status === 'active' ? (
          <>
            {card.campaignAccess === 'admin' && !card.isOwner ? (
              <RoleBadge label="Admin" tone="victory" />
            ) : null}
            <RoleBadge
              label={card.gameRole}
              tone={card.gameRole === 'director' ? 'accent' : 'dim'}
            />
          </>
        ) : (
          <RoleBadge label="Pending" tone="victory" />
        )}
      </div>
    </div>
  );
  if (card.status === 'active') {
    return (
      <li>
        <Link
          to="/campaigns/$campaignId"
          params={{ campaignId: card.campaignId }}
          className="group block"
        >
          {body}
        </Link>
      </li>
    );
  }
  return (
    <li className="flex flex-col gap-2">
      {body}
      <Button
        size="sm"
        className="self-end"
        onClick={() => cancelRequest({ campaignId: card.campaignId })}
      >
        Cancel request
      </Button>
    </li>
  );
}

export function RoleBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'accent' | 'victory' | 'dim';
}) {
  const toneClass =
    tone === 'accent'
      ? 'text-accent border-accent/40'
      : tone === 'victory'
        ? 'text-victory border-victory/40'
        : 'text-text-dim border-line';
  return <span className={`type-label border px-2 py-1 text-[0.65rem] ${toneClass}`}>{label}</span>;
}

function JoinByCode() {
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = code.trim();
    if (trimmed) navigate({ to: '/join/$code', params: { code: trimmed } });
  };
  return (
    <section>
      <h2 className="text-xl">Join with a code</h2>
      <form onSubmit={submit} className="mt-3 flex gap-2">
        <input
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="Campaign code"
          aria-label="Campaign code"
          className="h-11 min-w-0 flex-1 border border-line bg-ink-1 px-3 font-mono text-base uppercase tracking-widest placeholder:normal-case placeholder:font-body placeholder:tracking-normal placeholder:text-text-mute focus:border-rule focus:outline-none"
        />
        <Button type="submit" disabled={!code.trim()}>
          Look up
        </Button>
      </form>
    </section>
  );
}

function CreateCampaign() {
  const navigate = useNavigate();
  const create = useMutation(api.campaigns.create);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setBusy(true);
    create({ name, description })
      .then((campaignId) => navigate({ to: '/campaigns/$campaignId', params: { campaignId } }))
      .catch((cause) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };

  return (
    <section>
      <h2 className="text-xl">Create a campaign</h2>
      <p className="mt-1 text-sm text-text-dim">
        New campaigns start private — share the code or link from the campaign's settings.
      </p>
      <form onSubmit={submit} className="mt-3 flex flex-col gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Campaign name"
          aria-label="Campaign name"
          className="h-11 border border-line bg-ink-1 px-3 text-base placeholder:text-text-mute focus:border-rule focus:outline-none"
        />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Short description for the join screen (optional)"
          aria-label="Campaign description"
          rows={2}
          className="border border-line bg-ink-1 px-3 py-2 text-base placeholder:text-text-mute focus:border-rule focus:outline-none"
        />
        <Button
          type="submit"
          variant="primary"
          className="self-start"
          disabled={busy || !name.trim()}
        >
          Create campaign
        </Button>
        {error ? <p className="text-sm text-foe">{error}</p> : null}
      </form>
    </section>
  );
}
