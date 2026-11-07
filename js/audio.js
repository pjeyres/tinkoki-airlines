// Game sounds: a synthesised wind rush that follows speed, Loki's bark
// (a real recording) and Tinker's meow.

// A recording of a dog barking by Amada44 on Wikimedia Commons, CC BY-SA 3.0
// (converted to AAC). Each clip is one bark plus its natural tail:
// [start, end] in seconds. The bark itself lasts about BARK_BODY seconds.
const BARK_RECORDINGS = [
  { url: 'sounds/bark-1.m4a', clips: [[0.15, 0.75], [1.14, 1.75], [1.85, 2.5]] },
];
const BARK_BODY = 0.2;

function fetchBarkFiles() {
  const files = Promise.all(BARK_RECORDINGS.map(async ({ url, clips }) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${url}: ${res.status}`);
    return { data: await res.arrayBuffer(), clips };
  }));
  files.catch(() => {}); // reported when the bark is decoded
  return files;
}

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    // Start downloading the bark now so it's ready by the time Loki boards
    this.barkFiles = fetchBarkFiles();
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

    this.setupEcho();
    this.loadBarks();
  }

  // Decodes the recording. Barks asked for before it's ready wait for it; if
  // it fails (say, a dropped connection) the next bark tries again.
  loadBarks() {
    this.barksReady ??= (async () => {
      try {
        const files = await this.barkFiles;
        const loaded = await Promise.all(files.map(async ({ data, clips }) => {
          const buffer = await this.ctx.decodeAudioData(data.slice(0));
          return clips.map(([start, end]) => ({ buffer, start, end }));
        }));
        this.barkClips = loaded.flat();
      } catch (err) {
        console.warn('Bark recording unavailable', err);
        this.barkFiles = fetchBarkFiles();
        this.barksReady = null;
      }
    })();
    return this.barksReady;
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

  // A short outdoor echo, used for giant barks
  setupEcho() {
    const ctx = this.ctx;
    const irLen = Math.floor(ctx.sampleRate * 0.7);
    const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.5);
    }
    const reverb = ctx.createConvolver();
    reverb.buffer = ir;
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.35;
    this.reverbSend.connect(reverb).connect(this.master);
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

  // A run of barks with a natural rhythm, never the same clip twice in a row.
  // If the recording is still loading, the barks play as soon as it's ready.
  bark(times = 2, pitch = 1) {
    if (!this.ctx) return;
    if (!this.barkClips) {
      this.loadBarks().then(() => this.barkClips && this.bark(times, pitch));
      return;
    }
    let at = 0;
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
