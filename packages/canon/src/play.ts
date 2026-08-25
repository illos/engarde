import {
  type Intent,
  type LogEntry,
  type Transcript,
  createDriver,
  createSeededRandomSource,
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
  endturn <actor> [<condition>=<roll>..]  end of turn; roll omitted = auto-roll
  remove <target> <condition> [as <actor>] [because <reason..>]
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
    })),
    { random: createSeededRandomSource(options.seed ?? 1) },
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
      if (participant.conditions.length === 0) {
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
    // [R-0007]; `none` = targetless manual instruction.
    const targetIds: string[] = [];
    const objectTargets: string[] = [];
    if (targetQuery !== 'none') {
      for (const token of targetQuery.split(',')) {
        if (token.startsWith('obj:')) {
          const label = token.slice('obj:'.length);
          if (label.length === 0) return `empty object label in "${token}"`;
          objectTargets.push(label);
          continue;
        }
        const resolved = resolveParticipant(token);
        if ('error' in resolved) return resolved.error;
        targetIds.push(resolved.id);
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
    const targetLabel = [...targetIds, ...objectTargets.map((label) => `obj:${label}`)].join(', ');
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
