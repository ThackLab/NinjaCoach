// `#/sensei`: play a game against Sensei, who talks you through it. He plays
// just above your level, says what he thinks of every move (yours and his),
// stops you after a mistake so you can take it back, gives a hint when you
// ask, and when the game is over it is reviewed like your chess.com games.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color } from 'chess.js';
import type { Key } from 'chessground/types';
import { ChevronLeft, Flag, Lightbulb, RotateCcw } from 'lucide-react';
import { Board, type PromotionPiece } from '../components/Board';
import { PlayerBar, Segmented } from '../components/Widgets';
import { Rich, San } from '../components/Rich';
import { chooseBotMove, thinkTime } from '../lib/bots/brain';
import type { BotProfile } from '../lib/bots/bots';
import { getOpeningBook, loadOpeningBook } from '../lib/chess/openings';
import { START_FEN, legalDests, moveToUci, playUci } from '../lib/chess/utils';
import { evaluate, explainSenseiMove, hintFor, judgeYourMove, type SenseiNote } from '../lib/coach/sensei';
import { getBotEngine } from '../lib/engine/manager';
import { expectedFor } from '../lib/review/winprob';
import { navigate } from '../lib/router';
import { playSound, soundForSan } from '../lib/sound';
import { listGames, saveGame, type GameRecord, type GameResult } from '../lib/storage/db';
import { useReviewer } from '../state/reviewer';
import { useSensei } from '../state/sensei';
import { useSync } from '../state/sync';

const FACE = '🥷';
const TINT = '#4b3a9a';

export function SenseiPage() {
  const game = useSensei((s) => s.game);
  return game ? <SenseiBoard key={game.startedAt} /> : <SenseiStart />;
}

/** Your chess.com rating, from your newest rated game. */
async function myRating(): Promise<number | null> {
  const g = (await listGames())
    .filter((x) => x.userColor && x.source !== 'bot')
    .sort((a, b) => b.createdAt - a.createdAt)
    .find((x) => (x.userColor === 'w' ? x.white.elo : x.black.elo));
  return g ? (g.userColor === 'w' ? g.white.elo! : g.black.elo!) : null;
}

function SenseiStart() {
  const { elo, record, setGame, setElo } = useSensei();
  const [side, setSide] = useState<'w' | 'r' | 'b'>('r');
  const [shownElo, setShownElo] = useState<number | null>(elo);
  useEffect(() => {
    if (elo !== null) return;
    // The first game: just above your chess.com rating.
    void myRating().then((r) => setShownElo(Math.max(200, (r ?? 700) + 100)));
  }, [elo]);
  const start = () => {
    const level = elo ?? shownElo ?? 800;
    if (elo === null) setElo(level);
    const you: Color = side === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : side;
    void loadOpeningBook();
    setGame({
      startFen: START_FEN,
      moves: [],
      you,
      elo: level,
      startedAt: Date.now(),
      notes: [
        {
          ply: -1,
          who: 'sensei',
          san: '',
          tone: 'info',
          text:
            you === 'w'
              ? 'Welcome. I will tell you what I think of every move, yours and mine. You have White: your move.'
              : 'Welcome. I will tell you what I think of every move, yours and mine. I have White, so I begin.',
        },
      ],
    });
  };
  return (
    <div className="page narrow sensei-start">
      <header className="page-head">
        <button className="icon-btn back" onClick={() => navigate('/')} aria-label="Back">
          <ChevronLeft size={24} />
        </button>
        <div>
          <h1>Play with Sensei</h1>
        </div>
      </header>
      <section className="card-box sensei-hero">
        <div className="sensei-face" aria-hidden>
          {FACE}
        </div>
        <div>
          <b>Sensei {shownElo ? `(${shownElo})` : ''}</b>
          <p className="muted">
            He plays just above your level and moves up when you win, down when you lose. He tells you what he thinks of every move, stops you after a
            mistake so you can take it back, and gives a hint whenever you ask.
          </p>
          {record.w + record.d + record.l > 0 && (
            <p className="faint">
              You against Sensei: {record.w} won · {record.d} drawn · {record.l} lost
            </p>
          )}
        </div>
      </section>
      <div className="st-filter-k">Play as</div>
      <Segmented
        value={side}
        onChange={setSide}
        options={[
          { value: 'w', label: 'White' },
          { value: 'r', label: 'Random' },
          { value: 'b', label: 'Black' },
        ]}
      />
      <button className="btn primary big block" style={{ marginTop: 16 }} onClick={start} disabled={!shownElo}>
        Start the game
      </button>
    </div>
  );
}

