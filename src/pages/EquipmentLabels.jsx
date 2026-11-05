import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Printer, ArrowLeft } from 'lucide-react';
import { apiFetch, withQuery } from '../api/client';
import { useData } from '../contexts/DataContext';
import { useAuth } from '../contexts/AuthContext';
import EquipmentQr from '../components/EquipmentQr';

/**
 * Folha de etiquetas com QR Code para colar nos equipamentos (A4, 3 colunas).
 * ?ids=1,2,3 imprime só os escolhidos; sem parâmetro, todos da unidade selecionada.
 */
const EquipmentLabels = () => {
  const { scope, units } = useData();
  const { tenants, activeTenant } = useAuth();
  const [searchParams] = useSearchParams();
  const [equipments, setEquipments] = useState(null);
  const ids = useMemo(() => (searchParams.get('ids') || '').split(',').map(Number).filter(Boolean), [searchParams]);

  useEffect(() => {
    if (!scope.tenant_id) return;
    apiFetch(withQuery('/api/equipments', { ...scope, pageSize: 100 }))
      .then(async (first) => {
        // Busca todas as páginas (as etiquetas precisam da série e da unidade)
        let items = first.items;
        for (let page = 2; items.length < first.total; page += 1) {
          const next = await apiFetch(withQuery('/api/equipments', { ...scope, pageSize: 100, page }));
          if (!next.items.length) break;
          items = items.concat(next.items);
        }
        setEquipments(ids.length ? items.filter((e) => ids.includes(e.id)) : items);
      })
      .catch((err) => toast.error(err.message));
  }, [scope, ids]);

  const tenantName = tenants.find((t) => t.id === activeTenant)?.name || '';
  const unitName = scope.unit_id ? units.find((u) => u.id === scope.unit_id)?.name : null;

  return (
    <div className="fade-in">
      <header className="page-header stack-mobile no-print" style={styles.header}>
        <div>
          <Link to="/equipments" style={styles.back}><ArrowLeft size={16} /> Equipamentos</Link>
          <h1 style={styles.title}>Etiquetas QR Code</h1>
          <p style={styles.muted}>
            {equipments ? `${equipments.length} etiqueta(s)` : 'Carregando...'}{unitName ? ` · ${unitName}` : ''}.
            Imprima em papel adesivo A4 e cole em local visível do equipamento. O técnico escaneia com a câmera do celular e abre a ficha.
          </p>
        </div>
        <button className="btn-primary" onClick={() => window.print()} disabled={!equipments?.length}><Printer size={16} /> Imprimir</button>
      </header>

      <div className="label-sheet">
        {(equipments || []).map((e) => (
          <div key={e.id} className="label-item">
            <EquipmentQr id={e.id} label={e.name} size={112} />
            <div style={{ minWidth: 0 }}>
              <p style={styles.name}>{e.name}</p>
              {(e.model || e.serie) && <p style={styles.small}>{[e.model, e.serie && `S/N ${e.serie}`].filter(Boolean).join(' · ')}</p>}
              <p style={styles.small}>{e.unit_name}</p>
              <p style={styles.tiny}>{tenantName} · Escaneie para abrir uma O.S.</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', marginBottom: '20px' },
  back: { display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', color: 'var(--primary)', fontWeight: 600, marginBottom: '6px' },
  title: { fontSize: '28px', fontWeight: 700 },
  muted: { fontSize: '14px', color: 'var(--text-muted)', maxWidth: '640px' },
  name: { fontSize: '14px', fontWeight: 700, lineHeight: 1.25 },
  small: { fontSize: '11px', color: '#334155', marginTop: '2px' },
  tiny: { fontSize: '9px', color: '#64748b', marginTop: '6px' },
};

export default EquipmentLabels;
