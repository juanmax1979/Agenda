const express = require("express");
const { getDb, tx, registrarAuditoria } = require("./db");
const { exigir } = require("./auth");
const { dependenciaHabilitada, datosExpediente } = require("./fuentes");
const { cargarFeriados, esDiaHabil, calcularPlazo, diasEnRango } = require("./calendario");
const {
  TIPOS_AGENDA_BLOQUEANTES,
  TIPOS_AGENDA_CONCURRENTES,
  TIPOS_AGENDA_INTERNOS,
  TIPOS_AGENDA_TODOS,
  ESTADOS_AGENDA,
  DECRETO_DEFAULT,
  ahoraStr,
  isoFecha,
  parseISO,
  fechaLarga,
  normalizarExpte,
  normalizarHora,
  abreviatura,
  aCsv,
  addDays,
} = require("./util");

const router = express.Router();
router.use(exigir);

router.get("/catalogos", (_req, res) => {
  const usuarios = getDb().prepare("SELECT nombre FROM usuarios ORDER BY nombre").all().map((f) => f.nombre);
  res.json({
    tiposAgenda: {
      bloqueantes: TIPOS_AGENDA_BLOQUEANTES,
      concurrentes: TIPOS_AGENDA_CONCURRENTES,
      internos: TIPOS_AGENDA_INTERNOS,
      todos: TIPOS_AGENDA_TODOS,
    },
    estadosAgenda: ESTADOS_AGENDA,
    usuarios,
  });
});

function sqlDependencia(query, params) {
  const sistema = String(query.sistema || "").trim().toUpperCase();
  const codigo = String(query.codigo || "").trim();
  if (!sistema || !codigo) return "";
  params.push(sistema, codigo);
  return " AND ((sistema = ? AND dependencia_codigo = ?) OR dependencia_codigo IS NULL OR dependencia_codigo = '')";
}

function plantillaDe(tipo) {
  const db = getDb();
  if (tipo) {
    const especifica = db.prepare("SELECT valor FROM configuracion WHERE clave = ?").get(`plantilla_decreto_${tipo}`);
    if (especifica && String(especifica.valor).trim()) return especifica.valor;
  }
  const general = db.prepare("SELECT valor FROM configuracion WHERE clave = 'plantilla_decreto'").get();
  if (general && String(general.valor).trim()) return general.valor;
  return DECRETO_DEFAULT;
}

function aplicarPlantilla(plantilla, vars) {
  const desconocidas = [...String(plantilla).matchAll(/\{([a-z_]+)\}/g)]
    .map((m) => m[1])
    .filter((k) => !(k in vars));
  if (desconocidas.length) {
    const error = new Error(
      `La plantilla referencia una variable desconocida: ${desconocidas.join(", ")}. Válidas: expte, tipo, fecha_larga, hora, descripcion.`
    );
    error.status = 400;
    throw error;
  }
  return plantilla.replace(/\{([a-z_]+)\}/g, (_, k) => vars[k] ?? "");
}

function formatear(fila) {
  const hecho = { Pendiente: "", Realizada: "✓", Fracasada: "✗", Suspendida: "⏸" }[fila.estado] || "";
  const expteTxt = fila.expediente ? `Expte. Nº ${String(fila.expediente).toUpperCase()}` : "Sin expediente";
  let desc = fila.tipo === "Vencimiento de Plazo"
    ? expteTxt + (fila.descripcion ? ` — ${fila.descripcion}` : "")
    : `${expteTxt} — ${fila.tipo}` + (fila.descripcion ? ` — ${fila.descripcion}` : "");
  if (fila.anotacion) desc += ` — 【${String(fila.anotacion).trim().toUpperCase()}】`;
  if (fila.detenido && fila.estado === "Pendiente") desc = `PRESO — ${desc}`;
  if (fila.estado === "Realizada") desc += "  ✓ REALIZADA";
  else if (fila.estado === "Fracasada") desc += "  ✗ FRACASADA";
  else if (fila.estado === "Suspendida") desc += "  ⏸ SUSPENDIDA";

  let tag = "normal";
  if (fila.detenido && fila.estado === "Pendiente") tag = "preso";
  else if (fila.estado === "Realizada") tag = "realizada";
  else if (fila.estado === "Fracasada") tag = "fracasada";
  else if (fila.estado === "Suspendida") tag = "suspendida";
  else if (TIPOS_AGENDA_BLOQUEANTES.includes(fila.tipo)) tag = "audiencia";

  return {
    id: fila.id,
    estado: fila.estado,
    fecha: fila.fecha,
    hora: fila.hora || "",
    tipo: fila.tipo,
    tipoAbrev: abreviatura(fila.tipo),
    expediente: fila.expediente,
    descripcion: fila.descripcion || "",
    anotacion: fila.anotacion || "",
    usuario: fila.usuario_carga,
    responsable: String(fila.usuario_carga || "").toUpperCase(),
    detenido: Number(fila.detenido) === 1,
    descripcionCompleta: desc,
    hecho,
    tag,
  };
}

