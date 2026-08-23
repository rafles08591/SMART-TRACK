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

function buscarCoincidencia(objetivo) {
  const candidatos = Array.from(document.querySelectorAll(".v-list-item, .v-list-item__title"));
  return (
    candidatos.find((el) => el.textContent.trim().toUpperCase() === objetivo)
    || candidatos.find((el) => el.textContent.trim().toUpperCase().includes(objetivo))
  );
}

// Busca el contenedor con scroll de la lista desplegable abierta (Vuetify
// usa distintas clases según la versión/tipo de campo — se prueban las
// más comunes).
function contenedorListaAbierta() {
  return (
    document.querySelector(".v-menu__content.menuable__content__active .v-select-list")
    || document.querySelector(".v-menu__content.menuable__content__active")
    || document.querySelector(".v-select-list")
  );
}

// El constructor nativo KeyboardEvent NO pone bien keyCode/which (los deja
// en 0) — pero Vuetify 2 internamente revisa esas propiedades viejas para
// reconocer ArrowDown/Enter, no e.key. Sin esto, un keydown sintético de
// "Enter" no significa nada para Vuetify aunque el navegador lo mande bien.
function dispararTecla(el, key, keyCode) {
  // Un tecleo real siempre manda keydown Y keyup — algunos componentes de
  // Vuetify solo reaccionan completo con ambos, no solo con keydown.
  for (const tipo of ["keydown", "keyup"]) {
    const evento = new KeyboardEvent(tipo, { key, code: key, bubbles: true, cancelable: true });
    Object.defineProperty(evento, "keyCode", { get: () => keyCode });
    Object.defineProperty(evento, "which", { get: () => keyCode });
    el.dispatchEvent(evento);
  }
}

