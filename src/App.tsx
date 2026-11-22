import { Suspense, lazy, useEffect, useRef, type ReactNode } from 'react';
import { navigate, useRoute } from './lib/router';
import { loadOpeningBook } from './lib/chess/openings';
import { pruneEvals } from './lib/review/evalCache';
import { TabBar, TopBar } from './components/Shell';
import { HomePage } from './pages/Home';
import { WelcomePage } from './pages/Welcome';
import { useBacklog, useSync, watchForGames } from './state/sync';
import { useReviewer } from './state/reviewer';
import { useSettings } from './state/settings';
import { keepScreenOn, setBackgroundWork } from './lib/platform';
import { watchMasterSheet } from './lib/sheetWatch';

// Screens other than the coach load when first opened, and in the background once the app is idle.
const ReviewPage = lazy(() => import('./pages/Review').then((m) => ({ default: m.ReviewPage })));
const AnalysisPage = lazy(() => import('./pages/Analysis').then((m) => ({ default: m.AnalysisPage })));
const PracticePage = lazy(() => import('./pages/Practice').then((m) => ({ default: m.PracticePage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const StatsPage = lazy(() => import('./pages/Stats').then((m) => ({ default: m.StatsPage })));
const GamesPage = lazy(() => import('./pages/Games').then((m) => ({ default: m.GamesPage })));
const MomentsPage = lazy(() => import('./pages/Moments').then((m) => ({ default: m.MomentsPage })));
const SenseiPage = lazy(() => import('./pages/Sensei').then((m) => ({ default: m.SenseiPage })));
const ExplorerPage = lazy(() => import('./pages/Explorer').then((m) => ({ default: m.ExplorerPage })));
const SheetPage = lazy(() => import('./pages/Sheet').then((m) => ({ default: m.SheetPage })));
const MatesPage = lazy(() => import('./pages/Mates').then((m) => ({ default: m.MatesPage })));
const LATER = [
  () => import('./pages/Review'),
  () => import('./pages/Games'),
  () => import('./pages/Moments'),
  () => import('./pages/Stats'),
  () => import('./pages/Practice'),
  () => import('./pages/Mates'),
  () => import('./pages/Sensei'),
  () => import('./pages/Analysis'),
  () => import('./pages/Settings'),
];

/** Board screens take the whole phone screen (no bars). */
const isFocus = (root?: string) => root === 'review' || root === 'analysis' || root === 'mates' || root === 'practice' || root === 'sensei';

export function App() {
  const route = useRoute();
  const main = useRef<HTMLElement>(null);
  const username = useSync((s) => s.username);
  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [route.path]);
  useEffect(() => {
    const idle = (globalThis as { requestIdleCallback?: (f: () => void) => void }).requestIdleCallback ?? ((f: () => void) => setTimeout(f, 1500));
    idle(() => LATER.forEach((load) => void load().catch(() => undefined)));
    void loadOpeningBook();
    watchForGames();
    watchMasterSheet();
    // Ask the browser to keep this app's storage (reviews, games) even when space runs low.
    void navigator.storage?.persist?.().catch(() => undefined);
    setTimeout(() => void pruneEvals(), 5000);
  }, []);

  // The screen stays on while a review runs (if you want), so it doesn't stop when the phone sleeps.
  const reviewing = useReviewer((s) => Object.values(s.jobs).some((j) => j.status === 'running'));
  const keepAwake = useSettings((s) => s.keepAwake);
  useEffect(() => {
    keepScreenOn(reviewing && keepAwake);
  }, [reviewing, keepAwake]);
  // With the screen off, a background service (Android) keeps the reviews going, its notification
  // showing how far along it is. It stays on between games, and stops a little after the last one.
  const backlog = useBacklog((s) => s.active);
  const lockedReviews = useSettings((s) => s.lockedReviews);
  const progress = useReviewer((s) => {
    const j = Object.values(s.jobs).find((x) => x.status === 'running');
    return j ? Math.floor((10 * j.done) / Math.max(1, j.total)) * 10 : null;
  });
  const busy = (backlog || reviewing) && lockedReviews;
  useEffect(() => {
    if (busy) {
      setBackgroundWork(true, progress !== null ? `Reviewing a game: ${progress}% done` : 'Working through your games');
      return;
    }
    const t = setTimeout(() => setBackgroundWork(false), 4000);
    return () => clearTimeout(t);
  }, [busy, progress]);

  let page: ReactNode;
  const [root, id] = route.parts;
  if (!username && root !== 'settings') page = <WelcomePage />;
  else
    switch (root) {
      case undefined:
        page = <HomePage />;
        break;
      case 'review':
        page = (
          <ReviewPage
            key={id}
            gameId={id}
            debrief={route.query.get('debrief') === '1'}
            initialPly={route.query.has('ply') ? +route.query.get('ply')! : undefined}
            showMe={route.query.get('show') === '1'}
          />
        );
        break;
      case 'analysis':
        page = <AnalysisPage key={route.query.get('game') ?? route.query.get('fen') ?? 'board'} query={route.query} />;
        break;
      case 'games':
        page = <GamesPage />;
        break;
      case 'moments':
        page = <MomentsPage />;
        break;
      case 'stats':
      case 'progress':
        page = <StatsPage />;
        break;
      case 'sensei':
        page = <SenseiPage />;
        break;
      case 'openings':
        page = <ExplorerPage />;
        break;
      case 'sheet':
        page = <SheetPage />;
        break;
      case 'mates':
        page = <MatesPage />;
        break;
      case 'practice':
        page = <PracticePage />;
        break;
      case 'settings':
        page = <SettingsPage />;
        break;
      default:
        page = (
          <div className="page empty">
            <h2>Page not found</h2>
            <button className="btn primary" onClick={() => navigate('/')}>
              Back to your coach
            </button>
          </div>
        );
    }

  const focus = isFocus(root) || !username;
  return (
    <div className={`app ${isFocus(root) ? 'focus' : ''} nc-app`}>
      <main className="main" ref={main}>
        {!isFocus(root) && username && <TopBar />}
        <Suspense fallback={<div className="page-loading" aria-label="Loading" />}>{page}</Suspense>
      </main>
      {!focus && <TabBar path={route.path} />}
    </div>
  );
}
