// Fetching games from chess.com and lichess, and turning a PGN into a stored
// game. Used by the Import page and by the coach, which watches a chess.com
// account (src/state/coach.ts).
import { Chess } from 'chess.js';
import { clockMs, mainline, mainlineMoves, parsePgn, type ParsedGame } from './chess/pgn';
import { getOpeningBook } from './chess/openings';
import type { GameRecord } from './storage/db';

export interface Candidate {
  key: string;
  pgn: string;
  white: string;
  black: string;
  whiteElo?: number;
  blackElo?: number;
  result: string;
  date?: string;
  timeClass?: string;
  url?: string;
  site: string;
  /** When the game ended (ms), when the site says. */
  endTime?: number;
}

interface ChessComGame {
  pgn?: string;
  url: string;
  time_class: string;
  rules: string;
  end_time: number;
  white: { username: string; rating: number; result: string };
  black: { username: string; rating: number; result: string };
}

/** A player's monthly game archives on chess.com, oldest first (each a URL). */
export async function chessComArchives(user: string): Promise<string[]> {
  const res = await fetch(`https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`);
  if (res.status === 404) throw new Error('No chess.com player by that name');
  if (!res.ok) throw new Error(`chess.com responded ${res.status}`);
  return ((await res.json()) as { archives: string[] }).archives ?? [];
}

/** The standard-chess games in one monthly archive, newest first. */
export async function chessComArchiveGames(url: string): Promise<Candidate[]> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`chess.com responded ${r.status}`);
  const data = (await r.json()) as { games: ChessComGame[] };
  const out: Candidate[] = [];
  for (const g of [...(data.games ?? [])].reverse()) {
    if (!g.pgn || g.rules !== 'chess') continue;
    out.push({
      key: g.url,
      pgn: g.pgn,
      white: g.white.username,
      black: g.black.username,
      whiteElo: g.white.rating,
      blackElo: g.black.rating,
      result: g.white.result === 'win' ? '1-0' : g.black.result === 'win' ? '0-1' : '1/2-1/2',
      date: new Date(g.end_time * 1000).toLocaleDateString(),
      timeClass: g.time_class,
      url: g.url,
      site: 'chess.com',
      endTime: g.end_time * 1000,
    });
  }
  return out;
}

/** The most recent games of a chess.com player (newest first), from the last few monthly archives. */
export async function fetchChessCom(user: string, months = 3, max = 50): Promise<Candidate[]> {
  const base = `https://api.chess.com/pub/player/${encodeURIComponent(user.toLowerCase())}/games/archives`;
  const res = await fetch(base);
  if (res.status === 404) throw new Error('chess.com user not found');
  if (!res.ok) throw new Error(`chess.com responded ${res.status}`);
  const { archives } = (await res.json()) as { archives: string[] };
  const out: Candidate[] = [];
  for (const url of [...archives].reverse().slice(0, months)) {
    const r = await fetch(url);
    if (!r.ok) continue;
    const data = (await r.json()) as {
      games: {
        pgn?: string;
        url: string;
        time_class: string;
        rules: string;
        end_time: number;
        white: { username: string; rating: number; result: string };
        black: { username: string; rating: number; result: string };
      }[];
    };
    for (const g of [...data.games].reverse()) {
      if (!g.pgn || g.rules !== 'chess') continue;
      const res = g.white.result === 'win' ? '1-0' : g.black.result === 'win' ? '0-1' : '1/2-1/2';
      out.push({
        key: g.url,
        pgn: g.pgn,
        white: g.white.username,
        black: g.black.username,
        whiteElo: g.white.rating,
        blackElo: g.black.rating,
        result: res,
        date: new Date(g.end_time * 1000).toLocaleDateString(),
        timeClass: g.time_class,
        url: g.url,
        site: 'chess.com',
        endTime: g.end_time * 1000,
      });
    }
    if (out.length >= max) break;
  }
  return out.slice(0, max);
}

export async function fetchLichess(user: string): Promise<Candidate[]> {
  const res = await fetch(`https://lichess.org/api/games/user/${encodeURIComponent(user)}?max=40&pgnInJson=true&opening=true`, {
    headers: { Accept: 'application/x-ndjson' },
  });
  if (res.status === 404) throw new Error('lichess user not found');
  if (!res.ok) throw new Error(`lichess responded ${res.status}`);
  const text = await res.text();
  const out: Candidate[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    const g = JSON.parse(line) as {
      id: string;
      variant: string;
      speed: string;
      createdAt: number;
      winner?: 'white' | 'black';
      pgn: string;
      players: {
        white: { user?: { name: string }; rating?: number; aiLevel?: number };
        black: { user?: { name: string }; rating?: number; aiLevel?: number };
      };
    };
    if (g.variant !== 'standard') continue;
    const nm = (p: typeof g.players.white) => p.user?.name ?? (p.aiLevel ? `Stockfish level ${p.aiLevel}` : 'Anonymous');
    out.push({
      key: g.id,
      pgn: g.pgn,
      white: nm(g.players.white),
      black: nm(g.players.black),
      whiteElo: g.players.white.rating,
      blackElo: g.players.black.rating,
      result: g.winner === 'white' ? '1-0' : g.winner === 'black' ? '0-1' : '1/2-1/2',
      date: new Date(g.createdAt).toLocaleDateString(),
      timeClass: g.speed,
      url: `https://lichess.org/${g.id}`,
      site: 'lichess',
      endTime: g.createdAt,
    });
  }
  return out;
}

