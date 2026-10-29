const express = require("express");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { getDb } = require("./db");

const router = express.Router();

function cliente(req) {
  return String(req.headers["x-cliente"] || "web").slice(0, 80);
}

function exigir(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return res.status(401).json({ error: "Sesión vencida. Ingrese de nuevo." });
  const sesion = getDb().prepare("SELECT usuario, pc_name FROM sesiones WHERE token = ?").get(token);
  if (!sesion) return res.status(401).json({ error: "Sesión vencida. Ingrese de nuevo." });
  const usuario = getDb().prepare("SELECT nombre, rol FROM usuarios WHERE nombre = ?").get(sesion.usuario);
  if (!usuario) return res.status(401).json({ error: "Usuario inexistente." });
  req.usuario = usuario.nombre;
  req.rol = usuario.rol;
  req.equipo = sesion.pc_name || cliente(req);
  next();
}

function soloAdmin(req, res, next) {
  if (req.rol !== "admin") {
    return res.status(403).json({ error: "Solo administradores." });
  }
  next();
}

router.get("/usuarios", (_req, res) => {
  const filas = getDb().prepare("SELECT nombre FROM usuarios ORDER BY nombre").all();
  res.json(filas.map((f) => f.nombre));
});

router.post("/login", (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const password = String(req.body.password || "");
  const forzar = Boolean(req.body.forzar);
  if (!nombre || !password) {
    return res.status(400).json({ error: "Ingrese usuario y contraseña." });
  }
  const usuario = getDb().prepare("SELECT nombre, password, rol FROM usuarios WHERE nombre = ?").get(nombre);
  if (!usuario || !bcrypt.compareSync(password, usuario.password)) {
    return res.status(401).json({ error: usuario ? "Contraseña incorrecta." : "Usuario no encontrado." });
  }
  const equipo = cliente(req);
  const activa = getDb().prepare("SELECT pc_name FROM sesiones WHERE usuario = ?").get(nombre);
  if (activa && activa.pc_name && activa.pc_name !== equipo && !forzar) {
    return res.status(409).json({
      code: "SESION_ACTIVA",
      error: `'${nombre}' está abierto en otro equipo (${activa.pc_name}).`,
    });
  }
  const token = crypto.randomBytes(32).toString("hex");
  getDb()
    .prepare(
      `INSERT INTO sesiones (usuario, pc_name, fecha_login, token)
       VALUES (?, ?, datetime('now', 'localtime'), ?)
       ON CONFLICT(usuario) DO UPDATE SET pc_name = excluded.pc_name, fecha_login = excluded.fecha_login, token = excluded.token`
    )
    .run(nombre, equipo, token);
  res.json({ token, usuario: usuario.nombre, rol: usuario.rol });
});

router.post("/logout", exigir, (req, res) => {
  getDb().prepare("DELETE FROM sesiones WHERE usuario = ?").run(req.usuario);
  res.json({ ok: true });
});

router.get("/me", exigir, (req, res) => {
  res.json({ usuario: req.usuario, rol: req.rol });
});

router.post("/password", exigir, (req, res) => {
  const actual = String(req.body.actual || "");
  const nueva = String(req.body.nueva || "");
  if (nueva.length < 4) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 4 caracteres." });
  }
  const row = getDb().prepare("SELECT password FROM usuarios WHERE nombre = ?").get(req.usuario);
  if (!row || !bcrypt.compareSync(actual, row.password)) {
    return res.status(400).json({ error: "La contraseña actual no coincide." });
  }
  getDb().prepare("UPDATE usuarios SET password = ? WHERE nombre = ?").run(bcrypt.hashSync(nueva, 10), req.usuario);
  res.json({ ok: true });
});

module.exports = { router, exigir, soloAdmin, cliente };
