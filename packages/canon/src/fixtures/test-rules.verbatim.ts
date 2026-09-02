/**
 * VERBATIM corpus cut — do not edit by hand.
 *
 * The test RULE artifacts the engine's ordinary-test substrate reads from
 * [common-actions design S9 + S20]: the Test Difficulty Outcomes Table is
 * transcribed into `TEST_DIFFICULTY_OUTCOMES` cell by cell, and the
 * canon-side test proves each transcribed label against THESE bytes. Cut
 * mechanically from the pinned SteelCompendium snapshot (models point, code
 * cuts); the corpus-gated drift guard `common-actions.corpus.test.ts`
 * re-cuts every one from the live corpus and fails on any byte drift.
 */

import type { GateSourceFixture } from './gate-sources.verbatim.js';

/**
 * A chapter CHUNK — a pinned span of a chapter file rather than a whole
 * structured record. Chunks carry no paired JSON of their own, so the
 * drift guard re-cuts them by byte span from the chapter markdown after
 * proving the file's own hash; `version` is the campaign bundle's span
 * hash, which the chapter pipeline computes the same way.
 */
export interface ChapterChunkFixture extends GateSourceFixture {
  readonly fileSha256: string;
  readonly span: { readonly byteStart: number; readonly byteEnd: number };
}

export const TEST_DIFFICULTY: GateSourceFixture = {
  artifactId: 'mcdm.heroes.v1/rule.test/test-difficulty',
  sourcePath: 'en/books/heroes/md/rule/test/test-difficulty.md',
  textSha256: '1d3ede0712f83bb70955f58c09e18a75424c9b14de9d65926f7bba9cb8320abf',
  text: "\nThe Director decides how difficult a task that requires a [test](scc.v1:mcdm.heroes.v1/rule.test/test) is: easy, medium, or hard. If a task seems as though it's easier than easy, then no [test](scc.v1:mcdm.heroes.v1/rule.test/test) is necessary. The hero simply accomplishes the task. If the task seems harder than hard, then the Director is free to decide that it's impossible to complete with a [test](scc.v1:mcdm.heroes.v1/rule.test/test).\n\nOn a [test](scc.v1:mcdm.heroes.v1/rule.test/test)-by-[test](scc.v1:mcdm.heroes.v1/rule.test/test) basis, the Director can share the difficulty of a task before the player makes the [test](scc.v1:mcdm.heroes.v1/rule.test/test), which makes interpreting the outcome faster at the table. The Director can also keep a [test](scc.v1:mcdm.heroes.v1/rule.test/test)'s difficulty secret until after the player rolls the [test](scc.v1:mcdm.heroes.v1/rule.test/test), for dramatic effect.\n\nThe [Test](scc.v1:mcdm.heroes.v1/rule.test/test) Difficulty Outcomes table shows all the possible outcomes of the different difficulties of [tests](scc.v1:mcdm.heroes.v1/rule.test/test). The Director will keep this information handy so as to be able to compare the different difficulties and their outcomes during play.\n\n###### Test Difficulty Outcomes Table\n\n| [Power Roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll)       | Easy [Test](scc.v1:mcdm.heroes.v1/rule.test/test) Outcomes         | Medium [Test](scc.v1:mcdm.heroes.v1/rule.test/test) Outcomes       | Hard [Test](scc.v1:mcdm.heroes.v1/rule.test/test) Outcomes         |\n|------------------|----------------------------|----------------------------|----------------------------|\n| ≤11              | Success with a consequence | Failure                    | Failure with a consequence |\n| 12-16            | Success                    | Success with a consequence | Failure                    |\n| 17+              | Success with a reward      | Success                    | Success                    |\n| [Natural 19 or 20](scc.v1:mcdm.heroes.v1/rule.dice/natural-19-20) | Success with a reward      | Success with a reward      | Success with a reward      |\n\nWhenever the rules talk about obtaining a success on a [test](scc.v1:mcdm.heroes.v1/rule.test/test), that includes a straight success, a success with a consequence, or a success with a reward. Whenever the rules talk about a failure on a [test](scc.v1:mcdm.heroes.v1/rule.test/test), that includes a straight failure or a failure with a consequence.\n\nWhenever you make a [test](scc.v1:mcdm.heroes.v1/rule.test/test) whose outcome you don't like, you can spend a [hero token](scc.v1:mcdm.heroes.v1/rule.resource/hero-token) to reroll the [test](scc.v1:mcdm.heroes.v1/rule.test/test). You must use the new roll.\n\n##### Easy Tests\n\nAn easy [test](scc.v1:mcdm.heroes.v1/rule.test/test) has some risk of consequence, but most heroes will likely overcome it. The [power roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) you make for an easy [test](scc.v1:mcdm.heroes.v1/rule.test/test) determines the outcome (see [Test](scc.v1:mcdm.heroes.v1/rule.test/test) Outcomes below):\n\n- **≤11:** You succeed on the task and incur a consequence.\n- **12-16:** You succeed on the task.\n- **17+:** You succeed on the task with a reward.\n\n##### Medium Tests\n\nA medium [test](scc.v1:mcdm.heroes.v1/rule.test/test) has some risk of failure that most heroes will likely overcome—but with a cost. The [power roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) you make for a medium [test](scc.v1:mcdm.heroes.v1/rule.test/test) determines the outcome:\n\n- **≤11:** You fail the task.\n- **12-16:** You succeed on the task and incur a consequence.\n- **17+:** You succeed on the task.\n\n##### Hard Tests\n\nA hard [test](scc.v1:mcdm.heroes.v1/rule.test/test) has a greater risk of failure, and most heroes are likely to suffer some hardship while trying to overcome the intended task. The [power roll](scc.v1:mcdm.heroes.v1/rule.dice/power-roll) you make for a hard [test](scc.v1:mcdm.heroes.v1/rule.test/test) determines the outcome:\n\n- **≤11:** You fail the task and incur a consequence.\n- **12-16:** You fail the task.\n- **17+:** You succeed on the task.\n",
};

