import { createHash } from 'node:crypto';

export interface SourceLine {
  number: number;
  byteStart: number;
  byteContentEnd: number;
  byteEnd: number;
  text: string;
}

export function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function scanSourceLines(source: Buffer): SourceLine[] {
  if (source.length === 0) return [];

  const lines: SourceLine[] = [];
  let byteStart = 0;

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] !== 0x0a) continue;

    const byteContentEnd = index > byteStart && source[index - 1] === 0x0d ? index - 1 : index;
    lines.push({
      number: lines.length + 1,
      byteStart,
      byteContentEnd,
      byteEnd: index + 1,
      text: source.subarray(byteStart, byteContentEnd).toString('utf8'),
    });
    byteStart = index + 1;
  }

  if (byteStart < source.length) {
    lines.push({
      number: lines.length + 1,
      byteStart,
      byteContentEnd: source.length,
      byteEnd: source.length,
      text: source.subarray(byteStart).toString('utf8'),
    });
  }

  return lines;
}

export function requireLine(lines: SourceLine[], lineNumber: number): SourceLine {
  const line = lines[lineNumber - 1];
  if (!line) throw new Error(`line ${lineNumber} is outside the source file`);
  return line;
}

export function lineNumberForByte(lines: SourceLine[], byteOffset: number): number {
  const line = lines.find((candidate) =>
    byteOffset === candidate.byteEnd && candidate.byteEnd === candidate.byteStart
      ? true
      : byteOffset >= candidate.byteStart && byteOffset < candidate.byteEnd,
  );
  if (line) return line.number;

  const finalLine = lines.at(-1);
  if (finalLine && byteOffset === finalLine.byteEnd) return finalLine.number;
  throw new Error(`byte offset ${byteOffset} is outside the source file`);
}
