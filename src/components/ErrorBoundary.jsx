import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';
import { reportError } from '../monitoring';

/** Evita a tela branca: mostra uma mensagem e reporta o erro (Sentry, quando configurado). */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    reportError(error, { componentStack: info.componentStack });
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <div className="flex-center" style={{ minHeight: '60vh', flexDirection: 'column', gap: '16px', padding: '24px', textAlign: 'center' }}>
        <AlertTriangle size={40} color="var(--warning)" />
        <h2 style={{ fontSize: '20px', fontWeight: 700 }}>Algo deu errado nesta tela</h2>
        <p style={{ color: 'var(--text-muted)', maxWidth: '420px' }}>
          O erro foi registrado. Tente recarregar a página; se continuar, fale com o suporte.
        </p>
        <button className="btn-primary" onClick={() => window.location.reload()}>Recarregar</button>
      </div>
    );
  }
}

export default ErrorBoundary;
