import { describe, expect, it } from 'vitest';
import type { GameRecord } from './storage/db';
import type { GameReview, PlayerSummary, ReviewedMove } from './review/types';
import { computeStats, timeClassOf, type StatGame } from './stats';

let n = 0;
function game(over: Partial<GameRecord>): GameRecord {
  n++;
  return {
    id: `g${n}`,
    createdAt: Date.UTC(2026, 10, n, 19),
    source: 'import',
    white: { name: 'Me', elo: 500 },
    black: { name: 'Them', elo: 500 },
    result: '1-0',
    startFen: '',
    moves: Array(40).fill('e2e4'),
    sans: Array(40).fill('e4'),
    pgn: '',
    timeControl: 'rapid',
    userColor: 'w',
    ...over,
  };
}
const player = (accuracy: number, counts: Partial<PlayerSummary['counts']> = {}): PlayerSummary => ({
  accuracy,
  acpl: 100 - accuracy,
  estimatedRating: accuracy * 10,
  ratedMoves: 20,
  counts: { brilliant: 0, great: 0, best: 0, excellent: 0, good: 0, book: 0, forced: 0, inaccuracy: 0, mistake: 0, miss: 0, blunder: 0, ...counts },
  phases: { opening: accuracy, middlegame: accuracy - 10, endgame: null },
});
const move = (ply: number, over: Partial<ReviewedMove>): ReviewedMove =>
  ({
    ply,
    color: ply % 2 ? 'b' : 'w',
    san: 'e4',
    classification: 'good',
    epBefore: 0.5,
    epAfter: 0.5,
    epLoss: 0,
    accuracy: 80,
    phase: 'opening',
    ...over,
  }) as ReviewedMove;

describe('stats', () => {
  it('counts results every which way', () => {
    const list: StatGame[] = [
      { game: game({ result: '1-0', termination: 'checkmate' }), color: 'w' },
      { game: game({ result: '1-0', termination: 'resignation', black: { name: 'Big', elo: 700 } }), color: 'w' },
      { game: game({ result: '0-1', termination: 'timeout', black: { name: 'Small', elo: 300 } }), color: 'w' },
      { game: game({ result: '1/2-1/2', termination: 'threefold repetition', userColor: 'b' }), color: 'b' },
      { game: game({ result: '0-1', termination: 'resignation', userColor: 'b', timeControl: 'blitz' }), color: 'b' },
    ];
    const s = computeStats(list);
    expect(s.overall).toMatchObject({ w: 3, d: 1, l: 1, games: 5, score: 0.7 });
    expect(s.byColor.map((b) => [b.label, b.wdl.w, b.wdl.d, b.wdl.l])).toEqual([
      ['White', 2, 0, 1],
      ['Black', 1, 1, 0],
    ]);
    expect(s.byTimeClass.map((b) => b.label)).toEqual(['Blitz', 'Rapid']);
    expect(s.byOpponent.find((b) => b.key === 'higher')!.wdl.w).toBe(1);
    expect(s.opponents.bestWin).toMatchObject({ name: 'Big', elo: 700 });
    expect(s.opponents.worstLoss).toMatchObject({ name: 'Small', elo: 300 });
    expect(s.endings).toEqual({ wins: { checkmate: 1, resignation: 2 }, losses: { timeout: 1 }, draws: { 'threefold repetition': 1 } });
    expect(s.streaks.current).toEqual({ kind: 'w', n: 1 });
    expect(s.streaks.longestWin).toBe(2);
    expect(s.streaks.longestUnbeaten).toBe(2);
  });

  it('works out accuracy, move quality, pieces and conversion from reviews', () => {
    const review = {
      white: player(80, { best: 10, blunder: 1 }),
      black: player(60, { best: 4, blunder: 3 }),
      moves: [
        move(0, { san: 'Nf3', classification: 'best', accuracy: 100 }),
        move(1, {}),
        move(2, { san: 'Qh5', classification: 'blunder', accuracy: 10, epBefore: 0.95, epLoss: 0.5, phase: 'middlegame' }),
      ],
    } as unknown as GameReview;
    const s = computeStats([{ game: game({}), color: 'w', review, matesMissed: 2 }]);
    expect(s.accuracy).toMatchObject({ avg: 80, opponents: 60, gameRating: 800 });
    expect(s.quality.find((q) => q.cls === 'blunder')).toMatchObject({ you: 1, opponents: 3 });
    expect(s.pieces).toEqual([
      { piece: 'Knight', moves: 1, accuracy: 100, best: 1, errors: 0 },
      { piece: 'Queen', moves: 1, accuracy: 10, best: 0, errors: 1 },
    ]);
    expect(s.phases!.lostShare.middlegame).toBe(1);
    expect(s.tactics).toMatchObject({ matesMissed: 2, winning: 1, converted: 1, blunders: 1 });
  });

  it('reads time use from the clocks', () => {
    // 3+2: you spend 10s, then 100s (with 2s added each move); they play instantly.
    const clocks = [172_000, 180_000, 74_000, 182_000];
    const s = computeStats([
      {
        game: game({ clock: { base: 180, inc: 2 }, clocks, sans: ['e4', 'e5', 'Nf3', 'Nc6'], moves: Array(4).fill('e2e4'), timeControl: 'blitz' }),
        color: 'w',
      },
    ]);
    expect(s.time!.secondsPerMove).toBe(55);
    expect(s.time!.longestThink).toMatchObject({ seconds: 100, san: 'Nf3' });
    expect(s.time!.leftAtEnd).toBeCloseTo(74 / 180);
  });

  it('knows the time control', () => {
    expect(timeClassOf(game({ timeControl: undefined, clock: { base: 60, inc: 0 } }))).toBe('bullet');
    expect(timeClassOf(game({ timeControl: undefined, clock: { base: 180, inc: 2 } }))).toBe('blitz');
    expect(timeClassOf(game({ timeControl: undefined, clock: { base: 600, inc: 0 } }))).toBe('rapid');
    expect(timeClassOf(game({ timeControl: 'daily' }))).toBe('daily');
  });

  it('notes castling and style', () => {
    const sans = ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O', 'Nf6', 'Qe2', 'O-O', 'Bxf7+', 'Kh8'];
    const s = computeStats([{ game: game({ sans, moves: Array(sans.length).fill('e2e4') }), color: 'w' }]);
    expect(s.castling).toMatchObject({ castled: 1, kingside: 1, avgMove: 4, opponentsCastled: 1 });
    expect(s.style).toMatchObject({ checksPerGame: 1, capturesPerGame: 1, queenOutEarly: 1 });
  });
});
