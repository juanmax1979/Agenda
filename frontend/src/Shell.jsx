import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import Modal from "./Modal.jsx";
import Agenda from "./Agenda.jsx";
import Admin from "./Admin.jsx";

const TABS = [
  { id: "agenda", label: "Agenda" },
  { id: "admin", label: "Administración", admin: true },
];

export default function Shell({ sesion, dependencia, onDependencia }) {
  const [tab, setTab] = useState("agenda");
  const [catalogos, setCatalogos] = useState(null);
  const [error, setError] = useState("");
  const [datosAvisos, setDatosAvisos] = useState({ hoy: [], atrasados: [], proximos: [] });
  const [avisosAbiertos, setAvisosAbiertos] = useState(false);
  const [abrir, setAbrir] = useState(null);
  const fuentes = sesion;
  const pendientes = (datosAvisos.hoy?.length || 0)
    + (datosAvisos.atrasados?.length || 0)
    + (datosAvisos.proximos?.length || 0);

  const cargarAvisos = useCallback(async () => {
    if (!dependencia) return { hoy: [], atrasados: [] };
    const params = new URLSearchParams({
      sistema: dependencia.sistema,
      codigo: dependencia.codigo,
      nombreDependencia: dependencia.nombre || "",
    });
    const data = await api(`/agenda/avisos?${params}`);
    setDatosAvisos(data);
    return data;
  }, [dependencia]);

  useEffect(() => {
    let vigente = true;
    cargarAvisos()
      .then((data) => {
        const hay = (data.hoy?.length || 0) + (data.atrasados?.length || 0) + (data.proximos?.length || 0);
        if (vigente && hay) setAvisosAbiertos(true);
      })
      .catch(() => {});
    return () => {
      vigente = false;
    };
  }, [cargarAvisos]);

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
          <button
            type="button"
            className="aviso-btn"
            title="Avisos"
            aria-label={pendientes ? `Avisos, ${pendientes} pendientes` : "Avisos"}
            onClick={() => {
              cargarAvisos()
                .then(() => setAvisosAbiertos(true))
                .catch((e) => setError(e.message));
            }}
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              <path
                fill="currentColor"
                d="M12 22a2.4 2.4 0 0 0 2.35-2h-4.7A2.4 2.4 0 0 0 12 22zm7.2-6.2V11a7.2 7.2 0 0 0-5.4-6.97V3.2a1.8 1.8 0 1 0-3.6 0v.83A7.2 7.2 0 0 0 4.8 11v4.8L3 17.6v1.2h18v-1.2l-1.8-1.8z"
              />
            </svg>
            {pendientes > 0 && (
              <span className="aviso-burbuja">{pendientes > 99 ? "99+" : pendientes}</span>
            )}
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
            onCambio={cargarAvisos}
            abrir={abrir}
            onAbierto={() => setAbrir(null)}
          />
        )}
        {catalogos && tab === "admin" && sesion.rol === "admin" && <Admin />}
      </main>

      {avisosAbiertos && (
        <Modal title="Agenda — Avisos" onClose={() => setAvisosAbiertos(false)}>
          <Avisos
            datos={datosAvisos}
            usuario={sesion.usuario}
            onElegir={(item) => {
              setTab("agenda");
              setAvisosAbiertos(false);
              setAbrir({ id: item.id, fecha: item.fecha, marca: Date.now() });
            }}
          />
        </Modal>
      )}
    </div>
  );
}

function Avisos({ datos, usuario, onElegir }) {
  function fila(grupo, item, texto) {
    return (
      <li key={`${grupo}-${item.id}`}>
        <button type="button" className="aviso-item" onClick={() => onElegir(item)}>
          {texto}
          {item.detenido ? " · PRESO" : ""}
        </button>
      </li>
    );
  }

  return (
    <div className="stack">
      <p className="muted">Pendientes a cargo de {String(usuario || "").trim()}. Elija una para verla en el calendario.</p>
      {datos.atrasados?.length > 0 && (
        <section>
          <h4>Atrasados sin resolver ({datos.atrasados.length})</h4>
          <ul className="aviso-list">
            {datos.atrasados.slice(0, 10).map((f) => fila(
              "a",
              f,
              `${f.fecha.split("-").reverse().join("/")} — ${f.tipo} — ${f.expediente}`
            ))}
          </ul>
          {datos.atrasados.length > 10 && <p className="muted">y {datos.atrasados.length - 10} más.</p>}
        </section>
      )}
      {datos.hoy?.length > 0 && (
        <section>
          <h4>Para hoy ({datos.hoy.length})</h4>
          <ul className="aviso-list">
            {datos.hoy.map((f) => fila(
              "h",
              f,
              `${f.hora || "--:--"} — ${f.tipo} — ${f.expediente}`
            ))}
          </ul>
        </section>
      )}
      {datos.proximos?.length > 0 && (
        <section>
          <h4>Próximas pendientes ({datos.proximos.length})</h4>
          <ul className="aviso-list">
            {datos.proximos.slice(0, 15).map((f) => fila(
              "p",
              f,
              `${f.fecha.split("-").reverse().join("/")} ${f.hora || ""} — ${f.tipo} — ${f.expediente}`
            ))}
          </ul>
          {datos.proximos.length > 15 && <p className="muted">y {datos.proximos.length - 15} más.</p>}
        </section>
      )}
      {!datos.hoy?.length && !datos.atrasados?.length && !datos.proximos?.length && (
        <p>No hay audiencias ni eventos pendientes a cargo de {String(usuario || "").trim()}.</p>
      )}
    </div>
  );
}
