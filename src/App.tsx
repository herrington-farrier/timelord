import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

import { ChunkBoundary, clearChunkReloadFlag } from './components/ChunkBoundary';

import { SignInPage } from './pages/SignIn';
import { TodayPage } from './pages/Today';
import { useAuth } from './shared/auth';

// Today is the landing screen and stays in the first chunk. The rest load on
// navigation, which keeps @dnd-kit (Edit only) out of the initial download.
const CalendarPage = lazy(() => import('./pages/Calendar').then((m) => ({ default: m.CalendarPage })));
const EditPage = lazy(() => import('./pages/Edit').then((m) => ({ default: m.EditPage })));
const GuidePage = lazy(() => import('./pages/Guide').then((m) => ({ default: m.GuidePage })));
const LogPage = lazy(() => import('./pages/Log').then((m) => ({ default: m.LogPage })));

/** The icon, greyed and huge, sitting behind every screen. */
function BackdropSeal() {
  return (
    <div className="bg-seal" aria-hidden="true">
      <img src="/icon-192.png" alt="" width={192} height={192} decoding="async" />
    </div>
  );
}

export default function App() {
  const { user, ready } = useAuth();
  // Reaching here means the app loaded, so a later stale chunk is allowed its
  // own one reload rather than inheriting this session's spent attempt.
  useEffect(() => clearChunkReloadFlag(), []);
  return (
    <>
      <BackdropSeal />
      {!ready ? (
        <p className="hint">Loading…</p>
      ) : !user ? (
        <SignInPage />
      ) : (
        <ChunkBoundary>
          <Suspense fallback={<p className="hint">Loading…</p>}>
          <Routes>
            <Route path="/" element={<TodayPage />} />
            <Route path="/calendar" element={<CalendarPage />} />
            <Route path="/edit" element={<EditPage />} />
            <Route path="/guide" element={<GuidePage />} />
            <Route path="/log" element={<LogPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </Suspense>
        </ChunkBoundary>
      )}
    </>
  );
}
