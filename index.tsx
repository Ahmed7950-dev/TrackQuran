import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './context/I18nProvider';
import { AuthProvider } from './context/AuthProvider';
import SharedReportPage from './components/SharedReportPage';
import { initInstallCapture } from './services/installService';
import { watchForNewBuild } from './services/versionWatch';
import WordFlightJoinPage from './components/WordFlightJoinPage';

// ── Route detection — done once before any React rendering ──────────────────
// Checking pathname here (outside any component) avoids React Rules-of-Hooks
// violations that occur when early-returning before hook calls inside App.
const pathname = window.location.pathname;

const sharedReportId = (() => {
  const m = pathname.match(/^\/report\/([a-f0-9-]{36})$/i);
  return m ? m[1] : null;
})();

const wordFlightRoomId = (() => {
  const m = pathname.match(/^\/word-flight\/(.+)$/);
  return m ? m[1] : null;
})();

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '20px', color: 'red', fontFamily: 'monospace' }}>
          <h1>Error Loading App</h1>
          <pre>{this.state.error?.message}</pre>
          <pre>{this.state.error?.stack}</pre>
          <button onClick={() => window.location.reload()}>Reload Page</button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Push notifications live in a service worker; registering it on load keeps an
// existing subscription alive. It caches nothing (see public/sw.js).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => { /* not fatal */ });
  });
  // Tapping a push should land on the page it is about. The worker asks us to
  // go there, because an installed iOS app will not let it navigate us itself.
  // addEventListener alone leaves the messages queued — only assigning
  // `onmessage` starts delivery implicitly, so start it by hand.
  navigator.serviceWorker.addEventListener('message', event => {
    const data = event.data;
    if (!data || data.type !== 'navigate' || typeof data.url !== 'string') return;
    // Our pushes carry absolute links to the canonical host, which is not
    // always the host the app was installed from (www vs the bare domain).
    // Comparing origins therefore threw the good ones away; take the PATH and
    // stay on this origin, which is both what we mean and safe.
    let path: string;
    try {
      const u = new URL(data.url, window.location.origin);
      path = u.pathname + u.search + u.hash;
    } catch { return; }
    if (!path.startsWith('/')) return;
    if (path === window.location.pathname + window.location.search + window.location.hash) return;
    window.location.assign(path);
  });
  navigator.serviceWorker.startMessages?.();
}

// The install prompt fires once, early — catch it before React mounts.
initInstallCapture();

// An installed app can sit on one build for days; pick up new ones by itself.
watchForNewBuild();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);

// Shared report pages are public — App is bypassed entirely to avoid any
// hooks-before-return issues. AuthProvider IS included so that sub-components
// like TajweedPage that call useAuth() receive a valid context; authenticated
// tutors opening the link in their own browser will have their session
// available (needed for RLS-gated reads like tajweed_lessons).
if (sharedReportId) {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <I18nProvider>
          <AuthProvider>
            <SharedReportPage reportId={sharedReportId} />
          </AuthProvider>
        </I18nProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
} else if (wordFlightRoomId) {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <I18nProvider>
          <WordFlightJoinPage roomId={wordFlightRoomId} />
        </I18nProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
} else {
  root.render(
    <React.StrictMode>
      <ErrorBoundary>
        <I18nProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </I18nProvider>
      </ErrorBoundary>
    </React.StrictMode>
  );
}
