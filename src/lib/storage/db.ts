// Local persistence (IndexedDB). Games, reviews and practice positions never
// leave the browser unless the user exports them.
import { createStore, del, entries, get, set, setMany, clear, type UseStore } from 'idb-keyval';
import type { Color } from 'chess.js';
import type { Classification, GameReview } from '../review/types';
import { gist } from '../coach/gist';

export type GameSource = 'bot' | 'import' | 'analysis' | 'pgn' | 'local' | 'online';
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*';

export interface PlayerInfo {
  name: string;
  elo?: number;
  isUser?: boolean;
  botId?: string;
}

export interface GameRecord {
  id: string;
  createdAt: number;
  source: GameSource;
  white: PlayerInfo;
  black: PlayerInfo;
  result: GameResult;
  termination?: string;
  startFen: string;
  /** Mainline moves in UCI. */
  moves: string[];
  sans: string[];
  pgn: string;
  timeControl?: string;
  /** Remaining clock (ms) after each ply, when the game was timed. */
  clocks?: number[];
  opening?: string;
  userColor?: Color;
  /** Accuracy summary once reviewed (kept on the record for fast listing). */
  accuracy?: { w: number; b: number };
  reviewedAt?: number;
  url?: string;
  date?: string;
}

export interface Puzzle {
  id: string;
  gameId: string;
  ply: number;
  fen: string;
  color: Color;
  /** Engine's best line (UCI); the first move is the answer. */
  solution: string[];
  solutionSan: string[];
  playedSan: string;
  /** The opponent's move that led to this position (UCI), shown on the board. */
  prev?: string;
  classification: string;
  comment: string;
  /** The pattern behind the mistake (see review/lessons). */
  lesson?: { icon: string; title: string; rule: string };
  createdAt: number;
  /** Leitner box (0 = new). */
  box: number;
  due: number;
  attempts: number;
  solved: number;
}

const games: UseStore = createStore('ninjacoach-games', 'games');
const reviews: UseStore = createStore('ninjacoach-reviews', 'reviews');
const puzzles: UseStore = createStore('ninjacoach-puzzles', 'puzzles');
const summaries: UseStore = createStore('ninjacoach-summaries', 'summaries');

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const listeners = new Set<() => void>();
export function onDbChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
const changed = () => listeners.forEach((l) => l());

export async function saveGame(g: GameRecord) {
  await set(g.id, g, games);
  changed();
}

export async function getGame(id: string): Promise<GameRecord | undefined> {
  return get(id, games);
}

export async function listGames(): Promise<GameRecord[]> {
  const all = await entries<string, GameRecord>(games);
  return all.map(([, g]) => g).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteGame(id: string) {
  await del(id, games);
  await del(id, reviews);
  const ps = await listPuzzles();
  for (const p of ps) if (p.gameId === id) await del(p.id, puzzles);
  changed();
}

export async function saveReview(gameId: string, review: GameReview) {
  await set(gameId, review, reviews);
  const g = await getGame(gameId);
  if (g) {
    g.accuracy = { w: review.white.accuracy, b: review.black.accuracy };
    g.reviewedAt = review.createdAt;
    if (review.opening && !g.opening) g.opening = review.opening.name;
    await set(gameId, g, games);
    if (g.userColor) await set(gameId, summarise(g, review), summaries);
  }
  changed();
}

/** One of your moves worth showing again: a brilliant find, or a mistake. */
export interface Moment {
  ply: number;
  cls: Classification;
  san: string;
  headline: string;
  /** What it did or allowed, in a sentence. */
  why?: string;
  /** Expected points it lost (0 for good moves). */
  epLoss: number;
}

/** What the coach keeps about each reviewed game, so its screens never load every full review. */
export interface GameSummary {
  gameId: string;
  /** Your moves by class. */
  counts: Partial<Record<Classification, number>>;
  accuracy: number;
  moments: Moment[];
}

const KEEP: Classification[] = ['brilliant', 'great', 'miss', 'mistake', 'blunder'];

export function summarise(g: GameRecord, review: GameReview): GameSummary {
  const color = g.userColor!;
  const mine = review.moves.filter((m) => m.color === color);
  const counts: Partial<Record<Classification, number>> = {};
  for (const m of mine) counts[m.classification] = (counts[m.classification] ?? 0) + 1;
  return {
    gameId: g.id,
    counts,
    accuracy: (color === 'w' ? review.white : review.black).accuracy,
    moments: mine
      .filter((m) => KEEP.includes(m.classification))
      .map((m) => ({ ply: m.ply, cls: m.classification, san: m.san, headline: m.headline, why: gist(m.comment), epLoss: m.epLoss })),
  };
}

export async function listSummaries(): Promise<GameSummary[]> {
  return (await entries<string, GameSummary>(summaries)).map(([, v]) => v);
}

/** Makes summaries for reviewed games that don't have one (e.g. after you say which side you were). */
export async function fillSummaries(): Promise<void> {
  const have = new Set((await entries<string, GameSummary>(summaries)).map(([k]) => k));
  for (const [id, g] of await entries<string, GameRecord>(games)) {
    if (have.has(id) || !g.userColor || !g.reviewedAt) continue;
    const r = await get<GameReview>(id, reviews);
    if (r) await set(id, summarise(g, r), summaries);
  }
}

export async function getReview(gameId: string): Promise<GameReview | undefined> {
  return get(gameId, reviews);
}

export async function listPuzzles(): Promise<Puzzle[]> {
  const all = await entries<string, Puzzle>(puzzles);
  return all.map(([, p]) => p);
}

export async function savePuzzles(list: Puzzle[]) {
  if (!list.length) return;
  await setMany(
    list.map((p) => [p.id, p]),
    puzzles,
  );
  changed();
}

export async function savePuzzle(p: Puzzle) {
  await set(p.id, p, puzzles);
  changed();
}

export async function deletePuzzle(id: string) {
  await del(id, puzzles);
  changed();
}

export interface Backup {
  app: 'ninjacoach';
  version: 1;
  exportedAt: number;
  games: GameRecord[];
  reviews: [string, GameReview][];
  puzzles: Puzzle[];
  profile: unknown;
  /** Course and puzzle-trainer progress (newer backups only). */
  learn?: unknown;
}

export async function exportAll(profile: unknown, learn?: unknown): Promise<Backup> {
  return {
    learn,
    app: 'ninjacoach',
    version: 1,
    exportedAt: Date.now(),
    games: await listGames(),
    reviews: await entries<string, GameReview>(reviews),
    puzzles: await listPuzzles(),
    profile,
  };
}

export async function importAll(b: Backup) {
  if (b.app !== 'ninjacoach') throw new Error('Not a Ninja Coach backup file');
  await setMany(
    b.games.map((g) => [g.id, g]),
    games,
  );
  await setMany(b.reviews, reviews);
  await setMany(
    b.puzzles.map((p) => [p.id, p]),
    puzzles,
  );
  changed();
}

export async function wipeAll() {
  await clear(games);
  await clear(reviews);
  await clear(puzzles);
  await clear(summaries);
  changed();
}