export const ASSIST_A_TEST: ChapterChunkFixture = {
  artifactId: 'mcdm.heroes.v1/chapter/tests#assist-a-test',
  sourcePath: 'en/books/heroes/md/chapter/tests.md',
  fileSha256: 'df3be55de2c85a3a0d8f37c53a2dc19efd4cc5db389e6367b62d4be50072df3e',
  span: { byteStart: 24597, byteEnd: 26928 },
  textSha256: 'e00f76346bfce738282ce8d1411bc2d29400f41166f1c8d77f6136f29d90e1f5',
  text: "### Assist a Test\n\nYou can attempt to assist another creature with a [test](scc.v1:mcdm.heroes.v1/rule.test/test) they make, provided you have a skill that applies to the [test](scc.v1:mcdm.heroes.v1/rule.test/test), the other creature isn't using that same skill on the [test](scc.v1:mcdm.heroes.v1/rule.test/test), and you can describe how your character helps to the Director's satisfaction. In other words, your attempt to help has to make sense, and you have to bring some useful expertise to the table. Helping another creature sneak by shouting encouragement at them isn't going to make them stealthier.\n\nWhen you attempt to assist another creature, make a [test](scc.v1:mcdm.heroes.v1/rule.test/test) using the skill you choose, and using a [characteristic](scc.v1:mcdm.heroes.v1/rule.character/characteristic) chosen by the Director based on the activity you use to help. The outcome of that [test](scc.v1:mcdm.heroes.v1/rule.test/test) determines the [bonus](scc.v1:mcdm.heroes.v1/rule.dice/bonuses-and-penalties) applied to the [test](scc.v1:mcdm.heroes.v1/rule.test/test) you're assisting:\n\n- **≤11:** You get in the way or make things worse. The creature takes a [bane](scc.v1:mcdm.heroes.v1/rule.dice/bane) on their [test](scc.v1:mcdm.heroes.v1/rule.test/test).\n- **12-16:** Your help grants the other creature an [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge) on their [test](scc.v1:mcdm.heroes.v1/rule.test/test).\n- **17+:** Your help gives the other creature a double [edge](scc.v1:mcdm.heroes.v1/rule.dice/edge) on their [test](scc.v1:mcdm.heroes.v1/rule.test/test).\n\nFor example, when an ally tries to pick a jailer's pocket, you might attempt to assist by using the [Flirt](scc.v1:mcdm.heroes.v1/skill.interpersonal/flirt) skill to distract the jailer. The Director accepts this, and asks you to make a [Presence](scc.v1:mcdm.heroes.v1/rule.character/presence) [test](scc.v1:mcdm.heroes.v1/rule.test/test) using Flirt. The outcome of that [test](scc.v1:mcdm.heroes.v1/rule.test/test) determines the [bonus](scc.v1:mcdm.heroes.v1/rule.dice/bonuses-and-penalties) you provide to the other hero's [Agility](scc.v1:mcdm.heroes.v1/rule.character/agility) [test](scc.v1:mcdm.heroes.v1/rule.test/test) to pick the jailer's pocket—or whether you fumble the distraction and potentially draw attention to the attempt.\n\n",
};

/** Every test-rule artifact the substrate transcribes from, by id. */
export const TEST_RULE_FIXTURES: readonly GateSourceFixture[] = [TEST_DIFFICULTY];

/** Every chapter chunk the substrate transcribes from. */
export const TEST_RULE_CHUNK_FIXTURES: readonly ChapterChunkFixture[] = [ASSIST_A_TEST];
