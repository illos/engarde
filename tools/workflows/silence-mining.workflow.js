export const meta = {
  name: 'silence-mining',
  description: 'Mine open rules questions from corpus text, answer them from the pin, adversarially refute, and hand back a Gate-3 ruling deck',
  whenToUse: 'Building a Gate-3 ruling deck: mode "verify" answers + refutes an existing silences list; mode "mine" first extracts silences from batches of corpus artifacts.',
  phases: [
    { title: 'Mine', detail: 'one agent per artifact batch extracts open questions the pin does not answer' },
    { title: 'Merge', detail: 'one agent collapses duplicates into one-ruling groups' },
    { title: 'Answer', detail: 'one agent per card proposes a ruling with verbatim evidence' },
    { title: 'Refute', detail: 'one skeptic per card tries to kill the question or the answer' },
    { title: 'Recut', detail: 'one agent per refuted card extracts only the genuinely open residue as new one-decision questions' },
  ],
}

// ---- args ----------------------------------------------------------------
// args = {
//   mode: 'verify' | 'mine' | 'recut',
//   recut: [{qid, group, cardPath, answersPath}]  (recut mode: refuted cards + the deck's answers.json)
//   deckDir: absolute path of the deck directory (cards/<qid>.json exist for verify),
//   repoRoot: absolute path of the engarde checkout,
//   cards: [{qid, group, cardPath, question?}],  (verify mode; question may be omitted — agents read the card file)
//   batches: [{batch, artifactIds, sourcesPath, mapHints}],                          (mine mode)
//   refuters: number of independent skeptics per card (default 1),
//   model: optional model override for all agents in this run ('opus' | 'sonnet' | ...),
// }
const REPO = args.repoRoot
const DECK = args.deckDir
const REFUTERS = args.refuters || 1
// Optional model override for every agent in this run (e.g. 'opus' when the session model is capped).
// Only added to opts when set, so cache keys of earlier runs are untouched.
const MODEL_OPTS = args.model ? { model: args.model } : {}

const PRIME = `
HARD RULES (this project was once killed by hallucinated rules):
- Never invent a rule, number, condition, or piece of rulebook prose. If it is not in the
  source text you were given (or another pinned artifact you read from ${REPO}/.artifacts/canon/bundles/),
  it does not exist. Do not reconstruct from memory or from D&D / Pathfinder / any other game.
- Every quotation you give must be VERBATIM from a pinned artifact, wrapped in double quotes,
  and prefixed by the artifact id, in this exact form:
    mcdm.heroes.v1/some/artifact: "exact words from the text"
  Separate multiple quotes with " · ". A quote checker will reject any fragment that does not
  appear byte-for-byte (after whitespace/emphasis normalization) in the pinned text.
- Draw Steel terms only: Director (not DM/GM), Stamina (not HP), power roll (not attack roll),
  characteristic (not ability score), triggered action (not reaction).
- Existing Gate-3 rulings live in ${REPO}/docs/canon-rulings.md (R-0001..R-0045). Cite them by id
  when one already settles a point; never re-rule what is already ruled.
- The engine lives in ${REPO}/packages/engine/src. "The engine already knows this" is a legitimate
  answer — grep before you propose a Director prompt or new machinery (CONV-0004).
`

