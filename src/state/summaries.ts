// The coach's view of your reviewed games: a small summary of each (kept
// with the review, see storage/db.ts), and the full reviews of the latest few.
import { useEffect, useState } from 'react';
import { fillSummaries, getGame, getReview, listGames, listSummaries, onDbChange, type GameSummary } from '../lib/storage/db';
import type { ReviewedGame } from '../lib/coach/debrief';

let filled = false;

export function useSummaries(): Map<string, GameSummary> | null {
  const [map, setMap] = useState<Map<string, GameSummary> | null>(null);
  useEffect(() => {
    const load = async () => {
      if (!filled) {
        filled = true;
        await fillSummaries();
      }
      setMap(new Map((await listSummaries()).map((s) => [s.gameId, s])));
    };
    void load();
    return onDbChange(() => void load());
  }, []);
  return map;
}

/** The full reviews of your `n` most recent reviewed games (for habits). */
export function useRecentReviews(n: number): ReviewedGame[] | null {
  const [list, setList] = useState<ReviewedGame[] | null>(null);
  useEffect(() => {
    const load = async () => {
      const games = (await listGames())
        .filter((g) => g.userColor && g.reviewedAt && g.source !== 'bot')
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, n);
      const out: ReviewedGame[] = [];
      for (const g of games) {
        const review = await getReview(g.id);
        const game = await getGame(g.id);
        if (review && game) out.push({ game, review, color: game.userColor! });
      }
      setList(out);
    };
    void load();
    return onDbChange(() => void load());
  }, [n]);
  return list;
}
