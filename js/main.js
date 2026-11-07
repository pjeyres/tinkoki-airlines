import { PETS } from './pets.js';
import { buildBallGlb } from './ball.js';
import { Flight, CRUISE_MAX } from './flight.js';
import { Hud } from './hud.js';
import { Sound } from './audio.js';
import { DESTINATIONS, HOME_AIRPORT, makeSearch } from './places.js';

const C = window.Cesium;
const V = C.Cartesian3;
const $ = (id) => document.getElementById(id);

// ---------------------------------------------------------------- settings
const store = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem(`loki.${key}`);
      return v === null ? fallback : JSON.parse(v);
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(`loki.${key}`, JSON.stringify(value));
    } catch {
      // Private mode or blocked storage: settings just won't persist
    }
  },
};

const settings = {
  token: store.get('token', ''),
  mode: store.get('mode', 'google'),
  invertPitch: store.get('invertPitch', false),
  assist: store.get('assist', true),
  muted: store.get('muted', false),
  sharp: store.get('sharp', false),
};
// Without a Cesium ion token we fall back to free Esri imagery and terrain
const mode = settings.token && settings.mode !== 'free' ? settings.mode : 'free';

// ---------------------------------------------------------------- viewer
if (settings.token) C.Ion.defaultAccessToken = settings.token;

const viewerOptions = {
  animation: false,
  timeline: false,
  baseLayerPicker: false,
  geocoder: false,
  homeButton: false,
  sceneModePicker: false,
  navigationHelpButton: false,
  fullscreenButton: false,
  infoBox: false,
  selectionIndicator: false,
  scene3DOnly: true,
  msaaSamples: 4,
};
if (mode === 'free') {
  viewerOptions.baseLayer = C.ImageryLayer.fromProviderAsync(
    C.ArcGisMapServerImageryProvider.fromUrl('https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer'),
  );
  viewerOptions.terrain = new C.Terrain(
    C.ArcGISTiledElevationTerrainProvider.fromUrl('https://elevation3d.arcgis.com/arcgis/rest/services/WorldElevation3D/Terrain3D/ImageServer'),
  );
} else if (mode === 'ion') {
  viewerOptions.baseLayer = C.ImageryLayer.fromWorldImagery();
  viewerOptions.terrain = C.Terrain.fromWorldTerrain();
} else {
  viewerOptions.baseLayer = false;
}

const viewer = new C.Viewer('globe', viewerOptions);
const scene = viewer.scene;
const camera = scene.camera;
scene.screenSpaceCameraController.enableInputs = false;
scene.globe.depthTestAgainstTerrain = true;
scene.fog.enabled = true;
scene.skyAtmosphere.show = true;
viewer.useBrowserRecommendedResolution = !settings.sharp;
camera.frustum.fov = C.Math.toRadians(62);

let tileset = null; // photorealistic tiles or OSM buildings
let tilesReady = Promise.resolve();
async function loadTiles() {
  try {
    if (mode === 'google') {
      tileset = await C.createGooglePhotorealistic3DTileset({ onlyUsingWithGoogleGeocoder: true });
      scene.globe.show = false;
      scene.primitives.add(tileset);
    } else if (mode === 'ion') {
      tileset = await C.createOsmBuildingsAsync();
      scene.primitives.add(tileset);
    }
  } catch (err) {
    console.error(err);
    toast(`Couldn't load 3D tiles: ${err.message ?? err}. Check your Cesium ion token in Settings.`, 6000);
    scene.globe.show = true;
  }
}

// Light the pilot from over the camera's shoulder so he always looks his best
const light = new C.DirectionalLight({ direction: new V(0, 0, -1), intensity: 2.6 });
scene.light = light;

// ---------------------------------------------------------------- state
const flight = new Flight();
flight.assist = settings.assist;
const sound = new Sound();
sound.muted = settings.muted;
const hud = new Hud();
const search = makeSearch(scene, mode);

let pet = PETS[store.get('pet', 'loki')] ?? PETS.loki;
const models = {};  // pet id -> { model, nodes }
let model = null;   // the current pilot's model
let nodes = {};
let started = false;
let paused = false;
let loading = null; // { since, name } while a teleport waits for tiles
let camMode = 0;
const CAM_MODES = ['Chase cam', 'Locked chase', 'Pilot’s eyes', 'Fly-by'];
let camDist = pet.camDist;
let orbitYaw = 0, orbitPitch = 0, dragging = false;
let camOffset = null;
let flybyPoint = null;
let score = store.get('score', 0);
let happy = 0;      // extra tail wagging after a good boy moment
let barkTime = -10;
let animTime = 0;
let gallop = 0;
let groundBlend = 0;
let frame = 0;
const petMatrix = new C.Matrix4();

