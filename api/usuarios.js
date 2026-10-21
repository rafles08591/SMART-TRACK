// api/usuarios.js — Alta / baja / PIN de usuarios de SMART-TRACK desde la app.
//
// Los usuarios viven en Supabase Auth (correo <usuario>@smarttrack.local, contraseña = PIN)
// + su renglón en la tabla "profiles" (username, role, puesto, active), igual que los de siempre.
// Los que se crean aquí llevan en user_metadata { app_usuario: true, nombre, grupo, clo, puesto_label }
// para que el Login los muestre solos y para que solo esos se puedan eliminar desde la app.
//
//   GET  /api/usuarios?accion=login            → público: usuarios activos para pintar el Login
//   POST /api/usuarios  (Authorization: Bearer <sesión del GERENTE>)
//        { accion: 'listar' }
//        { accion: 'crear', username, nombre, pin, tipo: 'staff'|'merch', puesto, puesto_label, clo }
//        { accion: 'pin', username, pin }
//        { accion: 'activar', username, activo: true|false }
//        { accion: 'eliminar', username }
//
// Variables (las mismas que ya usa Robotina): SUPABASE_URL (o VITE_SUPABASE_URL), SUPABASE_SERVICE_ROLE_KEY.

export const config = { runtime: 'edge' };

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Puestos que ya existen en el código: no se pueden reusar para usuarios nuevos
const PUESTOS_RESERVADOS = ['gerente', 'supervisor', 'supervisor2', 'suplente1', 'suplente2', 'admin', 'liquidacion'];

function headersServicio(extra = {}) {
  const h = { apikey: SERVICE_KEY, 'Content-Type': 'application/json', ...extra };
  if (!SERVICE_KEY.startsWith('sb_')) h.Authorization = `Bearer ${SERVICE_KEY}`;
  return h;
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
});

async function llamar(path, opciones = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...opciones, headers: headersServicio(opciones.headers) });
  const texto = await res.text();
  let cuerpo = null;
  try { cuerpo = texto ? JSON.parse(texto) : null; } catch { cuerpo = texto; }
  if (!res.ok) {
    const msg = (cuerpo && (cuerpo.msg || cuerpo.message || cuerpo.error_description || cuerpo.error)) || texto || res.status;
    throw new Error(String(msg));
  }
  return cuerpo;
}

// "Almacén 1" → "ALMACEN-1"; correo "almacen-1@smarttrack.local"
const limpiarUsuario = (u) => String(u || '').trim().toUpperCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const correoDe = (username) => `${username.toLowerCase()}@smarttrack.local`;
const slugPuesto = (p) => String(p || '').trim().toLowerCase()
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

// Todos los usuarios creados desde la app (Auth + profiles)
async function usuariosApp() {
  const lista = [];
  for (let page = 1; page <= 20; page++) {
    const r = await llamar(`/auth/v1/admin/users?page=${page}&per_page=200`);
    const users = r?.users || [];
    lista.push(...users.filter((u) => u.user_metadata?.app_usuario));
    if (users.length < 200) break;
  }
  if (!lista.length) return [];
  const ids = lista.map((u) => u.id).join(',');
  const perfiles = await llamar(`/rest/v1/profiles?id=in.(${ids})&select=*`);
  const porId = Object.fromEntries((perfiles || []).map((p) => [p.id, p]));
  return lista.map((u) => {
    const m = u.user_metadata || {};
    const p = porId[u.id] || {};
    return {
      id: u.id,
      username: p.username || m.username,
      email: u.email,
      nombre: m.nombre || p.username || m.username,
      tipo: m.grupo || (p.role === 'merch' ? 'merch' : 'staff'),
      clo: m.clo || null,
      role: p.role || null,
      puesto: p.puesto || null,
      puesto_label: m.puesto_label || p.puesto || '',
      activo: p.active !== false,
      creado: u.created_at,
      ultimo_acceso: u.last_sign_in_at || null,
    };
  }).sort((a, b) => String(a.username).localeCompare(String(b.username)));
}

