#!/usr/bin/env python3
"""Card-review surface generator for batch canon rulings.

Takes a questions JSON + a sources JSON and emits ONE self-contained HTML file
(no network, no build step) that can be served over the tailnet for the user to
rule on a batch of questions in a sitting.

Design constraints, learned the hard way:
  * SELF-CONTAINED FOR THE JUDGE. Every card embeds the verbatim source text it
    is asking about. The judge must never have to go find the evidence.
  * DECISION FIRST. The question is the headline; provenance is secondary.
  * NO PROJECT SHORTHAND. No slugs, no internal IDs in the reading path.
  * Progress survives a reload (localStorage) and exports as a JSON blob.

usage: ruling_surface.py <questions.json> <sources.json> <out.html> [--title T]
"""
import hashlib
import html
import json
import os
import sys
import tempfile

from build_ruling_set import stable_qid

def esc(s): return html.escape(s or '', quote=True)

def load_json(path):
    with open(path, encoding="utf-8") as handle:
        return json.load(handle)


def write_atomic(path, text):
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, temporary = tempfile.mkstemp(prefix=".ruling-surface-", suffix=".html", dir=directory)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
        os.replace(temporary, path)
    except BaseException:
        try:
            os.unlink(temporary)
        except FileNotFoundError:
            pass
        raise


