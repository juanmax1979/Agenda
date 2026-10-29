const express = require("express");
const bcrypt = require("bcryptjs");
const { getDb, tx, registrarAuditoria } = require("./db");
const { exigir, soloAdmin } = require("./auth");
const { cargarFeriados } = require("./calendario");
const { DECRETO_DEFAULT, TIPOS_AGENDA_TODOS, parseISO } = require("./util");

const router = express.Router();
router.use(exigir, soloAdmin);

router.get("/auditoria", (_req, res) => {
  const filas = getDb()
    .prepare(
      `SELECT fecha, accion, registro_id,
              campo_modificado || ': ' || COALESCE(valor_anterior, '') || ' → ' || COALESCE(valor_nuevo, '') AS detalle,
              usuario, COALESCE(pc_name, '') AS pc
       FROM log_auditoria
       WHERE accion LIKE 'AGENDA_%' OR accion LIKE 'FERIADO_%' OR accion LIKE 'PLANTILLA_%'
       ORDER BY id DESC
       LIMIT 100`
    )
    .all();
  res.json(filas);
});

router.get("/usuarios", (_req, res) => {
  const filas = getDb().prepare("SELECT nombre, rol FROM usuarios ORDER BY rol, nombre").all();
  res.json(filas);
});

router.post("/usuarios", (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const password = String(req.body.password || "");
  const rol = String(req.body.rol || "user");
  if (!nombre) return res.status(400).json({ error: "Ingrese el nombre." });
  if (password.length < 4) return res.status(400).json({ error: "Mínimo 4 caracteres." });
  if (!["admin", "user", "robot"].includes(rol)) return res.status(400).json({ error: "Rol inválido." });
  try {
    getDb().prepare("INSERT INTO usuarios (nombre, password, rol) VALUES (?, ?, ?)").run(
      nombre,
      bcrypt.hashSync(password, 10),
      rol
    );
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Ya existe un usuario con ese nombre." });
    }
    throw error;
  }
  res.json({ ok: true });
});

router.put("/usuarios/clave", (req, res) => {
  const nombre = String(req.body.nombre || "");
  const password = String(req.body.password || "");
  if (password.length < 4) return res.status(400).json({ error: "Mínimo 4 caracteres." });
  const info = getDb().prepare("UPDATE usuarios SET password = ? WHERE nombre = ?").run(
    bcrypt.hashSync(password, 10),
    nombre
  );
  if (!info.changes) return res.status(404).json({ error: "Usuario inexistente." });
  res.json({ ok: true });
});

router.get("/feriados", (req, res) => {
  const tipo = String(req.query.tipo || "TODOS");
  const filas = tipo === "TODOS"
    ? getDb().prepare("SELECT id, fecha, descripcion, tipo FROM feriados ORDER BY fecha").all()
    : getDb()
        .prepare("SELECT id, fecha, descripcion, tipo FROM feriados WHERE tipo = ? ORDER BY fecha")
        .all(tipo);
  res.json(
    filas.map((f) => {
      let visible = f.fecha;
      if (f.tipo === "PERMANENTE") {
        const [m, d] = f.fecha.split("-");
        visible = `${d}/${m} (anual)`;
      } else if (/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) {
        visible = f.fecha.split("-").reverse().join("/");
      }
      return { ...f, visible };
    })
  );
});

router.post("/feriados", (req, res) => {
  const tipo = String(req.body.tipo || "");
  const descripcion = String(req.body.descripcion || "").trim();
  if (!["PERMANENTE", "EXCEPCIONAL"].includes(tipo)) {
    return res.status(400).json({ error: "Tipo de feriado inválido." });
  }
  if (!descripcion) return res.status(400).json({ error: "Complete la descripción." });
  let fechaDb = "";
  if (tipo === "PERMANENTE") {
    const dia = Number(req.body.dia);
    const mes = Number(req.body.mes);
    if (!(mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)) {
      return res.status(400).json({ error: "Fecha permanente inválida." });
    }
    fechaDb = `${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
  } else {
    const fecha = parseISO(req.body.fecha);
    if (!fecha) return res.status(400).json({ error: "Fecha excepcional inválida." });
    fechaDb = req.body.fecha;
  }
  try {
    const id = tx(() => {
      const info = getDb()
        .prepare("INSERT INTO feriados (fecha, descripcion, tipo) VALUES (?, ?, ?)")
        .run(fechaDb, descripcion, tipo);
      const nuevo = Number(info.lastInsertRowid);
      registrarAuditoria(nuevo, "FERIADO_AGREGADO", "fecha", "-", `${tipo} ${fechaDb} — ${descripcion}`, req.usuario, req.equipo);
      return nuevo;
    });
    cargarFeriados();
    res.json({ id });
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Ya existe ese feriado." });
    }
    throw error;
  }
});

router.delete("/feriados/:id", (req, res) => {
  const id = Number(req.params.id);
  const row = getDb().prepare("SELECT descripcion FROM feriados WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Feriado inexistente." });
  tx(() => {
    registrarAuditoria(id, "FERIADO_BORRADO", "registro", row.descripcion, "ELIMINADO", req.usuario, req.equipo);
    getDb().prepare("DELETE FROM feriados WHERE id = ?").run(id);
  });
  cargarFeriados();
  res.json({ ok: true });
});

router.get("/plantilla", (req, res) => {
  const seleccion = String(req.query.tipo || "general");
  const clave = seleccion === "general" ? "plantilla_decreto" : `plantilla_decreto_${seleccion}`;
  const row = getDb().prepare("SELECT valor FROM configuracion WHERE clave = ?").get(clave);
  res.json({
    tipos: ["general", ...TIPOS_AGENDA_TODOS],
    texto: row && String(row.valor).trim() ? row.valor : DECRETO_DEFAULT,
    predeterminada: DECRETO_DEFAULT,
  });
});

router.put("/plantilla", (req, res) => {
  const seleccion = String(req.body.tipo || "general");
  if (seleccion !== "general" && !TIPOS_AGENDA_TODOS.includes(seleccion)) {
    return res.status(400).json({ error: "Tipo de plantilla inválido." });
  }
  const clave = seleccion === "general" ? "plantilla_decreto" : `plantilla_decreto_${seleccion}`;
  const valor = req.body.restaurar ? DECRETO_DEFAULT : String(req.body.texto || "").trim();
  tx(() => {
    getDb()
      .prepare(
        `INSERT INTO configuracion (clave, valor) VALUES (?, ?)
         ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor`
      )
      .run(clave, valor);
    registrarAuditoria(0, "PLANTILLA_DECRETO_MODIFICADA", "valor", seleccion, "(actualizada)", req.usuario, req.equipo);
  });
  res.json({ ok: true, texto: valor });
});

module.exports = router;
