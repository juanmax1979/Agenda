const fs = require("fs");
const path = require("path");

function cargar() {
  const archivo = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(archivo)) return;
  const texto = fs.readFileSync(archivo, "utf8");
  for (const linea of texto.split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith("#")) continue;
    const corte = limpia.indexOf("=");
    if (corte < 1) continue;
    const clave = limpia.slice(0, corte).trim();
    if (process.env[clave]) continue;
    let valor = limpia.slice(corte + 1).trim();
    if (
      (valor.startsWith('"') && valor.endsWith('"')) ||
      (valor.startsWith("'") && valor.endsWith("'"))
    ) {
      valor = valor.slice(1, -1);
    } else {
      valor = valor.replace(/\s+#.*$/, "").trim();
    }
    process.env[clave] = valor;
  }
}

module.exports = { cargar };
