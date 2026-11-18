import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import type { GameReview } from '../review/types';
import { findMateChances, kingBox, mateHints, mateWalkthrough, type MateChance } from './mates';

// White to move: Re8+ Rxe8 Rxe8# is a back-rank mate in 2.
const FEN = '2r3k1/5ppp/8/8/8/8/4RPPP/4R1K1 w - - 0 1';

function fakeReview(after: GameReview['positions'][number]['lines'][number]['score'], played = 'h2h3'): GameReview {
  const c = new Chess(FEN);
  const m = c.move({ from: played.slice(0, 2), to: played.slice(2, 4) });
  return {
    positions: [
      { fen: FEN, depth: 16, lines: [{ score: { type: 'mate', value: 2 }, pv: ['e2e8', 'c8e8', 'e1e8'], san: [], depth: 16 }] },
      { fen: c.fen(), depth: 16, lines: [{ score: after, pv: [], san: [], depth: 16 }] },
    ],
    moves: [{ ply: 0, color: 'w', san: m.san, uci: played, fenBefore: FEN }],
  } as unknown as GameReview;
}

describe('mate chances', () => {
  it('finds a missed mate with its line', () => {
    const [ch] = findMateChances('g1', fakeReview({ type: 'cp', value: 300 }), 'w');
    expect(ch).toMatchObject({ kind: 'missed', mateIn: 2, lineSan: ['Re8+', 'Rxe8', 'Rxe8#'], played: 'h3' });
  });
  it('finds a mate you lost, or got to the long way round', () => {
    const [ch] = findMateChances('g1', fakeReview({ type: 'mate', value: -6 }), 'w');
    expect(ch).toMatchObject({ kind: 'missed' }); // and walked into a mate instead
    const [slow] = findMateChances('g1', fakeReview({ type: 'mate', value: 4 }), 'w');
    expect(slow).toMatchObject({ kind: 'slower', playedMateIn: 5 });
    expect(findMateChances('g1', fakeReview({ type: 'mate', value: 2 }), 'w')).toHaveLength(0); // one move slower is fine
  });
  it('ignores the other side', () => {
    expect(findMateChances('g1', fakeReview({ type: 'cp', value: 300 }), 'b')).toHaveLength(0);
  });
});

describe('how to see it', () => {
  const ch = findMateChances('g1', fakeReview({ type: 'cp', value: 300 }), 'w')[0] as MateChance;
  it('reads the king’s box', () => {
    const box = kingBox(FEN, 'b');
    expect(box.king).toBe('g8');
    expect(box.blocked.sort()).toEqual(['f7', 'g7', 'h7']);
    expect(box.flights.sort()).toEqual(['f8', 'h8']);
  });
  it('walks through king, checks, each move and the mate', () => {
    const steps = mateWalkthrough(ch);
    expect(steps.map((s) => s.title)).toEqual([
      'Look at their king first',
      'Then try every check',
      'The check that works: Re8+',
      'Rxe8#: checkmate',
      'How to find it next time',
    ]);
    expect(steps[0].text).toContain('f8 and h8');
    expect(steps[1].text).toContain('Re8+');
    expect(steps[2].text).toContain('Their only move is Rxe8');
    expect(steps[3].text).toContain('back-rank mate');
    expect(steps[4].text).toContain('In the game you played h3');
  });
  it('gives hints, gentlest first', () => {
    const h = mateHints(ch.fen, ch.line[0]);
    expect(h[0].text).toContain('Look for a check');
    expect(h[1]).toMatchObject({ text: 'Use your rook.', square: 'e2' });
    expect(h[2].arrow).toEqual(['e2', 'e8']);
  });
});
