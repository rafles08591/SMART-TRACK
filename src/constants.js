// @ts-nocheck
// Constantes compartidas de SMART-TRACK
// ⚠️ Ya no contiene contraseñas. La autenticación se maneja 100% con Supabase Auth.

export const STATE_ID = "main";
export const SPLASH_IMAGE = "/splash.jpg";

export const RUTAS = ["J201","J202","J203","J204","J205","J206","J207"].map((n) => `RUTA ${n}`);

export const NOMBRES = {
  "RUTA J201": "Francisco Javier",
  "RUTA J202": "Riqui Martín",
  "RUTA J203": "Ana Paola",
  "RUTA J204": "Noema Natalia",
  "RUTA J205": "Manuel",
  "RUTA J206": "Selene",
  "RUTA J207": "Alfredo Juárez",
  "SUPERVISOR-1": "Christian Velasco",
  "SUPERVISOR-2": "Modesto Chavarín",
  "GERENTE": "Rafael Gallardo",
  "LIQUIDACION- SULEMA PONCE": "Sulema Ponce",
  "ADMIN": "Ceci Brambilia",
};

export const OBJETIVO_TABS = [
  { key: "dia", label: "DÍA", unit: "special" },
  { key: "escalera", label: "ESCALERA", unit: "special" },
  { key: "mesa", label: "MESA DE CONTROL", unit: "special" },
  { key: "carreras", label: "CARRERA", unit: null },
  { key: "scorecard", label: "SCORECARD SEMANAL", unit: "special" },
  { key: "max", label: "MAX", unit: "units" },
  { key: "open", label: "OPEN", unit: "units" },
  { key: "champions", label: "CHAMPIONS", unit: "units" },
  { key: "cuponera", label: "CUPONERA", unit: "special" },
  { key: "tiempos", label: "TIEMPOS", unit: "special" },
  { key: "unidades", label: "UNIDADES", unit: "special" },
  { key: "nomina", label: "NOMINA", unit: "special" },
  { key: "sin_visita", label: "SIN VISITA", unit: "special" },
  { key: "actividad", label: "ACTIVIDAD", unit: "special" },
  { key: "reloj_checador", label: "RELOJ CHECADOR", unit: "special" },
  { key: "km", label: "KM", unit: "special" },
  { key: "tepic", label: "TEPIC", unit: "special" },
  { key: "rutas", label: "RUTAS", unit: "special" },
  { key: "actividades_dia", label: "ACTIVIDADES DÍA", unit: "special" },
  { key: "actividades_semana", label: "ACTIVIDADES SEMANA", unit: "special" },
  { key: "actividades_mes", label: "ACTIVIDADES MES", unit: "special" },
  { key: "cotizador", label: "COTIZADOR", unit: "special" },
  { key: "rally_otc", label: "RALLY OTC", unit: "special" },
  { key: "avisos", label: "AVISOS", unit: "special" },
  { key: "facturas", label: "FACTURAS", unit: "special" },
  { key: "creditos", label: "CRÉDITOS", unit: "special" },
  { key: "cargas", label: "CARGAS", unit: "special" },
  { key: "pwst", label: "PWST", unit: "special" },
  { key: "mi_fondo", label: "MI FONDO", unit: "special" },
  { key: "cartera_vencida", label: "CARTERA VENCIDA", unit: "special" },
  { key: "alta_cliente", label: "ALTA CLIENTE", unit: "special" },
  { key: "altas_cliente", label: "ALTAS DE CLIENTE", unit: "special" },
  { key: "otc_ventas", label: "OTC VENTAS", unit: "special" },
  { key: "reset_pin", label: "RESTABLECER PIN", unit: "special" },
  { key: "permisos", label: "PERMISOS", unit: "special" },
  { key: "promociones_coach", label: "PROMOS PARA COACH", unit: "special" },
];

// Lista compartida de usuarios de la app (para el buscador de Restablecer
// PIN y el de Permisos). Si agregas un usuario nuevo en Supabase, agrégalo
// aquí también para que aparezca en esos buscadores.
export const USUARIOS_APP = [
  ...RUTAS.map((r) => ({ username: r, label: `${r.replace("RUTA ", "")} - ${NOMBRES[r] || r}` })),
  { username: "SUPERVISOR-1", label: `Supervisor 1${NOMBRES["SUPERVISOR-1"] ? " - " + NOMBRES["SUPERVISOR-1"] : ""}` },
  { username: "SUPERVISOR-2", label: `Supervisor 2${NOMBRES["SUPERVISOR-2"] ? " - " + NOMBRES["SUPERVISOR-2"] : ""}` },
  { username: "SUPLENTE-1", label: "Suplente 1" },
  { username: "SUPLENTE-2", label: "Suplente 2" },
  { username: "LIQUIDACION- SULEMA PONCE", label: "Liquidación" },
  { username: "ADMIN", label: "Admin" },
  { username: "MERCH07", label: "MERCH07" },
  { username: "MERCH28", label: "MERCH28" },
  { username: "MERCH29", label: "MERCH29" },
  { username: "MERCH30", label: "MERCH30" },
  { username: "MERCH04", label: "MERCH04" },
  { username: "MERCH31", label: "MERCH31" },
  { username: "MERCH32", label: "MERCH32" },
  { username: "MERCH62", label: "MERCH62" },
  { username: "MERCH63", label: "MERCH63" },
];

