#!/usr/bin/env python3
"""Join answered questions -> the SHORT list that actually needs the user.

The point of the answering fleet is to remove work, not relocate it. So the
review surface carries ONLY what cannot be settled from rule text:

  * basis "needs-user"                    — a real open choice
  * anything the refuter downgraded to it — the answer did not hold up
  * anything with a fabricated quote      — untrustworthy, must be redone

Everything else (printed / derived / engine-design that survived refutation)
goes to a ledger file, readable but not a queue.

usage: build_ruling_set.py <answers.json> <silences.json> <out-review.json> <out-ledger.json>
"""
import json, sys, difflib, re

def main():
    ans_p, sil_p, out_review, out_ledger = sys.argv[1:5]
    data = json.load(open(ans_p))
    answers = {a['question']: a for a in data['answers']}

    # The refuting agents often PARAPHRASE the question they are refuting, so an
    # exact key join silently drops findings — which would hand the user a
    # falsely-short list. Fuzzy-join every finding to its nearest question and
    # report anything that does not land confidently.
    keys = list(answers.keys())
    norm = lambda t: re.sub(r'[^a-z0-9 ]', ' ', (t or '').lower())
    findings, unmatched = {}, []
    for f in data.get('findings', []):
        if f['question'] in answers:
            findings[f['question']] = f
            continue
        best, score = None, 0.0
        for k in keys:
            r = difflib.SequenceMatcher(None, norm(f['question']), norm(k)).ratio()
            # tokens shared with the bracketed provenance tag are strong evidence
            ta = set(re.findall(r'[A-Za-z]+ ?\d+', f['question']))
            tb = set(re.findall(r'[A-Za-z]+ ?\d+', k))
            if ta and ta & tb:
                r += 0.15
            if r > score:
                best, score = k, r
        # 0.45 was too loose: it force-matched paraphrased findings onto
        # unrelated questions, mislabelling innocent rows AND leaving the real
        # ones unflagged in the settled pile. Report, never guess.
        if score >= 0.62:
            findings[best] = f
        else:
            unmatched.append((round(score, 2), f['question']))
    if unmatched:
        print(f'  WARNING: {len(unmatched)} findings could not be joined:')
        for sc, q in unmatched:
            print(f'    [{sc}] {q[:110]}')
    silences = json.load(open(sil_p))

    review, ledger = [], []
    for q in silences:
        a = answers.get(q['question'])
        if not a:
            q['basis'] = 'needs-user'
            q['proposedAnswer'] = ''
            q['unanswered'] = True
            review.append(q)
            continue
        f = findings.get(q['question'])
        basis = f['correctedBasis'] if f else a['basis']
        row = dict(q)
        row.update({'proposedAnswer': a['answer'], 'basis': basis,
                    'evidence': a['evidence'], 'reasoning': a['reasoning'],
                    'confidence': a['confidence'],
                    'consequenceIfWrong': a['consequenceIfWrong'],
                    'refuted': bool(f),
                    'refutation': f['problem'] if f else '',
                    'fabricatedQuote': bool(f and f.get('fabricatedQuote'))})
        if basis == 'needs-user' or row['fabricatedQuote']:
            review.append(row)
        else:
            ledger.append(row)

    # highest-stakes first: fabricated, then refuted, then low confidence
    review.sort(key=lambda r: (not r.get('fabricatedQuote'), not r.get('refuted'),
                               {'low': 0, 'medium': 1, 'high': 2}.get(r.get('confidence'), 1)))
    json.dump(review, open(out_review, 'w'), indent=1)
    json.dump({'schema': 'engarde-ruling-ledger-v1', 'settled': len(ledger),
               'rows': ledger}, open(out_ledger, 'w'), indent=1)
    print(f'review (needs you): {len(review)}   ledger (settled by agents): {len(ledger)}')
    from collections import Counter
    print('  ledger basis:', dict(Counter(r['basis'] for r in ledger)))
    print('  review reasons:', dict(Counter(
        'fabricated' if r.get('fabricatedQuote') else 'refuted' if r.get('refuted')
        else 'unanswered' if r.get('unanswered') else 'needs-user' for r in review)))

if __name__ == '__main__':
    main()
