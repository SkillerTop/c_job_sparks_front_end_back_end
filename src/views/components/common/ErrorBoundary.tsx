import { Component, type ReactNode } from 'react';
import { RefreshCcw } from 'lucide-react';
import styles from '@/views/styles/app.module.css';

export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className={styles.fullState} role="alert">
        <h1>The workspace needs a refresh</h1>
        <p>A screen could not finish loading. Reload to use the latest published version.</p>
        <button className={styles.primaryButton} type="button" onClick={() => window.location.reload()}>
          <RefreshCcw size={16} /> Reload workspace
        </button>
      </main>
    );
  }
}
