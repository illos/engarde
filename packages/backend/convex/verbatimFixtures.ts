/**
 * VERBATIM corpus cuts — do not edit by hand.
 *
 * Cut mechanically from the pinned SteelCompendium snapshot (models point,
 * code cuts). The corpus-gated drift test `verbatimFixtures.corpus.test.ts`
 * re-cuts each record from the live corpus and fails on any byte drift, so
 * these fixtures can never silently diverge from the books. They live in the
 * backend (not `@engarde/canon/fixtures/*`) because they exist solely for
 * the flat-resource host E2E tests and the backend test environment
 * (edge-runtime) cannot read the corpus from disk.
 */

/**
 * Source en/books/monsters/md/monster/kobold/statblock/kobold-signifer.md,
 * artifact mcdm.monsters.v1/monster.kobold.statblock/kobold-signifer,
 * artifact version 97fe3a397314…. Carries the Glory to the Legion Effect
 * "Each target regains 5 Stamina." (ordinal 2) — the flat-regain family
 * E2E fixture [R-0017, R-0020].
 */
export const KOBOLD_SIGNIFER = {
  artifactId: 'mcdm.monsters.v1/monster.kobold.statblock/kobold-signifer',
  slug: 'kobold-signifer',
  textSha256: '97fe3a39731424671515f31e5c2caf13d2889a2f9ee79ee4f48aaaa9086472bd',
  text: '\n| Humanoid, Kobold  |         -         |      Level 1      |     Horde Support     |         EV 3         |\n|:-----------------:|:-----------------:|:-----------------:|:---------------------:|:--------------------:|\n|  **1S**<br>Size   |  **5**<br>Speed   | **15**<br>Stamina |  **0**<br>Stability   | **1**<br>Free Strike |\n| **-**<br>Immunity | **-**<br>Movement |         -         | **-**<br>With Captain |  **-**<br>Weakness   |\n|  **0**<br>Might   | **+1**<br>Agility |  **0**<br>Reason  |  **0**<br>Intuition   |  **+2**<br>Presence  |\n\n> 🗡 **Signum (Signature Ability)**\n>\n> | **Melee, Strike, Weapon** |               **[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |\n> |---------------------------|------------------------------:|\n> | **📏 Melee 1**            | **🎯 One creature or object** |\n>\n> **Power Roll + 2:**\n>\n> - **≤11:** 3 damage\n> - **12-16:** 4 damage\n> - **17+:** 5 damage\n>\n> **Effect:** One ally within 10 squares of the signifer can [shift](scc.v1:mcdm.heroes.v1/movement/shifting) up to their speed if they end that shift [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) to an ally.\n>\n> **2+ [Malice](scc.v1:mcdm.monsters.v1/rule.monster/malice):** One additional ally can [shift](scc.v1:mcdm.heroes.v1/movement/shifting) for each 2 [Malice](scc.v1:mcdm.monsters.v1/rule.monster/malice) spent.\n\n> ❇️ **Glory to the Legion (5 [Malice](scc.v1:mcdm.monsters.v1/rule.monster/malice))**\n>\n> | **Area**       |                 **[Maneuver](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |\n> |----------------|-----------------------------:|\n> | **📏 5 burst** | **🎯 Each ally in the area** |\n>\n> **Effect:** Each target regains 5 [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina).\n\n> ⭐️ **Shield? Shield!**\n>\n> While [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) to an ally who also has this trait, the signifer has stability 1, has cover, and grants cover to allies.\n\n> ⭐️ **Upholding High Standards**\n>\n> Any ally who starts their turn within 5 squares of the signifer gains a +2 bonus to speed and a +2 damage bonus to strikes until the end of their turn. Additionally, if the signifer is killed, any kobold [minion](scc.v1:mcdm.monsters.v1/rule.organization/minion) can enter their space during the same encounter to retrieve the signum battle standard they carry (no action required) and replace their stat block with the signifer stat block.\n',
  statsJson:
    '{"staminaMax":15,"characteristics":{"might":0,"agility":1,"reason":0,"intuition":0,"presence":2},"immunities":[],"weaknesses":[],"potencies":null,"organization":"Horde","unparsedRows":[]}',
} as const;

/**
 * Source en/books/heroes/md/feature/ability/conduit/level-1/healing-grace.md,
 * artifact mcdm.heroes.v1/feature.ability.conduit.level-1/healing-grace,
 * artifact version 5ff6e81c4a02…. Carries the spend-recovery Effect
 * "The target can spend a Recovery." (ordinal 1) — the offered-Recovery
 * family E2E fixture [R-0018, R-0019].
 */
