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
  const uni = { uS: { value: 0 }, uTime: { value: 0 }, uExplode: { value: 0 }, uLift: { value: 0 }, uPx: { value: 60 }, uDim: { value: 1 } };
  const dots = new THREE.Points(g, new THREE.ShaderMaterial({
    uniforms: uni, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    vertexShader: `
      uniform float uS, uTime, uExplode, uLift, uPx, uDim;
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
        p.y += uLift;

        float old = step(aSnap, 2.5), fresh = step(32.5, aSnap);
        vec3 c0 = mix(CREAM, ORANGE, step(.86, aRand));
        vec3 c1 = mix(ORANGE, CREAM, step(.6, aRand));
        vec3 c2 = mix(mix(ORANGE, CREAM, fresh), DIM, old);
        vec3 c34 = mix(ORANGE, LIME, aMe);
        vCol = c0 * w0 + c1 * w1 + c2 * w2 + c34 * (w3 + w4);
        float a2 = mix(.95, .28, old);
        vA = (.55 + .3 * aRand) * w0 + .8 * w1 + a2 * w2 + .7 * w3 + mix(.5, .95, aSnap / 36.) * w4;
        vA *= mix(1., aIn * uDim, uExplode);

        float size = .85 * w0 + .95 * w1 + 1.15 * w2 + 1.5 * w3 + (1.05 + aMe * .5) * w4;
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
  dots.frustumCulled = false; dots.renderOrder = 10;
  scene.add(dots);

  /* ---------- o mapa e a grade ---------- */
  const mapMat = new THREE.MeshBasicMaterial({ color: CREAM, transparent: true, opacity: 0, depthWrite: false });
  const cropMat = new THREE.MeshBasicMaterial({ color: CREAM, transparent: true, opacity: 0, depthWrite: false });
  const mapGeo = new THREE.PlaneGeometry(20, 12.25); mapGeo.rotateX(-Math.PI / 2);
  const map = new THREE.Mesh(mapGeo, mapMat);
  map.position.set(wx(1000), 0, wz(612.5)); map.visible = false; scene.add(map);
  const img = new Image();
  img.onload = () => {
    try {
      const c = document.createElement("canvas"); c.width = 2048; c.height = 1254;
      const x = c.getContext("2d");
      x.drawImage(img, 0, 0, c.width, c.height);
      x.globalCompositeOperation = "source-in"; x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
      const tex = new THREE.CanvasTexture(c);
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy(); tex.colorSpace = THREE.SRGBColorSpace;
      mapMat.map = tex; cropMat.map = tex; mapMat.needsUpdate = cropMat.needsUpdate = true; map.visible = true;
    } catch (e) { /* sem o mapa, os pontos seguem sozinhos */ }
  };
  img.src = mapSrc;

  const gridPts = [];
  for (let i = -12; i <= 12; i++) { gridPts.push(i * 0.5, 0, -6, i * 0.5, 0, 6, -6, 0, i * 0.5, 6, 0, i * 0.5); }
  const gridGeo = new THREE.BufferGeometry(); gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPts, 3));
  const gridMat = new THREE.LineBasicMaterial({ color: CREAM, transparent: true, opacity: 0, depthWrite: false });
  const grid = new THREE.LineSegments(gridGeo, gridMat); grid.position.set(-0.4, -0.01, 0); scene.add(grid);

  /* ---------- as seis camadas ---------- */
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
  const fades = [];   // [material, opacidade cheia, é uniform?, camada]
  const groups = [], plates = [];
  // cada lâmina é um vidro com uma grade fina e a borda mais clara: lê como superfície, não como sombra
  const glass = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 512;
    const x = c.getContext("2d");
    const gr = x.createRadialGradient(256, 256, 40, 256, 256, 380); gr.addColorStop(0, "rgba(255,255,255,.55)"); gr.addColorStop(1, "rgba(255,255,255,1)");
    x.fillStyle = gr; x.fillRect(0, 0, 512, 512);
    x.strokeStyle = "rgba(0,0,0,.28)"; x.lineWidth = 1;
    for (let k = 1; k < 16; k++) { const v = k * 32 + .5; x.beginPath(); x.moveTo(v, 0); x.lineTo(v, 512); x.moveTo(0, v); x.lineTo(512, v); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const slab = new THREE.BufferGeometry(), TH = 0.06;
  slab.setAttribute("position", new THREE.Float32BufferAttribute([
    crop.x0, -TH, crop.z0, crop.x1, -TH, crop.z0, crop.x1, -TH, crop.z0, crop.x1, -TH, crop.z1, crop.x1, -TH, crop.z1, crop.x0, -TH, crop.z1, crop.x0, -TH, crop.z1, crop.x0, -TH, crop.z0,
    crop.x0, 0, crop.z0, crop.x0, -TH, crop.z0, crop.x1, 0, crop.z0, crop.x1, -TH, crop.z0, crop.x1, 0, crop.z1, crop.x1, -TH, crop.z1, crop.x0, 0, crop.z1, crop.x0, -TH, crop.z1], 3));
  const stack = new THREE.Group(); scene.add(stack); stack.visible = false;
  const plateGeo = new THREE.PlaneGeometry(crop.s, crop.s); plateGeo.rotateX(-Math.PI / 2);
  const edge = new THREE.BufferGeometry();
  edge.setAttribute("position", new THREE.Float32BufferAttribute([crop.x0, 0, crop.z0, crop.x1, 0, crop.z0, crop.x1, 0, crop.z1, crop.x0, 0, crop.z1], 3));
  let wazeMat = null, wazePts = null;
  layers.forEach((l, i) => {
    const gr = new THREE.Group(); gr.renderOrder = i;
    const pm = new THREE.MeshBasicMaterial({ color: l.mine ? 0x3a1a0a : 0x24221e, map: glass, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
    const plate = new THREE.Mesh(plateGeo, pm); plate.position.set(crop.cx, 0, crop.cz); plate.renderOrder = i * 2; plate.userData.k = i;
    fades.push([pm, l.mine ? 0.7 : 0.55, false, i]);
    const em = new THREE.LineBasicMaterial({ color: l.mine ? ORANGE : CREAM, transparent: true, opacity: 0, depthWrite: false });
    const loop = new THREE.LineLoop(edge, em); loop.renderOrder = i * 2 + 1;
    const sm = new THREE.LineBasicMaterial({ color: l.mine ? ORANGE : CREAM, transparent: true, opacity: 0, depthWrite: false });
    const side = new THREE.LineSegments(slab, sm); side.renderOrder = i * 2 + 1;
    fades.push([em, l.mine ? 1 : 0.42, false, i], [sm, l.mine ? 0.45 : 0.16, false, i]);
    gr.add(plate, loop, side); plates.push(plate);
    const add = (o, mat, full, u) => { o.renderOrder = i * 2 + 1; gr.add(o); fades.push([mat, full, u, i]); };
    if (i === 0) {
      // o recorte do mapa e os prédios (blocos ilustrativos, semente fixa)
      const cg = new THREE.PlaneGeometry(crop.s, crop.s); cg.rotateX(-Math.PI / 2);
      const uv = cg.attributes.uv, u0 = CROP.x / 2000, u1 = (CROP.x + CROP.s) / 2000, v1 = 1 - CROP.y / 1225, v0 = 1 - (CROP.y + CROP.s) / 1225;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, u0 + uv.getX(k) * (u1 - u0), v0 + uv.getY(k) * (v1 - v0));
      const cm = new THREE.Mesh(cg, cropMat); cm.position.set(crop.cx, 0.01, crop.cz);
      add(cm, cropMat, 0.5);
      const bm = new THREE.MeshLambertMaterial({ color: 0x5a554b, transparent: true, opacity: 0 });
      const boxes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bm, 38);
      const m4 = new THREE.Matrix4(); let sd = 11; const r2 = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
      for (let k = 0; k < 38; k++) {
        const w = 0.14 + r2() * 0.24, d = 0.14 + r2() * 0.24, hgt = 0.08 + r2() * r2() * 0.5;
        m4.makeScale(w, hgt, d); m4.setPosition(crop.x0 + 0.4 + r2() * (crop.s - 0.8), hgt / 2 + 0.01, crop.z0 + 0.4 + r2() * (crop.s - 0.8));
        boxes.setMatrixAt(k, m4);
      }
      add(boxes, bm, 0.95);
    } else if (i === 1) { const m = markMat(CREAM, 2.6, 1); add(new THREE.Points(ptsOf(geo.gauges), m), m, 0.95, true); }
    else if (i === 2) { const m = markMat(CREAM, 1.5, 2); add(new THREE.Points(ptsOf(geo.cams), m), m, 0.95, true); }
    else if (i === 3) {
      const a = [];
      geo.routes.forEach(r => { for (let k = 1; k < r.p.length; k++) { const [x0, y0] = r.p[k - 1], [x1, y1] = r.p[k]; if (inCrop(x0, y0) && inCrop(x1, y1)) a.push(wx(x0), 0.02, wz(y0), wx(x1), 0.02, wz(y1)); } });
      const bg = new THREE.BufferGeometry(); bg.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
      const m = new THREE.LineBasicMaterial({ color: CREAM, transparent: true, opacity: 0, depthWrite: false });
      add(new THREE.LineSegments(bg, m), m, 0.8);
    } else if (i === 4) {
      wazeMat = markMat(ORANGE, 2.1, 3);
      wazePts = new THREE.Points(new THREE.BufferGeometry(), wazeMat); wazePts.frustumCulled = false;
      wazePts.geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
      add(wazePts, wazeMat, 1, true);
    }
    stack.add(gr); groups.push(gr);
  });
  // o fio que liga o Terminal de uma camada à outra
  const wireGeo = new THREE.BufferGeometry(); wireGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0, 1, 0], 3));
  const wireMat = new THREE.LineBasicMaterial({ color: LIME, transparent: true, opacity: 0, depthWrite: false, depthTest: false });
  const wire = new THREE.Line(wireGeo, wireMat); wire.position.set(wx(term.x), 0, wz(term.y)); wire.renderOrder = 20; stack.add(wire);

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
  let W = 1, H = 1, pull = 1, narrow = false;
  const resize = () => {
    const r = canvas.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height); narrow = W < 860;
    const dpr = Math.min(devicePixelRatio || 1, narrow ? 1.5 : 1.75);
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
  const frame = now => {
    raf = requestAnimationFrame(frame);
    const time = (now - t0) / 1000;
    uni.uTime.value = time;
    uni.uS.value = Math.min(4, state);
    const e = explode;
    uni.uExplode.value = e; uni.uLift.value = (LN - 1) * GAP * e;

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
    mapMat.opacity = 0.34 * mapO * (1 - e);
    gridMat.opacity = 0.13 * ss(2.4, 3, state) * (1 - ss(3.5, 4.2, state));
    const on = e > 0.002; stack.visible = on;
    if (on) {
      const o = ss(0, 0.3, e);
      groups.forEach((gr, k) => {
        hl[k] += ((focus < 0 ? 1 : k === focus ? 1 : 0.16) - hl[k]) * 0.12;
        up[k] += ((k === focus ? 0.24 : 0) - up[k]) * 0.12;
        gr.position.y = k * GAP * e + up[k] * e;
      });
      fades.forEach(([m, full, u, k]) => {
        const v = Math.min(1, full * o * hl[k] * (1 + up[k] * 2.6));
        if (u) m.uniforms.uO.value = v; else m.opacity = v;
      });
      uni.uDim.value = hl[LN - 1];
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
  const onMove = ev => {
    mx = (ev.clientX / innerWidth - 0.5) * 2; my = (ev.clientY / innerHeight - 0.5) * 2;
    // em cima de um texto de camada quem manda é o texto
    if (ev.pointerType === "mouse" && !(ev.target.closest && ev.target.closest("[data-layer]"))) setHover(pick(ev.clientX, ev.clientY));
  };
  const onDown = ev => { if (ev.pointerType !== "mouse") { const k = pick(ev.clientX, ev.clientY); if (k >= 0 && onFocus) onFocus(k === focus ? -1 : k, "tap"); } };

  resize();
  return {
    set(s, e) { state = s; explode = e; },
    setBikes() {
      stations.forEach((s, i) => { const f = s.bikes == null ? 0.5 : Math.min(1, s.bikes / Math.max(1, s.cap)); for (let k = 0; k < S; k++) aFill[i * S + k] = f; });
      g.attributes.aFill.needsUpdate = true;
    },
    // pts em coordenadas do mapa; devolve quantos caíram no recorte
    setWaze(pts) {
      const a = []; pts.forEach(([x, y]) => { if (inCrop(x, y)) a.push(wx(x), 0.03, wz(y)); });
      wazePts.geometry.setAttribute("position", new THREE.Float32BufferAttribute(a, 3));
      return a.length / 3;
    },
    // -1 tira o destaque
    focus(k) { focus = k; },
    start() { if (raf) return; raf = requestAnimationFrame(frame); addEventListener("pointermove", onMove, { passive: true }); addEventListener("pointerdown", onDown, { passive: true }); },
    stop() { cancelAnimationFrame(raf); raf = 0; removeEventListener("pointermove", onMove); removeEventListener("pointerdown", onDown); },
    resize,
  };
}
