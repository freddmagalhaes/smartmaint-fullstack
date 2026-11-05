// Leitura de planilhas de ativos (CSV e XLSX) no navegador. Funções puras, sem React.
// O servidor valida tudo de novo; aqui só convertemos o arquivo em linhas { line, name, type, ... }.

export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_ROWS = 1000;

export class ImportFileError extends Error {}

// ---------- Texto e CSV ----------

/** Decodifica bytes de CSV: UTF-8 (com/sem BOM); se não for UTF-8 válido, assume Windows-1252 (Excel BR). */
export const decodeText = (buffer) => {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    text = new TextDecoder('windows-1252').decode(buffer);
  }
  return text.replace(/^\uFEFF/, '');
};

const detectDelimiter = (text) => {
  const firstLine = text.split(/\r\n|\n|\r/, 1)[0] || '';
  let best = ',';
  let bestCount = -1;
  for (const d of [';', ',', '\t']) {
    // conta só fora de aspas
    let inQuotes = false;
    let count = 0;
    for (const ch of firstLine) {
      if (ch === '"') inQuotes = !inQuotes;
      else if (ch === d && !inQuotes) count++;
    }
    if (count > bestCount) { best = d; bestCount = count; }
  }
  return best;
};

/** Parser CSV (RFC 4180): aspas, aspas duplicadas, quebras de linha dentro de campo, CRLF. Retorna [{ cells, line }]. */
export const parseCsv = (text) => {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let cells = [];
  let cell = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  const endCell = () => { cells.push(cell); cell = ''; };
  const endRow = () => {
    endCell();
    if (cells.some((c) => c.trim() !== '')) rows.push({ cells, line: rowLine });
    cells = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        cell += ch;
      }
    } else if (ch === '"' && cell === '') {
      inQuotes = true;
    } else if (ch === delimiter) {
      endCell();
    } else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || cells.length > 0) endRow();
  return rows;
};

/** Converte uma matriz (ex.: vinda do XLSX) no mesmo formato do parseCsv. */
export const tableFromMatrix = (matrix) =>
  matrix
    .map((cells, i) => ({ cells, line: i + 1 }))
    .filter((r) => r.cells.some((c) => !(c === null || c === undefined || String(c).trim() === '')));

// ---------- Cabeçalhos ----------

const normalizeHeader = (h) =>
  String(h ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

const ALIASES = {
  name: ['nome', 'nomedoequipamento', 'equipamento', 'ativo', 'nomedoativo', 'name', 'descricao'],
  type: ['tipo', 'tipodeequipamento', 'categoria', 'type'],
  model: ['modelo', 'model'],
  serie: ['serie', 'numerodeserie', 'nserie', 'ndeserie', 'nrodeserie', 'numdeserie', 'nodeserie', 'nroserie', 'numserie', 'numeroserie', 'serial', 'ns'],
  total_op_time: ['horas', 'horasoperadas', 'horasdeoperacao', 'tempodeoperacao', 'tempooperado', 'horimetro', 'totalophours', 'totaloptime'],
  data_inicio: ['datainicio', 'datadeinicio', 'datadeinstalacao', 'datainstalacao', 'instalacao', 'inicio', 'datadeaquisicao', 'dataaquisicao'],
};
const HEADER_TO_FIELD = Object.fromEntries(
  Object.entries(ALIASES).flatMap(([field, names]) => names.map((n) => [n, field]))
);

// ---------- Valores ----------

const blank = (v) => v === null || v === undefined || String(v).trim() === '';

/** "1.200" -> 1200, "1.200,5" -> 1200.5, "350" -> 350. Se não for número, devolve o texto (o servidor acusa o erro). */
export const parseNumberBR = (v) => {
  if (blank(v)) return undefined;
  if (typeof v === 'number') return v;
  const s = String(v).trim().replace(/\s/g, '');
  let normalized = s;
  if (s.includes(',')) normalized = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) normalized = s.replace(/\./g, '');
  const n = Number(normalized);
  return normalized !== '' && Number.isFinite(n) ? n : s;
};

