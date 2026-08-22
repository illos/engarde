import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { Link } from '@tanstack/react-router';
import { useMutation, useQuery } from 'convex/react';
import { useEffect, useRef, useState } from 'react';
import { Button, QueryBoundary, Surface } from '../../primitives';
import { errorMessage } from './AppScreen';

type JoinTarget =
  | { code: string; campaignId?: never }
  | { campaignId: Id<'campaigns'>; code?: never };

// The join screen: all three routes (directory listing, typed code, share
// link) land here. The campaign presents itself as a paper card (presentation
// surface); the action row underneath tracks the viewer's standing.
export function JoinScreen(target: JoinTarget) {
  return (
    <QueryBoundary
      fallback={
        <div className="mx-auto max-w-md py-16 text-center">
          <h1 className="text-3xl">Campaign not found</h1>
          <p className="mt-3 text-text-dim">
            The code or link may be wrong, or it may have been regenerated. Ask your Director for a
            fresh one.
          </p>
        </div>
      }
    >
      <JoinCard {...target} />
    </QueryBoundary>
  );
}

function JoinCard(target: JoinTarget) {
  return target.code !== undefined ? (
    <JoinCodeCard code={target.code} />
  ) : (
    <JoinCampaignCard campaignId={target.campaignId} />
  );
}

type Preview = NonNullable<ReturnType<typeof useQuery<typeof api.campaigns.getJoinPreview>>>;

function JoinCampaignCard({ campaignId }: { campaignId: Id<'campaigns'> }) {
  const preview = useQuery(api.campaigns.getJoinPreview, { campaignId });
  if (preview === undefined) {
    return <p className="py-16 text-center text-text-dim">Looking up the campaign…</p>;
  }
  return <ResolvedJoinCard target={{ campaignId }} preview={preview} />;
}

function JoinCodeCard({ code }: { code: string }) {
  const previewJoinCode = useMutation(api.campaigns.previewJoinCode);
  const lastRequestedCode = useRef<string | null>(null);
  const [preview, setPreview] = useState<Preview | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (lastRequestedCode.current === code) return;
    lastRequestedCode.current = code;
    let current = true;
    setPreview(undefined);
    setError(null);
    previewJoinCode({ code })
      .then((result) => {
        if (current) setPreview(result.status === 'found' ? result.preview : null);
      })
      .catch((cause) => {
        if (current) setError(errorMessage(cause));
      });
    return () => {
      current = false;
    };
  }, [code, previewJoinCode]);

  if (error) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-3xl">Campaign lookup unavailable</h1>
        <p className="mt-3 text-text-dim">{error}</p>
      </div>
    );
  }
  if (preview === undefined) {
    return <p className="py-16 text-center text-text-dim">Looking up the campaign…</p>;
  }
  if (preview === null) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-3xl">Campaign not found</h1>
        <p className="mt-3 text-text-dim">
          The code may be wrong or may have been regenerated. Ask your Director for a fresh one.
        </p>
      </div>
    );
  }
  return <ResolvedJoinCard target={{ code }} preview={preview} />;
}

function ResolvedJoinCard({ target, preview }: { target: JoinTarget; preview: Preview }) {
  return (
    <div className="mx-auto max-w-md">
      <Surface
        kind="presentation"
        as="article"
        className="border border-line bg-ink-1 p-6 shadow-card"
      >
        <p className="type-label text-xs text-text-mute">Campaign</p>
        <h1 className="mt-1 font-display text-3xl">{preview.name}</h1>
        {preview.description ? <p className="mt-3 text-text-dim">{preview.description}</p> : null}
        <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-line-soft pt-4 text-sm">
          <dt className="type-label text-xs text-text-mute">Director of record</dt>
          <dd>{preview.ownerName}</dd>
          <dt className="type-label text-xs text-text-mute">Members</dt>
          <dd className="tabular">{preview.memberCount}</dd>
        </dl>
      </Surface>
      <JoinActions
        target={target}
        viewerStatus={preview.viewerStatus}
        joinability={preview.joinability}
        campaignId={preview.campaignId}
      />
    </div>
  );
}

function JoinActions({
  target,
  viewerStatus,
  joinability,
  campaignId,
}: {
  target: JoinTarget;
  viewerStatus: 'none' | 'pending' | 'active';
  joinability: 'open' | 'closed';
  campaignId: Id<'campaigns'>;
}) {
  const requestToJoin = useMutation(api.campaigns.requestToJoin);
  const cancelRequest = useMutation(api.campaigns.cancelJoinRequest);
  const [error, setError] = useState<string | null>(null);

  const act = (action: () => Promise<unknown>) => {
    setError(null);
    action().catch((cause) => setError(errorMessage(cause)));
  };

  return (
    <div className="mt-4 flex flex-col items-stretch gap-2">
      {viewerStatus === 'none' && joinability === 'closed' ? (
        <Button disabled aria-disabled="true">
          Closed to new members
        </Button>
      ) : null}
      {viewerStatus === 'none' && joinability === 'open' ? (
        <Button
          variant="primary"
          onClick={() =>
            act(() =>
              requestToJoin(
                target.code !== undefined
                  ? { code: target.code }
                  : { campaignId: target.campaignId },
              ),
            )
          }
        >
          Join this Campaign
        </Button>
      ) : null}
      {viewerStatus === 'pending' ? (
        <>
          <p className="type-label border border-line-soft bg-ink-1 px-4 py-3 text-center text-xs text-victory">
            Pending — awaiting approval
          </p>
          <Button onClick={() => act(() => cancelRequest({ campaignId }))}>Cancel request</Button>
        </>
      ) : null}
      {viewerStatus === 'active' ? (
        <Link to="/campaigns/$campaignId" params={{ campaignId }}>
          <Button variant="primary" className="w-full">
            Open campaign
          </Button>
        </Link>
      ) : null}
      {error ? <p className="text-center text-sm text-foe">{error}</p> : null}
    </div>
  );
}
