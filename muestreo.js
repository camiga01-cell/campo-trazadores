"use strict";
// Campo · toma de muestras de calidad en los tres sitios del río: aguas arriba del vertimiento, aguas abajo del vertimiento
// (zona de mezcla) y aguas abajo de la zona de mezcla. Usa el estado, el GPS, las fotos y el respaldo de app.js.
const SITIOS_M = [
  {k: "arriba", n: "1 · Aguas arriba del vertimiento", cod: "AA", d: "Agua del río SIN influencia del vertimiento (la calidad de fondo). Lo más cerca posible aguas arriba de la descarga."},
  {k: "mezcla", n: "2 · Aguas abajo del vertimiento (zona de mezcla)", cod: "ZM", d: "Donde el vertimiento ya quedó mezclado con el río de lado a lado. Confirme la mezcla (conductividad igual en margen izquierda, centro y margen derecha)."},
  {k: "abajo", n: "3 · Aguas abajo de la zona de mezcla", cod: "AB", d: "Más allá de la zona de mezcla, para ver cómo cambia la calidad en el tramo."}
];
function rocioM(t, hr) {                   // temperatura de rocío (°C) con Magnus: a = 17,62; b = 243,12 °C
  if (t === null || hr === null || t === undefined || hr === undefined || !isFinite(t) || !isFinite(hr) || hr <= 0 || hr > 100) return null;
  const a = 17.62, b = 243.12, g = Math.log(hr / 100) + a * t / (b + t); return b * g / (a - g);
}
function avisosMeteo(S) {
  const a = [], bad = (x, lo, hi) => x !== null && x !== undefined && isFinite(x) && (x < lo || x > hi);
  S.meteo.forEach(m => { const h = m.hora ? m.hora.slice(0, 5) : "?";
    if (bad(m.hr, 0, 100)) a.push(h + ": humedad fuera de 0–100 %"); if (bad(m.nub_pct, 0, 100)) a.push(h + ": nubosidad fuera de 0–100 %"); if (bad(m.viento, 0, 60)) a.push(h + ": viento fuera de 0–60 m/s");
    if (bad(m.t_aire, -10, 50)) a.push(h + ": T del aire fuera de −10–50 °C"); });
  if (bad(S.sombra_pct, 0, 100)) a.push("sombra fuera de 0–100 %");
  return a;
}
let ABIERTOS_M = new Set(["arriba"]);

function mue() {
  const c = C(); if (!c.muestreo) c.muestreo = {equipo: "", serie: "", calib: "", lab: "", entrega: {quien: "", hora: "", temp_c: null, neveras: null, hielo: "sí", obs: ""}, sitios: {}};
  return c.muestreo;
}
function sitioM(k) {
  const M = mue(); if (M.sitios[k]) { const E = M.sitios[k]; if (!E.meteo) E.meteo = []; return E; }
  const S = SITIOS_M.find(s => s.k === k);
  return M.sitios[k] = {punto_id: null, lat: null, lon: null, acc: null, toma: "", tipo: "puntual", hora_ini: "", hora_fin: "", t_viaje_min: null, q_ls: null,
    meteo: [], sombra_pct: null, lluvia24: "", aspecto: "", olor: "", sedimento: "", notas: ""};
}
const horaDe = (h, c = C()) => { if (!h) return null; const f = new Date((c.fecha || new Date().toISOString().slice(0, 10)) + "T00:00:00"), [a, b, s] = h.split(":").map(Number); f.setHours(a, b, s || 0, 0); return f; };
function sugeridaM(k) {                     // hora para seguir la misma masa de agua: hora de toma en el sitio anterior + tiempo de viaje hasta este
  const i = SITIOS_M.findIndex(s => s.k === k); if (i < 1) return null;
  const S = sitioM(k), P = sitioM(SITIOS_M[i - 1].k), f = horaDe(P.hora_ini); if (!f || !(S.t_viaje_min > 0)) return null;
  return new Date(f.getTime() + S.t_viaje_min * 60000);
}
function avisosM(S) {
  const a = [];
  if (S.hora_ini && S.hora_fin && horaDe(S.hora_fin) < horaDe(S.hora_ini)) a.push("La hora de fin es anterior a la de inicio");
  return a;
}
function resumenM(S) {
  return {listo: !!S.hora_ini && S.lat !== null && S.lat !== undefined};
}
const nv = v => v === null || v === undefined ? "" : v;

