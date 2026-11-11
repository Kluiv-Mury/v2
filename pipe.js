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

  // o mini mapa do Gêmeo: uma lâmina acima da janela com as 65 estações nas posições reais. As partículas
  // da publicação voam de cada célula até a sua estação; ela acende quando a partícula pousa
  const MAP = { x: -3.4, y: 2.5, z: -4.2, w: 6.0, d: 2.8 };
  const mapG = new THREE.Group(); mapG.position.set(MAP.x, MAP.y, MAP.z); group.add(mapG);
  const mapPlateM = new THREE.MeshBasicMaterial({ color: 0x0f120c, transparent: true, opacity: 0, depthWrite: false });
  const mapPlate = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w + 0.5, MAP.d + 0.4).rotateX(-Math.PI / 2), mapPlateM); mapG.add(mapPlate);
  // o corpo da base: uma lâmina com espessura, como a de um notebook
  const BT = 0.2, slabGeo = new THREE.BoxGeometry(MAP.w + 0.5, BT, MAP.d + 0.4).translate(0, -BT / 2 - 0.005, 0);
  const slab = new THREE.Mesh(slabGeo, new THREE.MeshLambertMaterial({ color: 0x23221d, emissive: 0x0b0c08 }));
  mapG.add(slab);
  // as arestas do corpo, bem finas, para a espessura ler contra o fundo escuro
  const slabEdgeM = new THREE.LineBasicMaterial({ color: 0xe6ff57, transparent: true, opacity: 0.22 });
  mapG.add(new THREE.LineSegments(new THREE.EdgesGeometry(slabGeo), slabEdgeM));
  const mapEdgeM = new THREE.LineBasicMaterial({ color: 0xe6ff57, transparent: true, opacity: 0 });
  mapG.add(new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(MAP.w + 0.5, MAP.d + 0.4).rotateX(-Math.PI / 2)), mapEdgeM));
  const sx = stations.map(q => q[0]), sz = stations.map(q => q[1]);
  const bx0 = sx.length ? Math.min(...sx) : 0, bx1 = sx.length ? Math.max(...sx) : 1, bz0 = sz.length ? Math.min(...sz) : 0, bz1 = sz.length ? Math.max(...sz) : 1;
  const sc = Math.min(MAP.w / Math.max(1e-6, bx1 - bx0), MAP.d / Math.max(1e-6, bz1 - bz0));
  const stPos = stations.map(([x, z]) => [MAP.x + (x - (bx0 + bx1) / 2) * sc, MAP.y + 0.02, MAP.z + (z - (bz0 + bz1) / 2) * sc]);
  const SN = Math.max(1, stations.length), sp = new Float32Array(SN * 3), sHit = new Float32Array(SN).fill(-99), sOcc = new Float32Array(SN).fill(0.5);
  stPos.forEach((q, k) => sp.set([q[0] - MAP.x, q[1] - MAP.y, q[2] - MAP.z], k * 3));
  const sg = new THREE.BufferGeometry(); sg.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  sg.setAttribute("aHit", new THREE.BufferAttribute(sHit, 1)); sg.setAttribute("aOcc", new THREE.BufferAttribute(sOcc, 1));
  const uMap = { value: 1 }, uRing = { value: 0 }, uPulse = { value: -99 };
  const sm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uT, uPx, uMap, uRing, uPulse },
    vertexShader: `uniform float uT, uPx, uRing, uPulse; attribute float aHit, aOcc; varying float vH, vO, vP;
      void main() { vH = exp(-max(0., uT - aHit) * 2.2) * step(aHit, uT); vO = aOcc; vP = exp(-max(0., uT - uPulse) * 1.6) * step(uPulse, uT); vec4 mv = modelViewMatrix * vec4(position, 1.);
        gl_Position = projectionMatrix * mv; gl_PointSize = uPx * (.26 + .16 * vH + (uRing + vP * .8) * .34 * (.4 + aOcc)) / -mv.z; }`,
    fragmentShader: `uniform float uMap, uRing, uT; varying float vH, vO, vP;
      void main() { vec2 q = gl_PointCoord - .5; float d = length(q);
        float dot_ = smoothstep(.2, .12, d), ring = smoothstep(.06, 0., abs(d - .36 - .06 * sin(uT * 2. + vO * 6.))) * max(uRing, vP);
        vec3 c = mix(vec3(.9, 1., .34), vec3(1., .97, .9), vH);
        float a = (dot_ * (.55 + .45 * vH) + ring * .7 + smoothstep(.5, .0, d) * vH * .5) * uMap; if (a < .01) discard; gl_FragColor = vec4(c, a); }` });
  const stPts = new THREE.Points(sg, sm); stPts.frustumCulled = false; stPts.renderOrder = 60; mapG.add(stPts);
  // o título da camada fica ao lado do canto da frente da base, longe da tela do Gêmeo
  const mapLbl = sprite("ArcGIS · camada", "#e6ff57"); mapLbl.material.opacity = 0; mapLbl.scale.set(2.5, 0.47, 1); mapLbl.position.set((MAP.w + 0.5) / 2 + 0.2, 0.12, MAP.d / 2 - 0.1); mapLbl.center.set(0, 0.5); mapG.add(mapLbl); mapLbl.renderOrder = 70;
  let mapOn = 1, mapWant = 1, ringWant = 0, deltaWant = 0.5, hitQ = [];

  // o Gêmeo: uma tela presa na borda de trás da camada, como a tampa de um notebook, virada de frente.
  // Ela se abre quando a seção aparece; a cada publicação, cada estação da camada sobe até o seu ponto na
  // tela e uma varredura passa por ela quando tudo chega (no mesmo instante do pacote ArcGIS → Gêmeo)
  const SW = MAP.w + 0.5, HS = 2.7;
  const hinge = new THREE.Group(); hinge.position.set(0, 0, -(MAP.d + 0.4) / 2); mapG.add(hinge);
  const scr = new THREE.Group(); hinge.add(scr);
  // o display: um verde quase preto com degradê, vinheta e linhas de varredura bem fracas, descendo devagar
  const scrM = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true,
    uniforms: { uT },
    vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `uniform float uT; varying vec2 vUv;
      void main() { vec3 c = mix(vec3(.028, .036, .022), vec3(.05, .064, .036), vUv.y);
        float vig = smoothstep(1.15, .25, length((vUv - .5) * vec2(1.1, 1.5)));
        float sl = .5 + .5 * sin(vUv.y * 180. - uT * 2.2), bq = fract(vUv.y - uT * .06) - .5, band = exp(-bq * bq * 40.);
        c = c * (.55 + .45 * vig) + vec3(.9, 1., .34) * (sl * .018 + band * .02);
        gl_FragColor = vec4(c, .97); }` });
  const scrGeo = new THREE.PlaneGeometry(SW, HS).translate(0, HS / 2, 0);
  // a moldura (bezel) em volta do display e a dobradiça
  const LT = 0.12, lidGeo = new THREE.BoxGeometry(SW + 0.22, HS + 0.22, LT).translate(0, HS / 2, -LT / 2 - 0.012);
  const bezel = new THREE.Mesh(lidGeo, new THREE.MeshLambertMaterial({ color: 0x23221d, emissive: 0x0b0c08 }));
  bezel.renderOrder = 54; scr.add(bezel);
  scr.add(new THREE.LineSegments(new THREE.EdgesGeometry(lidGeo), slabEdgeM));
  const hingeBar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, SW * 0.86, 12).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x2c2a25 }));
  hingeBar.position.set(0, -0.06, -(MAP.d + 0.4) / 2 + 0.02); hingeBar.scale.set(1, 1.6, 1.6); mapG.add(hingeBar);
  // a tela vai por baixo de tudo o que é desenhado nela (títulos, linhas, estações)
  const scrMesh = new THREE.Mesh(scrGeo, scrM); scrMesh.renderOrder = 55; scr.add(scrMesh);
  const scrEdgeM = new THREE.LineBasicMaterial({ color: 0xe6ff57, transparent: true, opacity: 0.6 });
  scr.add(new THREE.LineSegments(new THREE.EdgesGeometry(scrGeo), scrEdgeM));
  // a barra de título e umas linhas finas de interface
  const ui = [];
  for (const y of [HS - 0.34]) ui.push(-SW / 2, y, 0.002, SW / 2, y, 0.002);
  const uiM = new THREE.LineBasicMaterial({ color: 0xe6ff57, transparent: true, opacity: 0.22 });
  scr.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(ui, 3)), uiM));
  // a barra de progresso até a próxima atualização: enche no relógio do fluxo e zera quando a camada chega
  const progM = new THREE.MeshBasicMaterial({ color: 0xe6ff57, transparent: true, opacity: 0.7, depthWrite: false });
  const prog = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.028).translate(0.5, 0, 0), progM);
  prog.position.set(-SW / 2, HS - 0.34, 0.012); prog.renderOrder = 62; scr.add(prog);
  const gemLbl = sprite("Gêmeo Digital", "#e6ff57"); gemLbl.scale.set(2.6, 0.49, 1); gemLbl.position.set(-SW / 2 + 1.4, HS - 0.19, 0.01); scr.add(gemLbl);
  const liveLbl = sprite("● ao vivo", "#efeae1"); liveLbl.scale.set(1.9, 0.36, 1); liveLbl.position.set(SW / 2 - 0.95, HS - 0.19, 0.01); scr.add(liveLbl);
  // os títulos olham sempre para a câmera e, com a tela inclinada, metade deles ficaria atrás da moldura
  gemLbl.renderOrder = liveLbl.renderOrder = 70; gemLbl.material.depthTest = liveLbl.material.depthTest = false;
  // as estações na tela: o mesmo desenho da camada, de pé (a profundidade da camada vira a altura da tela)
  const gp = new Float32Array(SN * 3), gHit = new Float32Array(SN).fill(-99);
  const scrY = z => HS * 0.47 - (z / (MAP.d / 2)) * HS * 0.36;
  stPos.forEach((q, k) => gp.set([q[0] - MAP.x, scrY(q[2] - MAP.z), 0.02], k * 3));
  const gg = new THREE.BufferGeometry(); gg.setAttribute("position", new THREE.BufferAttribute(gp, 3));
  gg.setAttribute("aHit", new THREE.BufferAttribute(gHit, 1)); gg.setAttribute("aOcc", new THREE.BufferAttribute(sOcc, 1));
  const uGem = { value: -99 };
  const gm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending,
    uniforms: { uT, uPx, uGem },
    vertexShader: `uniform float uT, uPx, uGem; attribute float aHit, aOcc; varying float vH, vO, vP;
      void main() { vH = exp(-max(0., uT - aHit) * 2.) * step(aHit, uT); vO = aOcc; vP = exp(-max(0., uT - uGem) * 1.2) * step(uGem, uT);
        vec4 mv = modelViewMatrix * vec4(position, 1.); gl_Position = projectionMatrix * mv; gl_PointSize = uPx * (.3 + .18 * vH + .5 * (.35 + aOcc) * (.35 + vP)) / -mv.z; }`,
    fragmentShader: `uniform float uT; varying float vH, vO, vP;
      void main() { float d = length(gl_PointCoord - .5);
        float dot_ = smoothstep(.17, .1, d), ring = smoothstep(.05, 0., abs(d - .32 - .08 * sin(uT * 2.2 + vO * 6.))) * (.25 + .75 * vP);
        vec3 c = mix(vec3(.9, 1., .34), vec3(1., .97, .9), vH);
        float tw = .72 + .28 * sin(uT * 2.6 + vO * 37. + gl_FragCoord.x * .0);
        float a = dot_ * (.6 + .4 * vH) * tw + ring * .65 + smoothstep(.5, 0., d) * vH * .45; if (a < .01) discard; gl_FragColor = vec4(c, a); }` });
  const gemPts = new THREE.Points(gg, gm); gemPts.frustumCulled = false; gemPts.renderOrder = 61; scr.add(gemPts);
  // o mapa de Niterói (ruas do OpenStreetMap) em verde, recortado na região das estações: o mesmo recorte
  // vai deitado na camada e de pé na tela, então cada estação cai na rua certa nos dois
  const mapMatB = new THREE.MeshBasicMaterial({ color: 0xe6ff57, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const mapMatS = new THREE.MeshBasicMaterial({ color: 0xe6ff57, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const baseMap = new THREE.Mesh(new THREE.PlaneGeometry(MAP.w + 0.5, MAP.d + 0.4).rotateX(-Math.PI / 2), mapMatB); baseMap.position.y = 0.006; baseMap.renderOrder = 58; mapG.add(baseMap);
  const scrMapH = 2 * ((MAP.d + 0.4) / MAP.d) * HS * 0.36;
  const scrMap = new THREE.Mesh(new THREE.PlaneGeometry(SW, scrMapH), mapMatS); scrMap.position.set(0, HS * 0.47, 0.006); scrMap.renderOrder = 57; scr.add(scrMap);
  {
    const cxS = (bx0 + bx1) / 2, czS = (bz0 + bz1) / 2, hw = (MAP.w + 0.5) / (2 * sc), hd = (MAP.d + 0.4) / (2 * sc);
    const vb = [(cxS - hw) * 100, (czS - hd) * 100, hw * 200, hd * 200], cw = 1400, ch = Math.round(cw * hd / hw);
    fetch(mapSrc).then(r => r.text()).then(t => {
      const svgT = t.replace(/<svg[^>]*>/, m => m.replace(/viewBox="[^"]*"/, `viewBox="${vb.map(v => v.toFixed(1)).join(" ")}" width="${cw}" height="${ch}" preserveAspectRatio="none"`).replace('stroke="#000"', 'stroke="#fff"').replace(/<svg/, '<svg stroke-opacity="1"'));
      const url = URL.createObjectURL(new Blob([svgT], { type: "image/svg+xml" })), img = new Image();
      img.onload = () => {
        const c = document.createElement("canvas"); c.width = cw; c.height = ch; c.getContext("2d").drawImage(img, 0, 0, cw, ch); URL.revokeObjectURL(url);
        const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace; tx.anisotropy = 4;
        mapMatB.map = mapMatS.map = tx; mapMatB.needsUpdate = mapMatS.needsUpdate = true; mapMatB.opacity = 0.6; mapMatS.opacity = 0.55;
      };
      img.src = url;
    }).catch(() => {});
  }
  // o reflexo da tela na base: um brilho verde fraco que nasce na dobradiça e some para a frente
  const gc = document.createElement("canvas"); gc.width = 4; gc.height = 128;
  { const x = gc.getContext("2d"), gr = x.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, "rgba(230,255,87,.5)"); gr.addColorStop(1, "rgba(230,255,87,0)"); x.fillStyle = gr; x.fillRect(0, 0, 4, 128); }
  const glowB = new THREE.Mesh(new THREE.PlaneGeometry(SW * 0.92, 1.3).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(gc), transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
  glowB.position.set(0, 0.008, -(MAP.d + 0.4) / 2 + 0.65); glowB.renderOrder = 58; mapG.add(glowB);
  // a varredura de recebimento: uma faixa limão que desce pela tela
  const scanM = new THREE.MeshBasicMaterial({ color: 0xe6ff57, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, forceSinglePass: true });
  const scan = new THREE.Mesh(new THREE.PlaneGeometry(SW - 0.04, 0.08), scanM); scan.position.z = 0.015; scr.add(scan);
  let openT = -1, openK = 0, mapFloat = 0;
  const OPEN = -0.1, SHUT = Math.PI / 2 * 0.985;
  const easeBack = t => { const c = 1.25; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
  hinge.rotation.x = reduce ? OPEN : SHUT;
  const gemWorld = new THREE.Vector3();

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
  const anchors = { janela: new THREE.Vector3(), folga: new THREE.Vector3(), agora: new THREE.Vector3(), limpeza: new THREE.Vector3() };
  const label = (el, a) => {
    if (!el) return;
    v.copy(a).project(camera);
    const x = (v.x * 0.5 + 0.5) * W, y = (-v.y * 0.5 + 0.5) * H, off = v.z > 1 || x < -40 || x > W + 40;
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
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
        if (stPos[st]) { const [bx, by, bz] = stPos[st]; emit(ax, ay, az, bx, by, bz, delay, T.fly, ORANGE_C); hitQ.push([tS + delay + T.fly * 0.95, st]); }
      }
      // do ArcGIS para o Gêmeo: depois que a camada recebe, cada estação sobe até a tela
      mapG.updateMatrixWorld(true);
      for (let k = 0; k < SN; k++) {
        const [ax, ay, az] = stPos[k];
        gemWorld.set(gp[k * 3], gp[k * 3 + 1], gp[k * 3 + 2]); gemPts.localToWorld(gemWorld);
        emit(ax, ay, az, gemWorld.x, gemWorld.y, gemWorld.z, T.gem - 0.62 + (k % 9) * 0.012, 0.62, LIME_C);
        gHit[k] = tS + T.gem;
      }
      gg.attributes.aHit.needsUpdate = true;
      uGem.value = tS + T.gem;
    }
  };
  const draw = (dt, snap) => {
    if (!reduce) { e += dt * speed / 10; tS += dt; }
    uT.value = tS;
    info = update(snap);
    events(snap);
    // o mapa aparece nos passos da camada e do Gêmeo; os anéis por ocupação só no último
    mapOn += (mapWant - mapOn) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    uMap.value = mapOn; uRing.value += (ringWant - uRing.value) * (snap ? 1 : 1 - Math.exp(-dt * 3));
    // a tampa abre uma vez, quando a seção aparece; depois só a varredura passa a cada recebimento
    // a tampa abre sempre que a seção entra na tela (stop() a fecha de novo quando ela sai)
    // a tampa abre quando o notebook já está perto do centro da tela (o fim da entrada da seção) e fecha
    // na saída antes de ele chegar à borda de cima; rolar de volta reabre
    // a rolagem só marca o alvo; a tampa vai até ele amortecida (cerca de meio segundo), então um giro
    // brusco da roda do mouse não vira um tranco. Sem passar do ponto: a curva só acelera e freia
    const lidGoal = reduce ? 1 : sm01(0.72, 1, lidIn) * (1 - sm01(0.08, 0.4, lidOut));
    openK += (lidGoal - openK) * (snap || reduce ? 1 : 1 - Math.exp(-dt * 4.2));
    if (Math.abs(lidGoal - openK) < 0.0005) openK = lidGoal;
    hinge.rotation.x = SHUT + (OPEN - SHUT) * (openK * openK * openK * (openK * (openK * 6 - 15) + 10));
    // o notebook flutua bem de leve, para não parecer congelado entre uma publicação e outra
    if (!reduce) { mapFloat = Math.sin(tS * 0.75) * 0.05; mapG.rotation.y = Math.sin(tS * 0.31) * 0.012; }
    { const S = info, fr = Math.min(1, Math.max(0.001, (e - S.r) / 6)); prog.scale.x = SW * fr; progM.opacity = 0.35 + 0.45 * fr; }
    const sc_ = (tS - uGem.value) / 0.75;
    if (sc_ >= 0 && sc_ < 1) { scanM.opacity = 0.55 * (1 - sc_); scan.position.y = HS - 0.4 - sc_ * (HS - 0.6); } else scanM.opacity = 0;
    liveLbl.material.opacity = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(tS * 3.2));
    { const g = Math.exp(-Math.max(0, tS - uGem.value) * 1.6) * (tS >= uGem.value ? 1 : 0); glowB.material.opacity = 0.14 + 0.3 * g; scrEdgeM.opacity = 0.5 + 0.4 * g; }
    mapPlateM.opacity = 0.85 * mapOn; mapEdgeM.opacity = 0.55 * mapOn; mapLbl.material.opacity = mapOn; mapG.visible = mapOn > 0.01;
    mapG.position.y = MAP.y + (1 - mapOn) * 0.4 + mapFloat;
    U.uDelta.value += (deltaWant - U.uDelta.value) * (snap ? 1 : 1 - Math.exp(-dt * 4));
    if (hitQ.length) { let ch = false; hitQ = hitQ.filter(([t, k]) => { if (tS >= t) { sHit[k] = t; ch = true; return false; } return true; }); if (ch) sg.attributes.aHit.needsUpdate = true; }
    if (pDirty) { pDirty = false; for (const k of ["position", "aB", "aT", "aC"]) pg.attributes[k].needsUpdate = true; }
    place(snap ? 1 : 1 - Math.exp(-dt * 2.4), snap);
    anchors.janela.set(lx, SH + 0.55, -SD / 2);
    anchors.folga.set((info.a - e) * HF + 1.5 * HF, SH + 0.2, 0);
    anchors.agora.set(0.06, 2.55, SD / 2 + 0.2);
    anchors.limpeza.set((info.i0 - 3 - e) * HF, 0.75, SD / 2);
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
    // na tela estreita não sobra lugar livre para o título da camada (do lado sai da tela, na frente fica
    // atrás do bloco): ali ele some e a tela do Gêmeo, que tem título, explica o conjunto
    mapLbl.visible = !narrow;
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
      sg.attributes.aOcc.needsUpdate = true; gg.attributes.aOcc.needsUpdate = true;
    },
    // a última publicação: de quando a quando foi a janela que ela leu
    pub() { const r = info ? info.r : 63; return { at: T0 + r * 10000, de: T0 + (r - 33) * 10000, ate: T0 + (r - 3) * 10000, now: T0 + Math.floor(e) * 10000 }; },
  };
}
