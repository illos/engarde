import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CampaignAuditManifestSchema, ExtractionBundleSchema } from './schemas.js';
import { statblockStats } from './statblock-stats.js';

const sourceRoot = process.env.ENGARDE_CORPUS_ROOT
  ? resolve(process.env.ENGARDE_CORPUS_ROOT)
  : undefined;

async function structured(jsonPath: string): Promise<Record<string, unknown>> {
  return JSON.parse(await readFile(resolve(sourceRoot ?? '', jsonPath), 'utf8'));
}

describe.skipIf(!sourceRoot)('statblockStats over real stat blocks', () => {
  it('goblin assassin: full characteristics, stamina, Horde organization', async () => {
    const stats = statblockStats(
      await structured('en/books/monsters/json/monster/goblin/statblock/goblin-assassin.json'),
    );
    expect(stats).toEqual({
      staminaMax: 15,
      staminaResidue: null,
      characteristics: { might: -2, agility: 2, reason: 0, intuition: 0, presence: -2 },
      immunities: [],
      weaknesses: [],
      potencies: null,
      organization: 'Horde',
      recoveriesMax: null,
      freeStrike: 2,
      withCaptain: null,
      withCaptainBenefit: null,
      unparsedRows: [],
    });
  });

  it('goblin spinecleaver: free strike and With-Captain phrase lift together', async () => {
    const stats = statblockStats(
      await structured('en/books/monsters/json/monster/goblin/statblock/goblin-spinecleaver.json'),
    );
    expect(stats?.freeStrike).toBe(2);
    expect(stats?.withCaptain).toBe('+1 damage bonus to strikes');
    expect(stats?.withCaptainBenefit).toEqual({
      kind: 'strike-damage',
      amount: 1,
      sourceText: '+1 damage bonus to strikes',
    });
  });

  it('count rhodar: typed immunities parse with values', async () => {
    const stats = statblockStats(
      await structured(
        'en/books/monsters/json/monster/count-rhodar-von-glauer/statblock/count-rhodar-von-glauer.json',
      ),
    );
    expect(stats?.staminaMax).toBe(650);
    expect(stats?.immunities).toEqual([
      { appliesTo: 'corruption', value: 10 },
      { appliesTo: 'poison', value: 10 },
    ]);
    expect(stats?.organization).toBe('Solo');
  });

  it('troll mercenary: the malformed upstream "fire" weakness row is a receipt, not a guess', async () => {
    const stats = statblockStats(
      await structured('en/books/monsters/json/monster/retainer/statblock/troll-mercenary.json'),
    );
    expect(stats?.weaknesses).toEqual([{ appliesTo: 'acid', value: 5 }]);
    expect(stats?.unparsedRows).toEqual(['weakness: fire']);
  });

  it('gushing spewler: the multi-column Stamina cell freezes verbatim; every other cell is carried (partial parse)', async () => {
    // The pin prints `**4 \| 4 \| 4**<br>Stamina` and nowhere defines the
    // column mapping — folding it to one number is a ruling, not a parse.
    const stats = statblockStats(
      await structured(
        'en/books/summoner/json/monster/minion/summoner/demon/statblock/gushing-spewler.json',
      ),
    );
    expect(stats).toEqual({
      staminaMax: null,
      staminaResidue: '4 | 4 | 4',
      characteristics: { might: -2, agility: 0, reason: -1, intuition: 3, presence: 3 },
      immunities: [],
      weaknesses: [{ appliesTo: 'holy', value: 1 }],
      potencies: null,
      organization: 'Minion',
      recoveriesMax: null,
      freeStrike: 3,
      withCaptain: null,
      withCaptainBenefit: null,
      unparsedRows: ['stamina: 4 | 4 | 4'],
    });
  });

  it("demon lord's aspect: the SPECIAL Stamina cell freezes verbatim; every other cell is carried (partial parse)", async () => {
    // The pin prints `**SPECIAL**<br>Stamina` plus the body line
    // "Stamina: Your maximum Stamina" — hero-linked, not one printed
    // number; frozen until ruled.
    const stats = statblockStats(
      await structured(
        'en/books/summoner/json/monster/champion/summoner/demon/statblock/demon-lords-aspect.json',
      ),
    );
    expect(stats?.staminaMax).toBeNull();
    expect(stats?.staminaResidue).toBe('SPECIAL');
    expect(stats?.characteristics).toEqual({
      might: 2,
      agility: 5,
      reason: 5,
      intuition: 2,
      presence: 2,
    });
    expect(stats?.immunities).toEqual([{ appliesTo: 'corruption', value: 5 }]);
    expect(stats?.freeStrike).toBe(9);
    expect(stats?.organization).toBe('Champion');
    expect(stats?.unparsedRows).toEqual(['stamina: SPECIAL']);
  });

  it('a non-statblock record yields null', async () => {
    const stats = statblockStats(
      await structured('en/books/heroes/json/feature/ability/fury/level-1/blood-for-blood.json'),
    );
    expect(stats).toBeNull();
  });
});

