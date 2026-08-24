#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { stdin, stdout } from 'node:process';
import { createInterface } from 'node:readline/promises';
import { loadArtifactRecords } from './bundle-io.js';
import { type PlayActor, createPlaySession } from './play.js';

/**
 * Headless play CLI (engine-plan 5.1) — a readline shell over the play
 * session. Works interactively for a human and over piped stdin for an
 * agent; the transcript (the reviewable artifact) can be written on exit.
 *
 * Usage:
 *   pnpm play --structured-bundles <dir> --chapter-bundles <dir>
 *     [--actor <id>=<recordId>]... [--seed <n>] [--transcript <out.json>]
 *
 * Default actors are the pilot trio (real corpus records).
 */

const DEFAULT_ACTORS: PlayActor[] = [
  { id: 'fury', recordId: 'mcdm.heroes.v1/class/fury' },
  { id: 'censor', recordId: 'mcdm.heroes.v1/class/censor' },
  {
    id: 'toxic-plants',
    recordId: 'mcdm.monsters.v1/dynamic-terrain.environmental-hazards/toxic-plants',
  },
];

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function argumentsNamed(name: string): string[] {
  const values: string[] = [];
  for (let index = 0; index < process.argv.length; index += 1) {
    if (process.argv[index] === `--${name}` && process.argv[index + 1]) {
      values.push(process.argv[index + 1] ?? '');
    }
  }
  return values;
}

function requiredArgument(name: string): string {
  const value = argument(name);
  if (!value) throw new Error(`missing required --${name}`);
  return value;
}

async function main(): Promise<void> {
  const roots = [
    resolve(requiredArgument('structured-bundles')),
    resolve(requiredArgument('chapter-bundles')),
  ];
  const actorArgs = argumentsNamed('actor');
  const actors: PlayActor[] =
    actorArgs.length > 0
      ? actorArgs.map((spec) => {
          const at = spec.indexOf('=');
          if (at < 1) throw new Error(`bad --actor "${spec}" (expected <id>=<recordId>)`);
          return { id: spec.slice(0, at), recordId: spec.slice(at + 1) };
        })
      : DEFAULT_ACTORS;

  stdout.write('loading artifact store…\n');
  const artifacts = await loadArtifactRecords(roots);
  const records = new Map(artifacts.map((artifact) => [artifact.id, artifact.text]));
  const session = createPlaySession({
    actors,
    records,
    seed: argument('seed') ? Number(argument('seed')) : undefined,
  });
  stdout.write(
    `${records.size} records loaded. participants: ${actors.map((actor) => actor.id).join(', ')}. type help.\n`,
  );

  const interactive = stdin.isTTY === true;
  const readline = createInterface({ input: stdin, output: interactive ? stdout : undefined });
  readline.setPrompt('> ');
  if (interactive) readline.prompt();
  try {
    // Async iteration buffers lines, so piped scripts lose nothing between
    // commands (readline's question() drops lines with no pending question).
    for await (const line of readline) {
      if (!interactive) stdout.write(`> ${line}\n`);
      const step = session.execute(line);
      if (step.output.length > 0) stdout.write(`${step.output}\n`);
      if (step.quit) break;
      if (interactive) readline.prompt();
    }
  } finally {
    readline.close();
  }

  const transcriptPath = argument('transcript');
  if (transcriptPath) {
    const out = resolve(transcriptPath);
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(session.transcript(), null, 2)}\n`, 'utf8');
    stdout.write(`transcript written: ${out}\n`);
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
