"use strict";
// Campo · toma de muestras de calidad en los tres sitios del río: aguas arriba del vertimiento, aguas abajo del vertimiento
// (zona de mezcla) y aguas abajo de la zona de mezcla. Usa el estado, el GPS, las fotos y el respaldo de app.js.
const SITIOS_M = [
  {k: "arriba", previo: null, n: "1 · Aguas arriba del vertimiento", cod: "AA", corto: "Muestreo aguas arriba", d: "Agua del río SIN influencia del vertimiento (la calidad de fondo). Lo más cerca posible aguas arriba de la descarga."},
  {k: "vertimiento", previo: "arriba", rol: "vertimiento", n: "2 · Vertimiento (efluente)", cod: "VT", corto: "Muestreo vertimiento", d: "La descarga que llega al río. La CAR pide muestrearla de manera simple, con aforo de caudal, coordenadas y hora, y de forma concordante con el monitoreo del río: tómela cuando pase por la descarga la masa de agua que viene siguiendo desde aguas arriba."},
  {k: "mezcla", previo: "vertimiento", n: "3 · Aguas abajo del vertimiento (zona de mezcla)", cod: "ZM", corto: "Muestreo zona de mezcla", d: "Donde el vertimiento ya quedó mezclado con el río de lado a lado. Confirme la mezcla (conductividad igual en margen izquierda, centro y margen derecha)."},
  {k: "abajo", previo: "mezcla", n: "4 · Aguas abajo de la zona de mezcla", cod: "AB", corto: "Muestreo aguas abajo", d: "Más allá de la zona de mezcla, para ver cómo cambia la calidad en el tramo."}
];
// Guía que aparece al tocar un campo: qué se espera que se anote y a qué hoja del modelo QUAL2K alimenta
const AYUDA_M = {
  df: ["DF — fracción dispersiva", "Cuánto se ensancha la nube de trazador respecto del tiempo medio: primer arribo = (1 − DF) × tiempo medio. 0,27 es un valor de partida (de tablas del modelo de tiempo de viaje): por confirmar. Si el ensayo midió el primer arribo, el DF sale de ahí en la plataforma.", "Intervalo de muestreo de la misma masa de agua"],
  vel: ["Velocidad media", "En m/s: caudal aforado ÷ área mojada, o el promedio de las velocidades de las verticales del aforo con molinete. Se usa para el tiempo de viaje (distancia ÷ velocidad) y para la longitud de mezcla.", "Tiempo de viaje y longitud de mezcla"],
  dist_tramo: ["Distancia entre sitios", "Metros por el cauce desde el sitio anterior hasta este (cinta, telémetro o pasos medidos). Solo hace falta si no marcó la ubicación de los dos puntos: con los puntos ubicados la app la calcula sola.", "Tiempo de viaje (distancia ÷ velocidad)"],
  vmax: ["Velocidad máxima", "La mayor velocidad medida en la sección: la de la vertical más rápida del aforo con molinete (m/s). Con la media da el DF = 1 − U/U_máx y de ahí el primer arribo (la masa de agua más rápida), sin procesar el ensayo.", "Intervalo de muestreo de la misma masa de agua"],
  ec_mezcla: ["Conductividad en la sección", "Con la sonda, a la misma profundidad en cada vertical, esperando que la lectura se estabilice. La conductividad es un trazador natural del vertimiento: si es igual de margen a margen, el vertimiento ya se mezcló.", "Verificación de mezcla completa"],
  descarga: ["Descarga en la sección", "Dónde entra el vertimiento al río: en la orilla (caso habitual, descarga lateral) o en el centro del cauce. Cambia el coeficiente de Fischer (0,4 en la orilla, 0,1 en el centro).", "Longitud de mezcla"],
  ancho: ["Ancho del río", "En metros, el ancho del espejo de agua en la sección del punto de mezcla, medido con cinta o telémetro.", "Longitud de mezcla (W)"],
  prof: ["Profundidad media", "En metros: promedio de las profundidades medidas en la sección (o área mojada ÷ ancho).", "Longitud de mezcla (H)"],
  pend: ["Pendiente", "Pendiente longitudinal del tramo en m/m (cota arriba − cota abajo) ÷ distancia por el cauce. Si ya anotó las cotas de los puntos, la app la calcula y la puede dejar vacía.", "Longitud de mezcla (S)"],
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
  t_viaje: ["Tiempo de viaje", "Minutos que tarda el agua desde el sitio anterior hasta este. La app lo calcula con los picos del ensayo de trazadores de esta campaña o, si no hay, con distancia ÷ velocidad de las secciones; si lo escribe usted, se respeta su valor.", "Seguimiento de la misma masa de agua"],
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
const mezclaVacia = () => ({descarga: "orilla", ancho_m: null, prof_m: null, pend: null, dist_m: null, tol_pct: 5, ec_vert: null, ec_arriba: null, verticales: [{pos: "Margen izquierda", ec: null}, {pos: "Centro", ec: null}, {pos: "Margen derecha", ec: null}]});
function fischerM(S, Z) {                  // longitud de mezcla (Fischer et al. 1979): Lm = c·U·W²/Et; Et = α·H·U*; U* = √(g·H·S); c = 0,4 (descarga en la orilla) o 0,1 (en el centro)
  const W = Z.ancho_m, H = Z.prof_m, U = S.vel_ms; let Sp = Z.pend, origenS = "escrita";
  if (!(Sp > 0)) { const q = pendienteVert(S); if (q) { Sp = q.s; origenS = "de las cotas de los puntos"; } }
  if (!(W > 0 && H > 0 && U > 0 && Sp > 0)) return null;
  const alfa = C().params.alpha_t > 0 ? C().params.alpha_t : 0.6, coef = Z.descarga === "centro" ? 0.1 : 0.4, us = Math.sqrt(G * H * Sp), et = alfa * H * us;
  return {Lm: coef * U * W * W / et, us, et, alfa, coef, S: Sp, origenS};
}
function pendienteVert(S) {
  const c = C(), pv = punto(sitioM("vertimiento").punto_id), pm = punto(S.punto_id); if (!pv || !pm) return null;
  const iv = c.puntos.indexOf(pv), im = c.puntos.indexOf(pm); if (!(im > iv)) return null; const q = pendienteEntre(iv, im); return q && q.s > 0 ? q : null;
}
function mezclaCalc(Z) {                    // variación de la conductividad en la sección: (máx − mín) / promedio
  if (!Z) return null; const v = Z.verticales.map(x => x.ec).filter(x => x !== null && x !== undefined && isFinite(x) && x > 0);
  if (v.length < 3) return {n: v.length, listo: false};
  const med = v.reduce((a, b) => a + b, 0) / v.length, rango = Math.max(...v) - Math.min(...v), pct = 100 * rango / med, tol = Z.tol_pct > 0 ? Z.tol_pct : 5;
  const contr = Z.ec_vert > 0 && Z.ec_arriba > 0 ? 100 * Math.abs(Z.ec_vert - Z.ec_arriba) / Z.ec_arriba : null;
  return {n: v.length, listo: true, med, rango, pct, tol, ok: pct <= tol, contraste: contr, pocoContraste: contr !== null && contr < 2 * tol};
}
function mue() {
  const c = C(); if (!c.muestreo) c.muestreo = {sitios: {}};
  return c.muestreo;
}
function sitioM(k) {
  const M = mue(); if (M.sitios[k]) { const E = M.sitios[k]; if (!E.meteo) E.meteo = []; if (!E.meteo.length && k !== "vertimiento") E.meteo.push(lecturaVacia()); if (k === "mezcla" && !E.mezcla) E.mezcla = mezclaVacia(); if (k === "vertimiento" && E.q_ls === undefined) { E.q_ls = null; E.metodo_q = ""; } return E; }
  const S = SITIOS_M.find(s => s.k === k);
  return M.sitios[k] = {punto_id: null, hora_ini: "", hora_fin: "", t_viaje_min: null, t_auto: true, t_origen: "", dist_m: null, vel_ms: null, vmax_ms: null,
    meteo: k === "vertimiento" ? [] : [lecturaVacia()], lluvia24: "", notas: "", ...(k === "mezcla" ? {mezcla: mezclaVacia()} : {}), ...(k === "vertimiento" ? {q_ls: null, metodo_q: ""} : {})};
}
const horaDe = h => { if (!h) return null; const f = new Date(), [a, b, s] = h.split(":").map(Number); f.setHours(a, b, s || 0, 0); return f; };      // la hora escrita se toma como de hoy
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
    <div class="nota">${A[i] === null ? "" : "Abscisa desde el primer punto: <b>" + nf(A[i], 0) + " m</b>"}${i ? ` · desde el punto anterior: <b>${nf(L[i - 1].d, 0)} m</b> (${L[i - 1].origen})` : ""}${p.rol === "muestreo" ? ". Se insertó en la lista de Puntos en el orden del río, entre los demás sitios de muestreo; si hay puntos del ensayo de trazadores en medio, revise el orden con ↑ ↓ en la pestaña Puntos." : ""}</div>
    <button class="b g p" data-mreub="${i}" style="margin-top:.3rem">📍 Volver a tomar la ubicación aquí</button></div>`;
}
const minDia = h => { if (!h) return null; const [a, b, c] = String(h).split(":").map(Number); return isFinite(a) && isFinite(b) ? a * 60 + b + (c || 0) / 60 : null; };
function distManualM(kA, kB) {            // suma de las distancias escritas a mano entre sitios consecutivos (si están todas)
  const orden = SITIOS_M.map(x => x.k), i = orden.indexOf(kA), j = orden.indexOf(kB); if (!(j > i)) return null; let suma = 0;
  for (let x = i + 1; x <= j; x++) { const d = sitioM(orden[x]).dist_m; if (!(d > 0)) return null; suma += d; } return suma;
}
function distanciaM(kA, kB) {              // distancia por el recorrido (o en línea recta) entre los puntos de dos sitios; si faltan los puntos, la escrita a mano
  const c = C(), pa = punto(sitioM(kA).punto_id), pb = punto(sitioM(kB).punto_id);
  if (!pa || !pb || !isFinite(pa.lat) || !isFinite(pb.lat)) { const m = distManualM(kA, kB); return m ? {m, a: null, b: null, origen: "escrita por usted"} : null; }
  const A = abscisas(), ia = c.puntos.indexOf(pa), ib = c.puntos.indexOf(pb);
  if (A[ia] !== null && A[ib] !== null) return {m: Math.abs(A[ib] - A[ia]), a: A[ia], b: A[ib], origen: "por el recorrido entre puntos"};
  return {m: hav([pa.lat, pa.lon], [pb.lat, pb.lon]), a: null, b: null, origen: "en línea recta"};
}
function tiemposEnsayo() {                 // referencias del ensayo de trazadores de esta campaña: inyección (hora) y picos vistos en las estaciones, por abscisa
  const c = C(), A = abscisas(), R = [];
  c.puntos.forEach((p, i) => { if (A[i] === null) return; const t = p.rol === "inyeccion" ? minDia(c.inyeccion && c.inyeccion.hora) : minDia((c.registros[p.id] || {}).pico); if (t !== null) R.push({a: A[i], t, nombre: p.nombre}); });
  R.sort((x, y) => x.a - y.a); return R;
}
function propT(k) { const def = SITIOS_M.find(x => x.k === k); return def.previo ? propEntre(def.previo, k) : {}; }
function propEntre(kA, kB) {               // A: con el ensayo de trazadores; B: distancia ÷ velocidad de las secciones aforadas
  const D = distanciaM(kA, kB), out = {};
  if (D && D.a !== null) {
    const R = tiemposEnsayo(); let ok = R.length >= 2;
    for (let i = 1; i < R.length; i++) if (!(R[i].t > R[i - 1].t && R[i].a > R[i - 1].a)) ok = false;
    if (ok) {
      const tAt = a => { let i = 1; while (i < R.length - 1 && a > R[i].a) i++; const u = R[i - 1], v = R[i]; return u.t + (a - u.a) * (v.t - u.t) / (v.a - u.a); };
      const sign = D.b >= D.a ? 1 : -1, t = sign * (tAt(D.b) - tAt(D.a)), fuera = Math.min(D.a, D.b) < R[0].a || Math.max(D.a, D.b) > R[R.length - 1].a;
      if (t > 0) out.A = {min: t, fuente: `ensayo de trazadores (${R.length} referencias: ${R.map(x => x.nombre).join(", ")})${fuera ? " — parte del tramo queda fuera de las estaciones: extrapolado" : ""}`};
    }
  }
  const ud = (kk) => { const e = SITIOS_M.find(x => x.k === kk); return sitioM(kk).vel_ms > 0 ? sitioM(kk).vel_ms : (kk === "vertimiento" ? sitioM("arriba").vel_ms : null); };
  const ua = ud(kA), ub = ud(kB), us = [ua, ub].filter(v => v > 0);
  if (D && us.length) { const u = us.reduce((x, y) => x + y, 0) / us.length; out.B = {min: D.m / u / 60, fuente: `${nf(D.m, 0)} m ÷ ${nf(u, 2)} m/s (${us.length === 2 ? "promedio de las dos secciones" : "una sola sección aforada"})`}; }
  out.D = D; return out;
}
const SITIOS_VENTANA = ["mezcla", "abajo"];          // el vertimiento no lleva ventana: se toma cuando la masa de agua pasa por la descarga
function acumM(k) {                         // tiempo medio de viaje (min) desde aguas arriba hasta el sitio k: suma de los tramos, o estimación directa si falta alguno
  const orden = SITIOS_M.map(x => x.k), n = orden.indexOf(k); let suma = 0, completo = true;
  for (const j of orden.slice(1, n + 1)) { const tv = sitioM(j).t_viaje_min; if (tv > 0) suma += tv; else { completo = false; break; } }
  if (completo && suma > 0) return suma;
  const P = propEntre("arriba", k), m = P.A || P.B; return m ? m.min : null;
}
function dfVelM(k) {                        // DF = 1 − U/U_máx con las velocidades medidas en los sitios del río, desde aguas arriba hasta el sitio k
  const sitios = ["arriba", "mezcla", "abajo"], n = sitios.indexOf(k), R = [];
  sitios.slice(0, n + 1).forEach(j => { const S = sitioM(j); if (S.vel_ms > 0 && S.vmax_ms > S.vel_ms) R.push(S.vel_ms / S.vmax_ms); });
  if (!R.length) return null; const r = R.reduce((a, b) => a + b, 0) / R.length; return {df: 1 - r, n: R.length};
}
function ventanaM(k) {                      // Guía Nacional: entre el primer arribo (nunca antes) y el tiempo medio de viaje, contados desde la hora de la primera muestra
  const f0 = horaDe(sitioM("arriba").hora_ini); if (!f0) return {falta: "Anote la hora de inicio de la toma en «Aguas arriba» (la primera muestra) para ver el intervalo."};
  const t = acumM(k); if (!(t > 0)) return {falta: "Falta el tiempo de viaje desde aguas arriba: registre los picos del ensayo, la velocidad de los sitios o escríbalo en cada sitio."};
  const dv = dfVelM(k), dsup = mue().df >= 0 && mue().df < 1 ? mue().df : 0.27, df = dv ? dv.df : dsup, tau = (1 - df) * t, origenDF = dv ? `de las velocidades medidas, 1 − U/U_máx en ${dv.n} sección(es)` : "supuesto: no hay velocidad máxima y media";
  return {ini: new Date(f0.getTime() + tau * 60000), fin: new Date(f0.getTime() + t * 60000), tau, t, df, origenDF};
}
function textoVentana(k) {
  const V = ventanaM(k); if (V.falta) return {html: V.falta, clase: "nota", V};
  const S = sitioM(k), ahora = Date.now(), hh = f => horaTxt(f).slice(0, 5), rango = `<b>${hh(V.ini)} – ${hh(V.fin)}</b>`;
  const base = `Intervalo para muestrear la <b>misma masa de agua</b>: ${rango} <span class="nota">(a +${nf(V.tau, 1)} min el primer arribo y a +${nf(V.t, 1)} min el tiempo medio, desde la primera muestra; DF = ${nf(V.df, 2)}, ${V.origenDF})</span>`;
  if (S.hora_ini) { const h = horaDe(S.hora_ini), d = h >= V.ini && h <= V.fin; return {html: `${base}<br>${d ? "✔ Su toma de las " + S.hora_ini.slice(0, 5) + " está dentro del intervalo." : '<span class="err">⚠ Su toma de las ' + S.hora_ini.slice(0, 5) + (h < V.ini ? " fue antes del primer arribo: no corresponde a la misma masa de agua." : " fue después del tiempo medio: la masa de agua ya pasó.") + "</span>"}`, clase: "nota", V}; }
  const dI = (V.ini.getTime() - ahora) / 1000, dF = (V.fin.getTime() - ahora) / 1000;
  const est = dI > 0 ? `Faltan <b>${mmss(dI)}</b> para que abra.` : dF > 0 ? `<b style="color:var(--ok)">AHORA es buen momento</b>: cierra en <b>${mmss(dF)}</b>.` : `<span class="err">El intervalo ya pasó hace ${mmss(-dF)}.</span>`;
  return {html: `${base}<br>${est}`, clase: "nota", V, dI, dF};
}
function faltaTiempoM(k) {                  // qué dato falta para que la app calcule sola el tiempo de viaje de este tramo
  const def = SITIOS_M.find(x => x.k === k), prev = SITIOS_M.find(x => x.k === def.previo), f = [];
  if (!distanciaM(def.previo, k)) f.push(`la <b>distancia</b> desde «${prev.n.slice(4)}» (ubique los dos puntos o escriba la distancia)`);
  const ud = kk => sitioM(kk).vel_ms > 0 || (kk === "vertimiento" && sitioM("arriba").vel_ms > 0);
  if (!ud(def.previo) && !ud(k)) f.push(`la <b>velocidad media</b> de «${prev.n.slice(4)}» o de este sitio`);
  return f;
}
function tiempoHtml(s, S, r, P, sug) {
  const prev = SITIOS_M.find(x => x.k === s.previo).n.slice(4), auto = S.t_viaje_min > 0 && S.t_origen && S.t_origen !== "escrito a mano", falta = faltaTiempoM(s.k), sinDist = !distanciaM(s.previo, s.k) || (!punto(S.punto_id) || !punto(sitioM(s.previo).punto_id));
  const resumen = S.t_viaje_min > 0 ? `Tiempo de viaje desde «${esc(prev)}»: <b>${nf(S.t_viaje_min, 1)} min</b> <span class="badge">${esc(S.t_origen || "")}</span>` : `<b>Tiempo de viaje desde «${esc(prev)}»: aún sin calcular.</b>`;
  const dd = P.D ? ` · distancia ${nf(P.D.m, 0)} m (${esc(P.D.origen)})` : "";
  return `<div class="nota" style="font-size:.9rem">${resumen}${dd}</div>
    ${!(S.t_viaje_min > 0) && falta.length ? `<div class="adv">Para que la app lo calcule sola falta: ${falta.join(" y ")}.</div>` : ""}
    ${sinDist ? `<div class="fila">${campo("Distancia desde «" + prev + "» (m) — solo si no ubicó los puntos", r + ".dist_m", "n", S.dist_m, AY("dist_tramo", true))}</div>` : ""}
    <details ${S.t_origen === "escrito a mano" || (!(S.t_viaje_min > 0) && falta.length) ? "open" : ""}><summary class="nota">Escribir el tiempo de viaje a mano (opcional)</summary><div class="fila">${campo("Tiempo de viaje (min)", r + ".t_viaje_min", "n", S.t_viaje_min, AY("t_viaje"))}</div></details>
    <div class="nota" id="sug-${s.k}">${sug ? "" : "Con el tiempo de viaje y la hora de inicio de la primera muestra verá aquí la hora sugerida."}</div>${propuestaHtml(s.k, S, P)}`;
}
function propuestaHtml(k, S, P) {
  const o = S.t_origen ? ` <span class="badge">${esc(S.t_origen)}</span>` : "";
  const fila = (x, t, nom) => x ? `<div class="nota">${nom}: <b>${nf(x.min, 1)} min</b> — ${esc(x.fuente)}. <button class="b g p" data-tuse="${k}|${t}">Usar este</button></div>` : "";
  const dif = P.A && P.B ? Math.abs(P.A.min - P.B.min) / P.A.min * 100 : null;
  return `${o ? `<div class="nota">Valor actual: <b>${nf(S.t_viaje_min, 1)} min</b>${o}</div>` : ""}${fila(P.A, "A", "Con trazadores")}${fila(P.B, "B", "Con las secciones")}${dif !== null && dif > 30 ? `<div class="adv">⚠ Las dos estimaciones difieren ${nf(dif, 0)} %: el ensayo suele dar más tiempo que distancia ÷ velocidad en tramos con pozas. Si el caudal no cambió, prefiera el del ensayo.</div>` : ""}${!P.A && P.B ? '<div class="nota">Aún no hay picos del ensayo para este tramo; esta es una estimación aproximada con las secciones.</div>' : ""}`;
}
function distVertM(S) {                    // distancia por el recorrido (o en línea recta) entre el punto del vertimiento y el de este sitio
  return distanciaM("vertimiento", "mezcla");
}
function mezclaHtml(S, r) {
  const Z = S.mezcla, z = r + ".mezcla", D = distVertM(S), pv = punto(sitioM("vertimiento").punto_id);
  if (D && (Z.dist_m === null || Z.dist_m === undefined || Z.dist_auto)) { Z.dist_m = Math.round(D.m); Z.dist_auto = true; }
  const C2 = mezclaCalc(Z);
  const F = fischerM(S, Z), pend0 = pendienteVert(S);
  const ubic = `<h2 style="font-size:.95rem">1 · ¿Está bien ubicado este punto? (longitud de mezcla)</h2>
    <p class="nota">La longitud de mezcla (Fischer) dice a qué distancia de la descarga el vertimiento se mezcla de orilla a orilla. Este punto debe quedar <b>a esa distancia o más</b> aguas abajo. Escriba el ancho, la profundidad y la velocidad del río en esta sección (las del aforo).</p>
    <div class="fila"><label>Descarga del vertimiento en la sección<select data-r="${z}.descarga" data-re="1" ${AY("descarga")}><option value="orilla"${Z.descarga !== "centro" ? " selected" : ""}>en la orilla (lateral)</option><option value="centro"${Z.descarga === "centro" ? " selected" : ""}>en el centro del cauce</option></select></label>
      ${campo("Ancho del río (m)", z + ".ancho_m", "n", Z.ancho_m, AY("ancho", true))}${campo("Profundidad media (m)", z + ".prof_m", "n", Z.prof_m, AY("prof", true))}${campo("Pendiente (m/m)", z + ".pend", "n", Z.pend, AY("pend", true) + (pend0 ? ` placeholder="de las cotas: ${nf(pend0.s, 4)}"` : ""))}</div>
    ${!F ? '<div class="nota">Complete ancho, profundidad, velocidad y pendiente para calcular la longitud de mezcla.</div>' : (() => { const D2 = D ? D.m : (Z.dist_m > 0 ? Z.dist_m : null), falta = D2 === null ? null : F.Lm - D2;
      return `<div class="card" style="border-width:2px;border-color:${falta === null ? "var(--bd)" : falta <= 0 ? "var(--ok)" : "var(--ro)"}"><b>Longitud de mezcla (Fischer): ${nf(F.Lm, 0)} m</b>${D2 === null ? '<div class="nota">Ubique el punto del vertimiento y este sitio para comparar con la distancia real.</div>' : falta <= 0 ? `<div class="nota">✔ Distancia real desde la descarga: <b>${nf(D2, 0)} m</b> ≥ ${nf(F.Lm, 0)} m. La posición del punto es correcta.</div>` : `<div class="nota"><b style="color:var(--ro)">✗ Distancia real: ${nf(D2, 0)} m &lt; ${nf(F.Lm, 0)} m.</b> El punto está muy cerca: <b>desplácelo al menos ${nf(falta, 0)} m aguas abajo</b> (hasta ≥ ${nf(F.Lm, 0)} m de la descarga) y vuelva a marcar su ubicación.</div>`}
        <div class="nota">U* = ${nf(F.us, 3)} m/s · Et = ${nf(F.et, 4)} m²/s · coeficiente ${F.coef} (${Z.descarga === "centro" ? "centro" : "orilla"}) · α = ${nf(F.alfa, 2)} (por confirmar) · pendiente ${nf(F.S, 4)} (${F.origenS}).</div></div>`; })()}`;
  return ubic + `<h2 style="font-size:.95rem">2 · ¿Ya se mezcló? (conductividad)</h2>
    <p class="nota">El vertimiento ya se mezcló cuando la conductividad (trazador natural del vertimiento) es la misma de margen a margen. Antes de tomar la muestra, mida la conductividad con la sonda en <b>al menos 3 puntos de la sección</b> (margen izquierda, centro y margen derecha, a la misma profundidad). Si varía más que la tolerancia, avance aguas abajo y repita.</p>
    <div class="nota">Vertimiento: <b>${pv ? esc(pv.nombre) : "sin ubicar"}</b>${D ? ` · distancia calculada hasta este sitio: <b>${nf(D.m, 0)} m</b> (${D.origen}).` : ". Marque primero la ubicación del vertimiento (sitio 2) y la de este sitio para calcular la distancia."}</div>
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
  const c = C(), M = mue(), PT = {}; if (M.df === undefined) M.df = 0.27;
  SITIOS_M.forEach(s => { if (!s.previo) return; const S = sitioM(s.k), P = PT[s.k] = propT(s.k), mejor = P.A || P.B;
    if (S.t_auto !== false && mejor) { S.t_viaje_min = Math.round(mejor.min * 10) / 10; S.t_origen = P.A ? "calculado con trazadores" : "calculado con las secciones"; } });
  const sit = SITIOS_M.map(s => {
    const S = sitioM(s.k), R = resumenM(S), r = `muestreo.sitios.${s.k}`, MZ = s.k === "mezcla" ? mezclaCalc(S.mezcla) : null, W = avisosM(S), MA = avisosMeteo(S), sug = sugeridaM(s.k);
    return `<details class="card est ${R.listo ? "ya" : ""}" data-sitio="${s.k}" ${ABIERTOS_M.has(s.k) ? "open" : ""}><summary><b>${s.n}</b> ${S.hora_ini ? `<span class="badge">${S.hora_ini.slice(0, 5)}</span>` : ""} ${MZ && MZ.listo ? (MZ.ok ? '<span class="badge" style="background:#d9f2e3">mezclado</span>' : '<span class="badge" style="background:#fbdcd6">sin mezclar</span>') : ""} ${R.listo ? "✔" : ""}</summary>
      <p class="nota">${s.d}</p>
      ${posicionHtml(s, S)}
      <h2 style="font-size:.95rem">Hora de la toma</h2>
      ${s.previo ? tiempoHtml(s, S, r, PT[s.k], sug) : '<p class="nota">Este sitio marca el arranque: las horas de los demás se calculan desde su hora de inicio.</p>'}
      ${s.k !== "vertimiento" ? `<div class="fila">${campo("Velocidad media en la sección (m/s) — del aforo", r + ".vel_ms", "n", S.vel_ms, AY("vel", true))}${campo("Velocidad máxima en la sección (m/s)", r + ".vmax_ms", "n", S.vmax_ms, AY("vmax", true))}</div>${S.vel_ms > 0 && S.vmax_ms > 0 && S.vmax_ms <= S.vel_ms ? '<div class="adv">⚠ La velocidad máxima debe ser mayor que la media: revise.</div>' : ""}` : ""}
      <div class="fila">${campo("Inicio de la toma", r + ".hora_ini", "h", S.hora_ini, 'data-re="1"')}${campo("Fin de la toma", r + ".hora_fin", "h", S.hora_fin)}</div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin:.3rem 0"><button class="b g p" data-ahoram="${s.k}|hora_ini">Empecé ahora</button><button class="b g p" data-ahoram="${s.k}|hora_fin">Terminé ahora</button></div>
      ${W.length ? `<div class="adv">⚠ ${W.join(" · ")}</div>` : ""}
      ${s.k === "vertimiento" ? vertimientoHtml(S, r) : (s.k === "mezcla" ? mezclaHtml(S, r) : "") + meteoHtml(s, S, r, MA)}
      ${fotosHtml("muestreo", "m:" + s.k, ["Sitio de muestreo", "Toma de la muestra", "Lectura de la sonda", "Otra"])}
      ${campo("Notas de este sitio", r + ".notas", "t", S.notas)}</details>`;
  }).join("");
  $("t-mue").innerHTML = `<h2>Toma de muestras de calidad</h2>
    <p class="nota">Cuatro puntos en el <b>orden del flujo</b>: aguas arriba → vertimiento → zona de mezcla → aguas abajo. Para seguir la <b>misma masa de agua</b>, tome cada muestra después del tiempo de viaje del sitio anterior (nunca antes del primer arribo del ensayo de trazadores). Esta es la bitácora de campo de la campaña <b>${esc(c.nombre)}</b>; las medidas con sonda y los frascos van en sus formatos de campo.</p>
    <div class="fila">${campo("DF supuesto — se usa solo si no hay velocidad media y máxima en los sitios", "muestreo.df", "n", M.df, AY("df", true))}</div>
    ${c.puntos.length ? selectorFondo() + '<div id="mapa-caja">' + mapaSVG() + "</div>" : ""}
    ${sit}`;
  document.querySelectorAll("details[data-sitio]").forEach(d => d.addEventListener("toggle", () => { d.open ? ABIERTOS_M.add(d.dataset.sitio) : ABIERTOS_M.delete(d.dataset.sitio); }));
  document.querySelectorAll("[data-pm]").forEach(sl => sl.onchange = () => { sitioM(sl.dataset.pm).punto_id = sl.value || null; guardar(); pintarMuestreo(); });
  const crear = (k, lat, lon, acc, alt, altAcc) => { const s = SITIOS_M.find(x => x.k === k); const p = {id: pid(), nombre: s.corto, rol: s.rol || "muestreo", lat, lon, acc: acc === null ? null : Math.round(acc), alt_gps: alt ?? null, alt_acc: altAcc ?? null, cota: alt != null ? Math.round(alt * 10) / 10 : null, cota_origen: alt != null ? "gps" : null, hora_iso: new Date().toISOString(), notas: "", hid: {}}; let pos = -1; const orden = SITIOS_M.map(x => x.k), idx = orden.indexOf(k);
    for (let j = idx - 1; j >= 0 && pos < 0; j--) { const q = punto(sitioM(orden[j]).punto_id), ii = q ? c.puntos.indexOf(q) : -1; if (ii >= 0) pos = ii + 1; }
    for (let j = idx + 1; j < orden.length && pos < 0; j++) { const q = punto(sitioM(orden[j]).punto_id), ii = q ? c.puntos.indexOf(q) : -1; if (ii >= 0) pos = ii; }
    if (pos < 0) c.puntos.push(p); else c.puntos.splice(pos, 0, p); sitioM(k).punto_id = p.id; guardar(); pintarMuestreo(); };
  document.querySelectorAll("[data-mnuevo]").forEach(b => b.onclick = async () => {
    const [k, modo] = b.dataset.mnuevo.split("|");
    if (modo === "man") { const t = prompt("Latitud, longitud en grados decimales (p. ej. 4.53596, -74.54319):"); if (!t) return; const m = parseCoord(t); if (!m || Math.abs(m[0]) > 90 || Math.abs(m[1]) > 180) return alert("No se entendió. Escriba: latitud, longitud (p. ej. 4.53596, -74.54319)."); return crear(k, m[0], m[1], null); }
    try { b.disabled = true; b.textContent = "Midiendo… quédese quieto"; const r = await fijarPunto(DB.ajustes.seg_promedio); crear(k, r.lat, r.lon, r.acc, r.alt, r.altAcc); } catch (e) { alert(e.message); pintarMuestreo(); } });
  document.querySelectorAll("[data-mreub]").forEach(b => b.onclick = async () => { try { b.disabled = true; b.textContent = "Midiendo… quédese quieto"; const r = await fijarPunto(DB.ajustes.seg_promedio), p = c.puntos[+b.dataset.mreub]; p.lat = r.lat; p.lon = r.lon; p.acc = Math.round(r.acc); p.alt_gps = r.alt; p.alt_acc = r.altAcc; if (r.alt != null && p.cota_origen !== "manual") { p.cota = Math.round(r.alt * 10) / 10; p.cota_origen = "gps"; } guardar(); pintarMuestreo(); } catch (e) { alert(e.message); pintarMuestreo(); } });
  document.querySelectorAll("[data-musaralt]").forEach(b => b.onclick = () => { const p = c.puntos[+b.dataset.musaralt]; p.cota = Math.round(p.alt_gps * 10) / 10; p.cota_origen = "gps"; guardar(); pintarMuestreo(); });
  document.querySelectorAll("[data-ahoram]").forEach(b => b.onclick = () => { const [k, campoH] = b.dataset.ahoram.split("|"), S = sitioM(k); S[campoH] = horaTxt(new Date()); const s = SITIOS_M.find(x => x.k === k); evento((campoH === "hora_ini" ? "Inicio de toma de muestra en " : "Fin de toma de muestra en ") + s.n.slice(4)); pintarMuestreo(); });
  document.querySelectorAll("[data-meadd]").forEach(b => b.onclick = () => { const S = sitioM(b.dataset.meadd), u = S.meteo[S.meteo.length - 1]; S.meteo.push(lecturaVacia(u)); guardar(); pintarMuestreo(); });
  document.querySelectorAll("[data-medel]").forEach(b => b.onclick = () => { const [k, n] = b.dataset.medel.split("|"); sitioM(k).meteo.splice(+n, 1); guardar(); pintarMuestreo(); });
  document.querySelectorAll("[data-tuse]").forEach(b => b.onclick = () => { const [k, t] = b.dataset.tuse.split("|"), S = sitioM(k), x = PT[k] && PT[k][t]; if (!x) return; S.t_viaje_min = Math.round(x.min * 10) / 10; S.t_origen = t === "A" ? "con trazadores (elegido)" : "con las secciones (elegido)"; S.t_auto = false; guardar(); pintarMuestreo(); });
  document.querySelectorAll("[data-mzadd]").forEach(b => b.onclick = () => { sitioM("mezcla").mezcla.verticales.push({pos: "Punto " + (sitioM("mezcla").mezcla.verticales.length + 1), ec: null}); guardar(); pintarMuestreo(); });
  document.querySelectorAll("[data-mzdel]").forEach(b => b.onclick = () => { sitioM("mezcla").mezcla.verticales.splice(+b.dataset.mzdel, 1); guardar(); pintarMuestreo(); });
  actualizarMuestreo();
}
function actualizarMuestreo() {            // cada segundo: cuenta regresiva de la hora sugerida y aviso con sonido 2 min antes
  const M = mue(); M.avisos = M.avisos || {};
  SITIOS_M.forEach(s => {
    if (SITIOS_VENTANA.includes(s.k)) {
      const T = textoVentana(s.k), e = enAct("sug-" + s.k) || $("sug-" + s.k); if (e) e.innerHTML = `<div class="card" style="margin:.3rem 0;border-left:5px solid ${T.dI > 0 || !T.V.ini ? "var(--az)" : T.dF > 0 ? "var(--ok)" : "var(--ro)"}">${T.html}</div>`;
      if (T.V.ini && !sitioM(s.k).hora_ini && T.dI <= 120 && T.dF > 0 && !M.avisos[s.k]) { M.avisos[s.k] = true; guardar(true); avisar(`${T.dI > 0 ? "En " + Math.ceil(T.dI / 60) + " min abre" : "Ya abrió"} el intervalo para muestrear «${s.n.slice(4)}»`); }
      return;
    }
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
  return {df: M.df, sitios: SITIOS_M.map(s => { const S = sitioM(s.k), p = punto(S.punto_id); return {clave: s.k, nombre: s.n.slice(4), ...S, punto: p ? p.nombre : null}; })};
}
function muestreoImport(m) {
  if (!m) return undefined; const M = {df: m.df, sitios: {}};
  (m.sitios || []).forEach(s => { const {clave, nombre, punto: _p, ...r} = s; M.sitios[clave] = r; }); return M;
}
function combinarMuestreo(a, b) {
  const vacio = v => v === null || v === undefined || v === ""; let n = 0;
  if (!b) return 0; if (!a.muestreo) { a.muestreo = b; return 1; }
  const M = a.muestreo;
  Object.entries(b.sitios || {}).forEach(([k, sb]) => {
    const sa = M.sitios[k]; if (!sa) { M.sitios[k] = sb; n++; return; }
    ["punto_id", "hora_ini", "hora_fin", "t_viaje_min", "t_origen", "dist_m", "vel_ms", "vmax_ms", "lluvia24", "q_ls", "metodo_q", "notas"].forEach(x => { if (vacio(sa[x]) && !vacio(sb[x])) { sa[x] = sb[x]; n++; } });
    if (sb.mezcla && sa.mezcla && !mezclaCalc(sa.mezcla).listo && mezclaCalc(sb.mezcla).listo) { sa.mezcla = sb.mezcla; n++; }
    (sb.meteo || []).filter(lecturaConDatos).forEach(mb => { if (!(sa.meteo || (sa.meteo = [])).some(m => m.hora === mb.hora)) { sa.meteo.push(mb); n++; } }); sa.meteo.sort((x, y) => (x.hora || "") < (y.hora || "") ? -1 : 1);
  });
  return n;
}
function muestreoCsv() {                    // filas para el .csv de «Guardar»: datos del sitio y una fila por lectura hidroclimatológica
  const c = C(); if (!c.muestreo) return []; const M = c.muestreo;
  const L = [[], ["MUESTREO DE CALIDAD"],
    ["Sitio", "Punto", "Latitud", "Longitud", "Precisión (m)", "Cota (m)", "Inicio", "Fin", "Tiempo de viaje (min)", "Origen del tiempo de viaje", "Intervalo misma masa de agua", "Velocidad media (m/s)", "Velocidad máxima (m/s)", "Lluvia 24 h", "Caudal vertimiento (L/s)", "Método de aforo", "Mezcla: variación (%)", "Mezcla: ¿completa?", "Notas"]];
  SITIOS_M.forEach(s => { const S = sitioM(s.k), p = punto(S.punto_id) || {}, mz = s.k === "mezcla" ? mezclaCalc(S.mezcla) : null; L.push([s.n.slice(4), p.nombre, p.lat, p.lon, p.acc, p.cota, S.hora_ini, S.hora_fin, S.t_viaje_min, S.t_origen, SITIOS_VENTANA.includes(s.k) && ventanaM(s.k).ini ? horaTxt(ventanaM(s.k).ini).slice(0, 5) + "–" + horaTxt(ventanaM(s.k).fin).slice(0, 5) : "", S.vel_ms, S.vmax_ms, S.lluvia24, S.q_ls, S.metodo_q, mz && mz.listo ? mz.pct.toFixed(1) : "", mz && mz.listo ? (mz.ok ? "sí" : "no") : "", S.notas]); });
  L.push([], ["HIDROCLIMATOLOGÍA", "Fecha", "Sitio", "Hora", "T aire (°C)", "HR (%)", "T rocío (°C)", "Viento (m/s)", "Altura del viento (m)", "Nubosidad (%)", "Sombra (%)", "Radiación (W/m2)"]);
  SITIOS_M.forEach(s => sitioM(s.k).meteo.filter(lecturaConDatos).forEach(m => { const d = rocioM(m.t_aire, m.hr); L.push(["", c.fecha, s.n.slice(4), m.hora, m.t_aire, m.hr, d === null ? "" : d.toFixed(1), m.viento, m.h_viento, m.nub_pct, m.sombra_pct, m.rad]); }));
  return L;
}
document.addEventListener("change", ev => { const r = ev.target.dataset && ev.target.dataset.r; if (r && /\.mezcla\.dist_m$/.test(r)) { const Z = sitioM("mezcla").mezcla; Z.dist_auto = false; guardar(); } });
document.addEventListener("change", ev => { const r = ev.target.dataset && ev.target.dataset.r, m = r && r.match(/^muestreo\.sitios\.(\w+)\.t_viaje_min$/); if (m) { const S = sitioM(m[1]); S.t_auto = false; S.t_origen = "escrito a mano"; guardar(); } });
