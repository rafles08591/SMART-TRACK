// =============================================================
// Genera el texto completo del script de Fase 2 (auto-llenado del
// formulario ALTA CLIENTE en jmdresources), con las credenciales de
// Supabase y el nombre de quien lo copió ya incrustados — mismo patrón
// que el botón "Copiar script de KM".
// =============================================================

export function generarScriptAltaClienteFase2({ supabaseUrl, supabaseAnonKey, staffUsername }) {
  return `// =============================================================
// FASE 2 — Auto-llenado del formulario ALTA CLIENTE en jmdresources
// Generado automáticamente el ${new Date().toLocaleString("es-MX")}
// por: ${staffUsername || "(sin identificar)"}
// =============================================================
// CÓMO USARLO:
// 1. En jmdresources, entra a Gestión de Clientes y abre el formulario
//    "ALTA CLIENTE" (botón "+ NUEVO").
// 2. Abre DevTools → Console, pega TODO este bloque y da Enter.
// 3. Corre: procesarSiguienteAlta()
//    Revisa los campos (sobre todo NUR, Estado y Municipio), corrige
//    si algo no cuadra, y presiona GUARDAR tú mismo — el script no
//    envía el formulario solo, a propósito.
// 4. Cuando ya haya quedado guardado en jmdresources, corre:
//    marcarAltaComoEnviada()
// 5. Repite el paso 3 para la siguiente alta pendiente.
// =============================================================

const SUPABASE_URL = "${supabaseUrl}";
const SUPABASE_ANON_KEY = "${supabaseAnonKey}";
const STAFF_USERNAME = "${(staffUsername || "").replace(/"/g, '\\\\"')}";

const NUR_POR_RUTA = {
  J201: "802878D043",
  J202: "802878D044",
  J203: "802878D045",
  J204: "802878D046",
  J205: "802878D047",
  J206: "802878D048",
  J207: "802878D049",
};

const CAMPOS = {
  clo: "input-72",
  nur: "input-77",
  nombreNegocio: "input-82",
  nombreCliente: "input-85",
  calle: "input-93",
  numero: "input-96",
  numeroInterior: "input-99",
  colonia: "input-102",
  entreCalle1: "input-105",
  entreCalle2: "input-108",
  telefono: "input-111",
  codigoPostal: "input-114",
  estado: "input-117",
  municipio: "input-122",
  volumenSemanal: "input-127",
  coordX: "input-130",
  coordY: "input-133",
  foto: "input-136",
  archivo: "input-143",
  comentario: "input-147",
};

function esperar(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function buscarBotonPorTexto(texto) {
  return Array.from(document.querySelectorAll("button")).find((b) => b.textContent.trim().toUpperCase().includes(texto.toUpperCase()));
}

function llenarTexto(inputId, valor) {
  const input = document.getElementById(inputId);
  if (!input) { console.warn(\`Campo no encontrado: \${inputId}\`); return false; }
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  input.focus();
  setter.call(input, valor === undefined || valor === null ? "" : String(valor));
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  input.blur();
  return true;
}

async function seleccionarAutocomplete(inputId, textoBuscado, esperaMs = 600) {
  if (!textoBuscado) return false;
  const input = document.getElementById(inputId);
  if (!input) { console.warn(\`Campo no encontrado: \${inputId}\`); return false; }
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  input.focus();
  input.click();
  setter.call(input, textoBuscado);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await esperar(esperaMs);
  const candidatos = Array.from(document.querySelectorAll(".v-list-item, .v-list-item__title"));
  const objetivo = String(textoBuscado).trim().toUpperCase();
  let match = candidatos.find((el) => el.textContent.trim().toUpperCase() === objetivo)
    || candidatos.find((el) => el.textContent.trim().toUpperCase().includes(objetivo));
  if (!match) { console.warn(\`No se encontró la opción "\${textoBuscado}" para \${inputId} — selecciónala a mano.\`); return false; }
  const clickable = match.closest(".v-list-item") || match;
  clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await esperar(200);
  return true;
}

async function llenarArchivo(inputId, url, nombreArchivo) {
  if (!url) return false;
  const input = document.getElementById(inputId);
  if (!input) { console.warn(\`Campo de archivo no encontrado: \${inputId}\`); return false; }
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(\`No se pudo descargar el archivo (\${resp.status})\`);
    const blob = await resp.blob();
    const file = new File([blob], nombreArchivo || "archivo", { type: blob.type || "application/octet-stream" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  } catch (e) {
    console.error(\`Error adjuntando \${inputId}:\`, e.message || e);
    console.warn("Tendrás que adjuntar este archivo a mano.");
    return false;
  }
}

async function traerSiguienteAltaPendiente() {
  const url = \`\${SUPABASE_URL}/rest/v1/altas_cliente?estatus=eq.pendiente&order=created_at.asc&limit=1\`;
  const resp = await fetch(url, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: \`Bearer \${SUPABASE_ANON_KEY}\` } });
  if (!resp.ok) throw new Error(\`Error consultando Supabase (\${resp.status})\`);
  const filas = await resp.json();
  return filas[0] || null;
}

async function procesarSiguienteAlta() {
  const alta = await traerSiguienteAltaPendiente();
  if (!alta) { console.log("✅ No hay altas pendientes."); return; }
  console.log(\`Procesando: \${alta.nombre_negocio} (ruta \${alta.ruta_codigo || "sin ruta"})\`);

  if (!document.getElementById(CAMPOS.nombreNegocio)) {
    const btnNuevo = buscarBotonPorTexto("NUEVO");
    if (btnNuevo) { btnNuevo.click(); await esperar(800); }
  }
  if (!document.getElementById(CAMPOS.nombreNegocio)) {
    console.error('No se pudo abrir el formulario "ALTA CLIENTE". Ábrelo tú manualmente y vuelve a correr procesarSiguienteAlta().');
    return;
  }

  const nur = NUR_POR_RUTA[alta.ruta_codigo];
  if (nur) await seleccionarAutocomplete(CAMPOS.nur, nur);
  else console.warn(\`No hay NUR mapeado para la ruta "\${alta.ruta_codigo}" — selecciónalo a mano.\`);

  llenarTexto(CAMPOS.nombreNegocio, alta.nombre_negocio);
  llenarTexto(CAMPOS.nombreCliente, alta.nombre_cliente);
  llenarTexto(CAMPOS.calle, alta.calle);
  llenarTexto(CAMPOS.numero, alta.numero);
  llenarTexto(CAMPOS.numeroInterior, alta.numero_interior);
  llenarTexto(CAMPOS.colonia, alta.colonia);
  llenarTexto(CAMPOS.entreCalle1, alta.entre_calle_1);
  llenarTexto(CAMPOS.entreCalle2, alta.entre_calle_2);
  llenarTexto(CAMPOS.telefono, alta.telefono);
  llenarTexto(CAMPOS.codigoPostal, alta.codigo_postal);
  llenarTexto(CAMPOS.volumenSemanal, alta.volumen_semanal);
  llenarTexto(CAMPOS.coordX, alta.coord_x);
  llenarTexto(CAMPOS.coordY, alta.coord_y);
  llenarTexto(CAMPOS.comentario, alta.comentario);

  if (alta.estado) await seleccionarAutocomplete(CAMPOS.estado, alta.estado);
  if (alta.municipio) await seleccionarAutocomplete(CAMPOS.municipio, alta.municipio);

  await llenarArchivo(CAMPOS.foto, alta.foto_url, "foto.jpg");
  if (alta.archivo_url) await llenarArchivo(CAMPOS.archivo, alta.archivo_url, "archivo");

  window.__altaClienteEnProceso = alta;
  console.log("✅ Formulario llenado. Revisa los campos y presiona GUARDAR tú mismo.");
  console.log('Cuando confirmes que se guardó bien en jmdresources, corre: marcarAltaComoEnviada()');
}

async function marcarAltaComoEnviada() {
  const alta = window.__altaClienteEnProceso;
  if (!alta) { console.warn("No hay ninguna alta en proceso (corre procesarSiguienteAlta() primero)."); return; }
  const resp = await fetch(\`\${SUPABASE_URL}/rest/v1/altas_cliente?id=eq.\${alta.id}\`, {
    method: "PATCH",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: \`Bearer \${SUPABASE_ANON_KEY}\`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ estatus: "enviado", enviado_por: STAFF_USERNAME, enviado_en: new Date().toISOString() }),
  });
  if (!resp.ok) { console.error(\`No se pudo marcar como enviada (\${resp.status}).\`); return; }
  console.log(\`✅ Marcada como enviada: \${alta.nombre_negocio}\`);
  window.__altaClienteEnProceso = null;
}

console.log("Script de Alta de Cliente cargado. Corre procesarSiguienteAlta() para empezar.");
`;
}
