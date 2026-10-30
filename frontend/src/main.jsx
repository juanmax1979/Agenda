import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Entrada from "./Login.jsx";
import Shell from "./Shell.jsx";
import { limpiarSesion } from "./api.js";
import "./styles.css";

function App() {
  const [acceso, setAcceso] = useState(null);
  const [dependencia, setDependencia] = useState(null);

  useEffect(() => {
    function vencer() {
      limpiarSesion();
      setDependencia(null);
      setAcceso(null);
    }
    window.addEventListener("sesion-vencida", vencer);
    return () => window.removeEventListener("sesion-vencida", vencer);
  }, []);

  if (!acceso || !dependencia) {
    return (
      <Entrada
        onEntrar={(datos, dep) => {
          setAcceso(datos);
          setDependencia(dep);
        }}
      />
    );
  }

  return (
    <Shell
      sesion={acceso}
      dependencia={dependencia}
      onDependencia={setDependencia}
    />
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