// ---------------------------------------------------------------- pilots
async function addPets() {
  await Promise.all(Object.values(PETS).map(async (p) => {
    const url = await p.build();
    const m = await C.Model.fromGltfAsync({ url, forwardAxis: C.Axis.X, upAxis: C.Axis.Y });
    m.show = false;
    scene.primitives.add(m);
    const entry = { model: m, nodes: {} };
    models[p.id] = entry;
    m.readyEvent.addEventListener(() => {
      for (const name of p.nodes) {
        const n = m.getNode(name);
        if (n) entry.nodes[name] = { node: n, original: C.Matrix4.clone(n.originalMatrix), m: new C.Matrix4() };
      }
    });
  }));
  setPet(pet.id);
}

function setPet(id) {
  pet = PETS[id] ?? PETS.loki;
  store.set('pet', pet.id);
  for (const [pid, entry] of Object.entries(models)) entry.model.show = pid === pet.id;
  model = models[pet.id]?.model ?? null;
  nodes = models[pet.id]?.nodes ?? {};

  // Keep paws on the ground when swapping pilots on the runway
  flight.clearance = pet.clearance;
  if (flight.grounded && flight.groundHeight !== undefined) {
    const c = C.Cartographic.fromCartesian(flight.pos);
    c.height = flight.groundHeight + pet.clearance * flight.scale;
    flight.pos = C.Cartographic.toCartesian(c);
    flight.height = c.height;
  }
  camDist = pet.camDist;
  camOffset = null;

  // Only Loki plays fetch; Tinker just flies free
  for (const ball of balls) ball.entity.show = pet.balls;
  nearestBall = null;
  document.body.classList.toggle('no-balls', !pet.balls);
  showPetText();
}

