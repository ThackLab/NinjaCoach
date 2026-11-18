// The point of a review comment, short enough for a list.
/**
 * The point of a move comment without the whole variation: "Your opponent wins
 * the queen for a pawn after 2... Nxh5 3. d4 g5" becomes "...after 2... Nxh5."
 */
export function gist(comment: string): string {
  const first = comment.split(/(?<=[a-z)#+])\.\s+(?=[A-Z])/)[0].trim();
  const numbers = [...first.matchAll(/\b\d+\.(?:\.\.)?\s/g)];
  const cut = numbers.length >= 2 ? first.slice(0, numbers[1].index).trim() : first;
  return cut.replace(/[,;:]$/, '').replace(/\.*$/, '') + '.';
}
