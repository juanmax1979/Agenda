import { useCallback, useEffect, useMemo, useState } from "react";
import { api, descargar } from "./api.js";
import Modal from "./Modal.jsx";
import Gestion from "./Gestion.jsx";
import { CampoFecha } from "./Fecha.jsx";

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
  clase: "audiencia",
  alcance: "agente",
  tipo: "",
  fuero: "",
  codigoTipo: "",
  clasificacion: "",
  expediente: "",
  fecha: "",
  hora: "09:00",
  descripcion: "",
  anotacion: "",
  detenido: false,
  responsable: "",
  participantes: [],
  otraOficina: "",
};

export default function Agenda({ catalogos, rol, usuario, dependencia, fuentes, onCambio, abrir, onAbierto }) {
  const [centro, setCentro] = useState(`${hoy().slice(0, 7)}-01`);
  const [seleccionado, setSeleccionado] = useState(hoy());
  const [dias, setDias] = useState({});
  const [eventos, setEventos] = useState([]);
  const [q, setQ] = useState("");
  const [responsable, setResponsable] = useState("Todos los miembros");
  const [integrantes, setIntegrantes] = useState([]);
  const [pendientes, setPendientes] = useState(false);
  const [activo, setActivo] = useState(null);
  const [form, setForm] = useState(null);
  const [plazos, setPlazos] = useState(false);
  const [copiar, setCopiar] = useState(false);
  const [listado, setListado] = useState(false);
  const [gestion, setGestion] = useState("");
  const [catalogo, setCatalogo] = useState(null);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");

  const visibles = useMemo(() => mesesVisibles(centro), [centro]);

  const sistema = dependencia?.sistema || "";
  const codigo = dependencia?.codigo || "";
  const nombreDependencia = dependencia?.nombre || "";

  const cargarCalendario = useCallback(async () => {
    if (!sistema || !codigo) {
      setDias({});
      return;
    }
    const desde = visibles[0].inicio;
    const ultimo = parse(visibles[2].inicio);
    const hasta = isoDe(new Date(ultimo.getFullYear(), ultimo.getMonth() + 1, 0));
    const params = new URLSearchParams({ desde, hasta, sistema, codigo, nombreDependencia });
    const data = await api(`/agenda/calendario?${params}`);
    setDias(data.dias);
  }, [visibles, sistema, codigo, nombreDependencia]);

  const cargarDia = useCallback(async () => {
    if (!sistema || !codigo) {
      setEventos([]);
      return;
    }
    const params = new URLSearchParams({
      fecha: seleccionado,
      q,
      responsable,
      pendientes: pendientes ? "1" : "0",
      sistema,
      codigo,
      nombreDependencia,
    });
    const data = await api(`/agenda?${params}`);
    setEventos(data.eventos);
    setActivo((prev) => data.eventos.find((e) => e.id === prev?.id) || null);
  }, [seleccionado, q, responsable, pendientes, sistema, codigo, nombreDependencia]);

  useEffect(() => {
    if (!sistema || !codigo) {
      setIntegrantes([]);
      return;
    }
    const params = new URLSearchParams({ sistema, codigo });
    api(`/agenda/integrantes?${params}`)
      .then((data) => setIntegrantes(data.integrantes || []))
      .catch(() => setIntegrantes([]));
  }, [sistema, codigo]);

  useEffect(() => {
    if (responsable !== "Todos los miembros" && !integrantes.includes(responsable)) {
      setResponsable("Todos los miembros");
    }
  }, [integrantes, responsable]);

  useEffect(() => {
    api("/agenda/catalogo-audiencias").then(setCatalogo).catch(() => setCatalogo(null));
  }, []);

  useEffect(() => {
    cargarCalendario().catch((err) => setError(err.message));
  }, [cargarCalendario]);

  useEffect(() => {
    cargarDia().catch((err) => setError(err.message));
  }, [cargarDia]);

  useEffect(() => {
    if (!abrir?.id || !abrir.fecha) return;
    setQ("");
    setPendientes(false);
    setSeleccionado(abrir.fecha);
    setCentro(`${abrir.fecha.slice(0, 7)}-01`);
  }, [abrir]);

  useEffect(() => {
    if (!abrir?.id || seleccionado !== abrir.fecha) return;
    const delDia = eventos.filter((item) => item.fecha === abrir.fecha);
    if (!delDia.length) return;
    const ev = delDia.find((item) => Number(item.id) === Number(abrir.id));
    if (ev) setActivo(ev);
    requestAnimationFrame(() => {
      document.querySelector(".cal-row button.sel")?.scrollIntoView({ block: "center", inline: "nearest" });
    });
    onAbierto?.();
  }, [eventos, abrir, seleccionado]);

  async function refrescar(fecha) {
    if (fecha) setSeleccionado(fecha);
    await Promise.all([cargarCalendario(), cargarDia()]);
    onCambio?.();
  }

  function abrirNuevo(precarga = {}) {
    const fuero = catalogo?.fueros?.includes(dependencia?.fuero) ? dependencia.fuero : "";
    setForm({ ...VACIO, fecha: seleccionado, fuero, responsable: usuario, ...precarga, id: null });
  }

  function abrirEdicion(ev = activo) {
    if (!ev) {
      setError("Seleccione un evento.");
      return false;
    }
    if (rol !== "admin" && ev.usuario !== usuario) {
      const ok = window.confirm(`Este evento fue cargado por ${ev.usuario}.\n¿Modificar igualmente? La modificación queda en auditoría.`);
      if (!ok) return false;
    }
    setActivo(ev);
    setForm({
      id: ev.id,
      clase: ev.clasificacion === "Licencia" ? "licencia" : ev.clasificacion === "Evento" ? "evento" : ev.tipo === "Vencimiento de Plazo" ? "plazo" : "audiencia",
      alcance: ev.alcance || "agente",
      tipo: ev.tipo,
      fuero: ev.fuero || "",
      codigoTipo: ev.codigoTipo || "",
      clasificacion: ev.clasificacion || "",
      expediente: ev.expediente,
      expedienteOriginal: ev.expediente || "",
      fecha: ev.fecha,
      hora: ev.hora || "09:00",
      descripcion: ev.descripcion,
      anotacion: ev.anotacion,
      detenido: ev.detenido,
      estado: ev.estado || "Pendiente",
      estadoOriginal: ev.estado || "Pendiente",
      responsable: ev.responsable || ev.usuario,
      participantes: [],
      otraOficina: ev.participantes || "",
    });
    setError("");
    return true;
  }

  async function guardarForm(confirmarInhabil = false, formulario = form) {
    setError("");
    const body = { ...formulario, confirmarInhabil, sistema, codigo };
    try {
      const res = form.id
        ? await api(`/agenda/${form.id}`, { method: "PUT", body })
        : await api("/agenda", { method: "POST", body });
      if (formulario.id && formulario.estado && formulario.estado !== formulario.estadoOriginal) {
        await api(`/agenda/${formulario.id}/estado`, { method: "POST", body: { estado: formulario.estado } });
      }
      const fecha = res.fecha || form.fecha;
      setForm(null);
      setSeleccionado(fecha);
      if (!fecha.startsWith(centro.slice(0, 7))) setCentro(`${fecha.slice(0, 7)}-01`);
      const params = new URLSearchParams({
        fecha,
        q,
        responsable,
        pendientes: pendientes ? "1" : "0",
        sistema,
        codigo,
        nombreDependencia,
      });
      const dia = await api(`/agenda?${params}`);
      setEventos(dia.eventos);
      await cargarCalendario();
      onCambio?.();
      if (
        formulario.id
        && formulario.estado
        && formulario.estado !== formulario.estadoOriginal
        && (formulario.estado === "Fracasada" || formulario.estado === "Suspendida")
        && window.confirm(`El evento quedó como ${formulario.estado}.\n\n¿Desea fijar nueva fecha y hora ahora?`)
      ) {
        abrirNuevo({
          tipo: formulario.tipo,
          codigoTipo: formulario.codigoTipo,
          fuero: formulario.fuero,
          clasificacion: formulario.clasificacion,
          clase: formulario.clase,
          alcance: formulario.alcance,
          expediente: formulario.expediente,
          descripcion: formulario.descripcion,
          detenido: formulario.detenido,
          anotacion: "",
          responsable: formulario.responsable,
        });
      }
    } catch (err) {
      if (err.data?.code === "INHABIL") {
        if (window.confirm(`${err.data.motivo}\n\n¿Cargar igualmente?`)) return guardarForm(true, formulario);
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
          codigoTipo: activo.codigoTipo,
          fuero: activo.fuero,
          clasificacion: activo.clasificacion,
          clase: activo.clasificacion === "Licencia" ? "licencia" : activo.clasificacion === "Evento" ? "evento" : activo.tipo === "Vencimiento de Plazo" || activo.clasificacion === "Plazo" ? "plazo" : "audiencia",
          alcance: activo.alcance || "agente",
          expediente: activo.expediente,
          descripcion: activo.descripcion,
          detenido: activo.detenido,
          anotacion: "",
          responsable: activo.responsable,
        });
      }
    } catch (err) {
      setError(err.message);
    }
  }

  async function borrar() {
    if (!activo) return setError("Seleccione un evento.");
    const propio = [activo.usuario, activo.responsable].some(
      (nombre) => String(nombre || "").trim().toLowerCase() === String(usuario || "").trim().toLowerCase()
    );
    if (rol !== "admin" && !propio) {
      return setError("Solo quien cargó el evento, su responsable o el administrador general pueden borrarlo.");
    }
    if (!window.confirm(`¿BORRAR DEFINITIVAMENTE este evento?\n\n${activo.tipo} — ${activo.expediente}\n${ddmm(activo.fecha)} ${activo.hora}\n\nPara preservar el historial conviene marcarlo Fracasada o Suspendida.`)) return;
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
        <button type="button" className="btn btn-primary" onClick={() => abrirNuevo()} disabled={!dependencia}>Nuevo Evento</button>
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
        <button type="button" onClick={() => setGestion("importar")}>Importar</button>
        <button type="button" onClick={() => setGestion("estadisticas")}>Estadísticas</button>
        <button type="button" onClick={() => setGestion("plazos")}>Plazos</button>
        <button type="button" onClick={() => { setSeleccionado(hoy()); setCentro(`${hoy().slice(0, 7)}-01`); }}>Hoy</button>
      </div>
      {error && <p className="banner-error">{error}</p>}
      {fuentes && !dependencia && (
        <p className="banner-error">
          El usuario no tiene dependencias habilitadas en los Sistemas de Gestión de Expedientes Digitales
        </p>
      )}
      {dependencia && (
        <p className="dep-actual">
          {dependencia.sistema} — {dependencia.nombre}
          {dependencia.circunscripcion ? ` — ${dependencia.circunscripcion}` : ""}
          {dependencia.titularidad ? ` — ${dependencia.titularidad}` : ""}
        </p>
      )}
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
            {integrantes.map((u) => <option key={u}>{u}</option>)}
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
                onClick={() => abrirEdicion(ev)}
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
          <FormEvento
            form={form}
            setForm={setForm}
            catalogo={catalogo}
            integrantes={integrantes}
            usuario={usuario}
            rol={rol}
            fuentes={fuentes}
            dependencia={dependencia}
            onSubmit={(datos) => guardarForm(false, datos)}
          />
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
            onCrear={(datos) => { setPlazos(false); setSeleccionado(datos.fecha); abrirNuevo({ ...datos, clase: "plazo", alcance: "dependencia" }); }}
          />
        </Modal>
      )}
      {listado && (
        <Modal title="Listado de agendamientos" onClose={() => setListado(false)} wide>
          <Listado usuarios={integrantes} tipos={tipos} catalogo={catalogo} dependencia={dependencia} onClose={() => setListado(false)} onError={setError} />
        </Modal>
      )}
      {gestion && (
        <Modal
          title={gestion === "importar" ? "Importar agenda" : gestion === "estadisticas" ? "Estadísticas" : "Tipos de plazo"}
          onClose={() => setGestion("")}
          wide
        >
          <Gestion
            modo={gestion}
            dependencia={dependencia}
            onClose={() => setGestion("")}
            onImportado={() => refrescar().catch((err) => setError(err.message))}
          />
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

function FormEvento({ form, setForm, catalogo, integrantes, usuario, rol, fuentes, dependencia, onSubmit }) {
  const [aviso, setAviso] = useState("");
  const [causa, setCausa] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [plazos, setPlazos] = useState([]);
  const pideExpediente = form.clase === "audiencia" || form.clase === "plazo";
  const tiposFuero = (catalogo?.audiencias || []).filter((item) => item.fuero === form.fuero);
  const otras = (fuentes?.dependencias || []).filter(
    (dep) => !(dep.sistema === dependencia?.sistema && dep.codigo === dependencia?.codigo)
  );

  useEffect(() => {
    if (!form.fecha) return;
    api(`/agenda/dia?fecha=${form.fecha}`)
      .then((d) => setAviso(`${d.ok ? "✓" : "⚠"} ${d.motivo}`))
      .catch(() => setAviso(""));
  }, [form.fecha]);

  useEffect(() => {
    if (form.clase !== "plazo") return;
    api("/agenda/plazos-tipos").then(setPlazos).catch(() => setPlazos([]));
  }, [form.clase]);

  function cambiarClase(clase) {
    setCausa(null);
    setForm({
      ...form,
      clase,
      tipo: clase === "licencia" ? "Licencia" : "",
      codigoTipo: "",
      clasificacion: "",
      expediente: clase === "licencia" ? "" : form.expediente,
      hora: clase === "audiencia" ? (form.hora || "09:00") : "",
      alcance: clase === "audiencia" && form.alcance === "general" ? form.alcance : form.alcance,
    });
  }

  function elegirTipo(codigo) {
    const item = tiposFuero.find((t) => t.codigo === codigo);
    setForm({
      ...form,
      codigoTipo: codigo,
      tipo: item?.tipo || "",
      clasificacion: item?.clasificacion || "",
      fuero: item?.fuero || form.fuero,
      descripcion: form.descripcion.trim() ? form.descripcion : (item?.descripcion || ""),
    });
  }

  function toggleOficina(dep) {
    const ya = form.participantes.some((p) => p.sistema === dep.sistema && p.codigo === dep.codigo);
    const participantes = ya
      ? form.participantes.filter((p) => !(p.sistema === dep.sistema && p.codigo === dep.codigo))
      : [...form.participantes, { sistema: dep.sistema, codigo: dep.codigo, nombre: dep.nombre }];
    setForm({ ...form, participantes });
  }

  async function buscarCausa() {
    const numero = form.expediente.trim();
    if (!numero || !dependencia) return null;
    setBuscando(true);
    setCausa(null);
    try {
      const params = new URLSearchParams({
        numero,
        sistema: dependencia.sistema,
        codigo: dependencia.codigo,
      });
      const data = await api(`/agenda/expediente?${params}`);
      setCausa(data);
      if (data.encontrado && data.corresponde && data.caratula) {
        setForm((prev) => (
          prev.descripcion.trim() ? prev : { ...prev, descripcion: data.caratula }
        ));
      }
      return data;
    } catch (err) {
      setCausa({ error: err.message });
      return null;
    } finally {
      setBuscando(false);
    }
  }

  async function enviar(event) {
    event.preventDefault();
    const responsable = form.alcance === "agente" ? usuario : (form.responsable || usuario);
    if (form.clase === "licencia") {
      onSubmit({ ...form, expediente: "", responsable });
      return;
    }
    const data = form.expediente.trim() ? await buscarCausa() : null;
    const mismoExpediente = Boolean(form.id)
      && String(form.expedienteOriginal || "").trim().toUpperCase() === form.expediente.trim().toUpperCase();
    if (form.clase === "audiencia" && !mismoExpediente && !data?.corresponde) return;
    const descripcion = form.descripcion.trim() || (data?.encontrado && data?.corresponde ? data.caratula : "");
    onSubmit({ ...form, descripcion, responsable });
  }

  return (
    <form className="stack" onSubmit={enviar}>
      <label>Qué se carga
        <select value={form.clase} onChange={(e) => cambiarClase(e.target.value)}>
          <option value="audiencia">Audiencia</option>
          <option value="licencia">Licencia</option>
          <option value="evento">Evento</option>
          <option value="plazo">Plazo legal</option>
        </select>
      </label>
      <label>Agenda
        <select
          value={form.alcance}
          onChange={(e) => setForm({ ...form, alcance: e.target.value, responsable: e.target.value === "agente" ? usuario : form.responsable })}
        >
          <option value="agente">Del agente (soy responsable)</option>
          <option value="dependencia">De la dependencia</option>
          {rol === "admin" && <option value="general">General del Poder Judicial</option>}
        </select>
      </label>
      {form.clase === "audiencia" && (
        <>
          <label>Fuero
            <select value={form.fuero} onChange={(e) => setForm({ ...form, fuero: e.target.value, tipo: "", codigoTipo: "" })} required>
              <option value="">Seleccionar…</option>
              {(catalogo?.fueros || []).map((fuero) => <option key={fuero}>{fuero}</option>)}
            </select>
          </label>
          <label>Tipo de audiencia
            <select value={form.codigoTipo} onChange={(e) => elegirTipo(e.target.value)} required>
              <option value="">Seleccionar…</option>
              {tiposFuero.map((item) => (
                <option key={item.codigo} value={item.codigo}>{item.codigo} — {item.tipo}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {form.clase === "plazo" && (
        <label>Tipo de plazo
          <select value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value, codigoTipo: "" })} required>
            <option value="">Seleccionar…</option>
            {plazos.map((plazo) => (
              <option key={plazo.id} value={plazo.nombre}>
                {plazo.nombre}{plazo.dias ? ` (${plazo.dias} ${plazo.habiles ? "hábiles" : "corridos"})` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      {(form.clase === "evento" || form.clase === "licencia") && (
        <label>{form.clase === "licencia" ? "Licencia" : "Tipo de evento"}
          <input
            value={form.tipo}
            onChange={(e) => setForm({ ...form, tipo: e.target.value })}
            placeholder={form.clase === "licencia" ? "Licencia" : "Feriado extraordinario, reunión, otro"}
            required
          />
        </label>
      )}
      {form.alcance !== "agente" && (
        <label>Responsable
          <select value={form.responsable || usuario} onChange={(e) => setForm({ ...form, responsable: e.target.value })}>
            {[...new Set([usuario, ...integrantes])].map((nombre) => <option key={nombre}>{nombre}</option>)}
          </select>
        </label>
      )}
      {pideExpediente && (
        <label>Expediente
          <input
            value={form.expediente}
            onChange={(e) => { setCausa(null); setForm({ ...form, expediente: e.target.value }); }}
            onBlur={buscarCausa}
            required
          />
        </label>
      )}
      {form.clase === "evento" && (
        <label>Expediente (opcional)
          <input
            value={form.expediente}
            onChange={(e) => { setCausa(null); setForm({ ...form, expediente: e.target.value }); }}
            onBlur={buscarCausa}
          />
        </label>
      )}
      {buscando && <p className="muted">Buscando la causa…</p>}
      {causa?.error && <p className="form-error">{causa.error}</p>}
      {form.clase === "audiencia" && causa && causa.corresponde === false && causa.mensaje && (
        <p className="form-error">{causa.mensaje}</p>
      )}
      {causa?.encontrado && (form.clase !== "audiencia" || causa.corresponde) && (
        <p className="ok-text">
          {causa.origen}: {causa.caratula}
          {causa.proceso ? ` — ${causa.proceso}` : ""}
          {causa.detalle ? ` — ${causa.detalle}` : ""}
          {causa.radicacion ? ` — Radica en ${causa.radicacion}` : ""}
        </p>
      )}
      {form.clase !== "audiencia" && causa && !causa.encontrado && !causa.error && (
        <p className="inhabil">No se encontró el expediente en {dependencia?.sistema}.</p>
      )}
      <div className="split">
        <label>Fecha<CampoFecha value={form.fecha} onChange={(fecha) => setForm({ ...form, fecha })} required /></label>
        <label>Hora
          <input value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} placeholder="09:00" required={form.clase === "audiencia"} />
        </label>
      </div>
      <label>{form.clase === "licencia" || form.clase === "evento" ? "Nombre / detalle" : "Descripción"}
        <textarea rows={3} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
      </label>
      <label>Anotación<input value={form.anotacion} onChange={(e) => setForm({ ...form, anotacion: e.target.value })} /></label>
      {form.id && (
        <label>Estado
          <select value={form.estado || "Pendiente"} onChange={(e) => setForm({ ...form, estado: e.target.value })}>
            <option>Pendiente</option>
            <option>Realizada</option>
            <option>Fracasada</option>
            <option>Suspendida</option>
          </select>
        </label>
      )}
      {form.clase === "audiencia" && (
        <>
          <fieldset>
            <legend>Oficinas que participan</legend>
            {otras.length === 0 && <p className="muted">No hay otras dependencias habilitadas para este usuario. Puede indicar el nombre.</p>}
            {otras.map((dep) => (
              <label className="check" key={`${dep.sistema}-${dep.codigo}`}>
                <input
                  type="checkbox"
                  checked={form.participantes.some((p) => p.sistema === dep.sistema && p.codigo === dep.codigo)}
                  onChange={() => toggleOficina(dep)}
                />
                {dep.sistema} — {dep.nombre}
              </label>
            ))}
            <label>Otra oficina
              <input
                value={form.otraOficina}
                onChange={(e) => setForm({ ...form, otraOficina: e.target.value })}
                placeholder="Defensoría 6, Fiscalía 1"
              />
            </label>
          </fieldset>
          <label className="check">
            <input type="checkbox" checked={form.detenido} onChange={(e) => setForm({ ...form, detenido: e.target.checked })} />
            Causa con detenido
          </label>
        </>
      )}
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

function Listado({ usuarios, tipos, catalogo, dependencia, onClose, onError }) {
  const [responsable, setResponsable] = useState("Todos");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [tarea, setTarea] = useState(true);
  const [audiencia, setAudiencia] = useState(true);
  const [vencimiento, setVencimiento] = useState(true);
  const [estado, setEstado] = useState("Todo");
  const [proceso, setProceso] = useState("Todos");
  const [filas, setFilas] = useState(null);
  const tiposCatalogo = [...new Set([...(catalogo?.audiencias || []).map((item) => item.tipo), ...tipos])];

  function params() {
    const query = new URLSearchParams({
      responsable,
      estado,
      proceso,
      tarea: tarea ? "1" : "0",
      audiencia: audiencia ? "1" : "0",
      vencimiento: vencimiento ? "1" : "0",
    });
    if (desde) query.set("desde", desde);
    if (hasta) query.set("hasta", hasta);
    if (dependencia) {
      query.set("sistema", dependencia.sistema);
      query.set("codigo", dependencia.codigo);
      query.set("nombreDependencia", dependencia.nombre || "");
    }
    return query;
  }

  async function exportar(e) {
    e.preventDefault();
    try {
      await descargar(`/agenda/export?${params()}`, "agendamientos.csv");
      onClose();
    } catch (err) {
      onError(err.message);
    }
  }

  async function imprimir() {
    try {
      const data = await api(`/agenda/listado?${params()}`);
      setFilas(data.filas || []);
      setTimeout(() => window.print(), 300);
    } catch (err) {
      onError(err.message);
    }
  }

  return (
    <>
      <form className="stack" onSubmit={exportar}>
        <label>Responsable
          <select value={responsable} onChange={(e) => setResponsable(e.target.value)}>
            <option>Todos</option>
            {usuarios.map((u) => <option key={u}>{u}</option>)}
          </select>
        </label>
        <div className="split">
          <label>Desde<CampoFecha value={desde} onChange={setDesde} /></label>
          <label>Hasta<CampoFecha value={hasta} onChange={setHasta} /></label>
        </div>
        <fieldset>
          <legend>Tipo</legend>
          <label className="check"><input type="checkbox" checked={tarea} onChange={(e) => setTarea(e.target.checked)} /> Eventos y licencias</label>
          <label className="check"><input type="checkbox" checked={audiencia} onChange={(e) => setAudiencia(e.target.checked)} /> Audiencias</label>
          <label className="check"><input type="checkbox" checked={vencimiento} onChange={(e) => setVencimiento(e.target.checked)} /> Plazos</label>
        </fieldset>
        <label>Estado
          <select value={estado} onChange={(e) => setEstado(e.target.value)}>
            {["Todo", "Pendiente", "Realizada", "Fracasada", "Suspendida"].map((e) => <option key={e}>{e}</option>)}
          </select>
        </label>
        <label>Tipo puntual
          <select value={proceso} onChange={(e) => setProceso(e.target.value)}>
            <option>Todos</option>
            {tiposCatalogo.map((t) => <option key={t}>{t}</option>)}
          </select>
        </label>
        <div className="form-actions">
          <button className="btn btn-primary" type="submit">Exportar CSV</button>
          <button className="btn btn-secondary" type="button" onClick={imprimir}>Imprimir / PDF</button>
        </div>
      </form>
      {filas && (
        <div className="print-sheet">
          <h2>Listado de agenda{dependencia ? ` — ${dependencia.nombre}` : ""}</h2>
          <table>
            <thead>
              <tr>
                <th>Fecha</th><th>Hora</th><th>Responsable</th><th>Tipo</th><th>Expediente</th><th>Descripción</th><th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((fila, i) => (
                <tr key={`${fila.fecha}-${i}`}>
                  <td>{String(fila.fecha || "").split("-").reverse().join("/")}</td>
                  <td>{fila.hora}</td>
                  <td>{fila.responsable || fila.usuario_carga}</td>
                  <td>{fila.tipo}</td>
                  <td>{fila.expediente}</td>
                  <td>{fila.descripcion}</td>
                  <td>{fila.estado}</td>
                </tr>
              ))}
              {filas.length === 0 && <tr><td colSpan={7}>Sin resultados.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