// El texto que se ve en la caja NO sirve para saber si Vuetify de verdad
// tomó la selección — ese texto se escribe desde el principio para poder
// buscarlo en la lista, así que se ve "lleno" aunque nunca se haya
// seleccionado nada. La señal real es si sigue apareciendo el mensaje de
// error ("El campo es obligatorio") en el contenedor del campo.
function campoConError(input) {
  const contenedor = input.closest(".v-input") || input.closest(".v-text-field") || input.parentElement?.parentElement;
  if (!contenedor) return false;
  const mensaje = contenedor.querySelector(".v-messages__message");
  return !!(mensaje && mensaje.textContent.trim());
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

  const objetivo = String(textoBuscado).trim().toUpperCase();
  let match = buscarCoincidencia(objetivo);

  // Si no aparece en lo que ya está renderizado, puede ser una lista larga
  // que Vuetify va cargando por partes conforme haces scroll (pasa con
  // catálogos grandes como Municipio). Se hace scroll dentro de la lista
  // buscando la opción, hasta encontrarla o hasta que ya no avance más.
  if (!match) {
    const contenedor = contenedorListaAbierta();
    if (contenedor) {
      let scrollAnterior = -1;
      for (let intento = 0; intento < 25 && !match; intento++) {
        contenedor.scrollTop += contenedor.clientHeight;
        await esperar(150);
        match = buscarCoincidencia(objetivo);
        if (match) break;
        if (contenedor.scrollTop === scrollAnterior) break; // ya no se puede bajar más
        scrollAnterior = contenedor.scrollTop;
      }
    }
  }

  if (!match) { console.warn(\`No se encontró la opción "\${textoBuscado}" para \${inputId} — selecciónala a mano.\`); return false; }
  match.scrollIntoView({ block: "center" });
  await esperar(100);

  // 1) Clic — es lo que ya funcionaba bien para CLO, NUR y Estado, así
  // que va primero para no arriesgar esos campos.
  const clickable = match.closest(".v-list-item") || match;
  clickable.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  clickable.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  await esperar(250);

  const primeraPalabra = objetivo.split(" ")[0];

  // 2) Si después del clic el campo SIGUE mostrando el mensaje de error
  // (no es lo mismo que "el texto no coincide" — puede coincidir y aun
  // así no estar seleccionado de verdad), se intenta por teclado.
  if (campoConError(input)) {
    // OJO: NO se vuelve a hacer clic aquí — eso borraba lo ya escrito y
    // dejaba la lista completa sin filtrar (por eso agarraba cualquier
    // opción, la primera alfabética). Se vuelve a escribir el texto para
    // asegurar que el filtro siga activo justo antes de usar el teclado.
    input.focus();
    setter.call(input, textoBuscado);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await esperar(500);
    dispararTecla(input, "ArrowDown", 40);
    await esperar(400);
    dispararTecla(input, "Enter", 13);
    await esperar(400);
  }

  const valorFinal = String(input.value || "").trim().toUpperCase();
  if (campoConError(input) || !valorFinal || !valorFinal.includes(primeraPalabra)) {
    console.warn(\`No se pudo seleccionar "\${textoBuscado}" para \${inputId} (ni con clic ni con teclado) — selecciónala a mano.\`);
    return false;
  }
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

  // CLO va primero y SIEMPRE — el campo NUR depende de él: mientras no
  // haya CLO seleccionado, NUR no tiene ninguna opción que mostrar (sale
  // "No data available" sin importar qué se busque). Se le da una espera
  // extra después de seleccionar CLO para que la lista de NUR termine de
  // cargar antes de intentar buscar el NUR.
  await seleccionarAutocomplete(CAMPOS.clo, "PUERTO VALLARTA");
  await esperar(900);

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

  // Municipio depende de Estado (igual que NUR dependía de CLO) — sin
  // esperar a que Estado termine de aplicarse, la lista de Municipio
  // puede salir vacía o desactualizada.
  if (alta.estado) {
    await seleccionarAutocomplete(CAMPOS.estado, alta.estado);
    await esperar(900);
  }
  if (alta.municipio) await seleccionarAutocomplete(CAMPOS.municipio, alta.municipio);

  await llenarArchivo(CAMPOS.foto, alta.foto_url, "foto.jpg");
  if (alta.archivo_url) await llenarArchivo(CAMPOS.archivo, alta.archivo_url, "archivo");

  window.__altaClienteEnProceso = alta;
  console.log("✅ Formulario llenado. Revisa los campos y presiona GUARDAR tú mismo.");
  console.log('Cuando el RP te dé el folio de confirmación, corre: marcarAltaComoEnviada()');
}

async function marcarAltaComoEnviada() {
  const alta = window.__altaClienteEnProceso;
  if (!alta) { console.warn("No hay ninguna alta en proceso (corre procesarSiguienteAlta() primero)."); return; }
  const folio = window.prompt(\`Folio que dio el RP para "\${alta.nombre_negocio}":\`);
  if (!folio || !folio.trim()) { console.warn("No se marcó como enviada — se canceló o no se dio un folio."); return; }
  const resp = await fetch(\`\${SUPABASE_URL}/rest/v1/altas_cliente?id=eq.\${alta.id}\`, {
    method: "PATCH",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: \`Bearer \${SUPABASE_ANON_KEY}\`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ estatus: "enviado", enviado_por: STAFF_USERNAME, enviado_en: new Date().toISOString(), folio_rp: folio.trim() }),
  });
  if (!resp.ok) { console.error(\`No se pudo marcar como enviada (\${resp.status}).\`); return; }
  console.log(\`✅ Marcada como enviada: \${alta.nombre_negocio} — Folio RP: \${folio.trim()}\`);
  window.__altaClienteEnProceso = null;

  // Pasa sola a la siguiente alta pendiente — así en toda la sesión solo
  // hace falta escribir marcarAltaComoEnviada() cada vez, nunca
  // procesarSiguienteAlta().
  await procesarSiguienteAlta();
}

// Doble Enter (dos toques seguidos, en menos de 700ms) en la página del RP
// marca la alta actual como enviada — sin tener que volver a la consola a
// escribir marcarAltaComoEnviada(). Se ignora si el Enter fue dentro de un
// campo de texto/select (para no chocar con la selección de CLO, NUR,
// Estado o Municipio, que también usan Enter para elegir la opción).
let __ultimoEnterAlta = 0;
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  const activo = document.activeElement;
  const enCampo = activo && ["INPUT", "TEXTAREA", "SELECT"].includes(activo.tagName);
  if (enCampo) { __ultimoEnterAlta = 0; return; }
  const ahora = Date.now();
  if (ahora - __ultimoEnterAlta < 700) {
    __ultimoEnterAlta = 0;
    marcarAltaComoEnviada();
  } else {
    __ultimoEnterAlta = ahora;
  }
});

console.log("Script de Alta de Cliente cargado — arrancando solo, sin necesidad de escribir nada.");
console.log("Tip: doble Enter (fuera de un campo) marca la alta actual como enviada, sin escribir nada.");
procesarSiguienteAlta();
`;
}
