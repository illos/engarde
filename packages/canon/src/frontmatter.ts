import { parse } from 'yaml';
import { scanSourceLines } from './bytes.js';

export interface ParsedFrontmatter {
  metadata: Record<string, unknown>;
  byteEnd: number;
  lineEnd: number;
}

export function parseFrontmatter(source: Buffer): ParsedFrontmatter {
  const lines = scanSourceLines(source);
  if (lines[0]?.text !== '---') {
    throw new Error('source does not begin with a YAML frontmatter delimiter');
  }

  const closing = lines.slice(1).find((line) => line.text === '---');
  if (!closing) throw new Error('source frontmatter has no closing delimiter');

  const yamlStart = lines[0].byteEnd;
  const yamlEnd = closing.byteStart;
  const parsed: unknown = parse(source.subarray(yamlStart, yamlEnd).toString('utf8'));
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('source frontmatter must decode to an object');
  }

  return {
    metadata: parsed as Record<string, unknown>,
    byteEnd: closing.byteEnd,
    lineEnd: closing.number,
  };
}
