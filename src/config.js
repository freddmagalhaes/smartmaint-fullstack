// Endereço público do sistema, usado nos QR codes. Em produção, defina VITE_PUBLIC_APP_URL no build
// (ex.: https://app.suaempresa.com.br) para que as etiquetas já impressas continuem válidas se o endereço interno mudar.
export const APP_BASE_URL = (import.meta.env.VITE_PUBLIC_APP_URL || window.location.origin).replace(/\/+$/, '');
