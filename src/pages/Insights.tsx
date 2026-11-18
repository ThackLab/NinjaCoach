import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { computeInsights, type Insights, type PeriodStats, type ReviewedGame } from '../lib/insights';
import { useReviewedGames } from '../state/reviewedGames';
import { navigate } from '../lib/router';
import { Meter, PageHead, SectionTitle, Sparkline } from '../components/ui';
import { Accent, CountUp } from '../components/Rich';

const pct = (x: number) => `${Math.round(x * 100)}%`;

function Delta({ value, better, digits = 0, unit = '' }: { value: number | null; better: 'up' | 'down'; digits?: number; unit?: string }) {
  if (value === null) return null;
  if (Math.abs(value) < Math.pow(10, -digits) / 2) return <span className="ins-delta flat">no change</span>;
  const good = better === 'up' ? value > 0 : value < 0;
  return (
    <span className={`ins-delta ${good ? 'good' : 'bad'}`}>
      {value > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
      {Math.abs(value).toFixed(digits)}
      {unit}
    </span>
  );
}

function MonthCard({ ins, games }: { ins: Insights; games: ReviewedGame[] }) {
  const now = Date.now();
  const d = new Date(now);
  const monthStart = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  const a: PeriodStats = ins.thisMonth;
  const b: PeriodStats = ins.lastMonth;
  const diff = (x: number | null, y: number | null) => (b.games > 0 && x !== null && y !== null ? x - y : null);
  // Your chess.com rating now, and how it has moved since the month began.
  const elo = (g: ReviewedGame) => (g.color === 'w' ? g.game.white.elo : g.game.black.elo);
  const rated = [...games].filter((g) => elo(g)).sort((x, y) => y.game.createdAt - x.game.createdAt);
  const rating = rated[0] ? elo(rated[0])! : null;
  const before = rated.find((g) => g.game.createdAt < monthStart);
  const ratingChange = rating !== null && before ? rating - elo(before)! : null;
  const monthName = d.toLocaleString(undefined, { month: 'long' });
  return (
    <section className="ins-month">
      <div className="ins-month-head">
        <h2 className="display">
          <Accent text={`*${monthName}* so far`} />
        </h2>
        <span className="faint">{a.games} reviewed games</span>
      </div>
      <div className="ins-stats">
        <div className="ins-stat">
          <span className="k">Accuracy</span>
          <span className="v num-display">{a.accuracy !== null ? <CountUp value={a.accuracy} decimals={1} /> : '–'}</span>
          <Delta value={diff(a.accuracy, b.accuracy)} better="up" digits={1} />
        </div>
        <div className="ins-stat">
          <span className="k">Blunders a game</span>
          <span className="v num-display">{a.blunders !== null ? a.blunders.toFixed(1) : '–'}</span>
          <Delta value={diff(a.blunders, b.blunders)} better="down" digits={1} />
        </div>
        <div className="ins-stat">
          <span className="k">Score</span>
          <span className="v num-display">{a.score !== null ? `${Math.round(a.score * 100)}%` : '–'}</span>
          <Delta value={diff(a.score, b.score) !== null ? Math.round(diff(a.score, b.score)! * 100) : null} better="up" unit="%" />
        </div>
        <div className="ins-stat">
          <span className="k">chess.com rating</span>
          <span className="v num-display">{rating ?? '–'}</span>
          <Delta value={ratingChange} better="up" />
        </div>
      </div>
      {b.games > 0 && <p className="faint ins-note">Arrows compare with last month ({b.games} games).</p>}
    </section>
  );
}

export function InsightsPage() {
  const games = useReviewedGames();
  const ins = useMemo(() => (games && games.length ? computeInsights(games) : null), [games]);

  if (!games) return <div className="page narrow">Loading…</div>;
  if (!ins || ins.games < 3) {
    return (
      <div className="page narrow">
        <PageHead title="Progress" />
        <section className="empty-hero">
          <h2 className="display">
            <Accent text="Your patterns, *from your games*" />
          </h2>
          <p className="muted">
            Once {3 - (ins?.games ?? 0)} more game{3 - (ins?.games ?? 0) === 1 ? '' : 's'} {3 - (ins?.games ?? 0) === 1 ? 'is' : 'are'} reviewed, this
            page shows where your points go, the mistakes that keep coming back, and whether you’re improving month by month.
          </p>
          <button className="btn primary" onClick={() => navigate('/')}>
            Back to your coach
          </button>
        </section>
      </div>
    );
  }

  const phaseTotal = ins.phases.opening + ins.phases.middlegame + ins.phases.endgame || 1;
  const recent = ins.accuracies.slice(-10);
  const before = ins.accuracies.slice(-20, -10);
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

  return (
    <div className="page narrow insights">
      <PageHead title="Progress" sub={`From your last ${ins.games} reviewed games`} />
      <MonthCard ins={ins} games={games!} />

      <SectionTitle>Accuracy</SectionTitle>
      <div className="ins-trend">
        <Sparkline values={ins.accuracies.slice(-30)} height={48} color="var(--accent)" />
        <p>
          Your last {recent.length} games average <b className="rx-num">{avg(recent).toFixed(1)}</b>
          {before.length >= 5 && (
            <>
              , against <b className="rx-num">{avg(before).toFixed(1)}</b> for the {before.length} before.
            </>
          )}
        </p>
      </div>

      <SectionTitle>Where your points go</SectionTitle>
      <div className="ins-phases">
        {(['opening', 'middlegame', 'endgame'] as const).map((ph) => (
          <div key={ph} className="ins-phase">
            <span className="k">{ph === 'middlegame' ? 'Middlegame' : ph[0].toUpperCase() + ph.slice(1)}</span>
            <Meter value={ins.phases[ph] / phaseTotal} />
            <span className="v">{pct(ins.phases[ph] / phaseTotal)}</span>
          </div>
        ))}
      </div>

      {ins.patterns.length > 0 && (
        <>
          <SectionTitle>Mistakes that keep coming back</SectionTitle>
          <div className="list">
            {ins.patterns.map((p) => {
              return (
                <div key={p.key} className="ins-pattern">
                  <div className="ip-top">
                    <b>{p.title}</b>
                    <span className="faint">
                      {p.games} of {ins.games} games
                    </span>
                  </div>
                  <Meter value={p.share} />
                  <p>{p.rule}</p>
                </div>
              );
            })}
          </div>
        </>
      )}

      <SectionTitle>Finishing games</SectionTitle>
      <div className="ins-facts">
        {ins.conversion.winning > 0 ? (
          <p>
            You reached a winning position in <b className="rx-num">{ins.conversion.winning}</b> games and won{' '}
            <b className="rx-num">{ins.conversion.won}</b> ({pct(ins.conversion.won / ins.conversion.winning)}).
            {ins.conversion.lost > 0 && ` ${ins.conversion.lost} of them you went on to lose.`}
          </p>
        ) : (
          <p>No clearly winning positions yet.</p>
        )}
        {ins.comebacks.losing > 0 && (
          <p>
            You were clearly losing in <b className="rx-num">{ins.comebacks.losing}</b> games and saved{' '}
            <b className="rx-num">{ins.comebacks.saved}</b> of them.
          </p>
        )}
        {ins.time && ins.time.mistakes > 0 && (
          <p>
            In timed games, <b className="rx-num">{ins.time.inTrouble}</b> of your <b className="rx-num">{ins.time.mistakes}</b> mistakes came with
            little time left. {ins.time.inTrouble / ins.time.mistakes > 0.3 ? 'Spend less time early on so you have some at the end.' : ''}
          </p>
        )}
      </div>

      {ins.openings.length > 0 && (
        <>
          <SectionTitle>Openings</SectionTitle>
          <div className="list">
            {ins.openings.map((o) => (
              <div key={`${o.color}${o.name}`} className="ins-opening">
                <span className={`side-dot ${o.color}`} aria-label={o.color === 'w' ? 'White' : 'Black'} />
                <span className="io-name">{o.name}</span>
                <span className="faint">{o.games} games</span>
                <span className="io-score num-display">{pct(o.score)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
