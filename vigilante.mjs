// Vigilante de Solvy (23/09/2026, a pedido de Santi).
// Barre los chequeos cada VUELTA_MIN minutos durante DURACION_MIN minutos.
// Avisa por mail a founder@solvy.ar: cuando algo se rompe, un recordatorio por
// hora mientras siga roto, y cuando se normaliza. estado.json (versionado en
// este repo) es la memoria entre corridas y el historial de caídas.
import fs from "node:fs";
import { execSync } from "node:child_process";
import { correrChequeos } from "./chequeos.mjs";

const VUELTA_MIN = Number(process.env.VUELTA_MIN || 3);
const DURACION_MIN = Number(process.env.DURACION_MIN || 330);
const RECORDATORIO_MIN = 60;
// Un chequeo tiene que fallar 2 vueltas seguidas para avisar (evita falsas alarmas por un tirón de red).
const FALLAS_PARA_AVISAR = 2;
const ESTADO = "estado.json";
const DESTINO = process.env.AVISAR_A || "founder@solvy.ar";

const leerEstado = () => {
  try { return JSON.parse(fs.readFileSync(ESTADO, "utf8")); } catch { return { chequeos: {}, historial: [] }; }
};

function guardarEstado(estado, mensaje) {
  fs.writeFileSync(ESTADO, JSON.stringify(estado, null, 2) + "\n");
  if (!process.env.GITHUB_ACTIONS) return;
  try {
    execSync(`git add ${ESTADO} && git commit -m ${JSON.stringify(mensaje)} && git push`, { stdio: "ignore" });
  } catch { /* sin cambios o push concurrente: no es motivo para caer */ }
}

async function mandarMail(asunto, texto) {
  const key = process.env.RESEND_API_KEY;
  if (!key) { console.log("(sin RESEND_API_KEY) " + asunto); return false; }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: process.env.RESEND_FROM || "Solvy vigilante <no-reply@solvy.ar>",
      to: DESTINO.split(",").map((s) => s.trim()).filter(Boolean),
      subject: asunto,
      text: texto,
    }),
  });
  if (!res.ok) console.log(`Resend respondió ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.ok;
}

const hora = () => new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" });

async function vuelta(estado) {
  const resultados = await correrChequeos();
  const ahora = Date.now();
  const rotos = [], arreglados = [], recordar = [];
  let cambio = false;

  for (const r of resultados) {
    const prev = estado.chequeos[r.id] || { ok: true, fallasSeguidas: 0, avisado: false };
    const act = { ...prev, titulo: r.titulo, detalle: r.detalle, ultimo: ahora };
    if (r.ok) {
      if (prev.avisado) { arreglados.push(r); estado.historial.push({ id: r.id, fin: new Date().toISOString() }); cambio = true; }
      Object.assign(act, { ok: true, fallasSeguidas: 0, avisado: false, desde: undefined, ultimoAviso: undefined });
    } else {
      act.ok = false;
      act.fallasSeguidas = (prev.fallasSeguidas || 0) + 1;
      if (!prev.desde) act.desde = new Date().toISOString();
      if (!prev.avisado && act.fallasSeguidas >= FALLAS_PARA_AVISAR) {
        rotos.push(r); act.avisado = true; act.ultimoAviso = ahora; cambio = true;
        estado.historial.push({ id: r.id, inicio: act.desde, detalle: r.detalle });
      } else if (prev.avisado && ahora - (prev.ultimoAviso || 0) >= RECORDATORIO_MIN * 60000) {
        recordar.push(r); act.ultimoAviso = ahora;
      }
    }
    estado.chequeos[r.id] = act;
  }
  estado.historial = estado.historial.slice(-200);

  const linea = (r) => `• ${r.titulo}: ${r.detalle}`;
  if (rotos.length) {
    await mandarMail(`🔴 Solvy: algo dejó de andar (${rotos.map((r) => r.titulo).join(", ")})`,
      `${hora()}\n\nEl vigilante detectó un problema en www.solvy.com.ar:\n\n${rotos.map(linea).join("\n")}\n\nTe vuelvo a avisar cada hora mientras siga así, y cuando se normalice.`);
  }
  if (recordar.length) {
    await mandarMail(`🔴 Solvy: sigue sin andar (${recordar.map((r) => r.titulo).join(", ")})`,
      `${hora()}\n\nTodavía con problemas:\n\n${recordar.map(linea).join("\n")}`);
  }
  if (arreglados.length) {
    await mandarMail(`🟢 Solvy: se normalizó (${arreglados.map((r) => r.titulo).join(", ")})`,
      `${hora()}\n\nVolvió a andar:\n\n${arreglados.map(linea).join("\n")}`);
  }

  console.log(`[${hora()}] ` + resultados.map((r) => `${r.ok ? "ok" : "FALLA"} ${r.id}`).join(" · "));
  return { cambio, algunoRoto: resultados.some((r) => !r.ok && (estado.chequeos[r.id].avisado)) };
}

const estado = leerEstado();
const fin = Date.now() + DURACION_MIN * 60000;
let rojo = false;
let ultimoLatido = 0;
do {
  const { cambio, algunoRoto } = await vuelta(estado);
  rojo = rojo || algunoRoto;
  estado.ultimaRevision = new Date().toISOString();
  // Guardar DENTRO del ciclo (la corrida puede ser cancelada por la siguiente).
  // Un "latido" por hora aunque no cambie nada: es la señal de que el vigilante vive.
  if (cambio || Date.now() - ultimoLatido > 60 * 60000) {
    guardarEstado(estado, cambio ? "estado: cambio" : "estado: latido");
    ultimoLatido = Date.now();
  }
  if (Date.now() + VUELTA_MIN * 60000 > fin) break;
  await new Promise((r) => setTimeout(r, VUELTA_MIN * 60000));
} while (Date.now() < fin);

// Segundo canal de aviso: si algo quedó roto, la corrida termina en rojo y GitHub manda mail.
if (rojo) process.exit(1);
