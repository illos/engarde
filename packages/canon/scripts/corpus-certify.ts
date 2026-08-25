/**
 * Corpus certification gate (review follow-up 1 on the Effect pipeline).
 *
 * Problem: the corpus (.reference/ + .artifacts/) is gitignored, so the
 * exhaustive corpus-enabled suites skipIf-skip in CI and a merge can stay
 * green while rule semantics drift. This gate makes that impossible without
 * requiring CI to restore the corpus:
 *
 * - `pnpm corpus:certify` (dev box, corpus required): runs the canon
 *   package's full corpus-enabled test suite; on green, writes
 *   `packages/canon/config/corpus-certification.json` containing a digest of
 *   every tracked file under packages/canon and packages/engine (plus
 *   pnpm-lock.yaml) and the pinned corpus commit.
 * - `pnpm corpus:verify` (CI, no corpus needed): recomputes the digest from
 *   the checkout and fails if the stamp is missing or stale.
 *
 * Any change to rule-semantics code without a fresh green corpus run turns
 * CI red. Scope boundary: packages/canon + packages/engine own rule
 * semantics; hosts (backend/web) are covered by committed-fixture tests
 * that already run in CI.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const stampPath = join(repoRoot, 'packages/canon/config/corpus-certification.json');
const sourceLockPath = join(repoRoot, 'packages/canon/config/steelcompendium-source.json');
const manifestPath = join(
  repoRoot,
  '.artifacts/canon/campaign/accepted/final-campaign-manifest.json',
);

const DIGEST_ROOTS = ['packages/canon', 'packages/engine', 'pnpm-lock.yaml'];

function trackedFiles(): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...DIGEST_ROOTS], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  return out
    .split('\0')
    .filter((path) => path.length > 0 && path !== 'packages/canon/config/corpus-certification.json')
    .sort();
}

function treeDigest(): string {
  const hash = createHash('sha256');
  for (const path of trackedFiles()) {
    const file = join(repoRoot, path);
    if (!existsSync(file)) continue; // tracked but deleted in working tree
    const content = readFileSync(file);
    const contentHash = createHash('sha256').update(content).digest('hex');
    hash.update(`${path}\0${contentHash}\n`);
  }
  return hash.digest('hex');
}

function canonPin(): string {
  const lock = JSON.parse(readFileSync(sourceLockPath, 'utf8')) as { commit: string };
  return lock.commit;
}

function verify(): void {
  if (!existsSync(stampPath)) {
    console.error(
      'corpus-certification stamp missing. Run `pnpm corpus:certify` on a corpus-enabled checkout.',
    );
    process.exit(1);
  }
  const stamp = JSON.parse(readFileSync(stampPath, 'utf8')) as {
    schema: string;
    canonPin: string;
    treeDigest: string;
    certifiedAt: string;
  };
  const errors: string[] = [];
  if (stamp.schema !== 'engarde-corpus-certification-v1') {
    errors.push(`unknown stamp schema: ${stamp.schema}`);
  }
  if (stamp.canonPin !== canonPin()) {
    errors.push(`stamp pin ${stamp.canonPin} does not match source lock ${canonPin()}`);
  }
  const digest = treeDigest();
  if (stamp.treeDigest !== digest) {
    errors.push(
      `rule-semantics code (packages/canon, packages/engine, pnpm-lock.yaml) changed since the last green corpus-enabled run (${stamp.certifiedAt}). Run \`pnpm corpus:certify\` on a corpus-enabled checkout and commit the refreshed stamp.`,
    );
  }
  if (errors.length > 0) {
    for (const error of errors) console.error(`corpus-verify: ${error}`);
    process.exit(1);
  }
  console.log(`corpus-verify: stamp is current (certified ${stamp.certifiedAt}).`);
}

function certify(): void {
  if (!existsSync(manifestPath)) {
    console.error(
      `corpus-certify: accepted campaign manifest not found at ${manifestPath}; this command must run on a corpus-enabled checkout.`,
    );
    process.exit(1);
  }
  console.log('corpus-certify: running corpus-enabled canon suite…');
  const run = spawnSync('pnpm', ['exec', 'vitest', 'run'], {
    cwd: join(repoRoot, 'packages/canon'),
    stdio: 'inherit',
    env: {
      ...process.env,
      ENGARDE_CORPUS_ROOT: join(repoRoot, '.reference/steelcompendium'),
      ENGARDE_CANON_MANIFEST: manifestPath,
    },
  });
  if (run.status !== 0) {
    console.error('corpus-certify: corpus-enabled suite failed; stamp not written.');
    process.exit(run.status ?? 1);
  }
  const stamp = {
    schema: 'engarde-corpus-certification-v1',
    canonPin: canonPin(),
    treeDigest: treeDigest(),
    certifiedAt: new Date().toISOString(),
    suite: 'packages/canon corpus-enabled vitest run',
  };
  writeFileSync(stampPath, `${JSON.stringify(stamp, null, 2)}\n`, 'utf8');
  console.log(`corpus-certify: green — stamp written to ${stampPath}.`);
}

if (process.argv.includes('--verify')) verify();
else certify();
