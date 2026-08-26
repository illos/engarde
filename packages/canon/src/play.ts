import {
  DAMAGE_TYPES,
  type DamageType,
  type DriverSquadSeed,
  type Intent,
  type LogEntry,
  type ParticipantStats,
  type Transcript,
  createDriver,
  createSeededRandomSource,
  squadMemberStats,
} from '@engarde/engine';
import { compileEffectPrograms, tierOutcomeToIntents } from './effect-conformance.js';
import { type GrammarParse, auditGrammarConservation, parseEffectText } from './effect-grammar.js';

/**
 * Play session (engine-plan 5.1, CLI skin): full playability headless. This
 * is a THIN skin — every game consequence flows through the driver and the
 * channel-1 compiler (parsed verbatim text → intents); the skin adds command
 * parsing and rendering only, never rule semantics. Whatever the grammar
 * does not parse is shown verbatim as a card to resolve at the table (the
 * tier-3 fallback), never silently dropped.
 *
 * Participants are real corpus records (prime directive) — a session refuses
 * an actor whose record id is not in the loaded artifact store.
 */

export interface PlayActor {
  id: string;
  recordId: string;
  /** Stat-block-sourced or Director-asserted stats (driver semantics);
   * omitted = table-mode actor — receipts only, no vitals tracked. */
  stats?: ParticipantStats;
}

export interface PlayStepResult {
  output: string;
  quit: boolean;
}

export interface PlaySession {
  execute(line: string): PlayStepResult;
  transcript(): Transcript;
}

const BAND_ALIASES: Record<string, '≤11' | '12-16' | '17+'> = {
  '1': '≤11',
  t1: '≤11',
  '≤11': '≤11',
  '<=11': '≤11',
  '2': '12-16',
  t2: '12-16',
  '12-16': '12-16',
  '3': '17+',
  t3: '17+',
  '17+': '17+',
};

const HELP = `commands:
  status                                  participants and their conditions
  find <query>                            search loaded records by id
  show <query>                            verbatim record text + what parses
  use <query> <tier> <actor> <target>     use an ability at a tier outcome
                                          (tier: t1|t2|t3 for ≤11|12-16|17+)
  effect <query> <actor> <targets|none> [n] resolve Effect n (targets: a,b,obj:door)
                                          (a Recovery offer: bare id accepts, decline:<id> declines)
  endturn <actor> [<condition>=<roll>..]  end of turn; roll omitted = auto-roll
  remove <target> <condition> [as <actor>] [because <reason..>]
  clearterrain <factId> [because <reason..>] clear a recorded terrain fact (director)
  damage <target> <amount> [<type>] [area] [knockout] [victims <a,b>] [because <reason..>]
                                          manual damage (director); a squad member's
                                          damage routes to its squad's Stamina pool
  resolvekills <squad> <victim,victim..> [because <reason..>]
                                          name the victims of pool-counted kills (director)
  attach <squad> <captain>                attach a captain to a squad (director)
  detach <squad> [because <reason..>]     detach a squad's captain (director)
  end [keep <condition>..]                end the encounter (keeps are opt-in)
  log [n]                                 last n log entries (default 10)
  quit`;

function shortName(conditionOrInstanceId: string): string {
  const afterSlash = conditionOrInstanceId.split('/').pop() ?? conditionOrInstanceId;
  return afterSlash;
}

function renderLogEntry(entry: LogEntry): string {
  const refs = entry.canonRefs.length > 0 ? `  [canon: ${entry.canonRefs.join(', ')}]` : '';
  return `  ${entry.kind.toUpperCase()}: ${entry.message}${refs}`;
}

