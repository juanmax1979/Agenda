const express = require("express");
const { getDb, tx, registrarAuditoria } = require("./db");
const { exigir } = require("./auth");
const { sqlVisibilidad } = require("./visibilidad");
const catalogo = require("./catalogoAudiencias.json");
const XLSX = require("xlsx");
const { dependenciaHabilitada, datosExpediente } = require("./fuentes");
const { cargarFeriados, esDiaHabil, calcularPlazo, diasEnRango } = require("./calendario");
const {
  TIPOS_AGENDA_BLOQUEANTES,
  TIPOS_AGENDA_CONCURRENTES,
  TIPOS_AGENDA_INTERNOS,
  TIPOS_AGENDA_TODOS,
  ESTADOS_AGENDA,
  DECRETO_DEFAULT,
  USUARIOS_INICIALES,
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

function cerrarAudienciasVencidas() {
  const hoy = isoFecha(new Date());
  const filas = getDb()
    .prepare(
      `SELECT id FROM agenda
       WHERE estado = 'Pendiente' AND fecha < ? AND fecha GLOB '????-??-??'
         AND (clasificacion = 'Audiencia judicial' OR lower(tipo) LIKE 'audiencia%')`
    )
    .all(hoy);
  if (!filas.length) return;
  const marca = ahoraStr();
  tx(() => {
    const actualizar = getDb().prepare(
      "UPDATE agenda SET estado = 'Realizada', usuario_resolucion = ?, fecha_resolucion = ? WHERE id = ? AND estado = 'Pendiente'"
    );
    for (const fila of filas) {
      actualizar.run("sistema", marca, fila.id);
      registrarAuditoria(fila.id, "AGENDA_REALIZADA", "estado", "Pendiente", "Realizada", "sistema", "");
    }
  });
}

router.use((_req, _res, next) => {
  cerrarAudienciasVencidas();
  next();
});

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
  return sqlVisibilidad(query, params);
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
  else if (fila.clasificacion === "Audiencia judicial" || TIPOS_AGENDA_BLOQUEANTES.includes(fila.tipo)) tag = "audiencia";
  if (fila.participantes) desc += ` — Participa: ${fila.participantes}`;
  const alcanceTxt = { general: "General", dependencia: "Dependencia", agente: "Agente" }[fila.alcance] || "";

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
    responsable: fila.responsable || fila.usuario_carga || "",
    alcance: fila.alcance || "dependencia",
    alcanceTxt,
    fuero: fila.fuero || "",
    codigoTipo: fila.codigo_tipo || "",
    clasificacion: fila.clasificacion || "",
    participantes: fila.participantes || "",
    detenido: Number(fila.detenido) === 1,
    descripcionCompleta: desc,
    hecho,
    tag,
  };
}