def prepare(questions_data, sources_data):
    if not isinstance(questions_data, list):
        raise ValueError("questions must be an array")
    if not isinstance(sources_data, list):
        raise ValueError("sources must be an array")

    sources = {}
    for index, source in enumerate(sources_data):
        if not isinstance(source, dict) or not isinstance(source.get("id"), str):
            raise ValueError(f"source {index} needs a string id")
        if source["id"] in sources:
            raise ValueError(f"duplicate source id: {source['id']}")
        if not isinstance(source.get("text"), str) or not source["text"].strip():
            raise ValueError(f"source {source['id']} needs nonblank string text")
        sources[source["id"]] = source

    prepared = []
    seen_qids = set()
    for index, question_row in enumerate(questions_data):
        if not isinstance(question_row, dict) or not isinstance(question_row.get("question"), str):
            raise ValueError(f"question {index} needs string question")
        row = dict(question_row)
        qid = stable_qid(row["question"])
        if row.get("qid") not in (None, qid):
            raise ValueError(
                f"question {index} has non-canonical qid {row.get('qid')!r}; expected {qid}"
            )
        if qid in seen_qids:
            raise ValueError(f"duplicate question/qid: {qid}")
        seen_qids.add(qid)
        row["qid"] = qid

        source_ids = row.get("sourceArtifactIds")
        if (
            not isinstance(source_ids, list)
            or not source_ids
            or not all(isinstance(sid, str) for sid in source_ids)
        ):
            raise ValueError(f"question {qid} sourceArtifactIds must be a non-empty array of strings")
        missing = [sid for sid in source_ids if sid not in sources]
        if missing:
            raise ValueError(f"question {qid} has missing source artifacts: {', '.join(missing)}")
        incomplete = [
            sid
            for sid in source_ids
            if not str(sources[sid].get("versionSha256", "")).strip()
            or not str(sources[sid].get("sourcePath", "")).strip()
        ]
        if incomplete:
            raise ValueError(f"question {qid} has incomplete source provenance: {', '.join(incomplete)}")
        row["sources"] = [
            {
                "id": sid,
                "version": sources[sid].get("versionSha256", "")[:12],
                "path": sources[sid].get("sourcePath", ""),
                "text": sources[sid]["text"],
            }
            for sid in source_ids
        ]
        prepared.append(row)
    return prepared


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    if len(argv) < 3:
        print(
            "usage: ruling_surface.py <questions.json> <sources.json> <out.html> [--title T]",
            file=sys.stderr,
        )
        return 2
    qs_path, src_path, out_path = argv[0], argv[1], argv[2]
    title = 'Canon rulings'
    if '--title' in argv:
        title_index = argv.index('--title')
        if title_index + 1 >= len(argv):
            print("ERROR: --title needs a value", file=sys.stderr)
            return 2
        title = argv[title_index + 1]

    try:
        questions = prepare(load_json(qs_path), load_json(src_path))
    except (OSError, ValueError, json.JSONDecodeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    payload = json.dumps(questions, ensure_ascii=False)
    doc_key = hashlib.sha256(payload.encode()).hexdigest()[:16]

    tpl = TEMPLATE.replace('__TITLE__', esc(title))
    tpl = tpl.replace('__DOCKEY__', doc_key)
    tpl = tpl.replace('__DATA__', payload.replace('</', '<\\/'))
    write_atomic(out_path, tpl)
    print(f'wrote {out_path}  questions={len(questions)}  docKey={doc_key}')
    return 0

TEMPLATE = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>__TITLE__</title>
<style>
:root{
  --bg:#12100e; --panel:#1b1815; --line:#332d27; --ink:#f0ebe4; --dim:#a2978a;
  --accent:#c9a227; --ok:#5f9e6b; --no:#c05f5f; --dir:#5f83c0; --defer:#7a6f63;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);
  font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
header{background:var(--panel);border-bottom:1px solid var(--line);padding:14px 20px}
.hrow{display:flex;gap:14px;align-items:center;flex-wrap:wrap}
h1{font:600 17px/1.2 ui-sans-serif,system-ui;margin:0;letter-spacing:.01em}
.bar{flex:1;min-width:160px;height:7px;background:#2a2521;border-radius:4px;overflow:hidden}
.bar>i{display:block;height:100%;background:var(--accent);width:0;transition:width .25s}
.count{font:13px ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--dim);white-space:nowrap}
button,select,input{font:inherit;color:inherit;background:#241f1b;border:1px solid var(--line);
  border-radius:7px;padding:7px 11px;cursor:pointer}
button:hover{border-color:var(--accent)}
input[type=search]{cursor:text;min-width:190px}
main{max-width:900px;margin:0 auto;padding:20px 20px 40px}
.card{background:var(--panel);border:1px solid var(--line);border-left:4px solid var(--line);
  border-radius:11px;padding:18px 20px;margin:0 0 16px;scroll-margin-top:10px}
.card.done{border-left-color:var(--ok);opacity:.62}
.card.cur{border-left-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.q{font:500 19px/1.45 ui-sans-serif,system-ui;margin:0 0 12px}
.qbody p,.txt p,.why p,.cons p,.subq p{margin:0 0 10px;font:15.5px/1.6 ui-sans-serif,system-ui}
.qbody{color:#d8d0c4;margin:0 0 6px}
b.lead{color:var(--accent);font-weight:600}
.ans .txt p{font-size:16.5px;color:var(--ink)}
.ans details.why{margin:10px 0 0;border:1px solid #3c4a30;border-radius:8px}
.ans details.why>summary{padding:8px 12px;background:#1a2016;cursor:pointer;font:12px ui-monospace,Menlo,monospace;color:#8fbf95}
.ans details.why>div{padding:10px 14px 2px}
.ans .why p{color:#b9c9ac}
ul.ev{margin:4px 0 8px;padding-left:18px;font:14px/1.55 ui-serif,Georgia,serif;color:#cfd8c4}
ul.ev li{margin:4px 0}
ul.ev .src{font:11px ui-monospace,Menlo,monospace;color:var(--dim);display:block}
.ans .cons{margin-top:10px}
.ans .cons p{color:var(--dim);font-size:14px}
.meta{font:12px ui-monospace,Menlo,monospace;color:var(--dim);margin-bottom:14px;
  display:flex;gap:12px;flex-wrap:wrap}
.tag{background:#241f1b;border:1px solid var(--line);border-radius:5px;padding:2px 7px}
.tag.one{border-color:var(--accent);color:var(--accent)}
details{margin:12px 0;border:1px solid var(--line);border-radius:8px;overflow:hidden}
details>summary{padding:9px 13px;background:#241f1b;cursor:pointer;
  font:12px ui-monospace,Menlo,monospace;color:var(--dim)}
details[open]>summary{border-bottom:1px solid var(--line)}
pre.src{margin:0;padding:15px 17px;white-space:pre-wrap;word-wrap:break-word;
  font:15px/1.65 ui-serif,Georgia,"Times New Roman",serif;background:#171310;color:#e6ded2;
  max-height:460px;overflow:auto}
.srchead{font:11px ui-monospace,Menlo,monospace;color:var(--dim);padding:8px 17px 0;background:#171310}
.ans{background:#1d2318;border:1px solid #3c4a30;border-left:4px solid var(--ok);
  border-radius:9px;padding:15px 17px;margin:14px 0}
.ans .lbl{font:11px ui-monospace,Menlo,monospace;color:#8fbf95;text-transform:uppercase;
  letter-spacing:.1em;margin-bottom:7px}
.ans .txt{font:16.5px/1.55 ui-sans-serif,system-ui;margin:0 0 10px}
.ans .why{font:14px/1.55 ui-sans-serif,system-ui;color:#b9c9ac;margin:0 0 8px}
.ans .ev{font:13.5px/1.6 ui-serif,Georgia,serif;color:#cfd8c4;border-left:2px solid #3c4a30;
  padding-left:11px;margin:9px 0 0}
.ans .cons{font:12.5px ui-monospace,Menlo,monospace;color:var(--dim);margin-top:10px}
.basis{display:inline-block;font:11px ui-monospace,Menlo,monospace;padding:2px 7px;
  border-radius:5px;margin-left:8px;vertical-align:middle}
.basis.printed{background:#2a4a2f;color:#a8dfae}
.basis.derived{background:#3d4326;color:#dbe08f}
.basis.engine-design{background:#26384a;color:#9fc8e8}
.basis.needs-user{background:#4a2f26;color:#e8b39f}
.verdicts{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0 10px}
.subq ul{margin:0;padding:10px 13px 10px 30px;font:14.5px/1.5 ui-sans-serif,system-ui;color:#d8d0c4}
.tag.refuted{border-color:var(--no);color:#e8a0a0}
.ref{background:#2a1c1a;border:1px solid #5a3532;border-left:4px solid var(--no);border-radius:9px;padding:15px 17px;margin:14px 0}
.ref .lbl{font:11px ui-monospace,Menlo,monospace;color:#e8a0a0;text-transform:uppercase;letter-spacing:.1em;margin-bottom:7px}
.ref ul{margin:0;padding-left:20px;font:14.5px/1.55 ui-sans-serif,system-ui;color:#e6d3cf}
.ref li{margin:6px 0}
.cons ul{margin:4px 0 0;padding-left:20px}
.subq li{margin:4px 0}
.v{border-radius:7px;padding:8px 14px;border:1px solid var(--line);background:#241f1b;font-size:14px}
.v.sel[data-v=yes]{background:var(--ok);border-color:var(--ok);color:#0d0d0d;font-weight:600}
.v.sel[data-v=no]{background:var(--no);border-color:var(--no);color:#0d0d0d;font-weight:600}
.v.sel[data-v=director]{background:var(--dir);border-color:var(--dir);color:#0d0d0d;font-weight:600}
.v.sel[data-v=defer]{background:var(--defer);border-color:var(--defer);color:#0d0d0d;font-weight:600}
.v.sel[data-v=source]{background:var(--accent);border-color:var(--accent);color:#0d0d0d;font-weight:600}
textarea{width:100%;min-height:74px;background:#171310;border:1px solid var(--line);
  border-radius:8px;padding:11px 13px;color:var(--ink);font:15px/1.55 ui-sans-serif,system-ui;resize:vertical}
.kbd{font:11px ui-monospace,Menlo,monospace;color:var(--dim);opacity:.75}
footer{border-top:1px solid var(--line);padding:16px 20px 28px;
  font:12px ui-monospace,Menlo,monospace;color:var(--dim);
  display:flex;gap:16px;flex-wrap:wrap;align-items:center}
.keys{display:flex;gap:16px;flex-wrap:wrap}
@media (max-width:720px){
  .keys{display:none}
  main{padding:14px 12px 32px}
  header{padding:12px 14px}
  .card{padding:15px 14px;border-radius:9px}
  .q{font-size:17px}
  pre.src{font-size:14.5px;padding:12px 13px;max-height:340px}
  .v{padding:10px 13px}
}
.groupname{font:600 13px ui-sans-serif;color:var(--accent);text-transform:uppercase;
  letter-spacing:.09em;margin:34px 0 12px;padding-bottom:7px;border-bottom:1px solid var(--line)}
</style></head><body>
<header><div class="hrow">
  <h1>__TITLE__</h1>
  <div class="bar"><i id="bar"></i></div>
  <span class="count" id="count">0 / 0</span>
  <select id="grp"><option value="">all groups</option></select>
  <input type="search" id="find" placeholder="filter text…">
  <label class="count"><input type="checkbox" id="only" style="cursor:pointer"> unruled only</label>
  <button id="exp">Export JSON</button>
</div></header>
<main id="main"></main>
<footer>
  <div class="keys">
    <span><b>j</b>/<b>k</b> next / prev</span>
    <span><b>y</b> yes · <b>n</b> no · <b>d</b> director's call · <b>x</b> defer · <b>s</b> need source</span>
    <span><b>Enter</b> note</span>
  </div>
  <span id="stat"></span>
  <button id="exp2">Export JSON</button>
</footer>
<script>
const DATA = __DATA__;
const KEY = 'rulings:__DOCKEY__';
let state = JSON.parse(localStorage.getItem(KEY) || '{}');
let cur = 0, view = [];
const save = () => localStorage.setItem(KEY, JSON.stringify(state));
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const escape_ = s => (s||'').replace(/[&<>"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]));
// Prose formatter: paragraphs on blank lines, bold lead-in labels, numbered "Inference N"/"Step N"
// and "(1) … (2) …" runs as list items. Text is escaped first; only our own tags are inserted.
const LEADS = /^((?:DECISION|RULING(?: \(proposed\))?|Ruling|Terms|Term|Reading [A-Z]|Alternative(?:s)?|Candidate default|Engine consequence|Engine posture|Not decided here|What the book says|What this changes at the table|Why (?:this|it) matters|Why this is a two-reading ambiguity|Both readings|Corollary|Bookkeeping note(?: for the judge)?|Existing rulings|Scope|Inference \d+(?: \([^)]*\))?|Step \d+(?: \([^)]*\))?|Part \d+|Reading [A-Z] \([^)]*\))\s*[:—-])\s*/;
function fmtPara(t) {
  let h = escape_(t.trim());
  h = h.replace(/^DECISION:\s*/, '');
  const m = h.match(LEADS);
  if (m) h = '<b class="lead">' + m[1].replace(/\s*[:—-]$/, '') + '</b> ' + h.slice(m[0].length);
  // inline (1) (2) (3) runs → line breaks
  if ((h.match(/\(\d\)/g) || []).length >= 2) h = h.replace(/\s+\((\d)\)\s+/g, '<br>($1) ');
  return h;
}
// Labels the agents often run on mid-paragraph; break before them so each starts a paragraph.
const INLINE_LEADS = /\s+(?=(?:Terms|Reading [A-Z](?: \([^)]*\))?|Candidate default|Alternative|Engine consequence|Engine posture|Not decided here|What the book says|What this changes at the table|Why (?:this|it) matters|Corollary|Bookkeeping note(?: for the judge)?|Inference \d+(?: \([^)]*\))?|Step \d+(?: \([^)]*\))?)\s*[:—-]\s)/g;
const splitLeads = t => (t || '').replace(/^DECISION:\s*/, '').replace(INLINE_LEADS, '\n\n');
const cap = h => h.replace(/^(<[^>]+>)*([a-z])/, (m, tag, ch) => (tag || '') + ch.toUpperCase());
function fmt(text, cls) {
  const wrap = document.createElement('div'); if (cls) wrap.className = cls;
  text = splitLeads(text);
  const paras = (text || '').split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
  const lines = paras.length === 1 ? paras[0].split(/\n/).map(x => x.trim()).filter(Boolean) : paras;
  lines.forEach(x => { const p = document.createElement('p'); p.innerHTML = fmtPara(x); wrap.appendChild(p); });
  return wrap;
}
function fmtEvidence(text) {
  const ul = document.createElement('ul'); ul.className = 'ev';
  (text || '').split(/\s+·\s+/).map(x => x.trim()).filter(Boolean).forEach(x => {
    const li = document.createElement('li');
    const m = x.match(/^([\w.\-]+\/[^:\s]+):\s*(.*)$/s);
    li.innerHTML = m ? '<span class="src">' + escape_(m[1]) + '</span> ' + escape_(m[2]) : escape_(x);
    ul.appendChild(li);
  });
  return ul;
}

const groups = [...new Set(DATA.map(q => q.group))];
const gsel = document.getElementById('grp');
groups.forEach(g => { const o = el('option'); o.value = g; o.textContent = g; gsel.appendChild(o); });

function render() {
  const main = document.getElementById('main');
  main.innerHTML = '';
  const g = gsel.value, f = document.getElementById('find').value.toLowerCase();
  const only = document.getElementById('only').checked;
  view = DATA.filter(q => (!g || q.group === g)
    && (!f || (q.question + ' ' + q.group).toLowerCase().includes(f))
    && (!only || !state[q.qid]?.verdict));
  let lastG = null;
  view.forEach((q, i) => {
    if (q.group !== lastG) { lastG = q.group; main.appendChild(el('div', 'groupname', escape_(q.group))); }
    const st = state[q.qid] || {};
    const c = el('article', 'card' + (st.verdict ? ' done' : '') + (i === cur ? ' cur' : ''));
    c.id = 'c' + q.qid;
    {
      const qtext = splitLeads(q.question.replace(/\s*\[[^\]]*\]\s*$/, ''));
      const parts = qtext.split(/\n\s*\n/).map(x => x.trim()).filter(Boolean);
      const head = el('p', 'q'); head.innerHTML = cap(fmtPara(parts[0] || qtext)); c.appendChild(head);
      if (parts.length > 1) c.appendChild(fmt(parts.slice(1).join('\n\n'), 'qbody'));
    }
    if (Array.isArray(q.subQuestions) && q.subQuestions.length) {
      const sq = el('details', 'subq'); sq.open = true;
      sq.appendChild(el('summary', null, 'What this one ruling settles — ' + q.subQuestions.length + ' printed cases'));
      const ul = el('ul');
      q.subQuestions.forEach(t => ul.appendChild(el('li', null, escape_(t))));
      sq.appendChild(ul); c.appendChild(sq);
    }
    const m = el('div', 'meta');
    if (q.oneRuling) m.appendChild(el('span', 'tag one', 'ONE RULING — settles several'));
    if (q.tags) m.appendChild(el('span', 'tag', escape_(q.tags)));
    if (q.gates) m.appendChild(el('span', 'tag', 'gates ' + escape_(q.gates)));
    m.appendChild(el('span', 'tag', escape_(q.verdictFromCorpus || 'unresolved')));
    if (q.refuted) m.appendChild(el('span', 'tag refuted', 'SKEPTIC REFUTED — ' + (q.findings || []).length + ' objection' + ((q.findings || []).length === 1 ? '' : 's')));
    c.appendChild(m);
    (q.sources || []).forEach((s, j) => {
      const d = el('details'); if (j === 0) d.open = true;
      d.appendChild(el('summary', null, 'Printed text — ' + escape_(s.id.split('/').slice(1).join('/'))));
      d.appendChild(el('div', 'srchead', escape_(s.path || '') + '  ·  version ' + escape_(s.version)));
      d.appendChild(el('pre', 'src', escape_(s.text)));
      c.appendChild(d);
    });
    if (q.proposedAnswer) {
      const a = el('div', 'ans');
      a.appendChild(el('div', 'lbl', 'Proposed ruling<span class="basis ' + escape_(q.basis) + '">' + escape_(q.basis) + '</span>'));
      a.appendChild(fmt(q.proposedAnswer, 'txt'));
      if (q.evidence) { a.appendChild(el('div', 'lbl', 'Printed evidence')); a.appendChild(fmtEvidence(q.evidence)); }
      if (q.reasoning) { const d = el('details', 'why'); d.appendChild(el('summary', null, 'Why this answer — the reasoning')); d.appendChild(fmt(q.reasoning)); a.appendChild(d); }
      if (q.consequenceIfWrong) { const d = el('div', 'cons'); d.appendChild(el('b', 'lead', 'If wrong')); d.appendChild(fmt(q.consequenceIfWrong)); a.appendChild(d); }
      if (Array.isArray(q.alternatives) && q.alternatives.length) {
        const alt = el('div', 'cons', 'Other defensible readings:');
        const ul = el('ul'); q.alternatives.forEach(t => ul.appendChild(el('li', null, escape_(t)))); alt.appendChild(ul); a.appendChild(alt);
      }
      c.appendChild(a);
    }
    if (q.refuted && Array.isArray(q.findings) && q.findings.length) {
      const r = el('div', 'ref');
      r.appendChild(el('div', 'lbl', 'Skeptic objections — why the Lead doubts this card'));
      const ul = el('ul');
      q.findings.forEach(f => ul.appendChild(el('li', null, fmtPara(f.problem))));
      r.appendChild(ul);
      c.appendChild(r);
    }
    if (Array.isArray(q.collapsedSubQuestions) && q.collapsedSubQuestions.length) {
      const d = el('details', 'subq');
      d.appendChild(el('summary', null, 'Already answered by the book or an existing ruling — ' + q.collapsedSubQuestions.length + ' (not for you to rule)'));
      const ul = el('ul');
      q.collapsedSubQuestions.forEach(x => ul.appendChild(el('li', null, '<b>' + escape_(x.subQuestion) + '</b><br>' + fmtPara(x.why))));
      d.appendChild(ul); c.appendChild(d);
    }
    const vs = el('div', 'verdicts');
    (q.proposedAnswer
      ? [['yes','Accept'],['no','Override'],['director',"Director's call"],['defer','Defer'],['source','Escalate']]
      : [['yes','Yes'],['no','No'],['director',"Director's call"],['defer','Defer'],['source','Need more source']])
      .forEach(([v, lab]) => {
        const b = el('button', 'v' + (st.verdict === v ? ' sel' : ''), lab);
        b.dataset.v = v;
        b.onclick = () => { setV(q.qid, v); };
        vs.appendChild(b);
      });
    c.appendChild(vs);
    const ta = el('textarea');
    ta.placeholder = q.proposedAnswer ? 'Only needed if you are overriding — say what the ruling should be instead.' : 'Ruling in your words — this is what gets recorded.';
    ta.value = st.note || '';
    ta.oninput = () => { state[q.qid] = Object.assign({}, state[q.qid], { note: ta.value, question: q.question, group: q.group }); save(); stat(); };
    c.appendChild(ta);
    main.appendChild(c);
  });
  stat();
}
function setV(qid, v) {
  const q = DATA.find(x => x.qid === qid);
  state[qid] = Object.assign({}, state[qid], { verdict: v, question: q.question, group: q.group, at: new Date().toISOString() });
  save(); render();
}
function stat() {
  const done = DATA.filter(q => state[q.qid]?.verdict).length;
  document.getElementById('count').textContent = done + ' / ' + DATA.length;
  document.getElementById('bar').style.width = (100 * done / DATA.length) + '%';
  document.getElementById('stat').textContent = 'showing ' + view.length + ' · ' + (DATA.length - done) + ' unruled';
}
function focus(i) {
  cur = Math.max(0, Math.min(view.length - 1, i));
  render();
  const c = document.getElementById('c' + view[cur]?.qid);
  if (c) c.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
    if (e.key === 'Escape') e.target.blur();
    return;
  }
  const k = e.key.toLowerCase();
  if (k === 'j') { focus(cur + 1); e.preventDefault(); }
  else if (k === 'k') { focus(cur - 1); e.preventDefault(); }
  else if (['y','n','d','x','s'].includes(k) && view[cur]) {
    const unruledOnly = document.getElementById('only').checked;
    setV(view[cur].qid, { y:'yes', n:'no', d:'director', x:'defer', s:'source' }[k]);
    // In unruled-only mode render() already removes the ruled card, so the
    // next card slides into the current index. Advancing again would skip it.
    focus(cur + (unruledOnly ? 0 : 1)); e.preventDefault();
  } else if (e.key === 'Enter' && view[cur]) {
    const c = document.getElementById('c' + view[cur].qid);
    c?.querySelector('textarea')?.focus(); e.preventDefault();
  }
});
document.getElementById('exp').onclick = () => {
  const rows = DATA.filter(q => state[q.qid]?.verdict || state[q.qid]?.note)
    .map(q => Object.assign({ qid: q.qid, question: q.question, group: q.group,
      sourceArtifactIds: (q.sources || []).map(s => s.id) }, state[q.qid]));
  const blob = new Blob([JSON.stringify({ schema: 'engarde-batch-rulings-v1',
    docKey: '__DOCKEY__', exportedAt: new Date().toISOString(),
    total: DATA.length, ruled: rows.length, rulings: rows }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rulings-__DOCKEY__.json'; a.click();
};
document.getElementById('exp2').onclick = () => document.getElementById('exp').click();
gsel.onchange = document.getElementById('find').oninput = document.getElementById('only').onchange = () => { cur = 0; render(); };
render();
</script></body></html>
'''

if __name__ == '__main__':
    raise SystemExit(main())
