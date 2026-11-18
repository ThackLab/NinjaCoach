// First launch: the chess.com username, and what happens next.
import { useState } from 'react';
import { useSync } from '../state/sync';

export function WelcomePage() {
  const [name, setName] = useState('');
  const start = () => {
    if (!name.trim()) return;
    useSync.getState().setUsername(name);
    void useSync.getState().sync(true);
  };
  return (
    <div className="page narrow nc-welcome">
      <img src="./icon-512.png" alt="" className="nc-hero-logo" width={120} height={120} />
      <h1>Ninja Coach</h1>
      <p className="nc-lead">
        Your chess coach. It reads your last 20 games on chess.com, reviews each one with Stockfish, gives you the stats, and teaches you from them.
      </p>
      <ul className="nc-points">
        <li>
          <b>Every move rated</b>: brilliant, great, best, mistakes, misses and blunders, like a full game review.
        </li>
        <li>
          <b>Debriefs</b>: your key moments, shown move by move, then you play the better line yourself.
        </li>
        <li>
          <b>Your habits</b>: the mistakes that keep costing you, and whether they're getting rarer.
        </li>
      </ul>
      <form
        className="nc-start"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <input
          className="input"
          placeholder="Your chess.com username"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button className="btn primary big block" disabled={!name.trim()}>
          Get my games
        </button>
      </form>
      <p className="faint nc-fine">Everything stays on your phone. The engine runs on your phone too; nothing is uploaded.</p>
    </div>
  );
}