function leerEvento(id) {
  return getDb()
    .prepare(
      `SELECT id, tipo, expediente, descripcion, anotacion, fecha, hora, detenido, estado, usuario_carga
       FROM agenda WHERE id = ?`
    )
    .get(id);
}

router.get("/calendario", (req, res) => {
  const desde = parseISO(req.query.desde);
  const hasta = parseISO(req.query.hasta);
  if (!desde || !hasta || isoFecha(desde) > isoFecha(hasta)) {
    return res.status(400).json({ error: "Rango de fechas inválido." });
  }
  if ((hasta - desde) / 86400000 > 120) {
    return res.status(400).json({ error: "El rango supera los 120 días." });
  }
  res.json({
    dias: diasEnRango(desde, hasta, {
      sistema: String(req.query.sistema || "").trim().toUpperCase(),
      codigo: String(req.query.codigo || "").trim(),
    }),
  });
});

router.get("/dia", (req, res) => {
  const fecha = parseISO(req.query.fecha);
  if (!fecha) return res.status(400).json({ error: "Fecha inválida." });
  const estado = esDiaHabil(fecha);
  res.json({ fecha: isoFecha(fecha), ...estado });
});

router.get("/avisos", (req, res) => {
  const hoy = isoFecha(new Date());
  const filtroHoy = [];
  const filtroAtrasados = [];
  const clausulaHoy = sqlDependencia(req.query, filtroHoy);
  const clausulaAtrasados = sqlDependencia(req.query, filtroAtrasados);
  const deHoy = getDb()
    .prepare(
      `SELECT tipo, expediente, hora, detenido FROM agenda
       WHERE fecha = ? AND estado = 'Pendiente'${clausulaHoy} ORDER BY hora ASC`
    )
    .all(hoy, ...filtroHoy);
  const atrasados = getDb()
    .prepare(
      `SELECT tipo, expediente, fecha, detenido FROM agenda
       WHERE fecha < ? AND estado = 'Pendiente'${clausulaAtrasados} ORDER BY fecha ASC`
    )
    .all(hoy, ...filtroAtrasados);
  res.json({
    hoy: deHoy.map((f) => ({ ...f, detenido: Number(f.detenido) === 1 })),
    atrasados: atrasados.map((f) => ({ ...f, detenido: Number(f.detenido) === 1 })),
  });
});

router.post("/plazos", (req, res) => {
  const fechaBase = parseISO(req.body.fecha);
  const dias = Number(req.body.dias);
  if (!fechaBase) return res.status(400).json({ error: "Fecha base inválida." });
  if (!Number.isInteger(dias) || dias < 1) {
    return res.status(400).json({ error: "Ingrese una cantidad válida de días." });
  }
  const resultado = calcularPlazo({
    fechaBase,
    dias,
    habiles: req.body.modo !== "corridos",
    excluirInicial: req.body.excluirInicial !== false,
  });
  res.json(resultado);
});

