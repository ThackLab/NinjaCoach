// `#/stats`: everything worth counting in your last 20 games, the kind of
// numbers chess.com keeps behind its paywall. Results every which way, how
// games end, streaks and rating, accuracy and game rating, move quality next
// to your opponents', phases, pieces, time use, openings, tactics, castling
// and style, and the mistakes that keep coming back.
import { useMemo, useState, type ReactNode } from 'react';
import { ClassIcon } from '../components/ClassIcon';
import { Meter, PageHead, SectionTitle } from '../components/ui';
import { Segmented } from '../components/Widgets';
import { computeInsights } from '../lib/insights';
import { navigate } from '../lib/router';
import { CLASS_META } from '../lib/review/types';
import { computeStats, timeClassOf, type Bucket, type Stats, type WDL } from '../lib/stats';
import { useStatGames } from '../state/statGames';
import { useSync, WINDOWS, type GameWindow } from '../state/sync';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const one = (x: number | null | undefined) => (x === null || x === undefined ? '–' : x.toFixed(1));
const signed = (x: number) => (x > 0 ? `+${x}` : `${x}`);
const ENDING: Record<string, string> = {
  checkmate: 'Checkmate',
  resignation: 'Resignation',
  timeout: 'Time',
  abandonment: 'Abandoned',
  agreement: 'Agreement',
  stalemate: 'Stalemate',
  'threefold repetition': 'Repetition',
  'insufficient material': 'Insufficient material',
  'timeout vs insufficient material': 'Time vs insufficient material',
  '50-move rule': '50-move rule',
  other: 'Other',
};

/** Wins, draws and losses as one bar, with the counts written beside it. */
export function WdlBar({ wdl }: { wdl: WDL }) {
  const seg = (n: number, cls: string, label: string) =>
    n > 0 ? <span className={`st-seg ${cls}`} style={{ flexGrow: n }} title={`${n} ${label}`} /> : null;
  return (
    <span className="st-wdl" aria-label={`${wdl.w} won, ${wdl.d} drawn, ${wdl.l} lost`}>
      <span className="st-bar">
        {seg(wdl.w, 'w', 'won')}
        {seg(wdl.d, 'd', 'drawn')}
        {seg(wdl.l, 'l', 'lost')}
      </span>
      <span className="st-wdl-n">
        <b>{wdl.w}</b>W <b>{wdl.d}</b>D <b>{wdl.l}</b>L
      </span>
    </span>
  );
}

function Tile({ k, v, sub, onClick }: { k: string; v: ReactNode; sub?: ReactNode; onClick?: () => void }) {
  return (
    <div className={`st-tile ${onClick ? 'link' : ''}`} onClick={onClick} role={onClick ? 'button' : undefined}>
      <span className="k">{k}</span>
      <span className="v num-display">{v}</span>
      {sub && <span className="s">{sub}</span>}
    </div>
  );
}

function Buckets({ rows, accuracy }: { rows: Bucket[]; accuracy?: boolean }) {
  if (!rows.length) return null;
  return (
    <div className="st-rows">
      {rows.map((b) => (
        <div key={b.key} className="st-row">
          <span className="st-label">
            {b.label}
            <span className="faint">
              {' '}
              · {b.wdl.games} game{b.wdl.games === 1 ? '' : 's'}
              {accuracy && b.accuracy !== null && b.accuracy !== undefined ? ` · ${b.accuracy.toFixed(1)} accuracy` : ''}
            </span>
          </span>
          <WdlBar wdl={b.wdl} />
          <span className="st-score">{pct(b.wdl.score)}</span>
        </div>
      ))}
    </div>
  );
}

/** A line through your games, oldest to newest; tap a point to read it. */
function Trend({ values, unit = '', label }: { values: number[]; unit?: string; label: string }) {
  const [at, setAt] = useState<number | null>(null);
  if (values.length < 2) return null;
  const w = 300;
  const h = 70;
  const pad = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - 2 * pad);
  const y = (v: number) => h - pad - ((v - min) / span) * (h - 2 * pad);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const pick = (clientX: number, el: SVGSVGElement) => {
    const r = el.getBoundingClientRect();
    const i = Math.round(((clientX - r.left) / r.width) * (values.length - 1));
    setAt(Math.max(0, Math.min(values.length - 1, i)));
  };
  return (
    <div className="st-trend">
      <div className="st-trend-read faint">
        {at === null ? (
          <>
            {label}: oldest {values[0].toFixed(unit ? 1 : 0)}
            {unit} → latest {values[values.length - 1].toFixed(unit ? 1 : 0)}
            {unit}. Tap the line to read a game.
          </>
        ) : (
          <>
            Game {at + 1} of {values.length}: <b>{values[at].toFixed(unit ? 1 : 0)}</b>
            {unit}
          </>
        )}
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        preserveAspectRatio="none"
        style={{ width: '100%', height: h }}
        onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
        onPointerMove={(e) => e.buttons && pick(e.clientX, e.currentTarget)}
        aria-label={label}
      >
        <polyline points={pts} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {at !== null && (
          <>
            <line x1={x(at)} x2={x(at)} y1={0} y2={h} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            <circle
              cx={x(at)}
              cy={y(values[at])}
              r="4.5"
              fill="var(--accent)"
              stroke="var(--surface)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </>
        )}
      </svg>
    </div>
  );
}

