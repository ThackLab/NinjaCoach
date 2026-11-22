// Each game's fingerprint: the SHA-256 of what makes it that game (where it
// was played, who played it, the result and every move). The same game
// always gets the same number; change one move and it's a different number.
import { sha256 } from './sha256';
import type { GameRecord } from './storage/db';

export function gameHash(g: Pick<GameRecord, 'id' | 'source' | 'url' | 'white' | 'black' | 'result' | 'startFen' | 'moves'>): string {
  return sha256(
    [
      'ninjacoach-game-v1',
      g.source === 'bot' ? `sensei:${g.id}` : (g.url ?? g.id),
      g.white.name,
      g.black.name,
      g.result,
      g.startFen,
      g.moves.join(' '),
    ].join('\n'),
  );
}

/** The first 12 characters, for showing: plenty to tell games apart. */
export const shortHash = (h: string) => h.slice(0, 12);
