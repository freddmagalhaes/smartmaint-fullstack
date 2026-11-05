import { useState } from 'react';
import { Factory, Plus, Edit2, Trash2, Save, X } from 'lucide-react';
import { useData } from '../../contexts/DataContext';

/** Cadastro das unidades fabris (plantas, filiais) do cliente. */
const UnitsTab = () => {
  const { units, addUnit, updateUnit, deleteUnit } = useData();
  const [form, setForm] = useState(null); // { id?, name, code }

  const handleSubmit = async (e) => {
    e.preventDefault();
    const body = { name: form.name, code: form.code || null };
    const ok = form.id ? await updateUnit(form.id, body) : await addUnit(body);
    if (ok) setForm(null);
  };

  return (
    <div className="fade-in">
      <div className="stack-mobile" style={styles.header}>
        <div>
          <h3 style={styles.title}>Unidades Fabris</h3>
          <p style={styles.desc}>Plantas, filiais ou setores. Cada equipamento pertence a uma unidade e as telas podem ser filtradas por ela.</p>
        </div>
        <button className="btn-primary" onClick={() => setForm({ name: '', code: '' })}>
          <Plus size={18} /> Nova Unidade
        </button>
      </div>

      {form && (
        <form onSubmit={handleSubmit} style={styles.form} className="stack-mobile">
          <input required autoFocus maxLength={255} placeholder="Nome da unidade (ex.: Planta Contagem)" style={{ ...styles.input, flex: 2 }} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Nome da unidade" />
          <input maxLength={50} placeholder="Código (opcional)" style={{ ...styles.input, flex: 1 }} value={form.code || ''} onChange={(e) => setForm({ ...form, code: e.target.value })} aria-label="Código da unidade" />
          <button type="submit" className="btn-primary"><Save size={16} /> Salvar</button>
          <button type="button" style={styles.iconBtn} onClick={() => setForm(null)} aria-label="Cancelar"><X size={18} /></button>
        </form>
      )}

      <div style={styles.list}>
        {units.map((u) => (
          <div key={u.id} style={styles.item}>
            <div style={styles.icon}><Factory size={20} color="var(--primary)" /></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={styles.name}>{u.name}{u.code ? <span style={styles.code}> · {u.code}</span> : null}</p>
              <p style={styles.desc}>{u.equipments_count} {Number(u.equipments_count) === 1 ? 'equipamento' : 'equipamentos'}</p>
            </div>
            <button style={styles.iconBtn} title="Editar" aria-label={`Editar ${u.name}`} onClick={() => setForm({ id: u.id, name: u.name, code: u.code })}><Edit2 size={18} /></button>
            {units.length > 1 && (
              <button style={styles.iconBtn} title="Excluir" aria-label={`Excluir ${u.name}`} onClick={() => deleteUnit(u.id)}><Trash2 size={18} /></button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '24px', paddingBottom: '20px', borderBottom: '1px solid var(--border)' },
  title: { fontSize: '18px', fontWeight: '700', marginBottom: '4px' },
  desc: { fontSize: '13px', color: 'var(--text-muted)' },
  form: { display: 'flex', gap: '12px', alignItems: 'center', marginBottom: '20px' },
  input: { padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', minWidth: 0 },
  list: { display: 'flex', flexDirection: 'column', gap: '12px' },
  item: { display: 'flex', alignItems: 'center', gap: '16px', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' },
  icon: { width: '40px', height: '40px', borderRadius: '10px', background: 'rgba(30, 58, 138, 0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  name: { fontSize: '14px', fontWeight: '600' },
  code: { fontWeight: 400, color: 'var(--text-muted)' },
  iconBtn: { color: 'var(--text-muted)', background: 'transparent', padding: '8px' },
};

export default UnitsTab;
