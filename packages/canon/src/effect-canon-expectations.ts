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

/**
 * Channel-2 golden expectations for the 29 characteristic-test Effect lines
 * [R-0006..R-0011]. Generated by an INDEPENDENT raw physical-line scanner
 * over the pinned bundles (separate minimal payload reader, not the
 * production grammar), cross-verified field-by-field against production
 * compilation with zero mismatches, then frozen (2026-08-25). 29 lines /
 * 87 attached bullets: 21 automatic, 66 verbatim.
 */
export interface TestEffectCanonExpectation {
  artifactId: string;
  effectOrdinal: number;
  sourcePath: string;
  sourceSpan: { byteStart: number; byteEnd: number };
  sourceText: string;
  targetsText: string | null;
  resolution: Extract<EffectResolution, { kind: 'test' }>;
}

export const TEST_EFFECT_CANON_EXPECTATIONS: TestEffectCanonExpectation[] = [
  {
    artifactId:
      'mcdm.monsters.v1/monster.count-rhodar-von-glauer.statblock/count-rhodar-von-glauer',
    effectOrdinal: 2,
    sourcePath:
      'en/books/monsters/md/monster/count-rhodar-von-glauer/statblock/count-rhodar-von-glauer.md',
    sourceSpan: {
      byteStart: 2822,
      byteEnd: 2873,
    },
    sourceText: 'Each target makes an Intuition test.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'test',
      characteristic: 'intuition',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 16,
              characteristicOptions: [],
              typeOptions: ['corruption'],
            },
            potency: null,
            conditionIds: ['mcdm.heroes.v1/condition/frightened'],
            ending: 'save-ends',
          },
          sourceText:
            '> - **≤11:** 16 corruption damage; [frightened](scc.v1:mcdm.heroes.v1/condition/frightened) (save ends)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText:
            '> - **12-16:** 13 corruption damage; [frightened](scc.v1:mcdm.heroes.v1/condition/frightened) (EoT)',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 8,
              characteristicOptions: [],
              typeOptions: ['corruption'],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 8 corruption damage',
        },
      },
    },
  },
  {
    artifactId:
      'mcdm.monsters.v1/monster.count-rhodar-von-glauer.statblock/count-rhodar-von-glauer',
    effectOrdinal: 8,
    sourcePath:
      'en/books/monsters/md/monster/count-rhodar-von-glauer/statblock/count-rhodar-von-glauer.md',
    sourceSpan: {
      byteStart: 7598,
      byteEnd: 7647,
    },
    sourceText: 'Each target makes a Presence test.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'test',
      characteristic: 'presence',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText:
            '> - **≤11:** 16 corruption damage; the target is [bleeding](scc.v1:mcdm.heroes.v1/condition/bleeding) until the end of the encounter',
        },
        tier2: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 13,
              characteristicOptions: [],
              typeOptions: ['corruption'],
            },
            potency: null,
            conditionIds: ['mcdm.heroes.v1/condition/bleeding'],
            ending: 'save-ends',
          },
          sourceText:
            '> - **12-16:** 13 corruption damage; [bleeding](scc.v1:mcdm.heroes.v1/condition/bleeding) (save ends)',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 8,
              characteristicOptions: [],
              typeOptions: ['corruption'],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 8 corruption damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.devil.statblock/devil-adjudicator',
    effectOrdinal: 2,
    sourcePath: 'en/books/monsters/md/monster/devil/statblock/devil-adjudicator.md',
    sourceSpan: {
      byteStart: 1594,
      byteEnd: 1642,
    },
    sourceText: 'The target makes a Presence test.',
    targetsText: 'One creature',
    resolution: {
      kind: 'test',
      characteristic: 'presence',
      subject: 'the-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText:
            "> - **≤11:** The target is [slowed](scc.v1:mcdm.heroes.v1/condition/slowed), takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on power rolls, and can't regain [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina) (save ends).",
        },
        tier2: {
          kind: 'verbatim',
          sourceText:
            '> - **12-16:** The target is [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) and takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on power rolls (save ends).',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: null,
            potency: null,
            conditionIds: ['mcdm.heroes.v1/condition/slowed'],
            ending: 'save-ends',
          },
          sourceText: '> - **17+:** [Slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.devil.statblock/devil-adjudicator',
    effectOrdinal: 4,
    sourcePath: 'en/books/monsters/md/monster/devil/statblock/devil-adjudicator.md',
    sourceSpan: {
      byteStart: 2930,
      byteEnd: 2978,
    },
    sourceText: 'The target makes a Presence test.',
    targetsText: 'The triggering creature',
    resolution: {
      kind: 'test',
      characteristic: 'presence',
      subject: 'the-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** The adjudicator chooses a new target for the strike.',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** The adjudicator halves the triggering damage.',
        },
        tier3: {
          kind: 'verbatim',
          sourceText:
            '> - **17+:** The target takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on the strike.',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.devil.statblock/devil-high-judge',
    effectOrdinal: 2,
    sourcePath: 'en/books/monsters/md/monster/devil/statblock/devil-high-judge.md',
    sourceSpan: {
      byteStart: 2360,
      byteEnd: 2412,
    },
    sourceText: 'The target makes a **Presence test**.',
    targetsText: 'The triggering creature',
    resolution: {
      kind: 'test',
      characteristic: 'presence',
      subject: 'the-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** The target is charmed (save ends).',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** The high judge chooses a new target for the strike.',
        },
        tier3: {
          kind: 'verbatim',
          sourceText:
            '> - **17+:** The target takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on the strike.',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.devil.statblock/devil-high-judge',
    effectOrdinal: 3,
    sourcePath: 'en/books/monsters/md/monster/devil/statblock/devil-high-judge.md',
    sourceSpan: {
      byteStart: 3689,
      byteEnd: 3741,
    },
    sourceText: 'The target makes a **Presence test**.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'test',
      characteristic: 'presence',
      subject: 'the-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** 15 psychic damage; the target is charmed (save ends)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** 12 psychic damage; the target is charmed (save ends)',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 7,
              characteristicOptions: [],
              typeOptions: ['psychic'],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 7 psychic damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.devil.statblock/devil-jurist',
    effectOrdinal: 4,
    sourcePath: 'en/books/monsters/md/monster/devil/statblock/devil-jurist.md',
    sourceSpan: {
      byteStart: 2691,
      byteEnd: 2739,
    },
    sourceText: 'The target makes a Presence test.',
    targetsText: 'The triggering creature',
    resolution: {
      kind: 'test',
      characteristic: 'presence',
      subject: 'the-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** The jurist chooses a new target for the strike.',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** The jurist halves the triggering damage.',
        },
        tier3: {
          kind: 'verbatim',
          sourceText:
            '> - **17+:** The target takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on the strike.',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.devil.statblock/devil-legate',
    effectOrdinal: 4,
    sourcePath: 'en/books/monsters/md/monster/devil/statblock/devil-legate.md',
    sourceSpan: {
      byteStart: 3027,
      byteEnd: 3075,
    },
    sourceText: 'The target makes a Presence test.',
    targetsText: 'The triggering creature',
    resolution: {
      kind: 'test',
      characteristic: 'presence',
      subject: 'the-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** The legate chooses a new target for the strike.',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** The legate halves the triggering damage.',
        },
        tier3: {
          kind: 'verbatim',
          sourceText:
            '> - **17+:** The target takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on the strike.',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.devil.statblock/devil-magistrate',
    effectOrdinal: 4,
    sourcePath: 'en/books/monsters/md/monster/devil/statblock/devil-magistrate.md',
    sourceSpan: {
      byteStart: 2533,
      byteEnd: 2581,
    },
    sourceText: 'The target makes a Presence test.',
    targetsText: 'The triggering creature',
    resolution: {
      kind: 'test',
      characteristic: 'presence',
      subject: 'the-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** The magistrate chooses a new target for the strike.',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** The magistrate halves the triggering damage.',
        },
        tier3: {
          kind: 'verbatim',
          sourceText:
            '> - **17+:** The target takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on the strike.',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.dragon.statblock/crucible-dragon',
    effectOrdinal: 1,
    sourcePath: 'en/books/monsters/md/monster/dragon/statblock/crucible-dragon.md',
    sourceSpan: {
      byteStart: 1756,
      byteEnd: 1805,
    },
    sourceText: 'Each target makes an Agility test.',
    targetsText: 'Each creature and object in the area',
    resolution: {
      kind: 'test',
      characteristic: 'agility',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** 13 fire damage; the target is slagged (save ends)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** 10 fire damage; the target is slagged (save ends)',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 6,
              characteristicOptions: [],
              typeOptions: ['fire'],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 6 fire damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.dragon.statblock/crucible-dragon',
    effectOrdinal: 6,
    sourcePath: 'en/books/monsters/md/monster/dragon/statblock/crucible-dragon.md',
    sourceSpan: {
      byteStart: 6579,
      byteEnd: 6629,
    },
    sourceText: 'Each target makes a **Might test**.',
    targetsText: 'Each creature and object in the area',
    resolution: {
      kind: 'test',
      characteristic: 'might',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** 16 damage; pull 10 or push 10',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** 13 damage; pull 8 or push 8',
        },
        tier3: {
          kind: 'verbatim',
          sourceText: '> - **17+:** 7 damage; pull 5 or push 5.',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.dragon.statblock/gloom-dragon',
    effectOrdinal: 1,
    sourcePath: 'en/books/monsters/md/monster/dragon/statblock/gloom-dragon.md',
    sourceSpan: {
      byteStart: 1759,
      byteEnd: 1812,
    },
    sourceText: 'Each target makes an **Agility test**.',
    targetsText: 'Each enemy and object in the area',
    resolution: {
      kind: 'test',
      characteristic: 'agility',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** 14 cold damage; the target is dragonsealed (save ends)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** 11 cold damage; the target is dragonsealed (save ends)',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 6,
              characteristicOptions: [],
              typeOptions: ['cold'],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 6 cold damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.dragon.statblock/meteor-dragon',
    effectOrdinal: 1,
    sourcePath: 'en/books/monsters/md/monster/dragon/statblock/meteor-dragon.md',
    sourceSpan: {
      byteStart: 1647,
      byteEnd: 1697,
    },
    sourceText: 'Each target makes a **Might test**.',
    targetsText: 'Each creature and object in the area',
    resolution: {
      kind: 'test',
      characteristic: 'might',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** 20 sonic damage; the target is dragonsealed (save ends)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** 16 sonic damage; the target is dragonsealed (save ends)',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 10,
              characteristicOptions: [],
              typeOptions: ['sonic'],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 10 sonic damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.dragon.statblock/meteor-dragon',
    effectOrdinal: 8,
    sourcePath: 'en/books/monsters/md/monster/dragon/statblock/meteor-dragon.md',
    sourceSpan: {
      byteStart: 7009,
      byteEnd: 7058,
    },
    sourceText: 'Each target makes an Agility test.',
    targetsText: 'Each enemy and object in the area',
    resolution: {
      kind: 'test',
      characteristic: 'agility',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** 25 damage; I < 6 the target is annihilated',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** 21 damage; I < 5 the target is annihilated',
        },
        tier3: {
          kind: 'verbatim',
          sourceText: '> - **17+:** 15 damage; I < 4 the target is annihilated',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.dragon.statblock/omen-dragon',
    effectOrdinal: 1,
    sourcePath: 'en/books/monsters/md/monster/dragon/statblock/omen-dragon.md',
    sourceSpan: {
      byteStart: 2323,
      byteEnd: 2376,
    },
    sourceText: 'Each target makes an **Agility test**.',
    targetsText: 'Each creature and object in the area',
    resolution: {
      kind: 'test',
      characteristic: 'agility',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** 18 corruption damage; the target is dragonsealed (save ends)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** 14 corruption damage; the target is dragonsealed (save ends)',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 9,
              characteristicOptions: [],
              typeOptions: ['corruption'],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 9 corruption damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.dragon.statblock/thorn-dragon',
    effectOrdinal: 1,
    sourcePath: 'en/books/monsters/md/monster/dragon/statblock/thorn-dragon.md',
    sourceSpan: {
      byteStart: 1779,
      byteEnd: 1829,
    },
    sourceText: 'Each target makes a **Might test**.',
    targetsText: 'Each enemy and object in the area',
    resolution: {
      kind: 'test',
      characteristic: 'might',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** 12 poison damage; the target is dragonsealed (save ends)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** 9 poison damage; the target is dragonsealed (save ends)',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 5,
              characteristicOptions: [],
              typeOptions: ['poison'],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 5 poison damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.dwarf/dwarf-malice',
    effectOrdinal: 1,
    sourcePath: 'en/books/monsters/md/monster/dwarf/dwarf-malice.md',
    sourceSpan: {
      byteStart: 1245,
      byteEnd: 1298,
    },
    sourceText: 'Each target makes an **Agility test**.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'test',
      characteristic: 'agility',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText:
            '> - **≤11:** 8 damage; [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) (EoT)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText:
            '> - **12-16:** 6 damage; [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (EoT)',
        },
        tier3: {
          kind: 'verbatim',
          sourceText: '> - **17+:** No effect.',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.dwarf.statblock/dwarf-trapper',
    effectOrdinal: 2,
    sourcePath: 'en/books/monsters/md/monster/dwarf/statblock/dwarf-trapper.md',
    sourceSpan: {
      byteStart: 1763,
      byteEnd: 1813,
    },
    sourceText: 'Each target makes a **Might test**.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'test',
      characteristic: 'might',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText:
            '> - **≤11:** 7 damage; [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) (EoT)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText:
            '> - **12-16:** 5 damage; [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (EoT)',
        },
        tier3: {
          kind: 'verbatim',
          sourceText: '> - **17+:** No effect.',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.elf-high.statblock/high-elf-ordinator',
    effectOrdinal: 6,
    sourcePath: 'en/books/monsters/md/monster/elf-high/statblock/high-elf-ordinator.md',
    sourceSpan: {
      byteStart: 3666,
      byteEnd: 3719,
    },
    sourceText: 'Each target makes a **Presence test**.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'test',
      characteristic: 'presence',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** 12 corruption damage; pull 5 toward the center of the cube',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** 9 corruption damage; pull 3 toward the center of the cube',
        },
        tier3: {
          kind: 'verbatim',
          sourceText: '> - **17+:** Pull 1 toward the center of the cube',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.fossil-cryptic.statblock/fossil-cryptic',
    effectOrdinal: 6,
    sourcePath: 'en/books/monsters/md/monster/fossil-cryptic/statblock/fossil-cryptic.md',
    sourceSpan: {
      byteStart: 5226,
      byteEnd: 5276,
    },
    sourceText: 'Each target makes a **Might test**.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'test',
      characteristic: 'might',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText:
            "> - **≤11:** [Prone](scc.v1:mcdm.heroes.v1/condition/prone) and can't stand (EoT)",
        },
        tier2: {
          kind: 'automatic',
          data: {
            damage: null,
            potency: null,
            conditionIds: ['mcdm.heroes.v1/condition/prone'],
            ending: null,
          },
          sourceText: '> - **12-16:** [Prone](scc.v1:mcdm.heroes.v1/condition/prone)',
        },
        tier3: {
          kind: 'verbatim',
          sourceText: '> - **17+:** No effect',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.giant.statblock/hill-giant-clobberer',
    effectOrdinal: 5,
    sourcePath: 'en/books/monsters/md/monster/giant/statblock/hill-giant-clobberer.md',
    sourceSpan: {
      byteStart: 3101,
      byteEnd: 3149,
    },
    sourceText: 'The target makes an Agility test.',
    targetsText: 'The triggering creature',
    resolution: {
      kind: 'test',
      characteristic: 'agility',
      subject: 'the-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText:
            '> - **≤11:** [Grabbed](scc.v1:mcdm.heroes.v1/condition/grabbed), and the target takes a bane on the Escape Grab maneuver',
        },
        tier2: {
          kind: 'automatic',
          data: {
            damage: null,
            potency: null,
            conditionIds: ['mcdm.heroes.v1/condition/grabbed'],
            ending: null,
          },
          sourceText: '> - **12-16:** [Grabbed](scc.v1:mcdm.heroes.v1/condition/grabbed)',
        },
        tier3: {
          kind: 'verbatim',
          sourceText: '> - **17+:** No effect',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.hobgoblin.statblock/hobgoblin-smokebinder',
    effectOrdinal: 2,
    sourcePath: 'en/books/monsters/md/monster/hobgoblin/statblock/hobgoblin-smokebinder.md',
    sourceSpan: {
      byteStart: 1595,
      byteEnd: 1641,
    },
    sourceText: 'Each target makes a Might test.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'test',
      characteristic: 'might',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText:
            '> - **≤11:** 11 damage; the target has a double bane on their next power roll',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** 9 damage; the target takes a bane on their next power roll',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 5,
              characteristicOptions: [],
              typeOptions: [],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 5 damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.lich.statblock/lich',
    effectOrdinal: 6,
    sourcePath: 'en/books/monsters/md/monster/lich/statblock/lich.md',
    sourceSpan: {
      byteStart: 7290,
      byteEnd: 7339,
    },
    sourceText: 'Each target makes an Agility test.',
    targetsText: 'Each creature in the area',
    resolution: {
      kind: 'test',
      characteristic: 'agility',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 10,
              characteristicOptions: [],
              typeOptions: ['corruption'],
            },
            potency: null,
            conditionIds: ['mcdm.heroes.v1/condition/restrained'],
            ending: 'save-ends',
          },
          sourceText:
            '> - **≤11:** 10 corruption damage; [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) (save ends)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText:
            '> - **12-16:** 16 corruption damage; [restrained](scc.v1:mcdm.heroes.v1/condition/restrained) (EoT)',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 20,
              characteristicOptions: [],
              typeOptions: ['corruption'],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 20 corruption damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.lord-syuul.statblock/lord-syuul',
    effectOrdinal: 4,
    sourcePath: 'en/books/monsters/md/monster/lord-syuul/statblock/lord-syuul.md',
    sourceSpan: {
      byteStart: 4485,
      byteEnd: 4540,
    },
    sourceText: 'Each target makes an **Intuition test**.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'test',
      characteristic: 'intuition',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText:
            '> - **≤11:** 16 psychic damage; the target has no line of effect to any creature except Lord Syuul, and takes a bane on strikes targeting Lord Syuul (save ends)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText:
            '> - **12-16:** 13 psychic damage; the target has no line of effect to any creature except Lord Syuul (save ends)',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 7,
              characteristicOptions: [],
              typeOptions: ['psychic'],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 7 psychic damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.valok.statblock/servok-miner',
    effectOrdinal: 2,
    sourcePath: 'en/books/monsters/md/monster/valok/statblock/servok-miner.md',
    sourceSpan: {
      byteStart: 1974,
      byteEnd: 2027,
    },
    sourceText: 'Each target makes an **Agility test**.',
    targetsText: 'Each enemy and object in the area',
    resolution: {
      kind: 'test',
      characteristic: 'agility',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText:
            "> - **≤11:** 14 damage; [slide](scc.v1:mcdm.heroes.v1/movement/forced-movement) 4; the miner's allies have concealment from the target (save ends)",
        },
        tier2: {
          kind: 'verbatim',
          sourceText:
            '> - **12-16:** 11 damage; [slide](scc.v1:mcdm.heroes.v1/movement/forced-movement) 2',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 7,
              characteristicOptions: [],
              typeOptions: [],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 7 damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.valok.statblock/servok-war-engine',
    effectOrdinal: 3,
    sourcePath: 'en/books/monsters/md/monster/valok/statblock/servok-war-engine.md',
    sourceSpan: {
      byteStart: 2667,
      byteEnd: 2716,
    },
    sourceText: 'Each target makes an Agility test.',
    targetsText: 'Each enemy and object in the area',
    resolution: {
      kind: 'test',
      characteristic: 'agility',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** 16 fire damage; the target is burning (save ends)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** 12 fire damage; the target is burning (EoT)',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 8,
              characteristicOptions: [],
              typeOptions: ['fire'],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 8 fire damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.voiceless-talker.statblock/voiceless-talker-evolutionist',
    effectOrdinal: 3,
    sourcePath:
      'en/books/monsters/md/monster/voiceless-talker/statblock/voiceless-talker-evolutionist.md',
    sourceSpan: {
      byteStart: 2898,
      byteEnd: 2949,
    },
    sourceText: 'Each target makes an Intuition test.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'test',
      characteristic: 'intuition',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText:
            '> - **≤11:** The target uses a [signature ability](scc.v1:mcdm.heroes.v1/rule.combat/signature-ability) against the nearest enemy within distance.',
        },
        tier2: {
          kind: 'verbatim',
          sourceText:
            '> - **12-16:** The target makes a [free strike](scc.v1:mcdm.heroes.v1/feature.common.main-actions/free-strike) against the nearest enemy within distance.',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: null,
            potency: null,
            conditionIds: ['mcdm.heroes.v1/condition/frightened'],
            ending: 'save-ends',
          },
          sourceText:
            '> - **17+:** [Frightened](scc.v1:mcdm.heroes.v1/condition/frightened) (save ends)',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.war-dog.3rd-echelon.statblock/war-dog-taxiarch',
    effectOrdinal: 6,
    sourcePath: 'en/books/monsters/md/monster/war-dog/3rd-echelon/statblock/war-dog-taxiarch.md',
    sourceSpan: {
      byteStart: 4498,
      byteEnd: 4547,
    },
    sourceText: 'Each target makes an Agility test.',
    targetsText: 'Each creature in the area',
    resolution: {
      kind: 'test',
      characteristic: 'agility',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText: '> - **≤11:** 18 lightning damage; the target is thunderstruck (save ends)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText: '> - **12-16:** 14 lightning damage; the target is thunderstruck (EoT)',
        },
        tier3: {
          kind: 'automatic',
          data: {
            damage: {
              amount: 9,
              characteristicOptions: [],
              typeOptions: ['lightning'],
            },
            potency: null,
            conditionIds: [],
            ending: null,
          },
          sourceText: '> - **17+:** 9 lightning damage',
        },
      },
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.werewolf.statblock/werewolf',
    effectOrdinal: 4,
    sourcePath: 'en/books/monsters/md/monster/werewolf/statblock/werewolf.md',
    sourceSpan: {
      byteStart: 5980,
      byteEnd: 6031,
    },
    sourceText: 'Each target makes an Intuition test.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'test',
      characteristic: 'intuition',
      subject: 'each-target',
      tiers: {
        tier1: {
          kind: 'verbatim',
          sourceText:
            '> - **≤11:** The target must move their speed in a straight line away from the werewolf; [frightened](scc.v1:mcdm.heroes.v1/condition/frightened) (save ends)',
        },
        tier2: {
          kind: 'verbatim',
          sourceText:
            '> - **12-16:** [Frightened](scc.v1:mcdm.heroes.v1/condition/frightened) (EoT)',
        },
        tier3: {
          kind: 'verbatim',
          sourceText: '> - **17+:** No effect',
        },
      },
    },
  },
];

/**
 * Channel-2 golden expectations for the 14 next-roll grant Effect lines
 * [R-0012..R-0016] — the `edge-bane-next-roll` (12) and
 * `next-strike-against-target` (2) closed templates. Generated by an
 * INDEPENDENT raw physical-line scanner over the pinned bundles (separate
 * minimal payload + header readers, not the production grammar),
 * cross-verified field-by-field against production compilation with zero
 * mismatches, then frozen (2026-08-25).
 */
export interface NextRollGrantCanonExpectation {
  artifactId: string;
  effectOrdinal: number;
  sourcePath: string;
  sourceSpan: { byteStart: number; byteEnd: number };
  sourceText: string;
  targetsText: string | null;
  resolution: Extract<EffectResolution, { kind: 'next-roll-grant' }>;
}

export const NEXT_ROLL_GRANT_CANON_EXPECTATIONS: NextRollGrantCanonExpectation[] = [
  {
    artifactId: 'mcdm.heroes.v1/feature.ability.raider/raiders-awe',
    effectOrdinal: 1,
    sourcePath: 'en/books/heroes/md/feature/ability/raider/raiders-awe.md',
    sourceSpan: { byteStart: 836, byteEnd: 1065 },
    sourceText:
      'The target takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on their next [power roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) made before the end of their next [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn).',
    targetsText: 'One creature',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'bane',
      scope: 'power-roll',
      direction: 'outbound',
      subject: 'the-target',
      window: 'end-of-targets-next-turn',
    },
  },
  {
    artifactId: 'mcdm.heroes.v1/kit/raider',
    effectOrdinal: 1,
    sourcePath: 'en/books/heroes/md/kit/raider.md',
    sourceSpan: { byteStart: 2118, byteEnd: 2347 },
    sourceText:
      'The target takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on their next [power roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) made before the end of their next [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn).',
    targetsText: 'One creature',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'bane',
      scope: 'power-roll',
      direction: 'outbound',
      subject: 'the-target',
      window: 'end-of-targets-next-turn',
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.elf-shadow.statblock/shadow-elf-luminator',
    effectOrdinal: 2,
    sourcePath: 'en/books/monsters/md/monster/elf-shadow/statblock/shadow-elf-luminator.md',
    sourceSpan: { byteStart: 1638, byteEnd: 1700 },
    sourceText:
      'Each target gains an edge on their next strike.',
    targetsText: 'Each ally in the area',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'edge',
      scope: 'strike',
      direction: 'outbound',
      subject: 'each-target',
      window: null,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.elf-shadow.statblock/shadow-elf-noctis-mage',
    effectOrdinal: 1,
    sourcePath: 'en/books/monsters/md/monster/elf-shadow/statblock/shadow-elf-noctis-mage.md',
    sourceSpan: { byteStart: 992, byteEnd: 1052 },
    sourceText:
      'The target takes a bane on their next strike.',
    targetsText: 'One creature or object',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'bane',
      scope: 'strike',
      direction: 'outbound',
      subject: 'the-target',
      window: null,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.elf-shadow.statblock/shadow-elf-sniper',
    effectOrdinal: 1,
    sourcePath: 'en/books/monsters/md/monster/elf-shadow/statblock/shadow-elf-sniper.md',
    sourceSpan: { byteStart: 1150, byteEnd: 1219 },
    sourceText:
      'The next strike made against the target gains an edge.',
    targetsText: 'One creature or object per minion',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'edge',
      scope: 'strike',
      direction: 'inbound',
      subject: 'the-target',
      window: null,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.gnoll.statblock/gnoll-mage-mauler',
    effectOrdinal: 1,
    sourcePath: 'en/books/monsters/md/monster/gnoll/statblock/gnoll-mage-mauler.md',
    sourceSpan: { byteStart: 1149, byteEnd: 1213 },
    sourceText:
      'The target takes a bane on their next power roll.',
    targetsText: 'One creature or object per minion',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'bane',
      scope: 'power-roll',
      direction: 'outbound',
      subject: 'the-target',
      window: null,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.goblin.statblock/skitterling',
    effectOrdinal: 1,
    sourcePath: 'en/books/monsters/md/monster/goblin/statblock/skitterling.md',
    sourceSpan: { byteStart: 1036, byteEnd: 1096 },
    sourceText:
      'The target takes a bane on their next strike.',
    targetsText: 'One creature per minion',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'bane',
      scope: 'strike',
      direction: 'outbound',
      subject: 'the-target',
      window: null,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.lizardfolk.statblock/lizardfolk-shellguard',
    effectOrdinal: 1,
    sourcePath: 'en/books/monsters/md/monster/lizardfolk/statblock/lizardfolk-shellguard.md',
    sourceSpan: { byteStart: 1082, byteEnd: 1142 },
    sourceText:
      'The target takes a bane on their next strike.',
    targetsText: 'One creature or object per minion',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'bane',
      scope: 'strike',
      direction: 'outbound',
      subject: 'the-target',
      window: null,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.rival.1st-echelon.statblock/rival-conduit',
    effectOrdinal: 2,
    sourcePath: 'en/books/monsters/md/monster/rival/1st-echelon/statblock/rival-conduit.md',
    sourceSpan: { byteStart: 1480, byteEnd: 1586 },
    sourceText:
      'Each target gains an edge on their next [strike](scc.v1:mcdm.heroes.v1/rule.combat/strike).',
    targetsText: 'Self and five allies',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'edge',
      scope: 'strike',
      direction: 'outbound',
      subject: 'each-target',
      window: null,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.rival.2nd-echelon.statblock/rival-conduit',
    effectOrdinal: 2,
    sourcePath: 'en/books/monsters/md/monster/rival/2nd-echelon/statblock/rival-conduit.md',
    sourceSpan: { byteStart: 1687, byteEnd: 1797 },
    sourceText:
      'Each target has a double edge on their next [strike](scc.v1:mcdm.heroes.v1/rule.combat/strike).',
    targetsText: 'Self and five allies',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'double-edge',
      scope: 'strike',
      direction: 'outbound',
      subject: 'each-target',
      window: null,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.rival.3rd-echelon.statblock/rival-conduit',
    effectOrdinal: 2,
    sourcePath: 'en/books/monsters/md/monster/rival/3rd-echelon/statblock/rival-conduit.md',
    sourceSpan: { byteStart: 1689, byteEnd: 1799 },
    sourceText:
      'Each target has a double edge on their next [strike](scc.v1:mcdm.heroes.v1/rule.combat/strike).',
    targetsText: 'Self and five allies',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'double-edge',
      scope: 'strike',
      direction: 'outbound',
      subject: 'each-target',
      window: null,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.undead.1st-echelon.statblock/ghost',
    effectOrdinal: 1,
    sourcePath: 'en/books/monsters/md/monster/undead/1st-echelon/statblock/ghost.md',
    sourceSpan: { byteStart: 1326, byteEnd: 1395 },
    sourceText:
      'The next strike made against the target gains an edge.',
    targetsText: 'Two creatures',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'edge',
      scope: 'strike',
      direction: 'inbound',
      subject: 'the-target',
      window: null,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.undead.1st-echelon.statblock/skeleton',
    effectOrdinal: 2,
    sourcePath: 'en/books/monsters/md/monster/undead/1st-echelon/statblock/skeleton.md',
    sourceSpan: { byteStart: 1858, byteEnd: 1919 },
    sourceText:
      'Each target takes a bane on their next strike.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'bane',
      scope: 'strike',
      direction: 'outbound',
      subject: 'each-target',
      window: null,
    },
  },
  {
    artifactId: 'mcdm.monsters.v1/monster.undead.2nd-echelon.statblock/mummy-lord',
    effectOrdinal: 4,
    sourcePath: 'en/books/monsters/md/monster/undead/2nd-echelon/statblock/mummy-lord.md',
    sourceSpan: { byteStart: 3842, byteEnd: 3903 },
    sourceText:
      'Each target takes a bane on their next strike.',
    targetsText: 'Each enemy in the area',
    resolution: {
      kind: 'next-roll-grant',
      polarity: 'bane',
      scope: 'strike',
      direction: 'outbound',
      subject: 'each-target',
      window: null,
    },
  },
];
