#!/usr/bin/env python3
"""Mechanical verbatim-quote checker.

The prime directive of this project is that no rule text is ever invented or
paraphrased-as-quoted. Models cannot be trusted to self-check that. This does
it by string search: every "quoted fragment" in a claim's evidence must appear
VERBATIM in one of the supplied source corpora, or it is reported.

Normalisation is deliberately minimal — whitespace runs collapse and smart
quotes fold to ASCII, because those differ by transport, not by meaning.
Nothing else is forgiven: a changed word is a finding.
"""
import json, re, sys

def norm(t):
    t = (t or '')
    for a, b in [(chr(8217), "'"), (chr(8216), "'"), (chr(8220), '"'), (chr(8221), '"'),
                 (chr(8212), '--'), (chr(8211), '-'), (chr(160), ' '), (chr(8230), '...')]:
        t = t.replace(a, b)
    # The corpus is markdown riddled with cross-reference links. Quoting the
    # DISPLAY TEXT of [label](scc.v1:...) is legitimate and was declared by the
    # quoting agents; so is dropping ** emphasis. Neither changes a word.
    t = re.sub(r'\[([^\]]*)\]\([^)]*\)', r'\1', t)
    t = t.replace('**', '')
    return re.sub(r'\s+', ' ', t).strip()

def fragments(evidence):
    """Pull out double-quoted spans; those are the load-bearing claims."""
    out = []
    for f in re.findall(r'"([^"]{12,})"', evidence or ''):
        # Skip the separator text BETWEEN two quotes (" · source-id: ") — it is
        # not a claim, and counting it produced false NOT FOUND findings.
        if re.match(r'^\s*[·|,;]?\s*[\w.\-/#]+\s*:?\s*$', f):
            continue
        out.append(f)
    return out

def check(fragment, corpora):
    f = norm(fragment)
    for name, text in corpora.items():
        if f in text:
            return ('EXACT', name)
    # near-miss: find the best window to show what it should have said
    best, score, where = None, 0.0, None
    import difflib
    words = f.split()
    for name, text in corpora.items():
        for m in re.finditer(re.escape(words[0]) if words else '', text):
            w = text[m.start():m.start() + len(f) + 60]
            r = difflib.SequenceMatcher(None, f, w[:len(f)]).ratio()
            if r > score:
                best, score, where = w[:len(f) + 20], r, name
    return ('MISQUOTE' if score > 0.6 else 'NOT FOUND', f'{where}: {best!r}' if best else '')

def main():
    claims = json.load(open(sys.argv[1]))
    corpora = {}
    for p in sys.argv[2:]:
        d = json.load(open(p))
        rows = d if isinstance(d, list) else d.get('rows', [])
        for r in rows:
            if isinstance(r, dict) and 'text' in r:
                corpora[r.get('id', p)] = norm(r['text'])
        if isinstance(d, dict) and 'text' not in str(type(d)):
            corpora[p] = norm(json.dumps(d))
    bad = 0
    for c in claims:
        frs = fragments(c.get('evidence', ''))
        results = [(f, *check(f, corpora)) for f in frs]
        prob = [r for r in results if r[1] != 'EXACT']
        flag = 'OK  ' if not prob else 'FAIL'
        print(f'\n[{flag}] {c["question"][:88]}')
        print(f'       fragments: {len(frs)}  exact: {len(frs)-len(prob)}  problems: {len(prob)}')
        for f, verdict, where in prob:
            bad += 1
            print(f'       {verdict}: "{f[:110]}"')
            if where:
                print(f'         source has: {where[:190]}')
    print(f'\n=== {bad} problem fragments across {len(claims)} claims ===')

if __name__ == '__main__':
    main()
