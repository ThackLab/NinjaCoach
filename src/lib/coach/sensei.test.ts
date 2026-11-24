import { describe, expect, it } from 'vitest';
import { inMyWords } from './sensei';

describe('Sensei speaks as your opponent', () => {
  it('turns "your opponent" into I and me', () => {
    expect(inMyWords('Your opponent wins the queen for a pawn after 3... Kxf7.')).toBe('I win the queen for a pawn after 3... Kxf7.');
    expect(inMyWords('Your opponent gets a dangerous attack with Qh5.')).toBe('I get a dangerous attack with Qh5.');
    expect(inMyWords('This lets your opponent take the rook.')).toBe('This lets me take the rook.');
  });
});

import { shortenLines } from './sensei';
describe('Sensei keeps his lines short', () => {
  it('keeps the first two moves of a long line', () => {
    expect(shortenLines('I win the queen for a pawn after 3... Kxf7 4. d4 Ke8 5. e5 g6 6. dxc5 a6 7. a4. Better was Nc3.')).toBe(
      'I win the queen for a pawn after 3... Kxf7 4. d4… Better was Nc3.',
    );
    expect(shortenLines('This lets me win a pawn after Bxe4.')).toBe('This lets me win a pawn after Bxe4.');
    expect(shortenLines('No line here.')).toBe('No line here.');
  });
});
