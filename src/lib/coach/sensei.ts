// Sensei, the coach you play against. After each of your moves he says how
// good it was and why (and what was better); after each of his he says what
// it does, warns you about a piece left loose, and admits it when he slips,
// without giving the answer away. A quick search on its own engine, so the
// commentary never waits for his own thinking.
import { Chess, type Color } from 'chess.js';
import type { Engine } from '../engine/engine';
import { createSingleEngine } from '../engine/manager';
import { PIECE_NAME, playUci, sanLine } from '../chess/utils';
import { hangingPieces } from '../chess/tactics';
import { getOpeningBook } from '../chess/openings';
import { bestIdeaSentence, standing, warningText } from '../review/explain';
import { hintsFor } from '../review/hints';
import { expectedFor } from '../review/winprob';
import type { PositionEval } from '../review/types';
import { captionMove } from './story';

const DEPTH = 12;

export type Tone = 'good' | 'ok' | 'bad' | 'warn' | 'info';

export interface SenseiNote {
  /** The ply of the move this is about. */
  ply: number;
  who: 'you' | 'sensei';
  san: string;
  text: string;
  tone: Tone;
  /** A mistake of yours Sensei lets you take back. */
  takeBack?: boolean;
}

let engine: Engine | null = null;
const seen = new Map<string, PositionEval>();

function fenAfter(startFen: string, moves: string[]): string {
  const c = new Chess(startFen);
  for (const u of moves) playUci(c, u);
  return c.fen();
}

/** A quick evaluation of the position after `moves` (cached). */
export async function evaluate(startFen: string, moves: string[]): Promise<PositionEval | null> {
  const fen = fenAfter(startFen, moves);
  const hit = seen.get(fen);
  if (hit) return hit;
  if (new Chess(fen).isGameOver()) return null;
  engine ??= createSingleEngine(16);
  const r = await engine.analyse({ fen: startFen, moves, limits: { depth: DEPTH, movetime: 3000 }, multipv: 1 });
  const pos: PositionEval = {
    fen,
    depth: r.depth,
    lines: r.lines.filter((l) => l.pv.length).map((l) => ({ score: l.score, pv: l.pv, san: sanLine(fen, l.pv, 10), depth: l.depth })),
  };
  if (!pos.lines.length) return null;
  if (seen.size > 300) seen.clear();
  seen.set(fen, pos);
  return pos;
}

export function stopSensei() {
  engine?.terminate();
  engine = null;
  seen.clear();
}

const pick = <T>(xs: T[], seed: number) => xs[Math.abs(seed) % xs.length];
/** "Your knight forks the king and rook." -> "your knight forks the king and rook." */
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** Sensei on the move you just played (the last of `moves`). */
export async function judgeYourMove(startFen: string, moves: string[], you: Color): Promise<SenseiNote> {
  const ply = moves.length - 1;
  const uci = moves[ply];
  const fenBefore = fenAfter(startFen, moves.slice(0, -1));
  const c = new Chess(fenBefore);
  const mv = playUci(c, uci)!;
  const base = { ply, who: 'you' as const, san: mv.san };
  if (c.isCheckmate()) return { ...base, tone: 'good', text: 'Checkmate. Beautifully done. Bow, and set up the pieces again.' };
  if (c.isStalemate())
    return {
      ...base,
      tone: 'bad',
      text: 'Stalemate: my king cannot move but is not in check, so it is a draw. When you are winning, always leave the king a square or give check.',
    };
  const [before, after] = [await evaluate(startFen, moves.slice(0, -1)), await evaluate(startFen, moves)];
  const caption = captionMove(fenBefore, uci, you).caption;
  if (!before || !after) return { ...base, tone: 'info', text: caption };
  const epBefore = expectedFor(before.lines[0].score, you);
  const ep = expectedFor(after.lines[0].score, you);
  const loss = Math.max(0, epBefore - ep);
  const best = before.lines[0];
  const bestSan = best.san[0];
  const playedBest = best.pv[0] === uci;
  const opening = openingNote(startFen, moves);

  if (playedBest || loss < 0.02) {
    const lead = pick(['Good.', 'Well played.', 'Yes, that is the move.', 'Strong.', 'Exactly right.'], ply * 7 + mv.san.length);
    return { ...base, tone: 'good', text: `${lead} ${caption}${opening}` };
  }
  if (loss < 0.06) {
    return { ...base, tone: 'ok', text: `A fine move: ${lower(caption)}${bestSan ? ` ${bestSan} was a touch better.` : ''}${opening}` };
  }
  if (loss < 0.14) {
    const idea = bestIdeaSentence(before, you, epBefore);
    return { ...base, tone: 'warn', text: `Not the most precise. ${caption} ${idea ? `Better was ${idea}` : `${bestSan} was stronger.`}` };
  }
  // A real mistake: say what it allows, what was better, and offer the move back.
  const allows =
    inMyWords(warningText(before, after, you, uci, mv.san)) || (ep < 0.3 ? 'This gives the game away.' : 'This throws away your advantage.');
  const idea = bestIdeaSentence(before, you, epBefore);
  return {
    ...base,
    tone: 'bad',
    takeBack: true,
    text: `Careful. ${allows} ${idea ? `Better was ${idea}` : `Better was ${bestSan}.`} Take it back and try again?`,
  };
}