router.get("/export", (req, res) => {
  const tipos = [];
  if (req.query.audiencia !== "0") {
    tipos.push(
      ...TIPOS_AGENDA_BLOQUEANTES,
      "Cita Damnificada",
      "Cita Damnificada/Probation",
      "Cita Damnificada/Mediación",
      "Cita Damnificada/Conciliación",
      "Cita Imputado",
      "Cita Imputado/Reglas de Conducta",
      "Admisión de Pruebas",
      "Juicio Abreviado (firma)",
      "Audiencia de Probation",
      "Audiencia de Mediación",
      "Declaración Testimonial",
      "Citación a Imputado",
      "Citación a Víctima"
    );
  }
  if (req.query.vencimiento !== "0") tipos.push("Vencimiento de Plazo");
  if (req.query.tarea !== "0") tipos.push("Trámite / Otro");
  const unicos = [...new Set(tipos)];
  const proceso = String(req.query.proceso || "Todos").trim();
  const procesoExacto = proceso && proceso !== "Todos" && TIPOS_AGENDA_TODOS.includes(proceso);
  if (!unicos.length && !procesoExacto) {
    return res.status(400).json({ error: "Debe tildar al menos un tipo o elegir un proceso específico." });
  }

  let sql = `SELECT fecha, hora, usuario_carga, tipo, expediente, descripcion, anotacion, detenido, estado
             FROM agenda WHERE 1 = 1`;
  const params = [];
  const resp = String(req.query.responsable || "Todos");
  if (resp !== "Todos") {
    sql += " AND lower(usuario_carga) = ?";
    params.push(resp.toLowerCase());
  }
  if (req.query.desde) {
    if (!parseISO(req.query.desde)) return res.status(400).json({ error: "Fecha Desde inválida." });
    sql += " AND fecha >= ?";
    params.push(req.query.desde);
  }
  if (req.query.hasta) {
    if (!parseISO(req.query.hasta)) return res.status(400).json({ error: "Fecha Hasta inválida." });
    sql += " AND fecha <= ?";
    params.push(req.query.hasta);
  }
  const estado = String(req.query.estado || "Todo");
  if (estado !== "Todo") {
    if (!ESTADOS_AGENDA.includes(estado)) return res.status(400).json({ error: "Estado inválido." });
    sql += " AND estado = ?";
    params.push(estado);
  }
  if (procesoExacto) {
    sql += " AND tipo = ?";
    params.push(proceso);
  } else {
    if (unicos.length) {
      sql += ` AND tipo IN (${unicos.map(() => "?").join(",")})`;
      params.push(...unicos);
    }
    if (proceso && proceso !== "Todos") {
      sql += " AND (expediente LIKE ? OR descripcion LIKE ? OR tipo LIKE ?)";
      params.push(`%${proceso}%`, `%${proceso}%`, `%${proceso}%`);
    }
  }
  sql += sqlDependencia(req.query, params);
  sql += " ORDER BY fecha ASC, hora ASC";
  const datos = getDb().prepare(sql).all(...params);
  if (!datos.length) return res.status(404).json({ error: "No se encontraron agendamientos con esos parámetros." });

  const csv = aCsv(
    ["Fecha", "Hora", "Responsable", "Tipo", "Expediente", "Descripción", "Anotación", "Con detenido", "Estado"],
    datos.map((f) => [
      f.fecha.split("-").reverse().join("/"),
      f.hora,
      f.usuario_carga,
      f.tipo,
      f.expediente,
      f.descripcion,
      f.anotacion,
      f.detenido ? "SÍ" : "",
      f.estado,
    ])
  );
  const nombre = `Agendamientos_${isoFecha(new Date()).replace(/-/g, "")}.csv`;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
  res.send(csv);
});

router.get("/", (req, res) => {
  const fecha = parseISO(req.query.fecha);
  if (!fecha) return res.status(400).json({ error: "Fecha inválida." });
  const termino = `%${String(req.query.q || "").trim()}%`;
  let sql = `
    SELECT id, estado, fecha, hora, tipo, expediente, descripcion, anotacion, usuario_carga, detenido
    FROM agenda
    WHERE fecha = ?
      AND (expediente LIKE ? OR descripcion LIKE ? OR tipo LIKE ? OR anotacion LIKE ?)
  `;
  const params = [isoFecha(fecha), termino, termino, termino, termino];
  if (req.query.pendientes === "1") sql += " AND estado = 'Pendiente'";
  const resp = String(req.query.responsable || "");
  if (resp && resp !== "Todos los miembros") {
    sql += " AND usuario_carga = ?";
    params.push(resp);
  }
  sql += sqlDependencia(req.query, params);
  sql += " ORDER BY hora ASC, id ASC";
  const filas = getDb().prepare(sql).all(...params).map(formatear);
  res.json({ fecha: isoFecha(fecha), total: filas.length, eventos: filas });
});

router.get("/expediente", exigir, async (req, res) => {
  try {
    const dependencia = await dependenciaHabilitada(req.query.sistema, req.query.codigo);
    res.json(await datosExpediente({ numero: req.query.numero, dependencia }));
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message || "No se pudo consultar el expediente." });
  }
});

router.get("/:id/decreto", (req, res) => {
  const row = leerEvento(Number(req.params.id));
  if (!row) return res.status(404).json({ error: "Evento inexistente." });
  const fecha = parseISO(row.fecha);
  const texto = aplicarPlantilla(plantillaDe(row.tipo), {
    expte: row.expediente || "",
    tipo: String(row.tipo || "").toLowerCase(),
    fecha_larga: fecha ? fechaLarga(fecha) : row.fecha,
    hora: row.hora || "",
    descripcion: row.descripcion || "",
  });
  res.json({ texto });
});