function pintarMuestreo() {
  const c = C(), M = mue(), hoy = new Date();
  const sit = SITIOS_M.map(s => {
    const S = sitioM(s.k), R = resumenM(S), r = `muestreo.sitios.${s.k}`, W = avisosM(S), MA = avisosMeteo(S), sug = sugeridaM(s.k), pos = S.lat !== null && S.lat !== undefined && isFinite(S.lat);
    return `<details class="card est ${R.listo ? "ya" : ""}" data-sitio="${s.k}" ${ABIERTOS_M.has(s.k) ? "open" : ""}><summary><b>${s.n}</b> ${S.hora_ini ? `<span class="badge">${S.hora_ini.slice(0, 5)}</span>` : ""} ${R.listo ? "✔" : ""}</summary>
      <p class="nota">${s.d}</p>
      <div class="fila"><label>Punto del mapa (opcional)<select data-pm="${s.k}"><option value="">— elegir —</option>${c.puntos.map(p => `<option value="${p.id}"${p.id === S.punto_id ? " selected" : ""}>${esc(p.nombre)}</option>`).join("")}</select></label>
        ${campo("Latitud", r + ".lat", "n", S.lat)}${campo("Longitud", r + ".lon", "n", S.lon)}${campo("Precisión (m)", r + ".acc", "n", S.acc)}</div>
      <div style="margin:.3rem 0"><button class="b g p" data-gpsm="${s.k}" id="gpsm-${s.k}">📍 Fijar mi posición (GPS)</button> <span class="nota">${pos ? "Posición guardada." : "Sin posición todavía."}</span></div>
      <div class="fila">${campo("Dónde en la sección (p. ej. centro del cauce, 0,3 m de profundidad)", r + ".toma", "t", S.toma)}<label>Tipo de muestra<select data-r="${r}.tipo"><option${S.tipo === "puntual" ? " selected" : ""}>puntual</option><option${S.tipo === "integrada" ? " selected" : ""}>integrada en la sección</option><option${S.tipo === "compuesta" ? " selected" : ""}>compuesta</option></select></label></div>
      <h2 style="font-size:.95rem">Hora de la toma</h2>
      ${s.k !== "arriba" ? `<div class="fila">${campo("Tiempo de viaje desde el sitio anterior (min)", r + ".t_viaje_min", "n", S.t_viaje_min, 'data-re="1"')}</div><div class="nota" id="sug-${s.k}">${sug ? "" : "Escriba el tiempo de viaje (del ensayo de trazadores o del modelo) para ver la hora sugerida."}</div>` : '<p class="nota">Este sitio marca el arranque: las horas de los siguientes se calculan desde su hora de inicio.</p>'}
      <div class="fila">${campo("Inicio de la toma", r + ".hora_ini", "h", S.hora_ini, 'data-re="1"')}${campo("Fin de la toma", r + ".hora_fin", "h", S.hora_fin)}</div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin:.3rem 0"><button class="b g p" data-ahoram="${s.k}|hora_ini">Empecé ahora</button><button class="b g p" data-ahoram="${s.k}|hora_fin">Terminé ahora</button></div>
      ${W.length ? `<div class="adv">⚠ ${W.join(" · ")}</div>` : ""}
      <h2 style="font-size:.95rem">Condiciones hidroclimatológicas (entradas del modelo QUAL2Kw)</h2>
      <p class="nota">El modelo pide, <b>por hora</b>: temperatura del aire, temperatura de rocío, velocidad del viento (a 7 m), nubosidad (%) y sombra. Anote una lectura al tomar la muestra y repítala cada hora mientras dure el muestreo; deben corresponder a la fecha y hora de la toma.</p>
      ${S.meteo.length ? `<div class="scroll"><table><thead><tr><th>Hora</th><th>T aire °C</th><th>HR %</th><th>T rocío °C</th><th>Viento m/s</th><th>Altura m</th><th>Nubes %</th><th>Rad. W/m²</th><th></th></tr></thead><tbody>${S.meteo.map((m, i) => `<tr><td style="min-width:6.2rem">${inp(`${r}.meteo.${i}.hora`, "h", m.hora, 'data-re="1"')}</td><td>${inp(`${r}.meteo.${i}.t_aire`, "n", m.t_aire, 'data-re="1"')}</td><td>${inp(`${r}.meteo.${i}.hr`, "n", m.hr, 'data-re="1"')}</td><td><b>${rocioM(m.t_aire, m.hr) === null ? "—" : nf(rocioM(m.t_aire, m.hr), 1)}</b></td><td>${inp(`${r}.meteo.${i}.viento`, "n", m.viento, 'data-re="1"')}</td><td>${inp(`${r}.meteo.${i}.h_viento`, "n", m.h_viento)}</td><td>${inp(`${r}.meteo.${i}.nub_pct`, "n", m.nub_pct, 'data-re="1"')}</td><td>${inp(`${r}.meteo.${i}.rad`, "n", m.rad)}</td><td><button class="b g p" data-medel="${s.k}|${i}">✕</button></td></tr>`).join("")}</tbody></table></div>` : ""}
      <div style="margin:.3rem 0"><button class="b g p" data-meadd="${s.k}">+ Lectura ahora</button></div>
      ${MA.length ? `<div class="adv">⚠ ${MA.join(" · ")}</div>` : ""}
      <div class="fila">${campo("Sombra sobre el cauce (%)", r + ".sombra_pct", "n", S.sombra_pct, 'data-re="1"')}${campo("Lluvia en las últimas 24 h (mm o descripción)", r + ".lluvia24", "t", S.lluvia24)}</div>
      <p class="nota">Temperatura de rocío calculada con la temperatura y la humedad relativa (fórmula de Magnus). El viento se anota a la altura a la que se midió; el modelo lo pide a 7 m y se ajusta al armar el modelo (por confirmar). La radiación es opcional (piranómetro).</p>
      <div class="fila">${campo("Aspecto / color del agua", r + ".aspecto", "t", S.aspecto)}${campo("Olor", r + ".olor", "t", S.olor)}${campo("Sedimento / fondo", r + ".sedimento", "t", S.sedimento)}</div>
      ${fotosHtml("muestreo", "m:" + s.k, ["Sitio de muestreo", "Toma de la muestra", "Lectura de la sonda", "Frascos rotulados", "Otra"])}
      ${campo("Notas de este sitio", r + ".notas", "t", S.notas)}</details>`;
  }).join("");
  const E = M.entrega;
  $("t-mue").innerHTML = `<h2>Toma de muestras de calidad</h2>
    <p class="nota">Tres sitios del río, en este orden. Para seguir la <b>misma masa de agua</b>, tome cada muestra después del tiempo de viaje del sitio anterior (nunca antes del primer arribo del ensayo de trazadores). Esta es la bitácora de campo de la campaña <b>${esc(c.nombre)}</b>; las medidas con sonda y los frascos van en sus formatos de campo.</p>
    <details class="card"><summary><b>Equipo de medida en campo</b></summary><div class="fila" style="margin-top:.4rem">${campo("Equipo / marca / modelo", "muestreo.equipo", "t", M.equipo)}${campo("Serie", "muestreo.serie", "t", M.serie)}${campo("Fecha del último certificado de calibración", "muestreo.calib", "f", M.calib)}</div><p class="nota">La CAR pide los certificados de calibración de los equipos: anote aquí la fecha y adjunte el certificado en el informe.</p></details>
    ${sit}
    <h2>Entrega al laboratorio (cadena de custodia)</h2>
    <div class="card"><div class="fila">${campo("Laboratorio", "muestreo.lab", "t", M.lab)}${campo("Entrega (nombre)", "muestreo.entrega.quien", "t", E.quien)}${campo("Hora de entrega", "muestreo.entrega.hora", "h", E.hora)}${campo("T de la nevera al empacar (°C)", "muestreo.entrega.temp_c", "n", E.temp_c)}${campo("N.º de neveras", "muestreo.entrega.neveras", "n", E.neveras)}<label>Con hielo / geles<select data-r="muestreo.entrega.hielo"><option${E.hielo === "sí" ? " selected" : ""}>sí</option><option${E.hielo === "no" ? " selected" : ""}>no</option></select></label></div>
      ${campo("Observaciones de la entrega", "muestreo.entrega.obs", "t", E.obs)}</div>`;
  document.querySelectorAll("details[data-sitio]").forEach(d => d.addEventListener("toggle", () => { d.open ? ABIERTOS_M.add(d.dataset.sitio) : ABIERTOS_M.delete(d.dataset.sitio); }));
  document.querySelectorAll("[data-pm]").forEach(s => s.onchange = () => { const S = sitioM(s.dataset.pm), p = punto(s.value); S.punto_id = s.value || null; if (p) { S.lat = p.lat; S.lon = p.lon; S.acc = p.acc ?? null; } guardar(); pintarMuestreo(); });
  document.querySelectorAll("[data-gpsm]").forEach(b => b.onclick = async () => {
    const k = b.dataset.gpsm; b.disabled = true; b.textContent = "Midiendo… (quédese quieto)";
    try { const r = await fijarPunto(DB.ajustes.seg_promedio || 10), S = sitioM(k); S.lat = r.lat; S.lon = r.lon; S.acc = Math.round(r.acc); S.punto_id = null; guardar(); } catch (e) { alert(e.message); }
    pintarMuestreo(); });
  document.querySelectorAll("[data-ahoram]").forEach(b => b.onclick = () => { const [k, campoH] = b.dataset.ahoram.split("|"), S = sitioM(k); S[campoH] = horaTxt(new Date()); const s = SITIOS_M.find(x => x.k === k); evento((campoH === "hora_ini" ? "Inicio de toma de muestra en " : "Fin de toma de muestra en ") + s.n.slice(4)); pintarMuestreo(); });
  document.querySelectorAll("[data-meadd]").forEach(b => b.onclick = () => { const S = sitioM(b.dataset.meadd), u = S.meteo[S.meteo.length - 1]; S.meteo.push({hora: horaTxt(new Date()).slice(0, 5), t_aire: null, hr: null, viento: null, h_viento: u ? u.h_viento : null, nub_pct: null, rad: null}); guardar(); pintarMuestreo(); });
  document.querySelectorAll("[data-medel]").forEach(b => b.onclick = () => { const [k, n] = b.dataset.medel.split("|"); sitioM(k).meteo.splice(+n, 1); guardar(); pintarMuestreo(); });
  actualizarMuestreo();
}
function actualizarMuestreo() {            // cada segundo: cuenta regresiva de la hora sugerida y aviso con sonido 2 min antes
  const M = mue(); M.avisos = M.avisos || {};
  SITIOS_M.forEach(s => {
    const f = sugeridaM(s.k), e = $("sug-" + s.k); if (!f) return;
    const dt = (f.getTime() - Date.now()) / 1000, S = sitioM(s.k), hecho = !!S.hora_ini;
    if (e) e.innerHTML = hecho ? `Sugerida: <b>${horaTxt(f)}</b> (ya inició a las ${S.hora_ini.slice(0, 8)}).` : dt > 0 ? `Hora sugerida para seguir la misma masa de agua: <b>${horaTxt(f)}</b> — faltan <b>${mmss(dt)}</b>` : `Hora sugerida: <b>${horaTxt(f)}</b> — <span class="err">hace ${mmss(-dt)}</span>`;
    if (!hecho && dt <= 120 && dt > -180 && !M.avisos[s.k]) { M.avisos[s.k] = true; guardar(true); avisar(`En ${dt > 0 ? Math.ceil(dt / 60) + " min" : "este momento"}: tomar la muestra en «${s.n.slice(4)}»`); }
  });
}
setInterval(() => { if (TAB === "mue") actualizarMuestreo(); else if (document.visibilityState === "visible") { try { if (C().muestreo) actualizarMuestreo(); } catch (e) {} } }, 1000);

