import { useCallback, useEffect, useMemo, useState } from "react";
import { api, descargar } from "./api.js";
import Modal from "./Modal.jsx";

const MESES = ["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const DIAS = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"];
const DOW = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function pad(n) {
  return String(n).padStart(2, "0");
}
function isoDe(fecha) {
  return `${fecha.getFullYear()}-${pad(fecha.getMonth() + 1)}-${pad(fecha.getDate())}`;
}
function hoy() {
  return isoDe(new Date());
}
function parse(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function moverMes(iso, delta) {
  const f = parse(iso);
  return isoDe(new Date(f.getFullYear(), f.getMonth() + delta, 1));
}
function mesesVisibles(centro) {
  return [-1, 0, 1].map((delta) => {
    const f = parse(moverMes(centro, delta));
    return { anio: f.getFullYear(), mes: f.getMonth() + 1, inicio: isoDe(f) };
  });
}
function ddmm(iso) {
  return iso.split("-").reverse().join("/");
}
function fechaLarga(iso) {
  const f = parse(iso);
  return `${f.getDate()} de ${MESES[f.getMonth() + 1]} de ${f.getFullYear()}`;
}
function nombreDia(iso) {
  const f = parse(iso);
  const nombre = DIAS[(f.getDay() + 6) % 7];
  return nombre.charAt(0).toUpperCase() + nombre.slice(1);
}

const VACIO = {
  tipo: "",
  expediente: "",
  fecha: "",
  hora: "09:00",
  descripcion: "",
  anotacion: "",
  detenido: false,
};

export default function Agenda({ catalogos, rol, usuario }) {
  const [centro, setCentro] = useState(`${hoy().slice(0, 7)}-01`);
  const [seleccionado, setSeleccionado] = useState(hoy());
  const [dias, setDias] = useState({});
  const [eventos, setEventos] = useState([]);
  const [q, setQ] = useState("");
  const [responsable, setResponsable] = useState("Todos los miembros");
  const [pendientes, setPendientes] = useState(false);
  const [activo, setActivo] = useState(null);
  const [form, setForm] = useState(null);
  const [plazos, setPlazos] = useState(false);
  const [copiar, setCopiar] = useState(false);
  const [listado, setListado] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const visibles = useMemo(() => mesesVisibles(centro), [centro]);

  const cargarCalendario = useCallback(async () => {
    const desde = visibles[0].inicio;
    const ultimo = parse(visibles[2].inicio);
    const hasta = isoDe(new Date(ultimo.getFullYear(), ultimo.getMonth() + 1, 0));
    const data = await api(`/agenda/calendario?desde=${desde}&hasta=${hasta}`);
    setDias(data.dias);
  }, [visibles]);

  const cargarDia = useCallback(async () => {
    const params = new URLSearchParams({
      fecha: seleccionado,
      q,
      responsable,
      pendientes: pendientes ? "1" : "0",
    });
    const data = await api(`/agenda?${params}`);
    setEventos(data.eventos);
    setActivo((prev) => data.eventos.find((e) => e.id === prev?.id) || null);
  }, [seleccionado, q, responsable, pendientes]);

  useEffect(() => {
    cargarCalendario().catch((err) => setError(err.message));
  }, [cargarCalendario]);

  useEffect(() => {
    cargarDia().catch((err) => setError(err.message));
  }, [cargarDia]);

  async function refrescar(fecha) {
    if (fecha) setSeleccionado(fecha);
    await Promise.all([cargarCalendario(), cargarDia()]);
  }

  function abrirNuevo(precarga = {}) {
    setForm({ ...VACIO, fecha: seleccionado, ...precarga, id: null });
  }

  function abrirEdicion(ev = activo) {
    if (!ev) return setError("Seleccione un evento.");
    if (rol !== "admin" && ev.usuario !== usuario) {
      const ok = window.confirm(`Este evento fue cargado por ${ev.usuario}.\n¿Modificar igualmente? La modificación queda en auditoría.`);
      if (!ok) return;
    }
    setActivo(ev);
    setForm({
      id: ev.id,
      tipo: ev.tipo,
      expediente: ev.expediente,
      fecha: ev.fecha,
      hora: ev.hora || "09:00",
      descripcion: ev.descripcion,
      anotacion: ev.anotacion,
      detenido: ev.detenido,
    });
    setError("");
  }

  async function guardarForm(confirmarInhabil = false) {
    setError("");
    const body = { ...form, confirmarInhabil };
    try {
      const res = form.id
        ? await api(`/agenda/${form.id}`, { method: "PUT", body })
        : await api("/agenda", { method: "POST", body });
      const fecha = res.fecha || form.fecha;
      setForm(null);
      setSeleccionado(fecha);
      if (!fecha.startsWith(centro.slice(0, 7))) setCentro(`${fecha.slice(0, 7)}-01`);
      const params = new URLSearchParams({
        fecha,
        q,
        responsable,
        pendientes: pendientes ? "1" : "0",
      });
      const dia = await api(`/agenda?${params}`);
      setEventos(dia.eventos);
      await cargarCalendario();
    } catch (err) {
      if (err.data?.code === "INHABIL") {
        if (window.confirm(`${err.data.motivo}\n\n¿Cargar igualmente?`)) return guardarForm(true);
        return;
      }
      setError(err.message);
    }
  }

  async function cambiarEstado(estado, reprogramar) {
    if (!activo) return setError("Seleccione un evento.");
    if (!window.confirm(`Marcar como ${estado.toUpperCase()}:\n\n${activo.tipo} — ${activo.expediente}`)) return;
    try {
      await api(`/agenda/${activo.id}/estado`, { method: "POST", body: { estado } });
      await refrescar();
      if (reprogramar && window.confirm(`El evento quedó como ${estado}.\n\n¿Desea fijar nueva fecha y hora ahora?`)) {
        abrirNuevo({
          tipo: activo.tipo,
          expediente: activo.expediente,
          descripcion: activo.descripcion,
          detenido: activo.detenido,
          anotacion: "",
        });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function borrar() {
    if (rol !== "admin") return setError("Solo admins pueden borrar.");
    if (!activo) return setError("Seleccione un evento.");
    if (!window.confirm(`¿BORRAR DEFINITIVAMENTE este evento?\n\n${activo.tipo} — ${activo.expediente}\n${activo.fecha} ${activo.hora}\n\nPara preservar el historial conviene marcarlo Fracasada o Suspendida.`)) return;
    try {
      await api(`/agenda/${activo.id}`, { method: "DELETE" });
      setActivo(null);
      await refrescar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function copiarDecreto() {
    if (!activo) return setError("Seleccione una audiencia para generar el decreto.");
    try {
      const { texto } = await api(`/agenda/${activo.id}/decreto`);
      await navigator.clipboard.writeText(texto);
      setInfo("Proyecto de decreto copiado. Péguelo en el SIGI.");
    } catch (err) {
      setError(err.message);
    }
  }

  const etiqueta = dias[seleccionado]?.etiqueta || "";
  const tipos = catalogos.tiposAgenda.todos;

  return (
    <section className="panel agenda">
      <header className="panel-head">
        <h2>Agenda</h2>
        <button type="button" className="btn btn-primary" onClick={() => abrirNuevo()}>Nueva audiencia</button>
      </header>
      <div className="agenda-tools">
        <button type="button" onClick={borrar}>Eliminar</button>
        <button type="button" onClick={abrirEdicion}>Modificar</button>
        <button type="button" onClick={() => cambiarEstado("Realizada", false)}>Realizada</button>
        <button type="button" onClick={() => cambiarEstado("Fracasada", true)}>Fracasada</button>
        <button type="button" onClick={() => cambiarEstado("Suspendida", true)}>Suspendida</button>
        <button type="button" onClick={() => activo ? abrirNuevo({ tipo: activo.tipo, expediente: activo.expediente, descripcion: activo.descripcion, detenido: activo.detenido }) : setError("Seleccione un evento.")}>Reprogramar</button>
        <button type="button" onClick={() => setCopiar(true)}>Copiar fecha</button>
        <button type="button" onClick={copiarDecreto}>Decreto</button>
        <button type="button" onClick={() => setPlazos(true)}>Sumar días</button>
        <button type="button" onClick={() => setListado(true)}>Listado</button>
        <button type="button" onClick={() => { setSeleccionado(hoy()); setCentro(`${hoy().slice(0, 7)}-01`); }}>Hoy</button>
      </div>
      {error && <p className="banner-error">{error}</p>}
      {info && <p className="banner-ok">{info}</p>}

      <div className="cal-row">
        <button type="button" className="nav-mes" onClick={() => setCentro(moverMes(centro, -1))} aria-label="Mes anterior">‹</button>
        {visibles.map((m) => (
          <MiniMes
            key={m.inicio}
            anio={m.anio}
            mes={m.mes}
            dias={dias}
            seleccionado={seleccionado}
            onSelect={setSeleccionado}
          />
        ))}
        <button type="button" className="nav-mes" onClick={() => setCentro(moverMes(centro, 1))} aria-label="Mes siguiente">›</button>
      </div>
      <div className="agenda-meta">
        <strong className={dias[seleccionado]?.habil === false ? "inhabil" : ""}>{etiqueta}</strong>
        <div className="meta-filters">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar en el día" />
          <select value={responsable} onChange={(e) => setResponsable(e.target.value)}>
            <option>Todos los miembros</option>
            {catalogos.usuarios.map((u) => <option key={u}>{u}</option>)}
          </select>
        </div>
      </div>
      <div className="table-wrap">
        <table className="agenda-table">
          <thead>
            <tr>
              <th></th><th>Responsable</th><th>Clase</th><th>Hora</th><th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            {eventos.map((ev) => (
              <tr
                key={ev.id}
                className={`tag-${ev.tag}${activo?.id === ev.id ? " selected" : ""}`}
                onClick={() => setActivo(ev)}
                onDoubleClick={() => abrirEdicion(ev)}
              >
                <td>{ev.hecho}</td>
                <td>{ev.responsable}</td>
                <td>{ev.tipoAbrev}</td>
                <td>{ev.hora}</td>
                <td>{ev.descripcionCompleta}</td>
              </tr>
            ))}
            {eventos.length === 0 && <tr><td colSpan={5} className="muted">No hay actos para este día.</td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="agenda-foot">
        <button type="button" className={!pendientes ? "on" : ""} onClick={() => setPendientes(false)}>Todo</button>
        <button type="button" className={pendientes ? "on" : ""} onClick={() => setPendientes(true)}>Pendiente</button>
        <span>{eventos.length} acto(s) — {ddmm(seleccionado)} — {pendientes ? "Pendientes" : "Todos los estados"}</span>
      </footer>

      {form && (
        <Modal title={form.id ? "Modificar evento" : "Agregar audiencia"} onClose={() => setForm(null)}>
          <FormEvento form={form} setForm={setForm} tipos={tipos} onSubmit={() => guardarForm(false)} />
        </Modal>
      )}
      {copiar && (
        <Modal title="Copiar fecha" onClose={() => setCopiar(false)}>
          <CopiarFecha iso={seleccionado} hora={activo?.hora} onClose={() => setCopiar(false)} onInfo={setInfo} />
        </Modal>
      )}
      {plazos && (
        <Modal title="Cómputo orientativo de plazo" onClose={() => setPlazos(false)} wide>
          <Plazos
            fecha={seleccionado}
            onIr={(iso) => { setSeleccionado(iso); setCentro(`${iso.slice(0, 7)}-01`); setPlazos(false); }}
            onCrear={(datos) => { setPlazos(false); setSeleccionado(datos.fecha); abrirNuevo(datos); }}
          />
        </Modal>
      )}
      {listado && (
        <Modal title="Listado de agendamientos" onClose={() => setListado(false)} wide>
          <Listado usuarios={catalogos.usuarios} tipos={tipos} onClose={() => setListado(false)} onError={setError} />
        </Modal>
      )}
    </section>
  );
}

function MiniMes({ anio, mes, dias, seleccionado, onSelect }) {
  const primero = new Date(anio, mes - 1, 1);
  const cantidad = new Date(anio, mes, 0).getDate();
  const celdas = [...Array(primero.getDay()).fill(null)];
  for (let d = 1; d <= cantidad; d += 1) celdas.push(d);
  while (celdas.length % 7) celdas.push(null);
  const hoyIso = hoy();

  return (
    <div className="mini-mes">
      <header>{MESES[mes].toUpperCase()} {anio}</header>
      <div className="dow">{DOW.map((d) => <span key={d}>{d}</span>)}</div>
      <div className="days">
        {celdas.map((d, i) => {
          if (!d) return <span key={`e-${i}`} />;
          const iso = `${anio}-${pad(mes)}-${pad(d)}`;
          const info = dias[iso];
          const clases = [
            iso === seleccionado ? "sel" : "",
            iso === hoyIso ? "hoy" : "",
            info && !info.habil ? "inhabil" : "",
            info?.eventos ? "con-eventos" : "",
          ].filter(Boolean).join(" ");
          return (
            <button key={iso} type="button" className={clases} onClick={() => onSelect(iso)}>
              {info?.eventos ? <i /> : null}
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FormEvento({ form, setForm, tipos, onSubmit }) {
  const [aviso, setAviso] = useState("");
  useEffect(() => {
    if (!form.fecha) return;
    api(`/agenda/dia?fecha=${form.fecha}`)
      .then((d) => setAviso(`${d.ok ? "✓" : "⚠"} ${d.motivo}`))
      .catch(() => setAviso(""));
  }, [form.fecha]);

  return (
    <form className="stack" onSubmit={(e) => { e.preventDefault(); onSubmit(); }}>
      <label>Tipo
        <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })} required>
          <option value="">Seleccionar…</option>
          {tipos.map((t) => <option key={t}>{t}</option>)}
          {form.tipo && !tipos.includes(form.tipo) && <option>{form.tipo}</option>}
        </select>
      </label>
      <label>Expediente<input value={form.expediente} onChange={(e) => setForm({ ...form, expediente: e.target.value })} required /></label>
      <div className="split">
        <label>Fecha<input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} required /></label>
        <label>Hora<input value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} placeholder="09:00" /></label>
      </div>
      <label>Descripción<textarea rows={3} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} /></label>
      <label>Anotación<input value={form.anotacion} onChange={(e) => setForm({ ...form, anotacion: e.target.value })} /></label>
      <label className="check">
        <input type="checkbox" checked={form.detenido} onChange={(e) => setForm({ ...form, detenido: e.target.checked })} />
        Causa con detenido
      </label>
      {aviso && <p className={aviso.startsWith("✓") ? "ok-text" : "inhabil"}>{aviso}</p>}
      <button className="btn btn-primary" type="submit">Aceptar</button>
    </form>
  );
}

function CopiarFecha({ iso, hora, onClose, onInfo }) {
  async function copiar(texto) {
    await navigator.clipboard.writeText(texto);
    onInfo(`Copiado: ${texto}`);
    onClose();
  }
  const larga = fechaLarga(iso);
  const dia = nombreDia(iso);
  return (
    <div className="stack">
      <p><strong>{dia} {larga}</strong></p>
      <button type="button" className="btn btn-secondary" onClick={() => copiar(ddmm(iso))}>{ddmm(iso)}</button>
      <button type="button" className="btn btn-secondary" onClick={() => copiar(larga)}>{larga}</button>
      <button type="button" className="btn btn-secondary" onClick={() => copiar(`${dia} ${larga}`)}>{dia} {larga}</button>
      {hora && (
        <>
          <p className="muted">Con hora del evento ({hora})</p>
          <button type="button" className="btn btn-secondary" onClick={() => copiar(`${ddmm(iso)} ${hora} hs`)}>{ddmm(iso)} {hora} hs</button>
          <button type="button" className="btn btn-secondary" onClick={() => copiar(`${larga} a las ${hora} hs`)}>{larga} a las {hora} hs</button>
        </>
      )}
    </div>
  );
}

function Plazos({ fecha, onIr, onCrear }) {
  const [dias, setDias] = useState(5);
  const [modo, setModo] = useState("habiles");
  const [excluir, setExcluir] = useState(true);
  const [resultado, setResultado] = useState(null);
  const [error, setError] = useState("");

  async function calcular(e) {
    e.preventDefault();
    setError("");
    try {
      setResultado(await api("/agenda/plazos", {
        method: "POST",
        body: { fecha, dias: Number(dias), modo, excluirInicial: excluir },
      }));
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <form className="stack" onSubmit={calcular}>
      <p className="muted">Herramienta auxiliar. Verificar dies a quo, notificación efectiva, plazo común o individual, feria, feriados y art. 180 CPP Chaco.</p>
      <p>Fecha base: <strong>{ddmm(fecha)}</strong></p>
      <label>Sumar días<input type="number" min="1" value={dias} onChange={(e) => setDias(e.target.value)} /></label>
      <label className="check"><input type="radio" checked={modo === "habiles"} onChange={() => setModo("habiles")} /> Días hábiles procesales</label>
      <label className="check"><input type="radio" checked={modo === "corridos"} onChange={() => setModo("corridos")} /> Días corridos</label>
      <label className="check"><input type="checkbox" checked={excluir} onChange={(e) => setExcluir(e.target.checked)} /> Excluir el día inicial (dies a quo)</label>
      {error && <p className="form-error">{error}</p>}
      {resultado && <pre className="plazo-box">{resultado.resumen}</pre>}
      <div className="form-actions">
        <button className="btn btn-primary" type="submit">Calcular</button>
        <button className="btn btn-secondary" type="button" onClick={() => resultado && onIr(resultado.vence)}>Ir a fecha</button>
        <button
          className="btn btn-secondary"
          type="button"
          onClick={() => resultado && onCrear({
            tipo: "Vencimiento de Plazo",
            fecha: resultado.vence,
            hora: "",
            expediente: "",
            descripcion: `Cálculo: (${dias} ${resultado.tipoTxt}). Notificado el: ${ddmm(fecha)}. Último día del plazo: ${ddmm(resultado.ultimo)}. Vence: ${ddmm(resultado.vence)} (2 hs plazo de gracia).`,
            detenido: false,
          })}
        >
          Crear vencimiento
        </button>
      </div>
    </form>
  );
}

function Listado({ usuarios, tipos, onClose, onError }) {
  const [responsable, setResponsable] = useState("Todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tarea, setTarea] = useState(true);
  const [audiencia, setAudiencia] = useState(true);
  const [vencimiento, setVencimiento] = useState(true);
  const [estado, setEstado] = useState("Todo");
  const [proceso, setProceso] = useState("Todos");

  async function exportar(e) {
    e.preventDefault();
    const params = new URLSearchParams({
      responsable,
      estado,
      proceso,
      tarea: tarea ? "1" : "0",
      audiencia: audiencia ? "1" : "0",
      vencimiento: vencimiento ? "1" : "0",
    });
    if (desde) params.set("desde", desde);
    if (hasta) params.set("hasta", hasta);
    try {
      await descargar(`/agenda/export?${params}`, "agendamientos.csv");
      onClose();
    } catch (err) {
      onError(err.message);
      onClose();
    }
  }

  return (
    <form className="stack" onSubmit={exportar}>
      <label>Responsable
        <select value={responsable} onChange={(e) => setResponsable(e.target.value)}>
          <option>Todos</option>
          {usuarios.map((u) => <option key={u}>{u}</option>)}
        </select>
      </label>
      <div className="split">
        <label>Desde<input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} /></label>
        <label>Hasta<input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} /></label>
      </div>
      <fieldset>
        <legend>Tipo</legend>
        <label className="check"><input type="checkbox" checked={tarea} onChange={(e) => setTarea(e.target.checked)} /> Tarea</label>
        <label className="check"><input type="checkbox" checked={audiencia} onChange={(e) => setAudiencia(e.target.checked)} /> Audiencia</label>
        <label className="check"><input type="checkbox" checked={vencimiento} onChange={(e) => setVencimiento(e.target.checked)} /> Vencimiento</label>
      </fieldset>
      <label>Estado
        <select value={estado} onChange={(e) => setEstado(e.target.value)}>
          {["Todo", "Pendiente", "Realizada", "Fracasada", "Suspendida"].map((e) => <option key={e}>{e}</option>)}
        </select>
      </label>
      <label>Proceso
        <select value={proceso} onChange={(e) => setProceso(e.target.value)}>
          <option>Todos</option>
          {tipos.map((t) => <option key={t}>{t}</option>)}
        </select>
      </label>
      <button className="btn btn-primary" type="submit">Exportar</button>
    </form>
  );
}
