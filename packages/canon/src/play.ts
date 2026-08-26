import {
  type ActionCost,
  BASE_TURN_BUDGET,
  CHARACTERISTIC_LETTERS,
  type CharacteristicLetter,
  DAMAGE_TYPES,
  type DamageType,
  type DriverSquadSeed,
  type Intent,
  type LogEntry,
  type ParticipantStats,
  type ResolutionEntry,
  type ResolutionModification,
  type Transcript,
  type UseAbilityPayloadInput,
  createDriver,
  createSeededRandomSource,
  openResolutionsOwnedBy,
  squadMemberStats,
} from '@engarde/engine';
import { annotateHeaderCosts } from './action-cost.js';
import {
  compileAbilities,
  compileEffectPrograms,
  groupPowerRollClusters,
  tierOutcomeToIntents,
} from './effect-conformance.js';
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
  status                                  participants, conditions, combat tracker, budgets
  find <query>                            search loaded records by id
  show <query>                            verbatim record text + what parses
  use <query> <tier> <actor> <target>     use an ability at an ASSERTED tier outcome
                                          (tier: t1|t2|t3 for ≤11|12-16|17+)
  effect <query> <actor> <targets|none> [n] resolve Effect n (targets: a,b,obj:door)
                                          (a Recovery offer: bare id accepts, decline:<id> declines)
  combat <heroes|director> [surprised <side>] [roll <n>] [chosenby <players|director>]
                                          begin combat (the d10 is auto-rolled unless asserted)
  turn <actor|squad>                      start a turn (economy violations warn, never block)
  roll <query> <actor> <targets> [n] [with <M|A|R|I|P>] [type <damageType>] [dice <d1>,<d2>] [--hold]
                                          roll a compiled ability; auto-commits unless --hold
  commit [<resolutionId>]                 commit an open resolution (default: top of stack)
  mod [<resolution>] downgrade <1|2> | tier <±n> because <..> | retarget <from> <to> because <..>
      | halve <down|up> [<target>] because <..> | potency <±n> [<target>] because <..>
  trigger <query> <actor> [free] [by <intentId>] [because <trigger ..>]
                                          use a triggered action
  villain <query> <actor>                 use a villain action (director)
  convert [<actor>] main <maneuver|move>  turn the main action into a maneuver/move action
  advround [because <reason..>]           advance the round (director-asserted)
  grant <participant> <cost|turn|insertion> [x<n>] [--ignores-dazed] [--ignores-surprised] [--off-turn]
                                          director grant (printed escapes never warn)
  endturn <actor|squad> [<condition>=<roll>..]  end of turn; open resolutions force-commit;
                                          roll omitted = auto-roll
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
  // R-0030 warn-and-apply must be VISIBLE: rule-violation receipts render
  // loud, never buried in the receipt stream.
  if (entry.kind === 'warning') return `  !! WARNING: ${entry.message}${refs}`;
  return `  ${entry.kind.toUpperCase()}: ${entry.message}${refs}`;
}

/** Player-typed cost token → the closed action-cost enum [R-0029]. The
 * aliases are spelling conveniences only; nothing outside the enum lands. */
const COST_ALIASES: Readonly<Record<string, ActionCost>> = {
  main: 'main-action',
  'main-action': 'main-action',
  maneuver: 'maneuver',
  move: 'move-action',
  'move-action': 'move-action',
  triggered: 'triggered-action',
  'triggered-action': 'triggered-action',
  'free-triggered': 'free-triggered-action',
  'free-triggered-action': 'free-triggered-action',
  'free-maneuver': 'free-maneuver',
  'no-action': 'no-action',
  villain: 'villain-action',
  'villain-action': 'villain-action',
};

