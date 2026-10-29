import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Login from "./Login.jsx";
import Shell from "./Shell.jsx";
import { limpiarSesion, sesionGuardada } from "./api.js";
import "./styles.css";

function App() {
  const [sesion, setSesion] = useState(sesionGuardada);

  useEffect(() => {
    function vencer() {
      limpiarSesion();
      setSesion(null);
    }
    window.addEventListener("sesion-vencida", vencer);
    return () => window.removeEventListener("sesion-vencida", vencer);
  }, []);

  if (!sesion) return <Login onLogin={setSesion} />;
  return (
    <Shell
      sesion={sesion}
      onLogout={() => {
        limpiarSesion();
        setSesion(null);
      }}
    />
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