function leerEvento(id) {
  return getDb()
    .prepare(
      `SELECT id, tipo, expediente, descripcion, anotacion, fecha, hora, detenido, estado, usuario_carga,
              alcance, fuero, codigo_tipo, clasificacion, responsable
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
      nombre: String(req.query.nombreDependencia || "").trim(),
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
  const operador = String(req.usuario || "").trim().toLowerCase();
  const filtroHoy = [];
  const filtroAtrasados = [];
  const filtroProximos = [];
  const clausulaHoy = sqlDependencia(req.query, filtroHoy);
  const clausulaAtrasados = sqlDependencia(req.query, filtroAtrasados);
  const clausulaProximos = sqlDependencia(req.query, filtroProximos);
  const clausulaOperador = ` AND estado = 'Pendiente' AND lower(coalesce(nullif(responsable, ''), usuario_carga)) = ?`;
  filtroHoy.push(operador);
  filtroAtrasados.push(operador);
  filtroProximos.push(operador);
  const deHoy = getDb()
    .prepare(
      `SELECT id, fecha, tipo, expediente, hora, detenido FROM agenda
       WHERE fecha = ?${clausulaHoy}${clausulaOperador} ORDER BY hora ASC`
    )
    .all(hoy, ...filtroHoy);
  const atrasados = getDb()
    .prepare(
      `SELECT id, fecha, tipo, expediente, hora, detenido FROM agenda
       WHERE fecha < ?${clausulaAtrasados}${clausulaOperador} ORDER BY fecha ASC, hora ASC`
    )
    .all(hoy, ...filtroAtrasados);
  const proximos = getDb()
    .prepare(
      `SELECT id, fecha, tipo, expediente, hora, detenido FROM agenda
       WHERE fecha > ?${clausulaProximos}${clausulaOperador} ORDER BY fecha ASC, hora ASC`
    )
    .all(hoy, ...filtroProximos);
  const marcar = (fila) => ({ ...fila, detenido: Number(fila.detenido) === 1 });
  res.json({
    hoy: deHoy.map(marcar),
    atrasados: atrasados.map(marcar),
    proximos: proximos.map(marcar),
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
  const consulta = consultaListado(req.query);
  if (consulta.error) return res.status(400).json({ error: consulta.error });
  const datos = getDb().prepare(consulta.sql).all(...consulta.params);
  if (!datos.length) return res.status(404).json({ error: "No se encontraron agendamientos con esos parámetros." });
  const csv = aCsv(
    ["Fecha", "Hora", "Responsable", "Tipo", "Expediente", "Descripción", "Anotación", "Con detenido", "Estado"],
    datos.map((f) => [
      f.fecha.split("-").reverse().join("/"),
      f.hora,
      f.responsable || f.usuario_carga,
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

router.get("/listado", (req, res) => {
  const consulta = consultaListado(req.query);
  if (consulta.error) return res.status(400).json({ error: consulta.error });
  const datos = getDb().prepare(consulta.sql).all(...consulta.params);
  res.json({ filas: datos });
});

function consultaListado(query) {
  const proceso = String(query.proceso || "Todos").trim();
  const procesoExacto = Boolean(proceso && proceso !== "Todos");
  const partes = [];
  if (query.audiencia !== "0") {
    partes.push("clasificacion IN ('Audiencia judicial', 'Diligencia procesal', 'Encuentro de mediación')");
  }
  if (query.vencimiento !== "0") partes.push("clasificacion = 'Plazo' OR tipo = 'Vencimiento de Plazo'");
  if (query.tarea !== "0") partes.push("clasificacion IN ('Evento', 'Licencia') OR tipo IN ('Trámite / Otro', 'Licencia')");
  if (!partes.length && !procesoExacto) {
    return { error: "Debe tildar al menos un tipo o elegir un proceso específico." };
  }
  let sql = `SELECT fecha, hora, usuario_carga, responsable, tipo, expediente, descripcion, anotacion, detenido, estado, clasificacion
             FROM agenda WHERE 1 = 1`;
  const params = [];
  const resp = String(query.responsable || "Todos");
  if (resp && resp !== "Todos") {
    sql += " AND lower(coalesce(nullif(responsable, ''), usuario_carga)) = ?";
    params.push(resp.toLowerCase());
  }
  if (query.desde) {
    if (!parseISO(query.desde)) return { error: "Fecha Desde inválida." };
    sql += " AND fecha >= ?";
    params.push(query.desde);
  }
  if (query.hasta) {
    if (!parseISO(query.hasta)) return { error: "Fecha Hasta inválida." };
    sql += " AND fecha <= ?";
    params.push(query.hasta);
  }
  const estado = String(query.estado || "Todo");
  if (estado !== "Todo") {
    if (!ESTADOS_AGENDA.includes(estado)) return { error: "Estado inválido." };
    sql += " AND estado = ?";
    params.push(estado);
  }
  if (procesoExacto) {
    sql += " AND tipo = ?";
    params.push(proceso);
  } else if (partes.length) {
    sql += ` AND (${partes.join(" OR ")})`;
  }
  sql += sqlDependencia(query, params);
  sql += " ORDER BY fecha ASC, hora ASC";
  return { sql, params };
}

router.get("/", (req, res) => {
  const fecha = parseISO(req.query.fecha);
  if (!fecha) return res.status(400).json({ error: "Fecha inválida." });
  const termino = `%${String(req.query.q || "").trim()}%`;
  let sql = `
    SELECT id, estado, fecha, hora, tipo, expediente, descripcion, anotacion, usuario_carga, detenido,
           alcance, fuero, codigo_tipo, clasificacion, responsable,
           (SELECT group_concat(nombre, ' · ') FROM agenda_participantes p WHERE p.agenda_id = agenda.id) AS participantes
    FROM agenda
    WHERE fecha = ?
      AND (expediente LIKE ? OR descripcion LIKE ? OR tipo LIKE ? OR anotacion LIKE ?)
  `;
  const params = [isoFecha(fecha), termino, termino, termino, termino];
  if (req.query.pendientes === "1") sql += " AND estado = 'Pendiente'";
  const resp = String(req.query.responsable || "");
  if (resp && resp !== "Todos los miembros") {
    sql += " AND lower(coalesce(nullif(responsable, ''), usuario_carga)) = lower(?)";
    params.push(resp);
  }
  sql += sqlDependencia(req.query, params);
  sql += " ORDER BY hora ASC, id ASC";
  const filas = getDb().prepare(sql).all(...params).map(formatear);
  res.json({ fecha: isoFecha(fecha), total: filas.length, eventos: filas });
});

function firmaNombre(nombre) {
  return String(nombre || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z]/g, "")
    .toLowerCase();
}

const FIRMAS_SEMILLA = new Set(USUARIOS_INICIALES.map(([nombre]) => firmaNombre(nombre)));

function fechaDeCelda(valor) {
  if (valor instanceof Date && !Number.isNaN(valor.getTime())) {
    const mes = String(valor.getMonth() + 1).padStart(2, "0");
    const dia = String(valor.getDate()).padStart(2, "0");
    return `${valor.getFullYear()}-${mes}-${dia}`;
  }
  if (typeof valor === "number" && Number.isFinite(valor)) {
    const utc = new Date(Date.UTC(1899, 11, 30) + Math.floor(valor) * 86400000);
    return utc.toISOString().slice(0, 10);
  }
  const texto = String(valor || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(texto)) return texto.slice(0, 10);
  const barra = /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/.exec(texto);
  if (barra) {
    return `${barra[3]}-${barra[2].padStart(2, "0")}-${barra[1].padStart(2, "0")}`;
  }
  return "";
}

function filasDeArchivo(base64) {
  const libro = XLSX.read(Buffer.from(base64, "base64"), { type: "buffer", cellDates: false });
  const hoja = libro.Sheets[libro.SheetNames[0]];
  const crudas = XLSX.utils.sheet_to_json(hoja, { defval: "" });
  return crudas.map((fila) => {
    const claves = Object.fromEntries(Object.entries(fila).map(([k, v]) => [String(k).trim().toLowerCase(), v]));
    return {
      fecha: fechaDeCelda(claves.fecha || claves.dia || claves.date),
      nombre: String(claves.evento || claves.nombre || claves.descripcion || claves["nombre del evento"] || "").trim(),
      tipo: String(claves.tipo || claves.audiencia || claves["tipo de audiencia"] || claves["tipo de evento"] || "").trim(),
      hora: String(claves.hora || "").trim(),
    };
  }).filter((fila) => fila.fecha || fila.nombre || fila.tipo);
}

router.get("/catalogo-audiencias", exigir, (_req, res) => {
  res.json(catalogo);
});

router.get("/plazos-tipos", exigir, (_req, res) => {
  res.json(getDb().prepare("SELECT id, nombre, dias, habiles FROM tipos_plazo ORDER BY nombre").all());
});

router.post("/plazos-tipos", exigir, (req, res) => {
  const nombre = String(req.body.nombre || "").trim();
  const dias = req.body.dias === "" || req.body.dias == null ? null : Number(req.body.dias);
  const habiles = req.body.habiles === false || req.body.habiles === 0 ? 0 : 1;
  if (!nombre) return res.status(400).json({ error: "Indique el nombre del plazo." });
  try {
    getDb().prepare("INSERT INTO tipos_plazo (nombre, dias, habiles) VALUES (?, ?, ?)").run(nombre, dias, habiles);
  } catch (error) {
    if (String(error.message).includes("UNIQUE")) {
      return res.status(409).json({ error: "Ese plazo ya existe." });
    }
    throw error;
  }
  res.json({ ok: true });
});

router.delete("/plazos-tipos/:id", exigir, (req, res) => {
  getDb().prepare("DELETE FROM tipos_plazo WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

router.put("/plazos-tipos/:id", exigir, (req, res) => {
  const dias = req.body.dias === "" || req.body.dias == null ? null : Number(req.body.dias);
  const habiles = req.body.habiles === false || req.body.habiles === 0 ? 0 : 1;
  const nombre = String(req.body.nombre || "").trim();
  if (!nombre) return res.status(400).json({ error: "Indique el nombre del plazo." });
  if (dias != null && (!Number.isInteger(dias) || dias < 1)) {
    return res.status(400).json({ error: "Los días deben ser un entero mayor a cero, o quedar vacíos." });
  }
  getDb().prepare("UPDATE tipos_plazo SET nombre = ?, dias = ?, habiles = ? WHERE id = ?")
    .run(nombre, dias, habiles, Number(req.params.id));
  res.json({ ok: true });
});

router.get("/estadisticas", exigir, (req, res) => {
  const params = [];
  const filtro = sqlVisibilidad(req.query, params);
  const donde = `FROM agenda WHERE 1 = 1${filtro}`;
  const porTipo = getDb().prepare(`SELECT tipo AS etiqueta, COUNT(*) AS n ${donde} GROUP BY tipo ORDER BY n DESC`).all(...params);
  const params2 = [];
  const filtro2 = sqlVisibilidad(req.query, params2);
  const porResponsable = getDb().prepare(
    `SELECT coalesce(nullif(responsable, ''), usuario_carga, 'Sin responsable') AS etiqueta, COUNT(*) AS n
     FROM agenda WHERE 1 = 1${filtro2}
     GROUP BY etiqueta ORDER BY n DESC`
  ).all(...params2);
  const params3 = [];
  const filtro3 = sqlVisibilidad(req.query, params3);
  const porClase = getDb().prepare(
    `SELECT coalesce(nullif(clasificacion, ''), 'Sin clasificar') AS etiqueta, COUNT(*) AS n
     FROM agenda WHERE 1 = 1${filtro3} GROUP BY etiqueta ORDER BY n DESC`
  ).all(...params3);
  res.json({ porTipo, porResponsable, porClase, total: porTipo.reduce((s, f) => s + f.n, 0) });
});

router.post("/importar", exigir, async (req, res) => {
  try {
    const dep = await dependenciaHabilitada(req.body.sistema, req.body.codigo);
    const alcance = req.body.alcance === "agente" ? "agente" : "dependencia";
    let filas = Array.isArray(req.body.filas) ? req.body.filas : [];
    if (req.body.archivo) filas = filasDeArchivo(req.body.archivo);
    if (!filas.length) return res.status(400).json({ error: "El archivo no tiene filas con fecha, evento y tipo." });
    const insertar = getDb().prepare(
      `INSERT INTO agenda
        (tipo, expediente, descripcion, fecha, hora, estado, usuario_carga, fecha_carga,
         sistema, dependencia_codigo, dependencia_nombre, circunscripcion, alcance, clasificacion, responsable)
       VALUES (?, '', ?, ?, ?, 'Pendiente', ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    let cargadas = 0;
    const errores = [];
    tx(() => {
      filas.forEach((fila, indice) => {
        const fecha = fechaDeCelda(fila.fecha);
        const nombre = String(fila.nombre || "").trim();
        const tipo = String(fila.tipo || "").trim();
        if (!fecha || !nombre || !tipo) {
          errores.push(`Fila ${indice + 2}: faltan fecha, evento o tipo.`);
          return;
        }
        const catalogada = audienciaDeCatalogo("", tipo);
        insertar.run(
          catalogada?.tipo || tipo,
          nombre,
          fecha,
          normalizarHora(fila.hora) || "",
          req.usuario,
          ahoraStr(),
          dep.sistema,
          dep.codigo,
          dep.nombre,
          dep.circunscripcion || "",
          alcance,
          catalogada?.clasificacion || "Evento",
          alcance === "agente" ? req.usuario : (String(req.body.responsable || "").trim() || req.usuario)
        );
        cargadas += 1;
      });
    });
    res.json({ cargadas, errores });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message || "No se pudo importar el archivo." });
  }
});

