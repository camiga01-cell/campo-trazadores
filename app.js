"use strict";
// Campo · trazadores: app autónoma (sin servidor). Datos en el teléfono (localStorage); se exportan a JSON / CSV / GPX / KML.
const $ = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[c]));
const nf = (v, d = 1) => v === null || v === undefined || !isFinite(v) ? "—" : Number(v).toLocaleString("es-CO", {minimumFractionDigits: d, maximumFractionDigits: d});
const pad = n => String(n).padStart(2, "0");
const horaTxt = f => pad(f.getHours()) + ":" + pad(f.getMinutes()) + ":" + pad(f.getSeconds());
const ROLES = [["inyeccion", "Inyección del trazador"], ["monitoreo", "Estación de monitoreo"], ["vertimiento", "Vertimiento"], ["afluente", "Afluente"], ["otro", "Otro"]];
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
    for (const k of Object.keys(etq)) if (!(e[k] > 0)) throw new Error("«" + nom + "»: falta " + etq[k] + (k === "x_m" ? " (grabe el recorrido o escríbala)." : "."));
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

// distancias por el recorrido: puntos en el orden del río (aguas arriba → aguas abajo); cada par consecutivo usa el tramo grabado que los une
function tramoEntre(a, b) { const T = C().tramos.filter(t => (t.de === a && t.a === b) || (t.de === b && t.a === a)); return T.length ? T[T.length - 1] : null; }
function enlaces() {
  const P = C().puntos, L = [];
  for (let i = 1; i < P.length; i++) {
    const t = tramoEntre(P[i - 1].id, P[i].id), recta = hav([P[i - 1].lat, P[i - 1].lon], [P[i].lat, P[i].lon]);
    if (t && t.manual_m > 0) L.push({d: t.manual_m, origen: "escrita"}); else if (t) L.push({d: t.dist_m, origen: "recorrido"});
    else if (isFinite(recta)) L.push({d: recta, origen: "línea recta"}); else L.push({d: null, origen: "sin dato"});
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
let watchId = null, ULT = null, REC = null, SEGURA = window.isSecureContext && "geolocation" in navigator, WAKE = null;
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
  if (REC) {
    const A = DB.ajustes, u = REC.pts[REC.pts.length - 1];
    if (ULT.acc <= A.acc_max && (!u || hav([u[0], u[1]], [ULT.lat, ULT.lon]) >= Math.max(A.paso_min, ULT.acc * 0.5))) { REC.pts.push([ULT.lat, ULT.lon, ULT.t, Math.round(ULT.acc), ULT.alt ?? null]); pintarRecorrido(); }
    else pintarRecorrido();
  }
}
function pintarGPS() {
  const e = $("gps-est"), b = $("gps-btn");
  if (!SEGURA) e.textContent = "GPS no disponible aquí (se necesita https://): escriba las coordenadas a mano";
  else if (watchId === null) e.textContent = "GPS apagado";
  else if (!ULT) e.textContent = "GPS buscando señal…";
  else { const ok = ULT.acc <= 10 ? "🟢" : ULT.acc <= 25 ? "🟡" : "🔴"; e.textContent = ok + " ±" + Math.round(ULT.acc) + " m · " + ULT.lat.toFixed(5) + ", " + ULT.lon.toFixed(5); }
  b.innerHTML = SEGURA ? `<button class="b g p" id="gps-tog">${watchId === null ? "Encender GPS" : "Apagar GPS"}</button>` : "";
  if ($("gps-tog")) $("gps-tog").onclick = () => watchId === null ? iniciarGPS() : (REC ? alert("Detenga primero el recorrido.") : detenerGPS());
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
  const e = $("resp"); if (!e) return; const c = C(), hay = c.puntos.length || c.eventos.length || c.aforos.length || c.inyeccion.masa_kg, sin = hay && c.mod && (!c.exp || c.mod > c.exp);
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
  ({pun: pintarPuntos, rec: pintarRecorrido, prog: pintarProg, camp: pintarCampana, exp: pintarGuardar})[TAB](); pintarResp();
}
function pintarCabecera() {
  $("sel-camp").innerHTML = DB.campanas.map(c => `<option value="${c.id}"${c.id === DB.activa ? " selected" : ""}>${esc(c.nombre)}</option>`).join("") + '<option value="__nueva">+ Nueva campaña…</option>';
}
$("sel-camp").onchange = ev => { if (ev.target.value === "__nueva") { const n = prompt("Nombre de la nueva campaña (p. ej. el proyecto y la fecha):"); if (n) { const c = nueva(n); DB.campanas.push(c); DB.activa = c.id; guardar(); } } else { if (REC) { alert("Detenga primero el recorrido."); pintarCabecera(); return; } DB.activa = ev.target.value; guardar(); } pintarCabecera(); mostrar(); };

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

// ------------------------------------------------------------------ mapa: proyección Web Mercator centrada; fondo de calle o satélite si hay internet (si no, solo puntos y recorridos)
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
function refreshMapa() { const el = $("mapa-caja") || $("rec-mapa"); if (el) el.innerHTML = mapaSVG(); }
document.addEventListener("click", ev => { const id = ev.target.id; if (!["mz-menos", "mz-mas", "mz-ajustar"].includes(id)) return; const k = DB.ajustes.zoomMapa || 0; DB.ajustes.zoomMapa = id === "mz-mas" ? Math.min(6, k + 1) : id === "mz-menos" ? Math.max(-4, k - 1) : 0; guardar(); refreshMapa(); });
let FALLAS = 0;
function fondoFalla() { FALLAS++; const n = $("mapa-nota"); if (n) n.textContent = "⚠ No cargó el fondo del mapa: revise la conexión a internet, o cambie a «Sin fondo». (Sin internet solo se ven los puntos y recorridos.)"; }
function fondoOk() { const n = $("mapa-nota"); if (n && FALLAS) { FALLAS = 0; n.textContent = ""; } }
function selectorFondo() { return `<label style="margin:.3rem 0">Fondo del mapa<select id="mapa-fondo"><option value="ninguno">Sin fondo (funciona sin internet)</option>${Object.entries(FONDOS).map(([k, f]) => `<option value="${k}"${DB.ajustes.fondo === k ? " selected" : ""}>${f.t}</option>`).join("")}</select></label><div style="display:flex;gap:.4rem;align-items:center;flex-wrap:wrap;margin:.3rem 0"><button class="b g p" id="mz-menos" aria-label="Alejar">−</button><button class="b g p" id="mz-mas" aria-label="Acercar">+</button><button class="b g p" id="mz-ajustar">Ajustar a los puntos</button><span class="nota" id="mapa-info"></span></div><div class="nota" id="mapa-nota">${DB.ajustes.fondo !== "ninguno" && navigator.onLine === false ? "⚠ Sin internet: no se ve el fondo, solo los puntos y recorridos." : ""}</div>`; }
document.addEventListener("change", ev => { if (ev.target.id === "mapa-fondo") { DB.ajustes.fondo = ev.target.value; guardar(); refreshMapa(); } });
function mapaSVG() {
  const c = C(), P = c.puntos.filter(p => isFinite(p.lat) && isFinite(p.lon)), tr = c.tramos.filter(t => t.pts.length > 1);
  if (!P.length && !(REC && REC.pts.length) && !ULT) return '<p class="nota">El mapa aparece cuando haya puntos.</p>';
  const W = 600, H = 400, pad = 46, fondo = FONDOS[DB.ajustes.fondo];
  const todos = [...P.map(p => [p.lat, p.lon]), ...tr.flatMap(t => t.pts), ...(REC ? REC.pts : []), ...(ULT ? [[ULT.lat, ULT.lon]] : [])].map(p => mercator(p[0], p[1]));
  const latC = todos.length ? P.length ? P[0].lat : ULT.lat : 0, mPorU = 40075016.686 * Math.cos(rad(latC));           // metros por unidad de mundo
  let x0 = Math.min(...todos.map(p => p[0])), x1 = Math.max(...todos.map(p => p[0])), y0 = Math.min(...todos.map(p => p[1])), y1 = Math.max(...todos.map(p => p[1]));
  const minU = 60 / mPorU, dx = Math.max(x1 - x0, minU), dy = Math.max(y1 - y0, minU), sc = Math.min((W - 2 * pad) / dx, (H - 2 * pad) / dy) * 2 ** (DB.ajustes.zoomMapa || 0), cxF = (x0 + x1) / 2, cyF = (y0 + y1) / 2, mU = ULT && (DB.ajustes.zoomMapa || 0) > 0 ? mercator(ULT.lat, ULT.lon) : null, cx = mU ? mU[0] : cxF, cy = mU ? mU[1] : cyF;      // al acercar con el GPS encendido, la vista sigue su posición   // px por unidad de mundo
  const X = u => W / 2 + (u - cx) * sc, Y = u => H / 2 + (u - cy) * sc, pt = (lat, lon) => { const m = mercator(lat, lon); return [X(m[0]), Y(m[1])]; };
  let s = `<svg class="mapa" viewBox="0 0 ${W} ${H}" role="img" aria-label="Mapa de los puntos y el recorrido"><rect width="${W}" height="${H}" fill="#eef1f7"/>`;
  if (fondo) {                                                                                                         // teselas que cubren la vista
    const zmx = DB.ajustes.fondo === "satelite" ? zMaxEsri(cx, cy) : fondo.zmax;
    let z = Math.max(0, Math.min(zmx, Math.round(Math.log2(sc / 256)) + 1)), n = 2 ** z;      // +1: teselas más nítidas en pantallas de alta densidad
    MAPA_INFO = "Imagen nivel " + z + (z >= zmx ? " (máximo disponible en este lugar: " + zmx + ")" : " de " + zmx + " disponibles");
    const tx0 = Math.floor((cx - W / 2 / sc) * n), tx1 = Math.floor((cx + W / 2 / sc) * n), ty0 = Math.max(0, Math.floor((cy - H / 2 / sc) * n)), ty1 = Math.min(n - 1, Math.floor((cy + H / 2 / sc) * n));
    if ((tx1 - tx0 + 1) * (ty1 - ty0 + 1) <= 60) for (let tx = tx0; tx <= tx1; tx++) for (let ty = ty0; ty <= ty1; ty++) s += `<image href="${fondo.url(z, ((tx % n) + n) % n, ty)}" x="${X(tx / n).toFixed(1)}" y="${Y(ty / n).toFixed(1)}" width="${(sc / n + 0.6).toFixed(1)}" height="${(sc / n + 0.6).toFixed(1)}" preserveAspectRatio="none" onerror="fondoFalla()" onload="fondoOk()"/>`;
  }
  const lin = ps => ps.map((p, i) => { const q = pt(p[0], p[1]); return (i ? "L" : "M") + q[0].toFixed(1) + "," + q[1].toFixed(1); }).join("");
  for (let i = 1; i < c.puntos.length; i++) { const a = c.puntos[i - 1], b = c.puntos[i]; if (!tramoEntre(a.id, b.id) && isFinite(a.lat) && isFinite(b.lat)) s += `<path d="${lin([[a.lat, a.lon], [b.lat, b.lon]])}" fill="none" stroke="#fff" stroke-width="5" opacity=".8"/><path d="${lin([[a.lat, a.lon], [b.lat, b.lon]])}" fill="none" stroke="#5b6577" stroke-width="2.5" stroke-dasharray="6 5"/>`; }
  tr.forEach(t => { s += `<path d="${lin(t.pts)}" fill="none" stroke="#fff" stroke-width="6" opacity=".85" stroke-linejoin="round"/><path d="${lin(t.pts)}" fill="none" stroke="#1F3864" stroke-width="3" stroke-linejoin="round"/>`; });
  if (REC && REC.pts.length > 1) s += `<path d="${lin(REC.pts)}" fill="none" stroke="#fff" stroke-width="7" stroke-linejoin="round"/><path d="${lin(REC.pts)}" fill="none" stroke="#c0392b" stroke-width="3.5" stroke-linejoin="round"/>`;
  const col = {inyeccion: "#c0392b", monitoreo: "#1F3864", vertimiento: "#8e44ad", afluente: "#2e8b57", otro: "#777"};
  P.forEach(p => { const q = pt(p.lat, p.lon), i = c.puntos.indexOf(p) + 1, der = q[0] < W - 150, tx = der ? q[0] + 11 : q[0] - 11;
    s += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="7" fill="${col[p.rol] || "#777"}" stroke="#fff" stroke-width="2.5"/><text x="${tx.toFixed(1)}" y="${(q[1] - 9).toFixed(1)}" text-anchor="${der ? "start" : "end"}" style="font-size:12px;font-weight:600;paint-order:stroke;stroke:#fff;stroke-width:3.5px;stroke-linejoin:round;fill:#1d2433">${i}. ${esc(p.nombre)}</text>`; });
  if (ULT) { const q = pt(ULT.lat, ULT.lon), r = Math.max(6, ULT.acc * sc / mPorU); s += `<circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="${Math.min(r, 60).toFixed(1)}" fill="#2b8cff" opacity=".15"/><circle cx="${q[0].toFixed(1)}" cy="${q[1].toFixed(1)}" r="6" fill="#2b8cff" stroke="#fff" stroke-width="2.5"/>`; }
  const mPx = mPorU / sc, barra = [5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000].find(v => v / mPx >= 70) || 5000, bw = barra / mPx;      // barra de escala
  s += `<rect x="8" y="${H - 34}" width="${bw + 16}" height="26" rx="4" fill="#fff" opacity=".85"/><line x1="16" y1="${H - 14}" x2="${16 + bw}" y2="${H - 14}" stroke="#1d2433" stroke-width="2.5"/><text x="16" y="${H - 19}" style="font-size:11px;fill:#1d2433">${barra >= 1000 ? barra / 1000 + " km" : barra + " m"}</text>`;
  s += `<g><rect x="${W - 34}" y="8" width="26" height="26" rx="4" fill="#fff" opacity=".85"/><text x="${W - 21}" y="28" text-anchor="middle" style="font-size:16px;font-weight:700;fill:#1d2433">N</text></g>`;
  if (fondo) s += `<text x="${W - 6}" y="${H - 6}" text-anchor="end" style="font-size:10px;paint-order:stroke;stroke:#fff;stroke-width:3px;fill:#333">${fondo.atr}</text>`;
  const inf = $("mapa-info"); if (inf) inf.textContent = (fondo ? MAPA_INFO : "") + ((DB.ajustes.zoomMapa || 0) ? " · zoom " + (DB.ajustes.zoomMapa > 0 ? "+" : "") + DB.ajustes.zoomMapa : "");
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
  const t = iB === iA + 1 ? tramoEntre(a.id, b.id) : null;
  if (t) {                                  // regresión de la altitud contra la distancia recorrida, con todas las lecturas del tramo
    let s = 0, X = [], Z = [];
    t.pts.forEach((q, k) => { if (k) s += hav(t.pts[k - 1], q); if (q[4] != null && isFinite(q[4]) && q[3] > 0) { X.push(s); Z.push(q[4]); } });
    const L = s, n = X.length; if (n >= 10 && L >= 30) {
      const xs = t.de === a.id ? X : X.map(x => L - x), mx = xs.reduce((u, v) => u + v, 0) / n, mz = Z.reduce((u, v) => u + v, 0) / n;
      const sxx = xs.reduce((u, x) => u + (x - mx) ** 2, 0), sxz = xs.reduce((u, x, k) => u + (x - mx) * (Z[k] - mz), 0), m = sxz / sxx;
      const sse = xs.reduce((u, x, k) => u + (Z[k] - mz - m * (x - mx)) ** 2, 0), se = Math.sqrt(sse / Math.max(n - 2, 1) / sxx);
      return {s: -m, se: Math.max(se, 0.3 / L), d, dz: -m * L, fuente: `regresión de la altitud del GPS en ${n} lecturas del recorrido`};
    }
  }
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
    <button class="b g p" data-reubicar="${i}" style="margin-top:.3rem">📍 Volver a tomar la ubicación aquí</button></div>`).join("");
  $("t-pun").innerHTML = `<p class="nota">Registre los puntos <b>como los encuentre en campo</b>, en el orden del río (aguas arriba primero). Puede cambiarlos cuando la planificación cambie.</p>
    <div class="card"><div class="fila"><label>Nombre del nuevo punto<input id="pt-nombre" type="text" placeholder="p. ej. Inyección, Estación 1…"></label><label>Función<select id="pt-rol">${ROLES.map(([v, t]) => `<option value="${v}">${t}</option>`).join("")}</select></label></div>
    <div style="display:flex;gap:.5rem;margin-top:.5rem;flex-wrap:wrap"><button class="b" id="pt-fijar" style="flex:2">📍 Marcar punto aquí (GPS)</button><button class="b g" id="pt-manual" style="flex:1">Escribir coordenadas</button></div>
    <p class="nota">El GPS promedia ${DB.ajustes.seg_promedio} s para mejorar la precisión. Quédese quieto en el punto.</p></div>
    ${c.puntos.length ? "<h2>Mapa</h2>" + selectorFondo() + '<div id="mapa-caja">' + mapaSVG() + "</div>" : ""}
    <h2>Puntos (${c.puntos.length})</h2>${filas || '<p class="nota">Aún no hay puntos.</p>'}
    <div style="display:flex;gap:.5rem;flex-wrap:wrap"><button class="b g p" id="pt-inv">⇅ Invertir el orden</button></div>
    <details class="card"><summary><b>Ajustes del GPS</b></summary><div class="fila" style="margin-top:.4rem"><label>Precisión máxima aceptada (m)<input id="aj-acc" type="text" inputmode="text" value="${DB.ajustes.acc_max}"></label><label>Paso mínimo entre lecturas (m)<input id="aj-paso" type="text" inputmode="text" value="${DB.ajustes.paso_min}"></label><label>Segundos de promedio por punto<input id="aj-seg" type="text" inputmode="text" value="${DB.ajustes.seg_promedio}"></label></div></details>`;
  const nuevoPunto = (lat, lon, acc, alt, altAcc) => { const nom = $("pt-nombre").value.trim() || "Punto " + (c.puntos.length + 1); const rol = $("pt-rol").value; c.puntos.push({id: pid(), nombre: nom, rol, lat, lon, acc: acc === null ? null : Math.round(acc), alt_gps: alt ?? null, alt_acc: altAcc ?? null, cota: alt != null ? Math.round(alt * 10) / 10 : null, cota_origen: alt != null ? "gps" : null, hora_iso: new Date().toISOString(), notas: "", hid: {}}); guardar(); pintarPuntos(); };
  $("pt-fijar").onclick = async () => { try { $("pt-fijar").disabled = true; const r = await fijarPunto(DB.ajustes.seg_promedio); nuevoPunto(r.lat, r.lon, r.acc, r.alt, r.altAcc); } catch (e) { alert(e.message); pintarPuntos(); } };
  $("pt-manual").onclick = () => { const t = prompt("Latitud, longitud en grados decimales (p. ej. 4.53596, -74.54319):"); if (!t) return; const m = parseCoord(t); if (!m || Math.abs(m[0]) > 90 || Math.abs(m[1]) > 180) return alert("No se entendió. Escriba: latitud, longitud (p. ej. 4.53596, -74.54319)."); nuevoPunto(m[0], m[1], null); };
  document.querySelectorAll("[data-sube]").forEach(b => b.onclick = () => { const i = +b.dataset.sube; [c.puntos[i - 1], c.puntos[i]] = [c.puntos[i], c.puntos[i - 1]]; guardar(); pintarPuntos(); });
  document.querySelectorAll("[data-baja]").forEach(b => b.onclick = () => { const i = +b.dataset.baja; [c.puntos[i + 1], c.puntos[i]] = [c.puntos[i], c.puntos[i + 1]]; guardar(); pintarPuntos(); });
  document.querySelectorAll("#t-pun [data-q]").forEach(b => b.onclick = () => { if (confirm("¿Quitar «" + c.puntos[+b.dataset.q].nombre + "»? Se borran también los recorridos que lo tocan.")) { const id = c.puntos[+b.dataset.q].id; c.puntos.splice(+b.dataset.q, 1); c.tramos = c.tramos.filter(t => t.de !== id && t.a !== id); guardar(); pintarPuntos(); } });
  document.querySelectorAll("[data-reubicar]").forEach(b => b.onclick = async () => { try { b.disabled = true; b.textContent = "Midiendo… quédese quieto"; const r = await fijarPunto(DB.ajustes.seg_promedio), p = c.puntos[+b.dataset.reubicar]; p.lat = r.lat; p.lon = r.lon; p.acc = Math.round(r.acc); p.alt_gps = r.alt; p.alt_acc = r.altAcc; if (r.alt != null && p.cota_origen !== "manual") { p.cota = Math.round(r.alt * 10) / 10; p.cota_origen = "gps"; } guardar(); pintarPuntos(); } catch (e) { alert(e.message); pintarPuntos(); } });
  document.querySelectorAll("[data-usaralt]").forEach(b => b.onclick = () => { const p = c.puntos[+b.dataset.usaralt]; p.cota = Math.round(p.alt_gps * 10) / 10; p.cota_origen = "gps"; guardar(); pintarPuntos(); });
  $("pt-inv").onclick = () => { c.puntos.reverse(); guardar(); pintarPuntos(); };
  [["aj-acc", "acc_max"], ["aj-paso", "paso_min"], ["aj-seg", "seg_promedio"]].forEach(([i, k]) => $(i).onchange = () => { DB.ajustes[k] = Math.max(1, num($(i).value) || AJ0[k]); guardar(); });
}

// ------------------------------------------------------------------ RECORRIDO
function pintarRecorrido() {
  const c = C(), el = $("t-rec");
  if (TAB !== "rec") return;
  if (REC && $("rec-vivo")) { $("rec-vivo").innerHTML = vivo(); $("rec-mapa").innerHTML = mapaSVG(); return; }
  const sel = (id, ex) => `<select id="${id}">${c.puntos.map((p, i) => `<option value="${p.id}">${i + 1}. ${esc(p.nombre)}</option>`).join("")}${ex || ""}</select>`;
  const L = enlaces();
  const tabla = c.puntos.length > 1 ? '<div class="scroll"><table><thead><tr><th>Tramo</th><th class="num">Distancia (m)</th><th>De dónde</th><th>Escribir (m)</th></tr></thead><tbody>' + c.puntos.slice(1).map((p, i) => { const t = tramoEntre(c.puntos[i].id, p.id); return `<tr><td>${i + 1}. ${esc(c.puntos[i].nombre)} → ${i + 2}. ${esc(p.nombre)}</td><td class="num"><b>${nf(L[i].d, 0)}</b></td><td>${L[i].origen}${t ? ` (${t.pts.length} lecturas)` : ""}</td><td>${t ? `<input data-man="${t.id}" type="text" inputmode="text" autocomplete="off" style="width:6rem" value="${t.manual_m || ""}">` : "—"}</td></tr>`; }).join("") + "</tbody></table></div>" : '<p class="nota">Necesita al menos dos puntos.</p>';
  el.innerHTML = REC ? `<div class="card rec"><b>● Grabando el recorrido</b><div id="rec-vivo">${vivo()}</div>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.5rem"><button class="b" id="rec-marca" style="flex:2">📍 Marcar punto aquí (cierra el tramo)</button><button class="b r" id="rec-stop" style="flex:1">■ Detener</button></div></div>${selectorFondo()}<div id="rec-mapa">${mapaSVG()}</div>` :
    `<p class="nota">Camine por la orilla <b>siguiendo el cauce</b> de un punto al siguiente con el GPS grabando: la distancia del tramo es la longitud de lo caminado. Mantenga la pantalla encendida (la app la protege del apagado mientras graba) y la app abierta.</p>
    <div class="card"><div class="fila"><label>Empezar en el punto${c.puntos.length ? sel("rec-ini") : "<select disabled><option>(marque un punto primero)</option></select>"}</label></div>
    <button class="b" id="rec-go" style="width:100%;margin-top:.5rem" ${c.puntos.length ? "" : "disabled"}>● Iniciar recorrido</button></div>
    <h2>Mapa</h2>${selectorFondo()}<div id="mapa-caja">${mapaSVG()}</div><h2>Distancias entre puntos</h2>${tabla}
    <p class="nota">La distancia por GPS suele sobreestimar un poco el camino en tramos cortos (ruido de ±3 a ±10 m). Para tramos muy cortos mida con cinta o escriba la distancia en la última columna; esa prevalece.</p>`;
  if ($("rec-go")) $("rec-go").onclick = () => { const p = punto($("rec-ini").value); if (!iniciarGPS()) return; REC = {de: p.id, pts: [[p.lat, p.lon, Date.now(), 0]], t0: Date.now()}; pintarRecorrido(); };
  if ($("rec-marca")) $("rec-marca").onclick = marcarEnRecorrido;
  if ($("rec-stop")) $("rec-stop").onclick = detenerRecorrido;
  el.querySelectorAll("[data-man]").forEach(i => i.onchange = () => { const t = c.tramos.find(x => x.id === i.dataset.man); t.manual_m = num(i.value) > 0 ? num(i.value) : null; guardar(); pintarRecorrido(); });
}
function vivo() { const d = longitud(REC.pts), s = Math.floor((Date.now() - REC.t0) / 1000); return `<div class="kpi" style="margin-top:.4rem"><div><span class="nota">Distancia del tramo</span><b>${nf(d, 0)} m</b></div><div><span class="nota">Lecturas</span><b>${REC.pts.length}</b></div><div><span class="nota">Tiempo</span><b>${pad(Math.floor(s / 60))}:${pad(s % 60)}</b></div></div><p class="nota">${ULT ? "GPS ±" + Math.round(ULT.acc) + " m" + (ULT.acc > DB.ajustes.acc_max ? " — precisión baja: no se están guardando lecturas" : "") : "Esperando señal…"}</p>`; }
function cerrarTramo(aId) { const c = C(), pts = REC.pts.slice(); const p = punto(aId); if (p) pts.push([p.lat, p.lon, Date.now(), 0]); c.tramos.push({id: "t" + Date.now().toString(36), de: REC.de, a: aId, pts, dist_m: longitud(pts), manual_m: null}); }
async function marcarEnRecorrido() {
  if (!ULT) return alert("Aún no hay señal del GPS.");
  const nom = prompt("Nombre del punto:", "Punto " + (C().puntos.length + 1)); if (nom === null) return;
  const rolTxt = prompt("Función: 1 Inyección · 2 Estación de monitoreo · 3 Vertimiento · 4 Afluente · 5 Otro", "2"), rol = ROLES[(Number(rolTxt) || 2) - 1]?.[0] || "monitoreo";
  const p = {id: pid(), nombre: nom || "Punto", rol, lat: ULT.lat, lon: ULT.lon, acc: Math.round(ULT.acc), alt_gps: ULT.alt ?? null, alt_acc: ULT.altAcc ?? null, cota: ULT.alt != null ? Math.round(ULT.alt * 10) / 10 : null, cota_origen: ULT.alt != null ? "gps" : null, hora_iso: new Date().toISOString(), notas: "", hid: {}};
  const c = C(), iDe = c.puntos.findIndex(x => x.id === REC.de);
  c.puntos.splice(iDe + 1, 0, p);                       // queda justo después del punto de donde salió
  REC.pts.push([ULT.lat, ULT.lon, ULT.t, Math.round(ULT.acc), ULT.alt ?? null]); cerrarTramo(p.id);
  REC = {de: p.id, pts: [[p.lat, p.lon, Date.now(), 0]], t0: Date.now()}; guardar(); pintarRecorrido();
}
function detenerRecorrido() {
  const c = C(), r = REC; REC = null; if (!c.puntos.length) return pintarRecorrido();
  if (r.pts.length < 3) { pintarRecorrido(); return; }
  $("t-rec").innerHTML = `<div class="card"><b>Recorrido detenido</b><p class="nota">${r.pts.length} lecturas, ${nf(longitud(r.pts), 0)} m. ¿En qué punto terminó?</p><div class="fila"><label>Punto de llegada<select id="rec-fin">${c.puntos.filter(p => p.id !== r.de).map(p => `<option value="${p.id}">${c.puntos.indexOf(p) + 1}. ${esc(p.nombre)}</option>`).join("")}</select></label></div>
    <div style="display:flex;gap:.5rem;margin-top:.5rem"><button class="b" id="rec-ok">Guardar el tramo</button><button class="b g" id="rec-no">Descartar</button></div></div>`;
  $("rec-ok").onclick = () => { if (!$("rec-fin").value) return alert("Marque primero el punto de llegada."); REC = r; cerrarTramo($("rec-fin").value); REC = null; guardar(); pintarRecorrido(); };
  $("rec-no").onclick = () => pintarRecorrido();
}
setInterval(() => { if (REC && TAB === "rec" && $("rec-vivo")) $("rec-vivo").innerHTML = vivo(); }, 1000);

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
  $("t-prog").innerHTML = `<p class="nota">Estima la masa de sal y los tiempos de registro (Fischer et al. 1979, pulso gaussiano). Las distancias salen del recorrido grabado; el caudal, ancho, profundidad y pendiente los mide o estima usted en el sitio (o los trae del modelo hidráulico). Es una estimación: D_L real puede variar de 2 a 5 veces.</p>
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

// ------------------------------------------------------------------ CAMPAÑA (bitácora)
function t0() { const c = C(); return c.inyeccion.t0_iso ? new Date(c.inyeccion.t0_iso) : null; }
function fechaHora(h) { const c = C(), f = new Date((c.fecha || new Date().toISOString().slice(0, 10)) + "T00:00:00"), [a, b, s] = h.split(":").map(Number); f.setHours(a, b, s || 0, 0); return f; }
function evento(txt) { C().eventos.push({iso: new Date().toISOString(), hora: horaTxt(new Date()), texto: txt}); guardar(); }
function pintarCampana() {
  const c = C(), I = c.inyeccion, E = c.puntos.filter(p => p.rol === "monitoreo"), prog = id => c.programacion?.estaciones.find(e => e.id === id), T0 = t0(), ahora = new Date();
  const ptsEst = E.map(p => { const i = c.puntos.indexOf(p), R = c.registros[p.id] || (c.registros[p.id] = {}), pr = prog(p.id); let est = "", cl = "";
    if (pr && T0) { const ini = new Date(T0.getTime() + pr.ini_min * 60000), fin = new Date(T0.getTime() + pr.fin_min * 60000), pico = new Date(T0.getTime() + pr.t_pico_min * 60000); cl = ahora > fin ? "ya" : (ahora >= ini ? "ahora" : "");
      est = `<div class="nota">Iniciar el registro: <b>${horaTxt(ini)}</b> · pico esperado: <b>${horaTxt(pico)}</b> · terminar: <b>${horaTxt(fin)}</b></div>` + (cl === "ahora" ? '<span class="badge" style="background:var(--ro);color:#fff">REGISTRANDO AHORA</span>' : cl === "ya" ? '<span class="badge">ventana terminada</span>' : ""); }
    else est = '<div class="nota">Calcule la programación (pestaña Programar) y marque la hora de inyección para ver las horas.</div>';
    return `<div class="card est ${cl}"><b>${esc(p.nombre)}</b>${est}<div class="fila" style="margin-top:.4rem">${campo("Sonda / serie", `registros.${p.id}.sonda`, "t", R.sonda)}${campo("Inicio real", `registros.${p.id}.inicio`, "h", R.inicio)}${campo("Fin real", `registros.${p.id}.fin`, "h", R.fin)}${campo("EC de fondo medida (µS/cm)", `registros.${p.id}.ec_fondo`, "n", R.ec_fondo)}${campo("Llegada del pico", `registros.${p.id}.pico`, "h", R.pico)}</div>${campo("Notas", `registros.${p.id}.notas`, "t", R.notas)}<button class="b g p" data-pico="${p.id}" style="margin-top:.4rem">Hora actual = pico</button></div>`; }).join("");
  $("t-camp").innerHTML = `<p class="nota">Todo se guarda en este teléfono. Al terminar, vaya a «Guardar» y envíese el archivo.</p>
    <h2>Datos de la campaña</h2><div class="card fila">${campo("Nombre", "nombre", "t", c.nombre, 'data-re="1"')}${campo("Fecha", "fecha", "f", c.fecha)}${campo("Responsable", "responsable", "t", c.responsable)}${campo("Cuadrilla", "cuadrilla", "t", c.cuadrilla)}${campo("Clima / condición del cauce", "clima", "t", c.clima)}</div>
    <h2>Inyección del trazador</h2><div class="card"><div class="fila">${campo("Masa de sal pesada (kg)", "inyeccion.masa_kg", "n", I.masa_kg)}${campo("Pureza (fracción)", "inyeccion.pureza", "n", I.pureza)}${campo("Agua usada (L)", "inyeccion.agua_l", "n", I.agua_l)}${campo("Hora real de inyección", "inyeccion.hora", "h", I.hora, 'id="c-hora"')}${campo("Sal (tipo, marca, lote)", "inyeccion.sal", "t", I.sal)}</div>
    <button class="b" id="c-ahora" style="width:100%;margin-top:.5rem">⏱ Inyecté ahora</button><div class="crono" id="c-crono">—</div><p class="nota" id="c-crono-n" style="text-align:center"></p></div>
    <h2>Estaciones de registro</h2>${ptsEst || '<p class="nota">No hay estaciones de monitoreo: márquelas en «Puntos».</p>'}
    <h2>Aforos de campo</h2>${c.aforos.map((a, i) => `<div class="card"><div class="fila">${campo("Punto", `aforos.${i}.punto`, "t", a.punto)}${campo("Q (L/s)", `aforos.${i}.q_ls`, "n", a.q_ls)}${campo("Hora", `aforos.${i}.hora`, "h", a.hora)}${campo("Método", `aforos.${i}.metodo`, "t", a.metodo)}</div><button class="b g p" data-qa="${i}" style="margin-top:.4rem">Quitar</button></div>`).join("")}<button class="b g p" id="c-afo">+ Agregar aforo</button>
    <h2>Eventos y observaciones</h2><div class="card"><div class="fila"><label style="flex:3">Nota<input id="c-ev-txt" type="text" placeholder="p. ej. sonda en el hilo de la corriente"></label><button class="b" id="c-ev" style="align-self:flex-end">Anotar con la hora</button></div><div class="scroll"><table id="c-evt"></table></div></div>
    <label>Observaciones generales<textarea data-r="observaciones">${esc(c.observaciones)}</textarea></label>`;
  $("c-ahora").onclick = () => { const f = new Date(); I.hora = horaTxt(f); I.t0_iso = f.toISOString(); c.fecha = f.toISOString().slice(0, 10); evento("Inyección del trazador"); guardar(); pintarCampana(); };
  $("c-hora").addEventListener("change", () => { const h = $("c-hora").value; I.hora = h; I.t0_iso = h ? fechaHora(h).toISOString() : null; guardar(); pintarCampana(); });
  document.querySelectorAll("[data-pico]").forEach(b => b.onclick = () => { (c.registros[b.dataset.pico]).pico = horaTxt(new Date()); evento("Pico visto en " + punto(b.dataset.pico).nombre); pintarCampana(); });
  $("c-afo").onclick = () => { c.aforos.push({punto: "", q_ls: null, hora: horaTxt(new Date()).slice(0, 5), metodo: ""}); guardar(); pintarCampana(); };
  document.querySelectorAll("[data-qa]").forEach(b => b.onclick = () => { c.aforos.splice(+b.dataset.qa, 1); guardar(); pintarCampana(); });
  $("c-ev").onclick = () => { const t = $("c-ev-txt").value.trim(); if (!t) return; evento(t); pintarCampana(); };
  $("c-evt").innerHTML = c.eventos.length ? "<tbody>" + c.eventos.slice().reverse().map(e => `<tr><td style="white-space:nowrap"><b>${e.hora}</b></td><td>${esc(e.texto)}</td></tr>`).join("") + "</tbody>" : "";
}
setInterval(() => { const T = TAB === "camp" && $("c-crono") ? t0() : null; if (!T) { if ($("c-crono")) $("c-crono").textContent = "—"; return; } let s = Math.floor((Date.now() - T.getTime()) / 1000); const neg = s < 0; s = Math.abs(s); $("c-crono").textContent = (neg ? "−" : "") + pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s % 3600 / 60)) + ":" + pad(s % 60); $("c-crono-n").textContent = "tiempo desde la inyección"; }, 1000);

// ------------------------------------------------------------------ GUARDAR (exportar / importar)
const slug = t => (t || "campana").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "_").slice(0, 40);
const base = () => "campo_trazadores_" + slug(C().nombre) + "_" + C().fecha;
function descargar(blob, nombre) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }
function datosExport() {
  const c = C(), A = abscisas(), L = enlaces(), ii = c.puntos.findIndex(p => p.rol === "inyeccion");
  return {formato: "ccp-bitacora-trazadores", version: 2, proyecto_id: null, campana_id: c.id, exportado: new Date().toISOString(), campana: {nombre: c.nombre, fecha: c.fecha, responsable: c.responsable, cuadrilla: c.cuadrilla, clima: c.clima},
    inyeccion: {masa_kg: c.inyeccion.masa_kg, pureza: c.inyeccion.pureza, agua_l: c.inyeccion.agua_l, hora: c.inyeccion.hora, t0_iso: c.inyeccion.t0_iso, sal: c.inyeccion.sal, punto: c.puntos[ii]?.nombre || ""},
    puntos: c.puntos.map((p, i) => ({id: p.id, nombre: p.nombre, rol: p.rol, lat: p.lat, lon: p.lon, precision_m: p.acc, cota: p.cota ?? null, cota_origen: p.cota_origen ?? null, alt_gps: p.alt_gps ?? null, alt_acc: p.alt_acc ?? null, notas: p.notas, abscisa_m: A[i], dist_anterior_m: i ? L[i - 1].d : null, origen_distancia: i ? L[i - 1].origen : null, dist_desde_inyeccion_m: ii >= 0 && A[i] !== null && A[ii] !== null ? A[i] - A[ii] : null, hidraulica: p.hid})),
    tramos: c.tramos, parametros: c.params, programacion: c.programacion, registro_estaciones: Object.fromEntries(Object.entries(c.registros).map(([id, r]) => [punto(id)?.nombre || id, r])), aforos: c.aforos, eventos: c.eventos, observaciones: c.observaciones};
}
function blobJson() { const b = new Blob([JSON.stringify(datosExport(), null, 1)], {type: "application/json"}); C().exp = Date.now() + 1; guardar(true); pintarResp(); const u = $("ult-resp"); if (u) u.textContent = new Date(C().exp).toLocaleString("es-CO"); return b; }
function csv() {
  const c = C(), d = datosExport(), q = v => '"' + String(v ?? "").replace(/"/g, '""') + '"', L = [];
  L.push(["Campaña", c.nombre], ["Fecha", c.fecha], ["Responsable", c.responsable], ["Cuadrilla", c.cuadrilla], ["Condiciones", c.clima], [], ["Masa de sal (kg)", c.inyeccion.masa_kg], ["Pureza", c.inyeccion.pureza], ["Agua (L)", c.inyeccion.agua_l], ["Hora de inyección", c.inyeccion.hora], ["Sal", c.inyeccion.sal], [],
    ["N°", "Punto", "Función", "Latitud", "Longitud", "Precisión (m)", "Abscisa (m)", "Dist. al anterior (m)", "Origen de la distancia", "Dist. desde inyección (m)", "Cota (m)", "Sonda", "Inicio real", "Fin real", "EC fondo", "Hora del pico", "Notas"]);
  d.puntos.forEach((p, i) => { const r = c.registros[p.id] || {}; L.push([i + 1, p.nombre, p.rol, p.lat, p.lon, p.precision_m, p.abscisa_m?.toFixed(1), p.dist_anterior_m?.toFixed(1), p.origen_distancia, p.dist_desde_inyeccion_m?.toFixed(1), p.cota, r.sonda, r.inicio, r.fin, r.ec_fondo, r.pico, p.notas || r.notas]); });
  L.push([], ["Aforo: punto", "Q (L/s)", "Hora", "Método"]); c.aforos.forEach(a => L.push([a.punto, a.q_ls, a.hora, a.metodo]));
  L.push([], ["Hora", "Evento"]); c.eventos.forEach(e => L.push([e.hora, e.texto])); L.push([], ["Observaciones", c.observaciones]);
  return new Blob(["﻿" + L.map(r => r.map(q).join(";")).join("\r\n")], {type: "text/csv;charset=utf-8"});
}
function gpx() {
  const c = C(), x = esc;
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Campo trazadores" xmlns="http://www.topografix.com/GPX/1/1">\n<metadata><name>${x(c.nombre)}</name></metadata>\n` + c.puntos.filter(p => isFinite(p.lat)).map(p => `<wpt lat="${p.lat}" lon="${p.lon}">${p.cota != null ? "<ele>" + p.cota + "</ele>" : ""}<name>${x(p.nombre)}</name><desc>${x(ROLES.find(r => r[0] === p.rol)?.[1] || "")}${p.acc ? " · ±" + p.acc + " m" : ""}</desc></wpt>`).join("\n") + "\n" +
    c.tramos.map(t => `<trk><name>${x((punto(t.de)?.nombre || "?") + " → " + (punto(t.a)?.nombre || "?"))}</name><trkseg>` + t.pts.map(p => `<trkpt lat="${p[0]}" lon="${p[1]}">${p[2] ? "<time>" + new Date(p[2]).toISOString() + "</time>" : ""}</trkpt>`).join("") + "</trkseg></trk>").join("\n") + "\n</gpx>\n"], {type: "application/gpx+xml"});
}
function kml() {                                           // puntos + el recorrido completo en el orden del río (para cargarlos en el paso 1 de la plataforma)
  const c = C(), x = esc; let ruta = [];
  for (let i = 1; i < c.puntos.length; i++) { const a = c.puntos[i - 1], b = c.puntos[i], t = tramoEntre(a.id, b.id); let ps = t ? t.pts.map(p => [p[0], p[1]]) : [[a.lat, a.lon], [b.lat, b.lon]]; if (t && t.de === b.id) ps = ps.reverse(); ruta = ruta.concat(ps); }
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${x(c.nombre)}</name>\n` + c.puntos.filter(p => isFinite(p.lat)).map(p => `<Placemark><name>${x(p.nombre)}</name><description>${x(ROLES.find(r => r[0] === p.rol)?.[1] || "")}${p.acc ? " · ±" + p.acc + " m" : ""}</description><Point><coordinates>${p.lon},${p.lat},${p.cota ?? 0}</coordinates></Point></Placemark>`).join("\n") +
    (ruta.length > 1 ? `\n<Placemark><name>Recorrido</name><LineString><tessellate>1</tessellate><coordinates>${ruta.map(p => p[1] + "," + p[0] + ",0").join(" ")}</coordinates></LineString></Placemark>` : "") + "\n</Document></kml>\n"], {type: "application/vnd.google-earth.kml+xml"});
}
let PROMPT_INSTALAR = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); PROMPT_INSTALAR = e; if (TAB === "exp") pintarGuardar(); });
function pintarGuardar() {
  const c = C(), ios = /iphone|ipad/i.test(navigator.userAgent), instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  $("t-exp").innerHTML = `<h2>Sacar los datos del teléfono</h2><div class="card" style="border-color:var(--am)"><b>¿Dónde queda lo que escribo?</b><p class="nota">Se guarda solo, automáticamente, <b>dentro de este navegador del teléfono</b>. Si borra la app, la desinstala o limpia los datos del navegador, <b>se pierde</b>. La copia segura es el archivo <b>.json</b>: descárguelo o compártalo (WhatsApp, correo, Drive) al terminar cada tramo del trabajo y siempre antes de borrar o reinstalar la app. Almacenamiento protegido por el navegador: <b>${DB.persistente ? "sí" : "no confirmado"}</b>.</p></div>
    <p class="nota">Campaña: <b>${esc(c.nombre)}</b> · ${c.puntos.length} puntos · ${c.tramos.length} tramos grabados · último respaldo: <b id="ult-resp">${c.exp ? new Date(c.exp).toLocaleString("es-CO") : "ninguno"}</b>.</p>
    <div class="card"><button class="b" id="x-comp" style="width:100%;margin:.2rem 0">Compartir / enviar (WhatsApp, correo, Drive…)</button>
    <button class="b g" id="x-json" style="width:100%;margin:.2rem 0">Descargar todo (.json) — para la plataforma</button><button class="b g" id="x-kml" style="width:100%;margin:.2rem 0">Puntos y recorrido (.kml) — para Google Earth y el paso 1</button>
    <button class="b g" id="x-gpx" style="width:100%;margin:.2rem 0">Puntos y recorrido (.gpx)</button><button class="b g" id="x-csv" style="width:100%;margin:.2rem 0">Resumen (.csv) — para Excel</button><p class="nota" id="x-msg"></p></div>
    <h2>Cargar una campaña guardada</h2><div class="card"><input type="file" id="x-file" accept="*/*"><p class="nota" id="x-file-msg" style="font-weight:600"></p><p class="nota">Para continuar una campaña o recuperarla (el archivo .json de «Descargar todo» o «Compartir»). Si el selector solo muestra el teléfono, toque el menú ☰ (arriba a la izquierda) y elija <b>Drive</b>; si Drive no aparece, abra el archivo en la app de Drive, toque ⋮ → <b>Descargar</b> y búsquelo en «Descargas».</p></div>
    <details class="card"><summary><b>Si no logra elegir el archivo: pegar su contenido</b></summary><p class="nota">Abra el .json en el teléfono (Drive lo muestra como texto), toque «seleccionar todo», copie y pegue aquí.</p><textarea id="x-pegar" placeholder="Pegue aquí todo el texto del archivo .json" style="min-height:6rem"></textarea><button class="b g" id="x-pegar-ok" style="margin-top:.4rem">Cargar el texto pegado</button></details>
    <h2>Campañas en este teléfono</h2><div class="card">${DB.campanas.map(k => `<div class="pt" style="padding:.25rem 0"><span>${esc(k.nombre)} <span class="nota">(${k.puntos.length} puntos)</span></span>${DB.campanas.length > 1 ? `<button class="b g p" data-del="${k.id}" style="color:var(--ro)">Borrar</button>` : ""}</div>`).join("")}</div>
    <h2>Instalar en el celular</h2><div class="card">${instalada ? "<p>✔ Ya está instalada.</p>" : PROMPT_INSTALAR ? '<button class="b" id="x-inst" style="width:100%">Anclar a la pantalla de inicio</button>' : ios ? '<p class="nota">En iPhone: abra esta página en Safari, toque el botón Compartir y elija «Agregar a pantalla de inicio».</p>' : '<p class="nota">En Android: menú ⋮ del navegador → «Instalar aplicación» o «Agregar a pantalla de inicio». Si no aparece, la página debe abrirse con https://.</p>'}
    <p class="nota">${"serviceWorker" in navigator && navigator.serviceWorker.controller ? "✔ Guardada para trabajar sin internet." : "Aún no está guardada para usarla sin internet (ábrala una vez con conexión)."}</p></div>`;
  $("x-json").onclick = () => { descargar(blobJson(), base() + ".json"); $("x-msg").textContent = "Descargado (carpeta Descargas)."; };
  $("x-csv").onclick = () => descargar(csv(), base() + ".csv"); $("x-gpx").onclick = () => descargar(gpx(), base() + ".gpx"); $("x-kml").onclick = () => descargar(kml(), base() + ".kml");
  $("x-comp").onclick = async () => { const f = new File([blobJson()], base() + ".json", {type: "application/json"}); if (navigator.canShare && navigator.canShare({files: [f]})) { try { await navigator.share({files: [f], title: c.nombre}); $("x-msg").textContent = "Enviado."; } catch (e) { if (e.name !== "AbortError") $("x-msg").textContent = "No se pudo compartir: " + e.message; } } else { descargar(f, f.name); $("x-msg").textContent = "Este navegador no comparte archivos: se descargó."; } };
  const msgArchivo = (t, err) => { const m = $("x-file-msg"); if (m) { m.style.color = err ? "var(--ro)" : "var(--ok)"; m.textContent = t; } if (err) alert(t); };
  const importar = texto => { try { const d = JSON.parse(texto); if (d.formato !== "ccp-bitacora-trazadores" || d.version !== 2) throw new Error("No es un archivo de esta app."); const k = nueva(d.campana?.nombre); Object.assign(k, {id: d.campana_id || k.id, nombre: d.campana?.nombre || k.nombre, fecha: d.campana?.fecha || k.fecha, responsable: d.campana?.responsable || "", cuadrilla: d.campana?.cuadrilla || "", clima: d.campana?.clima || "", observaciones: d.observaciones || "",
      puntos: (d.puntos || []).map(p => ({id: p.id, nombre: p.nombre, rol: p.rol, lat: p.lat, lon: p.lon, acc: p.precision_m, cota: p.cota ?? null, cota_origen: p.cota_origen ?? null, alt_gps: p.alt_gps ?? null, alt_acc: p.alt_acc ?? null, notas: p.notas || "", hid: p.hidraulica || {}})), tramos: d.tramos || [], params: {...PARAM0, ...(d.parametros || {})}, aforos: d.aforos || [], eventos: d.eventos || [], programacion: d.programacion || null,
      inyeccion: {...k.inyeccion, masa_kg: d.inyeccion?.masa_kg ?? null, pureza: d.inyeccion?.pureza ?? 0.95, agua_l: d.inyeccion?.agua_l ?? null, hora: d.inyeccion?.hora || "", t0_iso: d.inyeccion?.t0_iso || null, sal: d.inyeccion?.sal || ""}});
      k.registros = {}; Object.entries(d.registro_estaciones || {}).forEach(([nom, r]) => { const p = k.puntos.find(x => x.nombre === nom); if (p) k.registros[p.id] = r; });
      DB.campanas = DB.campanas.filter(x => x.id !== k.id); DB.campanas.push(k); k.exp = k.mod = Date.now() + 1; DB.activa = k.id; guardar(true); pintarCabecera(); pintarGuardar(); msgArchivo("✔ Campaña cargada: " + k.nombre + " (" + k.puntos.length + " puntos)."); } catch (e) { msgArchivo(e instanceof SyntaxError ? "El archivo no es un .json válido (¿está incompleto o es otro tipo de archivo?)." : "No se pudo cargar: " + e.message, true); } };
  const leer = f => new Promise((res, rej) => { try { f.text().then(res, () => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error("leer")); r.readAsText(f); }); } catch (e) { rej(e); } });
  $("x-file").onchange = async ev => { const f = ev.target.files[0]; if (!f) return; msgArchivo("Leyendo «" + f.name + "» (" + Math.max(1, Math.round(f.size / 1024)) + " KB)…");
    try { importar(await leer(f)); } catch (e) { msgArchivo("No se pudo leer «" + f.name + "». Si está en Drive: ábralo en la app de Drive, toque ⋮ → Descargar, y elíjalo desde «Descargas»; o use «pegar su contenido» aquí abajo.", true); }
    ev.target.value = ""; };
  $("x-pegar-ok").onclick = () => { const t = $("x-pegar").value.trim(); if (!t) return msgArchivo("Pegue primero el texto del archivo.", true); importar(t); };
  document.querySelectorAll("[data-del]").forEach(b => b.onclick = () => { const k = DB.campanas.find(x => x.id === b.dataset.del); if (confirm("¿Borrar «" + k.nombre + "» de este teléfono? Si no la descargó, se pierde.")) { DB.campanas = DB.campanas.filter(x => x !== k); if (DB.activa === k.id) DB.activa = DB.campanas[0].id; guardar(); pintarCabecera(); pintarGuardar(); } });
  if ($("x-inst")) $("x-inst").onclick = async () => { PROMPT_INSTALAR.prompt(); await PROMPT_INSTALAR.userChoice; PROMPT_INSTALAR = null; pintarGuardar(); };
}

// ------------------------------------------------------------------ arranque
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
window.addEventListener("beforeunload", ev => { if (REC) { ev.preventDefault(); ev.returnValue = ""; } });
try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().then(ok => { DB.persistente = ok; guardar(true); }); } catch (e) {}
pintarCabecera(); pintarGPS(); mostrar();
