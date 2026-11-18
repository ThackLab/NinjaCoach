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
