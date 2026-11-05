// QR codes dos ativos: o QR colado na máquina abre a ficha dela no sistema (/ativo/:id).
// Funções puras (sem React/DOM), exceto printLabels, que abre a janela de impressão.
import QRCode from 'qrcode';

export const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** URL que o QR code carrega. `base` é o endereço público do sistema (sem barra final). */
export const assetUrl = (base, id) => `${String(base).replace(/\/+$/, '')}/ativo/${encodeURIComponent(id)}`;

/** Imagem PNG (data URL) de um QR code com correção de erros média (aguenta etiqueta suja/arranhada). */
export const qrDataUrl = (text, width = 320) =>
  QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 1, width });

/** HTML da folha de etiquetas para impressão. Todo texto de ativo passa por escapeHtml. */
export const buildLabelsHtml = (labels, title = 'Etiquetas QR') => `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title>
<style>
  @page { margin: 8mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; color: #111; }
  .sheet { display: flex; flex-wrap: wrap; gap: 4mm; }
  .label { width: 60mm; height: 72mm; border: 0.3mm dashed #999; border-radius: 2mm; padding: 3mm; text-align: center; break-inside: avoid; page-break-inside: avoid; display: flex; flex-direction: column; align-items: center; justify-content: space-between; }
  .label img { width: 44mm; height: 44mm; }
  .name { font-size: 11pt; font-weight: 700; line-height: 1.15; word-break: break-word; }
  .meta { font-size: 8pt; color: #444; }
  .brand { font-size: 7pt; color: #777; letter-spacing: 0.5px; }
  @media screen { body { padding: 8mm; } }
</style></head><body><div class="sheet">
${labels.map((l) => `<div class="label">
  <img src="${escapeHtml(l.qr)}" alt="QR code de ${escapeHtml(l.name)}">
  <div class="name">${escapeHtml(l.name)}</div>
  <div class="meta">${l.serie ? `Série: ${escapeHtml(l.serie)}` : ''}${l.serie && l.tag ? ' • ' : ''}${l.tag ? escapeHtml(l.tag) : ''}</div>
  <div class="brand">SmartMaint • #${escapeHtml(l.id)}</div>
</div>`).join('\n')}
</div></body></html>`;

/**
 * Abre uma janela com as etiquetas e dispara a impressão.
 * A janela é aberta ANTES de gerar os QR (o navegador só permite pop-up em resposta direta ao clique).
 * Retorna false se o navegador bloqueou o pop-up.
 */
export const printLabels = async (assets, base) => {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write('<p style="font-family:Arial;padding:16px">Gerando etiquetas…</p>');
  try {
    const labels = await Promise.all(
      assets.map(async (a) => ({ id: a.id, name: a.name, serie: a.serie, tag: a.type, qr: await qrDataUrl(assetUrl(base, a.id)) }))
    );
    win.document.open();
    win.document.write(buildLabelsHtml(labels));
    win.document.close();
    // espera as imagens carregarem antes de imprimir
    win.addEventListener('load', () => { win.focus(); win.print(); });
    return true;
  } catch (err) {
    win.close();
    throw err;
  }
};