export const MARCA_KEYS = { "ice mix": "iceMix", "bloss mix": "blossMix", "summ mix": "summMix", "faronet": "faronet" };
export const MARCA_KEYS_ALL = { ...MARCA_KEYS, "otc": "otc" };

export const MARCAS_OPEN = [
  { key: "iceMix", label: "ICE MIX" },
  { key: "blossMix", label: "BLOSS MIX" },
  { key: "summMix", label: "SUMM MIX" },
  { key: "faronet", label: "FARONET" },
];
export const MARCAS_CHAMPIONS = [
  { key: "champIce", label: "CHAM_ICE" },
  { key: "champBlossSumm", label: "CHAM_BLOSS-SUMM" },
  { key: "champFaronet", label: "CHAM_FARONET" },
];
export const MARCAS_DIA = [
  { key: "iceMix", label: "ICE MIX" },
  { key: "blossMix", label: "BLOSSOM MIX" },
  { key: "summMix", label: "SUMMER MIX" },
  { key: "faronet", label: "FARONET" },
];

export const UMBRAL_BAJO_DESEMPENO = 0.5;
export const UMBRAL_HORAS_EN_RUTA = 7;
export const UMBRAL_MS_EN_RUTA = UMBRAL_HORAS_EN_RUTA * 60 * 60 * 1000;
export const UMBRAL_VISITAS_EFECTIVAS_MC = {
  J201: 39, J202: 41, J203: 41, J204: 41, J205: 41, J206: 41, J207: 39,
};
export const DIAS_CICLO_CREDITOS = 15;

export const ARTICULO_MARCA_LABEL = {
  FA01085: "ICE MIX",
  FA01114: "BLOSS MIX",
  FA01115: "SUMM MIX",
  FA04016: "FARONET",
  FA04017: "FARONET",
  FA15010: "FARONET",
  FA15009: "FARONET",
  FA04505: "CHAM EXTRA BLOSS SUMM",
};
export const MARCA_CHAM_EXTRA_BLOSS_SUMM = "cham extra bloss summ";

export const CODIGOS_OTC_SIN_VUALA = [
  "0065", "0073", "0079", "0080", "0088", "0096", "0097", "0098", "0099", "0118",
  "0123", "0134", "0136", "0140", "0141", "0155", "0156", "0157", "0158", "0159",
  "0160", "0163", "0181", "0175", "0206", "0207", "0281", "0176", "0290", "0300",
  "0301", "0302", "0304", "0305", "0306", "0307", "0317", "0319", "0321", "0322",
  "0323", "0324", "0320", "0291", "0292", "0293", "0294", "0295", "0296",
];
export const OTC_SIN_VUALA_MINIMO = 2;

// ============================================================
// USERS ELIMINADO
// Las contraseñas ya no viven en el frontend.
// La autenticación se hace exclusivamente con Supabase Auth.
// ============================================================

export const TABLA_COMISION_SUPERVISOR = [
  { desde: 2000, mult: 2.0 },
  { desde: 1600, mult: 1.5 },
  { desde: 0, mult: 1.0 },
];
export const TABLA_COMISION_GERENTE = [
  { desde: 2000, mult: 2.5 },
  { desde: 1600, mult: 2.0 },
  { desde: 0, mult: 1.5 },
];
export const DIAS_SEMANA_OTC = 6;

export const ACTIVIDADES_INICIALES = {
  dia: [
    "Marcar llegada CLO, salida a ruta",
    "Conteos matutinos",
    "Registro de KM",
    "Seguimiento a rutas",
    "Mesa de control 1",
    "Mesa de control 2",
  ],
  mes: [
    "Nómina mínima esperada",
    "Inventario puerta cerrada",
  ],
  semana: [
    "Arqueo de créditos",
    "Arqueo resguardo",
    "Feedback nómina",
  ],
};

export const DIAS_SEMANA_VISITAS_KEYS = [null, "lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
export const DIAS_SEMANA_VISITAS = ["lunes", "martes", "miercoles", "jueves", "viernes", "sabado"];
export const TZ_MX = "America/Mexico_City";
