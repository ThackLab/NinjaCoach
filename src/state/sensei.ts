// Your games against Sensei: the one in progress (kept if you leave the
// screen), his rating, which starts just above your chess.com rating and
// moves with your results, and your record against him.
import type { Color } from 'chess.js';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SenseiNote } from '../lib/coach/sensei';
import type { GameResult } from '../lib/storage/db';

export interface SenseiGame {
  startFen: string;
  moves: string[];
  you: Color;
  /** Sensei's rating for this game. */
  elo: number;
  notes: SenseiNote[];
  result?: GameResult;
  termination?: string;
  /** The saved game, once it's over (for its review). */
  savedId?: string;
  startedAt: number;
}

interface SenseiStore {
  /** Sensei's rating; null until the first game sets it from your chess.com rating. */
  elo: number | null;
  record: { w: number; d: number; l: number };
  game: SenseiGame | null;
  setGame: (g: SenseiGame | null) => void;
  patch: (p: Partial<SenseiGame>) => void;
  /** Counts the result and moves Sensei's rating: up after your wins, down after your losses. */
  score: (outcome: 'w' | 'd' | 'l') => void;
  setElo: (elo: number) => void;
}

const STEP = { w: 60, d: 15, l: -40 };

export const useSensei = create<SenseiStore>()(
  persist(
    (set, get) => ({
      elo: null,
      record: { w: 0, d: 0, l: 0 },
      game: null,
      setGame: (game) => set({ game }),
      patch: (p) => set((s) => (s.game ? { game: { ...s.game, ...p } } : s)),
      score: (o) =>
        set((s) => ({
          record: { ...s.record, [o]: s.record[o] + 1 },
          elo: Math.max(100, Math.min(2600, (s.elo ?? get().game?.elo ?? 800) + STEP[o])),
        })),
      setElo: (elo) => set({ elo }),
    }),
    { name: 'ninjacoach.sensei' },
  ),
);
