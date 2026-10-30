import { useEffect, useState } from "react";
import { api } from "./api.js";

const COLORES = ["#1d4363", "#00638e", "#c4a35a", "#1e7a4d", "#8f2d2d", "#5d6d7c", "#8a6a2f", "#3d6b8a"];

export default function Gestion({ modo, dependencia, onClose, onImportado }) {
  if (modo === "importar") {
    return <Importar dependencia={dependencia} onClose={onClose} onImportado={onImportado} />;
  }
  if (modo === "estadisticas") return <Estadisticas dependencia={dependencia} />;
  return <PlazosTipos />;
}

function Importar({ dependencia, onClose, onImportado }) {
  const [alcance, setAlcance] = useState("dependencia");
  const [error, setError] = useState("");
  const [resultado, setResultado] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  async function enviar(event) {
    event.preventDefault();
    const archivo = event.target.archivo.files?.[0];
    if (!archivo || !dependencia) return;
    setError("");
    setResultado(null);
    setOcupado(true);
    try {
      const base64 = await leerBase64(archivo);
      const data = await api("/agenda/importar", {
        method: "POST",
        body: {
          archivo: base64,
          sistema: dependencia.sistema,
          codigo: dependencia.codigo,
          alcance,
        },
      });
      setResultado(data);
      if (data.cargadas) onImportado?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form className="stack" onSubmit={enviar}>
      <p className="muted">
        El archivo CSV, XLS o XLSX debe tener columnas fecha, evento (o nombre) y tipo. La hora es opcional.
        La primera fila es el encabezado.
      </p>
      <label>Alcance de la carga
        <select value={alcance} onChange={(e) => setAlcance(e.target.value)}>
          <option value="dependencia">Agenda de la dependencia</option>
          <option value="agente">Mi agenda</option>
        </select>
      </label>
      <label>Archivo
        <input name="archivo" type="file" accept=".csv,.xls,.xlsx,text/csv" required />
      </label>
      {error && <p className="form-error">{error}</p>}
      {resultado && (
        <p className="ok-text">
          Se cargaron {resultado.cargadas} fila(s).
          {resultado.errores?.length ? ` ${resultado.errores.length} fila(s) omitidas.` : ""}
        </p>
      )}
      {resultado?.errores?.length > 0 && (
        <ul className="muted">
          {resultado.errores.slice(0, 8).map((linea) => <li key={linea}>{linea}</li>)}
        </ul>
      )}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit" disabled={ocupado || !dependencia}>
          {ocupado ? "Importando…" : "Importar"}
        </button>
        <button className="btn btn-secondary" type="button" onClick={onClose}>Cerrar</button>
      </div>
    </form>
  );
}

function Estadisticas({ dependencia }) {
  const [datos, setDatos] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!dependencia) return;
    const params = new URLSearchParams({
      sistema: dependencia.sistema,
      codigo: dependencia.codigo,
      nombreDependencia: dependencia.nombre || "",
    });
    api(`/agenda/estadisticas?${params}`).then(setDatos).catch((err) => setError(err.message));
  }, [dependencia]);

  if (error) return <p className="form-error">{error}</p>;
  if (!datos) return <p className="muted">Calculando…</p>;

  return (
    <div className="stack">
      <p>{datos.total} acto(s) visibles para {dependencia?.nombre}.</p>
      <Grafico titulo="Por tipo" filas={datos.porTipo} />
      <Grafico titulo="Por responsable" filas={datos.porResponsable} />
      <Grafico titulo="Por clasificación" filas={datos.porClase} />
    </div>
  );
}

