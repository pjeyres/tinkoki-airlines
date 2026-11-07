// Arcade flight model for a flying dog. Orientation is kept as three ECEF
// unit vectors (forward, left, up) so loops and rolls work anywhere on Earth.
const C = window.Cesium;
const V = C.Cartesian3;

export const CRUISE_MIN = 15;
export const CRUISE_MAX = 250;   // m/s, about 900 km/h
export const BOOST_FACTOR = 2.6; // Zoomies!
const GRAVITY = 9.81;
// Default distance from the pilot's body centre to the paws, before scaling
export const PAW_CLEARANCE = 0.45;

const ellipsoid = C.Ellipsoid.WGS84;

function rotateAbout(v, axis, angle) {
  // Rodrigues' rotation formula
  const c = Math.cos(angle), s = Math.sin(angle);
  const cross = V.cross(axis, v, new V());
  const d = V.dot(axis, v);
  return new V(
    v.x * c + cross.x * s + axis.x * d * (1 - c),
    v.y * c + cross.y * s + axis.y * d * (1 - c),
    v.z * c + cross.z * s + axis.z * d * (1 - c),
  );
}

// Rotate unit vector a towards perpendicular unit vector b by angle t
function swing(a, b, t) {
  const r = V.add(V.multiplyByScalar(a, Math.cos(t), new V()), V.multiplyByScalar(b, Math.sin(t), new V()), new V());
  return V.normalize(r, r);
}

export class Flight {
  constructor() {
    this.pos = new V();
    this.fwd = new V();
    this.left = new V();
    this.up = new V();
    this.speed = 70;
    this.throttle = 0.25;
    this.zoomies = 1;      // boost stamina 0..1
    this.boosting = false;
    this.grounded = false;
    this.groundHeight = undefined;
    this.height = 0;
    this.verticalSpeed = 0;
    this.scale = 1;
    this.clearance = PAW_CLEARANCE; // set per pilot
    this.assist = true;
    this.events = [];      // 'bonk', 'land', 'takeoff'
  }

  // Place Loki at a location with a heading (degrees, 0 = north)
  place(lon, lat, height, headingDeg = 0, speed = 70) {
    this.pos = V.fromDegrees(lon, lat, height);
    const { east, north, up } = this.enu();
    const h = C.Math.toRadians(headingDeg);
    this.fwd = swing(north, east, h);
    this.up = up;
    this.left = V.normalize(V.cross(up, this.fwd, new V()), new V());
    this.speed = speed;
    this.height = height;
    this.grounded = false;
    this.groundHeight = undefined;
  }

  enu() {
    const m = C.Transforms.eastNorthUpToFixedFrame(this.pos);
    return {
      east: V.normalize(new V(m[0], m[1], m[2]), new V()),
      north: V.normalize(new V(m[4], m[5], m[6]), new V()),
      up: V.normalize(new V(m[8], m[9], m[10]), new V()),
    };
  }

  localUp() {
    return ellipsoid.geodeticSurfaceNormal(this.pos, new V());
  }

  // Heading, pitch, roll (radians) relative to the local horizon
  attitude() {
    const { east, north, up: U } = this.enu();
    const pitch = Math.asin(C.Math.clamp(V.dot(this.fwd, U), -1, 1));
    const heading = Math.atan2(V.dot(this.fwd, east), V.dot(this.fwd, north));
    let right = V.cross(this.fwd, U, new V());
    if (V.magnitude(right) < 1e-6) right = V.negate(this.left, new V());
    V.normalize(right, right);
    const levelUp = V.cross(right, this.fwd, new V());
    const roll = Math.atan2(V.dot(this.up, right), V.dot(this.up, levelUp));
    return { heading: (heading + 2 * Math.PI) % (2 * Math.PI), pitch, roll };
  }

  // Body rotations. Positive pitch = nose up, positive roll = right side down,
  // positive yaw = nose right.
  pitchBy(a) {
    const f = swing(this.fwd, this.up, a);
    this.up = swing(this.up, V.negate(this.fwd, new V()), a);
    this.fwd = f;
  }
  rollBy(b) {
    const u = swing(this.up, V.negate(this.left, new V()), b);
    this.left = swing(this.left, this.up, b);
    this.up = u;
  }
  yawBy(c) {
    const f = swing(this.fwd, V.negate(this.left, new V()), c);
    this.left = swing(this.left, this.fwd, c);
    this.fwd = f;
  }
  rotateAll(axis, angle) {
    this.fwd = rotateAbout(this.fwd, axis, angle);
    this.left = rotateAbout(this.left, axis, angle);
    this.up = rotateAbout(this.up, axis, angle);
  }
  orthonormalize() {
    V.normalize(this.fwd, this.fwd);
    this.left = V.normalize(V.cross(this.up, this.fwd, new V()), new V());
    this.up = V.normalize(V.cross(this.fwd, this.left, new V()), new V());
  }