export const HEALING_GRACE = {
  artifactId: 'mcdm.heroes.v1/feature.ability.conduit.level-1/healing-grace',
  slug: 'healing-grace',
  textSha256: '5ff6e81c4a02dfe06df0872eaa8744a3135b9339d7abbd6f0ac79d378ef65034',
  text: '\n\n*Your divine energy restores the righteous.*\n\n| **Magic, [Ranged](scc.v1:mcdm.heroes.v1/rule.combat/ranged)**          |            **[Maneuver](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |\n|----------------------------|------------------------:|\n| **📏 [Ranged](scc.v1:mcdm.heroes.v1/rule.combat/ranged) 10**           | **🎯 Self or one ally** |\n\n**Effect:** The target can spend a [Recovery](scc.v1:mcdm.heroes.v1/rule.health/recoveries).\n\n**Spend 1+ Piety:** For each piety spent, choose one of the following [enhancements](scc.v1:mcdm.heroes.v1/rule.treasure/enhancement):\n\n- You can target one additional ally within [distance](scc.v1:mcdm.heroes.v1/rule.combat/distance).\n- You can end one effect on a target that is ended by a [saving throw](scc.v1:mcdm.heroes.v1/rule.general/saving-throw) or that ends at the end of their [turn](scc.v1:mcdm.heroes.v1/rule.combat/turn).\n- A [prone target](scc.v1:mcdm.heroes.v1/condition/prone) can stand up.\n- A target can spend 1 additional [Recovery](scc.v1:mcdm.heroes.v1/rule.health/recoveries).\n',
} as const;

/**
 * Source en/books/monsters/md/monster/war-dog/3rd-echelon/statblock/war-dog-aerocite.md,
 * artifact mcdm.monsters.v1/monster.war-dog.3rd-echelon.statblock/war-dog-aerocite,
 * artifact version c71452c3d781…. Carries the Caustic Paste Bomb Effect
 * "The area is difficult terrain." (ordinal 1) — the terrain-fact family
 * E2E fixture [R-0022].
 */
export const WAR_DOG_AEROCITE = {
  artifactId: 'mcdm.monsters.v1/monster.war-dog.3rd-echelon.statblock/war-dog-aerocite',
  slug: 'war-dog-aerocite',
  textSha256: 'c71452c3d781907aff5ce449491afe7cca9f9c188b2b9dee64b5dbdaeee5a3e8',
  text: '\n| Humanoid, Soulless, War Dog |          -          |      Level 8      |     Horde Harrier     |        EV 10         |\n|:---------------------------:|:-------------------:|:-----------------:|:---------------------:|:--------------------:|\n|       **1M**<br>Size        |   **8**<br>Speed    | **50**<br>Stamina |  **0**<br>Stability   | **3**<br>Free Strike |\n|      **-**<br>Immunity      | **Fly**<br>Movement |         -         | **-**<br>With Captain |  **-**<br>Weakness   |\n|       **0**<br>Might        |  **+4**<br>Agility  | **+1**<br>Reason  |  **+3**<br>Intuition  |  **+1**<br>Presence  |\n\n> 🗡 **Dive Bomb ([Signature Ability](scc.v1:mcdm.heroes.v1/rule.combat/signature-ability))**\n>\n> | **Melee, Strike, Weapon** |               **[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |\n> |---------------------------|------------------------------:|\n> | **📏 Melee 1**            | **🎯 One creature or object** |\n>\n> **Power Roll + 4:**\n>\n> - **≤11:** 7 damage\n> - **12-16:** 10 damage; vertical [slide](scc.v1:mcdm.heroes.v1/movement/forced-movement) 2\n> - **17+:** 12 damage; vertical [slide](scc.v1:mcdm.heroes.v1/movement/forced-movement) 3\n>\n> **1 [Malice](scc.v1:mcdm.monsters.v1/rule.monster/malice):** An enemy [forced moved](scc.v1:mcdm.heroes.v1/movement/forced-movement) by this ability is [grabbed](scc.v1:mcdm.heroes.v1/condition/grabbed) instead.\n\n> 🔳 **Caustic Paste Bomb (2 [Malice](scc.v1:mcdm.monsters.v1/rule.monster/malice))**\n>\n> | **Area, Magic, Ranged** |                               **[Maneuver](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |\n> |-------------------------|-------------------------------------------:|\n> | **📏 3 cube within 5**  | **🎯 Each creature or object in the area** |\n>\n> **Power Roll + 4:**\n>\n> - **≤11:** 2 acid damage; M < 2 [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)\n> - **12-16:** 4 acid damage; M < 3 [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)\n> - **17+:** 6 acid damage; M < 4 [slowed](scc.v1:mcdm.heroes.v1/condition/slowed) (save ends)\n>\n> **Effect:** The area is [difficult terrain](scc.v1:mcdm.heroes.v1/movement/difficult-terrain).\n\n> ⭐️ **Jetwing Agility**\n>\n> If the aerocite moves 5 or more squares on their turn, strikes made against them take a bane until the start of their next turn.\n\n> ⭐️ **Loyalty Collar**\n>\n> When the aerocite is reduced to 0 [Stamina](scc.v1:mcdm.heroes.v1/rule.health/stamina), their loyalty collar explodes, dealing 3d6 damage to each [adjacent](scc.v1:mcdm.heroes.v1/rule.combat/adjacent) enemy and object.\n',
  statsJson:
    '{"staminaMax":50,"characteristics":{"might":0,"agility":4,"reason":1,"intuition":3,"presence":1},"immunities":[],"weaknesses":[],"potencies":null,"organization":"Horde","unparsedRows":[]}',
} as const;
