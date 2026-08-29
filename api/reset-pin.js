// api/reset-pin.js
// Función serverless de Vercel. Deja que SOLO un usuario con puesto "gerente"
// restablezca el PIN (contraseña de Supabase Auth) de cualquier otro usuario
// de la app, sin depender de correos reales ni del panel de Supabase.
//
// Requiere DOS variables de entorno nuevas en Vercel (Settings → Environment
// Variables), además de la que ya tienes para el coach:
//   SUPABASE_URL              → la URL de tu proyecto (la misma que usa el frontend)
//   SUPABASE_SERVICE_ROLE_KEY → Project Settings → API → "service_role" key
//                               (la secreta — jamás la pongas en el frontend)
//
// Body esperado (POST), enviado desde ResetPinView.jsx:
// {
//   targetUsername: "SUPLENTE-1",   // tal cual está en la columna username de profiles
//   newPassword: "1234"
// }
// Header esperado: Authorization: Bearer <access_token del Gerente ya logueado>

import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Método no permitido" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Falta configurar SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en Vercel." });
  }

  const authHeader = req.headers.authorization || "";
  const callerToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!callerToken) {
    return res.status(401).json({ error: "Falta la sesión del usuario que hace la petición." });
  }

  const { targetUsername, newPassword } = req.body || {};
  if (!targetUsername || !newPassword) {
    return res.status(400).json({ error: "Faltan datos (usuario o PIN nuevo)." });
  }
  if (String(newPassword).length < 4) {
    return res.status(400).json({ error: "El PIN nuevo debe tener al menos 4 dígitos." });
  }

  // Cliente con la service_role key: puede todo, por eso solo vive aquí en
  // el servidor y solo después de verificar quién llama.
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1) ¿El token pertenece a un usuario real y con sesión válida?
    const { data: callerData, error: callerErr } = await supabaseAdmin.auth.getUser(callerToken);
    if (callerErr || !callerData?.user) {
      console.error("Fallo al validar token del que llama:", callerErr);
      return res.status(401).json({
        error: "Sesión inválida o expirada. Vuelve a iniciar sesión e intenta de nuevo.",
        detalle_temporal: callerErr?.message || "sin detalle",
      });
    }

    // 2) ¿Ese usuario es Gerente? (se revisa en la tabla profiles, no en el token)
    const { data: callerProfile, error: perfilErr } = await supabaseAdmin
      .from("profiles")
      .select("role, puesto")
      .eq("id", callerData.user.id)
      .maybeSingle();
    if (perfilErr || !callerProfile) {
      return res.status(403).json({ error: "No se encontró tu perfil." });
    }
    const esGerente = callerProfile.role === "staff" && callerProfile.puesto === "gerente";
    if (!esGerente) {
      return res.status(403).json({ error: "Solo el Gerente puede restablecer PINs." });
    }

    // 3) Busca al usuario objetivo por su username exacto.
    const { data: targetProfile, error: targetErr } = await supabaseAdmin
      .from("profiles")
      .select("id, username")
      .eq("username", targetUsername)
      .maybeSingle();
    if (targetErr || !targetProfile) {
      return res.status(404).json({ error: `No se encontró ningún usuario con username "${targetUsername}".` });
    }

    // 4) Cambia la contraseña directamente vía la API de administración.
    const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(targetProfile.id, {
      password: String(newPassword),
    });
    if (updateErr) {
      console.error("Error actualizando password:", updateErr);
      return res.status(500).json({ error: "No se pudo actualizar el PIN. Intenta de nuevo." });
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error("Error en reset-pin:", e);
    return res.status(500).json({ error: "Error inesperado del servidor." });
  }
}
