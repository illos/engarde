import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { type SourceLock, SourceLockSchema } from './schemas.js';

const execFileAsync = promisify(execFile);

export async function readSourceLock(path: string): Promise<SourceLock> {
  return SourceLockSchema.parse(JSON.parse(await readFile(path, 'utf8')));
}

export interface SourceStatus {
  head: string;
  pinnedCommit: string;
  upstreamHead?: string;
  clean: boolean;
  checkoutMatchesPin: boolean;
  upstreamMatchesPin?: boolean;
}

export async function inspectSourceStatus(
  sourceRoot: string,
  lock: SourceLock,
  checkUpstream = false,
): Promise<SourceStatus> {
  const { stdout } = await execFileAsync('git', ['-C', sourceRoot, 'rev-parse', 'HEAD']);
  const workingTree = await execFileAsync('git', [
    '-C',
    sourceRoot,
    'status',
    '--porcelain',
    '--untracked-files=all',
  ]);
  const head = stdout.trim();
  const status: SourceStatus = {
    head,
    pinnedCommit: lock.commit,
    clean: workingTree.stdout.trim().length === 0,
    checkoutMatchesPin: head === lock.commit,
  };

  if (checkUpstream) {
    const result = await execFileAsync('git', ['ls-remote', lock.remote, 'refs/heads/main']);
    const upstreamHead = result.stdout.trim().split(/\s+/)[0];
    if (!upstreamHead) throw new Error(`could not resolve upstream main for ${lock.remote}`);
    status.upstreamHead = upstreamHead;
    status.upstreamMatchesPin = upstreamHead === lock.commit;
  }

  return status;
}
