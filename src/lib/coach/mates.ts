// Mates you could have found: positions from your own games where you had a
// forced checkmate and didn't play it (or got there the long way round), and
// a walkthrough of how to see it: the king's squares, every check, each
// forcing move and its reply, and why the final position is mate.
import { Chess, type Color, type Square } from 'chess.js';
import { PIECE_NAME, playUci } from '../chess/utils';
import type { Score } from '../engine/uci';
import { evalScore } from '../review/classify';
import type { GameReview } from '../review/types';
import { captionMove } from './story';

/** The longest mate worth drilling: past five moves it's calculation for later. */
export const MAX_MATE = 5;
/** A mate this many moves slower than the quickest one is worth showing. */
const SLOWER_BY = 2;

export interface MateChance {
  /** `${gameId}:${ply}` */
  id: string;
  gameId: string;
  ply: number;
  fen: string;
  /** The opponent's move just before, to show as the last move. */
  prev?: string;
  you: Color;
  /** Mate in this many of your moves. */
  mateIn: number;
  /** The mating line in UCI, ending in checkmate. */
  line: string[];
  lineSan: string[];
  /** Missed: the mate was gone after your move. Slower: you still mated, but later. */
  kind: 'missed' | 'slower';
  played: string;
  /** For a slower mate: how many moves your move needed to mate from here. */
  playedMateIn?: number;
}

const mateFor = (s: Score | undefined, you: Color): number | null =>
  s && s.type === 'mate' && (you === 'w' ? s.value > 0 : s.value < 0) ? Math.ceil(Math.abs(s.value)) : null;

/** Plays `line` from `fen` and returns its SAN if it ends in checkmate within `plies`. */
function mateLine(fen: string, line: string[], plies: number): string[] | null {
  const c = new Chess(fen);
  const san: string[] = [];
  for (const u of line.slice(0, plies)) {
    const m = playUci(c, u);
    if (!m) return null;
    san.push(m.san);
    if (c.isCheckmate()) return san;
  }
  return null;
}

/** Every mate chance you had in a reviewed game, at most two for each run of moves where the mate was on. */
export function findMateChances(gameId: string, review: GameReview, you: Color): MateChance[] {
  const runs: MateChance[][] = [];
  let run: MateChance[] = [];
  for (const m of review.moves) {
    if (m.color !== you) continue;
    const before = review.positions[m.ply];
    const after = review.positions[m.ply + 1];
    const best = before?.lines[0];
    const n = mateFor(best?.score, you);
    if (!before || !after || !best || n === null) {
      if (run.length) runs.push(run);
      run = [];
      continue;
    }
    if (after.terminal === 'checkmate') continue; // you mated
    const k = mateFor(evalScore(after), you); // moves still needed after yours
    const kind = k === null ? 'missed' : k + 1 - n >= SLOWER_BY ? 'slower' : null;
    if (!kind || n > MAX_MATE) continue;
    const lineSan = mateLine(m.fenBefore, best.pv, n * 2 - 1);
    if (!lineSan) continue;
    run.push({
      id: `${gameId}:${m.ply}`,
      gameId,
      ply: m.ply,
      fen: m.fenBefore,
      prev: m.ply > 0 ? review.moves[m.ply - 1]?.uci : undefined,
      you,
      mateIn: n,
      line: best.pv.slice(0, lineSan.length),
      lineSan,
      kind,
      played: m.san,
      playedMateIn: k === null ? undefined : k + 1,
    });
  }
  if (run.length) runs.push(run);
  // The first moment of each run (when it could first be seen), and the shortest mate in it if that came later.
  const out: MateChance[] = [];
  for (const r of runs) {
    out.push(r[0]);
    const shortest = r.reduce((a, b) => (b.mateIn < a.mateIn ? b : a));
    if (shortest !== r[0] && shortest.mateIn < r[0].mateIn) out.push(shortest);
  }
  return out;
}

// ---------------------------------------------------------------- the walkthrough

export type MarkKind = 'king' | 'flight' | 'covered' | 'key';

export interface ThinkStep {
  title: string;
  text: string;
  fen: string;
  lastMove?: [string, string];
  marks: Partial<Record<Square, MarkKind>>;
  arrows: { from: Square; to: Square; brush: 'green' | 'blue' | 'red' | 'paleBlue' }[];
}

const FILES = 'abcdefgh';
function around(sq: Square): Square[] {
  const f = FILES.indexOf(sq[0]);
  const r = +sq[1];
  const out: Square[] = [];
  for (let df = -1; df <= 1; df++)
    for (let dr = -1; dr <= 1; dr++) {
      if (!df && !dr) continue;
      const nf = f + df;
      const nr = r + dr;
      if (nf >= 0 && nf < 8 && nr >= 1 && nr <= 8) out.push(`${FILES[nf]}${nr}` as Square);
    }
  return out;
}