const pad = (n) => String(n).padStart(2, '0');
const isoFromParts = (y, m, d) => {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${pad(m)}-${pad(d)}` : null;
};

/** Date (XLSX), "10/05/2023", "10-05-2023", "10.05.2023" ou "2023-05-10" -> "2023-05-10". Inválido: devolve o texto. */
export const parseDate = (v) => {
  if (blank(v)) return undefined;
  if (v instanceof Date) {
    // XLSX entrega a data sem hora; usamos os componentes UTC para não deslocar o dia por fuso
    return Number.isNaN(v.getTime()) ? String(v) : isoFromParts(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate()) || String(v);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return isoFromParts(+m[1], +m[2], +m[3]) || s;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return isoFromParts(+m[3], +m[2], +m[1]) || s;
  return s;
};

const cleanText = (v) => (blank(v) ? undefined : v instanceof Date ? parseDate(v) : typeof v === 'number' ? String(v) : String(v).trim());

// ---------- Mapeamento ----------

/**
 * Converte a tabela (primeira linha = cabeçalho) em linhas de ativo.
 * Retorna { rows: [{ line, name, ... }], ignoredColumns: [texto do cabeçalho] }.
 */
export const mapTable = (table) => {
  if (table.length === 0) throw new ImportFileError('A planilha está vazia.');
  const [header, ...body] = table;

  const columnField = header.cells.map((h) => HEADER_TO_FIELD[normalizeHeader(h)] || null);
  if (!columnField.includes('name')) {
    throw new ImportFileError('Não encontrei a coluna "Nome" na primeira linha. Use o modelo de planilha para começar.');
  }
  const ignoredColumns = header.cells.filter((h, i) => !columnField[i] && !blank(h)).map((h) => String(h).trim());

  if (body.length === 0) throw new ImportFileError('A planilha tem só o cabeçalho, sem nenhum equipamento.');
  if (body.length > MAX_ROWS) throw new ImportFileError(`A planilha tem ${body.length} linhas; o máximo por importação é ${MAX_ROWS}. Divida em partes.`);

  const rows = body.map(({ cells, line }) => {
    const row = { line };
    columnField.forEach((field, i) => {
      if (!field || field in row) return; // primeira coluna com o nome vence
      const raw = cells[i];
      if (field === 'total_op_time') row[field] = parseNumberBR(raw);
      else if (field === 'data_inicio') row[field] = parseDate(raw);
      else row[field] = cleanText(raw);
    });
    return row;
  });
  return { rows, ignoredColumns };
};

// ---------- Modelo para download ----------

/** CSV de exemplo (separador ";" e BOM UTF-8: abre corretamente no Excel em português). */
export const buildTemplateCsv = () => {
  const lines = [
    ['Nome', 'Tipo', 'Modelo', 'Número de série', 'Horas operadas', 'Data de início'],
    ['Torno CNC 01', 'Usinagem', 'Romi GL 240', 'SN-0001', '12500', '10/05/2021'],
    ['Compressor de ar', 'Utilidades', 'Schulz MSV 40', 'SN-0002', '8300', '03/11/2022'],
  ];
  return '\uFEFF' + lines.map((l) => l.join(';')).join('\r\n') + '\r\n';
};

// ---------- Arquivo ----------

/** Lê um File (.csv ou .xlsx) e devolve { rows, ignoredColumns }. Lança ImportFileError com mensagem para o usuário. */
export const readImportFile = async (file) => {
  if (file.size > MAX_FILE_BYTES) throw new ImportFileError('Arquivo maior que 5 MB.');
  const name = file.name.toLowerCase();

  if (name.endsWith('.xlsx')) {
    let matrix;
    try {
      const { readSheet } = await import('read-excel-file/browser'); // carregado só quando necessário
      matrix = await readSheet(file);
    } catch {
      throw new ImportFileError('Não foi possível ler o arquivo .xlsx. Confira se ele não está corrompido ou protegido por senha.');
    }
    return mapTable(tableFromMatrix(matrix));
  }
  if (name.endsWith('.csv') || name.endsWith('.txt')) {
    return mapTable(parseCsv(decodeText(await file.arrayBuffer())));
  }
  if (name.endsWith('.xls')) throw new ImportFileError('Arquivos .xls antigos não são aceitos. Salve como .xlsx ou .csv e tente de novo.');
  throw new ImportFileError('Formato não suportado. Envie um arquivo .xlsx ou .csv.');
};
