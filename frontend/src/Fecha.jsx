import { useEffect, useState } from "react";

export function aDdmm(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "";
  return iso.split("-").reverse().join("/");
}

export function fechaVisible(valor) {
  const texto = String(valor || "");
  const m = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(texto);
  if (!m) return texto;
  return `${m[3]}/${m[2]}/${m[1]}${m[4]}`;
}

export function CampoFecha({ value, onChange, required }) {
  const [texto, setTexto] = useState(aDdmm(value));

  useEffect(() => {
    setTexto(aDdmm(value));
  }, [value]);

  function escribir(e) {
    const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
    let armado = digits;
    if (digits.length > 4) armado = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    else if (digits.length > 2) armado = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    setTexto(armado);
    if (digits.length === 8) {
      const dd = Number(digits.slice(0, 2));
      const mm = Number(digits.slice(2, 4));
      const yyyy = Number(digits.slice(4));
      const fecha = new Date(yyyy, mm - 1, dd);
      if (fecha.getFullYear() === yyyy && fecha.getMonth() === mm - 1 && fecha.getDate() === dd) {
        onChange(`${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}`);
      }
    } else if (digits.length === 0) {
      onChange("");
    }
  }

  return (
    <span className="fecha-campo">
      <input
        type="text"
        inputMode="numeric"
        placeholder="dd/mm/aaaa"
        value={texto}
        onChange={escribir}
        onBlur={() => setTexto(aDdmm(value))}
        required={required}
        maxLength={10}
        autoComplete="off"
      />
      <svg className="fecha-ico" viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="5" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M3 10h18M8 3v4M16 3v4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      <input
        className="fecha-nativa"
        type="date"
        value={/^\d{4}-\d{2}-\d{2}$/.test(value || "") ? value : ""}
        onChange={(e) => onChange(e.target.value)}
        tabIndex={-1}
        aria-label="Abrir calendario"
      />
    </span>
  );
}
