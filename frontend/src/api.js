function clienteId() {
  let id = localStorage.getItem("biblioratos_cliente");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("biblioratos_cliente", id);
  }
  return id;
}

function headers(json = true) {
  const h = {
    Authorization: `Bearer ${localStorage.getItem("biblioratos_token") || ""}`,
    "X-Cliente": clienteId(),
  };
  if (json) h["Content-Type"] = "application/json";
  return h;
}

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: headers(body !== undefined),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text };
    }
  }
  if (res.status === 401 && path !== "/auth/entrada" && path !== "/auth/login") {
    window.dispatchEvent(new Event("sesion-vencida"));
  }
  if (!res.ok) {
    const error = new Error(data?.error || "Error de servidor");
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

export async function descargar(path, fallbackName) {
  const res = await fetch(`/api${path}`, { headers: headers(false) });
  const text = await res.text();
  if (!res.ok) {
    let msg = "No se pudo exportar.";
    try {
      msg = JSON.parse(text).error || msg;
    } catch {
      /* el cuerpo no era JSON */
    }
    throw new Error(msg);
  }
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  const match = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") || "");
  a.href = URL.createObjectURL(blob);
  a.download = match?.[1] || fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export function guardarSesion({ token, usuario, rol }) {
  localStorage.setItem("biblioratos_token", token);
  localStorage.setItem("biblioratos_usuario", usuario);
  localStorage.setItem("biblioratos_rol", rol);
}

export function limpiarSesion() {
  localStorage.removeItem("biblioratos_token");
  localStorage.removeItem("biblioratos_usuario");
  localStorage.removeItem("biblioratos_rol");
}

export function sesionGuardada() {
  const token = localStorage.getItem("biblioratos_token");
  const usuario = localStorage.getItem("biblioratos_usuario");
  const rol = localStorage.getItem("biblioratos_rol");
  return token && usuario ? { token, usuario, rol } : null;
}
