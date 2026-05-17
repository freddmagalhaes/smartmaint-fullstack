import { useState, useMemo } from 'react';
import { 
  Info, TrendingUp, TrendingDown, Activity 
} from 'lucide-react';
import { 
  calculateLambda, calculateReliability, formatPercent 
} from '../utils/formulas';
import { useData } from '../contexts/DataContext';

const Simulator = () => {
  const { equipments, failures } = useData();
  
  const [selectedEquipId, setSelectedEquipId] = useState(equipments[0]?.id);
  const [targetTime, setTargetTime] = useState(100);

  // Calcula os dados do equipamento selecionado
  const simulationData = useMemo(() => {
    const equipment = equipments.find(eq => eq.id === selectedEquipId);
    
    if (!equipment) return null;

    const equipFailures = failures.filter(f => f.equipment_id === selectedEquipId).length;
    const lambda = calculateLambda(equipFailures, equipment.total_op_time || 0);
    const reliability = calculateReliability(lambda, targetTime);

    return { equipment, failures: equipFailures, lambda, reliability };
  }, [selectedEquipId, targetTime, equipments, failures]);

  if (equipments.length === 0) {
    return (
      <div className="flex-center" style={{ height: '60vh', flexDirection: 'column', gap: '16px' }}>
        <Info size={48} color="var(--text-muted)" />
        <p style={{ color: 'var(--text-muted)' }}>Nenhum equipamento disponível para simulação nesta empresa.</p>
      </div>
    );
  }

  if (!simulationData) return null;

  return (
    <div className="fade-in">
      <header style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Simulador de Confiabilidade</h1>
          <p style={styles.pageSubtitle}>Calcule a probabilidade de sobrevivência R(t) baseada no histórico real.</p>
        </div>
        <div style={styles.formulaBadge}>
          <Activity size={16} />
          <span>R(t) = e^(-λ * t)</span>
        </div>
      </header>

      <div style={styles.grid}>
        {/* Painel de Configuração */}
        <div className="premium-card" style={styles.configPanel}>
          <h3 style={styles.panelTitle}>Configurações da Simulação</h3>
          
          <div style={styles.formGroup}>
            <label style={styles.label}>Selecionar Equipamento</label>
            <select 
              style={styles.select}
              value={selectedEquipId}
              onChange={(e) => setSelectedEquipId(Number(e.target.value))}
            >
              {equipments.map(eq => (
                <option key={eq.id} value={eq.id}>{eq.name}</option>
              ))}
            </select>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Tempo Desejado (t em horas)</label>
            <input 
              type="range" 
              min="1" 
              max="2000" 
              value={targetTime}
              onChange={(e) => setTargetTime(Number(e.target.value))}
              style={styles.range}
            />
            <div style={styles.rangeValues}>
              <span>1h</span>
              <span style={styles.currentValue}>{targetTime} horas</span>
              <span>2000h</span>
            </div>
          </div>

          <div style={styles.infoBox}>
            <Info size={18} color="var(--primary)" />
            <p style={styles.infoText}>
              Este cálculo utiliza a Taxa de Falha (λ) histórica deste ativo específico para prever sua confiabilidade no tempo futuro informado.
            </p>
          </div>
        </div>

        {/* Painel de Resultados */}
        <div className="premium-card" style={styles.resultPanel}>
          <div style={styles.resultHeader}>
            <div style={{ width: '80px', height: '80px', borderRadius: '50%', overflow: 'hidden', border: '4px solid white', boxShadow: 'var(--shadow-md)', marginBottom: '10px' }}>
              <img 
                src={simulationData.equipment.image} 
                alt={simulationData.equipment.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>
            <h3 style={styles.panelTitle}>Probabilidade de Sobrevivência</h3>
          </div>

          <div style={styles.mainResult}>
            <h2 style={styles.resultValue}>{formatPercent(simulationData.reliability)}</h2>
            <p style={styles.resultLabel}>Confiabilidade Estimada</p>
          </div>

          <div style={styles.metricsList}>
            <div style={styles.metricItem}>
              <span style={styles.metricLabel}>Taxa de Falha (λ)</span>
              <span style={styles.metricValue}>{simulationData.lambda.toFixed(6)} falhas/h</span>
            </div>
            <div style={styles.metricItem}>
              <span style={styles.metricLabel}>Histórico de Falhas</span>
              <span style={styles.metricValue}>{simulationData.failures} ocorrências</span>
            </div>
            <div style={styles.metricItem}>
              <span style={styles.metricLabel}>Tempo de Operação</span>
              <span style={styles.metricValue}>{simulationData.equipment.total_op_time} horas</span>
            </div>
          </div>

          <div style={{
            ...styles.alertBox,
            background: simulationData.reliability < 0.7 ? 'rgba(220, 38, 38, 0.1)' : 'rgba(22, 163, 74, 0.1)',
            color: simulationData.reliability < 0.7 ? 'var(--danger)' : 'var(--success)',
          }}>
            {simulationData.reliability < 0.7 ? (
              <>
                <TrendingDown size={18} />
                <span>Risco elevado. Recomenda-se manutenção preventiva.</span>
              </>
            ) : (
              <>
                <TrendingUp size={18} />
                <span>Nível de confiabilidade aceitável para o período.</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  pageTitle: {
    fontSize: '24px',
    fontWeight: '700',
    color: 'var(--text-main)',
    marginBottom: '4px',
  },
  pageSubtitle: {
    fontSize: '14px',
    color: 'var(--text-muted)',
  },
  formulaBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 16px',
    background: 'var(--primary-dark)',
    color: 'white',
    borderRadius: '8px',
    fontSize: '13px',
    fontWeight: '600',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
    gap: '24px',
  },
  configPanel: {
    padding: '32px',
  },
  resultPanel: {
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
  },
  panelTitle: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--text-main)',
    marginBottom: '24px',
  },
  formGroup: {
    marginBottom: '32px',
  },
  label: {
    display: 'block',
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-main)',
    marginBottom: '12px',
  },
  select: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    fontSize: '14px',
    color: 'var(--text-main)',
    background: 'var(--bg-main)',
  },
  range: {
    width: '100%',
    height: '6px',
    borderRadius: '5px',
    background: 'var(--border)',
    appearance: 'none',
    cursor: 'pointer',
  },
  rangeValues: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '12px',
    fontSize: '12px',
    color: 'var(--text-muted)',
    fontWeight: '500',
  },
  currentValue: {
    color: 'var(--primary)',
    fontWeight: '700',
    fontSize: '14px',
  },
  infoBox: {
    display: 'flex',
    gap: '12px',
    padding: '16px',
    background: 'rgba(30, 58, 138, 0.05)',
    borderRadius: '12px',
    marginTop: '20px',
  },
  infoText: {
    fontSize: '13px',
    color: 'var(--text-muted)',
    lineHeight: '1.5',
    textAlign: 'left',
  },
  resultHeader: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '32px',
  },
  mainResult: {
    marginBottom: '40px',
  },
  resultValue: {
    fontSize: '56px',
    fontWeight: '800',
    color: 'var(--primary)',
    lineHeight: '1',
  },
  resultLabel: {
    fontSize: '14px',
    color: 'var(--text-muted)',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '1px',
    marginTop: '8px',
  },
  metricsList: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    marginBottom: '40px',
  },
  metricItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderBottom: '1px solid var(--border)',
  },
  metricLabel: {
    fontSize: '14px',
    color: 'var(--text-muted)',
  },
  metricValue: {
    fontSize: '14px',
    fontWeight: '600',
    color: 'var(--text-main)',
  },
  alertBox: {
    width: '100%',
    padding: '16px',
    borderRadius: '12px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '12px',
    fontSize: '13px',
    fontWeight: '600',
  }
};

export default Simulator;
