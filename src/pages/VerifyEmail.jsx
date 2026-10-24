import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, Info } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

/** Destino do link do e-mail de cadastro: confirma o e-mail e já entra no sistema. */
const VerifyEmail = () => {
  const [searchParams] = useSearchParams();
  const { startSession } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  // O link vale uma única vez: evita a segunda chamada do modo estrito do React
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    const token = searchParams.get('token') || '';
    apiFetch('/api/signup/verify', { method: 'POST', body: { token }, auth: false })
      .then(async (data) => {
        await startSession(data);
        toast.success('E-mail confirmado! Agora escolha seu plano.');
        navigate('/settings?tab=billing', { replace: true });
      })
      .catch((err) => setError(err.message));
  }, [searchParams, startSession, navigate]);

  return (
    <div style={styles.container}>
      <div className="premium-card fade-in" style={styles.card}>
        {error ? (
          <>
            <Info size={36} color="var(--danger)" />
            <p style={{ fontWeight: 600 }}>{error}</p>
            <Link to="/login" className="btn-primary flex-center" style={{ width: '100%' }}>Ir para o login</Link>
          </>
        ) : (
          <>
            <Loader2 className="animate-spin" size={36} color="var(--primary)" />
            <p>Confirmando seu e-mail...</p>
          </>
        )}
      </div>
    </div>
  );
};

const styles = {
  container: { minHeight: '100dvh', padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-main)' },
  card: { width: '100%', maxWidth: '420px', padding: '40px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', textAlign: 'center', background: 'white' },
};

export default VerifyEmail;