const ANSWER_SCHEMA = {
  type: 'object',
  required: ['answer', 'basis', 'evidence', 'reasoning', 'confidence', 'consequenceIfWrong', 'alternatives'],
  properties: {
    answer: { type: 'string', description: 'The proposed ruling in plain language a judge who did none of the work can accept or override. Lead with the decision.' },
    basis: { type: 'string', enum: ['printed', 'derived', 'engine-design', 'needs-user'], description: 'printed = the pin states it; derived = follows from printed text plus a stated inference; engine-design = the books are silent and this is a substrate choice; needs-user = you could not propose a default.' },
    evidence: { type: 'string', description: 'Verbatim quotes only, each prefixed by artifact id, joined with " · ". Empty string if the pin is silent — never paraphrase.' },
    reasoning: { type: 'string', description: 'Why this answer, in plain language. Name any inference step explicitly. No project shorthand.' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    consequenceIfWrong: { type: 'string', description: 'What a table would experience if this ruling is wrong.' },
    alternatives: { type: 'array', items: { type: 'string' }, description: 'Other defensible readings, one sentence each; empty if none.' },
    collapsedSubQuestions: { type: 'array', items: { type: 'object', required: ['subQuestion', 'why'], properties: { subQuestion: { type: 'string' }, why: { type: 'string' } } }, description: 'Sub-questions the pin or an existing ruling already answers, with the quote or ruling id. These should NOT go to the user.' },
    existingRulings: { type: 'array', items: { type: 'string' }, description: 'Ruling ids (R-00NN) that already bear on this card.' },
  },
}

const REFUTE_SCHEMA = {
  type: 'object',
  required: ['refuted', 'problems', 'fabricatedQuote', 'pinAlreadyAnswers', 'engineAlreadyKnows', 'summary'],
  properties: {
    refuted: { type: 'boolean', description: 'true if the card should NOT reach the user as proposed.' },
    problems: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'problem'],
        properties: {
          kind: { type: 'string', enum: ['pin-answers-it', 'engine-knows-it', 'fabricated-quote', 'invented-rule', 'wrong-basis', 'not-one-ruling', 'already-ruled', 'other'] },
          problem: { type: 'string', description: 'Plain-language statement of the defect with the quote or file that proves it.' },
          correctedBasis: { type: 'string', enum: ['printed', 'derived', 'engine-design', 'needs-user'] },
        },
      },
    },
    fabricatedQuote: { type: 'boolean', description: 'true if ANY quoted fragment in the evidence is not verbatim in the pinned text.' },
    pinAlreadyAnswers: { type: 'boolean' },
    engineAlreadyKnows: { type: 'boolean' },
    summary: { type: 'string', description: 'One paragraph for the Lead: does this card deserve the user\'s time, and why.' },
  },
}

const SILENCES_SCHEMA = {
  type: 'object',
  required: ['silences', 'examined'],
  properties: {
    examined: { type: 'array', items: { type: 'string' }, description: 'Every artifact id you actually read.' },
    silences: {
      type: 'array',
      items: {
        type: 'object',
        required: ['question', 'sourceArtifactIds', 'group', 'whyOpen', 'pinChecked', 'engineChecked', 'kind'],
        properties: {
          question: { type: 'string', description: 'The open question, written for a judge who did none of the work. One decision per question.' },
          sourceArtifactIds: { type: 'array', items: { type: 'string' }, description: 'Pinned artifact ids whose text raises the question. Only ids you read.' },
          group: { type: 'string', description: 'Short family label, e.g. "Turn order", "Free strikes".' },
          kind: { type: 'string', enum: ['silence', 'ambiguity', 'engine-design', 'table-fact'], description: 'silence = book says nothing; ambiguity = two readings; engine-design = substrate choice the book cannot make; table-fact = only the table can know (DEC-0011 spatial etc.).' },
          whyOpen: { type: 'string', description: 'Why a program cannot proceed without an answer.' },
          pinChecked: { type: 'string', description: 'What you searched for in the pin to confirm it does not answer this (artifact ids / phrases), and what you found.' },
          engineChecked: { type: 'string', description: 'What you grepped in packages/engine/src and docs/canon-rulings.md, and what you found.' },
          candidateDefault: { type: 'string', description: 'If you can see a defensible default, state it; else empty.' },
        },
      },
    },
  },
}

const MERGE_SCHEMA = {
  type: 'object',
  required: ['cards', 'dropped'],
  properties: {
    cards: {
      type: 'array',
      items: {
        type: 'object',
        required: ['question', 'group', 'sourceArtifactIds', 'subQuestions', 'oneRuling', 'kind'],
        properties: {
          question: { type: 'string' },
          group: { type: 'string' },
          sourceArtifactIds: { type: 'array', items: { type: 'string' } },
          subQuestions: { type: 'array', items: { type: 'string' }, description: 'The original mined questions this one ruling settles.' },
          oneRuling: { type: 'boolean' },
          kind: { type: 'string', enum: ['silence', 'ambiguity', 'engine-design', 'table-fact'] },
        },
      },
    },
    dropped: { type: 'array', items: { type: 'object', required: ['question', 'why'], properties: { question: { type: 'string' }, why: { type: 'string' } } }, description: 'Mined questions you removed because the pin answers them, a ruling exists, or they are table facts — with the proof.' },
  },
}

