const { execFile } = require("child_process");
const sql = require("mssql");

const pools = {};
let cache = null;
let cacheHasta = 0;
const CACHE_MS = 30_000;

function configuracion(prefijo) {
  const server = process.env[`${prefijo}_SQLSERVER_HOST`];
  const password = process.env[`${prefijo}_SQLSERVER_PASSWORD`];
  if (!server || !password) {
    throw new Error(`Falta la configuración de conexión a ${prefijo}.`);
  }
  return {
    server,
    port: Number(process.env[`${prefijo}_SQLSERVER_PORT`] || 1433),
    database: process.env[`${prefijo}_SQLSERVER_DATABASE`],
    user: process.env[`${prefijo}_SQLSERVER_USER`],
    password,
    pool: { max: 4, min: 0, idleTimeoutMillis: 30_000 },
    options: {
      encrypt: process.env[`${prefijo}_SQLSERVER_ENCRYPT`] === "true",
      trustServerCertificate: process.env[`${prefijo}_SQLSERVER_TRUST_CERT`] !== "false",
      connectTimeout: 15_000,
      requestTimeout: 20_000,
      enableArithAbort: true,
    },
  };
}

async function poolDe(prefijo) {
  if (!pools[prefijo]) {
    const pool = new sql.ConnectionPool(configuracion(prefijo));
    pools[prefijo] = pool.connect().catch((error) => {
      delete pools[prefijo];
      throw error;
    });
  }
  return pools[prefijo];
}

function identidadWindows() {
  const usuario = String(process.env.USERNAME || "").trim();
  const dominio = String(process.env.USERDOMAIN || "").trim();
  if (!/^[A-Za-z0-9._-]+$/.test(usuario)) {
    return Promise.reject(new Error("No se pudo leer el usuario de Windows."));
  }
  const script = `
$ErrorActionPreference = 'Stop'
$s = [adsisearcher]"(&(objectCategory=person)(objectClass=user)(sAMAccountName=${usuario}))"
@('displayName','userPrincipalName','employeeID','employeeNumber','mail') | ForEach-Object { [void]$s.PropertiesToLoad.Add($_) }
$r = $s.FindOne()
$p = [ordered]@{
  usuario = '${usuario}'
  dominio = '${dominio}'
  login = '${dominio}\\${usuario}'
  nombre = ''
  upn = ''
  dni = ''
  legajo = ''
  mail = ''
}
if ($r) {
  function Uno($n) { $v = $r.Properties[$n]; if ($v -and $v.Count -gt 0) { [string]$v[0] } else { '' } }
  $p.nombre = Uno 'displayname'
  $p.upn = Uno 'userprincipalname'
  $p.dni = Uno 'employeeid'
  $p.legajo = Uno 'employeenumber'
  $p.mail = Uno 'mail'
}
$p | ConvertTo-Json -Compress
`;
  return new Promise((resolve, reject) => {
    execFile(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, timeout: 15_000 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error((stderr || error.message || "Active Directory no respondió.").trim()));
          return;
        }
        try {
          resolve(JSON.parse(stdout));
        } catch {
          reject(new Error("No se pudo leer la identidad de Active Directory."));
        }
      }
    );
  });
}

function vigente(fecha) {
  if (!fecha) return true;
  const valor = fecha instanceof Date ? fecha : new Date(fecha);
  if (Number.isNaN(valor.getTime()) || valor.getFullYear() < 1901) return true;
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  return valor >= hoy;
}

function mapIure(fila) {
  if (fila.IdDependencia == null) return null;
  return {
    sistema: "IURE",
    codigo: String(fila.IdDependencia),
    nombre: fila.NombreYLocalidad || "",
    fueroId: fila.IdFuero == null ? null : Number(fila.IdFuero),
    fuero: fila.nombre || "",
    circunscripcion: fila.circ || "",
    titularidad: "",
    usuario: fila.name || "",
  };
}

function mapSigi(fila) {
  const codigo = String(fila.COD_DEP || "").trim();
  if (!codigo) return null;
  return {
    sistema: "SIGI",
    codigo,
    nombre: fila.NOMB_DEP || "",
    fueroId: null,
    fuero: "",
    circunscripcion: fila.DESC_CIRC_DEP || "",
    titularidad: fila.TITU_SUBROG || "",
    usuario: fila.NOMB_USUARIO || "",
  };
}

async function filasLoginIure(login) {
  const pool = await poolDe("IURE");
  const result = await pool
    .request()
    .input("login", sql.VarChar(255), login)
    .execute("dbo.spGetDatosLoginNumerador");
  return result.recordset || [];
}

async function dependenciasIure(identidad) {
  const login = String(identidad.usuario || "").trim();
  if (!login) return { login: "", dependencias: [], error: null };
  const filas = await filasLoginIure(login);
  return {
    login,
    dependencias: filas.filter((fila) => vigente(fila.fecha_baja)).map(mapIure).filter(Boolean),
    error: null,
  };
}

async function dependenciasSigi(identidad) {
  const dni = Number(String(identidad.dni || "").trim());
  if (!Number.isInteger(dni) || dni <= 0) {
    return { dni: null, dependencias: [], error: null };
  }
  const pool = await poolDe("SIGI");
  const result = await pool
    .request()
    .input("dniUsuarioSigi", sql.Int, dni)
    .execute("dbo.procNumeradorDatosUsuarioSIGI_DepsCircNomyApe");
  return {
    dni,
    dependencias: (result.recordset || []).map(mapSigi).filter(Boolean),
    error: null,
  };
}

