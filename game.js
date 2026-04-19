// ---------- DOM (resolved early, before any potentially-throwing import) ----------
const canvas = document.getElementById("game");
const overlay = document.getElementById("overlay");
const hud = {
  timer: document.getElementById("timer"),
  drpm: document.getElementById("drpm"),
  dang: document.getElementById("dang"),
  range: document.getElementById("range"),
  fuel: document.getElementById("fuel"),
  status: document.getElementById("status"),
  barRpm: document.getElementById("bar-rpm"),
  barAng: document.getElementById("bar-ang"),
  barRange: document.getElementById("bar-range"),
  barFuel: document.getElementById("bar-fuel"),
  lock: document.getElementById("lock-indicator"),
  hint: document.getElementById("hint"),
};

function showError(e) {
  console.error(e);
  if (hud.status) hud.status.textContent = "ERR: " + (e.message || e);
  const panel = overlay && overlay.querySelector(".panel");
  if (panel) {
    panel.innerHTML = `<h1 style="color:var(--warn)">BOOT ERROR</h1>
      <p class="tagline">// COULD NOT INITIALIZE SCENE</p>
      <pre style="white-space:pre-wrap;font-size:14px;color:#ffcf6b">${(e.stack || e.message || e) + ""}</pre>
      <button id="start-retry" style="margin-top:12px;background:transparent;color:var(--amber);border:1px solid var(--amber);padding:10px 18px;font-family:inherit;font-size:18px;cursor:pointer">RELOAD</button>`;
    panel.querySelector("#start-retry").addEventListener("click", () => location.reload());
  }
}

window.addEventListener("error", (e) => showError(e.error || e.message));
window.addEventListener("unhandledrejection", (e) => showError(e.reason));

// ---------- CLICK HANDLER (delegated so button always responds, even if init fails) ----------
let gameReady = false;
let onStart = () => { /* replaced below once engine boots */ };

document.addEventListener("click", (e) => {
  const t = e.target;
  if (t && (t.id === "start" || t.closest && t.closest("#start"))) {
    e.preventDefault();
    if (gameReady) onStart();
    else hud.status.textContent = "SCENE NOT READY YET";
  }
});

// ---------- BOOT (async so we can await the three.js import) ----------
(async function boot() {
  try {
    hud.status.textContent = "LOADING SCENE...";
    const [THREE, EC, RP, UBP, OP] = await Promise.all([
      import("three"),
      import("three/addons/postprocessing/EffectComposer.js"),
      import("three/addons/postprocessing/RenderPass.js"),
      import("three/addons/postprocessing/UnrealBloomPass.js"),
      import("three/addons/postprocessing/OutputPass.js"),
    ]);
    await startEngine({
      THREE,
      EffectComposer: EC.EffectComposer,
      RenderPass: RP.RenderPass,
      UnrealBloomPass: UBP.UnrealBloomPass,
      OutputPass: OP.OutputPass,
    });
    gameReady = true;
    hud.status.textContent = "STANDBY";
  } catch (err) {
    showError(err);
  }
})();

