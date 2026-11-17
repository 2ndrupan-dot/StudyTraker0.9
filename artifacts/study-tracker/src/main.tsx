import { createRoot } from "react-dom/client";
import React from "react";
import App from "./App";
import "./index.css";

// ─── Dev-only: suppress Firestore HMR assertion errors ───────────────────────
// During Vite HMR, context modules (AuthContext, StudyContext, …) get
// re-executed while old Firestore listeners are still alive, triggering
// "INTERNAL ASSERTION FAILED: Unexpected state (ID: da08)".
// This is a development-only artefact — it never occurs in production builds.
// We silence it here so the Vite error overlay doesn't block the screen.
if (import.meta.env.DEV) {
  window.addEventListener('unhandledrejection', (e) => {
    const msg: string = e?.reason?.message ?? '';
    if (msg.includes('FIRESTORE') && msg.includes('INTERNAL ASSERTION FAILED')) {
      e.preventDefault(); // stops Vite runtime-error-plugin from catching it
    }
  });
}

// Browsers restore the previous scroll offset on refresh/back-forward nav
// before layout (fonts, images, async data) has finished settling. Combined
// with our sticky section headers, that stale offset makes the header appear
// to overlap the content until the user manually scrolls and the sticky
// element's position gets recalculated. Taking manual control avoids it.
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}
window.scrollTo(0, 0);

// ─── Root Error Boundary ─────────────────────────────────────────────────────
// Without this, any unhandled React render error leaves a completely blank
// white page with no way to recover other than opening a new tab. This
// boundary catches those errors and shows a friendly recovery screen.
interface EBState { error: Error | null }
class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, EBState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }
  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[Learning Sathi] Uncaught render error:', error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        minHeight: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: 'linear-gradient(135deg, #6366f1 0%, #a855f7 100%)',
        color: '#fff',
        fontFamily: 'system-ui, sans-serif',
        padding: '24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: '48px' }}>📚</div>
        <h1 style={{ margin: 0, fontSize: '20px', fontWeight: 700 }}>Something went wrong</h1>
        <p style={{ margin: 0, fontSize: '14px', opacity: 0.85, maxWidth: '320px' }}>
          The app ran into an unexpected error. Tap Reload to get back to your notes.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            marginTop: '8px',
            padding: '12px 28px',
            borderRadius: '12px',
            border: 'none',
            background: '#fff',
            color: '#6366f1',
            fontWeight: 700,
            fontSize: '15px',
            cursor: 'pointer',
          }}
        >
          Reload
        </button>
        <details style={{ fontSize: '11px', opacity: 0.6, maxWidth: '360px', wordBreak: 'break-word' }}>
          <summary style={{ cursor: 'pointer' }}>Error details</summary>
          <pre style={{ marginTop: '8px', whiteSpace: 'pre-wrap', textAlign: 'left' }}>
            {this.state.error.message}
          </pre>
        </details>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
