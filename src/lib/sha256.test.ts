import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256 } from './sha256';
import { gameHash } from './gameHash';

describe('sha256', () => {
  it('matches the standard test vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('agrees with Node for long and non-ASCII text', () => {
    for (const t of ['a'.repeat(1000), '1. e4 e5 2. Nf3 ♞ ½-½', 'x'.repeat(55), 'y'.repeat(56), 'z'.repeat(64)])
      expect(sha256(t)).toBe(createHash('sha256').update(t, 'utf8').digest('hex'));
  });
});

describe('game fingerprint', () => {
  const g = {
    id: 'imp-1',
    source: 'import' as const,
    url: 'https://www.chess.com/game/live/1',
    white: { name: 'A' },
    black: { name: 'B' },
    result: '1-0' as const,
    startFen: 'start',
    moves: ['e2e4', 'e7e5'],
  };
  it('is the same for the same game and different if one move changes', () => {
    expect(gameHash(g)).toBe(gameHash({ ...g }));
    expect(gameHash(g)).not.toBe(gameHash({ ...g, moves: ['e2e4', 'c7c5'] }));
    expect(gameHash(g)).toMatch(/^[0-9a-f]{64}$/);
  });
});