function describeModification(modification: ResolutionModification): string {
  switch (modification.kind) {
    case 'downgrade':
      return `downgrade→tier ${modification.toTier}`;
    case 'tier-adjust':
      return `tier ${modification.delta >= 0 ? '+' : ''}${modification.delta} (${modification.reason})`;
    case 'retarget':
      return `retarget ${modification.from}→${modification.to}`;
    case 'potency-adjust':
      return `potency ${modification.delta >= 0 ? '+' : ''}${modification.delta}${modification.target ? ` vs ${modification.target}` : ''}`;
    case 'damage-halve':
      return `damage halved (round ${modification.rounding})${modification.target ? ` vs ${modification.target}` : ''}`;
  }
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
  // Rolled payloads by resolutionId [R-0032]: commit (explicit or the
  // end-turn force-commit) RE-SUPPLIES the payload and the engine verifies
  // its canonical hash — the shell keeps every rolled payload it dispatched.
  const heldPayloads = new Map<string, UseAbilityPayloadInput>();
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
    // Combat turn tracker (v6, design §3): round, active turn, alternation
    // pointer, per-taker turns vs allowance, and the encounter villain
    // economy. Shown only while combat runs (turnState non-null).
    const turnState = state.turnState;
    if (turnState !== null) {
      lines.push(
        `combat: round ${turnState.round} — active turn: ${turnState.activeTurnId ?? 'none'} — turn choice: ${turnState.sideToChoose} — first side: ${turnState.firstSide}`,
      );
      const trackerEntries: string[] = [];
      for (const participant of Object.values(state.participants)) {
        if (participant.traits.subActorOf !== null) continue;
        if (state.squads.some((candidate) => candidate.memberIds.includes(participant.id)))
          continue;
        trackerEntries.push(
          `${participant.id} ${turnState.turnsTaken[participant.id] ?? 0}/${participant.traits.turnAllowance}`,
        );
      }
      for (const squad of state.squads) {
        trackerEntries.push(`${squad.squadId} ${turnState.turnsTaken[squad.squadId] ?? 0}/1`);
      }
      lines.push(`  turns taken: ${trackerEntries.join(' · ')}`);
      lines.push(
        `  villain action: ${state.villainActions.usedThisRound ? 'SPENT this round' : 'available this round'}${
          state.villainActions.usedByAbility.length > 0
            ? `  (used this encounter: ${state.villainActions.usedByAbility.map(shortName).join(', ')})`
            : ''
        }`,
      );
    }
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
      // Budget chips from the actionBudget Record (v6): used/(base+granted)
      // per own-turn cost [rule.combat/turn], plus the per-round triggered
      // counter [rule.combat/triggered-action]. Economy state exists only
      // while combat runs.
      if (turnState !== null) {
        const chip = (cost: 'main-action' | 'maneuver' | 'move-action'): string => {
          const cell = participant.actionBudget[cost] ?? { used: 0, granted: 0 };
          return `${cell.used}/${BASE_TURN_BUDGET + cell.granted}`;
        };
        lines.push(
          `  budget: main ${chip('main-action')} · maneuver ${chip('maneuver')} · move ${chip('move-action')} · triggered ${participant.triggeredThisRound}/${participant.traits.triggeredActionLimit}`,
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
    // Open resolution entries [R-0032]: rolled, awaiting commit —
    // reactions and modifications may still cut in.
    const openEntries = state.resolutionStack.filter((candidate) => candidate.phase === 'rolled');
    if (openEntries.length > 0) {
      lines.push('open resolutions:');
      for (const candidate of openEntries) {
        const mods =
          candidate.modifications.length > 0
            ? candidate.modifications.map(describeModification).join(', ')
            : 'none';
        lines.push(
          `  [${candidate.resolutionId}] ${shortName(candidate.abilityArtifactId)} by ${candidate.actorId} — rolled tier ${candidate.rollReceipt.tier}, commit pending [R-0032] — mods: ${mods}`,
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
      // Asserted-band economy parity [B-2, R-0029/R-0030]: an asserted tier
      // is still a USE of the ability — the compiled header's cost rides
      // the tierOutcomeToIntents binding seam. The owning header comes from
      // the one cluster-ownership home (groupPowerRollClusters) +
      // annotateHeaderCosts on the same parse; a tier with no owning header
      // or an unresolved cost carries NO debit — honest residue, never a
      // guessed one.
      const owningCluster = groupPowerRollClusters(parse).find((cluster) =>
        Object.values(cluster.tiers).some((clause) => clause === chosen),
      );
      const annotation = owningCluster?.header
        ? annotateHeaderCosts(parse, record.id).get(owningCluster.header)
        : undefined;
      const execution = tierOutcomeToIntents(chosen.data, {
        intentIdPrefix: shortName(record.id),
        actorParticipantId: actor.id,
        targetParticipantId: target.id,
        effectArtifactId: record.id,
        assertedAbilityUse:
          annotation && annotation.actionCost !== null
            ? {
                actorParticipantId: actor.id,
                abilityArtifactId: record.id,
                actionCost: annotation.actionCost,
                usesPerRound: annotation.usesPerRound,
              }
            : null,
      });
      // Re-stamp compiler intent ids into the session's sequence, keeping
      // the shared-debit partOf reference pointed at the first STAMPED id
      // (one ability use, one debit — the rolled path's composition).
      const stamped = execution.intents.map((intent) => ({ ...intent, intentId: nextIntentId() }));
      const primaryId = stamped[0]?.intentId;
      const aligned = stamped.map((intent, index) => {
        if (index === 0 || primaryId === undefined || intent.kind !== 'apply-condition')
          return intent;
        const asserted = intent.payload.assertedAbilityUse;
        if (asserted === null || asserted === undefined) return intent;
        return {
          ...intent,
          payload: {
            ...intent.payload,
            assertedAbilityUse: { ...asserted, partOf: primaryId },
          },
        };
      });
      if (aligned.length === 0) lines.push('  (no engine-executable parts at this tier yet)');
      lines.push(...dispatchAll(aligned));
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
    if (!actorQuery) return 'usage: endturn <actor|squad> [<condition>=<roll> ...]';
    const entity = resolveTurnEntity(actorQuery);
    if ('error' in entity) return entity.error;
    const rolls: Record<string, number> = {};
    if (entity.squad && rollTokens.length > 0) {
      // M-4: never advise per-member endturn — that double-runs the
      // end-of-turn sweeps (a second saving throw per turn). Auto-roll is
      // the one squad path; member-addressed saves are an accepted cut.
      return 'saving-throw roll tokens apply to a participant endturn, not a squad turn — omit them and the squad turn auto-rolls every member save';
    }
    for (const token of rollTokens) {
      const [query, rollText] = token.split('=');
      if (!query || rollText === undefined || !Number.isInteger(Number(rollText))) {
        return `bad roll token "${token}" (expected <condition>=<integer>)`;
      }
      const instance = resolveInstance(entity.id, query);
      if ('error' in instance) return instance.error;
      rolls[instance.instanceId] = Number(rollText);
    }
    // Open resolutions owned by the ending actor force-commit at end-turn
    // [R-0032]: the shell re-supplies each held rolled payload so the
    // printed damage is never discarded.
    const state = driver.state();
    const endingSquad = state.squads.find((candidate) => candidate.squadId === entity.id);
    const ownedIds = [entity.id, ...(endingSquad ? endingSquad.memberIds : [])];
    const commitPayloads: Record<string, UseAbilityPayloadInput> = {};
    for (const open of openResolutionsOwnedBy(state, ownedIds)) {
      const held = heldPayloads.get(open.resolutionId);
      if (!held) {
        return `resolution ${open.resolutionId} is open with no payload held by this shell — commit it explicitly before endturn [R-0032]`;
      }
      commitPayloads[open.resolutionId] = held;
    }
    const lines = dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'end-turn',
        actor: entity.squad
          ? { kind: 'director' }
          : { kind: 'participant', participantId: entity.id },
        payload: {
          participantId: entity.id,
          rolls: Object.keys(rolls).length > 0 ? rolls : undefined,
          ...(Object.keys(commitPayloads).length > 0 ? { commitPayloads } : {}),
        },
      },
    ]);
    return [`${entity.id} ends their turn`, ...lines].join('\n');
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

  /** A turn slot's owner: a participant id OR a squad id (a squad occupies
   * one turn slot [R-0033]). */
  function resolveTurnEntity(query: string): { id: string; squad: boolean } | { error: string } {
    const participant = resolveParticipant(query);
    if (!('error' in participant)) return { id: participant.id, squad: false };
    const squad = resolveSquad(query);
    if (!('error' in squad)) return { id: squad.squadId, squad: true };
    return { error: `${participant.error}; ${squad.error}` };
  }

  function resolveResolution(
    query: string | undefined,
    openOnly: boolean,
  ): { entry: ResolutionEntry } | { error: string } {
    const stack = driver.state().resolutionStack;
    const candidates = openOnly ? stack.filter((candidate) => candidate.phase === 'rolled') : stack;
    if (query === undefined) {
      const top = candidates[candidates.length - 1];
      return top
        ? { entry: top }
        : {
            error: openOnly ? 'no open resolution on the stack' : 'the resolution stack is empty',
          };
    }
    const lower = query.toLowerCase();
    const matches = candidates.filter((candidate) =>
      candidate.resolutionId.toLowerCase().includes(lower),
    );
    if (matches.length === 1 && matches[0] !== undefined) return { entry: matches[0] };
    if (matches.length === 0) {
      return {
        error: `no ${openOnly ? 'open ' : ''}resolution matches "${query}"${
          candidates.length > 0
            ? ` (have: ${candidates.map((candidate) => candidate.resolutionId).join(', ')})`
            : ''
        }`,
      };
    }
    return {
      error: `"${query}" is ambiguous: ${matches.map((candidate) => candidate.resolutionId).join(', ')}`,
    };
  }

  function commandCombat(args: string[]): string {
    const usage =
      'usage: combat <heroes|director> [surprised <heroes|director>] [roll <1-10>] [chosenby <players|director>]';
    const [sideToken, ...rest] = args;
    if (sideToken !== 'heroes' && sideToken !== 'director') return usage;
    let surprisedSide: 'heroes' | 'director' | null = null;
    let roll: number | undefined;
    let chosenBy: 'players' | 'director' | undefined;
    for (let index = 0; index < rest.length; index += 1) {
      const token = (rest[index] ?? '').toLowerCase();
      const value = rest[index + 1];
      if (token === 'surprised') {
        if (value !== 'heroes' && value !== 'director') return usage;
        surprisedSide = value;
        index += 1;
      } else if (token === 'roll') {
        const asserted = Number(value);
        if (!Number.isInteger(asserted) || asserted < 1 || asserted > 10) return usage;
        roll = asserted;
        index += 1;
      } else if (token === 'chosenby') {
        if (value !== 'players' && value !== 'director') return usage;
        chosenBy = value;
        index += 1;
      } else {
        return usage;
      }
    }
    // begin-combat: the d10 is drawn from the injected source unless
    // asserted (auto-roll default, manual override) [design §3].
    return dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'begin-combat',
        actor: { kind: 'director' },
        payload: {
          firstSide: sideToken,
          surprisedSide,
          ...(roll !== undefined ? { roll } : {}),
          ...(chosenBy !== undefined ? { chosenBy } : {}),
        },
      },
    ]).join('\n');
  }

  function commandTurn(args: string[]): string {
    const [query] = args;
    if (!query || args.length > 1) return 'usage: turn <actor|squad>';
    const entity = resolveTurnEntity(query);
    if ('error' in entity) return entity.error;
    return dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'start-turn',
        actor: { kind: 'director' },
        payload: { turnId: entity.id },
      },
    ]).join('\n');
  }

  function commandAdvRound(args: string[]): string {
    const becauseAt = args.indexOf('because');
    if (args.length > 0 && becauseAt !== 0) return 'usage: advround [because <reason ...>]';
    const reason =
      becauseAt !== -1 && args.length > becauseAt + 1
        ? args.slice(becauseAt + 1).join(' ')
        : undefined;
    return dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'advance-round',
        actor: { kind: 'director' },
        payload: { reason },
      },
    ]).join('\n');
  }

  function commandConvert(args: string[]): string {
    const usage =
      'usage: convert [<actor>] main <maneuver|move> — the printed conversion is always FROM the main action';
    let actorQuery: string | undefined;
    let fromToken: string | undefined;
    let toToken: string | undefined;
    if (args.length === 2) {
      [fromToken, toToken] = args;
    } else if (args.length === 3) {
      [actorQuery, fromToken, toToken] = args;
    } else {
      return usage;
    }
    if (fromToken !== 'main' && fromToken !== 'main-action') return usage;
    const to =
      toToken === 'maneuver'
        ? ('maneuver' as const)
        : toToken === 'move' || toToken === 'move-action'
          ? ('move-action' as const)
          : null;
    if (to === null) return usage;
    let participantId: string;
    if (actorQuery !== undefined) {
      const actor = resolveParticipant(actorQuery);
      if ('error' in actor) return actor.error;
      participantId = actor.id;
    } else {
      const active = driver.state().turnState?.activeTurnId ?? null;
      if (active === null || !driver.state().participants[active]) {
        return 'no active participant turn — name the actor: convert <actor> main <maneuver|move>';
      }
      participantId = active;
    }
    return dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'convert-action',
        actor: { kind: 'participant', participantId },
        payload: { participantId, to },
      },
    ]).join('\n');
  }

  function commandRoll(args: string[]): string {
    const usage =
      'usage: roll <query> <actor> <target[,target..]> [n] [with <M|A|R|I|P>] [type <damageType>] [dice <d1>,<d2>] [--hold]';
    const [recordQuery, actorQuery, targetQuery, ...rest] = args;
    if (!recordQuery || !actorQuery || !targetQuery) return usage;
    const record = resolveRecord(recordQuery);
    if ('error' in record) return record.error;
    const actor = resolveParticipant(actorQuery);
    if ('error' in actor) return actor.error;
    const targetIds: string[] = [];
    for (const token of targetQuery.split(',')) {
      if (token.length === 0) return usage;
      const target = resolveParticipant(token);
      if ('error' in target) return target.error;
      targetIds.push(target.id);
    }
    let ordinal: number | undefined;
    let characteristicChoice: CharacteristicLetter | undefined;
    let damageTypeChoice: DamageType | undefined;
    let dice: [number, number] | undefined;
    let hold = false;
    for (let index = 0; index < rest.length; index += 1) {
      const token = rest[index] ?? '';
      const lower = token.toLowerCase();
      if (lower === '--hold' || lower === 'hold') {
        hold = true;
      } else if (/^\d+$/.test(token)) {
        ordinal = Number(token);
      } else if (lower === 'with') {
        const letter = rest[index + 1]?.toUpperCase();
        if (!letter || !(CHARACTERISTIC_LETTERS as readonly string[]).includes(letter)) {
          return usage;
        }
        characteristicChoice = letter as CharacteristicLetter;
        index += 1;
      } else if (lower === 'type') {
        const value = rest[index + 1]?.toLowerCase();
        if (!value || !(DAMAGE_TYPES as readonly string[]).includes(value)) return usage;
        damageTypeChoice = value as DamageType;
        index += 1;
      } else if (lower === 'dice') {
        const pair = (rest[index + 1] ?? '').split(',').map(Number);
        const [d1, d2] = pair;
        if (
          pair.length !== 2 ||
          d1 === undefined ||
          d2 === undefined ||
          pair.some((die) => !Number.isInteger(die) || die < 1 || die > 10)
        ) {
          return usage;
        }
        dice = [d1, d2];
        index += 1;
      } else {
        return `unknown roll token "${token}" — ${usage}`;
      }
    }
    const { abilities, incomplete } = compileAbilities(parsedRecord(record.id), record.id);
    if (abilities.length === 0) {
      return `${record.id} compiles no rolling ability${
        incomplete.length > 0
          ? ` (missing: ${incomplete.map((miss) => miss.missing.join(', ')).join('; ')})`
          : ''
      } — for asserted-tier play use \`use\`, for Effect instructions use \`effect\``;
    }
    if (abilities.length > 1 && ordinal === undefined) {
      return `${record.id} compiles ${abilities.length} rolling abilities; choose [n]:\n${abilities
        .map(
          (ability, index) =>
            `  ${index + 1}. ${ability.actionType ?? 'no action header'} — ${
              ability.keywords.join(', ') || 'no keywords'
            } — targets: ${ability.targetsText ?? '—'}`,
        )
        .join('\n')}`;
    }
    const chosen = abilities[(ordinal ?? 1) - 1];
    if (!chosen) return `ability index must be 1–${abilities.length}`;
    const payload: UseAbilityPayloadInput = {
      actorParticipantId: actor.id,
      ability: chosen,
      targets: targetIds,
      ...(characteristicChoice !== undefined ? { characteristicChoice } : {}),
      ...(damageTypeChoice !== undefined ? { damageTypeChoice } : {}),
      ...(dice !== undefined ? { dice } : {}),
    };
    const intentId = nextIntentId();
    heldPayloads.set(intentId, payload);
    const lines = [
      `${actor.id} rolls ${record.id} on ${targetIds.join(', ')}`,
      ...dispatchAll([
        {
          intentId,
          kind: 'use-ability',
          actor: { kind: 'participant', participantId: actor.id },
          payload,
        },
      ]),
    ];
    const opened = driver
      .state()
      .resolutionStack.find(
        (candidate) => candidate.resolutionId === intentId && candidate.phase === 'rolled',
      );
    if (opened) {
      if (hold) {
        lines.push(
          `  resolution ${intentId} HELD OPEN — record reactions/modifications (mod), then commit ${intentId}`,
        );
      } else {
        // One-tap default: the host pipelines the commit — the engine
        // itself never auto-commits [R-0032].
        lines.push(
          ...dispatchAll([
            {
              intentId: nextIntentId(),
              kind: 'commit-resolution',
              actor: { kind: 'participant', participantId: actor.id },
              payload: { resolutionId: intentId, payload },
            },
          ]),
        );
      }
    }
    return lines.join('\n');
  }

  function commandCommit(args: string[]): string {
    if (args.length > 1) return 'usage: commit [<resolutionId>]';
    const resolved = resolveResolution(args[0], true);
    if ('error' in resolved) return resolved.error;
    const held = heldPayloads.get(resolved.entry.resolutionId);
    if (!held) {
      return `no payload held for resolution ${resolved.entry.resolutionId} — commit must re-supply the rolled payload [R-0032]`;
    }
    const ownerId = resolved.entry.actorId;
    const actor: Intent['actor'] = driver.state().participants[ownerId]
      ? { kind: 'participant', participantId: ownerId }
      : { kind: 'director' };
    return dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'commit-resolution',
        actor,
        payload: { resolutionId: resolved.entry.resolutionId, payload: held },
      },
    ]).join('\n');
  }

  function commandMod(args: string[]): string {
    const usage = [
      'usage: mod [<resolution>] downgrade <1|2>',
      '       mod [<resolution>] tier <±n> because <reason ...>',
      '       mod [<resolution>] retarget <from> <to> because <reason ...>',
      '       mod [<resolution>] halve <down|up> [<target>] because <reason ...>',
      '       mod [<resolution>] potency <±n> [<target>] because <reason ...>',
    ].join('\n');
    const KINDS = new Set(['downgrade', 'tier', 'retarget', 'halve', 'potency']);
    let rest = args;
    let query: string | undefined;
    const first = rest[0];
    if (first !== undefined && !KINDS.has(first.toLowerCase())) {
      query = first;
      rest = rest.slice(1);
    }
    const resolved = resolveResolution(query, false);
    if ('error' in resolved) return resolved.error;
    const becauseAt = rest.indexOf('because');
    const positional = rest.slice(0, becauseAt === -1 ? rest.length : becauseAt);
    const reason =
      becauseAt !== -1 && rest.length > becauseAt + 1
        ? rest.slice(becauseAt + 1).join(' ')
        : undefined;
    const [kindToken, ...params] = positional;
    let modification: ResolutionModification;
    switch (kindToken?.toLowerCase()) {
      case 'downgrade': {
        const toTier = Number(params[0]);
        if ((toTier !== 1 && toTier !== 2) || params.length !== 1) return usage;
        modification = { kind: 'downgrade', toTier };
        break;
      }
      case 'tier': {
        const delta = Number(params[0]);
        if (!Number.isInteger(delta) || delta === 0 || params.length !== 1) return usage;
        if (reason === undefined) return usage;
        modification = { kind: 'tier-adjust', delta, reason };
        break;
      }
      case 'retarget': {
        const [fromQuery, toQuery] = params;
        if (!fromQuery || !toQuery || params.length !== 2 || reason === undefined) return usage;
        const from = resolveParticipant(fromQuery);
        if ('error' in from) return from.error;
        const to = resolveParticipant(toQuery);
        if ('error' in to) return to.error;
        modification = { kind: 'retarget', from: from.id, to: to.id, reason };
        break;
      }
      case 'halve': {
        const [roundingToken, targetQuery] = params;
        if (
          (roundingToken !== 'down' && roundingToken !== 'up') ||
          params.length > 2 ||
          reason === undefined
        ) {
          return usage;
        }
        let target: string | undefined;
        if (targetQuery !== undefined) {
          const resolvedTarget = resolveParticipant(targetQuery);
          if ('error' in resolvedTarget) return resolvedTarget.error;
          target = resolvedTarget.id;
        }
        modification = {
          kind: 'damage-halve',
          rounding: roundingToken,
          ...(target !== undefined ? { target } : {}),
          reason,
        };
        break;
      }
      case 'potency': {
        const delta = Number(params[0]);
        if (!Number.isInteger(delta) || delta === 0 || params.length > 2) return usage;
        if (reason === undefined) return usage;
        let target: string | undefined;
        const targetQuery = params[1];
        if (targetQuery !== undefined) {
          const resolvedTarget = resolveParticipant(targetQuery);
          if ('error' in resolvedTarget) return resolvedTarget.error;
          target = resolvedTarget.id;
        }
        modification = {
          kind: 'potency-adjust',
          delta,
          ...(target !== undefined ? { target } : {}),
          reason,
        };
        break;
      }
      default:
        return usage;
    }
    return dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'modify-resolution',
        actor: { kind: 'director' },
        payload: { resolutionId: resolved.entry.resolutionId, modification },
      },
    ]).join('\n');
  }

  function commandTrigger(args: string[]): string {
    const usage =
      'usage: trigger <query> <actor> [free] [by <intentId>] [because <asserted trigger ...>]';
    const becauseAt = args.indexOf('because');
    const head = args.slice(0, becauseAt === -1 ? args.length : becauseAt);
    const [recordQuery, actorQuery, ...rest] = head;
    if (!recordQuery || !actorQuery) return usage;
    const record = resolveRecord(recordQuery);
    if ('error' in record) return record.error;
    const actor = resolveParticipant(actorQuery);
    if ('error' in actor) return actor.error;
    let free = false;
    let occurrenceId: string | undefined;
    for (let index = 0; index < rest.length; index += 1) {
      const token = (rest[index] ?? '').toLowerCase();
      if (token === 'free') {
        free = true;
      } else if (token === 'by') {
        occurrenceId = rest[index + 1];
        if (!occurrenceId) return usage;
        index += 1;
      } else {
        return usage;
      }
    }
    const assertedText =
      becauseAt !== -1 && args.length > becauseAt + 1
        ? args.slice(becauseAt + 1).join(' ')
        : undefined;
    if (occurrenceId !== undefined && assertedText !== undefined) return usage;
    // Compiled header annotation [R-0029/R-0031]: the printed cost decides
    // free-triggered on its own; the once-per-round cap and the interception
    // point ride along. No annotation = table-asserted dispatch.
    const annotations = [...annotateHeaderCosts(parsedRecord(record.id), record.id).values()];
    const annotation = annotations.find(
      (candidate) =>
        candidate.actionCost === 'triggered-action' ||
        candidate.actionCost === 'free-triggered-action',
    );
    if (annotation?.actionCost === 'free-triggered-action') free = true;
    const trigger =
      occurrenceId !== undefined
        ? ({ kind: 'occurrence', intentId: occurrenceId } as const)
        : assertedText !== undefined
          ? ({ kind: 'asserted', text: assertedText } as const)
          : null;
    const lines = dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'use-triggered-action',
        actor: { kind: 'participant', participantId: actor.id },
        payload: {
          participantId: actor.id,
          abilityArtifactId: record.id,
          free,
          trigger,
          perRoundCap: annotation?.usesPerRound ?? null,
        },
      },
    ]);
    if (annotation?.reactionInterception) {
      const point = annotation.reactionInterception;
      lines.push(
        point.classified
          ? `  interception point: ${point.point} [R-0031]`
          : `  interception point: ${point.point} (unclassified residue — the printed effect resolves at the table) [R-0031]`,
      );
    }
    return lines.join('\n');
  }

  function commandVillain(args: string[]): string {
    const [recordQuery, actorQuery] = args;
    if (!recordQuery || !actorQuery || args.length > 2) return 'usage: villain <query> <actor>';
    const record = resolveRecord(recordQuery);
    if ('error' in record) return record.error;
    const actor = resolveParticipant(actorQuery);
    if ('error' in actor) return actor.error;
    return dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'use-villain-action',
        actor: { kind: 'director' },
        payload: { participantId: actor.id, abilityArtifactId: record.id },
      },
    ]).join('\n');
  }

  function commandGrant(args: string[]): string {
    const usage =
      'usage: grant <participant> <main|maneuver|move|triggered|free-triggered|free-maneuver|no-action|villain|turn|insertion> [x<n>] [--ignores-dazed] [--ignores-surprised] [--off-turn]';
    const [targetQuery, kindToken, ...rest] = args;
    if (!targetQuery || !kindToken) return usage;
    const target = resolveParticipant(targetQuery);
    if ('error' in target) return target.error;
    let magnitude = 1;
    const escapes = { ignoresDazed: false, ignoresSurprised: false, offTurn: false };
    for (const raw of rest) {
      const token = raw.toLowerCase();
      if (token === '--ignores-dazed') escapes.ignoresDazed = true;
      else if (token === '--ignores-surprised') escapes.ignoresSurprised = true;
      else if (token === '--off-turn') escapes.offTurn = true;
      else if (/^x\d+$/.test(token)) magnitude = Number(token.slice(1));
      else return `unknown grant token "${raw}" — ${usage}`;
    }
    if (magnitude < 1) return usage;
    type AddGrantPayload = Extract<Intent, { kind: 'add-grant' }>['payload'];
    const lower = kindToken.toLowerCase();
    let grant: AddGrantPayload['grant'];
    if (lower === 'turn' || lower === 'insertion') {
      // Director-asserted scheduling [design §3]: an extra turn allowance
      // this round, or an out-of-order turn insertion.
      grant = {
        kind: 'turn',
        mode: lower === 'turn' ? 'allowance' : 'insertion',
        magnitude,
        constraint: null,
        expiry: null,
        source: {},
      };
    } else {
      const cost = COST_ALIASES[lower];
      if (cost === undefined) return `unknown grant cost "${kindToken}" — ${usage}`;
      // Action grants extend only the per-turn budget counters — a grant of
      // any other cost would be dead (the consumption filter matches only
      // main/maneuver/move), so the schema makes it unrepresentable.
      if (cost !== 'main-action' && cost !== 'maneuver' && cost !== 'move-action') {
        return `action grants extend only the per-turn budget counters (main/maneuver/move) — "${kindToken}" has no consumable counter`;
      }
      grant = { kind: 'action', cost, magnitude, escapes, expiry: null, source: {} };
    }
    return dispatchAll([
      {
        intentId: nextIntentId(),
        kind: 'add-grant',
        actor: { kind: 'director' },
        payload: { target: target.id, grant },
      },
    ]).join('\n');
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
          case 'combat':
            return { output: commandCombat(args), quit: false };
          case 'turn':
            return { output: commandTurn(args), quit: false };
          case 'roll':
            return { output: commandRoll(args), quit: false };
          case 'commit':
            return { output: commandCommit(args), quit: false };
          case 'mod':
            return { output: commandMod(args), quit: false };
          case 'trigger':
            return { output: commandTrigger(args), quit: false };
          case 'villain':
            return { output: commandVillain(args), quit: false };
          case 'convert':
            return { output: commandConvert(args), quit: false };
          case 'advround':
            return { output: commandAdvRound(args), quit: false };
          case 'grant':
            return { output: commandGrant(args), quit: false };
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
