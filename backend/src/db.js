const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const bcrypt = require("bcryptjs");
const {
  FERIADOS_FIJOS,
  USUARIOS_INICIALES,
  ahoraStr,
} = require("./util");

const DATA_DIR = path.join(__dirname, "..", "data");
const LOG_DIR = path.join(__dirname, "..", "logs");
const DB_PATH = path.join(DATA_DIR, "biblioratos.db");

let db;

function logSistema(mensaje, nivel = "info") {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.appendFileSync(
      path.join(LOG_DIR, "biblioratos.log"),
      `${ahoraStr()} | ${nivel.toUpperCase()} | ${mensaje}\n`,
      "utf8"
    );
  } catch {
    /* el log no debe frenar la operación */
  }
}

function getDb() {
  if (!db) throw new Error("Base no inicializada");
  return db;
}

function tx(fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const resultado = fn();
    db.exec("COMMIT");
    return resultado;
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      /* ya estaba cerrada */
    }
    throw error;
  }
}

function asegurarColumna(tabla, columna, tipo) {
  const columnas = db.prepare(`PRAGMA table_info(${tabla})`).all();
  if (columnas.some((item) => item.name === columna)) return;
  db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${columna} ${tipo}`);
}

function registrarAuditoria(registroId, accion, campo, valorAnt, valorNuevo, usuario, pcName) {
  db.prepare(
    `INSERT INTO log_auditoria
      (registro_id, accion, campo_modificado, valor_anterior, valor_nuevo, usuario, fecha, pc_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    registroId,
    accion,
    campo,
    valorAnt ?? "",
    valorNuevo ?? "",
    usuario,
    ahoraStr(),
    pcName || ""
  );
}

function initDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");

  db.exec("DROP TABLE IF EXISTS registros");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sesiones (
      usuario TEXT PRIMARY KEY,
      pc_name TEXT,
      fecha_login TEXT,
      token TEXT
    );

    CREATE TABLE IF NOT EXISTS usuarios (
      nombre TEXT PRIMARY KEY,
      password TEXT,
      rol TEXT
    );

    CREATE TABLE IF NOT EXISTS log_auditoria (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registro_id INTEGER,
      accion TEXT,
      campo_modificado TEXT,
      valor_anterior TEXT,
      valor_nuevo TEXT,
      usuario TEXT,
      fecha TEXT,
      pc_name TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS agenda (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tipo TEXT,
      expediente TEXT,
      descripcion TEXT DEFAULT '',
      anotacion TEXT DEFAULT '',
      fecha TEXT,
      hora TEXT DEFAULT '',
      detenido INTEGER DEFAULT 0,
      estado TEXT DEFAULT 'Pendiente',
      usuario_carga TEXT,
      fecha_carga TEXT,
      usuario_resolucion TEXT DEFAULT '',
      fecha_resolucion TEXT DEFAULT NULL,
      notas TEXT DEFAULT ''
    );

    CREATE INDEX IF NOT EXISTS idx_agenda_fecha ON agenda(fecha);
    CREATE INDEX IF NOT EXISTS idx_agenda_fecha_hora_estado_tipo
      ON agenda(fecha, hora, estado, tipo);

    CREATE TABLE IF NOT EXISTS feriados (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      fecha TEXT NOT NULL,
      descripcion TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('PERMANENTE', 'EXCEPCIONAL')),
      UNIQUE(fecha, tipo)
    );

    CREATE TABLE IF NOT EXISTS configuracion (
      clave TEXT PRIMARY KEY,
      valor TEXT
    );
  `);

  asegurarColumna("agenda", "sistema", "TEXT DEFAULT ''");
  asegurarColumna("agenda", "dependencia_codigo", "TEXT DEFAULT ''");
  asegurarColumna("agenda", "dependencia_nombre", "TEXT DEFAULT ''");
  asegurarColumna("agenda", "circunscripcion", "TEXT DEFAULT ''");
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_agenda_dependencia_fecha
      ON agenda(sistema, dependencia_codigo, fecha)
  `);

  const cantFeriados = db.prepare(
    "SELECT COUNT(*) AS n FROM feriados WHERE tipo = 'PERMANENTE'"
  ).get().n;
  if (cantFeriados === 0) {
    const insert = db.prepare(
      "INSERT OR IGNORE INTO feriados (fecha, descripcion, tipo) VALUES (?, ?, 'PERMANENTE')"
    );
    for (const [mes, dia, nombre] of FERIADOS_FIJOS) {
      insert.run(`${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`, nombre);
    }
  }

  const cantUsuarios = db.prepare("SELECT COUNT(*) AS n FROM usuarios").get().n;
  if (cantUsuarios === 0) {
    const insert = db.prepare("INSERT INTO usuarios (nombre, password, rol) VALUES (?, ?, ?)");
    for (const [nombre, clave, rol] of USUARIOS_INICIALES) {
      insert.run(nombre, bcrypt.hashSync(clave, 10), rol);
    }
  }

  logSistema(`Inicio de la API | Base: ${DB_PATH}`);
  return db;
}

module.exports = {
  initDb,
  getDb,
  tx,
  registrarAuditoria,
  logSistema,
  DB_PATH,
};
