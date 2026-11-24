// `#/`: the coach, on one screen. What it's doing (only while it works), the
// game to go over next, your numbers for the games you've chosen (kind and
// how many), the moves that matter, and four ways to train.
import { useMemo, useState } from 'react';
import { ChevronRight, Crosshair, Dumbbell, Map as MapIcon } from 'lucide-react';
import { ClassIcon } from '../components/ClassIcon';
import { focusHabit } from '../lib/coach/debrief';
import { askBatteryExempt, canWorkLocked, isBatteryExempt } from '../lib/platform';
import { navigate } from '../lib/router';
import type { GameRecord } from '../lib/storage/db';
import { CLASS_META, type Classification } from '../lib/review/types';
import { useReviewer } from '../state/reviewer';
import { useRecentReviews, useSummaries } from '../state/summaries';
import { useLibrary, useSync } from '../state/sync';
import { GamePickers } from '../components/Pickers';
import { usePracticeDue } from '../state/practice';
import { useSettings } from '../state/settings';
import { useSensei } from '../state/sensei';
import { useMateDrill } from '../state/mates';

/** The moves worth counting at a glance; the full breakdown is on Stats. */
const KEY: Classification[] = ['brilliant', 'great', 'inaccuracy', 'mistake', 'miss', 'blunder'];
const MOMENT_KIND: Partial<Record<Classification, string>> = {
  brilliant: 'brilliant',
  great: 'great',
  mistake: 'mistake',
  miss: 'miss',
  blunder: 'blunder',
};
const opp = (g: GameRecord) => (g.userColor === 'w' ? g.black : g.white);
const mine = (g: GameRecord) => (g.userColor === 'w' ? g.white : g.black);
const outcome = (g: GameRecord) => (g.result === '1/2-1/2' ? 'd' : (g.result === '1-0') === (g.userColor === 'w') ? 'w' : 'l');

/** Your newest games as one row of small squares: reviewed (with the result), being reviewed, or waiting. */
function GameTally({ games }: { games: GameRecord[] }) {
  const jobs = useReviewer((s) => s.jobs);
  return (
    <div className="nc-strip" aria-label="Your newest games">
      {games.map((g) => {
        const job = jobs[g.id];
        const running = job?.status === 'running';
        const o = outcome(g);
        const state = g.reviewedAt ? 'done' : running ? 'now' : 'todo';
        return (
          <button
            key={g.id}
            className={`nc-dot ${state} ${o}`}
            aria-label={`${o === 'w' ? 'Won' : o === 'l' ? 'Lost' : 'Drew'} vs ${opp(g).name}: ${state === 'done' ? 'reviewed' : state === 'now' ? 'being reviewed' : 'waiting'}`}
            onClick={() => g.reviewedAt && navigate(`/review/${g.id}`)}
            style={running ? ({ '--p': `${Math.round((100 * job.done) / Math.max(1, job.total))}%` } as React.CSSProperties) : undefined}
          />
        );
      })}
    </div>
  );
}

