// Background game-review jobs. Reviews keep running while you navigate and
// results are cached in IndexedDB.
import { create } from 'zustand';
import { getEval, putEval } from '../lib/review/evalCache';
import type { Color } from 'chess.js';
import { EnginePool, defaultPoolSize } from '../lib/engine/manager';
import { isMobile } from '../lib/platform';
import { loadOpeningBook } from '../lib/chess/openings';
import { analysePositions, buildReview, keyPositions } from '../lib/review/review';
import type { GameReview, PositionEval } from '../lib/review/types';
import { moveLesson } from '../lib/review/lessons';
import { getGame, getReview, saveReview, savePuzzles, type Puzzle } from '../lib/storage/db';

export interface ReviewJob {
  gameId: string;
  status: 'running' | 'done' | 'error';
  done: number;
  total: number;
  error?: string;
  /** Partial evaluations as they arrive, for a live graph. */
  partial: (PositionEval | undefined)[];
  depth: number;
}

interface ReviewerStore {
  jobs: Record<string, ReviewJob>;
  start: (gameId: string, opts?: { mode?: 'quick' | 'deep'; force?: boolean }) => Promise<GameReview | null>;
  cancel: (gameId: string) => void;
}

/**
 * Every game gets a quick review: a fast pass over every move, then a deeper
 * look at its key moments (brilliant, great, mistakes, misses, blunders and
 * the position after each), so those are as reliable as a slow review. A deep
 * analysis of a whole game happens only when you ask for one.
 */
const QUICK = { depth: 12, multipv: 2, maxTimeMs: 1500 };
const CHECK = { depth: 16, multipv: 3, maxTimeMs: 5000 };
const DEEP = { depth: 20, multipv: 3, maxTimeMs: 12000 };
/** At most this many positions get the deeper look. */
const MAX_CHECK = 40;

const controllers = new Map<string, AbortController>();
let pool: EnginePool | null = null;
let poolUsers = 0;
let poolTimer: ReturnType<typeof setTimeout> | undefined;

function acquirePool() {
  clearTimeout(poolTimer);
  pool ??= new EnginePool(defaultPoolSize(), isMobile ? 16 : 32);
  poolUsers++;
  return pool;
}

function releasePool() {
  poolUsers--;
  if (poolUsers <= 0) {
    poolUsers = 0;
    // Keep the engines warm for a minute in case another review follows.
    poolTimer = setTimeout(() => {
      pool?.terminate();
      pool = null;
    }, 60000);
  }
}

/** Turns the user's mistakes into practice positions. */
export function puzzlesFrom(review: GameReview, gameId: string, color: Color | undefined): Puzzle[] {
  const out: Puzzle[] = [];
  for (const m of review.moves) {
    if (color && m.color !== color) continue;
    if (!['blunder', 'mistake', 'miss'].includes(m.classification)) continue;
    const pos = review.positions[m.ply];
    const best = pos.lines[0];
    if (!best || !best.pv.length) continue;
    // Only positions with a clear answer make good puzzles.
    const second = pos.lines[1];
    const sign = m.color === 'w' ? 1 : -1;
    const toCp = (s: typeof best.score) => (s.type === 'mate' ? (s.value > 0 ? 10000 : -10000) : s.value) * sign;
    if (second && toCp(best.score) - toCp(second.score) < 80) continue;
    out.push({
      id: `${gameId}:${m.ply}`,
      gameId,
      ply: m.ply,
      fen: m.fenBefore,
      color: m.color,
      solution: best.pv.slice(0, 7),
      solutionSan: best.san.slice(0, 7),
      playedSan: m.san,
      prev: m.ply > 0 ? review.moves[m.ply - 1]?.uci : undefined,
      classification: m.classification,
      comment: m.comment,
      lesson: (() => {
        const l = moveLesson(review, m.ply);
        return l ? { icon: l.info.icon, title: l.info.title, rule: l.info.rule } : undefined;
      })(),
      createdAt: Date.now(),
      box: 0,
      due: Date.now(),
      attempts: 0,
      solved: 0,
    });
  }
  return out;
}

export const useReviewer = create<ReviewerStore>()((set, get) => ({
  jobs: {},
  start: async (gameId, opts = {}) => {
    const existing = get().jobs[gameId];
    if (existing?.status === 'running') return null;
    if (!opts.force) {
      const cached = await getReview(gameId);
      if (cached) return cached;
    }
    const game = await getGame(gameId);
    if (!game) throw new Error('Game not found');
    const mode = opts.mode ?? 'quick';
    const plan = mode === 'deep' ? DEEP : QUICK;
    const depth = plan.depth;
    const total = game.moves.length + 1;
    const ctrl = new AbortController();
    controllers.set(gameId, ctrl);
    const update = (patch: Partial<ReviewJob>) => set((s) => ({ jobs: { ...s.jobs, [gameId]: { ...s.jobs[gameId], ...patch } } }));
    set((s) => ({
      jobs: { ...s.jobs, [gameId]: { gameId, status: 'running', done: 0, total, partial: new Array(total), depth } },
    }));
    const p = acquirePool();
    try {
      const book = await loadOpeningBook();
      const input = { startFen: game.startFen, moves: game.moves };
      let positions = await analysePositions(input, {
        engines: p.engines,
        ...plan,
        cache: { get: getEval, put: putEval },
        signal: ctrl.signal,
        onProgress: (done, tot) => update({ done, total: tot }),
        onPosition: (i, pos) => {
          const cur = get().jobs[gameId];
          if (!cur) return;
          const partial = [...cur.partial];
          partial[i] = pos;
          update({ partial });
        },
      });
      const outcome = { result: game.result, termination: game.termination };
      if (mode === 'quick') {
        // The deeper look at the moments that matter.
        const draft = buildReview(input, positions, { depth, book, userColor: game.userColor, outcome });
        const key = keyPositions(draft, positions, MAX_CHECK);
        if (key.length) {
          positions = await analysePositions(input, {
            engines: p.engines,
            ...CHECK,
            only: key,
            prior: positions,
            cache: { get: getEval, put: putEval },
            signal: ctrl.signal,
          });
        }
      }
      const review = { ...buildReview(input, positions, { depth, book, userColor: game.userColor, outcome }), mode };
      await saveReview(gameId, review);
      if (game.userColor) await savePuzzles(puzzlesFrom(review, gameId, game.userColor));
      update({ status: 'done', done: total, partial: [] });
      return review;
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError';
      if (aborted) {
        set((s) => {
          const jobs = { ...s.jobs };
          delete jobs[gameId];
          return { jobs };
        });
      } else update({ status: 'error', error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      controllers.delete(gameId);
      releasePool();
    }
  },
  cancel: (gameId) => controllers.get(gameId)?.abort(),
}));
