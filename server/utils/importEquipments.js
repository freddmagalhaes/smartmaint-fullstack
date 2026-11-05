// Validação das linhas de importação de ativos (sem acesso a banco: pura e testável).
const MAX_ROWS = 1000;

const TEXT_FIELDS = { name: 255, type: 100, model: 100, serie: 100 };
const MAX_OP_TIME = 99999999; // horas

const isBlank = (v) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');
const isScalar = (v) => ['string', 'number'].includes(typeof v) && !(typeof v === 'number' && !Number.isFinite(v));

const isValidIsoDate = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return false; // rejeita 2024-02-31
  const year = Number(s.slice(0, 4));
  const limit = Date.now() + 24 * 60 * 60 * 1000; // tolera fuso: até amanhã
  return year >= 1900 && d.getTime() <= limit;
};

// Chave de comparação de número de série: sem acentos, minúsculas, sem espaços nas pontas
const serieKey = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/**
 * Valida e normaliza uma linha. Só os campos conhecidos são lidos (nada do corpo vira coluna do SQL).
 * Retorna { row } ou { errors: [{ line, field, message }] }.
 */
const validateRow = (raw, index) => {
  const errors = [];
  const fallbackLine = index + 2; // linha 1 da planilha é o cabeçalho
  const line = Number.isInteger(raw && raw.line) && raw.line > 0 ? raw.line : fallbackLine;
  const fail = (field, message) => errors.push({ line, field, message });

  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { errors: [{ line, field: null, message: 'Linha inválida.' }] };
  }

  const row = { line };
  for (const [field, max] of Object.entries(TEXT_FIELDS)) {
    const v = raw[field];
    if (isBlank(v)) { row[field] = null; continue; }
    if (!isScalar(v)) { fail(field, 'Valor inválido.'); continue; }
    const text = String(v).trim();
    if (text.length > max) fail(field, `Máximo de ${max} caracteres.`);
    else row[field] = text;
  }
  if (!row.name && !errors.some((e) => e.field === 'name')) fail('name', 'Nome do equipamento é obrigatório.');

  const hours = raw.total_op_time;
  if (isBlank(hours)) row.total_op_time = 0;
  else if (!isScalar(hours) || !Number.isInteger(Number(hours)) || Number(hours) < 0 || Number(hours) > MAX_OP_TIME) {
    fail('total_op_time', 'Horas operadas devem ser um número inteiro maior ou igual a zero.');
  } else row.total_op_time = Number(hours);

  const date = raw.data_inicio;
  if (isBlank(date)) row.data_inicio = null;
  else if (typeof date !== 'string' || !isValidIsoDate(date.trim())) fail('data_inicio', 'Data de início inválida (use AAAA-MM-DD).');
  else row.data_inicio = date.trim();

  return errors.length ? { errors } : { row };
};

/** Valida o lote. Retorna { rows, errors } (errors vazio = tudo válido). */
const validateRows = (rawRows) => {
  const rows = [];
  const errors = [];
  rawRows.forEach((raw, i) => {
    const r = validateRow(raw, i);
    if (r.errors) errors.push(...r.errors);
    else rows.push(r.row);
  });
  return { rows, errors };
};

module.exports = { MAX_ROWS, validateRows, validateRow, serieKey, isValidIsoDate };
