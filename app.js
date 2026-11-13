"use strict";
// Campo · trazadores: app autónoma (sin servidor). Datos en el teléfono (localStorage); se exportan a JSON / CSV / GPX / KML.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const nf = (v, d = 1) => v === null || v === undefined || !isFinite(v) ? "—" : Number(v).toLocaleString("es-CO", {minimumFractionDigits: d, maximumFractionDigits: d});
const pad = n => String(n).padStart(2, "0");
const horaTxt = f => pad(f.getHours()) + ":" + pad(f.getMinutes()) + ":" + pad(f.getSeconds());
const ROLES = [["inyeccion", "Inyección del trazador"], ["monitoreo", "Estación de monitoreo"], ["vertimiento", "Vertimiento"], ["afluente", "Afluente"], ["muestreo", "Sitio de muestreo de calidad"], ["otro", "Otro"]];
const PARAM0 = {tipo_inyeccion: 1, mult_pico: 10, dec_min: 30, k: 0.5, pureza: 0.95, f_seguridad: 1.5, solubilidad_g_l: 250, alpha_t: 0.6};
const AJ0 = {acc_max: 20, paso_min: 3, seg_promedio: 10, fondo: "calle"};

// números escritos a mano: acepta punto o coma decimal (null si está vacío, NaN si no es un número)
function num(v) { const t = String(v ?? "").trim().replace(/\s/g, "").replace(",", "."); if (t === "") return null; const n = Number(t); return isFinite(n) ? n : NaN; }
// ------------------------------------------------------------------ geometría
const R_T = 6371008.8, rad = g => g * Math.PI / 180;
function hav(a, b) { const dl = rad(b[0] - a[0]), dn = rad(b[1] - a[1]), x = Math.sin(dl / 2) ** 2 + Math.cos(rad(a[0])) * Math.cos(rad(b[0])) * Math.sin(dn / 2) ** 2; return 2 * R_T * Math.asin(Math.sqrt(x)); }
const longitud = pts => pts.reduce((s, p, i) => i ? s + hav(pts[i - 1], p) : 0, 0);

// ------------------------------------------------------------------ cálculo del ensayo (Fischer et al. 1979; mismo cálculo de la plataforma)
const G = 9.81, C_FISCHER = 0.011;
function programar(est, P) {
  if (!est.length) throw new Error("Se necesita al menos una estación de monitoreo aguas abajo de la inyección.");
  for (const k of ["mult_pico", "dec_min", "k", "pureza", "f_seguridad", "solubilidad_g_l", "alpha_t"]) if (!(P[k] > 0)) throw new Error("El parámetro «" + k + "» debe ser mayor que 0.");
  if (P.pureza > 1) throw new Error("La pureza debe estar entre 0 y 1.");
  const coef = P.tipo_inyeccion === 1 ? 0.4 : 0.1, out = [], adv = [];
  let varAc = 0, tAc = 0, xPrev = 0;
  for (const e of est) {
    const nom = e.nombre || "Estación", etq = {x_m: "la distancia", q_m3s: "el caudal", ancho_m: "el ancho", prof_m: "la profundidad", pendiente: "la pendiente"};
    for (const k of Object.keys(etq)) if (!(e[k] > 0)) throw new Error("«" + nom + "»: falta " + etq[k] + (k === "x_m" ? " (escriba la distancia o mídala en «Puntos»)." : "."));
    if (e.x_m <= xPrev) throw new Error("La distancia de «" + nom + "» (" + nf(e.x_m, 0) + " m) debe ser mayor que la de la anterior (" + nf(xPrev, 0) + " m).");
    const u = e.q_m3s / (e.ancho_m * e.prof_m), uEst = Math.sqrt(G * e.prof_m * e.pendiente);
    const dEst = C_FISCHER * u * u * e.ancho_m * e.ancho_m / (e.prof_m * uEst), DL = e.d_l_medido > 0 ? e.d_l_medido : dEst;
    const dx = e.x_m - xPrev, tTramo = e.tiempo_tramo_s > 0 ? e.tiempo_tramo_s : dx / u, uTr = dx / tTramo;
    varAc += 2 * DL * dx / Math.pow(uTr, 3); tAc += tTramo;
    const sigma = Math.sqrt(varAc), epsT = P.alpha_t * e.prof_m * uEst, lMez = coef * u * e.ancho_m * e.ancho_m / epsT;
    const ruido = Number(e.ruido) || 0, dec = Math.max(P.mult_pico * ruido, P.dec_min), dc = dec * P.k;
    const masaG = dc * e.q_m3s * Math.sqrt(2 * Math.PI) * sigma, masaKg = masaG / P.pureza * P.f_seguridad / 1000;
    if (e.x_m < lMez) adv.push("«" + nom + "» queda a " + nf(e.x_m, 0) + " m de la inyección y la mezcla completa necesita " + nf(lMez, 0) + " m: aléjela, inyecte en el centro o mida en varias verticales.");
    out.push({id: e.id, nombre: nom, x_m: e.x_m, u, DL, t_pico_s: tAc, t_pico_min: tAc / 60, varianza: varAc, sigma, l_mezcla_m: lMez, mezcla_ok: e.x_m >= lMez, dec_objetivo: dec, masa_kg: masaKg, q: e.q_m3s, ruido});
    xPrev = e.x_m;
  }
  const masa = Math.max(...out.map(s => s.masa_kg));
  for (const s of out) {
    s.dec_esperado = masa * 1000 * P.pureza / (s.q * Math.sqrt(2 * Math.PI) * s.sigma) / P.k;
    s.pico_ruido = s.ruido > 0 ? s.dec_esperado / s.ruido : null;
    s.ini_min = Math.max(0, (s.t_pico_s - 4 * s.sigma) / 60); s.fin_min = (s.t_pico_s + 8 * s.sigma) / 60;
    if (s.pico_ruido !== null && s.pico_ruido < 5) adv.push("En «" + s.nombre + "» el pico esperado es solo " + nf(s.pico_ruido, 1) + " veces el ruido (se recomienda más de 5): suba la masa o acerque la estación.");
  }
  return {est: out, masa_kg: masa, agua_l: masa * 1000 / P.solubilidad_g_l, adv};
}

// ------------------------------------------------------------------ estado
const LS = "ccp-campo-v1";
let DB = (() => { try { const t = localStorage.getItem(LS); if (t) return JSON.parse(t); } catch (e) {} return {campanas: [], activa: null, ajustes: {...AJ0}}; })();
DB.ajustes = {...AJ0, ...(DB.ajustes || {})};
let AVISO_GUARDADO = false;
function guardar(sinMod) { if (!sinMod) { const c0 = DB.campanas.find(x => x.id === DB.activa); if (c0) c0.mod = Date.now(); } try { localStorage.setItem(LS, JSON.stringify(DB)); AVISO_GUARDADO = false; } catch (e) { if (!AVISO_GUARDADO) { AVISO_GUARDADO = true; alert("No se pudo guardar en el teléfono (modo privado o sin espacio). Exporte el archivo ahora desde «Guardar»."); } } }
function nueva(nombre) {
  const f = new Date();
  return {id: "c" + f.getTime().toString(36), nombre: nombre || "Campaña " + f.toISOString().slice(0, 10), fecha: f.toISOString().slice(0, 10), responsable: "", cuadrilla: "", clima: "", observaciones: "",
    puntos: [], tramos: [], inyeccion: {masa_kg: null, pureza: PARAM0.pureza, agua_l: null, hora: "", t0_iso: null, sal: "", tipo: 1}, params: {...PARAM0}, registros: {}, aforos: [], eventos: [], programacion: null};
}
if (!DB.campanas.length) { const c = nueva(); DB.campanas.push(c); DB.activa = c.id; guardar(); }
const C = () => DB.campanas.find(c => c.id === DB.activa) || DB.campanas[0];
const pid = () => "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
const punto = id => C().puntos.find(p => p.id === id);

// distancias: puntos en el orden del río (aguas arriba → aguas abajo); cada par consecutivo usa la distancia real escrita o medida en el mapa; si no hay, la línea recta
function tramoEntre(a, b) { const T = C().tramos.filter(t => (t.de === a && t.a === b) || (t.de === b && t.a === a)); return T.length ? T[T.length - 1] : null; }
function enlaces() {
  const P = C().puntos, L = [];
  for (let i = 1; i < P.length; i++) {
    const t = tramoEntre(P[i - 1].id, P[i].id), recta = hav([P[i - 1].lat, P[i - 1].lon], [P[i].lat, P[i].lon]);
    if (t && t.manual_m > 0) L.push({d: t.manual_m, origen: t.origen === "mapa" ? "medida en el mapa" : "escrita", recta});
    else if (isFinite(recta)) L.push({d: recta, origen: "línea recta", recta}); else L.push({d: null, origen: "sin dato", recta: null});
  }
  return L;
}
function abscisas() { const L = enlaces(); let s = 0; return C().puntos.map((p, i) => { if (i) s = s === null || L[i - 1].d === null ? null : s + L[i - 1].d; return s; }); }
function estaciones() {
  const P = C().puntos, A = abscisas(), ii = P.findIndex(p => p.rol === "inyeccion");
  if (ii < 0) return [];
  return P.map((p, i) => ({p, i})).filter(({p, i}) => i > ii && p.rol === "monitoreo").map(({p, i}) => ({id: p.id, nombre: p.nombre, x_m: A[i] === null || A[ii] === null ? null : A[i] - A[ii], q_m3s: p.hid?.q_ls > 0 ? p.hid.q_ls / 1000 : null, ancho_m: p.hid?.ancho_m, prof_m: p.hid?.prof_m,
    pendiente: p.hid?.pendiente, ec_fondo: p.hid?.ec_fondo, ruido: p.hid?.ruido ?? 3, tiempo_tramo_s: p.hid?.tiempo_tramo_s, d_l_medido: p.hid?.d_l}));
}

// ------------------------------------------------------------------ GPS
let watchId = null, ULT = null, SEGURA = window.isSecureContext && "geolocation" in navigator, WAKE = null;
const oyentes = [];
function iniciarGPS() {
  if (!SEGURA) { alert("Este navegador no da el GPS en esta dirección: la app debe abrirse con https:// (o instalada). Mientras tanto puede escribir las coordenadas a mano."); return false; }
  if (watchId !== null) return true;
  watchId = navigator.geolocation.watchPosition(onFix, e => { $("gps-est").textContent = "GPS: " + (e.code === 1 ? "permiso denegado (active la ubicación para este sitio)" : "sin señal (" + e.message + ")"); }, {enableHighAccuracy: true, maximumAge: 0, timeout: 30000});
  pedirPantalla(); pintarGPS(); return true;
}
function detenerGPS() { if (watchId !== null) navigator.geolocation.clearWatch(watchId); watchId = null; soltarPantalla(); pintarGPS(); }
async function pedirPantalla() { try { if ("wakeLock" in navigator && !WAKE) { WAKE = await navigator.wakeLock.request("screen"); WAKE.addEventListener("release", () => { WAKE = null; }); } } catch (e) {} }
function soltarPantalla() { try { WAKE && WAKE.release(); } catch (e) {} WAKE = null; }
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && watchId !== null) pedirPantalla(); });
function onFix(pos) {
  ULT = {lat: pos.coords.latitude, lon: pos.coords.longitude, acc: pos.coords.accuracy, alt: pos.coords.altitude, altAcc: pos.coords.altitudeAccuracy, t: pos.timestamp};
  pintarGPS(); oyentes.slice().forEach(f => f(ULT));
}
function pintarGPS() {
  const e = $("gps-est"), b = $("gps-btn");
  if (!SEGURA) e.textContent = "GPS no disponible aquí (se necesita https://): escriba las coordenadas a mano";
  else if (watchId === null) e.textContent = "GPS apagado";
  else if (!ULT) e.textContent = "GPS buscando señal…";
  else { const ok = ULT.acc <= 10 ? "🟢" : ULT.acc <= 25 ? "🟡" : "🔴"; e.textContent = ok + " ±" + Math.round(ULT.acc) + " m · " + ULT.lat.toFixed(5) + ", " + ULT.lon.toFixed(5); }
  b.innerHTML = SEGURA ? `<button class="b g p" id="gps-tog">${watchId === null ? "Encender GPS" : "Apagar GPS"}</button>` : "";
  if ($("gps-tog")) $("gps-tog").onclick = () => watchId === null ? iniciarGPS() : detenerGPS();
}
function altitud(fx) { const a = fx.filter(f => f.alt != null && isFinite(f.alt)); return a.length ? {alt: a.reduce((s, f) => s + f.alt, 0) / a.length, altAcc: Math.min(...a.map(f => f.altAcc ?? 99))} : {alt: null, altAcc: null}; }
function fijarPunto(seg) {      // promedia los fixes de unos segundos (media ponderada por 1/precisión²)
  return new Promise((res, rej) => {
    if (!iniciarGPS()) return rej(new Error("Sin GPS"));
    const fx = [], fin = Date.now() + seg * 1000, cb = f => fx.push({...f});
    oyentes.push(cb);
    const tic = setInterval(() => { const q = Math.max(0, Math.ceil((fin - Date.now()) / 1000)); const bt = $("pt-fijar"); if (bt) bt.textContent = "Midiendo… " + q + " s (quédese quieto)"; if (Date.now() >= fin) { clearInterval(tic); oyentes.splice(oyentes.indexOf(cb), 1); if (!fx.length && ULT && Date.now() - ULT.t < 15000) fx.push({...ULT}); if (!fx.length) return rej(new Error("No llegó ninguna lectura del GPS: espere a tener señal e intente de nuevo.")); const w = fx.map(f => 1 / Math.max(f.acc, 1) ** 2), sw = w.reduce((a, b) => a + b, 0); res({lat: fx.reduce((s, f, i) => s + f.lat * w[i], 0) / sw, lon: fx.reduce((s, f, i) => s + f.lon * w[i], 0) / sw, acc: Math.min(...fx.map(f => f.acc)), n: fx.length, ...altitud(fx)}); } }, 500);
  });
}

// ------------------------------------------------------------------ aviso de respaldo: lo escrito vive solo en este navegador; el archivo .json es la copia real
function pintarResp() {
  const e = $("resp"); if (!e) return; const c = C(), hay = c.puntos.length || c.eventos.length || c.aforos.length || c.inyeccion.masa_kg || c.muestreo, sin = hay && c.mod && (!c.exp || c.mod > c.exp);
  e.style.display = sin ? "flex" : "none";
  if (sin) e.innerHTML = `<span>⚠ Cambios sin respaldar${c.exp ? " desde las " + new Date(c.exp).toLocaleTimeString("es-CO", {hour: "2-digit", minute: "2-digit"}) : " (nunca se ha respaldado)"}. Si borra la app o los datos del navegador se pierden.</span><button class="b p" id="resp-ir">Respaldar</button>`;
  if ($("resp-ir")) $("resp-ir").onclick = () => { TAB = "exp"; mostrar(); };
}
setInterval(pintarResp, 15000);
// ------------------------------------------------------------------ pestañas
let TAB = "pun";
document.querySelectorAll("#nav button").forEach(b => b.onclick = () => { TAB = b.dataset.t; mostrar(); });
function mostrar() {
  document.querySelectorAll("#nav button").forEach(x => x.classList.toggle("on", x.dataset.t === TAB));
  document.querySelectorAll("main section").forEach(s => s.classList.toggle("on", s.id === "t-" + TAB));
  ({pun: pintarPuntos, prog: pintarProg, camp: pintarCampana, mue: () => pintarMuestreo(), exp: pintarGuardar})[TAB](); refreshMapa(); pintarResp();
}
function pintarCabecera() {
  $("sel-camp").innerHTML = DB.campanas.map(c => `<option value="${c.id}"${c.id === DB.activa ? " selected" : ""}>${esc(c.nombre)}</option>`).join("") + '<option value="__nueva">+ Nueva campaña…</option>';
}
$("sel-camp").onchange = ev => { if (ev.target.value === "__nueva") { const n = prompt("Nombre de la nueva campaña (p. ej. el proyecto y la fecha):"); if (n) { const c = nueva(n); DB.campanas.push(c); DB.activa = c.id; guardar(); } } else { DB.activa = ev.target.value; guardar(); } pintarCabecera(); mostrar(); };

