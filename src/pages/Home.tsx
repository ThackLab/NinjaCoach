// `#/`: the coach. What it is doing (fetching, reviewing), the game to go over
// next, how your last games went move by move, the habit to work on, and your
// chess.com rating.
import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { ClassIcon } from '../components/ClassIcon';
import { HabitCard } from '../components/HabitCard';
import { SectionTitle, Sparkline } from '../components/ui';
import { focusHabit } from '../lib/coach/debrief';
import { navigate } from '../lib/router';
import type { GameRecord, GameSummary } from '../lib/storage/db';
import { CLASS_META, type Classification } from '../lib/review/types';
import { useReviewer } from '../state/reviewer';
import { useRecentReviews, useSummaries } from '../state/summaries';
import { useLibrary, useSync } from '../state/sync';
import { usePracticeDue } from '../state/practice';
import { useMateDrill } from '../state/mates';
import { ResultChip, when } from './Games';

const SHOWN: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
const opp = (g: GameRecord) => (g.userColor === 'w' ? g.black : g.white);
const mine = (g: GameRecord) => (g.userColor === 'w' ? g.white : g.black);

export function HomePage() {
  const sync = useSync();
  const { games, reviewed } = useLibrary();
  const summaries = useSummaries();
  const recent = useRecentReviews(12);
  const job = useReviewer((s) => Object.values(s.jobs).find((j) => j.status === 'running'));
  const due = usePracticeDue();
  const mates = useMateDrill();

  const total = games?.length ?? 0;
  const latest = games?.find((g) => g.reviewedAt && !sync.debriefed[g.id]);
  const last20 = useMemo(() => (games ?? []).filter((g) => summaries?.has(g.id)).slice(0, 20), [games, summaries]);
  const tally = useMemo(() => {
    const t: Partial<Record<Classification, number>> = {};
    let acc = 0;
    for (const g of last20) {
      const s = summaries!.get(g.id)!;
      for (const [k, v] of Object.entries(s.counts)) t[k as Classification] = (t[k as Classification] ?? 0) + (v ?? 0);
      acc += s.accuracy;
    }
    return { t, acc: last20.length ? acc / last20.length : null };
  }, [last20, summaries]);
  const record = last20.reduce(
    (r, g) => {
      const s = g.result === '1/2-1/2' ? 'd' : (g.result === '1-0') === (g.userColor === 'w') ? 'w' : 'l';
      return { ...r, [s]: r[s as 'w'] + 1 };
    },
    { w: 0, d: 0, l: 0 },
  );
  const habit = useMemo(() => (recent?.length ? focusHabit(recent) : null), [recent]);
  const ratings = (games ?? [])
    .filter((g) => mine(g).elo)
    .slice(0, 60)
    .reverse()
    .map((g) => mine(g).elo!);

  return (
    <div className="page narrow nc-home">
      {(sync.syncing || (total > 0 && reviewed < total)) && (
        <section className="card-box nc-status">
          {sync.syncing ? (
            <>
              <b>Fetching your games from chess.com…</b>
              <span className="faint">
                {sync.fetched ? `Month ${Math.min(sync.fetched.done + 1, sync.fetched.total)} of ${sync.fetched.total}` : 'Looking up your account'} ·{' '}
                {total} games so far
              </span>
              {sync.fetched && (
                <div className="progress">
                  <div style={{ width: `${(100 * sync.fetched.done) / Math.max(1, sync.fetched.total)}%` }} />
                </div>
              )}
            </>
          ) : (
            <>
              <b>
                Reviewed {reviewed} of {total} games
              </b>
              <span className="faint">
                Newest first. {job ? `This one: ${Math.round((100 * job.done) / Math.max(1, job.total))}%.` : ''} Keep the app open and it carries on.
              </span>
              <div className="progress">
                <div style={{ width: `${(100 * reviewed) / Math.max(1, total)}%` }} />
              </div>
            </>
          )}
        </section>
      )}
      {sync.lastError && !sync.syncing && (
        <section className="card-box nc-status warn">
          <b>Couldn't reach chess.com</b>
          <span className="faint">{sync.lastError}</span>
          <button className="btn small" onClick={() => void sync.sync(true)}>
            Try again
          </button>
        </section>
      )}

      {latest ? (
        <button className="nc-latest" onClick={() => navigate(`/review/${latest.id}?debrief=1`)}>
          <span className="nl-top">
            <span className="coach-step">Ready to go over</span>
            <span className="faint">{when(latest.createdAt)}</span>
          </span>
          <span className="nl-main">
            <ResultChip g={latest} />
            <b>
              vs {opp(latest).name}
              {opp(latest).elo ? <span className="faint"> ({opp(latest).elo})</span> : null}
            </b>
          </span>
          {summaries?.get(latest.id) && <ClassChips s={summaries.get(latest.id)!} />}
          <span className="btn primary nl-go">
            Debrief with your coach <ChevronRight size={16} />
          </span>
        </button>
      ) : (
        total > 0 &&
        reviewed > 0 && (
          <section className="card-box nc-caught-up">
            <b>You're all caught up.</b>
            <span className="faint">Play on chess.com and your coach will have the game ready next time you open the app.</span>
          </section>
        )
      )}

      {last20.length > 0 && (
        <>
          <SectionTitle action={{ label: 'All games', href: '#/games' }}>
            {last20.length === 1 ? 'Your last game' : `Your last ${last20.length} games`}
          </SectionTitle>
          <section className="card-box nc-tally">
            <div className="nt-head">
              <span>
                <b>{tally.acc !== null ? tally.acc.toFixed(1) : '–'}</b> average accuracy
              </span>
              <span className="faint">
                {record.w}W {record.d}D {record.l}L
              </span>
            </div>
            {SHOWN.filter((c) => tally.t[c]).map((c) => (
              <button
                key={c}
                className="nt-row"
                onClick={() => navigate(`/moments?kind=${c}`)}
                disabled={!['brilliant', 'great', 'miss', 'mistake', 'blunder'].includes(c)}
              >
                <ClassIcon cls={c} size={20} />
                <span className="nt-name">{CLASS_META[c].label}</span>
                <span className="nt-count" style={{ color: CLASS_META[c].color }}>
                  {tally.t[c]}
                </span>
                <span className="nt-per faint">{(tally.t[c]! / last20.length).toFixed(1)} a game</span>
              </button>
            ))}
          </section>
        </>
      )}

      <SectionTitle>What we're working on</SectionTitle>
      {habit ? (
        <HabitCard h={habit} />
      ) : (
        <p className="faint nc-empty">Once a few games are reviewed, your coach picks the habit that costs you the most.</p>
      )}
      {mates && mates.all.length > 0 && (
        <button className="nc-link nc-mates" onClick={() => navigate('/mates')}>
          <b>Mate drill</b>
          <span className="faint">
            {mates.queue.length
              ? `${mates.queue.length} mate${mates.queue.length === 1 ? '' : 's'} from your games to find today`
              : `Done for today · ${mates.all.length} mate${mates.all.length === 1 ? '' : 's'} found in your games`}
          </span>
          <ChevronRight size={18} />
        </button>
      )}
      {due > 0 && (
        <button className="nc-link" onClick={() => navigate('/practice')}>
          <b>Practise your own mistakes</b>
          <span className="faint">{due} positions from your games are due</span>
          <ChevronRight size={18} />
        </button>
      )}

      {ratings.length > 1 && (
        <>
          <SectionTitle action={{ label: 'Progress', href: '#/progress' }}>Your chess.com rating</SectionTitle>
          <section className="card-box nc-rating">
            <div className="nr-head">
              <b>{ratings[ratings.length - 1]}</b>
              <span className={ratings[ratings.length - 1] >= ratings[0] ? 'up' : 'down'}>
                {ratings[ratings.length - 1] >= ratings[0] ? '+' : ''}
                {ratings[ratings.length - 1] - ratings[0]} over your last {ratings.length} games
              </span>
            </div>
            <Sparkline values={ratings} height={56} color="var(--accent)" />
          </section>
        </>
      )}
    </div>
  );
}

function ClassChips({ s }: { s: GameSummary }) {
  return (
    <span className="nc-chips">
      {(['brilliant', 'great', 'mistake', 'miss', 'blunder'] as Classification[])
        .filter((c) => s.counts[c])
        .map((c) => (
          <span key={c} className="nc-chip">
            <ClassIcon cls={c} size={16} /> {s.counts[c]}
          </span>
        ))}
      <span className="nc-chip faint">{s.accuracy.toFixed(1)}% accuracy</span>
    </span>
  );
}
