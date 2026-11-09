export const COURT = {
  halfL: 20,
  halfW: 10,
  goalHalf: 1.75,
  goalHeight: 2.05,
  wallL: 20.55,
  wallW: 10.35,
  netDepth: 1.45,
  ballRadius: 0.115,
};

export const MATCH = {
  halfSeconds: 180,
  halftimePause: 5,
  goalPause: 4.4,
  kickoffPause: 2.1,
  extraHalfSeconds: 60,
};

export const PLAYER = {
  radius: 0.42,
  height: 1.82,
  accel: 30,
  turnSpeed: 12,
};

export const FORMATION = {
  // z, x multipliers relative to attack direction. x = formation depth from own goal.
  GK: { depth: 0.55, z: 0 },
  LB: { depth: 9.8, z: -4.9 },
  RB: { depth: 9.8, z: 4.9 },
  CM: { depth: 15.7, z: 0.4 },
  ST: { depth: 21.6, z: -0.2 },
};

export const DEPTH = { GK: 1.6, LB: 8.2, RB: 8.2, CM: 13.5, ST: 17.6 };

export const ROLE_LABEL = {
  GK: 'GOALKEEPER',
  LB: 'LEFT BACK',
  RB: 'RIGHT BACK',
  CM: 'MIDFIELDER',
  ST: 'STRIKER',
};

export const ACTION = {
  idle: 0,
  run: 1,
  kick: 2,
  slide: 3,
  hurt: 4,
  celebrate: 5,
  dive: 6,
  pass: 7,
  shoot: 8,
};

export const PHASE = {
  countdown: 'countdown',
  playing: 'playing',
  goal: 'goal',
  halftime: 'halftime',
  fulltime: 'fulltime',
  paused: 'paused',
};

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const angleLerp = (a, b, t) => {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
};
export const len = (x, z) => Math.hypot(x, z);
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const rand = (a, b) => a + Math.random() * (b - a);
export const chance = (p) => Math.random() < p;