  // input: { pitch, roll, yaw, throttle, boost } with axes in -1..1
  step(dt, input) {
    this.events.length = 0;
    const { pitch: pIn, roll: rIn, yaw: yIn } = input;

    this.throttle = C.Math.clamp(this.throttle + input.throttle * dt * 0.5, 0, 1);
    this.boosting = input.boost && this.zoomies > 0.02 && !this.grounded;
    this.zoomies = C.Math.clamp(this.zoomies + (this.boosting ? -dt / 6 : dt / 14), 0, 1);

    let att = this.attitude();
    let pitchRate = pIn * 0.95;
    let rollRate = rIn * 2.4;
    let yawRate = yIn * 0.7;

    if (this.assist) {
      if (Math.abs(rIn) < 0.05 && Math.abs(att.roll) < 2.2) rollRate += -att.roll * 1.6;
      if (Math.abs(pIn) < 0.05 && Math.abs(att.roll) < 1.2 && Math.abs(att.pitch) < 1.2) pitchRate += -att.pitch * 0.35;
    }
    if (this.grounded) {
      // Paws on the ground: stay upright, steer with A/D or Q/E
      rollRate = -att.roll * 6;
      if (att.pitch < 0 || pIn < 0) pitchRate = Math.max(pitchRate, -att.pitch * 6);
      yawRate = (yIn + rIn) * 1.4;
    }

    this.pitchBy(pitchRate * dt);
    this.rollBy(rollRate * dt);
    this.yawBy(yawRate * dt);

    // Banking turns Loki like a plane (a nimble one)
    att = this.attitude();
    let U = this.localUp();
    if (!this.grounded) {
      const bankTurn = Math.sin(C.Math.clamp(att.roll, -1.5, 1.5)) * Math.cos(att.pitch);
      const speedFactor = Math.sqrt(Math.min(1, 120 / Math.max(this.speed, 1)));
      this.rotateAll(U, -bankTurn * 1.05 * speedFactor * dt);
    }

    // Speed: throttle sets the cruise speed, gravity trades it with altitude
    let target = CRUISE_MIN + this.throttle * (CRUISE_MAX - CRUISE_MIN);
    if (this.boosting) target *= BOOST_FACTOR;
    if (this.grounded) target = this.throttle * 22; // a good galloping pace
    const accel = target > this.speed ? 0.7 : 0.45;
    this.speed += (target - this.speed) * Math.min(1, dt * accel);
    if (!this.grounded) this.speed -= GRAVITY * Math.sin(att.pitch) * dt * 0.6;
    this.speed = C.Math.clamp(this.speed, 0, CRUISE_MAX * BOOST_FACTOR * 1.2);

    // Too slow to stay up? Loki starts to sink.
    const lift = C.Math.clamp(this.speed / 18, 0, 1);
    const sink = this.grounded ? 0 : (1 - lift) * 9;

    const move = V.multiplyByScalar(this.fwd, this.speed * dt, new V());
    V.add(move, V.multiplyByScalar(U, -sink * dt, new V()), move);
    const oldUp = U;
    const oldHeight = this.height;
    V.add(this.pos, move, this.pos);

    // Carry the orientation along the curve of the Earth
    U = this.localUp();
    const axis = V.cross(oldUp, U, new V());
    const mag = V.magnitude(axis);
    if (mag > 1e-12) this.rotateAll(V.normalize(axis, axis), Math.asin(Math.min(1, mag)));
    this.orthonormalize();

    // Ground contact
    const carto = C.Cartographic.fromCartesian(this.pos);
    let height = carto.height;
    if (this.groundHeight !== undefined) {
      const floor = this.groundHeight + this.clearance * this.scale;
      if (this.grounded) {
        const jumping = pIn > 0.2 && this.speed > 12;
        if (jumping || height > floor + 3 * this.scale) {
          this.grounded = false;
          this.events.push('takeoff');
        } else {
          height = floor;
        }
      } else if (height <= floor) {
        if ((height - oldHeight) / dt < -30) {
          this.events.push('bonk');
          this.speed *= 0.35;
          this.pitchBy(0.45);
        } else {
          this.events.push('land');
          this.grounded = true;
        }
        height = floor;
      }
      if (height !== carto.height) {
        carto.height = height;
        this.pos = C.Cartographic.toCartesian(carto);
      }
    }
    this.height = height;
    this.verticalSpeed = (height - oldHeight) / dt;
  }

  modelMatrix(result) {
    const m = result ?? new C.Matrix4();
    const s = this.scale;
    m[0] = this.fwd.x * s; m[1] = this.fwd.y * s; m[2] = this.fwd.z * s; m[3] = 0;
    m[4] = this.left.x * s; m[5] = this.left.y * s; m[6] = this.left.z * s; m[7] = 0;
    m[8] = this.up.x * s; m[9] = this.up.y * s; m[10] = this.up.z * s; m[11] = 0;
    m[12] = this.pos.x; m[13] = this.pos.y; m[14] = this.pos.z; m[15] = 1;
    return m;
  }

  // A point on Loki in his body frame (metres, before scaling)
  bodyPoint(x, y, z = 0) {
    const s = this.scale;
    const p = V.clone(this.pos);
    V.add(p, V.multiplyByScalar(this.fwd, x * s, new V()), p);
    V.add(p, V.multiplyByScalar(this.up, y * s, new V()), p);
    V.add(p, V.multiplyByScalar(this.left, z * s, new V()), p);
    return p;
  }
}
