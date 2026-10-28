import { Component, type ReactNode } from 'react';
import { RefreshCcw } from 'lucide-react';
import styles from '@/views/styles/app.module.css';import { LocalizedText } from '@/views/components/common/LocalizedText';


export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className={styles.fullState} role="alert">
        <h1><LocalizedText>The workspace needs a refresh</LocalizedText></h1>
        <p><LocalizedText>A screen could not finish loading. Reload to use the latest published version.</LocalizedText></p>
        <button className={styles.primaryButton} type="button" onClick={() => window.location.reload()}>
          <RefreshCcw size={16} /> <LocalizedText>Reload workspace
        </LocalizedText></button>
      </main>
    );
  }
}