const kingOf = (c: Chess, color: Color): Square => {
  for (const row of c.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  throw new Error('no king');
};

export interface KingBox {
  king: Square;
  flights: Square[];
  /** Squares around the king your pieces cover, with the pieces that cover them. */
  covered: { sq: Square; by: Square[] }[];
  /** Squares filled by the king's own pieces. */
  blocked: Square[];
}

/** The squares around their king: free to run to, covered by your pieces, or blocked by their own. */
export function kingBox(fen: string, them: Color): KingBox {
  const c = new Chess(fen);
  const king = kingOf(c, them);
  const you: Color = them === 'w' ? 'b' : 'w';
  // Without the king on the board, so a square behind it on the line of a check counts as covered.
  const bare = new Chess(fen);
  bare.remove(king);
  const flights: Square[] = [];
  const covered: { sq: Square; by: Square[] }[] = [];
  const blocked: Square[] = [];
  for (const sq of around(king)) {
    const p = c.get(sq);
    if (p && p.color === them) {
      blocked.push(sq);
      continue;
    }
    const by = bare.attackers(sq, you);
    if (by.length) covered.push({ sq, by });
    else flights.push(sq);
  }
  return { king, flights, covered, blocked };
}

const list = (xs: string[]) => (xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs.at(-1)}`);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function pieceAt(fen: string, sq: Square): string {
  const p = new Chess(fen).get(sq);
  return p ? `${PIECE_NAME[p.type]} on ${sq}` : sq;
}

/** "your queen covers d8 and f8; your bishop covers d7" */
function coverText(fen: string, covered: { sq: Square; by: Square[] }[]): string {
  const byPiece = new Map<Square, Square[]>();
  for (const { sq, by } of covered) {
    const who = by[0];
    byPiece.set(who, [...(byPiece.get(who) ?? []), sq]);
  }
  return [...byPiece.entries()].map(([who, sqs]) => `your ${pieceAt(fen, who)} covers ${list(sqs)}`).join('; ');
}

function checksIn(fen: string): { san: string; from: Square; to: Square }[] {
  return new Chess(fen)
    .moves({ verbose: true })
    .filter((m) => m.san.includes('+') || m.san.includes('#'))
    .map((m) => ({ san: m.san, from: m.from, to: m.to }));
}

/** The name of the mate, when it's a well-known one. */
function patternOf(fen: string, mated: Color): string | null {
  const c = new Chess(fen);
  const king = kingOf(c, mated);
  const you: Color = mated === 'w' ? 'b' : 'w';
  const checkers = c.attackers(king, you);
  if (checkers.length !== 1) return checkers.length === 2 ? 'a double-check mate' : null;
  const piece = c.get(checkers[0])!;
  const box = kingBox(fen, mated);
  if (piece.type === 'n' && box.covered.length === 0) return 'a smothered mate: the king is boxed in by its own pieces';
  const backRank = mated === 'w' ? '1' : '8';
  if ((piece.type === 'r' || piece.type === 'q') && king[1] === backRank && checkers[0][1] === backRank && box.blocked.length >= 2)
    return 'a back-rank mate: its own pawns keep the king on the back rank';
  return null;
}

function boxMarks(box: KingBox): ThinkStep['marks'] {
  const marks: ThinkStep['marks'] = { [box.king]: 'king' };
  for (const s of box.flights) marks[s] = 'flight';
  for (const { sq } of box.covered) marks[sq] = 'covered';
  return marks;
}

/** How to see the mate, a step at a time. */
export function mateWalkthrough(ch: MateChance): ThinkStep[] {
  const steps: ThinkStep[] = [];
  const them: Color = ch.you === 'w' ? 'b' : 'w';
  const prev = ch.prev ? ([ch.prev.slice(0, 2), ch.prev.slice(2, 4)] as [string, string]) : undefined;

  // 1. Their king.
  const box = kingBox(ch.fen, them);
  const marks = boxMarks(box);
  const blockedText = box.blocked.length ? `its own pieces fill ${list(box.blocked)}` : '';
  const coveredText = box.covered.length ? coverText(ch.fen, box.covered) : '';
  const why = [coveredText, blockedText].filter(Boolean).join('; ');
  steps.push({
    title: 'Look at their king first',
    text:
      box.flights.length === 0
        ? `Their king on ${box.king} has no squares to run to${why ? `: ${why}` : ''}. A king with no squares is one good check away from mate.`
        : `Their king on ${box.king} can only run to ${list(box.flights)} (green). The rest are gone${why ? `: ${why}` : ''}. When a king is this short of squares, look for mate.`,
    fen: ch.fen,
    lastMove: prev,
    marks,
    arrows: [],
  });

  // 2. Every check.
  const checks = checksIn(ch.fen);
  const first = new Chess(ch.fen).move(ch.lineSan[0]);
  const firstIsCheck = /[+#]/.test(ch.lineSan[0]);
  steps.push({
    title: 'Then try every check',
    text:
      checks.length === 0
        ? 'You have no checks here. So look for a move that takes away the last squares or threatens mate, and leaves them no time to stop it.'
        : `You have ${plural(checks.length, 'check')}: ${list(checks.map((m) => m.san))}. Look at checks first: they force a reply, so your opponent's choice is tiny and you can see where it goes.${
            firstIsCheck ? '' : ' Here none of them mates quickly, which is a clue: the winning move is a quiet one.'
          }`,
    fen: ch.fen,
    lastMove: prev,
    marks: { [box.king]: 'king' },
    arrows: checks.slice(0, 6).map((m) => ({ from: m.from, to: m.to, brush: 'blue' as const })),
  });

  // 3. The line, one of your moves (and their answer) at a time.
  const c = new Chess(ch.fen);
  for (let i = 0; i < ch.line.length; i += 2) {
    const fen = c.fen();
    const u = ch.line[i];
    const mine = captionMove(fen, u, ch.you).caption;
    const mv = playUci(c, u)!;
    const n = i / 2 + 1;
    if (c.isCheckmate()) {
      const end = kingBox(c.fen(), them);
      const checker = c.attackers(end.king, ch.you)[0];
      const endMarks: ThinkStep['marks'] = { [end.king]: 'king' };
      for (const { sq } of end.covered) endMarks[sq] = 'covered';
      if (checker) endMarks[checker] = 'key';
      const reasons = [
        end.covered.length ? coverText(c.fen(), end.covered) : '',
        end.blocked.length ? `its own pieces on ${list(end.blocked)} box it in` : '',
      ]
        .filter(Boolean)
        .join('; ');
      const pattern = patternOf(c.fen(), them);
      steps.push({
        title: `${mv.san}: checkmate`,
        text: `${checker ? `Your ${pieceAt(c.fen(), checker)} gives check, and it can't be taken or blocked.` : 'Check, and nothing can stop it.'} Every square around the king is gone${
          reasons ? `: ${reasons}` : ''
        }.${pattern ? ` This is ${pattern}.` : ''}`,
        fen: c.fen(),
        lastMove: [mv.from, mv.to],
        marks: endMarks,
        arrows: [],
      });
      break;
    }
    const reply = ch.line[i + 1];
    const replies = c.moves({ verbose: true });
    const r = playUci(new Chess(c.fen()), reply)!;
    const kingOnly = replies.every((m) => m.piece === 'k');
    const answer =
      replies.length === 1
        ? `Their only move is ${r.san}.`
        : kingOnly
          ? `The king has to move: ${list(replies.map((m) => m.san))}. ${r.san} lasts longest.`
          : `Their best try is ${r.san}; anything else is mated sooner.`;
    const label = n === 1 ? (firstIsCheck ? `The check that works: ${mv.san}` : `The quiet killer: ${mv.san}`) : `Move ${n}: ${mv.san}`;
    const quiet = n === 1 && !firstIsCheck ? ' It isn’t a check, but it takes away the squares, and nothing they do stops the mate.' : '';
    steps.push({
      title: label,
      text: `${mine}${quiet} ${answer}`,
      fen: c.fen(),
      lastMove: [mv.from, mv.to],
      marks: boxMarks(kingBox(c.fen(), them)),
      arrows: [{ from: r.from, to: r.to, brush: 'red' }],
    });
    playUci(c, reply);
  }

  // 4. The habit.
  const inGame =
    ch.kind === 'slower'
      ? `In the game you played ${ch.played} and still mated, but it took ${plural(ch.playedMateIn ?? ch.mateIn, 'move')}; this way takes ${ch.mateIn}.`
      : `In the game you played ${ch.played}, and the mate was gone.`;
  steps.push({
    title: 'How to find it next time',
    text: `${inGame} Whenever their king is short of squares: count its squares, try every check, and after each check ask where the king can go and what you have next.${
      ch.mateIn > 1 ? ` That's how you see ${ch.mateIn} moves ahead: one forcing move at a time.` : ''
    }`,
    fen: ch.fen,
    lastMove: prev,
    marks: { [box.king]: 'king' },
    arrows: first ? [{ from: first.from, to: first.to, brush: 'green' }] : [],
  });
  return steps;
}

/** Hints for the move to find in `fen` (your move is `uci`), gentlest first. */
export function mateHints(fen: string, uci: string): { text: string; square?: Square; arrow?: [Square, Square] }[] {
  const you = new Chess(fen).turn();
  const them: Color = you === 'w' ? 'b' : 'w';
  const box = kingBox(fen, them);
  const first = playUci(new Chess(fen), uci);
  if (!first) return [];
  const isCheck = /[+#]/.test(first.san);
  return [
    {
      text:
        box.flights.length === 0
          ? `Their king has no squares at all. ${isCheck ? 'Find the check it can’t answer.' : 'This move isn’t a check: it makes a threat they can’t stop.'}`
          : `Their king can only go to ${list(box.flights)}. ${isCheck ? 'Look for a check.' : 'This move isn’t a check: it takes a square away.'}`,
    },
    { text: `Use your ${PIECE_NAME[first.piece]}.`, square: first.from },
    { text: `Play ${first.san}.`, arrow: [first.from, first.to] },
  ];
}

export { mateFor };
