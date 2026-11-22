// The opening explorer, built from your own games: every position you have
// reached in the opening (transpositions merged), the moves played from it,
// yours and your opponents', how often, and how you scored after each. From
// the reviews it adds how often a move of yours was a mistake and what
// Stockfish played instead, and from that it finds the moves that cost you:
// "after 1.d4 d5 2.Bf4 c5 you score 20%".
import { Chess, type Color } from 'chess.js';
import type { OpeningBook } from './chess/openings';
import { START_FEN, playUci } from './chess/utils';
import type { StatGame } from './stats';
import { outcomeOf } from './stats';

/** How deep into the game the explorer goes (in plies). */
export const MAX_PLIES = 24;

export interface ExplorerEdge {
  san: string;
  uci: string;
  to: string;
  /** Whose move it is: yours or your opponent's. */
  mine: boolean;
  games: number;
  w: number;
  d: number;
  l: number;
  /** Points per game after this move, 0..1, from your side. */
  score: number;
  /** In reviewed games: how often your move here was a mistake, a blunder or a miss, and an inaccuracy. */
  reviewed: number;
  errors: number;
  inaccuracies: number;
  /** Average expected points your move lost (reviewed games, your moves only). */
  avgLoss: number;
  /** A known opening move. */
  book: boolean;
  /** Games that went this way, newest first. */
  gameIds: string[];
}

export interface ExplorerNode {
  key: string;
  fen: string;
  ply: number;
  /** Moves from the start to here, as you first reached it. */
  line: string[];
  name?: string;
  games: number;
  w: number;
  d: number;
  l: number;
  score: number;
  /** Stockfish's move here (from the deepest reviewed look), when known. */
  best?: { san: string; uci: string; depth: number };
  moves: ExplorerEdge[];
}

export interface ExplorerTree {
  color: Color;
  root: string;
  nodes: Map<string, ExplorerNode>;
}

/** A position's key: the board, side to move, castling and en passant (not the move counters). */
export const fenKey = (fen: string) => fen.split(' ').slice(0, 4).join(' ');

const score = (x: { games: number; w: number; d: number }) => (x.games ? (x.w + x.d / 2) / x.games : 0);

export function buildTree(list: StatGame[], color: Color, book?: OpeningBook | null): ExplorerTree {
  const nodes = new Map<string, ExplorerNode>();
  const rootKey = fenKey(START_FEN);
  const node = (fen: string, ply: number, line: string[]): ExplorerNode => {
    const key = fenKey(fen);
    let n = nodes.get(key);
    if (!n) {
      n = { key, fen, ply, line, games: 0, w: 0, d: 0, l: 0, score: 0, moves: [] };
      nodes.set(key, n);
    }
    return n;
  };
  node(START_FEN, 0, []);
  const games = list
    .filter((x) => x.color === color && x.game.startFen === START_FEN && outcomeOf(x.game, x.color))
    .sort((a, b) => b.game.createdAt - a.game.createdAt);
  for (const x of games) {
    const o = outcomeOf(x.game, x.color)!;
    const c = new Chess();
    const line: string[] = [];
    let here = nodes.get(rootKey)!;
    here.games++;
    here[o]++;
    const seenHere = new Set([rootKey]);
    for (let i = 0; i < Math.min(MAX_PLIES, x.game.moves.length); i++) {
      const uci = x.game.moves[i];
      const mine = c.turn() === color;
      const m = playUci(c, uci);
      if (!m) break;
      line.push(m.san);
      const fen = c.fen();
      const to = node(fen, i + 1, [...line]);
      let e = here.moves.find((y) => y.uci === uci);
      if (!e) {
        e = {
          san: m.san,
          uci,
          to: to.key,
          mine,
          games: 0,
          w: 0,
          d: 0,
          l: 0,
          score: 0,
          reviewed: 0,
          errors: 0,
          inaccuracies: 0,
          avgLoss: 0,
          book: !!book?.has(fen),
          gameIds: [],
        };
        here.moves.push(e);
      }
      e.games++;
      e[o]++;
      e.gameIds.push(x.game.id);
      const rm = x.review?.moves[i];
      if (rm && mine) {
        e.avgLoss = (e.avgLoss * e.reviewed + rm.epLoss) / (e.reviewed + 1);
        e.reviewed++;
        if (rm.classification === 'mistake' || rm.classification === 'blunder' || rm.classification === 'miss') e.errors++;
        if (rm.classification === 'inaccuracy') e.inaccuracies++;
      }
      // What Stockfish played here, from the deepest look any review had.
      const pos = x.review?.positions[i];
      const bestUci = pos?.lines[0]?.pv[0];
      if (pos && bestUci && (!here.best || pos.depth > here.best.depth))
        here.best = { san: pos.lines[0].san[0] ?? bestUci, uci: bestUci, depth: pos.depth };
      // A game that comes back to a position (a repetition) counts there once.
      if (!seenHere.has(to.key)) {
        to.games++;
        to[o]++;
        seenHere.add(to.key);
      }
      here = to;
    }
  }
  for (const n of nodes.values()) {
    n.score = score(n);
    for (const e of n.moves) e.score = score(e);
    n.moves.sort((a, b) => b.games - a.games || b.score - a.score);
  }
  if (book) {
    // Opening names along the way.
    for (const n of nodes.values()) {
      const c = new Chess();
      const fens = [c.fen()];
      for (const san of n.line) {
        c.move(san);
        fens.push(c.fen());
      }
      n.name = book.classify(fens)?.name;
    }
  }
  return { color, root: rootKey, nodes };
}

