import { useEffect, useState } from "react";
import { api } from "./api.js";
import { CampoFecha, fechaVisible } from "./Fecha.jsx";

export default function Admin() {
  const [vista, setVista] = useState("usuarios");
  return (
    <section className="panel">
      <header className="panel-head"><h2>Administración</h2></header>
      <div className="subtabs">
        <button type="button" className={vista === "usuarios" ? "on" : ""} onClick={() => setVista("usuarios")}>Usuarios</button>
        <button type="button" className={vista === "feriados" ? "on" : ""} onClick={() => setVista("feriados")}>Feriados</button>
        <button type="button" className={vista === "plantilla" ? "on" : ""} onClick={() => setVista("plantilla")}>Decreto</button>
        <button type="button" className={vista === "auditoria" ? "on" : ""} onClick={() => setVista("auditoria")}>Auditoría</button>
      </div>
      {vista === "usuarios" && <Usuarios />}
      {vista === "feriados" && <Feriados />}
      {vista === "plantilla" && <Plantilla />}
      {vista === "auditoria" && <Auditoria />}
    </section>
  );
}

function Auditoria() {
  const [filas, setFilas] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    api("/admin/auditoria").then(setFilas).catch((err) => setError(err.message));
  }, []);

  return (
    <div className="stack">
      {error && <p className="banner-error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead>
            <tr><th>Fecha</th><th>Acción</th><th>Registro</th><th>Detalle</th><th>Usuario</th><th>Equipo</th></tr>
          </thead>
          <tbody>
            {filas.map((f, i) => (
              <tr key={i}>
                <td>{fechaVisible(f.fecha)}</td><td>{f.accion}</td><td>{f.registro_id}</td>
                <td>{f.detalle}</td><td>{f.usuario}</td><td>{f.pc}</td>
              </tr>
            ))}
            {filas.length === 0 && <tr><td colSpan={6} className="muted">Sin movimientos de agenda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Usuarios() {
  const [lista, setLista] = useState([]);
  const [sel, setSel] = useState("");
  const [clave, setClave] = useState("");
  const [nuevo, setNuevo] = useState({ nombre: "", password: "", rol: "user" });
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function cargar() {
    setLista(await api("/admin/usuarios"));
  }
  useEffect(() => { cargar().catch((e) => setError(e.message)); }, []);

  async function forzar(e) {
    e.preventDefault();
    setError("");
    setMsg("");
    if (!window.confirm(`¿Cambiar la clave de ${sel}?`)) return;
    try {
      await api("/admin/usuarios/clave", { method: "PUT", body: { nombre: sel, password: clave } });
      setClave("");
      setMsg(`Clave de ${sel} actualizada.`);
    } catch (err) {
      setError(err.message);
    }
  }

  async function crear(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/admin/usuarios", { method: "POST", body: nuevo });
      setNuevo({ nombre: "", password: "", rol: "user" });
      setMsg("Usuario creado.");
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      {error && <p className="banner-error">{error}</p>}
      {msg && <p className="banner-ok">{msg}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nombre</th><th>Rol</th></tr></thead>
          <tbody>
            {lista.map((u) => (
              <tr key={u.nombre} className={sel === u.nombre ? "selected" : ""} onClick={() => setSel(u.nombre)}>
                <td>{u.nombre}</td><td>{u.rol}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="filters" onSubmit={forzar}>
        <label>Usuario seleccionado<input value={sel} readOnly placeholder="Elija uno de la tabla" /></label>
        <label>Nueva clave<input type="password" value={clave} onChange={(e) => setClave(e.target.value)} minLength={4} required /></label>
        <button className="btn btn-primary" type="submit" disabled={!sel}>Forzar cambio</button>
      </form>
      <h3>Nuevo usuario</h3>
      <form className="filters" onSubmit={crear}>
        <label>Nombre<input value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} required /></label>
        <label>Clave<input type="password" value={nuevo.password} onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })} minLength={4} required /></label>
        <label>Rol
          <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
            <option value="user">user</option>
            <option value="admin">admin</option>
            <option value="robot">robot</option>
          </select>
        </label>
        <button className="btn btn-secondary" type="submit">Crear</button>
      </form>
    </div>
  );
}

function Feriados() {
  const [tipoFiltro, setTipoFiltro] = useState("TODOS");
  const [lista, setLista] = useState([]);
  const [tipo, setTipo] = useState("EXCEPCIONAL");
  const [fecha, setFecha] = useState("");
  const [dia, setDia] = useState("");
  const [mes, setMes] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [error, setError] = useState("");

  async function cargar(filtro = tipoFiltro) {
    setLista(await api(`/admin/feriados?tipo=${filtro}`));
  }
  useEffect(() => { cargar("TODOS").catch((e) => setError(e.message)); }, []);

  async function agregar(e) {
    e.preventDefault();
    setError("");
    try {
      await api("/admin/feriados", {
        method: "POST",
        body: tipo === "PERMANENTE"
          ? { tipo, dia: Number(dia), mes: Number(mes), descripcion }
          : { tipo, fecha, descripcion },
      });
      setDescripcion("");
      setFecha("");
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  async function borrar(f) {
    if (!window.confirm(`¿Eliminar feriado?\n\n${f.descripcion}`)) return;
    try {
      await api(`/admin/feriados/${f.id}`, { method: "DELETE" });
      await cargar();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      {error && <p className="banner-error">{error}</p>}
      <div className="subtabs">
        {["TODOS", "PERMANENTE", "EXCEPCIONAL"].map((t) => (
          <button key={t} type="button" className={tipoFiltro === t ? "on" : ""} onClick={() => { setTipoFiltro(t); cargar(t); }}>
            {t === "TODOS" ? "Todos" : t === "PERMANENTE" ? "Permanentes" : "Excepcionales"}
          </button>
        ))}
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Fecha</th><th>Descripción</th><th>Tipo</th><th></th></tr></thead>
          <tbody>
            {lista.map((f) => (
              <tr key={f.id}>
                <td>{f.visible}</td><td>{f.descripcion}</td><td>{f.tipo}</td>
                <td><button type="button" className="danger" onClick={() => borrar(f)}>Borrar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="filters" onSubmit={agregar}>
        <label>Tipo
          <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
            <option>EXCEPCIONAL</option>
            <option>PERMANENTE</option>
          </select>
        </label>
        {tipo === "EXCEPCIONAL" ? (
          <label>Fecha<CampoFecha value={fecha} onChange={setFecha} required /></label>
        ) : (
          <>
            <label>Día<input type="number" min="1" max="31" value={dia} onChange={(e) => setDia(e.target.value)} required /></label>
            <label>Mes<input type="number" min="1" max="12" value={mes} onChange={(e) => setMes(e.target.value)} required /></label>
          </>
        )}
        <label>Descripción<input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} required /></label>
        <button className="btn btn-primary" type="submit">Agregar</button>
      </form>
    </div>
  );
}

function Plantilla() {
  const [tipos, setTipos] = useState(["general"]);
  const [tipo, setTipo] = useState("general");
  const [texto, setTexto] = useState("");
  const [base, setBase] = useState("");
  const [msg, setMsg] = useState("");
  const [error, setError] = useState("");

  async function cargar(sel = tipo) {
    const data = await api(`/admin/plantilla?tipo=${encodeURIComponent(sel)}`);
    setTipos(data.tipos);
    setTexto(data.texto);
    setBase(data.predeterminada);
  }
  useEffect(() => { cargar("general").catch((e) => setError(e.message)); }, []);

  async function guardar(restaurar = false) {
    setError("");
    setMsg("");
    try {
      const data = await api("/admin/plantilla", {
        method: "PUT",
        body: { tipo, texto, restaurar },
      });
      setTexto(data.texto);
      setMsg(restaurar ? "Plantilla restaurada." : "Plantilla guardada.");
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="stack">
      {error && <p className="banner-error">{error}</p>}
      {msg && <p className="banner-ok">{msg}</p>}
      <label>Plantilla
        <select value={tipo} onChange={(e) => { setTipo(e.target.value); cargar(e.target.value); }}>
          {tipos.map((t) => (
            <option key={t} value={t}>{t === "general" ? "Plantilla general (por defecto)" : t}</option>
          ))}
        </select>
      </label>
      <pre className="hint">{`Variables: {expte}  {tipo}  {fecha_larga}  {hora}  {descripcion}`}</pre>
      <textarea rows={10} value={texto} onChange={(e) => setTexto(e.target.value)} />
      <div className="form-actions">
        <button type="button" className="btn btn-primary" onClick={() => guardar(false)}>Guardar</button>
        <button type="button" className="btn btn-secondary" onClick={() => { setTexto(base); }}>Ver texto original</button>
        <button type="button" className="btn btn-secondary" onClick={() => guardar(true)}>Restaurar</button>
      </div>
    </div>
  );
}