/** The review speaks of "your opponent"; Sensei is your opponent. */
export function inMyWords(text: string): string {
  return text
    .replace(
      /\bYour opponent (wins|gets|takes|has|forks|pins|skewers|mates|checkmates)\b/g,
      (_m, v: string) => `I ${v.replace(/s$/, '').replace(/^ha$/, 'have')}`,
    )
    .replace(
      /\byour opponent (wins|gets|takes|has|forks|pins|skewers|mates|checkmates)\b/g,
      (_m, v: string) => `I ${v.replace(/s$/, '').replace(/^ha$/, 'have')}`,
    )
    .replace(/\bYour opponent\b/g, 'I')
    .replace(/\byour opponent's\b/g, 'my')
    .replace(/\byour opponent\b/g, 'me');
}

/** Sensei on the move he just played (the last of `moves`); `epBefore` is how you stood before it. */
export async function explainSenseiMove(startFen: string, moves: string[], you: Color, epBefore: number | null): Promise<SenseiNote> {
  const ply = moves.length - 1;
  const uci = moves[ply];
  const fenBefore = fenAfter(startFen, moves.slice(0, -1));
  const c = new Chess(fenBefore);
  const mv = playUci(c, uci)!;
  const base = { ply, who: 'sensei' as const, san: mv.san };
  // His move in his own words: "My knight attacks your pawn on e4."
  const said = captionMove(fenBefore, uci, you)
    .caption.replace(/^Their /, 'My ')
    .replace(/^They castle/, 'I castle')
    .replace(/\bthe (pawn|knight|bishop|rook|queen) on ([a-h][1-8])\b/g, (m, p, sq) => (c.get(sq)?.color === you ? `your ${p} on ${sq}` : m));
  if (c.isCheckmate()) return { ...base, tone: 'bad', text: `${said} That is checkmate. Let us look at where it turned, then play again.` };
  if (c.isGameOver()) return { ...base, tone: 'info', text: said };
  const after = await evaluate(startFen, moves);
  const opening = openingNote(startFen, moves);
  if (!after) return { ...base, tone: 'info', text: `${said}${opening}` };
  const ep = expectedFor(after.lines[0].score, you);
  // He slipped: say so, but let you find the punishment.
  if (epBefore !== null && ep - epBefore >= 0.18 && ep >= 0.55) {
    return { ...base, tone: 'good', text: `${said} Hmm. I may have made a mistake there. Look carefully: is there something strong for you now?` };
  }
  // Something of yours is loose.
  const loose = hangingPieces(c, you)
    .filter((h) => h.loss >= 2)
    .sort((a, b) => b.loss - a.loss)[0];
  if (loose) {
    return {
      ...base,
      tone: 'warn',
      text: `${said} Watch your ${PIECE_NAME[loose.type]} on ${loose.square}: ${loose.undefended ? 'it is attacked and nothing defends it' : 'I can win it'}.`,
    };
  }
  if (c.inCheck()) return { ...base, tone: 'warn', text: `${said} You are in check: you must deal with it.` };
  const where = epBefore !== null && Math.abs(ep - epBefore) >= 0.1 ? ` Now you're ${standing(ep)}.` : '';
  return { ...base, tone: 'info', text: `${said}${opening}${where}` };
}

/** A two-step hint for your move: the idea, then the piece. */
export async function hintFor(startFen: string, moves: string[]): Promise<{ idea: string; piece: string; square: string; uci: string } | null> {
  const pos = await evaluate(startFen, moves);
  const best = pos?.lines[0];
  if (!pos || !best?.pv[0]) return null;
  const h = hintsFor(pos.fen, best.pv[0], best.san[0], { line: best.san });
  return { ...h, uci: best.pv[0] };
}

/** " This is the Italian Game." when the move has just given the opening its name. */
function openingNote(startFen: string, moves: string[]): string {
  if (moves.length > 24) return '';
  const book = getOpeningBook();
  if (!book) return '';
  const c = new Chess(startFen);
  const fens = [c.fen()];
  for (const u of moves) {
    playUci(c, u);
    fens.push(c.fen());
  }
  const now = book.classify(fens)?.name;
  const before = book.classify(fens.slice(0, -1))?.name;
  return now && now !== before ? ` This is the ${now}.` : '';
}
