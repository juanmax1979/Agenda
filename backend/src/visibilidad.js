function sqlVisibilidad(query, params) {
  const sistema = String(query.sistema || "").trim().toUpperCase();
  const codigo = String(query.codigo || "").trim();
  const nombre = String(query.nombreDependencia || "").trim().toLowerCase();
  if (!sistema || !codigo) return "";
  params.push(sistema, codigo, sistema, codigo, nombre, codigo.toLowerCase());
  return ` AND (
    coalesce(alcance, '') = 'general'
    OR (
      coalesce(alcance, '') IN ('', 'dependencia', 'agente')
      AND sistema = ? AND dependencia_codigo = ?
    )
    OR dependencia_codigo IS NULL OR dependencia_codigo = ''
    OR EXISTS (
      SELECT 1 FROM agenda_participantes p
      WHERE p.agenda_id = agenda.id
        AND (
          (upper(coalesce(p.sistema, '')) = ? AND p.codigo = ?)
          OR lower(p.nombre) = ?
          OR lower(p.codigo) = ?
        )
    )
  )`;
}

module.exports = { sqlVisibilidad };
