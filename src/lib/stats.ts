// Everything worth counting in your last games: results every which way
// (colour, time control, opponent strength, time of day, game length), how
// games end, streaks, rating, accuracy and game rating, move quality next to
// your opponents', accuracy by phase and by piece, time use, openings,
// castling and tactics. Results come from the games themselves; everything
// about move quality needs the Stockfish review.
import type { Color } from 'chess.js';
import type { GameRecord } from './storage/db';
import type { Classification, GameReview, Phase, PlayerSummary } from './review/types';

export interface StatGame {
  game: GameRecord;
  color: Color;
  review?: GameReview;
  /** Mates you missed in this game (from the coach's summary). */
  matesMissed?: number;
}

export type Outcome = 'w' | 'd' | 'l';

export interface WDL {
  w: number;
  d: number;
  l: number;
  games: number;
  /** Points per game, 0..1 (a draw is half). */
  score: number;
}

export interface Bucket {
  key: string;
  label: string;
  wdl: WDL;
  accuracy?: number | null;
}

export interface Stats {
  games: number;
  reviewed: number;
  overall: WDL;
  byColor: Bucket[];
  byTimeClass: Bucket[];
  byOpponent: Bucket[];
  byTimeOfDay: Bucket[];
  byDay: Bucket[];
  byLength: Bucket[];
  opponents: {
    avgRating: number | null;
    bestWin: { name: string; elo: number; gameId: string } | null;
    worstLoss: { name: string; elo: number; gameId: string } | null;
  };
  ratings: { timeClass: string; label: string; now: number; first: number; change: number; peak: number; low: number; series: number[] }[];
  streaks: { current: { kind: Outcome; n: number } | null; longestWin: number; longestLoss: number; longestUnbeaten: number };
  endings: { wins: Record<string, number>; losses: Record<string, number>; draws: Record<string, number> };
  accuracy: {
    avg: number;
    opponents: number;
    best: { value: number; gameId: string };
    worst: { value: number; gameId: string };
    inWins: number | null;
    inDraws: number | null;
    inLosses: number | null;
    /** Oldest game first. */
    series: number[];
    acpl: number;
    opponentsAcpl: number;
    gameRating: number | null;
    bestGameRating: { value: number; gameId: string } | null;
  } | null;
  phases: { accuracy: Record<Phase, number | null>; lostShare: Record<Phase, number> } | null;
  quality: { cls: Classification; you: number; opponents: number; total: number }[];
  pieces: { piece: string; moves: number; accuracy: number; best: number; errors: number }[];
  time: {
    games: number;
    secondsPerMove: number;
    byPhase: Record<Phase, number | null>;
    /** Share of your starting time left when the game ended. */
    leftAtEnd: number;
    lostOnTime: number;
    wonOnTime: number;
    /** Your mistakes and blunders made with under a tenth of your time left. */
    troubleErrors: number;
    errors: number;
    /** Share of your moves played with under a tenth of your time left. */
    troubleMoves: number;
    longestThink: { seconds: number; san: string; gameId: string; ply: number } | null;
  } | null;
  openings: { color: Color; name: string; wdl: WDL; accuracy: number | null }[];
  length: { avgMoves: number; shortestWin: { moves: number; gameId: string } | null; longestGame: { moves: number; gameId: string } | null };
  castling: {
    castled: number;
    kingside: number;
    queenside: number;
    avgMove: number | null;
    castledWdl: WDL;
    notCastledWdl: WDL;
    opponentsCastled: number;
  };
  style: { checksPerGame: number; capturesPerGame: number; promotions: number; queenOutEarly: number };
  tactics: {
    brilliant: number;
    great: number;
    missedWins: number;
    matesMissed: number;
    blunders: number;
    mistakes: number;
    inaccuracies: number;
    /** Games where you were clearly winning (90%+), and how many of them you won. */
    winning: number;
    converted: number;
    /** Games where you were clearly losing (10% or less), and how many you saved. */
    losing: number;
    saved: number;
  };
}

