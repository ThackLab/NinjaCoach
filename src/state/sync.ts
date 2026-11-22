// Ninja Coach's link to chess.com: it keeps your newest games (20 unless you
// choose 50, 100, 200 or all of them on the Stats screen), fetching back
// through the monthly archives until it has them, reviews them in the
// background, newest first, and lets older ones drop off as new ones come
// in. It checks again whenever the app opens or comes back to the front.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chessComArchiveGames, chessComArchives, toRecord } from '../lib/importGames';
import { deleteGame, getGame, listGames, onDbChange, saveGame, type GameRecord } from '../lib/storage/db';
import { useReviewer } from './reviewer';
import { useSettings } from './settings';

const RECHECK = 10 * 60_000;
/** Your newest games get the review depth chosen in Settings; the rest a quicker one, so they all get done sooner. */
const NEWEST = 3;
const QUICK_DEPTH = 12;
/** How many of your latest games the coach can keep and review; 0 is all of them. */
export const WINDOWS = [20, 50, 100, 200, 0] as const;
export type GameWindow = (typeof WINDOWS)[number];
let resync = false;

interface SyncState {
  username: string;
  lastSync: number;
  lastError: string;
  syncing: boolean;
  /** How many of your latest games to keep and review (0 = all). */
  keep: GameWindow;
  /** While fetching: months looked through of all your months, and the games found so far. */
  fetched: { done: number; total: number; games: number } | null;
  /** How many games the last sync brought in. */
  lastNew: number;
  /** Games you have gone over with the coach, and when. */
  debriefed: Record<string, number>;
  setUsername: (name: string) => void;
  setKeep: (n: GameWindow) => void;
  markDebriefed: (id: string) => void;
  sync: (force?: boolean) => Promise<void>;
}

export const useSync = create<SyncState>()(
  persist(
    (set, get) => ({
      username: '',
      lastSync: 0,
      lastError: '',
      syncing: false,
      keep: 20,
      fetched: null,
      lastNew: 0,
      debriefed: {},
      setUsername: (name) => set({ username: name.trim(), lastSync: 0, lastError: '' }),
      setKeep: (keep) => {
        if (keep === get().keep) return;
        set({ keep, lastSync: 0 });
        if (get().syncing) resync = true;
        else void get().sync(true);
      },
      markDebriefed: (id) => set((s) => ({ debriefed: { ...s.debriefed, [id]: Date.now() } })),
      sync: async (force = false) => {
        const s = get();
        if (!s.username || s.syncing) return;
        if (!force && Date.now() - s.lastSync < RECHECK) return void reviewBacklog();
        const limit = s.keep || Infinity;
        set({ syncing: true, lastError: '', fetched: null });
        let added = 0;
        try {
          // Newest month first, back until there are enough games.
          const archives = [...(await chessComArchives(s.username))].reverse();
          const found: GameRecord[] = [];
          set({ fetched: { done: 0, total: archives.length, games: 0 } });
          for (const [i, url] of archives.entries()) {
            for (const c of await chessComArchiveGames(url)) {
              const rec = toRecord(c, s.username);
              if (rec?.userColor) found.push(rec);
            }
            set({ fetched: { done: i + 1, total: archives.length, games: found.length } });
            if (found.length >= limit) break;
          }
          const keep = found.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
          for (const rec of keep) {
            const have = await getGame(rec.id);
            if (!have) {
              await saveGame(rec);
              added++;
            } else if (!have.clock && rec.clock) {
              // Games brought in before clocks were read: add them, keep the review.
              await saveGame({ ...have, clock: rec.clock, clocks: rec.clocks, termination: rec.termination ?? have.termination });
            }
          }
          // Older games that were never reviewed drop off. Reviewed games stay for good: their
          // reviews, fingerprints and place in the master sheet are kept whatever the window.
          const ids = new Set(keep.map((r) => r.id));
          for (const g of await listGames()) if (g.source === 'import' && !ids.has(g.id) && !g.reviewedAt) await deleteGame(g.id);
          set({ syncing: false, fetched: null, lastSync: Date.now(), lastNew: added });
        } catch (e) {
          set({ syncing: false, fetched: null, lastSync: Date.now(), lastError: e instanceof Error ? e.message : String(e) });
        }
        // The number of games was changed while this was fetching: fetch again for the new number.
        if (resync) {
          resync = false;
          return void get().sync(true);
        }
        void reviewBacklog();
      },
    }),
    {
      name: 'ninjacoach.sync',
      // Version 2 keeps only the last 20 games: check again straight away after the update.
      version: 2,
      migrate: (old) => ({ ...(old as object), lastSync: 0 }) as SyncState,
      partialize: (s) => ({ username: s.username, keep: s.keep, lastSync: s.lastSync, lastNew: s.lastNew, debriefed: s.debriefed }),
    },
  ),
);

let reviewing = false;

/** Reviews each of your games that has no review yet, newest first, one at a time. */
export async function reviewBacklog() {
  if (reviewing) return;
  reviewing = true;
  try {
    const tried = new Set<string>();
    for (;;) {
      const next = (await listGames())
        .filter((g) => g.userColor && !g.reviewedAt && g.moves.length >= 4 && !tried.has(g.id))
        .sort((a, b) => b.createdAt - a.createdAt)[0];
      if (!next) break;
      tried.add(next.id);
      const newest = (await listGames())
        .filter((g) => g.userColor)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, NEWEST)
        .some((g) => g.id === next.id);
      const chosen = useSettings.getState().reviewDepth;
      try {
        await useReviewer.getState().start(next.id, { depth: newest ? chosen : Math.min(chosen, QUICK_DEPTH) });
      } catch {
        break;
      }
      const job = useReviewer.getState().jobs[next.id];
      if (job && job.status !== 'done') break;
    }
  } finally {
    reviewing = false;
  }
}

/** Looks for new games when the app opens and whenever it comes back to the front. */
export function watchForGames() {
  const look = () => void useSync.getState().sync();
  look();
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && look());
}

/** Your games, kept up to date (newest first), and how many are reviewed. */
export function useLibrary(): { games: GameRecord[] | null; reviewed: number } {
  const [games, setGames] = useState<GameRecord[] | null>(null);
  const keep = useSync((st) => st.keep);
  useEffect(() => {
    // Your newest chess.com games, as many as the window (games against Sensei are kept apart,
    // and older reviewed games stay in the Games list and the master sheet).
    const load = () =>
      void listGames().then((all) => {
        const mine = all.filter((g) => g.userColor && g.source !== 'bot').sort((a, b) => b.createdAt - a.createdAt);
        setGames(keep ? mine.slice(0, keep) : mine);
      });
    load();
    return onDbChange(load);
  }, [keep]);
  return { games, reviewed: games?.filter((g) => g.reviewedAt).length ?? 0 };
}
