// `#/openings`: the opening explorer, from your own games. Step through the
// positions you reach, see every move played there (yours and theirs) with
// how you scored after it, and at the top the moves that cost you, with what
// Stockfish played instead.
import { useMemo, useState } from 'react';
import { Chess, type Color } from 'chess.js';
import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { ChevronLeft, ChevronsLeft } from 'lucide-react';
import { Board } from '../components/Board';
import { San } from '../components/Rich';
import { PageHead, SectionTitle } from '../components/ui';
import { Segmented } from '../components/Widgets';
import { getOpeningBook } from '../lib/chess/openings';
import { buildTree, fenKey, findLeaks, lineText, type ExplorerEdge } from '../lib/explorer';
import { navigate } from '../lib/router';
import { useStatGames } from '../state/statGames';
import { useSync } from '../state/sync';
import { WdlBar } from './Stats';
import { TypeToggle } from '../components/TypeToggle';

const pct = (x: number) => `${Math.round(x * 100)}%`;

export function ExplorerPage() {
  const all = useStatGames();
  const keep = useSync((s) => s.keep);
  const [color, setColor] = useState<Color>('w');
  const [line, setLine] = useState<string[]>([]);
  const tree = useMemo(() => (all ? buildTree(all, color, getOpeningBook()) : null), [all, color]);
  const leaks = useMemo(() => (tree ? findLeaks(tree) : []), [tree]);

  const pos = useMemo(() => {
    const c = new Chess();
    let last: { from: string; to: string } | undefined;
    for (const san of line) {
      const m = c.move(san);
      last = { from: m.from, to: m.to };
    }
    return { fen: c.fen(), last, turn: c.turn() };
  }, [line]);
  const node = tree?.nodes.get(fenKey(pos.fen));
  const parentEdge = useMemo(() => {
    if (!tree || !line.length) return undefined;
    const c = new Chess();
    line.slice(0, -1).forEach((s) => c.move(s));
    return tree.nodes.get(fenKey(c.fen()))?.moves.find((e) => e.san === line[line.length - 1]);
  }, [tree, line]);

  const shapes = useMemo<DrawShape[]>(() => {
    if (!node?.best) return [];
    return [{ orig: node.best.uci.slice(0, 2) as Key, dest: node.best.uci.slice(2, 4) as Key, brush: 'green' }];
  }, [node]);

  if (!all || !tree) return <div className="page narrow">Loading…</div>;
  const total = tree.nodes.get(tree.root)?.games ?? 0;

  const go = (san: string) => setLine((l) => [...l, san]);
  const yourTurn = pos.turn === color;

  return (
    <div className="page narrow explorer">
      <PageHead
        title="Opening explorer"
        sub={`From your ${keep ? `last ${keep}` : ''} games${keep ? '' : ', all of them'} as ${color === 'w' ? 'White' : 'Black'}: ${total}`}
        back="/stats"
      />
      <Segmented
        value={color}
        onChange={(c) => {
          setColor(c);
          setLine([]);
        }}
        options={[
          { value: 'w', label: 'As White' },
          { value: 'b', label: 'As Black' },
        ]}
      />
      <div style={{ marginTop: 10 }}>
        <TypeToggle />
      </div>

      {leaks.length > 0 && line.length === 0 && (
        <>
          <SectionTitle>Where your openings go wrong</SectionTitle>
          <div className="ex-leaks">
            {leaks.map((l) => (
              <button key={`${l.node.key}|${l.edge.san}`} className="ex-leak" onClick={() => setLine(l.node.line)}>
                <span className="ex-leak-line">{lineText([...l.node.line, l.edge.san])}</span>
                <span className="ex-leak-why">
                  {l.edge.mine ? 'Your move: ' : 'Their move: '}
                  {l.why}.{l.instead ? ` Stockfish plays ${l.instead} here instead.` : ''}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <SectionTitle>{node?.name ?? (line.length ? 'Your games from here' : 'Your first moves')}</SectionTitle>
      <div className="ex-board">
        <Board
          fen={pos.fen}
          orientation={color === 'w' ? 'white' : 'black'}
          viewOnly
          lastMove={pos.last ? [pos.last.from, pos.last.to] : undefined}
          shapes={shapes}
        />
      </div>
      <div className="ex-nav">
        <button className="btn small" onClick={() => setLine([])} disabled={!line.length} aria-label="Back to the start">
          <ChevronsLeft size={16} />
        </button>
        <button className="btn small" onClick={() => setLine((l) => l.slice(0, -1))} disabled={!line.length} aria-label="Back one move">
          <ChevronLeft size={16} />
        </button>
        <span className="ex-line">{line.length ? lineText(line) : 'Start position'}</span>
      </div>

      {node?.best && (
        <p className="faint ex-best">
          {yourTurn ? "Stockfish's move for you here" : 'Their best move here, says Stockfish'}: <San san={node.best.san} chip /> (the green arrow)
        </p>
      )}

      {node && node.moves.length > 0 ? (
        <div className="ex-moves">
          <div className="ex-head faint">{yourTurn ? 'Your moves here' : 'What your opponents play here'}</div>
          {node.moves.map((e) => (
            <MoveRow key={e.uci} e={e} best={node.best?.uci === e.uci} onClick={() => go(e.san)} />
          ))}
        </div>
      ) : (
        <p className="muted">{line.length ? 'Your games go their own ways from here.' : 'No games as this colour yet.'}</p>
      )}

      {parentEdge && parentEdge.gameIds.length > 0 && (
        <>
          <SectionTitle>Games that reached here</SectionTitle>
          <div className="ex-games">
            {parentEdge.gameIds.slice(0, 8).map((id) => {
              const x = all.find((g) => g.game.id === id);
              if (!x) return null;
              const opp = x.color === 'w' ? x.game.black : x.game.white;
              const o = x.game.result === '1/2-1/2' ? 'd' : (x.game.result === '1-0') === (x.color === 'w') ? 'w' : 'l';
              return (
                <button key={id} className="ex-game" onClick={() => navigate(`/review/${id}?ply=${line.length - 1}`)}>
                  <span className={`result-chip ${o === 'w' ? 'win' : o === 'l' ? 'loss' : 'draw'}`}>{o === 'w' ? 'W' : o === 'l' ? 'L' : '½'}</span>
                  <span>
                    vs {opp.name}
                    {opp.elo ? ` (${opp.elo})` : ''}
                  </span>
                  <span className="faint">{new Date(x.game.createdAt).toLocaleDateString()}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function MoveRow({ e, best, onClick }: { e: ExplorerEdge; best: boolean; onClick: () => void }) {
  return (
    <button className="ex-move" onClick={onClick}>
      <span className="ex-san">
        <San san={e.san} chip />
        {e.book && <span className="ex-tag">book</span>}
        {best && <span className="ex-tag best">Stockfish</span>}
      </span>
      <span className="ex-count faint">
        {e.games} game{e.games === 1 ? '' : 's'}
      </span>
      <span className="ex-score">{pct(e.score)}</span>
      <span className="ex-bar">
        <WdlBar wdl={{ w: e.w, d: e.d, l: e.l, games: e.games, score: e.score }} />
      </span>
      {e.mine && e.errors > 0 && (
        <span className="ex-warn">
          A mistake in {e.errors} of {e.reviewed} reviewed game{e.reviewed === 1 ? '' : 's'}
        </span>
      )}
    </button>
  );
}
