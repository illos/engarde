/**
 * VERBATIM corpus cut — do not edit by hand.
 *
 * Cut mechanically from the pinned SteelCompendium snapshot (models point,
 * code cuts): source en/books/monsters/md/monster/goblin/statblock/goblin-spinecleaver.md,
 * artifact mcdm.monsters.v1/monster.goblin.statblock/goblin-spinecleaver,
 * artifact version 66173f38c3e3…. The corpus-gated canon test
 * `fixtures.corpus.test.ts` re-cuts this record (text AND statsJson) from
 * the live corpus and fails on any byte drift, so this fixture can never
 * silently diverge from the books. The statblock behind BOTH printed squad
 * pool worked examples (the 40-pool threshold walk and the Incinerate
 * 15-not-18 area cap, Monsters p.7–8) — the minion-pool golden channel
 * [R-0023..R-0026, docs/minion-pool-design.md].
 */

export const GOBLIN_SPINECLEAVER = {
  artifactId: 'mcdm.monsters.v1/monster.goblin.statblock/goblin-spinecleaver',
  slug: 'goblin-spinecleaver',
  textSha256: '66173f38c3e3951ebf8f7d948cda69234a0c976dc465a8b7e2ab54f0a3025896',
  text: "\n| Goblin, Humanoid  |           -           |     Level 1      |                  Minion Brute                  | EV 3 for four minions |\n|:-----------------:|:---------------------:|:----------------:|:----------------------------------------------:|:---------------------:|\n|  **1S**<br>Size   |    **5**<br>Speed     | **5**<br>Stamina |               **0**<br>Stability               | **2**<br>Free Strike  |\n| **-**<br>Immunity | **Climb**<br>Movement |        -         | **+1 damage bonus to strikes**<br>With Captain |   **-**<br>Weakness   |\n|  **+2**<br>Might  |   **0**<br>Agility    | **0**<br>Reason  |               **0**<br>Intuition               |  **-1**<br>Presence   |\n\n> 🗡 **Axe (Signature Ability)**\n>\n> | **Melee, Strike, Weapon** |                          **[Main action](scc.v1:mcdm.heroes.v1/rule.combat/turn)** |\n> |---------------------------|-----------------------------------------:|\n> | **📏 Melee 1**            | **🎯 One creature or object per minion** |\n>\n> **Power Roll + 2:**\n>\n> - **≤11:** 2 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 1\n> - **12-16:** 4 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 3\n> - **17+:** 5 damage; [push](scc.v1:mcdm.heroes.v1/movement/forced-movement) 4\n\n> ⭐️ **Crafty**\n>\n> The spinecleaver doesn't provoke [opportunity attacks](scc.v1:mcdm.heroes.v1/rule.combat/opportunity-attack) by moving.\n",
  statsJson:
    '{"staminaMax":5,"staminaResidue":null,"characteristics":{"might":2,"agility":0,"reason":0,"intuition":0,"presence":-1},"immunities":[],"weaknesses":[],"potencies":null,"recoveriesMax":null,"freeStrike":2,"organization":"Minion","withCaptain":"+1 damage bonus to strikes","withCaptainBenefit":{"kind":"strike-damage","amount":1,"sourceText":"+1 damage bonus to strikes"},"unparsedRows":[]}',
} as const;
