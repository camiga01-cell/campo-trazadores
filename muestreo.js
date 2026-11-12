"use strict";
// Campo · toma de muestras de calidad en los tres sitios del río: aguas arriba del vertimiento, aguas abajo del vertimiento
// (zona de mezcla) y aguas abajo de la zona de mezcla. Usa el estado, el GPS, las fotos y el respaldo de app.js.
const SITIOS_M = [
  {k: "arriba", previo: null, n: "1 · Aguas arriba del vertimiento", cod: "AA", corto: "Muestreo aguas arriba", d: "Agua del río SIN influencia del vertimiento (la calidad de fondo). Lo más cerca posible aguas arriba de la descarga."},
  {k: "mezcla", previo: "arriba", n: "2 · Aguas abajo del vertimiento (zona de mezcla)", cod: "ZM", corto: "Muestreo zona de mezcla", d: "Donde el vertimiento ya quedó mezclado con el río de lado a lado. Confirme la mezcla (conductividad igual en margen izquierda, centro y margen derecha)."},
  {k: "abajo", previo: "mezcla", n: "3 · Aguas abajo de la zona de mezcla", cod: "AB", corto: "Muestreo aguas abajo", d: "Más allá de la zona de mezcla, para ver cómo cambia la calidad en el tramo."}
,
  {k: "vertimiento", previo: "arriba", rol: "vertimiento", n: "4 · Vertimiento (efluente)", cod: "VT", corto: "Muestreo vertimiento", d: "La descarga que llega al río. La CAR pide muestrearla de manera simple, con aforo de caudal, coordenadas y hora, y de forma concordante con el monitoreo del río: tómela cuando pase por la descarga la masa de agua que viene siguiendo desde aguas arriba."}
];
// Guía que aparece al tocar un campo: qué se espera que se anote y a qué hoja del modelo QUAL2K alimenta
const AYUDA_M = {
  ec_mezcla: ["Conductividad en la sección", "Con la sonda, a la misma profundidad en cada vertical, esperando que la lectura se estabilice. La conductividad es un trazador natural del vertimiento: si es igual de margen a margen, el vertimiento ya se mezcló.", "Verificación de mezcla completa"],
  dist_mezcla: ["Distancia desde la descarga", "Metros, por el cauce, entre el punto de descarga y la sección donde mide. Compárela con la longitud de mezcla calculada (Fischer).", "Verificación de mezcla completa"],
  tol_mezcla: ["Tolerancia de mezcla", "Variación máxima aceptada de la conductividad entre márgenes y centro, en % del promedio. 5 % es un valor de partida: por confirmar con el criterio de su protocolo o del laboratorio.", "Verificación de mezcla completa"],
  ec_ref: ["Conductividad del vertimiento y del río arriba", "Léalas con la misma sonda. Sirven para saber si la conductividad distingue el vertimiento del río: si son casi iguales, la prueba no sirve y debe usar otro trazador.", "Verificación de mezcla completa"],
  q_vert: ["Caudal del vertimiento", "L/s en el momento de la toma. Aforo volumétrico (balde de volumen conocido y cronómetro, repetido 3 veces) o vertedero/medidor de la planta. La CAR pide el aforo de caudal en cada punto.", "Caudal de entrada al modelo"],
  metodo_q: ["Método de aforo", "Cómo midió el caudal: volumétrico, vertedero, medidor de la planta, molinete.", "Formato de campo"],
  t_aire: ["Temperatura del aire", "En °C, medida a la sombra, a 1,5 m del suelo y lejos del agua. Espere 2–3 minutos a que el termómetro se estabilice.", "Air Temperature (por hora)"],
  hr: ["Humedad relativa", "En %, con termohigrómetro, en el mismo sitio y hora que la temperatura del aire. Con las dos la app calcula la temperatura de rocío.", "Dew Point Temperature (por hora)"],
  viento: ["Velocidad del viento", "En m/s con anemómetro, de cara al viento y sin obstáculos. Sin anemómetro, anote la estimación en las notas (calma, brisa suave, viento fuerte): solo sirve de referencia.", "Wind Speed (el modelo la usa a 7 m de altura)"],
  h_viento: ["Altura del viento", "Metros sobre el suelo o el agua a los que sostuvo el anemómetro (p. ej. 1,5 m). Sirve para llevar el dato a 7 m.", "Wind Speed"],
  nub_pct: ["Nubosidad", "Porcentaje del cielo cubierto por nubes: 0 = despejado, 100 = totalmente cubierto. Mire todo el cielo, no solo el sol. Si lo estima en octas: 1 octa = 12,5 % (4 octas = 50 %).", "Cloud Cover (por hora)"],
  sombra: ["Sombra sobre el cauce", "Porcentaje del agua del tramo que NO recibe sol directo por árboles, vegetación de orilla o paredes del cauce: 0 = a pleno sol, 100 = todo en sombra. Estímelo mirando el tramo (no solo el punto) a esa hora; cambia durante el día.", "Shade (por hora)"],
  rad: ["Radiación solar", "En W/m² con piranómetro, a esa hora. Si no tiene el equipo déjela vacía: el modelo normalmente la calcula con la latitud, la fecha y las nubes.", "Solar (opcional)"],
  lluvia24: ["Lluvia previa", "Milímetros del pluviómetro, o descripción: sin lluvia / llovizna / aguacero, y a qué hora fue. Explica cambios de caudal y de carga en el río.", "Condición hidroclimatológica que pide la CAR"],
  t_viaje: ["Tiempo de viaje", "Minutos que tarda el agua desde el sitio anterior hasta este: sale del ensayo de trazadores (entre el primer arribo y el tiempo medio de viaje) o del modelo hidráulico.", "Seguimiento de la misma masa de agua"],
  cota: ["Cota", "Altura del punto sobre el nivel del mar (m), de topografía o nivelación. La altitud del GPS no sirve para pendientes de tramos cortos.", "Pendiente del tramo"]
};
(() => { const st = document.createElement("style"); st.textContent = ".ayuda-m{flex:1 1 100%;background:#eef4ff;border-left:4px solid var(--az);padding:.4rem .6rem;border-radius:.3rem;font-size:.84rem;margin:.2rem 0;color:#1d2433}.ayuda-m small{display:block;color:var(--gr);margin-top:.15rem}"; document.head.appendChild(st); })();
document.addEventListener("focusin", ev => {
  const el = ev.target, k = el.dataset && el.dataset.ay; if (!k || !AYUDA_M[k]) return;
  document.querySelectorAll(".ayuda-m").forEach(x => x.remove());
  const [t, q, m] = AYUDA_M[k], d = document.createElement("div"); d.className = "ayuda-m"; d.innerHTML = `<b>${t}.</b> ${q}<small>Modelo / uso: ${m}</small>`;
  const ancla = el.closest("td") ? el.closest(".scroll") : el.closest("label"); if (ancla) ancla.insertAdjacentElement("afterend", d);
});
const AY = (k, re) => `data-ay="${k}"${re ? ' data-re="1"' : ""}`;
function rocioM(t, hr) {                   // temperatura de rocío (°C) con Magnus: a = 17,62; b = 243,12 °C
  if (t === null || hr === null || t === undefined || hr === undefined || !isFinite(t) || !isFinite(hr) || hr <= 0 || hr > 100) return null;
  const a = 17.62, b = 243.12, g = Math.log(hr / 100) + a * t / (b + t); return b * g / (a - g);
}
function avisosMeteo(S) {
  const a = [], bad = (x, lo, hi) => x !== null && x !== undefined && isFinite(x) && (x < lo || x > hi);
  S.meteo.forEach(m => { const h = m.hora ? m.hora.slice(0, 5) : "?";
    if (bad(m.hr, 0, 100)) a.push(h + ": humedad fuera de 0–100 %"); if (bad(m.nub_pct, 0, 100)) a.push(h + ": nubosidad fuera de 0–100 %"); if (bad(m.sombra_pct, 0, 100)) a.push(h + ": sombra fuera de 0–100 %"); if (bad(m.viento, 0, 60)) a.push(h + ": viento fuera de 0–60 m/s");
    if (bad(m.t_aire, -10, 50)) a.push(h + ": T del aire fuera de −10–50 °C"); });
  return a;
}
let ABIERTOS_M = new Set(["arriba"]);

