import { Navigate, Route, Routes } from 'react-router-dom';

import { CalendarPage } from './pages/Calendar';
import { EditPage } from './pages/Edit';
import { LogPage } from './pages/Log';
import { SignInPage } from './pages/SignIn';
import { TodayPage } from './pages/Today';
import { useAuth } from './shared/auth';

export default function App() {
  const { user, ready } = useAuth();
  if (!ready) return <p className="hint">Loading…</p>;
  if (!user) return <SignInPage />;
  return (
    <Routes>
      <Route path="/" element={<TodayPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/edit" element={<EditPage />} />
      <Route path="/log" element={<LogPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
