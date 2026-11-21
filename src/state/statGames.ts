// Your last 20 games, each with its review (once done) and the mates you
// missed in it, for the Stats screen.
import { useEffect, useState } from 'react';
import { getReview, listGames, onDbChange } from '../lib/storage/db';
import type { StatGame } from '../lib/stats';
import { useSync } from './sync';
import { useSummaries } from './summaries';

export function useStatGames(): StatGame[] | null {
  const summaries = useSummaries();
  const keep = useSync((st) => st.keep);
  const [list, setList] = useState<StatGame[] | null>(null);
  useEffect(() => {
    if (!summaries) return;
    let alive = true;
    const load = async () => {
      const games = (await listGames())
        .filter((g) => g.userColor && g.source !== 'bot')
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, keep || undefined);
      const out: StatGame[] = [];
      for (const game of games) {
        const review = game.reviewedAt ? await getReview(game.id) : undefined;
        out.push({
          game,
          color: game.userColor!,
          review,
          matesMissed: summaries.get(game.id)?.mates?.filter((m) => m.kind === 'missed').length ?? 0,
        });
      }
      if (alive) setList(out);
    };
    void load();
    const off = onDbChange(() => void load());
    return () => {
      alive = false;
      off();
    };
  }, [summaries, keep]);
  return list;
}
