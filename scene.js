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
  const groups = [], plates = [];
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
  let jamGroup = null, jamMat = [], bld = null, busTick = null;

  layers.forEach((l, i) => {
    const gr = new THREE.Group();
    const pm = new THREE.MeshBasicMaterial({ color: l.mine ? 0x1e120b : 0x13120f, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const plate = new THREE.Mesh(plateGeo, pm); plate.position.set(crop.cx, 0, crop.cz); plate.renderOrder = i * 3; plate.userData.k = i;
    const mm = new THREE.MeshBasicMaterial({ color: CREAM, map: null, transparent: true, opacity: 0, depthWrite: false });
    const mapPlate = new THREE.Mesh(cg, mm); mapPlate.position.set(crop.cx, 0.004, crop.cz); mapPlate.renderOrder = i * 3 + 1;
    mapMats.push(mm); mapPlates.push(mapPlate);
    const em = new THREE.LineBasicMaterial({ color: l.mine ? ORANGE : 0xc9a96b, transparent: true, opacity: 0, depthWrite: false });
    const loop = new THREE.LineLoop(edge, em); loop.renderOrder = i * 3 + 2;
    const side = new THREE.LineSegments(slab, em); side.renderOrder = i * 3 + 2;
    fades.push([pm, 0.86, false, i], [mm, l.mine ? 0.2 : 0.14, false, i], [em, l.mine ? 1 : 0.55, false, i]);
    gr.add(plate, mapPlate, loop, side); plates.push(plate);
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
      // pluviômetros: um cilindro de vidro azul em cada posição pública; a altura e as gotas são ilustrativas
      const pts = geo.gauges.map(([x, y]) => [wx(x), wz(y)]).filter(([x, z]) => inCropW(x, z));
      const cm = new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
      const cyl = new THREE.CylinderGeometry(0.045, 0.045, 1, 20, 1, true); cyl.translate(0, 0.5, 0);
      const im = new THREE.InstancedMesh(cyl, cm, Math.max(1, pts.length)), m4 = new THREE.Matrix4();
      let sd = 5; const r2 = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      const hs = pts.map(() => 0.12 + r2() * 0.22);
      pts.forEach(([x, z], k) => { m4.makeScale(1, hs[k], 1); m4.setPosition(x, 0.004, z); im.setMatrixAt(k, m4); });
      add(im, cm, 0.42);
      const rm = new THREE.MeshBasicMaterial({ color: BLUE, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const ring = new THREE.RingGeometry(0.05, 0.062, 28); ring.rotateX(-Math.PI / 2);
      const ri = new THREE.InstancedMesh(ring, rm, Math.max(1, pts.length));
      pts.forEach(([x, z], k) => { m4.makeTranslation(x, 0.008, z); ri.setMatrixAt(k, m4); });
      add(ri, rm, 0.9);
      // gotas: caem dentro de cada cilindro, no relógio do shader
      const D = 14, dp = new Float32Array(pts.length * D * 3), dr = new Float32Array(pts.length * D);
      pts.forEach(([x, z], k) => { for (let j = 0; j < D; j++) { const a = r2() * 6.283, rr = r2() * 0.032, o = (k * D + j); dp[o * 3] = x + Math.cos(a) * rr; dp[o * 3 + 1] = hs[k]; dp[o * 3 + 2] = z + Math.sin(a) * rr; dr[o] = r2(); } });
      const dg = new THREE.BufferGeometry(); dg.setAttribute("position", new THREE.BufferAttribute(dp, 3)); dg.setAttribute("aR", new THREE.BufferAttribute(dr, 1));
      const dm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uTime, uO: { value: 0 }, uPx: uni.uPx },
        vertexShader: `uniform float uTime, uPx; attribute float aR; varying float vF;
          void main() { float f = fract(aR + uTime * (.35 + aR * .3)); vF = f; vec3 p = position; p.y *= 1. - f;
            vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(1.5, .7 * uPx / -mv.z); }`,
        fragmentShader: `uniform float uO; varying float vF; void main() { float d = length(gl_PointCoord - .5); if (d > .5) discard;
          gl_FragColor = vec4(.6, .8, 1., (1. - d * 2.) * uO * sin(vF * 3.14159)); }` });
      const drops = new THREE.Points(dg, dm); drops.frustumCulled = false;
      add(drops, dm, 0.9, true);
    } else if (i === 2) {
      // câmeras: um ponto e o cone do que ela enxerga, cada uma virada para um lado
      const pts = geo.cams.map(([x, y]) => [wx(x), wz(y)]).filter(([x, z]) => inCropW(x, z));
      const km = new THREE.MeshBasicMaterial({ color: CREAM, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
      const cone = new THREE.ConeGeometry(0.05, 0.16, 4, 1, true); cone.translate(0, -0.08, 0); cone.rotateZ(Math.PI / 2);
      const im = new THREE.InstancedMesh(cone, km, Math.max(1, pts.length)), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1), ps = new THREE.Vector3();
      pts.forEach(([x, z], k) => { q.setFromAxisAngle(up, (k * 2.399) % 6.283); ps.set(x, 0.05, z); m4.compose(ps, q, one); im.setMatrixAt(k, m4); });
      add(im, km, 0.22);
      const m = markMat(CREAM, 1.6, 2); add(new THREE.Points(ptsOf(geo.cams).translate(0, 0.03, 0), m), m, 0.95, true);
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
        busTick = time => {
          fleet.forEach((b, k) => {
            const w = (b.off + time * b.v) % 2, u = w < 1 ? w : 2 - w;     // vai e volta pela rota
            b.curve.getPointAt(Math.min(0.999, Math.max(0.001, u)), p); b.curve.getTangentAt(Math.min(0.999, Math.max(0.001, u)), tg);
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
  // o fio que liga o Terminal de uma camada à outra
  const wireGeo = new THREE.BufferGeometry(); wireGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
  const wireMat = new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const wire = new THREE.Line(wireGeo, wireMat); wire.position.set(wx(term.x), 0, wz(term.y)); wire.renderOrder = 40; stack.add(wire);

  /* ---------- câmera ---------- */
  const KEYS = [
    { p: [0, 2.4, 13.5], t: [0, 0, 0] },
    { p: [0, 5.6, 10.5], t: [0, 0, 0] },
    { p: [8.6, 4.4, 8.6], t: [0, 0.3, 0] },
    { p: [0.2, 13.5, 3.4], t: [0.2, 0, 0.3] },
    { p: [-3.4, 6.4, 9.6], t: [0.2, 0.5, 0] },
    { p: [crop.cx + 6.6, 6.9, crop.cz + 7.6], t: [crop.cx, 1.45, crop.cz] },
  ];
  const vp = new THREE.Vector3(), vt = new THREE.Vector3(), va = new THREE.Vector3(), vb = new THREE.Vector3(), proj = new THREE.Vector3();
  let W = 1, H = 1, pull = 1, narrow = false, dprMax = 1, dpr = 1;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height); narrow = W < 860;
    dprMax = Math.min(devicePixelRatio || 1, narrow ? 1.5 : 1.75);
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
  const hl = layers.map(() => 1), up = layers.map(() => 0);
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
  const adapt = now => {
    const dt = last ? now - last : 16.7; last = now;
    if (dt > 100) return;   // aba voltou do fundo: não conta
    if (dt > 20) { slow++; fast = 0; } else if (dt < 13) { fast++; slow = Math.max(0, slow - 1); } else slow = Math.max(0, slow - 1);
    let next = dpr;
    if (slow > 24 && dpr > 1) next = Math.max(1, dpr - 0.25);
    else if (fast > 240 && dpr < dprMax) next = Math.min(dprMax, dpr + 0.25);
    if (next !== dpr) { dpr = next; slow = fast = 0; renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); uni.uPx.value = H * dpr * 0.085; }
  };
  // amortecimento: uma rolada brusca não vira um salto de câmera; a cena chega ao alvo em ~meio segundo
  let tState = 0, tExplode = 0, first = true, lastF = 0;
  const frame = now => {
    raf = requestAnimationFrame(frame);
    adapt(now);
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
    vp.sub(vt).multiplyScalar(pull).applyAxisAngle(camera.up, orbit).add(vt);
    vp.y += sy * -0.5;
    camera.position.copy(vp); camera.lookAt(vt);

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
        gr.position.y = k * GAP * e + up[k] * e;
      });
      fades.forEach(([m, full, u, k]) => {
        const v = Math.min(1, full * (k === 0 ? o0 : o) * hl[k] * (1 + up[k] * 2.6));
        if (u) m.uniforms.uO.value = v; else m.opacity = v;
      });
      uni.uDim.value = hl[LN - 1];
      if (busTick && o > 0.01) busTick(time);
      wire.scale.y = Math.max(0.001, (LN - 1) * GAP * e); wireMat.opacity = 0.9 * ss(0.4, 1, e);
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
        if (narrow) x = Math.max(x, 14);
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