const lecturaVacia = (u) => ({hora: horaTxt(new Date()).slice(0, 5), t_aire: null, hr: null, viento: null, h_viento: u ? u.h_viento : null, nub_pct: null, sombra_pct: u ? u.sombra_pct : null, rad: null});
const lecturaConDatos = m => ["t_aire", "hr", "viento", "nub_pct", "sombra_pct", "rad"].some(k => m[k] !== null && m[k] !== undefined && m[k] !== "");
const mezclaVacia = () => ({dist_m: null, tol_pct: 5, ec_vert: null, ec_arriba: null, verticales: [{pos: "Margen izquierda", ec: null}, {pos: "Centro", ec: null}, {pos: "Margen derecha", ec: null}]});
function mezclaCalc(Z) {                    // variación de la conductividad en la sección: (máx − mín) / promedio
  if (!Z) return null; const v = Z.verticales.map(x => x.ec).filter(x => x !== null && x !== undefined && isFinite(x) && x > 0);
  if (v.length < 3) return {n: v.length, listo: false};
  const med = v.reduce((a, b) => a + b, 0) / v.length, rango = Math.max(...v) - Math.min(...v), pct = 100 * rango / med, tol = Z.tol_pct > 0 ? Z.tol_pct : 5;
  const contr = Z.ec_vert > 0 && Z.ec_arriba > 0 ? 100 * Math.abs(Z.ec_vert - Z.ec_arriba) / Z.ec_arriba : null;
  return {n: v.length, listo: true, med, rango, pct, tol, ok: pct <= tol, contraste: contr, pocoContraste: contr !== null && contr < 2 * tol};
}
function mue() {
  const c = C(); if (!c.muestreo) c.muestreo = {equipo: "", serie: "", calib: "", sitios: {}};
  return c.muestreo;
}
function sitioM(k) {
  const M = mue(); if (M.sitios[k]) { const E = M.sitios[k]; if (!E.meteo) E.meteo = []; if (!E.meteo.length && k !== "vertimiento") E.meteo.push(lecturaVacia()); if (k === "mezcla" && !E.mezcla) E.mezcla = mezclaVacia(); if (k === "vertimiento" && E.q_ls === undefined) { E.q_ls = null; E.metodo_q = ""; } return E; }
  const S = SITIOS_M.find(s => s.k === k);
  return M.sitios[k] = {punto_id: null, hora_ini: "", hora_fin: "", t_viaje_min: null,
    meteo: k === "vertimiento" ? [] : [lecturaVacia()], lluvia24: "", notas: "", ...(k === "mezcla" ? {mezcla: mezclaVacia()} : {}), ...(k === "vertimiento" ? {q_ls: null, metodo_q: ""} : {})};
}
const horaDe = (h, c = C()) => { if (!h) return null; const f = new Date((c.fecha || new Date().toISOString().slice(0, 10)) + "T00:00:00"), [a, b, s] = h.split(":").map(Number); f.setHours(a, b, s || 0, 0); return f; };
function sugeridaM(k) {                     // hora para seguir la misma masa de agua: hora de toma en el sitio previo + tiempo de viaje hasta este
  const def = SITIOS_M.find(x => x.k === k); if (!def.previo) return null;
  const S = sitioM(k), P = sitioM(def.previo), f = horaDe(P.hora_ini); if (!f || !(S.t_viaje_min > 0)) return null;
  return new Date(f.getTime() + S.t_viaje_min * 60000);
}
function avisosM(S) {
  const a = [];
  if (S.hora_ini && S.hora_fin && horaDe(S.hora_fin) < horaDe(S.hora_ini)) a.push("La hora de fin es anterior a la de inicio");
  return a;
}
function resumenM(S) {
  const p = punto(S.punto_id); return {listo: !!S.hora_ini && !!p && isFinite(p.lat)};
}
const nv = v => v === null || v === undefined ? "" : v;