function showPetText() {
  document.querySelectorAll('.pet-name').forEach((el) => { el.textContent = pet.name; });
  $('pass-name').textContent = pet.name.toUpperCase();
  $('pass-breed').textContent = pet.breed;
  $('pass-class').textContent = pet.travelClass;
  $('pass-flight').textContent = pet.flight;
  $('pass-snacks').textContent = pet.snacks;
  $('pass-emoji').textContent = pet.emoji;
  $('brief-goal').textContent = pet.goal;
  $('flight-chip').textContent = pet.flight;
  $('hint-voice').textContent = pet.voice;
  $('opt-pet').value = pet.id;
  if (!$('board').disabled) $('board').textContent = `Board flight ${pet.flight}`;
  document.querySelectorAll('[data-pet]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.pet === pet.id)));
}

const m3 = new C.Matrix3(), m3b = new C.Matrix3(), rot4 = new C.Matrix4();
function poseNode(name, rx, ry, rz) {
  const entry = nodes[name];
  if (!entry) return;
  C.Matrix3.fromRotationZ(rz, m3);
  C.Matrix3.multiply(m3, C.Matrix3.fromRotationY(ry, m3b), m3);
  C.Matrix3.multiply(m3, C.Matrix3.fromRotationX(rx, m3b), m3);
  C.Matrix4.fromRotation(m3, rot4);
  C.Matrix4.multiply(entry.original, rot4, entry.m);
  entry.node.matrix = entry.m;
}

function animatePet(dt) {
  animTime += dt;
  const t = animTime;
  const air = Math.min(1, flight.speed / 60);
  groundBlend += ((flight.grounded ? 1 : 0) - groundBlend) * Math.min(1, dt * 5);
  const fly = 1 - groundBlend;

  // Ears stream back (floppy dog ears) or flatten (pointy cat ears) in the wind
  const earBack = pet.earSwing < 0 ? -0.3 - 1.0 * air * fly : 0.9 * air * fly;
  const flap = (Math.sin(t * 17) * 0.14 * air + Math.sin(t * 6) * 0.05) * (pet.earSwing < 0 ? 1 : 0.3);
  poseNode('earL', -0.25 * air - flap, 0, earBack + flap * 0.5);
  poseNode('earR', 0.25 * air + flap, 0, earBack - flap * 0.5);
  poseNode('tongue', 0, Math.sin(t * 9) * 0.3 * air, Math.sin(t * 21) * 0.18 * air - 0.1 * fly);

  // Head looks into turns, and up when barking
  const att = flight.attitude();
  const barkLift = Math.max(0, 1 - (t - barkTime) * 3) * 0.35;
  poseNode('head', 0, -att.roll * 0.15, barkLift - 0.1 * fly);

  // Superdog pose in the air, galloping on the ground
  const stride = flight.grounded ? Math.min(1, flight.speed / 5) : 0;
  gallop += dt * (5 + flight.speed * 0.55);
  const g = Math.sin(gallop) * 0.75 * stride * groundBlend;
  const paddle = Math.sin(t * 3) * 0.08 * fly;
  poseNode('legFL', 0, 0, 1.3 * fly + g + paddle);
  poseNode('legFR', 0, 0, 1.3 * fly + Math.sin(gallop + 0.4) * 0.75 * stride * groundBlend - paddle);
  poseNode('legBL', 0, 0, -1.25 * fly - Math.sin(gallop + Math.PI) * 0.6 * stride * groundBlend);
  poseNode('legBR', 0, 0, -1.25 * fly - Math.sin(gallop + Math.PI + 0.4) * 0.6 * stride * groundBlend);

  // Tail: Loki wags (faster when happy), Tinker swishes and holds it high on the ground
  happy = Math.max(0, happy - dt);
  const tail = pet.tail;
  const wagRate = tail.rate + (happy > 0 ? 8 : 0) + groundBlend * 4 * (tail.rate / 9);
  const wagAmp = tail.amp + (happy > 0 ? 0.25 : 0) + groundBlend * 0.2;
  for (let i = 0; i < pet.tailSegments; i++) {
    const lift = i === 0 ? tail.groundLift * groundBlend - 0.15 * fly : tail.groundCurl * groundBlend + 0.05 * fly;
    poseNode(`tail${i}`, 0, Math.sin(t * wagRate - i * 0.7) * wagAmp, lift + Math.sin(t * 5 - i * 0.9) * 0.08 * air);
  }

  // Scarf or cape flutter
  const cloth = pet.cloth;
  for (let i = 0; i < 4; i++) {
    const s = (0.2 + 0.4 * air) * (1 + i * 0.25);
    poseNode(`scarf${i}`, Math.sin(t * 15 - i * 1.3) * cloth.twist * air, Math.sin(t * 13 - i * 1.1) * s * cloth.side, Math.sin(t * 11 - i) * s * cloth.wave + (i === 0 ? 1.1 * groundBlend : 0));
  }
}

// ---------------------------------------------------------------- ground probing
const ray = new C.Ray();
function probe(origin, direction) {
  V.clone(origin, ray.origin);
  V.clone(direction, ray.direction);
  let best;
  const consider = (p) => {
    if (!p) return;
    const d = V.distance(origin, p);
    if (best === undefined || d < best.d) best = { p, d };
  };
  if (tileset && tileset.show) consider(tileset.pick(ray, scene.frameState));
  if (scene.globe.show) consider(scene.globe.pick(ray, scene));
  return best;
}

// Height of the ground (or rooftop, or bridge deck) beneath a point
function groundBelow(pos, above = 4) {
  const up = C.Ellipsoid.WGS84.geodeticSurfaceNormal(pos, new V());
  const origin = V.add(pos, V.multiplyByScalar(up, above, new V()), new V());
  const hit = probe(origin, V.negate(up, new V()));
  if (hit) return C.Cartographic.fromCartesian(hit.p).height;
  if (scene.globe.show) return scene.globe.getHeight(C.Cartographic.fromCartesian(pos));
  return undefined;
}

// Resolves once the terrain provider has loaded (or failed to)
function terrainReady() {
  const terrain = viewerOptions.terrain;
  if (!terrain || terrain.ready) return Promise.resolve();
  return new Promise((resolve) => {
    terrain.readyEvent.addEventListener(resolve);
    terrain.errorEvent.addEventListener(resolve);
  });
}

// Precise ground height at a spot, loading the most detailed data if needed
async function groundAt(lon, lat) {
  const carto = C.Cartographic.fromDegrees(lon, lat);
  try {
    await Promise.all([tilesReady, terrainReady()]);
    if (mode === 'google' && tileset) {
      const [hit] = await scene.sampleHeightMostDetailed([carto], model ? [model] : []);
      return hit.height;
    }
    const [hit] = await C.sampleTerrainMostDetailed(scene.terrainProvider, [carto]);
    return hit.height;
  } catch (err) {
    console.warn('Ground sampling failed', err);
    return undefined;
  }
}

// ---------------------------------------------------------------- tennis balls
const ballImage = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const grd = x.createRadialGradient(24, 22, 4, 32, 32, 30);
  grd.addColorStop(0, '#f4ff8a');
  grd.addColorStop(1, '#a8c813');
  x.fillStyle = grd;
  x.beginPath();
  x.arc(32, 32, 28, 0, Math.PI * 2);
  x.fill();
  x.strokeStyle = '#ffffff';
  x.lineWidth = 3.5;
  x.beginPath();
  x.arc(4, 32, 22, -0.95, 0.95);
  x.stroke();
  x.beginPath();
  x.arc(60, 32, 22, Math.PI - 0.95, Math.PI + 0.95);
  x.stroke();
  return c;
})();

const balls = [];
const BALL_RADIUS = 4;      // metres; a giant ball is easier to spot and judge
const BALL_MODEL_RANGE = 1200; // beyond this the ball is drawn as an icon
function placeBall(ball) {
  const carto = C.Cartographic.fromCartesian(flight.pos);
  const bearing = Math.random() * Math.PI * 2;
  const dist = 600 + Math.random() * 2400;
  const R = 6371000;
  const lat = carto.latitude + (dist * Math.cos(bearing)) / R;
  const lon = carto.longitude + (dist * Math.sin(bearing)) / (R * Math.cos(carto.latitude));
  const base = flight.groundHeight ?? carto.height - 100;
  ball.height = Math.max(base + 40, carto.height + (Math.random() * 200 - 90));
  ball.position = V.fromRadians(lon, lat, ball.height);
  ball.checked = false;
  ball.entity.position = ball.position;
}

