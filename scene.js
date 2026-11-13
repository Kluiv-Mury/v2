/* A viagem do dado em WebGL. Carregado sob demanda pelo v5.js, só quando a seção chega perto.
   65 estações × 36 snapshots = 2.340 pontos que mudam de formação a cada etapa:
   feed → coleta → banco → camada → mapa, e no fim as seis camadas do Gêmeo se separam.
   Todo o movimento é calculado no vertex shader; por quadro o JavaScript só troca uniforms. */
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.min.js";

const CREAM = 0xefeae1, ORANGE = 0xff5a1f, LIME = 0xe6ff57, INK = 0x0e0d0b;

export function createTrip({ canvas, stations, term, geo, layers, mapSrc, tagEls, onFocus }) {
  const N = stations.length, S = 36, COUNT = N * S;
  // mundo: o mapa (2000 × 1225) dividido por 100, centrado na rede de estações
  const CX = 596, CY = 548, U = 100;
  const wx = x => (x - CX) / U, wz = y => (y - CY) / U;
  const CROP = { x: 230, y: 200, s: 460 };
  const inCrop = (x, y) => x > CROP.x + 8 && x < CROP.x + CROP.s - 8 && y > CROP.y + 8 && y < CROP.y + CROP.s - 8;
  const crop = { x0: wx(CROP.x), x1: wx(CROP.x + CROP.s), z0: wz(CROP.y), z1: wz(CROP.y + CROP.s), s: CROP.s / U };
  crop.cx = (crop.x0 + crop.x1) / 2; crop.cz = (crop.z0 + crop.z1) / 2;
  const GAP = 0.7, LN = layers.length;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setClearColor(INK, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 120);
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2); sun.position.set(4, 8, 3); scene.add(sun);

  /* ---------- os pontos ---------- */
  const g = new THREE.BufferGeometry();
  const aSt = new Float32Array(COUNT), aSnap = new Float32Array(COUNT), aRand = new Float32Array(COUNT), aFill = new Float32Array(COUNT), aIn = new Float32Array(COUNT), aMe = new Float32Array(COUNT), aGeo = new Float32Array(COUNT * 2);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  stations.forEach((s, i) => {
    for (let k = 0; k < S; k++) {
      const j = i * S + k;
      aSt[j] = i; aSnap[j] = k; aRand[j] = rnd(); aFill[j] = 0.5;
      aIn[j] = inCrop(s.x, s.y) ? 1 : 0; aMe[j] = s.n === term.n ? 1 : 0;
      aGeo[j * 2] = wx(s.x); aGeo[j * 2 + 1] = wz(s.y);
    }
  });
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
  g.setAttribute("aSt", new THREE.BufferAttribute(aSt, 1));
  g.setAttribute("aSnap", new THREE.BufferAttribute(aSnap, 1));
  g.setAttribute("aRand", new THREE.BufferAttribute(aRand, 1));
  g.setAttribute("aFill", new THREE.BufferAttribute(aFill, 1));
  g.setAttribute("aIn", new THREE.BufferAttribute(aIn, 1));
  g.setAttribute("aMe", new THREE.BufferAttribute(aMe, 1));
  g.setAttribute("aGeo", new THREE.BufferAttribute(aGeo, 2));
  const uni = { uS: { value: 0 }, uTime: { value: 0 }, uExplode: { value: 0 }, uLift: { value: 0 }, uPx: { value: 60 }, uDim: { value: 1 }, uRise: { value: 0 } };
  const dots = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uS, uTime, uExplode, uLift, uPx, uDim, uRise;
      attribute float aSt, aSnap, aRand, aFill, aIn, aMe;
      attribute vec2 aGeo;
      varying vec3 vCol; varying float vA;
      const float PI2 = 6.2831853;
      const vec3 CREAM = vec3(.937, .918, .882), ORANGE = vec3(1., .353, .122), LIME = vec3(.902, 1., .341), DIM = vec3(.5, .47, .42);
      void main() {
        // cada ponto sai um pouco depois do outro: a troca de formação vira uma onda, não um corte
        float b = floor(uS), f = fract(uS), d = aRand * .4;
        float s = b + smoothstep(d, d + .6, f);
        float w0 = max(0., 1. - abs(s)), w1 = max(0., 1. - abs(s - 1.)), w2 = max(0., 1. - abs(s - 2.)), w3 = max(0., 1. - abs(s - 3.)), w4 = max(0., 1. - abs(s - 4.));

        // 0 · feed: 65 filas de números correndo
        float t = fract(aSnap / 36. + uTime * .04 + aSt * .377);
        vec3 p0 = vec3((t - .5) * 18., sin(t * 9. + aSt) * .14, (aSt - 32.) * .125);
        // 1 · coleta: o laço do fluxo, girando
        float th = (aSnap + aSt / 65.) / 36. * PI2 + uTime * .22, ph = aSt / 65. * PI2 + uTime * .5;
        float R = 3.1 + .8 * cos(ph);
        vec3 p1 = vec3(R * cos(th), .8 * sin(ph), R * sin(th));
        // 2 · banco: 36 snapshots em fila, cada um com as 65 estações
        vec3 p2 = vec3((mod(aSt, 13.) - 6.) * .36, (2. - floor(aSt / 13.)) * .36 + .2, (aSnap - 17.5) * .25);
        // 3 · camada: tudo cai na coordenada da estação
        vec3 p3 = vec3(aGeo.x, .03 + aRand * .05, aGeo.y);
        // 4 · mapa: a coluna de cada estação sobe conforme as bikes paradas
        vec3 p4 = vec3(aGeo.x, .04 + (aSnap / 36.) * (.22 + aFill * 1.9), aGeo.y);

        vec3 p = p0 * w0 + p1 * w1 + p2 * w2 + p3 * w3 + p4 * w4;
        float fl = fract(s);
        p.y += sin(fl * 3.14159) * (aRand - .3) * 1.6;
        // 5 · camadas: enquanto a câmera gira, as colunas sobem e somem (uRise); quando as lâminas se separam,
        // os pontos descem do alto e viram um anel em cada estação da lâmina de cima, aceso nas bikes paradas
        float ring = smoothstep(.15, .85, uExplode), an = aSnap / 36. * PI2 - 1.5708;
        float on = step(aSnap / 36., aFill - .001);
        float lift = uRise * (1.6 + aRand * 1.4);
        vec3 pc = p + vec3(0., lift + uLift, 0.);
        vec3 pr = vec3(aGeo.x + cos(an) * .095, .03 + uLift, aGeo.y + sin(an) * .095);
        p = mix(pc, pr, ring);

        float old = step(aSnap, 2.5), fresh = step(32.5, aSnap);
        vec3 c0 = mix(CREAM, ORANGE, step(.86, aRand));
        vec3 c1 = mix(ORANGE, CREAM, step(.6, aRand));
        vec3 c2 = mix(mix(ORANGE, CREAM, fresh), DIM, old);
        vec3 c34 = mix(ORANGE, LIME, aMe);
        vCol = c0 * w0 + c1 * w1 + c2 * w2 + c34 * (w3 + w4);
        float a2 = mix(.95, .28, old);
        vA = (.55 + .3 * aRand) * w0 + .8 * w1 + a2 * w2 + .7 * w3 + mix(.5, .95, aSnap / 36.) * w4;
        vCol = mix(vCol, mix(DIM * .7, LIME, on), ring);
        vA = mix(vA * (1. - smoothstep(.1, .95, uRise)), mix(.4, 1., on) * aIn * uDim, ring);

        float size = mix(.85 * w0 + .95 * w1 + 1.15 * w2 + 1.5 * w3 + (1.05 + aMe * .5) * w4, 1.25, ring);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1.5, size * uPx / -mv.z);
      }`,
    fragmentShader: `
      varying vec3 vCol; varying float vA;
      void main() {
        float d = length(gl_PointCoord - .5);
        float a = smoothstep(.5, .12, d);
        gl_FragColor = vec4(vCol, a * vA);
      }`,
  }));
  dots.frustumCulled = false; dots.renderOrder = 100;   // por cima das lâminas
  scene.add(dots);

  /* ---------- o banco: a moldura de cada snapshot e a janela de 5 min ---------- */
  // as 36 fotografias da rede viram fichas empilhadas: cada uma com sua moldura fina; as 30 da janela
  // ficam dentro de uma caixa laranja; as já apagadas e as últimas 30 s ficam de fora
  const BX = 6 * 0.36 + 0.2, BT = 2 * 0.36 + 0.2 + 0.2, BB = -2 * 0.36 + 0.2 - 0.2, zOf = k => (k - 17.5) * 0.25;
  const fp = [], fc = [], cOld = new THREE.Color(0x5b564e), cWin = new THREE.Color(0xff7a3d), cNew = new THREE.Color(CREAM);
  for (let k = 0; k < S; k++) {
    const z = zOf(k), c = k <= 2 ? cOld : k >= 33 ? cNew : cWin, a = k <= 2 || k >= 33 ? 0.9 : 0.16;
    const P = [[-BX, BB], [BX, BB], [BX, BT], [-BX, BT]];
    for (let j = 0; j < 4; j++) { const [x0, y0] = P[j], [x1, y1] = P[(j + 1) % 4]; fp.push(x0, y0, z, x1, y1, z); for (let m = 0; m < 2; m++) fc.push(c.r * a, c.g * a, c.b * a); }
  }
  const fGeo = new THREE.BufferGeometry(); fGeo.setAttribute("position", new THREE.Float32BufferAttribute(fp, 3)); fGeo.setAttribute("color", new THREE.Float32BufferAttribute(fc, 3));
  const fMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });
  const frames = new THREE.LineSegments(fGeo, fMat); frames.renderOrder = 90; frames.frustumCulled = false; scene.add(frames);
  // a caixa da janela: as doze arestas do snapshot 3 ao 32, um pouco maior que as fichas
  const W0 = zOf(2.5), W1 = zOf(32.5), bx = BX + 0.08, bt = BT + 0.08, bb = BB - 0.08;
  const cb = [[-bx, bb], [bx, bb], [bx, bt], [-bx, bt]], wp = [];
  for (let j = 0; j < 4; j++) { const [x0, y0] = cb[j], [x1, y1] = cb[(j + 1) % 4]; wp.push(x0, y0, W0, x1, y1, W0, x0, y0, W1, x1, y1, W1, x0, y0, W0, x0, y0, W1); }
  const wGeo = new THREE.BufferGeometry(); wGeo.setAttribute("position", new THREE.Float32BufferAttribute(wp, 3));
  const wMat = new THREE.LineBasicMaterial({ color: ORANGE, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const winBox = new THREE.LineSegments(wGeo, wMat); winBox.renderOrder = 91; winBox.frustumCulled = false; scene.add(winBox);
  // o vidro da janela: um volume laranja bem leve, só para dar corpo à caixa
  const gGeo = new THREE.BoxGeometry(bx * 2, bt - bb, W1 - W0); gGeo.translate(0, (bt + bb) / 2, (W0 + W1) / 2);
  const gMat = new THREE.MeshBasicMaterial({ color: ORANGE, transparent: true, opacity: 0, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
  const winGlass = new THREE.Mesh(gGeo, gMat); winGlass.renderOrder = 89; scene.add(winGlass);

  /* ---------- o mapa e a grade ---------- */
  const mapMat = new THREE.MeshBasicMaterial({ color: CREAM, transparent: true, opacity: 0, depthWrite: false });
  const mapGeo = new THREE.PlaneGeometry(20, 12.25); mapGeo.rotateX(-Math.PI / 2);
  const map = new THREE.Mesh(mapGeo, mapMat);
  map.position.set(wx(1000), 0, wz(612.5)); map.visible = false; scene.add(map);
  const useMap = tex => {
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.colorSpace = THREE.SRGBColorSpace;
    mapMat.map = tex; mapMat.needsUpdate = true; map.visible = true;
    if (!cropTex) mapMats.forEach(m => { m.map = tex; m.needsUpdate = true; });
    renderer.initTexture(tex); warm();
  };
  // as lâminas mostram só o recorte do Centro e de Icaraí: ele ganha uma textura própria, desenhada do SVG
  // só naquela janela (2048 px para 460 do mapa, quatro vezes mais nítida que o recorte da textura inteira)
  let cropTex = null;
  const buildCrop = () => fetch(mapSrc).then(r => r.text()).then(t => {
    const svgTxt = t.replace(/viewBox="[^"]*"/, `viewBox="${CROP.x} ${CROP.y} ${CROP.s} ${CROP.s}" width="2048" height="2048"`)
      .replace(/stroke-width="([0-9.]+)"/g, (_, w) => `stroke-width="${(+w * 0.42).toFixed(2)}"`);
    const url = URL.createObjectURL(new Blob([svgTxt], { type: "image/svg+xml" }));
    const im = new Image();
    im.onload = () => (window.requestIdleCallback || setTimeout)(() => {
      try {
        const c = document.createElement("canvas"); c.width = c.height = 2048;
        const x = c.getContext("2d"); x.drawImage(im, 0, 0, 2048, 2048);
        x.globalCompositeOperation = "source-in"; x.fillStyle = "#fff"; x.fillRect(0, 0, 2048, 2048);
        cropTex = new THREE.CanvasTexture(c);
        cropTex.anisotropy = renderer.capabilities.getMaxAnisotropy(); cropTex.colorSpace = THREE.SRGBColorSpace;
        mapPlates.forEach(m => { m.geometry = plateGeo; });
        mapMats.forEach(m => { m.map = cropTex; m.needsUpdate = true; });
        renderer.initTexture(cropTex); warm();
      } catch (e) { /* fica a textura do mapa inteiro */ }
      URL.revokeObjectURL(url);
    });
    im.src = url;
  }).catch(() => {});
  // o SVG é rasterizado num momento ocioso (a cena inteira já é montada fora da rolagem)
  const img = new Image();
  img.onload = () => (window.requestIdleCallback || setTimeout)(() => {
    try {
      const c = document.createElement("canvas"); c.width = 2048; c.height = 1254;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0, c.width, c.height);
      x.globalCompositeOperation = "source-in"; x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
      useMap(new THREE.CanvasTexture(c));
    } catch (e) { /* sem o mapa, os pontos seguem sozinhos */ }
  });
  img.src = mapSrc;
  buildCrop();

  const gridPts = [];
  for (let i = -12; i <= 12; i++) { gridPts.push(i * 0.5, 0, -6, i * 0.5, 0, 6, -6, 0, i * 0.5, 6, 0, i * 0.5); }
  const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: CREAM, transparent: true, opacity: 0, depthWrite: false });
  const grid = new THREE.LineSegments(gridGeo, gridMat); grid.position.set(-0.4, -0.01, 0); scene.add(grid);

  /* ---------- as seis camadas ---------- */
  // cada lâmina é o recorte do Centro e de Icaraí com o mapa bem apagado; por cima, o desenho da camada.
  // Tudo é montado uma vez; na rolagem só mudam posição, opacidade e o relógio dos shaders
  const BLUE = 0x6fb4ff, TEAL = 0x5fd8c6, BLD = 0x8d877c;
  const markMat = (color, size, shape) => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uColor: { value: new THREE.Color(color) }, uSize: { value: size }, uShape: { value: shape }, uO: { value: 0 }, uPx: uni.uPx },
    vertexShader: `uniform float uSize, uPx; void main() { vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(2., uSize * uPx / -mv.z); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uShape, uO;
      void main() {
        vec2 q = gl_PointCoord - .5; float d = length(q), a;
        if (uShape < .5) a = smoothstep(.5, .4, d);
        else if (uShape < 1.5) a = max(smoothstep(.5, .44, d) * smoothstep(.3, .36, d), smoothstep(.16, .1, d));
        else if (uShape < 2.5) a = step(max(abs(q.x), abs(q.y)), .34);
        else a = step(abs(q.x) * 1.9, q.y + .42) * step(q.y, .4);
        if (a < .02) discard;
        gl_FragColor = vec4(pow(uColor, vec3(1. / 2.2)), a * uO);
      }`,
  });
  const ptsOf = list => { const a = []; list.forEach(([x, y]) => { if (inCrop(x, y)) a.push(wx(x), 0.02, wz(y)); }); const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(a, 3)); return bg; };
  const stack = new THREE.Group(); scene.add(stack); stack.visible = false;
  const mapMats = [], mapPlates = [];
  let wazeMat = null, wazePts = null;
  const fades = [];   // [material, opacidade cheia, é uniform?, camada]
  const groups = [], plates = [], auras = [], edges = [];
  // a cor de cada camada no destaque: prédios, chuva, câmeras, ônibus, trânsito, NitBike
  const ACC = [0xd8c7a6, 0x6fb4ff, 0xf0c98e, 0x5fd8c6, 0xff6a2a, 0xe6ff57];
  const plateGeo = new THREE.PlaneGeometry(crop.s, crop.s); plateGeo.rotateX(-Math.PI / 2);
  const edge = new THREE.BufferGeometry();
  edge.setAttribute("position", new THREE.Float32BufferAttribute([crop.x0, 0, crop.z0, crop.x1, 0, crop.z0, crop.x1, 0, crop.z1, crop.x0, 0, crop.z1], 3));
  const slab = new THREE.BufferGeometry(), TH = 0.05;
  slab.setAttribute("position", new THREE.Float32BufferAttribute([
    crop.x0, 0, crop.z0, crop.x0, -TH, crop.z0, crop.x1, 0, crop.z0, crop.x1, -TH, crop.z0, crop.x1, 0, crop.z1, crop.x1, -TH, crop.z1, crop.x0, 0, crop.z1, crop.x0, -TH, crop.z1,
    crop.x0, -TH, crop.z0, crop.x1, -TH, crop.z0, crop.x1, -TH, crop.z0, crop.x1, -TH, crop.z1, crop.x1, -TH, crop.z1, crop.x0, -TH, crop.z1, crop.x0, -TH, crop.z1, crop.x0, -TH, crop.z0], 3));
  // o mesmo recorte do mapa em todas as lâminas (uma geometria, um material)
  const cg = new THREE.PlaneGeometry(crop.s, crop.s); cg.rotateX(-Math.PI / 2);
  { const uv = cg.attributes.uv, u0 = CROP.x / 2000, u1 = (CROP.x + CROP.s) / 2000, v1 = 1 - CROP.y / 1225, v0 = 1 - (CROP.y + CROP.s) / 1225;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0)); }
  const inCropW = (x, z) => x > crop.x0 + 0.05 && x < crop.x1 - 0.05 && z > crop.z0 + 0.05 && z < crop.z1 - 0.05;
  const uTime = uni.uTime;
  let jamGroup = null, jamMat = [], bld = null, busTick = null, camTick = null;

  layers.forEach((l, i) => {
    const gr = new THREE.Group();
    const pm = new THREE.MeshBasicMaterial({ color: l.mine ? 0x1e120b : 0x13120f, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true });
    const plate = new THREE.Mesh(plateGeo, pm); plate.position.set(crop.cx, 0, crop.cz); plate.renderOrder = i * 3; plate.userData.k = i;
    const mm = new THREE.MeshBasicMaterial({ color: CREAM, map: null, transparent: true, opacity: 0, depthWrite: false });
    const mapPlate = new THREE.Mesh(cg, mm); mapPlate.position.set(crop.cx, 0.004, crop.cz); mapPlate.renderOrder = i * 3 + 1;
    mapMats.push(mm); mapPlates.push(mapPlate);
    const em = new THREE.LineBasicMaterial({ color: l.mine ? ORANGE : 0xc9a96b, transparent: true, opacity: 0, depthWrite: false });
    const loop = new THREE.LineLoop(edge, em); loop.renderOrder = i * 3 + 2;
    const side = new THREE.LineSegments(slab, em); side.renderOrder = i * 3 + 2;
    fades.push([pm, 0.86, false, i], [mm, l.mine ? 0.2 : 0.14, false, i], [em, l.mine ? 1 : 0.55, false, i]);
    gr.add(plate, mapPlate, loop, side); plates.push(plate);
    // o destaque: um halo na cor da camada em volta da lâmina, a borda acesa e uma faixa de luz que a atravessa
    const ac = new THREE.Color(ACC[i] ?? CREAM);
    const am = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uC: { value: ac }, uO: { value: 0 }, uTime, uH: { value: crop.s / 2 } },
      vertexShader: `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform vec3 uC; uniform float uO, uTime, uH; varying vec2 vP;
        void main() {
          vec2 q = abs(vP) - uH; float out_ = length(max(q, 0.)), in_ = min(max(q.x, q.y), 0.);
          float halo = exp(-out_ * 16.) * step(0., max(q.x, q.y)) * .3;
          float rim = exp(-abs(max(q.x, q.y)) * 110.) * .85 + exp(in_ * 14.) * .04 * step(max(q.x, q.y), 0.);
          float t = fract(uTime * .11), bx = (vP.x + vP.y) / (4. * uH) + .5 - t * 1.4 + .2, band = exp(-bx * bx * 3000.) * step(max(q.x, q.y), 0.) * .2;
          gl_FragColor = vec4(pow(uC, vec3(1. / 2.2)), (halo + rim + band) * uO);
        }` });
    const ag = new THREE.PlaneGeometry(crop.s * 1.5, crop.s * 1.5); ag.rotateX(-Math.PI / 2);
    const aura = new THREE.Mesh(ag, am); aura.position.set(crop.cx, 0.003, crop.cz); aura.renderOrder = i * 3 + 1; aura.frustumCulled = false;
    gr.add(aura); auras.push(am); edges.push([em, em.color.clone(), ac]);
    // instâncias e tubos ficam fora da tela do ponto de vista do three (a esfera de corte é a da peça na origem)
    const add = (o, mat, full, u) => { o.renderOrder = i * 3 + 2; o.frustumCulled = false; gr.add(o); fades.push([mat, full, u, i]); return o; };

    if (i === 0) {
      // edificações: os prédios do OSM no recorte, cada um como uma caixa orientada pelo contorno.
      // Altura em metros, exagerada 4 vezes para ler de longe
      const bm = new THREE.MeshLambertMaterial({ color: BLD, emissive: 0x23211c, transparent: true, opacity: 0 });
      const box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
      fetch("edificios.json").then(r => r.json()).then(({ b }) => {
        const n = b.length / 6, im = new THREE.InstancedMesh(box, bm, n), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), sc = new THREE.Vector3(), ps = new THREE.Vector3();
        for (let k = 0; k < n; k++) {
          const [x, y, w, d, a, h] = b.slice(k * 6, k * 6 + 6);
          q.setFromAxisAngle(up, -a); sc.set(w / U, h / 1165 * 4, d / U); ps.set(wx(x), 0.006, wz(y));
          m4.compose(ps, q, sc); im.setMatrixAt(k, m4);
        }
        im.instanceMatrix.needsUpdate = true;
        add(im, bm, 1); bld = im; warm();
      }).catch(() => {});
    } else if (i === 1) {
      // pluviômetros nas posições públicas: um tubo de vidro com água dentro e ondas no chão em volta.
      // A chuva cai sobre a lâmina inteira. Nível da água, gotas e ondas são ilustrativos
      const pts = geo.gauges.map(([x, y]) => [wx(x), wz(y)]).filter(([x, z]) => inCropW(x, z)), n = Math.max(1, pts.length);
      let sd = 5; const r2 = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      const hs = pts.map(() => 0.16 + r2() * 0.18), lv = pts.map(() => 0.3 + r2() * 0.5);
      const m4 = new THREE.Matrix4();
      const cm = new THREE.MeshBasicMaterial({ color: 0x9cc9ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true });
      const cyl = new THREE.CylinderGeometry(0.032, 0.032, 1, 24, 1, true); cyl.translate(0, 0.5, 0);
      const tube = new THREE.InstancedMesh(cyl, cm, n);
      pts.forEach(([x, z], k) => { m4.makeScale(1, hs[k], 1); m4.setPosition(x, 0.004, z); tube.setMatrixAt(k, m4); });
      add(tube, cm, 0.22);
      const wm = new THREE.MeshLambertMaterial({ color: 0x3f8fec, emissive: 0x1c4f9a, transparent: true, opacity: 0 });
      const wcy = new THREE.CylinderGeometry(0.027, 0.027, 1, 24, 1, false); wcy.translate(0, 0.5, 0);
      const water = new THREE.InstancedMesh(wcy, wm, n);
      pts.forEach(([x, z], k) => { m4.makeScale(1, hs[k] * lv[k], 1); m4.setPosition(x, 0.005, z); water.setMatrixAt(k, m4); });
      add(water, wm, 0.85);
      // ondas: três anéis por pluviômetro, cada um num ponto do ciclo, abrindo e apagando no chão
      const rp = new THREE.PlaneGeometry(0.34, 0.34); rp.rotateX(-Math.PI / 2);
      const rip = new THREE.InstancedMesh(rp, null, n * 3), ph = new Float32Array(n * 3);
      pts.forEach(([x, z], k) => { for (let j = 0; j < 3; j++) { m4.makeTranslation(x, 0.006, z); rip.setMatrixAt(k * 3 + j, m4); ph[k * 3 + j] = j / 3 + r2() * 0.1; } });
      rp.setAttribute("aPh", new THREE.InstancedBufferAttribute(ph, 1));
      const ripM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime, uO: { value: 0 } },
        vertexShader: `attribute float aPh; varying vec2 vU; varying float vP; uniform float uTime;
          void main() { vU = uv; vP = fract(aPh + uTime * .32); gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }`,
        fragmentShader: `uniform float uO; varying vec2 vU; varying float vP;
          void main() { float r = length(vU - .5) * 2., w = .035 + vP * .03, x = (r - .12 - vP * .85) / w; float a = exp(-x * x) * (1. - vP) * (1. - vP);
            if (a < .01) discard; gl_FragColor = vec4(.55, .78, 1., a * uO); }` });
      rip.material = ripM; add(rip, ripM, 0.9, true);
      // a chuva: traços finos caindo sobre o recorte inteiro, mais densos perto dos pluviômetros
      const RN = 900, rpz = new Float32Array(RN * 6), rr = new Float32Array(RN * 2), re = new Float32Array(RN * 2);
      for (let k = 0; k < RN; k++) {
        let x, z;
        if (pts.length && r2() < 0.35) { const [gx, gz] = pts[k % pts.length], a = r2() * 6.283, d = Math.sqrt(r2()) * 0.4; x = gx + Math.cos(a) * d; z = gz + Math.sin(a) * d; }
        else { x = crop.x0 + 0.06 + r2() * (crop.s - 0.12); z = crop.z0 + 0.06 + r2() * (crop.s - 0.12); }
        x = Math.min(crop.x1 - 0.04, Math.max(crop.x0 + 0.04, x)); z = Math.min(crop.z1 - 0.04, Math.max(crop.z0 + 0.04, z));
        const v = r2();
        rpz.set([x, 0, z, x + 0.012, 0, z + 0.004], k * 6); rr[k * 2] = rr[k * 2 + 1] = v; re[k * 2] = 0; re[k * 2 + 1] = 1;
      }
      const rg = new THREE.BufferGeometry(); rg.setAttribute("position", new THREE.BufferAttribute(rpz, 3)); rg.setAttribute("aR", new THREE.BufferAttribute(rr, 1)); rg.setAttribute("aE", new THREE.BufferAttribute(re, 1));
      const rainM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime, uO: { value: 0 } },
        vertexShader: `uniform float uTime; attribute float aR, aE; varying float vA;
          void main() { float f = fract(aR * 7.31 + uTime * (.75 + aR * .45)); vec3 p = position;
            p.y = (1. - f) * .6 + aE * .05; p.x -= aE * .012 + (1. - f) * .02; vA = smoothstep(0., .08, f) * smoothstep(1., .85, f) * mix(.9, .25, aE);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.); }`,
        fragmentShader: `uniform float uO; varying float vA; void main() { gl_FragColor = vec4(.62, .8, 1., vA * uO); }` });
      const rain = new THREE.LineSegments(rg, rainM); add(rain, rainM, 0.55, true);
    } else if (i === 2) {
      // câmeras nas posições públicas: um poste, a cabeça e, no chão, o leque do que ela enxerga,
      // varrendo devagar para um lado e para o outro (o ângulo e o giro são ilustrativos)
      const pts = geo.cams.map(([x, y]) => [wx(x), wz(y)]).filter(([x, z]) => inCropW(x, z)), n = Math.max(1, pts.length);
      const POLE = 0.085;
      const pole = new THREE.BufferGeometry(); pole.setAttribute("position", new THREE.Float32BufferAttribute(pts.flatMap(([x, z]) => [x, 0.004, z, x, POLE, z]), 3));
      const plm = new THREE.LineBasicMaterial({ color: CREAM, transparent: true, opacity: 0, depthWrite: false });
      add(new THREE.LineSegments(pole, plm), plm, 0.5);
      const head = new THREE.BufferGeometry(); head.setAttribute("position", new THREE.Float32BufferAttribute(pts.flatMap(([x, z]) => [x, POLE, z]), 3));
      const hm = markMat(0xfff3e0, 1.25, 2); add(new THREE.Points(head, hm), hm, 1, true);
      // a luz de gravação: um ponto laranja que pisca devagar, cada câmera no seu tempo
      const rec = new THREE.BufferGeometry(); rec.setAttribute("position", new THREE.Float32BufferAttribute(pts.flatMap(([x, z]) => [x, POLE + 0.03, z]), 3));
      rec.setAttribute("aR", new THREE.Float32BufferAttribute(pts.map((_, k) => (k * 0.618) % 1), 1));
      const recM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime, uO: { value: 0 }, uPx: uni.uPx },
        vertexShader: `uniform float uTime, uPx; attribute float aR; varying float vB;
          void main() { vB = pow(.5 + .5 * sin((uTime * .9 + aR) * 6.283), 3.); vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(2., .9 * uPx / -mv.z); }`,
        fragmentShader: `uniform float uO; varying float vB; void main() { float d = length(gl_PointCoord - .5); if (d > .5) discard;
          gl_FragColor = vec4(1., .42, .2, smoothstep(.5, .1, d) * vB * uO); }` });
      add(new THREE.Points(rec, recM), recM, 1, true);
      // o leque: um setor de 52° no chão, aceso perto da câmera e sumindo no alcance, com as bordas marcadas
      const R = 0.44, fan = new THREE.CircleGeometry(R, 24, -0.45, 0.9); fan.rotateX(-Math.PI / 2);
      const fanM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true,
        uniforms: { uTime, uO: { value: 0 } },
        vertexShader: `varying vec2 vP; void main() { vP = position.xz; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.); }`,
        fragmentShader: `uniform float uO, uTime; varying vec2 vP;
          void main() { float r = length(vP) / ${R.toFixed(2)}, a = abs(atan(vP.y, vP.x)) / .45;
            float body = (1. - r) * (1. - r) * .42 + .05, rim = smoothstep(.06, 0., abs(a - 1.)) * (1. - r) * .9;
            float sx = (r - fract(uTime * .45)) / .05, scan = exp(-sx * sx) * (1. - r) * .5;
            gl_FragColor = vec4(1., .88, .7, (body + rim + scan) * smoothstep(1., .9, r) * uO); }` });
      const fans = new THREE.InstancedMesh(fan, fanM, n); add(fans, fanM, 0.75, true);
      const base = pts.map((_, k) => (k * 2.399) % 6.283), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), upv = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3();
      camTick = time => {
        pts.forEach(([x, z], k) => { q.setFromAxisAngle(upv, base[k] + Math.sin(time * 0.32 + k * 1.7) * 0.6); ps.set(x, 0.006, z); m4.compose(ps, q, one); fans.setMatrixAt(k, m4); });
        fans.instanceMatrix.needsUpdate = true;
      };
      camTick(0);
    } else if (i === 3) {
      // ônibus: o traçado real das rotas, fino, e alguns ônibus 3D (ilustrativos) indo e voltando por ele
      const lm = new THREE.LineBasicMaterial({ color: TEAL, transparent: true, opacity: 0, depthWrite: false });
      const bodyM = new THREE.MeshLambertMaterial({ color: 0x7fe3d2, emissive: 0x123f38, transparent: true, opacity: 0 });
      const glassM = new THREE.MeshLambertMaterial({ color: 0x0f1c1a, emissive: 0x0a1412, transparent: true, opacity: 0 });
      const curves = [];
      geo.routes.forEach(r => {
        const seg = []; r.p.forEach(([x, y]) => { if (inCrop(x, y)) seg.push(new THREE.Vector3(wx(x), 0.012, wz(y))); });
        if (seg.length < 2) return;
        const curve = new THREE.CatmullRomCurve3(seg, false, "centripetal", 0.2);
        const len = curve.getLength(); if (len < 0.3) return;
        curves.push({ curve, len });
        const pts = curve.getSpacedPoints(Math.min(400, Math.ceil(len * 60)));
        add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm), lm, 0.55);
      });
      // até 16 ônibus: dois por rota, em sentidos e pontos de partida diferentes
      const fleet = [];
      curves.forEach((c, k) => { for (let j = 0; j < 2 && fleet.length < 16; j++) fleet.push({ ...c, off: (k * 0.37 + j * 0.5) % 1, v: 0.09 / c.len * (0.8 + ((k + j) % 3) * 0.15) }); });
      if (fleet.length) {
        const body = new THREE.BoxGeometry(0.13, 0.042, 0.048); body.translate(0, 0.021 + 0.012, 0);
        const glass = new THREE.BoxGeometry(0.118, 0.013, 0.0496); glass.translate(0, 0.03 + 0.012, 0);
        const bi = add(new THREE.InstancedMesh(body, bodyM, fleet.length), bodyM, 1);
        const gi = add(new THREE.InstancedMesh(glass, glassM, fleet.length), glassM, 1);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), upv = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3(), tg = new THREE.Vector3();
        // cada rota vira uma tabela de pontos igualmente espaçados: por quadro só se interpola nela
        // (percorrer a curva pelo comprimento a cada quadro custava caro)
        const LUT = new Map();
        fleet.forEach(b => { if (!LUT.has(b.curve)) LUT.set(b.curve, b.curve.getSpacedPoints(Math.max(60, Math.ceil(b.len * 80)))); });
        busTick = time => {
          fleet.forEach((b, k) => {
            const w = (b.off + time * b.v) % 2, u = w < 1 ? w : 2 - w;     // vai e volta pela rota
            const P = LUT.get(b.curve), f = Math.min(0.999, Math.max(0.001, u)) * (P.length - 1), i = Math.floor(f), t = f - i, A = P[i], B = P[Math.min(P.length - 1, i + 1)];
            p.set(A.x + (B.x - A.x) * t, A.y + (B.y - A.y) * t, A.z + (B.z - A.z) * t); tg.set(B.x - A.x, 0, B.z - A.z);
            q.setFromAxisAngle(upv, Math.atan2(-tg.z, tg.x));
            m4.compose(p, q, one); bi.setMatrixAt(k, m4); gi.setMatrixAt(k, m4);
          });
          bi.instanceMatrix.needsUpdate = gi.instanceMatrix.needsUpdate = true;
        };
        busTick(0);
      }
    } else if (i === 4) {
      // trânsito: os trechos do Waze em fitas que sobem e esquentam com o nível (1 a 5); os alertas por cima
      jamGroup = new THREE.Group(); gr.add(jamGroup);
      wazeMat = markMat(ORANGE, 2.1, 3);
      wazePts = new THREE.Points(new THREE.BufferGeometry(), wazeMat); wazePts.frustumCulled = false;
      wazePts.geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
      add(wazePts, wazeMat, 1, true);
    }
    stack.add(gr); groups.push(gr);
  });
  const JAM = [0xf3e27a, 0xf7c548, 0xf59331, 0xef5a2a, 0xd93425];
  function buildJams(list) {
    if (!jamGroup) return 0;
    jamGroup.children.slice().forEach(c => { jamGroup.remove(c); c.geometry.dispose(); });
    jamMat.forEach(m => { const f = fades.findIndex(x => x[0] === m); if (f >= 0) fades.splice(f, 1); m.dispose(); });
    jamMat = JAM.map(c => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.35, transparent: true, opacity: 0 }));
    jamMat.forEach(m => fades.push([m, 0.95, false, 4]));
    let n = 0;
    list.forEach(({ n: lvl, g }) => {
      const seg = g.filter(([x, y]) => inCrop(x, y)).map(([x, y]) => new THREE.Vector3(wx(x), 0.02 + lvl * 0.018, wz(y)));
      if (seg.length < 2) return;
      const k = Math.max(0, Math.min(4, lvl - 1));
      const mesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(seg, false, "centripetal", 0.1), Math.min(160, seg.length * 3), 0.01 + lvl * 0.003, 5, false), jamMat[k]);
      mesh.renderOrder = 4 * 3 + 2; jamGroup.add(mesh); n++;
    });
    return n;
  }
  /* ---------- câmera ---------- */
  const KEYS = [
    { p: [0, 2.4, 13.5], t: [0, 0, 0] },
    { p: [0, 5.6, 10.5], t: [0, 0, 0] },
    { p: [10.5, 5.3, 10.5], t: [0, 0.3, 0] },   // um pouco mais longe: o cubo do banco não passa por cima do texto
    { p: [0.2, 13.5, 3.4], t: [0.2, 0, 0.3] },
    { p: [-3.4, 6.4, 9.6], t: [0.2, 0.5, 0] },
    { p: [crop.cx + 7.9, 8, crop.cz + 9.1], t: [crop.cx, 1.45, crop.cz] },   // mais longe: sobra margem à direita para as etiquetas e a lâmina de cima não entra no cabeçalho
  ];
  const vp = new THREE.Vector3(), vt = new THREE.Vector3(), va = new THREE.Vector3(), vb = new THREE.Vector3(), proj = new THREE.Vector3();
  let W = 1, H = 1, pull = 1, narrow = false, dprMax = 1, dpr = 1;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height); narrow = W < 860;
    dprMax = Math.min(devicePixelRatio || 1, narrow ? 1.25 : 1.5);
    dpr = Math.min(dpr === 1 && dprMax > 1 ? dprMax : dpr, dprMax);
    renderer.setPixelRatio(dpr); renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // a cena fica à direita do texto na tela larga e acima dele na estreita
    if (narrow) camera.setViewOffset(W, H, 0, H * 0.15, W, H); else camera.setViewOffset(W, H, -W * 0.17, H * 0.02, W, H);
    camera.updateProjectionMatrix();
    pull = Math.min(2.3, Math.max(1, (narrow ? 1.25 : 1.5) / camera.aspect));
    uni.uPx.value = H * dpr * 0.085;
  };

  let state = 0, explode = 0, mx = 0, my = 0, sx = 0, sy = 0, raf = 0, t0 = performance.now();
  // destaque de uma camada: as outras apagam e a escolhida sobe um pouco
  let focus = -1, hover = -1;
  const hl = layers.map(() => 1), up = layers.map(() => 0), fk = layers.map(() => 0);
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const pick = (cx, cy) => {
    if (explode < 0.85) return -1;
    const r = canvas.getBoundingClientRect();
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return -1;
    ndc.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects(plates, false)[0];
    return hit ? hit.object.userData.k : -1;
  };
  const setHover = k => { if (k === hover) return; hover = k; if (onFocus) onFocus(k, "scene"); };
  const ss = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
  // resolução que se adapta: se os quadros passam de ~20 ms a imagem perde nitidez antes de perder fluidez,
  // e volta a ficar nítida quando sobra folga. Cada troca espera um tempo para não ficar oscilando
  let last = 0, slow = 0, fast = 0;
  const adapt = (now, half) => {
    const dt = last ? now - last : 16.7; last = now;
    if (dt > 100) return;   // aba voltou do fundo: não conta
    // a 30 quadros (cena parada) o tempo esperado entre quadros dobra
    const k = half ? 2 : 1;
    if (dt > 20 * k) { slow++; fast = 0; } else if (dt < 13 * k) { fast++; slow = Math.max(0, slow - 1); } else slow = Math.max(0, slow - 1);
    let next = dpr;
    if (slow > 24 && dpr > 1) next = Math.max(1, dpr - 0.25);
    else if (fast > 240 && dpr < dprMax) next = Math.min(dprMax, dpr + 0.25);
    if (next !== dpr) { dpr = next; slow = fast = 0; renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); uni.uPx.value = H * dpr * 0.085; }
  };
  // amortecimento: uma rolada brusca não vira um salto de câmera; a cena chega ao alvo em ~meio segundo
  let tState = 0, tExplode = 0, first = true, lastF = 0;
  // com a rolagem e o mouse parados, a cena só tem movimentos lentos (chuva, ônibus, giro da câmera):
  // desenha a 30 quadros por segundo; ao rolar ou mexer o mouse, volta a 60 no mesmo quadro
  let half = false, skip = false;
  const frame = now => {
    raf = requestAnimationFrame(frame);
    half = tState === state && tExplode === explode && Math.abs(mx - sx) < 0.003 && Math.abs(my - sy) < 0.003 && hl.every((v, k) => Math.abs(v - (focus < 0 || k === focus ? 1 : 0.16)) < 0.01 && Math.abs(fk[k] - (k === focus ? 1 : 0)) < 0.01);
    if (half && (skip = !skip)) return;
    adapt(now, half);
    const dtF = lastF ? Math.min(0.1, (now - lastF) / 1000) : 0.016; lastF = now;
    const kF = 1 - Math.exp(-dtF * 4.5);
    state += (tState - state) * kF; explode += (tExplode - explode) * kF;
    if (Math.abs(tState - state) < 0.0005) state = tState;
    if (Math.abs(tExplode - explode) < 0.0005) explode = tExplode;
    const time = (now - t0) / 1000;
    uni.uTime.value = time;
    uni.uS.value = Math.min(4, state);
    const e = explode, rise = ss(0, 1, state - 4);   // rise: o giro da câmera da etapa 05 para a 06
    uni.uExplode.value = e; uni.uLift.value = (LN - 1) * GAP * e + up[LN - 1] * e; uni.uRise.value = rise;

    const i = Math.min(4, Math.floor(state)), f = ss(0, 1, state - i), A = KEYS[i], Bk = KEYS[i + 1];
    va.fromArray(A.p); vb.fromArray(Bk.p); vp.lerpVectors(va, vb, f);
    va.fromArray(A.t); vb.fromArray(Bk.t); vt.lerpVectors(va, vb, f);
    sx += (mx - sx) * 0.05; sy += (my - sy) * 0.05;
    // a câmera respira; nas camadas ela gira devagar em volta da pilha
    const orbit = Math.sin(time * 0.16) * (0.06 + 0.2 * ss(4.2, 5, state)) + sx * 0.16;
    // tela estreita: quando as camadas se separam a pilha recua e desliza para a direita, abrindo uma coluna
    // à esquerda para as etiquetas (antes elas caíam em cima do desenho)
    if (narrow) camera.setViewOffset(W, H, -W * 0.2 * e, H * 0.15, W, H);
    vp.sub(vt).multiplyScalar(pull * (narrow ? 1 + 0.22 * e : 1)).applyAxisAngle(camera.up, orbit).add(vt);
    vp.y += sy * -0.5;
    camera.position.copy(vp); camera.lookAt(vt);

    // o banco aparece só em volta da etapa 03
    const wB = ss(0.55, 1, 1 - Math.abs(state - 2));
    fMat.opacity = 0.55 * wB; wMat.opacity = wB; gMat.opacity = 0.05 * wB;
    frames.visible = winBox.visible = winGlass.visible = wB > 0.002;
    const mapO = ss(3.1, 4, state);
    mapMat.opacity = 0.34 * mapO * (1 - Math.max(e, rise * 0.75));
    gridMat.opacity = 0.13 * ss(2.4, 3, state) * (1 - ss(3.5, 4.2, state));
    // durante o giro só a lâmina de baixo aparece, com os prédios crescendo do chão; depois as outras sobem
    const on = e > 0.002 || rise > 0.002; stack.visible = on;
    if (bld) bld.scale.y = Math.max(0.001, ss(0.15, 1, rise));
    if (on) {
      const o = ss(0, 0.3, e), o0 = Math.max(o, ss(0, 0.6, rise));
      groups.forEach((gr, k) => {
        hl[k] += ((focus < 0 ? 1 : k === focus ? 1 : 0.16) - hl[k]) * 0.12;
        up[k] += ((k === focus ? 0.24 : 0) - up[k]) * 0.12;
        fk[k] += ((k === focus ? 1 : 0) - fk[k]) * 0.1;
        auras[k].uniforms.uO.value = fk[k] * o;
        const [em, c0, ac] = edges[k];
        em.color.copy(c0).lerp(ac, fk[k]);
        gr.position.y = k * GAP * e + up[k] * e;
      });
      fades.forEach(([m, full, u, k]) => {
        const v = Math.min(1, full * (k === 0 ? o0 : o) * hl[k] * (1 + up[k] * 2.6));
        if (u) m.uniforms.uO.value = v; else m.opacity = v;
      });
      uni.uDim.value = hl[LN - 1];
      if (busTick && o > 0.01) busTick(time);
      if (camTick && o > 0.01) camTick(time);
    }
    renderer.render(scene, camera);

    // etiquetas das camadas: projetadas do canto da lâmina para a tela
    if (tagEls) {
      const tagO = ss(0.45, 0.85, e);
      for (let k = 0; k < tagEls.length; k++) {
        const el = tagEls[k];
        if (tagO < 0.01) { if (el.style.opacity !== "0") el.style.opacity = "0"; continue; }
        // à direita da lâmina quando cabe; se não, encostada no canto de trás, por dentro da tela
        proj.set(narrow ? crop.x0 : crop.x1, k * GAP * e + up[k] * e, narrow ? crop.z1 : crop.z0).project(camera);
        let x = (proj.x * 0.5 + 0.5) * W, y = (-proj.y * 0.5 + 0.5) * H, dx = narrow ? "-4px" : "14px";
        if (narrow) { x = Math.max(x, (el._w2 || (el._w2 = el.offsetWidth)) + 14); dx = "calc(-100% - 8px)"; }
        else if (x + (el._w || (el._w = el.offsetWidth + 70)) > W) { x = Math.min(x, W - 16); dx = "calc(-100% - 14px)"; y -= 14; }
        el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(${dx}, -50%)`;
        el.style.opacity = (tagO * (0.3 + 0.7 * hl[k])).toFixed(3);
      }
    }
  };
  // compila antes todos os shaders e sobe as texturas: senão isso acontece no primeiro quadro em que
  // cada coisa aparece, no meio da rolagem (as camadas, por exemplo, só aparecem perto do fim)
  let warming = null;
  function warm() {
    const was = [stack.visible, map.visible];
    stack.visible = true; map.visible = !!mapMat.map;
    const p = renderer.compileAsync ? renderer.compileAsync(scene, camera) : Promise.resolve(renderer.compile(scene, camera));
    stack.visible = was[0]; map.visible = was[1];
    warming = p.catch(() => {});
    return warming;
  }
  const onMove = ev => {
    mx = (ev.clientX / innerWidth - 0.5) * 2; my = (ev.clientY / innerHeight - 0.5) * 2;
    // em cima de um texto de camada quem manda é o texto
    if (ev.pointerType === "mouse" && !(ev.target.closest && ev.target.closest("[data-layer]"))) setHover(pick(ev.clientX, ev.clientY));
  };
  const onDown = ev => { if (ev.pointerType !== "mouse") { const k = pick(ev.clientX, ev.clientY); if (k >= 0 && onFocus) onFocus(k === focus ? -1 : k, "tap"); } };

  resize();
  warm();
  return {
    ready: () => warming,
    // a rolagem só diz para onde ir; quem anda até lá é a cena, no próprio ritmo (ver o começo do frame)
    set(s, e) { tState = s; tExplode = e; if (first) { first = false; state = s; explode = e; } },
    setBikes() {
      stations.forEach((s, i) => { const f = s.bikes == null ? 0.5 : Math.min(1, s.bikes / Math.max(1, s.cap)); for (let k = 0; k < S; k++) aFill[i * S + k] = f; });
      g.attributes.aFill.needsUpdate = true;
    },
    // pts em coordenadas do mapa; devolve quantos caíram no recorte
    // trechos do Waze: [{ n: nível 1-5, g: [[x, y] no mapa] }]; devolve quantos caíram no recorte
    setJams(list) { const n = buildJams(list); warm(); return n; },
    setWaze(pts) {
      const a = []; pts.forEach(([x, y]) => { if (inCrop(x, y)) a.push(wx(x), 0.03, wz(y)); });
      wazePts.geometry.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
      return a.length / 3;
    },
    // -1 tira o destaque
    focus(k) { focus = k; },
    start() { if (raf) return; last = 0; lastF = 0; raf = requestAnimationFrame(frame); addEventListener("pointermove", onMove, { passive: true }); addEventListener("pointerdown", onDown, { passive: true }); },
    stop() { cancelAnimationFrame(raf); raf = 0; removeEventListener("pointermove", onMove); removeEventListener("pointerdown", onDown); },
    resize,
  };
}