async function consultarFuentes() {
  const identidad = await identidadWindows();
  const [iureRes, sigiRes] = await Promise.allSettled([
    dependenciasIure(identidad),
    dependenciasSigi(identidad),
  ]);
  const iure = iureRes.status === "fulfilled"
    ? iureRes.value
    : { login: identidad.usuario, dependencias: [], error: iureRes.reason.message };
  const sigi = sigiRes.status === "fulfilled"
    ? sigiRes.value
    : { dni: identidad.dni || "", dependencias: [], error: sigiRes.reason.message };
  return {
    identidad: {
      usuario: identidad.usuario,
      dominio: identidad.dominio,
      login: identidad.login,
      nombre: identidad.nombre,
      upn: identidad.upn,
      dni: identidad.dni,
    },
    iure,
    sigi,
    dependencias: [...iure.dependencias, ...sigi.dependencias],
  };
}

async function dependenciasHabilitadas() {
  if (cache && Date.now() < cacheHasta) return cache;
  const datos = await consultarFuentes();
  if (!datos.iure.error || !datos.sigi.error) {
    cache = datos;
    cacheHasta = Date.now() + CACHE_MS;
  }
  return datos;
}

async function dependenciaHabilitada(sistema, codigo) {
  const sistemaNorm = String(sistema || "").trim().toUpperCase();
  const codigoNorm = String(codigo || "").trim();
  if (!sistemaNorm || !codigoNorm) {
    const error = new Error("Seleccione la dependencia de la agenda.");
    error.status = 400;
    throw error;
  }
  const datos = await dependenciasHabilitadas();
  const encontrada = datos.dependencias.find(
    (dep) => dep.sistema === sistemaNorm && dep.codigo === codigoNorm
  );
  if (!encontrada) {
    const error = new Error("Esa dependencia no está habilitada para el usuario de Windows.");
    error.status = 403;
    throw error;
  }
  return encontrada;
}

function firmaDependencia(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/n[º°]\.?\s*/gi, "n ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function correspondeADependencia(radicacion, dependencia) {
  const rad = firmaDependencia(radicacion);
  const nombre = firmaDependencia(dependencia?.nombre);
  const codigo = firmaDependencia(dependencia?.codigo);
  if (!rad) return false;
  if (nombre && ` ${rad} `.includes(` ${nombre} `)) return true;
  if (codigo && (rad === codigo || rad.split(" ").includes(codigo))) return true;
  return false;
}

function resultadoExpediente(base, dependencia) {
  const corresponde = base.encontrado && (
    base.origen === "IURE" || correspondeADependencia(base.radicacion, dependencia)
  );
  let mensaje = "";
  if (!corresponde && base.encontrado) {
    const donde = base.radicacion ? ` Radica en ${base.radicacion}.` : "";
    mensaje = `El expediente ${base.numero} no corresponde a ${dependencia.nombre}.${donde}`;
  } else if (!base.encontrado) {
    mensaje = `No se encontró el expediente ${base.numero} en ${dependencia.sistema} para ${dependencia.nombre}.`;
  }
  return { ...base, corresponde, mensaje };
}

async function datosExpediente({ numero, dependencia }) {
  const nro = String(numero || "").trim().slice(0, 50);
  if (!nro) {
    const error = new Error("Ingrese el expediente.");
    error.status = 400;
    throw error;
  }
  if (dependencia.sistema === "SIGI") {
    const pool = await poolDe("SIGI");
    const result = await pool
      .request()
      .input("NroExpediente", sql.VarChar(50), nro)
      .execute("dbo.procNumeradorDatosExpteCaratProcDepRadic");
    const fila = result.recordset?.[0];
    if (!fila) {
      return resultadoExpediente({ numero: nro, encontrado: false, origen: "SIGI", radicacion: "" }, dependencia);
    }
    return resultadoExpediente({
      numero: nro,
      encontrado: true,
      origen: "SIGI",
      caratula: fila.CARATULA || "",
      proceso: fila.Proceso || "",
      radicacion: fila.DependRadicExpte || "",
      detalle: "",
    }, dependencia);
  }
  const idDependencia = Number(dependencia.codigo);
  const idFuero = Number(dependencia.fueroId);
  if (!idDependencia || !idFuero) {
    const error = new Error("La dependencia de IURE no tiene fuero para consultar la causa.");
    error.status = 400;
    throw error;
  }
  const pool = await poolDe("IURE");
  const result = await pool
    .request()
    .input("NroExpedienteEnviado", sql.VarChar(50), nro)
    .input("IdDependencia", sql.Int, idDependencia)
    .input("IdFuero", sql.Int, idFuero)
    .execute("dbo.spGetDatosExpedienteNumerador");
  const fila = result.recordset?.[0];
  if (!fila) {
    return resultadoExpediente({ numero: nro, encontrado: false, origen: "IURE", radicacion: "" }, dependencia);
  }
  return resultadoExpediente({
    numero: nro,
    encontrado: true,
    origen: "IURE",
    caratula: fila.caratula || "",
    proceso: "",
    radicacion: "",
    detalle: fila.descripcion || "",
  }, dependencia);
}

module.exports = {
  dependenciasHabilitadas,
  dependenciaHabilitada,
  datosExpediente,
};