// Balls are real 3D models up close so they shrink and grow with distance,
// and everything is depth-tested so Loki, hills and buildings hide them.
async function setupBalls() {
  const uri = await buildBallGlb();
  for (let i = 0; i < 6; i++) {
    const entity = viewer.entities.add({
      show: pet.balls,
      model: {
        uri,
        scale: BALL_RADIUS,
        minimumPixelSize: 14, // stays spottable far off, grows as you close in
        distanceDisplayCondition: new C.DistanceDisplayCondition(0, BALL_MODEL_RANGE),
      },
      billboard: {
        image: ballImage,
        width: 14,
        height: 14,
        distanceDisplayCondition: new C.DistanceDisplayCondition(BALL_MODEL_RANGE, Number.POSITIVE_INFINITY),
      },
      // Distance tag, shown on the nearest ball only
      label: {
        show: false,
        text: '',
        font: '700 14px "JetBrains Mono", ui-monospace, monospace',
        fillColor: C.Color.WHITE,
        showBackground: true,
        backgroundColor: C.Color.fromCssColorString('rgba(14, 22, 44, 0.8)'),
        backgroundPadding: new C.Cartesian2(7, 4),
        verticalOrigin: C.VerticalOrigin.BOTTOM,
        pixelOffset: new C.Cartesian2(0, -18),
        eyeOffset: new C.Cartesian3(0, 0, -BALL_RADIUS * 1.2),
        distanceDisplayCondition: new C.DistanceDisplayCondition(60, Number.POSITIVE_INFINITY),
      },
    });
    const ball = { entity };
    balls.push(ball);
    placeBall(ball);
  }
}

function updateBalls() {
  let nearest = null;
  for (const ball of balls) {
    const d = V.distance(flight.pos, ball.position);
    if (d < BALL_RADIUS + 15 * Math.max(1, flight.scale * 0.5)) {
      score += 1;
      store.set('score', score);
      $('score').textContent = score;
      happy = 3;
      sound.chime();
      bark(1);
      toast(`Good boy! 🎾 Ball #${score} fetched`);
      placeBall(ball);
      continue;
    }
    // Once the ground near a ball has loaded, lift it clear of hills and towers
    if (!ball.checked && d < 1500) {
      const gh = groundBelow(ball.position, 3000);
      if (gh !== undefined) {
        ball.checked = true;
        if (ball.height < gh + 30) {
          const c = C.Cartographic.fromCartesian(ball.position);
          ball.height = gh + 40 + Math.random() * 60;
          ball.position = V.fromRadians(c.longitude, c.latitude, ball.height);
          ball.entity.position = ball.position;
        }
      }
    }
    if (d > 15000) placeBall(ball);
    if (!nearest || d < nearest.d) nearest = { ball, d };
  }
  // Only touch the labels when they change; entity updates aren't free
  for (const ball of balls) {
    const text = nearest && ball === nearest.ball ? formatDist(nearest.d) : '';
    if (ball.labelText !== text) {
      ball.labelText = text;
      ball.entity.label.show = text !== '';
      ball.entity.label.text = text;
    }
  }
  return nearest;
}

function bearingTo(target) {
  const { east, north } = flight.enu();
  const delta = V.subtract(target, flight.pos, new V());
  return (Math.atan2(V.dot(delta, east), V.dot(delta, north)) * 180 / Math.PI + 360) % 360;
}

function addAirportLabel(place) {
  viewer.entities.add({
    position: V.fromDegrees(place.lon, place.lat),
    point: {
      pixelSize: 10,
      color: C.Color.fromCssColorString('#f2b33d'),
      outlineColor: C.Color.fromCssColorString('#101a33'),
      outlineWidth: 2,
      heightReference: C.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: `✈ ${place.label}`,
      font: '600 18px Fredoka, "DM Sans", sans-serif',
      fillColor: C.Color.fromCssColorString('#f2b33d'),
      outlineColor: C.Color.fromCssColorString('#101a33'),
      outlineWidth: 4,
      style: C.LabelStyle.FILL_AND_OUTLINE,
      pixelOffset: new C.Cartesian2(0, -22),
      heightReference: C.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
      scaleByDistance: new C.NearFarScalar(200, 1.1, 30000, 0.6),
      distanceDisplayCondition: new C.DistanceDisplayCondition(0, 60000),
    },
  });
}

// ---------------------------------------------------------------- input
const keys = new Set();
const smooth = { pitch: 0, roll: 0, yaw: 0 };
window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
    if (e.code === 'Escape') e.target.blur();
    return;
  }
  if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (!started) {
    if (e.code === 'Enter' || e.code === 'Space') board();
    return;
  }
  keys.add(e.code);
  if (e.repeat) return;
  switch (e.code) {
    case 'KeyB': bark(2); break;
    case 'KeyC': cycleCamera(); break;
    case 'KeyP': togglePause(); break;
    case 'KeyM': toggleMute(); break;
    case 'KeyG': toggleGiant(); break;
    case 'KeyH': togglePanel('help'); break;
    case 'KeyT': case 'Slash': e.preventDefault(); $('search').focus(); break;
    case 'Escape': closePanels(); break;
  }
});
window.addEventListener('keyup', (e) => keys.delete(e.code));
window.addEventListener('blur', () => keys.clear());

