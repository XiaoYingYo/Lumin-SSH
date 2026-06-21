import React from 'react';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const { fallback, label } = this.props;
      if (fallback) return fallback;
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100%', padding: 24, color: '#ff7b72', background: 'var(--bg-2, #0d1117)',
          fontFamily: 'system-ui, sans-serif', fontSize: 13,
        }}>
          <div style={{ marginBottom: 8, fontWeight: 600 }}>
            {label || '组件渲染出错'}
          </div>
          <div style={{ color: '#8b949e', fontSize: 12, marginBottom: 12, textAlign: 'center', maxWidth: 400 }}>
            {this.state.error?.message || '未知错误'}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: '4px 16px', border: '1px solid #30363d', borderRadius: 4,
              background: 'transparent', color: '#cdd9e5', cursor: 'pointer', fontSize: 12,
            }}
          >
            重试
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
