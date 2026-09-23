// Chequeos del vigilante de Solvy (23/09/2026). Solo LEEN: no escriben nada.
// Cada chequeo devuelve { id, titulo, ok, detalle }.
import tls from "node:tls";

const BASE = process.env.SOLVY_URL || "https://www.solvy.com.ar";
const UA = { "User-Agent": "solvy-vigilante/1" };

async function pedir(path, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(BASE + path, { headers: UA, signal: ctrl.signal, redirect: "follow" });
    const texto = await res.text();
    return { status: res.status, texto };
  } finally {
    clearTimeout(t);
  }
}

function pagina(id, path, titulo) {
  return async () => {
    try {
      const r = await pedir(path);
      const ok = r.status === 200 && /<html/i.test(r.texto);
      return { id, titulo, ok, detalle: ok ? "responde" : `HTTP ${r.status}` };
    } catch (e) {
      return { id, titulo, ok: false, detalle: `no responde (${e.name === "AbortError" ? "tardó más de 20 s" : e.message})` };
    }
  };
}

function lista(id, path, titulo) {
  return async () => {
    try {
      const r = await pedir(path);
      if (r.status !== 200) return { id, titulo, ok: false, detalle: `HTTP ${r.status}` };
      const d = JSON.parse(r.texto);
      const ok = Array.isArray(d) && d.length > 0;
      return { id, titulo, ok, detalle: ok ? `${d.length} resultados` : "vino vacío" };
    } catch (e) {
      return { id, titulo, ok: false, detalle: `error: ${e.message}` };
    }
  };
}

async function salud() {
  const id = "salud", titulo = "Servidor y base de datos";
  try {
    const r = await pedir("/api/health");
    const d = JSON.parse(r.texto);
    const ok = r.status === 200 && d.status === "ok" && d.db === "ok";
    return { id, titulo, ok, detalle: ok ? "ok" : `HTTP ${r.status} · ${r.texto.slice(0, 120)}` };
  } catch (e) {
    return { id, titulo, ok: false, detalle: `no responde (${e.message})` };
  }
}

function certificado() {
  const id = "certificado", titulo = "Certificado de seguridad (candado)";
  const host = new URL(BASE).hostname;
  return new Promise((resolve) => {
    const s = tls.connect(443, host, { servername: host, timeout: 15000 }, () => {
      const c = s.getPeerCertificate();
      s.end();
      const dias = Math.floor((new Date(c.valid_to) - Date.now()) / 86400000);
      resolve({ id, titulo, ok: dias > 7, detalle: `vence en ${dias} días` });
    });
    s.on("error", (e) => resolve({ id, titulo, ok: false, detalle: e.message }));
    s.on("timeout", () => { s.destroy(); resolve({ id, titulo, ok: false, detalle: "no conecta" }); });
  });
}

export const CHEQUEOS = [
  pagina("inicio", "/", "Página de inicio"),
  pagina("buscar", "/search", "Buscador"),
  pagina("registro", "/register", "Registro (adonde lleva el anuncio)"),
  pagina("login", "/login", "Ingreso"),
  salud,
  lista("rubros", "/api/categories", "Rubros (web y app)"),
  lista("profesionales", "/api/professionals/search?", "Lista de profesionales (web y app)"),
  certificado,
];

export async function correrChequeos() {
  return Promise.all(CHEQUEOS.map((c) => c()));
}
