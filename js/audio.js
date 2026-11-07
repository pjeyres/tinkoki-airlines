// Game sounds: a synthesised wind rush that follows speed, Loki's bark
// (a real recording, with a synthesised fallback) and Tinker's meow.

// A recording of a dog barking by Amada44 on Wikimedia Commons, CC BY-SA 3.0
// (converted to AAC). Each clip is one bark plus its natural tail:
// [start, end] in seconds. The bark itself lasts about BARK_BODY seconds.
const BARK_RECORDINGS = [
  { url: 'sounds/bark-1.m4a', clips: [[0.15, 0.75], [1.14, 1.75], [1.85, 2.5]] },
];
const BARK_BODY = 0.2;

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  // Browsers only allow audio after a click or key press. Passing an
  // OfflineAudioContext renders sounds to a buffer instead (handy for testing).
  start(context) {
    if (this.ctx) return;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!context && !Ctx) return;
    this.ctx = context ?? new Ctx();
    const ctx = this.ctx;

    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    let brown = 0;
    for (let i = 0; i < len; i++) {
      brown = (brown + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = brown * 3.5;
    }

    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'bandpass';
    this.windFilter.frequency.value = 400;
    this.windFilter.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
    wind.start();

    this.white = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const w = this.white.getChannelData(0);
    for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;
    this.setupBarkBus();
    this.loadBarks();
  }

  async loadBarks() {
    this.barkClips = [];
    try {
      const loaded = await Promise.all(BARK_RECORDINGS.map(async ({ url, clips }) => {
        const res = await fetch(url);
        if (!res.ok) throw new Error(`${url}: ${res.status}`);
        const buffer = await this.ctx.decodeAudioData(await res.arrayBuffer());
        return clips.map(([start, end]) => ({ buffer, start, end }));
      }));
      this.barkClips = loaded.flat();
    } catch (err) {
      console.warn('Bark recording unavailable, using the synthesised bark', err);
    }
  }

  // Play one recorded bark straight to the speakers, with only a tiny fade at
  // each edge to avoid clicks. rate < 1 makes it deeper and slower; giant
  // mode's very low rates also get some echo.
  playBarkClip(clip, delay, rate) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const len = clip.end - clip.start;
    const out = len / rate;
    const src = ctx.createBufferSource();
    src.buffer = clip.buffer;
    src.playbackRate.value = rate;
    const edges = ctx.createGain();
    edges.gain.setValueAtTime(0, t);
    edges.gain.linearRampToValueAtTime(1, t + 0.003);
    edges.gain.setValueAtTime(1, t + out - 0.03);
    edges.gain.linearRampToValueAtTime(0, t + out);
    src.connect(edges).connect(this.master);
    if (rate < 0.7) edges.connect(this.reverbSend);
    src.start(t, clip.start, len);
  }

  // Shared "body" for every bark: chest resonance, a little grit control,
  // a compressor to keep it punchy, and a short outdoor echo.
  setupBarkBus() {
    const ctx = this.ctx;
    this.barkBus = ctx.createGain();

    const chest = ctx.createBiquadFilter();
    chest.type = 'peaking';
    chest.frequency.value = 190;
    chest.Q.value = 1.1;
    chest.gain.value = 6;
    const deHarsh = ctx.createBiquadFilter();
    deHarsh.type = 'highshelf';
    deHarsh.frequency.value = 4500;
    deHarsh.gain.value = -8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.ratio.value = 4;
    comp.attack.value = 0.002;
    comp.release.value = 0.12;

    this.barkBus.connect(chest).connect(deHarsh).connect(comp).connect(this.master);

    // Echo: a decaying noise impulse response, mixed in quietly
    const irLen = Math.floor(ctx.sampleRate * 0.7);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.5);
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.16;
    comp.connect(this.reverbSend).connect(reverb).connect(this.master);

    // Soft clipping curve for a rough, throaty voice
    const n = 1024;
    this.growlCurve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      this.growlCurve[i] = Math.tanh(x * 3.2);
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.8;
  }

  wind(speed, boosting) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const level = Math.min(1, speed / 300) * 0.5 + (boosting ? 0.15 : 0);
    this.windGain.gain.setTargetAtTime(level, t, 0.3);
    this.windFilter.frequency.setTargetAtTime(250 + Math.min(speed, 600) * 2.2, t, 0.3);
  }

  // Fallback when the recording can't load. One "w-OOF". A big dog's bark is a rough, low voice whose pitch jumps
  // up then drops, shaped by a mouth that snaps open then closes.
  // pitch scales the whole voice (giant Loki uses a lower one); length < 1
  // gives a shorter, clipped "ruff".
  woof(delay = 0, pitch = 1, length = 1, loudness = 1) {
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const dur = 0.24 * length / Math.sqrt(pitch);
    const f0 = 255 * pitch * (1 + (Math.random() - 0.5) * 0.12);
    const end = t + dur;

    // Voice: a buzzy fundamental plus a sub-harmonic for that throaty roughness
    const voice = ctx.createOscillator();
    voice.type = 'sawtooth';
    voice.frequency.setValueAtTime(f0 * 0.85, t);
    voice.frequency.exponentialRampToValueAtTime(f0 * 1.5, t + 0.028);
    voice.frequency.exponentialRampToValueAtTime(f0 * 1.15, t + dur * 0.45);
    voice.frequency.exponentialRampToValueAtTime(f0 * 0.7, end);
    const sub = ctx.createOscillator();
    sub.type = 'square';
    sub.frequency.setValueAtTime(f0 * 0.42, t);
    sub.frequency.exponentialRampToValueAtTime(f0 * 0.75, t + 0.028);
    sub.frequency.exponentialRampToValueAtTime(f0 * 0.35, end);
    const subGain = ctx.createGain();
    subGain.gain.value = 0.35;

    // Irregular wobble in the pitch (vocal-fold jitter) so it isn't a pure tone
    const jitter = ctx.createOscillator();
    jitter.type = 'triangle';
    jitter.frequency.value = 31 + Math.random() * 14;
    const jitterDepth = ctx.createGain();
    jitterDepth.gain.value = f0 * 0.06;
    jitter.connect(jitterDepth);
    jitterDepth.connect(voice.frequency);
    jitterDepth.connect(sub.frequency);

    // Breath: a burst of air at the start ("hw-") that tails into the voice
    const breath = ctx.createBufferSource();
    breath.buffer = this.white;
    const breathFilter = ctx.createBiquadFilter();
    breathFilter.type = 'bandpass';
    breathFilter.frequency.value = 1600 * Math.sqrt(pitch);
    breathFilter.Q.value = 0.7;
    const breathGain = ctx.createGain();
    breathGain.gain.setValueAtTime(0.0001, t);
    breathGain.gain.exponentialRampToValueAtTime(0.5, t + 0.006);
    breathGain.gain.exponentialRampToValueAtTime(0.12, t + 0.04);
    breathGain.gain.exponentialRampToValueAtTime(0.0001, end);

    // Throat grit
    const throat = ctx.createGain();
    throat.gain.value = 0.55;
    const grit = ctx.createWaveShaper();
    grit.curve = this.growlCurve;
    grit.oversample = '2x';

    // Mouth: vowel formants that open wide for the "OO-" then close on "-F"
    const mouth = ctx.createGain();
    const formants = [
      { f: [430, 820, 480], q: 5, g: 1.0 },
      { f: [1050, 1500, 1100], q: 7, g: 0.55 },
      { f: [2400, 2700, 2300], q: 9, g: 0.22 },
    ];
    for (const { f, q, g } of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      const scale = Math.sqrt(pitch);
      bp.frequency.setValueAtTime(f[0] * scale, t);
      bp.frequency.exponentialRampToValueAtTime(f[1] * scale, t + 0.035);
      bp.frequency.exponentialRampToValueAtTime(f[2] * scale, end);
      const fg = ctx.createGain();
      fg.gain.value = g * 2.2;
      grit.connect(bp).connect(fg).connect(mouth);
    }
    // Some unfiltered low end keeps it chesty rather than nasal
    const body = ctx.createBiquadFilter();
    body.type = 'lowpass';
    body.frequency.value = 700 * pitch;
    const bodyGain = ctx.createGain();
    bodyGain.gain.value = 0.45;
    grit.connect(body).connect(bodyGain).connect(mouth);

    // Loudness: snappy attack, short hold, quick fall
    const env = ctx.createGain();
    const peak = 0.9 * loudness;
    env.gain.setValueAtTime(0.0001, t);
    env.gain.exponentialRampToValueAtTime(peak, t + 0.012);
    env.gain.setValueAtTime(peak, t + dur * 0.25);
    env.gain.exponentialRampToValueAtTime(peak * 0.35, t + dur * 0.6);
    env.gain.exponentialRampToValueAtTime(0.0001, end);

    voice.connect(throat);
    sub.connect(subGain).connect(throat);
    throat.connect(grit);
    breath.connect(breathFilter).connect(breathGain).connect(mouth);
    mouth.connect(env).connect(this.barkBus);

    const stop = end + 0.05;
    for (const src of [voice, sub, jitter]) {
      src.start(t);
      src.stop(stop);
    }
    breath.start(t, Math.random() * 0.5);
    breath.stop(stop);
  }

  // A run of barks with a natural rhythm. Uses the recording once it has
  // loaded (never the same clip twice in a row), else the synthesised woof.
  bark(times = 2, pitch = 1) {
    if (!this.ctx) return;
    this.reverbSend.gain.value = pitch < 0.7 ? 0.35 : 0.08; // giants echo more
    let at = 0;
    if (this.barkClips?.length) {
      for (let i = 0; i < times; i++) {
        let clip;
        do {
          clip = this.barkClips[Math.floor(Math.random() * this.barkClips.length)];
        } while (clip === this.lastBarkClip && this.barkClips.length > 1);
        this.lastBarkClip = clip;
        this.playBarkClip(clip, at, pitch);
        // The next bark starts once this one's done, while its tail rings on
        at += (BARK_BODY + 0.08 + Math.random() * 0.1) / pitch;
      }
      return;
    }
    for (let i = 0; i < times; i++) {
      const ruff = i > 0 && Math.random() < 0.3;
      this.woof(at, pitch * (1 - i * 0.05), ruff ? 0.65 : 1 - i * 0.12, 1 - i * 0.15);
      at += (ruff ? 0.2 : 0.27) / Math.sqrt(pitch) + Math.random() * 0.06;
    }
  }

  // "Mee-ow": a rising then falling tone through a formant that opens and closes
  meow(delay = 0, pitch = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + delay;
    const len = 0.55 + Math.random() * 0.15;

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(480 * pitch, t);
    osc.frequency.linearRampToValueAtTime(760 * pitch, t + len * 0.3);
    osc.frequency.linearRampToValueAtTime(520 * pitch, t + len);

    const vibrato = ctx.createOscillator();
    const vibratoDepth = ctx.createGain();
    vibrato.frequency.value = 6;
    vibratoDepth.gain.value = 12;
    vibrato.connect(vibratoDepth).connect(osc.frequency);

    const formant = ctx.createBiquadFilter();
    formant.type = 'bandpass';
    formant.Q.value = 3;
    formant.frequency.setValueAtTime(800, t);
    formant.frequency.linearRampToValueAtTime(1500, t + len * 0.35);
    formant.frequency.linearRampToValueAtTime(700, t + len);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.7, t + 0.06);
    gain.gain.setValueAtTime(0.7, t + len * 0.6);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);

    osc.connect(formant).connect(gain).connect(this.master);
    osc.start(t);
    vibrato.start(t);
    osc.stop(t + len + 0.05);
    vibrato.stop(t + len + 0.05);
  }

  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [660, 880, 1320].forEach((f, i) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.08);
      g.gain.exponentialRampToValueAtTime(0.25, t + i * 0.08 + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.08 + 0.35);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.08);
      o.stop(t + i * 0.08 + 0.4);
    });
  }
}