const CLASSES: Classification[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
const PHASES: Phase[] = ['opening', 'middlegame', 'endgame'];
const TIME_CLASSES: Record<string, string> = { bullet: 'Bullet', blitz: 'Blitz', rapid: 'Rapid', daily: 'Daily' };
const PIECES: Record<string, string> = { K: 'King', Q: 'Queen', R: 'Rook', B: 'Bishop', N: 'Knight', P: 'Pawn' };
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function outcomeOf(g: GameRecord, color: Color): Outcome | null {
  if (g.result === '1/2-1/2') return 'd';
  if (g.result === '1-0') return color === 'w' ? 'w' : 'l';
  if (g.result === '0-1') return color === 'b' ? 'w' : 'l';
  return null;
}

export function wdl(list: StatGame[]): WDL {
  const r = { w: 0, d: 0, l: 0 };
  for (const x of list) {
    const o = outcomeOf(x.game, x.color);
    if (o) r[o]++;
  }
  const games = r.w + r.d + r.l;
  return { ...r, games, score: games ? (r.w + r.d / 2) / games : 0 };
}

/** bullet / blitz / rapid / daily, from what chess.com says or from the clock. */
export function timeClassOf(g: GameRecord): string {
  const t = g.timeControl?.toLowerCase();
  if (t && TIME_CLASSES[t]) return t;
  if (t?.includes('/')) return 'daily';
  if (g.clock) {
    const est = g.clock.base + 40 * g.clock.inc;
    return est < 180 ? 'bullet' : est < 600 ? 'blitz' : 'rapid';
  }
  return 'other';
}

const sideOf = (r: GameReview, c: Color): PlayerSummary => (c === 'w' ? r.white : r.black);
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const me = (x: StatGame) => (x.color === 'w' ? x.game.white : x.game.black);
const them = (x: StatGame) => (x.color === 'w' ? x.game.black : x.game.white);
const fullMoves = (g: GameRecord) => Math.ceil(g.moves.length / 2);

function bucketed(list: StatGame[], keyOf: (x: StatGame) => string | null, labels: [string, string][], withAccuracy = false): Bucket[] {
  return labels
    .map(([key, label]) => {
      const sub = list.filter((x) => keyOf(x) === key);
      const accs = sub.filter((x) => x.review).map((x) => sideOf(x.review!, x.color).accuracy);
      return { key, label, wdl: wdl(sub), ...(withAccuracy ? { accuracy: avg(accs) } : {}) };
    })
    .filter((b) => b.wdl.games > 0);
}

function timeOfDay(t: number): string {
  const h = new Date(t).getHours();
  return h >= 5 && h < 12 ? 'morning' : h >= 12 && h < 17 ? 'afternoon' : h >= 17 && h < 22 ? 'evening' : 'night';
}

/** Index of your first castling move (in plies), and which side. */
function castled(g: GameRecord, color: Color): { ply: number; side: 'k' | 'q' } | null {
  for (let i = color === 'w' ? 0 : 1; i < g.sans.length; i += 2) {
    const s = g.sans[i];
    if (s.startsWith('O-O-O')) return { ply: i, side: 'q' };
    if (s.startsWith('O-O')) return { ply: i, side: 'k' };
  }
  return null;
}

export function computeStats(all: StatGame[]): Stats {
  // Oldest first, so series and streaks read left to right.
  const list = [...all].sort((a, b) => a.game.createdAt - b.game.createdAt);
  const reviewed = list.filter((x) => x.review);

  // ---------------------------------------------------------------- results
  const byColor = bucketed(
    list,
    (x) => x.color,
    [
      ['w', 'White'],
      ['b', 'Black'],
    ],
    true,
  );
  const byTimeClass = bucketed(list, (x) => timeClassOf(x.game), [...Object.entries(TIME_CLASSES), ['other', 'Other']], true);
  const diffOf = (x: StatGame) => {
    const a = me(x).elo;
    const b = them(x).elo;
    if (!a || !b) return null;
    return b - a > 50 ? 'higher' : a - b > 50 ? 'lower' : 'similar';
  };
  const byOpponent = bucketed(list, diffOf, [
    ['higher', 'Higher rated (+50)'],
    ['similar', 'Within 50 points'],
    ['lower', 'Lower rated (−50)'],
  ]);
  const byTimeOfDay = bucketed(list, (x) => timeOfDay(x.game.createdAt), [
    ['morning', 'Morning (5am–noon)'],
    ['afternoon', 'Afternoon (noon–5pm)'],
    ['evening', 'Evening (5–10pm)'],
    ['night', 'Night (10pm–5am)'],
  ]);
  const byDay = bucketed(
    list,
    (x) => String(new Date(x.game.createdAt).getDay()),
    [1, 2, 3, 4, 5, 6, 0].map((d) => [String(d), DAYS[d]] as [string, string]),
  );
  const lenKey = (x: StatGame) => {
    const n = fullMoves(x.game);
    return n < 25 ? 'short' : n <= 40 ? 'medium' : 'long';
  };
  const byLength = bucketed(list, lenKey, [
    ['short', 'Under 25 moves'],
    ['medium', '25–40 moves'],
    ['long', 'Over 40 moves'],
  ]);

  // ---------------------------------------------------------------- opponents
  const oppElos = list.map((x) => them(x).elo).filter((e): e is number => !!e);
  let bestWin: Stats['opponents']['bestWin'] = null;
  let worstLoss: Stats['opponents']['worstLoss'] = null;
  for (const x of list) {
    const o = outcomeOf(x.game, x.color);
    const opp = them(x);
    if (!opp.elo) continue;
    if (o === 'w' && (!bestWin || opp.elo > bestWin.elo)) bestWin = { name: opp.name, elo: opp.elo, gameId: x.game.id };
    if (o === 'l' && (!worstLoss || opp.elo < worstLoss.elo)) worstLoss = { name: opp.name, elo: opp.elo, gameId: x.game.id };
  }

  // ---------------------------------------------------------------- ratings, one line per time control
  const ratings: Stats['ratings'] = [];
  for (const [tc, label] of [...Object.entries(TIME_CLASSES), ['other', 'Other']] as [string, string][]) {
    const series = list.filter((x) => timeClassOf(x.game) === tc && me(x).elo).map((x) => me(x).elo!);
    if (!series.length) continue;
    ratings.push({
      timeClass: tc,
      label,
      now: series[series.length - 1],
      first: series[0],
      change: series[series.length - 1] - series[0],
      peak: Math.max(...series),
      low: Math.min(...series),
      series,
    });
  }
  ratings.sort((a, b) => b.series.length - a.series.length);

  // ---------------------------------------------------------------- streaks
  const outs = list.map((x) => outcomeOf(x.game, x.color)).filter((o): o is Outcome => !!o);
  let current: Stats['streaks']['current'] = null;
  if (outs.length) {
    const last = outs[outs.length - 1];
    let n = 0;
    for (let i = outs.length - 1; i >= 0 && outs[i] === last; i--) n++;
    current = { kind: last, n };
  }
  const longest = (ok: (o: Outcome) => boolean) => {
    let best = 0;
    let run = 0;
    for (const o of outs) {
      run = ok(o) ? run + 1 : 0;
      best = Math.max(best, run);
    }
    return best;
  };

  // ---------------------------------------------------------------- endings
  const endings: Stats['endings'] = { wins: {}, losses: {}, draws: {} };
  for (const x of list) {
    const o = outcomeOf(x.game, x.color);
    if (!o) continue;
    const how = x.game.termination ?? (o === 'd' ? 'agreement' : 'other');
    const into = o === 'w' ? endings.wins : o === 'l' ? endings.losses : endings.draws;
    into[how] = (into[how] ?? 0) + 1;
  }

  // ---------------------------------------------------------------- accuracy
  let accuracy: Stats['accuracy'] = null;
  if (reviewed.length) {
    const acc = (x: StatGame) => sideOf(x.review!, x.color).accuracy;
    const byOut = (o: Outcome) => avg(reviewed.filter((x) => outcomeOf(x.game, x.color) === o).map(acc));
    const best = reviewed.reduce((a, b) => (acc(b) > acc(a) ? b : a));
    const worst = reviewed.reduce((a, b) => (acc(b) < acc(a) ? b : a));
    const ratedGames = reviewed.filter((x) => (sideOf(x.review!, x.color).ratedMoves ?? 10) >= 8);
    const gr = (x: StatGame) => sideOf(x.review!, x.color).estimatedRating;
    const bestGr = ratedGames.length ? ratedGames.reduce((a, b) => (gr(b) > gr(a) ? b : a)) : null;
    accuracy = {
      avg: avg(reviewed.map(acc))!,
      opponents: avg(reviewed.map((x) => sideOf(x.review!, other(x.color)).accuracy))!,
      best: { value: acc(best), gameId: best.game.id },
      worst: { value: acc(worst), gameId: worst.game.id },
      inWins: byOut('w'),
      inDraws: byOut('d'),
      inLosses: byOut('l'),
      series: reviewed.map(acc),
      acpl: avg(reviewed.map((x) => sideOf(x.review!, x.color).acpl))!,
      opponentsAcpl: avg(reviewed.map((x) => sideOf(x.review!, other(x.color)).acpl))!,
      gameRating: ratedGames.length ? Math.round(avg(ratedGames.map(gr))!) : null,
      bestGameRating: bestGr ? { value: gr(bestGr), gameId: bestGr.game.id } : null,
    };
  }

  // ---------------------------------------------------------------- phases, quality, pieces, tactics
  const phaseAcc: Record<Phase, number[]> = { opening: [], middlegame: [], endgame: [] };
  const lost: Record<Phase, number> = { opening: 0, middlegame: 0, endgame: 0 };
  const youCount: Record<string, number> = {};
  const oppCount: Record<string, number> = {};
  const pieceRows: Record<string, { moves: number; acc: number; best: number; errors: number }> = {};
  const tactics: Stats['tactics'] = {
    brilliant: 0,
    great: 0,
    missedWins: 0,
    matesMissed: 0,
    blunders: 0,
    mistakes: 0,
    inaccuracies: 0,
    winning: 0,
    converted: 0,
    losing: 0,
    saved: 0,
  };
  for (const x of reviewed) {
    const r = x.review!;
    const mine = sideOf(r, x.color);
    const theirs = sideOf(r, other(x.color));
    for (const ph of PHASES) if (mine.phases[ph] !== null) phaseAcc[ph].push(mine.phases[ph]!);
    for (const c of CLASSES) {
      youCount[c] = (youCount[c] ?? 0) + (mine.counts[c] ?? 0);
      oppCount[c] = (oppCount[c] ?? 0) + (theirs.counts[c] ?? 0);
    }
    tactics.brilliant += mine.counts.brilliant ?? 0;
    tactics.great += mine.counts.great ?? 0;
    tactics.missedWins += mine.counts.miss ?? 0;
    tactics.blunders += mine.counts.blunder ?? 0;
    tactics.mistakes += mine.counts.mistake ?? 0;
    tactics.inaccuracies += mine.counts.inaccuracy ?? 0;
    tactics.matesMissed += x.matesMissed ?? 0;
    let wasWinning = false;
    let wasLosing = false;
    for (const m of r.moves) {
      if (m.color !== x.color) continue;
      lost[m.phase] += m.epLoss;
      if (m.epBefore >= 0.9) wasWinning = true;
      if (m.epBefore <= 0.1) wasLosing = true;
      if (m.classification === 'book' || m.classification === 'forced') continue;
      const letter = m.san.startsWith('O-O') ? 'K' : /^[KQRBN]/.test(m.san) ? m.san[0] : 'P';
      const row = (pieceRows[letter] ??= { moves: 0, acc: 0, best: 0, errors: 0 });
      row.moves++;
      row.acc += m.accuracy;
      if (['brilliant', 'great', 'best'].includes(m.classification)) row.best++;
      if (['mistake', 'blunder', 'miss'].includes(m.classification)) row.errors++;
    }
    const o = outcomeOf(x.game, x.color);
    if (wasWinning) {
      tactics.winning++;
      if (o === 'w') tactics.converted++;
    }
    if (wasLosing) {
      tactics.losing++;
      if (o !== 'l') tactics.saved++;
    }
  }
  const lostTotal = lost.opening + lost.middlegame + lost.endgame || 1;
  const n = reviewed.length || 1;
  const phases: Stats['phases'] = reviewed.length
    ? {
        accuracy: { opening: avg(phaseAcc.opening), middlegame: avg(phaseAcc.middlegame), endgame: avg(phaseAcc.endgame) },
        lostShare: { opening: lost.opening / lostTotal, middlegame: lost.middlegame / lostTotal, endgame: lost.endgame / lostTotal },
      }
    : null;
  const quality = reviewed.length
    ? CLASSES.map((cls) => ({ cls, you: (youCount[cls] ?? 0) / n, opponents: (oppCount[cls] ?? 0) / n, total: youCount[cls] ?? 0 }))
    : [];
  const pieces = ['P', 'N', 'B', 'R', 'Q', 'K']
    .filter((p) => pieceRows[p]?.moves)
    .map((p) => ({
      piece: PIECES[p],
      moves: pieceRows[p].moves,
      accuracy: pieceRows[p].acc / pieceRows[p].moves,
      best: pieceRows[p].best,
      errors: pieceRows[p].errors,
    }));

  // ---------------------------------------------------------------- time
  let time: Stats['time'] = null;
  const timed = list.filter((x) => x.game.clock && x.game.clocks?.length && timeClassOf(x.game) !== 'daily');
  if (timed.length) {
    const spent: number[] = [];
    const perPhase: Record<Phase, number[]> = { opening: [], middlegame: [], endgame: [] };
    const left: number[] = [];
    let troubleMoves = 0;
    let troubleErrors = 0;
    let errors = 0;
    let longestThink: NonNullable<Stats['time']>['longestThink'] = null;
    for (const x of timed) {
      const { base, inc } = x.game.clock!;
      const clocks = x.game.clocks!;
      const start = base * 1000;
      const first = x.color === 'w' ? 0 : 1;
      let lastLeft = start;
      for (let i = first; i < clocks.length; i += 2) {
        const before = i >= 2 ? clocks[i - 2] : start;
        const s = Math.max(0, (before + inc * 1000 - clocks[i]) / 1000);
        spent.push(s);
        const m = x.review?.moves[i];
        if (m) perPhase[m.phase].push(s);
        if (!longestThink || s > longestThink.seconds) longestThink = { seconds: s, san: x.game.sans[i], gameId: x.game.id, ply: i };
        const short = before < start * 0.1;
        if (short) troubleMoves++;
        if (m && (m.classification === 'mistake' || m.classification === 'blunder')) {
          errors++;
          if (short) troubleErrors++;
        }
        lastLeft = clocks[i];
      }
      left.push(Math.min(1, lastLeft / start));
    }
    const onTime = (o: Outcome) => timed.filter((x) => x.game.termination === 'timeout' && outcomeOf(x.game, x.color) === o).length;
    time = {
      games: timed.length,
      secondsPerMove: avg(spent) ?? 0,
      byPhase: { opening: avg(perPhase.opening), middlegame: avg(perPhase.middlegame), endgame: avg(perPhase.endgame) },
      leftAtEnd: avg(left) ?? 0,
      lostOnTime: onTime('l'),
      wonOnTime: onTime('w'),
      troubleErrors,
      errors,
      troubleMoves: spent.length ? troubleMoves / spent.length : 0,
      longestThink,
    };
  }

  // ---------------------------------------------------------------- openings
  const openMap = new Map<string, StatGame[]>();
  for (const x of list) {
    const name = (x.game.opening ?? x.review?.opening?.name)?.split(':')[0].trim();
    if (!name) continue;
    const k = `${x.color}|${name}`;
    openMap.set(k, [...(openMap.get(k) ?? []), x]);
  }
  const openings = [...openMap.entries()]
    .map(([k, xs]) => {
      const [color, name] = k.split('|') as [Color, string];
      const accs = xs.filter((x) => x.review).map((x) => sideOf(x.review!, x.color).accuracy);
      return { color, name, wdl: wdl(xs), accuracy: avg(accs) };
    })
    .sort((a, b) => b.wdl.games - a.wdl.games || b.wdl.score - a.wdl.score);

  // ---------------------------------------------------------------- length, castling, style
  const lens = list.map((x) => fullMoves(x.game));
  let shortestWin: Stats['length']['shortestWin'] = null;
  let longestGame: Stats['length']['longestGame'] = null;
  for (const x of list) {
    const mv = fullMoves(x.game);
    if (outcomeOf(x.game, x.color) === 'w' && (!shortestWin || mv < shortestWin.moves)) shortestWin = { moves: mv, gameId: x.game.id };
    if (!longestGame || mv > longestGame.moves) longestGame = { moves: mv, gameId: x.game.id };
  }
  const cs = list.map((x) => ({ x, c: castled(x.game, x.color), opp: castled(x.game, other(x.color)) }));
  const castledList = cs.filter((r) => r.c);
  let checks = 0;
  let captures = 0;
  let promotions = 0;
  let queenOutEarly = 0;
  for (const x of list) {
    let earlyQueen = false;
    for (let i = x.color === 'w' ? 0 : 1; i < x.game.sans.length; i += 2) {
      const s = x.game.sans[i];
      if (/[+#]/.test(s)) checks++;
      if (s.includes('x')) captures++;
      if (s.includes('=')) promotions++;
      if (i < 12 && s.startsWith('Q')) earlyQueen = true;
    }
    if (earlyQueen) queenOutEarly++;
  }
  const g = list.length || 1;

  return {
    games: list.length,
    reviewed: reviewed.length,
    overall: wdl(list),
    byColor,
    byTimeClass,
    byOpponent,
    byTimeOfDay,
    byDay,
    byLength,
    opponents: { avgRating: oppElos.length ? Math.round(avg(oppElos)!) : null, bestWin, worstLoss },
    ratings,
    streaks: { current, longestWin: longest((o) => o === 'w'), longestLoss: longest((o) => o === 'l'), longestUnbeaten: longest((o) => o !== 'l') },
    endings,
    accuracy,
    phases,
    quality,
    pieces,
    time,
    openings,
    length: { avgMoves: avg(lens) ?? 0, shortestWin, longestGame },
    castling: {
      castled: castledList.length,
      kingside: castledList.filter((r) => r.c!.side === 'k').length,
      queenside: castledList.filter((r) => r.c!.side === 'q').length,
      avgMove: castledList.length ? avg(castledList.map((r) => Math.floor(r.c!.ply / 2) + 1)) : null,
      castledWdl: wdl(castledList.map((r) => r.x)),
      notCastledWdl: wdl(cs.filter((r) => !r.c).map((r) => r.x)),
      opponentsCastled: cs.filter((r) => r.opp).length,
    },
    style: { checksPerGame: checks / g, capturesPerGame: captures / g, promotions, queenOutEarly },
    tactics,
  };
}
