// `#/mates`: the daily mate drill. Mates you had in your own games and didn't
// take. You try first (with hints if you want them); the engine plays their
// best defence and checks that every move of yours still mates in time. Then
// the coach walks you through how to see it: the king's squares, every check,
// each forcing move, and why the end is mate.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Board, type PromotionPiece } from '../components/Board';
import { getAnalysisEngine } from '../lib/engine/manager';
import { legalDests, moveToUci, playUci } from '../lib/chess/utils';
import { navigate } from '../lib/router';
import { playSound, soundForSan } from '../lib/sound';
import { mateFor, mateHints, mateWalkthrough, type MarkKind } from '../lib/coach/mates';
import { captionMove } from '../lib/coach/story';
import { Rich, San } from '../components/Rich';
import { useMateDrill, useMateStore, DAILY, type DrillItem } from '../state/mates';
import { when } from './Games';

type Phase = 'solve' | 'thinking' | 'wrong' | 'replying' | 'solved' | 'showing' | 'shown' | 'learn';

const MARK_CLASS: Record<MarkKind, string> = { king: 'nc-king', flight: 'nc-flight', covered: 'nc-covered', key: 'hl-key' };
const sq2 = (u: string) => [u.slice(0, 2), u.slice(2, 4)] as [string, string];

export function MatesPage() {
  const drill = useMateDrill();
  const grade = useMateStore((s) => s.grade);
  const [extra, setExtra] = useState(false);
  const [current, setCurrent] = useState<DrillItem | null>(null);

  // Today's set, or (once that's done and you ask for more) the rest.
  const list = useMemo(() => {
    if (!drill) return [];
    if (drill.queue.length || !extra) return drill.queue;
    const p = useMateStore.getState().progress;
    return drill.all.filter((m) => !p[m.id] || p[m.id].due <= Date.now()).slice(0, DAILY);
  }, [drill, extra]);
  useEffect(() => {
    if (!current && list.length) setCurrent(list[0]);
  }, [list, current]);

  if (!drill) return <div className="page narrow">Loading…</div>;
  if (!current) {
    const none = drill.all.length === 0;
    return (
      <div className="page narrow">
        <header className="page-head">
          <button className="icon-btn back" onClick={() => navigate('/')} aria-label="Back">
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1>Mate drill</h1>
          </div>
        </header>
        <section className="empty-hero">
          <h2 className="display">{none ? 'No missed mates yet' : 'That’s today’s mates done'}</h2>
          <p className="muted">
            {none
              ? 'As your games are reviewed, every forced mate you missed (or took the long way round to) lands here, and you get a few each day to find.'
              : `You've done ${drill.doneToday} today. Any you missed come back tomorrow, until you get them.`}
          </p>
          {!none && drill.more > 0 && (
            <button className="btn" onClick={() => setExtra(true)}>
              Do {Math.min(DAILY, drill.more)} more
            </button>
          )}
          <button className="btn primary" onClick={() => navigate('/')}>
            Back to your coach
          </button>
        </section>
      </div>
    );
  }
  const left = list.filter((m) => m.id !== current.id).length + 1;
  return (
    <MatePuzzle
      key={current.id}
      ch={current}
      left={left}
      onGrade={(solved, clean) => grade(current.id, solved, clean)}
      onNext={() => setCurrent(null)}
    />
  );
}

