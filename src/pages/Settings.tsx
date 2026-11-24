import { useEffect, useState } from 'react';
import { Toggle, toast } from '../components/Widgets';
import { importAll, wipeAll, type Backup } from '../lib/storage/db';
import { backupNow } from '../lib/backup';
import { useSettings } from '../state/settings';
import { PageHead } from '../components/ui';
import { useSync } from '../state/sync';
import { askBatteryExempt, canKeepFiles, canVibrate, canWorkLocked, isBatteryExempt } from '../lib/platform';
import { navigate } from '../lib/router';

function Row({ title, desc, children }: { title: string; desc?: string; children: React.ReactNode }) {
  return (
    <div className="setting">
      <div>
        <div style={{ fontWeight: 600 }}>{title}</div>
        {desc && <div className="desc">{desc}</div>}
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const s = useSettings();
  const sync = useSync();
  const [name, setName] = useState(sync.username);
  const [exempt, setExempt] = useState(isBatteryExempt);
  useEffect(() => {
    const look = () => document.visibilityState === 'visible' && setExempt(isBatteryExempt());
    document.addEventListener('visibilitychange', look);
    return () => document.removeEventListener('visibilitychange', look);
  }, []);

  const download = async () => {
    try {
      const where = await backupNow();
      if (where && where !== 'shared') toast(where === 'downloaded' ? 'Backup downloaded' : `Backup saved to ${where}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Could not save the backup');
    }
  };

  const restore = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as Backup;
      await importAll(data);
      toast(`Restored ${data.games.length} games`);
      setTimeout(() => location.reload(), 800);
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Invalid backup');
    }
  };

  return (
    <div className="page">
      <PageHead title="Settings" back="/" />
      <div className="settings-grid">
        <section className="card">
          <h2>chess.com</h2>
          <Row title="Your username" desc="The chess.com player whose games your coach reviews.">
            <form
              className="row"
              onSubmit={(e) => {
                e.preventDefault();
                if (!name.trim() || name.trim() === sync.username) return;
                sync.setUsername(name);
                void useSync.getState().sync(true);
                toast('Fetching games for ' + name.trim());
              }}
            >
              <input className="input" value={name} onChange={(e) => setName(e.target.value)} autoCapitalize="off" style={{ width: 160 }} />
              <button className="btn small" disabled={!name.trim() || name.trim() === sync.username}>
                Change
              </button>
            </form>
          </Row>
          <Row title="Check for new games" desc={sync.lastSync ? `Last checked ${new Date(sync.lastSync).toLocaleString()}.` : 'Not checked yet.'}>
            <button className="btn small" onClick={() => void sync.sync(true)} disabled={sync.syncing}>
              {sync.syncing ? 'Checking…' : 'Check now'}
            </button>
          </Row>
        </section>

        <section className="card">
          <h2>Reviews</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Every game gets a quick review on its own: each move checked fast, then the key moments (brilliant, great, mistakes, misses, blunders)
            checked again more deeply. For a full deep analysis of a game, open it and tap Run a deep analysis on its Summary tab.
          </p>
          {canWorkLocked && (
            <Row title="Keep reviewing with the phone locked" desc="With a notification while it works. Off: reviews pause until you open the app.">
              <Toggle checked={s.lockedReviews} onChange={(lockedReviews) => s.set({ lockedReviews })} />
            </Row>
          )}
          {canWorkLocked && s.lockedReviews && (
            <Row
              title="Let it run in the background"
              desc={
                exempt
                  ? 'Allowed. On a Samsung, also set Settings → Apps → Ninja Coach → Battery → Unrestricted.'
                  : 'So Android doesn’t pause it once the phone has been locked a while. On a Samsung, also set Battery to Unrestricted for the app.'
              }
            >
              {exempt ? (
                <span className="faint">Allowed</span>
              ) : (
                <button
                  className="btn small"
                  onClick={() => {
                    askBatteryExempt();
                    setTimeout(() => setExempt(isBatteryExempt()), 4000);
                  }}
                >
                  Allow
                </button>
              )}
            </Row>
          )}
          <Row title="Keep the screen on while reviewing">
            <Toggle checked={s.keepAwake} onChange={(keepAwake) => s.set({ keepAwake })} />
          </Row>
        </section>

        <section className="card">
          <h2>Board and sound</h2>
          <Row title="Coordinates">
            <Toggle checked={s.coordinates} onChange={(coordinates) => s.set({ coordinates })} />
          </Row>
          <Row title="Sound effects">
            <Toggle checked={s.sound} onChange={(sound) => s.set({ sound })} />
          </Row>
          {canVibrate && (
            <Row title="Vibration">
              <Toggle checked={s.haptics} onChange={(haptics) => s.set({ haptics })} />
            </Row>
          )}
        </section>

        <section className="card">
          <h2>Master sheet</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Every analysed game stays analysed, each with its own fingerprint (SHA-256 of the game), listed in the master sheet.
            {canKeepFiles && ' The Android app keeps it up to date as a spreadsheet in Downloads/Ninja Coach.'}
          </p>
          {canKeepFiles && (
            <Row
              title="Keep the spreadsheet on this phone"
              desc={
                s.sheetSavedAt
                  ? `Last updated ${new Date(s.sheetSavedAt).toLocaleString()} (${s.sheetGames} games).`
                  : 'Written after the next game is analysed.'
              }
            >
              <Toggle checked={s.masterSheet} onChange={(masterSheet) => s.set({ masterSheet })} />
            </Row>
          )}
          <button className="btn" onClick={() => navigate('/sheet')}>
            Open the master sheet
          </button>
        </section>

        <section className="card">
          <h2>Your data</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Your games, their reviews and your practice positions are stored only on this device. Save a backup to Files, iCloud Drive or Google Drive
            to keep them safe or move them to another phone.
            {s.lastBackupAt > 0 && <> Last backup: {new Date(s.lastBackupAt).toLocaleDateString()}.</>}
          </p>
          <div className="row">
            <button className="btn primary" onClick={download}>
              Back up now
            </button>
            <label className="btn">
              Restore backup
              <input
                type="file"
                accept="application/json,.json"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])}
              />
            </label>
            <button
              className="btn danger"
              onClick={async () => {
                if (!confirm('Delete ALL games, reviews and practice positions? This cannot be undone.')) return;
                await wipeAll();
                toast('All data deleted');
              }}
            >
              Delete everything
            </button>
          </div>
        </section>

        <section className="card">
          <h2>On another phone or computer</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Ninja Coach also runs in any browser, iPhones included, at{' '}
            <a href="https://thacklab.github.io/NinjaCoach/" target="_blank" rel="noreferrer">
              thacklab.github.io/NinjaCoach
            </a>
            . On an iPhone, open it in Safari, tap Share, then Add to Home Screen. Each phone keeps its own games; move yours across with Back up and
            Restore above.
          </p>
        </section>

        <section className="card">
          <h2>About</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Ninja Coach uses{' '}
            <a href="https://stockfishchess.org" target="_blank" rel="noreferrer">
              Stockfish 18
            </a>{' '}
            (GPLv3) compiled to WebAssembly by{' '}
            <a href="https://github.com/nmrugg/stockfish.js" target="_blank" rel="noreferrer">
              stockfish.js
            </a>
            , the{' '}
            <a href="https://github.com/lichess-org/chessground" target="_blank" rel="noreferrer">
              chessground
            </a>{' '}
            board (GPLv3),{' '}
            <a href="https://github.com/jhlywa/chess.js" target="_blank" rel="noreferrer">
              chess.js
            </a>{' '}
            and the lichess{' '}
            <a href="https://github.com/lichess-org/chess-openings" target="_blank" rel="noreferrer">
              opening names
            </a>{' '}
            dataset (CC0). Accuracy uses the published lichess formula; move classes follow chess.com’s expected-points thresholds.
          </p>
        </section>
      </div>
    </div>
  );
}
