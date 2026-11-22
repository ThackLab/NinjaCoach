// Keeps the master sheet on the phone up to date: a few seconds after any
// game is analysed (or removed), the sheet in Downloads/Ninja Coach is
// written again. Only in the Android app, which can replace the file in place.
import { onDbChange, fillHashes } from './storage/db';
import { canKeepFiles } from './platform';
import { sheetRows, toCsv, SHEET_NAME } from './masterSheet';
import { keepFileUpdated } from './platform';
import { useSettings } from '../state/settings';

let timer: ReturnType<typeof setTimeout> | undefined;
let lastCount = -1;

async function write(force = false) {
  if (!canKeepFiles || !useSettings.getState().masterSheet) return;
  const rows = await sheetRows();
  if (!force && rows.length === lastCount) return;
  lastCount = rows.length;
  const where = keepFileUpdated(SHEET_NAME, 'text/csv', toCsv(rows));
  if (where) useSettings.getState().set({ sheetWhere: where, sheetSavedAt: Date.now(), sheetGames: rows.length });
}

export function watchMasterSheet() {
  // Fingerprints for games analysed before they existed, then the first write.
  void fillHashes().then(() => write(true));
  onDbChange(() => {
    clearTimeout(timer);
    timer = setTimeout(() => void write(), 5000);
  });
}

/** Writes the sheet now (from the Master sheet screen). */
export const writeMasterSheetNow = () => write(true);