function MatePuzzle({
  ch,
  left,
  onGrade,
  onNext,
}: {
  ch: DrillItem;
  left: number;
  onGrade: (solved: boolean, clean: boolean) => void;
  onNext: () => void;
}) {
  const [moves, setMoves] = useState<string[]>([]);
  /** The quickest mate from where you are: your next move first. */
  const [plan, setPlan] = useState<string[]>(ch.line);
  const [phase, setPhase] = useState<Phase>('solve');
  const [wrong, setWrong] = useState<{ uci: string; reply?: string; note: string } | null>(null);
  const [hint, setHint] = useState(0);
  const [misses, setMisses] = useState(0);
  const [step, setStep] = useState(0);
  const graded = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const you = ch.you;
  const orientation = you === 'w' ? 'white' : 'black';
  const steps = useMemo(() => mateWalkthrough(ch), [ch]);
  const mineSoFar = Math.ceil(moves.length / 2);
  const opp = ch.game ? (ch.you === 'w' ? ch.game.black : ch.game.white) : null;

  const gradeOnce = (solved: boolean) => {
    if (graded.current) return;
    graded.current = true;
    onGrade(solved, solved && hint === 0 && misses === 0);
  };

  const position = useMemo(() => {
    const c = new Chess(ch.fen);
    for (const u of moves) playUci(c, u);
    return c;
  }, [ch.fen, moves]);
  const hints = useMemo(() => (plan[0] ? mateHints(position.fen(), plan[0]) : []), [position, plan]);

  // What the board shows.
  const view = useMemo(() => {
    if (phase === 'learn') {
      const s = steps[step];
      const c = new Chess(s.fen);
      return { fen: s.fen, lastMove: s.lastMove, check: c.inCheck() };
    }
    if (phase === 'wrong' && wrong) {
      const c = new Chess(position.fen());
      playUci(c, wrong.uci);
      return { fen: c.fen(), lastMove: sq2(wrong.uci), check: c.inCheck() };
    }
    const last = moves.at(-1) ?? ch.prev;
    return { fen: position.fen(), lastMove: last ? sq2(last) : undefined, check: position.inCheck() };
  }, [phase, steps, step, wrong, position, moves, ch.prev]);

  const highlights = useMemo(() => {
    const m = new Map<string, string>();
    if (phase === 'learn') for (const [sq, k] of Object.entries(steps[step].marks)) m.set(sq, MARK_CLASS[k as MarkKind]);
    else if (phase === 'solve' && hint >= 2 && hints[1]?.square) m.set(hints[1].square, 'hl-key');
    return m.size ? m : undefined;
  }, [phase, steps, step, hint, hints]);

  const shapes = useMemo<DrawShape[]>(() => {
    if (phase === 'learn') return steps[step].arrows.map((a) => ({ orig: a.from as Key, dest: a.to as Key, brush: a.brush }));
    if (phase === 'wrong' && wrong?.reply) return [{ orig: wrong.reply.slice(0, 2) as Key, dest: wrong.reply.slice(2, 4) as Key, brush: 'red' }];
    if (phase === 'solve' && hint >= 3 && hints[2]?.arrow)
      return [{ orig: hints[2].arrow[0] as Key, dest: hints[2].arrow[1] as Key, brush: 'green' }];
    return [];
  }, [phase, steps, step, wrong, hint, hints]);

  const dests = useMemo(() => (phase === 'solve' ? legalDests(position) : undefined), [phase, position]);

  /** Their answer, after a short pause so you can see your move land. */
  const reply = (after: string[], theirs: string, nextPlan: string[]) => {
    setPhase('replying');
    setTimeout(() => {
      if (!alive.current) return;
      const c = new Chess(ch.fen);
      for (const u of after) playUci(c, u);
      const m = playUci(c, theirs);
      if (m) playSound(soundForSan(m.san));
      setMoves([...after, theirs]);
      setPlan(nextPlan);
      setPhase('solve');
    }, 450);
  };

  const onMove = async (from: string, to: string, promotion?: PromotionPiece) => {
    if (phase !== 'solve') return;
    const c = new Chess(position.fen());
    const m = playUci(c, from + to + (promotion ?? ''));
    if (!m) return;
    const uci = moveToUci(m);
    playSound(soundForSan(m.san));
    const after = [...moves, uci];
    if (c.isCheckmate()) {
      setMoves(after);
      setPhase('solved');
      playSound('correct');
      gradeOnce(true);
      return;
    }
    const budget = ch.mateIn - (mineSoFar + 1); // your moves left after this one
    if (c.isStalemate()) {
      setWrong({
        uci,
        note: `${m.san} is stalemate: their king has no squares, but it isn't in check, so the game is a draw. Always leave them a move, or give check.`,
      });
      setMisses((x) => x + 1);
      setPhase('wrong');
      playSound('wrong');
      return;
    }
    if (uci === plan[0] && plan[1]) return reply(after, plan[1], plan.slice(2));
    setMoves(after);
    setPhase('thinking');
    const res = await getAnalysisEngine().analyse({ fen: ch.fen, moves: after, limits: { depth: 18, movetime: 2500 }, multipv: 1 });
    if (!alive.current) return;
    const k = mateFor(res.lines[0]?.score, you);
    const theirs = res.bestmove;
    if (k !== null && k <= budget && theirs) {
      // Another way to mate just as fast: fine.
      return reply(after, theirs, res.lines[0].pv.slice(1));
    }
    const replySan = theirs ? playUci(new Chess(c.fen()), theirs)?.san : undefined;
    const note =
      k !== null
        ? `${m.san} still mates, but it takes ${k + mineSoFar + 1} moves. There's a quicker way: mate in ${ch.mateIn}${mineSoFar ? ` from the start` : ''}.`
        : theirs && replySan
          ? `After ${m.san}, they answer ${replySan}. ${captionMove(c.fen(), theirs, you).caption} The mate is gone.`
          : `${m.san} lets the mate slip.`;
    setMoves(moves);
    setWrong({ uci, reply: k === null ? (theirs ?? undefined) : undefined, note });
    setMisses((x) => x + 1);
    setPhase('wrong');
    playSound('wrong');
  };

  /** Plays the rest of the quickest mate, a move at a time. */
  const showMe = () => {
    gradeOnce(false);
    setWrong(null);
    setPhase('showing');
    const rest = [...plan];
    const base = [...moves];
    const tick = (i: number) => {
      if (!alive.current) return;
      if (i >= rest.length) return setPhase('shown');
      const c = new Chess(ch.fen);
      for (const u of [...base, ...rest.slice(0, i)]) playUci(c, u);
      const m = playUci(c, rest[i]);
      if (m) playSound(soundForSan(m.san));
      setMoves([...base, ...rest.slice(0, i + 1)]);
      setTimeout(() => tick(i + 1), 800);
    };
    tick(0);
  };

  const learn = () => {
    setStep(0);
    setPhase('learn');
  };

  const title =
    phase === 'solved'
      ? 'Checkmate!'
      : phase === 'shown'
        ? 'That’s the mate'
        : phase === 'learn'
          ? steps[step].title
          : phase === 'wrong'
            ? 'Not quite'
            : mineSoFar === 0
              ? `Find mate in ${ch.mateIn}`
              : `Keep going: mate in ${ch.mateIn - mineSoFar}`;

  return (
    <div className="game-layout focus-screen mate-screen">
      <div className="board-column">
        <div className="player-bar" style={{ minHeight: 30 }}>
          <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back to your coach">
            <ChevronLeft size={20} />
          </button>
          <b>Mate drill</b>
          <span className="spacer" />
          <span className="faint">{left} left today</span>
        </div>
        <div className="board-row">
          <Board
            fen={view.fen}
            orientation={orientation}
            movableColor={phase === 'solve' ? orientation : undefined}
            turnColor={view.fen.split(' ')[1] === 'w' ? 'white' : 'black'}
            dests={dests}
            lastMove={view.lastMove}
            check={view.check}
            shapes={shapes}
            highlights={highlights}
            onMove={onMove}
            viewOnly={phase !== 'solve'}
          />
        </div>
      </div>
      <div className="side-panel">
        <div className="panel-body">
          <div className="coach-card">
            <div className="coach-top">
              <span className="coach-step">
                {phase === 'learn'
                  ? `How to see it · ${step + 1} of ${steps.length}`
                  : `${opp ? `vs ${opp.name}` : 'Your game'}${ch.game ? ` · ${when(ch.game.createdAt)}` : ''}`}
              </span>
            </div>
            <h3 className="coach-title">{title}</h3>
            {phase === 'learn' ? (
              <p className="coach-text">
                <Rich text={steps[step].text} />
              </p>
            ) : phase === 'wrong' && wrong ? (
              <p className="coach-text">
                <Rich text={wrong.note} />
              </p>
            ) : phase === 'solved' || phase === 'shown' ? (
              <p className="coach-text">
                {phase === 'solved' ? (hint === 0 && misses === 0 ? 'Found it first time. ' : 'Got there. ') : 'Here it is played out. '}
                Now see how you could have spotted it over the board.
              </p>
            ) : (
              <>
                <p className="coach-text">
                  {mineSoFar === 0 ? (
                    <>
                      You had a forced mate here. In the game you played <San san={ch.played} chip />
                      {ch.kind === 'slower' ? ` and mated ${ch.playedMateIn} moves later.` : ' and it slipped away.'} Your move.
                    </>
                  ) : (
                    'Good. They’ve answered: your move.'
                  )}
                </p>
                {phase === 'thinking' && <p className="coach-text faint">Checking…</p>}
                {hints.slice(0, hint).map((h, i) => (
                  <p key={i} className="coach-hint">
                    <Rich text={h.text} />
                  </p>
                ))}
              </>
            )}
          </div>
          {phase === 'learn' && (
            <div className="mate-legend faint">
              <span>
                <i className="nc-flight" /> squares it can run to
              </span>
              <span>
                <i className="nc-covered" /> squares you cover
              </span>
            </div>
          )}
        </div>
        <div className="panel-foot">
          {phase === 'solve' && (
            <>
              {hint < hints.length && (
                <button className="btn" onClick={() => setHint((h) => h + 1)}>
                  {hint === 0 ? 'Hint' : 'Another hint'}
                </button>
              )}
              <span className="spacer" />
              <button className="btn ghost" onClick={showMe}>
                Show me
              </button>
            </>
          )}
          {phase === 'wrong' && (
            <>
              <button className="btn primary" onClick={() => (setWrong(null), setPhase('solve'))}>
                Try again
              </button>
              <span className="spacer" />
              <button className="btn ghost" onClick={showMe}>
                Show me
              </button>
            </>
          )}
          {(phase === 'solved' || phase === 'shown') && (
            <>
              <button className="btn ghost" onClick={onNext}>
                Skip
              </button>
              <span className="spacer" />
              <button className="btn primary" onClick={learn}>
                How to see it
              </button>
            </>
          )}
          {phase === 'learn' && (
            <>
              <button className="btn" disabled={step === 0} onClick={() => setStep((s) => s - 1)} aria-label="Previous step">
                <ChevronLeft size={18} />
              </button>
              <span className="spacer" />
              {step < steps.length - 1 ? (
                <button className="btn primary" onClick={() => setStep((s) => s + 1)}>
                  Next <ChevronRight size={18} />
                </button>
              ) : (
                <button className="btn primary" onClick={onNext}>
                  Next mate <ChevronRight size={18} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