function Grafico({ titulo, filas }) {
  const items = filas || [];
  const max = Math.max(1, ...items.map((f) => f.n));
  const total = items.reduce((s, f) => s + f.n, 0) || 1;
  let acumulado = 0;
  const tramos = items.map((fila, i) => {
    const inicio = acumulado;
    acumulado += (fila.n / total) * 100;
    return `${COLORES[i % COLORES.length]} ${inicio}% ${acumulado}%`;
  });
  return (
    <section>
      <h3>{titulo}</h3>
      {items.length === 0 && <p className="muted">Sin datos.</p>}
      {items.length > 0 && (
        <div className="grafico">
          <div className="torta" style={{ background: `conic-gradient(${tramos.join(", ")})` }} />
          <div className="barras">
            {items.map((fila, i) => (
              <div key={fila.etiqueta} className="barra-fila">
                <span>{fila.etiqueta}</span>
                <i style={{ width: `${(fila.n / max) * 100}%`, background: COLORES[i % COLORES.length] }} />
                <b>{fila.n}</b>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function PlazosTipos() {
  const [lista, setLista] = useState([]);
  const [nombre, setNombre] = useState("");
  const [dias, setDias] = useState("");
  const [habiles, setHabiles] = useState(true);
  const [error, setError] = useState("");

  async function cargar() {
    setLista(await api("/agenda/plazos-tipos"));
  }

  useEffect(() => {
    cargar().catch((err) => setError(err.message));
  }, []);

  async function agregar(event) {
    event.preventDefault();
    setError("");
    try {
      await api("/agenda/plazos-tipos", {
        method: "POST",
        body: { nombre, dias: dias === "" ? null : Number(dias), habiles },
      });
      setNombre("");
      setDias("");
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function guardar(plazo, cambios) {
    setError("");
    try {
      await api(`/agenda/plazos-tipos/${plazo.id}`, {
        method: "PUT",
        body: { nombre: plazo.nombre, dias: plazo.dias, habiles: plazo.habiles, ...cambios },
      });
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function quitar(id) {
    if (!window.confirm("¿Quitar este tipo de plazo?")) return;
    await api(`/agenda/plazos-tipos/${id}`, { method: "DELETE" });
    await cargar();
  }

  return (
    <div className="stack">
      <p className="muted">
        Los días quedan vacíos hasta que la dependencia defina el plazo. No se inventan cantidades legales.
      </p>
      {error && <p className="form-error">{error}</p>}
      <table className="agenda-table">
        <thead>
          <tr><th>Plazo</th><th>Días</th><th>Cómputo</th><th></th></tr>
        </thead>
        <tbody>
          {lista.map((plazo) => (
            <tr key={plazo.id}>
              <td>{plazo.nombre}</td>
              <td>
                <input
                  type="number"
                  min="1"
                  defaultValue={plazo.dias ?? ""}
                  onBlur={(e) => {
                    const valor = e.target.value === "" ? null : Number(e.target.value);
                    if (valor !== plazo.dias) guardar(plazo, { dias: valor });
                  }}
                />
              </td>
              <td>
                <select
                  value={plazo.habiles ? "habiles" : "corridos"}
                  onChange={(e) => guardar(plazo, { habiles: e.target.value === "habiles" })}
                >
                  <option value="habiles">Hábiles</option>
                  <option value="corridos">Corridos</option>
                </select>
              </td>
              <td><button type="button" onClick={() => quitar(plazo.id)}>Quitar</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="stack" onSubmit={agregar}>
        <label>Nuevo tipo<input value={nombre} onChange={(e) => setNombre(e.target.value)} required /></label>
        <div className="split">
          <label>Días<input type="number" min="1" value={dias} onChange={(e) => setDias(e.target.value)} /></label>
          <label className="check">
            <input type="checkbox" checked={habiles} onChange={(e) => setHabiles(e.target.checked)} />
            Días hábiles
          </label>
        </div>
        <button className="btn btn-primary" type="submit">Agregar plazo</button>
      </form>
    </div>
  );
}

function leerBase64(archivo) {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      const texto = String(lector.result || "");
      const coma = texto.indexOf(",");
      resolve(coma >= 0 ? texto.slice(coma + 1) : texto);
    };
    lector.onerror = () => reject(new Error("No se pudo leer el archivo."));
    lector.readAsDataURL(archivo);
  });
}