// ---- exportación y combinación (las usa app.js)
function muestreoExport() {
  const c = C(); if (!c.muestreo) return null; const M = c.muestreo;
  return {equipo: M.equipo, serie: M.serie, calibracion: M.calib, laboratorio: M.lab, entrega: M.entrega, sitios: SITIOS_M.map(s => { const S = sitioM(s.k); return {clave: s.k, nombre: s.n.slice(4), ...S}; })};
}
function muestreoImport(m) {
  if (!m) return undefined; const M = {equipo: m.equipo || "", serie: m.serie || "", calib: m.calibracion || "", lab: m.laboratorio || "", entrega: {quien: "", hora: "", temp_c: null, neveras: null, hielo: "sí", obs: "", ...(m.entrega || {})}, sitios: {}};
  (m.sitios || []).forEach(s => { const {clave, nombre, ...r} = s; M.sitios[clave] = r; }); return M;
}
function combinarMuestreo(a, b) {
  const vacio = v => v === null || v === undefined || v === ""; let n = 0;
  if (!b) return 0; const A = a.muestreo || (a.muestreo = b), M = a.muestreo;
  if (A === b) return 1;
  ["equipo", "serie", "calib", "lab"].forEach(k => { if (vacio(M[k]) && !vacio(b[k])) { M[k] = b[k]; n++; } });
  Object.entries(b.entrega || {}).forEach(([k, v]) => { if (vacio(M.entrega[k]) && !vacio(v)) { M.entrega[k] = v; n++; } });
  Object.entries(b.sitios || {}).forEach(([k, sb]) => {
    const sa = M.sitios[k]; if (!sa) { M.sitios[k] = sb; n++; return; }
    ["punto_id", "lat", "lon", "acc", "toma", "hora_ini", "hora_fin", "t_viaje_min", "sombra_pct", "lluvia24", "aspecto", "olor", "sedimento", "notas"].forEach(x => { if (vacio(sa[x]) && !vacio(sb[x])) { sa[x] = sb[x]; n++; } });
    (sb.meteo || []).forEach(mb => { if (!(sa.meteo || (sa.meteo = [])).some(m => m.hora === mb.hora)) { sa.meteo.push(mb); n++; } }); sa.meteo.sort((x, y) => (x.hora || "") < (y.hora || "") ? -1 : 1);
  });
  return n;
}
function muestreoCsv() {                    // filas para el .csv de «Guardar»: datos del sitio y una fila por lectura hidroclimatológica
  const c = C(); if (!c.muestreo) return []; const M = c.muestreo;
  const L = [[], ["MUESTREO DE CALIDAD"], ["Equipo", M.equipo, "Serie", M.serie, "Calibración", M.calib], ["Laboratorio", M.lab, "Entrega", M.entrega.quien, "Hora", M.entrega.hora, "T nevera (°C)", M.entrega.temp_c, "Neveras", M.entrega.neveras, "Hielo", M.entrega.hielo],
    ["Sitio", "Latitud", "Longitud", "Precisión (m)", "Dónde en la sección", "Tipo", "Inicio", "Fin", "Tiempo de viaje (min)", "Sombra %", "Lluvia 24 h", "Aspecto", "Olor", "Sedimento", "Notas"]];
  SITIOS_M.forEach(s => { const S = sitioM(s.k); L.push([s.n.slice(4), S.lat, S.lon, S.acc, S.toma, S.tipo, S.hora_ini, S.hora_fin, S.t_viaje_min, S.sombra_pct, S.lluvia24, S.aspecto, S.olor, S.sedimento, S.notas]); });
  L.push([], ["HIDROCLIMATOLOGÍA", "Fecha", "Sitio", "Hora", "T aire (°C)", "HR (%)", "T rocío (°C)", "Viento (m/s)", "Altura del viento (m)", "Nubosidad (%)", "Radiación (W/m2)"]);
  SITIOS_M.forEach(s => sitioM(s.k).meteo.forEach(m => { const d = rocioM(m.t_aire, m.hr); L.push(["", c.fecha, s.n.slice(4), m.hora, m.t_aire, m.hr, d === null ? "" : d.toFixed(1), m.viento, m.h_viento, m.nub_pct, m.rad]); }));
  return L;
}
