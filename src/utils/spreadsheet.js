// Leitura de planilhas (CSV ou Excel .xlsx) para importação de cadastros.

const normalize = (text) => String(text ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Divide um CSV respeitando aspas. Detecta ";" (Excel em português) ou ",". */
export const parseCsv = (text) => {
  const content = text.replace(/^\uFEFF/, '');
  const firstLine = content.split(/\r?\n/, 1)[0];
  const delimiter = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (quoted) {
      if (ch === '"' && content[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
};

const toCellText = (value) => {
  if (value instanceof Date) {
    const d = String(value.getUTCDate()).padStart(2, '0');
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    return `${d}/${m}/${value.getUTCFullYear()}`;
  }
  if (value === null || value === undefined) return '';
  return typeof value === 'number' ? value : String(value);
};

/**
 * Lê o arquivo e devolve linhas como objetos, usando o mapa de cabeçalhos
 * (nomes aceitos em português -> campo da API). Colunas desconhecidas são ignoradas.
 * @returns {{ rows: object[], unknownColumns: string[] }}
 */
export const readSpreadsheet = async (file, headerMap) => {
  let table;
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import('read-excel-file/browser');
    table = (await readSheet(file)).map((row) => row.map(toCellText));
  } else if (/\.csv$/i.test(file.name)) {
    table = parseCsv(await file.text());
  } else {
    throw new Error('Formato não suportado. Envie um arquivo .xlsx ou .csv.');
  }
  if (table.length < 2) throw new Error('A planilha precisa ter o cabeçalho e ao menos uma linha.');

  const lookup = new Map(Object.entries(headerMap).flatMap(([field, names]) => names.map((n) => [normalize(n), field])));
  const columns = table[0].map((h) => lookup.get(normalize(h)) || null);
  const unknownColumns = table[0].filter((h, i) => !columns[i] && String(h).trim());

  const rows = table.slice(1).map((cells) => {
    const obj = {};
    columns.forEach((field, i) => {
      if (field) obj[field] = typeof cells[i] === 'number' ? cells[i] : String(cells[i] ?? '').trim();
    });
    return obj;
  });
  return { rows, unknownColumns };
};

/** Gera e baixa um modelo CSV (separado por ";", abre direto no Excel em português). */
export const downloadCsvTemplate = (filename, headers, example) => {
  const escape = (v) => (/[;"\n]/.test(v) ? `"${String(v).replace(/"/g, '""')}"` : v);
  const csv = `\uFEFF${headers.map(escape).join(';')}\n${example.map(escape).join(';')}\n`;
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};
