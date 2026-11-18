// `#/moments`: your moves worth seeing again, from every reviewed game. The
// brilliant and great ones to enjoy, the blunders, mistakes and missed wins to
// learn from. Each opens on the board with "show me" ready.
import { useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { ClassIcon } from '../components/ClassIcon';
import { PageHead } from '../components/ui';
import { navigate, useRoute } from '../lib/router';
import { CLASS_META, type Classification } from '../lib/review/types';
import type { GameRecord, Moment } from '../lib/storage/db';
import { useSummaries } from '../state/summaries';
import { useLibrary } from '../state/sync';
import { when } from './Games';

const KINDS: { id: string; label: string; cls: Classification[] }[] = [
  { id: 'brilliant', label: 'Brilliant', cls: ['brilliant'] },
  { id: 'great', label: 'Great', cls: ['great'] },
  { id: 'blunder', label: 'Blunders', cls: ['blunder'] },
  { id: 'mistake', label: 'Mistakes', cls: ['mistake'] },
  { id: 'miss', label: 'Missed wins', cls: ['miss'] },
];

const moveNo = (m: Moment) => `${Math.floor(m.ply / 2) + 1}${m.ply % 2 === 0 ? '.' : '...'}`;

export function MomentsPage() {
  const route = useRoute();
  const [kind, setKind] = useState(KINDS.find((k) => k.id === route.query.get('kind'))?.id ?? 'brilliant');
  const { games } = useLibrary();
  const summaries = useSummaries();
  const list = useMemo(() => {
    const k = KINDS.find((x) => x.id === kind)!;
    const out: { g: GameRecord; m: Moment }[] = [];
    for (const g of games ?? []) for (const m of summaries?.get(g.id)?.moments ?? []) if (k.cls.includes(m.cls)) out.push({ g, m });
    // Newest games first; within a game, the costliest mistake first.
    return out.slice(0, 300);
  }, [games, summaries, kind]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of summaries?.values() ?? []) for (const m of s.moments) c[m.cls] = (c[m.cls] ?? 0) + 1;
    return c;
  }, [summaries]);

  return (
    <div className="page narrow nc-moments">
      <PageHead title="Moments" sub="Your best finds and your costliest slips, from every reviewed game." />
      <div className="nc-kinds" role="tablist">
        {KINDS.map((k) => (
          <button key={k.id} role="tab" aria-selected={kind === k.id} className={kind === k.id ? 'on' : ''} onClick={() => setKind(k.id)}>
            <ClassIcon cls={k.cls[0]} size={16} /> {k.label} <span className="faint">{k.cls.reduce((n, c) => n + (counts[c] ?? 0), 0)}</span>
          </button>
        ))}
      </div>
      {summaries && !list.length && <p className="faint nc-empty">None yet. They show up here as your games are reviewed.</p>}
      <div className="nc-moment-list">
        {list.map(({ g, m }) => {
          const o = g.userColor === 'w' ? g.black : g.white;
          return (
            <button key={`${g.id}:${m.ply}`} className="nc-moment" onClick={() => navigate(`/review/${g.id}?ply=${m.ply}&show=1`)}>
              <ClassIcon cls={m.cls} size={24} />
              <span className="nm-body">
                <b>
                  {moveNo(m)} {m.san}{' '}
                  <span className="nm-cls" style={{ color: CLASS_META[m.cls].color }}>
                    {CLASS_META[m.cls].label.toLowerCase()}
                  </span>
                </b>
                <span className="faint">{m.why || m.headline}</span>
                <span className="faint nm-game">
                  vs {o.name} · {when(g.createdAt)}
                </span>
              </span>
              <ChevronRight size={18} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
