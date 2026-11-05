import { useEffect, useState } from 'react';
import { equipmentUrl, qrDataUrl } from '../utils/qrcode';

/** QR Code que abre a ficha do equipamento. */
const EquipmentQr = ({ id, size = 160, label }) => {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let cancelled = false;
    qrDataUrl(equipmentUrl(id), size * 2).then((url) => { if (!cancelled) setSrc(url); });
    return () => { cancelled = true; };
  }, [id, size]);
  return src
    ? <img src={src} width={size} height={size} alt={label ? `QR Code de ${label}` : 'QR Code do equipamento'} style={{ display: 'block' }} />
    : <div style={{ width: size, height: size }} />;
};

export default EquipmentQr;
