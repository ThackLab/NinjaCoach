// `#/sheet`: the master sheet. Every game the coach has analysed, with its
// fingerprint (SHA-256 of the game), kept for good. In the Android app the
// same list is kept as a spreadsheet in Downloads/Ninja Coach.
import { useEffect, useState } from 'react';
import { PageHead } from '../components/ui';
import { toast } from '../components/Widgets';
import { shortHash } from '../lib/gameHash';
import { outcomeOf, saveSheetCopy, sheetRows, SHEET_NAME, type SheetRow } from '../lib/masterSheet';
import { canKeepFiles, copyText } from '../lib/platform';
import { navigate } from '../lib/router';
import { onDbChange } from '../lib/storage/db';
import { writeMasterSheetNow } from '../lib/sheetWatch';
import { useSettings } from '../state/settings';

export function SheetPage() {
  const [rows, setRows] = useState<SheetRow[] | null>(null);
  const { sheetWhere, sheetSavedAt, masterSheet } = useSettings();
  useEffect(() => {
    const load = () => void sheetRows().then(setRows);
    load();
    return onDbChange(load);
  }, []);

  const copy = async (hash: string) => {
    try {
      await copyText(hash);
      toast('Fingerprint copied');
    } catch {
      toast(hash);
    }
  };

  return (
    <div className="page narrow sheet">
      <PageHead
        title="Master sheet"
        sub={rows ? `${rows.length} analysed game${rows.length === 1 ? '' : 's'}, kept for good` : undefined}
        back="/games"
      />
      <section className="card-box sheet-info">
        <p>
          Every game the coach has analysed stays analysed. Each has a <b>fingerprint</b>: the SHA-256 of where it was played, the players, the result
          and every move. The same game always gives the same fingerprint; change a single move and it's a different one.
        </p>
        {canKeepFiles ? (
          <p className="faint">
            {masterSheet
              ? sheetWhere
                ? `Kept up to date on this phone as a spreadsheet: ${sheetWhere} (updated ${new Date(sheetSavedAt).toLocaleString()}).`
                : `Kept up to date on this phone in Downloads/Ninja Coach/${SHEET_NAME}.`
              : 'Keeping the spreadsheet on your phone is switched off in Settings.'}
          </p>
        ) : (
          <p className="faint">Save a copy as a spreadsheet (opens in Excel, Google Sheets or Numbers).</p>
        )}
        <div className="row">
          {canKeepFiles && masterSheet && (
            <button
              className="btn"
              onClick={async () => {
                await writeMasterSheetNow();
                toast('Master sheet updated');
              }}
            >
              Update now
            </button>
          )}
          <button
            className="btn primary"
            onClick={async () => {
              try {
                const where = await saveSheetCopy();
                if (where && where !== 'shared') toast(where === 'downloaded' ? 'Saved to your downloads' : `Saved to ${where}`);
              } catch (e) {
                toast(e instanceof Error ? e.message : 'Could not save the sheet');
              }
            }}
          >
            Save a copy
          </button>
        </div>
      </section>

      {rows === null ? (
        <p className="muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="muted">Analysed games will appear here as the coach reviews them.</p>
      ) : (
        <div className="sheet-rows">
          {rows.map(({ game: g, hash, summary }) => {
            const opp = g.userColor === 'b' ? g.white : g.black;
            const o = outcomeOf(g);
            const acc = g.accuracy && g.userColor ? g.accuracy[g.userColor] : undefined;
            return (
              <div key={g.id} className="sheet-row">
                <button
                  className={`result-chip ${o === 'Win' ? 'win' : o === 'Loss' ? 'loss' : 'draw'}`}
                  onClick={() => navigate(`/review/${g.id}`)}
                  aria-label="Open the review"
                >
                  {o === 'Win' ? 'W' : o === 'Loss' ? 'L' : '½'}
                </button>
                <button className="sheet-main" onClick={() => navigate(`/review/${g.id}`)}>
                  <span className="sheet-title">
                    vs {opp.name}
                    {opp.elo ? ` (${opp.elo})` : ''}
                  </span>
                  <span className="faint">
                    {new Date(g.createdAt).toLocaleDateString()} · {g.source === 'bot' ? 'Sensei' : (g.timeControl ?? '')}
                    {acc !== undefined ? ` · ${acc.toFixed(1)}% accuracy` : ''}
                    {summary?.counts.blunder ? ` · ${summary.counts.blunder} blunder${summary.counts.blunder === 1 ? '' : 's'}` : ''}
                  </span>
                </button>
                <button className="sheet-hash" onClick={() => void copy(hash)} title={hash} aria-label={`Fingerprint ${hash}, tap to copy`}>
                  #{shortHash(hash)}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
