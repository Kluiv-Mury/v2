/* O banco do NitBike em 3D: cada ficha é um snapshot (as 65 estações numa grade 13 × 5), gravado a cada
   10 s. A pilha anda com o relógio; a cada minuto, aos :30, a publicação lê a janela de 5 min (laranja),
   deixa de fora os 30 s mais recentes (a folga) e apaga o que ficou para trás (a limpeza).
   Simulação das regras do fluxo, com 1 s valendo 10 s. O brilho de cada estação vem da última leitura real. */
import * as THREE from "https://unpkg.com/three@0.160.0/build/three.module.min.js";

const N = 48, HF = 0.27, SH = 1.5, SD = 2.6;   // fichas, passo entre elas, altura e profundidade
const CREAM = "#efeae1", MUTE = "#8b847a";

export function createPipe({ canvas, labels, reduce, stations = [], on = {}, mapSrc = "mapa-niteroi.svg" }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: (devicePixelRatio || 1) < 1.5, alpha: true, powerPreference: "high-performance" });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 80);
  scene.add(new THREE.AmbientLight(0xfff1e0, 1.1));
  const key = new THREE.DirectionalLight(0xffe6cc, 2.4); key.position.set(6, 9, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(0xff7a3d, 0.9); rim.position.set(-8, 3, -6); scene.add(rim);
  const group = new THREE.Group(); scene.add(group);

  // a ocupação das 65 estações (0 a 1), numa textura 13 × 5 que o shader das faces lê
  const fillData = new Uint8Array(13 * 5 * 4).fill(128);
  const fillTex = new THREE.DataTexture(fillData, 13, 5, THREE.RGBAFormat);
  fillTex.magFilter = fillTex.minFilter = THREE.NearestFilter; fillTex.needsUpdate = true;

  // corpo das fichas: lâminas escuras, um pouco metálicas
  const body = new THREE.BoxGeometry(0.05, SH, SD); body.translate(0, SH / 2, 0);
  const bodies = new THREE.InstancedMesh(body, new THREE.MeshLambertMaterial({ color: 0x1b1916 }), N);
  // face: a grade das estações, colorida pelo estado da ficha
  const face = new THREE.PlaneGeometry(SD, SH); face.rotateY(Math.PI / 2); face.translate(0.028, SH / 2, 0);
  const aState = new THREE.InstancedBufferAttribute(new Float32Array(N), 1), aSeed = new THREE.InstancedBufferAttribute(new Float32Array(N), 1), aLife = new THREE.InstancedBufferAttribute(new Float32Array(N).fill(1), 1), aAge = new THREE.InstancedBufferAttribute(new Float32Array(N).fill(9), 1), aSel = new THREE.InstancedBufferAttribute(new Float32Array(N).fill(9), 1);
  face.setAttribute("aState", aState); face.setAttribute("aSeed", aSeed); face.setAttribute("aLife", aLife); face.setAttribute("aAge", aAge); face.setAttribute("aSel", aSel);
  const U = { uFill: null, uSweepX: { value: 0 }, uSweepA: { value: 0 }, uDelta: { value: 0.5 } };
  const faceMat = new THREE.ShaderMaterial({
    transparent: true, extensions: { derivatives: true },
    uniforms: { uFill: { value: fillTex }, uSweepX: U.uSweepX, uSweepA: U.uSweepA, uDelta: U.uDelta },
    vertexShader: `attribute float aState, aSeed, aLife, aAge, aSel; varying vec2 vUv; varying float vS, vSeed, vL, vAge, vX, vSel;
      void main() { vUv = uv; vS = aState; vSeed = aSeed; vL = aLife; vAge = aAge; vSel = aSel; vec4 w = instanceMatrix * vec4(position, 1.); vX = w.x;
        gl_Position = projectionMatrix * modelViewMatrix * w; }`,
    fragmentShader: `uniform sampler2D uFill; uniform float uSweepX, uSweepA, uDelta; varying vec2 vUv; varying float vS, vSeed, vL, vAge, vX, vSel;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      void main() {
        vec2 g = vec2(13., 5.), p = vUv * g, id = floor(p), f = fract(p), aa = fwidth(p) * 1.2;
        float cx = smoothstep(.16 - aa.x, .16 + aa.x, f.x) * (1. - smoothstep(.84 - aa.x, .84 + aa.x, f.x));
        float cy = smoothstep(.18 - aa.y, .18 + aa.y, f.y) * (1. - smoothstep(.82 - aa.y, .82 + aa.y, f.y));
        float far = clamp(max(aa.x, aa.y) * 2.2, 0., 1.);
        // ocupação real da estação, com uma variação pequena de um snapshot para o outro (ilustrativa)
        float occ = texture2D(uFill, (vec2(id.x, 4. - id.y) + .5) / g).r;
        float v = clamp(occ + (h(id + vSeed * 7.13) - .5) * .28, .06, 1.);
        // o mesmo cálculo no snapshot anterior: subiu, entraram bikes; caiu, saíram
        float vp = clamp(occ + (h(id + mod(vSeed - .7311 + 97., 97.) * 7.13) - .5) * .28, .06, 1.);
        float dv = v - vp;
        v = mix(.18 + .82 * v, .55, far);
        vec3 win = vec3(1., .40, .14), folga = vec3(.66, .6, .52), fresh = vec3(.94, .92, .88), old = vec3(.66, .63, .58);
        vec3 c = vS < .5 ? old : vS < 1.5 ? win : vS < 2.5 ? folga : fresh;
        float k = vS < .5 ? .95 : vS < 1.5 ? 1.2 : vS < 2.5 ? .85 : .7;
        vec3 col = c * (vS < .5 ? .45 + .55 * v : v) * k;
        // seleção: a ficha que acabou de entrar na janela acende forte e assenta no laranja
        float sel = step(0., vSel) * exp(-vSel * 3.2);
        col = mix(col, vec3(1., .62, .32) * (1.4 + .6 * v), sel * .9);
        // gravação: as células da ficha nova acendem em onda (de cima para baixo) e o brilho apaga logo
        float d0 = (4. - id.y) * .065 + id.x * .011, born = smoothstep(d0, d0 + .05, vAge), flash = exp(-max(0., vAge - d0) * 4.5) * born;
        col = mix(col, vec3(1., .97, .9) * 1.5, flash * .85);
        float cell = cx * cy * born;
        // deltas: atrás da varredura, as células da janela que mudaram piscam e apagam aos poucos
        float behind = vX - uSweepX, trail = step(0., behind) * exp(-behind * 1.6) * uSweepA;
        float isWin = step(.5, vS) * step(vS, 1.5), mag = smoothstep(.035, .1, abs(dv));
        vec3 dc = dv > 0. ? vec3(.9, 1., .34) : vec3(1., .23, .19);
        col = mix(col, dc * 1.25, trail * isWin * mag * uDelta);
        // limpeza: a ficha se desfaz célula a célula, em ordem aleatória
        float keep = step(h(id + vSeed * 3.1), vL);
        gl_FragColor = vec4(mix(vec3(.055, .05, .045), col, cell), .97 * mix(vL, keep, step(vS, .5)));
      }`,
  });
  const faces = new THREE.InstancedMesh(face, faceMat, N);
  bodies.frustumCulled = faces.frustumCulled = false;
  group.add(bodies, faces);

  // o chão: uma faixa que some nas pontas e a régua do tempo, de minuto em minuto
  const fc = document.createElement("canvas"); fc.width = 512; fc.height = 64;
  { const x = fc.getContext("2d"), gr = x.createLinearGradient(0, 0, 512, 0); gr.addColorStop(0, "rgba(239,234,225,0)"); gr.addColorStop(.55, "rgba(239,234,225,.07)"); gr.addColorStop(1, "rgba(239,234,225,.02)"); x.fillStyle = gr; x.fillRect(0, 0, 512, 64); }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(14, 3.6), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fc), transparent: true, depthWrite: false }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(-5.6, -0.004, 0); group.add(floor);
  const tk = [];
  for (let m = 0; m <= 6; m++) tk.push(-m * 6 * HF, 0.003, -SD / 2 - 0.12, -m * 6 * HF, 0.003, SD / 2 + 0.14);
  group.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(tk, 3)), new THREE.LineBasicMaterial({ color: 0x3a3631 })));
  const sprite = (t, color) => {
    const c = document.createElement("canvas"); c.width = 512; c.height = 96;
    const x = c.getContext("2d"); x.font = `500 44px "Geist Mono", ui-monospace, monospace`; x.fillStyle = color; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(t, 256, 50);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tx, transparent: true, depthWrite: false })); s.scale.set(1.5, 0.28, 1); return s;
  };
  ["agora", "−1 min", "−2 min", "−3 min", "−4 min", "−5 min", "−6 min"].forEach((t, m) => { const s = sprite(t, m ? MUTE : CREAM); s.position.set(-m * 6 * HF, 0.04, SD / 2 + 0.45); group.add(s); });
  // o "agora": uma haste clara na ponta da pilha, onde entra o snapshot novo
  const now = new THREE.Mesh(new THREE.BoxGeometry(0.012, 2, 0.012), new THREE.MeshBasicMaterial({ color: 0xefeae1 })); now.position.set(0.06, 1, SD / 2 + 0.2); group.add(now);

  // a janela: a caixa laranja, o piso hachurado embaixo e a varredura que passa a cada publicação
  const frame = new THREE.Group(); group.add(frame);
  const fb = new THREE.BoxGeometry(1, SH + 0.3, SD + 0.3); fb.translate(0, (SH + 0.3) / 2, 0);
  const frameM = new THREE.LineBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.95 });
  frame.add(new THREE.LineSegments(new THREE.EdgesGeometry(fb), frameM));
  const hc = document.createElement("canvas"); hc.width = hc.height = 128;
  { const x = hc.getContext("2d"); x.strokeStyle = "rgba(255,90,31,.85)"; x.lineWidth = 5; for (let i = -128; i < 256; i += 24) { x.beginPath(); x.moveTo(i, 128); x.lineTo(i + 128, 0); x.stroke(); } }
  const hatch = new THREE.CanvasTexture(hc); hatch.wrapS = hatch.wrapT = THREE.RepeatWrapping; hatch.repeat.set(27, 5); hatch.colorSpace = THREE.SRGBColorSpace;
  const pisoM = new THREE.MeshBasicMaterial({ map: hatch, transparent: true, opacity: 0.4, depthWrite: false });
  const piso = new THREE.Mesh(new THREE.PlaneGeometry(1, SD + 0.3), pisoM); piso.rotation.x = -Math.PI / 2; piso.position.y = 0.006; frame.add(piso);
  const glowM = new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.BackSide });
  frame.add(new THREE.Mesh(fb, glowM));
  const sweepM = new THREE.MeshBasicMaterial({ color: 0xff8a4a, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true });
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(0.1, SH + 0.3).rotateY(Math.PI / 2).translate(0, (SH + 0.3) / 2, 0), sweepM); group.add(sweep);

  // partículas: um conjunto só, reaproveitado em anel. Cada uma nasce num ponto, vai até um alvo por uma
  // curva (sobe e cai) e apaga; tudo é calculado no shader a partir do relógio uT
  const PN = 900, pa = { a: new Float32Array(PN * 3), b: new Float32Array(PN * 3), t: new Float32Array(PN * 2), c: new Float32Array(PN * 3) };
  const pg = new THREE.BufferGeometry();
  pg.setAttribute("position", new THREE.BufferAttribute(pa.a, 3)); pg.setAttribute("aB", new THREE.BufferAttribute(pa.b, 3));
  pg.setAttribute("aT", new THREE.BufferAttribute(pa.t, 2)); pg.setAttribute("aC", new THREE.BufferAttribute(pa.c, 3));
  for (let k = 0; k < PN; k++) pa.t[k * 2] = -99;
  const uT = { value: 0 }, uPx = { value: 300 };
  const pm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uT, uPx },
    vertexShader: `uniform float uT, uPx; attribute vec3 aB, aC; attribute vec2 aT; varying vec3 vC; varying float vA;
      void main() { float k = clamp((uT - aT.x) / aT.y, 0., 1.), e = 1. - pow(1. - k, 3.);
        vec3 p = mix(position, aB, e); p.y += sin(k * 3.14159) * .9 * length(aB - position) * .18;
        vC = aC; vA = (uT < aT.x || k >= 1.) ? 0. : smoothstep(0., .08, k) * (1. - smoothstep(.7, 1., k));
        vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = max(2., uPx * .13 / -mv.z * (1. + .6 * (1. - k))); }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main() { float d = length(gl_PointCoord - .5); if (d > .5 || vA < .01) discard; gl_FragColor = vec4(vC, smoothstep(.5, .1, d) * vA); }` });
  // as partículas vão por cima de tudo, até da tela do Gêmeo (senão ela tapa as que passam na frente dela)
  const parts = new THREE.Points(pg, pm); parts.frustumCulled = false; parts.renderOrder = 80; group.add(parts);
  let pHead = 0, pDirty = false, tS = 0;
  const emit = (ax, ay, az, bx, by, bz, delay, dur, col) => {
    const k = pHead; pHead = (pHead + 1) % PN;
    pa.a.set([ax, ay, az], k * 3); pa.b.set([bx, by, bz], k * 3); pa.t[k * 2] = tS + delay; pa.t[k * 2 + 1] = dur; pa.c.set(col, k * 3); pDirty = true;
  };
  const ORANGE_C = [1, 0.45, 0.18], DUST = [0.55, 0.5, 0.44], LIME_C = [0.85, 1, 0.35];
  const cellPos = (x, kSt) => { const col = kSt % 13, row = 4 - Math.floor(kSt / 13); return [x + 0.03, (row + 0.5) / 5 * SH, SD / 2 - (col + 0.5) / 13 * SD]; };

  // dois painéis em pé, formato retrato, com o visual do mapa da abertura (fundo tinta, estações em laranja
  // com halo, maiores quanto mais cheias). O da esquerda é a camada no ArcGIS: só os pontos, sobre uma grade.
  // O da direita é o Gêmeo: os mesmos pontos sobre as ruas da cidade. As partículas da publicação voam da
  // janela até a camada e, dali, cada estação segue para o seu lugar no mapa do Gêmeo
  const PAN = { w: 2.5, h: 3.7 };
  // o recorte retrato: centrado onde as estações se concentram (Centro e Icaraí); as poucas que ficam
  // longe demais para o enquadramento não aparecem
  const med = a => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : 0; };
  const mx = med(stations.map(q => q[0])), mz = med(stations.map(q => q[1])), asp = PAN.w / PAN.h;
  const need = stations.map(([x, z]) => Math.max(Math.abs(x - mx) / (asp * 0.88), Math.abs(z - mz) / 0.88)).sort((a, b) => a - b);
  const hh = Math.max(1e-6, need.length ? need[Math.min(need.length - 1, Math.floor(need.length * 0.86))] : 1), sc = (PAN.h / 2) / hh;
  const SN = Math.max(1, stations.length), sp = new Float32Array(SN * 3), sOcc = new Float32Array(SN).fill(0.5), sIn = new Float32Array(SN);
  const stLocal = stations.map(([x, z], k) => {
    const lx = (x - mx) * sc, ly = PAN.h / 2 - (z - mz) * sc;
    sIn[k] = Math.abs(lx) < PAN.w / 2 - 0.1 && Math.abs(ly - PAN.h / 2) < PAN.h / 2 - 0.1 ? 1 : 0;
    sp.set([lx, ly, 0.03], k * 3); return [lx, ly, 0.03];
  });
  const uRing = { value: 0 }, uCyc = { value: 6 };
  const PT = 0.09, bodyGeo = new THREE.BoxGeometry(PAN.w + 0.14, PAN.h + 0.14, PT).translate(0, PAN.h / 2, -PT / 2 - 0.006), bodyEdges = new THREE.EdgesGeometry(bodyGeo);
  const faceGeo = new THREE.PlaneGeometry(PAN.w, PAN.h).translate(0, PAN.h / 2, 0);
  const aOccAttr = new THREE.BufferAttribute(sOcc, 1);
  const makePanel = ({ x, y, z, yaw, grid, streets }) => {
    const rig = new THREE.Group(); rig.position.set(x, y, z); rig.rotation.set(-0.05, yaw, 0, "YXZ"); group.add(rig);
    const pan = new THREE.Group(); rig.add(pan);
    // corpo fino, com um fio creme na borda (ele acende um instante quando o painel recebe)
    const bodyM = new THREE.MeshBasicMaterial({ color: 0x1d1b17, transparent: true });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyM); bodyMesh.renderOrder = 54; pan.add(bodyMesh);
    const edgeM = new THREE.LineBasicMaterial({ color: 0xefeae1, transparent: true, opacity: 0.3 });
    pan.add(new THREE.LineSegments(bodyEdges, edgeM));
    const uA = { value: 1 }, uPulse = { value: -99 };
    const faceM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { uA, uGrid: { value: grid ? 1 : 0 } },
      vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
      fragmentShader: `uniform float uA, uGrid; varying vec2 vUv;
        void main() { float vig = smoothstep(1.2, .15, length((vUv - vec2(.5, .56)) * vec2(1.5, 1.15)));
          vec3 c = mix(vec3(.047, .043, .038), vec3(.1, .092, .08), vig);
          vec2 g = abs(fract(vUv * vec2(8., 12.) + .5) - .5) / fwidth(vUv * vec2(8., 12.));
          c += vec3(.94, .92, .88) * (1. - min(min(g.x, g.y), 1.)) * .07 * uGrid;
          gl_FragColor = vec4(c, .98 * uA); }` });
    const faceMesh = new THREE.Mesh(faceGeo, faceM); faceMesh.renderOrder = 55; pan.add(faceMesh);
    let mapM = null;
    if (streets) { mapM = new THREE.MeshBasicMaterial({ color: 0xefeae1, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }); const m = new THREE.Mesh(faceGeo, mapM); m.position.z = 0.008; m.renderOrder = 57; pan.add(m); }
    // as estações: acendem claras quando chegam, soltam um anel no pulso e vão apagando até a publicação seguinte
    const sHit = new Float32Array(SN).fill(0), sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(sp, 3)); sg.setAttribute("aHit", new THREE.BufferAttribute(sHit, 1));
    sg.setAttribute("aOcc", aOccAttr); sg.setAttribute("aIn", new THREE.BufferAttribute(sIn, 1));
    const sm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false,
      uniforms: { uT, uPx, uA, uRing, uPulse, uCyc },
      vertexShader: `uniform float uT, uPx, uPulse, uCyc; attribute float aHit, aOcc, aIn; varying float vH, vO, vP, vI, vF;
        void main() { vH = exp(-max(0., uT - aHit) * 2.2) * step(aHit, uT); vO = aOcc; vI = aIn; vP = (uT - uPulse) / 1.1;
          vF = 1. - smoothstep(.12, 1., clamp((uT - aHit) / uCyc, 0., 1.));
          vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = uPx * (.36 + .44 * aOcc + .1 * vH) * (.82 + .18 * vF) / -mv.z; }`,
      fragmentShader: `uniform float uA, uRing; varying float vH, vO, vP, vI, vF;
        void main() { float d = length(gl_PointCoord - .5), lit = .16 + .84 * vF;
          float core = smoothstep(.15, .12, d) * lit, halo = smoothstep(.36, .26, d) * .2 * vF;
          float tp = clamp(vP, 0., 1.), ring = smoothstep(.035, 0., abs(d - (.16 + .3 * tp))) * (1. - tp) * step(0., vP) * step(vP, 1.);
          ring = max(ring, smoothstep(.03, 0., abs(d - .3)) * uRing * .55);
          vec3 c = mix(vec3(1., .353, .122), vec3(1., .93, .85), vH * .85);
          float a = (max(core, halo) + ring * .9) * vI * uA; if (a < .01) discard; gl_FragColor = vec4(c, a); }` });
    const pts = new THREE.Points(sg, sm); pts.frustumCulled = false; pts.renderOrder = 60; pan.add(pts);
    const v3 = new THREE.Vector3();
    return { rig, pan, x, y, z, bodyM, edgeM, uA, uPulse, mapM, sHit, sg, flash: -99,
      world: (lx, ly, lz) => { v3.set(lx, ly, lz); pan.localToWorld(v3); return [v3.x, v3.y, v3.z]; } };
  };
  const pA = makePanel({ x: -3.75, y: 1.45, z: -4.0, yaw: 0.02, grid: true });
  const pG = makePanel({ x: -0.75, y: 1.45, z: -3.2, yaw: -0.04, streets: true });
  // as ruas de Niterói (OpenStreetMap), no mesmo recorte das estações, só no painel do Gêmeo
  let mapFull = 0;
  {
    const hw = (PAN.w / 2) / sc, hd = (PAN.h / 2) / sc, vb = [(mx - hw) * 100, (mz - hd) * 100, hw * 200, hd * 200], ch = 1400, cw = Math.round(ch * hw / hd);
    fetch(mapSrc).then(r => r.text()).then(t => {
      const svgT = t.replace(/<svg[^>]*>/, m => m.replace(/viewBox="[^"]*"/, `viewBox="${vb.map(v => v.toFixed(1)).join(" ")}" width="${cw}" height="${ch}" preserveAspectRatio="none"`).replace('stroke="#000"', 'stroke="#fff"'));
      const url = URL.createObjectURL(new Blob([svgT], { type: "image/svg+xml" })), img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = cw; c.height = ch; c.getContext("2d").drawImage(img, 0, 0, cw, ch); URL.revokeObjectURL(url);
        const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
        pG.mapM.map = tx; pG.mapM.needsUpdate = true; mapFull = 0.5;
      };
      img.src = url;
    }).catch(() => {});
  }
  // a régua de baixo da camada: enche até a próxima atualização, no relógio do fluxo
  const progM = new THREE.MeshBasicMaterial({ color: 0xff5a1f, transparent: true, opacity: 0.7, depthWrite: false });
  const prog = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.028).translate(0.5, 0, 0), progM); prog.position.set(-PAN.w / 2, 0.014, 0.012); prog.renderOrder = 62; pA.pan.add(prog);
  const CREAM_C = [1, 0.86, 0.72];
  let ringWant = 0, deltaWant = 0.5, hitQ = [], openK = 0, mapFloat = 0;

  // o relógio da simulação: e conta snapshots; a publicação cai em 6k + 3 (meio minuto depois de cada
  // minuto cheio). speed é quantos segundos do fluxo passam em 1 s de tela: 1 é tempo real (um snapshot a
  // cada 10 s), 10 é um snapshot por segundo. Os efeitos de cada publicação duram sempre o mesmo em
  // segundos de tela, em qualquer velocidade, e seguem esta pauta (o fluxograma usa a mesma)
  const T = { read: 0.4, sweep: 1.1, clean: 1.65, cleanDur: 0.9, fly0: 0.75, fly1: 1.3, fly: 1.1, agol: 1.85, gem: 2.6 };
  let e = 60, lx = 0, lw = 0, raf = 0, last = 0, W = 1, H = 1, pose = 0, narrow = false, speed = 10, pubT = -99;
  // a rolagem só mexe na tampa do notebook: lidIn vai de 0 a 1 enquanto a seção sobe na tela, lidOut de 0 a
  // 1 enquanto ela sai por cima
  let lidIn = 1, lidOut = 0;
  const sm01 = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), v = new THREE.Vector3();
  const update = snap => {
    const n = Math.floor(e), r = Math.floor((e - 3) / 6) * 6 + 3, i0 = r - 33, a = r - 3, spf = 10 / speed, tp = snap ? 99 : tS - pubT;
    for (let k = 0; k < N; k++) {
      let c = n - (((n - k) % N) + N) % N; if (c > n) c -= N;
      let st = 3, life = 1, sy = 1, sel = 9;
      if (c < i0) {
        // as fichas que ficaram antes da janela continuam ali, cinza e inteiras, até a publicação mandar
        // apagar; aí se desfazem célula a célula e viram poeira subindo
        const t = (tp - T.clean) / T.cleanDur;
        if (c >= i0 - 6 && t < 1) { st = 0; life = 1 - Math.max(0, t); sy = Math.max(0.001, 0.3 + 0.7 * life); } else { sy = 1e-4; life = 0; }
      } else {
        st = c <= a ? 1 : c <= r ? 2 : 3;
        // as seis que acabaram de entrar na janela ganham o destaque, uma depois da outra
        if (st === 1 && c > a - 6 && tp < 2) { sel = tp - (a - c) * 0.07; if (sel > 0) sy *= 1 + 0.07 * Math.exp(-sel * 5) * Math.sin(Math.min(1, sel * 4) * Math.PI); }
      }
      const age = (e - c) * spf, g = Math.min(1, Math.max(0, age / 0.45));   // a ficha nova cresce do chão
      if (g < 1) { life *= g; sy *= 0.3 + 0.7 * g; }
      p.set((c - e) * HF, 0, 0); s.set(1, sy, 1); m4.compose(p, q, s);
      bodies.setMatrixAt(k, m4); faces.setMatrixAt(k, m4);
      aState.setX(k, st); aSeed.setX(k, (c * 0.7311) % 97); aLife.setX(k, life); aAge.setX(k, age); aSel.setX(k, sel);
    }
    bodies.instanceMatrix.needsUpdate = faces.instanceMatrix.needsUpdate = aState.needsUpdate = aSeed.needsUpdate = aLife.needsUpdate = aAge.needsUpdate = aSel.needsUpdate = true;
    const x0 = (i0 - e) * HF - HF / 2, x1 = (a - e) * HF + HF / 2;
    const k = snap || !lw ? 1 : 0.2;
    lx += ((x0 + x1) / 2 - lx) * k; lw += (x1 - x0 - lw) * k;
    frame.position.x = lx; frame.scale.x = lw;
    // a varredura começa quando a publicação lê a janela
    const f = (tp - T.read) / T.sweep;
    if (f >= 0 && f < 1) { sweepM.opacity = (1 - f) * 0.85; sweep.position.set(lx + lw / 2 - f * lw, 0, 0); } else sweepM.opacity = 0;
    // o rastro dos deltas segue a varredura e apaga devagar depois que ela passa
    U.uSweepX.value = f < 0 ? lx + lw / 2 + 1 : f < 1 ? lx + lw / 2 - f * lw : lx - lw / 2;
    U.uSweepA.value = f < 0 ? 0 : Math.max(0, 1 - Math.max(0, f - 1) * 0.8);
    return { r, a, i0, n, spf };
  };

  // enquadramentos por passo: o geral, perto do "agora" (coleta) e perto do fim da fila (limpeza)
  const POSES = [
    { p: [3.4, 6.2, 15.4], t: [-5.0, 1.5, -1.6] },
    { p: [4.4, 5.0, 11.6], t: [-3.2, 1.6, -1.6] },
    { p: [-0.2, 6.4, 15.2], t: [-6.4, 1.5, -1.6] },
    { p: [1.8, 5.6, 14.6], t: [-5.2, 2.0, -2.4] },
  ];
  const cp = new THREE.Vector3(), ct = new THREE.Vector3(), tp = new THREE.Vector3(), tt = new THREE.Vector3();
  const place = (k, snapCam) => {
    const P = POSES[pose];
    tp.fromArray(P.p); tt.fromArray(P.t);
    if (narrow) { tt.x += 0.6; tp.sub(tt).multiplyScalar(0.92).add(tt); }
    if (snapCam) { cp.copy(tp); ct.copy(tt); } else { cp.lerp(tp, k); ct.lerp(tt, k); }
    camera.position.copy(cp); camera.lookAt(ct);
  };
  const anchors = { janela: new THREE.Vector3(), folga: new THREE.Vector3(), agora: new THREE.Vector3(), limpeza: new THREE.Vector3(), gemeo: new THREE.Vector3(), arcgis: new THREE.Vector3() };
  const label = (el, a) => {
    if (!el) return;
    v.copy(a).project(camera);
    const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H, off = v.z > 1 || x < -40 || x > W + 40;
    // centrada no ponto, mas sem sair pela borda da cena
    const hw = (el._hw || (el._hw = el.offsetWidth / 2)) + 6, cx = el._hw && W > hw * 2 ? Math.min(W - hw, Math.max(hw, x)) : x;
    el.style.transform = `translate3d(${cx.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    el.style.opacity = off ? "0" : "";
  };
  let info = null, lastN = -1, lastR = -1, preN = -1;
  // os acontecimentos da simulação: um pouco antes de cada snapshot (o pacote sai da API e chega no banco
  // quando a ficha nasce), cada snapshot e cada publicação
  const events = (snap) => {
    const n = Math.floor(e), r = info.r, spf = info.spf;
    if (snap) { lastN = n; lastR = r; preN = n; return; }
    // o pacote da coleta sai 0,38 s antes de cada snapshot, para chegar no banco quando a ficha nasce
    if ((n + 1 - e) * spf < 0.38 && preN !== n) { preN = n; on.pre && on.pre(); }
    if (n !== lastN) { lastN = n; on.snap && on.snap(n); }
    if (r !== lastR) {
      lastR = r; pubT = tS; on.pub && on.pub(r);
      // poeira: das fichas cinza, quando elas começam a se desfazer (já contando o quanto a fila anda até lá)
      const ahead = T.clean / spf;
      for (let c = r - 39; c < r - 33; c++) { const x = (c - e - ahead) * HF; for (let j = 0; j < 16; j++) { const st = (c * 7 + j * 5) % 65, [ax, ay, az] = cellPos(x, st); emit(ax, ay, az, ax - 0.3 - Math.random() * 0.7, ay + 1.2 + Math.random() * 1.2, az + (Math.random() - 0.5) * 0.6, T.clean + Math.random() * T.cleanDur, 1.2 + Math.random() * 0.5, DUST); } }
      // a camada: cada estação da janela manda uma partícula até o seu ponto no mapa
      const xs0 = (r - 33 - e) * HF, xs1 = (r - 3 - e) * HF;
      for (let j = 0; j < SN * 2; j++) {
        const st = j % SN, x = xs1 - Math.random() * (xs1 - xs0), [ax, ay, az] = cellPos(x, st % 65);
        const delay = T.fly0 + (j / (SN * 2)) * (T.fly1 - T.fly0) + Math.random() * 0.08;
        if (sIn[st]) { const [bx, by, bz] = pA.world(stLocal[st][0], stLocal[st][1], 0.05); emit(ax, ay, az, bx, by, bz, delay, T.fly, ORANGE_C); hitQ.push([tS + delay + T.fly * 0.95, st, pA]); }
      }
      // do ArcGIS para o Gêmeo: cada estação da camada segue para o mesmo ponto no mapa da cidade e chega
      // junto com o pacote ArcGIS → Gêmeo do fluxograma
      for (let k = 0; k < SN; k++) if (sIn[k]) {
        const A = pA.world(stLocal[k][0], stLocal[k][1], 0.05), B = pG.world(stLocal[k][0], stLocal[k][1], 0.05), d0 = T.gem - 0.7 + (k % 11) * 0.012;
        emit(A[0], A[1], A[2], B[0], B[1], B[2], d0, 0.62, CREAM_C); hitQ.push([tS + d0 + 0.6, k, pG]);
      }
      pA.flash = tS + T.agol; pG.flash = tS + T.gem; pG.uPulse.value = tS + T.gem;
    }
  };
  const draw = (dt, snap) => {
    if (!reduce) { e += dt * speed / 10; tS += dt; }
    uT.value = tS;
    info = update(snap);
    events(snap);
    uRing.value += (ringWant - uRing.value) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    uCyc.value = 60 / speed;   // uma publicação por minuto do fluxo, em segundos de tela
    // o painel chega com a rolagem: sobe, vira de frente e acende, perto do centro da tela; na saída volta
    // pelo mesmo caminho. A rolagem só marca o alvo e o movimento vai até ele amortecido, sem tranco
    const lidGoal = reduce ? 1 : sm01(0.72, 1, lidIn) * (1 - sm01(0.08, 0.4, lidOut));
    openK += (lidGoal - openK) * (snap || reduce ? 1 : 1 - Math.exp(-dt * 4.2));
    if (Math.abs(lidGoal - openK) < 0.0005) openK = lidGoal;
    // os dois chegam um depois do outro: primeiro a camada, logo em seguida o Gêmeo
    if (!reduce) mapFloat = Math.sin(tS * 0.6) * 0.04;
    [pA, pG].forEach((P, i) => {
      const t = Math.min(1, Math.max(0, openK * 1.3 - i * 0.3)), q = t * t * t * (t * (t * 6 - 15) + 10);
      P.pan.position.y = -(1 - q) * 1.3 + mapFloat * (i ? -1 : 1); P.pan.rotation.y = (1 - q) * 0.85;
      const g = tS >= P.flash ? Math.exp(-(tS - P.flash) * 1.8) : 0;
      P.uA.value = q; P.bodyM.opacity = q; P.edgeM.opacity = (0.3 + 0.55 * g) * q; if (P.mapM) P.mapM.opacity = mapFull * q; P.rig.visible = q > 0.004; P.q = q;
    });
    { const fr = Math.min(1, Math.max(0.001, (e - info.r) / 6)); prog.scale.x = PAN.w * fr; progM.opacity = (0.35 + 0.45 * fr) * (pA.q || 0); }
    U.uDelta.value += (deltaWant - U.uDelta.value) * (snap ? 1 : 1 - Math.exp(-dt * 4));
    if (hitQ.length) hitQ = hitQ.filter(([t, k, P]) => { if (tS >= t) { P.sHit[k] = t; P.sg.attributes.aHit.needsUpdate = true; return false; } return true; });
    if (pDirty) { pDirty = false; for (const k of ["position", "aB", "aT", "aC"]) pg.attributes[k].needsUpdate = true; }
    place(snap ? 1 : 1 - Math.exp(-dt * 2.4), snap);
    anchors.janela.set(lx, SH + 0.55, -SD / 2);
    anchors.folga.set((info.a - e) * HF + 1.5 * HF, SH + 0.2, 0);
    anchors.agora.set(0.06, 2.55, SD / 2 + 0.2);
    anchors.limpeza.set((info.i0 - 3 - e) * HF, 0.75, SD / 2);
    // os títulos são rótulos de texto, como os da janela: ficam acima do canto de cada painel e aparecem com ele
    for (const [k, P] of [["arcgis", pA], ["gemeo", pG]]) {
      P.rig.updateMatrixWorld(true); P.pan.localToWorld(anchors[k].set(-PAN.w / 2 - 0.07, PAN.h + 0.22, 0));
      if (labels && labels[k]) labels[k].style.setProperty("--o", (P.q || 0).toFixed(3));
    }
    renderer.render(scene, camera);
    if (labels) for (const k in anchors) label(labels[k], anchors[k]);
  };
  // a fila anda devagar (0,27 por segundo): 30 quadros por segundo bastam e custam a metade
  const frameFn = t => {
    raf = requestAnimationFrame(frameFn);
    if (last && t - last < 31) return;
    const dt = last ? Math.min(0.1, (t - last) / 1000) : 0.016; last = t;
    draw(dt, false);
  };
  const resize = () => {
    const r = canvas.getBoundingClientRect(); W = Math.max(1, r.width); H = Math.max(1, r.height);
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25)); renderer.setSize(W, H, false);
    camera.aspect = W / H;
    // na tela estreita a câmera recua para a fila inteira caber
    camera.fov = W / H < 1.5 ? 40 : 30;
    narrow = W / H < 1.5;
    // na tela estreita o painel fica menor, para caber abaixo do seletor de velocidade
    [pA, pG].forEach((P, i) => { P.rig.scale.setScalar(narrow ? 0.6 : 1); P.rig.position.set(narrow ? (i ? -1.5 : -3.3) : P.x, P.y + (narrow ? 0.15 : 0), P.z); });
    camera.updateProjectionMatrix();
    uPx.value = H * Math.min(devicePixelRatio || 1, 1.25);
  };
  resize(); place(1, true); draw(0, true);
  // a hora que cada snapshot representa: o "agora" da simulação é a hora em que a seção montou
  const T0 = Math.floor(Date.now() / 60000) * 60000 - e * 10000;
  return {
    start() { if (raf) return; last = 0; raf = requestAnimationFrame(frameFn); },
    stop() { cancelAnimationFrame(raf); raf = 0; },
    resize() { resize(); draw(0, true); },
    pose(k) { pose = Math.max(0, Math.min(POSES.length - 1, k)); if (!raf) { place(1, true); draw(0, true); } },
    // o que cada passo destaca: o mapa (e se as partículas voam até ele), os anéis e a força dos deltas
    look({ ring = 0, delta = 0.5 } = {}) { ringWant = ring; deltaWant = delta; },
    setSpeed(x) { speed = x; },
    setLid(a, b) { lidIn = Math.min(1, Math.max(0, a)); lidOut = Math.min(1, Math.max(0, b)); },
    T,
    state() { return { e, r: info ? info.r : 63, speed }; },
    setFill(list) {
      for (let k = 0; k < 65; k++) { const f = list[k] == null ? 0.5 : list[k]; fillData[k * 4] = fillData[k * 4 + 1] = fillData[k * 4 + 2] = Math.round(Math.min(1, Math.max(0, f)) * 255); fillData[k * 4 + 3] = 255; }
      fillTex.needsUpdate = true;
      for (let k = 0; k < SN; k++) sOcc[k] = list[k] == null ? 0.5 : list[k];
      aOccAttr.needsUpdate = true;
    },
    // a última publicação: de quando a quando foi a janela que ela leu
    pub() { const r = info ? info.r : 63; return { at: T0 + r * 10000, de: T0 + (r - 33) * 10000, ate: T0 + (r - 3) * 10000, now: T0 + Math.floor(e) * 10000 }; },
  };
}
