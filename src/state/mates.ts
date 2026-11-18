// The daily mate drill: mates from your own games, a few a day. One you
// solve first time without a hint comes back later and later; one you miss
// comes back tomorrow, until you get it.
import { useEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { listGames, onDbChange, type GameRecord } from '../lib/storage/db';
import type { MateChance } from '../lib/coach/mates';
import { useSummaries } from './summaries';

const DAY = 86_400_000;
const INTERVALS = [DAY, 3 * DAY, 7 * DAY, 16 * DAY, 35 * DAY];
/** Mates a day. */
export const DAILY = 5;

export interface MateProgress {
  box: number;
  due: number;
  tries: number;
  solved: number;
}

interface MateStore {
  progress: Record<string, MateProgress>;
  /** The day (local) `doneToday` is for. */
  day: string;
  doneToday: string[];
  grade(id: string, solved: boolean, clean: boolean): void;
}

const today = () => new Date().toDateString();

export const useMateStore = create<MateStore>()(
  persist(
    (set, get) => ({
      progress: {},
      day: today(),
      doneToday: [],
      grade(id, solved, clean) {
        const p = get().progress[id] ?? { box: -1, due: 0, tries: 0, solved: 0 };
        const box = solved && clean ? Math.min(INTERVALS.length - 1, p.box + 1) : 0;
        const next: MateProgress = { box, due: Date.now() + INTERVALS[box] - 3_600_000, tries: p.tries + 1, solved: p.solved + (solved ? 1 : 0) };
        const done = get().day === today() ? get().doneToday : [];
        set({ progress: { ...get().progress, [id]: next }, day: today(), doneToday: [...new Set([...done, id])] });
      },
    }),
    { name: 'ninjacoach.mates' },
  ),
);

export interface DrillItem extends MateChance {
  game?: GameRecord;
}

/** Every mate chance in your reviewed games (newest game first), and today's set. */
export function useMateDrill(): { all: DrillItem[]; queue: DrillItem[]; doneToday: number; more: number } | null {
  const summaries = useSummaries();
  const [games, setGames] = useState<GameRecord[] | null>(null);
  useEffect(() => {
    const load = () => void listGames().then(setGames);
    load();
    return onDbChange(load);
  }, []);
  const { progress, day, doneToday } = useMateStore();
  return useMemo(() => {
    if (!summaries || !games) return null;
    const byId = new Map(games.map((g) => [g.id, g]));
    const all: DrillItem[] = [...summaries.values()]
      .flatMap((s) => s.mates ?? [])
      .map((m) => ({ ...m, game: byId.get(m.gameId) }))
      .sort((a, b) => (b.game?.createdAt ?? 0) - (a.game?.createdAt ?? 0) || a.ply - b.ply);
    const done = day === today() ? doneToday : [];
    const now = Date.now();
    const due = all
      .filter((m) => progress[m.id] && progress[m.id].due <= now && !done.includes(m.id))
      .sort((a, b) => progress[a.id].due - progress[b.id].due);
    const fresh = all.filter((m) => !progress[m.id]);
    const waiting = [...due, ...fresh];
    const room = Math.max(0, DAILY - done.length);
    return { all, queue: waiting.slice(0, room), doneToday: done.length, more: Math.max(0, waiting.length - room) };
  }, [summaries, games, progress, day, doneToday]);
}

/** Today's mates still to do, for the coach's home screen. */
export function useMatesToday(): number {
  return useMateDrill()?.queue.length ?? 0;
}