function answerPrompt(card) {
  return `You are proposing a Gate-3 ruling for the Draw Steel engine "engarde". Read the card file
${card.cardPath} — it holds the question, the printed cases it settles (subQuestions), and the
VERBATIM pinned source text of every artifact involved. Read the whole file before answering.

Card question: ${card.question || '(read it from the card file — the "question" field)'}
Group: ${card.group}

Then:
1. Read ${REPO}/docs/canon-rulings.md and note any ruling that already bears on this card.
2. For each sub-question, decide whether the pinned text (or an existing ruling) ALREADY answers it.
   Those go in collapsedSubQuestions with the proving quote or ruling id — the user should not be asked
   what the book already says (CONV-0004: a costless printed "can" is not a decision point).
3. For what remains genuinely open, propose ONE ruling that settles the card. Write it for a judge who
   did none of the work: lead with the decision, define any term of art, no project shorthand.
4. Give verbatim evidence in the required quote format. If the pin is silent, say so and leave the
   evidence to the quotes that PROVE the silence (what the text does say around the gap).
5. Name the basis honestly. "printed" only if the words are on the page.
${PRIME}`
}

function refutePrompt(card, answer, seed) {
  return `You are skeptic #${seed} for a proposed Gate-3 ruling in the Draw Steel engine "engarde".
Your job is to REFUTE it. Default to refuted=true if you are uncertain. The user's time is the
scarcest resource in this project; a card that reaches them when the book already answers it, or
that carries a fabricated quote, is a failure.

Read the card file ${card.cardPath} (question, sub-questions, and the VERBATIM pinned text).

Proposed ruling under test:
${JSON.stringify(answer, null, 1)}

Attack it on every axis:
- pin-answers-it: does the pinned text (in the card, or another artifact under
  ${REPO}/.artifacts/canon/bundles/) already answer the question? Quote it.
- engine-knows-it: does ${REPO}/packages/engine/src already implement or deterministically derive
  this? Name the file and function.
- already-ruled: does ${REPO}/docs/canon-rulings.md already settle it? Name the ruling id.
- fabricated-quote: check EVERY quoted fragment in the evidence against the pinned text
  byte-for-byte (ignoring whitespace, markdown emphasis, and scc link syntax). One bad fragment
  = fabricatedQuote true.
- invented-rule: does the answer assert a mechanic, number, or condition that no pinned text
  supports and that is not labelled as an engine-design choice?
- wrong-basis: is a "printed" basis actually derived, or a "derived" basis actually engine-design?
- not-one-ruling: does the card bundle decisions that would reasonably get different verdicts?

Return the structured verdict. Be concrete: every problem must carry the quote, file, or ruling id
that proves it.
${PRIME}`
}

function minePrompt(batch) {
  return `You are mining open rules questions from a batch of pinned Draw Steel artifacts for the
engine "engarde". Read ${batch.sourcesPath} — a JSON array of {id, sourcePath, text} with the
VERBATIM text of ${batch.artifactIds.length} artifacts. Read every artifact in full.

Navigational hints from the corpus map (not authoritative, DEC-0013): ${JSON.stringify(batch.mapHints)}

For each artifact, ask: if a program had to EXECUTE this text during a fight, what would it need
to know that the text does not say, or says two ways? Those are silences. For each candidate:
1. Search the pin for an answer first — other artifacts under ${REPO}/.artifacts/canon/bundles/
   (grep the .bundle.json files), and the glossary/chapter artifacts. Record what you searched.
2. Check ${REPO}/docs/canon-rulings.md for an existing ruling and ${REPO}/packages/engine/src for
   an existing implementation. Record what you found.
3. Apply CONV-0004: a printed "can" with no cost, limit, or downside is NOT a decision point —
   it collapses to an automatic step. Do not report it.
4. Spatial facts (distance, line of effect, squares, position) are the table's to assert
   (DEC-0011); report them only as kind=table-fact and only if the engine would still need a
   NON-spatial answer.

Report only what survives. Fewer, real silences beat many speculative ones. Write each question
for a judge who did none of the work.
${PRIME}`
}

function mergePrompt(allSilences) {
  return `You are consolidating ${allSilences.length} mined open questions about Draw Steel rules into
Gate-3 ruling cards for the user to rule on. Input:
${JSON.stringify(allSilences, null, 1)}

Rules:
- Collapse questions that are the SAME decision into one card (oneRuling=true) listing every
  original question as a subQuestion and the union of source artifact ids.
- Keep genuinely different decisions on different cards, even in the same family.
- You are the first skeptic, not a clerk. For EVERY question, before keeping it, check and record:
  (a) does the pinned text answer it — read the cited artifacts under ${REPO}/.artifacts/canon/bundles/
      and grep neighbouring rule artifacts; (b) does ${REPO}/docs/canon-rulings.md already settle it
      (name the R-id); (c) does ${REPO}/packages/engine/src already implement or deterministically
      derive it (name file:function); (d) is it an engine-design or data-model choice rather than a
      question about what the rules MEAN — those belong to the Lead (CONV-0007), not to the user;
      (e) is it purely a table fact under DEC-0011. Any yes → drop it, with the proof.
  In the first run of this loop a merge that dropped nothing sent 18 cards forward and the
  skeptics refuted 15 of them on exactly these grounds. Expect to drop most candidates.
- A kept card must be a book SILENCE or a two-reading AMBIGUITY whose different readings produce
  different table outcomes. Label kind honestly; do not keep engine-design as 'ambiguity'.
- Order cards so that the ones a playable session needs first come first.
- Write every card question for a judge who did none of the work: the decision first, terms defined.
${PRIME}`
}


