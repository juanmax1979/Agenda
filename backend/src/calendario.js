const { getDb } = require("./db");
const {
  FERIADOS_FIJOS,
  FERIAS_INVIERNO,
  MESES,
  isoFecha,
  addDays,
  fechaLarga,
  nombreDia,
} = require("./util");

const permanentes = new Map();
const excepcionales = new Map();

function cargarFeriados() {
  permanentes.clear();
  excepcionales.clear();
  const filas = getDb().prepare("SELECT fecha, descripcion, tipo FROM feriados").all();
  for (const fila of filas) {
    if (fila.tipo === "PERMANENTE") permanentes.set(fila.fecha, fila.descripcion);
    else excepcionales.set(fila.fecha, fila.descripcion);
  }
}

function esDiaHabil(fecha) {
  if (fecha.getDay() === 0 || fecha.getDay() === 6) {
    return { ok: false, motivo: "Fin de semana (sábado/domingo)" };
  }
  if (fecha.getMonth() === 0) {
    return { ok: false, motivo: "Feria Judicial de Verano (enero)" };
  }
  const feria = FERIAS_INVIERNO[fecha.getFullYear()];
  const clave = isoFecha(fecha);
  if (feria && clave >= feria[0] && clave <= feria[1]) {
    return { ok: false, motivo: `Feria Judicial de Invierno (${feria[0]} a ${feria[1]})` };
  }
  if (excepcionales.has(clave)) {
    return { ok: false, motivo: excepcionales.get(clave) };
  }
  const mmdd = clave.slice(5);
  if (permanentes.has(mmdd)) {
    return { ok: false, motivo: permanentes.get(mmdd) };
  }
  const fijo = FERIADOS_FIJOS.find(([mes, dia]) => mes === fecha.getMonth() + 1 && dia === fecha.getDate());
  if (fijo) return { ok: false, motivo: fijo[2] };
  return { ok: true, motivo: "Día hábil" };
}

function etiquetaDia(fecha) {
  const estado = esDiaHabil(fecha);
  if (!estado.ok) return estado.motivo;
  const dia = nombreDia(fecha);
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)} ${fechaLarga(fecha)}`;
}

function sumarDiasHabiles(fechaInicio, n) {
  let actual = fechaInicio;
  let contador = 0;
  let i = 0;
  const max = n * 5 + 50;
  while (contador < n && i < max) {
    actual = addDays(actual, 1);
    if (esDiaHabil(actual).ok) contador += 1;
    i += 1;
  }
  return actual;
}

function proximoDiaHabil(fecha) {
  let actual = addDays(fecha, 1);
  while (!esDiaHabil(actual).ok) actual = addDays(actual, 1);
  return actual;
}

function calcularPlazo({ fechaBase, dias, habiles, excluirInicial }) {
  let ultimo;
  if (habiles) {
    if (excluirInicial) {
      ultimo = sumarDiasHabiles(fechaBase, dias);
    } else if (esDiaHabil(fechaBase).ok) {
      ultimo = dias === 1 ? fechaBase : sumarDiasHabiles(fechaBase, dias - 1);
    } else {
      ultimo = sumarDiasHabiles(fechaBase, dias);
    }
  } else {
    ultimo = excluirInicial ? addDays(fechaBase, dias) : addDays(fechaBase, Math.max(dias - 1, 0));
  }
  const vence = proximoDiaHabil(ultimo);
  const tipoTxt = habiles ? "días hábiles procesales" : "días corridos";
  const linea = (f) =>
    `${nombreDia(f).charAt(0).toUpperCase()}${nombreDia(f).slice(1)} ${isoFecha(f).split("-").reverse().join("/")}`;
  return {
    ultimo: isoFecha(ultimo),
    vence: isoFecha(vence),
    ultimoTexto: linea(ultimo),
    venceTexto: linea(vence),
    tipoTxt,
    resumen:
      `Último día: ${linea(ultimo)}\n` +
      `Vencimiento operativo: ${linea(vence)}\n` +
      `Plazo computado: ${dias} ${tipoTxt}\n` +
      "Regla aplicada: dos primeras horas del día hábil siguiente",
  };
}

function diasEnRango(desde, hasta) {
  const salida = {};
  let cursor = desde;
  const fin = isoFecha(hasta);
  while (isoFecha(cursor) <= fin) {
    const clave = isoFecha(cursor);
    const estado = esDiaHabil(cursor);
    salida[clave] = {
      habil: estado.ok,
      motivo: estado.motivo,
      etiqueta: etiquetaDia(cursor),
      eventos: 0,
    };
    cursor = addDays(cursor, 1);
  }
  const marcas = getDb()
    .prepare(
      `SELECT fecha, COUNT(*) AS n FROM agenda
       WHERE fecha >= ? AND fecha <= ?
       GROUP BY fecha`
    )
    .all(isoFecha(desde), isoFecha(hasta));
  for (const marca of marcas) {
    if (salida[marca.fecha]) salida[marca.fecha].eventos = marca.n;
  }
  return salida;
}

module.exports = {
  cargarFeriados,
  esDiaHabil,
  etiquetaDia,
  calcularPlazo,
  diasEnRango,
  MESES,
};