function validarCarga(body) {
  const expediente = normalizarExpte(body.expediente);
  const tipo = String(body.tipo || "");
  const descripcion = String(body.descripcion || "").trim();
  const anotacion = String(body.anotacion || "").trim();
  const fecha = parseISO(body.fecha);
  const detenido = body.detenido ? 1 : 0;
  if (!expediente) return { error: "Ingrese el expediente." };
  if (!TIPOS_AGENDA_TODOS.includes(tipo) && tipo !== "Juicio Abreviado (firma)") {
    return { error: "Seleccione un tipo de acto." };
  }
  if (!fecha) return { error: "Fecha inválida." };
  let hora = String(body.hora || "").trim();
  if (tipo !== "Vencimiento de Plazo") {
    hora = normalizarHora(hora);
    if (!hora) return { error: "El acto agendado requiere hora en formato HH:MM." };
  } else if (hora) {
    hora = normalizarHora(hora) || "";
  }
  const habil = esDiaHabil(fecha);
  return { expediente, tipo, descripcion, anotacion, fecha, hora, detenido, habil };
}

router.post("/", async (req, res) => {
  const datos = validarCarga(req.body);
  if (datos.error) return res.status(400).json({ error: datos.error });
  let dep;
  try {
    dep = await dependenciaHabilitada(req.body.sistema, req.body.codigo);
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message });
  }
  if (!datos.habil.ok && !req.body.confirmarInhabil) {
    return res.status(409).json({
      code: "INHABIL",
      motivo: datos.habil.motivo,
      error: `${datos.habil.motivo}. ¿Cargar igualmente?`,
    });
  }
  if (TIPOS_AGENDA_BLOQUEANTES.includes(datos.tipo)) {
    const placeholders = TIPOS_AGENDA_BLOQUEANTES.map(() => "?").join(",");
    const colision = getDb()
      .prepare(
        `SELECT expediente, tipo FROM agenda
         WHERE fecha = ? AND hora = ? AND estado = 'Pendiente' AND tipo IN (${placeholders})
           AND sistema = ? AND dependencia_codigo = ?`
      )
      .get(isoFecha(datos.fecha), datos.hora, ...TIPOS_AGENDA_BLOQUEANTES, dep.sistema, dep.codigo);
    if (colision) {
      return res.status(409).json({
        code: "COLISION",
        error: `El Juez ya tiene fijado: ${colision.tipo} — Expte: ${colision.expediente}`,
      });
    }
  }
  const creado = tx(() => {
    const info = getDb()
      .prepare(
        `INSERT INTO agenda
          (tipo, expediente, descripcion, anotacion, fecha, hora, detenido, estado, usuario_carga, fecha_carga,
           sistema, dependencia_codigo, dependencia_nombre, circunscripcion)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?, ?, ?, ?, ?, ?)`
      )
      .run(
        datos.tipo,
        datos.expediente,
        datos.descripcion,
        datos.anotacion,
        isoFecha(datos.fecha),
        datos.hora,
        datos.detenido,
        req.usuario,
        ahoraStr(),
        dep.sistema,
        dep.codigo,
        dep.nombre,
        dep.circunscripcion || ""
      );
    const id = Number(info.lastInsertRowid);
    let detalle = `${datos.tipo} | ${datos.expediente} | ${isoFecha(datos.fecha)} ${datos.hora}`;
    if (datos.anotacion) detalle += ` | ANOTACIÓN: ${datos.anotacion}`;
    if (datos.detenido) detalle += " | CON DETENIDO";
    registrarAuditoria(id, "AGENDA_CREACION", "-", "-", detalle, req.usuario, req.equipo);
    return id;
  });
  res.json({ id: creado, fecha: isoFecha(datos.fecha) });
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const actual = leerEvento(id);
  if (!actual) return res.status(404).json({ error: "Evento inexistente." });
  const datos = validarCarga(req.body);
  if (datos.error) return res.status(400).json({ error: datos.error });
  let dep;
  try {
    dep = await dependenciaHabilitada(req.body.sistema, req.body.codigo);
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message });
  }
  if (TIPOS_AGENDA_BLOQUEANTES.includes(datos.tipo)) {
    const placeholders = TIPOS_AGENDA_BLOQUEANTES.map(() => "?").join(",");
    const colision = getDb()
      .prepare(
        `SELECT expediente, tipo FROM agenda
         WHERE id <> ? AND fecha = ? AND hora = ? AND estado = 'Pendiente' AND tipo IN (${placeholders})
           AND sistema = ? AND dependencia_codigo = ?`
      )
      .get(id, isoFecha(datos.fecha), datos.hora, ...TIPOS_AGENDA_BLOQUEANTES, dep.sistema, dep.codigo);
    if (colision) {
      return res.status(409).json({
        code: "COLISION",
        error: `El Juez ya tiene fijado: ${colision.tipo} — Expte: ${colision.expediente}`,
      });
    }
  }
  tx(() => {
    getDb()
      .prepare(
        `UPDATE agenda
         SET tipo = ?, expediente = ?, descripcion = ?, anotacion = ?, fecha = ?, hora = ?, detenido = ?,
             sistema = ?, dependencia_codigo = ?, dependencia_nombre = ?, circunscripcion = ?
         WHERE id = ?`
      )
      .run(
        datos.tipo,
        datos.expediente,
        datos.descripcion,
        datos.anotacion,
        isoFecha(datos.fecha),
        datos.hora,
        datos.detenido,
        dep.sistema,
        dep.codigo,
        dep.nombre,
        dep.circunscripcion || "",
        id
      );
    const cambios = [
      ["tipo", actual.tipo, datos.tipo],
      ["expediente", actual.expediente, datos.expediente],
      ["descripcion", actual.descripcion || "", datos.descripcion],
      ["anotacion", actual.anotacion || "", datos.anotacion],
      ["fecha", actual.fecha, isoFecha(datos.fecha)],
      ["hora", actual.hora || "", datos.hora],
      ["detenido", String(actual.detenido || 0), String(datos.detenido)],
    ];
    for (const [campo, antes, despues] of cambios) {
      if (String(antes ?? "") !== String(despues ?? "")) {
        registrarAuditoria(id, "AGENDA_MODIFICACION", campo, antes, despues, req.usuario, req.equipo);
      }
    }
  });
  res.json({ ok: true, fecha: isoFecha(datos.fecha) });
});

