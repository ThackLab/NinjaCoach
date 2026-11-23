// The game-type toggle (All, Rapid, Blitz, Bullet, Daily: the kinds you play),
// shared by the coach screen, Stats and the opening explorer.
import { Segmented } from './Widgets';
import { TYPE_LABEL, useGameTypes, useSync, type GameType } from '../state/sync';

export function TypeToggle({ label = 'Game type' }: { label?: string }) {
  const types = useGameTypes();
  const type = useSync((s) => s.gameType);
  const set = useSync((s) => s.setGameType);
  if (types.length < 2 && type === 'all') return null;
  const options: GameType[] = ['all', ...types.filter((t) => t !== 'all')];
  if (type !== 'all' && !options.includes(type)) options.push(type);
  return (
    <div className="nc-window">
      <span className="faint">{label}</span>
      <Segmented<GameType> value={type} onChange={set} options={options.map((t) => ({ value: t, label: TYPE_LABEL[t] }))} />
    </div>
  );
}

/** "rapid " or "" (for headings like "Your last 20 rapid games"). */
export const typeWord = (t: GameType) => (t === 'all' ? '' : `${TYPE_LABEL[t].toLowerCase()} `);
