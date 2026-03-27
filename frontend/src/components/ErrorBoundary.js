import { Component } from 'react';

/**
 * Catches render errors in child tree and shows a fallback UI.
 * Wrap page-level components with this in App.js.
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', height: '60vh', gap: 16, color: '#94a3b8'
        }}>
          <span style={{ fontSize: 40 }}>⚠️</span>
          <p style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0' }}>Something went wrong</p>
          <p style={{ fontSize: 13 }}>{this.state.error?.message}</p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              background: '#6366f1', color: '#fff', border: 'none',
              padding: '10px 20px', borderRadius: 8, cursor: 'pointer', fontWeight: 600
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
