// The master sheet: one row for every game the coach has analysed, with its
// fingerprint (SHA-256), as a spreadsheet (CSV) that opens in Excel, Google
// Sheets or any spreadsheet app. In the Android app it is kept up to date in
// Downloads/Ninja Coach/ by itself; anywhere else it is saved on request.
import { gameHash } from './gameHash';
import { listGames, listSummaries, type GameRecord, type GameSummary } from './storage/db';
import { keepFileUpdated, shareOrSaveFile } from './platform';
import type { Classification } from './review/types';

export const SHEET_NAME = 'ninja-coach-master-sheet.csv';
const CLASSES: [Classification, string][] = [
  ['brilliant', 'Brilliant'],
  ['great', 'Great'],
  ['best', 'Best'],
  ['excellent', 'Excellent'],
  ['good', 'Good'],
  ['book', 'Book'],
  ['inaccuracy', 'Inaccuracy'],
  ['mistake', 'Mistake'],
  ['miss', 'Miss'],
  ['blunder', 'Blunder'],
];

export interface SheetRow {
  game: GameRecord;
  hash: string;
  summary?: GameSummary;
}

/** Every analysed game, newest first, with its fingerprint. */
export async function sheetRows(): Promise<SheetRow[]> {
  const sums = new Map((await listSummaries()).map((s) => [s.gameId, s]));
  return (await listGames())
    .filter((g) => g.reviewedAt)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((g) => ({ game: g, hash: g.hash ?? gameHash(g), summary: sums.get(g.id) }));
}

const cell = (v: string | number | undefined | null) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function outcomeOf(g: GameRecord): string {
  if (g.result === '1/2-1/2') return 'Draw';
  if (!g.userColor || g.result === '*') return g.result;
  return (g.result === '1-0') === (g.userColor === 'w') ? 'Win' : 'Loss';
}

export function toCsv(rows: SheetRow[]): string {
  const head = [
    'Fingerprint (SHA-256)',
    'Date',
    'Played as',
    'Opponent',
    'Opponent rating',
    'Your rating',
    'Result',
    'How it ended',
    'Time control',
    'Opening',
    'Moves',
    'Your accuracy',
    'Their accuracy',
    ...CLASSES.map(([, l]) => l),
    'Analysed on',
    'Link',
  ];
  const lines = rows.map(({ game: g, hash, summary }) => {
    const me = g.userColor === 'b' ? g.black : g.white;
    const opp = g.userColor === 'b' ? g.white : g.black;
    const acc = g.accuracy && g.userColor ? [g.accuracy[g.userColor], g.accuracy[g.userColor === 'w' ? 'b' : 'w']] : [undefined, undefined];
    return [
      hash,
      new Date(g.createdAt).toISOString().slice(0, 16).replace('T', ' '),
      g.userColor === 'b' ? 'Black' : g.userColor === 'w' ? 'White' : '',
      opp.name,
      opp.elo,
      me.elo,
      outcomeOf(g),
      g.termination,
      g.source === 'bot' ? 'Sensei' : g.timeControl,
      g.opening,
      Math.ceil(g.moves.length / 2),
      acc[0]?.toFixed(1),
      acc[1]?.toFixed(1),
      ...CLASSES.map(([c]) => summary?.counts[c] ?? (summary ? 0 : '')),
      g.reviewedAt ? new Date(g.reviewedAt).toISOString().slice(0, 16).replace('T', ' ') : '',
      g.url,
    ]
      .map(cell)
      .join(',');
  });
  // A byte-order mark so Excel reads the names correctly.
  return '﻿' + [head.map(cell).join(','), ...lines].join('\r\n') + '\r\n';
}

/** Saves a copy wherever you choose (share sheet, download). */
export async function saveSheetCopy(): Promise<string | null> {
  return shareOrSaveFile(SHEET_NAME, 'text/csv', toCsv(await sheetRows()));
}

/** Rewrites the sheet kept on the phone; returns where it is, or null where that isn't possible. */
export async function updateKeptSheet(): Promise<string | null> {
  return keepFileUpdated(SHEET_NAME, 'text/csv', toCsv(await sheetRows()));
}
