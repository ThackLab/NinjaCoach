// Two small dropdowns, side by side: which kind of games (All, Rapid, Blitz...)
// and how many (last 20, 50, 100, 200, all time). Shared by the coach screen,
// Stats and the opening explorer, which all follow the same choice.
import { TYPE_LABEL, WINDOWS, useGameTypes, useSync, type GameType, type GameWindow } from '../state/sync';

export function Pill<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <label className="nc-pill">
      <span className="sr-only">{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const o = options.find((x) => String(x.value) === e.target.value);
          if (o) onChange(o.value);
        }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function GamePickers() {
  const types = useGameTypes();
  const { gameType, setGameType, keep, setKeep } = useSync();
  const options: GameType[] = ['all', ...types.filter((t) => t !== 'all')];
  if (!options.includes(gameType)) options.push(gameType);
  return (
    <>
      <Pill<GameType>
        label="Game type"
        value={gameType}
        onChange={setGameType}
        options={options.map((t) => ({ value: t, label: t === 'all' ? 'All games' : TYPE_LABEL[t] }))}
      />
      <Pill<GameWindow>
        label="How many"
        value={keep}
        onChange={setKeep}
        options={WINDOWS.map((n) => ({ value: n, label: n ? `Last ${n}` : 'All time' }))}
      />
    </>
  );
}

/** "rapid " or "" (for headings like "Your last 20 rapid games"). */
export const typeWord = (t: GameType) => (t === 'all' ? '' : `${TYPE_LABEL[t].toLowerCase()} `);
