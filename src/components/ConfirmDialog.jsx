import { createContext, useContext, useState, useCallback, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';

const ConfirmContext = createContext(() => Promise.resolve(false));

/** Substitui window.confirm por um modal no padrão visual do sistema: `await confirm('Excluir?')`. */
export const ConfirmProvider = ({ children }) => {
  const [dialog, setDialog] = useState(null);
  const resolver = useRef(null);

  const confirm = useCallback((message, { title = 'Confirmar ação', confirmLabel = 'Excluir', danger = true } = {}) =>
    new Promise((resolve) => {
      resolver.current = resolve;
      setDialog({ message, title, confirmLabel, danger });
    }), []);

  const close = (result) => {
    resolver.current?.(result);
    resolver.current = null;
    setDialog(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {dialog && (
        <div className="modal-overlay" onClick={() => close(false)}>
          <div className="premium-card fade-in modal-card" style={styles.card} role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div style={styles.header}>
              {dialog.danger && <AlertTriangle size={22} color="var(--danger)" />}
              <h3 style={styles.title}>{dialog.title}</h3>
            </div>
            <p style={styles.message}>{dialog.message}</p>
            <div style={styles.footer}>
              <button type="button" onClick={() => close(false)} style={styles.cancel} autoFocus>Cancelar</button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => close(true)}
                style={dialog.danger ? { background: 'var(--danger)' } : undefined}
              >
                {dialog.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => useContext(ConfirmContext);

const styles = {
  card: { maxWidth: '420px', padding: '28px', background: 'white' },
  header: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' },
  title: { fontSize: '18px', fontWeight: '700' },
  message: { fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' },
  footer: { display: 'flex', justifyContent: 'flex-end', gap: '12px' },
  cancel: { background: 'transparent', color: 'var(--text-muted)', fontWeight: '600', padding: '10px 16px' },
};
