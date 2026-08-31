/**
 * character-builder-extract.ts — Forge Steel choice-point extraction
 * (ruling R-L, step 1 of the character-builder build order; DEC-0014).
 *
 * Usage (from the repo root):
 *   pnpm --filter @engarde/canon exec tsx scripts/character-builder-extract.ts
 *
 * Optional env:
 *   FORGESTEEL_ROOT — path to the read-only Forge Steel checkout
 *                     (default: /srv/presidium/projects/ironyard-v2/code/.reference/forgesteel,
 *                     pinned commit 01672c1).
 *
 * What it does: evaluates Forge Steel's official sourcebook data modules
 * in-process (via the resolution hooks in character-builder-extract-hooks.ts —
 * the checkout is never modified) and writes a normalized, prose-free dump of
 * every hero-builder element and feature row to
 * .artifacts/canon/character-builder/fs-extract.json.
 *
 * DEC-0014 / licensing discipline: the dump carries Forge Steel ids, names,
 * FeatureType tags and choice-shape fields (count, selectAt, option/selected
 * labels, nesting) ONLY. Descriptions, rule prose, stat payloads, power-roll
 * tiers and damage numbers are all dropped at normalization time. FS ids are
 * labels, never keys.
 *
 * Output is deterministic: module evaluation order is fixed, the one
 * nondeterministic source (Utils.guid) is stubbed to a constant marker, and
 * serialization is plain JSON.stringify. Re-runs are byte-identical.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { register } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
register(pathToFileURL(join(here, 'character-builder-extract-hooks.ts')).href);

const FORGESTEEL_ROOT =
  process.env.FORGESTEEL_ROOT ?? '/srv/presidium/projects/ironyard-v2/code/.reference/forgesteel';
const OUTPUT_DIR = join(here, '..', '..', '..', '.artifacts', 'canon', 'character-builder');
const OUTPUT_FILE = join(OUTPUT_DIR, 'fs-extract.json');

const FORGESTEEL_COMMIT = '01672c19b0b208d48f0f44d074dec4b66e9e6911';

type Rec = Record<string, unknown>;

function isRecord(value: unknown): value is Rec {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Feature normalization — structural shape only, never prose.
// ---------------------------------------------------------------------------

let featureTypeValues: Set<string>;

function isFeatureLike(value: unknown): value is Rec {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    featureTypeValues.has(value.type) &&
    'id' in value &&
    'data' in value
  );
}

/** Scalar choice-shape fields copied verbatim from a feature's data payload. */
const SCALAR_KEYS = [
  'count',
  'selectAt',
  'minLevel',
  'echelon',
  'level',
  'cost',
  'characteristic',
  'field',
  'tag',
  'switch',
  'knownSkillsOnly',
  'repeatable',
  'category',
  'canBeNegative',
  'classID',
] as const;

/** String-array filter fields copied verbatim. */
const STRING_ARRAY_KEYS = [
  'replacesTags',
  'types',
  'lists',
  'listOptions',
  'allowedTypes',
] as const;

/** data fields holding a single nested feature. */
const NESTED_FEATURE_KEYS = [
  'feature',
  'featureChecked',
  'featureUnchecked',
  'defaultOption',
] as const;

/** data fields holding an array of nested features. */
const NESTED_FEATURE_ARRAY_KEYS = ['features', 'minionFeatures'] as const;

function labelOf(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (isRecord(value) && typeof value.name === 'string') return value.name;
  return null;
}

interface NormalizedFeature {
  fsId: string;
  name: string;
  featureType: string;
  [key: string]: unknown;
}

