import { describe, expect, it } from 'vitest';
import { toCsv } from './masterSheet';
import type { GameRecord } from './storage/db';

const g: GameRecord = {
  id: 'g1',
  createdAt: Date.UTC(2026, 10, 20, 9, 30),
  source: 'import',
  white: { name: 'MingeNinja', elo: 410 },
  black: { name: 'Knight, "Owl"', elo: 425 },
  result: '1-0',
  termination: 'checkmate',
  startFen: '',
  moves: ['e2e4', 'e7e5', 'd1h5'],
  sans: [],
  pgn: '',
  timeControl: 'rapid',
  userColor: 'w',
  accuracy: { w: 81.25, b: 60 },
  reviewedAt: Date.UTC(2026, 10, 20, 10),
  url: 'https://www.chess.com/game/live/1',
};

describe('master sheet', () => {
  it('is a spreadsheet with one row per analysed game, quoting where needed', () => {
    const csv = toCsv([{ game: g, hash: 'ab'.repeat(32), summary: { gameId: 'g1', counts: { blunder: 2, best: 9 }, accuracy: 81.25, moments: [] } }]);
    const [head, row] = csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(head.startsWith('Fingerprint (SHA-256),Date,Played as,Opponent')).toBe(true);
    expect(row).toContain('ab'.repeat(32));
    expect(row).toContain('"Knight, ""Owl"""');
    expect(row).toContain(',Win,checkmate,rapid,');
    expect(row).toContain(',81.3,60.0,');
    const cols = head.split(',');
    const vals = row.match(/("([^"]|"")*"|[^,]*)(,|$)/g)!.map((v) => v.replace(/,$/, ''));
    expect(vals[cols.indexOf('Blunder')]).toBe('2');
    expect(vals[cols.indexOf('Best')]).toBe('9');
    expect(vals[cols.indexOf('Mistake')]).toBe('0');
  });
});
