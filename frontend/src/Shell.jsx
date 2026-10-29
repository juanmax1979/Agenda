import { useEffect, useState } from "react";
import { api } from "./api.js";
import Modal from "./Modal.jsx";
import Agenda from "./Agenda.jsx";
import Admin from "./Admin.jsx";

const TABS = [
  { id: "agenda", label: "Agenda" },
  { id: "admin", label: "Administración", admin: true },
];

export default function Shell({ sesion, onLogout }) {
  const [tab, setTab] = useState("agenda");
  const [catalogos, setCatalogos] = useState(null);
  const [error, setError] = useState("");
  const [avisos, setAvisos] = useState(null);
  const [clave, setClave] = useState(false);
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [msgClave, setMsgClave] = useState("");

  useEffect(() => {
    api("/agenda/catalogos")
      .then(setCatalogos)
      .catch((err) => setError(err.message));
    api("/agenda/avisos")
      .then((data) => {
        if (data.hoy.length || data.atrasados.length) setAvisos(data);
      })
      .catch(() => {});
  }, []);

  async function salir() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* la sesión local se cierra igual */
    }
    onLogout();
  }

  async function guardarClave(e) {
    e.preventDefault();
    setMsgClave("");
    try {
      await api("/auth/password", { method: "POST", body: { actual, nueva } });
      setClave(false);
      setActual("");
      setNueva("");
    } catch (err) {
      setMsgClave(err.message);
    }
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand">
          <svg viewBox="0 0 64 64" width="36" height="36" aria-hidden="true">
            <circle cx="32" cy="32" r="30" fill="#0f2c44" />
            <path d="M32 12v28M16 22h32" stroke="#c4a35a" strokeWidth="2.2" fill="none" />
            <path d="M20 22l-6 16h12l-6-16zm24 0l-6 16h12l-6-16z" stroke="#f4f7fa" strokeWidth="1.6" fill="none" />
          </svg>
          <div>
            <strong>Poder Judicial del Chaco</strong>
            <span>Agenda judicial</span>
          </div>
        </div>
        <div className="topbar-user">
          <div>
            <strong>{sesion.usuario}</strong>
            <span>{(sesion.rol || "").toUpperCase()}</span>
          </div>
          <button type="button" className="btn btn-ghost" onClick={() => setClave(true)}>Contraseña</button>
          <button type="button" className="btn btn-ghost" onClick={() => api("/agenda/avisos").then(setAvisos).catch((e) => setError(e.message))}>
            Avisos
          </button>
          <button type="button" className="btn btn-ghost" onClick={salir}>Salir</button>
        </div>
      </header>
      <nav className="tabs">
        {TABS.filter((t) => !t.admin || sesion.rol === "admin").map((t) => (
          <button
            key={t.id}
            type="button"
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>
      <main className="content">
        {error && <p className="banner-error">{error}</p>}
        {!catalogos && !error && <p className="muted">Cargando la agenda…</p>}
        {catalogos && tab === "agenda" && (
          <Agenda catalogos={catalogos} rol={sesion.rol} usuario={sesion.usuario} />
        )}
        {catalogos && tab === "admin" && sesion.rol === "admin" && <Admin />}
      </main>

      {avisos && (
        <Modal title="Agenda — Avisos" onClose={() => setAvisos(null)}>
          <Avisos datos={avisos} />
        </Modal>
      )}
      {clave && (
        <Modal title="Cambiar contraseña" onClose={() => setClave(false)}>
          <form className="stack" onSubmit={guardarClave}>
            <label>Contraseña actual<input type="password" value={actual} onChange={(e) => setActual(e.target.value)} required /></label>
            <label>Nueva contraseña<input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} minLength={4} required /></label>
            {msgClave && <p className="form-error">{msgClave}</p>}
            <button className="btn btn-primary" type="submit">Guardar</button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Avisos({ datos }) {
  return (
    <div className="stack">
      {datos.atrasados?.length > 0 && (
        <section>
          <h4>Atrasados sin resolver ({datos.atrasados.length})</h4>
          <ul className="aviso-list">
            {datos.atrasados.slice(0, 10).map((f, i) => (
              <li key={`a-${i}`}>
                {f.fecha.split("-").reverse().join("/")} — {f.tipo} — {f.expediente}
                {f.detenido ? " · PRESO" : ""}
              </li>
            ))}
          </ul>
          {datos.atrasados.length > 10 && <p className="muted">y {datos.atrasados.length - 10} más.</p>}
        </section>
      )}
      {datos.hoy?.length > 0 && (
        <section>
          <h4>Para hoy ({datos.hoy.length})</h4>
          <ul className="aviso-list">
            {datos.hoy.map((f, i) => (
              <li key={`h-${i}`}>
                {f.hora || "--:--"} — {f.tipo} — {f.expediente}
                {f.detenido ? " · PRESO" : ""}
              </li>
            ))}
          </ul>
        </section>
      )}
      {!datos.hoy?.length && !datos.atrasados?.length && <p>No hay eventos pendientes para hoy ni atrasados.</p>}
    </div>
  );
}