// edición genérica: data-r="ruta.con.puntos" (los índices de arreglos son números); data-t="n" numérico
function fijar(obj, ruta, v) { const k = ruta.split("."); let o = obj; for (let i = 0; i < k.length - 1; i++) o = o[k[i]]; o[k[k.length - 1]] = v; }
document.addEventListener("change", ev => {
  const el = ev.target, r = el.dataset && el.dataset.r; if (!r) return;
  const v = el.dataset.t === "n" ? num(el.value) : el.value;
  if (Number.isNaN(v)) { el.style.borderColor = "var(--ro)"; el.title = "Escriba un número (con punto o con coma)"; return; }
  el.style.borderColor = ""; el.title = "";
  fijar(C(), r, v); if (/\.cota$/.test(r)) fijar(C(), r.replace(/cota$/, "cota_origen"), "manual"); guardar();
  if (el.dataset.re) mostrar();
});
const inp = (ruta, tipo, valor, extra = "") => `<input data-r="${ruta}" ${tipo === "n" ? 'data-t="n" type="text" inputmode="text" autocomplete="off" autocapitalize="off" spellcheck="false"' : tipo === "h" ? 'type="time" step="1"' : tipo === "f" ? 'type="date"' : 'type="text"'} value="${valor === null || valor === undefined ? "" : (typeof valor === "number" ? Number(valor.toPrecision(7)) : esc(valor))}" ${extra}>`;
const campo = (t, ruta, tipo, valor, extra) => `<label>${t}${inp(ruta, tipo, valor, extra)}</label>`;

