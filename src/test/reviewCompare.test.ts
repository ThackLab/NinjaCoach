// Quick review vs the old standard review vs a deep one, on games played by
// human-like bots (900 against 1100, so they have real mistakes and real good
// moves). Run with COMPARE=1. Prints the time each took and how far the
// quick and standard reviews agree with the deep one on the classes that
// matter (brilliant, great, mistake, miss, blunder) and on accuracy.
import { it } from 'vitest';
import { Chess } from 'chess.js';
import { nodeEngine } from './nodeEngine';
import { chooseBotMove } from '../lib/bots/brain';
import type { BotProfile } from '../lib/bots/bots';
import { analysePositions, buildReview } from '../lib/review/review';
import type { Classification, GameReview, PositionEval } from '../lib/review/types';
import { START_FEN, playUci } from '../lib/chess/utils';
import type { Engine } from '../lib/engine/engine';

const KEY: Classification[] = ['brilliant', 'great', 'mistake', 'miss', 'blunder'];
const bot = (elo: number): BotProfile => ({ id: `b${elo}`, name: `B${elo}`, elo, avatar: '', tint: '', style: 'balanced', tagline: '', bio: '' });

async function play(engine: Engine, seed: number): Promise<string[]> {
  let s = seed;
  const rng = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const moves: string[] = [];
  const c = new Chess();
  const sides = [bot(900), bot(1100)];
  while (!c.isGameOver() && moves.length < 90) {
    const m = await chooseBotMove(engine, { startFen: START_FEN, moves, bot: sides[moves.length % 2], rng });
    playUci(c, m.uci);
    moves.push(m.uci);
  }
  return moves;
}

async function review(
  engines: Engine[],
  moves: string[],
  plan: { depth: number; multipv: number; maxTimeMs: number },
  check?: { depth: number; multipv: number; maxTimeMs: number },
) {
  const input = { startFen: START_FEN, moves };
  const t0 = Date.now();
  let positions: PositionEval[] = await analysePositions(input, { engines, ...plan });
  let r = buildReview(input, positions, { depth: plan.depth });
  if (check) {
    const key = [...new Set(r.moves.filter((m) => KEY.includes(m.classification)).flatMap((m) => [m.ply, m.ply + 1]))].slice(0, 30);
    if (key.length) positions = await analysePositions(input, { engines, ...check, only: key, prior: positions });
    r = buildReview(input, positions, { depth: plan.depth });
  }
  return { r, ms: Date.now() - t0 };
}

function agree(a: GameReview, ref: GameReview) {
  let tp = 0,
    fp = 0,
    fn = 0,
    same = 0;
  for (let i = 0; i < ref.moves.length; i++) {
    const x = a.moves[i].classification,
      y = ref.moves[i].classification;
    if (x === y) same++;
    const kx = KEY.includes(x),
      ky = KEY.includes(y);
    if (kx && ky && x === y) tp++;
    else {
      if (kx) fp++;
      if (ky) fn++;
    }
  }
  return {
    tp,
    fp,
    fn,
    same,
    total: ref.moves.length,
    acc: Math.abs(a.white.accuracy - ref.white.accuracy) + Math.abs(a.black.accuracy - ref.black.accuracy),
  };
}

it.skipIf(!process.env.COMPARE)('quick vs standard vs deep', { timeout: 3_600_000 }, async () => {
  const pool = +(process.env.POOL ?? 4);
  const engines = Array.from({ length: pool }, () => nodeEngine({ Hash: 32 }));
  const games = +(process.env.GAMES ?? 4);
  const sum = {
    quick: { ms: 0, tp: 0, fp: 0, fn: 0, same: 0, total: 0, acc: 0 },
    standard: { ms: 0, tp: 0, fp: 0, fn: 0, same: 0, total: 0, acc: 0 },
  };
  let deepMs = 0;
  for (let g = 0; g < games; g++) {
    const moves = await play(engines[0], 11 + g * 7919);
    const deep = await review(engines, moves, { depth: 20, multipv: 3, maxTimeMs: 12000 });
    const standard = await review(engines, moves, { depth: 16, multipv: 3, maxTimeMs: 6000 });
    const quick = await review(engines, moves, { depth: 12, multipv: 2, maxTimeMs: 1500 }, { depth: 16, multipv: 3, maxTimeMs: 5000 });
    deepMs += deep.ms;
    for (const [k, v] of [
      ['quick', quick],
      ['standard', standard],
    ] as const) {
      const a = agree(v.r, deep.r);
      const t = sum[k];
      t.ms += v.ms;
      t.tp += a.tp;
      t.fp += a.fp;
      t.fn += a.fn;
      t.same += a.same;
      t.total += a.total;
      t.acc += a.acc / 2;
    }
    const keys = (r: GameReview) => KEY.map((c) => `${c}:${r.white.counts[c] + r.black.counts[c]}`).join(' ');
    console.log(
      `game ${g + 1}: ${moves.length} plies | deep ${(deep.ms / 1000).toFixed(0)}s [${keys(deep.r)}] | standard ${(standard.ms / 1000).toFixed(0)}s [${keys(standard.r)}] | quick ${(quick.ms / 1000).toFixed(0)}s [${keys(quick.r)}]`,
    );
  }
  for (const [k, t] of Object.entries(sum)) {
    const recall = t.tp / Math.max(1, t.tp + t.fn);
    const precision = t.tp / Math.max(1, t.tp + t.fp);
    console.log(
      `${k}: ${(t.ms / 1000).toFixed(0)}s total (deep ${(deepMs / 1000).toFixed(0)}s) | same class as deep on ${((100 * t.same) / t.total).toFixed(1)}% of moves | key moments found ${(100 * recall).toFixed(0)}%, right ${(100 * precision).toFixed(0)}% | accuracy off by ${(t.acc / games).toFixed(1)} points a game`,
    );
  }
  engines.forEach((e) => e.terminate());
});
