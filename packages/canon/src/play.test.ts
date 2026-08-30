import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { type ParticipantStats, ParticipantStatsSchema } from '@engarde/engine';
import { describe, expect, it } from 'vitest';
import { ingestStructuredRecord } from './extract.js';
import { DEVIL_ADJUDICATOR } from './fixtures/devil-adjudicator.verbatim.js';
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
      freeStrike: null,
      withCaptain: null,
      withCaptainBenefit: null,
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
    expect(help).toContain('squadattack <query> <ability-slug>');
    expect(help).toContain('squadfs <squad> <target>');
  });

  it('runs squadattack and squadfs through the thin CLI skin', () => {
    // Use the source-grounded spinecleaver ability here: it has no opaque
    // trailing Effect, so this smoke test exercises the successful CLI path.
    // Opaque Effects are separately required to refuse before debit/dice.
    const spinecleaverStats = ParticipantStatsSchema.parse(
      JSON.parse(GOBLIN_SPINECLEAVER.statsJson),
    );
    const warriorStats = ParticipantStatsSchema.parse(JSON.parse(GOBLIN_WARRIOR.statsJson));
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
        {
          squadId: 'squad-sc',
          name: 'spinecleavers',
          memberIds: ['sc1', 'sc2', 'sc3', 'sc4'],
        },
      ],
    });
    const attack = session.execute(
      'squadattack spinecleaver axe squad-sc warrior:sc1:sc1+sc2 dice 5,5',
    ).output;
    expect(attack).toContain("squad-sc's one-roll squad outcome resolves");
    // Axe's damage+Push tier is conserved as residue, so the one-roll path
    // opens/resolves successfully but leaves the packet for the table.
    expect(session.execute('status').output).toContain('stamina 15/15');
    const freeStrike = session.execute('squadfs squad-sc warrior sc3,sc4').output;
    expect(freeStrike).toContain('combines 2 free-strike contribution');
    expect(session.execute('status').output).toContain('stamina 11/15');
    expect(session.transcript().violationCount).toBe(0);
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

  it('documents the action-economy verbs (R-0029..R-0033)', () => {
    const session = neutralSession();
    const help = session.execute('help').output;
    expect(help).toContain('combat <heroes|director>');
    expect(help).toContain('turn <actor|squad>');
    expect(help).toContain('roll <query> <actor> <targets>');
    expect(help).toContain('--hold');
    expect(help).toContain('commit [<resolutionId>]');
    expect(help).toContain('mod [<resolution>] downgrade <1|2>');
    expect(help).toContain('trigger <query> <actor>');
    expect(help).toContain('villain <query> <actor>');
    expect(help).toContain('convert [<actor>] main <maneuver|move>');
    expect(help).toContain('advround');
    expect(help).toContain('grant <participant>');
    expect(help).toContain('endturn <actor|squad>');
  });

  it('economy verbs validate their tokens before any intent is built', () => {
    const session = neutralSession();
    expect(session.execute('combat').output).toContain('usage: combat');
    expect(session.execute('combat sideways').output).toContain('usage: combat');
    expect(session.execute('turn').output).toContain('usage: turn');
    expect(session.execute('turn fury').output).toContain('combat has not begun');
    expect(session.execute('advround now').output).toContain('usage: advround');
    expect(session.execute('convert').output).toContain('usage: convert');
    expect(session.execute('convert fury maneuver main').output).toContain('usage: convert');
    expect(session.execute('roll').output).toContain('usage: roll');
    expect(session.execute('roll fury fury censor blorp').output).toContain(
      'unknown roll token "blorp"',
    );
    // The neutral record text compiles no power-roll cluster — the shell
    // points at the asserted-tier and Effect paths instead of guessing.
    expect(session.execute('roll fury fury censor').output).toContain(
      'compiles no rolling ability',
    );
    expect(session.execute('commit').output).toContain('no open resolution on the stack');
    expect(session.execute('mod downgrade 1').output).toContain('the resolution stack is empty');
    expect(session.execute('trigger').output).toContain('usage: trigger');
    expect(session.execute('villain fury').output).toContain('usage: villain');
    expect(session.execute('grant fury blorp').output).toContain('unknown grant cost "blorp"');
    expect(session.execute('grant fury main x0').output).toContain('usage: grant');
  });

  it('runs the combat round flow: tracker, budget chips, convert, loud warnings, round advance', () => {
    const session = neutralSession();
    const begun = session.execute('combat heroes').output;
    // Server-rolled d10 path (auto-roll default) [rule.combat/combat-round].
    expect(begun).toContain('combat begins — round 1, heroes act first');
    expect(begun).toContain('d10:');

    let status = session.execute('status').output;
    expect(status).toContain(
      'combat: round 1 — active turn: none — turn choice: heroes — first side: heroes',
    );
    expect(status).toContain('turns taken: fury 0/1 · censor 0/1');
    expect(status).toContain('villain action: available this round');
    expect(status).toContain('budget: main 0/1 · maneuver 0/1 · move 0/1 · triggered 0/1');

    expect(session.execute('turn fury').output).toContain('fury starts their turn (round 1)');
    status = session.execute('status').output;
    expect(status).toContain('active turn: fury');
    expect(status).toContain('turns taken: fury 1/1');

    // Implicit-actor convert rides the active turn; the maneuver capacity
    // grows by the converted grant ("You can also turn your main action
    // into a move action or a maneuver").
    const converted = session.execute('convert main maneuver').output;
    expect(converted).toContain('fury turns their main action into a maneuver');
    status = session.execute('status').output;
    expect(status).toContain('budget: main 1/1 · maneuver 0/2 · move 0/1 · triggered 0/1');

    expect(session.execute('endturn fury').output).toContain('fury ends their turn');

    // Acting again after taking a turn is R-0030 warn-and-apply — rendered
    // LOUD, never silent.
    const again = session.execute('turn fury').output;
    expect(again).toContain('!! WARNING:');
    expect(again).toContain('acts again after taking 1 turn(s) this round');
    expect(again).toContain('Applied anyway (permissive engine, R-0030)');
    session.execute('endturn fury');

    // Director-asserted round advance warns listing living unspent turns.
    const advanced = session.execute('advround because the table asserts the round over').output;
    expect(advanced).toContain('!! WARNING:');
    expect(advanced).toContain('living unspent turns: censor');
    expect(advanced).toContain('round 2 begins');
    expect(session.execute('status').output).toContain('combat: round 2');
  });

  it('director grants and the villain economy through the CLI', () => {
    const session = neutralSession();
    session.execute('combat director');

    // Escape-flagged action grant [R-0030]: printed escapes never warn.
    const granted = session.execute('grant fury main x2 --ignores-dazed --off-turn').output;
    expect(granted).toContain('fury is granted an additional main-action');
    const status = session.execute('status').output;
    expect(status).toContain('pending: additional main-action ×2');

    // Director-asserted scheduling: a turn-allowance grant.
    expect(session.execute('grant censor turn').output).toContain('censor is granted');

    // Villain economy: one per round, once per encounter — the second use
    // warns loudly on both printed constraints and applies anyway.
    expect(session.execute('villain fury censor').output).toContain(
      "spends the encounter's villain action",
    );
    const second = session.execute('villain fury censor').output;
    expect(second).toContain('!! WARNING: a villain action was already used this round');
    expect(second).toContain('was already used this encounter');
    expect(session.execute('status').output).toContain('villain action: SPENT this round');

    // Triggered actions: the per-round counter warns past the limit.
    expect(session.execute('trigger fury censor because a creature strikes them').output).toContain(
      'asserted trigger: a creature strikes them',
    );
    const overLimit = session.execute('trigger fury censor because it happens again').output;
    expect(overLimit).toContain('!! WARNING:');
    expect(overLimit).toContain('limit 1');
  });
});

