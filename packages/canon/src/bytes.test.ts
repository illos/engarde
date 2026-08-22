import { describe, expect, it } from 'vitest';
import { scanSourceLines, sha256 } from './bytes.js';

describe('byte coordinates', () => {
  it('preserves UTF-8 byte offsets and CRLF terminators', () => {
    const source = Buffer.from('one\r\n🗡 two\nlast', 'utf8');
    const lines = scanSourceLines(source);

    expect(lines).toEqual([
      { number: 1, byteStart: 0, byteContentEnd: 3, byteEnd: 5, text: 'one' },
      { number: 2, byteStart: 5, byteContentEnd: 13, byteEnd: 14, text: '🗡 two' },
      { number: 3, byteStart: 14, byteContentEnd: 18, byteEnd: 18, text: 'last' },
    ]);
    expect(sha256(source)).toHaveLength(64);
  });

  it('does not invent an empty line after a final newline', () => {
    expect(scanSourceLines(Buffer.from('one\n'))).toHaveLength(1);
    expect(scanSourceLines(Buffer.alloc(0))).toEqual([]);
  });
});
