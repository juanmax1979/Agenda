import { useEffect, useState } from "react";
import { api, guardarSesion } from "./api.js";

export default function Login({ onLogin }) {
  const [usuarios, setUsuarios] = useState([]);
  const [nombre, setNombre] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [caps, setCaps] = useState(false);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api("/auth/usuarios")
      .then((lista) => {
        setUsuarios(lista);
        if (lista[0]) setNombre(lista[0]);
      })
      .catch(() => setError("No se pudo conectar con el servidor."));
  }, []);

  async function ingresar(event, forzar = false) {
    event?.preventDefault();
    setError("");
    setCargando(true);
    try {
      const sesion = await api("/auth/login", { method: "POST", body: { nombre, password, forzar } });
      guardarSesion(sesion);
      onLogin(sesion);
    } catch (err) {
      if (err.data?.code === "SESION_ACTIVA") {
        const ok = window.confirm(`${err.message}\n\n¿Forzar el ingreso?`);
        if (ok) return ingresar(null, true);
      } else {
        setError(err.message);
      }
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={(e) => ingresar(e, false)}>
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
        <label>
          Usuario
          <select value={nombre} onChange={(e) => setNombre(e.target.value)} required>
            {usuarios.map((u) => (
              <option key={u} value={u}>{u}</option>
            ))}
          </select>
        </label>
        <label>
          Contraseña
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
            onKeyDown={(e) => setCaps(e.getModifierState("CapsLock"))}
            required
          />
        </label>
        {caps && <p className="caps">Mayúsculas activadas</p>}
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary" type="submit" disabled={cargando || !nombre}>
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