export function createPlaySession(options: {
  actors: readonly PlayActor[];
  /** artifact id → verbatim text, from the loaded bundle store. */
  records: ReadonlyMap<string, string>;
  /** Minion squad seeds [R-0023] — members are actor ids. The engine's
   * `initialEncounterState` refuses a canon-incoherent seed (thrown here);
   * the printed up-to-eight bound warns-and-applies (the host prints
   * `squadSeedWarnings`). */
  squads?: readonly DriverSquadSeed[];
  seed?: number;
}): PlaySession {
  const { actors, records } = options;
  for (const actor of actors) {
    if (!records.has(actor.recordId)) {
      throw new Error(
        `actor ${actor.id}: record ${actor.recordId} is not in the loaded artifact store — participants must be real corpus records`,
      );
    }
  }

  const driver = createDriver(
    actors.map((actor) => ({
      id: actor.id,
      sourceRecordId: actor.recordId,
      kind: 'director-creature' as const,
      ...(actor.stats ? { stats: actor.stats } : {}),
    })),
    { random: createSeededRandomSource(options.seed ?? 1) },
    options.squads ?? [],
  );
  let intentCounter = 0;
  const nextIntentId = (): string => {
    intentCounter += 1;
    return `cli-${intentCounter}`;
  };
  const parseCache = new Map<string, GrammarParse>();

  function parsedRecord(artifactId: string): GrammarParse {
    const cached = parseCache.get(artifactId);
    if (cached) return cached;
    const text = records.get(artifactId);
    if (text === undefined) throw new Error(`record not loaded: ${artifactId}`);
    const parse = parseEffectText(text);
    const problems = auditGrammarConservation(text, parse);
    if (problems.length > 0) {
      throw new Error(`grammar conservation failed for ${artifactId}: ${problems.join('; ')}`);
    }
    parseCache.set(artifactId, parse);
    return parse;
  }

  function resolveRecord(query: string): { id: string } | { error: string } {
    const lower = query.toLowerCase();
    const matches = [...records.keys()].filter((id) => id.toLowerCase().includes(lower)).sort();
    if (matches.length === 1 && matches[0] !== undefined) return { id: matches[0] };
    if (matches.length === 0) return { error: `no loaded record matches "${query}"` };
    const exact = matches.filter(
      (id) => shortName(id).toLowerCase() === lower || id.toLowerCase() === lower,
    );
    if (exact.length === 1 && exact[0] !== undefined) return { id: exact[0] };
    return {
      error: `"${query}" is ambiguous (${matches.length} matches):\n${matches
        .slice(0, 15)
        .map((id) => `  ${id}`)
        .join('\n')}${matches.length > 15 ? `\n  … ${matches.length - 15} more` : ''}`,
    };
  }

  function resolveParticipant(query: string): { id: string } | { error: string } {
    const state = driver.state();
    if (state.participants[query]) return { id: query };
    const lower = query.toLowerCase();
    const matches = Object.keys(state.participants).filter((id) =>
      id.toLowerCase().includes(lower),
    );
    if (matches.length === 1 && matches[0] !== undefined) return { id: matches[0] };
    return {
      error:
        matches.length === 0
          ? `no participant matches "${query}" (have: ${Object.keys(state.participants).join(', ')})`
          : `"${query}" is ambiguous: ${matches.join(', ')}`,
    };
  }

  function resolveInstance(
    participantId: string,
    query: string,
  ): { instanceId: string } | { error: string } {
    const participant = driver.state().participants[participantId];
    if (!participant) return { error: `unknown participant ${participantId}` };
    const lower = query.toLowerCase();
    const matches = participant.conditions.filter(
      (instance) =>
        instance.instanceId.toLowerCase().includes(lower) ||
        instance.conditionId.toLowerCase().includes(lower),
    );
    if (matches.length === 1 && matches[0] !== undefined)
      return { instanceId: matches[0].instanceId };
    if (matches.length === 0)
      return { error: `${participantId} has no condition matching "${query}"` };
    return {
      error: `"${query}" is ambiguous on ${participantId}: ${matches
        .map((instance) => instance.instanceId)
        .join(', ')}`,
    };
  }

  function dispatchAll(intents: readonly Intent[]): string[] {
    const lines: string[] = [];
    for (const intent of intents) {
      const result = driver.dispatch(intent);
      lines.push(...result.log.map(renderLogEntry));
      for (const violation of result.violations) {
        lines.push(`  INVARIANT VIOLATION: ${violation.code}: ${violation.detail}`);
      }
    }
    return lines;
  }

  function commandStatus(): string {
    const state = driver.state();
    const lines: string[] = [];
    for (const participant of Object.values(state.participants)) {
      lines.push(`${participant.id}  (${participant.sourceRecordId ?? 'no source record'})`);
      // Vitals render only for stat-tracked participants (table-mode actors
      // carry no stamina); Recoveries render only when recoveriesMax is
      // tracked [R-0018/R-0019] — null is omitted, never shown as zero.
      if (participant.stamina !== null && participant.stats !== null) {
        const temporary =
          participant.stamina.temporary > 0 ? ` (+${participant.stamina.temporary} temp)` : '';
        const recoveries =
          participant.stamina.recoveries !== null && participant.stats.recoveriesMax !== null
            ? `  recoveries ${participant.stamina.recoveries}/${participant.stats.recoveriesMax}`
            : '';
        lines.push(
          `  stamina ${participant.stamina.current}/${participant.stats.staminaMax}${temporary}${recoveries}`,
        );
      }
      if (participant.conditions.length === 0 && participant.grants.length === 0) {
        lines.push('  no conditions');
        continue;
      }
      for (const instance of participant.conditions) {
        const from = instance.source.participantId ? ` from ${instance.source.participantId}` : '';
        const via = instance.source.effectArtifactId
          ? ` via ${shortName(instance.source.effectArtifactId)}`
          : '';
        lines.push(
          `  ${shortName(instance.conditionId)} (${instance.ending.kind})${from}${via}  [${instance.instanceId}]`,
        );
      }
      for (const grant of participant.grants) {
        // Pending grants: next-roll modifiers [R-0012..R-0016] plus the v6
        // action/turn kinds (design §3).
        const shape =
          grant.kind === 'next-roll'
            ? grant.direction === 'inbound'
              ? `next strike against them: ${grant.polarity}`
              : `${grant.polarity} on next ${grant.scope === 'strike' ? 'strike' : 'power roll'}`
            : grant.kind === 'action'
              ? `additional ${grant.cost}${grant.magnitude > 1 ? ` ×${grant.magnitude}` : ''}`
              : grant.mode === 'allowance'
                ? `extra turn allowance ×${grant.magnitude}`
                : 'inserted out-of-order turn';
        const until =
          grant.kind === 'next-roll' && grant.window === 'end-of-targets-next-turn'
            ? ' until end of their next turn'
            : '';
        const via = grant.source.effectArtifactId
          ? ` via ${shortName(grant.source.effectArtifactId)}`
          : '';
        lines.push(`  pending: ${shape}${until}${via}  [${grant.grantId}]`);
      }
    }
    // Minion squad Stamina pools [R-0023..R-0028]: the squad line is the ONE
    // vitals surface for its members (their individual stamina is null — the
    // pool is the one home for squad vitality). The With-Captain entry is
    // the stat block's VERBATIM text, shown only while a captain is
    // attached; it is never automated [R-0028].
    if (state.squads.length > 0) {
      lines.push('squads:');
      for (const squad of state.squads) {
        lines.push(
          `  ${squad.name}  pool ${squad.pool.current}/${squad.pool.max} (per minion ${squad.perMinionStamina})  living ${squad.memberIds.length}  dead ${squad.deadMemberIds.length}  [${squad.squadId}]`,
        );
        if (squad.memberIds.length > 0) lines.push(`    living: ${squad.memberIds.join(', ')}`);
        if (squad.deadMemberIds.length > 0)
          lines.push(`    dead: ${squad.deadMemberIds.join(', ')}`);
        if (squad.pendingKills > 0) {
          lines.push(
            `    pending kills: ${squad.pendingKills} — name victims via resolvekills [R-0024]`,
          );
        }
        if (squad.captainId !== null) {
          lines.push(`    captain: ${squad.captainId}`);
          const withCaptain = squadMemberStats(state, squad)?.withCaptain ?? null;
          if (withCaptain !== null) lines.push(`    with captain: ${withCaptain}`);
        }
      }
    }
    // Recorded terrain facts [R-0022]: shown so the Director can reference a
    // factId via `clearterrain`; movement math stays table-adjudicated.
    if (state.terrainFacts.length > 0) {
      lines.push('terrain facts:');
      for (const fact of state.terrainFacts) {
        const area = fact.areaText ? ` (${fact.areaText})` : '';
        const by = fact.createdBy ? ` by ${fact.createdBy}` : '';
        lines.push(
          `  difficult terrain${area} via ${shortName(fact.effectArtifactId)}${by}  [${fact.factId}]`,
        );
      }
    }
    return lines.join('\n');
  }

  function commandFind(query: string): string {
    const lower = query.toLowerCase();
    const matches = [...records.keys()].filter((id) => id.toLowerCase().includes(lower)).sort();
    if (matches.length === 0) return `no loaded record matches "${query}"`;
    const lines = matches.slice(0, 20).map((id) => {
      const bands = parsedRecord(id)
        .clauses.filter((clause) => clause.kind === 'tier-outcome')
        .map((clause) => clause.data.band);
      return `  ${id}${bands.length > 0 ? `  (tiers parsed: ${[...new Set(bands)].join(', ')})` : ''}`;
    });
    if (matches.length > 20) lines.push(`  … ${matches.length - 20} more`);
    return lines.join('\n');
  }

  function commandShow(query: string): string {
    const resolved = resolveRecord(query);
    if ('error' in resolved) return resolved.error;
    const text = records.get(resolved.id) ?? '';
    const parse = parsedRecord(resolved.id);
    const bands = parse.clauses
      .filter((clause) => clause.kind === 'tier-outcome')
      .map((clause) => clause.data.band);
    const effects = compileEffectPrograms(parse, resolved.id);
    const automaticEffects = effects.filter((effect) => effect.resolution.kind !== 'table').length;
    const summary = [
      `parsed clauses: ${parse.clauses.filter((clause) => clause.kind !== 'whitespace').length}`,
      `tiers parsed: ${bands.length > 0 ? [...new Set(bands)].join(', ') : 'none'}`,
      `Effects: ${effects.length} (${automaticEffects} automatic, ${effects.length - automaticEffects} table)`,
      `residue spans (resolve at the table): ${parse.residue.length}`,
    ].join('  ·  ');
    return `${resolved.id}\n${summary}\n---\n${text.trim()}\n---`;
  }

  function commandUse(args: string[]): string {
    const [recordQuery, bandToken, actorQuery, targetQuery] = args;
    if (!recordQuery || !bandToken || !actorQuery || !targetQuery) {
      return 'usage: use <query> <tier> <actor> <target>';
    }
    const band = BAND_ALIASES[bandToken.toLowerCase()];
    if (!band) return `unknown tier "${bandToken}" (use t1, t2, or t3 for ≤11, 12-16, 17+)`;
    const record = resolveRecord(recordQuery);
    if ('error' in record) return record.error;
    const actor = resolveParticipant(actorQuery);
    if ('error' in actor) return actor.error;
    const target = resolveParticipant(targetQuery);
    if ('error' in target) return target.error;

    const parse = parsedRecord(record.id);
    const tiers = parse.clauses.filter((clause) => clause.kind === 'tier-outcome');
    const atBand = tiers.filter((clause) => clause.data.band === band);
    const lines: string[] = [`${actor.id} uses ${record.id} (tier ${band}) on ${target.id}`];

    const chosen = atBand[0];
    if (!chosen) {
      lines.push(
        tiers.length === 0
          ? 'no parsed tier outcomes in this record — nothing dispatches; verbatim card below.'
          : `no parsed tier outcome at ${band} (parsed: ${tiers.map((clause) => clause.data.band).join(', ')})`,
      );
    } else {
      if (atBand.length > 1) {
        lines.push(
          `note: ${atBand.length} parsed tier lines at ${band}; dispatching the first only`,
        );
      }
      const execution = tierOutcomeToIntents(chosen.data, {
        intentIdPrefix: shortName(record.id),
        actorParticipantId: actor.id,
        targetParticipantId: target.id,
        effectArtifactId: record.id,
      });
      // Re-stamp compiler intent ids into the session's sequence.
      const stamped = execution.intents.map((intent) => ({ ...intent, intentId: nextIntentId() }));
      if (stamped.length === 0) lines.push('  (no engine-executable parts at this tier yet)');
      lines.push(...dispatchAll(stamped));
      for (const item of execution.unexecuted) {
        lines.push(`  NOT AUTOMATED (${item.part}): ${item.detail}`);
      }
    }
    if (parse.residue.length > 0) {
      lines.push('  resolve at the table (verbatim, not automated):');
      for (const item of parse.residue) {
        for (const raw of item.span.text.split('\n')) {
          if (raw.trim().length > 0) lines.push(`  | ${raw.trimEnd()}`);
        }
      }
    }
    return lines.join('\n');
  }

  function commandEffect(args: string[]): string {
    const [recordQuery, actorQuery, targetQuery, ordinalText] = args;
    if (!recordQuery || !actorQuery || !targetQuery) {
      return 'usage: effect <query> <actor> <targets|none> [n]';
    }
    const record = resolveRecord(recordQuery);
    if ('error' in record) return record.error;
    const actor = resolveParticipant(actorQuery);
    if ('error' in actor) return actor.error;
    // Comma-separated targets ("hero-1,hero-2"); `obj:<label>` tokens are
    // object targets of a test — they never roll and auto-obtain tier 1
    // [R-0007]; `decline:<id>` binds a participant who declines a Recovery
    // offer (bare id = accepts) [R-0018]; `none` = targetless manual
    // instruction.
    const targetIds: string[] = [];
    const objectTargets: string[] = [];
    const declines = new Set<string>();
    if (targetQuery !== 'none') {
      for (const token of targetQuery.split(',')) {
        if (token.startsWith('obj:')) {
          const label = token.slice('obj:'.length);
          if (label.length === 0) return `empty object label in "${token}"`;
          objectTargets.push(label);
          continue;
        }
        const declined = token.startsWith('decline:');
        const query = declined ? token.slice('decline:'.length) : token;
        if (query.length === 0) return `empty participant in "${token}"`;
        const resolved = resolveParticipant(query);
        if ('error' in resolved) return resolved.error;
        targetIds.push(resolved.id);
        if (declined) declines.add(resolved.id);
      }
    }
    const programs = compileEffectPrograms(parsedRecord(record.id), record.id);
    if (programs.length === 0) return `${record.id} has no parsed Effect instructions`;
    if (programs.length > 1 && ordinalText === undefined) {
      return `${record.id} has ${programs.length} Effect instructions; choose [n]:\n${programs
        .map(
          (program, index) =>
            `  ${index + 1}. ${
              program.resolution.kind === 'table'
                ? 'TABLE'
                : program.resolution.kind === 'test'
                  ? 'TEST'
                  : 'AUTO'
            }: ${program.sourceText}`,
        )
        .join('\n')}`;
    }
    const ordinal = ordinalText === undefined ? 1 : Number(ordinalText);
    if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > programs.length) {
      return `Effect index must be 1–${programs.length}`;
    }
    const effect = programs[ordinal - 1];
    if (!effect) return `Effect index must be 1–${programs.length}`;
    // A Recovery offer needs every bound participant's answer [R-0018]: bare
    // ids accept by default; `decline:<id>` records the decline.
    if (effect.resolution.kind !== 'spend-recovery' && declines.size > 0) {
      return `decline: applies only to a Recovery-offer Effect (this Effect resolves as ${effect.resolution.kind})`;
    }
    const recoverySpends =
      effect.resolution.kind === 'spend-recovery'
        ? Object.fromEntries(targetIds.map((id) => [id, !declines.has(id)]))
        : undefined;
    const targetLabel = [
      ...targetIds.map((id) => (declines.has(id) ? `decline:${id}` : id)),
      ...objectTargets.map((label) => `obj:${label}`),
    ].join(', ');
    const lines = [
      `${actor.id} resolves ${record.id} Effect ${ordinal}/${programs.length}${targetLabel ? ` on ${targetLabel}` : ''}`,
      ...dispatchAll([
        {
          intentId: nextIntentId(),
          kind: 'use-effect',
          actor: { kind: 'participant', participantId: actor.id },
          payload: {
            actorParticipantId: actor.id,
            effect,
            targets: targetIds,
            objectTargets,
            ...(recoverySpends ? { recoverySpends } : {}),
          },
        },
      ]),
    ];
    return lines.join('\n');
  }

  function commandEndTurn(args: string[]): string {
    const [actorQuery, ...rollTokens] = args;
    if (!actorQuery) return 'usage: endturn <actor> [<condition>=<roll> ...]';
    const actor = resolveParticipant(actorQuery);
    if ('error' in actor) return actor.error;
    const rolls: Record<string, number> = {};
    for (const token of rollTokens) {
      const [query, rollText] = token.split('=');
      if (!query || rollText === undefined || !Number.isInteger(Number(rollText))) {
        return `bad roll token "${token}" (expected <condition>=<integer>)`;
      }
      const instance = resolveInstance(actor.id, query);
      if ('error' in instance) return instance.error;
      rolls[instance.instanceId] = Number(rollText);
    }
    const lines = dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'end-turn',
        actor: { kind: 'participant', participantId: actor.id },
        payload: {
          participantId: actor.id,
          rolls: Object.keys(rolls).length > 0 ? rolls : undefined,
        },
      },
    ]);
    return [`${actor.id} ends their turn`, ...lines].join('\n');
  }

  function commandRemove(args: string[]): string {
    const asAt = args.indexOf('as');
    const becauseAt = args.indexOf('because');
    const positionalEnd = Math.min(
      asAt === -1 ? args.length : asAt,
      becauseAt === -1 ? args.length : becauseAt,
    );
    const positional = args.slice(0, positionalEnd);
    const [targetQuery, instanceQuery] = positional;
    if (!targetQuery || !instanceQuery) {
      return 'usage: remove <target> <condition> [as <actor>] [because <reason ...>]';
    }
    const target = resolveParticipant(targetQuery);
    if ('error' in target) return target.error;
    const instance = resolveInstance(target.id, instanceQuery);
    if ('error' in instance) return instance.error;
    let actor: Intent['actor'] = { kind: 'director' };
    if (asAt !== -1) {
      const actorQuery = args[asAt + 1];
      if (!actorQuery) return 'usage: … as <actor>';
      if (actorQuery !== 'director') {
        const resolved = resolveParticipant(actorQuery);
        if ('error' in resolved) return resolved.error;
        actor = { kind: 'participant', participantId: resolved.id };
      }
    }
    const reason =
      becauseAt !== -1 && args.length > becauseAt + 1
        ? args.slice(becauseAt + 1).join(' ')
        : undefined;
    const lines = dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'remove-condition',
        actor,
        payload: { target: target.id, instanceId: instance.instanceId, reason },
      },
    ]);
    return lines.join('\n');
  }

  function commandClearTerrain(args: string[]): string {
    const becauseAt = args.indexOf('because');
    const positional = args.slice(0, becauseAt === -1 ? args.length : becauseAt);
    const [factQuery] = positional;
    if (!factQuery || positional.length > 1) {
      return 'usage: clearterrain <factId> [because <reason ...>]';
    }
    const facts = driver.state().terrainFacts;
    const lower = factQuery.toLowerCase();
    const matches = facts.filter((fact) => fact.factId.toLowerCase().includes(lower));
    if (matches.length === 0 || matches[0] === undefined) {
      return facts.length === 0
        ? `no terrain fact matches "${factQuery}" (none recorded)`
        : `no terrain fact matches "${factQuery}" (have: ${facts.map((fact) => fact.factId).join(', ')})`;
    }
    if (matches.length > 1) {
      return `"${factQuery}" is ambiguous: ${matches.map((fact) => fact.factId).join(', ')}`;
    }
    const reason =
      becauseAt !== -1 && args.length > becauseAt + 1
        ? args.slice(becauseAt + 1).join(' ')
        : undefined;
    // Director adjudication [R-0022]: the fact persists until cleared.
    const lines = dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'clear-terrain-fact',
        actor: { kind: 'director' },
        payload: { factId: matches[0].factId, reason },
      },
    ]);
    return lines.join('\n');
  }

  function resolveSquad(query: string): { squadId: string } | { error: string } {
    const squads = driver.state().squads;
    const lower = query.toLowerCase();
    const matches = squads.filter(
      (squad) =>
        squad.squadId.toLowerCase().includes(lower) || squad.name.toLowerCase().includes(lower),
    );
    if (matches.length === 1 && matches[0] !== undefined) return { squadId: matches[0].squadId };
    if (matches.length === 0) {
      return {
        error:
          squads.length === 0
            ? `no squad matches "${query}" (none seeded)`
            : `no squad matches "${query}" (have: ${squads.map((squad) => squad.squadId).join(', ')})`,
      };
    }
    return {
      error: `"${query}" is ambiguous: ${matches.map((squad) => squad.squadId).join(', ')}`,
    };
  }

  function commandDamage(args: string[]): string {
    const usage =
      'usage: damage <target> <amount> [<type>] [area] [knockout] [victims <a,b>] [because <reason ...>]';
    const becauseAt = args.indexOf('because');
    const tokens = args.slice(0, becauseAt === -1 ? args.length : becauseAt);
    const [targetQuery, amountText, ...rest] = tokens;
    if (!targetQuery || amountText === undefined) return usage;
    const target = resolveParticipant(targetQuery);
    if ('error' in target) return target.error;
    const amount = Number(amountText);
    if (!Number.isInteger(amount) || amount < 0) return usage;
    let damageType: DamageType | undefined;
    let area = false;
    let knockOut = false;
    const victims: string[] = [];
    for (let index = 0; index < rest.length; index += 1) {
      const token = (rest[index] ?? '').toLowerCase();
      if (token === 'area') {
        area = true;
      } else if (token === 'knockout') {
        knockOut = true;
      } else if (token === 'victims') {
        const list = rest[index + 1];
        if (!list) return usage;
        for (const victimQuery of list.split(',')) {
          if (victimQuery.length === 0) return usage;
          const victim = resolveParticipant(victimQuery);
          if ('error' in victim) return victim.error;
          victims.push(victim.id);
        }
        index += 1;
      } else if ((DAMAGE_TYPES as readonly string[]).includes(token)) {
        damageType = token as DamageType;
      } else {
        return `unknown damage token "${token}" — ${usage}`;
      }
    }
    const reason =
      becauseAt !== -1 && args.length > becauseAt + 1
        ? args.slice(becauseAt + 1).join(' ')
        : 'manual damage entry';
    // Director adjudication: `area` is the dispatch half of the R-0025
    // discriminator; `victims` names extra kills [R-0024]; a living squad
    // member's damage routes to the pool inside the engine.
    const lines = dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'apply-damage',
        actor: { kind: 'director' },
        payload: {
          target: target.id,
          amount,
          damageType,
          reason,
          knockOut,
          area,
          minionKillVictims: victims,
        },
      },
    ]);
    return lines.join('\n');
  }

  function commandResolveKills(args: string[]): string {
    const usage = 'usage: resolvekills <squad> <victim,victim ...> [because <reason ...>]';
    const becauseAt = args.indexOf('because');
    const positional = args.slice(0, becauseAt === -1 ? args.length : becauseAt);
    const [squadQuery, victimsText] = positional;
    if (!squadQuery || !victimsText || positional.length > 2) return usage;
    const squad = resolveSquad(squadQuery);
    if ('error' in squad) return squad.error;
    const victims: string[] = [];
    for (const victimQuery of victimsText.split(',')) {
      if (victimQuery.length === 0) return usage;
      const victim = resolveParticipant(victimQuery);
      if ('error' in victim) return victim.error;
      victims.push(victim.id);
    }
    const reason =
      becauseAt !== -1 && args.length > becauseAt + 1
        ? args.slice(becauseAt + 1).join(' ')
        : undefined;
    const lines = dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'resolve-pending-kills',
        actor: { kind: 'director' },
        payload: { squadId: squad.squadId, victimMemberIds: victims, reason },
      },
    ]);
    return lines.join('\n');
  }

  function commandAttach(args: string[]): string {
    const [squadQuery, captainQuery] = args;
    if (!squadQuery || !captainQuery || args.length > 2) {
      return 'usage: attach <squad> <captain>';
    }
    const squad = resolveSquad(squadQuery);
    if ('error' in squad) return squad.error;
    const captain = resolveParticipant(captainQuery);
    if ('error' in captain) return captain.error;
    const lines = dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'attach-captain',
        actor: { kind: 'director' },
        payload: { squadId: squad.squadId, captainId: captain.id },
      },
    ]);
    return lines.join('\n');
  }

  function commandDetach(args: string[]): string {
    const becauseAt = args.indexOf('because');
    const positional = args.slice(0, becauseAt === -1 ? args.length : becauseAt);
    const [squadQuery] = positional;
    if (!squadQuery || positional.length > 1) {
      return 'usage: detach <squad> [because <reason ...>]';
    }
    const squad = resolveSquad(squadQuery);
    if ('error' in squad) return squad.error;
    const reason =
      becauseAt !== -1 && args.length > becauseAt + 1
        ? args.slice(becauseAt + 1).join(' ')
        : undefined;
    const lines = dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'detach-captain',
        actor: { kind: 'director' },
        payload: { squadId: squad.squadId, reason },
      },
    ]);
    return lines.join('\n');
  }

  function commandEnd(args: string[]): string {
    const keeps: string[] = [];
    if (args[0] === 'keep') {
      for (const query of args.slice(1)) {
        const state = driver.state();
        const candidates = Object.values(state.participants).flatMap((participant) =>
          participant.conditions.filter(
            (instance) =>
              instance.instanceId.toLowerCase().includes(query.toLowerCase()) ||
              instance.conditionId.toLowerCase().includes(query.toLowerCase()),
          ),
        );
        if (candidates.length !== 1 || candidates[0] === undefined) {
          return candidates.length === 0
            ? `no active condition matches "${query}"`
            : `"${query}" is ambiguous: ${candidates.map((instance) => instance.instanceId).join(', ')}`;
        }
        keeps.push(candidates[0].instanceId);
      }
    } else if (args.length > 0) {
      return 'usage: end [keep <condition> ...]';
    }
    const lines = dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'end-encounter',
        actor: { kind: 'director' },
        payload: { keepInstanceIds: keeps },
      },
    ]);
    return ['the encounter ends', ...lines].join('\n');
  }

  function commandLog(args: string[]): string {
    const count = args[0] ? Number(args[0]) : 10;
    if (Number.isNaN(count) || count < 1) return 'usage: log [n]';
    const entries = driver.log().slice(-count);
    if (entries.length === 0) return 'log is empty';
    return entries.map(renderLogEntry).join('\n');
  }

  return {
    transcript: () => driver.transcript(),
    execute(line: string): PlayStepResult {
      const tokens = line.trim().split(/\s+/).filter(Boolean);
      const [command, ...args] = tokens;
      if (!command) return { output: '', quit: false };
      try {
        switch (command.toLowerCase()) {
          case 'help':
            return { output: HELP, quit: false };
          case 'status':
            return { output: commandStatus(), quit: false };
          case 'find':
            return {
              output: args[0] ? commandFind(args.join(' ')) : 'usage: find <query>',
              quit: false,
            };
          case 'show':
            return {
              output: args[0] ? commandShow(args.join(' ')) : 'usage: show <query>',
              quit: false,
            };
          case 'use':
            return { output: commandUse(args), quit: false };
          case 'effect':
            return { output: commandEffect(args), quit: false };
          case 'endturn':
            return { output: commandEndTurn(args), quit: false };
          case 'remove':
            return { output: commandRemove(args), quit: false };
          case 'clearterrain':
            return { output: commandClearTerrain(args), quit: false };
          case 'damage':
            return { output: commandDamage(args), quit: false };
          case 'resolvekills':
            return { output: commandResolveKills(args), quit: false };
          case 'attach':
            return { output: commandAttach(args), quit: false };
          case 'detach':
            return { output: commandDetach(args), quit: false };
          case 'end':
            return { output: commandEnd(args), quit: false };
          case 'log':
            return { output: commandLog(args), quit: false };
          case 'quit':
          case 'exit':
            return { output: 'bye', quit: true };
          default:
            return { output: `unknown command "${command}" — try help`, quit: false };
        }
      } catch (error) {
        return {
          output: `error: ${error instanceof Error ? error.message : String(error)}`,
          quit: false,
        };
      }
    },
  };
}