// Quien llama debe tener sesión y ser GERENTE (se revisa contra profiles, no contra lo que diga el navegador)
async function esGerente(req) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${token}` } });
  if (!r.ok) return null;
  const u = await r.json();
  const perfiles = await llamar(`/rest/v1/profiles?id=eq.${u.id}&select=*`);
  const p = perfiles?.[0];
  return p && p.active !== false && p.puesto === 'gerente' ? p : null;
}

async function buscarApp(username) {
  const todos = await usuariosApp();
  return todos.find((u) => u.username === username) || null;
}

export default async function handler(req) {
  if (!SUPABASE_URL || !SERVICE_KEY) return json({ error: 'Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Vercel' }, 500);
  const url = new URL(req.url);

  try {
    // Público: lo que necesita el Login (sin datos sensibles)
    if (req.method === 'GET') {
      if (url.searchParams.get('accion') !== 'login') return json({ error: 'Acción no válida' }, 400);
      const lista = (await usuariosApp()).filter((u) => u.activo).map((u) => ({
        username: u.username, email: u.email, nombre: u.nombre, tipo: u.tipo, clo: u.clo, puesto_label: u.puesto_label,
      }));
      return new Response(JSON.stringify({ usuarios: lista }), {
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=30' },
      });
    }
    if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

    const gerente = await esGerente(req);
    if (!gerente) return json({ error: 'Solo el Gerente puede administrar usuarios. Vuelve a iniciar sesión.' }, 403);

    let body = {};
    try { body = await req.json(); } catch { /* vacío */ }
    const accion = body.accion;

    if (accion === 'listar') return json({ usuarios: await usuariosApp() });

    if (accion === 'crear') {
      const username = limpiarUsuario(body.username);
      const nombre = String(body.nombre || '').trim();
      const pin = String(body.pin || '').replace(/\D/g, '');
      const tipo = body.tipo === 'merch' ? 'merch' : 'staff';
      const puesto = tipo === 'merch' ? 'merch' : slugPuesto(body.puesto || 'almacen');
      if (!username) return json({ error: 'Escribe el usuario' }, 400);
      if (!nombre) return json({ error: 'Escribe el nombre' }, 400);
      if (pin.length !== 4) return json({ error: 'El PIN debe ser de 4 dígitos' }, 400);
      if (tipo === 'staff' && (!puesto || PUESTOS_RESERVADOS.includes(puesto))) {
        return json({ error: `El puesto "${puesto}" ya existe en la app; usa otro (p. ej. almacen)` }, 400);
      }
      if (tipo === 'merch' && !body.clo) return json({ error: 'Elige el CLO del Merch' }, 400);
      const yaHay = await llamar(`/rest/v1/profiles?username=eq.${encodeURIComponent(username)}&select=id`);
      if (yaHay?.length) return json({ error: `Ya existe un usuario ${username}` }, 409);

      const creado = await llamar('/auth/v1/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          email: correoDe(username),
          password: pin,
          email_confirm: true,
          user_metadata: {
            app_usuario: true, username, nombre, grupo: tipo, clo: tipo === 'merch' ? body.clo : null,
            puesto_label: String(body.puesto_label || '').trim() || (tipo === 'merch' ? `Merch · CLO ${body.clo}` : 'Almacén'),
            creado_por: gerente.username || 'GERENTE',
          },
        }),
      });
      const id = creado?.id || creado?.user?.id;
      try {
        // upsert por si un trigger de Supabase ya creó el renglón
        await llamar('/rest/v1/profiles', {
          method: 'POST',
          headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ id, username, role: tipo, puesto, active: true }),
        });
      } catch (e) {
        // Si no se pudo crear el perfil, se deshace el usuario para no dejarlo a medias
        await llamar(`/auth/v1/admin/users/${id}`, { method: 'DELETE' }).catch(() => {});
        return json({ error: 'No se pudo crear el perfil: ' + e.message }, 500);
      }
      return json({ ok: true, usuario: await buscarApp(username) });
    }

    const username = limpiarUsuario(body.username);
    const u = await buscarApp(username);
    if (!u) return json({ error: 'Ese usuario no se creó desde la app; los de siempre se manejan en "Reiniciar PIN".' }, 404);

    if (accion === 'pin') {
      const pin = String(body.pin || '').replace(/\D/g, '');
      if (pin.length !== 4) return json({ error: 'El PIN debe ser de 4 dígitos' }, 400);
      await llamar(`/auth/v1/admin/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ password: pin }) });
      return json({ ok: true });
    }
    if (accion === 'activar') {
      await llamar(`/rest/v1/profiles?id=eq.${u.id}`, {
        method: 'PATCH', headers: { Prefer: 'return=minimal' }, body: JSON.stringify({ active: !!body.activo }),
      });
      return json({ ok: true });
    }
    if (accion === 'eliminar') {
      await llamar(`/rest/v1/profiles?id=eq.${u.id}`, { method: 'DELETE', headers: { Prefer: 'return=minimal' } }).catch(() => {});
      await llamar(`/auth/v1/admin/users/${u.id}`, { method: 'DELETE' });
      return json({ ok: true });
    }
    return json({ error: 'Acción no válida' }, 400);
  } catch (e) {
    return json({ error: 'Error: ' + (e?.message || e) }, 500);
  }
}