function Endings({ title, counts }: { title: string; counts: Record<string, number> }) {
  const rows = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = rows.reduce((a, [, n]) => a + n, 0);
  if (!total) return null;
  return (
    <div className="st-end">
      <div className="st-end-head">
        <b>{title}</b>
        <span className="faint">{total}</span>
      </div>
      {rows.map(([k, n]) => (
        <div key={k} className="st-end-row">
          <span>{ENDING[k] ?? k}</span>
          <Meter value={n / total} />
          <span className="st-num">{n}</span>
        </div>
      ))}
    </div>
  );
}

const open = (id: string) => () => navigate(`/review/${id}`);

export function StatsPage() {
  const all = useStatGames();
  const keep = useSync((st) => st.keep);
  const setKeep = useSync((st) => st.setKeep);
  const syncing = useSync((st) => st.syncing);
  const [tc, setTc] = useState('all');
  const classes = useMemo(() => [...new Set((all ?? []).map((x) => timeClassOf(x.game)))], [all]);
  const list = useMemo(() => (all ?? []).filter((x) => tc === 'all' || timeClassOf(x.game) === tc), [all, tc]);
  const s: Stats | null = useMemo(() => (list.length ? computeStats(list) : null), [list]);
  const patterns = useMemo(() => {
    const reviewed = list.filter((x) => x.review).map((x) => ({ game: x.game, review: x.review!, color: x.color }));
    return reviewed.length >= 3 ? computeInsights(reviewed).patterns : [];
  }, [list]);

  if (!all) return <div className="page narrow">Loading…</div>;
  if (!s) {
    return (
      <div className="page narrow">
        <PageHead title="Stats" />
        <p className="muted">Your stats appear here as soon as your games come in from chess.com.</p>
      </div>
    );
  }
  const label = (k: string) => ({ bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Daily' })[k] ?? 'Other';

  return (
    <div className="page narrow stats">
      <PageHead
        title="Stats"
        sub={`${keep ? `Your last ${s.games}` : `All ${s.games} of your`} game${s.games === 1 ? '' : 's'}${s.reviewed < s.games ? ` · ${s.reviewed} reviewed so far` : ''}`}
      />
      <div className="st-filter">
        <div className="st-filter-k">Games</div>
        <Segmented<GameWindow> value={keep} onChange={setKeep} options={WINDOWS.map((n) => ({ value: n, label: n ? String(n) : 'All time' }))} />
        {(syncing || s.reviewed < s.games) && (
          <p className="faint st-note">
            {syncing
              ? 'Fetching your games from chess.com…'
              : `Results, endings, openings, rating and time cover all ${s.games} games now. Accuracy and move stats cover the ${s.reviewed} reviewed so far, and fill in as the rest are reviewed (newest first, while the app is open).`}
          </p>
        )}
      </div>
      {classes.length > 1 && (
        <div className="st-filter">
          <div className="st-filter-k">Time control</div>
          <Segmented
            value={tc}
            onChange={setTc}
            options={[{ value: 'all', label: 'All types' }, ...classes.map((c) => ({ value: c, label: label(c) }))]}
          />
        </div>
      )}

      {/* ------------------------------------------------ overview */}
      <section className="card-box st-hero">
        <div className="st-hero-top">
          <div>
            <span className="k">Score</span>
            <span className="num-display st-big">{pct(s.overall.score)}</span>
          </div>
          <WdlBar wdl={s.overall} />
        </div>
        <div className="st-tiles">
          <Tile k="Win rate" v={pct(s.overall.w / (s.overall.games || 1))} />
          <Tile k="Accuracy" v={one(s.accuracy?.avg)} sub={s.accuracy ? `them ${s.accuracy.opponents.toFixed(1)}` : 'once reviewed'} />
          <Tile k="Game rating" v={s.accuracy?.gameRating ?? '–'} sub="how you played" />
          <Tile k="Opponents" v={s.opponents.avgRating ?? '–'} sub="average rating" />
        </div>
      </section>

      {/* ------------------------------------------------ rating */}
      {s.ratings.length > 0 && (
        <>
          <SectionTitle>chess.com rating</SectionTitle>
          {s.ratings.map((r) => (
            <section key={r.timeClass} className="card-box st-card">
              <div className="st-card-head">
                <b>{r.label}</b>
                <span className="num-display st-mid">{r.now}</span>
                <span className={r.change >= 0 ? 'st-up' : 'st-down'}>{signed(r.change)}</span>
              </div>
              <div className="st-tiles three">
                <Tile k="Peak" v={r.peak} />
                <Tile k="Low" v={r.low} />
                <Tile k="Games" v={r.series.length} />
              </div>
              <Trend values={r.series} label="Rating" />
            </section>
          ))}
        </>
      )}

      {/* ------------------------------------------------ streaks */}
      <SectionTitle>Streaks</SectionTitle>
      <div className="st-tiles">
        <Tile
          k="Current"
          v={s.streaks.current ? `${s.streaks.current.n}` : '–'}
          sub={
            s.streaks.current
              ? s.streaks.current.kind === 'w'
                ? 'wins in a row'
                : s.streaks.current.kind === 'l'
                  ? 'losses in a row'
                  : 'draws in a row'
              : undefined
          }
        />
        <Tile k="Best win streak" v={s.streaks.longestWin} />
        <Tile k="Unbeaten run" v={s.streaks.longestUnbeaten} sub="wins and draws" />
        <Tile k="Worst losing run" v={s.streaks.longestLoss} />
      </div>

      {/* ------------------------------------------------ results */}
      <SectionTitle>Results by colour</SectionTitle>
      <Buckets rows={s.byColor} accuracy />
      {s.byTimeClass.length > 1 && (
        <>
          <SectionTitle>Results by time control</SectionTitle>
          <Buckets rows={s.byTimeClass} accuracy />
        </>
      )}
      <SectionTitle>Results by opponent</SectionTitle>
      <Buckets rows={s.byOpponent} />
      <div className="st-tiles two">
        {s.opponents.bestWin && (
          <Tile k="Best win" v={s.opponents.bestWin.elo} sub={`vs ${s.opponents.bestWin.name}`} onClick={open(s.opponents.bestWin.gameId)} />
        )}
        {s.opponents.worstLoss && (
          <Tile
            k="Toughest loss"
            v={s.opponents.worstLoss.elo}
            sub={`to ${s.opponents.worstLoss.name}`}
            onClick={open(s.opponents.worstLoss.gameId)}
          />
        )}
      </div>

      <SectionTitle>How your games end</SectionTitle>
      <div className="st-ends">
        <Endings title="You won by" counts={s.endings.wins} />
        <Endings title="You lost by" counts={s.endings.losses} />
        <Endings title="Drawn by" counts={s.endings.draws} />
      </div>

      {/* ------------------------------------------------ accuracy */}
      {s.accuracy && (
        <>
          <SectionTitle>Accuracy</SectionTitle>
          <section className="card-box st-card">
            <div className="st-tiles">
              <Tile k="Average" v={s.accuracy.avg.toFixed(1)} sub={`opponents ${s.accuracy.opponents.toFixed(1)}`} />
              <Tile k="Best game" v={s.accuracy.best.value.toFixed(1)} sub="tap to open" onClick={open(s.accuracy.best.gameId)} />
              <Tile k="Worst game" v={s.accuracy.worst.value.toFixed(1)} sub="tap to open" onClick={open(s.accuracy.worst.gameId)} />
              <Tile k="Avg centipawn loss" v={Math.round(s.accuracy.acpl)} sub={`opponents ${Math.round(s.accuracy.opponentsAcpl)}`} />
            </div>
            <div className="st-tiles three">
              <Tile k="In wins" v={one(s.accuracy.inWins)} />
              <Tile k="In draws" v={one(s.accuracy.inDraws)} />
              <Tile k="In losses" v={one(s.accuracy.inLosses)} />
            </div>
            {s.accuracy.bestGameRating && (
              <div className="st-tiles two">
                <Tile k="Avg game rating" v={s.accuracy.gameRating ?? '–'} />
                <Tile k="Best game rating" v={s.accuracy.bestGameRating.value} sub="tap to open" onClick={open(s.accuracy.bestGameRating.gameId)} />
              </div>
            )}
            <Trend values={s.accuracy.series} unit="%" label="Accuracy" />
          </section>
        </>
      )}

      {/* ------------------------------------------------ phases */}
      {s.phases && (
        <>
          <SectionTitle>By phase</SectionTitle>
          <div className="st-table">
            <div className="st-tr head">
              <span />
              <span>Accuracy</span>
              <span>Points lost</span>
            </div>
            {(['opening', 'middlegame', 'endgame'] as const).map((ph) => (
              <div key={ph} className="st-tr">
                <span>{ph[0].toUpperCase() + ph.slice(1)}</span>
                <span className="st-num">{one(s.phases!.accuracy[ph])}</span>
                <span className="st-meter">
                  <Meter value={s.phases!.lostShare[ph]} /> {pct(s.phases!.lostShare[ph])}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ------------------------------------------------ move quality */}
      {s.quality.length > 0 && (
        <>
          <SectionTitle>Move quality (per game)</SectionTitle>
          <div className="st-table q">
            <div className="st-tr head">
              <span />
              <span>You</span>
              <span>Opponents</span>
              <span>Total</span>
            </div>
            {s.quality.map((q) => (
              <div key={q.cls} className="st-tr">
                <span className="st-cls">
                  <ClassIcon cls={q.cls} size={16} /> {CLASS_META[q.cls].label}
                </span>
                <span
                  className={`st-num ${q.you > q.opponents ? (['inaccuracy', 'mistake', 'miss', 'blunder'].includes(q.cls) ? 'worse' : 'better') : ''}`}
                >
                  {q.you.toFixed(1)}
                </span>
                <span className="st-num faint">{q.opponents.toFixed(1)}</span>
                <span className="st-num faint">{q.total}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ------------------------------------------------ pieces */}
      {s.pieces.length > 0 && (
        <>
          <SectionTitle>By piece</SectionTitle>
          <div className="st-table p">
            <div className="st-tr head">
              <span />
              <span>Moves</span>
              <span>Accuracy</span>
              <span>Best</span>
              <span>Errors</span>
            </div>
            {s.pieces.map((p) => (
              <div key={p.piece} className="st-tr">
                <span>{p.piece}</span>
                <span className="st-num faint">{p.moves}</span>
                <span className="st-num">{p.accuracy.toFixed(1)}</span>
                <span className="st-num faint">{p.best}</span>
                <span className={`st-num ${p.errors ? 'worse' : 'faint'}`}>{p.errors}</span>
              </div>
            ))}
          </div>
          <p className="faint st-note">Best = best, great or brilliant moves. Errors = mistakes, misses and blunders. Book moves aren’t counted.</p>
        </>
      )}

      {/* ------------------------------------------------ time */}
      {s.time && (
        <>
          <SectionTitle>Time</SectionTitle>
          <div className="st-tiles">
            <Tile k="Per move" v={`${s.time.secondsPerMove.toFixed(1)}s`} sub="on average" />
            <Tile k="Time left at the end" v={pct(s.time.leftAtEnd)} sub="of your clock" />
            <Tile k="Lost on time" v={s.time.lostOnTime} sub={`won on time ${s.time.wonOnTime}`} />
            <Tile
              k="Errors in time trouble"
              v={`${s.time.troubleErrors} of ${s.time.errors}`}
              sub={`${pct(s.time.troubleMoves)} of moves under 10% clock`}
            />
          </div>
          <div className="st-table">
            <div className="st-tr head">
              <span />
              <span>Seconds a move</span>
            </div>
            {(['opening', 'middlegame', 'endgame'] as const).map((ph) => (
              <div key={ph} className="st-tr">
                <span>{ph[0].toUpperCase() + ph.slice(1)}</span>
                <span className="st-num">{s.time!.byPhase[ph] === null ? '–' : `${s.time!.byPhase[ph]!.toFixed(1)}s`}</span>
              </div>
            ))}
          </div>
          {s.time.longestThink && (
            <button className="nc-link st-think" onClick={() => navigate(`/review/${s.time!.longestThink!.gameId}?ply=${s.time!.longestThink!.ply}`)}>
              <b>
                Longest think: {Math.round(s.time.longestThink.seconds)}s on {s.time.longestThink.san}
              </b>
              <span className="faint">Tap to see the position</span>
            </button>
          )}
        </>
      )}

      {/* ------------------------------------------------ tactics */}
      {s.reviewed > 0 && (
        <>
          <SectionTitle>Tactics</SectionTitle>
          <div className="st-tiles">
            <Tile k="Brilliant moves" v={s.tactics.brilliant} sub={`great moves ${s.tactics.great}`} />
            <Tile k="Missed wins" v={s.tactics.missedWins} sub={`mates missed ${s.tactics.matesMissed}`} />
            <Tile
              k="Blunders a game"
              v={(s.tactics.blunders / s.reviewed).toFixed(1)}
              sub={`mistakes ${(s.tactics.mistakes / s.reviewed).toFixed(1)} · inaccuracies ${(s.tactics.inaccuracies / s.reviewed).toFixed(1)}`}
            />
            <Tile
              k="Winning positions won"
              v={s.tactics.winning ? `${s.tactics.converted} of ${s.tactics.winning}` : '–'}
              sub={s.tactics.losing ? `lost positions saved ${s.tactics.saved} of ${s.tactics.losing}` : undefined}
            />
          </div>
        </>
      )}

      {/* ------------------------------------------------ openings */}
      {s.openings.length > 0 && (
        <>
          <SectionTitle action={{ label: 'Opening explorer', href: '#/openings' }}>Openings</SectionTitle>
          {(['w', 'b'] as const).map((c) => {
            const rows = s.openings.filter((o) => o.color === c);
            if (!rows.length) return null;
            return (
              <div key={c} className="st-rows">
                <div className="st-sub">As {c === 'w' ? 'White' : 'Black'}</div>
                {rows.slice(0, 8).map((o) => (
                  <div key={o.name} className="st-row">
                    <span className="st-label">
                      {o.name}
                      <span className="faint">
                        {' '}
                        · {o.wdl.games} game{o.wdl.games === 1 ? '' : 's'}
                        {o.accuracy !== null ? ` · ${o.accuracy.toFixed(1)} accuracy` : ''}
                      </span>
                    </span>
                    <WdlBar wdl={o.wdl} />
                    <span className="st-score">{pct(o.wdl.score)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </>
      )}

      {/* ------------------------------------------------ when and how long */}
      <SectionTitle>Game length</SectionTitle>
      <div className="st-tiles three">
        <Tile k="Average" v={Math.round(s.length.avgMoves)} sub="moves" />
        <Tile
          k="Quickest win"
          v={s.length.shortestWin?.moves ?? '–'}
          sub="moves"
          onClick={s.length.shortestWin ? open(s.length.shortestWin.gameId) : undefined}
        />
        <Tile
          k="Longest game"
          v={s.length.longestGame?.moves ?? '–'}
          sub="moves"
          onClick={s.length.longestGame ? open(s.length.longestGame.gameId) : undefined}
        />
      </div>
      <Buckets rows={s.byLength} />

      <SectionTitle>When you play</SectionTitle>
      <div className="st-sub">Time of day</div>
      <Buckets rows={s.byTimeOfDay} />
      <div className="st-sub">Day of the week</div>
      <Buckets rows={s.byDay} />

      {/* ------------------------------------------------ castling and style */}
      <SectionTitle>Castling</SectionTitle>
      <div className="st-tiles">
        <Tile k="You castled" v={`${s.castling.castled} of ${s.games}`} sub={`kingside ${s.castling.kingside} · queenside ${s.castling.queenside}`} />
        <Tile k="Castled on move" v={s.castling.avgMove ? Math.round(s.castling.avgMove) : '–'} sub="on average" />
        <Tile
          k="Score when castled"
          v={s.castling.castledWdl.games ? pct(s.castling.castledWdl.score) : '–'}
          sub={`not castled ${s.castling.notCastledWdl.games ? pct(s.castling.notCastledWdl.score) : '–'}`}
        />
        <Tile k="Opponents castled" v={`${s.castling.opponentsCastled} of ${s.games}`} />
      </div>

      <SectionTitle>Style</SectionTitle>
      <div className="st-tiles">
        <Tile k="Checks a game" v={s.style.checksPerGame.toFixed(1)} />
        <Tile k="Captures a game" v={s.style.capturesPerGame.toFixed(1)} />
        <Tile k="Early queen" v={`${s.style.queenOutEarly} of ${s.games}`} sub="queen out in the first 6 moves" />
        <Tile k="Promotions" v={s.style.promotions} />
      </div>

      {/* ------------------------------------------------ patterns */}
      {patterns.length > 0 && (
        <>
          <SectionTitle>Mistakes that keep coming back</SectionTitle>
          <div className="list">
            {patterns.map((p) => (
              <div key={p.key} className="ins-pattern">
                <div className="ip-top">
                  <b>{p.title}</b>
                  <span className="faint">
                    {p.games} of {s.reviewed} games
                  </span>
                </div>
                <Meter value={p.share} />
                <p>{p.rule}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
