const MESES = [
  "",
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];

const TIPOS_AGENDA_BLOQUEANTES = [
  "Lectura / Firma de Sentencia",
  "Audiencia de Debate",
  "Audiencia Preliminar",
  "Nueva Audiencia Preliminar",
  "Audiencia de Visu",
  "Audiencia de Conciliación",
];

const TIPOS_AGENDA_CONCURRENTES = [
  "Cita Damnificada",
  "Cita Damnificada/Probation",
  "Cita Damnificada/Mediación",
  "Cita Damnificada/Conciliación",
  "Cita Imputado",
  "Cita Imputado/Reglas de Conducta",
  "Admisión de Pruebas",
];

const TIPOS_AGENDA_INTERNOS = ["Vencimiento de Plazo", "Trámite / Otro"];

const TIPOS_AGENDA_TODOS = [
  ...TIPOS_AGENDA_BLOQUEANTES,
  ...TIPOS_AGENDA_CONCURRENTES,
  ...TIPOS_AGENDA_INTERNOS,
];

const ESTADOS_AGENDA = ["Pendiente", "Realizada", "Fracasada", "Suspendida"];

const ABREVIATURAS = {
  "Lectura / Firma de Sentencia": "Sent.",
  "Audiencia de Debate": "Debate",
  "Audiencia Preliminar": "Prelim.",
  "Nueva Audiencia Preliminar": "Nva. Prelim.",
  "Audiencia de Visu": "Visu",
  "Audiencia de Conciliación": "Conc.",
  "Cita Damnificada": "Cit. Dam.",
  "Cita Damnificada/Probation": "Dam. SJP",
  "Cita Damnificada/Mediación": "Dam. Med.",
  "Cita Damnificada/Conciliación": "Dam. Conc.",
  "Cita Imputado": "Cit. Imp.",
  "Cita Imputado/Reglas de Conducta": "Reglas",
  "Admisión de Pruebas": "Adm. Prueba",
  "Juicio Abreviado (firma)": "Abrev.",
  "Audiencia de Probation": "SJP",
  "Audiencia de Mediación": "Med.",
  "Declaración Testimonial": "Test.",
  "Citación a Imputado": "Cit. Imp.",
  "Citación a Víctima": "Cit. Víct.",
  "Vencimiento de Plazo": "Vto.",
  "Trámite / Otro": "Tarea",
};

const DECRETO_DEFAULT =
  'Por presentado, parte y constituido el domicilio. ' +
  'Atento al estado de autos en el expediente caratulado "{expte}", ' +
  "fíjase {tipo} para el día {fecha_larga} a las {hora} horas. " +
  "Notifíquese a las partes en sus domicilios constituidos, " +
  "bajo apercibimiento de ley. Hágase saber, ofíciese y cúmplase.";

const FERIADOS_FIJOS = [
  [1, 1, "Año Nuevo"],
  [3, 24, "Día Nacional de la Memoria"],
  [4, 2, "Día del Veterano y Caídos en Malvinas"],
  [5, 1, "Día del Trabajador"],
  [5, 25, "Revolución de Mayo"],
  [6, 17, "Paso a la Inmortalidad del Gral. Güemes"],
  [6, 20, "Paso a la Inmortalidad del Gral. Belgrano"],
  [7, 9, "Día de la Independencia"],
  [8, 8, "Provincialización del Chaco"],
  [8, 17, "Paso a la Inmortalidad del Gral. San Martín"],
  [10, 12, "Día del Respeto a la Diversidad Cultural"],
  [11, 16, "Día del Empleado Judicial"],
  [11, 20, "Día de la Soberanía Nacional"],
  [12, 8, "Inmaculada Concepción"],
  [12, 25, "Navidad"],
];

const FERIAS_INVIERNO = {
  2026: ["2026-07-13", "2026-07-24"],
};

const USUARIOS_INICIALES = [
  ["Ayala Sartor Renzo E.", "admin123", "admin"],
  ["Mujica Jorge", "admin123", "admin"],
  ["Unger Nancy B.", "1234", "user"],
  ["Igich Patricia", "1234", "user"],
  ["Oleschuk Micaela", "1234", "user"],
  ["Berndt Lucas", "1234", "user"],
  ["Alvarez Matias", "1234", "user"],
  ["Bazan Facundo", "1234", "user"],
  ["Proteus (Robot)", "robot", "robot"],
];

function pad(n) {
  return String(n).padStart(2, "0");
}

function ahoraStr(fecha = new Date()) {
  return (
    `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())} ` +
    `${pad(fecha.getHours())}:${pad(fecha.getMinutes())}:${pad(fecha.getSeconds())}`
  );
}

function isoFecha(fecha) {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}

function parseISO(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor || ""));
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const fecha = new Date(y, mo - 1, d);
  if (fecha.getFullYear() !== y || fecha.getMonth() !== mo - 1 || fecha.getDate() !== d) return null;
  return fecha;
}

function addDays(fecha, n) {
  return new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() + n);
}

function fechaLarga(fecha) {
  return `${fecha.getDate()} de ${MESES[fecha.getMonth() + 1]} de ${fecha.getFullYear()}`;
}

function nombreDia(fecha) {
  return DIAS[(fecha.getDay() + 6) % 7];
}

function normalizarExpte(raw) {
  if (!raw) return "";
  let t = String(raw).trim().replace(/\s+/g, "");
  if ((t.match(/\//g) || []).length === 2 && !t.includes("-")) {
    const i = t.lastIndexOf("/");
    t = `${t.slice(0, i)}-${t.slice(i + 1)}`;
  }
  return t.toUpperCase();
}

function normalizarHora(raw) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(raw || "").trim());
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  return `${pad(hh)}:${m[2]}`;
}

function abreviatura(tipo) {
  return ABREVIATURAS[tipo] || String(tipo || "").slice(0, 12);
}

function csvEscape(valor) {
  const s = valor == null ? "" : String(valor);
  if (/[;"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function aCsv(columnas, filas) {
  const lineas = [columnas.map(csvEscape).join(";")];
  for (const fila of filas) {
    lineas.push(fila.map(csvEscape).join(";"));
  }
  return `\uFEFF${lineas.join("\r\n")}`;
}

module.exports = {
  MESES,
  DIAS,
  TIPOS_AGENDA_BLOQUEANTES,
  TIPOS_AGENDA_CONCURRENTES,
  TIPOS_AGENDA_INTERNOS,
  TIPOS_AGENDA_TODOS,
  ESTADOS_AGENDA,
  DECRETO_DEFAULT,
  FERIADOS_FIJOS,
  FERIAS_INVIERNO,
  USUARIOS_INICIALES,
  ahoraStr,
  isoFecha,
  parseISO,
  addDays,
  fechaLarga,
  nombreDia,
  normalizarExpte,
  normalizarHora,
  abreviatura,
  aCsv,
};