const RECUT_SCHEMA = {
  type: 'object',
  required: ['residue', 'settledElsewhere'],
  properties: {
    residue: {
      type: 'array',
      items: {
        type: 'object',
        required: ['question', 'sourceArtifactIds', 'group', 'kind', 'whyOpen', 'pinChecked', 'engineChecked'],
        properties: {
          question: { type: 'string', description: 'ONE decision, written for a judge who did none of the work: the decision first, terms defined, no project shorthand.' },
          sourceArtifactIds: { type: 'array', items: { type: 'string' }, description: 'Pinned artifact ids whose text raises it. Only ids you read.' },
          group: { type: 'string' },
          kind: { type: 'string', enum: ['silence', 'ambiguity'], description: 'Only genuine book silences or two-reading ambiguities survive a recut. Engine-design choices are the Lead\'s (CONV-0007) and table facts are DEC-0011; do not emit them.' },
          whyOpen: { type: 'string' },
          pinChecked: { type: 'string' },
          engineChecked: { type: 'string' },
          candidateDefault: { type: 'string' },
        },
      },
    },
    settledElsewhere: { type: 'array', items: { type: 'object', required: ['topic', 'settledBy'], properties: { topic: { type: 'string' }, settledBy: { type: 'string', description: 'Ruling id, DEC/CONV id, printed quote, or engine file:function that settles it.' } } }, description: 'Everything from the refuted card that does NOT need the user, with what settles it.' },
  },
}

function recutPrompt(item) {
  return `A proposed Gate-3 ruling card for the Draw Steel engine "engarde" was REFUTED by a skeptic. Your job is
to salvage only what genuinely needs the user's verdict, as new single-decision questions, and to
account for everything else.

Read the card file ${item.cardPath} (question, sub-questions, VERBATIM pinned text).
Read ${item.answersPath}: the entry in "answers" with qid ${item.qid} is the refuted proposal; the
entries in "findings" with qid ${item.qid} are the skeptic's objections; "skepticSummaries" has the
skeptic's summary. Take the objections seriously — they were checked against the pin and the engine.

Rules for what survives:
- Only a genuine book SILENCE or a two-reading AMBIGUITY about what the rules mean. Engine-design
  and data-model choices belong to the Lead (CONV-0007) — list them under settledElsewhere as
  "engine-design (Lead)". Spatial/table facts are DEC-0011 — settledElsewhere.
- Anything the pin answers, an existing ruling (${REPO}/docs/canon-rulings.md) settles, or the engine
  already implements (${REPO}/packages/engine/src) — settledElsewhere with the proof.
- One decision per question. If two sub-questions would plausibly get different verdicts, they are
  two questions.
- Fewer is better. Zero residue is a legitimate answer.
${PRIME}`
}

// ---- run -----------------------------------------------------------------
let cards = args.cards || []
let mined = null

if (args.mode === 'mine') {
  phase('Mine')
  const batches = args.batches || []
  log(`mining ${batches.length} batches`)
  const results = await parallel(batches.map(b => () =>
    agent(minePrompt(b), { ...MODEL_OPTS, label: `mine:${b.batch}`, phase: 'Mine', schema: SILENCES_SCHEMA })))
  const flat = results.filter(Boolean).flatMap((r, i) =>
    r.silences.map(s => Object.assign({ batch: batches[i].batch }, s)))
  const examined = results.filter(Boolean).flatMap(r => r.examined)
  const dead = batches.filter((_, i) => !results[i]).map(b => b.batch)
  if (dead.length) log(`WARNING: ${dead.length} mining agent(s) returned nothing: ${dead.join(', ')}`)
  log(`mined ${flat.length} candidate silences over ${examined.length} artifacts`)

  phase('Merge')
  const merged = flat.length
    ? await agent(mergePrompt(flat), { ...MODEL_OPTS, label: 'merge', phase: 'Merge', schema: MERGE_SCHEMA })
    : { cards: [], dropped: [] }
  mined = { raw: flat, examined, merged, deadBatches: dead }
  log(`merged into ${merged.cards.length} cards, dropped ${merged.dropped.length}`)
  // Mining stops here: the Lead materializes cards/<qid>.json deterministically
  // (qid = sha256(question)[:12]) and re-invokes in verify mode.
  return { mode: 'mine', mined }
}