const canvas = scene.canvas;
canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointerup', () => { dragging = false; });
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  orbitYaw -= e.movementX * 0.006;
  orbitPitch = C.Math.clamp(orbitPitch + e.movementY * 0.004, -1.2, 1.2);
});
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  camDist = C.Math.clamp(camDist * Math.pow(1.0015, e.deltaY), 2.5, 80);
}, { passive: false });

function readInput(dt) {
  const k = (...codes) => codes.some((c) => keys.has(c)) ? 1 : 0;
  const pitchSign = settings.invertPitch ? -1 : 1;
  const target = {
    pitch: (k('KeyS', 'ArrowDown') - k('KeyW', 'ArrowUp')) * pitchSign,
    roll: k('KeyD', 'ArrowRight') - k('KeyA', 'ArrowLeft'),
    yaw: k('KeyE') - k('KeyQ'),
  };
  let throttle = k('KeyR', 'ShiftLeft', 'ShiftRight') - k('KeyF', 'KeyX');
  let boost = keys.has('Space');

  const pad = navigator.getGamepads?.()[0];
  if (pad) {
    const dz = (v) => Math.abs(v) < 0.12 ? 0 : v;
    target.roll += dz(pad.axes[0]);
    target.pitch += dz(pad.axes[1]) * pitchSign;
    target.yaw += dz(pad.axes[2] ?? 0);
    throttle += (pad.buttons[7]?.value ?? 0) - (pad.buttons[6]?.value ?? 0);
    boost = boost || pad.buttons[2]?.pressed;
    if (pad.buttons[0]?.pressed && animTime - barkTime > 0.6) bark(2);
  }

  const a = Math.min(1, dt * 7);
  for (const axis of ['pitch', 'roll', 'yaw']) {
    smooth[axis] += (C.Math.clamp(target[axis], -1, 1) - smooth[axis]) * a;
  }
  return { ...smooth, throttle: C.Math.clamp(throttle, -1, 1), boost };
}

// ---------------------------------------------------------------- actions
// Giants have deeper voices
function voicePitch() {
  return flight.scale > 1 ? 0.55 : 1;
}

// Loki's recorded bark is played a bit deeper than the original to suit a big
// golden retriever, and deeper still when he's a giant
function barkPitch() {
  return flight.scale > 1 ? 0.55 : 0.8;
}

// Loki barks, Tinker meows
function bark(times) {
  barkTime = animTime;
  const b = $('bubble');
  if (pet.voice === 'meow') {
    sound.meow(0, voicePitch() * (1 + (Math.random() - 0.5) * 0.15));
    b.textContent = times > 1 ? 'MRRROW!' : 'MEOW!';
  } else {
    sound.bark(times, barkPitch());
    b.textContent = times > 1 ? 'WOOF WOOF!' : 'WOOF!';
  }
  b.classList.remove('show');
  void b.offsetWidth;
  b.classList.add('show');
}

function cycleCamera() {
  camMode = (camMode + 1) % CAM_MODES.length;
  flybyPoint = null;
  camOffset = null;
  toast(CAM_MODES[camMode], 1200);
}

function togglePause() {
  paused = !paused;
  $('paused').hidden = !paused;
}

function toggleMute() {
  settings.muted = !settings.muted;
  store.set('muted', settings.muted);
  sound.setMuted(settings.muted);
  $('opt-sound').checked = !settings.muted;
  toast(settings.muted ? 'Sound off' : 'Sound on', 1000);
}

function toggleGiant() {
  const giant = flight.scale === 1;
  flight.scale = giant ? 15 : 1;
  camOffset = null;
  toast(giant ? `GIANT ${pet.name.toUpperCase()}! ${pet.emoji} (press G to shrink)` : `Regular-sized ${pet.name}`, 1800);
}

