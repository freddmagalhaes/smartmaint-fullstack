import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readSheet } from 'read-excel-file/node';
import {
  decodeText, parseCsv, tableFromMatrix, mapTable, parseNumberBR, parseDate,
  buildTemplateCsv, readImportFile, ImportFileError, MAX_ROWS,
} from './importEquipments.js';

const bytes = (str, encoding = 'utf8') =>
  (encoding === 'latin1' ? Uint8Array.from(str, (c) => c.charCodeAt(0)) : new TextEncoder().encode(str)).buffer;
const csvRows = (text) => mapTable(parseCsv(text)).rows;

describe('decodeText', () => {
  test('UTF-8 com BOM', () => assert.equal(decodeText(bytes('﻿Nome;Tipo')), 'Nome;Tipo'));
  test('Windows-1252 (CSV do Excel em português)', () => assert.equal(decodeText(bytes('Número;Hidráulica', 'latin1')), 'Número;Hidráulica'));
});

describe('parseCsv', () => {
  test('detecta ponto e vírgula, vírgula e tab', () => {
    for (const d of [';', ',', '\t']) {
      const t = parseCsv(`Nome${d}Tipo\nPrensa${d}Hidráulica`);
      assert.deepEqual(t.map((r) => r.cells), [['Nome', 'Tipo'], ['Prensa', 'Hidráulica']], JSON.stringify(d));
    }
  });
  test('aspas, aspas duplicadas, delimitador e quebra de linha dentro do campo', () => {
    const t = parseCsv('Nome;Tipo\r\n"Torno; CNC";"Peça ""A""\nsegunda linha"\r\n');
    assert.deepEqual(t[1].cells, ['Torno; CNC', 'Peça "A"\nsegunda linha']);
  });
  test('linhas em branco são ignoradas mas a numeração original é preservada', () => {
    const t = parseCsv('Nome;Tipo\n\nPrensa;X\n;;\nTorno;Y\n');
    assert.deepEqual(t.map((r) => r.line), [1, 3, 5]);
  });
  test('campo com quebra de linha avança a numeração das linhas seguintes', () => {
    const t = parseCsv('Nome\n"a\nb"\nfinal');
    assert.deepEqual(t.map((r) => r.line), [1, 2, 4]);
  });
  test('sem quebra de linha final e CR sozinho', () => {
    assert.equal(parseCsv('Nome\rA\rB').length, 3);
    assert.equal(parseCsv('Nome\nA').length, 2);
  });
});

describe('parseNumberBR', () => {
  const casos = [['350', 350], ['1.200', 1200], ['1.234.567', 1234567], ['1.200,5', 1200.5], ['12,5', 12.5], [' 42 ', 42], [7, 7]];
  for (const [entrada, esperado] of casos) test(`${JSON.stringify(entrada)} -> ${esperado}`, () => assert.equal(parseNumberBR(entrada), esperado));
  test('vazio vira undefined; texto não numérico é devolvido para o servidor recusar', () => {
    assert.equal(parseNumberBR(''), undefined);
    assert.equal(parseNumberBR(null), undefined);
    assert.equal(parseNumberBR('abc'), 'abc');
  });
});

describe('parseDate', () => {
  test('formatos brasileiros e ISO', () => {
    assert.equal(parseDate('10/05/2023'), '2023-05-10');
    assert.equal(parseDate('1/2/2023'), '2023-02-01');
    assert.equal(parseDate('10-05-2023'), '2023-05-10');
    assert.equal(parseDate('10.05.2023'), '2023-05-10');
    assert.equal(parseDate('2023-05-10'), '2023-05-10');
  });
  test('Date do XLSX usa componentes UTC (sem deslocar o dia)', () => {
    assert.equal(parseDate(new Date('2023-05-10T00:00:00.000Z')), '2023-05-10');
  });
  test('datas impossíveis ou ambíguas voltam como texto (o servidor acusa o erro)', () => {
    assert.equal(parseDate('31/02/2023'), '31/02/2023');
    assert.equal(parseDate('10/05/23'), '10/05/23');
    assert.equal(parseDate('ontem'), 'ontem');
    assert.equal(parseDate(''), undefined);
  });
});

