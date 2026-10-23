// api/remision-ocr.js — Lee una foto de remisión/factura (OCR.space) y regresa las palabras con
// su posición, para que el módulo Almacén ubique cada renglón y le escriba el código FA.
//
//   POST /api/remision-ocr   { imagen: "data:image/jpeg;base64,..." }   (máx ~1 MB, la app la comprime)
//   Authorization: Bearer <sesión de SMART-TRACK>   (solo usuarios con sesión)
//   → { palabras: [{ t, x, y, w, h }], texto, ancho?, alto? }
//
// Variables: OCR_SPACE_KEY (si no está, usa la misma llave del OCR del captcha),
//            SUPABASE_URL / VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (para validar la sesión).

export const config = { runtime: 'edge' };

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const OCR_KEY = process.env.OCR_SPACE_KEY || 'K83954697488957';

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function sesionValida(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token || !SUPABASE_URL || !SERVICE_KEY) return false;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  return r.ok;
}

export default async function handler(req) {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  if (!(await sesionValida(req))) return json({ error: 'Tu sesión expiró. Vuelve a iniciar sesión.' }, 401);
  let body = {};
  try { body = await req.json(); } catch { /* vacío */ }
  const imagen = String(body.imagen || '');
  if (!imagen.startsWith('data:image/')) return json({ error: 'Falta la imagen' }, 400);

  const form = new URLSearchParams();
  form.set('apikey', OCR_KEY);
  form.set('base64Image', imagen);
  form.set('language', 'spa');
  form.set('isOverlayRequired', 'true');
  form.set('OCREngine', '2');
  form.set('scale', 'true');

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 55000);
    const r = await fetch('https://api.ocr.space/parse/image', {
      method: 'POST', body: form, signal: ctrl.signal,
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    clearTimeout(t);
    const j = await r.json();
    if (j.IsErroredOnProcessing) return json({ error: 'OCR: ' + [].concat(j.ErrorMessage || 'no se pudo leer').join(' ') }, 502);
    const res = j.ParsedResults?.[0];
    const palabras = [];
    for (const l of res?.TextOverlay?.Lines || []) {
      for (const w of l.Words || []) {
        palabras.push({ t: w.WordText, x: w.Left, y: w.Top, w: w.Width, h: w.Height });
      }
    }
    return json({ palabras, texto: res?.ParsedText || '' });
  } catch (e) {
    return json({ error: 'No se pudo leer la imagen: ' + (e?.name === 'AbortError' ? 'el OCR tardó demasiado' : e?.message || e) }, 502);
  }
}
