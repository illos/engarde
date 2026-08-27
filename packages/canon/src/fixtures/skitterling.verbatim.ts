/**
 * VERBATIM corpus cut — do not edit by hand.
 *
 * Cut mechanically from the pinned SteelCompendium snapshot (models point,
 * code cuts): source en/books/monsters/md/monster/goblin/statblock/skitterling.md, artifact mcdm.monsters.v1/monster.goblin.statblock/skitterling,
 * artifact version c4885a56ff00…. The corpus-gated canon test
 * `fixtures.corpus.test.ts` re-cuts this record from the live corpus and
 * fails on any byte drift, so this fixture can never silently diverge from
 * the books. Carries the Claws signature strike (Melee, Strike, Weapon)
 * whose Effect "The target takes a bane on their next strike." is the
 * next-roll grant family's E2E fixture [R-0012..R-0016].
 */

export const SKITTERLING = {
  artifactId: 'mcdm.monsters.v1/monster.goblin.statblock/skitterling',
  slug: 'skitterling',
  textSha256: 'c4885a56ff004a8f4d8363fd03b53bf9da07805287a34346af75cb7c65990565',
  text: '\n|  Animal, Goblin   |          -          |     Level 1      |             Minion Hexer              | EV 3 for four minions |\n|:-----------------:|:-------------------:|:----------------:|:-------------------------------------:|:---------------------:|\n|  **1T**<br>Size   |   **5**<br>Speed    | **3**<br>Stamina |          **0**<br>Stability           | **1**<br>Free Strike  |\n| **-**<br>Immunity | **Fly**<br>Movement |        -         | **+3 bonus to speed**<br>With Captain |   **-**<br>Weakness   |\n|  **-5**<br>Might  |  **+2**<br>Agility  | **-4**<br>Reason |          **0**<br>Intuition           |  **-2**<br>Presence   |\n\n> 🗡 **Claws (Signature Ability)**\n>\n> | **Melee, Strike, Weapon** |                **[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |\n> |---------------------------|-------------------------------:|\n> | **📏 Melee 1**            | **🎯 One creature per minion** |\n>\n> **Power Roll + 2:**\n>\n> - **≤11:** 1 poison damage\n> - **12-16:** 2 poison damage\n> - **17+:** 3 poison damage\n>\n> **Effect:** The target takes a bane on their next strike.\n',
  statsJson:
    '{"staminaMax":3,"characteristics":{"might":-5,"agility":2,"reason":-4,"intuition":0,"presence":-2},"immunities":[],"weaknesses":[],"potencies":null,"recoveriesMax":null,"freeStrike":1,"organization":"Minion","withCaptain":"+3 bonus to speed","withCaptainBenefit":{"kind":"directive","template":"speed","amount":3,"sourceText":"+3 bonus to speed"},"unparsedRows":[]}',
} as const;
