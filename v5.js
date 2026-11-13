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
  // indicadores de estado: os Thinking Orbs (cópia local, sem dependências) dizem o que cada parte está
  // fazendo agora. Trocar de estado apaga o orb, troca e acende de novo, para não haver corte seco
  const orbsLib = import("./orbs.js?v=202611111620").catch(() => null);
  const orb = (svg, o) => {
    let cur = null, gen = 0, seen = false;
    // fora da tela o orb para de vez (a biblioteca só deixa de desenhar, mas o laço continuava)
    new IntersectionObserver(([e]) => { seen = e.isIntersecting; if (cur) cur[seen ? "play" : "pause"](); }).observe(svg);
    const set = (opts, hint) => {
      const g = ++gen;
      orbsLib.then(m => {
        if (!m || g !== gen) return;
        const swap = () => { if (g !== gen) return; if (cur) cur.destroy(); cur = m.mountOrb(svg, { size: 16, density: 0.7, ...opts }); if (!seen) cur.pause(); svg.classList.remove("swap"); svg.dataset.s = hint || ""; };
        if (!cur) return swap();
        svg.classList.add("swap"); setTimeout(swap, 180);
      });
    };
    set(o);
    return { set };
  };

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
  // os capítulos do case (caminho, pipeline e laboratório) acendem o mesmo item da navegação
  const navOf = { caminho: "case", pipeline: "case", lab: "case", trajetoria: "trajetoria", projetos: "projetos", contato: "contato" };
  const navLinks = $$("[data-nav]");
  // quem manda no cabeçalho é a última seção cujo topo já passou da linha dos 45% da tela. O observador só avisa
  // que alguma seção cruzou a linha: decidir pela que "entrou" errava na volta, quando duas seções se sobrepõem
  const chaps = $$("[data-chap]");
  let chapNow = null, chapTrip = null;   // chapTrip: a viagem troca de 02 para 03 por dentro e repõe o dela
  const chapPick = () => {
    const line = innerHeight * 0.45;
    let t = chaps[0];
    chaps.forEach(s => { if (s.getBoundingClientRect().top <= line) t = s; });
    if (t === chapNow) return;
    chapNow = t;
    chapN.textContent = t.dataset.chap; chapT.textContent = t.dataset.title;
    bar.classList.toggle("named", t.id !== "topo");
    const cur = navOf[t.id];
    navLinks.forEach(a => { if (a.dataset.nav === cur) a.setAttribute("aria-current", "true"); else a.removeAttribute("aria-current"); });
    if (t.id === "caminho" && chapTrip) chapTrip(true);
  };
  const chapIO = new IntersectionObserver(chapPick, { rootMargin: "-45% 0px -54% 0px" });
  chaps.forEach(s => chapIO.observe(s));

  /* ---------- 00 · o mapa e as estações ao vivo ---------- */
  const GEO = { lon0: -43.1622, lon1: -42.935, lat0: -22.9791, lat1: -22.851, w: 2000, h: 1225 };
  const toMap = (lon, lat) => [(lon - GEO.lon0) / (GEO.lon1 - GEO.lon0) * GEO.w, (GEO.lat1 - lat) / (GEO.lat1 - GEO.lat0) * GEO.h];
  const stations = new Map(D.stations.map(([n, name, lon, lat, cap]) => [n, { n, name, lon, lat, cap, bikes: null, free: null }]));
  const svg = $("#heroSt"), tip = $("#heroTip"), mapEl = $("#heroMap");
  const NS = "http://www.w3.org/2000/svg";
  const nodes = new Map(), pings = [];
  let k = 0;
  stations.forEach(s => {
    const [x, y] = toMap(s.lon, s.lat);
    s.x = x; s.y = y;
    const g = document.createElementNS(NS, "g");
    // 1 em cada 8 estações pulsa. O anel é um elemento HTML por cima do mapa (não um círculo do SVG):
    // assim a animação roda na GPU e o mapa não repinta a cada quadro
    if (k++ % 8 === 0) pings.push(`<i style="left:${(x / GEO.w * 100).toFixed(3)}%;top:${(y / GEO.h * 100).toFixed(3)}%;--d:${(k % 5) * 0.7}s"></i>`);
    g.innerHTML = `<circle class="halo" cx="${x}" cy="${y}" r="9"/><circle cx="${x}" cy="${y}" r="3.2"/>`;
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
  svg.insertAdjacentHTML("beforebegin", `<div class="hero-pings" aria-hidden="true">${pings.join("")}</div>`);
  // entrada: as estações acendem em onda a partir do Terminal. O atraso de cada uma vem da distância;
  // o expoente menor que 1 aperta o fim, para as estações distantes não ficarem esperando
  {
    const o = stations.get(4) || [...stations.values()][0];
    let far = 1;
    stations.forEach(s => { s.d = Math.hypot(s.x - o.x, s.y - o.y); far = Math.max(far, s.d); });
    stations.forEach(s => nodes.get(s.n).style.setProperty("--d", `${Math.round(180 + 900 * Math.pow(s.d / far, 0.7))}ms`));
  }
  const sizeStations = () => stations.forEach(s => {
    const g = nodes.get(s.n), fill = s.bikes == null ? 0.5 : Math.min(1, s.bikes / Math.max(1, s.cap));
    const r = 2.2 + fill * 4.2;
    // o ponto é sempre o último filho e o halo, o primeiro (o anel só existe em 1 de cada 8)
    g.lastElementChild.setAttribute("r", r.toFixed(1));
    g.firstElementChild.setAttribute("r", (r + 5).toFixed(1));
  });
  sizeStations();
  // os anéis param quando a abertura sai da tela
  new IntersectionObserver(([e]) => mapEl.classList.toggle("still", !e.isIntersecting)).observe($(".hero"));

  const live = $("#heroLive span");
  // procurando enquanto lê a camada do NitBike; parado e verde quando a leitura chega
  const liveOrb = orb($("#heroLive .orb"), { state: "searching", label: "lendo as estações" });
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
    liveOrb.set({ state: "idle", label: "ao vivo" }, "on");
    tripLive();
  }).catch(() => { live.textContent = "camada pública fora do ar agora · mostrando as posições das estações"; liveOrb.set({ state: "waiting", label: "camada fora do ar" }, "off"); });
  readLive(); setInterval(readLive, 60000);

  // câmera: no começo a rede inteira à direita do nome; ao rolar, desce até o Terminal (estação 4), no Centro
  const term = stations.get(4) || [...stations.values()][0];
  let Z1 = 2.6, camM = 1;   // camM: na entrada a câmera começa um pouco mais perto e assenta
  const cam = { x: 0, y: 0, z: 1 };   // a câmera em números: quem desenha por cima do mapa (canvas, lente) lê daqui
  const camera = p => {
    const vw = innerWidth, vh = innerHeight, mob = !wide();
    const zA = (mob ? 0.95 : Math.max(1.1, Math.min(1.75, vw / 900))) * camM, zB = mob ? 2.1 : 2.6;
    const ax = mob ? 0.62 : 0.66, ay = mob ? 0.34 : 0.42;
    const A = { x: vw * ax - 450 * zA, y: vh * ay - 430 * zA, z: zA };
    const B = { x: vw * 0.5 - term.x * zB, y: vh * 0.42 - term.y * zB, z: zB };
    const e = p * p * (3 - 2 * p);
    const z = A.z + (B.z - A.z) * e;
    const x = A.x + (B.x - A.x) * e, y = A.y + (B.y - A.y) * e;
    cam.x = x; cam.y = y; cam.z = z;
    mapEl.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) scale(${(z / Z1).toFixed(4)})`;
  };
  const sizeMap = () => {
    Z1 = wide() ? 2.6 : 2.1;
    Object.assign(mapEl.style, { left: "0px", top: "0px", margin: "0", width: `${2000 * Z1}px`, height: `${1225 * Z1}px` });
  };
  sizeMap(); camera(0);
  addEventListener("resize", () => { sizeMap(); camera(heroP); });
  let heroP = 0, heroArm = false;   // heroArm: a rolagem já levou a abertura embora; ao voltar ao topo o feed é relido

  /* ---------- 00 · do feed ao mapa: a abertura num canvas só ---------- */
  // Uma camada 2D do tamanho da tela (nunca do tamanho do mapa) desenha a entrada e o que fica vivo depois:
  //  · entrada: as linhas do feed aparecem como texto; cada uma é lida, vira um ponto, voa até a sua estação e
  //    abre um clarão no véu que cobre o mapa. O mapa aparece porque o dado chegou;
  //  · depois: viagens circulando entre estações vizinhas.
  // Tudo lê a câmera a cada quadro (cam), então acompanha a rolagem e a câmera que assenta sem código a mais.
  const stage = $(".hero-stage"), fxEl = $("#heroFx"), root = document.documentElement;
  const fx = !reduce && fxEl && fxEl.getContext ? fxEl.getContext("2d") : null;
  const list = [...stations.values()];
  const scr = s => [cam.x + s.x * cam.z, cam.y + s.y * cam.z];
  const TAU = Math.PI * 2;
  let fxW = 0, fxH = 0;
  const sizeFx = () => {
    const k = Math.min(devicePixelRatio || 1, 2);
    fxW = stage.clientWidth; fxH = stage.clientHeight;
    fxEl.width = Math.round(fxW * k); fxEl.height = Math.round(fxH * k);
    fx.setTransform(k, 0, 0, k, 0, 0);
  };
  // cada estação conhece as 6 mais próximas: viagem curta parece viagem de verdade
  list.forEach(s => { s.near = list.filter(o => o !== s).sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y)).slice(0, 6); });

  // pontos em trânsito: uma curva de A até B, cabeça clara e rastro laranja. `from` é um ponto fixo da tela
  // (uma linha do feed); `a` é uma estação. Ao chegar, um anel se abre no destino
  const packs = [], rings = [];
  const pos = (p, u) => {
    const [ax, ay] = p.from || scr(p.a), [bx, by] = scr(p.b), v = 1 - u;
    const cx = (ax + bx) / 2 - (by - ay) * p.bend, cy = (ay + by) / 2 + (bx - ax) * p.bend;
    return [v * v * ax + 2 * v * u * cx + u * u * bx, v * v * ay + 2 * v * u * cy + u * u * by];
  };
  const drawPacks = dt => {
    fx.globalCompositeOperation = "lighter"; fx.lineCap = "round";
    for (let i = packs.length - 1; i >= 0; i--) {
      const p = packs[i]; p.t += dt / p.dur;
      const t = Math.min(1, p.t), u = p.from ? 1 - Math.pow(1 - t, 3) : t * t * (3 - 2 * t);
      const [hx, hy] = pos(p, u);
      let x0 = hx, y0 = hy;
      for (let k = 1; k <= 8; k++) {
        const [x1, y1] = pos(p, Math.max(0, u - k * 0.03));
        fx.strokeStyle = `rgba(255,90,31,${(0.55 * (1 - k / 9)).toFixed(3)})`; fx.lineWidth = 1.9 - k * 0.13;
        fx.beginPath(); fx.moveTo(x0, y0); fx.lineTo(x1, y1); fx.stroke();
        x0 = x1; y0 = y1;
      }
      fx.fillStyle = "rgba(255,90,31,.22)"; fx.beginPath(); fx.arc(hx, hy, 5, 0, TAU); fx.fill();
      fx.fillStyle = "rgba(255,226,200,.95)"; fx.beginPath(); fx.arc(hx, hy, 1.5, 0, TAU); fx.fill();
      if (p.t >= 1) { packs.splice(i, 1); rings.push({ s: p.b, t: 0 }); if (p.land) p.land(); }
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt / 0.7;
      if (r.t >= 1) { rings.splice(i, 1); continue; }
      const [x, y] = scr(r.s), e = 1 - Math.pow(1 - r.t, 3);
      fx.strokeStyle = `rgba(255,90,31,${(0.6 * (1 - r.t)).toFixed(3)})`; fx.lineWidth = 1.2;
      fx.beginPath(); fx.arc(x, y, 4 + e * 14, 0, TAU); fx.stroke();
    }
    fx.globalCompositeOperation = "source-over";
  };

  // entrada: tempos em segundos a partir do html.go. As linhas de baixo são lidas primeiro, para o título
  // subir num espaço que já esvaziou
  const T_READ = 0.42, T_STEP = 0.0095, T_FLY = 0.72;
  const intro = { on: false, veil: true, t: 0, lines: [], end: 0, font: "", max: 0 };
  // veil = false é a releitura (ao voltar ao topo pela rolagem): o mesmo gesto por cima do mapa já aceso, sem o véu
  const startIntro = (veil = true) => {
    intro.veil = veil;
    const mob = !wide(), fs = mob ? 9 : 12, n = list.length, sr = stage.getBoundingClientRect();
    const x0 = Math.max(16, $("#heroLive").getBoundingClientRect().left - sr.left);
    // o feed ocupa a faixa acima do texto, em colunas; se a faixa for baixa demais (tela curta, celular) ele
    // desce por trás do texto, e por isso a leitura vai de baixo para cima
    const band = $("#heroLive").getBoundingClientRect().top - sr.top - 84 - 24, lh0 = mob ? 10.5 : 13.5;
    const colW = mob ? fxW - x0 * 2 : Math.max(300, Math.min(440, (fxW - x0 * 2) / 3));
    const maxCols = Math.max(1, Math.floor((fxW - x0 * 2) / colW));
    const cols = Math.min(maxCols, Math.max(1, Math.ceil(n / Math.max(1, Math.floor(band / lh0))))), rows = Math.ceil(n / cols);
    const lh = Math.min(lh0, (fxH - 110) / rows);
    intro.font = `500 ${fs}px "Geist Mono", ui-monospace, monospace`;
    intro.max = Math.floor((colW - 20) / (fs * 0.6));
    intro.lines = list.map((s, i) => {
      const col = Math.floor(i / rows), row = i % rows;
      return { s, x: x0 + col * colW, y: 84 + row * lh, k: row * cols + col, text: `{"estacao": ${s.n}, "nome": "${s.name}", "vagas": ${s.cap}}`.slice(0, intro.max), t0: T_READ + ((rows - 1 - row) * cols + col) * T_STEP, sent: false, land: 0 };
    });
    intro.end = T_READ + (n - 1) * T_STEP + T_FLY + 0.35;
    intro.t = 0; intro.start = performance.now(); intro.on = true;
    // desfecho garantido: se os quadros não vierem (aba ocluída, abertura fora da tela), o véu sai mesmo assim
    const run = (intro.run = (intro.run || 0) + 1);
    setTimeout(() => endIntro(run), (intro.end + 0.7) * 1000 + 500);
  };
  const endIntro = run => {
    if (!intro.on || (run && run !== intro.run)) return;
    intro.on = false;
    root.classList.remove("fx");
    list.forEach(s => nodes.get(s.n).classList.add("lit"));
    for (let i = packs.length - 1; i >= 0; i--) if (packs[i].from) packs.splice(i, 1);
    fx.clearRect(0, 0, fxW, fxH);
  };
  const drawIntro = () => {
    // o tempo é o do relógio, não a soma dos quadros: num aparelho lento a entrada pula quadros mas não atrasa
    // em relação ao título, que entra por CSS
    const I = intro; I.t = (performance.now() - I.start) / 1000;
    const t = I.t;
    // véu: tudo escuro; cada estação que recebeu o seu dado abre um clarão nas ruas em volta
    if (I.veil) {
    fx.globalAlpha = t < I.end ? 1 : Math.max(0, 1 - (t - I.end) / 0.7);
    fx.fillStyle = "#0e0d0b"; fx.fillRect(0, 0, fxW, fxH);
    fx.globalAlpha = 1;
    fx.globalCompositeOperation = "destination-out";
    I.lines.forEach(L => {
      if (!L.land) return;
      const k = Math.min(1, (t - L.land) / 1.1), r = 30 + 340 * (1 - Math.pow(1 - k, 3)), [x, y] = scr(L.s);
      const g = fx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(0.55, "rgba(0,0,0,.72)"); g.addColorStop(1, "rgba(0,0,0,0)");
      fx.fillStyle = g; fx.beginPath(); fx.arc(x, y, r, 0, TAU); fx.fill();
    });
    fx.globalCompositeOperation = "source-over";
    }
    // o feed: cada linha é digitada, fica laranja quando é lida e some quando o ponto parte
    fx.font = I.font; fx.textBaseline = "middle";
    I.lines.forEach(L => {
      const a = t - L.k * 0.0028, out = t - L.t0;   // a última linha termina de ser digitada antes de a leitura começar
      if (a <= 0 || out > 0.16) return;
      fx.fillStyle = out > -0.09 ? `rgba(255,90,31,${out > 0 ? (1 - out / 0.16).toFixed(3) : 1})` : "rgba(239,234,225,.6)";
      fx.fillText(L.text.slice(0, Math.ceil(L.text.length * Math.min(1, a / 0.12))), L.x, L.y);
      if (out >= 0 && !L.sent) {
        L.sent = true;
        packs.push({ from: [L.x + 4, L.y], b: L.s, t: 0, dur: T_FLY, bend: (Math.random() - 0.5) * 0.5, land: () => { L.land = I.t; nodes.get(L.s.n).classList.add("lit"); } });
      }
    });
    if (t > I.end + 0.7) endIntro();
  };

  // depois da entrada: uma viagem nova de tempos em tempos, até um teto (menor no celular)
  let acc = 0;
  const emit = dt => {
    const big = wide(), gap = big ? 0.16 : 0.34, max = big ? 34 : 12;
    acc = Math.min(acc + dt, gap * 2);
    while (acc >= gap) {
      acc -= gap;
      if (packs.length >= max) continue;
      const a = list[(Math.random() * list.length) | 0], b = a.near[(Math.random() * a.near.length) | 0];
      packs.push({ a, b, t: 0, dur: 1.5 + Math.random() * 1.8, bend: (Math.random() - 0.5) * 0.7 });
    }
  };

  // cursor (só com mouse): lente que clareia as ruas, coordenadas reais e a estação mais próxima, letras da
  // manchete que alargam perto do cursor (eixo de largura da fonte) e botões que cedem na direção dele
  const fine = !!fx && matchMedia("(hover: hover) and (pointer: fine)").matches;
  const lens = $("#heroLens"), hud = $("#heroHud");
  const ptr = { x: 0, y: 0, lx: 0, ly: 0, on: false, link: false, hudT: 0 };
  const chars = [], mags = [];
  const M_UNIT = 11.6;   // metros por unidade do mapa (2000 unidades cobrem 0,2272° de longitude a 22,9° S)
  const measure = () => {
    const r = stage.getBoundingClientRect();
    chars.forEach(c => { c.e.style.fontVariationSettings = ""; c.f = 0; });
    mags.forEach(m => { m.e.style.transform = ""; m.x = m.y = 0; });
    chars.forEach(c => { const b = c.e.getBoundingClientRect(); c.x = b.left + b.width / 2 - r.left; c.y = b.top + b.height / 2 - r.top; });
    mags.forEach(m => { const b = m.e.getBoundingClientRect(); m.cx = b.left + b.width / 2 - r.left; m.cy = b.top + b.height / 2 - r.top; });
    // caixa do texto da manchete: em cima dela as coordenadas somem, para não escrever por cima das letras
    const xs = chars.map(c => c.x), ys = chars.map(c => c.y);
    ptr.box = chars.length ? [Math.min(...xs) - 30, Math.min(...ys) - 60, Math.max(...xs) + 30, Math.max(...ys) + 150] : null;
  };
  if (fine) {
    // as letras viram spans; o H1 guarda a frase inteira para o leitor de tela
    const head = $(".hero-name");
    head.setAttribute("aria-label", $$(".ln", head).map(l => l.textContent).join(" "));
    $$(".ln", head).forEach(l => l.setAttribute("aria-hidden", "true"));
    $$(".ln:not(.hero-pun) > span", head).forEach(line => {
      const txt = line.textContent; line.textContent = "";
      [...txt].forEach(ch => { const e = h("span"); e.textContent = ch; line.appendChild(e); chars.push({ e, x: 0, y: 0, f: 0 }); });
    });
    $$(".hero-act .pill").forEach(e => { e.classList.add("mag"); mags.push({ e, cx: 0, cy: 0, x: 0, y: 0 }); });
    stage.addEventListener("pointermove", e => {
      if (e.pointerType !== "mouse") return;
      const r = stage.getBoundingClientRect();
      ptr.x = e.clientX - r.left; ptr.y = e.clientY - r.top;
      if (!ptr.on) { ptr.on = true; ptr.lx = ptr.x; ptr.ly = ptr.y; measure(); stage.classList.add("aim"); }
      const b = ptr.box, link = !!(e.target.closest && e.target.closest("a, button")) || (!!b && heroP < 0.02 && ptr.x > b[0] && ptr.x < b[2] && ptr.y > b[1] && ptr.y < b[3]);
      if (link !== ptr.link) { ptr.link = link; stage.classList.toggle("on-link", link); }
    });
    stage.addEventListener("pointerleave", () => { ptr.on = false; stage.classList.remove("aim"); });
    addEventListener("resize", () => { if (ptr.on) measure(); });
  }
  const pointerStep = (dt, now) => {
    const k = Math.min(1, dt * 12);
    if (ptr.on) {
      ptr.lx += (ptr.x - ptr.lx) * k; ptr.ly += (ptr.y - ptr.ly) * k;
      lens.style.transform = `translate3d(${ptr.lx.toFixed(1)}px, ${ptr.ly.toFixed(1)}px, 0)`;
      const flip = ptr.x > fxW - 280;
      hud.style.transform = `translate3d(${(ptr.x + (flip ? -18 : 18)).toFixed(1)}px, ${(ptr.y + 20).toFixed(1)}px, 0)${flip ? " translateX(-100%)" : ""}`;
      if (now - ptr.hudT > 70) {
        ptr.hudT = now;
        const mx = (ptr.x - cam.x) / cam.z, my = (ptr.y - cam.y) / cam.z;
        const lon = GEO.lon0 + mx / GEO.w * (GEO.lon1 - GEO.lon0), lat = GEO.lat1 - my / GEO.h * (GEO.lat1 - GEO.lat0);
        let best = null, bd = 1e9;
        list.forEach(s => { const d = Math.hypot(s.x - mx, s.y - my); if (d < bd) { bd = d; best = s; } });
        const m = bd * M_UNIT, deg = v => Math.abs(v).toFixed(4).replace(".", ",");
        hud.firstElementChild.textContent = `${deg(lat)}° ${lat < 0 ? "S" : "N"} · ${deg(lon)}° ${lon < 0 ? "O" : "L"}`;
        hud.lastElementChild.textContent = `${m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`} · ${best.name}`;
      }
    }
    // a manchete só reage enquanto está parada no lugar (antes de a rolagem levar o texto embora)
    const live = ptr.on && heroP < 0.02, kc = Math.min(1, dt * 9);
    chars.forEach(c => {
      const tg = live ? Math.pow(Math.max(0, 1 - Math.hypot(c.x - ptr.x, c.y - ptr.y) / 230), 1.6) : 0;
      let f = c.f + (tg - c.f) * kc;
      if (f < 0.004) f = 0;
      if (Math.abs(f - c.f) < 0.002 && !(f === 0 && c.f !== 0)) return;
      c.f = f;
      c.e.style.fontVariationSettings = f ? `"wdth" ${(80 + 20 * f).toFixed(1)}, "opsz" 96` : "";
    });
    mags.forEach(m => {
      const dx = ptr.x - m.cx, dy = ptr.y - m.cy, near = live && Math.hypot(dx, dy) < 120;
      const tx = near ? dx * 0.22 : 0, ty = near ? dy * 0.32 : 0;
      const x = m.x + (tx - m.x) * kc, y = m.y + (ty - m.y) * kc;
      if (Math.abs(x - m.x) < 0.02 && Math.abs(y - m.y) < 0.02) return;
      m.x = x; m.y = y;
      m.e.style.transform = Math.abs(x) < 0.05 && Math.abs(y) < 0.05 ? "" : `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;
    });
  };

  // clique perto de uma estação: a linha dela aparece lá em cima, no lugar do feed (longe do cursor, do HUD e
  // do cartão da estação), é lida e o ponto voa até ela. É a entrada inteira, uma estação por vez
  const singles = [];
  const drawSingles = dt => {
    if (!singles.length) return;
    fx.font = `500 12px "Geist Mono", ui-monospace, monospace`; fx.textBaseline = "middle";
    for (let i = singles.length - 1; i >= 0; i--) {
      const q = singles[i]; q.t += dt;
      const out = q.t - 0.55;
      if (out > 0.3) { singles.splice(i, 1); continue; }
      const shown = q.text.slice(0, Math.ceil(q.text.length * Math.min(1, q.t / 0.22))), w = fx.measureText(shown).width;
      const x = q.x, y = 92 + q.slot * 22, al = out > 0 ? 1 - out / 0.3 : 1;
      fx.fillStyle = `rgba(14,13,11,${(0.82 * al).toFixed(3)})`; fx.fillRect(x - 7, y - 11, w + 14, 22);
      fx.fillStyle = q.t > 0.36 ? `rgba(255,90,31,${al.toFixed(3)})` : "rgba(239,234,225,.85)";
      fx.fillText(shown, x, y);
      if (out >= 0 && !q.sent) { q.sent = true; packs.push({ from: [x, y], b: q.s, t: 0, dur: T_FLY, bend: (Math.random() - 0.5) * 0.5 }); }
    }
  };
  if (fx) {
    stage.addEventListener("click", e => {
      if (intro.on && intro.veil) return;
      if (e.target.closest && e.target.closest("a, button, p, [role=button]")) return;
      const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
      let best = null, bd = 90;
      list.forEach(s => { const [sx, sy] = scr(s), d = Math.hypot(sx - x, sy - y); if (d < bd) { bd = d; best = s; } });
      if (!best || singles.length > 5) return;
      let slot = 0; while (singles.some(q => q.slot === slot)) slot++;
      singles.push({ s: best, slot, x: Math.max(16, $("#heroLive").getBoundingClientRect().left - r.left), t: 0, sent: false, text: `{"estacao": ${best.n}, "nome": "${best.name}", "vagas": ${best.cap}}` });
    });
  }

  // um laço só, que para quando a abertura sai da tela ou a aba fica em segundo plano
  let fxOn = false, fxRaf = 0, fxLast = 0, heroSeen = false;
  const frame = now => {
    fxRaf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - fxLast) / 1000)); fxLast = now;
    fx.clearRect(0, 0, fxW, fxH);
    // de volta ao topo depois de ter rolado para longe: o feed é lido de novo, sozinho
    if (heroArm && heroP < 0.03 && !intro.on) { heroArm = false; startIntro(false); }
    if (intro.on) drawIntro();
    if (!intro.on || !intro.veil) emit(dt);
    drawSingles(dt);
    drawPacks(dt);
    if (fine) pointerStep(dt, now);
  };
  const fxPlay = on => {
    if (!fx || on === fxOn) return;
    fxOn = on; cancelAnimationFrame(fxRaf);
    if (on) { fxLast = performance.now(); fxRaf = requestAnimationFrame(frame); }
  };
  if (fx) {
    sizeFx();
    addEventListener("resize", sizeFx);
    new IntersectionObserver(([e]) => { heroSeen = e.isIntersecting; fxPlay(heroSeen && !document.hidden); }).observe($(".hero"));
    document.addEventListener("visibilitychange", () => fxPlay(heroSeen && !document.hidden));
    // a entrada só toca se o html ainda está esperando (pre sem go): o véu cobre o mapa desde já
    if (root.classList.contains("pre") && !root.classList.contains("go")) {
      root.classList.add("fx");
      fx.fillStyle = "#0e0d0b"; fx.fillRect(0, 0, fxW, fxH);
      document.addEventListener("hero:go", () => { startIntro(); fxPlay(true); }, { once: true });
    }
  }
  if (window.__heroReady) window.__heroReady();

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
  // a seção entra em ordem: o rótulo, os fatos de cima para baixo e os três números (70 ms entre um e outro)
  if (!reduce) {
    const who = $(".who");
    // cada peça entra quando ela mesma aparece (no celular a seção é mais alta que a tela); o atraso em
    // escada recomeça nos números, para ninguém esperar por quem já entrou
    const parts = [[$(".eyebrow", who), ...$$("#whoFacts div")], $$("#whoStats div")];
    const whoIO = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add("rin"); whoIO.unobserve(e.target); } }), { threshold: 0.2 });
    parts.forEach(g => g.forEach((el, k) => { if (!el) return; el.style.setProperty("--k", k); whoIO.observe(el); }));
    who.classList.add("rv");
  }

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
      p: `Uma vez por minuto, a publicação lê a <strong>janela dos últimos 5 min</strong> (30 snapshots) e compara: subiu, entraram bikes; caiu, saíram. Os 30 s mais recentes ficam para a próxima. O que já saiu da janela é apagado.`,
      hud: `<div class="key"><span class="k-old">apagados</span><span class="k-win">na janela</span><span class="k-new">últimos 30 s</span></div>` },
    { t: "Camada", k: "ArcGIS · 1 por minuto", h: `Coordenadas que o mapa <em>entende.</em>`,
      p: `Antes de gravar no ArcGIS, cada ponto sai de latitude e longitude para <strong>SIRGAS 2000 / UTM 23S</strong> (EPSG 31983). A camada guarda entradas, saídas, fluxo e o ranking de cada estação. O pico do dia só é regravado quando o total passa dele, e reinicia quando o dia vira.`,
      hud: `<div class="utm"><small>Estação ${term.n} · ${term.name}</small><b>${nf(term.lat, 5)}, ${nf(term.lon, 5)}</b><i>↓ EPSG 4326 → EPSG 31983</i><div><span><small>Leste</small><b>${nf(uE)} m</b></span><span><small>Norte</small><b>${nf(uN)} m</b></span></div></div>` },
    { t: "Mapa", k: "Gêmeo Digital", h: `Do feed ao mapa, <em>um minuto.</em>`,
      p: `O Gêmeo plota as estações ao lado das outras fontes oficiais: trânsito do Waze (a cada 2 min), ônibus, câmeras, chuva e edificações em 3D. Do feed ao mapa, um minuto.`,
      hud: `<div class="now"><b id="tripBikes">…</b><span id="tripAt">bikes paradas · lendo a camada pública</span></div>` },
    { t: "Camadas", k: "6 fontes oficiais", h: `Seis camadas no Gêmeo. <em>Duas são minhas.</em>`,
      p: `O Gêmeo Digital de Niterói junta dados oficiais em tempo real para planejar e monitorar a cidade. Eu cuido do trânsito e do NitBike.`,
      hud: `<ol class="cap-layers">${lay.slice().reverse().map((l, i) => `<li class="${l.mine ? "mine" : ""}" data-layer="${LN - 1 - i}" tabindex="0"><span><b>${l.name}</b> ${l.source}</span></li>`).join("")}</ol>
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
    chapTrip = force => { if ((tripSeen || force) && chapN.textContent !== n) { chapN.textContent = n; chapT.textContent = n === "03" ? "Camadas" : "O caminho do dado"; } };
    chapTrip();
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
    import("./scene.js?v=202611131700").then(m => {
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

  /* ---------- 04 · pipeline: do snapshot à camada ---------- */
  // o fluxograma dos dois flows em cima; embaixo, o banco em 3D com a janela de 5 min deslizando.
  // A rolagem passa pelos nove passos; o relógio da simulação anda sozinho (1 s vale 10 s)
  const pipeEl = $(".pipe"), pipeRun = $("#pipeRun"), pipeStage = $("#pipeStage"), pf = $("#pipeFlow");
  // cada linha do fluxograma tem a sua legenda, em palavras simples
  const NODES = {
    api: [0, 40, "API NitBike", "bikes e vagas", "ant"], coleta: [212, 40, "Coleta", "a cada 10 s", "hatch", 1],
    pg: [424, 40, "PostgreSQL", "o banco", "db", 2], pub: [660, 40, "Publicação", "a cada minuto", "hatch", 3],
    agol: [892, 40, "ArcGIS", "camada NitBike", "layers", 4], gem: [1116, 40, "Gêmeo", "mapa da cidade", "layers", 5],
    total: [424, 212, "Total e pico", "soma as bikes", "hatch"],
  };
  const EDGES = {
    "api-coleta": ["M124 73H212", "lê a cada|10 s", 168, 64], "coleta-pg": ["M336 73H424", "grava|65 linhas", 380, 64],
    "pg-pub": ["M548 73H660", "lê os últimos|5 min", 604, 64], "pub-agol": ["M784 73H892", "atualiza|a camada", 838, 64],
    "agol-gem": ["M1016 73H1116", "mostra|no mapa", 1066, 64],
    "api-total": ["M62 106V245H424", "conta as bikes paradas", 243, 236], "total-pub": ["M548 245H722V106", "devolve o total", 635, 236],
    "total-agol": ["M486 278V300H954V106", "guarda o maior total do dia (o pico)", 720, 292, 1],
    "pub-pg": ["M722 40V14H486V40", "apaga o que ficou antes da janela", 604, 8, 1],
  };
  const ICON = {
    ant: '<path d="M8 12a4 4 0 0 1 8 0M5 12a7 7 0 0 1 14 0"/><circle cx="12" cy="12" r="1.4"/>',
    hatch: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 14 14 4M8 20 20 8M14 20l6-6"/>',
    db: '<ellipse cx="12" cy="6" rx="7" ry="2.6"/><path d="M5 6v12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6V6M5 12c0 1.4 3.1 2.6 7 2.6s7-1.2 7-2.6"/>',
    layers: '<path d="m12 4 8 4-8 4-8-4 8-4ZM4 12l8 4 8-4M4 16l8 4 8-4"/>',
  };
  // cada ligação tem o seu pacote: um ponto que corre o traço (animateMotion) quando o fluxo passa por ali
  pf.innerHTML = `<svg viewBox="0 0 1240 310" class="pf-lines">${Object.entries(EDGES).map(([k, [d, t, x, y, dash]]) =>
      `<path class="pf-e${dash ? " dash" : ""}" data-e="${k}" id="pe-${k}" d="${d}"/>${t ? `<text class="pf-t" data-e="${k}" x="${x}" y="${y}">${t.split("|").map((l, i, a) => `<tspan x="${x}" dy="${i ? 12 : -(a.length - 1) * 12}">${l}</tspan>`).join("")}</text>` : ""}`).join("")}
      ${Object.keys(EDGES).map(k => `<g class="pf-pk" data-pk="${k}"><circle r="7" class="pf-pk-h"/><circle r="3"/><animateMotion begin="indefinite" dur="0.25s" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .25 1"><mpath href="#pe-${k}"/></animateMotion></g>`).join("")}</svg>` +
    Object.entries(NODES).map(([k, [x, y, t, s, ic, n]]) => `<div class="pf-n" data-n="${k}" style="left:${x}px;top:${y}px">
      <svg viewBox="0 0 24 24">${ICON[ic]}</svg><b>${t}</b><small>${s}</small>${n ? `<i>${n}</i>` : ""}</div>`).join("");
  // a câmera fica parada no mesmo enquadramento em todos os passos (trocar a cada passo cansava a vista)
  const STEPS = [
    { t: "Como ler", k: "dois flows, um passo de cada vez", p: "A coleta (1 → 2) tira uma foto das 65 estações a cada 10 s; a publicação (3 → 4 → 5) junta as fotos dos últimos minutos e atualiza o mapa, uma vez por minuto. Cada ficha do bloco é uma foto; cada quadradinho, uma estação (mais clara, mais cheia). Mude a velocidade em 1×, 5× ou 10×.",
      n: Object.keys(NODES), e: [], stats: true, pose: 0, look: { delta: 0.5 } },
    { t: "Coleta", k: "nitbike_snapshot_flow", p: "A cada 10 s: autentica na API, busca as 65 estações e grava uma linha por estação na tabela nitbike_snapshot, com a hora da coleta. Sem nova tentativa: se falha, aquele snapshot fica faltando.",
      n: ["api", "coleta", "pg"], e: ["api-coleta", "coleta-pg"], pose: 0, look: { delta: 0.3 }, log: () => [["nitbike_snapshot_flow", "INFO", "65 estações gravadas · {agora}"]] },
    { t: "PostgreSQL", k: "nitbike_snapshot", p: "Guarda os snapshots até a publicação usá-los. A fila anda sozinha: o novo entra no “agora”, os antigos vão ficando para trás até a limpeza.",
      n: ["pg"], e: ["coleta-pg"], pose: 0, look: { delta: 0.4 }, log: () => [["nitbike_snapshot", "", `${pipeRows} snapshots no banco · ${fmt(pipeRows * 65)} linhas`]] },
    { t: "Publicação", k: "nitbike_flow_arcgis", p: "Uma vez por minuto, a publicação lê os últimos 5 minutos do banco: 30 fotos de uma vez, a janela laranja. As fotos dos últimos 30 segundos ficam de fora, porque ainda podem estar sendo gravadas. As que acabaram de entrar na janela acendem.",
      n: ["pg", "pub"], e: ["pg-pub"], pose: 0, look: { delta: 0.6 }, log: () => [["nitbike_flow_arcgis", "INFO", "Janela de processamento configurada: 5 minutos (lag de segurança: 30 segundos) · {de} → {ate}"], ["próxima publicação", "", `em ${pipeNext} s`]] },
    { t: "Total e pico", k: "nitbike_total_bikes_flow", p: "Subflow chamado no começo de cada publicação. Soma as bikes paradas nas estações e compara com o pico guardado na camada. Só troca o pico quando o total passa dele, o que acontece de madrugada.",
      n: ["api", "total", "pub", "agol"], e: ["api-total", "total-pub", "total-agol"], pose: 0, look: { delta: 0.4 }, big: true, log: () => [["total_bikes", "INFO", `Novo valor (${lastRead ? fmt(lastRead.bikes) : "—"}) não é maior que o atual. Não atualizando.`]] },
    { t: "Entradas, saídas e fluxo", k: "calculate_flow", p: "A publicação compara cada snapshot da janela com o seguinte: se a contagem sobe, entraram bikes; se cai, saíram. Fluxo é a soma, e os rankings ordenam as estações por entradas, saídas e fluxo.",
      n: ["pg", "pub"], e: ["pg-pub"], pose: 0, look: { delta: 1 }, log: () => [["load_snapshots", "INFO", "[Snapshots] Total: 1950 | Estações únicas: 65"], ["calculate_flow", "INFO", "entradas, saídas e fluxo por estação · rankings ordenados"], ["na tela", "", `<span class="up">▲ ${pipeUD[0]} subidas</span> · <span class="dn">▼ ${pipeUD[1]} quedas</span> entre snapshots da janela (simulação)`]] },
    { t: "ArcGIS Online", k: "update_arcgis", p: "Converte a latitude e a longitude de cada estação para SIRGAS 2000 / UTM 23S (EPSG 31983) e grava os pontos com bikes, vagas, entradas, saídas, fluxo e rankings.",
      n: ["pub", "agol", "total"], e: ["pub-agol", "total-agol"], pose: 0, look: { delta: 0.3 }, log: () => [["update_arcgis", "INFO", "ArcGIS atualizado sem truncate | updates=66 | adds=0"]] },
    { t: "Limpeza", k: "clear_old_data", p: "Depois de ler a janela, a publicação apaga do banco o que ficou antes dela. A tabela nunca cresce: guarda só os poucos minutos de que a próxima publicação precisa.",
      n: ["pub", "pg"], e: ["pub-pg"], pose: 0, look: { delta: 0.3 }, log: () => [["clear_old_data", "INFO", "DELETE FROM nitbike_snapshot WHERE collected_at < {de}"], ["nitbike_flow_arcgis", "OK", "Finished in state Completed()"]] },
    { t: "Gêmeo Digital", k: "a camada no mapa", p: "O Gêmeo lê a camada e mostra as estações no mapa da cidade, ao lado das outras fontes. Do snapshot ao mapa: um minuto.",
      n: ["agol", "gem"], e: ["agol-gem"], pose: 0, look: { ring: 1, delta: 0.2 }, log: () => [["Gêmeo Digital", "", `${pipeLive()} · anel maior, estação mais cheia`]] },
  ];
  const PS = STEPS.length;
  $("#pipeCaps").innerHTML = STEPS.map((s, i) => `<article class="pcap" data-i="${i}">
      <p class="eyebrow">Do dado ao mapa · passo ${i + 1} de ${PS}</p><h3>${s.t}</h3><p class="pcap-k">${s.k}</p><p class="pcap-p">${s.p}</p>
      ${s.big ? `<div class="pcap-big"><b class="pb-n">—</b><span>bikes paradas agora, somadas pelo subflow</span><i class="pb-bar"><i></i></i><small class="pb-s">lendo as estações…</small></div>` : ""}
      ${s.stats ? `<dl class="pcap-st"><div><dt>65</dt><dd>estações por snapshot</dd></div><div><dt>10 s</dt><dd>entre um snapshot e outro</dd></div><div><dt>1 min</dt><dd>entre uma publicação e outra</dd></div><div><dt>5 min</dt><dd>de janela, com 30 s de folga</dd></div></dl>` : ""}
      <div class="pcap-log"></div></article>`).join("") +
    `<p class="pcap-note"><span class="pn-speed">Em 10×, 1 s na tela vale 10 s do fluxo.</span> O brilho de cada estação vem da última leitura do NitBike; a variação entre um snapshot e outro é ilustrativa.</p>`;
  $("#pipeDots").innerHTML = STEPS.map((s, i) => `<li><button type="button" data-i="${i}" aria-label="Passo ${i + 1}: ${s.t}"></button></li>`).join("");
  const pcaps = $$(".pcap", pipeEl), pdots = $$("#pipeDots button"), pnodes = $$(".pf-n", pf), pedges = $$("[data-e]", pf);
  const hm = ms => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(ms));
  let pipe = null, pipeAt = -1, pipeST = null;
  const pipeLog = () => {
    const s = STEPS[pipeAt], box = pcaps[pipeAt] && $(".pcap-log", pcaps[pipeAt]);
    if (!box) return;
    const P = pipe ? pipe.pub() : { de: Date.now() - 330000, ate: Date.now() - 30000, now: Date.now() };
    const fill = t => t.replace("{de}", hm(P.de)).replace("{ate}", hm(P.ate)).replace("{agora}", hm(P.now || Date.now()));
    box.innerHTML = s.log ? s.log().map(([f, lv, m]) => `<p><b>${f}</b>${lv ? ` <i class="${lv === "OK" ? "ok" : ""}">${lv}</i>` : ""} ${fill(m)}</p>`).join("") : "";
    if (s.big) pipeBig();
  };
  let pfPan = () => {};
  const pipeStep = k => {
    if (k === pipeAt) return; pipeAt = k;
    const s = STEPS[k];
    pcaps.forEach((c, i) => c.classList.toggle("on", i === k));
    pdots.forEach((b, i) => { b.classList.toggle("on", i === k); b.setAttribute("aria-current", i === k ? "step" : "false"); });
    pnodes.forEach(n => { const on = s.n.includes(n.dataset.n); n.classList.toggle("on", on && !s.stats); n.classList.toggle("dim", !on); });
    pedges.forEach(e => e.classList.toggle("on", s.e.includes(e.dataset.e)));
    if (pipe) { pipe.pose(s.pose); pipe.look(s.look); }
    pfPan();
    pipeLog();
  };
  // números ao vivo dos passos: linhas no banco, contagem até a próxima publicação, o total real de bikes
  // e, na janela, quantas células subiram ou caíram (a variação entre snapshots é a da simulação)
  let pipeRows = 39, pipeNext = 6, pipeUD = [0, 0], pipeSpeed = 10;
  const pipeTick = () => { if (!pipe) return; const S = pipe.state(); pipeRows = Math.floor(S.e) - (S.r - 33) + 1; pipeNext = Math.max(1, Math.ceil((S.r + 6 - S.e) * 10 / S.speed)); };
  const pipeLive = () => { const L = [...stations.values()].filter(s => s.bikes != null); return L.length ? `${L.length} estações · ${fmt(L.reduce((a, s) => a + s.bikes, 0))} bikes` : "65 estações"; };
  const pipeBig = () => {
    const box = pcaps[4] && $(".pcap-big", pcaps[4]); if (!box) return;
    const L = [...stations.values()].filter(s => s.bikes != null);
    if (!L.length) return;
    const b = L.reduce((a, s) => a + s.bikes, 0), f = L.reduce((a, s) => a + s.free, 0);
    $(".pb-n", box).textContent = fmt(b);
    $(".pb-bar > i", box).style.transform = `scaleX(${(b / Math.max(1, b + f)).toFixed(3)})`;
    $(".pb-s", box).textContent = `${fmt(f)} vagas livres · ${Math.round(b / Math.max(1, b + f) * 100)}% das vagas ocupadas`;
  };
  const jh = (x, y) => { const v = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return v - Math.floor(v); };
  const pipeCount = r => {
    const occ = [...stations.values()].map(s => (s.bikes + s.free) ? s.bikes / (s.bikes + s.free) : 0.5);
    let up = 0, dn = 0;
    for (let c = r - 32; c <= r - 3; c++) {
      const s1 = (c * 0.7311) % 97, s0 = ((c - 1) * 0.7311) % 97;
      for (let k = 0; k < 65; k++) {
        const col = k % 13, row = 4 - Math.floor(k / 13), o = occ[k] ?? 0.5;
        const v1 = Math.min(1, Math.max(0.06, o + (jh(col + s1 * 7.13, row + s1 * 7.13) - 0.5) * 0.28)), v0 = Math.min(1, Math.max(0.06, o + (jh(col + s0 * 7.13, row + s0 * 7.13) - 0.5) * 0.28));
        if (v1 - v0 > 0.06) up++; else if (v0 - v1 > 0.06) dn++;
      }
    }
    pipeUD = [up, dn];
  };
  // pacotes: um ponto corre a ligação; o nó de chegada pulsa quando ele chega
  const pks = {}; $$(".pf-pk", pf).forEach(g => (pks[g.dataset.pk] = g));
  const nodeEl = {}; pnodes.forEach(n => (nodeEl[n.dataset.n] = n));
  const hit = k => { const n = nodeEl[k]; if (!n || reduce) return; n.classList.remove("hit"); void n.offsetWidth; n.classList.add("hit"); };
  const shoot = (edge, at, dur, to) => setTimeout(() => {
    const g = pks[edge]; if (!g || reduce) return;
    const am = g.querySelector("animateMotion");
    am.setAttribute("dur", `${dur}ms`); g.classList.remove("go"); void g.getBBox(); g.classList.add("go");
    try { am.beginElement(); } catch (_) {}
    setTimeout(() => { g.classList.remove("go"); if (to) hit(to); }, dur);
  }, at);
  const pipeOn = {
    // a coleta: o pacote sai da API, passa pela coleta e chega no banco no quadro em que a ficha nasce
    pre: () => { if (!pipeSeen) return; shoot("api-coleta", 0, 170, "coleta"); shoot("coleta-pg", 170, 210, "pg"); },
    snap: () => {
      if (!pipeSeen) return;
      pipeTick();
      const chip = $("#pipeLbl [data-k=agora] b");
      if (chip && !reduce) chip.animate([{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(-4px)", offset: 0.25 }, { opacity: 0, transform: "translateY(-20px)" }], { duration: 900, easing: "cubic-bezier(.23, 1, .32, 1)" });
      if (STEPS[pipeAt] && STEPS[pipeAt].log) pipeLog();
    },
    // a publicação, na pauta do bloco 3D (pipe.T, em segundos): o total, a leitura da janela quando a
    // varredura começa, o "apaga" quando as fichas cinza começam a se desfazer, a camada quando as
    // primeiras partículas pousam no mapa e o Gêmeo quando o mapa pulsa
    pub: r => {
      pipeCount(r); pipeTick();
      if (!pipeSeen || !pipe) return;
      const T = pipe.T, ms = x => Math.round(x * 1000);
      shoot("api-total", 0, 300, "total"); shoot("total-pub", 300, 280, "pub");
      shoot("pg-pub", ms(T.read) - 280, 280, "pub"); shoot("total-agol", 600, 520);
      shoot("pub-pg", ms(T.clean) - 350, 350, "pg");
      shoot("pub-agol", ms(T.agol) - 300, 300, "agol"); shoot("agol-gem", ms(T.gem) - 300, 300, "gem");
      if (STEPS[pipeAt] && STEPS[pipeAt].log) pipeLog();
    },
  };
  let pipeSeen = false;
  pipeStep(0);
  // o log e a contagem até a próxima publicação acompanham o relógio da simulação
  setInterval(() => { pipeTick(); if (pipe && pipeSeen && pipeAt >= 0 && STEPS[pipeAt].log) pipeLog(); }, 500);
  // a velocidade da simulação: 1× é o tempo real (uma foto a cada 10 s, uma publicação por minuto)
  const speedNote = v => v === 1 ? "Em 1×, tempo real: uma foto a cada 10 s e uma publicação por minuto." : `Em ${v}×, 1 s na tela vale ${v} s do fluxo: uma foto a cada ${10 / v} s e uma publicação a cada ${60 / v} s.`;
  $$("#pipeSpeed button").forEach(b => b.addEventListener("click", () => {
    pipeSpeed = +b.dataset.s;
    $$("#pipeSpeed button").forEach(x => { x.classList.toggle("on", x === b); x.setAttribute("aria-pressed", x === b); });
    $$(".pn-speed", pipeEl).forEach(n => (n.textContent = speedNote(pipeSpeed)));
    if (pipe) pipe.setSpeed(pipeSpeed);
    pipeTick(); pipeLog();
  }));
  $$(".pn-speed", pipeEl).forEach(n => (n.textContent = speedNote(10)));
  pdots.forEach(b => b.addEventListener("click", () => {
    if (!pipeST) return pipeStep(+b.dataset.i);
    const y = pipeST.start + (pipeST.end - pipeST.start) * ((+b.dataset.i + 0.5) / PS);
    if (lenis) lenis.scrollTo(y, { duration: 1 }); else scrollTo({ top: y, behavior: "smooth" });
  }));
  // o fluxograma tem um tamanho de desenho fixo e é encaixado na largura disponível
  // Na tela estreita ele não cabe legível: fica num tamanho que dá para ler e uma janela anda até os nós do passo
  const PF_K = 0.8, PF_H = 132;
  let pfNarrow = false;
  pfPan = () => {
    if (!pfNarrow) return;
    const s = STEPS[Math.max(0, pipeAt)] || STEPS[0], ns = (s.stats || (s.n || []).length > 3 ? ["api", "coleta"] : s.n || []).map(n => NODES[n]).filter(Boolean);
    const xs = ns.length ? ns.map(n => n[0] + 62) : [620], ys = ns.length ? ns.map(n => n[1] + 33) : [73];
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2, cw = pf.parentElement.clientWidth;
    const tx = Math.min(8, Math.max(cw - 1240 * PF_K - 8, cw / 2 - cx * PF_K)), ty = Math.min(10, Math.max(PF_H - 310 * PF_K, PF_H / 2 - cy * PF_K));
    pf.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0) scale(${PF_K})`;
  };
  const pfFit = () => {
    const box = pf.parentElement, cw = box.clientWidth;
    pfNarrow = cw < 700;
    box.classList.toggle("pan", pfNarrow); pf.classList.toggle("pan", pfNarrow);
    if (pfNarrow) { box.style.height = `${PF_H}px`; pfPan(); return; }
    const k = Math.min(1, cw / 1240); pf.style.transform = `scale(${k.toFixed(4)})`; box.style.height = `${Math.round(310 * k)}px`;
  };
  pfFit(); addEventListener("resize", pfFit);
  // ocupação de cada estação na última leitura, na ordem da grade (13 colunas × 5 linhas)
  const pipeFill = () => pipe && pipe.setFill([...stations.values()].map(s => (s.bikes + s.free) ? s.bikes / (s.bikes + s.free) : null));
  if (hasGsap) pipeST = ScrollTrigger.create({ trigger: pipeRun, start: "top top", end: "bottom bottom", onUpdate: s => pipeStep(Math.min(PS - 1, Math.floor(s.progress * PS))) });
  // a tampa do notebook acompanha a rolagem: abre quando a seção chega (pipeIn, 0 a 1 enquanto ela sobe
  // na tela) e fecha quando ela vai embora (pipeOut, 0 a 1 enquanto ela sai por cima)
  let pipeIn = 1, pipeOut = 0;
  const pipeLid = () => { if (pipe) pipe.setLid(pipeIn, pipeOut); };
  if (hasGsap && !reduce) {
    pipeIn = 0;
    ScrollTrigger.create({ trigger: pipeRun, start: "top bottom", end: "top top", onUpdate: s => { pipeIn = s.progress; pipeLid(); }, onLeave: () => { pipeIn = 1; pipeLid(); }, onLeaveBack: () => { pipeIn = 0; pipeLid(); } });
    ScrollTrigger.create({ trigger: pipeRun, start: "bottom bottom", end: "bottom top", onUpdate: s => { pipeOut = s.progress; pipeLid(); }, onLeave: () => { pipeOut = 1; pipeLid(); }, onLeaveBack: () => { pipeOut = 0; pipeLid(); } });
  }
  {
    const lbl = {}; $$("#pipeLbl span").forEach(el => (lbl[el.dataset.k] = el));
    let asked = false, seen = false;
    const loadPipe = () => {
      if (asked) return; asked = true;
      import("./pipe.js?v=202611131200").then(m => {
        pipe = m.createPipe({ canvas: $("#pipeGL"), labels: lbl, reduce, stations: [...stations.values()].map(s => [s.x / 100, s.y / 100]), on: pipeOn });
        pipeFill(); pipe.pose(STEPS[Math.max(0, pipeAt)].pose); pipe.look(STEPS[Math.max(0, pipeAt)].look); pipe.setSpeed(pipeSpeed); pipeLid();
        if (seen) pipe.start();
        addEventListener("resize", () => pipe.resize());
        pipeEl.classList.add("gl");
      }).catch(() => pipeEl.classList.add("flat"));
    };
    new IntersectionObserver(([e]) => { if (e.isIntersecting) loadPipe(); }, { rootMargin: "120% 0px" }).observe(pipeRun);
    new IntersectionObserver(([e]) => { seen = pipeSeen = e.isIntersecting; if (pipe) pipe[seen ? "start" : "stop"](); }).observe(pipeStage);
    // a cada leitura nova do NitBike, as estações do bloco acendem com a ocupação de agora
    setInterval(pipeFill, 60000);
  }

  /* ---------- 03 · outras frentes: Colab e a prova de conceito ---------- */
  const C = D.colab, cMax = Math.max(...C.series.map(s => s[1])), cLast = C.series.length - 1;
  $("#civic").innerHTML = `<div class="civ-top">
      <div class="civ-big"><p class="eyebrow">06 — Outras frentes · Colab</p><b>${C.kpis[0][0]}</b><span>${C.kpis[0][1]}</span></div>
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
  // o aviso fica por cima do quadro até ele terminar de carregar: em espera antes, trabalhando durante
  const labWait = $(".lab-wait", labFrame), labOrb = orb($(".orb", labWait), { state: "waiting", size: 20 });
  const loadLab = () => {
    if (labOn) return; labOn = true;
    const f = document.createElement("iframe");
    f.src = "lab.html?v=202611111620"; f.title = "Gêmeo simplificado e pipeline do NitBike";
    labOrb.set({ state: "working", size: 20 }); $("span", labWait).textContent = "carregando o laboratório…";
    f.addEventListener("load", () => { labWait.classList.add("gone"); setTimeout(() => labWait.remove(), 400); }, { once: true });
    labFrame.insertBefore(f, labWait);
  };
  addEventListener("load", () => setTimeout(() => idle(loadLab, { timeout: 4000 }), 3200));
  const labIO = new IntersectionObserver(es => { if (es[0].isIntersecting) { labIO.disconnect(); loadLab(); } }, { rootMargin: "200% 0px" });
  labIO.observe(labFrame);
  // o quadro é do mesmo site, então o navegador não o pausa sozinho: longe da tela, ele para de animar
  let labNear = false;
  let labSeen = false;
  const labPause = () => { const f = $("iframe", labFrame); if (f && f.contentWindow) f.contentWindow.postMessage({ type: "lab-pause", on: !labSeen }, location.origin); };
  new IntersectionObserver(([e]) => {
    labNear = e.isIntersecting; labPause();
    if (labNear && labPending) { labH = labPending; labPending = 0; labFrame.style.setProperty("--h", `${labH}px`); if (hasGsap) ScrollTrigger.refresh(); }
  }, { rootMargin: "40% 0px" }).observe(labFrame);
  // e para de animar assim que sai da tela (a altura continua liberada até 40% de distância, como acima)
  new IntersectionObserver(([e]) => { labSeen = e.isIntersecting; labPause(); }).observe(labFrame);
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
        <div class="ph-top"><i></i><div><b>Concurso Notifier</b><small><svg class="orb" width="14" height="14" aria-hidden="true"></svg><span>bot · alertas a cada 17 min</span></small></div></div>
        <div class="chat"><div class="feed" id="tgFeed">${edital(EDITAIS[0])}</div></div></div>
      <span class="fchip c1">estado · RJ</span><span class="fchip c2">nível · superior</span><span class="fchip c3">palavra · dados</span></div>`,
    // mapa de ladrilhos do Brasil (coluna, linha): altura e cor são só ilustração, sem dado real
    saude: `<span class="demo-note">ilustração · sem dados reais</span><div class="d3 d3-uf"><canvas class="iso" id="ufFx" aria-hidden="true"></canvas></div>`,
    mocforge: `<span class="demo-note">ilustração</span><div class="mcp"><p class="prompt">monte uma casinha de tijolos vermelhos</p><p class="call">add_parts_batch_tool · ${bricks.length} peças</p><p class="call">render_view_tool · conferindo</p></div>
      <div class="d3 d3-bk"><canvas class="iso" id="bkFx" aria-hidden="true"></canvas></div>`,
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
  // As duas maquetes (mapa do Brasil e casinha) são desenhadas num canvas 2D em projeção isométrica. Antes
  // eram centenas de planos em CSS 3D, um por face: pesava em máquina fraca e as peças não tinham as faces
  // de trás. Aqui cada bloco é um sólido com as três faces visíveis, e o canvas só redesenha enquanto algo anda
  const iso = (rz, rx) => { const t = rz * Math.PI / 180, q = rx * Math.PI / 180; return { ex: [Math.cos(t), Math.sin(t) * Math.cos(q)], ey: [-Math.sin(t), Math.cos(t) * Math.cos(q)], zy: -Math.sin(q) }; };
  const isoQuad = (c, B, pts, fill, edge) => {
    c.beginPath();
    pts.forEach((q, i) => { const X = q[0] * B.ex[0] + q[1] * B.ey[0], Y = q[0] * B.ex[1] + q[1] * B.ey[1] + q[2] * B.zy; i ? c.lineTo(X, Y) : c.moveTo(X, Y); });
    c.closePath(); c.fillStyle = fill; c.fill();
    // o contorno na cor da face fecha a fresta entre faces vizinhas; por cima, uma aresta escura bem fina
    c.strokeStyle = fill; c.stroke();
    if (edge) { c.strokeStyle = edge; c.stroke(); }
  };
  // caixa vista de cima: face esquerda (-x), face da frente (+y) e topo
  const isoBox = (c, B, x, y, z, w, d, hh, cols, edge) => {
    isoQuad(c, B, [[x, y, z], [x, y + d, z], [x, y + d, z + hh], [x, y, z + hh]], cols[2], edge);
    isoQuad(c, B, [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + hh], [x, y + d, z + hh]], cols[1], edge);
    isoQuad(c, B, [[x, y, z + hh], [x + w, y, z + hh], [x + w, y + d, z + hh], [x, y + d, z + hh]], cols[0], edge);
  };
  // o canvas mede em "em" do bloco que o contém, com a origem no centro do plano: acompanha o tamanho da fonte
  const isoStage = (cv, wEm, hEm, oxEm, oyEm) => {
    const c = cv.getContext("2d"), host = cv.parentElement;
    let em = 16;
    const fit = () => {
      em = parseFloat(getComputedStyle(host).fontSize) || 16;
      const k = Math.min(devicePixelRatio || 1, 2);
      cv.style.width = `${wEm}em`; cv.style.height = `${hEm}em`; cv.style.left = `calc(50% - ${oxEm}em)`; cv.style.top = `calc(50% - ${oyEm}em)`;
      cv.width = Math.round(wEm * em * k); cv.height = Math.round(hEm * em * k);
      c.setTransform(k * em, 0, 0, k * em, oxEm * em * k, oyEm * em * k);
      c.lineJoin = "round"; c.lineWidth = 1 / em;
    };
    const clear = () => c.clearRect(-oxEm, -oyEm, wEm, hEm);
    return { c, fit, clear, px: () => 1 / em };
  };
  const mixc = (a, b, t) => `rgb(${a.map((v, i) => Math.round(v + (b[i] - v) * t)).join(",")})`;
  const cl0 = v => Math.min(1, Math.max(0, v));
  const pjStart = new Map();

  // mapa do Brasil: cada estado é um bloco que nasce rente ao chão e sobe até a altura dele conforme o
  // projeto entra na tela, numa onda de norte a sul. A rolagem dá o alvo e os blocos chegam nele devagar
  // (amortecido), então descer rápido ou devagar dá sempre uma subida macia; voltar desce de novo
  {
    const cv = $("#ufFx"), pj = cv && cv.closest(".pj");
    if (cv && cv.getContext) {
      const B = iso(-24, 54), S = isoStage(cv, 46, 32, 23, 17), c = S.c, OR = [255, 90, 31], INKC = [14, 13, 11], BLK = [0, 0, 0];
      const tiles = UFS.map(([u, col, row]) => {
        const a = 0.22 + ((u.charCodeAt(0) * 7 + u.charCodeAt(1) * 3) % 55) / 100, x = col * 4.7 - 16.2, y = (row - 1) * 4.7 - 18.55;
        return { u, x, y, h: 0.35 + (a - 0.22) * 4.2, d: 0.15 + row * 0.085 + col * 0.03, cols: [mixc(INKC, OR, a), mixc(BLK, OR, a * 0.6), mixc(BLK, OR, a * 0.45)] };
      }).sort((p, q) => (p.y * 0.74 - p.x * 0.33) - (q.y * 0.74 - q.x * 0.33));   // do fundo para a frente
      const dMax = Math.max(...tiles.map(x => x.d)), ez = t => 1 - Math.pow(1 - t, 3);
      let cur = reduce ? 1 : 0, goal = cur, raf = 0, lastT = 0;
      const paint = () => {
        S.clear();
        tiles.forEach(x => {
          const k = ez(cl0(cur * 1.55 - (x.d / dMax) * 0.55)), hh = Math.max(0.02, x.h * k);
          // o contorno do Brasil já aparece apagado, rente ao chão; cada bloco acende enquanto sobe
          c.globalAlpha = 0.28 + 0.72 * cl0(k * 3);
          isoBox(c, B, x.x, x.y, 0, 4.2, 4.2, hh, x.cols);
          // a sigla deitada no topo do bloco: o texto é desenhado no plano do chão, na altura do bloco
          c.save(); c.transform(B.ex[0], B.ex[1], B.ey[0], B.ey[1], 0, hh * B.zy); c.translate(x.x + 2.1, x.y + 2.1); c.scale(0.1, 0.1);
          c.font = `600 10px "Geist Mono", ui-monospace, monospace`; c.textAlign = "center"; c.textBaseline = "middle"; c.fillStyle = "#efeae1"; c.fillText(x.u, 0, 0.5);
          c.restore();
        });
        c.globalAlpha = 1;
      };
      const tick = now => {
        const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 0.016; lastT = now;
        cur += (goal - cur) * (1 - Math.exp(-dt * 2.6));
        if (Math.abs(goal - cur) < 0.001) cur = goal;
        paint();
        raf = cur === goal ? 0 : requestAnimationFrame(tick);
      };
      const want = () => {
        const r = cv.getBoundingClientRect(), vh = innerHeight;
        // 0 quando o mapa aponta embaixo da tela; 1 quando o centro dele passa de 60% da altura
        const g = reduce ? 1 : cl0((vh - (r.top + r.height * 0.5)) / (vh * 0.55));
        if (g === goal) return;
        goal = g;
        if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); }
      };
      S.fit(); paint();
      let on = false;
      new IntersectionObserver(([e]) => { on = e.isIntersecting; if (on) want(); }, { rootMargin: "20% 0px" }).observe(pj);
      addEventListener("scroll", () => { if (on) want(); }, { passive: true });
      addEventListener("resize", () => { S.fit(); paint(); });
      document.fonts && document.fonts.ready.then(paint);
    }
  }
  // a casinha: cada peça é um tijolo sólido com pinos de verdade (um cilindro baixo, com sombra na tampa).
  // As peças caem uma a uma quando o projeto entra na tela; depois o desenho fica parado
  {
    const cv = $("#bkFx"), pj = cv && cv.closest(".pj");
    if (cv && cv.getContext) {
      const B = iso(-34, 62), S = isoStage(cv, 21, 22, 10.5, 17), c = S.c, HB = 1.2, DROP = 5;
      const RED = { cols: ["#ff5a1f", "#d8461a", "#b23a14"], stud: "#ff7d4a", ring: "#e04c18" };
      const DARK = { cols: ["#2a2722", "#1f1d19", "#141311"], stud: "#3d3932", ring: "#1a1815" };
      // ordem de desenho: camada por camada, e dentro da camada do fundo para a frente
      const parts = bricks.map((b, i) => ({ ...b, x: b.x - 6, y: b.y - 4, z: b.r * HB, t0: 0.5 + i * 0.05, pal: b.roof ? DARK : RED }))
        .sort((p, q) => p.r - q.r || ((p.y + p.d) * 0.73 - p.x * 0.49) - ((q.y + q.d) * 0.73 - q.x * 0.49));
      const T_END = 0.5 + (bricks.length - 1) * 0.05 + 0.7;
      // círculos no plano do chão, na altura z (viram elipses na tela)
      const discs = (cells, z, r, fill, dx = 0, dy = 0) => {
        c.save(); c.transform(B.ex[0], B.ex[1], B.ey[0], B.ey[1], 0, z * B.zy);
        c.beginPath(); cells.forEach(([x, y]) => { c.moveTo(x + dx + r, y + dy); c.arc(x + dx, y + dy, r, 0, Math.PI * 2); });
        c.fillStyle = fill; c.fill(); c.restore();
      };
      const cellsOf = (x, y, w, d) => { const o = []; for (let i = 0; i < w; i++) for (let j = 0; j < d; j++) o.push([x + i + 0.5, y + j + 0.5]); return o; };
      const baseCells = cellsOf(-8, -6, 16, 12);
      const paint = t => {
        S.clear();
        // a base: uma placa clara com espessura e a marca dos pinos
        isoBox(c, B, -8, -6, -0.35, 16, 12, 0.35, ["#d9d1c3", "#c2b9a9", "#b0a797"], "rgba(14,13,11,.1)");
        discs(baseCells, 0, 0.2, "rgba(14,13,11,.12)");
        parts.forEach(p => {
          if (t < p.t0) return;
          const u = cl0((t - p.t0) / 0.7), k = 1 - Math.pow(1 - u, 4), z = p.z + (1 - k) * DROP;
          c.globalAlpha = cl0((t - p.t0) / 0.25);
          isoBox(c, B, p.x, p.y, z, p.w, p.d, HB, p.pal.cols, "rgba(0,0,0,.16)");
          const cells = cellsOf(p.x, p.y, p.w, p.d), top = z + HB;
          discs(cells, top, 0.34, "rgba(0,0,0,.24)", 0.07, 0.09);            // sombra do pino na tampa
          for (let s = 0; s <= 3; s++) discs(cells, top + s * 0.06, 0.3, p.pal.ring);   // o corpo do pino
          discs(cells, top + 0.2, 0.3, p.pal.ring); discs(cells, top + 0.2, 0.25, p.pal.stud);   // a tampa do pino
        });
        c.globalAlpha = 1;
      };
      let t0 = 0, raf = 0, done = reduce;
      const tick = now => {
        const t = (now - t0) / 1000;
        paint(t);
        if (t < T_END) raf = requestAnimationFrame(tick); else { raf = 0; done = true; }
      };
      S.fit(); paint(done ? T_END : 0);
      pjStart.set(pj, () => { if (done || raf) return; t0 = performance.now(); raf = requestAnimationFrame(tick); });
      addEventListener("resize", () => { S.fit(); if (!raf) paint(done ? T_END : 0); });
    }
  }
  // cada projeto monta a demonstração uma vez; fora da tela, o que flutua pausa
  const pjOnce = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { pjOnce.unobserve(e.target); e.target.classList.add("on"); const go = pjStart.get(e.target); if (go) go(); } }), { threshold: 0.3 });
  const pjLive = new IntersectionObserver(es => es.forEach(e => e.target.classList.toggle("live", e.isIntersecting)));
  pjs.forEach(p => { pjOnce.observe(p); pjLive.observe(p); });

  // o bot em funcionamento: enquanto o telefone está na tela chega um concurso novo de tempos em tempos,
  // a conversa sobe e um deles é favoritado. O botão também responde ao clique, como no Telegram
  const tgFeed = $("#tgFeed"), tgPj = tgFeed.closest(".pj");
  const setFav = (b, on) => { b.classList.toggle("fav", on); b.setAttribute("aria-pressed", on); b.textContent = on ? "💔 Remover dos favoritos" : "⭐ Favoritar"; };
  tgFeed.addEventListener("click", e => { const b = e.target.closest(".tg-fav"); if (b) setFav(b, !b.classList.contains("fav")); });
  let tgI = 1;
  // no cabeçalho, o bot procura editais antes de cada mensagem nova e volta a esperar quando ela chega
  const tgSay = $(".ph-top small span", tgPj), tgOrb = orb($(".ph-top .orb", tgPj), { state: "idle", size: 14 });
  const tgNext = () => {
    if (!tgPj.classList.contains("live") || document.hidden) return;
    tgOrb.set({ state: "searching", size: 14 }, "on"); tgSay.textContent = "procurando editais…";
    setTimeout(tgPost, 1300);
  };
  const tgPost = () => {
    tgOrb.set({ state: "idle", size: 14 }); tgSay.textContent = "bot · alertas a cada 17 min";
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
  // durante o globo as ligações são desenhadas num canvas por baixo dos nomes: dá brilho somado, rastro que
  // afina e cabeça mais clara, coisas que o traço do SVG não faz. O SVG volta quando o grafo se refaz
  const gfx = h("canvas", "g-fx"); gfx.setAttribute("aria-hidden", "true"); graph.insertBefore(gfx, sph);
  let fxK = 1, fxO = [0, 0], lineRmax = 0;
  const sEls = $$("span", sph), sPill = sEls.map(s => s.firstChild), sNum = sEls.map(s => s.lastChild), gSvg = $("svg", graph);
  const NS_ = sEls.length, GA = Math.PI * (3 - Math.sqrt(5));
  // pontos espalhados por igual (espiral de Fibonacci); os trabalhos ficam numa faixa, as ferramentas no resto
  // o contorno, o equador, o núcleo (onde as linhas são sugadas) e o halo da bola de luz
  sph.insertAdjacentHTML("afterbegin", `<b class="s-halo"></b><b class="s-rim"></b><b class="s-eq"></b><b class="s-core"></b>`);
  const sRim = $(".s-rim", sph), sEq = $(".s-eq", sph), sCore = $(".s-core", sph), sHalo = $(".s-halo", sph);
  let sDim = [], sFrom = null, sM = 0, sT = 0, sL = 0, sLT = 0, sAng = 0, sRaf = 0, sLast = 0, sR = 200, sC = [0, 0];
  const sMeasure = () => {
    const g = graph.getBoundingClientRect(), sc = g.width / graph.offsetWidth || 1;
    sR = wide() ? Math.min(graph.offsetWidth * 0.36, graph.offsetHeight * 0.4) : Math.min(graph.offsetWidth * 0.46, graph.offsetHeight * 0.42);
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
    // o canvas cobre a tela presa inteira (os fios saem da área do grafo ao girar) e desenha em pixels de tela
    const pinEl = graph.closest(".tools-pin"), pin = (pinEl || graph).getBoundingClientRect();
    fxK = Math.min(2, devicePixelRatio || 1); fxO = [sv.left - pin.left, sv.top - pin.top];
    gfx.style.left = `${((pin.left - g.left) / sc).toFixed(1)}px`; gfx.style.top = `${((pin.top - g.top) / sc).toFixed(1)}px`;
    gfx.style.width = `${(pin.width / sc).toFixed(1)}px`; gfx.style.height = `${(pin.height / sc).toFixed(1)}px`;
    gfx.width = Math.round(pin.width * fxK); gfx.height = Math.round(pin.height * fxK);
    // destinos: dentro de cada coluna, a ordem de cima para baixo vira a ordem em volta da esfera. O nome do
    // topo dá a volta por cima, o de baixo por baixo, e ninguém cruza o caminho do vizinho (um abraço).
    // Os trabalhos ficam com pontos bem separados; quem tem o caminho mais longo sai antes e todos chegam juntos
    const isW = sBtns.map(b => !!b.dataset.w), nW = isW.filter(Boolean).length;
    const wSlots = Array.from({ length: nW }, (_, j) => Math.round((j + 0.5) * NS_ / nW - 0.5));
    const tSlots = sFib.map((_, q) => q).filter(q => !wSlots.includes(q));
    [[true, wSlots, -1], [false, tSlots, 1]].forEach(([w, slots, sx]) => {
      const ids = sBtns.map((_, i) => i).filter(i => isW[i] === w);
      const ts = slots.map(q => { const p = sProj(sFib[q], 0); return { q, p, phi: Math.atan2(p[1], sx * p[0]), r: Math.hypot(p[0], p[1]) }; }).sort((a, b) => a.phi - b.phi);
      const as = ids.map((i, r) => {
        // o que viaja é o texto (a pílula some antes): o desvio leva o centro do texto, e não o da pílula, ao ponto
        const tb = sEls[i].children[1], off = tb.offsetLeft + tb.offsetWidth / 2 - sEls[i].offsetWidth / 2;
        const x0 = sFrom[i][0] + off, y0 = sFrom[i][1], T = ts[Math.min(r, ts.length - 1)];
        return (sA[i] = { sx, q: T.q, p0: T.p, off, phi0: Math.atan2(y0, sx * x0), r0: Math.hypot(x0, y0), phi1: T.phi, r1: T.r, d: 0 });
      });
      const far = Math.max(0.001, ...as.map(a => Math.abs(a.phi1 - a.phi0)));
      as.forEach(a => { a.d = (1 - Math.abs(a.phi1 - a.phi0) / far) * 0.14; });
    });
  };
  // ponto da esfera na tela: gira em volta do eixo vertical, inclina e ganha perspectiva
  const sFib = sEls.map((_, q) => { const y = 1 - (q + 0.5) / NS_ * 2, r = Math.sqrt(1 - y * y), a = q * GA; return [Math.cos(a) * r, y, Math.sin(a) * r]; });
  const sProj = (d, ang) => {
    const ca = Math.cos(ang), sa = Math.sin(ang), ct = Math.cos(0.32), st = Math.sin(0.32);
    const x = d[0] * ca + d[2] * sa, z = -d[0] * sa + d[2] * ca, y = d[1] * ct - z * st, z2 = d[1] * st + z * ct, k = 1100 / (1100 - z2 * sR);
    return [x * sR * k, y * sR * k, z2, k];
  };
  const sA = [];
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
  const LP = 28;   // pontos por linha
  let lineKey = "", gCoreEl = null;
  const unwrap = arr => { for (let i = 1; i < arr.length; i++) { while (arr[i] - arr[i - 1] > Math.PI) arr[i] -= TAU; while (arr[i] - arr[i - 1] < -Math.PI) arr[i] += TAU; } return arr; };
  const lineSetup = () => {
    const key = `${sC[0].toFixed(1)},${sC[1].toFixed(1)},${sR.toFixed(1)},${gLinks.length}`;
    if (key === lineKey && gLinks[0] && gLinks[0].pr) return; lineKey = key; lineRmax = 0;   // o grafo pode ter sido redesenhado
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
        const gfx = ex * ct - ey * st, fy = ex * st + ey * ct;
        rf.push(Math.hypot(gfx, fy)); af.push(Math.atan2(fy, gfx));
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
  // arredonda para um décimo sem toFixed (que é bem mais lento): são milhares de números por quadro
  const r1 = v => Math.round(v * 10) / 10;
  const smooth = pts => {
    const n = pts.length;
    let d = "M" + r1(pts[0][0]) + " " + r1(pts[0][1]);
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[i > 0 ? i - 1 : 0], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2 < n ? i + 2 : n - 1];
      d += " C" + r1(p1[0] + (p2[0] - p0[0]) / 6) + " " + r1(p1[1] + (p2[1] - p0[1]) / 6) + " " + r1(p2[0] - (p3[0] - p1[0]) / 6) + " " + r1(p2[1] - (p3[1] - p1[1]) / 6) + " " + r1(p2[0]) + " " + r1(p2[1]);
    }
    return d;
  };
  // só escreve no DOM o que mudou: cada escrita de atributo ou estilo custa um recálculo
  const put = (el, k, v) => { const c = el._c || (el._c = {}); if (c[k] !== v) { c[k] = v; if (k[0] === "@") el.setAttribute(k.slice(1), v); else el.style[k] = v; } };
  const sstep = t => t * t * t * (t * (t * 6 - 15) + 10);   // smootherstep: começa e termina sem tranco
  const pullLines = (m, time, dt = 0.016) => {
    // sem medida válida (grafo ainda sem tamanho, um quadro de redesenho), não desenha nada errado
    if (!isFinite(sC[0]) || !isFinite(sC[1]) || !sR) return;
    lineSetup();
    const [cx0, cy0] = sC, ctx = gfx.getContext("2d");
    const rMax = lineRmax || (lineRmax = Math.max(1, ...gLinks.flatMap(L => L.pr)));
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, gfx.width, gfx.height);
    ctx.setTransform(fxK, 0, 0, fxK, fxO[0] * fxK, fxO[1] * fxK);
    ctx.globalCompositeOperation = "screen"; ctx.lineCap = ctx.lineJoin = "round";
    // a luz: creme no núcleo, laranja em volta e transparente longe dele. Conforme o globo se forma, a parte
    // transparente fecha em volta do núcleo e o que ainda está longe se apaga sozinho, sem corte
    const R0 = Math.max(gsvg.viewBox.baseVal.width, 600), f = ss(0.2, 0.75, m);
    const o = [sR * 0.07, sR * 0.16, lerp(0.6 * R0, sR * 0.8, f), lerp(R0, sR * 1.45, f)].map(v => cl(v / R0));
    const s1 = Math.min(0.997, Math.max(o[0] + 0.001, o[1])), s2 = Math.min(0.998, Math.max(s1 + 0.001, o[2])), s3 = Math.min(1, Math.max(s2 + 0.001, o[3]));
    const grad = ctx.createRadialGradient(cx0, cy0, 0, cx0, cy0, R0);
    grad.addColorStop(0, "#fff6ea"); grad.addColorStop(Math.min(0.996, o[0]), "#ffd2a2"); grad.addColorStop(s1, "#ff8a4a");
    grad.addColorStop(s2, "rgba(255, 90, 31, .78)"); grad.addColorStop(s3, "rgba(255, 90, 31, 0)");
    ctx.strokeStyle = grad;
    // a luz puxa como um ralo: o que está mais perto dela começa a cair primeiro e gira mais; o que está longe
    // é arrastado depois. A onda sai do centro para fora, então nenhuma ligação se move em bloco.
    // Cada ponto desce em espiral (a origem gira e encolhe) enquanto a órbita de destino assume o lugar
    gLinks.forEach(L => {
      const pts = L.pts || (L.pts = Array.from({ length: LP }, () => [0, 0])), q = L.orb;
      const go = 0.03 + L.k * 0.1, rot = q.tilt + q.offR, cr = Math.cos(rot), sr = Math.sin(rot);
      let wSum = 0;
      for (let i = 0; i < LP; i++) {
        const rn = L.pr[i] / rMax, w = sstep(cl((m - go - rn * 0.3) / 0.46));
        wSum += w;
        const pa = q.ph + q.arcDir * q.span * (i / (LP - 1)) + (L.ps || 0);
        const ex = Math.cos(pa) * q.rk, ey = Math.sin(pa) * q.rk * q.squash;
        const sw = (1.3 + 1.5 * (1 - rn)) * w, cs = Math.cos(sw), sn = Math.sin(sw), keep = Math.pow(1 - w, 1.7), ox = L.ox[i] - cx0, oy = L.oy[i] - cy0;
        pts[i][0] = cx0 + (ox * cs - oy * sn) * keep + (ex * cr - ey * sr) * w;
        pts[i][1] = cy0 + (ox * sn + oy * cs) * keep + (ex * sr + ey * cr) * w;
      }
      const em = wSum / LP;
      // o anel só começa a girar quando o fio já está chegando nele; de volta ao grafo, zera
      L.ps = (L.ps || 0) + dt * L.spin * ss(0.55, 1, em);
      if (em < 0.01) L.ps = 0;
      // as ligações que estavam apagadas nascem do trabalho enquanto já são puxadas
      const grow = L.on0 ? 1 : sstep(cl((m - L.k * 0.1) / 0.24));
      // em órbita o fio vira um cometa: perde a cauda e fica só o trecho da frente, que corre pelo anel
      const vis = 1 - 0.6 * ss(0.6, 1, em), fwd = q.arcDir > 0;
      const lo = fwd ? 1 - vis : 0, hi = Math.min(fwd ? 1 : vis, grow);
      if (hi <= lo + 0.003 || !isFinite(pts[0][0]) || !isFinite(pts[LP - 1][1])) return;
      const hot = ss(0.3, 0.85, em);
      // três passadas somadas: um halo largo e fraco, o traço, e a cabeça mais clara quando já orbita
      fxTrace(ctx, pts, lo, hi);
      ctx.globalAlpha = 0.07 + 0.06 * hot; ctx.lineWidth = 7; ctx.stroke();
      ctx.globalAlpha = lerp(L.on0 ? 0.95 : 0.7, 0.5, hot); ctx.lineWidth = lerp(L.on0 ? 1.6 : 1.15, 1, hot); ctx.stroke();
      if (hot > 0.02) {
        fxTrace(ctx, pts, fwd ? lerp(lo, hi, 0.55) : lo, fwd ? hi : lerp(lo, hi, 0.45));
        ctx.globalAlpha = 0.6 * hot; ctx.lineWidth = 1.7; ctx.stroke();
      }
    });
    ctx.globalAlpha = 1;
  };
  // um trecho [lo, hi] do fio como curva contínua (os pontos viram controles; a curva passa pelos meios)
  const fxAt = (pts, u) => { const x = u * (LP - 1), i = Math.min(LP - 2, Math.floor(x)), t = x - i; return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * t, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * t]; };
  const fxTrace = (ctx, pts, lo, hi) => {
    const q = [fxAt(pts, lo)];
    for (let i = Math.ceil(lo * (LP - 1) + 1e-6); i <= Math.floor(hi * (LP - 1) - 1e-6); i++) q.push(pts[i]);
    q.push(fxAt(pts, hi));
    ctx.beginPath(); ctx.moveTo(q[0][0], q[0][1]);
    for (let j = 1; j < q.length - 1; j++) ctx.quadraticCurveTo(q[j][0], q[j][1], (q[j][0] + q[j + 1][0]) / 2, (q[j][1] + q[j + 1][1]) / 2);
    ctx.lineTo(q[q.length - 1][0], q[q.length - 1][1]);
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
        gLinks.forEach(({ p }) => { p._c = null; p.style.opacity = p.style.stroke = p.style.strokeWidth = p.style.strokeDasharray = p.style.strokeDashoffset = ""; });
        lineKey = ""; gCoreEl = null; drawGraph();
        // de volta ao grafo: entra o destaque que a rolagem pede agora (o último trabalho, se for o caso)
        focusGraph("w", toolsAt >= 0 ? D.works[toolsAt].id : null);
      }
      return false;
    }
    pullLines(sM, now / 1000, dt);
    // giro: devagar na esfera; na bola de luz cada rolada acelera, até virar um borrão
    // giro: devagar na esfera; rolando mais, a órbita dos nomes acelera (a esfera não cresce nem some)
    sAng += dt * (0.32 * ss(0.5, 0.85, sM) + 3.4 * Math.pow(sL, 1.4));
    const fade = 1;
    // três tempos: os nomes entram numa órbita (o equador da esfera, já girando); a órbita se abre e vira
    // a esfera; e, rolando mais, a esfera gira cada vez mais rápido e se fecha numa bola de luz
    // primeiro a pílula some no lugar (borda e número); depois o texto viaja em arco em volta do centro (raio
    // e ângulo juntos, nunca uma reta pelo meio) até o ponto dele na esfera, que só então começa a girar
    const chrome = 1 - sstep(cl((sM - 0.03) / 0.14));
    for (let i = 0; i < NS_; i++) {
      const A = sA[i]; if (!A) continue;
      const e = soft(cl((sM - 0.14 - A.d) / 0.56));
      const phi = lerp(A.phi0, A.phi1, e), r = lerp(A.r0, A.r1, e), p = sProj(sFib[A.q], sAng);
      const px = A.sx * Math.cos(phi) * r + (p[0] - A.p0[0]) * e - A.off, py = Math.sin(phi) * r + (p[1] - A.p0[1]) * e;
      // profundidade: quem está atrás fica menor, bem mais apagado e por baixo de quem está na frente, para os
      // nomes dos dois lados da esfera não se misturarem (na tela estreita, onde há menos espaço, mais ainda)
      const dz = (p[2] + 1) / 2, back = 1 - Math.pow(dz, 1.5), nar = !wide();
      const sc2 = (1 + (p[3] - 1) * e) * (1 - e * ((nar ? 0.4 : 0.3) * back + (nar ? 0.12 : 0)));
      sEls[i].style.transform = `translate3d(${px.toFixed(1)}px, ${py.toFixed(1)}px, 0) translate(-50%, -50%) scale(${sc2.toFixed(3)})`;
      sEls[i].style.zIndex = e > 0.3 ? String(Math.round(dz * 100)) : "";
      const dim0 = sDim[i] == null ? 1 : sDim[i];
      sEls[i].style.opacity = ((1 - e * (nar ? 0.95 : 0.88) * back) * fade * (dim0 + (1 - dim0) * ss(0, 0.5, Math.max(e, 1 - chrome)))).toFixed(3);
      sPill[i].style.opacity = sNum[i].style.opacity = chrome.toFixed(3);
      sEls[i].classList.toggle("lit", chrome < 0.5);
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
  // parado em órbita (a rolagem não mexe e só os anéis giram devagar), 30 quadros por segundo bastam;
  // enquanto a forma muda, o desenho segue a 60
  let sSkip = false;
  const sLoop = now => {
    sRaf = requestAnimationFrame(sLoop);
    const still = sM === sT && sL === sLT && sM >= 1;
    if (still && (sSkip = !sSkip)) return;
    sDraw(now);
  };
  // com o contato cobrindo a tela inteira, o globo por baixo não aparece: o laço para e volta quando sobe
  let sHide = false;
  const sphereTo = (m, l) => {
    if (m > 0 && !sFrom) sMeasure();
    sT = m; sLT = l;
    if (sHide) { if (sRaf) { cancelAnimationFrame(sRaf); sRaf = 0; } return; }
    if (m > 0 && !sRaf) { sLast = 0; sRaf = requestAnimationFrame(sLoop); }
  };
  let toolsAt = -2, toolsST = null;
  // o roteiro da seção presa, em telas de rolagem: entrada · passeio (0,36 tela por trabalho, para uma rolada
  // normal andar um ou dois e não a lista inteira) · ligações e globo · a órbita acelera · contato por cima
  const T_IN = 0.21, T_WORK = 0.36, T_TOUR = T_WORK * D.works.length, T_GLOBE = 2.66, T_FAST = 1.4;
  const T_ALL = T_IN + T_TOUR + T_GLOBE + 0.14 + T_FAST + 0.12 + 1;
  // escolher um trabalho com o mouse leva a rolagem para o ponto dele: rolar depois continua dali
  function syncWork(attr, val) {
    if (attr !== "w" || !toolsST || !toolsST.isActive) return;
    const k = D.works.findIndex(w => w.id === val), n = D.works.length;
    if (k < 0 || k === toolsAt) return;
    toolsAt = k; jumpTo(toolsST.start + (toolsST.end - toolsST.start) * (T_IN + (k + 0.5) / n * T_TOUR) / T_ALL);
  }
  const toolsTo = p => {
    // primeiro a rolagem passa por cada trabalho, de cima para baixo; depois os nomes viram a esfera
    // as fases estão em telas (T_IN, T_TOUR, T_GLOBE, T_FAST); o último trabalho fica destacado até o globo começar
    const v = p * T_ALL, t = (v - T_IN) / T_TOUR, n = D.works.length;
    const k = t < 0 || !graph.classList.contains("ready") ? -1 : Math.min(n - 1, Math.floor(t * n));
    // durante o globo o destaque não é aplicado (as linhas estão sendo desenhadas por ele); fica guardado
    // e entra quando o grafo se refaz, na volta
    if (k !== toolsAt) { toolsAt = k; if (!sRaf && sM <= 0) focusGraph("w", k < 0 ? null : D.works[k].id); }
    sHide = p > 0.995;
    sphereTo(cl((v - T_IN - T_TOUR) / T_GLOBE), cl((v - T_IN - T_TOUR - T_GLOBE - 0.14) / T_FAST));
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

  // entrada da abertura: o texto e as estações entram por CSS (html.pre → html.go, no index.html e no v5.css).
  // Aqui só a câmera assenta sobre a rede; como ela lê heroP a cada quadro, rolar no meio não quebra nada
  if (root.classList.contains("pre")) {
    const zoom = { m: 1.07 };
    camM = zoom.m; camera(heroP);
    const settle = () => gsap.to(zoom, { m: 1, duration: 2.4, ease: "expo.out", onUpdate: () => { camM = zoom.m; camera(heroP); } });
    if (root.classList.contains("go")) settle(); else document.addEventListener("hero:go", settle, { once: true });
  }

  // 00: a câmera desce até o Centro enquanto a abertura fica grudada; o texto sai antes
  ScrollTrigger.create({ trigger: ".hero", start: "top top", end: "bottom bottom", onUpdate: s => { heroP = s.progress; if (heroP > 0.5) heroArm = true; camera(heroP); } });
  gsap.to(".hero-copy", { yPercent: -18, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "42% top", scrub: true } });
  // as duas linhas do nome saem em velocidades diferentes, abrindo como um leque
  [-4, 6].forEach((x, i) => gsap.to(`.hero-name .ln:nth-child(${i + 1})`, { xPercent: x, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "42% top", scrub: true } }));

  // 02 + 03: a viagem inteira é um número só
  tripST = ScrollTrigger.create({ trigger: tripRun, start: "top top", end: "bottom bottom", onUpdate: s => tripTo(s.progress) });
  // 08: o grafo fica grudado; a rolagem passeia pelos trabalhos e termina na esfera
  graphFit(); addEventListener("resize", () => { graphFit(); sFrom = null; if (sM > 0) sMeasure(); });
  document.fonts && document.fonts.ready.then(graphFit);
  // preso de verdade (fixed) por T_ALL telas: a última delas é o contato subindo por cima do globo
  toolsST = ScrollTrigger.create({ trigger: ".tools-pin", start: "top top", end: () => `+=${Math.round(T_ALL * 100)}%`, pin: true, pinSpacing: true, anticipatePin: 1, onUpdate: s => toolsTo(s.progress) });

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