function normalizeFeature(feature: Rec): NormalizedFeature {
  const out: NormalizedFeature = {
    fsId: String(feature.id ?? ''),
    name: String(feature.name ?? ''),
    featureType: String(feature.type ?? ''),
  };
  const data = feature.data;
  if (!isRecord(data)) return out;

  for (const key of SCALAR_KEYS) {
    const value = data[key];
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
      out[key] = value;
    }
  }
  for (const key of STRING_ARRAY_KEYS) {
    const value = data[key];
    if (Array.isArray(value) && value.length > 0)
      out[key] = value.map((v) => labelOf(v) ?? String(v));
  }
  for (const key of NESTED_FEATURE_KEYS) {
    const value = data[key];
    if (isFeatureLike(value)) out[key] = normalizeFeature(value);
  }
  for (const key of NESTED_FEATURE_ARRAY_KEYS) {
    const value = data[key];
    if (Array.isArray(value) && value.length > 0) {
      out[key] = value.filter(isFeatureLike).map(normalizeFeature);
    }
  }

  // Heroic resource typing (heroic vs epic) — data.type shadows feature.type.
  if (typeof data.type === 'string') out.resourceType = data.type;

  // Options: string pools stay as-is; element/feature pools become labels
  // (with nested feature shape for Choice/SwitchOptions point-buy options).
  const options = data.options;
  if (Array.isArray(options) && options.length > 0) {
    out.options = options.map((option) => {
      if (typeof option === 'string') return option;
      if (isRecord(option) && isFeatureLike(option.feature)) {
        const entry: Rec = { feature: normalizeFeature(option.feature as Rec) };
        if (option.value !== undefined) entry.value = option.value;
        return entry;
      }
      if (isFeatureLike(option)) return { feature: normalizeFeature(option) };
      return labelOf(option) ?? '(unlabelled option)';
    });
  }

  // Selections: pre-filled answers baked into the definition data (R-A).
  const selected = data.selected;
  if (Array.isArray(selected) && selected.length > 0) {
    out.selected = selected.map((entry) => labelOf(entry) ?? '(unlabelled selection)');
  } else if (isRecord(selected)) {
    out.selected = [labelOf(selected) ?? '(unlabelled selection)'];
  }
  const selectedIDs = data.selectedIDs;
  if (Array.isArray(selectedIDs) && selectedIDs.length > 0) out.selectedIDs = selectedIDs;

  // ClassAbility legal-pool mask (R-I context).
  if (isRecord(data.source)) {
    const source: Rec = {};
    for (const [key, value] of Object.entries(data.source)) {
      if (typeof value === 'boolean' || typeof value === 'string') source[key] = value;
    }
    if (Object.keys(source).length > 0) out.source = source;
  }

  // Granted ability / nested entities: label only.
  if (isRecord(data.ability)) {
    out.ability = { fsId: data.ability.id ?? null, name: labelOf(data.ability) };
  }
  if (Array.isArray(data.summons) && data.summons.length > 0) {
    out.summons = data.summons.map((s) => labelOf(s) ?? '(unlabelled summon)');
  }
  // HeroicResourceThreshold nested feature is covered by NESTED_FEATURE_KEYS;
  // HeroicResource thresholds carry nested features worth keeping as labels.
  if (Array.isArray(data.thresholds) && data.thresholds.length > 0) {
    out.thresholds = data.thresholds.filter(isRecord).map((t) => ({
      resource: t.resource ?? null,
      value: t.value ?? null,
      level: t.level ?? null,
    }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Element normalization.
// ---------------------------------------------------------------------------

interface ElementRow {
  sourcebook: string;
  collection: string;
  fsId: string | null;
  name: string;
  [key: string]: unknown;
}

function normalizeFeatures(features: unknown): NormalizedFeature[] {
  if (!Array.isArray(features)) return [];
  return features.filter(isFeatureLike).map(normalizeFeature);
}

function normalizeFeaturesByLevel(
  featuresByLevel: unknown,
): { level: number; features: NormalizedFeature[] }[] {
  if (!Array.isArray(featuresByLevel)) return [];
  return featuresByLevel.filter(isRecord).map((entry) => ({
    level: Number(entry.level),
    features: normalizeFeatures(entry.features),
  }));
}

function abilityLabels(abilities: unknown): Rec[] {
  if (!Array.isArray(abilities)) return [];
  return abilities.filter(isRecord).map((ability) => ({
    fsId: ability.id ?? null,
    name: labelOf(ability),
    cost:
      typeof ability.cost === 'number' || typeof ability.cost === 'string' ? ability.cost : null,
  }));
}

function element(sourcebook: string, collection: string, source: Rec, extra: Rec): ElementRow {
  return {
    sourcebook,
    collection,
    fsId: typeof source.id === 'string' ? source.id : null,
    name: String(source.name ?? ''),
    ...extra,
  };
}

async function main(): Promise<void> {
  const featureTypeModule = (await import('@/enums/feature-type')) as {
    FeatureType: Record<string, string>;
  };
  featureTypeValues = new Set(Object.values(featureTypeModule.FeatureType));

  const load = async (relative: string, exportName: string): Promise<Rec> => {
    const url = pathToFileURL(join(FORGESTEEL_ROOT, relative)).href;
    const module = (await import(url)) as Rec;
    const value = module[exportName];
    if (!isRecord(value))
      throw new Error(`${relative}#${exportName} did not evaluate to an object`);
    return value;
  };

  const sourcebooks: [string, Rec][] = [
    ['core', await load('src/data/sourcebooks/official/core.ts', 'core')],
    ['orden', await load('src/data/sourcebooks/official/orden.ts', 'orden')],
    [
      'beastheart',
      await load('src/data/sourcebooks/official/beastheart.ts', 'beastheartSourcebook'),
    ],
    ['summoner', await load('src/data/sourcebooks/official/summoner.ts', 'summonerSourcebook')],
  ];

  // Culture axis option pools (the 13 canon culture records live here, not in
  // the sourcebooks' preset-culture lists).
  const cultureData = (await import('@/data/culture-data')) as Rec;

  const rows: ElementRow[] = [];
  const skipped: Record<string, Record<string, number>> = {};

  const HERO_BUILDER_COLLECTIONS = new Set([
    'ancestries',
    'careers',
    'classes',
    'complications',
    'cultures',
    'domains',
    'imbuements',
    'items',
    'kits',
    'languages',
    'perks',
    'skills',
    'subclasses',
    'titles',
  ]);

  for (const [bookName, book] of sourcebooks) {
    // Account for what we deliberately do NOT extract (Director-side and
    // non-builder content) so nothing is silently dropped.
    for (const [key, value] of Object.entries(book)) {
      if (Array.isArray(value) && !HERO_BUILDER_COLLECTIONS.has(key) && value.length > 0) {
        skipped[bookName] = skipped[bookName] ?? {};
        skipped[bookName][key] = value.length;
      }
    }

    for (const ancestry of (book.ancestries as Rec[]) ?? []) {
      rows.push(
        element(bookName, 'ancestry', ancestry, {
          ancestryPoints: ancestry.ancestryPoints ?? null,
          features: normalizeFeatures(ancestry.features),
        }),
      );
    }

    for (const career of (book.careers as Rec[]) ?? []) {
      const inciting = isRecord(career.incitingIncidents) ? career.incitingIncidents.options : [];
      rows.push(
        element(bookName, 'career', career, {
          features: normalizeFeatures(career.features),
          incitingIncidents: Array.isArray(inciting)
            ? inciting
                .filter(isRecord)
                .map((option) => ({ fsId: option.id ?? null, name: labelOf(option) }))
            : [],
        }),
      );
    }

    for (const heroClass of (book.classes as Rec[]) ?? []) {
      rows.push(
        element(bookName, 'class', heroClass, {
          subclassName: heroClass.subclassName ?? null,
          subclassCount: heroClass.subclassCount ?? null,
          primaryCharacteristicsOptions: heroClass.primaryCharacteristicsOptions ?? [],
          featuresByLevel: normalizeFeaturesByLevel(heroClass.featuresByLevel),
          abilities: abilityLabels(heroClass.abilities),
          subclasses: ((heroClass.subclasses as Rec[]) ?? []).map((subclass) => ({
            fsId: subclass.id ?? null,
            name: labelOf(subclass),
            featuresByLevel: normalizeFeaturesByLevel(subclass.featuresByLevel),
            abilities: abilityLabels(subclass.abilities),
          })),
        }),
      );
    }

    for (const complication of (book.complications as Rec[]) ?? []) {
      rows.push(
        element(bookName, 'complication', complication, {
          features: normalizeFeatures(complication.features),
        }),
      );
    }

    for (const culture of (book.cultures as Rec[]) ?? []) {
      rows.push(
        element(bookName, 'culture', culture, {
          cultureType: culture.type ?? null,
          language: isFeatureLike(culture.language) ? normalizeFeature(culture.language) : null,
          environment: isFeatureLike(culture.environment)
            ? normalizeFeature(culture.environment)
            : null,
          organization: isFeatureLike(culture.organization)
            ? normalizeFeature(culture.organization)
            : null,
          upbringing: isFeatureLike(culture.upbringing)
            ? normalizeFeature(culture.upbringing)
            : null,
        }),
      );
    }

    for (const domain of (book.domains as Rec[]) ?? []) {
      rows.push(
        element(bookName, 'domain', domain, {
          featuresByLevel: normalizeFeaturesByLevel(domain.featuresByLevel),
          defaultFeatures: normalizeFeatures(domain.defaultFeatures),
          resourceGainTags: Array.isArray(domain.resourceGains)
            ? domain.resourceGains.filter(isRecord).map((gain) => gain.tag ?? null)
            : [],
        }),
      );
    }

    for (const imbuement of (book.imbuements as Rec[]) ?? []) {
      rows.push(
        element(bookName, 'imbuement', imbuement, {
          itemType: imbuement.type ?? null,
          level: imbuement.level ?? null,
          feature: isFeatureLike(imbuement.feature) ? normalizeFeature(imbuement.feature) : null,
        }),
      );
    }

    for (const item of (book.items as Rec[]) ?? []) {
      rows.push(
        element(bookName, 'item', item, {
          itemType: item.type ?? null,
          featuresByLevel: normalizeFeaturesByLevel(item.featuresByLevel),
        }),
      );
    }

    for (const kit of (book.kits as Rec[]) ?? []) {
      rows.push(
        element(bookName, 'kit', kit, {
          kitType: kit.type ?? null,
          features: normalizeFeatures(kit.features),
        }),
      );
    }

    for (const language of (book.languages as Rec[]) ?? []) {
      rows.push(
        element(bookName, 'language', language, {
          languageType: language.type ?? null,
        }),
      );
    }

    for (const perk of (book.perks as Rec[]) ?? []) {
      // A Forge Steel perk IS a feature carrying a list tag.
      rows.push(
        element(bookName, 'perk', perk, {
          list: perk.list ?? null,
          feature: normalizeFeature(perk),
        }),
      );
    }

    for (const skill of (book.skills as Rec[]) ?? []) {
      rows.push(
        element(bookName, 'skill', skill, {
          list: skill.list ?? null,
        }),
      );
    }

    for (const subclass of (book.subclasses as Rec[]) ?? []) {
      rows.push(
        element(bookName, 'subclass', subclass, {
          classID: subclass.classID ?? null,
          featuresByLevel: normalizeFeaturesByLevel(subclass.featuresByLevel),
        }),
      );
    }

    for (const title of (book.titles as Rec[]) ?? []) {
      rows.push(
        element(bookName, 'title', title, {
          echelon: title.echelon ?? null,
          features: normalizeFeatures(title.features),
        }),
      );
    }
  }

  // Culture axis pools — one row per axis option, mirroring the pin's 13
  // culture records (environment / organization / upbringing).
  const axes: [string, string][] = [
    ['environment', 'EnvironmentData'],
    ['organization', 'OrganizationData'],
    ['upbringing', 'UpbringingData'],
  ];
  for (const [axis, className] of axes) {
    const pool = cultureData[className];
    if (!isRecord(pool) && typeof pool !== 'function')
      throw new Error(`culture-data.${className} missing`);
    const entries = Object.entries(pool as Rec).filter(([, value]) => isFeatureLike(value));
    for (const [key, value] of entries) {
      const feature = value as Rec;
      rows.push({
        sourcebook: 'core',
        collection: 'culture-axis',
        fsId: typeof feature.id === 'string' ? feature.id : key,
        name: String(feature.name ?? key),
        axis,
        feature: normalizeFeature(feature),
      });
    }
  }

  const output = {
    _provenance: {
      generator: 'packages/canon/scripts/character-builder-extract.ts',
      source: 'Forge Steel (github.com/andyaiken/forgesteel, GPL-3.0)',
      commit: FORGESTEEL_COMMIT,
      note:
        'Choice-point structure only (ids, names, FeatureType, counts, selectAt, option/selection labels). ' +
        'No Forge Steel descriptions, rule prose, or stat payloads are carried (DEC-0014). ' +
        'FS ids are labels, never keys (R-L).',
    },
    skippedCollections: skipped,
    rows,
  };

  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(OUTPUT_FILE, `${JSON.stringify(output, null, 1)}\n`);
  console.log(`fs-extract: ${rows.length} element rows -> ${OUTPUT_FILE}`);
  const byCollection = new Map<string, number>();
  for (const row of rows)
    byCollection.set(row.collection, (byCollection.get(row.collection) ?? 0) + 1);
  for (const [collection, count] of [...byCollection.entries()].sort()) {
    console.log(`  ${collection}: ${count}`);
  }
}

await main();
