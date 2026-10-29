import { useEffect, useState } from "react";
import { api, guardarSesion } from "./api.js";

function claveDep(dep) {
  return `${dep.sistema}:${dep.codigo}`;
}

export default function Entrada({ onEntrar }) {
  const [acceso, setAcceso] = useState(null);
  const [elegida, setElegida] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    let vigente = true;
    api("/auth/entrada", { method: "POST" })
      .then((data) => {
        if (!vigente) return;
        guardarSesion(data);
        setAcceso(data);
        if (data.dependencias?.length === 1) setElegida(claveDep(data.dependencias[0]));
      })
      .catch((err) => {
        if (vigente) setError(err.message);
      })
      .finally(() => {
        if (vigente) setCargando(false);
      });
    return () => {
      vigente = false;
    };
  }, []);

  function entrar(event) {
    event.preventDefault();
    const dependencia = acceso.dependencias.find((dep) => claveDep(dep) === elegida);
    if (!dependencia) return;
    onEntrar(acceso, dependencia);
  }

  const identidad = acceso?.identidad;

  return (
    <div className="login-screen">
      <form className="login-card entrada" onSubmit={entrar}>
        <div className="brand-mark" aria-hidden="true">
          <svg viewBox="0 0 64 64" width="54" height="54">
            <circle cx="32" cy="32" r="30" fill="#1d4363" />
            <path d="M32 12v28M16 22h32" stroke="#c4a35a" strokeWidth="2.2" fill="none" />
            <path d="M20 22l-6 16h12l-6-16zm24 0l-6 16h12l-6-16z" stroke="#f4f7fa" strokeWidth="1.6" fill="none" />
            <path d="M24 50h16" stroke="#c4a35a" strokeWidth="2" />
          </svg>
        </div>
        <p className="eyebrow">Poder Judicial del Chaco</p>
        <h1>Agenda judicial</h1>
        <p className="subtitle">Audiencias, citas y vencimientos</p>
        {cargando && <p className="muted">Detectando el usuario de Windows…</p>}
        {error && <p className="form-error">{error}</p>}
        {identidad && (
          <p className="identidad">
            <strong>{identidad.nombre || identidad.usuario}</strong>
            <span>{identidad.login}</span>
          </p>
        )}
        {acceso && acceso.dependencias.length === 0 && (
          <p className="form-error">
            El usuario no tiene dependencias habilitadas en los Sistemas de Gestión de Expedientes Digitales
          </p>
        )}
        {acceso?.dependencias?.length > 0 && (
          <>
            <p className="subtitle">Elija la dependencia para abrir la agenda</p>
            <div className="dep-opciones">
              {acceso.dependencias.map((dep) => {
                const id = claveDep(dep);
                return (
                  <label key={id} className={elegida === id ? "dep-opcion sel" : "dep-opcion"}>
                    <input
                      type="radio"
                      name="dependencia"
                      value={id}
                      checked={elegida === id}
                      onChange={() => setElegida(id)}
                    />
                    <span>
                      <strong>{dep.nombre}</strong>
                      <span>
                        {dep.sistema}
                        {dep.circunscripcion ? ` — ${dep.circunscripcion}` : ""}
                        {dep.titularidad ? ` — ${dep.titularidad}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <button className="btn btn-primary" type="submit" disabled={!elegida}>
              Entrar a la agenda
            </button>
          </>
        )}
      </form>
    </div>
  );
}
