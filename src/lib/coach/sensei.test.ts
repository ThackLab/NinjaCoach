import { describe, expect, it } from 'vitest';
import { inMyWords } from './sensei';

describe('Sensei speaks as your opponent', () => {
  it('turns "your opponent" into I and me', () => {
    expect(inMyWords('Your opponent wins the queen for a pawn after 3... Kxf7.')).toBe('I win the queen for a pawn after 3... Kxf7.');
    expect(inMyWords('Your opponent gets a dangerous attack with Qh5.')).toBe('I get a dangerous attack with Qh5.');
    expect(inMyWords('This lets your opponent take the rook.')).toBe('This lets me take the rook.');
  });
});