export function HomePage() {
  const sync = useSync();
  const { games, reviewed } = useLibrary();
  const summaries = useSummaries();
  const recent = useRecentReviews(12);
  const job = useReviewer((s) => Object.values(s.jobs).find((j) => j.status === 'running'));
  const due = usePracticeDue();
  const locked = useSettings((st) => st.lockedReviews) && canWorkLocked;
  const [exempt, setExempt] = useState(isBatteryExempt);
  const senseiGame = useSensei((st) => st.game);
  const mates = useMateDrill();

  const total = games?.length ?? 0;
  const latest = games?.find((g) => g.reviewedAt && !sync.debriefed[g.id]);
  const done = useMemo(() => (games ?? []).filter((g) => summaries?.has(g.id)), [games, summaries]);
  const sums = useMemo(() => {
    const t: Partial<Record<Classification, number>> = {};
    let acc = 0;
    const r = { w: 0, d: 0, l: 0 };
    for (const g of done) {
      const s = summaries!.get(g.id)!;
      for (const [k, v] of Object.entries(s.counts)) t[k as Classification] = (t[k as Classification] ?? 0) + (v ?? 0);
      acc += s.accuracy;
      r[outcome(g)]++;
    }
    return { t, acc: done.length ? acc / done.length : null, r };
  }, [done, summaries]);
  const habit = useMemo(() => (recent?.length ? focusHabit(recent) : null), [recent]);
  const rated = (games ?? []).filter((g) => mine(g).elo);
  const rating = rated[0] ? mine(rated[0]).elo! : null;
  const ratingChange = rated.length > 1 ? rating! - mine(rated[rated.length - 1]).elo! : null;
  const working = sync.syncing || (total > 0 && reviewed < total);

  return (
    <div className="page narrow nc-home nc-dash">
      {working && (
        <section className="nc-work">
          <div className="nc-work-top">
            <b>
              {sync.syncing
                ? sync.fetched
                  ? `Fetching games… ${sync.fetched.games} found`
                  : 'Fetching games…'
                : `Reviewing ${reviewed + 1} of ${total}${job ? ` · ${Math.round((100 * job.done) / Math.max(1, job.total))}%` : ''}`}
            </b>
            {locked && !exempt && !sync.syncing && (
              <button
                className="nc-mini"
                onClick={() => {
                  askBatteryExempt();
                  setTimeout(() => setExempt(isBatteryExempt()), 4000);
                }}
              >
                Keep going when locked
              </button>
            )}
          </div>
          {!sync.syncing && <GameTally games={(games ?? []).slice(0, 20)} />}
        </section>
      )}
      {sync.lastError && !sync.syncing && (
        <button className="nc-work warn" onClick={() => void sync.sync(true)}>
          <b>Couldn't reach chess.com.</b> Tap to try again.
        </button>
      )}

      {latest ? (
        <button className="nc-next" onClick={() => navigate(`/review/${latest.id}?debrief=1`)}>
          <span className={`result-chip ${outcome(latest) === 'w' ? 'win' : outcome(latest) === 'l' ? 'loss' : 'draw'}`}>
            {outcome(latest) === 'w' ? 'W' : outcome(latest) === 'l' ? 'L' : '½'}
          </span>
          <span className="nc-next-body">
            <span className="faint">Go over your game</span>
            <b>
              vs {opp(latest).name}
              {opp(latest).elo ? ` (${opp(latest).elo})` : ''}
            </b>
          </span>
          <span className="nc-next-go">
            Debrief <ChevronRight size={16} />
          </span>
        </button>
      ) : (
        total > 0 && !working && <p className="faint nc-caught">All caught up. Your next chess.com game will be ready here.</p>
      )}

      <section className="card-box nc-sum">
        <div className="nc-sum-head">
          <GamePickers />
          <span className="spacer" />
          <a className="nc-more" href="#/stats">
            Stats <ChevronRight size={14} />
          </a>
        </div>
        <div className="nc-tiles">
          <div>
            <span className="k">Accuracy</span>
            <b>{sums.acc !== null ? sums.acc.toFixed(1) : '–'}</b>
          </div>
          <div>
            <span className="k">Results</span>
            <b>
              {sums.r.w}W {sums.r.d}D {sums.r.l}L
            </b>
          </div>
          <div>
            <span className="k">Rating</span>
            <b>
              {rating ?? '–'}
              {ratingChange ? (
                <small className={ratingChange > 0 ? 'up' : 'down'}>{ratingChange > 0 ? ` +${ratingChange}` : ` ${ratingChange}`}</small>
              ) : null}
            </b>
          </div>
        </div>
        <div className="nc-keys">
          {KEY.map((c) => (
            <button
              key={c}
              className="nc-key"
              title={CLASS_META[c].label}
              onClick={() => MOMENT_KIND[c] && navigate(`/moments?kind=${MOMENT_KIND[c]}`)}
              aria-label={`${CLASS_META[c].label}: ${sums.t[c] ?? 0}`}
            >
              <ClassIcon cls={c} size={18} />
              <b>{sums.t[c] ?? 0}</b>
            </button>
          ))}
        </div>
        {done.length < total && (
          <p className="faint nc-sum-note">
            From {done.length} of {total} games so far; the rest are being reviewed.
          </p>
        )}
      </section>

      <div className="nc-grid">
        <button className="nc-tile sensei" onClick={() => navigate('/sensei')}>
          <span className="nc-tile-ico" aria-hidden>
            🥷
          </span>
          <b>{senseiGame && !senseiGame.result ? 'Back to Sensei' : 'Play Sensei'}</b>
          <span className="faint">Coached game</span>
        </button>
        <button className="nc-tile" onClick={() => navigate('/practice')}>
          <span className="nc-tile-ico">
            <Dumbbell size={20} />
          </span>
          <b>Practice</b>
          <span className="faint">{due ? `${due} due` : 'Your mistakes'}</span>
        </button>
        <button className="nc-tile" onClick={() => navigate('/mates')}>
          <span className="nc-tile-ico">
            <Crosshair size={20} />
          </span>
          <b>Mate drill</b>
          <span className="faint">{mates?.queue.length ? `${mates.queue.length} today` : mates?.all.length ? 'Done today' : 'None yet'}</span>
        </button>
        <button className="nc-tile" onClick={() => navigate('/openings')}>
          <span className="nc-tile-ico">
            <MapIcon size={20} />
          </span>
          <b>Openings</b>
          <span className="faint">Where they go wrong</span>
        </button>
      </div>

      {habit && (
        <button className="nc-habit" onClick={() => navigate('/practice')}>
          <span aria-hidden>{habit.icon}</span>
          <span>
            <span className="faint">Work on</span> <b>{habit.title}</b>
          </span>
          <ChevronRight size={16} />
        </button>
      )}
    </div>
  );
}