if (args.mode === 'recut') {
  phase('Recut')
  const items = args.recut || []
  log(`recutting ${items.length} refuted cards`)
  const results = await parallel(items.map(it => () =>
    agent(recutPrompt(it), { ...MODEL_OPTS, label: `recut:${it.qid}`, phase: 'Recut', schema: RECUT_SCHEMA })))
  const residue = results.filter(Boolean).flatMap((r, i) =>
    r.residue.map(q => Object.assign({ fromCard: items[i].qid }, q)))
  const settled = results.filter(Boolean).flatMap((r, i) =>
    r.settledElsewhere.map(x => Object.assign({ fromCard: items[i].qid }, x)))
  const dead = items.filter((_, i) => !results[i]).map(it => it.qid)
  if (dead.length) log(`WARNING: ${dead.length} recut agent(s) returned nothing: ${dead.join(', ')}`)
  log(`residue ${residue.length} questions; ${settled.length} topics settled elsewhere`)
  // Sibling refuted cards routinely yield the same residue question twice (first run: 2 of 8
  // deck-2b cards were duplicates). One merge pass dedupes and re-applies the skeptic checks.
  let finalResidue = residue, mergeDropped = []
  if (residue.length > 1) {
    phase('Merge')
    const merged = await agent(mergePrompt(residue), { ...MODEL_OPTS, label: 'merge:residue', phase: 'Merge', schema: MERGE_SCHEMA })
    if (merged) {
      finalResidue = merged.cards.map(c => Object.assign({}, c, {
        fromCard: (residue.find(r => c.subQuestions.includes(r.question) || r.question === c.question) || {}).fromCard,
      }))
      mergeDropped = merged.dropped
      log(`residue merged: ${residue.length} → ${finalResidue.length} cards, ${mergeDropped.length} dropped`)
    }
  }
  return { mode: 'recut', residue: finalResidue, rawResidue: residue, settledElsewhere: settled, mergeDropped, dead }
}

phase('Answer')
log(`answering ${cards.length} cards, ${REFUTERS} skeptic(s) each`)
const results = await pipeline(
  cards,
  card => agent(answerPrompt(card), { ...MODEL_OPTS, label: `answer:${card.qid}`, phase: 'Answer', schema: ANSWER_SCHEMA }),
  async (answer, card) => {
    if (!answer) return { card, answer: null, refutations: [] }
    const votes = await parallel(Array.from({ length: REFUTERS }, (_, i) => () =>
      agent(refutePrompt(card, answer, i + 1), { ...MODEL_OPTS, label: `refute:${card.qid}#${i + 1}`, phase: 'Refute', schema: REFUTE_SCHEMA })))
    return { card, answer, refutations: votes.filter(Boolean) }
  },
)

const out = results.filter(Boolean)
const answers = out.filter(r => r.answer).map(r => ({
  qid: r.card.qid,
  question: r.card.question,
  answer: r.answer.answer,
  basis: r.answer.basis,
  evidence: r.answer.evidence,
  reasoning: r.answer.reasoning,
  confidence: r.answer.confidence,
  consequenceIfWrong: r.answer.consequenceIfWrong,
  alternatives: r.answer.alternatives,
  collapsedSubQuestions: r.answer.collapsedSubQuestions || [],
  existingRulings: r.answer.existingRulings || [],
}))
const findings = out.flatMap(r => r.refutations.flatMap((v, i) =>
  (v.refuted ? v.problems : []).map(p => ({
    qid: r.card.qid,
    question: r.card.question,
    skeptic: i + 1,
    kind: p.kind,
    problem: p.problem,
    correctedBasis: p.correctedBasis,
    fabricatedQuote: v.fabricatedQuote,
  }))))
const skepticSummaries = out.map(r => ({
  qid: r.card.qid,
  refutedVotes: r.refutations.filter(v => v.refuted).length,
  votes: r.refutations.length,
  summaries: r.refutations.map(v => v.summary),
}))
const unanswered = cards.filter(c => !out.find(r => r.card.qid === c.qid && r.answer)).map(c => c.qid)
if (unanswered.length) log(`WARNING: ${unanswered.length} card(s) got no answer: ${unanswered.join(', ')}`)
log(`answers=${answers.length} findings=${findings.length}`)
return { mode: 'verify', answers, findings, skepticSummaries, unanswered }