router.post("/:id/estado", (req, res) => {
  const id = Number(req.params.id);
  const nuevo = String(req.body.estado || "");
  if (!ESTADOS_AGENDA.includes(nuevo)) return res.status(400).json({ error: "Estado inválido." });
  const row = getDb().prepare("SELECT estado, tipo, expediente FROM agenda WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Evento inexistente." });
  if (row.estado === nuevo) {
    return res.status(400).json({ error: `Este evento ya está en estado ${nuevo}.` });
  }
  tx(() => {
    getDb()
      .prepare("UPDATE agenda SET estado = ?, usuario_resolucion = ?, fecha_resolucion = ? WHERE id = ?")
      .run(nuevo, req.usuario, ahoraStr(), id);
    registrarAuditoria(id, `AGENDA_${nuevo.toUpperCase()}`, "estado", row.estado, nuevo, req.usuario, req.equipo);
  });
  res.json({ ok: true, tipo: row.tipo, expediente: row.expediente, estadoAnterior: row.estado });
});

router.delete("/:id", (req, res) => {
  if (req.rol !== "admin") return res.status(403).json({ error: "Solo admins pueden borrar." });
  const id = Number(req.params.id);
  const row = getDb().prepare("SELECT tipo, expediente, fecha, hora FROM agenda WHERE id = ?").get(id);
  if (!row) return res.status(404).json({ error: "Evento inexistente." });
  tx(() => {
    registrarAuditoria(
      id,
      "AGENDA_BORRADO",
      "registro_completo",
      `${row.tipo} | ${row.expediente} | ${row.fecha} ${row.hora}`,
      "ELIMINADO",
      req.usuario,
      req.equipo
    );
    getDb().prepare("DELETE FROM agenda WHERE id = ?").run(id);
  });
  res.json({ ok: true });
});

router.get("/plantillas/listado", (req, res) => {
  const tipos = ["Plantilla General (Por defecto)", ...TIPOS_AGENDA_TODOS];
  const seleccion = String(req.query.tipo || tipos[0]);
  const tipo = seleccion === tipos[0] ? null : seleccion;
  res.json({ tipos, seleccion, texto: plantillaDe(tipo), predeterminada: DECRETO_DEFAULT });
});

module.exports = { router, plantillaDe, cargarFeriados, addDays };