export function candidatesFromPgn(text: string): Candidate[] {
  return parsePgn(text)
    .filter((g) => g.tree.nodes[g.tree.rootId].children.length)
    .map((g: ParsedGame, i) => ({
      key: `pgn-${i}-${g.headers.White}-${g.headers.Black}-${g.headers.Date}`,
      pgn: pgnOf(text, i),
      white: g.headers.White ?? 'White',
      black: g.headers.Black ?? 'Black',
      whiteElo: +g.headers.WhiteElo || undefined,
      blackElo: +g.headers.BlackElo || undefined,
      result: g.result,
      date: g.headers.Date,
      site: g.headers.Site ?? 'PGN',
    }));
}

/** Splits a multi-game PGN into the text of game `i` (falls back to the whole text). */
function pgnOf(text: string, i: number): string {
  const chunks = text.split(/\n(?=\[Event )/);
  return chunks.length > i ? chunks[i] : text;
}

/**
 * chess.com and lichess say how a game ended in their own words ("MingeNinja
 * won by resignation", "Game drawn by repetition", "Time forfeit"); the coach
 * speaks of checkmate, resignation, timeout and so on.
 */
export function normaliseTermination(raw?: string): string | undefined {
  const t = (raw ?? '').toLowerCase();
  if (!t) return undefined;
  if (t.includes('timeout vs insufficient')) return 'timeout vs insufficient material';
  if (t.includes('checkmate')) return 'checkmate';
  if (t.includes('resign')) return 'resignation';
  if (t.includes('on time') || t.includes('time forfeit') || t.includes('timeout')) return 'timeout';
  if (t.includes('abandon')) return 'abandonment';
  if (t.includes('stalemate')) return 'stalemate';
  if (t.includes('repetition')) return 'threefold repetition';
  if (t.includes('insufficient')) return 'insufficient material';
  if (t.includes('50') || t.includes('fifty')) return '50-move rule';
  if (t.includes('agreement')) return 'agreement';
  return undefined;
}

export { clockMs };

/** "600+5" -> 600 seconds with 5 added a move; daily games ("1/86400") have no clock. */
export function parseTimeControl(tc?: string): { base: number; inc: number } | undefined {
  const m = tc?.match(/^(\d+)(?:\+(\d+(?:\.\d+)?))?$/);
  return m ? { base: +m[1], inc: +(m[2] ?? 0) } : undefined;
}

export function toRecord(c: Candidate, user?: string): GameRecord | null {
  const parsed = parsePgn(c.pgn)[0];
  if (!parsed) return null;
  const { startFen, moves, sans } = mainlineMoves(parsed.tree);
  if (!moves.length) return null;
  const u = user?.toLowerCase();
  const userColor = u ? (c.white.toLowerCase() === u ? 'w' : c.black.toLowerCase() === u ? 'b' : undefined) : undefined;
  const fens = [startFen];
  const chess = new Chess(startFen);
  for (const m of moves) {
    chess.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
    fens.push(chess.fen());
  }
  const clock = parseTimeControl(parsed.headers.TimeControl);
  const times = mainline(parsed.tree).map((n) => n.clock ?? null);
  const clocks = clock && times.length && times.every((t) => t !== null) ? (times as number[]) : undefined;
  return {
    id: `imp-${c.site}-${c.key}`.replace(/[^a-zA-Z0-9-]/g, '').slice(0, 80),
    createdAt: c.endTime ?? Date.now(),
    source: c.site === 'PGN' || c.site.startsWith('pgn') ? 'pgn' : 'import',
    white: { name: c.white, elo: c.whiteElo, isUser: userColor === 'w' },
    black: { name: c.black, elo: c.blackElo, isUser: userColor === 'b' },
    result: (['1-0', '0-1', '1/2-1/2'].includes(c.result) ? c.result : '*') as GameRecord['result'],
    termination: normaliseTermination(parsed.headers.Termination),
    startFen,
    moves,
    sans,
    pgn: c.pgn,
    timeControl: c.timeClass ?? parsed.headers.TimeControl,
    clock,
    clocks,
    opening: parsed.headers.Opening ?? getOpeningBook()?.classify(fens)?.name,
    userColor,
    url: c.url,
    date: c.date,
  };
}