// ------------------------------------------------------------------ mapa: proyección Web Mercator centrada; fondo de calle o satélite si hay internet (si no, solo puntos)
const FONDOS = {calle: {t: "Calle (OpenStreetMap)", url: (z, x, y) => `https://tile.openstreetmap.org/${z}/${x}/${y}.png`, atr: "© OpenStreetMap", zmax: 19}, satelite: {t: "Satélite (Esri)", url: (z, x, y) => `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`, atr: "Imágenes © Esri", zmax: 17}};
const mercator = (lat, lon) => [(lon + 180) / 360, 0.5 - Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2)) / (2 * Math.PI)];
let MAPA_INFO = "";
// niveles de imagen que Esri tiene en cada lugar: se consulta su servicio «tilemap» (del 19 hacia abajo) y se recuerda
DB.zm = DB.zm || {}; const SONDEANDO = new Set();
function zMaxEsri(cx, cy) {
  const k = Math.floor(cx * 1024) + "_" + Math.floor(cy * 1024);
  if (DB.zm[k] != null) return DB.zm[k];
  if (!SONDEANDO.has(k) && navigator.onLine !== false) {
    SONDEANDO.add(k);
    (async () => { let z = 19, hallado = null; try { for (; z >= 10; z--) { const r = await fetch(`https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tilemap/${z}/${Math.floor(cy * 2 ** z)}/${Math.floor(cx * 2 ** z)}/1/1?f=json`); const d = await r.json(); if (d.data && d.data[0] === 1) { hallado = z; break; } } } catch (e) { hallado = null; }
      SONDEANDO.delete(k); if (hallado !== null) { DB.zm[k] = hallado; guardar(); refreshMapa(); } })();
  }
  return 17;
}
// Las pestañas comparten los mismos ids y las ocultas conservan su contenido: se busca siempre dentro de la pestaña visible
const enAct = id => document.querySelector("section.on #" + id);
function refreshMapa() { const el = enAct("mapa-caja"); if (el) el.innerHTML = mapaSVG(); }
document.addEventListener("click", ev => { const id = ev.target.id; if (!["mz-menos", "mz-mas", "mz-ajustar"].includes(id)) return; const k = DB.ajustes.zoomMapa || 0; DB.ajustes.zoomMapa = id === "mz-mas" ? Math.min(6, k + 1) : id === "mz-menos" ? Math.max(-4, k - 1) : 0; guardar(); refreshMapa(); });
let FALLAS = 0;
function fondoFalla() { FALLAS++; const n = $("med-nota") || enAct("mapa-nota"); if (n) n.textContent = "⚠ No cargó el fondo del mapa: revise la conexión a internet, o cambie a «Sin fondo». (Sin internet solo se ven los puntos.)"; }
function fondoOk() { const n = $("med-nota") || enAct("mapa-nota"); if (n && FALLAS) { FALLAS = 0; n.textContent = ""; } }
function selectorFondo() { return `<label style="margin:.3rem 0">Fondo del mapa<select id="mapa-fondo"><option value="ninguno">Sin fondo (funciona sin internet)</option>${Object.entries(FONDOS).map(([k, f]) => `<option value="${k}"${DB.ajustes.fondo === k ? " selected" : ""}>${f.t}</option>`).join("")}</select></label><div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin:.3rem 0"><button class="b g p" id="mz-menos" aria-label="Alejar">−</button><button class="b g p" id="mz-mas" aria-label="Acercar">+</button><button class="b g p" id="mz-ajustar">Ajustar a los puntos</button><span class="nota" id="mapa-info"></span></div><div class="nota" id="mapa-nota">${DB.ajustes.fondo !== "ninguno" && navigator.onLine === false ? "⚠ Sin internet: no se ve el fondo, solo los puntos." : ""}</div>`; }
document.addEventListener("change", ev => { if (ev.target.id === "mapa-fondo") { DB.ajustes.fondo = ev.target.value; guardar(); refreshMapa(); } });
function teselas(cx, cy, sc, W, H) {                                  // teselas del fondo que cubren la vista (cx, cy: centro en coordenadas de mundo; sc: px por unidad de mundo)
  const fondo = FONDOS[DB.ajustes.fondo]; let s = ""; if (!fondo) { MAPA_INFO = ""; return s; }
  const X = u => W / 2 + (u - cx) * sc, Y = u => H / 2 + (u - cy) * sc;
    const zmx = DB.ajustes.fondo === "satelite" ? zMaxEsri(cx, cy) : fondo.zmax;
    let z = Math.max(0, Math.min(zmx, Math.round(Math.log2(sc / 256)) + 1)), n = 2 ** z;      // +1: teselas más nítidas en pantallas de alta densidad
    MAPA_INFO = "Imagen nivel " + z + (z >= zmx ? " (máximo disponible en este lugar: " + zmx + ")" : " de " + zmx + " disponibles");
    const tx0 = Math.floor((cx - W / 2 / sc) * n), tx1 = Math.floor((cx + W / 2 / sc) * n), ty0 = Math.max(0, Math.floor((cy - H / 2 / sc) * n)), ty1 = Math.min(n - 1, Math.floor((cy + H / 2 / sc) * n));
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 60) for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) s += `<image href="${fondo.url(z, ((tx % n) + n) % n, ty)}" x="${X(tx / n).toFixed(1)}" y="${Y(ty / n).toFixed(1)}" width="${(sc / n + 0.6).toFixed(1)}" height="${(sc / n + 0.6).toFixed(1)}" preserveAspectRatio="none" onerror="fondoFalla()" onload="fondoOk()"/>`;
  return s;
}
function mapaSVG() {
  const c = C(), P = c.puntos.filter(p => isFinite(p.lat) && isFinite(p.lon)), tr = c.tramos.filter(t => t.linea && t.linea.length > 1);
  if (!P.length && !ULT) return '<p class="nota">El mapa aparece cuando haya puntos.</p>';
  const W = 600, H = 400, pad = 46, fondo = FONDOS[DB.ajustes.fondo];
  const todos = [...P.map(p => [p.lat, p.lon]), ...tr.flatMap(t => t.linea), ...(ULT ? [[ULT.lat, ULT.lon]] : [])].map(p => mercator(p[0], p[1]));
  const latC = todos.length ? P.length ? P[0].lat : ULT.lat : 0, mPorU = 40075016.686 * Math.cos(rad(latC));           // metros por unidad de mundo
  let x0 = Math.min(...todos.map(p => p[0])), x1 = Math.max(...todos.map(p => p[0])), y0 = Math.min(...todos.map(p => p[1])), y1 = Math.max(...todos.map(p => p[1]));
  const minU = 60 / mPorU, dx = Math.max(x1 - x0, minU), dy = Math.max(y1 - y0, minU), sc = Math.min((W - 2 * pad) / dx, (H - 2 * pad) / dy) * 2 ** (DB.ajustes.zoomMapa || 0), cxF = (x0 + x1) / 2, cyF = (y0 + y1) / 2, mU = ULT && (DB.ajustes.zoomMapa || 0) > 0 ? mercator(ULT.lat, ULT.lon) : null, cx = mU ? mU[0] : cxF, cy = mU ? mU[1] : cyF;      // al acercar con el GPS encendido, la vista sigue su posición   // px por unidad de mundo
  const X = u => W / 2 + (u - cx) * sc, Y = u => H / 2 + (u - cy) * sc, pt = (lat, lon) => { const m = mercator(lat, lon); return [X(m[0]), Y(m[1])]; };
  let s = `<svg class="mapa" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de los puntos"><rect width="${W}" height="${H}" fill="#eef1f7"/>`;
  s += teselas(cx, cy, sc, W, H);
  const lin = ps => ps.map((p, i) => { const q = pt(p[0], p[1]); return (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("");
  for (let i = 1; i < c.puntos.length; i++) { const a = c.puntos[i - 1], b = c.puntos[i]; if (!(tramoEntre(a.id, b.id) || {}).linea && isFinite(a.lat) && isFinite(b.lat)) s += `<path d="${lin([[a.lat, a.lon], [b.lat, b.lon]])}" fill="none" stroke="#fff" stroke-width="5" opacity=".8"/><path d="${lin([[a.lat, a.lon], [b.lat, b.lon]])}" fill="none" stroke="#5b6577" stroke-width="2.5" stroke-dasharray="6 5"/>`; }
  tr.forEach(t => { s += `<path d="${lin(t.linea)}" fill="none" stroke="#fff" stroke-width="6" opacity=".85" stroke-linejoin="round"/><path d="${lin(t.linea)}" fill="none" stroke="#1F3864" stroke-width="3" stroke-linejoin="round"/>`; });
  const col = {inyeccion: "#c0392b", monitoreo: "#1F3864", vertimiento: "#8e44ad", afluente: "#2e8b57", muestreo: "#d35400", otro: "#777"};
  P.forEach(p => { const q = pt(p.lat, p.lon), i = c.puntos.indexOf(p) + 1, der = q[0] < W - 150, tx = der ? q[0] + 11 : q[0] - 11;
    s += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="7" fill="${col[p.rol] || "#777"}" stroke="#fff" stroke-width="2.5"/><text x="${tx.toFixed(1)}" y="${(q[1] - 9).toFixed(1)}" text-anchor="${der ? "start" : "end"}" style="font-size:12px;font-weight:600;paint-order:stroke;stroke:#fff;stroke-width:3.5px;stroke-linejoin:round;fill:#1d2433">${i}. ${esc(p.nombre)}</text>`; });
  if (ULT) { const q = pt(ULT.lat, ULT.lon), r = Math.max(6, ULT.acc * sc / mPorU); s += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${Math.min(r, 60).toFixed(1)}" fill="#2b8cff" opacity=".15"/><circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="6" fill="#2b8cff" stroke="#fff" stroke-width="2.5"/>`; }
  const mPx = mPorU / sc, barra = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find(v => v / mPx >= 70) || 5000, bw = barra / mPx;      // barra de escala
  s += `<rect x="8" y="${H - 34}" width="${bw + 16}" height="26" rx="4" fill="#fff" opacity=".85"/><line x1="16" y1="${H - 14}" x2="${16 + bw}" y2="${H - 14}" stroke="#1d2433" stroke-width="2.5"/><text x="16" y="${H - 19}" style="font-size:11px;fill:#1d2433">${barra >= 1000 ? barra / 1000 + " km" : barra + " m"}</text>`;
  s += `<g><rect x="${W - 34}" y="8" width="26" height="26" rx="4" fill="#fff" opacity=".85"/><text x="${W - 21}" y="28" text-anchor="middle" style="font-size:16px;font-weight:700;fill:#1d2433">N</text></g>`;
  if (fondo) s += `<text x="${W - 6}" y="${H - 6}" text-anchor="end" style="font-size:10px;paint-order:stroke;stroke:#fff;stroke-width:3px;fill:#333">${fondo.atr}</text>`;
  const inf = enAct("mapa-info"); if (inf) inf.textContent = (fondo ? MAPA_INFO : "") + ((DB.ajustes.zoomMapa || 0) ? " · zoom " + (DB.ajustes.zoomMapa > 0 ? "+" : "") + DB.ajustes.zoomMapa : "");
  return s + "</svg>";
}

// ------------------------------------------------------------------ PUNTOS
function parseCoord(t) {
  t = t.trim(); const tok = t.includes(";") ? t.split(";") : (t.split(/\s+/).length === 2 ? t.split(/\s+/) : t.split(","));
  if (tok.length !== 2) return null; const m = tok.map(x => num(x.replace(/[;,]+$/, ""))); return m.some(v => v === null || Number.isNaN(v)) ? null : m;
}
function pendienteEntre(iA, iB) {            // iA aguas arriba, iB aguas abajo: (cota arriba − cota abajo) / distancia por el recorrido
  const c = C(), A = abscisas(), a = c.puntos[iA], b = c.puntos[iB];
  if (!a || !b || a.cota == null || b.cota == null || a.cota_origen === "gps" || b.cota_origen === "gps" || A[iA] === null || A[iB] === null || !(A[iB] - A[iA] > 0)) return null;
  return {s: (a.cota - b.cota) / (A[iB] - A[iA]), dz: a.cota - b.cota, d: A[iB] - A[iA], gps: a.cota_origen === "gps" || b.cota_origen === "gps"};
}
function pendienteGPS(iA, iB) {      // preliminar: con la altitud del GPS. iA aguas arriba, iB aguas abajo
  const c = C(), a = c.puntos[iA], b = c.puntos[iB]; if (!a || !b) return null;
  const A = abscisas(), d = A[iB] !== null && A[iA] !== null ? A[iB] - A[iA] : null; if (!(d > 0)) return null;
  if (a.alt_gps != null && b.alt_gps != null) { const ea = a.alt_acc && a.alt_acc < 99 ? a.alt_acc : 15, eb = b.alt_acc && b.alt_acc < 99 ? b.alt_acc : 15; return {s: (a.alt_gps - b.alt_gps) / d, se: Math.hypot(ea, eb) / d, d, dz: a.alt_gps - b.alt_gps, fuente: "altitud del GPS en los dos puntos"}; }
  return null;
}
function pendientePrelimHtml(iA, iB) {
  if (pendienteEntre(iA, iB)) return ""; const g = pendienteGPS(iA, iB); if (!g) return "";
  return `<div class="nota">Pendiente preliminar con el GPS: <b>${nf(g.s, 4)} ± ${nf(g.se, 4)} m/m</b> (${esc(g.fuente)})${Math.abs(g.s) < 2 * g.se ? ' <b style="color:var(--ro)">— no se distingue de cero</b>' : ""}</div>`;
}
function pintarPuntos() {
  const c = C(), A = abscisas(), L = enlaces();
  const filas = c.puntos.map((p, i) => `<div class="card"><div class="pt"><b>${i + 1}. ${esc(p.nombre)}</b><span><button class="b g p" data-sube="${i}" ${i ? "" : "disabled"}>↑</button> <button class="b g p" data-baja="${i}" ${i < c.puntos.length - 1 ? "" : "disabled"}>↓</button> <button class="b g p" data-q="${i}" style="color:var(--ro)">Quitar</button></span></div>
    <div class="fila" style="margin-top:.4rem">${campo("Nombre", `puntos.${i}.nombre`, "t", p.nombre, 'data-re="1"')}<label>Función<select data-r="puntos.${i}.rol" data-re="1">${ROLES.map(([v, t]) => `<option value="${v}"${p.rol === v ? " selected" : ""}>${t}</option>`).join("")}</select></label>
    ${campo("Latitud", `puntos.${i}.lat`, "n", p.lat, 'data-re="1"')}${campo("Longitud", `puntos.${i}.lon`, "n", p.lon, 'data-re="1"')}${campo("Precisión GPS (m)", `puntos.${i}.acc`, "n", p.acc)}${campo("Cota (m s. n. m.)", `puntos.${i}.cota`, "n", p.cota, 'data-re="1" placeholder="para la pendiente"')}</div>
    ${p.alt_gps != null ? `<div class="nota">Altitud medida por el GPS: <b>${nf(p.alt_gps, 0)} m</b>${p.alt_acc && p.alt_acc < 99 ? " (±" + nf(p.alt_acc, 0) + " m)" : ""}. El GPS da la altura con un error de 10 a 30 m: <b>no sirve para la pendiente de tramos cortos</b>. ${p.cota_origen === "gps" ? "<b>Ya se usa como cota</b>: si tiene una medida mejor, escríbala arriba." : `<button class="b g p" data-usaralt="${i}">Usar como cota</button>`}</div>` : ""}
    ${(() => { const q = i ? pendienteEntre(i - 1, i) : null; return q ? `<div class="nota">Pendiente desde el punto anterior: <b>${nf(q.s, 4)} m/m</b> (desnivel ${nf(q.dz, 2)} m en ${nf(q.d, 0)} m)${q.s <= 0 ? ' <b style="color:var(--ro)">⚠ la cota de este punto debe ser menor que la del anterior</b>' : ""}</div>` : ""; })()}
    ${i ? pendientePrelimHtml(i - 1, i) : ""}
    ${campo("Notas", `puntos.${i}.notas`, "t", p.notas)}
    <div class="nota">${A[i] === null ? "" : "Abscisa desde el primer punto: <b>" + nf(A[i], 0) + " m</b>"}${i ? ` · desde el punto anterior: <b>${nf(L[i - 1].d, 0)} m</b> (${L[i - 1].origen})` : ""}</div>
    ${fotosHtml("punto", p.id, ETQ_PUNTO)}
    <button class="b g p" data-reubicar="${i}" style="margin-top:.3rem">📍 Volver a tomar la ubicación aquí</button></div>`).join("");
  $("t-pun").innerHTML = `<p class="nota">Registre los puntos <b>como los encuentre en campo</b>, en el orden del río (aguas arriba primero). Puede cambiarlos cuando la planificación cambie.</p>
    <div class="card"><div class="fila"><label>Nombre del nuevo punto<input id="pt-nombre" type="text" placeholder="p. ej. Inyección, Estación 1…"></label><label>Función<select id="pt-rol">${ROLES.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label></div>
    <div style="display:flex;gap:.5rem;margin-top:.5rem;flex-wrap:wrap"><button class="b" id="pt-fijar" style="flex:2">📍 Marcar punto aquí (GPS)</button><button class="b g" id="pt-manual" style="flex:1">Escribir coordenadas</button></div>
    <p class="nota">El GPS promedia ${DB.ajustes.seg_promedio} s para mejorar la precisión. Quédese quieto en el punto.</p></div>
    ${c.puntos.length ? "<h2>Mapa</h2>" + selectorFondo() + '<div id="mapa-caja">' + mapaSVG() + "</div><h2>Distancias entre puntos</h2>" + distanciasHtml() : ""}
    <h2>Puntos (${c.puntos.length})</h2>${filas || '<p class="nota">Aún no hay puntos.</p>'}
    <div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="b g p" id="pt-inv">⇅ Invertir el orden</button></div>
    <details class="card"><summary><b>Ajustes del GPS</b></summary><div class="fila" style="margin-top:.4rem"><label>Segundos de promedio por punto<input id="aj-seg" type="text" inputmode="text" value="${DB.ajustes.seg_promedio}"></label></div></details>`;
  const nuevoPunto = (lat, lon, acc, alt, altAcc) => { const nom = $("pt-nombre").value.trim() || "Punto " + (c.puntos.length + 1); const rol = $("pt-rol").value; c.puntos.push({id: pid(), nombre: nom, rol, lat, lon, acc: acc === null ? null : Math.round(acc), alt_gps: alt ?? null, alt_acc: altAcc ?? null, cota: alt != null ? Math.round(alt * 10) / 10 : null, cota_origen: alt != null ? "gps" : null, hora_iso: new Date().toISOString(), notas: "", hid: {}}); guardar(); pintarPuntos(); };
  $("pt-fijar").onclick = async () => { try { $("pt-fijar").disabled = true; const r = await fijarPunto(DB.ajustes.seg_promedio); nuevoPunto(r.lat, r.lon, r.acc, r.alt, r.altAcc); } catch (e) { alert(e.message); pintarPuntos(); } };
  $("pt-manual").onclick = () => { const t = prompt("Latitud, longitud en grados decimales (p. ej. 4.53596, -74.54319):"); if (!t) return; const m = parseCoord(t); if (!m || Math.abs(m[0]) > 90 || Math.abs(m[1]) > 180) return alert("No se entendió. Escriba: latitud, longitud (p. ej. 4.53596, -74.54319)."); nuevoPunto(m[0], m[1], null); };
  document.querySelectorAll("[data-sube]").forEach(b => b.onclick = () => { const i = +b.dataset.sube; [c.puntos[i - 1], c.puntos[i]] = [c.puntos[i], c.puntos[i - 1]]; guardar(); pintarPuntos(); });
  document.querySelectorAll("[data-baja]").forEach(b => b.onclick = () => { const i = +b.dataset.baja; [c.puntos[i + 1], c.puntos[i]] = [c.puntos[i], c.puntos[i + 1]]; guardar(); pintarPuntos(); });
  document.querySelectorAll("#t-pun [data-q]").forEach(b => b.onclick = () => { if (confirm("¿Quitar «" + c.puntos[+b.dataset.q].nombre + "»? Se borran también las distancias que lo tocan.")) { const id = c.puntos[+b.dataset.q].id; c.puntos.splice(+b.dataset.q, 1); c.tramos = c.tramos.filter(t => t.de !== id && t.a !== id); guardar(); pintarPuntos(); } });
  document.querySelectorAll("[data-reubicar]").forEach(b => b.onclick = async () => { try { b.disabled = true; b.textContent = "Midiendo… quédese quieto"; const r = await fijarPunto(DB.ajustes.seg_promedio), p = c.puntos[+b.dataset.reubicar]; p.lat = r.lat; p.lon = r.lon; p.acc = Math.round(r.acc); p.alt_gps = r.alt; p.alt_acc = r.altAcc; if (r.alt != null && p.cota_origen !== "manual") { p.cota = Math.round(r.alt * 10) / 10; p.cota_origen = "gps"; } guardar(); pintarPuntos(); } catch (e) { alert(e.message); pintarPuntos(); } });
  document.querySelectorAll("[data-usaralt]").forEach(b => b.onclick = () => { const p = c.puntos[+b.dataset.usaralt]; p.cota = Math.round(p.alt_gps * 10) / 10; p.cota_origen = "gps"; guardar(); pintarPuntos(); });
  document.querySelectorAll("#t-pun [data-man]").forEach(i => i.onchange = () => { const [a, b] = i.dataset.man.split("|"), v = num(i.value); if (Number.isNaN(v)) { i.style.borderColor = "var(--ro)"; return; } const t = tramoPar(a, b); t.manual_m = v > 0 ? v : null; t.origen = v > 0 ? "escrita" : null; t.linea = null; guardar(); pintarPuntos(); });
  document.querySelectorAll("#t-pun [data-medir]").forEach(b => b.onclick = () => { const [a, z] = b.dataset.medir.split("|"); medirEnMapa(a, z); });
  $("pt-inv").onclick = () => { c.puntos.reverse(); guardar(); pintarPuntos(); };
  [["aj-seg", "seg_promedio"]].forEach(([i, k]) => $(i).onchange = () => { DB.ajustes[k] = Math.max(1, num($(i).value) || AJ0[k]); guardar(); });
}

// ------------------------------------------------------------------ DISTANCIA REAL ENTRE PUNTOS (escrita a mano o medida sobre el mapa)
// La app ya no graba recorridos: calcula la línea recta entre puntos consecutivos y la distancia real por el cauce se escribe o se mide
// sobre el mapa (con internet) tocando los vértices del cauce, como la regla de Google Earth. Si no hay distancia real, se usa la recta.
function tramoPar(a, b) {
  const c = C(); let t = tramoEntre(a, b);
  if (!t) { t = {id: "t" + Date.now().toString(36) + Math.random().toString(36).slice(2, 4), de: a, a: b, pts: [], dist_m: null, manual_m: null, linea: null}; c.tramos.push(t); }
  return t;
}
function distanciasHtml() {
  const c = C(), P = c.puntos; if (P.length < 2) return '<p class="nota">Necesita al menos dos puntos.</p>';
  const filas = P.slice(1).map((b, i) => {
    const a = P[i], t = tramoEntre(a.id, b.id), recta = hav([a.lat, a.lon], [b.lat, b.lon]), real = t && t.manual_m > 0 ? t.manual_m : null;
    const aviso = real !== null && real < recta * 0.98 ? ' <b style="color:var(--ro)">⚠ menor que la recta</b>' : "";
    const usa = real === null ? "usa la línea recta" : (t.origen === "mapa" ? "medida en el mapa" : "escrita") + (real >= recta ? " · sinuosidad " + nf(real / recta, 2) : "");
    return `<tr><td>${i + 1}. ${esc(a.nombre)} → ${i + 2}. ${esc(b.nombre)}</td><td class="num">${nf(recta, 0)}</td><td><input data-man="${a.id}|${b.id}" type="text" inputmode="text" autocomplete="off" style="width:6rem" value="${real === null ? "" : Number(real.toFixed(1))}" placeholder="m"><div class="nota">${usa}${aviso}</div></td><td><button class="b g p" data-medir="${a.id}|${b.id}">🗺 Medir en el mapa</button></td></tr>`;
  }).join("");
  return `<div class="scroll"><table><thead><tr><th>Tramo</th><th class="num">Línea recta (m)</th><th>Distancia real por el cauce (m)</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>
    <p class="nota">La <b>línea recta</b> se calcula con las coordenadas. La <b>distancia real</b> la escribe usted (cinta, estimación) o la mide en el mapa tocando el cauce punto a punto (necesita internet para ver la imagen). Si la deja vacía, los cálculos usan la línea recta.</p>`;
}
function medirEnMapa(idA, idB) {
  const A = punto(idA), B = punto(idB);
  if (!A || !B || !isFinite(A.lat) || !isFinite(B.lat)) return alert("Los dos puntos necesitan coordenadas.");
  const t0 = tramoEntre(idA, idB), recta = hav([A.lat, A.lon], [B.lat, B.lon]);
  let inter = t0 && t0.linea && t0.linea.length > 2 ? (t0.de === idA ? t0.linea : t0.linea.slice().reverse()).slice(1, -1).map(p => [p[0], p[1]]) : [];
  if (DB.ajustes.fondo === "ninguno" || !FONDOS[DB.ajustes.fondo]) { DB.ajustes.fondo = "satelite"; guardar(true); }
  const v = document.createElement("div"); v.style.cssText = "position:fixed;inset:0;z-index:50;background:#fff;display:flex;flex-direction:column";
  v.innerHTML = `<div style="padding:.5rem .8rem;background:var(--az);color:#fff"><b>Medir: ${esc(A.nombre)} → ${esc(B.nombre)}</b><div id="med-d" style="font-size:1.1rem;font-weight:600"></div></div>
    <div id="med-caja" style="flex:1;position:relative;overflow:hidden;touch-action:none;background:#eef1f7"></div>
    <div style="padding:.4rem .6rem calc(.4rem + env(safe-area-inset-bottom));border-top:1px solid var(--bd);background:#fff">
      <div class="nota" id="med-nota"></div>
      <div style="display:flex;gap:.35rem;flex-wrap:wrap;align-items:center"><select id="med-fondo" style="width:auto"><option value="ninguno">Sin fondo</option>${Object.entries(FONDOS).map(([k, f]) => `<option value="${k}"${DB.ajustes.fondo === k ? " selected" : ""}>${f.t}</option>`).join("")}</select><button class="b g p" id="med-menos">−</button><button class="b g p" id="med-mas">+</button><button class="b g p" id="med-gps">📍 Dónde estoy</button><button class="b g p" id="med-undo">↶ Deshacer</button><button class="b g p" id="med-clr">Borrar</button></div>
      <div style="display:flex;gap:.5rem;margin-top:.4rem"><button class="b" id="med-ok" style="flex:2">Aceptar esta distancia</button><button class="b g" id="med-no" style="flex:1">Cancelar</button></div></div>`;
  document.body.appendChild(v);
  const caja = v.querySelector("#med-caja"), q = id => v.querySelector("#" + id), W = caja.clientWidth || 360, H = caja.clientHeight || 400;
  const ruta = () => [[A.lat, A.lon], ...inter, [B.lat, B.lon]], mA = mercator(A.lat, A.lon), mB = mercator(B.lat, B.lon), mPorU = 40075016.686 * Math.cos(rad(A.lat));
  const todos = [mA, mB, ...inter.map(p => mercator(p[0], p[1]))], xs = todos.map(p => p[0]), ys = todos.map(p => p[1]), minU = 60 / mPorU;
  const dx = Math.max(Math.max(...xs) - Math.min(...xs), minU), dy = Math.max(Math.max(...ys) - Math.min(...ys), minU);
  let cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2, sc = Math.min((W - 100) / dx, (H - 100) / dy);
  const sc0 = sc, limitar = () => { sc = Math.max(sc0 / 64, Math.min(256 * 2 ** 22, sc)); };
  const dibujar = () => {
    const X = u => W / 2 + (u - cx) * sc, Y = u => H / 2 + (u - cy) * sc, pt = (la, lo) => { const m = mercator(la, lo); return [X(m[0]), Y(m[1])]; };
    const lin = ps => ps.map((p, i) => { const z = pt(p[0], p[1]); return (i ? "L" : "M") + z[0].toFixed(1) + "," + z[1].toFixed(1); }).join("");
    let s = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="display:block"><rect width="${W}" height="${H}" fill="#eef1f7"/>` + teselas(cx, cy, sc, W, H);
    s += `<path d="${lin([[A.lat, A.lon], [B.lat, B.lon]])}" fill="none" stroke="#fff" stroke-width="4" opacity=".8"/><path d="${lin([[A.lat, A.lon], [B.lat, B.lon]])}" fill="none" stroke="#5b6577" stroke-width="2" stroke-dasharray="6 5"/>`;
    s += `<path d="${lin(ruta())}" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/><path d="${lin(ruta())}" fill="none" stroke="#c0392b" stroke-width="3.5" stroke-linejoin="round"/>`;
    C().puntos.forEach(p => { if (p.id === idA || p.id === idB || !isFinite(p.lat)) return; const z = pt(p.lat, p.lon); s += `<circle cx="${z[0].toFixed(1)}" cy="${z[1].toFixed(1)}" r="5" fill="#777" stroke="#fff" stroke-width="2"/>`; });
    inter.forEach((p, i) => { const z = pt(p[0], p[1]); s += `<circle cx="${z[0].toFixed(1)}" cy="${z[1].toFixed(1)}" r="5" fill="#fff" stroke="#c0392b" stroke-width="2.5"/>`; });
    [[A, "A"], [B, "B"]].forEach(([p, e]) => { const z = pt(p.lat, p.lon); s += `<circle cx="${z[0].toFixed(1)}" cy="${z[1].toFixed(1)}" r="9" fill="${e === "A" ? "#1F3864" : "#2e8b57"}" stroke="#fff" stroke-width="3"/><text x="${(z[0] + 13).toFixed(1)}" y="${(z[1] - 10).toFixed(1)}" style="font-size:13px;font-weight:700;paint-order:stroke;stroke:#fff;stroke-width:4px;fill:#1d2433">${e}. ${esc(p.nombre)}</text>`; });
    if (ULT) { const z = pt(ULT.lat, ULT.lon); s += `<circle cx="${z[0].toFixed(1)}" cy="${z[1].toFixed(1)}" r="6" fill="#2b8cff" stroke="#fff" stroke-width="2.5"/>`; }
    const mPx = mPorU / sc, barra = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find(x => x / mPx >= 70) || 5000, bw = barra / mPx;
    s += `<rect x="8" y="${H - 34}" width="${bw + 16}" height="26" rx="4" fill="#fff" opacity=".85"/><line x1="16" y1="${H - 14}" x2="${16 + bw}" y2="${H - 14}" stroke="#1d2433" stroke-width="2.5"/><text x="16" y="${H - 19}" style="font-size:11px;fill:#1d2433">${barra >= 1000 ? barra / 1000 + " km" : barra + " m"}</text>`;
    const fo = FONDOS[DB.ajustes.fondo]; if (fo) s += `<text x="${W - 6}" y="${H - 6}" text-anchor="end" style="font-size:10px;paint-order:stroke;stroke:#fff;stroke-width:3px;fill:#333">${fo.atr}</text>`;
    caja.innerHTML = s + "</svg>";
    const L = longitud(ruta());
    q("med-d").innerHTML = inter.length ? `${nf(L, 1)} m por el cauce <span style="font-weight:400;font-size:.85rem">(línea recta ${nf(recta, 0)} m · ${inter.length} vértice${inter.length === 1 ? "" : "s"})</span>` : `<span style="font-weight:400;font-size:.9rem">Línea recta ${nf(recta, 0)} m. Toque el mapa siguiendo el cauce de A a B.</span>`;
    q("med-undo").disabled = !inter.length; q("med-clr").disabled = !inter.length;
  };
  let pend = false; const pedir = () => { if (!pend) { pend = true; requestAnimationFrame(() => { pend = false; dibujar(); }); } };
  const aMundo = (px, py) => { const r = caja.getBoundingClientRect(); return [cx + (px - r.left - W / 2) / sc, cy + (py - r.top - H / 2) / sc]; };
  const aLatLon = (x, y) => [Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI, x * 360 - 180];
  const zoomEn = (px, py, f) => { const w = aMundo(px, py), r = caja.getBoundingClientRect(); sc *= f; limitar(); cx = w[0] - (px - r.left - W / 2) / sc; cy = w[1] - (py - r.top - H / 2) / sc; };
  const ptrs = new Map(); let movio = false, ini = null;
  caja.onpointerdown = e => { try { caja.setPointerCapture(e.pointerId); } catch (x) {} ptrs.set(e.pointerId, [e.clientX, e.clientY]); if (ptrs.size === 1) { movio = false; ini = [e.clientX, e.clientY]; } else movio = true; };
  caja.onpointermove = e => {
    if (!ptrs.has(e.pointerId)) return; const old = ptrs.get(e.pointerId), nw = [e.clientX, e.clientY];
    if (ptrs.size === 1) { if (!movio && Math.hypot(nw[0] - ini[0], nw[1] - ini[1]) < 8) return; movio = true; cx -= (nw[0] - old[0]) / sc; cy -= (nw[1] - old[1]) / sc; }
    else if (ptrs.size === 2) { const otro = [...ptrs.entries()].find(([k]) => k !== e.pointerId)[1], d0 = Math.hypot(old[0] - otro[0], old[1] - otro[1]), d1 = Math.hypot(nw[0] - otro[0], nw[1] - otro[1]); if (d0 < 1) return;
      const m0 = [(old[0] + otro[0]) / 2, (old[1] + otro[1]) / 2], m1 = [(nw[0] + otro[0]) / 2, (nw[1] + otro[1]) / 2], w = aMundo(m0[0], m0[1]), r = caja.getBoundingClientRect();
      sc *= d1 / d0; limitar(); cx = w[0] - (m1[0] - r.left - W / 2) / sc; cy = w[1] - (m1[1] - r.top - H / 2) / sc; }
    ptrs.set(e.pointerId, nw); pedir();
  };
  const suelta = e => { if (!ptrs.has(e.pointerId)) return; const era1 = ptrs.size === 1; ptrs.delete(e.pointerId); if (era1 && !movio && e.type === "pointerup") { const w = aMundo(e.clientX, e.clientY); inter.push(aLatLon(w[0], w[1])); pedir(); } };
  caja.onpointerup = suelta; caja.onpointercancel = suelta;
  caja.addEventListener("wheel", e => { e.preventDefault(); zoomEn(e.clientX, e.clientY, e.deltaY < 0 ? 1.25 : 0.8); pedir(); }, {passive: false});
  const r0 = () => { const r = caja.getBoundingClientRect(); return [r.left + W / 2, r.top + H / 2]; };
  q("med-mas").onclick = () => { const c0 = r0(); zoomEn(c0[0], c0[1], 1.6); pedir(); }; q("med-menos").onclick = () => { const c0 = r0(); zoomEn(c0[0], c0[1], 1 / 1.6); pedir(); };
  q("med-undo").onclick = () => { inter.pop(); pedir(); }; q("med-clr").onclick = () => { inter = []; pedir(); };
  q("med-gps").onclick = () => { if (!iniciarGPS()) return; if (!ULT) { q("med-nota").textContent = "Esperando la señal del GPS…"; return; } const m = mercator(ULT.lat, ULT.lon); cx = m[0]; cy = m[1]; pedir(); };
  q("med-fondo").onchange = () => { DB.ajustes.fondo = q("med-fondo").value; guardar(true); pedir(); };
  q("med-nota").textContent = navigator.onLine === false ? "⚠ Sin internet: no se ve la imagen del mapa. Puede escribir la distancia a mano." : "Arrastre para mover, pellizque o use +/− para acercar. Cada toque agrega un vértice; el último toque va antes de B.";
  q("med-no").onclick = () => v.remove();
  q("med-ok").onclick = () => {
    if (!inter.length && !confirm("No marcó ningún vértice: la distancia sería la línea recta (" + nf(recta, 0) + " m). ¿Aceptarla como distancia real?")) return;
    const t = tramoPar(idA, idB), r = ruta(); t.linea = t.de === idA ? r : r.slice().reverse(); t.manual_m = Math.round(longitud(r) * 10) / 10; t.origen = "mapa"; guardar(); v.remove(); pintarPuntos();
  };
  dibujar();
}

// ------------------------------------------------------------------ PROGRAMAR
let RES = null;
function pendienteHtml(i, ii) {
  const q1 = pendienteEntre(i - 1, i), q2 = i - 1 !== ii ? pendienteEntre(ii, i) : null, g1 = q1 ? null : pendienteGPS(i - 1, i), g2 = q2 || i - 1 === ii ? null : pendienteGPS(ii, i);
  const bt = (q, t) => q && q.s > 0 ? `<button class="b g p" data-pend="${i}|${q.s}" style="margin:.15rem .3rem .15rem 0">${t}: ${nf(q.s, 4)} m/m (${nf(q.dz, 2)} m en ${nf(q.d, 0)} m)</button>` : "";
  const bg = (g, t) => g ? `<button class="b g p" data-pend="${i}|${g.s}" ${g.s > 0 ? "" : "disabled"} style="margin:.15rem .3rem .15rem 0">preliminar GPS ${t}: ${nf(g.s, 4)} ± ${nf(g.se, 4)} m/m</button><span class="nota"> ${esc(g.fuente)}${Math.abs(g.s) < 2 * g.se ? ' <b style="color:var(--ro)">— no se distingue de cero: mida cotas con nivel</b>' : ""} </span>` : "";
  const gps = (q1 && q1.gps) || (q2 && q2.gps), malo = [q1, q2].some(q => q && q.s <= 0);
  return `<div class="nota" style="margin-top:.4rem">Pendiente estimada (se corrige con cotas medidas en «Puntos»): ${bt(q1, "del punto anterior")}${bt(q2, "desde la inyección")}${bg(g1, "del punto anterior")}${bg(g2, "desde la inyección")}${!q1 && !q2 && !g1 && !g2 ? "marque la altitud con el GPS en los dos puntos, o escriba sus cotas (pestaña Puntos)." : ""}${malo ? ' <b style="color:var(--ro)">⚠ una cota aguas abajo es mayor o igual que la de arriba.</b>' : ""}${gps ? ' <b style="color:var(--am)">⚠ hay cotas tomadas del GPS (error de 10 a 30 m): úselas solo si el desnivel es de varios metros.</b>' : ""}</div>`;
}
function pintarProg() {
  const c = C(), E = estaciones(), P = c.params, ii = c.puntos.findIndex(p => p.rol === "inyeccion");
  let aviso = "";
  if (ii < 0) aviso = "Falta un punto con función «Inyección del trazador» (pestaña Puntos).";
  else if (!E.length) aviso = "No hay estaciones de monitoreo aguas abajo de la inyección. Marque las estaciones después de la inyección, en el orden del río.";
  const H = [["q_ls", "Caudal (L/s)"], ["ancho_m", "Ancho (m)"], ["prof_m", "Profundidad media (m)"], ["pendiente", "Pendiente (m/m; 0.03 = 3 %)"], ["ec_fondo", "EC de fondo (µS/cm)"], ["ruido", "Ruido ± (µS/cm)"], ["tiempo_tramo_s", "Tiempo de viaje del tramo (s), opcional"], ["d_l", "D_L medido (m²/s), opcional"]];
  $("t-prog").innerHTML = `<p class="nota">Estima la masa de sal y los tiempos de registro (Fischer et al. 1979, pulso gaussiano). Las distancias salen de «Puntos» (distancia real por el cauce, o la línea recta si no la puso); el caudal, ancho, profundidad y pendiente los mide o estima usted en el sitio (o los trae del modelo hidráulico). Es una estimación: D_L real puede variar de 2 a 5 veces.</p>
    ${aviso ? '<div class="adv">⚠ ' + aviso + "</div>" : ""}
    ${E.map(e => { const i = c.puntos.findIndex(p => p.id === e.id); return `<div class="card"><div class="pt"><b>${esc(e.nombre)}</b><span class="badge">${e.x_m === null ? "sin distancia" : nf(e.x_m, 0) + " m desde la inyección"}</span></div><div class="fila" style="margin-top:.4rem">${H.map(([k, t]) => campo(t, `puntos.${i}.hid.${k}`, "n", c.puntos[i].hid?.[k])).join("")}</div>${pendienteHtml(i, ii)}</div>`; }).join("")}
    ${E.length > 1 ? '<button class="b g p" id="pr-copiar">Copiar los datos de la primera estación a las demás (vacíos)</button>' : ""}
    <details class="card"><summary><b>Parámetros del ensayo</b> <span class="nota">(valores de partida, por confirmar)</span></summary><div class="fila" style="margin-top:.4rem">
      <label>Inyección<select data-r="params.tipo_inyeccion" data-t="n"><option value="1"${P.tipo_inyeccion == 1 ? " selected" : ""}>Por la orilla</option><option value="2"${P.tipo_inyeccion == 2 ? " selected" : ""}>En el centro</option></select></label>
      ${[["mult_pico", "Pico / ruido"], ["dec_min", "ΔEC mínimo (µS/cm)"], ["k", "k (mg/L por µS/cm)"], ["pureza", "Pureza de la sal"], ["f_seguridad", "Factor de seguridad"], ["solubilidad_g_l", "Solubilidad (g/L)"], ["alpha_t", "α mezcla transversal"]].map(([k, t]) => campo(t, "params." + k, "n", P[k])).join("")}</div></details>
    <button class="b" id="pr-calc" style="width:100%">Calcular masa de sal y tiempos</button><div id="pr-res"></div>`;
  $("pr-calc").onclick = calcular;
  document.querySelectorAll("[data-pend]").forEach(b => b.onclick = () => { const [i, v] = b.dataset.pend.split("|"), p = c.puntos[+i]; p.hid = p.hid || {}; p.hid.pendiente = Number(Number(v).toPrecision(4)); guardar(); pintarProg(); });
  if ($("pr-copiar")) $("pr-copiar").onclick = () => { const o = c.puntos.find(p => p.id === E[0].id).hid || {}; E.slice(1).forEach(e => { const p = c.puntos.find(x => x.id === e.id); p.hid = p.hid || {}; H.forEach(([k]) => { if (p.hid[k] == null && o[k] != null && k !== "tiempo_tramo_s") p.hid[k] = o[k]; }); }); guardar(); pintarProg(); };
  if (c.programacion && RES) mostrarResultado();
}
function calcular() {
  const c = C();
  try { RES = programar(estaciones(), c.params); } catch (e) { RES = null; $("pr-res").innerHTML = '<p class="err">' + esc(e.message) + "</p>"; return; }
  c.programacion = {masa_kg: RES.masa_kg, agua_l: RES.agua_l, estaciones: RES.est.map(s => ({id: s.id, nombre: s.nombre, x_m: s.x_m, t_pico_min: s.t_pico_min, ini_min: s.ini_min, fin_min: s.fin_min, dec_esperado: s.dec_esperado, l_mezcla_m: s.l_mezcla_m}))}; guardar(); mostrarResultado();
}
function mostrarResultado() {
  const R = RES; if (!R) return;
  $("pr-res").innerHTML = `<div class="kpi" style="margin:.6rem 0"><div><span class="nota">Masa de sal a inyectar</span><b>${nf(R.masa_kg, 2)} kg</b><span class="nota">sal comercial</span></div><div><span class="nota">Agua mínima para disolverla</span><b>${nf(R.agua_l, 0)} L</b><span class="nota">disuelva y vierta de una vez</span></div></div>` + R.adv.map(a => '<div class="adv">⚠ ' + esc(a) + "</div>").join("") +
    '<div class="scroll"><table><thead><tr><th>Estación</th><th class="num">Dist. (m)</th><th class="num">u (m/s)</th><th class="num">Pico a los (min)</th><th class="num">Mezcla (m)</th><th class="num">ΔEC esp.</th><th class="num">Pico/ruido</th><th class="num">Iniciar (min)</th><th class="num">Terminar (min)</th></tr></thead><tbody>' +
    R.est.map(s => `<tr><td>${esc(s.nombre)}</td><td class="num">${nf(s.x_m, 0)}</td><td class="num">${nf(s.u, 3)}</td><td class="num"><b>${nf(s.t_pico_min, 1)}</b></td><td class="num" style="${s.mezcla_ok ? "" : "color:var(--ro);font-weight:600"}">${nf(s.l_mezcla_m, 0)} ${s.mezcla_ok ? "✔" : "⚠"}</td><td class="num">${nf(s.dec_esperado, 0)}</td><td class="num" style="${s.pico_ruido !== null && s.pico_ruido < 5 ? "color:var(--ro);font-weight:600" : ""}">${nf(s.pico_ruido, 1)}</td><td class="num"><b>${nf(s.ini_min, 1)}</b></td><td class="num"><b>${nf(s.fin_min, 1)}</b></td></tr>`).join("") + "</tbody></table></div><div id='pr-graf'></div>" +
    '<p class="nota">Registre desde antes de inyectar (30–60 min de fondo) y hasta que la cola vuelva al fondo. Pese la masa real y anótela en «Campaña».</p>';
  curva(R);
}
function curva(R) {
  const W = 640, H = 280, m = {l: 48, r: 10, t: 14, b: 40}, tmax = Math.max(...R.est.map(s => s.t_pico_s + 10 * s.sigma)), ymax = Math.max(...R.est.map(s => s.dec_esperado)) * 1.08, col = ["#1F3864", "#e67e22", "#2e8b57", "#8e44ad", "#c0392b"];
  const X = t => m.l + t / tmax * (W - m.l - m.r), Y = y => H - m.b - y / ymax * (H - m.t - m.b);
  let s = `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Curva esperada de ΔEC">`;
  for (let i = 0; i <= 4; i++) { const y = ymax * i / 4, t = tmax * i / 4; s += `<line x1="${m.l}" x2="${W - m.r}" y1="${Y(y)}" y2="${Y(y)}" stroke="#e3e6ee"/><text x="${m.l - 4}" y="${Y(y) + 4}" text-anchor="end">${y.toFixed(0)}</text><text x="${X(t)}" y="${H - m.b + 14}" text-anchor="middle">${(t / 60).toFixed(0)}</text>`; }
  R.est.forEach((e, i) => { let d = ""; for (let j = 0; j <= 160; j++) { const t = tmax * j / 160, y = e.dec_esperado * Math.exp(-Math.pow(t - e.t_pico_s, 2) / (2 * e.varianza)); d += (j ? "L" : "M") + X(t).toFixed(1) + "," + Y(y).toFixed(1); }
    s += `<rect x="${X(e.ini_min * 60)}" y="${m.t}" width="${X(e.fin_min * 60) - X(e.ini_min * 60)}" height="${H - m.t - m.b}" fill="${col[i % 5]}" opacity=".07"/><path d="${d}" fill="none" stroke="${col[i % 5]}" stroke-width="2.2"/><text x="${X(e.t_pico_s)}" y="${Y(e.dec_esperado) - 5}" text-anchor="middle" fill="${col[i % 5]}">${esc(e.nombre)}</text>`; });
  s += `<text x="${W / 2}" y="${H - 4}" text-anchor="middle">Tiempo desde la inyección (min)</text><text transform="translate(11,${H / 2}) rotate(-90)" text-anchor="middle">ΔEC esperado (µS/cm)</text></svg>`;
  $("pr-graf").innerHTML = s;
}

// ------------------------------------------------------------------ ENSAYO (el día de la prueba: guía paso a paso, contador, avisos y parada)
const CHECK = ["Sondas encendidas y con la hora del celular sincronizada", "Sal pesada (anote la masa abajo)", "Agua lista para disolverla (balde)", "Sondas puestas en el hilo de la corriente", "Pantalla encendida y batería cargada"];
function ens() { const c = C(); return c.ensayo || (c.ensayo = {estado: "preparando", t_fin_iso: null, check: {}, avisos: {}}); }
function t0() { const c = C(); return c.inyeccion.t0_iso ? new Date(c.inyeccion.t0_iso) : null; }
function fechaHora(h) { const c = C(), f = new Date((c.fecha || new Date().toISOString().slice(0, 10)) + "T00:00:00"), [a, b, s] = h.split(":").map(Number); f.setHours(a, b, s || 0, 0); return f; }
function evento(txt) { C().eventos.push({iso: new Date().toISOString(), hora: horaTxt(new Date()), texto: txt, quien: quienSoy()}); guardar(); }
const mmss = s => { const a = Math.abs(Math.round(s)); return pad(Math.floor(a / 60)) + ":" + pad(a % 60); };
const hhmmss = s => { const a = Math.abs(Math.round(s)); return pad(Math.floor(a / 3600)) + ":" + pad(Math.floor(a % 3600 / 60)) + ":" + pad(a % 60); };
function transcurrido() { const T = t0(), E = ens(); if (!T) return null; const fin = E.estado === "terminado" && E.t_fin_iso ? new Date(E.t_fin_iso) : new Date(); return (fin.getTime() - T.getTime()) / 1000; }
let AC = null;
function prepararSonido() { try { AC = AC || new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === "suspended") AC.resume(); } catch (e) {} }
function beep() { try { prepararSonido(); [0, 0.35, 0.7].forEach(d => { const o = AC.createOscillator(), g = AC.createGain(); o.frequency.value = 880; g.gain.value = 0.25; o.connect(g); g.connect(AC.destination); o.start(AC.currentTime + d); o.stop(AC.currentTime + d + 0.22); }); } catch (e) {} }
function avisar(txt) {
  const b = $("aviso-ensayo"); if (!b) return;
  b.innerHTML = `<span>🔔 ${esc(txt)}</span><button class="b p" id="aviso-ok">Entendido</button>`; b.style.display = "flex"; $("aviso-ok").onclick = () => { b.style.display = "none"; };
  try { if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 400]); } catch (e) {} beep();
}
function estadoEstacion(p) {
  const c = C(), E = ens(), T = t0(), pr = c.programacion?.estaciones.find(e => e.id === p.id);
  if (E.estado === "terminado") return {cl: "ya", h: "Ensayo terminado."};
  if (!T) return {cl: "", h: pr ? `Programado: iniciar a los <b>${nf(pr.ini_min, 1)} min</b>, pico a los <b>${nf(pr.t_pico_min, 1)} min</b>, terminar a los <b>${nf(pr.fin_min, 1)} min</b> de inyectar.` : "Calcule la programación (pestaña Programar) para ver las horas de esta estación."};
  if (!pr) return {cl: "", h: "Calcule la programación (pestaña Programar) para ver las horas de esta estación."};
  const t = (Date.now() - T.getTime()) / 1000, ini = pr.ini_min * 60, pico = pr.t_pico_min * 60, fin = pr.fin_min * 60, clk = m => horaTxt(new Date(T.getTime() + m * 60000));
  if (t < ini) return {cl: "", h: `Iniciar el registro a las <b>${clk(pr.ini_min)}</b> — faltan <b>${mmss(ini - t)}</b>`};
  if (t < fin) return {cl: "ahora", h: `<span class="badge" style="background:var(--ro);color:#fff">REGISTRANDO</span> pico esperado a las <b>${clk(pr.t_pico_min)}</b> (${t < pico ? "en " + mmss(pico - t) : "hace " + mmss(t - pico)}) · terminar a las <b>${clk(pr.fin_min)}</b> — faltan <b>${mmss(fin - t)}</b>`};
  return {cl: "ya", h: `Ventana terminada a las <b>${clk(pr.fin_min)}</b>. Apague la sonda y anote la hora.`};
}
function revisarAvisos() {                  // avisos con sonido y vibración: 2 min antes de iniciar, al iniciar, al pico esperado y al terminar cada estación
  const c = C(), E = ens(), T = t0(); if (!T || E.estado !== "en_curso" || !c.programacion) return;
  const t = (Date.now() - T.getTime()) / 1000, textos = []; E.avisos = E.avisos || {};
  c.puntos.filter(p => p.rol === "monitoreo").forEach(p => { const pr = c.programacion.estaciones.find(e => e.id === p.id); if (!pr) return;
    [["pre", pr.ini_min * 60 - 120, `En 2 minutos: iniciar el registro en «${p.nombre}»`], ["ini", pr.ini_min * 60, `INICIAR el registro en «${p.nombre}» ahora`], ["pico", pr.t_pico_min * 60, `Pico esperado en «${p.nombre}» ahora`], ["fin", pr.fin_min * 60, `TERMINAR el registro en «${p.nombre}»`]].forEach(([k, tev, txt]) => {
      const key = p.id + k; if (E.avisos[key] || t < tev) return; E.avisos[key] = true;
      if (tev > 0 && t - tev <= 180) textos.push(txt);                                      // si la app estuvo cerrada y el aviso es viejo, no se repite
    }); });
  if (textos.length) { guardar(true); avisar(textos.join(" · ")); }
}
function pintarCampana() {
  const c = C(), E = ens(), I = c.inyeccion, T = t0(), term = E.estado === "terminado", X = estaciones(), est = c.puntos.filter(p => p.rol === "monitoreo"), RO = rolActual(), esEst = RO.tipo === "estacion", vEst = esEst ? est.filter(p => p.id === RO.punto_id) : RO.tipo === "inyeccion" ? [] : est;
  const control = !T ? (esEst ? `<p class="nota"><b>Espere el aviso por radio de quien inyecta.</b> Cuando diga «inyecté a las HH:MM:SS», escriba esa hora exacta en el recuadro de abajo (la cuenta regresiva de su estación arranca de ahí), o toque el botón al oírlo.</p><button class="b" id="c-iny" style="width:100%;font-size:1.1rem;padding:.9rem">💧 YA INYECTARON (ahora)</button>` : `<button class="b" id="c-iny" style="width:100%;font-size:1.25rem;padding:1rem">💧 INYECTAR AHORA</button><p class="nota">Toque el botón en el instante en que vierte la sal: marca la hora y arranca el contador. Si ya inyectó, escriba la hora abajo.</p>`)
    : term ? `<div class="nota">Terminó a las <b>${E.t_fin_iso ? horaTxt(new Date(E.t_fin_iso)) : "—"}</b> · duración total <b>${E.t_fin_iso ? hhmmss(transcurrido()) : "—"}</b></div><button class="b g" id="c-reabrir" style="width:100%;margin-top:.4rem">Reabrir el ensayo</button>`
    : `<button class="b r" id="c-parar" style="width:100%;font-size:1.1rem;padding:.9rem">■ PARAR EL ENSAYO</button><button class="b g p" id="c-anular" style="margin-top:.5rem">Anular la inyección (me equivoqué)</button>`;
  const estHtml = RO.tipo === "inyeccion" ? est.map(p => { const s = estadoEstacion(p); return `<div class="card est ${s.cl}" id="card-${p.id}"><b>${esc(p.nombre)}</b><div class="nota" id="st-${p.id}">${s.h}</div></div>`; }).join("") : vEst.map(p => { const R = c.registros[p.id] || (c.registros[p.id] = {}), s = estadoEstacion(p), x = X.find(e => e.id === p.id)?.x_m;
    return `<div class="card est ${s.cl}" id="card-${p.id}"><div class="pt"><b>${esc(p.nombre)}</b><span class="badge">${x == null ? "sin distancia" : nf(x, 0) + " m desde la inyección"}</span></div><div class="nota" id="st-${p.id}">${s.h}</div>
      <div class="fila" style="margin-top:.4rem">${campo("Sonda / serie", `registros.${p.id}.sonda`, "t", R.sonda)}${campo("EC de fondo (µS/cm)", `registros.${p.id}.ec_fondo`, "n", R.ec_fondo)}</div>
      <div class="fila" style="margin-top:.4rem">${campo("Sonda encendida (hora)", `registros.${p.id}.inicio`, "h", R.inicio)}${campo("Pico visto (hora)", `registros.${p.id}.pico`, "h", R.pico)}${campo("Sonda apagada (hora)", `registros.${p.id}.fin`, "h", R.fin)}</div>
      <div style="display:flex;gap:.4rem;flex-wrap:wrap;margin-top:.4rem"><button class="b g p" data-ahora="${p.id}|inicio">Encendí la sonda</button><button class="b g p" data-ahora="${p.id}|pico">Vi el pico</button><button class="b g p" data-ahora="${p.id}|fin">Apagué la sonda</button></div>
      ${fotosHtml("estacion", p.id, ETQ_EST)}${campo("Notas", `registros.${p.id}.notas`, "t", R.notas)}</div>`; }).join("");
  $("t-camp").innerHTML = `${rolCard(c, RO, est)}<div class="card" style="text-align:center"><div class="nota">${term ? "ENSAYO TERMINADO" : T ? "Tiempo desde la inyección" : "Aún no se ha inyectado"}</div><div class="crono" id="c-crono">—</div>${control}</div>
    ${esEst ? `<div class="card">${campo("Hora de inyección (la que anuncia quien inyecta)", "inyeccion.hora", "h", I.hora, 'id="c-hora"')}</div>` : `<details class="card" ${T ? "" : "open"}><summary><b>1 · Antes de inyectar</b></summary><div style="margin-top:.4rem">${CHECK.map((t, i) => `<label style="flex-direction:row;align-items:center;gap:.5rem;font-size:.95rem;color:#1d2433;margin:.3rem 0"><input type="checkbox" data-chk="${i}" style="width:auto" ${E.check?.[i] ? "checked" : ""}> ${t}</label>`).join("")}</div>
      <div class="fila" style="margin-top:.4rem">${campo("Masa de sal pesada (kg)", "inyeccion.masa_kg", "n", I.masa_kg)}${campo("Pureza (fracción)", "inyeccion.pureza", "n", I.pureza)}${campo("Agua usada (L)", "inyeccion.agua_l", "n", I.agua_l)}${campo("Sal (tipo, marca, lote)", "inyeccion.sal", "t", I.sal)}${campo("Hora de inyección", "inyeccion.hora", "h", I.hora, 'id="c-hora"')}</div>
      ${T && !I.masa_kg ? '<div class="adv">⚠ Falta anotar la masa de sal pesada: sin ella no se puede evaluar el ensayo.</div>' : ""}<div style="margin-top:.5rem"><b>Fotos de la sal, la mezcla y la inyección</b>${fotosHtml("inyeccion", c.puntos.find(p => p.rol === "inyeccion")?.id, ETQ_INY)}</div></details>`}
    <h2>${esEst ? "Su estación" : "2 · Estaciones"}</h2>${estHtml || '<p class="nota">No hay estaciones de monitoreo: márquelas en «Puntos».</p>'}
    <h2>3 · Cierre</h2>
    <div class="card"><b>Aforos de campo</b>${c.aforos.map((a, i) => `<div class="fila" style="margin-top:.4rem">${campo("Punto", `aforos.${i}.punto`, "t", a.punto)}${campo("Q (L/s)", `aforos.${i}.q_ls`, "n", a.q_ls)}${campo("Hora", `aforos.${i}.hora`, "h", a.hora)}${campo("Método", `aforos.${i}.metodo`, "t", a.metodo)}<button class="b g p" data-qa="${i}" style="align-self:flex-end">Quitar</button></div>`).join("")}<div><button class="b g p" id="c-afo" style="margin-top:.4rem">+ Agregar aforo</button></div></div>
    <div class="card"><b>Notas rápidas con la hora</b><div class="fila" style="margin-top:.4rem"><label style="flex:3">Nota<input id="c-ev-txt" type="text" placeholder="p. ej. subió el caudal, lluvia, sonda movida"></label><button class="b" id="c-ev" style="align-self:flex-end">Anotar</button></div><div class="scroll"><table id="c-evt"></table></div></div>
    <label>Observaciones generales<textarea data-r="observaciones">${esc(c.observaciones)}</textarea></label>
    <details class="card"><summary><b>Datos de la jornada</b></summary><div class="fila" style="margin-top:.4rem">${campo("Nombre de la campaña", "nombre", "t", c.nombre, 'data-re="1"')}${campo("Fecha", "fecha", "f", c.fecha)}${campo("Responsable", "responsable", "t", c.responsable)}${campo("Cuadrilla", "cuadrilla", "t", c.cuadrilla)}${campo("Clima / condición del cauce", "clima", "t", c.clima)}</div></details>`;
  if ($("c-iny")) $("c-iny").onclick = () => { prepararSonido(); const f = new Date(); I.hora = horaTxt(f); I.t0_iso = f.toISOString(); c.fecha = f.toISOString().slice(0, 10); E.estado = "en_curso"; E.t_fin_iso = null; E.avisos = {}; I.origen = esEst ? "recibida" : "propia"; evento(esEst ? "Se recibió el aviso de inyección" : "Inyección del trazador" + (I.masa_kg ? " (" + I.masa_kg + " kg)" : "")); pedirPantalla(); pintarCampana(); };
  if ($("c-parar")) $("c-parar").onclick = () => { if (!confirm("¿Terminar el ensayo? Se detienen el contador y los avisos.")) return; E.estado = "terminado"; E.t_fin_iso = new Date().toISOString(); evento("Ensayo terminado (duración " + hhmmss(transcurrido()) + ")"); $("aviso-ensayo").style.display = "none"; if (watchId === null) soltarPantalla(); pintarCampana(); };
  if ($("c-anular")) $("c-anular").onclick = () => { if (!confirm("¿Anular la inyección? Se borra la hora y el contador vuelve a cero (las notas se conservan).")) return; I.hora = ""; I.t0_iso = null; E.estado = "preparando"; E.t_fin_iso = null; E.avisos = {}; evento("Inyección anulada"); $("aviso-ensayo").style.display = "none"; pintarCampana(); };
  if ($("c-reabrir")) $("c-reabrir").onclick = () => { E.estado = "en_curso"; E.t_fin_iso = null; E.avisos = {}; evento("Ensayo reabierto"); pedirPantalla(); pintarCampana(); };
  if ($("c-hora")) $("c-hora").addEventListener("change", () => { const h = $("c-hora").value; I.hora = h; I.origen = esEst ? "recibida" : "propia"; I.t0_iso = h ? fechaHora(h).toISOString() : null; E.estado = h ? (E.estado === "terminado" ? "terminado" : "en_curso") : "preparando"; if (h) E.avisos = {}; guardar(); pintarCampana(); });
  document.querySelectorAll("[data-chk]").forEach(i => i.onchange = () => { (E.check = E.check || {})[i.dataset.chk] = i.checked; guardar(); });
  document.querySelectorAll("[data-ahora]").forEach(b => b.onclick = () => { const [id, k] = b.dataset.ahora.split("|"); (c.registros[id] = c.registros[id] || {})[k] = horaTxt(new Date()); evento({inicio: "Sonda encendida en ", pico: "Pico visto en ", fin: "Sonda apagada en "}[k] + punto(id).nombre); pintarCampana(); });
  $("c-afo").onclick = () => { c.aforos.push({punto: "", q_ls: null, hora: horaTxt(new Date()).slice(0, 5), metodo: ""}); guardar(); pintarCampana(); };
  document.querySelectorAll("[data-qa]").forEach(b => b.onclick = () => { c.aforos.splice(+b.dataset.qa, 1); guardar(); pintarCampana(); });
  $("c-ev").onclick = () => { const t = $("c-ev-txt").value.trim(); if (!t) return; evento(t); pintarCampana(); };
  $("c-evt").innerHTML = c.eventos.length ? "<tbody>" + c.eventos.slice().reverse().map(e => `<tr><td style="white-space:nowrap"><b>${e.hora}</b></td><td>${esc(e.texto)}${e.quien ? ' <span class="nota">— ' + esc(e.quien) + '</span>' : ''}</td></tr>`).join("") + "</tbody>" : "";
  actualizarEnsayo();
}
function actualizarEnsayo() {                 // se llama cada segundo: solo refresca los textos que cambian, sin tocar lo que se está escribiendo
  const s = transcurrido(), cr = $("c-crono"), rj = $("c-reloj"); if (rj) rj.textContent = horaTxt(new Date()); if (cr) cr.textContent = s === null ? "—" : (s < 0 ? "−" : "") + hhmmss(s);
  C().puntos.filter(p => p.rol === "monitoreo").forEach(p => { const e = $("st-" + p.id), k = $("card-" + p.id); if (!e) return; const r = estadoEstacion(p); if (e.innerHTML !== r.h) e.innerHTML = r.h; if (k) k.className = "card est " + r.cl; });
}
setInterval(() => { revisarAvisos(); if (TAB === "camp") actualizarEnsayo(); }, 1000);

// ------------------------------------------------------------------ FOTOS: registro fotográfico por punto y de la inyección (las imágenes viven en IndexedDB; los datos de cada foto, en la campaña)
const ETQ_PUNTO = ["Vista general del sitio", "Sección transversal", "Hacia aguas arriba", "Hacia aguas abajo", "Sonda instalada", "Punto de inyección", "Vertimiento / afluente", "Otra"];
const ETQ_INY = ["Sal pesada", "Mezcla (agua + sal)", "Momento de la inyección", "Otra"];
const ETQ_EST = ["Sonda instalada", "Lectura o pico en la sonda", "Otra"];
const FDB = {
  db: null,
  abrir() { return this.db ? Promise.resolve(this.db) : new Promise((res, rej) => { const r = indexedDB.open("ccp-campo-fotos", 1); r.onupgradeneeded = () => r.result.createObjectStore("fotos", {keyPath: "id"}); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => rej(r.error); }); },
  async tx(modo, fn) { const db = await this.abrir(); return new Promise((res, rej) => { const t = db.transaction("fotos", modo), q = fn(t.objectStore("fotos")); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error); }); },
  poner(r) { return this.tx("readwrite", s => s.put(r)); }, obtener(id) { return this.tx("readonly", s => s.get(id)); }, borrar(id) { return this.tx("readwrite", s => s.delete(id)); }
};
function procesarImagen(file, lineas, max = 1600) {      // reduce a 1600 px, dibuja un sello con los datos de la foto y genera una miniatura
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => { try {
      const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight)), w = Math.round(im.naturalWidth * k), h = Math.round(im.naturalHeight * k), cv = document.createElement("canvas"); cv.width = w; cv.height = h;
      const g = cv.getContext("2d"); g.drawImage(im, 0, 0, w, h);
      const m = 160 / Math.max(w, h), cm = document.createElement("canvas"); cm.width = Math.max(1, Math.round(w * m)); cm.height = Math.max(1, Math.round(h * m)); cm.getContext("2d").drawImage(im, 0, 0, cm.width, cm.height);
      if (lineas && lineas.length) { const fs = Math.max(12, Math.round(w / 38)), pd = Math.round(fs * 0.5), hh = Math.round(lineas.length * fs * 1.25 + pd * 2); g.fillStyle = "rgba(0,0,0,.55)"; g.fillRect(0, h - hh, w, hh); g.fillStyle = "#fff"; g.font = fs + "px sans-serif"; lineas.forEach((t, i) => g.fillText(t, pd, h - hh + pd + fs * 1.05 + i * fs * 1.25)); }
      const mini = cm.toDataURL("image/jpeg", 0.6);
      cv.toBlob(b => { URL.revokeObjectURL(url); b ? res({blob: b, w, h, mini}) : rej(new Error("no se pudo procesar la imagen")); }, "image/jpeg", 0.78);
    } catch (e) { URL.revokeObjectURL(url); rej(e); } };
    im.onerror = () => { URL.revokeObjectURL(url); rej(new Error("el archivo no es una imagen que el navegador pueda abrir")); };
    im.src = url;
  });
}
async function agregarFotos(files, ctx, puntoId, etiqueta) {
  const c = C(), p = puntoId ? punto(puntoId) : null; let n = 0;
  for (const f of files) {
    try {
      const iso = new Date().toISOString(), reciente = ULT && Date.now() - ULT.t < 120000;
      const pos = reciente ? {lat: ULT.lat, lon: ULT.lon, acc: Math.round(ULT.acc), pos_origen: "gps"} : p && isFinite(p.lat) ? {lat: p.lat, lon: p.lon, acc: p.acc ?? null, pos_origen: "punto"} : {};
      const sm = /^m:/.test(puntoId || "") ? SITIOS_M.find(x => x.k === puntoId.slice(2)) : null, lineas = [c.nombre, etiqueta + (p ? " · " + p.nombre : sm ? " · " + sm.n.slice(4) : ""), new Date(iso).toLocaleString("es-CO"), pos.lat != null ? pos.lat.toFixed(5) + ", " + pos.lon.toFixed(5) + (pos.acc ? " (±" + pos.acc + " m)" : "") + (pos.pos_origen === "punto" ? " del punto" : "") : "sin posición"];
      const r = await procesarImagen(f, lineas), id = "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      await FDB.poner({id, camp: c.id, blob: r.blob});
      (c.fotos = c.fotos || []).push({id, ctx, punto_id: puntoId || null, etiqueta, nota: "", iso, ...pos, w: r.w, h: r.h, kb: Math.round(r.blob.size / 1024), mini: r.mini}); guardar(); n++;
    } catch (e) { alert("No se pudo guardar la foto «" + (f.name || "") + "»: " + e.message); }
  }
  if (n) mostrar();
}
function fotosHtml(ctx, puntoId, etqs) {
  const c = C(), L = (c.fotos || []).filter(f => ctx === "inyeccion" ? f.ctx === "inyeccion" : f.punto_id === puntoId), k = ctx + "|" + (puntoId || "");
  return `<div class="fotos" style="margin:.4rem 0"><div class="nota"><b>Fotos (${L.length})</b></div><div style="display:flex;gap:.35rem;flex-wrap:wrap;margin:.3rem 0">${L.map(f => `<img src="${f.mini}" data-foto="${f.id}" alt="${esc(f.etiqueta)}" title="${esc(f.etiqueta)}" style="height:64px;border-radius:.3rem;border:1px solid var(--bd)">`).join("")}</div>
    <div style="display:flex;gap:.4rem;flex-wrap:wrap;align-items:center"><select data-fet="${k}" style="width:auto;flex:1 1 9rem">${etqs.map(t => `<option>${esc(t)}</option>`).join("")}</select>
    <label class="btnl">📷 Tomar foto<input type="file" accept="image/*" capture="environment" data-fup="${k}" hidden></label><label class="btnl">🖼 Galería<input type="file" accept="image/*" multiple data-fup="${k}" hidden></label></div></div>`;
}
document.addEventListener("change", ev => {
  const el = ev.target; if (!el.dataset || !el.dataset.fup) return;
  const [ctx, pid] = el.dataset.fup.split("|"), sel = document.querySelector(`select[data-fet="${el.dataset.fup}"]`), files = [...el.files]; el.value = "";
  if (files.length) agregarFotos(files, ctx, pid || null, sel ? sel.value : "");
});
document.addEventListener("click", ev => { const id = ev.target.dataset && ev.target.dataset.foto; if (id) abrirFoto(id); });
async function abrirFoto(id) {
  const c = C(), f = (c.fotos || []).find(x => x.id === id); if (!f) return;
  const r = await FDB.obtener(id).catch(() => null), url = r && r.blob ? URL.createObjectURL(r.blob) : null, p = f.punto_id ? punto(f.punto_id) : null, v = document.createElement("div");
  v.style.cssText = "position:fixed;inset:0;z-index:30;background:rgba(0,0,0,.92);color:#fff;display:flex;flex-direction:column;padding:.6rem;gap:.5rem;overflow:auto";
  v.innerHTML = `<div style="text-align:center">${url ? `<img src="${url}" style="max-width:100%;max-height:62vh;border-radius:.4rem">` : '<p>La imagen no está en este teléfono (solo se restauraron los datos). Restaure desde el archivo .zip para recuperarla.</p>'}</div>
    <div style="font-size:.9rem">${esc(f.etiqueta)}${p ? " · " + esc(p.nombre) : ""} · ${new Date(f.iso).toLocaleString("es-CO")}${f.lat != null ? " · " + f.lat.toFixed(5) + ", " + f.lon.toFixed(5) : ""}</div>
    <input id="v-nota" type="text" placeholder="Nota de la foto" value="${esc(f.nota)}"><div style="display:flex;gap:.5rem"><button class="b" id="v-ok" style="flex:1">Guardar y cerrar</button><button class="b r" id="v-del">Borrar foto</button></div>`;
  document.body.appendChild(v);
  const cerrar = () => { if (url) URL.revokeObjectURL(url); v.remove(); };
  v.querySelector("#v-ok").onclick = () => { f.nota = v.querySelector("#v-nota").value; guardar(); cerrar(); };
  v.querySelector("#v-del").onclick = async () => { if (!confirm("¿Borrar esta foto?")) return; c.fotos = c.fotos.filter(x => x.id !== id); await FDB.borrar(id).catch(() => {}); guardar(); cerrar(); mostrar(); };
}
// ---- .zip sin compresión (datos + fotos) para respaldar y compartir
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function crearZip(files) {
  const enc = new TextEncoder(), parts = [], cd = []; let off = 0;
  for (const f of files) {
    const nm = enc.encode(f.name), crc = crc32(f.data), h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(12, 0x21, true); h.setUint32(14, crc, true); h.setUint32(18, f.data.length, true); h.setUint32(22, f.data.length, true); h.setUint16(26, nm.length, true);
    parts.push(new Uint8Array(h.buffer), nm, f.data);
    const c = new DataView(new ArrayBuffer(46)); c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(14, 0x21, true); c.setUint32(16, crc, true); c.setUint32(20, f.data.length, true); c.setUint32(24, f.data.length, true); c.setUint16(28, nm.length, true); c.setUint32(42, off, true);
    cd.push(new Uint8Array(c.buffer), nm); off += 30 + nm.length + f.data.length;
  }
  const cdSize = cd.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22)); e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...cd, new Uint8Array(e.buffer)], {type: "application/zip"});
}
async function leerZip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf); let e = u8.length - 22; while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("no es un .zip válido"); const n = dv.getUint16(e + 10, true), dec = new TextDecoder(), out = new Map(); let p = dv.getUint32(e + 16, true);
  for (let i = 0; i < n; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const met = dv.getUint16(p + 10, true), csz = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true), name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true); let data = u8.subarray(ds, ds + csz);
    if (met === 8) data = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer()); else if (met !== 0) throw new Error("el .zip usa una compresión no compatible");
    out.set(name, data);
  }
  return out;
}
function marcarRespaldo() { C().exp = Date.now() + 1; guardar(true); pintarResp(); const u = $("ult-resp"); if (u) u.textContent = new Date(C().exp).toLocaleString("es-CO"); }
async function construirZip() {
  const c = C(), files = [{name: "campana.json", data: new TextEncoder().encode(JSON.stringify(datosExport(), null, 1))}];
  for (const f of c.fotos || []) { const r = await FDB.obtener(f.id).catch(() => null); if (r && r.blob) files.push({name: "fotos/" + f.id + ".jpg", data: new Uint8Array(await r.blob.arrayBuffer())}); }
  marcarRespaldo(); return crearZip(files);
}

