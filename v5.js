/* Portfólio v5: a viagem de um dado. Rolagem com Lenis + ScrollTrigger num só relógio (o do GSAP).
   Regra de desempenho: o que acompanha a rolagem só mexe em transform e opacity, e nada escreve em estado por quadro. */
(() => {
  const D = window.KM;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const wide = () => innerWidth > 860;
  const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const fmt = n => n.toLocaleString("pt-BR");
  const hasGsap = !!(window.gsap && window.ScrollTrigger);
  if (hasGsap) gsap.registerPlugin(ScrollTrigger);

  /* ---------- rolagem suave: Lenis no relógio do GSAP ---------- */
  let lenis = null;
  // no Safari a rolagem nativa do trackpad já é suave, e o Lenis por cima briga com o position: sticky
  // (as cenas grudadas tremem e escorregam): lá fica a rolagem do próprio navegador
  const safari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
  if (hasGsap && window.Lenis && !reduce && !safari) {
    lenis = new Lenis({ lerp: 0.11, wheelMultiplier: 1, smoothWheel: true });
    lenis.on("scroll", ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  window.__lenis = lenis;   // o laboratório (iframe) só repassa a roda do mouse quando a página usa o Lenis
  const go = id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.4 });
    else el.scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  };
  $$("[data-go]").forEach(a => a.addEventListener("click", e => { e.preventDefault(); go(a.dataset.go); }));
  $("#year").textContent = new Date().getFullYear();

  /* ---------- barra: relógio de Niterói, capítulo e progresso ---------- */
  const clock = $("#clock");
  const hhmm = () => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(new Date());
  const tickClock = () => { clock.textContent = `Niterói ${hhmm()}`; };
  tickClock(); setInterval(tickClock, 15000);
  const bar = $("#bar"), chapN = $("#chap-n"), chapT = $("#chap-t"), progress = $("#progress");
  const chapIO = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    chapN.textContent = e.target.dataset.chap; chapT.textContent = e.target.dataset.title;
    bar.classList.toggle("named", e.target.id !== "topo");
  }), { rootMargin: "-45% 0px -54% 0px" });
  $$("[data-chap]").forEach(s => chapIO.observe(s));

  /* ---------- 00 · o mapa e as estações ao vivo ---------- */
  const GEO = { lon0: -43.1622, lon1: -42.935, lat0: -22.9791, lat1: -22.851, w: 2000, h: 1225 };
  const toMap = (lon, lat) => [(lon - GEO.lon0) / (GEO.lon1 - GEO.lon0) * GEO.w, (GEO.lat1 - lat) / (GEO.lat1 - GEO.lat0) * GEO.h];
  const stations = new Map(D.stations.map(([n, name, lon, lat, cap]) => [n, { n, name, lon, lat, cap, bikes: null, free: null }]));
  const svg = $("#heroSt"), tip = $("#heroTip"), mapEl = $("#heroMap");
  const NS = "http://www.w3.org/2000/svg";
  const nodes = new Map();
  let k = 0;
  stations.forEach(s => {
    const [x, y] = toMap(s.lon, s.lat);
    s.x = x; s.y = y;
    const g = document.createElementNS(NS, "g");
    // só algumas estações pulsam: cada anel animado repinta a camada do mapa
    const ring = k++ % 8 === 0 ? `<circle class="ring" cx="${x}" cy="${y}" r="6" style="--d:${(k % 5) * 0.7}s"/>` : `<circle class="ring" cx="${x}" cy="${y}" r="0"/>`;
    g.innerHTML = `<circle class="halo" cx="${x}" cy="${y}" r="9"/>${ring}<circle cx="${x}" cy="${y}" r="3.2"/>`;
    svg.appendChild(g);
    nodes.set(s.n, g);
    const show = () => {
      const r = g.getBoundingClientRect(), st = mapEl.parentElement.getBoundingClientRect();
      tip.innerHTML = `<b>${s.name}</b>${s.bikes == null ? `estação ${s.n} · ${s.cap} vagas no total` : `${s.bikes} bikes paradas · ${s.free} vagas livres`}`;
      tip.style.left = `${r.left + r.width / 2 - st.left}px`; tip.style.top = `${r.top - st.top}px`;
      tip.classList.add("on"); g.classList.add("on");
    };
    const hide = () => { tip.classList.remove("on"); g.classList.remove("on"); };
    g.addEventListener("pointerenter", show); g.addEventListener("focus", show);
    g.addEventListener("pointerleave", hide); g.addEventListener("blur", hide);
  });
  const sizeStations = () => stations.forEach(s => {
    const g = nodes.get(s.n), fill = s.bikes == null ? 0.5 : Math.min(1, s.bikes / Math.max(1, s.cap));
    const r = 2.2 + fill * 4.2;
    g.children[2].setAttribute("r", r.toFixed(1));
    g.children[0].setAttribute("r", (r + 5).toFixed(1));
  });
  sizeStations();
  // os anéis param quando a abertura sai da tela
  new IntersectionObserver(([e]) => svg.classList.toggle("still", !e.isIntersecting)).observe($(".hero"));

  const live = $("#heroLive span");
  const LAYER = "https://services8.arcgis.com/TpaOLI1HCh5AcRQB/ArcGIS/rest/services/NGP_SEMOBI_NITBIKE_P_ESTACOES_DE_BICICLETA/FeatureServer/5/query?where=1%3D1&outFields=si_stationNumber,si_bikeAvailable,si_positionAvailable,dt_atualizado&returnGeometry=false&f=json";
  let lastRead = null;
  const readLive = () => fetch(LAYER, { cache: "no-store" }).then(r => r.json()).then(d => {
    let bikes = 0, n = 0, newest = 0;
    (d.features || []).forEach(({ attributes: a }) => {
      const s = stations.get(a.si_stationNumber);
      if (!s) return;
      s.bikes = a.si_bikeAvailable ?? 0; s.free = a.si_positionAvailable ?? 0;
      bikes += s.bikes; n++; newest = Math.max(newest, a.dt_atualizado || 0);
    });
    if (!n) throw new Error("vazio");
    sizeStations();
    lastRead = { bikes, n, at: newest ? new Date(newest) : new Date() };
    const at = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(lastRead.at);
    live.textContent = `ao vivo · ${fmt(bikes)} bikes paradas em ${n} estações · leitura das ${at}`;
    tripLive();
  }).catch(() => { live.textContent = "camada pública fora do ar agora · mostrando as posições das estações"; });
  readLive(); setInterval(readLive, 60000);

  // câmera: no começo a rede inteira à direita do nome; ao rolar, desce até o Terminal (estação 4), no Centro
  const term = stations.get(4) || [...stations.values()][0];
  let Z1 = 2.6;
  const camera = p => {
    const vw = innerWidth, vh = innerHeight, mob = !wide();
    const zA = mob ? 0.95 : Math.max(1.1, Math.min(1.75, vw / 900)), zB = mob ? 2.1 : 2.6;
    const ax = mob ? 0.62 : 0.66, ay = mob ? 0.34 : 0.42;
    const A = { x: vw * ax - 450 * zA, y: vh * ay - 430 * zA, z: zA };
    const B = { x: vw * 0.5 - term.x * zB, y: vh * 0.42 - term.y * zB, z: zB };
    const e = p * p * (3 - 2 * p);
    const z = A.z + (B.z - A.z) * e;
    const x = A.x + (B.x - A.x) * e, y = A.y + (B.y - A.y) * e;
    mapEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${(z / Z1).toFixed(4)})`;
  };
  const sizeMap = () => {
    Z1 = wide() ? 2.6 : 2.1;
    Object.assign(mapEl.style, { left: "0px", top: "0px", margin: "0", width: `${2000 * Z1}px`, height: `${1225 * Z1}px` });
  };
  sizeMap(); camera(0);
  addEventListener("resize", () => { sizeMap(); camera(heroP); });
  let heroP = 0;

  /* ---------- 01 · quem ---------- */
  $("#whoFacts").innerHTML = D.facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("");
  $("#whoStats").innerHTML = D.stats.map(([v, l]) => `<div><b data-to="${v}">${reduce ? v : 0}</b><span>${l}</span></div>`).join("");
  const say = $(".who-say");
  say.innerHTML = say.textContent.split(" ").map(w => `<span class="w">${w}</span>`).join(" ");
  const countIO = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    countIO.unobserve(e.target);
    const b = e.target, to = +b.dataset.to, t0 = performance.now();
    const step = now => { const p = Math.min(1, (now - t0) / 1400); b.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }), { threshold: 0.6 });
  if (!reduce) $$("#whoStats b").forEach(b => countIO.observe(b));

  /* ---------- 02 · o caminho do dado ---------- */
  // UTM zona 23 Sul (SIRGAS 2000 / EPSG 31983), a conversão que o update_arcgis faz antes de gravar na camada
  const toUTM23S = (lon, lat) => {
    const a = 6378137, f = 1 / 298.257222101, k0 = 0.9996, e2 = f * (2 - f), ep2 = e2 / (1 - e2);
    const rad = Math.PI / 180, lon0 = -45 * rad, phi = lat * rad, lam = lon * rad;
    const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2), T = Math.tan(phi) ** 2, C = ep2 * Math.cos(phi) ** 2, A = Math.cos(phi) * (lam - lon0);
    const M = a * ((1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256) * phi - (3 * e2 / 8 + 3 * e2 ** 2 / 32 + 45 * e2 ** 3 / 1024) * Math.sin(2 * phi) + (15 * e2 ** 2 / 256 + 45 * e2 ** 3 / 1024) * Math.sin(4 * phi) - (35 * e2 ** 3 / 3072) * Math.sin(6 * phi));
    const E = 500000 + k0 * N * (A + (1 - T + C) * A ** 3 / 6 + (5 - 18 * T + T ** 2 + 72 * C - 58 * ep2) * A ** 5 / 120);
    const Nn = 10000000 + k0 * (M + N * Math.tan(phi) * (A ** 2 / 2 + (5 - T + 9 * C + 4 * C ** 2) * A ** 4 / 24 + (61 - 58 * T + T ** 2 + 600 * C - 330 * ep2) * A ** 6 / 720));
    return [E, Nn];
  };
  const [uE, uN] = toUTM23S(term.lon, term.lat);
  const nf = (v, d = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
  const idle = window.requestIdleCallback || (fn => setTimeout(fn, 1));

  /* ---------- 02 + 03 · a viagem do dado: uma cena só, em WebGL ---------- */
  // os 65 pontos da cena são as estações: mudam de forma a cada etapa e terminam como uma das seis camadas do Gêmeo.
  // A rolagem só entrega um número (0 a 1); quem desenha é o scene.js, no próprio relógio.
  const tripEl = $(".trip"), tripRun = $("#tripRun"), tripStage = $("#tripStage");
  const lay = [...D.layers], LN = lay.length;
  const CAPS = [
    { t: "Feed", k: "API · a cada 10 s", h: `A cada 10 s, a API do NitBike <em>fala.</em>`,
      p: `A cada <strong>10 s</strong>, a API informa as bikes paradas e as vagas livres de cada uma das <strong>65 estações</strong>. Solto, isso é só uma fila de números.`,
      hud: `<pre class="code" id="feedArt"></pre>` },
    { t: "Coleta", k: "Python · a cada 10 s", h: `Os números entram <em>na roda.</em>`,
      p: `A cada volta, o Python pega a fila solta de números e põe ordem: cada estação vira uma linha com o mesmo formato, <strong>bikes, vagas e a hora da leitura</strong>. O que chega torto é conferido antes de seguir. Volta após volta, a cidade inteira cabe num retrato de <strong>10 em 10 segundos</strong>.`,
      hud: `<pre class="code"><span class="k">def</span> <span class="n">organizar</span>(estacoes):
    agora = relogio()
    <span class="k">return</span> [
        {<span class="s">"estacao"</span>: e.numero,
         <span class="s">"bikes"</span>: e.bikes,
         <span class="s">"vagas"</span>: e.vagas,
         <span class="s">"hora"</span>: agora}
        <span class="k">for</span> e <span class="k">in</span> estacoes  <span class="c"># 65</span>
    ]</pre>` },
    { t: "Banco", k: "PostgreSQL · janela de 5 min", h: `A janela de <em>5 minutos.</em>`,
      p: `A cada minuto, aos :30, a publicação lê a <strong>janela dos últimos 5 min</strong> (30 snapshots) e compara: subiu, entraram bikes; caiu, saíram. Os 30 s mais recentes ficam para a próxima. O que já saiu da janela é apagado.`,
      hud: `<div class="key"><span class="k-old">apagados</span><span class="k-win">na janela</span><span class="k-new">últimos 30 s</span></div>` },
    { t: "Camada", k: "ArcGIS · 1 por minuto", h: `Coordenadas que o mapa <em>entende.</em>`,
      p: `Antes de gravar no ArcGIS, cada ponto sai de latitude e longitude para <strong>SIRGAS 2000 / UTM 23S</strong> (EPSG 31983). A camada guarda entradas, saídas, fluxo e o ranking de cada estação. O pico do dia só é regravado quando o total passa dele, e reinicia quando o dia vira.`,
      hud: `<div class="utm"><small>Estação ${term.n} · ${term.name}</small><b>${nf(term.lat, 5)}, ${nf(term.lon, 5)}</b><i>↓ EPSG 4326 → EPSG 31983</i><div><span><small>Leste</small><b>${nf(uE)} m</b></span><span><small>Norte</small><b>${nf(uN)} m</b></span></div></div>` },
    { t: "Mapa", k: "Gêmeo Digital", h: `Do feed ao mapa, <em>um minuto.</em>`,
      p: `O Gêmeo plota as estações ao lado das outras fontes oficiais: trânsito do Waze (a cada 2 min), ônibus, câmeras, chuva e edificações em 3D. Do feed ao mapa, um minuto.`,
      hud: `<div class="now"><b id="tripBikes">…</b><span id="tripAt">bikes paradas · lendo a camada pública</span></div>` },
    { t: "Camadas", k: "6 fontes oficiais", h: `Seis camadas no Gêmeo. <em>Duas são minhas.</em>`,
      p: `O Gêmeo Digital de Niterói junta dados oficiais em tempo real para planejar e monitorar a cidade. Eu cuido do trânsito e do NitBike.`,
      hud: `<ol class="cap-layers">${lay.slice().reverse().map((l, i) => `<li class="${l.mine ? "mine" : ""}" data-layer="${LN - 1 - i}" tabindex="0"><b>${l.name}</b> ${l.source}</li>`).join("")}</ol>
        <a class="pill pill-line" href="https://gemeo.niteroi.rj.gov.br/" target="_blank" rel="noopener noreferrer">Abrir o Gêmeo Digital ↗</a>
        <p class="cap-note">Posições reais das camadas públicas, no recorte do Centro e de Icaraí. Trânsito e bikes lidos agora; prédios do OpenStreetMap, com a altura exagerada. São ilustrativos os ônibus andando e a altura e as gotas da chuva.</p>`, keep: true },
  ];
  $("#tripCaps").innerHTML = CAPS.map((c, i) => `<article class="cap" id="cap-${i}"><span class="cap-k"><b>0${i + 1}</b>/0${CAPS.length} · ${c.t}<i>${c.k}</i></span><h3>${c.h}</h3><p>${c.p}</p><div class="cap-hud${c.keep ? " keep" : ""}">${c.hud}</div></article>`).join("");
  $("#tripRail").innerHTML = CAPS.map((c, i) => `<button type="button" aria-label="Etapa ${i + 1}: ${c.t}"><i class="rl"><i></i></i><span>0${i + 1}</span><b>${c.t}</b></button>`).join("");
  $("#tripTags").innerHTML = lay.map((l, i) => `<span class="trip-tag${l.mine ? " mine" : ""}" data-layer="${i}"><b>0${i + 1}</b>${l.name}<em></em></span>`).join("");
  const caps = $$(".cap", tripEl), railBtns = $$("#tripRail button"), railFills = $$("#tripRail .rl > i"), tripTags = $$(".trip-tag", tripEl);
  const iBike = lay.findIndex(l => l.name === "NitBike"), iWaze = lay.findIndex(l => l.name === "Trânsito");

  const B = [0, 0.11, 0.22, 0.34, 0.45, 0.56, 1];
  const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  let layAt = -1, sweepAt = -1;
  const layEls = $$("[data-layer]", tripEl);
  let trip = null, tripST = null, tripP = 0, capAt = -1, tripSeen = false, wazePts = null;
  const railW = railFills.map(() => -1);
  const tripTo = p => {
    tripP = p;
    let i = 0; while (i < 5 && p >= B[i + 1]) i++;
    // o giro da etapa 05 para a 06 é mais longo: é nele que as colunas sobem e os prédios nascem
    const st = i >= 5 ? 5 : i + ss(i === 4 ? 0.25 : 0.6, 1, (p - B[i]) / (B[i + 1] - B[i]));
    if (trip) trip.set(st, ss(0.56, 0.68, p));
    // no fim, a rolagem passa o destaque pelas camadas: descendo, de cima para baixo; subindo, ao contrário
    const sw = (p - 0.71) / 0.26;
    const want = sw < 0 ? -1 : LN - 1 - Math.min(LN - 1, Math.floor(sw * LN));
    if (want !== sweepAt) { sweepAt = want; focusLayer(want); }
    const at = Math.round(st);
    if (at !== capAt) {
      capAt = at;
      caps.forEach((c, j) => c.classList.toggle("on", j === at));
      railBtns.forEach((b, j) => { b.classList.toggle("on", j === at); b.setAttribute("aria-current", j === at ? "step" : "false"); });
    }
    railFills.forEach((f, j) => {
      const w = Math.round(Math.min(1, Math.max(0, (p - B[j]) / (B[j + 1] - B[j]))) * 500) / 500;
      if (w !== railW[j]) { railW[j] = w; f.style.transform = `scaleX(${w})`; }
    });
    // a barra de cima troca de capítulo quando as camadas se separam
    const n = p >= 0.55 ? "03" : "02";
    if (tripSeen && chapN.textContent !== n) { chapN.textContent = n; chapT.textContent = n === "03" ? "Camadas" : "O caminho do dado"; }
  };
  railBtns.forEach((b, i) => b.addEventListener("click", () => {
    if (!tripST) return;
    const y = tripST.start + (tripST.end - tripST.start) * (i === 5 ? 0.7 : B[i] + 0.015);
    if (lenis) lenis.scrollTo(y, { duration: 1.1 }); else scrollTo({ top: y, behavior: "smooth" });
  }));
  tripTo(0);

  // destaque de uma camada: pelo texto, pela etiqueta ou pela própria lâmina na cena
  function focusLayer(k) {
    if (k === layAt) return; layAt = k;
    tripStage.classList.toggle("pick", k >= 0);
    layEls.forEach(el => el.classList.toggle("hot", +el.dataset.layer === k));
    if (trip) trip.focus(k);
  }
  // pular a rolagem para um ponto, sem animação (o que está grudado na tela não se mexe)
  const jumpTo = y => { if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else scrollTo(0, y); };
  // quando a pessoa escolhe uma camada (mouse, toque ou teclado), a rolagem vai para o ponto daquela camada:
  // assim, ao voltar a rolar, a sequência continua de onde ela estava olhando, e não do começo
  const userLayer = k => {
    if (k < 0) { focusLayer(sweepAt); return; }
    focusLayer(k);
    if (!tripST || !tripST.isActive || tripP < 0.66) return;
    const p = 0.71 + (LN - 1 - k + 0.5) / LN * 0.26;
    sweepAt = k; jumpTo(tripST.start + (tripST.end - tripST.start) * p);
  };
  layEls.forEach(el => {
    const k = +el.dataset.layer;
    el.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") userLayer(k); });
    el.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") userLayer(-1); });
    el.addEventListener("focus", () => userLayer(k));
    el.addEventListener("blur", () => userLayer(-1));
    el.addEventListener("click", () => userLayer(k));
  });

  function tripLive() {
    const s = term;
    $("#feedArt").innerHTML = `<span class="c">GET /estacoes · ${lastRead ? "agora" : "retrato"}</span>
{
  <span class="n">"estacao"</span>: ${s.n},
  <span class="n">"nome"</span>: <span class="s">"${s.name}"</span>,
  <span class="n">"bikes"</span>: ${s.bikes ?? "…"},
  <span class="n">"vagas"</span>: ${s.free ?? "…"},
  <span class="n">"lat"</span>: ${s.lat},
  <span class="n">"lon"</span>: ${s.lon}
}`;
    if (lastRead) {
      $("#tripBikes").textContent = fmt(lastRead.bikes);
      $("#tripAt").textContent = `bikes paradas em ${lastRead.n} estações · leitura das ${new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(lastRead.at)}`;
      tripTags[iBike].querySelector("em").textContent = `${fmt(lastRead.bikes)} bikes agora`;
    }
    if (trip) trip.setBikes();
    tkFill();
  }
  // a faixa entre o laboratório e as outras frentes repete o que as camadas públicas dizem agora
  function tkFill() {
    const at = lastRead ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(lastRead.at) : null;
    const items = [
      `<b>Niterói agora</b>`,
      lastRead ? `NitBike <i>${fmt(lastRead.bikes)}</i> bikes paradas em ${lastRead.n} estações` : `NitBike <i>65</i> estações na camada pública`,
      wazePts ? `Waze <i>${wazePts.length}</i> alertas de trânsito` : `Waze alertas a cada <i>2 min</i>`,
      at ? `leitura das <i>${at}</i>` : `leitura a cada <i>1 min</i>`,
      `Gêmeo Digital <i>6</i> camadas, <i>2</i> minhas`,
    ].map(t => `<span>${t}</span>`).join("");
    $("#tkA").innerHTML = items; $("#tkB").innerHTML = items;
  }
  tripLive();

  // a cena e os alertas do Waze só são buscados quando a viagem chega perto da tela
  const WAZE = "https://services8.arcgis.com/TpaOLI1HCh5AcRQB/ArcGIS/rest/services/WAZE_Alertas_LIVE/FeatureServer/0/query?where=1%3D1&outFields=db_lat,db_long&returnGeometry=false&f=json";
  let tripVisible = false, jams = null;
  const paintJams = () => {
    const n = trip.setJams(jams.list);
    tripTags[iWaze].querySelector("em").textContent = `${n} trechos ${jams.label}`;
  };
  const tripFlat = () => { tripEl.classList.add("flat"); if (hasGsap) ScrollTrigger.refresh(); };
  const loadTrip = () => {
    fetch(WAZE).then(r => r.json()).then(d => {
      const pts = (d.features || []).map(f => toMap(+f.attributes.db_long, +f.attributes.db_lat)).filter(p => isFinite(p[0]) && isFinite(p[1]));
      if (!pts.length) return;
      wazePts = pts;
      tripTags[iWaze].querySelector("em").textContent = `${pts.length} alertas agora`;
      tkFill();
      if (trip) trip.setWaze(pts);
    }).catch(() => {});
    // trechos de trânsito: ao vivo; de madrugada quase não há fila, então entra o retrato de um dia útil
    const JAMS = "https://services8.arcgis.com/TpaOLI1HCh5AcRQB/ArcGIS/rest/services/WAZE_Tr%C3%A1fego_LIVE/FeatureServer/0/query?where=1%3D1&outFields=li_nivel&returnGeometry=true&outSR=4326&f=json";
    const fromLive = d => (d.features || []).map(f => ({ n: f.attributes.li_nivel || 1, g: ((f.geometry && f.geometry.paths) || [])[0] || [] })).map(t => ({ n: t.n, g: t.g.map(([lon, lat]) => toMap(lon, lat)) })).filter(t => t.g.length > 1);
    const setJams = (list, label) => { jams = { list, label }; if (trip) paintJams(); };
    fetch(JAMS).then(r => r.json()).then(d => {
      const live = fromLive(d);
      if (live.length >= 12) return setJams(live, "agora");
      return fetch("transito-retrato.json").then(r => r.json()).then(s => setJams(s.trechos, `retrato · ${new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(new Date(s.retrato))}`));
    }).catch(() => fetch("transito-retrato.json").then(r => r.json()).then(s => setJams(s.trechos, "retrato")).catch(() => {}));
    import("./scene.js?v=202611101438").then(m => {
      trip = m.createTrip({ canvas: $("#tripGL"), stations: [...stations.values()], term, geo: window.KMGEO || { cams: [], gauges: [], routes: [] }, layers: lay, mapSrc: "mapa-niteroi.svg", tagEls: tripTags, onFocus: userLayer });
      trip.setBikes(); if (wazePts) trip.setWaze(wazePts); if (jams) paintJams();
      tripTo(tripP);
      if (tripVisible) trip.start();
      addEventListener("resize", () => trip.resize());
      requestAnimationFrame(() => tripEl.classList.add("gl"));
    }).catch(tripFlat);
  };
  if (hasGsap && !reduce) {
    // montar a cena (shaders, geometria, texturas) trava o navegador por alguns décimos de segundo:
    // isso acontece num momento ocioso logo depois da abertura, e não no meio da rolagem
    let tripAsked = false;
    const askTrip = () => { if (tripAsked) return; tripAsked = true; nearIO.disconnect(); loadTrip(); };
    const nearIO = new IntersectionObserver(([e]) => { if (e.isIntersecting) askTrip(); }, { rootMargin: "150% 0px" });
    nearIO.observe(tripEl);
    addEventListener("load", () => setTimeout(() => idle(askTrip, { timeout: 2500 }), 600));
    new IntersectionObserver(([e]) => { tripVisible = tripSeen = e.isIntersecting; if (trip) trip[tripVisible ? "start" : "stop"](); }).observe(tripStage);
  }

  /* ---------- 03 · outras frentes: Colab e a prova de conceito ---------- */
  const C = D.colab, cMax = Math.max(...C.series.map(s => s[1])), cLast = C.series.length - 1;
  $("#civic").innerHTML = `<div class="civ-top">
      <div class="civ-big"><p class="eyebrow">05 — Outras frentes · Colab</p><b>${C.kpis[0][0]}</b><span>${C.kpis[0][1]}</span></div>
      <div class="civ-side"><h3>Pedidos dos moradores, <em>no mapa</em></h3><p class="lead">${C.pitch}</p>
        <div class="split" aria-hidden="true"><i style="flex:${parseInt(C.kpis[1][0])}"></i><i style="flex:${parseInt(C.kpis[2][0])}"></i></div>
        <div class="split-k"><span><b>${C.kpis[1][0]}</b> ${C.kpis[1][1]}</span><span><b>${C.kpis[2][0]}</b> ${C.kpis[2][1]}</span></div></div>
    </div>
    <div class="sky" id="sky" role="img" aria-label="Solicitações por ano, de ${C.series[0][0]} a ${C.series[cLast][0]}">${C.series.map(([y, v], i) => `<div class="${v === cMax ? "peak" : ""}${i === cLast ? " last" : ""}" style="--v:${(v / cMax).toFixed(3)};--d:${(i * 0.035 + i * i * 0.003).toFixed(3)}s"><b>${fmt(v)}${i === cLast ? " · parcial" : ""}</b><i></i><small>${String(y).slice(2)}</small></div>`).join("")}</div>
    <p class="src">Solicitações por ano · ${C.source}</p>
    <div class="civ-mine"><p class="eyebrow">O que eu fiz ali</p><ol>${C.mine.map(m => `<li>${m}</li>`).join("")}</ol>
      <a class="pill pill-line" href="${C.url}" target="_blank" rel="noopener noreferrer">Ver o painel ↗</a></div>
    <div class="poc"><div class="poc-head"><div><p class="eyebrow">Prova de conceito · em andamento</p><h3>Prever o trânsito <em>antes de ele travar</em></h3></div><p class="lead">${D.poc.pitch}</p></div>
      <ol class="poc-line">${D.poc.steps.map((s, i) => `<li><small>0${i + 1}</small><b>${s}</b><span>a fazer</span></li>`).join("")}</ol></div>`;
  // cada bloco entra uma vez, quando chega à tela
  new IntersectionObserver(([e]) => $("#ticker").classList.toggle("live", e.isIntersecting)).observe($("#ticker"));
  const onceIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { onceIO.unobserve(e.target); e.target.classList.add("on"); } }), { threshold: 0.3 });
  $$("#civic .civ-top, #sky, #civic .poc-line").forEach(el => onceIO.observe(el));

  /* ---------- 04 · laboratório (página isolada, carrega perto) ---------- */
  // o laboratório é pesado (o React do site inteiro): carregar no meio da rolagem trava quadros,
  // então ele entra num momento ocioso logo depois da abertura, ou antes, se a pessoa chegar perto
  const labFrame = $("#labFrame");
  let labOn = false;
  const loadLab = () => {
    if (labOn) return; labOn = true;
    const f = document.createElement("iframe");
    f.src = "lab.html?v=202611101438"; f.title = "Gêmeo simplificado e pipeline do NitBike";
    labFrame.innerHTML = ""; labFrame.appendChild(f);
  };
  addEventListener("load", () => setTimeout(() => idle(loadLab, { timeout: 4000 }), 3200));
  const labIO = new IntersectionObserver(es => { if (es[0].isIntersecting) { labIO.disconnect(); loadLab(); } }, { rootMargin: "200% 0px" });
  labIO.observe(labFrame);
  // o quadro é do mesmo site, então o navegador não o pausa sozinho: longe da tela, ele para de animar
  let labNear = false;
  const labPause = () => { const f = $("iframe", labFrame); if (f && f.contentWindow) f.contentWindow.postMessage({ type: "lab-pause", on: !labNear }, location.origin); };
  new IntersectionObserver(([e]) => {
    labNear = e.isIntersecting; labPause();
    if (labNear && labPending) { labH = labPending; labPending = 0; labFrame.style.setProperty("--h", `${labH}px`); if (hasGsap) ScrollTrigger.refresh(); }
  }, { rootMargin: "40% 0px" }).observe(labFrame);
  labFrame.addEventListener("load", labPause, true);
  // a altura do quadro muda muitas vezes enquanto o React monta: o refresh só roda quando ela assenta
  let labH = 0, labT = 0, labPending = 0;
  addEventListener("message", e => {
    if (e.origin !== location.origin || !e.data || e.data.type !== "lab-height") return;
    const nh = Math.ceil(e.data.h);
    if (Math.abs(nh - labH) <= 2) return;
    // longe da tela a altura do quadro não muda: sem isso, no Safari (que não compensa a rolagem
    // quando algo acima cresce) a página inteira pulava enquanto a pessoa estava mais embaixo
    if (labH && !labNear) { labPending = nh; return; }
    labH = nh; labFrame.style.setProperty("--h", `${nh}px`);
    if (hasGsap) { clearTimeout(labT); labT = setTimeout(() => ScrollTrigger.refresh(), 220); }
  });

  /* ---------- 05 · quadro de partidas ---------- */
  const flap = $("#flap");
  const W = { when: 8, to: 21, what: 23, status: 9 };
  const pad = (s, n) => s.toUpperCase().padEnd(n, " ").slice(0, n);
  const cells = (s, n) => [...pad(s, n)].map(c => `<span class="cell" data-c="${c === " " ? "&nbsp;" : c}">&nbsp;</span>`).join("");
  flap.innerHTML = `<div class="flap-row head" role="row"><span role="columnheader">Partida</span><span role="columnheader">Destino</span><span role="columnheader">Função</span><span role="columnheader">Situação</span></div>` +
    D.departures.map(d => `<div class="flap-row" role="row"><span class="flap-cells" role="cell" aria-label="${d.when}">${cells(d.when, W.when)}</span><span class="flap-cells" role="cell" aria-label="${d.to}">${cells(d.to, W.to)}</span><span class="flap-cells" role="cell" aria-label="${d.what}">${cells(d.what, W.what)}</span><span class="flap-cells st${d.status === "CONCLUÍDO" ? " done" : ""}" role="cell" aria-label="${d.status}">${cells(d.status, W.status)}</span></div>`).join("");
  $$(".cell", flap).forEach(c => c.setAttribute("aria-hidden", "true"));
  const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·";
  const FLIP = [{ transform: "scaleY(1)" }, { transform: "scaleY(.15)" }, { transform: "scaleY(1)" }];
  const runFlap = () => {
    $$(".flap-row:not(.head)", flap).forEach((row, r) => $$(".cell", row).forEach((c, i) => {
      const target = c.dataset.c, turns = reduce ? 0 : 4 + ((i * 7 + r * 3) % 9);
      let n = 0;
      const step = () => {
        if (n >= turns) { c.innerHTML = target; return; }
        c.textContent = GLYPHS[(i * 5 + n * 11 + r) % GLYPHS.length];
        // cada virada é uma animação nova da Web Animations: sem reiniciar classe, sem forçar layout a cada letra
        c.animate(FLIP, 90);
        n++; setTimeout(step, 70);
      };
      setTimeout(step, reduce ? 0 : r * 160 + i * 18);
    }));
  };
  const flapIO = new IntersectionObserver(es => { if (es[0].isIntersecting) { flapIO.disconnect(); runFlap(); } }, { threshold: 0.35 });
  flapIO.observe(flap);

  $("#lines").innerHTML = D.lines.map((l, i) => `<li><button class="line-btn" type="button" aria-expanded="false" aria-controls="line-${i}"><span class="line-n">${l.n}</span><span class="line-t">${l.title}</span><span class="line-w">${l.where}</span><span class="line-x" aria-hidden="true"></span></button><div class="line-body" id="line-${i}"><div><div class="line-in"><p>${l.text}</p><div class="chips">${l.tech.map(t => `<span>${t}</span>`).join("")}</div></div></div></div></li>`).join("");
  $$(".line-btn").forEach(b => b.addEventListener("click", () => {
    const li = b.parentElement, open = !li.classList.contains("open");
    li.classList.toggle("open", open); b.setAttribute("aria-expanded", open);
    if (hasGsap) setTimeout(() => ScrollTrigger.refresh(), 480);
  }));

  /* ---------- 06 · projetos: uma página por projeto, com a demonstração em 3D de CSS ---------- */
  // as três demonstrações são montadas uma vez; depois só mudam transform e opacity
  const UFS = [["RR", 2, 1], ["AP", 4, 1], ["AM", 1, 2], ["PA", 3, 2], ["MA", 4, 2], ["CE", 5, 2], ["RN", 6, 2], ["AC", 0, 3], ["RO", 1, 3], ["TO", 3, 3], ["PI", 4, 3], ["PE", 5, 3], ["PB", 6, 3], ["MT", 2, 4], ["GO", 3, 4], ["BA", 4, 4], ["SE", 5, 4], ["AL", 6, 4], ["MS", 2, 5], ["DF", 3, 5], ["MG", 4, 5], ["ES", 5, 5], ["PR", 2, 6], ["SP", 3, 6], ["RJ", 4, 6], ["SC", 2, 7], ["RS", 2, 8]];
  // a casinha: peças [x, y, largura, fundo, camada] em pinos. As paredes alternam a amarração a cada camada,
  // a porta fica na frente e o telhado são três placas escuras
  const EVEN = [[0, 6, 4, 2], [4, 6, 4, 2], [8, 6, 4, 2], [0, 0, 4, 2], [4, 0, 4, 2], [8, 0, 4, 2], [0, 2, 2, 4], [10, 2, 2, 4]];
  const ODD = [[2, 6, 4, 2], [6, 6, 4, 2], [2, 0, 4, 2], [6, 0, 4, 2], [0, 0, 2, 4], [0, 4, 2, 4], [10, 0, 2, 4], [10, 4, 2, 4]];
  const DOOR0 = [[0, 6, 4, 2], [8, 6, 4, 2]], DOOR1 = [[2, 6, 2, 2], [8, 6, 2, 2]];
  const front = b => b[1] === 6 && b[3] === 2;
  const bricks = [
    ...[EVEN.filter(b => !front(b)).concat(DOOR0), ODD.filter(b => !front(b)).concat(DOOR1), EVEN, ODD].flatMap((row, r) => row.map(([x, y, w, d]) => ({ x, y, w, d, r }))),
    { x: 0, y: 0, w: 12, d: 8, r: 4, roof: 1 }, { x: 2, y: 2, w: 8, d: 4, r: 5, roof: 1 }, { x: 4, y: 3, w: 4, d: 2, r: 6, roof: 1 },
  ];
  // concursos de exemplo, no formato real da mensagem do bot (formatar_concurso)
  const EDITAIS = [
    ["Prefeitura de Exemplo — Analista de Dados", "RJ", "R$ 9.800,00", "12", "28/11/2026", "Superior"],
    ["Instituto Modelo — Técnico em Informática", "RJ", "R$ 5.400,00", "30", "05/12/2026", "Técnico"],
    ["Tribunal Fictício — Analista de Sistemas", "SP", "R$ 13.900,00", "8", "14/12/2026", "Superior"],
    ["Autarquia Demonstração — Desenvolvedor", "MG", "R$ 8.200,00", "6", "20/12/2026", "Superior"],
    ["Universidade Exemplo — Cientista de Dados", "RJ", "R$ 11.300,00", "4", "09/01/2027", "Superior"],
  ];
  const edital = ([t, uf, sal, vagas, ate, nivel]) => `<div class="tg"><div class="tg-b"><p class="tg-t">🔔 <b>${t}</b> <i>(${uf})</i></p><p>💵 <b>Salário máximo:</b> ${sal}</p><p>🏢 <b>Vagas:</b> ${vagas}</p><p>📅 <b>Inscrições até:</b> ${ate}</p><p>🎓 <b>Nível:</b> ${nivel}</p><p class="tg-l">🔗 link do edital</p></div><button type="button" class="tg-fav" aria-pressed="false">⭐ Favoritar</button></div>`;
  const demos = {
    concurso: `<span class="demo-note">exemplo · concursos fictícios</span><div class="d3 d3-phone"><i class="d3-floor"></i><div class="phone">
        <div class="ph-top"><i></i><div><b>Concurso Notifier</b><small>bot · alertas a cada 17 min</small></div></div>
        <div class="chat"><div class="feed" id="tgFeed">${edital(EDITAIS[0])}</div></div></div>
      <span class="fchip c1">estado · RJ</span><span class="fchip c2">nível · superior</span><span class="fchip c3">palavra · dados</span></div>`,
    // mapa de ladrilhos do Brasil (coluna, linha): altura e cor são só ilustração, sem dado real
    saude: `<span class="demo-note">ilustração · sem dados reais</span><div class="d3 d3-uf"><div class="uf-plane">${UFS.map(([u, c, r], i) => {
      const a = 0.22 + ((u.charCodeAt(0) * 7 + u.charCodeAt(1) * 3) % 55) / 100;
      return `<span class="t" style="grid-column:${c + 1};grid-row:${r};--a:${a.toFixed(2)};--h:${(0.35 + (a - 0.22) * 4.2).toFixed(2)}em;--d:${(0.15 + r * 0.085 + c * 0.03).toFixed(3)}s"><i class="tt">${u}</i><i class="ts"></i><i class="te"></i></span>`;
    }).join("")}</div></div>`,
    mocforge: `<span class="demo-note">ilustração</span><div class="mcp"><p class="prompt">monte uma casinha de tijolos vermelhos</p><p class="call">add_parts_batch_tool · ${bricks.length} peças</p><p class="call">render_view_tool · conferindo</p></div>
      <div class="d3 d3-bk"><div class="bk-plane">${bricks.map((b, i) => `<span class="bk${b.roof ? " roof" : ""}" style="--x:${b.x}em;--y:${b.y}em;--z:${(b.r * 1.2).toFixed(1)}em;--w:${b.w}em;--dd:${b.d}em;--d:${(0.5 + i * 0.05).toFixed(2)}s"><i class="bt"></i><i class="bs"></i><i class="bw"></i></span>`).join("")}</div></div>`,
  };
  $("#pjList").innerHTML = D.projects.map((p, i) => `<article class="pj" data-id="${p.id}" aria-label="${p.title}">
    <div class="wrap pj-grid">
      <div class="pj-copy"><span class="pj-n" aria-hidden="true">0${i + 1}</span><p class="pj-k">${p.kicker}</p><h3>${p.title}</h3><p class="pj-sum">${p.summary}</p>
        <ol class="pj-pts">${p.bullets.map(b => `<li>${b}</li>`).join("")}</ol>
        <p class="pj-tech">${p.tech.join(" · ")}</p>
        ${p.repo ? `<a class="pill pill-accent" href="${p.repo}" target="_blank" rel="noopener noreferrer">Ver no GitHub ↗</a>` : `<span class="pj-k">código privado</span>`}</div>
      <div class="pj-demo">${demos[p.id]}</div>
    </div></article>`).join("");
  const pjs = $$(".pj");
  // mapa do Brasil: cada estado é um bloco que nasce rente ao chão e sobe até a altura dele conforme o
  // projeto entra na tela, numa onda de norte a sul. A rolagem dá o alvo e os blocos chegam nele devagar
  // (amortecido), então descer rápido ou devagar dá sempre uma subida macia; voltar desce de novo
  {
    const plane = $(".uf-plane"), pj = plane && plane.closest(".pj");
    if (plane) {
      const tiles = $$(".t", plane).map(t => ({ t, top: t.querySelector(".tt"), s: t.querySelector(".ts"), e: t.querySelector(".te"), h: parseFloat(t.style.getPropertyValue("--h")), d: parseFloat(t.style.getPropertyValue("--d")) }));
      const dMax = Math.max(...tiles.map(x => x.d));
      const cl0 = v => Math.min(1, Math.max(0, v)), ez = t => 1 - Math.pow(1 - t, 3);
      let cur = reduce ? 1 : 0, goal = cur, raf = 0, lastT = 0;
      const paint = () => tiles.forEach(x => {
        const k = ez(cl0(cur * 1.55 - (x.d / dMax) * 0.55));
        const h = Math.max(0.02, x.h * k);
        x.top.style.transform = `translateZ(${h.toFixed(3)}em)`;
        x.s.style.transform = `rotateX(90deg) scaleY(${(h / x.h).toFixed(3)})`;
        x.e.style.transform = `rotateY(90deg) scaleX(${(h / x.h).toFixed(3)})`;
        // o contorno do Brasil já aparece apagado, rente ao chão; cada bloco acende enquanto sobe
        x.t.style.opacity = (0.28 + 0.72 * cl0(k * 3)).toFixed(3);
      });
      const tick = now => {
        const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016; lastT = now;
        cur += (goal - cur) * (1 - Math.exp(-dt * 2.6));
        if (Math.abs(goal - cur) < 0.001) cur = goal;
        paint();
        raf = cur === goal ? 0 : requestAnimationFrame(tick);
      };
      const want = () => {
        const r = plane.getBoundingClientRect(), vh = innerHeight;
        // 0 quando o mapa aponta embaixo da tela; 1 quando o centro dele passa de 60% da altura
        goal = reduce ? 1 : cl0((vh - (r.top + r.height * 0.5)) / (vh * 0.55));
        if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); }
      };
      plane.classList.add("js");
      paint();
      let on = false;
      new IntersectionObserver(([e]) => { on = e.isIntersecting; if (on) want(); }, { rootMargin: "20% 0px" }).observe(pj);
      addEventListener("scroll", () => { if (on) want(); }, { passive: true });
    }
  }
  // cada projeto monta a demonstração uma vez; fora da tela, o que flutua pausa
  const pjOnce = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { pjOnce.unobserve(e.target); e.target.classList.add("on"); } }), { threshold: 0.3 });
  const pjLive = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle("live", e.isIntersecting)));
  pjs.forEach(p => { pjOnce.observe(p); pjLive.observe(p); });

  // o bot em funcionamento: enquanto o telefone está na tela chega um concurso novo de tempos em tempos,
  // a conversa sobe e um deles é favoritado. O botão também responde ao clique, como no Telegram
  const tgFeed = $("#tgFeed"), tgPj = tgFeed.closest(".pj");
  const setFav = (b, on) => { b.classList.toggle("fav", on); b.setAttribute("aria-pressed", on); b.textContent = on ? "💔 Remover dos favoritos" : "⭐ Favoritar"; };
  tgFeed.addEventListener("click", e => { const b = e.target.closest(".tg-fav"); if (b) setFav(b, !b.classList.contains("fav")); });
  let tgI = 1;
  const tgNext = () => {
    if (!tgPj.classList.contains("live") || document.hidden) return;
    tgFeed.insertAdjacentHTML("beforeend", edital(EDITAIS[tgI % EDITAIS.length]));
    const el = tgFeed.lastElementChild, n = tgI++;
    while (tgFeed.children.length > 4) tgFeed.firstElementChild.remove();
    // a conversa já está na posição final; ela começa deslocada pela altura da mensagem nova e desliza até lá
    const dy = el.offsetHeight + 10;
    tgFeed.animate([{ transform: `translate3d(0, ${dy}px, 0)` }, { transform: "translate3d(0, 0, 0)" }], { duration: 760, easing: "cubic-bezier(.16, 1, .3, 1)" });
    el.animate([{ opacity: 0.35, transform: "translate3d(0, 10px, 0) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 520, easing: "cubic-bezier(.23, 1, .32, 1)" });
    if (n % 2 === 0) setTimeout(() => { const b = el.querySelector(".tg-fav"); if (b.isConnected) { b.classList.add("tap"); setFav(b, true); setTimeout(() => b.classList.remove("tap"), 220); } }, 1500);
  };
  if (!reduce) setInterval(tgNext, 3600);

  /* ---------- 07 · ferramentas: o grafo ---------- */
  const graph = $("#graph");
  const techs = [...new Set(D.works.flatMap(w => w.tech))].sort((a, b) => D.works.filter(w => w.tech.includes(b)).length - D.works.filter(w => w.tech.includes(a)).length || a.localeCompare(b));
  const uses = t => D.works.filter(w => w.tech.includes(t)).length;
  const SAY0 = `${D.works.length} trabalhos · ${techs.length} ferramentas · ${D.works.reduce((n, w) => n + w.tech.length, 0)} ligações`;
  graph.innerHTML = `<div class="g-col g-left">${D.works.map((w, i) => `<button type="button" data-w="${w.id}" style="--k:${i};--dx:-14px">${w.label}<i>${w.tech.length}</i></button>`).join("")}</div><div class="g-mid"><svg aria-hidden="true" preserveAspectRatio="none"></svg></div><div class="g-col g-right">${techs.map((t, i) => `<button type="button" data-t="${t}" style="--k:${i};--dx:14px">${t}<i>${uses(t)}</i></button>`).join("")}</div><p class="g-say" id="gSay">${SAY0}</p>`;
  const gsvg = $("svg", graph), gSay = $("#gSay");
  let gCur = [], gLinks = [], gAnims = [];
  const drawGraph = () => {
    const box = gsvg.getBoundingClientRect();
    if (!box.width) return;
    gsvg.setAttribute("viewBox", `0 0 ${box.width} ${box.height}`);
    const yOf = el => { const r = el.getBoundingClientRect(); return r.top + r.height / 2 - box.top; };
    let k = 0;
    // gradiente radial que pinta as linhas durante o globo: creme no núcleo, laranja em volta e transparente
    // longe dele (os raios e as paradas são ajustados a cada quadro em pullLines)
    gsvg.innerHTML = `<defs><radialGradient id="gCore" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1000"><stop offset="0" stop-color="#fff6ea"/><stop offset=".04" stop-color="#ffd2a2"/><stop offset=".1" stop-color="#ff8a4a"/><stop offset=".6" stop-color="#ff5a1f" stop-opacity=".78"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient></defs>` + D.works.flatMap(w => w.tech.map(t => {
      const y1 = yOf($(`button[data-w="${w.id}"]`, graph)), y2 = yOf($(`button[data-t="${CSS.escape(t)}"]`, graph)), x2 = box.width;
      return `<path class="link" pathLength="1" style="--k:${k++}" data-w="${w.id}" data-t="${t}" data-g="${y1.toFixed(1)},${y2.toFixed(1)},${x2.toFixed(1)}" d="M0 ${y1.toFixed(1)} C ${(x2 * 0.5).toFixed(1)} ${y1.toFixed(1)}, ${(x2 * 0.5).toFixed(1)} ${y2.toFixed(1)}, ${x2} ${y2.toFixed(1)}"/>`;
    })).join("");
    gLinks = $$(".link", gsvg).map(p => ({ p, g: p.dataset.g.split(",").map(Number) }));
    if (gCur[1]) focusGraph(...gCur);
  };
  // selecionar um trabalho é uma pequena sequência de causa e efeito: a pílula se enche da esquerda,
  // cada ligação se desenha do trabalho até a ferramenta com um ponto de luz na frente, e a ferramenta
  // só acende quando a luz chega nela. Uma seleção nova cancela a anterior no meio, sem acumular
  const EZ = "cubic-bezier(.65, 0, .35, 1)", POP = "cubic-bezier(.34, 1.56, .64, 1)";
  const focusGraph = (attr, val) => {
    gCur = [attr, val];
    graph.classList.toggle("focus", !!val);
    gAnims.forEach(a => a.cancel()); gAnims = [];
    $$(".comet", gsvg).forEach(p => p.remove());
    const arr = {};
    let k = 0;
    gLinks.forEach(({ p }) => {
      const on = !!val && p.getAttribute(`data-${attr}`) === val;
      p.classList.toggle("on", on);
      if (!on || reduce || !graph.classList.contains("ready")) return;
      const delay = k++ * 55;
      gAnims.push(p.animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 640, delay, easing: EZ, fill: "backwards" }));
      // o ponto de luz: um traço curto que corre a ligação uma vez, com um halo largo e fraco por baixo
      ["comet halo", "comet"].forEach(cls => {
        const c = p.cloneNode(); c.setAttribute("class", cls); c.removeAttribute("style"); gsvg.appendChild(c);
        const an = c.animate([{ strokeDashoffset: 0.07, opacity: 1 }, { strokeDashoffset: -1, opacity: 1 }, { strokeDashoffset: -1, opacity: 0 }], { duration: 760, delay, easing: EZ, fill: "both" });
        an.onfinish = () => c.remove(); gAnims.push(an);
      });
      arr[attr === "w" ? p.dataset.t : p.dataset.w] = delay + 600;
    });
    // a ponta que recebe a luz: chega em escala com um leve exagero e só então troca de cor
    $$(".g-col button", graph).forEach(b => {
      const key = b.dataset.w ? b.dataset.w : b.dataset.t, at = arr[key];
      b.style.setProperty("--arr", at != null ? `${at}ms` : "0ms");
      if (at != null) gAnims.push(b.animate([{ transform: "scale(1)" }, { transform: "scale(1.09)" }, { transform: "scale(1)" }], { duration: 460, delay: at, easing: POP }));
    });
    const ws = val ? D.works.filter(w => attr === "w" ? w.id === val : w.tech.includes(val)) : [];
    const on = new Set(ws.flatMap(w => [`w:${w.id}`, ...(attr === "w" ? w.tech.map(t => `t:${t}`) : [`t:${val}`])]));
    $$(".g-col button", graph).forEach(b => b.classList.toggle("on", on.has(b.dataset.w ? `w:${b.dataset.w}` : `t:${b.dataset.t}`)));
    gSay.textContent = !val ? SAY0 : attr === "w" ? `${ws[0].label} → ${ws[0].tech.join(", ")}` : `${val} aparece em ${ws.length} ${ws.length === 1 ? "trabalho" : "trabalhos"}: ${ws.map(w => w.label).join(", ")}`;
  };
  // enquanto ninguém mexe, o grafo passa sozinho pelos trabalhos; o primeiro toque devolve o controle
  let tour = null, tourI = 0, touched = !!(hasGsap && !reduce);   // com rolagem animada quem passeia é a rolagem
  const stopTour = () => { clearInterval(tour); tour = null; };
  const hands = () => { if (touched) return; touched = true; stopTour(); };
  $$(".g-col button", graph).forEach(b => {
    const attr = b.dataset.w ? "w" : "t", val = b.dataset.w || b.dataset.t;
    b.addEventListener("pointerenter", e => { if (e.pointerType === "mouse") { hands(); focusGraph(attr, val); syncWork(attr, val); } });
    b.addEventListener("focus", () => { hands(); focusGraph(attr, val); syncWork(attr, val); });
    b.addEventListener("click", () => { hands(); focusGraph(attr, b.classList.contains("on") && graph.dataset.sel === val ? (graph.dataset.sel = "", null) : (graph.dataset.sel = val, val)); syncWork(attr, val); });
  });
  // ao sair com o mouse, volta o destaque que a rolagem tinha escolhido (ou nenhum)
  graph.addEventListener("pointerleave", () => { if (touched && !graph.dataset.sel) focusGraph("w", toolsAt >= 0 ? D.works[toolsAt].id : null); });
  drawGraph();
  // redesenha quando os botões mudam de tamanho (fontes, largura) e quando o grafo aparece
  const graphRO = new ResizeObserver(() => requestAnimationFrame(drawGraph));
  $$(".g-col", graph).forEach(c => graphRO.observe(c));
  new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) { stopTour(); return; }
    drawGraph();
    if (!graph.classList.contains("in")) {
      // os nós entram, depois as linhas se desenham; o "ready" tira os atrasos da entrada
      setTimeout(() => graph.classList.add("in"), 30);   // timer, não quadro: aparece mesmo com a aba sem pintar
      setTimeout(() => graph.classList.add("ready"), 1500);
    }
    if (!touched && !reduce && !tour) tour = setInterval(() => focusGraph("w", D.works[tourI++ % D.works.length].id), 2600);
    // a entrada começa assim que o grafo aponta na tela, para já estar desenhado quando ele gruda
  }, { threshold: 0, rootMargin: "0px 0px -10% 0px" }).observe(graph);
  document.fonts && document.fonts.ready.then(drawGraph);

  // o grafo cabe sempre na altura da tela enquanto está grudado (o SVG acompanha a escala sozinho)
  const graphFit = () => {
    graph.style.transform = "";
    const avail = innerHeight - 64 - 48, s = Math.min(1, avail / graph.offsetHeight);
    graph.style.transform = s < 1 ? `scale(${s.toFixed(3)})` : "";
  };

  /* a esfera: no fim da seção cada nome sai do lugar dele no grafo e vira um ponto de uma esfera que gira */
  const sph = h("div", "sphere"); sph.setAttribute("aria-hidden", "true");
  const sBtns = $$(".g-col button", graph);
  // cada nome da esfera nasce como cópia exata do botão (mesma pílula, mesmo número): a troca não se vê
  sph.innerHTML = sBtns.map(b => `<span class="${b.dataset.w ? "sw" : "st"}"><em></em><b>${b.firstChild.textContent}</b><small>${b.querySelector("i").textContent}</small></span>`).join("");
  graph.appendChild(sph);
  const sEls = $$("span", sph), sPill = sEls.map(s => s.firstChild), sNum = sEls.map(s => s.lastChild), gSvg = $("svg", graph);
  const NS_ = sEls.length, GA = Math.PI * (3 - Math.sqrt(5));
  // pontos espalhados por igual (espiral de Fibonacci); os trabalhos ficam numa faixa, as ferramentas no resto
  // a ordem salta de 11 em 11 para os trabalhos (laranja) não se juntarem num polo só
  const sDir = sEls.map((_, i) => { const q = (i * 11) % NS_, y = 1 - (q + 0.5) / NS_ * 2, r = Math.sqrt(1 - y * y), a = q * GA; return [Math.cos(a) * r, y, Math.sin(a) * r]; });
  // o contorno, o equador, o núcleo (onde as linhas são sugadas) e o halo da bola de luz
  sph.insertAdjacentHTML("afterbegin", `<b class="s-halo"></b><b class="s-rim"></b><b class="s-eq"></b><b class="s-core"></b>`);
  const sRim = $(".s-rim", sph), sEq = $(".s-eq", sph), sCore = $(".s-core", sph), sHalo = $(".s-halo", sph);
  let sDim = [], sFrom = null, sM = 0, sT = 0, sL = 0, sLT = 0, sAng = 0, sRaf = 0, sLast = 0, sR = 200, sC = [0, 0];
  const sMeasure = () => {
    const g = graph.getBoundingClientRect(), sc = g.width / graph.offsetWidth || 1;
    sR = wide() ? Math.min(graph.offsetWidth * 0.36, graph.offsetHeight * 0.4) : Math.min(graph.offsetWidth * 0.36, graph.offsetHeight * 0.42);
    [sRim, sEq, sCore].forEach(el => { el.style.width = el.style.height = `${(sR * 2).toFixed(0)}px`; });
    sHalo.style.width = sHalo.style.height = `${(sR * 3.4).toFixed(0)}px`;
    // posição de partida: o centro de cada botão, medido a partir da origem da esfera (e não do centro do grafo)
    const o = sph.getBoundingClientRect(), sv = gsvg.getBoundingClientRect();
    // o que estava aceso quando o globo começou: essas ligações já estão inteiras; as outras nascem do zero
    gLinks.forEach(L => { L.on0 = L.p.classList.contains("on"); });
    sDim = sBtns.map(b => parseFloat(getComputedStyle(b).opacity) || 1);
    // as pílulas acesas (laranja) continuam laranja na cópia e perdem a cor junto com a pílula, sem salto
    sBtns.forEach((b, i) => sEls[i].classList.toggle("on0", b.classList.contains("on")));
    sFrom = sBtns.map((b, i) => { const r = b.getBoundingClientRect(); sEls[i].style.width = `${b.offsetWidth}px`; return [(r.left + r.width / 2 - o.left) / sc, (r.top + r.height / 2 - o.top) / sc]; });
    // o centro da esfera no sistema de coordenadas das linhas
    const vb = gsvg.viewBox.baseVal, kx = vb && vb.width ? vb.width / sv.width : 1, ky = vb && vb.height ? vb.height / sv.height : 1;
    sC = [(o.left - sv.left) * kx, (o.top - sv.top) * ky];
  };
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const soft = t => 0.5 - 0.5 * Math.cos(Math.PI * t);   // seno: a mais macia das curvas de entrada e saída
  const cl = v => Math.min(1, Math.max(0, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  // as linhas caem no núcleo e viram filamentos orbitando dentro dele.
  // Cada ligação vira 24 pontos tirados da curva original. O destino de cada linha foi desenhado antes: um
  // arco suave numa elipse inclinada, com raio, inclinação e fase próprios (como as órbitas de um átomo).
  // O caminho de um ponto até o destino é feito em coordenadas polares em volta do centro (raio e ângulo
  // interpolados juntos, com meia volta a mais), o que dá uma espiral; os ângulos são "desenrolados" ao
  // longo da linha, então pontos vizinhos andam sempre juntos e a linha nunca dobra em quina.
  // Uma ponta sai um pouco antes da outra, e a linha entra no núcleo como um fio sendo puxado.
  // O desenho final passa por uma spline (Catmull-Rom), então toda curva é contínua e sem ângulos.
  const LP = 24, TAU = Math.PI * 2;
  let lineKey = "", gCoreEl = null;
  const unwrap = arr => { for (let i = 1; i < arr.length; i++) { while (arr[i] - arr[i - 1] > Math.PI) arr[i] -= TAU; while (arr[i] - arr[i - 1] < -Math.PI) arr[i] += TAU; } return arr; };
  const lineSetup = () => {
    const key = `${sC[0].toFixed(1)},${sC[1].toFixed(1)},${sR.toFixed(1)},${gLinks.length}`;
    if (key === lineKey && gLinks[0] && gLinks[0].pr) return; lineKey = key;   // o grafo pode ter sido redesenhado
    const [cx0, cy0] = sC, n = gLinks.length;
    gLinks.forEach((L, k) => {
      const [y1, y2, x2] = L.g;
      const r0 = [], a0 = [];
      for (let i = 0; i < LP; i++) {
        const t = i / (LP - 1), u = 1 - t;
        const x = 3 * u * t * t * x2 * 0.5 + 3 * u * u * t * x2 * 0.5 + t * t * t * x2;
        const y = u * u * u * y1 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y2;
        r0.push(Math.hypot(x - cx0, y - cy0)); a0.push(Math.atan2(y - cy0, x - cx0)); (L.ox || (L.ox = []))[i] = x; (L.oy || (L.oy = []))[i] = y;
        // a mesma ligação "apertada": as pontas no lugar e as duas alças no centro do núcleo, então a curva
        // passa por ele. Todas juntas formam uma ampulheta de fios que converge para o ponto de luz
        const px = 3 * u * u * t * cx0 + 3 * u * t * t * cx0 + t * t * t * x2;
        const py = u * u * u * y1 + 3 * u * u * t * cy0 + 3 * u * t * t * cy0 + t * t * t * y2;
        (L.qx || (L.qx = []))[i] = px; (L.qy || (L.qy = []))[i] = py;
      }
      unwrap(a0);
      // a órbita de destino desta linha (números fixos por linha, espalhados pela proporção áurea)
      const h1 = (k * 0.618034) % 1, h2 = (k * 0.414214 + 0.3) % 1, h3 = (k * 0.732051 + 0.6) % 1;
      // o arco de destino corre no mesmo sentido e com a mesma abertura da linha vista do centro: assim
      // todos os pontos giram quase o mesmo tanto e a linha entra inteira, sem se torcer
      const range = a0[LP - 1] - a0[0], arcDir = Math.sign(range) || 1;
      // três planos de órbita a 60° um do outro (um giroscópio), em vez de inclinações soltas: lido de longe,
      // o núcleo vira uma esfera de anéis e não um novelo
      const plane = k % 3, rk = sR * (0.13 + 0.09 * h1), squash = 0.36 + 0.06 * h2, tilt = plane * Math.PI / 3 + (h3 - 0.5) * 0.14, ph = h1 * TAU;
      const span = Math.min(Math.PI * 1.7, Math.max(Math.PI * 1.1, Math.abs(range)));
      // todas giram para o mesmo lado: um redemoinho só, sem linhas se cruzando em sentidos opostos
      const dir = 1, ct = Math.cos(tilt), st = Math.sin(tilt);
      const rf = [], af = [];
      for (let i = 0; i < LP; i++) {
        const a = ph + arcDir * span * (i / (LP - 1)), ex = Math.cos(a) * rk, ey = Math.sin(a) * rk * squash;
        const fx = ex * ct - ey * st, fy = ex * st + ey * ct;
        rf.push(Math.hypot(fx, fy)); af.push(Math.atan2(fy, fx));
      }
      unwrap(af);
      // escolhe a volta do destino mais perto da linha original e soma meia volta no sentido dela: espiral
      // o destino fica na volta mais próxima do meio da linha, mais um quarto de volta no sentido dela (espiral)
      const mid = LP >> 1, off = Math.round((a0[mid] - af[mid]) / TAU) * TAU + dir * Math.PI * 0.5;
      for (let i = 0; i < LP; i++) af[i] += off;
      L.pr = r0; L.pa = a0; L.fr = rf; L.fa = af; L.dir = dir; L.lead = k % 3 === 0 ? -1 : 1; L.k = k / n;
      // para o giro: a órbita é guardada como elipse (e não só como pontos), e a luz corre por ela
      // o arco final começa do mesmo lado em que a linha começa (visto do centro): cada ponto da linha tem
      // um par no anel bem à frente dele, e a transformação não cruza o núcleo
      const offR = off % TAU, ph2 = a0[0] - tilt - offR;
      L.orb = { rk, squash, tilt, ph: ph2, arcDir, span, offR, plane };
      L.spin = 0.55 + plane * 0.12;
    });
  };
  const smooth = pts => {
    let d = `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
      d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
    }
    return d;
  };
  const sstep = t => t * t * t * (t * (t * 6 - 15) + 10);   // smootherstep: começa e termina sem tranco
  const pullLines = (m, time, dt = 0.016) => {
    // sem medida válida (grafo ainda sem tamanho, um quadro de redesenho), não desenha nada errado
    if (!isFinite(sC[0]) || !isFinite(sC[1]) || !sR) return;
    lineSetup();
    const [cx0, cy0] = sC;
    // a luz: o centro do gradiente acompanha o núcleo; conforme o globo se forma, a parte transparente
    // fecha em volta dele e as pontas de fora das linhas se apagam sozinhas, sem cortes
    const grad = gsvg.querySelector("#gCore"), R0 = Math.max(gsvg.viewBox.baseVal.width, 600), f = ss(0.2, 0.75, m);
    if (grad) {
      grad.setAttribute("cx", cx0.toFixed(1)); grad.setAttribute("cy", cy0.toFixed(1)); grad.setAttribute("r", R0.toFixed(0));
      const st = grad.children, o = [sR * 0.07, sR * 0.16, lerp(0.6 * R0, sR * 0.8, f), lerp(R0, sR * 1.45, f)].map(v => cl(v / R0));
      st[1].setAttribute("offset", o[0].toFixed(4)); st[2].setAttribute("offset", Math.max(o[0] + 0.001, o[1]).toFixed(4));
      st[3].setAttribute("offset", Math.max(o[1] + 0.002, o[2]).toFixed(4)); st[4].setAttribute("offset", Math.max(o[2] + 0.003, o[3]).toFixed(4));
    }
    // cada linha se transforma direto no seu anel: os pontos da curva original e os do arco final são
    // misturados (uma mistura de duas curvas suaves é sempre suave, então não há quina nem laço solto).
    // O anel de destino chega girando um pouco para trás e se acomoda no lugar: o caminho de cada ponto
    // vira uma curva, e o conjunto parece entrar em órbita. A entrada é por plano: primeiro os fios do
    // primeiro anel, depois os do segundo, depois os do terceiro
    gLinks.forEach(L => {
      const n3 = Math.ceil(gLinks.length / 3), pts = [], o = L.orb, kin = Math.floor(Math.round(L.k * gLinks.length) / 3) / n3;
      // primeiro tempo (0 a 0,22): as ligações se apertam no centro, ainda presas nos botões; só então soltam
      // a soltura começa antes de o aperto terminar: um movimento emenda no outro, sem parada no meio
      const pinch = sstep(cl(m / 0.24)), start = 0.07 + o.plane * 0.11 + kin * 0.05;
      let wSum = 0;
      for (let i = 0; i < LP; i++) {
        const along = L.lead > 0 ? i / (LP - 1) : 1 - i / (LP - 1);
        const w = sstep(cl((m - start - along * 0.04) / 0.4));
        wSum += w;
        const rot = o.tilt + o.offR + 0.95 * (1 - w), cr = Math.cos(rot), sr = Math.sin(rot);
        const pa = o.ph + o.arcDir * o.span * (i / (LP - 1)) + (L.ps || 0);
        const ex = Math.cos(pa) * o.rk, ey = Math.sin(pa) * o.rk * o.squash;
        const tx = cx0 + ex * cr - ey * sr, ty = cy0 + ex * sr + ey * cr;
        const sx = L.ox[i] + (L.qx[i] - L.ox[i]) * pinch, sy = L.oy[i] + (L.qy[i] - L.oy[i]) * pinch;
        pts.push([sx + (tx - sx) * w, sy + (ty - sy) * w]);
      }
      const em = wSum / LP;
      if (pts.some(q => !isFinite(q[0]) || !isFinite(q[1]))) return;
      L.p.setAttribute("d", smooth(pts));
      // rastro: enquanto cai, a linha perde o pedaço de trás (fica só a cabeça que entra primeiro); já no
      // núcleo, o trecho aceso corre pela órbita, como energia circulando
      // o fluxo é uma fase própria de cada linha, que só anda depois que ela chegou (e na velocidade
      // certa): antes ele usava o relógio da página, e a luz dava várias voltas de uma vez ao ligar
      L.fl = (L.fl || 0) + dt * 0.07 * ss(0.7, 1, em);
      // o anel também só começa a girar quando a linha já está chegando nele: assim o destino continua
      // alinhado com a linha durante a entrada, por mais tempo que a página esteja aberta
      L.ps = (L.ps || 0) + dt * L.spin * ss(0.55, 1, em);
      if (em < 0.01) L.ps = L.fl = 0;   // voltou para o grafo: a próxima entrada começa alinhada de novo
      // trecho visível [a, b] da linha (0 = ponta do trabalho, 1 = ponta da ferramenta). As ligações que
      // estavam apagadas nascem do trabalho: b cresce de 0 até 1 enquanto elas já se apertam e seguem
      // para a órbita. Perto do fim, o rastro deixa só a cabeça que entra primeiro
      const grow = L.on0 ? 1 : sstep(cl((m - L.k * 0.1) / 0.24));
      const vis = 1 - 0.5 * em;
      let a = L.lead > 0 ? 0 : 1 - vis, b = L.lead > 0 ? vis : 1;
      b = Math.min(b, grow); if (b < a) b = a;
      const len = Math.max(0.0001, b - a);
      L.p.style.strokeDasharray = `${len.toFixed(4)} ${(1.0002 - len).toFixed(4)}`;
      L.p.style.strokeDashoffset = (-a - (L.fl % 1)).toFixed(4);
      L.p.style.strokeWidth = (1.3 - 0.45 * em).toFixed(2);
      L.p.style.opacity = "1";
    });
  };
  const sDraw = now => {
    const dt = sLast ? Math.min(0.05, (now - sLast) / 1000) : 0; sLast = now;
    // amortecimento: a rolagem só marca os alvos (sT, sLT); a transformação anda até eles no próprio ritmo
    const kd = 1 - Math.exp(-dt * 3.2);
    sM += (sT - sM) * kd; if (Math.abs(sT - sM) < 0.0008) sM = sT;
    sL += (sLT - sL) * kd; if (Math.abs(sLT - sL) < 0.0008) sL = sLT;
    const was = graph.classList.contains("morph");
    graph.classList.toggle("morph", sM > 0);
    if (sM <= 0 && sT <= 0) {
      cancelAnimationFrame(sRaf); sRaf = 0; sFrom = null;
      if (was) {
        gLinks.forEach(({ p }) => { p.style.opacity = p.style.stroke = p.style.strokeWidth = p.style.strokeDasharray = p.style.strokeDashoffset = ""; });
        lineKey = ""; gCoreEl = null; drawGraph();
        // de volta ao grafo: entra o destaque que a rolagem pede agora (o último trabalho, se for o caso)
        focusGraph("w", toolsAt >= 0 ? D.works[toolsAt].id : null);
      }
      return false;
    }
    pullLines(sM, now / 1000, dt);
    // giro: devagar na esfera; na bola de luz cada rolada acelera, até virar um borrão
    // giro: devagar na esfera; rolando mais, a órbita dos nomes acelera (a esfera não cresce nem some)
    sAng += dt * (0.32 * ss(0.25, 0.6, sM) + 3.4 * Math.pow(sL, 1.4));
    const ca = Math.cos(sAng), sa = Math.sin(sAng), tx = 0.32;
    const shrink = 1, fade = 1;
    // três tempos: os nomes entram numa órbita (o equador da esfera, já girando); a órbita se abre e vira
    // a esfera; e, rolando mais, a esfera gira cada vez mais rápido e se fecha numa bola de luz
    for (let i = 0; i < NS_; i++) {
      // cada nome sai num tempo um pouco diferente (ordem embaralhada, não de cima para baixo) e a viagem é
      // longa, com uma curva de seno: começa e termina devagar, sem o pico de velocidade no meio
      const d = (((i * 7) % NS_) / NS_) * 0.16;
      const e1 = soft(cl((sM - 0.12 - d) / 0.5));
      const e2 = soft(cl((sM - 0.6 - d * 0.5) / 0.32));
      // na órbita a ordem também salta de 11 em 11, para os trabalhos (laranja) ficarem espalhados no anel
      const th = ((i * 11) % NS_) / NS_ * Math.PI * 2, [sx0, sy0, sz0] = sDir[i];
      const dx = Math.cos(th) + (sx0 - Math.cos(th)) * e2, dy = sy0 * e2, dz = Math.sin(th) + (sz0 - Math.sin(th)) * e2;
      // a órbita é vista quase de cima (um anel aberto, os nomes não se amontoam) e maior; ao virar esfera,
      // ela se inclina até o ângulo final e encolhe para o raio da esfera
      const tl = 1.05 + (tx - 1.05) * e2, ctl = Math.cos(tl), stl = Math.sin(tl);
      const rr = sR * (1 + (wide() ? 0.18 : 0.04) * (1 - e2)) * shrink;
      let x = dx * ca + dz * sa, z = -dx * sa + dz * ca, y = dy;
      const y2 = y * ctl - z * stl, z2 = y * stl + z * ctl;
      const pz = z2 * rr * e1, k = 1100 / (1100 - pz);
      const px = (sFrom[i][0] + (x * rr - sFrom[i][0]) * e1) * k, py = (sFrom[i][1] + (y2 * rr - sFrom[i][1]) * e1) * k;
      const sc2 = 1 + (k - 1) * e1;
      sEls[i].style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%) scale(${sc2.toFixed(3)})`;
      const dim0 = sDim[i] == null ? 1 : sDim[i];
      sEls[i].style.opacity = ((1 - e1 * (0.62 - 0.62 * (z2 + 1) / 2)) * fade * (dim0 + (1 - dim0) * ss(0, 0.5, e1))).toFixed(3);
      sPill[i].style.opacity = sNum[i].style.opacity = (1 - e1).toFixed(3);
      sEls[i].classList.toggle("lit", e1 > 0.5);
    }
    const o = ss(0.45, 0.9, sM);
    sRim.style.opacity = o.toFixed(3); sEq.style.opacity = o.toFixed(3);
    sEq.style.transform = `translate(-50%, -50%) scaleY(.31) rotate(${(sAng * 57.3).toFixed(1)}deg)`;
    // o núcleo: um ponto que acende quando as linhas chegam, respira com a esfera e explode em luz no fim
    // o núcleo acende conforme as linhas chegam e fica do tamanho do miolo; com a órbita acelerando ele só
    // pulsa um pouco mais forte
    // um ponto de luz acende no centro enquanto as ligações se apertam nele, e cresce quando os anéis chegam
    const glow = Math.max(0.5 * ss(0.04, 0.22, sM), ss(0.3, 0.65, sM)), beat = 1 + Math.sin(now / 420) * (0.025 + 0.05 * sL);
    sCore.style.opacity = (glow * (0.7 + 0.25 * sL)).toFixed(3);
    sCore.style.transform = `translate(-50%, -50%) scale(${((0.05 + 0.33 * glow) * beat).toFixed(3)})`;
    sHalo.style.opacity = "0";
  };
  const sLoop = now => { sRaf = requestAnimationFrame(sLoop); sDraw(now); };
  const sphereTo = (m, l) => {
    if (m > 0 && !sFrom) sMeasure();
    sT = m; sLT = l;
    if (m > 0 && !sRaf) { sLast = 0; sRaf = requestAnimationFrame(sLoop); }
  };
  let toolsAt = -2, toolsST = null;
  // escolher um trabalho com o mouse leva a rolagem para o ponto dele: rolar depois continua dali
  function syncWork(attr, val) {
    if (attr !== "w" || !toolsST || !toolsST.isActive) return;
    const k = D.works.findIndex(w => w.id === val), n = D.works.length;
    if (k < 0 || k === toolsAt) return;
    toolsAt = k; jumpTo(toolsST.start + (toolsST.end - toolsST.start) * (0.03 + (k + 0.5) / n * 0.21));
  }
  const toolsTo = p => {
    // primeiro a rolagem passa por cada trabalho, de cima para baixo; depois os nomes viram a esfera
    // seção presa por 7 telas: 0,03–0,24 passeio pelos trabalhos · 0,24–0,62 ligações e globo (a parte mais
    // longa) · 0,64–0,84 a órbita acelera · 0,857–1 contato por cima. O último trabalho fica destacado até
    // o globo começar
    const t = (p - 0.03) / 0.21, n = D.works.length;
    const k = t < 0 || !graph.classList.contains("ready") ? -1 : Math.min(n - 1, Math.floor(t * n));
    // durante o globo o destaque não é aplicado (as linhas estão sendo desenhadas por ele); fica guardado
    // e entra quando o grafo se refaz, na volta
    if (k !== toolsAt) { toolsAt = k; if (!sRaf && sM <= 0) focusGraph("w", k < 0 ? null : D.works[k].id); }
    sphereTo(Math.min(1, Math.max(0, (p - 0.24) / 0.38)), Math.min(1, Math.max(0, (p - 0.64) / 0.2)));
  };

  /* ---------- 08 · contato ---------- */
  const toast = $("#toast");
  $("#copyMail").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(D.profile.email); toast.textContent = "E-mail copiado"; }
    catch (e) { toast.textContent = D.profile.email; }
    toast.classList.add("on"); setTimeout(() => toast.classList.remove("on"), 2200);
  });

  /* ---------- a coreografia da rolagem ---------- */
  // nada fica preso por JavaScript: as cenas longas usam position: sticky, e a rolagem só entrega o progresso
  if (!hasGsap || reduce) {
    camera(0);
    // sem rolagem animada a viagem vira texto corrido, etapa por etapa
    tripEl.classList.add("flat");
    $(".tools").classList.add("flat");
    graph.classList.add("in", "ready");
    $$(".who-say .w").forEach(w => (w.style.opacity = 1));
    return;
  }
  document.documentElement.classList.add("sc");

  // progresso geral da página na barra (transform, sem layout)
  ScrollTrigger.create({ start: 0, end: "max", onUpdate: s => { progress.style.transform = `scaleX(${s.progress.toFixed(4)})`; } });

  // entrada da abertura: o nome sobe por linha; o resto chega junto, um passo atrás
  gsap.from(".hero-name .ln > span", { yPercent: 110, duration: 1.3, ease: "expo.out", stagger: 0.12, delay: 0.15 });
  gsap.from([".hero-live", ".hero-foot"], { y: 16, opacity: 0, duration: 1, ease: "expo.out", stagger: 0.08, delay: 0.5 });
  gsap.from(".hero-st", { opacity: 0, duration: 1.6, ease: "power2.out", delay: 0.2 });

  // 00: a câmera desce até o Centro enquanto a abertura fica grudada; o texto sai antes
  ScrollTrigger.create({ trigger: ".hero", start: "top top", end: "bottom bottom", onUpdate: s => { heroP = s.progress; camera(heroP); } });
  gsap.to(".hero-copy", { yPercent: -18, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "28% top", scrub: true } });

  // 02 + 03: a viagem inteira é um número só
  tripST = ScrollTrigger.create({ trigger: tripRun, start: "top top", end: "bottom bottom", onUpdate: s => tripTo(s.progress) });
  // 08: o grafo fica grudado; a rolagem passeia pelos trabalhos e termina na esfera
  graphFit(); addEventListener("resize", () => { graphFit(); sFrom = null; if (sM > 0) sMeasure(); });
  document.fonts && document.fonts.ready.then(graphFit);
  // preso de verdade (fixed) por 7 telas: a última delas é o contato subindo por cima do globo
  toolsST = ScrollTrigger.create({ trigger: ".tools-pin", start: "top top", end: "+=700%", pin: true, pinSpacing: true, anticipatePin: 1, onUpdate: s => toolsTo(s.progress) });

  const mm = gsap.matchMedia();
  mm.add({ wide: "(min-width: 861px)", narrow: "(max-width: 860px)" }, ctx => {
    const { wide: isWide } = ctx.conditions;
    // 01: a frase acende palavra por palavra
    gsap.to(".who-say .w", { opacity: 1, ease: "none", stagger: 0.12,
      scrollTrigger: isWide ? { trigger: ".who", start: "top top", end: "bottom bottom", scrub: true } : { trigger: ".who-say", start: "top 72%", end: "bottom 38%", scrub: true } });
    if (!isWide) return;
  });

  // 06: a barra fica creme enquanto os projetos estão na tela
  ScrollTrigger.create({ trigger: ".pjs", start: "top 40px", end: "bottom 40px", toggleClass: { targets: document.documentElement, className: "deck-on" } });

  // títulos que entram por linha, uma vez
  $$(".rise").forEach(t => gsap.from(t.querySelectorAll(".ln > span"), { yPercent: 108, duration: 1.2, ease: "expo.out", stagger: 0.1, scrollTrigger: { trigger: t, start: "top 85%" } }));

  document.fonts && document.fonts.ready.then(() => ScrollTrigger.refresh());
  addEventListener("load", () => ScrollTrigger.refresh());
  // se a página muda de altura (uma seção pulada que aparece com tamanho diferente do estimado, o quadro
  // de linhas abrindo), as posições da rolagem são recalculadas uma vez, quando ela para de mudar
  let pageH = document.documentElement.scrollHeight, pageT = 0;
  new ResizeObserver(() => {
    const nh = document.documentElement.scrollHeight;
    if (Math.abs(nh - pageH) < 4) return;
    pageH = nh; clearTimeout(pageT); pageT = setTimeout(() => ScrollTrigger.refresh(), 250);
  }).observe(document.body);
})();
