import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { assetUrl, qrDataUrl, buildLabelsHtml, escapeHtml } from './qr.js';

describe('assetUrl', () => {
  test('monta /ativo/:id e ignora barras finais na base', () => {
    assert.equal(assetUrl('https://app.exemplo.com.br', 42), 'https://app.exemplo.com.br/ativo/42');
    assert.equal(assetUrl('https://app.exemplo.com.br///', 7), 'https://app.exemplo.com.br/ativo/7');
    assert.equal(assetUrl('http://localhost:3001', '5'), 'http://localhost:3001/ativo/5');
  });
  test('id é codificado (não permite quebrar o caminho da URL)', () => {
    assert.equal(assetUrl('https://x.com', '1/../admin'), 'https://x.com/ativo/1%2F..%2Fadmin');
  });
});

describe('qrDataUrl', () => {
  test('gera um PNG em data URL', async () => {
    const url = await qrDataUrl('https://app.exemplo.com.br/ativo/42');
    assert.match(url, /^data:image\/png;base64,[A-Za-z0-9+/]+=*$/);
    assert.ok(url.length > 500);
  });
  test('textos diferentes geram imagens diferentes', async () => {
    assert.notEqual(await qrDataUrl('https://x.com/ativo/1'), await qrDataUrl('https://x.com/ativo/2'));
  });
});

describe('buildLabelsHtml', () => {
  test('escapa nome, série e tipo: nada de HTML/JS vindo do cadastro entra na folha impressa', () => {
    const html = buildLabelsHtml([{ id: 1, name: '<img src=x onerror=alert(1)>"Prensa" & Cia', serie: '<script>alert(2)</script>', tag: "O'Brien", qr: 'data:image/png;base64,AAAA' }]);
    assert.ok(!html.includes('<img src=x'), 'tag injetada no nome');
    assert.ok(!html.includes('<script>alert'), 'script injetado na série');
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;&quot;Prensa&quot; &amp; Cia'));
    assert.ok(html.includes('O&#39;Brien'));
  });
  test('o atributo src do QR também é escapado (não permite fechar o atributo)', () => {
    const html = buildLabelsHtml([{ id: 1, name: 'A', qr: 'x" onerror="alert(1)' }]);
    assert.ok(!html.includes('onerror="alert(1)"'));
    assert.ok(html.includes('&quot; onerror=&quot;alert(1)'));
  });
  test('uma etiqueta por ativo e título escapado', () => {
    const html = buildLabelsHtml([{ id: 1, name: 'A', qr: 'q1' }, { id: 2, name: 'B', qr: 'q2' }, { id: 3, name: 'C', qr: 'q3' }], '<b>Etiquetas</b>');
    assert.equal((html.match(/class="label"/g) || []).length, 3);
    assert.ok(html.includes('<title>&lt;b&gt;Etiquetas&lt;/b&gt;</title>'));
  });
  test('série e tipo ausentes não deixam "Série:" nem separador soltos', () => {
    const html = buildLabelsHtml([{ id: 9, name: 'Sem dados', qr: 'q' }]);
    assert.ok(!html.includes('Série:'));
    assert.ok(html.includes('<div class="meta"></div>'));
  });
});

describe('escapeHtml', () => {
  test('trata null/undefined/números', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
    assert.equal(escapeHtml(12), '12');
  });
});