function posicionHtml(s, S) {              // misma ficha que la pestaña Puntos cuando el sitio no es un punto del ensayo de trazadores
  const c = C(), p = punto(S.punto_id), i = p ? c.puntos.indexOf(p) : -1, A = abscisas(), L = enlaces();
  const sel = `<label>Punto del mapa<select data-pm="${s.k}"><option value="">— sitio nuevo (no es un punto de trazadores) —</option>${c.puntos.map(q => `<option value="${q.id}"${q.id === S.punto_id ? " selected" : ""}>${esc(q.nombre)}</option>`).join("")}</select></label>`;
  if (!p) return `<div class="fila">${sel}</div><div style="display:flex;gap:.5rem;margin:.4rem 0;flex-wrap:wrap"><button class="b" data-mnuevo="${s.k}|gps" style="flex:2">📍 Marcar punto aquí (GPS)</button><button class="b g" data-mnuevo="${s.k}|man" style="flex:1">Escribir coordenadas</button></div>
    <p class="nota">Si este sitio coincide con un punto del ensayo de trazadores, elíjalo arriba. Si no, márquelo aquí: queda guardado como un punto más (función «Sitio de muestreo de calidad») y sale en el mapa. El GPS promedia ${DB.ajustes.seg_promedio} s: quédese quieto.</p>`;
  return `<div class="fila">${sel}</div><div class="card" style="background:#fafbfd"><div class="pt"><b>${i + 1}. ${esc(p.nombre)}</b><span class="badge">${(ROLES.find(r => r[0] === p.rol) || [0, p.rol])[1]}</span></div>
    <div class="fila" style="margin-top:.4rem">${campo("Nombre", `puntos.${i}.nombre`, "t", p.nombre, 'data-re="1"')}${campo("Latitud", `puntos.${i}.lat`, "n", p.lat, 'data-re="1"')}${campo("Longitud", `puntos.${i}.lon`, "n", p.lon, 'data-re="1"')}${campo("Precisión GPS (m)", `puntos.${i}.acc`, "n", p.acc)}${campo("Cota (m s. n. m.)", `puntos.${i}.cota`, "n", p.cota, AY("cota", true) + ' placeholder="para la pendiente"')}</div>
    ${p.alt_gps != null ? `<div class="nota">Altitud medida por el GPS: <b>${nf(p.alt_gps, 0)} m</b>${p.alt_acc && p.alt_acc < 99 ? " (±" + nf(p.alt_acc, 0) + " m)" : ""}. El GPS da la altura con un error de 10 a 30 m: <b>no sirve para la pendiente de tramos cortos</b>. ${p.cota_origen === "gps" ? "<b>Ya se usa como cota</b>: si tiene una medida mejor, escríbala arriba." : `<button class="b g p" data-musaralt="${i}">Usar como cota</button>`}</div>` : ""}
    ${campo("Notas del punto", `puntos.${i}.notas`, "t", p.notas)}
    <div class="nota">${A[i] === null ? "" : "Abscisa desde el primer punto: <b>" + nf(A[i], 0) + " m</b>"}${i ? ` · desde el punto anterior: <b>${nf(L[i - 1].d, 0)} m</b> (${L[i - 1].origen})` : ""}${p.rol === "muestreo" ? ". Este punto quedó al final de la lista: si va entre otros puntos del río, ordénelo con ↑ ↓ en la pestaña Puntos." : ""}</div>
    <button class="b g p" data-mreub="${i}" style="margin-top:.3rem">📍 Volver a tomar la ubicación aquí</button></div>`;
}
function mezclaHtml(S, r) {
  const Z = S.mezcla, C2 = mezclaCalc(Z), z = r + ".mezcla";
  return `<h2 style="font-size:.95rem">Verificación de mezcla completa</h2>
    <p class="nota">El vertimiento ya se mezcló cuando la conductividad (trazador natural del vertimiento) es la misma de margen a margen. Antes de tomar la muestra, mida la conductividad con la sonda en <b>al menos 3 puntos de la sección</b> (margen izquierda, centro y margen derecha, a la misma profundidad). Si varía más que la tolerancia, avance aguas abajo y repita.</p>
    <div class="fila">${campo("Distancia desde la descarga (m)", z + ".dist_m", "n", Z.dist_m, AY("dist_mezcla"))}${campo("Tolerancia de variación (%) — por confirmar", z + ".tol_pct", "n", Z.tol_pct, AY("tol_mezcla", true))}</div>
    ${Z.verticales.map((v, i) => `<div class="fila" style="margin-top:.3rem">${campo("Punto de la sección", `${z}.verticales.${i}.pos`, "t", v.pos)}${campo("Conductividad (µS/cm)", `${z}.verticales.${i}.ec`, "n", v.ec, AY("ec_mezcla", true))}${i > 2 ? `<button class="b g p" data-mzdel="${i}" style="align-self:flex-end">Quitar</button>` : ""}</div>`).join("")}
    <div style="margin:.3rem 0"><button class="b g p" data-mzadd="1">+ Otro punto de la sección</button></div>
    <div class="fila">${campo("Conductividad del vertimiento (µS/cm) — opcional", z + ".ec_vert", "n", Z.ec_vert, AY("ec_ref", true))}${campo("Conductividad del río aguas arriba (µS/cm) — opcional", z + ".ec_arriba", "n", Z.ec_arriba, AY("ec_ref", true))}</div>
    ${!C2 || !C2.listo ? `<div class="nota">Escriba la conductividad en ${C2 ? 3 - C2.n : 3} punto(s) más para ver el resultado.</div>` : `<div class="card" style="border-width:2px;border-color:${C2.ok ? "var(--ok)" : "var(--ro)"}"><b>${C2.ok ? "✔ Mezcla completa" : "✗ Todavía NO está mezclado"}</b><div class="nota">La conductividad varía <b>${nf(C2.pct, 1)} %</b> en la sección (${nf(C2.rango, 0)} µS/cm sobre un promedio de ${nf(C2.med, 0)}); tolerancia ${nf(C2.tol, 1)} %.${C2.ok ? " Puede tomar la muestra aquí." : " Avance aguas abajo, mida otra vez y tome la muestra solo cuando cumpla."}</div>${C2.contraste !== null ? `<div class="nota">Contraste vertimiento–río: ${nf(C2.contraste, 0)} %.${C2.pocoContraste ? ' <b style="color:var(--ro)">⚠ Es poco: la conductividad no distingue bien el vertimiento del río y esta prueba no es concluyente; use otro trazador (criterio aproximado, por confirmar).</b>' : ""}</div>` : ""}</div>`}`;
}
function vertimientoHtml(S, r) {
  return `<h2 style="font-size:.95rem">Caudal del vertimiento</h2>
    <div class="fila">${campo("Caudal aforado (L/s)", r + ".q_ls", "n", S.q_ls, AY("q_vert"))}${campo("Método de aforo", r + ".metodo_q", "t", S.metodo_q, AY("metodo_q"))}</div>
    <p class="nota">La CAR pide el vertimiento <b>de manera simple</b> (muestra puntual), con aforo de caudal, coordenadas y hora, concordante con el monitoreo del río. El tiempo de viaje de arriba es desde «aguas arriba» hasta la descarga.</p>`;
}
function meteoHtml(s, S, r, MA) {
  return `      <h2 style="font-size:.95rem">Condiciones hidroclimatológicas (entradas del modelo QUAL2K)</h2>
      <p class="nota">El modelo tiene una hoja por variable y por hora: <b>Air Temperature, Dew Point Temperature, Wind Speed, Cloud Cover, Shade y Solar</b>. Anote una lectura al tomar la muestra y repítala cada hora mientras dure el muestreo; deben corresponder a la fecha y hora de la toma. <b>Toque un campo para ver qué se espera que anote.</b></p>
      ${S.meteo.map((m, i) => `<div class="card" style="background:#fafbfd"><div class="pt"><b>Lectura ${i + 1}</b><button class="b g p" data-medel="${s.k}|${i}">Quitar</button></div>
        <div class="fila" style="margin-top:.3rem">${campo("Hora", `${r}.meteo.${i}.hora`, "h", m.hora, 'data-re="1"')}${campo("Temperatura del aire (°C)", `${r}.meteo.${i}.t_aire`, "n", m.t_aire, AY("t_aire", true))}${campo("Humedad relativa (%)", `${r}.meteo.${i}.hr`, "n", m.hr, AY("hr", true))}
        ${campo("Velocidad del viento (m/s)", `${r}.meteo.${i}.viento`, "n", m.viento, AY("viento", true))}${campo("Altura del anemómetro (m)", `${r}.meteo.${i}.h_viento`, "n", m.h_viento, AY("h_viento"))}${campo("Cobertura de nubes (%)", `${r}.meteo.${i}.nub_pct`, "n", m.nub_pct, AY("nub_pct", true))}
        ${campo("Sombra sobre el cauce (%)", `${r}.meteo.${i}.sombra_pct`, "n", m.sombra_pct, AY("sombra", true))}${campo("Radiación solar (W/m²) — opcional", `${r}.meteo.${i}.rad`, "n", m.rad, AY("rad"))}</div>
        <div class="nota">Temperatura de rocío (calculada): <b>${rocioM(m.t_aire, m.hr) === null ? "— (falta temperatura o humedad)" : nf(rocioM(m.t_aire, m.hr), 1) + " °C"}</b></div></div>`).join("")}
      <div style="margin:.3rem 0"><button class="b g p" data-meadd="${s.k}">+ Lectura ahora</button></div>
      ${MA.length ? `<div class="adv">⚠ ${MA.join(" · ")}</div>` : ""}
      <p class="nota">La temperatura de rocío la calcula la app con la temperatura y la humedad (fórmula de Magnus). El viento se anota a la altura a la que se midió; el modelo lo pide a 7 m y se ajusta al armar el modelo (por confirmar).</p>
      <div class="fila">${campo("Lluvia en las últimas 24 h", r + ".lluvia24", "t", S.lluvia24, AY("lluvia24"))}</div>`;
}
function pintarMuestreo() {
  const c = C(), M = mue();
  const sit = SITIOS_M.map(s => {
    const S = sitioM(s.k), R = resumenM(S), r = `muestreo.sitios.${s.k}`, MZ = s.k === "mezcla" ? mezclaCalc(S.mezcla) : null, W = avisosM(S), MA = avisosMeteo(S), sug = sugeridaM(s.k);
    return `<details class="card est ${R.listo ? "ya" : ""}" data-sitio="${s.k}" ${ABIERTOS_M.has(s.k) ? "open" : ""}><summary><b>${s.n}</b> ${S.hora_ini ? `<span class="badge">${S.hora_ini.slice(0, 5)}</span>` : ""} ${MZ && MZ.listo ? (MZ.ok ? '<span class="badge" style="background:#d9f2e3">mezclado</span>' : '<span class="badge" style="background:#fbdcd6">sin mezclar</span>') : ""} ${R.listo ? "✔" : ""}</summary>
      <p class="nota">${s.d}</p>
      ${posicionHtml(s, S)}
      <h2 style="font-size:.95rem">Hora de la toma</h2>
      ${s.previo ? `<div class="fila">${campo("Tiempo de viaje desde «" + SITIOS_M.find(x => x.k === s.previo).n.slice(4) + "» (min)", r + ".t_viaje_min", "n", S.t_viaje_min, AY("t_viaje", true))}</div><div class="nota" id="sug-${s.k}">${sug ? "" : "Escriba el tiempo de viaje (del ensayo de trazadores o del modelo) para ver la hora sugerida."}</div>` : '<p class="nota">Este sitio marca el arranque: las horas de los demás se calculan desde su hora de inicio.</p>'}
      <div class="fila">${campo("Inicio de la toma", r + ".hora_ini", "h", S.hora_ini, 'data-re="1"')}${campo("Fin de la toma", r + ".hora_fin", "h", S.hora_fin)}</div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin:.3rem 0"><button class="b g p" data-ahoram="${s.k}|hora_ini">Empecé ahora</button><button class="b g p" data-ahoram="${s.k}|hora_fin">Terminé ahora</button></div>
      ${W.length ? `<div class="adv">⚠ ${W.join(" · ")}</div>` : ""}
      ${s.k === "vertimiento" ? vertimientoHtml(S, r) : (s.k === "mezcla" ? mezclaHtml(S, r) : "") + meteoHtml(s, S, r, MA)}
      ${fotosHtml("muestreo", "m:" + s.k, ["Sitio de muestreo", "Toma de la muestra", "Lectura de la sonda", "Otra"])}
      ${campo("Notas de este sitio", r + ".notas", "t", S.notas)}</details>`;
  }).join("");
  $("t-mue").innerHTML = `<h2>Toma de muestras de calidad</h2>
    <p class="nota">Tres sitios del río, en este orden. Para seguir la <b>misma masa de agua</b>, tome cada muestra después del tiempo de viaje del sitio anterior (nunca antes del primer arribo del ensayo de trazadores). Esta es la bitácora de campo de la campaña <b>${esc(c.nombre)}</b>; las medidas con sonda y los frascos van en sus formatos de campo.</p>
    ${c.puntos.length ? selectorFondo() + '<div id="mapa-caja">' + mapaSVG() + "</div>" : ""}
    <details class="card"><summary><b>Equipo de medida en campo</b></summary><div class="fila" style="margin-top:.4rem">${campo("Equipo / marca / modelo", "muestreo.equipo", "t", M.equipo)}${campo("Serie", "muestreo.serie", "t", M.serie)}${campo("Fecha del último certificado de calibración", "muestreo.calib", "f", M.calib)}</div><p class="nota">La CAR pide los certificados de calibración de los equipos: anote aquí la fecha y adjunte el certificado en el informe.</p></details>
    ${sit}`;
  document.querySelectorAll("details[data-sitio]").forEach(d => d.addEventListener("toggle", () => { d.open ? ABIERTOS_M.add(d.dataset.sitio) : ABIERTOS_M.delete(d.dataset.sitio); }));
  document.querySelectorAll("[data-pm]").forEach(sl => sl.onchange = () => { sitioM(sl.dataset.pm).punto_id = sl.value || null; guardar(); pintarMuestreo(); });
  const crear = (k, lat, lon, acc, alt, altAcc) => { const s = SITIOS_M.find(x => x.k === k); const p = {id: pid(), nombre: s.corto, rol: s.rol || "muestreo", lat, lon, acc: acc === null ? null : Math.round(acc), alt_gps: alt ?? null, alt_acc: altAcc ?? null, cota: alt != null ? Math.round(alt * 10) / 10 : null, cota_origen: alt != null ? "gps" : null, hora_iso: new Date().toISOString(), notas: "", hid: {}}; c.puntos.push(p); sitioM(k).punto_id = p.id; guardar(); pintarMuestreo(); };
  document.querySelectorAll("[data-mnuevo]").forEach(b => b.onclick = async () => {
    const [k, modo] = b.dataset.mnuevo.split("|");
    if (modo === "man") { const t = prompt("Latitud, longitud en grados decimales (p. ej. 4.53596, -74.54319):"); if (!t) return; const m = parseCoord(t); if (!m || Math.abs(m[0]) > 90 || Math.abs(m[1]) > 180) return alert("No se entendió. Escriba: latitud, longitud (p. ej. 4.53596, -74.54319)."); return crear(k, m[0], m[1], null); }
    try { b.disabled = true; b.textContent = "Midiendo… quédese quieto"; const r = await fijarPunto(DB.ajustes.seg_promedio); crear(k, r.lat, r.lon, r.acc, r.alt, r.altAcc); } catch (e) { alert(e.message); pintarMuestreo(); } });
  document.querySelectorAll("[data-mreub]").forEach(b => b.onclick = async () => { try { b.disabled = true; b.textContent = "Midiendo… quédese quieto"; const r = await fijarPunto(DB.ajustes.seg_promedio), p = c.puntos[+b.dataset.mreub]; p.lat = r.lat; p.lon = r.lon; p.acc = Math.round(r.acc); p.alt_gps = r.alt; p.alt_acc = r.altAcc; if (r.alt != null && p.cota_origen !== "manual") { p.cota = Math.round(r.alt * 10) / 10; p.cota_origen = "gps"; } guardar(); pintarMuestreo(); } catch (e) { alert(e.message); pintarMuestreo(); } });
  document.querySelectorAll("[data-musaralt]").forEach(b => b.onclick = () => { const p = c.puntos[+b.dataset.musaralt]; p.cota = Math.round(p.alt_gps * 10) / 10; p.cota_origen = "gps"; guardar(); pintarMuestreo(); });
  document.querySelectorAll("[data-ahoram]").forEach(b => b.onclick = () => { const [k, campoH] = b.dataset.ahoram.split("|"), S = sitioM(k); S[campoH] = horaTxt(new Date()); const s = SITIOS_M.find(x => x.k === k); evento((campoH === "hora_ini" ? "Inicio de toma de muestra en " : "Fin de toma de muestra en ") + s.n.slice(4)); pintarMuestreo(); });
  document.querySelectorAll("[data-meadd]").forEach(b => b.onclick = () => { const S = sitioM(b.dataset.meadd), u = S.meteo[S.meteo.length - 1]; S.meteo.push(lecturaVacia(u)); guardar(); pintarMuestreo(); });
  document.querySelectorAll("[data-medel]").forEach(b => b.onclick = () => { const [k, n] = b.dataset.medel.split("|"); sitioM(k).meteo.splice(+n, 1); guardar(); pintarMuestreo(); });
  document.querySelectorAll("[data-mzadd]").forEach(b => b.onclick = () => { sitioM("mezcla").mezcla.verticales.push({pos: "Punto " + (sitioM("mezcla").mezcla.verticales.length + 1), ec: null}); guardar(); pintarMuestreo(); });
  document.querySelectorAll("[data-mzdel]").forEach(b => b.onclick = () => { sitioM("mezcla").mezcla.verticales.splice(+b.dataset.mzdel, 1); guardar(); pintarMuestreo(); });
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
  return {equipo: M.equipo, serie: M.serie, calibracion: M.calib, sitios: SITIOS_M.map(s => { const S = sitioM(s.k), p = punto(S.punto_id); return {clave: s.k, nombre: s.n.slice(4), ...S, punto: p ? p.nombre : null}; })};
}
function muestreoImport(m) {
  if (!m) return undefined; const M = {equipo: m.equipo || "", serie: m.serie || "", calib: m.calibracion || "", sitios: {}};
  (m.sitios || []).forEach(s => { const {clave, nombre, punto: _p, ...r} = s; M.sitios[clave] = r; }); return M;
}
function combinarMuestreo(a, b) {
  const vacio = v => v === null || v === undefined || v === ""; let n = 0;
  if (!b) return 0; if (!a.muestreo) { a.muestreo = b; return 1; }
  const M = a.muestreo;
  ["equipo", "serie", "calib"].forEach(k => { if (vacio(M[k]) && !vacio(b[k])) { M[k] = b[k]; n++; } });
  Object.entries(b.sitios || {}).forEach(([k, sb]) => {
    const sa = M.sitios[k]; if (!sa) { M.sitios[k] = sb; n++; return; }
    ["punto_id", "hora_ini", "hora_fin", "t_viaje_min", "lluvia24", "q_ls", "metodo_q", "notas"].forEach(x => { if (vacio(sa[x]) && !vacio(sb[x])) { sa[x] = sb[x]; n++; } });
    if (sb.mezcla && sa.mezcla && !mezclaCalc(sa.mezcla).listo && mezclaCalc(sb.mezcla).listo) { sa.mezcla = sb.mezcla; n++; }
    (sb.meteo || []).filter(lecturaConDatos).forEach(mb => { if (!(sa.meteo || (sa.meteo = [])).some(m => m.hora === mb.hora)) { sa.meteo.push(mb); n++; } }); sa.meteo.sort((x, y) => (x.hora || "") < (y.hora || "") ? -1 : 1);
  });
  return n;
}
function muestreoCsv() {                    // filas para el .csv de «Guardar»: datos del sitio y una fila por lectura hidroclimatológica
  const c = C(); if (!c.muestreo) return []; const M = c.muestreo;
  const L = [[], ["MUESTREO DE CALIDAD"], ["Equipo", M.equipo, "Serie", M.serie, "Calibración", M.calib],
    ["Sitio", "Punto", "Latitud", "Longitud", "Precisión (m)", "Cota (m)", "Inicio", "Fin", "Tiempo de viaje (min)", "Lluvia 24 h", "Caudal vertimiento (L/s)", "Método de aforo", "Mezcla: variación (%)", "Mezcla: ¿completa?", "Notas"]];
  SITIOS_M.forEach(s => { const S = sitioM(s.k), p = punto(S.punto_id) || {}, mz = s.k === "mezcla" ? mezclaCalc(S.mezcla) : null; L.push([s.n.slice(4), p.nombre, p.lat, p.lon, p.acc, p.cota, S.hora_ini, S.hora_fin, S.t_viaje_min, S.lluvia24, S.q_ls, S.metodo_q, mz && mz.listo ? mz.pct.toFixed(1) : "", mz && mz.listo ? (mz.ok ? "sí" : "no") : "", S.notas]); });
  L.push([], ["HIDROCLIMATOLOGÍA", "Fecha", "Sitio", "Hora", "T aire (°C)", "HR (%)", "T rocío (°C)", "Viento (m/s)", "Altura del viento (m)", "Nubosidad (%)", "Sombra (%)", "Radiación (W/m2)"]);
  SITIOS_M.forEach(s => sitioM(s.k).meteo.filter(lecturaConDatos).forEach(m => { const d = rocioM(m.t_aire, m.hr); L.push(["", c.fecha, s.n.slice(4), m.hora, m.t_aire, m.hr, d === null ? "" : d.toFixed(1), m.viento, m.h_viento, m.nub_pct, m.sombra_pct, m.rad]); }));
  return L;
}
