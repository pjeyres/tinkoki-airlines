// Touch controls for phones and tablets: a thumb stick for pitch and bank,
// a throttle slider, hold-to-use buttons, and optional tilt-to-steer.

const STICK_RANGE = 46;                  // px the knob can travel from the centre
const TILT_RANGE = 25 * Math.PI / 180;   // tilt that gives full stick
const TILT_DEADZONE = 3 * Math.PI / 180;

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
// Gentler near the centre for fine corrections, full deflection at the edge
const curve = (v) => Math.sign(v) * Math.abs(v) ** 1.5;
// Keep following a finger that slides off the control
const capture = (el, e) => {
  try {
    el.setPointerCapture(e.pointerId);
  } catch {
    // The pointer has already gone
  }
};

export class TouchControls {
  constructor() {
    this.stick = { x: 0, y: 0 };
    this.tilt = { x: 0, y: 0 };
    this.tiltOn = false;
    this.neutral = null; // how the device was held when tilt was last centred
  }

  // x is bank (right is positive), y is pitch (pulling back climbs)
  get roll() { return clamp(curve(this.stick.x) + this.tilt.x, -1, 1); }
  get pitch() { return clamp(curve(this.stick.y) + this.tilt.y, -1, 1); }

  bindStick(base, knob) {
    let id = null, cx = 0, cy = 0;
    const move = (e) => {
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const d = Math.hypot(dx, dy);
      const k = d > STICK_RANGE ? STICK_RANGE / d : 1;
      this.stick.x = (dx * k) / STICK_RANGE;
      this.stick.y = (dy * k) / STICK_RANGE;
      knob.style.transform = `translate(${dx * k}px, ${dy * k}px)`;
    };
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null;
      this.stick.x = this.stick.y = 0;
      knob.style.transform = '';
      base.classList.remove('active');
    };
    base.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      id = e.pointerId;
      base.classList.add('active');
      const r = base.getBoundingClientRect();
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
      move(e);
      capture(base, e);
    });
    base.addEventListener('pointermove', (e) => { if (e.pointerId === id) move(e); });
    base.addEventListener('pointerup', end);
    base.addEventListener('pointercancel', end);
  }

  // A vertical slider: onChange gets 0 at the bottom to 1 at the top
  bindSlider(el, onChange) {
    let id = null;
    const set = (e) => {
      const r = el.getBoundingClientRect();
      onChange(clamp(1 - (e.clientY - r.top) / r.height, 0, 1));
    };
    el.addEventListener('pointerdown', (e) => {
      id = e.pointerId;
      set(e);
      capture(el, e);
    });
    el.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
    const end = (e) => { if (e.pointerId === id) id = null; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // A button that does something for as long as it's held
  bindHold(el, onChange) {
    el.addEventListener('pointerdown', (e) => {
      el.classList.add('held');
      onChange(true);
      capture(el, e);
    });
    const end = () => {
      el.classList.remove('held');
      onChange(false);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  // iPhones and iPads ask permission first, which must come from a tap
  async enableTilt() {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) throw new Error('This device has no tilt sensor');
    if (typeof DOE.requestPermission === 'function' && await DOE.requestPermission() !== 'granted') {
      throw new Error('Motion access wasn’t allowed');
    }
    if (!this.onOrientation) {
      this.onOrientation = (e) => this.readTilt(e);
      window.addEventListener('deviceorientation', this.onOrientation);
    }
    this.tiltOn = true;
    this.recenter();
  }

  disableTilt() {
    this.tiltOn = false;
    this.tilt.x = this.tilt.y = 0;
  }

  // Whatever way the device is held next becomes "straight and level"
  recenter() {
    this.neutral = null;
  }

  readTilt(e) {
    if (!this.tiltOn || e.beta === null || e.gamma === null) return;
    // Which way is up, in the device's own axes (x right, y to the top edge,
    // z out of the screen). Built from the angles rather than read from the
    // accelerometer, whose signs differ between iOS and Android.
    const b = e.beta * Math.PI / 180, g = e.gamma * Math.PI / 180;
    const ux = -Math.sin(g) * Math.cos(b), uy = Math.sin(b), uz = Math.cos(g) * Math.cos(b);
    // Turn that into the screen's axes, whichever way round it's being held
    const a = (screen.orientation?.angle ?? window.orientation ?? 0) * Math.PI / 180;
    const sx = ux * Math.cos(a) - uy * Math.sin(a);
    const sy = ux * Math.sin(a) + uy * Math.cos(a);
    // Turning it like a steering wheel banks; leaning the top away dives
    const roll = Math.atan2(-sx, Math.hypot(sy, uz));
    const lean = Math.atan2(uz, sy);
    if (!this.neutral) this.neutral = { roll, lean };
    const axis = (angle) => {
      const v = Math.atan2(Math.sin(angle), Math.cos(angle)); // wrap to ±π
      return clamp((Math.sign(v) * Math.max(0, Math.abs(v) - TILT_DEADZONE)) / TILT_RANGE, -1, 1);
    };
    this.tilt.x = axis(roll - this.neutral.roll);
    this.tilt.y = -axis(lean - this.neutral.lean);
  }
}
