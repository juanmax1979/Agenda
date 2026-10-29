require("./src/env").cargar();
const express = require("express");
const cors = require("cors");
const { initDb, logSistema } = require("./src/db");
const { cargarFeriados } = require("./src/calendario");
const routes = require("./src/routes");

initDb();
cargarFeriados();

const app = express();
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use("/api", routes);

app.use((error, _req, res, _next) => {
  logSistema(error.stack || error.message, "error");
  const status = error.status || 500;
  res.status(status).json({
    error: status === 500 ? "Error interno. Intente nuevamente." : error.message,
  });
});

const puerto = Number(process.env.PORT) || 4000;
app.listen(puerto, () => {
  logSistema(`API escuchando en http://localhost:${puerto}`);
  console.log(`Agenda judicial API en http://localhost:${puerto}`);
});
