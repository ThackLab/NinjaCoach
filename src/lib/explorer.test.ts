import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { START_FEN } from './chess/utils';
import type { GameRecord } from './storage/db';
import type { GameReview } from './review/types';
import { buildTree, fenKey, findLeaks, lineText } from './explorer';
import type { StatGame } from './stats';

let n = 0;
function game(sans: string[], result: GameRecord['result'], color: 'w' | 'b' = 'w', review?: Partial<GameReview>): StatGame {
  const c = new Chess();
  const moves = sans.map((s) => {
    const m = c.move(s);
    return m.from + m.to + (m.promotion ?? '');
  });
  n++;
  const g = {
    id: `g${n}`,
    createdAt: n,
    source: 'import',
    white: { name: 'a' },
    black: { name: 'b' },
    result,
    startFen: START_FEN,
    moves,
    sans,
    pgn: '',
    userColor: color,
  } as GameRecord;
  return { game: g, color, review: review as GameReview | undefined };
}

describe('opening explorer', () => {
  const london = ['d4', 'd5', 'Bf4'];
  const list = [
    game([...london, 'c5', 'e3', 'Nc6'], '0-1'),
    game([...london, 'c5', 'e3', 'Qb6'], '0-1'),
    game([...london, 'Nf6', 'e3', 'e6'], '1-0'),
    game(['e4', 'e5'], '1/2-1/2'),
    game([...london, 'c5'], '1-0', 'b'), // a game as Black: not in the White tree
  ];
  const tree = buildTree(list, 'w');

  it('counts the games through each position and move, from your side', () => {
    const root = tree.nodes.get(tree.root)!;
    expect(root.games).toBe(4);
    expect(root.moves.map((m) => [m.san, m.games, m.mine])).toEqual([
      ['d4', 3, true],
      ['e4', 1, true],
    ]);
    const afterBf4 = tree.nodes.get(
      fenKey(
        new Chess().move('d4') &&
          (() => {
            const c = new Chess();
            london.forEach((s) => c.move(s));
            return c.fen();
          })(),
      ),
    )!;
    expect(afterBf4.line).toEqual(london);
    const c5 = afterBf4.moves.find((m) => m.san === 'c5')!;
    expect(c5).toMatchObject({ mine: false, games: 2, w: 0, l: 2, score: 0 });
  });

  it('finds the moves that cost you', () => {
    const leaks = findLeaks(tree);
    const c5 = leaks.find((l) => l.edge.san === 'c5')!;
    expect(c5.why).toContain('you score 0% when they play it');
    expect(lineText([...c5.node.line, c5.edge.san])).toBe('1.d4 d5 2.Bf4 c5');
  });

  it('uses reviews for your mistakes and what Stockfish played instead', () => {
    const rev = (bad: boolean) =>
      ({
        moves: [0, 1, 2].map((i) => ({ classification: i === 2 && bad ? 'mistake' : 'best', epLoss: i === 2 && bad ? 0.2 : 0 })),
        positions: [0, 1, 2].map((i) => ({
          fen: '',
          depth: 16,
          lines: i === 2 ? [{ score: { type: 'cp', value: 30 }, pv: ['g1f3'], san: ['Nf3'], depth: 16 }] : [],
        })),
      }) as unknown as GameReview;
    const t = buildTree([game(['d4', 'd5', 'Bf4'], '0-1', 'w', rev(true)), game(['d4', 'd5', 'Bf4'], '1/2-1/2', 'w', rev(true))], 'w');
    const leak = findLeaks(t).find((l) => l.edge.san === 'Bf4')!;
    expect(leak.why).toContain('it was a mistake in 2 of 2 reviewed games');
    expect(leak.instead).toBe('Nf3');
  });
});