router.get("/integrantes", exigir, async (req, res) => {
  try {
    const dependencia = await dependenciaHabilitada(req.query.sistema, req.query.codigo);
    const cargados = getDb()
      .prepare(
        `SELECT DISTINCT usuario_carga AS nombre
         FROM agenda
         WHERE sistema = ? AND dependencia_codigo = ? AND trim(coalesce(usuario_carga, '')) <> ''`
      )
      .all(dependencia.sistema, dependencia.codigo);
    const porFirma = new Map();
    function sumar(nombre) {
      const limpio = String(nombre || "").trim();
      if (!limpio || FIRMAS_SEMILLA.has(firmaNombre(limpio))) return;
      const firma = firmaNombre(limpio);
      if (!porFirma.has(firma)) porFirma.set(firma, limpio);
    }
    sumar(req.usuario);
    sumar(dependencia.usuario);
    for (const fila of cargados) sumar(fila.nombre);
    const integrantes = [...porFirma.values()].sort((a, b) => a.localeCompare(b, "es"));
    res.json({ integrantes });
  } catch (error) {
    res.status(error.status || 502).json({ error: error.message || "No se pudieron leer los integrantes." });
  }
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

function claseDe(body) {
  const clase = String(body.clase || "");
  if (["audiencia", "licencia", "evento", "plazo"].includes(clase)) return clase;
  if (body.tipo === "Vencimiento de Plazo") return "plazo";
  if (body.tipo === "Licencia") return "licencia";
  if (TIPOS_AGENDA_TODOS.includes(body.tipo)) return "audiencia";
  return "evento";
}

function audienciaDeCatalogo(codigo, tipo) {
  return catalogo.audiencias.find((item) => item.codigo === codigo || item.tipo === tipo) || null;
}

function participantesDe(body) {
  const lista = Array.isArray(body.participantes) ? body.participantes : [];
  const vistos = new Set();
  const salida = [];
  for (const item of lista) {
    const nombre = String(item?.nombre || item || "").trim();
    if (!nombre) continue;
    const sistema = String(item?.sistema || "").trim().toUpperCase();
    const codigo = String(item?.codigo || "").trim();
    const clave = `${sistema}:${codigo}:${nombre.toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ sistema, codigo, nombre });
  }
  const extra = String(body.otraOficina || "").split(/[;,]/).map((t) => t.trim()).filter(Boolean);
  for (const nombre of extra) {
    const clave = `::${nombre.toLowerCase()}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    salida.push({ sistema: "", codigo: "", nombre });
  }
  return salida;
}

async function rechazoSiExpedienteAjeno(datos, dep, actual) {
  if (datos.clase !== "audiencia") return null;
  if (actual && String(actual.expediente || "") === datos.expediente) return null;
  let causa;
  try {
    causa = await datosExpediente({ numero: datos.expediente, dependencia: dep });
  } catch (error) {
    return { status: error.status || 502, error: error.message || "No se pudo consultar el expediente." };
  }
  if (causa.corresponde) return null;
  return { status: 409, error: causa.mensaje };
}

function validarCarga(body, rol) {
  const clase = claseDe(body);
  const catalogada = audienciaDeCatalogo(String(body.codigoTipo || ""), String(body.tipo || ""));
  const tipo = catalogada?.tipo || String(body.tipo || "").trim();
  const descripcion = String(body.descripcion || "").trim();
  const anotacion = String(body.anotacion || "").trim();
  const fecha = parseISO(body.fecha);
  const detenido = body.detenido ? 1 : 0;
  let alcance = ["general", "dependencia", "agente"].includes(body.alcance) ? body.alcance : "agente";
  if (alcance === "general" && rol !== "admin") {
    return { error: "Solo el administrador general puede cargar la agenda de todo el Poder Judicial." };
  }
  if (!tipo) return { error: "Seleccione el tipo de audiencia o evento." };
  if (!fecha) return { error: "Fecha inválida." };
  let expediente = clase === "licencia" ? "" : normalizarExpte(body.expediente);
  if ((clase === "audiencia" || clase === "plazo") && !expediente) {
    return { error: "Ingrese el expediente." };
  }
  if (clase === "audiencia" && !catalogada && !TIPOS_AGENDA_TODOS.includes(tipo)) {
    return { error: "Seleccione un tipo del catálogo de audiencias." };
  }
  let hora = String(body.hora || "").trim();
  if (clase === "audiencia") {
    hora = normalizarHora(hora);
    if (!hora) return { error: "La audiencia requiere hora en formato HH:MM." };
  } else if (hora) {
    hora = normalizarHora(hora) || "";
  }
  const habil = esDiaHabil(fecha);
  const clasificacion = catalogada?.clasificacion || (clase === "plazo" ? "Plazo" : clase === "licencia" ? "Licencia" : clase === "evento" ? "Evento" : "");
  return {
    expediente,
    tipo,
    descripcion,
    anotacion,
    fecha,
    hora,
    detenido,
    habil,
    alcance,
    fuero: catalogada?.fuero || String(body.fuero || ""),
    codigoTipo: catalogada?.codigo || "",
    clasificacion,
    clase,
  };
}

router.post("/", async (req, res) => {
  const datos = validarCarga(req.body, req.rol);
  if (datos.error) return res.status(400).json({ error: datos.error });
  let dep;
  try {
    dep = await dependenciaHabilitada(req.body.sistema, req.body.codigo);
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message });
  }
  const ajeno = await rechazoSiExpedienteAjeno(datos, dep);
  if (ajeno) return res.status(ajeno.status).json({ error: ajeno.error });
  if (!datos.habil.ok && !req.body.confirmarInhabil) {
    return res.status(409).json({
      code: "INHABIL",
      motivo: datos.habil.motivo,
      error: `${datos.habil.motivo}. ¿Cargar igualmente?`,
    });
  }
  const responsable = datos.alcance === "agente"
    ? req.usuario
    : (String(req.body.responsable || "").trim() || req.usuario);
  const participantes = participantesDe(req.body).filter(
    (p) => !(p.sistema === dep.sistema && p.codigo === dep.codigo)
  );
  if (datos.clasificacion === "Audiencia judicial" || TIPOS_AGENDA_BLOQUEANTES.includes(datos.tipo)) {
    const colision = getDb()
      .prepare(
        `SELECT expediente, tipo FROM agenda
         WHERE fecha = ? AND hora = ? AND estado = 'Pendiente'
           AND sistema = ? AND dependencia_codigo = ?
           AND lower(coalesce(nullif(responsable, ''), usuario_carga)) = lower(?)
           AND (clasificacion = 'Audiencia judicial' OR tipo = ?)`
      )
      .get(isoFecha(datos.fecha), datos.hora, dep.sistema, dep.codigo, responsable, datos.tipo);
    if (colision) {
      return res.status(409).json({
        code: "COLISION",
        error: `${responsable} ya tiene fijado: ${colision.tipo} — Expte: ${colision.expediente}`,
      });
    }
  }
  const creado = tx(() => {
    const info = getDb()
      .prepare(
        `INSERT INTO agenda
          (tipo, expediente, descripcion, anotacion, fecha, hora, detenido, estado, usuario_carga, fecha_carga,
           sistema, dependencia_codigo, dependencia_nombre, circunscripcion,
           alcance, fuero, codigo_tipo, clasificacion, responsable)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Pendiente', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        dep.circunscripcion || "",
        datos.alcance,
        datos.fuero,
        datos.codigoTipo,
        datos.clasificacion,
        responsable
      );
    const id = Number(info.lastInsertRowid);
    const insertar = getDb().prepare(
      "INSERT INTO agenda_participantes (agenda_id, sistema, codigo, nombre) VALUES (?, ?, ?, ?)"
    );
    for (const oficina of participantes) insertar.run(id, oficina.sistema, oficina.codigo, oficina.nombre);
    let detalle = `${datos.alcance} | ${datos.tipo} | ${datos.expediente} | ${isoFecha(datos.fecha)} ${datos.hora}`;
    if (participantes.length) detalle += ` | Participa: ${participantes.map((p) => p.nombre).join(", ")}`;
    registrarAuditoria(id, "AGENDA_CREACION", "-", "-", detalle, req.usuario, req.equipo);
    return id;
  });
  res.json({ id: creado, fecha: isoFecha(datos.fecha) });
});

router.put("/:id", async (req, res) => {
  const id = Number(req.params.id);
  const actual = leerEvento(id);
  if (!actual) return res.status(404).json({ error: "Evento inexistente." });
  const datos = validarCarga(req.body, req.rol);
  if (datos.error) return res.status(400).json({ error: datos.error });
  let dep;
  try {
    dep = await dependenciaHabilitada(req.body.sistema, req.body.codigo);
  } catch (error) {
    return res.status(error.status || 502).json({ error: error.message });
  }
  const ajeno = await rechazoSiExpedienteAjeno(datos, dep, actual);
  if (ajeno) return res.status(ajeno.status).json({ error: ajeno.error });
  const responsable = datos.alcance === "agente"
    ? req.usuario
    : (String(req.body.responsable || "").trim() || req.usuario);
  const participantes = participantesDe(req.body).filter(
    (p) => !(p.sistema === dep.sistema && p.codigo === dep.codigo)
  );
  if (datos.clasificacion === "Audiencia judicial" || TIPOS_AGENDA_BLOQUEANTES.includes(datos.tipo)) {
    const colision = getDb()
      .prepare(
        `SELECT expediente, tipo FROM agenda
         WHERE id <> ? AND fecha = ? AND hora = ? AND estado = 'Pendiente'
           AND sistema = ? AND dependencia_codigo = ?
           AND lower(coalesce(nullif(responsable, ''), usuario_carga)) = lower(?)
           AND (clasificacion = 'Audiencia judicial' OR tipo = ?)`
      )
      .get(id, isoFecha(datos.fecha), datos.hora, dep.sistema, dep.codigo, responsable, datos.tipo);
    if (colision) {
      return res.status(409).json({
        code: "COLISION",
        error: `${responsable} ya tiene fijado: ${colision.tipo} — Expte: ${colision.expediente}`,
      });
    }
  }
  tx(() => {
    getDb()
      .prepare(
        `UPDATE agenda
         SET tipo = ?, expediente = ?, descripcion = ?, anotacion = ?, fecha = ?, hora = ?, detenido = ?,
             sistema = ?, dependencia_codigo = ?, dependencia_nombre = ?, circunscripcion = ?,
             alcance = ?, fuero = ?, codigo_tipo = ?, clasificacion = ?, responsable = ?
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
        datos.alcance,
        datos.fuero,
        datos.codigoTipo,
        datos.clasificacion,
        responsable,
        id
      );
    getDb().prepare("DELETE FROM agenda_participantes WHERE agenda_id = ?").run(id);
    const insertar = getDb().prepare(
      "INSERT INTO agenda_participantes (agenda_id, sistema, codigo, nombre) VALUES (?, ?, ?, ?)"
    );
    for (const oficina of participantes) insertar.run(id, oficina.sistema, oficina.codigo, oficina.nombre);
    const cambios = [
      ["tipo", actual.tipo, datos.tipo],
      ["expediente", actual.expediente, datos.expediente],
      ["alcance", actual.alcance || "", datos.alcance],
      ["responsable", actual.responsable || "", responsable],
      ["fecha", actual.fecha, isoFecha(datos.fecha)],
      ["hora", actual.hora || "", datos.hora],
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
  const id = Number(req.params.id);
  const row = getDb().prepare(
    "SELECT tipo, expediente, fecha, hora, usuario_carga, responsable FROM agenda WHERE id = ?"
  ).get(id);
  if (!row) return res.status(404).json({ error: "Evento inexistente." });
  const propio = [row.usuario_carga, row.responsable].some(
    (nombre) => String(nombre || "").trim().toLowerCase() === String(req.usuario || "").trim().toLowerCase()
  );
  if (req.rol !== "admin" && !propio) {
    return res.status(403).json({ error: "Solo quien cargó el evento, su responsable o el administrador general pueden borrarlo." });
  }
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
    getDb().prepare("DELETE FROM agenda_participantes WHERE agenda_id = ?").run(id);
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