type Phase = 'you' | 'judging' | 'decide' | 'sensei' | 'over';

function SenseiBoard() {
  const g = useSensei((s) => s.game)!;
  const { patch, setGame, score } = useSensei();
  const username = useSync((s) => s.username) || 'You';
  const chess = useMemo(() => {
    const c = new Chess(g.startFen);
    for (const u of g.moves) playUci(c, u);
    return c;
  }, [g.startFen, g.moves]);
  const yourTurn = chess.turn() === g.you;
  const [phase, setPhase] = useState<Phase>(() => (g.result ? 'over' : g.notes.at(-1)?.takeBack ? 'decide' : yourTurn ? 'you' : 'sensei'));
  const [hint, setHint] = useState<{ idea: string; piece: string; square: string; level: number } | null>(null);
  const [thinking, setThinking] = useState(false);
  const alive = useRef(true);
  const epYou = useRef<number | null>(null);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  const bot: BotProfile = useMemo(
    () => ({ id: 'sensei', name: 'Sensei', elo: g.elo, avatar: FACE, tint: TINT, style: 'balanced', tagline: '', bio: '' }),
    [g.elo],
  );

  const addNote = (n: SenseiNote, moves: string[]) => {
    const cur = useSensei.getState().game;
    if (!cur) return;
    patch({ notes: [...cur.notes.filter((x) => x.ply < moves.length), n].slice(-12) });
  };

  /** The game is over after `moves`: save it, count it, start its review. */
  const finish = async (moves: string[], result: GameResult, termination: string) => {
    const c = new Chess(g.startFen);
    const sans: string[] = [];
    for (const u of moves) sans.push(playUci(c, u)!.san);
    const you = { name: username, isUser: true };
    const him = { name: 'Sensei', elo: g.elo, botId: 'sensei' };
    const id = `sensei-${g.startedAt}`;
    const movetext = sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}. ${s}` : s)).join(' ');
    const rec: GameRecord = {
      id,
      createdAt: Date.now(),
      source: 'bot',
      white: g.you === 'w' ? you : him,
      black: g.you === 'b' ? you : him,
      result,
      termination,
      startFen: g.startFen,
      moves,
      sans,
      pgn: `[Event "Ninja Coach: Sensei"]\n[White "${g.you === 'w' ? username : 'Sensei'}"]\n[Black "${g.you === 'b' ? username : 'Sensei'}"]\n[Result "${result}"]\n\n${movetext} ${result}`,
      userColor: g.you,
      opening: getOpeningBook()?.classify([g.startFen])?.name,
    };
    await saveGame(rec);
    const outcome = result === '1/2-1/2' ? 'd' : (result === '1-0') === (g.you === 'w') ? 'w' : 'l';
    score(outcome);
    patch({ result, termination, savedId: id });
    setPhase('over');
    void useReviewer.getState().start(id);
  };

  /** Checks for the end of the game after `moves`; true if it ended. */
  const ended = (moves: string[]): boolean => {
    const c = new Chess(g.startFen);
    for (const u of moves) playUci(c, u);
    if (c.isCheckmate()) {
      void finish(moves, c.turn() === 'w' ? '0-1' : '1-0', 'checkmate');
      return true;
    }
    if (c.isDraw() || c.isStalemate()) {
      const why = c.isStalemate()
        ? 'stalemate'
        : c.isInsufficientMaterial()
          ? 'insufficient material'
          : c.isThreefoldRepetition()
            ? 'threefold repetition'
            : '50-move rule';
      void finish(moves, '1/2-1/2', why);
      return true;
    }
    return false;
  };

  // Sensei's turn: think, move, then say what the move does.
  useEffect(() => {
    if (phase !== 'sensei' || g.result) return;
    let cancelled = false;
    void (async () => {
      setThinking(true);
      await loadOpeningBook();
      const started = Date.now();
      const m = await chooseBotMove(getBotEngine(), { startFen: g.startFen, moves: g.moves, bot, book: getOpeningBook() });
      const wait = thinkTime(g.elo, g.moves.length) - (Date.now() - started);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      if (cancelled || !alive.current) return;
      const moves = [...g.moves, m.uci];
      playSound(soundForSan(m.san));
      patch({ moves });
      setThinking(false);
      setHint(null);
      if (ended(moves)) return;
      setPhase('you');
      const note = await explainSenseiMove(g.startFen, moves, g.you, epYou.current);
      if (!alive.current || useSensei.getState().game?.moves.length !== moves.length) return;
      addNote(note, moves);
      const pos = await evaluate(g.startFen, moves);
      if (pos) epYou.current = expectedFor(pos.lines[0].score, g.you);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const onMove = async (from: string, to: string, promotion?: PromotionPiece) => {
    if (phase !== 'you' || !yourTurn) return;
    const c = new Chess(chess.fen());
    const m = playUci(c, from + to + (promotion ?? ''));
    if (!m) return;
    const moves = [...g.moves, moveToUci(m)];
    playSound(soundForSan(m.san));
    patch({ moves });
    setHint(null);
    if (ended(moves)) {
      addNote(await judgeYourMove(g.startFen, moves, g.you), moves);
      return;
    }
    setPhase('judging');
    const note = await judgeYourMove(g.startFen, moves, g.you);
    if (!alive.current) return;
    addNote(note, moves);
    const pos = await evaluate(g.startFen, moves);
    if (pos) epYou.current = expectedFor(pos.lines[0].score, g.you);
    setPhase(note.takeBack ? 'decide' : 'sensei');
  };

  /** Takes back your last move (and Sensei's reply to it, if he has made one). */
  const takeBack = () => {
    const n = g.moves.length;
    const lastYours = (n - 1) % 2 === (g.you === 'w' ? 0 : 1);
    const keep = lastYours ? n - 1 : n - 2;
    if (keep < 0) return;
    const moves = g.moves.slice(0, keep);
    patch({ moves, notes: g.notes.filter((x) => x.ply < keep) });
    setHint(null);
    setPhase('you');
  };

  const askHint = async () => {
    if (hint) return setHint({ ...hint, level: 2 });
    const h = await hintFor(g.startFen, g.moves);
    if (h && alive.current) setHint({ ...h, level: 1 });
  };

  const resign = () => {
    if (!confirm('Resign this game?')) return;
    void finish(g.moves, g.you === 'w' ? '0-1' : '1-0', 'resignation');
  };

  const last = g.moves.at(-1);
  const notes = g.notes;
  const latest = notes.at(-1);
  const youWon = g.result && g.result !== '1/2-1/2' && (g.result === '1-0') === (g.you === 'w');
  const newElo = useSensei((s) => s.elo);
  const orientation = g.you === 'w' ? 'white' : 'black';
  const hl = useMemo(() => (hint && hint.level >= 2 ? new Map([[hint.square, 'hl-key']]) : undefined), [hint]);

  return (
    <div className="game-layout focus-screen sensei-screen">
      <div className="board-column">
        <div className="sensei-top">
          <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back to your coach">
            <ChevronLeft size={20} />
          </button>
          <PlayerBar
            avatar={FACE}
            tint={TINT}
            name="Sensei"
            elo={g.elo}
            fen={chess.fen()}
            startFen={g.startFen}
            color={g.you === 'w' ? 'b' : 'w'}
            extra={thinking ? <span className="faint sensei-thinking"> thinking…</span> : undefined}
          />
        </div>
        <div className="board-row">
          <Board
            fen={chess.fen()}
            orientation={orientation}
            turnColor={chess.turn() === 'w' ? 'white' : 'black'}
            movableColor={phase === 'you' && yourTurn ? orientation : undefined}
            dests={phase === 'you' && yourTurn ? legalDests(chess) : undefined}
            lastMove={last ? ([last.slice(0, 2), last.slice(2, 4)] as [Key, Key]) : undefined}
            check={chess.inCheck()}
            highlights={hl}
            onMove={onMove}
            viewOnly={phase !== 'you'}
          />
        </div>
        <PlayerBar avatar={username[0]?.toUpperCase() ?? 'Y'} name={username} fen={chess.fen()} startFen={g.startFen} color={g.you} />
      </div>
      <div className="side-panel sensei-panel">
        <div className="panel-body">
          {phase === 'over' ? (
            <div className={`sensei-say ${youWon ? 'good' : g.result === '1/2-1/2' ? 'info' : 'bad'}`}>
              <span className="sensei-face small">{FACE}</span>
              <div>
                <b>{youWon ? 'You won. Well played.' : g.result === '1/2-1/2' ? 'A draw.' : 'I won this one.'}</b>{' '}
                {youWon
                  ? 'Let us see what you did well, and what I could have punished.'
                  : 'Let us look at where it turned, so it does not happen again.'}
                <p className="faint">
                  {g.termination ? `By ${g.termination}. ` : ''}
                  {newElo !== null && newElo !== g.elo ? `Next game I play at ${newElo}.` : ''}
                </p>
              </div>
            </div>
          ) : (
            <>
              {latest && (
                <div className={`sensei-say ${latest.tone}`}>
                  <span className="sensei-face small">{FACE}</span>
                  <div>
                    {latest.san && (
                      <span className="sensei-move">
                        {latest.who === 'you' ? 'You played' : 'I played'} <San san={latest.san} chip />
                      </span>
                    )}
                    <Rich text={latest.text} />
                  </div>
                </div>
              )}
              {phase === 'judging' && <p className="faint sensei-wait">Sensei is looking at your move…</p>}
              {hint && (
                <p className="coach-hint">
                  <Rich text={hint.level >= 2 ? `${hint.idea} ${hint.piece}` : hint.idea} />
                </p>
              )}
            </>
          )}
        </div>
        <div className="panel-foot sensei-foot">
          {phase === 'over' ? (
            <>
              <button className="btn" onClick={() => setGame(null)}>
                Play again
              </button>
              <span className="spacer" />
              {g.savedId && (
                <button className="btn primary" onClick={() => navigate(`/review/${g.savedId}?debrief=1`)}>
                  Review with Sensei
                </button>
              )}
            </>
          ) : phase === 'decide' ? (
            <>
              <button className="btn primary" onClick={takeBack}>
                <RotateCcw size={16} /> Take back
              </button>
              <span className="spacer" />
              <button className="btn" onClick={() => setPhase('sensei')}>
                Play on
              </button>
            </>
          ) : (
            <>
              <button className="btn" onClick={() => void askHint()} disabled={phase !== 'you' || (hint?.level ?? 0) >= 2}>
                <Lightbulb size={16} /> {hint ? 'More' : 'Hint'}
              </button>
              <button className="btn" onClick={takeBack} disabled={phase !== 'you' || g.moves.length < 2}>
                <RotateCcw size={16} /> Take back
              </button>
              <span className="spacer" />
              <button className="btn ghost" onClick={resign} disabled={phase === 'judging'}>
                <Flag size={16} /> Resign
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
