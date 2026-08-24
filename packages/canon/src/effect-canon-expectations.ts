import type { EffectResolution } from '@engarde/engine';

/**
 * Channel-2 golden expectations for the only automatic `Effect:` forms in
 * the accepted Heroes/Monsters corpus. This file is deliberately declarative
 * and is not imported by the production grammar/compiler. Every identity,
 * source payload, UTF-8 span, and semantic outcome was reviewed against the
 * pinned bundle inventory independently of parser output.
 */

export const EFFECT_CANON_PIN = '520553438a4e8d199bfaaf676b8aa9bd273f4d61';

export interface AutomaticEffectCanonExpectation {
  artifactId: string;
  effectOrdinal: number;
  sourcePath: string;
  sourceSpan: { byteStart: number; byteEnd: number };
  sourceText: string;
  targetsText: string;
  resolution: Exclude<EffectResolution, { kind: 'table' }>;
}

export const AUTOMATIC_EFFECT_CANON_EXPECTATIONS = [
  {
    artifactId: 'mcdm.heroes.v1/feature.ability.shining-armor/protective-attack',
    effectOrdinal: 1,
    sourcePath: 'en/books/heroes/md/feature/ability/shining-armor/protective-attack.md',
    sourceSpan: { byteStart: 641, byteEnd: 794 },
    sourceText:
      'The target is [taunted](scc.v1:mcdm.heroes.v1/condition/taunted) until the end of their next [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn).',
    targetsText: 'One creature',
    resolution: {
      kind: 'condition',
      conditionId: 'mcdm.heroes.v1/condition/taunted',
      ending: { kind: 'end-of-targets-next-turn' },
      replacesOnNewSource: true,
    },
  },
  {
    artifactId: 'mcdm.heroes.v1/kit/shining-armor',
    effectOrdinal: 1,
    sourcePath: 'en/books/heroes/md/kit/shining-armor.md',
    sourceSpan: { byteStart: 1444, byteEnd: 1597 },
    sourceText:
      'The target is [taunted](scc.v1:mcdm.heroes.v1/condition/taunted) until the end of their next [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn).',
    targetsText: 'One creature',
    resolution: {
      kind: 'condition',
      conditionId: 'mcdm.heroes.v1/condition/taunted',
      ending: { kind: 'end-of-targets-next-turn' },
      replacesOnNewSource: true,
    },
  },
  {
    artifactId: 'mcdm.heroes.v1/project/imbue-treasure',
    effectOrdinal: 1,
    sourcePath: 'en/books/heroes/md/project/imbue-treasure.md',
    sourceSpan: { byteStart: 10474, byteEnd: 10515 },
    sourceText: 'The target takes 5 damage.',
    targetsText: 'One enemy',
    resolution: { kind: 'damage', amount: 5, damageType: null },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.bugbear.statblock/bugbear-channeler',
    effectOrdinal: 5,
    sourcePath: 'en/books/monsters/md/monster/bugbear/statblock/bugbear-channeler.md',
    sourceSpan: { byteStart: 3593, byteEnd: 3690 },
    sourceText:
      'The target is [grabbed](scc.v1:mcdm.heroes.v1/condition/grabbed) by the channeler.',
    targetsText: 'The triggering creature or object',
    resolution: {
      kind: 'condition',
      conditionId: 'mcdm.heroes.v1/condition/grabbed',
      ending: { kind: 'external' },
      replacesOnNewSource: false,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.bugbear.statblock/bugbear-commander',
    effectOrdinal: 5,
    sourcePath: 'en/books/monsters/md/monster/bugbear/statblock/bugbear-commander.md',
    sourceSpan: { byteStart: 2957, byteEnd: 3054 },
    sourceText:
      'The target is [grabbed](scc.v1:mcdm.heroes.v1/condition/grabbed) by the commander.',
    targetsText: 'The triggering creature or object',
    resolution: {
      kind: 'condition',
      conditionId: 'mcdm.heroes.v1/condition/grabbed',
      ending: { kind: 'external' },
      replacesOnNewSource: false,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.bugbear.statblock/bugbear-roughneck',
    effectOrdinal: 4,
    sourcePath: 'en/books/monsters/md/monster/bugbear/statblock/bugbear-roughneck.md',
    sourceSpan: { byteStart: 3943, byteEnd: 4040 },
    sourceText:
      'The target is [grabbed](scc.v1:mcdm.heroes.v1/condition/grabbed) by the roughneck.',
    targetsText: 'The triggering creature or object',
    resolution: {
      kind: 'condition',
      conditionId: 'mcdm.heroes.v1/condition/grabbed',
      ending: { kind: 'external' },
      replacesOnNewSource: false,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.bugbear.statblock/bugbear-sneak',
    effectOrdinal: 5,
    sourcePath: 'en/books/monsters/md/monster/bugbear/statblock/bugbear-sneak.md',
    sourceSpan: { byteStart: 3791, byteEnd: 3884 },
    sourceText: 'The target is [grabbed](scc.v1:mcdm.heroes.v1/condition/grabbed) by the sneak.',
    targetsText: 'The triggering creature or object',
    resolution: {
      kind: 'condition',
      conditionId: 'mcdm.heroes.v1/condition/grabbed',
      ending: { kind: 'external' },
      replacesOnNewSource: false,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.elemental.statblock/essence-of-storms',
    effectOrdinal: 3,
    sourcePath: 'en/books/monsters/md/monster/elemental/statblock/essence-of-storms.md',
    sourceSpan: { byteStart: 2377, byteEnd: 2428 },
    sourceText: 'The target takes 5 lightning damage.',
    targetsText: 'The triggering creature',
    resolution: { kind: 'damage', amount: 5, damageType: 'lightning' },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.elf-wode.statblock/wode-elf-sentry',
    effectOrdinal: 2,
    sourcePath: 'en/books/monsters/md/monster/elf-wode/statblock/wode-elf-sentry.md',
    sourceSpan: { byteStart: 1399, byteEnd: 1441 },
    sourceText: 'Each target takes 3 damage.',
    targetsText: 'Each marked enemy',
    resolution: { kind: 'damage', amount: 3, damageType: null },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.retainer.statblock/bugbear-commando',
    effectOrdinal: 3,
    sourcePath: 'en/books/monsters/md/monster/retainer/statblock/bugbear-commando.md',
    sourceSpan: { byteStart: 2173, byteEnd: 2269 },
    sourceText: 'The target is [grabbed](scc.v1:mcdm.heroes.v1/condition/grabbed) by the commando.',
    targetsText: 'The triggering creature or object',
    resolution: {
      kind: 'condition',
      conditionId: 'mcdm.heroes.v1/condition/grabbed',
      ending: { kind: 'external' },
      replacesOnNewSource: false,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.undead.2nd-echelon.statblock/mummy',
    effectOrdinal: 3,
    sourcePath: 'en/books/monsters/md/monster/undead/2nd-echelon/statblock/mummy.md',
    sourceSpan: { byteStart: 2759, byteEnd: 2807 },
    sourceText: 'The target takes 8 poison damage.',
    targetsText: 'The triggering creature',
    resolution: { kind: 'damage', amount: 8, damageType: 'poison' },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.war-dog.4th-echelon.statblock/soulbinder-psyche',
    effectOrdinal: 6,
    sourcePath: 'en/books/monsters/md/monster/war-dog/4th-echelon/statblock/soulbinder-psyche.md',
    sourceSpan: { byteStart: 4956, byteEnd: 5006 },
    sourceText: 'The target takes 10 psychic damage.',
    targetsText: 'One creature or object',
    resolution: { kind: 'damage', amount: 10, damageType: 'psychic' },
  },
] as const satisfies readonly AutomaticEffectCanonExpectation[];
