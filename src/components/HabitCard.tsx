// The habit the coach wants you to work on, with its trend and what trains it.
import { habitTrend, type Habit } from '../lib/coach/debrief';
import { navigate } from '../lib/router';

export function HabitCard({ h, compact }: { h: Habit; compact?: boolean }) {
  const trend = habitTrend(h);
  const per = (x: number) =>
    x >= 0.95 ? `${x.toFixed(1)} times a game` : x >= 0.05 ? `about ${Math.round(x * 10)} times in 10 games` : 'hardly ever';
  const trendText =
    trend === 'better'
      ? `Getting better: ${per(h.recent)} in your last 6 games, down from ${per(h.before!)}.`
      : trend === 'worse'
        ? `It has come up more lately: ${per(h.recent)} in your last 6 games, up from ${per(h.before!)}.`
        : trend === 'same'
          ? `About the same as before: ${per(h.recent)} in your last 6 games.`
          : `It came up ${per(h.recent)} in your recent games.`;
  return (
    <div className={`card-box habit-card ${trend ?? ''}`}>
      <div className="hc-head">
        <span className="hc-icon" aria-hidden>
          {h.icon}
        </span>
        <b>{h.title}</b>
      </div>
      <p className="hc-rule">{h.rule}</p>
      {!compact && <p className={`hc-trend ${trend ?? ''}`}>{trendText}</p>}
      <div className="row">
        <button className="btn small primary" onClick={() => navigate('/practice')}>
          Practise it
        </button>
        <button className="btn small" onClick={() => navigate('/moments?kind=mistake')}>
          See it in your games
        </button>
      </div>
    </div>
  );
}