describe('mapTable', () => {
  test('reconhece cabeçalhos com acento, caixa e pontuação diferentes', () => {
    const rows = csvRows('EQUIPAMENTO;Tipo de Equipamento;Nº de série;Horas Operadas;Data de Início;Fornecedor\nTorno;Usinagem;S1;1.200;10/05/2023;ACME');
    assert.deepEqual(rows, [{ line: 2, name: 'Torno', type: 'Usinagem', serie: 'S1', total_op_time: 1200, data_inicio: '2023-05-10' }]);
  });
  test('informa colunas ignoradas', () => {
    const r = mapTable(parseCsv('Nome;Fornecedor;Cor\nA;B;C'));
    assert.deepEqual(r.ignoredColumns, ['Fornecedor', 'Cor']);
  });
  test('células vazias ficam indefinidas e série numérica vira texto', () => {
    const t = tableFromMatrix([['Nome', 'Número de série', 'Modelo'], ['A', 12345, null]]);
    assert.deepEqual(mapTable(t).rows, [{ line: 2, name: 'A', serie: '12345', model: undefined }]);
  });
  test('sem coluna Nome -> erro claro', () => {
    assert.throws(() => mapTable(parseCsv('Tipo;Modelo\nA;B')), (e) => e instanceof ImportFileError && /coluna "Nome"/.test(e.message));
  });
  test('vazia, só cabeçalho e acima do máximo de linhas -> erros claros', () => {
    assert.throws(() => mapTable([]), /vazia/);
    assert.throws(() => mapTable(parseCsv('Nome')), /só o cabeçalho/);
    const grande = 'Nome\n' + Array.from({ length: MAX_ROWS + 1 }, (_, i) => `A${i}`).join('\n');
    assert.throws(() => mapTable(parseCsv(grande)), new RegExp(`máximo por importação é ${MAX_ROWS}`));
  });
  test('coluna duplicada: a primeira vence', () => {
    assert.equal(csvRows('Nome;Equipamento\nPrimeiro;Segundo')[0].name, 'Primeiro');
  });
});

describe('modelo para download', () => {
  test('o próprio modelo é lido sem erros e gera as linhas de exemplo', () => {
    const { rows, ignoredColumns } = mapTable(parseCsv(decodeText(bytes(buildTemplateCsv()))));
    assert.deepEqual(ignoredColumns, []);
    assert.equal(rows.length, 2);
    assert.deepEqual(rows[0], { line: 2, name: 'Torno CNC 01', type: 'Usinagem', model: 'Romi GL 240', serie: 'SN-0001', total_op_time: 12500, data_inicio: '2021-05-10' });
  });
});

describe('readImportFile', () => {
  const arquivo = (nome, conteudo, tamanho) => ({ name: nome, size: tamanho ?? conteudo.byteLength, arrayBuffer: async () => conteudo });

  test('CSV do Excel brasileiro (Windows-1252, ";", datas e milhares em pt-BR)', async () => {
    const f = arquivo('ativos.CSV', bytes('Nome;Tipo;Horas;Início\r\nCompressor;Hidráulica;1.500;03/11/2022\r\n', 'latin1'));
    const { rows } = await readImportFile(f);
    assert.deepEqual(rows, [{ line: 2, name: 'Compressor', type: 'Hidráulica', total_op_time: 1500, data_inicio: '2022-11-03' }]);
  });
  test('recusa arquivo grande, .xls e formatos desconhecidos', async () => {
    await assert.rejects(readImportFile(arquivo('a.csv', bytes('Nome'), 6 * 1024 * 1024)), /5 MB/);
    await assert.rejects(readImportFile(arquivo('a.xls', bytes('x'))), /\.xls/);
    await assert.rejects(readImportFile(arquivo('a.pdf', bytes('x'))), /Formato não suportado/);
  });
});

describe('XLSX real (fixture gerado fora do Excel, com data formatada)', () => {
  test('texto, número, série numérica e data viram o mesmo formato do CSV', async () => {
    const matrix = await readSheet(new URL('./__fixtures__/ativos.xlsx', import.meta.url).pathname);
    const { rows } = mapTable(tableFromMatrix(matrix));
    assert.deepEqual(rows, [
      { line: 2, name: 'Torno CNC', type: 'Usinagem', serie: '12345', total_op_time: 1200, data_inicio: '2023-05-10' },
      { line: 3, name: 'Prensa', type: 'Hidráulica', serie: 'SN-9', total_op_time: 350, data_inicio: '2021-01-01' },
    ]);
  });
});
