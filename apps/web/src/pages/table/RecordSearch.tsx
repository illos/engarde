import { api } from '@engarde/backend/convex/_generated/api';
import type { Id } from '@engarde/backend/convex/_generated/dataModel';
import { useQuery } from 'convex/react';
import { useState } from 'react';
import { Button } from '../../primitives';

// Record search for the Table's play panels (extracted from EncounterPanel
// for reuse by the turn rail's triggered/villain pickers): full-text over
// the human-facing slug, with what the grammar can currently do with each
// hit (parsed tiers = the engine-dispatchable part; residue = shown
// verbatim at the table).

export type SearchHits = NonNullable<
  ReturnType<typeof useQuery<typeof api.encounters.searchRecords>>
>;

export function RecordSearch({
  campaignId,
  onPick,
  pickLabel,
  requireParsedTier,
  requireEffect = false,
  searchLabel,
}: {
  campaignId: Id<'campaigns'>;
  onPick: (hit: SearchHits[number]) => void;
  pickLabel: string;
  requireParsedTier: boolean;
  requireEffect?: boolean;
  searchLabel: string;
}) {
  const [term, setTerm] = useState('');
  const hits = useQuery(
    api.encounters.searchRecords,
    term.trim().length >= 2 ? { campaignId, term } : 'skip',
  );
  return (
    <div>
      <input
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder="Search the books… (e.g. blood-for-blood)"
        aria-label={searchLabel}
        className="h-11 w-full border border-line bg-ink-2 px-3 text-sm text-text placeholder:text-text-mute focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-rule"
      />
      {hits && hits.length > 0 ? (
        <ul className="mt-2 flex flex-col divide-y divide-line-soft border border-line bg-ink-2">
          {hits.map((hit) => {
            const usable =
              (!requireParsedTier || hit.parsedTiers.length > 0) &&
              (!requireEffect || hit.effects.length > 0);
            return (
              <li key={hit.artifactId} className="flex items-center gap-2 p-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-xs">{hit.slug}</p>
                  <p className="truncate text-xs text-text-mute">
                    {hit.autoRollable
                      ? 'rolls automatically'
                      : hit.parsedTiers.length > 0
                        ? `tiers parsed: ${hit.parsedTiers.join(', ')}`
                        : hit.effects.length > 0
                          ? `${hit.effects.length} Effect instruction${hit.effects.length === 1 ? '' : 's'}`
                          : 'nothing automatable yet — plays as a verbatim card'}
                    {hit.hasStats ? ' · stat block' : ''}
                    {hit.effects.length > 0 && (hit.autoRollable || hit.parsedTiers.length > 0)
                      ? ` · ${hit.effects.length} Effect${hit.effects.length === 1 ? '' : 's'}`
                      : ''}
                    {hit.residueSpans > 0 ? ' · has table-card text' : ''}
                  </p>
                </div>
                <Button size="sm" disabled={!usable} onClick={() => onPick(hit)}>
                  {pickLabel}
                </Button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
