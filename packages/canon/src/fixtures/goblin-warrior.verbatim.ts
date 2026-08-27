/**
 * VERBATIM corpus cut — do not edit by hand.
 *
 * Cut mechanically from the pinned SteelCompendium snapshot (models point,
 * code cuts): source en/books/monsters/md/monster/goblin/statblock/goblin-warrior.md,
 * artifact mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior.
 * The corpus-gated drift guard in fixtures.corpus.test.ts re-cuts this
 * record (text AND statsJson) from the live corpus and fails on any byte
 * drift. Exists because the backend test environment (edge-runtime) cannot
 * read the corpus from disk.
 */

export const GOBLIN_WARRIOR = {
  artifactId: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-warrior',
  slug: 'goblin-warrior',
  textSha256: '3d09d12b5723988dda0293b43a02289a116a20612669b16a050805aa4167a8ce',
  text: "\n| Goblin, Humanoid  |           -           |      Level 1      |     Horde Harrier     |         EV 3         |\n|:-----------------:|:---------------------:|:-----------------:|:---------------------:|:--------------------:|\n|  **1S**<br>Size   |    **6**<br>Speed     | **15**<br>Stamina |  **0**<br>Stability   | **1**<br>Free Strike |\n| **-**<br>Immunity | **Climb**<br>Movement |         -         | **-**<br>With Captain |  **-**<br>Weakness   |\n|  **-2**<br>Might  |   **+2**<br>Agility   |  **0**<br>Reason  |  **0**<br>Intuition   |  **-1**<br>Presence  |\n\n> 🗡 **Spear Charge (Signature Ability)**\n>\n> | **Charge, Melee, Strike, Weapon** |               **[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |\n> |-----------------------------------|------------------------------:|\n> | **📏 Melee 1**                    | **🎯 One creature or object** |\n>\n> **Power Roll + 2:**\n>\n> - **≤11:** 3 damage\n> - **12-16:** 4 damage\n> - **17+:** 5 damage\n\n> 🗡 **Bury the Point (2 [Malice](scc.v1:mcdm.monsters.v1/rule.monster/malice))**\n>\n> | **Melee, Strike, Weapon** |     **[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |\n> |---------------------------|--------------------:|\n> | **📏 Melee 1**            | **🎯 One creature** |\n>\n> **Power Roll + 2:**\n>\n> - **≤11:** 5 damage; M < 0 [bleeding](scc.v1:mcdm.heroes.v1/condition/bleeding) (save ends)\n> - **12-16:** 6 damage; M < 1 [bleeding](scc.v1:mcdm.heroes.v1/condition/bleeding) (save ends)\n> - **17+:** 7 damage; M < 2 [bleeding](scc.v1:mcdm.heroes.v1/condition/bleeding) (save ends)\n\n> ⭐️ **Crafty**\n>\n> The warrior doesn't provoke [opportunity attacks](scc.v1:mcdm.heroes.v1/rule.combat/opportunity-attack) by moving.\n",
  statsJson:
    '{"staminaMax":15,"characteristics":{"might":-2,"agility":2,"reason":0,"intuition":0,"presence":-1},"immunities":[],"weaknesses":[],"potencies":null,"recoveriesMax":null,"freeStrike":1,"organization":"Horde","withCaptain":null,"withCaptainBenefit":null,"unparsedRows":[]}',
} as const;
