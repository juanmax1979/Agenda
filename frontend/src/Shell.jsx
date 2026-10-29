import { useEffect, useState } from "react";
import { api } from "./api.js";
import Modal from "./Modal.jsx";
import Agenda from "./Agenda.jsx";
import Admin from "./Admin.jsx";

const TABS = [
  { id: "agenda", label: "Agenda" },
  { id: "admin", label: "Administración", admin: true },
];

export default function Shell({ sesion, dependencia, onDependencia, onCambiarDependencia }) {
  const [tab, setTab] = useState("agenda");
  const [catalogos, setCatalogos] = useState(null);
  const [error, setError] = useState("");
  const [avisos, setAvisos] = useState(null);
  const fuentes = sesion;

  useEffect(() => {
    if (!dependencia) return;
    const params = new URLSearchParams({
      sistema: dependencia.sistema,
      codigo: dependencia.codigo,
    });
    api(`/agenda/avisos?${params}`)
      .then((data) => {
        if (data.hoy.length || data.atrasados.length) setAvisos(data);
      })
      .catch(() => {});
  }, [dependencia]);

  useEffect(() => {
    api("/agenda/catalogos")
      .then(setCatalogos)
      .catch((err) => setError(err.message));
  }, []);

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
            <span>{fuentes?.identidad?.login || ""}</span>
          </div>
          {fuentes?.dependencias?.length > 0 && (
            <label className="dep-box">
              <span>Dependencia</span>
              <select
                value={dependencia ? `${dependencia.sistema}:${dependencia.codigo}` : ""}
                onChange={(e) => {
                  const siguiente = fuentes.dependencias.find(
                    (dep) => `${dep.sistema}:${dep.codigo}` === e.target.value
                  );
                  if (siguiente) onDependencia(siguiente);
                }}
              >
                {fuentes.dependencias.map((dep) => (
                  <option key={`${dep.sistema}:${dep.codigo}`} value={`${dep.sistema}:${dep.codigo}`}>
                    {dep.sistema} — {dep.nombre}{dep.titularidad ? ` (${dep.titularidad})` : ""}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button type="button" className="btn btn-ghost" onClick={onCambiarDependencia}>
            Cambiar dependencia
          </button>
          <button type="button" className="btn btn-ghost" onClick={() => {
            if (!dependencia) return;
            const params = new URLSearchParams({
              sistema: dependencia.sistema,
              codigo: dependencia.codigo,
            });
            api(`/agenda/avisos?${params}`).then(setAvisos).catch((e) => setError(e.message));
          }}>
            Avisos
          </button>
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
          <Agenda
            catalogos={catalogos}
            rol={sesion.rol}
            usuario={sesion.usuario}
            dependencia={dependencia}
            fuentes={fuentes}
          />
        )}
        {catalogos && tab === "admin" && sesion.rol === "admin" && <Admin />}
      </main>

      {avisos && (
        <Modal title="Agenda — Avisos" onClose={() => setAvisos(null)}>
          <Avisos datos={avisos} />
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
