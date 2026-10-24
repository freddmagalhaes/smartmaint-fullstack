import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Rodapé de paginação: "21–40 de 135" com anterior/próxima. Some quando cabe tudo em uma página. */
const Pagination = ({ page, pageSize, total, onChange, loading }) => {
  if (total <= pageSize) {
    return total > 0 ? <p style={styles.summary}>{total} {total === 1 ? 'registro' : 'registros'}</p> : null;
  }
  const lastPage = Math.ceil(total / pageSize);
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <nav style={styles.bar} aria-label="Paginação">
      <span style={styles.summary}>{first}–{last} de {total}</span>
      <div style={styles.buttons}>
        <button type="button" style={styles.btn} onClick={() => onChange(page - 1)} disabled={page <= 1 || loading} aria-label="Página anterior">
          <ChevronLeft size={16} />
        </button>
        <span style={styles.page}>{page} / {lastPage}</span>
        <button type="button" style={styles.btn} onClick={() => onChange(page + 1)} disabled={page >= lastPage || loading} aria-label="Próxima página">
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
};

const styles = {
  bar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '16px 4px', flexWrap: 'wrap' },
  summary: { fontSize: '13px', color: 'var(--text-muted)', padding: '12px 4px' },
  buttons: { display: 'flex', alignItems: 'center', gap: '8px' },
  btn: { width: '34px', height: '34px', borderRadius: '8px', border: '1px solid var(--border)', background: 'white', color: 'var(--text-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  page: { fontSize: '13px', fontWeight: 600, color: 'var(--text-main)', minWidth: '56px', textAlign: 'center' },
};

export default Pagination;
