// Ninja Coach's frame: a slim top bar (name, sync status, settings) and tabs
// along the bottom. Board screens (reviews, analysis) take the whole screen.
import { BarChart3, ListChecks, RefreshCw, Settings, Sparkles, Target } from 'lucide-react';
import { navigate } from '../lib/router';
import { useSync } from '../state/sync';
import { useReviewer } from '../state/reviewer';

export function TopBar() {
  const syncing = useSync((s) => s.syncing);
  const reviewing = useReviewer((s) => Object.values(s.jobs).some((j) => j.status === 'running'));
  return (
    <header className="appbar nc-bar">
      <a className="appbar-brand" href="#/">
        <img src="./icon-192.png" alt="" width={28} height={28} className="nc-logo" /> Ninja Coach
      </a>
      <span className="spacer" />
      {(syncing || reviewing) && (
        <span className="nc-busy" title={syncing ? 'Fetching games from chess.com' : 'Reviewing your games'}>
          <RefreshCw size={16} className="spin" /> {syncing ? 'Fetching' : 'Reviewing'}
        </span>
      )}
      <button className="icon-btn" onClick={() => navigate('/settings')} aria-label="Settings">
        <Settings size={22} />
      </button>
    </header>
  );
}

const TABS = [
  { path: '/', label: 'Coach', icon: <Sparkles size={22} /> },
  { path: '/games', label: 'Games', icon: <ListChecks size={22} /> },
  { path: '/moments', label: 'Moments', icon: <Target size={22} /> },
  { path: '/stats', label: 'Stats', icon: <BarChart3 size={22} /> },
];

export function TabBar({ path }: { path: string }) {
  return (
    <nav className="nc-tabs" aria-label="Sections">
      {TABS.map((t) => {
        const on = t.path === '/' ? path === '/' : path.startsWith(t.path);
        return (
          <button key={t.path} className={on ? 'on' : ''} onClick={() => navigate(t.path)} aria-current={on ? 'page' : undefined}>
            {t.icon}
            <span>{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