describe('two-phase combat with real corpus abilities (verbatim fixtures)', () => {
  function combatSession() {
    // Stats come from the drift-guarded verbatim fixtures (models point,
    // code cuts) — never hand-typed rule content.
    const adjudicatorStats = ParticipantStatsSchema.parse(JSON.parse(DEVIL_ADJUDICATOR.statsJson));
    const warriorStats = ParticipantStatsSchema.parse(JSON.parse(GOBLIN_WARRIOR.statsJson));
    return createPlaySession({
      actors: [
        { id: 'adjudicator', recordId: DEVIL_ADJUDICATOR.artifactId, stats: adjudicatorStats },
        { id: 'warrior', recordId: GOBLIN_WARRIOR.artifactId, stats: warriorStats },
      ],
      records: new Map([
        [DEVIL_ADJUDICATOR.artifactId, DEVIL_ADJUDICATOR.text],
        [GOBLIN_WARRIOR.artifactId, GOBLIN_WARRIOR.text],
      ]),
    });
  }

  it('roll auto-commits by default: one action for the common path [R-0032]', () => {
    const session = combatSession();
    expect(session.execute('combat director roll 4').output).toContain('(d10: 4, asserted)');
    session.execute('turn adjudicator');

    // Infernal Injunction (fixed Power Roll + 3): 3+4+3 = 10 → tier 1 —
    // "10 fire damage; I < 1 frightened (save ends)". The dispatch opens a
    // resolution entry and the shell pipelines the commit immediately.
    const rolled = session.execute('roll devil-adjudicator adjudicator warrior dice 3,4').output;
    expect(rolled).toContain('rolled and OPEN on the resolution stack');
    expect(rolled).toContain('is committed and executes against commit-time state');
    expect(rolled).toContain('warrior takes 10 fire damage');
    expect(rolled).toContain('frightened applied to warrior');

    const status = session.execute('status').output;
    expect(status).toContain('stamina 5/15');
    expect(status).toContain('budget: main 1/1');
    expect(status).not.toContain('open resolutions:');
    expect(session.transcript().violationCount).toBe(0);
  });

  it('manual damage can assert a damage-only ability use and derives its debit [N-3]', () => {
    const session = combatSession();
    session.execute('combat director roll 4');
    session.execute('turn warrior');

    // The real goblin-warrior record has two power-roll abilities, so the
    // explicit suffix proves that the shell derives Spear Charge's printed
    // main-action cost instead of guessing a record-level cost.
    const first = session.execute(
      'damage adjudicator 3 ability goblin-warrior#spear-charge by warrior because asserted tier damage',
    ).output;
    expect(first).toContain('adjudicator takes 3 asserted tier damage');
    expect(first).not.toContain('WARNING');
    expect(session.execute('status').output).toContain('budget: main 1/1');

    const reused = session.execute(
      'damage adjudicator 3 ability goblin-warrior#spear-charge by warrior because asserted tier damage again',
    ).output;
    expect(reused).toContain('!! WARNING:');
    expect(reused).toContain('exceeds their turn budget for a main-action');
  });

  it('holds a window open: --hold, mod downgrade, explicit commit, endturn force-commit', () => {
    const session = combatSession();
    session.execute('combat director roll 4');
    session.execute('turn adjudicator');
    session.execute('endturn adjudicator');
    session.execute('turn warrior');

    // The goblin-warrior stat block compiles two rolling abilities — the
    // shell lists them instead of guessing.
    const ambiguous = session.execute('roll goblin-warrior warrior adjudicator').output;
    expect(ambiguous).toContain('compiles 2 rolling abilities');

    // Spear Charge held open: 5+5+2 = 12 → tier 2 ("4 damage"), then a
    // downgrade modification and the explicit commit apply tier 1's
    // "3 damage" against commit-time state [R-0032].
    const held = session.execute(
      'roll goblin-warrior warrior adjudicator 1 dice 5,5 --hold',
    ).output;
    expect(held).toContain('HELD OPEN');
    let status = session.execute('status').output;
    expect(status).toContain('open resolutions:');
    expect(status).toContain('by warrior — rolled tier 2, commit pending [R-0032] — mods: none');
    expect(session.execute('mod downgrade 1').output).toContain('records a downgrade modification');
    expect(session.execute('status').output).toContain('mods: downgrade→tier 1');
    const committed = session.execute('commit').output;
    expect(committed).toContain('with 1 recorded modification(s)');
    expect(committed).toContain('adjudicator takes 3 damage');

    // A second main action this turn is an R-0030 violation: loud warning,
    // applied anyway. Ending the turn force-commits the open entry — the
    // shell re-supplies the held payload; printed damage is never
    // discarded. Bury the Point tier 2: "6 damage; M < 1 bleeding".
    const over = session.execute(
      'roll goblin-warrior warrior adjudicator 2 dice 5,5 --hold',
    ).output;
    expect(over).toContain('!! WARNING: warrior exceeds their turn budget for a main-action');
    const ended = session.execute('endturn warrior').output;
    expect(ended).toContain('FORCE-committed at end of turn');
    expect(ended).toContain('adjudicator takes 6 damage');
    expect(ended).toContain('bleeding applied to adjudicator');

    status = session.execute('status').output;
    expect(status).toContain('stamina 131/140');
    expect(status).not.toContain('open resolutions:');
    expect(session.transcript().violationCount).toBe(0);
  });

  it('asserted-band use debits the compiled header cost through the one home [B-2]', () => {
    const session = combatSession();
    session.execute('combat director roll 4');
    session.execute('turn adjudicator');
    // Infernal Injunction asserted at ≤11 ("10 fire damage; I < 1
    // frightened (save ends)") — a manual tier assertion is still a USE of
    // the printed Main-action ability, so the compiled header's cost rides
    // the binding seam and the main action debits exactly like the rolled
    // path (damage stays a NOT-AUTOMATED receipt on this path).
    const used = session.execute('use devil-adjudicator t1 adjudicator warrior').output;
    expect(used).toContain('NOT AUTOMATED (damage)');
    const status = session.execute('status').output;
    expect(status).toContain('budget: main 1/1');
    expect(status).toContain('frightened (save-ends)');
    // A second asserted use is over-budget: warn-and-apply [R-0030].
    const again = session.execute('use devil-adjudicator t1 adjudicator warrior').output;
    expect(again).toContain('!! WARNING:');
    expect(again).toContain('exceeds their turn budget for a main-action');
    expect(session.transcript().violationCount).toBe(0);
  });

  it('squad endturn advice never suggests per-member turns (double-runs the end-of-turn sweeps) [M-4]', () => {
    const spinecleaverStats = ParticipantStatsSchema.parse(
      JSON.parse(GOBLIN_SPINECLEAVER.statsJson),
    );
    const session = createPlaySession({
      actors: ['sc1', 'sc2'].map((id) => ({
        id,
        recordId: GOBLIN_SPINECLEAVER.artifactId,
        stats: spinecleaverStats,
      })),
      records: new Map([[GOBLIN_SPINECLEAVER.artifactId, GOBLIN_SPINECLEAVER.text]]),
      squads: [{ squadId: 'squad-sc', name: 'spinecleavers', memberIds: ['sc1', 'sc2'] }],
    });
    const advice = session.execute('endturn squad-sc bleeding=5').output;
    expect(advice).toContain('omit them and the squad turn auto-rolls every member save');
    expect(advice).not.toContain('end each member separately');
  });

  it('triggered actions ride the compiled header: cost, cap, and interception point [R-0031]', () => {
    const session = combatSession();
    session.execute('combat director roll 4');
    session.execute('turn warrior');
    // Spear Charge auto-commits: 3+4+2 = 9 → tier 1 ("3 damage").
    const rolled = session.execute('roll goblin-warrior warrior adjudicator 1 dice 3,4').output;
    expect(rolled).toContain('adjudicator takes 3 damage');
    expect(session.execute('occurrences').output).toContain('cli-3#1  targeted');
    // Devilish Charm (Triggered action) against the strike occurrence: the
    // compiled annotation classifies its tier-1 retarget template onto the
    // 'targeting' interception point [R-0031].
    const triggered = session.execute('trigger devil-adjudicator adjudicator by cli-3#1').output;
    expect(triggered).toContain('triggered by occurrence cli-3#1');
    expect(triggered).toContain('uses a triggered action');
    expect(triggered).toContain('1 of 1 this round');
    expect(triggered).toContain('interception point: targeting [R-0031]');
    expect(session.transcript().violationCount).toBe(0);
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
