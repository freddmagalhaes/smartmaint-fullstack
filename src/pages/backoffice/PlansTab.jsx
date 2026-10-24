import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Save } from 'lucide-react';
import { apiFetch } from '../../api/client';

const LIMITS = [
  ['max_users', 'Usuários'],
  ['max_equipments', 'Equipamentos'],
  ['max_units', 'Unidades'],
];

const toForm = (plan) => ({
  ...plan,
  price_monthly: plan.price_monthly ?? '',
  ...Object.fromEntries(LIMITS.map(([key]) => [key, plan[key] ?? ''])),
});

/** Preços e limites dos planos (somente Root). Limite em branco = ilimitado. */
const PlansTab = () => {
  const [plans, setPlans] = useState([]);
  const [saving, setSaving] = useState(null);

  const load = useCallback(() => apiFetch('/api/plans').then((rows) => setPlans(rows.map(toForm))).catch((err) => toast.error(err.message)), []);
  useEffect(() => { load(); }, [load]);

  const update = (id, key, value) => setPlans((prev) => prev.map((p) => (p.id === id ? { ...p, [key]: value } : p)));

  const save = async (plan) => {
    setSaving(plan.id);
    try {
      const body = {
        name: plan.name,
        price_monthly: Number(plan.price_monthly) || 0,
        trial_days: Number(plan.trial_days) || 0,
        active: Boolean(plan.active),
        ...Object.fromEntries(LIMITS.map(([key]) => [key, plan[key] === '' ? null : Number(plan[key])])),
      };
      await apiFetch(`/api/admin/plans/${encodeURIComponent(plan.id)}`, { method: 'PUT', body });
      toast.success(`Plano ${plan.name} salvo`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div>
      <p style={styles.hint}>
        Limites aplicados na criação de usuários, equipamentos e unidades. Deixe em branco para ilimitado.
        O preço será usado na cobrança recorrente.
      </p>
      <div style={styles.grid}>
        {plans.map((plan) => (
          <div key={plan.id} className="premium-card" style={styles.card}>
            <div style={styles.cardHeader}>
              <input aria-label="Nome do plano" style={{ ...styles.input, fontWeight: 700, fontSize: '16px' }} value={plan.name} onChange={(e) => update(plan.id, 'name', e.target.value)} />
              <label style={styles.check}>
                <input type="checkbox" checked={Boolean(plan.active)} onChange={(e) => update(plan.id, 'active', e.target.checked)} /> Ativo
              </label>
            </div>
            <label style={styles.label}>Preço mensal (R$)
              <input type="number" min="0" step="0.01" style={styles.input} value={plan.price_monthly} onChange={(e) => update(plan.id, 'price_monthly', e.target.value)} />
            </label>
            <label style={styles.label}>Dias de teste grátis
              <input type="number" min="0" max="365" style={styles.input} value={plan.trial_days} onChange={(e) => update(plan.id, 'trial_days', e.target.value)} />
            </label>
            {LIMITS.map(([key, label]) => (
              <label key={key} style={styles.label}>{label} (máx.)
                <input type="number" min="0" placeholder="Ilimitado" style={styles.input} value={plan[key]} onChange={(e) => update(plan.id, key, e.target.value)} />
              </label>
            ))}
            <button className="btn-primary" style={{ justifyContent: 'center' }} onClick={() => save(plan)} disabled={saving === plan.id}>
              <Save size={16} /> {saving === plan.id ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles = {
  hint: { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: '16px' },
  card: { padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' },
  cardHeader: { display: 'flex', alignItems: 'center', gap: '12px' },
  check: { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--text-muted)', whiteSpace: 'nowrap' },
  label: { display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '13px', fontWeight: 600 },
  input: { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', fontWeight: 400, width: '100%' },
};

export default PlansTab;
