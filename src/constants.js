// @ts-nocheck
// Constantes compartidas de SMART-TRACK

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
  { key: "max", label: "MAX", unit: "units" },
  { key: "open", label: "OPEN", unit: "units" },
  { key: "champions", label: "CHAMPIONS", unit: "units" },
  { key: "mesa", label: "MESA DE CONTROL", unit: "special" },
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

export const USERS = [
  ...RUTAS.map((u) => ({ username: u, password: "1234", role: "vendedor" })),
  { username: "SUPERVISOR-1", password: "3030", role: "staff", puesto: "supervisor" },
  { username: "SUPERVISOR-2", password: "4545", role: "staff", puesto: "supervisor2" },
  { username: "GERENTE", password: "1547", role: "staff", puesto: "gerente" },
  { username: "LIQUIDACION- SULEMA PONCE", password: "7625", role: "liquidacion" },
  { username: "MERCH07", password: "2220", role: "merch" },
  { username: "MERCH28", password: "2220", role: "merch" },
  { username: "MERCH29", password: "2220", role: "merch" },
  { username: "MERCH30", password: "2220", role: "merch" },
  // --- CLO TEPIC ---
  { username: "MERCH04", password: "3049", role: "merch" },
  { username: "MERCH31", password: "3049", role: "merch" },
  { username: "MERCH32", password: "3049", role: "merch" },
  { username: "MERCH62", password: "3049", role: "merch" },
  { username: "MERCH63", password: "3049", role: "merch" },
  // --- FACTURACIÓN ---
  { username: "ADMIN", password: "6748", role: "admin" },
];

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
