// Ninja Coach's link to chess.com: it brings in every game you have played
// there, newest month first, and reviews them in the background, newest
// first. Finished months are fetched once; the current month is checked
// again whenever the app opens or comes back to the front.
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { chessComArchiveGames, chessComArchives, toRecord } from '../lib/importGames';
import { getGame, listGames, onDbChange, saveGame, type GameRecord } from '../lib/storage/db';
import { useReviewer } from './reviewer';
import { useSettings } from './settings';

const RECHECK = 10 * 60_000;
/** Games from the last week are reviewed at the depth chosen in Settings; older ones a little faster. */
const RECENT = 7 * 86_400_000;
const BACKLOG_DEPTH = 12;

interface SyncState {
  username: string;
  /** Archive URLs of finished months already brought in. */
  archivesDone: string[];
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
      archivesDone: [],
      lastSync: 0,
      lastError: '',
      syncing: false,
      fetched: null,
      lastNew: 0,
      debriefed: {},
      setUsername: (name) => set({ username: name.trim(), archivesDone: [], lastSync: 0, lastError: '' }),
      markDebriefed: (id) => set((s) => ({ debriefed: { ...s.debriefed, [id]: Date.now() } })),
      sync: async (force = false) => {
        const s = get();
        if (!s.username || s.syncing) return;
        if (!force && Date.now() - s.lastSync < RECHECK) return void reviewBacklog();
        set({ syncing: true, lastError: '', fetched: null });
        let added = 0;
        try {
          const archives = await chessComArchives(s.username);
          const todo = [...archives].reverse().filter((url, i) => i === 0 || !get().archivesDone.includes(url));
          set({ fetched: { done: 0, total: todo.length } });
          for (const [i, url] of todo.entries()) {
            for (const c of await chessComArchiveGames(url)) {
              const rec = toRecord(c, s.username);
              if (!rec?.userColor || (await getGame(rec.id))) continue;
              await saveGame(rec);
              added++;
            }
            // The newest month can still change; finished months are done for good.
            const finished = url !== archives[archives.length - 1];
            set((st) => ({
              fetched: { done: i + 1, total: todo.length },
              archivesDone: finished && !st.archivesDone.includes(url) ? [...st.archivesDone, url] : st.archivesDone,
            }));
            // Start reviewing as soon as the newest games are in.
            if (i === 0) void reviewBacklog();
          }
          set({ syncing: false, fetched: null, lastSync: Date.now(), lastNew: added });
        } catch (e) {
          set({ syncing: false, fetched: null, lastSync: Date.now(), lastError: e instanceof Error ? e.message : String(e) });
        }
        void reviewBacklog();
      },
    }),
    {
      name: 'ninjacoach.sync',
      version: 1,
      partialize: (s) => ({ username: s.username, archivesDone: s.archivesDone, lastSync: s.lastSync, lastNew: s.lastNew, debriefed: s.debriefed }),
    },
  ),
);

let reviewing = false;

/** Reviews every game that has no review yet, newest first, one at a time. */
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
      const recent = Date.now() - next.createdAt < RECENT;
      try {
        await useReviewer.getState().start(next.id, { depth: recent ? useSettings.getState().reviewDepth : BACKLOG_DEPTH });
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
