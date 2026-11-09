import { Component } from 'react'
import { AlertCircle, RefreshCw } from 'lucide-react'

interface Props {
  children: React.ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="setup-page">
          <section className="setup-card" style={{ textAlign: 'center' }}>
            <div style={{ display: 'grid', justifyItems: 'center', gap: '16px' }}>
              <div className="error-boundary-icon">
                <AlertCircle size={28} />
              </div>
              <h1>Terjadi kesalahan</h1>
              <p className="muted" style={{ maxWidth: '380px', lineHeight: 1.65, fontSize: '14px' }}>
                Aplikasi mengalami gangguan yang tidak terduga. Coba muat ulang halaman, atau hubungi administrator jika masalah berlanjut.
              </p>
              {this.state.error && (
                <pre className="setup-code" style={{ textAlign: 'left', fontSize: '12px', maxHeight: '120px', overflow: 'auto' }}>
                  {this.state.error.message}
                </pre>
              )}
              <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
                <button className="button button-secondary" onClick={this.handleReset}>
                  Coba lagi
                </button>
                <button className="button button-primary" onClick={this.handleReload}>
                  <RefreshCw size={16} />
                  Muat ulang
                </button>
              </div>
            </div>
          </section>
        </main>
      )
    }

    return this.props.children
  }
}
