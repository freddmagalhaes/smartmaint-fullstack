import QRCode from 'qrcode';

/** Endereço gravado no QR Code: abre a ficha do equipamento no SmartMaint. */
export const equipmentUrl = (id) => `${window.location.origin}/equipamento/${id}`;

/** QR Code como imagem (data URL). Correção de erro "M" tolera etiquetas um pouco gastas. */
export const qrDataUrl = (text, size = 240) => QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' });
