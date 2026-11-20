// Ninja Coach's link to chess.com: it keeps your newest 20 games (fetching
// back through the monthly archives until it has them), reviews them in the
// background, newest first, and lets older ones drop off as new ones come in.
// It checks again whenever the app opens or comes back to the front.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chessComArchiveGames, chessComArchives, toRecord } from '../lib/importGames';
import { deleteGame, getGame, listGames, onDbChange, saveGame, type GameRecord } from '../lib/storage/db';
import { useReviewer } from './reviewer';
import { useSettings } from './settings';

const RECHECK = 10 * 60_000;
/** Your newest games get the review depth chosen in Settings; the rest a quicker one, so all 20 get done sooner. */
const NEWEST = 3;
const QUICK_DEPTH = 12;
/** How many of your latest games the coach keeps and reviews. */
export const KEEP = 20;

interface SyncState {
  username: string;
  lastSync: number;
  lastError: string;
  syncing: boolean;
  /** While fetching: months done of months to fetch. */
  fetched: { done: number; total: number } | null;
  /** How many games the last sync brought in. */
  lastNew: number;
  /** Games you have gone over with the coach, and when. */
  debriefed: Record<string, number>;
  setUsername: (name: string) => void;
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
      fetched: null,
      lastNew: 0,
      debriefed: {},
      setUsername: (name) => set({ username: name.trim(), lastSync: 0, lastError: '' }),
      markDebriefed: (id) => set((s) => ({ debriefed: { ...s.debriefed, [id]: Date.now() } })),
      sync: async (force = false) => {
        const s = get();
        if (!s.username || s.syncing) return;
        if (!force && Date.now() - s.lastSync < RECHECK) return void reviewBacklog();
        set({ syncing: true, lastError: '', fetched: { done: 0, total: KEEP } });
        let added = 0;
        try {
          // Newest month first, back until there are 20 games.
          const archives = [...(await chessComArchives(s.username))].reverse();
          const found: GameRecord[] = [];
          for (const url of archives) {
            for (const c of await chessComArchiveGames(url)) {
              const rec = toRecord(c, s.username);
              if (rec?.userColor) found.push(rec);
            }
            set({ fetched: { done: Math.min(found.length, KEEP), total: KEEP } });
            if (found.length >= KEEP) break;
          }
          const keep = found.sort((a, b) => b.createdAt - a.createdAt).slice(0, KEEP);
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
          // Older games drop off, with their reviews.
          const ids = new Set(keep.map((r) => r.id));
          for (const g of await listGames()) if (!ids.has(g.id)) await deleteGame(g.id);
          set({ syncing: false, fetched: null, lastSync: Date.now(), lastNew: added });
        } catch (e) {
          set({ syncing: false, fetched: null, lastSync: Date.now(), lastError: e instanceof Error ? e.message : String(e) });
        }
        void reviewBacklog();
      },
    }),
    {
      name: 'ninjacoach.sync',
      // Version 2 keeps only the last 20 games: check again straight away after the update.
      version: 2,
      migrate: (old) => ({ ...(old as object), lastSync: 0 }) as SyncState,
      partialize: (s) => ({ username: s.username, lastSync: s.lastSync, lastNew: s.lastNew, debriefed: s.debriefed }),
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
  useEffect(() => {
    const load = () => void listGames().then((all) => setGames(all.filter((g) => g.userColor).sort((a, b) => b.createdAt - a.createdAt)));
    load();
    return onDbChange(load);
  }, []);
  return { games, reviewed: games?.filter((g) => g.reviewedAt).length ?? 0 };
}
