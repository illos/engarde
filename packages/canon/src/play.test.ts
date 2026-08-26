import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type ParticipantStats, ParticipantStatsSchema } from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import { ingestStructuredRecord } from './extract.js';
import { GOBLIN_SPINECLEAVER } from './fixtures/goblin-spinecleaver.verbatim.js';
import { GOBLIN_WARRIOR } from './fixtures/goblin-warrior.verbatim.js';
import { createPlaySession } from './play.js';

/**
 * Session-mechanics tests use real corpus ids with minimal neutral text
 * (command parsing, resolution, refusals); the full play-through runs
 * against actual corpus abilities in the corpus-gated suite (prime
 * directive: fixtures are real records, never invented stat blocks).
 */

const FURY = 'mcdm.heroes.v1/class/fury';
const CENSOR = 'mcdm.heroes.v1/class/censor';

function neutralSession() {
  // Records present but with content-neutral text: enough for the session
  // to accept the actors; no rule prose is fabricated.
  return createPlaySession({
    actors: [
      { id: 'fury', recordId: FURY },
      { id: 'censor', recordId: CENSOR },
    ],
    records: new Map([
      [FURY, 'x\n'],
      [CENSOR, 'x\n'],
    ]),
  });
}

describe('play session shell mechanics', () => {
  it('refuses an actor whose record is not in the loaded store', () => {
    expect(() =>
      createPlaySession({
        actors: [{ id: 'fury', recordId: FURY }],
        records: new Map(),
      }),
    ).toThrow(/must be real corpus records/);
  });

  it('reports status, unknown commands, and help', () => {
    const session = neutralSession();
    expect(session.execute('status').output).toContain('fury');
    expect(session.execute('status').output).toContain('no conditions');
    expect(session.execute('nonsense').output).toContain('unknown command');
    expect(session.execute('help').output).toContain('endturn');
    expect(session.execute('quit').quit).toBe(true);
  });

  it('resolves participants by substring and rejects ambiguity', () => {
    const session = neutralSession();
    const output = session.execute('endturn fu').output;
    expect(output).toContain('fury ends their turn');
    expect(session.execute('endturn zzz').output).toContain('no participant matches');
  });

  it('records every dispatch in the transcript', () => {
    const session = neutralSession();
    session.execute('endturn fury');
    session.execute('end');
    const transcript = session.transcript();
    expect(transcript.steps).toHaveLength(2);
    expect(transcript.violationCount).toBe(0);
  });

  it('shows vitals for stat-tracked actors; Recoveries omitted when untracked', () => {
    // Synthetic neutral stats (the engine-test convention): display plumbing
    // under test, no rule content asserted.
    const stats: ParticipantStats = {
      staminaMax: 21,
      characteristics: { might: 0, agility: 0, reason: 0, intuition: 0, presence: 0 },
      immunities: [],
      weaknesses: [],
      potencies: null,
      organization: null,
      recoveriesMax: 8,
      withCaptain: null,
    };
    const session = createPlaySession({
      actors: [
        { id: 'fury', recordId: FURY, stats },
        { id: 'censor', recordId: CENSOR, stats: { ...stats, recoveriesMax: null } },
      ],
      records: new Map([
        [FURY, 'x\n'],
        [CENSOR, 'x\n'],
      ]),
    });
    const status = session.execute('status').output;
    expect(status).toContain('fury  (mcdm.heroes.v1/class/fury)\n  stamina 21/21  recoveries 8/8');
    expect(status).toContain('censor  (mcdm.heroes.v1/class/censor)\n  stamina 21/21\n');
  });

  it('documents the decline: target prefix and the clearterrain command', () => {
    const session = neutralSession();
    const help = session.execute('help').output;
    expect(help).toContain('decline:<id>');
    expect(help).toContain('clearterrain <factId>');
    expect(help).toContain('damage <target> <amount>');
    expect(help).toContain('resolvekills <squad>');
    expect(help).toContain('attach <squad> <captain>');
    expect(help).toContain('detach <squad>');
  });

  it('squad play: seeded pool vitals, damage routing, pending-kill naming, captain attach/detach', () => {
    // Stats come from the drift-guarded verbatim fixtures (models point,
    // code cuts) — never hand-typed rule content.
    const spinecleaverStats = ParticipantStatsSchema.parse(
      JSON.parse(GOBLIN_SPINECLEAVER.statsJson),
    );
    const warriorStats = ParticipantStatsSchema.parse(JSON.parse(GOBLIN_WARRIOR.statsJson));
    expect(spinecleaverStats.staminaMax).toBe(5);
    const session = createPlaySession({
      actors: [
        ...['sc1', 'sc2', 'sc3', 'sc4'].map((id) => ({
          id,
          recordId: GOBLIN_SPINECLEAVER.artifactId,
          stats: spinecleaverStats,
        })),
        { id: 'warrior', recordId: GOBLIN_WARRIOR.artifactId, stats: warriorStats },
      ],
      records: new Map([
        [GOBLIN_SPINECLEAVER.artifactId, GOBLIN_SPINECLEAVER.text],
        [GOBLIN_WARRIOR.artifactId, GOBLIN_WARRIOR.text],
      ]),
      squads: [
        { squadId: 'squad-sc', name: 'spinecleavers', memberIds: ['sc1', 'sc2', 'sc3', 'sc4'] },
      ],
    });

    // Seeded pool vitals in status: per-minion 5 × 4 members = 20.
    const seeded = session.execute('status').output;
    expect(seeded).toContain('spinecleavers  pool 20/20 (per minion 5)  living 4  dead 0');

    // Non-area damage routes to the pool [R-0024]: 7 → pool 13, sc1 dies.
    session.execute('damage sc1 7');
    const afterFirst = session.execute('status').output;
    expect(afterFirst).toContain('pool 13/20');
    expect(afterFirst).toContain('dead: sc1');

    // Outkill without named victims leaves a pending identity [R-0024].
    session.execute('damage sc2 12');
    const pending = session.execute('status').output;
    expect(pending).toContain('pool 1/20');
    expect(pending).toContain('dead: sc1, sc2');
    expect(pending).toContain('pending kills: 1');
    const resolved = session.execute('resolvekills squad-sc sc3 because nearest to sc2').output;
    expect(resolved).toContain('sc3 identified');
    expect(session.execute('status').output).not.toContain('pending kills');

    // Captain attach surfaces the fixture's verbatim With-Captain entry
    // only while attached [R-0028].
    if (spinecleaverStats.withCaptain === null) throw new Error('fixture lost its entry');
    session.execute('attach squad-sc warrior');
    const attached = session.execute('status').output;
    expect(attached).toContain('captain: warrior');
    expect(attached).toContain(`with captain: ${spinecleaverStats.withCaptain}`);
    session.execute('detach squad-sc because the warrior falls back');
    const detached = session.execute('status').output;
    expect(detached).not.toContain('captain: warrior');
    expect(detached).not.toContain('with captain:');

    // Area damage feeds the pool at most the per-minion Stamina [R-0025].
    const area = session.execute('damage sc4 9 area').output;
    expect(area).toContain('pool damage');
    const final = session.execute('status').output;
    expect(final).toContain('pool 0/20');
    expect(final).toContain('dead: sc1, sc2, sc3, sc4');

    expect(session.transcript().violationCount).toBe(0);
  });

  it('damage command validates its tokens before any intent is built', () => {
    const session = neutralSession();
    expect(session.execute('damage').output).toContain('usage: damage');
    expect(session.execute('damage fury x').output).toContain('usage: damage');
    expect(session.execute('damage fury 3 firestorm').output).toContain('unknown damage token');
    expect(session.execute('resolvekills').output).toContain('usage: resolvekills');
    expect(session.execute('resolvekills zzz sk1').output).toContain('no squad matches');
    expect(session.execute('attach').output).toContain('usage: attach');
    expect(session.execute('detach zzz').output).toContain('no squad matches');
  });

  it('clearterrain reports usage and unknown fact ids', () => {
    const session = neutralSession();
    expect(session.execute('clearterrain').output).toContain('usage: clearterrain');
    expect(session.execute('clearterrain zzz').output).toContain(
      'no terrain fact matches "zzz" (none recorded)',
    );
  });
});

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