const MANIFEST_PATH = resolve(
  import.meta.dirname,
  '../../../.artifacts/canon/campaign/accepted/final-campaign-manifest.json',
);

describe.skipIf(!existsSync(MANIFEST_PATH))(
  'stamina-residue freeze across the accepted pin',
  () => {
    it('freezes the Stamina residue set exactly — 50 frozen cells, every other statblock fully numeric', () => {
      // Partial-parse hardening (ROAD-0005 seam #5): a statblock record is
      // never dropped for one unreadable cell — the cell freezes as verbatim
      // residue and the rest is carried. This sweep pins the exact residue
      // population at the accepted pin so a pin bump that introduces a new
      // unreadable class (or silently folds one of these) breaks loudly.
      const manifest = CampaignAuditManifestSchema.parse(
        JSON.parse(readFileSync(MANIFEST_PATH, 'utf8')),
      );
      let statblockCount = 0;
      let numericStamina = 0;
      const residues: string[] = [];
      for (const entry of manifest.bundles) {
        const bundle = ExtractionBundleSchema.parse(
          JSON.parse(readFileSync(resolve(entry.bundlePath), 'utf8')),
        );
        for (const record of bundle.records) {
          if (record.recordKind !== 'artifact') continue;
          const stats = statblockStats(record.structuredData);
          if (stats === null) continue;
          statblockCount += 1;
          // Partial-parse invariants: exactly one of value/residue per cell,
          // and the frozen cell never poisons the rest of the record.
          expect(stats.staminaMax === null).toBe(stats.staminaResidue !== null);
          expect(stats.characteristics).not.toBeNull();
          if (stats.staminaMax !== null) {
            numericStamina += 1;
          } else {
            residues.push(`${record.id}: ${stats.staminaResidue}`);
          }
        }
      }
      // Honest baseline at the accepted pin: 512 statblock artifacts, 462
      // with one plain printed Stamina number (the pre-hardening statsJson
      // population — no record's parsed values changed), 50 frozen cells:
      // 46 Summoner-minion multi-column cells and 4 Summoner-champion
      // SPECIAL cells (whose printed body line is "Stamina: Your maximum
      // Stamina"). Both classes await a ruling before any fold.
      expect(statblockCount).toBe(512);
      expect(numericStamina).toBe(462);
      expect([...residues].sort()).toEqual([
        'mcdm.summoner.v1/monster.champion.summoner.demon.statblock/demon-lords-aspect: SPECIAL',
        'mcdm.summoner.v1/monster.champion.summoner.elemental.statblock/dragons-portent: SPECIAL',
        'mcdm.summoner.v1/monster.champion.summoner.fey.statblock/celestial-attendant: SPECIAL',
        'mcdm.summoner.v1/monster.champion.summoner.undead.statblock/avatar-of-death: SPECIAL',
        'mcdm.summoner.v1/monster.minion.summoner.demon.statblock/archer-spittlich: 5 | 5',
        'mcdm.summoner.v1/monster.minion.summoner.demon.statblock/faded-blightling: 17 | 17',
        'mcdm.summoner.v1/monster.minion.summoner.demon.statblock/fanged-musilex: 6 | 6',
        'mcdm.summoner.v1/monster.minion.summoner.demon.statblock/gorrre: 17 | 17',
        'mcdm.summoner.v1/monster.minion.summoner.demon.statblock/gushing-spewler: 4 | 4 | 4',
        'mcdm.summoner.v1/monster.minion.summoner.demon.statblock/hulking-chimor: 7 | 7 | 7',
        'mcdm.summoner.v1/monster.minion.summoner.demon.statblock/twisted-bengrul: 5 | 5',
        'mcdm.summoner.v1/monster.minion.summoner.demon.statblock/vicisittante: 17 | 17',
        'mcdm.summoner.v1/monster.minion.summoner.demon.statblock/violent: 5 | 5 | 5',
        'mcdm.summoner.v1/monster.minion.summoner.elemental.statblock/crux-of-ash: 6 | 6',
        'mcdm.summoner.v1/monster.minion.summoner.elemental.statblock/dancing-silk: 4 | 4 | 4',
        'mcdm.summoner.v1/monster.minion.summoner.elemental.statblock/desolation-of-sand: 5 | 5',
        'mcdm.summoner.v1/monster.minion.summoner.elemental.statblock/flow-of-magma: 6 | 6',
        'mcdm.summoner.v1/monster.minion.summoner.elemental.statblock/iron-reaver: 10 | 10 | 10',
        'mcdm.summoner.v1/monster.minion.summoner.elemental.statblock/knight-of-blood: 16 | 16',
        'mcdm.summoner.v1/monster.minion.summoner.elemental.statblock/light-of-the-sun: 17 | 17',
        'mcdm.summoner.v1/monster.minion.summoner.elemental.statblock/principle-of-the-swamp: 5 | 5 | 5',
        'mcdm.summoner.v1/monster.minion.summoner.elemental.statblock/quiet-of-snow: 4 | 4 | 4',
        'mcdm.summoner.v1/monster.minion.summoner.fey.statblock/nixie-corallia: 17 | 17',
        'mcdm.summoner.v1/monster.minion.summoner.fey.statblock/nixie-hemloche: 4 | 4 | 4',
        'mcdm.summoner.v1/monster.minion.summoner.fey.statblock/pixie-belladonix: 16 | 16',
        'mcdm.summoner.v1/monster.minion.summoner.fey.statblock/pixie-hydrain: 5 | 5',
        'mcdm.summoner.v1/monster.minion.summoner.fey.statblock/pixie-loftlilly: 5 | 5',
        'mcdm.summoner.v1/monster.minion.summoner.fey.statblock/pixie-rosenthall: 5 | 5 | 5',
        'mcdm.summoner.v1/monster.minion.summoner.fey.statblock/sprite-foxglow: 5 | 5 | 5',
        'mcdm.summoner.v1/monster.minion.summoner.fey.statblock/sprite-olyender: 17 | 17',
        'mcdm.summoner.v1/monster.minion.summoner.fey.statblock/sprite-orchiguard: 8 | 8',
        'mcdm.summoner.v1/monster.minion.summoner.undead.statblock/accursed-mummy: 4 | 4 | 4',
        'mcdm.summoner.v1/monster.minion.summoner.undead.statblock/ceaseless-mournling: 4 | 4 | 4',
        'mcdm.summoner.v1/monster.minion.summoner.undead.statblock/false-vampire: 17 | 17',
        'mcdm.summoner.v1/monster.minion.summoner.undead.statblock/grave-knight: 6 | 6',
        'mcdm.summoner.v1/monster.minion.summoner.undead.statblock/phantom-of-the-ripper: 17 | 17',
        'mcdm.summoner.v1/monster.minion.summoner.undead.statblock/phase-ghoul: 5 | 5 | 5',
        'mcdm.summoner.v1/monster.minion.summoner.undead.statblock/stalker-shade: 6 | 6',
        'mcdm.summoner.v1/monster.minion.summoner.undead.statblock/zombie-lumberer: 8 | 8',
        'mcdm.summoner.v1/monster.retainer.summoner.minion.statblock/gorrre: 27 | 27',
        'mcdm.summoner.v1/monster.retainer.summoner.minion.statblock/violent: 7 | 7 | 7',
        'mcdm.summoner.v1/monster.rival.1st-echelon.summoner.minion.statblock/accursed-mummy: 4 | 4 | 4',
        'mcdm.summoner.v1/monster.rival.1st-echelon.summoner.minion.statblock/zombie-lumberer: 8 | 8',
        'mcdm.summoner.v1/monster.rival.2nd-echelon.summoner.minion.statblock/ceaseless-mournling: 6 | 6 | 6',
        'mcdm.summoner.v1/monster.rival.2nd-echelon.summoner.minion.statblock/grave-knight: 9 | 9',
        'mcdm.summoner.v1/monster.rival.3rd-echelon.summoner.minion.statblock/ceaseless-mournling: 8 | 8 | 8',
        'mcdm.summoner.v1/monster.rival.3rd-echelon.summoner.minion.statblock/false-vampire: 22 | 22',
        'mcdm.summoner.v1/monster.rival.3rd-echelon.summoner.minion.statblock/zombie-lumberer: 14 | 14',
        'mcdm.summoner.v1/monster.rival.4th-echelon.summoner.minion.statblock/ceaseless-mournling: 10 | 10 | 10',
        'mcdm.summoner.v1/monster.rival.4th-echelon.summoner.minion.statblock/grave-knight: 15 | 15',
      ]);
    });
  },
);