// ------------------------------------------------------------------ VARIAS PERSONAS: rol de cada celular y combinación de las bitácoras
function rolActual() {
  const c = C(); if (!c.rol) c.rol = {tipo: "coordinador", punto_id: null, nombre: "", elegido: false};
  if (c.rol.tipo === "estacion" && !c.puntos.some(p => p.id === c.rol.punto_id)) { c.rol.tipo = "coordinador"; c.rol.punto_id = null; }
  return c.rol;
}
function rolEtiquetaDe(r, c) { if (!r) return "Sin rol"; return r.tipo === "inyeccion" ? "Inyección" : r.tipo === "estacion" ? "Estación " + (c.puntos.find(p => p.id === r.punto_id)?.nombre || "") : "Coordinador"; }
function quienSoy() { const c = C(), R = c.rol; return R ? rolEtiquetaDe(R, c) + (R.nombre ? " (" + R.nombre + ")" : "") : ""; }
function rolCard(c, RO, est) {
  const val = RO.tipo === "estacion" ? "est:" + RO.punto_id : RO.tipo;
  return `<details class="card" ${RO.elegido && RO.nombre ? "" : "open"}><summary><b>Mi rol: ${esc(rolEtiquetaDe(RO, c))}</b>${RO.nombre ? " · " + esc(RO.nombre) : ""} <span class="nota">· hora de este celular <b id="c-reloj">--:--:--</b></span></summary>
    <div class="fila" style="margin-top:.4rem"><label>Mi rol en el ensayo<select id="c-rol"><option value="coordinador"${val === "coordinador" ? " selected" : ""}>Coordinador (veo todo)</option><option value="inyeccion"${val === "inyeccion" ? " selected" : ""}>Inyección</option>${est.map(p => `<option value="est:${p.id}"${val === "est:" + p.id ? " selected" : ""}>Estación: ${esc(p.nombre)}</option>`).join("")}</select></label>${campo("Mi nombre", "rol.nombre", "t", RO.nombre)}</div>
    <p class="nota">Cada persona elige su rol en su propio celular y verá solo lo suyo. Antes de empezar, compare la <b>hora de este celular</b> con la de los demás: con la hora automática activada deben coincidir al segundo. Quien inyecta dice por radio la hora exacta y los de las estaciones la escriben (o tocan «Ya inyectaron» al oírla). Al terminar, cada uno envía su archivo al coordinador, que los combina en «Guardar».</p></details>`;
}
document.addEventListener("change", ev => {
  if (ev.target.id !== "c-rol") return; const v = ev.target.value, RO = rolActual();
  if (v.startsWith("est:")) { RO.tipo = "estacion"; RO.punto_id = v.slice(4); } else { RO.tipo = v; RO.punto_id = null; }
  RO.elegido = true; guardar(); pintarCampana();
});
function decidir(texto, opciones) {
  return new Promise(res => {
    const v = document.createElement("div"); v.style.cssText = "position:fixed;inset:0;z-index:40;background:rgba(0,0,0,.6);display:flex;align-items:center;justify-content:center;padding:1rem";
    v.innerHTML = `<div style="background:#fff;border-radius:.7rem;padding:1rem;max-width:26rem;width:100%"><p style="margin:0 0 .8rem">${esc(texto)}</p>${opciones.map(([k, t], i) => `<button class="b ${i ? "g" : ""}" data-op="${k}" style="width:100%;margin:.2rem 0">${esc(t)}</button>`).join("")}</div>`;
    document.body.appendChild(v); v.querySelectorAll("[data-op]").forEach(b => b.onclick = () => { v.remove(); res(b.dataset.op); });
  });
}
function combinarCampanas(a, b, d) {          // suma a la campaña a lo que trae b (de otro celular): lo propio de cada estación manda; lo que falta se completa
  const rolB = d.rol || null, r = {pt: 0, ev: 0, fo: 0, af: 0, reg: []}, vacio = v => v === null || v === undefined || v === "";
  let ult = -1;
  b.puntos.forEach(pb => {
    const i = a.puntos.findIndex(x => x.id === pb.id);
    if (i >= 0) { const pa = a.puntos[i]; ["cota", "cota_origen", "alt_gps", "alt_acc", "acc"].forEach(k => { if (vacio(pa[k]) && !vacio(pb[k])) pa[k] = pb[k]; }); const h = {...(pb.hid || {})}; Object.entries(pa.hid || {}).forEach(([k, v]) => { if (!vacio(v)) h[k] = v; }); pa.hid = h; ult = i; }
    else { if (ult < 0) { a.puntos.push(pb); } else { a.puntos.splice(ult + 1, 0, pb); ult++; } r.pt++; }
  });
  b.tramos.forEach(t => { if (!a.tramos.some(x => x.id === t.id)) a.tramos.push(t); });
  Object.entries(b.registros || {}).forEach(([id, rb]) => {
    const duenoB = rolB && rolB.tipo === "estacion" && rolB.punto_id === id, ra = a.registros[id] || (a.registros[id] = {}); let n = 0;
    Object.entries(rb).forEach(([k, v]) => { if (vacio(v)) return; if (duenoB || vacio(ra[k])) { if (ra[k] !== v) n++; ra[k] = v; } });
    if (n) r.reg.push(a.puntos.find(p => p.id === id)?.nombre || id);
  });
  const ia = a.inyeccion, ib = b.inyeccion, peso = i => i.t0_iso ? (i.origen === "recibida" ? 1 : 2) : 0, prefB = peso(ib) > peso(ia) || (rolB && rolB.tipo === "inyeccion" && peso(ib) >= peso(ia));
  if (prefB) { ia.hora = ib.hora; ia.t0_iso = ib.t0_iso; ia.origen = ib.origen; }
  ["masa_kg", "pureza", "agua_l", "sal"].forEach(k => { if (!vacio(ib[k]) && (prefB || vacio(ia[k]))) ia[k] = ib[k]; });
  const llave = e => e.iso + "|" + e.texto; const have = new Set(a.eventos.map(llave));
  b.eventos.forEach(e => { if (!have.has(llave(e))) { a.eventos.push(e); r.ev++; } }); a.eventos.sort((x, y) => x.iso < y.iso ? -1 : 1);
  const hayA = new Set((a.fotos || []).map(f => f.id)); a.fotos = a.fotos || [];
  (b.fotos || []).forEach(f => { if (!hayA.has(f.id)) { a.fotos.push(f); r.fo++; } });
  const kaf = x => JSON.stringify([x.punto, x.q_ls, x.hora, x.metodo]), haf = new Set(a.aforos.map(kaf));
  b.aforos.forEach(x => { if (!haf.has(kaf(x))) { a.aforos.push(x); r.af++; } });
  const ea = ens(); if (b.ensayo && ea.estado !== "terminado" && b.ensayo.estado === "terminado") { ea.estado = "terminado"; ea.t_fin_iso = b.ensayo.t_fin_iso; }
  ["responsable", "cuadrilla", "clima"].forEach(k => { if (vacio(a[k]) && !vacio(b[k])) a[k] = b[k]; });
  if (!vacio(b.observaciones) && !(a.observaciones || "").includes(b.observaciones)) a.observaciones = (a.observaciones ? a.observaciones + "\n" : "") + "— " + rolEtiquetaDe(rolB, b) + (rolB?.nombre ? " (" + rolB.nombre + ")" : "") + ": " + b.observaciones;
  if (!a.programacion && b.programacion) a.programacion = b.programacion;
  r.mu = typeof combinarMuestreo === "function" ? combinarMuestreo(a, b.muestreo) : 0;
  if (!(a.aportes || []).some(x => x.exportado && x.exportado === d.exportado && JSON.stringify(x.rol) === JSON.stringify(rolB))) a.aportes = [...(a.aportes || []), {rol: rolB, exportado: d.exportado || null, eventos: r.ev, fotos: r.fo}];
  return `+${r.ev} eventos, +${r.fo} fotos, +${r.af} aforos${r.mu ? ", +" + r.mu + " datos de muestreo" : ""}${r.pt ? ", +" + r.pt + " puntos" : ""}; registros de: ${r.reg.length ? r.reg.join(", ") : "ninguna estación"}.`;
}