export interface Leak {
  node: ExplorerNode;
  edge: ExplorerEdge;
  /** "You score 20% after this", "a mistake in 2 of 3 games"... */
  why: string;
  /** What Stockfish played here instead, when it's different. */
  instead?: string;
  /** How much it matters, for ordering. */
  weight: number;
}

/**
 * The moves that cost you in the opening: your own moves that were often
 * mistakes or after which you score badly, and opponents' moves you don't
 * handle well (where you score badly after them).
 */
export function findLeaks(tree: ExplorerTree, minGames = 2): Leak[] {
  const out: Leak[] = [];
  for (const n of tree.nodes.values()) {
    for (const e of n.moves) {
      if (e.games < minGames) continue;
      const pct = Math.round(e.score * 100);
      if (e.mine) {
        const errorRate = e.reviewed ? e.errors / e.reviewed : 0;
        const instead = n.best && n.best.uci !== e.uci ? n.best.san : undefined;
        // Losing after a move doesn't make it the culprit: only when the reviews call it a
        // mistake, or Stockfish preferred another move here.
        const bad = errorRate >= 0.5 || e.avgLoss >= 0.08 || (e.score <= 0.35 && !!instead);
        if (!bad) continue;
        const parts = [`you score ${pct}% after it (${e.w}W ${e.d}D ${e.l}L)`];
        if (e.errors) parts.push(`it was a mistake in ${e.errors} of ${e.reviewed} reviewed games`);
        out.push({ node: n, edge: e, why: parts.join(', and '), instead, weight: e.games * (1 - e.score) + e.errors * 2 + (instead ? 1 : 0) });
      } else if (e.score <= 0.35) {
        // Their move, which you don't handle well: what do you usually answer, and how did it go?
        const next = tree.nodes.get(e.to);
        const reply = next?.moves.find((m) => m.mine);
        const instead = next?.best && reply && next.best.uci !== reply.uci ? next.best.san : undefined;
        out.push({
          node: n,
          edge: e,
          why: `you score ${pct}% when they play it (${e.w}W ${e.d}D ${e.l}L)${reply ? `; you usually answer ${reply.san}` : ''}`,
          instead,
          weight: e.games * (1 - e.score),
        });
      }
    }
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 12);
}

/** "1.d4 d5 2.Bf4 c5" for a line of SAN moves. */
export function lineText(line: string[]): string {
  return line.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(' ');
}
