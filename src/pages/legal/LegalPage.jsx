import { Link } from 'react-router-dom';
import { usePublicInfo, versionDate } from '../../api/publicInfo';
import logo from '../../assets/logo.png';

/** Moldura comum das páginas de Termos de Uso e Política de Privacidade. */
const LegalPage = ({ title, children }) => {
  const info = usePublicInfo();
  const legal = info?.legal || {};
  return (
    <div style={styles.page}>
      <header style={styles.header}>
        <Link to="/login" style={styles.brand}>
          <img src={logo} alt="" style={{ width: '32px', height: '32px' }} />
          <span>SmartMaint</span>
        </Link>
        <nav style={styles.nav}>
          <Link to="/termos" style={styles.navLink}>Termos de Uso</Link>
          <Link to="/privacidade" style={styles.navLink}>Privacidade</Link>
        </nav>
      </header>
      <article className="premium-card legal-text" style={styles.article}>
        <h1 style={styles.title}>{title}</h1>
        {legal.version && <p style={styles.meta}>Versão de {versionDate(legal.version)}</p>}
        {info ? children(legal) : <p style={styles.meta}>Carregando...</p>}
      </article>
    </div>
  );
};

/** Identificação da empresa nos textos (o CNPJ aparece assim que for configurado). */
export const Company = ({ legal }) => (
  <>
    <strong>{legal.company_name || 'SmartMaint'}</strong>
    {legal.cnpj ? `, inscrita no CNPJ sob o nº ${legal.cnpj}` : ''}
    {legal.address ? `, com sede em ${legal.address}` : ''}
  </>
);

export const ContactEmail = ({ legal }) => (legal.contact_email
  ? <a href={`mailto:${legal.contact_email}`}>{legal.contact_email}</a>
  : <span>o canal de suporte informado no sistema</span>);

const styles = {
  page: { minHeight: '100dvh', background: 'var(--bg-main)', padding: '16px' },
  header: { maxWidth: '860px', margin: '0 auto 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' },
  brand: { display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 700, fontSize: '18px', color: 'var(--primary)', textDecoration: 'none' },
  nav: { display: 'flex', gap: '16px' },
  navLink: { fontSize: '14px', color: 'var(--primary)', fontWeight: 600 },
  article: { maxWidth: '860px', margin: '0 auto', padding: 'clamp(20px, 5vw, 48px)', background: 'white', lineHeight: 1.65, fontSize: '15px' },
  title: { fontSize: 'clamp(22px, 4vw, 30px)', fontWeight: 700, marginBottom: '4px' },
  meta: { fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px' },
};

export default LegalPage;
