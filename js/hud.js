// Cockpit instruments: attitude ball, heading tape and readouts
const $ = (id) => document.getElementById(id);

function setupCanvas(canvas) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, w, h };
}

const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

export class Hud {
  constructor() {
    this.att = $('attitude');
    this.tape = $('compass');
    this.lastText = 0;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    this.attC = setupCanvas(this.att);
    this.tapeC = setupCanvas(this.tape);
  }

  drawAttitude(pitch, roll) {
    const { ctx, w, h } = this.attC;
    const r = Math.min(w, h) / 2 - 2;
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.clip();

    ctx.save();
    ctx.rotate(-roll);
    const pxPerRad = r / 0.8;
    const offset = pitch * pxPerRad;
    ctx.fillStyle = '#5aa9e6';
    ctx.fillRect(-r * 2, -r * 4 + offset, r * 4, r * 4);
    ctx.fillStyle = '#8a6a3d';
    ctx.fillRect(-r * 2, offset, r * 4, r * 4);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-r * 2, offset);
    ctx.lineTo(r * 2, offset);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'left';
    for (let deg = -60; deg <= 60; deg += 10) {
      if (deg === 0) continue;
      const y = offset - (deg * Math.PI / 180) * pxPerRad;
      const half = deg % 20 === 0 ? r * 0.35 : r * 0.18;
      ctx.beginPath();
      ctx.moveTo(-half, y);
      ctx.lineTo(half, y);
      ctx.stroke();
      if (deg % 20 === 0) ctx.fillText(String(Math.abs(deg)), half + 3, y + 3);
    }
    ctx.restore();

    // Fixed "paw" marker for Loki's nose
    ctx.strokeStyle = cssVar('--gold') || '#f2b33d';
    ctx.fillStyle = ctx.strokeStyle;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-r * 0.55, 0);
    ctx.lineTo(-r * 0.18, 0);
    ctx.lineTo(-r * 0.1, r * 0.1);
    ctx.moveTo(r * 0.55, 0);
    ctx.lineTo(r * 0.18, 0);
    ctx.lineTo(r * 0.1, r * 0.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  drawCompass(heading, ballBearing) {
    const { ctx, w, h } = this.tapeC;
    ctx.clearRect(0, 0, w, h);
    const deg = heading * 180 / Math.PI;
    const pxPerDeg = w / 90;
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.textAlign = 'center';
    ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
    const labels = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
    const start = Math.floor((deg - 50) / 5) * 5;
    for (let d = start; d <= deg + 50; d += 5) {
      const x = w / 2 + (d - deg) * pxPerDeg;
      const norm = ((d % 360) + 360) % 360;
      const big = norm % 15 === 0;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.lineTo(x, h - (big ? 10 : 5));
      ctx.stroke();
      if (labels[norm] !== undefined) {
        ctx.fillStyle = norm === 0 ? (cssVar('--gold') || '#f2b33d') : '#fff';
        ctx.fillText(labels[norm], x, h - 14);
      } else if (norm % 30 === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.font = '10px ui-monospace, monospace';
        ctx.fillText(String(norm), x, h - 14);
        ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      }
    }
    // Nearest tennis ball marker
    if (ballBearing !== undefined) {
      let rel = ((ballBearing - deg + 540) % 360) - 180;
      const clamped = Math.max(-44, Math.min(44, rel));
      const x = w / 2 + clamped * pxPerDeg;
      ctx.fillStyle = '#d4f03c';
      ctx.beginPath();
      ctx.arc(x, 7, 5, 0, Math.PI * 2);
      ctx.fill();
      if (Math.abs(rel) > 44) {
        ctx.fillStyle = '#d4f03c';
        ctx.font = '700 11px ui-sans-serif, system-ui, sans-serif';
        ctx.fillText(rel > 0 ? '▶' : '◀', x + (rel > 0 ? -12 : 12), 11);
      }
    }
    // Lubber line
    ctx.fillStyle = cssVar('--gold') || '#f2b33d';
    ctx.beginPath();
    ctx.moveTo(w / 2 - 6, 0);
    ctx.lineTo(w / 2 + 6, 0);
    ctx.lineTo(w / 2, 8);
    ctx.fill();
  }

  update(now, f, att, info) {
    if (!this.attC.w && !this.tapeC.w) return; // HUD not shown yet
    // Phones hide the attitude ball, and the compass when held upright
    if (this.attC.w) this.drawAttitude(att.pitch, att.roll);
    if (this.tapeC.w) this.drawCompass(att.heading, info.ballBearing);
    if (now - this.lastText < 100) return;
    this.lastText = now;
    const kmh = f.speed * 3.6;
    $('spd').textContent = kmh.toFixed(0);
    $('spd-kt').textContent = `${(f.speed * 1.94384).toFixed(0)} kt`;
    $('alt').textContent = Math.round(f.height).toLocaleString();
    $('agl').textContent = f.groundHeight === undefined ? 'AGL —' : `AGL ${Math.max(0, Math.round(f.height - f.groundHeight)).toLocaleString()} m`;
    $('vs').textContent = `${f.verticalSpeed >= 0 ? '▲' : '▼'} ${Math.abs(f.verticalSpeed).toFixed(0)} m/s`;
    $('hdg').textContent = String(Math.round(att.heading * 180 / Math.PI) % 360).padStart(3, '0') + '°';
    $('thr-fill').style.height = `${f.throttle * 100}%`;
    $('thr').textContent = `${Math.round(f.throttle * 100)}%`;
    $('zoom-fill').style.width = `${f.zoomies * 100}%`;
    $('zoomies').classList.toggle('active', f.boosting);
    // The touch controls' own throttle and zoomies gauges
    $('t-thr-fill').style.height = `${f.throttle * 100}%`;
    $('t-zoom-fill').style.height = `${f.zoomies * 100}%`;
    $('t-zoom').classList.toggle('active', f.boosting);
    $('status').textContent = info.status;
    $('coords').textContent = info.coords;
    $('ball-dist').textContent = info.ballText;
  }
}
