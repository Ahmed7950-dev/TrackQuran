import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { I18nProvider } from './context/I18nProvider';
import { AuthProvider } from './context/AuthProvider';
import SharedReportPage from './components/SharedReportPage';

// ── Route detection — done once before any React rendering ──────────────────
// Checking pathname here (outside any component) avoids React Rules-of-Hooks
// violations that occur when early-returning before hook calls inside App.
const pathname = window.location.pathname;

const sharedReportId = (() => {
  const m = pathname.match(/^\/report\/([a-f0-9-]{36})$/i);
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
