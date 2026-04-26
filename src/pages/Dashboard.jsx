import React, { useMemo } from 'react';
import { 
  LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell, PieChart, Pie
} from 'recharts';
import { 
  TrendingUp, TrendingDown, Clock, Activity, AlertCircle, ShieldCheck, Zap, ClipboardList, CheckCircle2
} from 'lucide-react';
import { 
  calculateLambda, calculateMTBF, calculateMTTR, calculateAvailability, formatPercent, formatHours 
} from '../utils/formulas';
import { useAuth } from '../contexts/AuthContext';
import { useData } from '../contexts/DataContext';

const Dashboard = () => {
  const { activeTenant } = useAuth();
  const { equipments, failures, repairs, workOrders } = useData();

  // Cálculos Globais baseados no tenant
  const metrics = useMemo(() => {
    const totalOpTime = equipments.reduce((acc, eq) => acc + eq.total_op_time, 0);
    const totalFailures = failures.length;
    const totalRepairTime = repairs.reduce((acc, rep) => acc + rep.tempo_reparo, 0);
    const totalRepairs = repairs.length;

    const mtbf = calculateMTBF(totalOpTime, totalFailures);
    const mttr = calculateMTTR(totalRepairTime, totalRepairs);
    const availability = calculateAvailability(mtbf, mttr);
    const lambda = calculateLambda(totalFailures, totalOpTime);

    // Métricas de O.S.
    const activeOS = workOrders.filter(os => os.status !== 'Concluída').length;
    const completedOS = workOrders.filter(os => os.status === 'Concluída').length;
    const criticalOS = workOrders.filter(os => os.prioridade === 'Crítica' && os.status !== 'Concluída').length;

    return { mtbf, mttr, availability, lambda, totalFailures, activeOS, completedOS, criticalOS };
  }, [equipments, failures, repairs, workOrders]);

  // Dados para Gráfico de Status de O.S.
  const osStatusData = useMemo(() => {
    const counts = {
      'Aberta': workOrders.filter(os => os.status === 'Aberta').length,
      'Em Execução': workOrders.filter(os => os.status === 'Em Execução').length,
      'Concluída': workOrders.filter(os => os.status === 'Concluída').length,
    };
    return Object.keys(counts).map(name => ({ name, value: counts[name] }));
  }, [workOrders]);

  const COLORS = ['#3b82f6', '#f59e0b', '#10b981'];

  // Dados simulados para histórico
  const chartData = [
    { name: 'Jan', falhas: 0, disponibilidade: 99.5 },
    { name: 'Fev', falhas: 1, disponibilidade: 98.2 },
    { name: 'Mar', falhas: 0, disponibilidade: 99.8 },
    { name: 'Abr', falhas: 2, disponibilidade: 96.5 },
    { name: 'Mai', falhas: 1, disponibilidade: 98.9 },
    { name: 'Jun', falhas: 0, disponibilidade: 99.2 },
  ];

  const StatCard = ({ title, value, icon: Icon, trend, color, subtitle }) => (
    <div className="premium-card" style={styles.card}>
      <div style={styles.cardHeader}>
        <div style={{ ...styles.iconContainer, background: `${color}15` }}>
          <Icon size={20} color={color} />
        </div>
        {trend && (
          <div style={{ ...styles.trend, color: trend > 0 ? 'var(--success)' : 'var(--danger)' }}>
            {trend > 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div style={styles.cardContent}>
        <p style={styles.cardTitle}>{title}</p>
        <h2 style={styles.cardValue}>{value}</h2>
        <p style={styles.cardSubtitle}>{subtitle}</p>
      </div>
    </div>
  );

  return (
    <div className="fade-in">
      <header style={styles.header}>
        <div>
          <h1 style={styles.pageTitle}>Dashboard Operacional</h1>
          <p style={styles.pageSubtitle}>Monitoramento de confiabilidade e performance de ativos em tempo real.</p>
        </div>
        <div style={styles.dateBadge}>
          <Clock size={16} />
          {new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
        </div>
      </header>

      {/* Grid de Estatísticas Principais */}
      <div style={styles.statsGrid}>
        <StatCard 
          title="Disponibilidade" 
          value={formatPercent(metrics.availability)} 
          icon={Activity}
          color="var(--success)"
          subtitle="Média da frota total"
          trend={1.2}
        />
        <StatCard 
          title="O.S. Ativas" 
          value={metrics.activeOS} 
          icon={ClipboardList}
          color="var(--primary)"
          subtitle={`${metrics.criticalOS} ordens críticas`}
        />
        <StatCard 
          title="MTBF" 
          value={formatHours(metrics.mtbf)} 
          icon={Zap}
          color="var(--warning)"
          subtitle="Tempo médio entre falhas"
          trend={5.4}
        />
        <StatCard 
          title="Taxa de Falha" 
          value={metrics.lambda.toFixed(4)} 
          icon={TrendingUp}
          color="var(--info)"
          subtitle="Falhas/Hora"
        />
      </div>

      {/* Gráficos */}
      <div style={styles.chartsGrid}>
        {/* Gráfico de Evolução */}
        <div className="premium-card" style={styles.chartContainer}>
          <div style={styles.chartHeader}>
            <h3 style={styles.chartTitle}>Performance de Disponibilidade</h3>
            <p style={styles.chartSubtitle}>Histórico dos últimos 6 meses</p>
          </div>
          <div style={{ height: '280px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorDisp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.1}/>
                    <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 12}} />
                <YAxis hide domain={[90, 100]} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }} />
                <Area type="monotone" dataKey="disponibilidade" stroke="var(--primary)" fillOpacity={1} fill="url(#colorDisp)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Distribuição de O.S. */}
        <div className="premium-card" style={styles.chartContainer}>
          <div style={styles.chartHeader}>
            <h3 style={styles.chartTitle}>Status das Ordens de Serviço</h3>
            <p style={styles.chartSubtitle}>Distribuição da carga de trabalho</p>
          </div>
          <div style={{ height: '280px', width: '100%', display: 'flex', alignItems: 'center' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={osStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {osStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
            <div style={styles.legend}>
              {osStatusData.map((item, i) => (
                <div key={i} style={styles.legendItem}>
                  <div style={{...styles.legendDot, background: COLORS[i]}}></div>
                  <span style={styles.legendLabel}>{item.name}: <strong>{item.value}</strong></span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top Ativos Críticos */}
        <div className="premium-card" style={{...styles.chartContainer, gridColumn: 'span 2'}}>
          <div style={styles.chartHeader}>
            <h3 style={styles.chartTitle}>Ranking de Criticidade por Ativo</h3>
            <p style={styles.chartSubtitle}>Equipamentos com maior número de O.S. abertas</p>
          </div>
          <div style={{ height: '250px', width: '100%' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={equipments.slice(0, 6)}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 11}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'var(--text-muted)', fontSize: 12}} />
                <Tooltip cursor={{fill: 'rgba(30, 58, 138, 0.05)'}} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow-lg)' }} />
                <Bar dataKey="id" radius={[4, 4, 0, 0]} barSize={40}>
                  {equipments.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? 'var(--danger)' : 'var(--primary)'} fillOpacity={0.8} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '32px' },
  pageTitle: { fontSize: '24px', fontWeight: '700', color: 'var(--text-main)', marginBottom: '4px' },
  pageSubtitle: { fontSize: '14px', color: 'var(--text-muted)' },
  dateBadge: { display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: 'white', borderRadius: '20px', border: '1px solid var(--border)', fontSize: '13px', fontWeight: '600', color: 'var(--text-main)', textTransform: 'capitalize' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '24px', marginBottom: '32px' },
  card: { padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' },
  cardHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  iconContainer: { width: '42px', height: '42px', borderRadius: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  trend: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: '600', padding: '4px 8px', background: 'rgba(255,255,255,0.5)', borderRadius: '6px' },
  cardContent: { display: 'flex', flexDirection: 'column' },
  cardTitle: { fontSize: '13px', fontWeight: '600', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' },
  cardValue: { fontSize: '28px', fontWeight: '700', color: 'var(--text-main)', letterSpacing: '-0.5px' },
  cardSubtitle: { fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' },
  chartsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' },
  chartContainer: { padding: '24px' },
  chartHeader: { marginBottom: '24px' },
  chartTitle: { fontSize: '16px', fontWeight: '700', color: 'var(--text-main)' },
  chartSubtitle: { fontSize: '13px', color: 'var(--text-muted)' },
  legend: { display: 'flex', flexDirection: 'column', gap: '10px', marginLeft: '20px' },
  legendItem: { display: 'flex', alignItems: 'center', gap: '8px' },
  legendDot: { width: '10px', height: '10px', borderRadius: '50%' },
  legendLabel: { fontSize: '13px', color: 'var(--text-muted)' }
};

export default Dashboard;