let toastTimer = null;
function toast(text, ms = 2200) {
  const el = $('toast');
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function teleport(place) {
  flight.place(place.lon, place.lat, place.height ?? 1500, place.heading ?? flight.attitude().heading * 180 / Math.PI, 60);
  flight.throttle = place.onGround ? 0 : Math.min(flight.throttle, 0.25);
  const job = { since: performance.now(), name: place.name, explicitHeight: place.height !== undefined, onGround: place.onGround };
  loading = job;
  if (place.onGround) {
    groundAt(place.lon, place.lat).then((h) => { job.ground = h ?? null; });
  }
  camOffset = null;
  flybyPoint = null;
  $('loading-name').textContent = place.name.split(',')[0];
  $('loading').hidden = false;
  for (const ball of balls) placeBall(ball);
  closePanels();
}

function finishLoading() {
  const gh = loading.ground ?? groundBelow(flight.pos, 9000);
  if (gh !== undefined) {
    flight.groundHeight = gh;
    if (loading.onGround) {
      // Airports: the pilot waits on the ground, ready to run and take off
      const c = C.Cartographic.fromCartesian(flight.pos);
      const heading = flight.attitude().heading * 180 / Math.PI;
      flight.place(C.Math.toDegrees(c.longitude), C.Math.toDegrees(c.latitude), gh + pet.clearance * flight.scale, heading, 0);
      flight.groundHeight = gh;
      flight.grounded = true;
      flight.throttle = 0;
    } else if (!loading.explicitHeight || flight.height < gh + 60) {
      // Searched places have no preset height, so settle 300 m above the ground
      const c = C.Cartographic.fromCartesian(flight.pos);
      const heading = flight.attitude().heading * 180 / Math.PI;
      flight.place(C.Math.toDegrees(c.longitude), C.Math.toDegrees(c.latitude), gh + (loading.explicitHeight ? 120 : 300), heading, 60);
      flight.groundHeight = gh;
    }
  }
  for (const ball of balls) placeBall(ball);
  loading = null;
  $('loading').hidden = true;
  if (!started) {
    // The first area has loaded, so the pilot can board
    $('board').disabled = false;
    $('board').textContent = `Board flight ${pet.flight}`;
    return;
  }
  toast(flight.grounded ? takeoffHint() : `${pet.voice === 'meow' ? 'Meow' : 'Woof'}! Ready for take-off`, flight.grounded ? 4000 : 1500);
}

function takeoffHint() {
  return `Paws on the ground: hold R to run, then ${settings.invertPitch ? 'W / ↑' : 'S / ↓'} to take off`;
}

// ---------------------------------------------------------------- camera
function updateCamera(dt, att) {
  const s = flight.scale;
  const U = flight.localUp();
  if (!dragging && camMode !== 3 && !paused && started) {
    orbitYaw *= Math.max(0, 1 - dt * 1.5);
    orbitPitch *= Math.max(0, 1 - dt * 1.5);
  }
  if (!started) orbitYaw += dt * 0.25;

  const speedFov = C.Math.clamp((flight.speed - 60) / (CRUISE_MAX * 2), 0, 1);
  const fovTarget = C.Math.toRadians(62 + speedFov * 14 + (flight.boosting ? 6 : 0));
  camera.frustum.fov += (fovTarget - camera.frustum.fov) * Math.min(1, dt * 2);

  let pos, target, up;
  if (camMode === 2) {
    // From the pilot's eyes, just ahead of the nose
    pos = flight.bodyPoint(pet.eyes[0], pet.eyes[1]);
    target = V.add(pos, V.multiplyByScalar(flight.fwd, 100, new V()), new V());
    up = flight.up;
  } else if (camMode === 3) {
    // Fly-by: a fixed spot ahead of the pilot to zoom past.
    // Closer shots when slow or trotting about on the ground
    const near = flight.speed < 25 ? 0.2 : 1;
    const tooFar = flybyPoint && V.distance(flybyPoint, flight.pos) > Math.max(120 * near, flight.speed * 3.5) * s;
    const behind = flybyPoint && V.dot(V.subtract(flight.pos, flybyPoint, new V()), flight.fwd) > Math.max(60 * near, flight.speed * 2) * s;
    if (!flybyPoint || tooFar || behind) {
      const ahead = Math.max(60 * near, flight.speed * 2.2) * s;
      const side = (Math.random() > 0.5 ? 1 : -1) * (12 + Math.random() * 14) * near * s;
      flybyPoint = flight.bodyPoint(0, 0);
      V.add(flybyPoint, V.multiplyByScalar(flight.fwd, ahead, new V()), flybyPoint);
      V.add(flybyPoint, V.multiplyByScalar(flight.left, side, new V()), flybyPoint);
      V.add(flybyPoint, V.multiplyByScalar(U, (1 + Math.random() * 6 * near) * s, new V()), flybyPoint);
    }
    pos = flybyPoint;
    target = flight.pos;
    up = U;
  } else {
    const dist = camDist * s;
    const locked = camMode === 1;
    const upMix = locked ? flight.up : V.normalize(V.add(V.multiplyByScalar(U, 0.75, new V()), V.multiplyByScalar(flight.up, 0.25, new V()), new V()), new V());
    let desired = V.add(
      V.multiplyByScalar(flight.fwd, -dist, new V()),
      V.multiplyByScalar(upMix, dist * 0.24 + 0.6 * s, new V()),
      new V(),
    );
    // Mouse-drag orbit around the pilot
    if (orbitYaw || orbitPitch) {
      const q = C.Quaternion.fromAxisAngle(U, orbitYaw);
      desired = C.Matrix3.multiplyByVector(C.Matrix3.fromQuaternion(q), desired, new V());
      const right = V.normalize(V.cross(desired, U, new V()), new V());
      if (V.magnitude(right) > 0) {
        const q2 = C.Quaternion.fromAxisAngle(right, orbitPitch);
        desired = C.Matrix3.multiplyByVector(C.Matrix3.fromQuaternion(q2), desired, new V());
      }
    }
    if (!camOffset || locked) camOffset = desired;
    else V.lerp(camOffset, desired, Math.min(1, dt * 5), camOffset);
    pos = V.add(flight.pos, camOffset, new V());
    target = V.add(flight.pos, V.multiplyByScalar(flight.fwd, 1.2 * s, new V()), new V());
    up = locked ? flight.up : U;
  }

  // Keep the camera out of the ground
  if (frame % 3 === 0 || updateCamera.ground === undefined) updateCamera.ground = groundBelow(pos, 30);
  if (updateCamera.ground !== undefined) {
    const c = C.Cartographic.fromCartesian(pos);
    if (c.height < updateCamera.ground + 1.2) {
      c.height = updateCamera.ground + 1.2;
      pos = C.Cartographic.toCartesian(c);
    }
  }

  const direction = V.normalize(V.subtract(target, pos, new V()), new V());
  const right = V.cross(direction, up, new V());
  if (V.magnitude(right) < 1e-6) V.cross(direction, flight.fwd, right);
  V.normalize(right, right);
  const camUp = V.normalize(V.cross(right, direction, new V()), new V());
  camera.setView({ destination: pos, orientation: { direction, up: camUp } });

  // Key light from above and behind the camera
  const lightDir = V.add(direction, V.multiplyByScalar(U, -0.9, new V()), new V());
  V.add(lightDir, V.multiplyByScalar(right, 0.4, new V()), lightDir);
  light.direction = V.normalize(lightDir, lightDir);
}

// ---------------------------------------------------------------- main loop
let last = performance.now();
let nearestBall = null;
scene.preUpdate.addEventListener(() => {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame++;
  if (!model || !flight.pos.x) return;

  const input = readInput(dt);
  if (loading) {
    const waited = now - loading.since;
    const ready = (!tileset || tileset.tilesLoaded) && (!scene.globe.show || scene.globe.tilesLoaded);
    const groundKnown = !loading.onGround || loading.ground !== undefined;
    if ((waited > 1500 && ready && groundKnown) || (waited > 8000 && groundKnown) || waited > 20000) finishLoading();
  } else if (started && !paused) {
    if (frame % 2 === 0 || flight.grounded) {
      // Start the downward probe higher when diving fast so it can't start underground
      const above = 3 * flight.scale + 3 + Math.max(0, -flight.verticalSpeed) * 0.15;
      const gh = groundBelow(flight.pos, above);
      if (gh !== undefined) flight.groundHeight = gh;
      else if (flight.groundHeight !== undefined && !flight.grounded) flight.groundHeight = undefined;
    }
    // Look ahead for walls, cliffs and skyscrapers
    if (frame % 2 === 1 && flight.speed > 5 && tileset && !flight.grounded) {
      const reach = Math.max(6 * flight.scale, flight.speed * 0.12);
      const hit = probe(flight.pos, flight.fwd);
      if (hit && hit.d < reach) {
        flight.yawBy(Math.PI * 0.9);
        flight.pitchBy(0.3);
        flight.speed *= 0.3;
        flight.events.push('bonk');
        showEvents();
      }
    }
    flight.step(dt, input);
    showEvents();
    nearestBall = pet.balls ? updateBalls() : null;
  }

  animatePet(paused ? 0 : dt);
  model.modelMatrix = flight.modelMatrix(petMatrix);
  const att = flight.attitude();
  updateCamera(dt, att);
  sound.wind(paused || !started ? 0 : flight.speed, flight.boosting);

  // Speech bubble follows the pilot's head
  const head = C.SceneTransforms.worldToWindowCoordinates(scene, flight.bodyPoint(pet.head[0], pet.head[1]));
  if (head) {
    $('bubble-anchor').style.transform = `translate(${head.x}px, ${head.y}px)`;
  }

  const carto = C.Cartographic.fromCartesian(flight.pos);
  const lat = C.Math.toDegrees(carto.latitude), lon = C.Math.toDegrees(carto.longitude);
  hud.update(now, flight, att, {
    status: loading ? 'Sniffing out the area…' : paused ? 'Paused' : flight.grounded ? (flight.speed > 1 ? pet.groundVerb : 'Sitting pretty') : flight.boosting ? 'ZOOMIES!' : 'Flying',
    coords: `${Math.abs(lat).toFixed(4)}°${lat >= 0 ? 'N' : 'S'}  ${Math.abs(lon).toFixed(4)}°${lon >= 0 ? 'E' : 'W'}`,
    ballText: nearestBall ? formatDist(nearestBall.d) : '—',
    ballBearing: nearestBall ? bearingTo(nearestBall.ball.position) : undefined,
  });
});

function showEvents() {
  for (const ev of flight.events) {
    if (ev === 'bonk') {
      toast(`Bonk! ${pet.name} is OK 🐾 — watch where you fly!`, 1800);
      if (pet.voice === 'meow') sound.meow(0, 1.3 * voicePitch());
      else sound.bark(1, barkPitch());
      $('app').classList.remove('shake');
      void $('app').offsetWidth;
      $('app').classList.add('shake');
    } else if (ev === 'land' && flight.speed > 5) {
      // Skip the tip when just settling onto the runway
      toast(`Paws down! Hold ${settings.invertPitch ? 'W / ↑' : 'S / ↓'} with some speed to take off again`, 2600);
    }
  }
  flight.events.length = 0;
}

function formatDist(m) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1)} km`;
}

// ---------------------------------------------------------------- UI panels
function closePanels() {
  for (const id of ['places', 'settings', 'help']) $(id).hidden = true;
  $('results').hidden = true;
}
function togglePanel(id) {
  const open = $(id).hidden;
  closePanels();
  $(id).hidden = !open;
}

$('btn-places').addEventListener('click', () => togglePanel('places'));
$('btn-settings').addEventListener('click', () => togglePanel('settings'));
$('btn-help').addEventListener('click', () => togglePanel('help'));
document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closePanels));

const placeList = $('place-list');
for (const d of DESTINATIONS) {
  const li = document.createElement('li');
  const btn = document.createElement('button');
  btn.innerHTML = `<strong></strong><span></span>`;
  btn.querySelector('strong').textContent = d.name;
  btn.querySelector('span').textContent = d.region;
  btn.addEventListener('click', () => teleport(d));
  li.appendChild(btn);
  placeList.appendChild(li);
}

let searchSeq = 0;
$('search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const q = $('search').value.trim();
  if (!q) return;
  const seq = ++searchSeq;
  const list = $('results');
  list.hidden = false;
  list.innerHTML = '<li class="muted">Sniffing…</li>';
  try {
    const results = await search(q);
    if (seq !== searchSeq) return;
    list.innerHTML = '';
    if (!results.length) list.innerHTML = '<li class="muted">No scent found. Try another place.</li>';
    for (const r of results) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.textContent = r.name;
      btn.addEventListener('click', () => {
        $('search').blur();
        teleport({ name: r.name, lon: r.lon, lat: r.lat });
        $('search').value = '';
      });
      li.appendChild(btn);
      list.appendChild(li);
    }
  } catch (err) {
    list.innerHTML = '';
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = `Search failed: ${err.message ?? err}`;
    list.appendChild(li);
  }
});

// Settings panel
$('opt-token').value = settings.token;
$('opt-mode').value = mode;
$('opt-invert').checked = settings.invertPitch;
$('opt-assist').checked = settings.assist;
$('opt-sound').checked = !settings.muted;
$('opt-sharp').checked = settings.sharp;
$('opt-invert').addEventListener('change', (e) => { settings.invertPitch = e.target.checked; store.set('invertPitch', settings.invertPitch); });
$('opt-assist').addEventListener('change', (e) => { settings.assist = flight.assist = e.target.checked; store.set('assist', settings.assist); });
$('opt-sound').addEventListener('change', (e) => { if (e.target.checked === settings.muted) toggleMute(); });
$('opt-sharp').addEventListener('change', (e) => {
  settings.sharp = e.target.checked;
  store.set('sharp', settings.sharp);
  viewer.useBrowserRecommendedResolution = !settings.sharp;
});
$('save-world').addEventListener('click', () => {
  const token = $('opt-token').value.trim();
  const chosen = $('opt-mode').value;
  if (chosen !== 'free' && !token) {
    toast('Photorealistic and ion modes need a Cesium ion token', 2500);
    return;
  }
  store.set('token', token);
  store.set('mode', chosen);
  location.reload();
});

$('mode-name').textContent = { google: 'Google Photorealistic 3D', ion: 'Cesium World Terrain', free: 'Esri imagery + terrain' }[mode];
$('score').textContent = score;

// ---------------------------------------------------------------- start
function board() {
  if (started || $('board').disabled) return;
  started = true;
  sound.start();
  $('welcome').hidden = true;
  $('hud').hidden = false;
  hud.resize();
  orbitYaw = 0;
  bark(2);
  if (flight.grounded) toast(takeoffHint(), 5000);
  setTimeout(() => $('hints').classList.add('faded'), 30000);
}
$('board').addEventListener('click', board);
document.querySelectorAll('[data-pet]').forEach((b) => b.addEventListener('click', () => setPet(b.dataset.pet)));
$('opt-pet').addEventListener('change', (e) => setPet(e.target.value));
showPetText();
if (mode === 'free') $('token-hint').hidden = false;

(async () => {
  const start = HOME_AIRPORT;
  flight.place(start.lon, start.lat, start.height, start.heading, 0);
  tilesReady = loadTiles();
  await addPets();
  await setupBalls();
  addAirportLabel(HOME_AIRPORT);
  teleport(start);
})();

// Handy for poking at things from the browser console
window.tinkokiAirlines = { viewer, flight, teleport, bark, setPet };
