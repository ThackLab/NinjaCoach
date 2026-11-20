import { describe, expect, it } from 'vitest';
import { getEval, putEval } from './evalCache';

const pos = (fen: string, depth: number) => ({
  fen,
  depth,
  lines: [{ score: { type: 'cp' as const, value: 20 }, pv: ['e2e4'], san: ['e4'], depth }],
});

describe('eval cache', () => {
  it('keeps a search the time limit stopped short, so an interrupted review resumes', async () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    // Asked for depth 16, stopped at 11 on time.
    await putEval(pos(fen, 11), 3, 16);
    expect((await getEval(fen, 16, 3))?.depth).toBe(11);
    // A deeper review still searches again.
    expect(await getEval(fen, 20, 3)).toBeNull();
  });
  it('without a target, needs the depth itself', async () => {
    const fen = '8/8/8/8/8/8/8/K6k w - - 0 1';
    await putEval(pos(fen, 11), 3);
    expect(await getEval(fen, 16, 3)).toBeNull();
    expect(await getEval(fen, 10, 3)).not.toBeNull();
  });
});