// ------------------------------------------------------------------ GUARDAR (exportar / importar)
const slug = t => (t || "campana").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
const base = () => "campo_trazadores_" + slug(C().nombre) + "_" + C().fecha;
function descargar(blob, nombre) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function datosExport() {
  const c = C(), A = abscisas(), L = enlaces(), ii = c.puntos.findIndex(p => p.rol === "inyeccion");
  return {formato: "ccp-bitacora-trazadores", version: 2, proyecto_id: null, campana_id: c.id, exportado: new Date().toISOString(), campana: {nombre: c.nombre, fecha: c.fecha, responsable: c.responsable, cuadrilla: c.cuadrilla, clima: c.clima},
    inyeccion: {masa_kg: c.inyeccion.masa_kg, pureza: c.inyeccion.pureza, agua_l: c.inyeccion.agua_l, hora: c.inyeccion.hora, t0_iso: c.inyeccion.t0_iso, sal: c.inyeccion.sal, origen: c.inyeccion.origen || null, punto: c.puntos[ii]?.nombre || ""},
    puntos: c.puntos.map((p, i) => ({id: p.id, nombre: p.nombre, rol: p.rol, lat: p.lat, lon: p.lon, precision_m: p.acc, cota: p.cota ?? null, cota_origen: p.cota_origen ?? null, alt_gps: p.alt_gps ?? null, alt_acc: p.alt_acc ?? null, notas: p.notas, abscisa_m: A[i], dist_anterior_m: i ? L[i - 1].d : null, dist_recta_anterior_m: i ? L[i - 1].recta : null, origen_distancia: i ? L[i - 1].origen : null, dist_desde_inyeccion_m: ii >= 0 && A[i] !== null && A[ii] !== null ? A[i] - A[ii] : null, hidraulica: p.hid})),
    fotos: c.fotos || [], muestreo: typeof muestreoExport === "function" ? muestreoExport() : null, rol: c.rol || null, aportes: c.aportes || [], ensayo: {estado: ens().estado, t_fin_iso: ens().t_fin_iso, check: ens().check || {}}, tramos: c.tramos, parametros: c.params, programacion: c.programacion, registro_estaciones: Object.fromEntries(Object.entries(c.registros).map(([id, r]) => [punto(id)?.nombre || id, r])), aforos: c.aforos, eventos: c.eventos, observaciones: c.observaciones};
}
function blobJson() { const b = new Blob([JSON.stringify(datosExport(), null, 1)], {type: "application/json"}); C().exp = Date.now() + 1; guardar(true); pintarResp(); const u = $("ult-resp"); if (u) u.textContent = new Date(C().exp).toLocaleString("es-CO"); return b; }
function csv() {
  const c = C(), d = datosExport(), q = v => '"' + String(v ?? "").replace(/"/g, '""') + '"', L = [];
  L.push(["Campaña", c.nombre], ["Fecha", c.fecha], ["Responsable", c.responsable], ["Cuadrilla", c.cuadrilla], ["Condiciones", c.clima], [], ["Masa de sal (kg)", c.inyeccion.masa_kg], ["Pureza", c.inyeccion.pureza], ["Agua (L)", c.inyeccion.agua_l], ["Hora de inyección", c.inyeccion.hora], ["Sal", c.inyeccion.sal], ["Estado del ensayo", ens().estado], ["Fin del ensayo", ens().t_fin_iso || ""], [],
    ["N°", "Punto", "Función", "Latitud", "Longitud", "Precisión (m)", "Abscisa (m)", "Dist. recta al anterior (m)", "Dist. real al anterior (m)", "Origen de la distancia", "Dist. desde inyección (m)", "Cota (m)", "Sonda", "Inicio real", "Fin real", "EC fondo", "Hora del pico", "Notas"]);
  d.puntos.forEach((p, i) => { const r = c.registros[p.id] || {}; L.push([i + 1, p.nombre, p.rol, p.lat, p.lon, p.precision_m, p.abscisa_m?.toFixed(1), p.dist_recta_anterior_m?.toFixed(1), p.dist_anterior_m?.toFixed(1), p.origen_distancia, p.dist_desde_inyeccion_m?.toFixed(1), p.cota, r.sonda, r.inicio, r.fin, r.ec_fondo, r.pico, p.notas || r.notas]); });
  L.push([], ["Aforo: punto", "Q (L/s)", "Hora", "Método"]); c.aforos.forEach(a => L.push([a.punto, a.q_ls, a.hora, a.metodo]));
  L.push([], ["Hora", "Evento"]); c.eventos.forEach(e => L.push([e.hora, e.texto])); L.push([], ["Observaciones", c.observaciones]); if (typeof muestreoCsv === "function") muestreoCsv().forEach(r => L.push(r));
  return new Blob(["﻿" + L.map(r => r.map(q).join(";")).join("\r\n")], {type: "text/csv;charset=utf-8"});
}
function gpx() {
  const c = C(), x = esc;
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Campo trazadores" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${x(c.nombre)}</name></metadata>\n` + c.puntos.filter(p => isFinite(p.lat)).map(p => `<wpt lat="${p.lat}" lon="${p.lon}">${p.cota != null ? "<ele>" + p.cota + "</ele>" : ""}<name>${x(p.nombre)}</name><desc>${x(ROLES.find(r => r[0] === p.rol)?.[1] || "")}${p.acc ? " · ±" + p.acc + " m" : ""}</desc></wpt>`).join("\n") + "\n" +
    c.tramos.filter(t => t.linea && t.linea.length > 1).map(t => `<trk><name>${x((punto(t.de)?.nombre || "?") + " → " + (punto(t.a)?.nombre || "?"))}</name><trkseg>` + t.linea.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}"></trkpt>`).join("") + "</trkseg></trk>").join("\n") + "\n</gpx>\n"], {type: "application/gpx+xml"});
}
function kml() {                                           // puntos + la línea del cauce medida en el mapa (o la recta si no se midió), en el orden del río (para cargarlos en el paso 1 de la plataforma)
  const c = C(), x = esc; let ruta = [];
  for (let i = 1; i < c.puntos.length; i++) { const a = c.puntos[i - 1], b = c.puntos[i], t = tramoEntre(a.id, b.id); let ps = t && t.linea && t.linea.length > 1 ? t.linea.map(p => [p[0], p[1]]) : [[a.lat, a.lon], [b.lat, b.lon]]; if (t && t.de === b.id) ps = ps.reverse(); ruta = ruta.concat(ps); }
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${x(c.nombre)}</name>\n` + c.puntos.filter(p => isFinite(p.lat)).map(p => `<Placemark><name>${x(p.nombre)}</name><description>${x(ROLES.find(r => r[0] === p.rol)?.[1] || "")}${p.acc ? " · ±" + p.acc + " m" : ""}</description><Point><coordinates>${p.lon},${p.lat},${p.cota ?? 0}</coordinates></Point></Placemark>`).join("\n") +
    (ruta.length > 1 ? `\n<Placemark><name>Cauce</name><LineString><tessellate>1</tessellate><coordinates>${ruta.map(p => p[1] + "," + p[0] + ",0").join(" ")}</coordinates></LineString></Placemark>` : "") + "\n</Document></kml>\n"], {type: "application/vnd.google-earth.kml+xml"});
}
let PROMPT_INSTALAR = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); PROMPT_INSTALAR = e; if (TAB === "exp") pintarGuardar(); });
function pintarGuardar() {
  const c = C(), ios = /iphone|ipad/i.test(navigator.userAgent), instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  $("t-exp").innerHTML = `<h2>Sacar los datos del teléfono</h2><div class="card" style="border-color:var(--am)"><b>¿Dónde queda lo que escribo?</b><p class="nota">Se guarda solo, automáticamente, <b>dentro de este navegador del teléfono</b>. Si borra la app, la desinstala o limpia los datos del navegador, <b>se pierde</b>. La copia segura es el archivo <b>.json</b>: descárguelo o compártalo (WhatsApp, correo, Drive) al terminar cada tramo del trabajo y siempre antes de borrar o reinstalar la app. Almacenamiento protegido por el navegador: <b>${DB.persistente ? "sí" : "no confirmado"}</b>.</p><p class="nota"><b>Varias personas:</b> para repartir la campaña, el coordinador toca «Compartir» y los demás cargan ese archivo; cada uno elige su rol en «Ensayo». Al terminar, cada uno envía su archivo al coordinador, que los carga aquí y elige <b>«Combinar»</b> (puede elegir varios archivos a la vez).</p></div>
    <p class="nota">Campaña: <b>${esc(c.nombre)}</b> · ${c.puntos.length} puntos · ${c.tramos.filter(t => t.manual_m > 0).length} distancias reales · último respaldo: <b id="ult-resp">${c.exp ? new Date(c.exp).toLocaleString("es-CO") : "ninguno"}</b>.</p>
    <div class="card"><button class="b" id="x-comp" style="width:100%;margin:.2rem 0">Compartir / enviar (WhatsApp, correo, Drive…)</button>
    <button class="b g" id="x-zip" style="width:100%;margin:.2rem 0">Descargar todo con fotos (.zip)</button><button class="b g" id="x-json" style="width:100%;margin:.2rem 0">Descargar solo los datos (.json)</button><button class="b g" id="x-kml" style="width:100%;margin:.2rem 0">Puntos y cauce (.kml) — para Google Earth y el paso 1</button>
    <button class="b g" id="x-gpx" style="width:100%;margin:.2rem 0">Puntos y cauce (.gpx)</button><button class="b g" id="x-csv" style="width:100%;margin:.2rem 0">Resumen (.csv) — para Excel</button><p class="nota" id="x-msg"></p></div>
    <h2>Cargar una campaña guardada</h2><div class="card"><input type="file" id="x-file" accept="*/*" multiple><p class="nota" id="x-file-msg" style="font-weight:600"></p><p class="nota">Para continuar una campaña o recuperarla (el archivo .json de «Descargar todo» o «Compartir»). Si el selector solo muestra el teléfono, toque el menú ☰ (arriba a la izquierda) y elija <b>Drive</b>; si Drive no aparece, abra el archivo en la app de Drive, toque ⋮ → <b>Descargar</b> y búsquelo en «Descargas».</p></div>
    <details class="card"><summary><b>Si no logra elegir el archivo: pegar su contenido</b></summary><p class="nota">Abra el .json en el teléfono (Drive lo muestra como texto), toque «seleccionar todo», copie y pegue aquí.</p><textarea id="x-pegar" placeholder="Pegue aquí todo el texto del archivo .json" style="min-height:6rem"></textarea><button class="b g" id="x-pegar-ok" style="margin-top:.4rem">Cargar el texto pegado</button></details>
    <h2>Campañas en este teléfono</h2><div class="card">${DB.campanas.map(k => `<div class="pt" style="padding:.25rem 0"><span>${esc(k.nombre)} <span class="nota">(${k.puntos.length} puntos)</span></span>${DB.campanas.length > 1 ? `<button class="b g p" data-del="${k.id}" style="color:var(--ro)">Borrar</button>` : ""}</div>`).join("")}</div>
    <h2>Instalar en el celular</h2><div class="card">${instalada ? "<p>✔ Ya está instalada.</p>" : PROMPT_INSTALAR ? '<button class="b" id="x-inst" style="width:100%">Anclar a la pantalla de inicio</button>' : ios ? '<p class="nota">En iPhone: abra esta página en Safari, toque el botón Compartir y elija «Agregar a pantalla de inicio».</p>' : '<p class="nota">En Android: menú ⋮ del navegador → «Instalar aplicación» o «Agregar a pantalla de inicio». Si no aparece, la página debe abrirse con https://.</p>'}
    <p class="nota">${"serviceWorker" in navigator && navigator.serviceWorker.controller ? "✔ Guardada para trabajar sin internet." : "Aún no está guardada para usarla sin internet (ábrala una vez con conexión)."}</p>
    <p class="nota">Versión de la app: <b>${APP_VERSION}</b>. Si no ve los cambios más recientes, conéctese a internet y toque el botón: baja la versión nueva <b>sin borrar sus campañas ni fotos</b>.</p><button class="b g" id="x-act" style="width:100%">Actualizar la app ahora</button></div>`;
  if ($("x-act")) $("x-act").onclick = actualizarApp;
  $("x-zip").onclick = async () => { descargar(await construirZip(), base() + ".zip"); $("x-msg").textContent = "Descargado (carpeta Descargas): incluye los datos y las fotos."; };
  $("x-json").onclick = () => { descargar(blobJson(), base() + ".json"); $("x-msg").textContent = "Descargado (carpeta Descargas)."; };
  $("x-csv").onclick = () => descargar(csv(), base() + ".csv"); $("x-gpx").onclick = () => descargar(gpx(), base() + ".gpx"); $("x-kml").onclick = () => descargar(kml(), base() + ".kml");
  $("x-comp").onclick = async () => { const conFotos = (c.fotos || []).length > 0, f = conFotos ? new File([await construirZip()], base() + ".zip", {type: "application/zip"}) : new File([blobJson()], base() + ".json", {type: "application/json"}); if (navigator.canShare && navigator.canShare({files: [f]})) { try { await navigator.share({files: [f], title: c.nombre}); $("x-msg").textContent = "Enviado."; } catch (e) { if (e.name !== "AbortError") $("x-msg").textContent = "No se pudo compartir: " + e.message; } } else { descargar(f, f.name); $("x-msg").textContent = "Este navegador no comparte archivos: se descargó."; } };
  const msgArchivo = (t, err) => { const m = $("x-file-msg"); if (m) { m.style.color = err ? "var(--ro)" : "var(--ok)"; m.textContent = t; } if (err) alert(t); };
  const colocar = (k, blobs) => { DB.campanas = DB.campanas.filter(x => x.id !== k.id); DB.campanas.push(k); k.exp = k.mod = Date.now() + 1; DB.activa = k.id; guardar(true); pintarCabecera(); pintarGuardar(); if (blobs) blobs.forEach((bl, id) => FDB.poner({id, camp: k.id, blob: bl}));
    msgArchivo("✔ Campaña cargada: " + k.nombre + " (" + k.puntos.length + " puntos" + (k.fotos.length ? ", " + k.fotos.length + " fotos" + (blobs ? "" : " — sin las imágenes: use el .zip para recuperarlas") : "") + "). Ahora elija su rol en la pestaña «Ensayo»."); };
  const importar = (texto, blobs) => { try { const d = JSON.parse(texto); if (d.formato !== "ccp-bitacora-trazadores" || d.version !== 2) throw new Error("No es un archivo de esta app."); const k = nueva(d.campana?.nombre); Object.assign(k, {id: d.campana_id || k.id, fotos: d.fotos || [], nombre: d.campana?.nombre || k.nombre, fecha: d.campana?.fecha || k.fecha, responsable: d.campana?.responsable || "", cuadrilla: d.campana?.cuadrilla || "", clima: d.campana?.clima || "", observaciones: d.observaciones || "",
      puntos: (d.puntos || []).map(p => ({id: p.id, nombre: p.nombre, rol: p.rol, lat: p.lat, lon: p.lon, acc: p.precision_m, cota: p.cota ?? null, cota_origen: p.cota_origen ?? null, alt_gps: p.alt_gps ?? null, alt_acc: p.alt_acc ?? null, notas: p.notas || "", hid: p.hidraulica || {}})), tramos: d.tramos || [], params: {...PARAM0, ...(d.parametros || {})}, aforos: d.aforos || [], eventos: d.eventos || [], programacion: d.programacion || null,
      inyeccion: {...k.inyeccion, masa_kg: d.inyeccion?.masa_kg ?? null, pureza: d.inyeccion?.pureza ?? 0.95, agua_l: d.inyeccion?.agua_l ?? null, hora: d.inyeccion?.hora || "", t0_iso: d.inyeccion?.t0_iso || null, sal: d.inyeccion?.sal || "", origen: d.inyeccion?.origen || null}});
      k.ensayo = d.ensayo ? {estado: d.ensayo.estado || "preparando", t_fin_iso: d.ensayo.t_fin_iso || null, check: d.ensayo.check || {}, avisos: {}} : undefined; k.registros = {}; Object.entries(d.registro_estaciones || {}).forEach(([nom, r]) => { const p = k.puntos.find(x => x.nombre === nom); if (p) k.registros[p.id] = r; });
      k.aportes = d.aportes || []; k.muestreo = typeof muestreoImport === "function" ? muestreoImport(d.muestreo) : undefined; const prev = DB.campanas.find(x => x.id === k.id);
      if (prev) return decidir("Ya tiene la campaña «" + prev.nombre + "» en este teléfono. ¿Qué hace con el archivo?", [["combinar", "Combinar: sumar lo nuevo"], ["reemplazar", "Reemplazar la campaña"], ["cancelar", "Cancelar"]]).then(op => {
        if (op === "cancelar") return msgArchivo("Carga cancelada.");
        if (op === "reemplazar") return colocar(k, blobs);
        const resumen = combinarCampanas(prev, k, d); if (blobs) blobs.forEach((bl, id) => FDB.poner({id, camp: prev.id, blob: bl})); DB.activa = prev.id; guardar(); pintarCabecera(); pintarGuardar(); msgArchivo("✔ Combinada con «" + prev.nombre + "»: " + resumen); });
      const act = DB.campanas.find(x => x.id === DB.activa);
      if (act && !act.puntos.length && !(act.fotos || []).length && DB.campanas.length === 1) { DB.campanas = []; return colocar(k, blobs); }
      if (act) return decidir("Este archivo es de otra campaña («" + k.nombre + "»). Si es lo que registró otra persona del mismo ensayo, súmelo a la campaña activa «" + act.nombre + "».", [["sumar", "Sumar a «" + act.nombre + "» (datos de otra persona)"], ["aparte", "Cargar como campaña aparte"], ["cancelar", "Cancelar"]]).then(op => {
        if (op === "cancelar") return msgArchivo("Carga cancelada.");
        if (op === "aparte") return colocar(k, blobs);
        const resumen = combinarCampanas(act, k, d); if (blobs) blobs.forEach((bl, id) => FDB.poner({id, camp: act.id, blob: bl})); guardar(); pintarCabecera(); pintarGuardar(); msgArchivo("✔ Sumada a «" + act.nombre + "»: " + resumen + " Revise el orden de los puntos (↑ ↓) en la pestaña Puntos."); });
      colocar(k, blobs);
    } catch (e) { msgArchivo(e instanceof SyntaxError ? "El archivo no es un .json válido (¿está incompleto o es otro tipo de archivo?)." : "No se pudo cargar: " + e.message, true); } };
  const leer = f => new Promise((res, rej) => { try { f.text().then(res, () => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("leer")); r.readAsText(f); }); } catch (e) { rej(e); } });
  const importarArchivo = async f => {
    const buf = await (f.arrayBuffer ? f.arrayBuffer().catch(() => null) : null) || await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("leer")); r.readAsArrayBuffer(f); }), b2 = new Uint8Array(buf, 0, 2);
    if (b2[0] === 0x50 && b2[1] === 0x4b) {                                             // .zip: datos + fotos
      const m = await leerZip(buf); let j = m.get("campana.json"); if (!j) { const k = [...m.keys()].find(n => /(^|[\/\\])campana\.json$/i.test(n)); if (k) j = m.get(k); } if (!j) throw new Error("el .zip no trae campana.json (trae: " + [...m.keys()].slice(0, 4).join(", ") + ")"); const blobs = new Map();
      m.forEach((data, name) => { const q = name.match(/(?:^|[\/\\])fotos[\/\\]([^\/\\]+)\.jpe?g$/i); if (q) blobs.set(q[1], new Blob([data], {type: "image/jpeg"})); });
      await importar(new TextDecoder().decode(j), blobs);
    } else await importar(new TextDecoder().decode(buf));
  };
  $("x-file").onchange = async ev => { const fs = [...ev.target.files]; if (!fs.length) return;
    for (const f of fs) { msgArchivo("Leyendo «" + f.name + "» (" + Math.max(1, Math.round(f.size / 1024)) + " KB)…");
      try { await importarArchivo(f); } catch (e) { msgArchivo("No se pudo leer «" + f.name + "» (" + (e && e.message || e) + "). Si está en Drive: ábralo en la app de Drive, toque ⋮ → Descargar, y elíjalo desde «Descargas»; o use «pegar su contenido» aquí abajo.", true); } }
    ev.target.value = ""; };
  $("x-pegar-ok").onclick = () => { const t = $("x-pegar").value.trim(); if (!t) return msgArchivo("Pegue primero el texto del archivo.", true); importar(t); };
  document.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { const k = DB.campanas.find(x => x.id === b.dataset.del); if (confirm("¿Borrar «" + k.nombre + "» de este teléfono? Si no la descargó, se pierde (también sus fotos).")) { (k.fotos || []).forEach(f => FDB.borrar(f.id).catch(() => {})); DB.campanas = DB.campanas.filter(x => x !== k); if (DB.activa === k.id) DB.activa = DB.campanas[0].id; guardar(); pintarCabecera(); pintarGuardar(); } });
  if ($("x-inst")) $("x-inst").onclick = async () => { PROMPT_INSTALAR.prompt(); await PROMPT_INSTALAR.userChoice; PROMPT_INSTALAR = null; pintarGuardar(); };
}

// ------------------------------------------------------------------ arranque
const APP_VERSION = "campo-v36";
if ("serviceWorker" in navigator) {
  const habiaControl = !!navigator.serviceWorker.controller; let recargado = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => { if (!habiaControl || recargado) return; recargado = true; location.reload(); });      // versión nueva lista: recarga (los datos están en el teléfono)
  navigator.serviceWorker.register("sw.js").then(r => r.update && r.update()).catch(() => {});
}
async function actualizarApp() {
  try { const rs = await navigator.serviceWorker.getRegistrations(); await Promise.all(rs.map(r => r.unregister())); const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); } catch (e) {}
  location.reload();
}
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(ok => { DB.persistente = ok; guardar(true); }); } catch (e) {}
pintarCabecera(); pintarGPS(); mostrar();
