import { Suspense, lazy, useEffect, useRef, type ReactNode } from 'react';
import { navigate, useRoute } from './lib/router';
import { loadOpeningBook } from './lib/chess/openings';
import { pruneEvals } from './lib/review/evalCache';
import { TabBar, TopBar } from './components/Shell';
import { HomePage } from './pages/Home';
import { WelcomePage } from './pages/Welcome';
import { useSync, watchForGames } from './state/sync';

// Screens other than the coach load when first opened, and in the background once the app is idle.
const ReviewPage = lazy(() => import('./pages/Review').then((m) => ({ default: m.ReviewPage })));
const AnalysisPage = lazy(() => import('./pages/Analysis').then((m) => ({ default: m.AnalysisPage })));
const PracticePage = lazy(() => import('./pages/Practice').then((m) => ({ default: m.PracticePage })));
const SettingsPage = lazy(() => import('./pages/Settings').then((m) => ({ default: m.SettingsPage })));
const InsightsPage = lazy(() => import('./pages/Insights').then((m) => ({ default: m.InsightsPage })));
const GamesPage = lazy(() => import('./pages/Games').then((m) => ({ default: m.GamesPage })));
const MomentsPage = lazy(() => import('./pages/Moments').then((m) => ({ default: m.MomentsPage })));
const LATER = [
  () => import('./pages/Review'),
  () => import('./pages/Games'),
  () => import('./pages/Moments'),
  () => import('./pages/Insights'),
  () => import('./pages/Practice'),
  () => import('./pages/Analysis'),
  () => import('./pages/Settings'),
];

/** Board screens take the whole phone screen (no bars). */
const isFocus = (root?: string) => root === 'review' || root === 'analysis';

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
    setTimeout(() => void pruneEvals(), 5000);
  }, []);

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
      case 'progress':
        page = <InsightsPage />;
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