// ---------- ENGINE ----------
async function startEngine({ THREE, EffectComposer, RenderPass, UnrealBloomPass, OutputPass }) {
  const DEG = Math.PI / 180;
  const TOL = { rpm: 2.0, ang: 8.0, range: 10 };
  const LOCK_HOLD = 2.5;
  const WORLD_SCALE = 0.15;
  const RING_R = 1.0;
  const PHOSPHOR = 0x7cff9e;
  const AMBER = 0xffcf6b;

  // renderer
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setClearColor(0x000205, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000205);
  const camera = new THREE.PerspectiveCamera(62, 1, 0.05, 4000);
  scene.add(camera);

  // Sun — warm key light off to the left-back, consistent with planet position
  const sun = new THREE.DirectionalLight(0xfff0d4, 2.4);
  sun.position.set(-4, 2.5, -1.5);
  scene.add(sun);

  // Rim — faint phosphor fill from opposite side
  const rim = new THREE.DirectionalLight(0x8fffc0, 0.35);
  rim.position.set(3, -1, 2);
  scene.add(rim);

  // Ambient — very low so shadows read
  scene.add(new THREE.AmbientLight(0x141c1a, 0.7));

  // Post-processing: bloom + tone-mapped output
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.9, 0.55, 0.18);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  function resize() {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    composer.setSize(r.width, r.height);
    bloom.setSize(r.width, r.height);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  window.addEventListener("load", resize);

  // ---- scene ----
  function buildStars() {
    const g = new THREE.Group();

    // Layer 1: dense small stars
    const n1 = 3200, R1 = 1200;
    const p1 = new Float32Array(n1 * 3);
    const col1 = new Float32Array(n1 * 3);
    for (let i = 0; i < n1; i++) {
      const u = Math.random(), v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = R1 * (0.7 + Math.random() * 0.3);
      p1[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      p1[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      p1[i * 3 + 2] = r * Math.cos(phi);
      // Color variety: mostly white, some warm, some cool
      const hue = Math.random();
      if (hue < 0.7)      { col1[i*3]=1; col1[i*3+1]=1; col1[i*3+2]=1; }
      else if (hue < 0.85){ col1[i*3]=1; col1[i*3+1]=0.85; col1[i*3+2]=0.65; }
      else                { col1[i*3]=0.75; col1[i*3+1]=0.9; col1[i*3+2]=1; }
    }
    const geo1 = new THREE.BufferGeometry();
    geo1.setAttribute("position", new THREE.BufferAttribute(p1, 3));
    geo1.setAttribute("color", new THREE.BufferAttribute(col1, 3));
    g.add(new THREE.Points(geo1, new THREE.PointsMaterial({
      size: 1.4, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.9,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })));

    // Layer 2: sparse bright stars (will bloom)
    const n2 = 260, R2 = 1000;
    const p2 = new Float32Array(n2 * 3);
    for (let i = 0; i < n2; i++) {
      const u = Math.random(), v = Math.random();
      const theta = 2 * Math.PI * u;
      const phi = Math.acos(2 * v - 1);
      const r = R2 * (0.7 + Math.random() * 0.3);
      p2[i * 3]     = r * Math.sin(phi) * Math.cos(theta);
      p2[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      p2[i * 3 + 2] = r * Math.cos(phi);
    }
    const geo2 = new THREE.BufferGeometry();
    geo2.setAttribute("position", new THREE.BufferAttribute(p2, 3));
    g.add(new THREE.Points(geo2, new THREE.PointsMaterial({
      color: 0xffffff, size: 4.5, sizeAttenuation: true,
      transparent: true, opacity: 1.0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    })));

    // Layer 3: very distant galaxy band — a thin elliptical smear
    const n3 = 1400;
    const p3 = new Float32Array(n3 * 3);
    const col3 = new Float32Array(n3 * 3);
    for (let i = 0; i < n3; i++) {
      const t = Math.random() * Math.PI * 2;
      const bandR = 1600 + (Math.random() - 0.5) * 220;
      const h = (Math.random() - 0.5) * 120;
      p3[i * 3]     = Math.cos(t) * bandR;
      p3[i * 3 + 1] = h;
      p3[i * 3 + 2] = Math.sin(t) * bandR;
      // Soft purple/blue tones
      col3[i*3]=0.6 + Math.random()*0.2;
      col3[i*3+1]=0.5 + Math.random()*0.2;
      col3[i*3+2]=0.9;
    }
    const geo3 = new THREE.BufferGeometry();
    geo3.setAttribute("position", new THREE.BufferAttribute(p3, 3));
    geo3.setAttribute("color", new THREE.BufferAttribute(col3, 3));
    const galaxy = new THREE.Points(geo3, new THREE.PointsMaterial({
      size: 2.2, sizeAttenuation: true, vertexColors: true,
      transparent: true, opacity: 0.45,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    galaxy.rotation.x = 0.35;
    galaxy.rotation.z = -0.4;
    g.add(galaxy);

    return g;
  }

  function buildPlanet() {
    const g = new THREE.Group();
    const pos = new THREE.Vector3(-160, 40, -620);

    // Planet surface — lit by the sun
    const planet = new THREE.Mesh(
      new THREE.SphereGeometry(140, 96, 64),
      new THREE.MeshStandardMaterial({
        color: 0x162a20,
        roughness: 0.95,
        metalness: 0.0,
        emissive: 0x010402,
      })
    );
    planet.position.copy(pos);
    g.add(planet);

    // Atmospheric rim (fresnel-ish shell using BackSide)
    const atmo = new THREE.Mesh(
      new THREE.SphereGeometry(148, 64, 48),
      new THREE.ShaderMaterial({
        transparent: true,
        side: THREE.BackSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { tint: { value: new THREE.Color(0x7cff9e) } },
        vertexShader: `
          varying vec3 vN;
          void main() {
            vN = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: `
          uniform vec3 tint;
          varying vec3 vN;
          void main() {
            float rim = pow(1.0 - abs(vN.z), 3.0);
            gl_FragColor = vec4(tint * rim * 1.8, rim);
          }
        `,
      })
    );
    atmo.position.copy(pos);
    g.add(atmo);

    // Faint halo disc (edge-lit ring in the plane of view)
    const halo = new THREE.Mesh(
      new THREE.RingGeometry(150, 280, 128, 1),
      new THREE.MeshBasicMaterial({
        color: 0x7cff9e, transparent: true, opacity: 0.08,
        side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    halo.position.copy(pos);
    halo.rotation.x = -0.55;
    halo.rotation.z = 0.2;
    g.add(halo);

    return g;
  }

  function buildEndurance() {
    const g = new THREE.Group();
    // PBR hull
    const hullMat  = new THREE.MeshStandardMaterial({
      color: 0x9aa8a0, metalness: 0.75, roughness: 0.45,
    });
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x6b7a72, metalness: 0.7, roughness: 0.55,
    });
    const hubMat   = new THREE.MeshStandardMaterial({
      color: 0xb0bcb3, metalness: 0.85, roughness: 0.35,
    });
    // Emissive window/light (blooms under post)
    const windowMat = new THREE.MeshStandardMaterial({
      color: 0x000000, emissive: 0xffcf6b, emissiveIntensity: 2.4,
      roughness: 1, metalness: 0,
    });
    // Subtle panel-line accents
    const ringMat = new THREE.LineBasicMaterial({ color: 0x7cff9e, transparent: true, opacity: 0.3 });
    const dimMat  = new THREE.LineBasicMaterial({ color: 0x7cff9e, transparent: true, opacity: 0.18 });
    // Radiator glow (red hot fins)
    const radMat = new THREE.MeshStandardMaterial({
      color: 0x220a05, emissive: 0xff5533, emissiveIntensity: 1.4,
      roughness: 0.8, metalness: 0.2,
    });

    const outerR = RING_R;         // 1.0
    const innerR = RING_R * 0.32;  // inner connector ring
    const segs = 12;

    function edgedBox(parent, w, h, d, px, py, pz, rz, fill = panelMat, edgeMat = ringMat) {
      const geo = new THREE.BoxGeometry(w, h, d);
      const m = new THREE.Mesh(geo, fill);
      m.position.set(px, py, pz);
      m.rotation.z = rz;
      parent.add(m);
      const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 1), edgeMat);
      e.position.copy(m.position);
      e.rotation.copy(m.rotation);
      parent.add(e);
      return m;
    }

    // ---- 12 MODULES (alternating hab / lander) ----
    const portModuleIndex = 3; // angle π/2 (top of ring) — docking target
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const cx = Math.cos(a) * outerR;
      const cy = Math.sin(a) * outerR;
      const isHab = i % 2 === 0;

      const mg = new THREE.Group();
      mg.position.set(cx, cy, 0);
      mg.rotation.z = a + Math.PI / 2; // long axis tangent to ring
      g.add(mg);

      if (isHab) {
        // Habitation: wider rectangular module with window slots on camera-facing face
        const w = 0.36, h = 0.18, d = 0.22;
        edgedBox(mg, w, h, d, 0, 0, 0, 0);
        for (let j = 0; j < 3; j++) {
          const lx = -w * 0.3 + j * w * 0.3;
          const wm = new THREE.Mesh(
            new THREE.PlaneGeometry(0.035, 0.09),
            windowMat
          );
          wm.position.set(lx, 0, d / 2 + 0.002);
          mg.add(wm);
        }
      } else {
        // Lander: shorter, near-square module with 3 portholes (triangular pattern)
        const w = 0.26, h = 0.22, d = 0.22;
        edgedBox(mg, w, h, d, 0, 0, 0, 0);
        const circles = [[-0.07, -0.05], [0.07, -0.05], [0, 0.05]];
        for (const [lx, ly] of circles) {
          const ph = new THREE.Mesh(
            new THREE.CircleGeometry(0.026, 18),
            windowMat
          );
          ph.position.set(lx, ly, d / 2 + 0.002);
          mg.add(ph);
        }
      }

      // ---- CONNECTOR TUBE between module i and module i+1 ----
      const a2 = ((i + 1) / segs) * Math.PI * 2;
      const midA = (a + a2) / 2;
      const chord = 2 * outerR * Math.sin(Math.PI / segs);
      const tubeLen = chord * 0.45; // leaves gaps for module ends
      const tubeR = 0.05;
      const cG = new THREE.Group();
      cG.position.set(Math.cos(midA) * outerR, Math.sin(midA) * outerR, 0);
      cG.rotation.z = midA + Math.PI / 2;
      g.add(cG);
      const cylGeo = new THREE.CylinderGeometry(tubeR, tubeR, tubeLen, 12);
      const cyl = new THREE.Mesh(cylGeo, panelMat);
      cG.add(cyl);
      const cylEdges = new THREE.LineSegments(new THREE.EdgesGeometry(cylGeo, 1), dimMat);
      cG.add(cylEdges);
      // End caps (small flat discs)
      const cap1 = new THREE.Mesh(
        new THREE.CylinderGeometry(tubeR * 1.15, tubeR * 1.15, 0.02, 12),
        panelMat
      );
      cap1.position.y = tubeLen / 2;
      cG.add(cap1);
      const cap2 = cap1.clone();
      cap2.position.y = -tubeLen / 2;
      cG.add(cap2);
    }

    // ---- INNER CONNECTOR RING ----
    const innerTorusGeo = new THREE.TorusGeometry(innerR, 0.03, 10, 60);
    g.add(new THREE.Mesh(innerTorusGeo, panelMat));
    g.add(new THREE.LineSegments(new THREE.EdgesGeometry(innerTorusGeo, 1), dimMat));

    // ---- 4 RADIAL ARMS (+ pattern, hub → inner ring) ----
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const hubEdge = 0.18;
      const armLen = innerR - hubEdge;
      const armCx = Math.cos(a) * (hubEdge + armLen / 2);
      const armCy = Math.sin(a) * (hubEdge + armLen / 2);
      edgedBox(g, armLen, 0.09, 0.1, armCx, armCy, 0, a);
    }

    // ---- 4 SECONDARY ARMS (inner ring → outer ring, aligned with hub arms) ----
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const startR = innerR + 0.03;
      const endR = outerR - 0.11;
      const len = endR - startR;
      const cx = Math.cos(a) * (startR + len / 2);
      const cy = Math.sin(a) * (startR + len / 2);
      edgedBox(g, len, 0.05, 0.07, cx, cy, 0, a, panelMat, dimMat);
    }

    // ---- CENTRAL HUB: cockpit cylinder + 4 wing panels + cross ----
    // core cylinder
    const coreGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.22, 18);
    const core = new THREE.Mesh(coreGeo, hubMat);
    core.rotation.x = Math.PI / 2;
    g.add(core);
    const coreEdges = new THREE.LineSegments(new THREE.EdgesGeometry(coreGeo, 1), ringMat);
    coreEdges.rotation.x = Math.PI / 2;
    g.add(coreEdges);

    // 4 wings (curved-ish — approximated with a box pressed to form a paddle shape)
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4; // between arms
      const wx = Math.cos(a) * 0.2;
      const wy = Math.sin(a) * 0.2;
      edgedBox(g, 0.18, 0.08, 0.12, wx, wy, 0, a, hubMat, ringMat);
    }

    // central cross (docking crosshair in the cockpit face)
    const crossPts = [
      new THREE.Vector3(-0.09, 0, 0.12), new THREE.Vector3(0.09, 0, 0.12),
      new THREE.Vector3(0, -0.09, 0.12), new THREE.Vector3(0, 0.09, 0.12),
    ];
    g.add(new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints(crossPts),
      ringMat
    ));
    // small circle on the cockpit face
    {
      const pts = [];
      const cr = 0.05;
      for (let i = 0; i <= 32; i++) {
        const t = (i / 32) * Math.PI * 2;
        pts.push(new THREE.Vector3(Math.cos(t) * cr, Math.sin(t) * cr, 0.121));
      }
      g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat));
    }

    // ---- RADIATOR FINS on secondary arms ----
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const rx = Math.cos(a) * (innerR + 0.25);
      const ry = Math.sin(a) * (innerR + 0.25);
      for (const side of [-1, 1]) {
        const fin = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.01, 0.14),
          radMat
        );
        fin.position.set(
          rx + Math.cos(a + Math.PI / 2) * 0.07 * side,
          ry + Math.sin(a + Math.PI / 2) * 0.07 * side,
          0
        );
        fin.rotation.z = a;
        g.add(fin);
      }
    }

    // ---- ANTENNA SPIKES on hub ----
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const ant = new THREE.Mesh(
        new THREE.CylinderGeometry(0.005, 0.005, 0.22, 6),
        hullMat
      );
      ant.position.set(Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.14);
      g.add(ant);
      const tip = new THREE.Mesh(
        new THREE.SphereGeometry(0.012, 6, 6),
        new THREE.MeshStandardMaterial({ color: 0, emissive: 0x7cff9e, emissiveIntensity: 3 })
      );
      tip.position.set(Math.cos(a) * 0.18, Math.sin(a) * 0.18, 0.25);
      g.add(tip);
    }

    // ---- BEACON LIGHTS on modules (tiny blinking emissives) ----
    const beacons = [];
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      const bMat = new THREE.MeshStandardMaterial({
        color: 0, emissive: i % 2 === 0 ? 0x5effa0 : 0xffcf6b,
        emissiveIntensity: 2.2,
      });
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.015, 8, 8), bMat);
      b.position.set(Math.cos(a) * (outerR + 0.12), Math.sin(a) * (outerR + 0.12), 0);
      g.add(b);
      beacons.push(bMat);
    }

    // ---- DOCKING PORT MARKERS (at module index 3, top of ring) ----
    const portA = (portModuleIndex / segs) * Math.PI * 2; // π/2
    const portX = Math.cos(portA) * outerR;
    const portY = Math.sin(portA) * outerR;

    const portMat = new THREE.MeshStandardMaterial({
      color: 0, emissive: AMBER, emissiveIntensity: 3.5,
    });
    const port = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.2, 4), portMat);
    port.position.set(portX, portY + 0.22, 0);
    port.rotation.z = Math.PI;
    g.add(port);

    const bracketMat = new THREE.MeshStandardMaterial({
      color: 0, emissive: AMBER, emissiveIntensity: 2.5,
    });
    const bracket = new THREE.Mesh(
      new THREE.TorusGeometry(0.09, 0.012, 8, 24),
      bracketMat
    );
    bracket.position.set(portX, portY + 0.13, 0);
    bracket.rotation.x = Math.PI / 2;
    g.add(bracket);

    const lightMat = new THREE.MeshStandardMaterial({
      color: 0, emissive: AMBER, emissiveIntensity: 4,
    });
    for (const dx of [-0.12, 0.12]) {
      const dot = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), lightMat);
      dot.position.set(portX + dx, portY + 0.13, 0);
      g.add(dot);
    }

    g.userData = { port, bracket, bracketMat, ringMat, portMat, lightMat, beacons };
    return g;
  }

  const stars = buildStars();
  scene.add(stars);
  const planetGroup = buildPlanet();
  scene.add(planetGroup);
  const endurance = buildEndurance();
  scene.add(endurance);

  resize();
  requestAnimationFrame(resize);

  // ---- audio ----
  let audioCtx = null;
  function beep(freq = 440, dur = 0.1, type = "square", gain = 0.05) {
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = gain;
      o.connect(g).connect(audioCtx.destination);
      o.start();
      g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
      o.stop(audioCtx.currentTime + dur + 0.02);
    } catch {}
  }
  function successChime() {
    beep(523, 0.12, "square", 0.06);
    setTimeout(() => beep(659, 0.12, "square", 0.06), 120);
    setTimeout(() => beep(784, 0.22, "square", 0.06), 240);
  }
  function failBuzz() {
    beep(120, 0.5, "sawtooth", 0.08);
    setTimeout(() => beep(80, 0.5, "sawtooth", 0.08), 120);
  }

  // ---- MUSIC (original score, inspired-not-identical to the docking sequence) ----
  let music = null;

  function createDockingMusic() {
    const ctx = audioCtx;

    // Master bus → destination (no compressor, no filter — keep it simple)
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.6, ctx.currentTime);
    master.connect(ctx.destination);

    // Reverb: single-tap feedback delay, sends directly to master
    const revDelay = ctx.createDelay(1.2);
    revDelay.delayTime.value = 0.38;
    const revFB = ctx.createGain();
    revFB.gain.value = 0.38;
    const revOut = ctx.createGain();
    revOut.gain.value = 0.35;
    revDelay.connect(revFB);
    revFB.connect(revDelay);
    revDelay.connect(revOut);
    revOut.connect(master);

    function organ(freqs, start, dur, vol) {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(vol, start + 0.35);
      const holdUntil = Math.max(start + 0.5, start + dur - 0.6);
      g.gain.setValueAtTime(vol, holdUntil);
      g.gain.linearRampToValueAtTime(0, start + dur);
      g.connect(master);
      g.connect(revDelay);
      for (const f of freqs) {
        for (const det of [-6, 0, 6]) {
          const osc = ctx.createOscillator();
          osc.type = "sawtooth";
          osc.frequency.value = f;
          osc.detune.value = det;
          osc.connect(g);
          osc.start(start);
          osc.stop(start + dur + 0.1);
        }
      }
    }

    function pluck(freq, start, dur, vol) {
      const osc = ctx.createOscillator();
      osc.type = "triangle";
      osc.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, start);
      g.gain.linearRampToValueAtTime(vol, start + 0.01);
      g.gain.linearRampToValueAtTime(0, start + dur);
      osc.connect(g);
      g.connect(master);
      g.connect(revDelay);
      osc.start(start);
      osc.stop(start + dur + 0.05);
    }

    function tick(start, vol = 0.04) {
      const osc = ctx.createOscillator();
      osc.type = "square";
      osc.frequency.value = 2600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, start);
      g.gain.linearRampToValueAtTime(0, start + 0.03);
      osc.connect(g);
      g.connect(master);
      osc.start(start);
      osc.stop(start + 0.05);
    }

    const tempo = 84;
    const beat = 60 / tempo;
    const bar = 4 * beat;

    // Progression (differs from source): Dm · Dm · Bb · Gm · F · C · Dm · A
    const chords = [
      [73.42, 146.83, 174.61, 220.00],   // Dm
      [73.42, 146.83, 174.61, 220.00],   // Dm
      [116.54, 233.08, 293.66, 349.23],  // Bb
      [98.00, 196.00, 233.08, 293.66],   // Gm
      [87.31, 174.61, 220.00, 261.63],   // F
      [65.41, 130.81, 164.81, 196.00],   // C
      [73.42, 146.83, 174.61, 220.00],   // Dm
      [110.00, 220.00, 277.18, 329.63],  // A
    ];
    const arps = [
      [146.83, 174.61, 220.00, 293.66, 220.00, 174.61],       // Dm up-down
      [146.83, 174.61, 220.00, 293.66, 349.23, 293.66],       // Dm with F4 peak
      [233.08, 293.66, 349.23, 466.16, 349.23, 293.66],       // Bb up-down
      [196.00, 233.08, 293.66, 392.00, 293.66, 233.08],       // Gm
      [174.61, 220.00, 261.63, 349.23, 261.63, 220.00],       // F
      [130.81, 164.81, 196.00, 261.63, 196.00, 164.81],       // C
      [146.83, 174.61, 220.00, 293.66, 349.23, 293.66],       // Dm peak
      [220.00, 277.18, 329.63, 440.00, 329.63, 277.18],       // A
    ];

    let running = true;
    let loopStart = ctx.currentTime + 0.2;
    let loopCount = 0;
    let timer = null;

    function scheduleLoop(start) {
      const fill = Math.min(0.12, loopCount * 0.03);
      for (let b = 0; b < 8; b++) {
        const tb = start + b * bar;
        const intensity = 0.14 + b * 0.012 + fill;
        organ(chords[b], tb, bar, intensity);
        const arp = arps[b];
        for (let i = 0; i < 8; i++) {
          const n = arp[i % arp.length];
          pluck(n, tb + i * (bar / 8), 0.38, 0.09 + b * 0.006 + fill * 0.5);
        }
        for (let i = 0; i < 4; i++) tick(tb + i * beat, 0.06);
      }
    }

    function loop() {
      if (!running) return;
      scheduleLoop(loopStart);
      loopStart += 8 * bar;
      loopCount++;
      const ms = (8 * bar - 0.5) * 1000;
      timer = setTimeout(loop, ms);
    }
    loop();

    return {
      stop(mode = "fade") {
        running = false;
        if (timer) clearTimeout(timer);
        const now = ctx.currentTime;
        master.gain.cancelScheduledValues(now);
        master.gain.setValueAtTime(master.gain.value, now);
        if (mode === "success") {
          // D major resolution (D-F#-A, one octave stack)
          organ([73.42, 146.83, 184.99, 220.00, 293.66, 369.99], now + 0.05, 4.2, 0.28);
          master.gain.linearRampToValueAtTime(0.0001, now + 4.8);
        } else if (mode === "fail") {
          // Deflated minor second cluster
          organ([65.41, 69.30, 138.59, 164.81], now + 0.05, 2.5, 0.24);
          master.gain.linearRampToValueAtTime(0.0001, now + 3.0);
        } else {
          master.gain.linearRampToValueAtTime(0.0001, now + 1.2);
        }
      },
    };
  }

  async function startMusic() {
    if (!audioCtx || music) return;
    try {
      if (audioCtx.state !== "running") await audioCtx.resume();
      music = createDockingMusic();
    } catch (err) {
      console.error("music failed", err);
      if (hud.status) hud.status.textContent = "AUDIO ERR: " + (err.message || err);
    }
  }
  function stopMusic(mode) {
    if (!music) return;
    music.stop(mode);
    music = null;
  }

  // ---- state ----
  let state, lastT = 0;

  function newState() {
    const targetRPM = (Math.random() < 0.5 ? -1 : 1) * (22 + Math.random() * 28);
    return {
      running: true, ended: false, t: 0, timeLimit: 60,
      targetRPM, targetAngle: Math.random() * 360,
      playerAngle: 0, playerRPM: 0,
      range: 120, fuel: 100, lockHold: 0,
      status: "ACQUIRING SIGNAL...",
      result: null,
      thrusting: { cw: false, ccw: false, fwd: false, rev: false },
      fine: false,
      shake: 0,
      _prevLocks: { rpm: false, ang: false, rng: false },
    };
  }
  function wrapAngle(a) { return ((a + 180) % 360 + 360) % 360 - 180; }
  function currentDeltas() {
    return { dRPM: state.playerRPM - state.targetRPM, dAng: wrapAngle(state.playerAngle - state.targetAngle) };
  }
  function locks() {
    const { dRPM, dAng } = currentDeltas();
    return {
      rpm: Math.abs(dRPM) <= TOL.rpm,
      ang: Math.abs(dAng) <= TOL.ang,
      rng: state.range <= TOL.range,
    };
  }

  function attemptDock() {
    const { rpm, ang, rng } = locks();
    if (rpm && ang && rng) endGame(true, "DOCKING CLAMPS ENGAGED");
    else { endGame(false, "HULL BREACH // CLAMP MISALIGNED"); state.shake = 1.0; }
  }

  function endGame(success, msg) {
    state.running = false; state.ended = true;
    state.result = success ? "SUCCESS" : "FAIL"; state.status = msg;
    stopMusic(success ? "success" : "fail");
    if (success) successChime(); else failBuzz();

    setTimeout(() => {
      overlay.classList.remove("hidden");
      const panel = overlay.querySelector(".panel");
      const time = state.t.toFixed(1);
      panel.innerHTML = success
        ? `<h1 style="color:var(--phosphor)">DOCKED</h1>
           <p class="tagline">// COOPER. WHAT ARE YOU DOING?</p>
           <p>You matched the Endurance at <strong>${Math.abs(state.targetRPM).toFixed(1)} RPM</strong> in <strong>${time}s</strong> with <strong>${state.fuel.toFixed(0)}%</strong> fuel remaining.</p>
           <button id="start">&gt; RUN AGAIN</button>`
        : `<h1 style="color:var(--warn)">MISSION FAILED</h1>
           <p class="tagline">// ${msg}</p>
           <p>Target was spinning at <strong>${Math.abs(state.targetRPM).toFixed(1)} RPM</strong>. Elapsed: <strong>${time}s</strong>.</p>
           <button id="start">&gt; RETRY</button>`;
    }, 1400);
  }

  // ---- input ----
  const keyMap = {
    KeyA: "ccw", ArrowLeft: "ccw",
    KeyD: "cw", ArrowRight: "cw",
    KeyW: "fwd", ArrowUp: "fwd",
    KeyS: "rev", ArrowDown: "rev",
  };
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space") {
      e.preventDefault();
      if (state && state.running && !state.ended) attemptDock();
      return;
    }
    if (e.code === "KeyR") { e.preventDefault(); beginGame(); return; }
    if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && state) { state.fine = true; return; }
    const k = keyMap[e.code];
    if (k && state) { state.thrusting[k] = true; e.preventDefault(); }
  });
  window.addEventListener("keyup", (e) => {
    if ((e.code === "ShiftLeft" || e.code === "ShiftRight") && state) { state.fine = false; return; }
    const k = keyMap[e.code];
    if (k && state) state.thrusting[k] = false;
  });

  function beginGame() {
    try {
      state = newState();
      overlay.classList.add("hidden");
      lastT = performance.now();
      requestAnimationFrame(loop);
      resize();
      stopMusic();
      startMusic().catch(err => console.error(err));
    } catch (err) { showError(err); }
  }

  // Expose start handler to the top-level delegator
  onStart = () => {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch {}
    }
    beginGame();
  };

  // ---- update/render/hud ----
  function update(dt) {
    if (!state.running) return;
    state.t += dt;
    const timeLeft = Math.max(0, state.timeLimit - state.t);
    if (timeLeft <= 0) { endGame(false, "ATMOSPHERIC ENTRY // VEHICLE LOST"); return; }

    const TORQUE_BASE = 26, LINEAR_BASE = 18, FUEL_ROT = 4.0, FUEL_LIN = 3.0;
    const tMul = state.fine ? 0.2 : 1;
    const lMul = state.fine ? 0.4 : 1;
    const TORQUE = TORQUE_BASE * tMul;
    const LINEAR = LINEAR_BASE * lMul;
    const fuelOk = state.fuel > 0;
    if (state.thrusting.ccw && fuelOk) { state.playerRPM -= TORQUE * dt; state.fuel -= FUEL_ROT * tMul * dt; }
    if (state.thrusting.cw && fuelOk)  { state.playerRPM += TORQUE * dt; state.fuel -= FUEL_ROT * tMul * dt; }
    if (state.thrusting.fwd && fuelOk) { state.range -= LINEAR * dt; state.fuel -= FUEL_LIN * lMul * dt; }
    if (state.thrusting.rev && fuelOk) { state.range += LINEAR * dt; state.fuel -= FUEL_LIN * lMul * dt; }
    state.playerRPM = Math.max(-80, Math.min(80, state.playerRPM));
    state.range = Math.max(2, Math.min(200, state.range));
    state.fuel = Math.max(0, state.fuel);

    state.playerAngle += state.playerRPM * 6 * dt;
    state.targetAngle += state.targetRPM * 6 * dt;

    const L = locks();
    if (L.rpm && L.ang && L.rng) {
      state.lockHold += dt;
      state.status = `AUTO-DOCK IN ${Math.max(0, LOCK_HOLD - state.lockHold).toFixed(1)}s`;
      if (state.lockHold >= LOCK_HOLD) endGame(true, "AUTO-DOCK COMPLETE");
    } else {
      if (state.lockHold > 0.05) beep(220, 0.05, "square", 0.03);
      state.lockHold = 0;
      if (!fuelOk && !(L.rpm && L.ang)) state.status = "FUEL CRITICAL // DRIFTING";
      else if (state.range > TOL.range * 1.5) state.status = "OUT OF DOCKING CORRIDOR";
      else state.status = "HOLDING APPROACH";
    }
    state.shake *= Math.pow(0.001, dt);
    if (state.shake < 0.01) state.shake = 0;
  }

  function render() {
    camera.rotation.set(0, 0, state.playerAngle * DEG);
    endurance.rotation.z = state.targetAngle * DEG;
    endurance.position.z = -state.range * WORLD_SCALE;
    planetGroup.rotation.y = state.t * 0.004;

    const L = locks();
    const portColor = (L.ang && L.rpm) ? PHOSPHOR : AMBER;
    endurance.userData.portMat.emissive.setHex(portColor);
    endurance.userData.bracketMat.emissive.setHex(portColor);
    endurance.userData.lightMat.emissive.setHex(portColor);
    endurance.userData.ringMat.color.setHex(L.rpm ? 0xaaffc4 : PHOSPHOR);

    // Beacons blink
    const blink = 0.6 + 0.4 * Math.sin(state.t * 5.0);
    for (const m of endurance.userData.beacons) {
      m.emissiveIntensity = 1.2 + 1.4 * blink;
    }

    // Tighten bloom on lock (cinematic "everything glows when locked")
    bloom.strength = 0.9 + (L.rpm && L.ang ? 0.4 : 0) + (L.rng ? 0.3 : 0);

    if (state.shake > 0) {
      camera.position.set(
        (Math.random() - 0.5) * state.shake * 0.3,
        (Math.random() - 0.5) * state.shake * 0.3,
        0
      );
    } else camera.position.set(0, 0, 0);

    composer.render();
  }

  function computeHint() {
    if (!state || !state.running) return { text: "", cls: "" };
    const L = locks();
    const { dRPM, dAng } = currentDeltas();
    const absRPM = Math.abs(dRPM), absAng = Math.abs(dAng);

    if (state.fuel < 15 && state.fuel > 0) return { text: "⚠ FUEL LOW ⚠", cls: "warn" };

    if (L.rpm && L.ang && L.rng) return { text: "LOCKED ▸ TAP SPACE", cls: "locked" };

    if (state.range > 45)       return { text: "CLOSE RANGE ▸ HOLD W", cls: "" };
    if (absRPM > 6)             return { text: "MATCH ROTATION ▸ A / D", cls: "" };
    if (!L.rpm)                 return { text: "TRIM RPM ▸ SHIFT + A / D", cls: "" };
    if (absAng > 25)            return { text: "SWEEP ANGLE ▸ A / D", cls: "" };
    if (!L.ang)                 return { text: "ALIGN ANGLE ▸ SHIFT + A / D", cls: "" };
    if (!L.rng)                 return { text: "INTO CORRIDOR ▸ HOLD W", cls: "" };
    return { text: "", cls: "" };
  }

  function updateHint() {
    const { text, cls } = computeHint();
    if (text) {
      if (hud.hint.textContent !== text) hud.hint.textContent = text;
      hud.hint.className = "hint visible " + cls;
    } else {
      hud.hint.className = "hint";
    }
  }

  function fmt(n, d = 2, sign = true) {
    const s = sign && n >= 0 ? "+" : "";
    return s + n.toFixed(d);
  }

  function updateHud() {
    const { dRPM, dAng } = currentDeltas();
    const L = locks();
    const timeLeft = Math.max(0, state.timeLimit - state.t);

    hud.timer.textContent = timeLeft.toFixed(1) + "s";
    hud.timer.style.color = timeLeft < 10 ? "var(--warn)" : "var(--amber)";
    hud.drpm.textContent = fmt(dRPM, 2);
    hud.dang.textContent = fmt(dAng, 1) + "°";
    hud.range.textContent = state.range.toFixed(1) + " m";
    hud.fuel.textContent = state.fuel.toFixed(0) + "%";

    const clamp = (v) => Math.max(-40, Math.min(40, v));
    hud.barRpm.style.left = (50 + clamp(dRPM * 4)) + "%";
    hud.barAng.style.left = (50 + clamp(dAng * 2)) + "%";
    hud.barRpm.style.background = L.rpm ? "var(--phosphor)" : "var(--warn)";
    hud.barAng.style.background = L.ang ? "var(--phosphor)" : "var(--warn)";

    const rngPct = Math.max(0, Math.min(100, 100 - (state.range / 120) * 100));
    hud.barRange.style.width = rngPct + "%";
    hud.barRange.style.background = L.rng ? "var(--phosphor)" : "var(--amber)";
    hud.barRange.style.left = "0";

    hud.barFuel.style.width = state.fuel + "%";
    hud.barFuel.style.background = state.fuel < 20 ? "var(--warn)" : "var(--phosphor)";
    hud.barFuel.style.left = "0";

    const ind = hud.lock.children;
    const prev = state._prevLocks;
    const kmap = { 0: "rpm", 1: "ang", 2: "rng" };
    for (let i = 0; i < ind.length; i++) {
      const k = kmap[i];
      const on = L[k];
      ind[i].classList.toggle("on", on);
      if (on && !prev[k]) beep(700 + i * 200, 0.06, "square", 0.05);
    }
    state._prevLocks = L;
    hud.status.textContent = state.status;
  }

  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    try {
      if (state) { update(dt); render(); updateHud(); updateHint(); }
    } catch (err) { showError(err); return; }
    if (state && (state.running || state.shake > 0)) requestAnimationFrame(loop);
    else { render(); updateHud(); }
  }

  // initial idle frame so scene is visible before user clicks start
  state = newState();
  state.running = false;
  render();
  updateHud();
}