async function loadRecord(markdownPath: string): Promise<{ id: string; text: string }> {
  const jsonPath = markdownPath.replace('/md/', '/json/').replace(/\.md$/, '.json');
  const bundle = ingestStructuredRecord({
    markdownPath,
    markdown: await readFile(resolve(sourceRoot ?? '', markdownPath)),
    jsonPath,
    json: await readFile(resolve(sourceRoot ?? '', jsonPath)),
  });
  const artifact = bundle.records.find((record) => record.recordKind === 'artifact');
  if (!artifact || artifact.recordKind !== 'artifact') throw new Error('no artifact');
  return { id: artifact.id, text: artifact.text };
}

describe.skipIf(!sourceRoot)('play-through with real corpus abilities', () => {
  it('plays blood-for-blood end to end: use, save, remove, end-encounter', async () => {
    const [fury, censor, ability] = await Promise.all([
      loadRecord('en/books/heroes/md/class/fury.md'),
      loadRecord('en/books/heroes/md/class/censor.md'),
      loadRecord('en/books/heroes/md/feature/ability/fury/level-1/blood-for-blood.md'),
    ]);
    const session = createPlaySession({
      actors: [
        { id: 'fury', recordId: fury.id },
        { id: 'censor', recordId: censor.id },
      ],
      records: new Map([
        [fury.id, fury.text],
        [censor.id, censor.text],
        [ability.id, ability.text],
      ]),
    });

    const use = session.execute('use blood-for-blood t3 fury censor').output;
    expect(use).toContain('tier 17+');
    expect(use).toContain('NOT AUTOMATED (damage)');

    const effect = session.execute('effect blood-for-blood fury censor').output;
    expect(effect).toContain('TABLE-DIRECTIVE');
    expect(effect).toContain(
      'You can deal 1d6 damage to yourself to deal an extra 1d6 damage to the target.',
    );

    const status = session.execute('status').output;
    expect(status).toContain('bleeding (save-ends) from fury via blood-for-blood');
    expect(status).toContain('weakened (save-ends) from fury via blood-for-blood');

    // Censor saves off weakened (asserted 7), fails bleeding (asserted 2).
    const turn = session.execute('endturn censor weakened=7 bleeding=2').output;
    expect(turn).toContain('censor ends their turn');
    const after = session.execute('status').output;
    expect(after).toContain('bleeding');
    expect(after).not.toContain('weakened (save-ends)');

    session.execute('remove censor bleeding as fury because imposer ends their ability effect');
    expect(session.execute('status').output).toContain('no conditions');

    expect(session.execute('end').output).toContain('the encounter ends');
    const transcript = session.transcript();
    expect(transcript.violationCount).toBe(0);
    expect(transcript.steps.length).toBeGreaterThanOrEqual(5);
  });

  it('plays the flat-resource family: Recovery offer with decline, terrain fact, clearterrain', async () => {
    const [fury, censor, myTurn, pillar] = await Promise.all([
      loadRecord('en/books/heroes/md/class/fury.md'),
      loadRecord('en/books/heroes/md/class/censor.md'),
      loadRecord('en/books/heroes/md/feature/ability/fury/level-5/my-turn.md'),
      loadRecord('en/books/monsters/md/dynamic-terrain/mechanisms/pillar.md'),
    ]);
    const session = createPlaySession({
      actors: [
        { id: 'fury', recordId: fury.id },
        { id: 'censor', recordId: censor.id },
      ],
      records: new Map([
        [fury.id, fury.text],
        [censor.id, censor.text],
        [myTurn.id, myTurn.text],
        [pillar.id, pillar.text],
      ]),
    });

    // "You can spend a Recovery." — a declinable offer [R-0018]: bare id
    // accepts, decline:<id> declines. Table-mode participants (no stats)
    // route the accepted spend to a table receipt.
    const offer = session.execute('effect my-turn fury fury,decline:censor').output;
    expect(offer).toContain('on fury, decline:censor');
    expect(offer).toContain('fury accepts the offered Recovery');
    expect(offer).toContain('censor declines the offered Recovery');

    // decline: is a spend-recovery-only prefix — anything else is refused
    // by the shell before any intent is built.
    expect(session.execute('effect pillar fury decline:censor 2').output).toContain(
      'decline: applies only to a Recovery-offer Effect',
    );

    // "The area is difficult terrain." — recorded as an attributed terrain
    // fact [R-0022], shown in status with areaText, source slug, factId.
    const terrain = session.execute('effect pillar fury none 2').output;
    expect(terrain).toContain('difficult terrain');
    const status = session.execute('status').output;
    expect(status).toContain('terrain facts:');
    expect(status).toContain('via pillar by fury');
    const factId = /\[([^\]]*-terrain)\]/.exec(status)?.[1];
    expect(factId).toBeDefined();

    // Director clears the fact by (substring of) its factId.
    const cleared = session.execute('clearterrain cli-2-terrain because rubble hauled away').output;
    expect(cleared).toContain('terrain fact cleared: rubble hauled away');
    expect(session.execute('status').output).not.toContain('terrain facts:');
    expect(session.execute('clearterrain cli-2-terrain').output).toContain(
      'no terrain fact matches',
    );

    const transcript = session.transcript();
    expect(transcript.violationCount).toBe(0);
  });
});
