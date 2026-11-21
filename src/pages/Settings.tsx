import { useState } from 'react';
import { Segmented, Toggle, toast } from '../components/Widgets';
import { canUseThreads, hardwareThreads } from '../lib/engine/manager';
import { importAll, wipeAll, type Backup } from '../lib/storage/db';
import { backupNow } from '../lib/backup';
import { useSettings } from '../state/settings';
import { PageHead } from '../components/ui';
import { useSync } from '../state/sync';
import { canVibrate } from '../lib/platform';

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
  const threads = canUseThreads();

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
          <Row
            title="Your username"
            desc={`Your coach keeps this player's ${sync.keep ? `last ${sync.keep}` : 'every'} games on chess.com. Change how many on the Stats screen.`}
          >
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
          <h2>Board</h2>
          <Row title="Coordinates">
            <Toggle checked={s.coordinates} onChange={(coordinates) => s.set({ coordinates })} />
          </Row>
          <Row title="Show legal moves">
            <Toggle checked={s.showLegalMoves} onChange={(showLegalMoves) => s.set({ showLegalMoves })} />
          </Row>
          <Row title="Animations">
            <Toggle checked={s.animation} onChange={(animation) => s.set({ animation })} />
          </Row>
          <Row title="Always promote to queen">
            <Toggle checked={s.autoQueen} onChange={(autoQueen) => s.set({ autoQueen })} />
          </Row>
          <Row title="Sound effects">
            <Toggle checked={s.sound} onChange={(sound) => s.set({ sound })} />
          </Row>
          <Row
            title="Keep the screen on while reviewing"
            desc="So the review doesn't stop when the phone goes to sleep. It sleeps as usual once the reviews are done."
          >
            <Toggle checked={s.keepAwake} onChange={(keepAwake) => s.set({ keepAwake })} />
          </Row>
          {canVibrate && (
            <Row title="Vibration" desc="A light tap for every move, a buzz for a mistake">
              <Toggle checked={s.haptics} onChange={(haptics) => s.set({ haptics })} />
            </Row>
          )}
        </section>

        <section className="card">
          <h2>Game review</h2>
          <Row title="Review depth" desc="For your 3 newest games. The rest are reviewed at Fast so all 20 get done sooner.">
            <Segmented
              value={s.reviewDepth}
              onChange={(reviewDepth) => s.set({ reviewDepth })}
              options={[
                { value: 12, label: 'Fast' },
                { value: 16, label: 'Standard' },
                { value: 20, label: 'Deep' },
              ]}
            />
          </Row>
          <h2 style={{ marginTop: 18 }}>Analysis engine</h2>
          <Row
            title="Threads"
            desc={
              threads
                ? `Multi-threaded engine available (${hardwareThreads()} cores)`
                : 'This host does not allow multi-threading; the single-threaded engine is used'
            }
          >
            <input
              type="number"
              min={1}
              max={hardwareThreads()}
              value={s.engineThreads}
              disabled={!threads}
              onChange={(e) => s.set({ engineThreads: Math.max(1, Math.min(hardwareThreads(), +e.target.value || 1)) })}
              style={{ width: 70 }}
            />
          </Row>
          <Row title="Hash (MB)">
            <Segmented
              value={s.engineHash}
              onChange={(engineHash) => s.set({ engineHash })}
              options={[32, 64, 128, 256].map((v) => ({ value: v, label: v }))}
            />
          </Row>
          <Row title="Best-move arrows on the analysis board">
            <Toggle checked={s.showArrows} onChange={(showArrows) => s.set({ showArrows })} />
          </Row>
        </section>

        <section className="card">
          <h2>AI coach (optional)</h2>
          <p className="muted" style={{ fontSize: '0.88rem' }}>
            Ask follow-up questions about your reviewed games in plain English. Answers come from Claude, grounded in the Stockfish review. You need
            your own key from{' '}
            <a href="https://console.anthropic.com/" target="_blank" rel="noreferrer">
              console.anthropic.com
            </a>
            ; usage is billed to your Anthropic account (typically a few cents per question). The key is stored only in this browser and sent only to
            the Anthropic API.
          </p>
          <Row title="Anthropic API key">
            <input
              type="password"
              autoComplete="off"
              placeholder="sk-ant-…"
              value={s.aiCoachKey}
              onChange={(e) => s.set({ aiCoachKey: e.target.value.trim() })}
              style={{ width: 220 }}
            />
          </Row>
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
