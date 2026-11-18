import { describe, expect, it } from 'vitest';
import { normaliseTermination } from './importGames';

describe('chess.com endings', () => {
  it('speak the coach’s words', () => {
    expect(normaliseTermination('MingeNinja won by checkmate')).toBe('checkmate');
    expect(normaliseTermination('PawnStar won by resignation')).toBe('resignation');
    expect(normaliseTermination('KnightOwl won on time')).toBe('timeout');
    expect(normaliseTermination('Game drawn by repetition')).toBe('threefold repetition');
    expect(normaliseTermination('Game drawn by timeout vs insufficient material')).toBe('timeout vs insufficient material');
    expect(normaliseTermination('Game drawn by agreement')).toBe('agreement');
    expect(normaliseTermination('Game drawn')).toBeUndefined();
    expect(normaliseTermination(undefined)).toBeUndefined();
  });
});

describe('chess.com clocks', () => {
  it('reads the time control and the clock after each move', async () => {
    const { clockMs, parseTimeControl, toRecord } = await import('./importGames');
    expect(clockMs('[%clk 0:09:58.4]')).toBe(598_400);
    expect(clockMs('[%clk 1:02:03]')).toBe(3_723_000);
    expect(parseTimeControl('600')).toEqual({ base: 600, inc: 0 });
    expect(parseTimeControl('180+2')).toEqual({ base: 180, inc: 2 });
    expect(parseTimeControl('1/86400')).toBeUndefined();
    const pgn =
      '[White "Me"]\n[Black "You"]\n[Result "1-0"]\n[TimeControl "180+2"]\n\n1. e4 {[%clk 0:03:01]} 1... e5 {[%clk 0:02:59.5]} 2. Qh5 {[%clk 0:02:55]} 1-0';
    const rec = toRecord({ key: 'k', pgn, white: 'Me', black: 'You', result: '1-0', site: 'chess.com' }, 'me')!;
    expect(rec.clock).toEqual({ base: 180, inc: 2 });
    expect(rec.clocks).toEqual([181_000, 179_500, 175_000]);
  });
});
