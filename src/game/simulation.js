import {
  COURT, MATCH, PLAYER, FORMATION, DEPTH, ACTION, PHASE,
  clamp, lerp, angleLerp, rand, chance,
} from './constants.js';

const OUT_ROLES = ['LB', 'RB', 'CM', 'ST'];

export function createMatchState({ homeTeam, awayTeam, seed = Math.random() }) {
  let s = seed;
  const random = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const players = [];
  for (let t = 0; t < 2; t += 1) {
    const team = t === 0 ? homeTeam : awayTeam;
    const roles = ['GK', 'LB', 'RB', 'CM', 'ST'];
    roles.forEach((role, i) => {
      players.push({
        id: `${t}-${i}`,
        index: i,
        team: t,
        role,
        number: team.numbers[i],
        name: team.names[i],
        skin: Math.floor(random() * 6),
        x: 0,
        z: 0,
        vx: 0,
        vz: 0,
        dir: t === 0 ? 0 : Math.PI,
        stamina: 100,
        speed: role === 'GK' ? 5.4 : 6.1 + random() * 0.7,
        action: ACTION.idle,
        actionT: 0,
        tackleCd: 0,
        switchCd: 0,
        charge: 0,
        holding: false,
        ai: { think: random() * 0.2, targetX: 0, targetZ: 0, sprint: false, intent: 'shape' },
        goals: 0,
        posHistory: [],
      });
    });
  }
  return {
    phase: PHASE.countdown,
    phaseT: MATCH.kickoffPause,
    clock: MATCH.halfSeconds,
    half: 1,
    score: [0, 0],
    attacks: [1, -1],
    players,
    ball: { x: 0, y: COURT.ballRadius, z: 0, vx: 0, vy: 0, vz: 0, owner: null, lastTouch: null, lastTeam: null, pickupLock: 0, rx: 0, rz: 0 },
    active: [null, null],
    human: [true, false],
    kickoffTeam: 0,
    lastGoalTeam: null,
    lastScorer: null,
    goalMinute: 0,
    stats: [
      { shots: 0, passes: 0, tackles: 0, saves: 0, possession: 0 },
      { shots: 0, passes: 0, tackles: 0, saves: 0, possession: 0 },
    ],
    possession: null,
    eventCount: 0,
    events: [],
    countdown: MATCH.kickoffPause,
    online: false,
    showcase: false,
    lastKick: 0,
    afterGoal: false,
  };
}

export class MatchSim {
  constructor({ homeTeam, awayTeam, remoteTeam = null, seed = Math.random(), online = false, difficulty = 1 }) {
    this.state = createMatchState({ homeTeam, awayTeam, seed });
    this.state.human = remoteTeam === null ? [true, false] : [true, true];
    this.state.online = online;
    this.remoteTeam = remoteTeam;
    this.difficulty = difficulty;
    this.inputs = [
      { mx: 0, mz: 0, sprint: false, shootHeld: false, shootDown: false, shootUp: false, pass: false, tackle: false, switch: false },
      { mx: 0, mz: 0, sprint: false, shootHeld: false, shootDown: false, shootUp: false, pass: false, tackle: false, switch: false },
    ];
    this.onEvent = null;
    this.resetPositions(this.state.kickoffTeam, true);
    this.setActive(0, this.state.players[4].id);
    this.setActive(1, this.state.players[9].id);
    this.emit('kickoff', { team: 0 });
    this.touchTimer = 0;
    this.possessionTimer = 0;
    this.aiTick = 0;
    this.lastCountdownShown = 4;
    this.kickoffStart = true;
  }

  attackDir(team) {
    return this.state.attacks[team];
  }

  ownGoalX(team) {
    return -this.attackDir(team) * COURT.halfL;
  }

  targetGoalX(team) {
    return this.attackDir(team) * COURT.halfL;
  }

  other(team) {
    return 1 - team;
  }

  playerById(id) {
    return this.state.players.find((p) => p.id === id);
  }

  setActive(team, id) {
    this.state.active[team] = id;
    const p = this.playerById(id);
    if (p) p.switchCd = 1.1;
  }

  emit(type, data = {}) {
    this.state.eventCount += 1;
    this.state.events.push({ type, ...data, id: this.state.eventCount });
    if (this.state.events.length > 30) this.state.events.shift();
    if (this.onEvent) this.onEvent(type, { ...data, id: this.state.eventCount });
  }

  drainEvents() {
    const events = this.state.events.slice();
    this.state.events.length = 0;
    return events;
  }

  setInput(team, input) {
    const t = this.inputs[team];
    t.mx = input.mx || 0;
    t.mz = input.mz || 0;
    t.sprint = !!input.sprint;
    t.shootHeld = !!input.shootHeld;
    t.shootDown = !!input.shootDown;
    t.shootUp = !!input.shootUp;
    t.pass = !!input.pass;
    t.tackle = !!input.tackle;
    t.switch = !!input.switch;
  }

  resetPositions(kickoffTeam, first = false) {
    const s = this.state;
    s.kickoffTeam = kickoffTeam;
    s.ball.x = 0;
    s.ball.y = COURT.ballRadius;
    s.ball.z = 0;
    s.ball.vx = 0;
    s.ball.vy = 0;
    s.ball.vz = 0;
    s.ball.owner = null;
    s.ball.lastTouch = null;
    s.ball.pickupLock = 0.15;
    s.players.forEach((p) => {
      p.vx = 0;
      p.vz = 0;
      p.stamina = Math.max(p.stamina, 55);
      p.action = ACTION.idle;
      p.actionT = 0;
      p.charge = 0;
      p.tackleCd = 0;
      p.switchCd = 0;
      p.holding = false;
      const dir = this.attackDir(p.team);
      const role = p.role;
      const mirror = p.team === 0 ? 1 : -1;
      if (role === 'GK') {
        p.x = -dir * (COURT.halfL - 1.3);
        p.z = 0;
      } else if (role === 'LB') {
        p.x = -dir * 8.0;
        p.z = mirror * -4.2;
      } else if (role === 'RB') {
        p.x = -dir * 8.0;
        p.z = mirror * 4.2;
      } else if (role === 'CM') {
        p.x = -dir * 3.1;
        p.z = mirror * 0.8;
      } else {
        p.x = dir * 1.1;
        p.z = mirror * -0.6;
      }
      if (p.team === kickoffTeam && role === 'ST') {
        p.x = -dir * 0.4;
        p.z = 0.35;
      }
      p.dir = dir > 0 ? 0 : Math.PI;
      p.goalSide = 0;
    });
    s.active = [s.players[s.kickoffTeam * 5 + 4].id, s.players[(1 - s.kickoffTeam) * 5 + 4].id];
    if (first) {
      s.phase = PHASE.countdown;
      s.phaseT = MATCH.kickoffPause;
      s.countdown = MATCH.kickoffPause;
    }
  }

  kickOff(team) {
    this.resetPositions(team, false);
    this.state.phase = PHASE.countdown;
    this.state.phaseT = MATCH.kickoffPause;
    this.state.countdown = MATCH.kickoffPause;
    this.emit('kickoff', { team });
  }

  beginPlaying() {
    this.state.phase = PHASE.playing;
    this.state.phaseT = 0;
    this.emit('whistle', {});
  }

  endHalf() {
    const s = this.state;
    if (s.half === 1) {
      s.phase = PHASE.halftime;
      s.phaseT = MATCH.halftimePause;
      this.emit('halftime', { score: [...s.score] });
    } else {
      s.phase = PHASE.fulltime;
      s.phaseT = 0;
      this.emit('fulltime', { score: [...s.score], stats: s.stats });
    }
  }

  startSecondHalf() {
    const s = this.state;
    s.half = 2;
    s.clock = MATCH.halfSeconds;
    s.attacks = [-s.attacks[0], -s.attacks[1]];
    s.kickoffTeam = 1;
    this.resetPositions(1, false);
    s.phase = PHASE.countdown;
    s.phaseT = MATCH.kickoffPause;
    s.countdown = MATCH.kickoffPause;
    this.emit('secondhalf', {});
  }

  update(dt) {
    const s = this.state;
    s.phaseT = Math.max(0, s.phaseT - dt);
    if (s.phase === PHASE.countdown) {
      const prev = Math.ceil(s.phaseT);
      s.countdown = s.phaseT;
      this.emitTick(prev);
      if (s.phaseT <= 0) this.beginPlaying();
      this.updateIdlePlayers(dt);
      this.updateBall(dt);
      this.updateTimers(dt);
      return;
    }
    if (s.phase === PHASE.goal) {
      this.updateBall(dt);
      if (s.phaseT <= 0) {
        const conceding = 1 - s.lastGoalTeam;
        this.kickOff(conceding);
        this.state.afterGoal = false;
      }
      this.updateTimers(dt);
      return;
    }
    if (s.phase === PHASE.halftime) {
      if (s.phaseT <= 0) this.startSecondHalf();
      this.updateIdlePlayers(dt);
      this.updateTimers(dt);
      return;
    }
    if (s.phase !== PHASE.playing) {
      this.updateTimers(dt);
      return;
    }

    s.clock = Math.max(0, s.clock - dt);
    if (s.clock <= 0) {
      this.endHalf();
      return;
    }

    this.touchTimer += dt;
    this.possessionTimer += dt;
    if (s.possession !== null) s.stats[s.possession].possession += dt;

    this.updateHumanControl(dt);
    this.updateAI(dt);
    this.updateMovements(dt);
    this.resolvePlayerCollisions();
    this.updatePossession(dt);
    this.updateBall(dt);
    this.checkGoal();
    this.updateTimers(dt);
    this.debugPossession(dt);
  }

  emitTick(prev) {
    const s = this.state;
    const now = Math.ceil(s.phaseT * 10) / 10;
    if (s.phase === PHASE.countdown) {
      const n = Math.ceil(s.phaseT);
      if (n !== this.lastCountdownShown && n > 0 && n <= 3) {
        this.lastCountdownShown = n;
        this.emit('countdown', { n });
      }
    }
  }

  updateTimers(dt) {
    const s = this.state;
    for (const p of s.players) {
      p.actionT = Math.max(0, p.actionT - dt);
      p.tackleCd = Math.max(0, p.tackleCd - dt);
      p.switchCd = Math.max(0, p.switchCd - dt);
      if (p.action === ACTION.kick || p.action === ACTION.pass || p.action === ACTION.shoot) {
        if (p.actionT <= 0) p.action = ACTION.idle;
      }
      if (p.action === ACTION.slide || p.action === ACTION.hurt || p.action === ACTION.dive) {
        if (p.actionT <= 0) {
          p.action = ACTION.idle;
          if (p.role === 'GK') p.goalSide = 0;
        }
      }
      if (!p.holding) p.charge = Math.max(0, p.charge - dt * 0.4);
    }
    this.touchTimer += dt;
    if (this.touchTimer > 0.4) {
      this.touchTimer = 0;
      this.updateAutoSwitch();
    }
  }

  debugPossession() {}

  updateIdlePlayers(dt) {
    for (const p of this.state.players) {
      p.vx *= Math.exp(-8 * dt);
      p.vz *= Math.exp(-8 * dt);
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.stamina = Math.min(100, p.stamina + dt * 14);
      if (p.actionT <= 0 && p.action !== ACTION.idle) p.action = ACTION.idle;
      if (p.actionT > 0) p.actionT -= dt;
    }
  }

  updateAutoSwitch() {
    const s = this.state;
    for (let team = 0; team < 2; team += 1) {
      if (!s.human[team]) continue;
      const active = this.playerById(s.active[team]);
      if (!active || active.switchCd > 0) continue;
      const ball = s.ball;
      if (ball.owner) {
        const owner = this.playerById(ball.owner);
        if (owner && owner.team === team) {
          if (active.id !== owner.id && active.role !== 'GK') {
            this.setActive(team, owner.id);
          }
        } else if (active.id !== owner.id) {
          const nearest = this.nearestToBall(team, true);
          if (nearest && Math.hypot(nearest.x - active.x, nearest.z - active.z) > 4.5) {
            this.setActive(team, nearest.id);
          }
        }
      } else {
        const nearest = this.nearestToBall(team, true);
        if (nearest && Math.hypot(nearest.x - active.x, nearest.z - active.z) > 5) {
          this.setActive(team, nearest.id);
        }
      }
    }
  }

  nearestToBall(team, excludeGk = false) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.state.players) {
      if (p.team !== team) continue;
      if (excludeGk && p.role === 'GK') continue;
      if (p.stun > 0) continue;
      const d = Math.hypot(p.x - this.state.ball.x, p.z - this.state.ball.z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  nearestOpponent(team, x, z) {
    let best = null;
    let bestD = Infinity;
    for (const p of this.state.players) {
      if (p.team === team) continue;
      const d = Math.hypot(p.x - x, p.z - z);
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
    return best;
  }

  updateHumanControl(dt) {
    const s = this.state;
    for (let team = 0; team < 2; team += 1) {
      if (!s.human[team]) continue;
      const player = this.playerById(s.active[team]);
      if (!player) continue;
      const inp = this.inputs[team];
      if (inp.switch) this.manualSwitch(team);
      if (player.action === ACTION.slide || player.action === ACTION.hurt) continue;
      if (s.ball.owner === player.id) {
        if (inp.shootDown) player.charge = 0.16;
        if (inp.shootHeld) player.charge = Math.min(1, player.charge + dt * 1.45);
        if (inp.shootUp) {
          const power = player.charge || 0.16;
          this.doShot(player, power);
          player.charge = 0;
        } else if (!inp.shootHeld && player.charge > 0.12) {
          const power = player.charge;
          this.doShot(player, power);
          player.charge = 0;
        }
        if (inp.pass) this.doPass(player);
        if (inp.tackle) this.startSlide(player);
        const mag = Math.hypot(inp.mx, inp.mz);
        player.moveX = mag > 0.12 ? inp.mx : 0;
        player.moveZ = mag > 0.12 ? inp.mz : 0;
        player.wantSprint = inp.sprint && mag > 0.15;
      } else {
        player.charge = 0;
        const mag = Math.hypot(inp.mx, inp.mz);
        player.moveX = mag > 0.12 ? inp.mx : 0;
        player.moveZ = mag > 0.12 ? inp.mz : 0;
        player.wantSprint = inp.sprint && mag > 0.15;
        if (inp.tackle) this.startSlide(player);
        if (inp.shootDown) {
          // no ball: quick close-down tackle instead of shooting
          this.startSlide(player);
        }
      }
    }
  }

  manualSwitch(team) {
    const s = this.state;
    const current = this.playerById(s.active[team]);
    const candidates = s.players.filter((p) => p.team === team).sort((a, b) => {
      const da = Math.hypot(a.x - s.ball.x, a.z - s.ball.z);
      const db = Math.hypot(b.x - s.ball.x, b.z - s.ball.z);
      return da - db;
    });
    if (candidates.length < 2) return;
    let idx = candidates.findIndex((p) => p.id === current?.id);
    idx = (idx + 1) % candidates.length;
    this.setActive(team, candidates[idx].id);
    this.emit('switch', { team });
  }

  updateAI(dt) {
    const s = this.state;
    this.aiTick += dt;
    for (const p of s.players) {
      if (!s.human[p.team] && p.id === s.active[p.team]) {
        // Every AI-controlled active player acts via normal AI.
      }
      const inp = this.inputs[p.team];
      const isHumanActive = s.human[p.team] && s.active[p.team] === p.id;
      if (isHumanActive) continue;
      this.updateAIPlayer(p, dt);
    }
  }

  teamStrategy(team) {
    const s = this.state;
    const ball = s.ball;
    const dir = this.attackDir(team);
    const owner = ball.owner ? this.playerById(ball.owner) : null;
    const hasBall = owner && owner.team === team;
    const ballLoose = !owner;
    const distanceToOwnGoal = Math.hypot(ball.x - this.ownGoalX(team), ball.z);
    let urgency = 0;
    if (!hasBall) urgency = distanceToOwnGoal < 14 ? 1 : 0.55;
    return { dir, owner, hasBall, ballLoose, urgency };
  }

  formationPosition(p, ballX, ballZ) {
    const team = p.team;
    const dir = this.attackDir(team);
    const side = p.team === 0 ? 1 : 1;
    const ownGoalX = this.ownGoalX(team);
    if (p.role === 'GK') {
      return { x: ownGoalX + dir * 0.95, z: clamp(ballZ * 0.22, -1.15, 1.15) };
    }
    const base = FORMATION[p.role] || FORMATION.CM;
    let x = ownGoalX + dir * (base.depth + clamp((ballX - ownGoalX) * dir * 0.2, -2, 5));
    let z = base.z * (p.team === 0 ? 1 : 1) + ballZ * 0.18;
    if (p.role === 'LB') z = -4.4 + ballZ * 0.2;
    if (p.role === 'RB') z = 4.4 + ballZ * 0.2;
    if (p.role === 'CM') z = ballZ * 0.35;
    if (p.role === 'ST') z = ballZ * 0.48;
    x = clamp(x, -COURT.halfL + 2, COURT.halfL - 2);
    z = clamp(z, -COURT.halfW + 1.1, COURT.halfW - 1.1);
    return { x, z };
  }

  updateAIPlayer(p, dt) {
    const s = this.state;
    const ai = p.ai;
    ai.think -= dt;
    const strategy = this.teamStrategy(p.team);
    const ball = s.ball;
    const dir = strategy.dir;
    const owner = strategy.owner;
    const hasPossession = strategy.hasBall;
    const teamMates = s.players.filter((q) => q.team === p.team);
    const outfield = teamMates.filter((q) => q.role !== 'GK');
    const distanceBall = Math.hypot(p.x - ball.x, p.z - ball.z);
    const ownGoalX = this.ownGoalX(p.team);
    const targetGoalX = this.targetGoalX(p.team);
    const isClosest = outfield.reduce((best, q) => {
      const d = Math.hypot(q.x - ball.x, q.z - ball.z);
      return d < best.d ? { p: q, d } : best;
    }, { p: null, d: Infinity }).p === p;
    const secondClosest = outfield
      .filter((q) => q.id !== p.id)
      .sort((a, b) => Math.hypot(a.x - ball.x, a.z - ball.z) - Math.hypot(b.x - ball.x, b.z - ball.z))[0];
    const isSecond = secondClosest && secondClosest.id === p.id;
    const ballOwnerPlayer = owner;

    p.wantSprint = false;
    p.moveX = 0;
    p.moveZ = 0;

    if (p.role === 'GK') {
      this.gkAI(p, dt);
      return;
    }

    if (owner && owner.id === p.id) {
      this.carrierAI(p, dt);
      return;
    }

    if (ai.think <= 0) {
      ai.think = 0.12 + Math.random() * 0.15;
      const base = this.formationPosition(p, ball.x, ball.z);
      let targetX = base.x;
      let targetZ = base.z;
      let sprint = false;
      let intent = 'shape';

      if (!hasPossession && strategy.ballLoose) {
        if (isClosest) {
          const lead = 0.13;
          targetX = ball.x + ball.vx * lead;
          targetZ = ball.z + ball.vz * lead;
          sprint = distanceBall > 4;
          intent = 'chase';
        } else if (isSecond) {
          targetX = lerp(ball.x, ownGoalX, 0.22);
          targetZ = lerp(ball.z, 0, 0.28);
          sprint = distanceBall > 8;
          intent = 'cover';
        }
      } else if (!hasPossession && owner.team !== p.team) {
        if (isClosest) {
          const ox = owner.x + owner.vx * 0.18;
          const oz = owner.z + owner.vz * 0.18;
          targetX = ox;
          targetZ = oz;
          sprint = distanceBall > 3;
          intent = 'press';
          if (distanceBall < 1.45 && p.tackleCd <= 0 && chance(0.014)) this.startSlide(p);
        } else if (isSecond) {
          targetX = lerp(owner.x, ownGoalX, 0.3);
          targetZ = lerp(owner.z, 0, 0.5);
          intent = 'cover';
        } else {
          const mark = this.nearestOpponent(p.team, p.x, p.z);
          if (mark && Math.hypot(mark.x - ownGoalX, mark.z) < 15) {
            targetX = lerp(mark.x, ownGoalX, 0.18);
            targetZ = lerp(mark.z, 0, 0.1);
          }
          intent = 'mark';
        }
      } else if (hasPossession) {
        if (isClosest) {
          targetX = ball.x + dir * 2.2;
          targetZ = ball.z + (p.role === 'ST' ? -1.2 : 1.2);
          sprint = true;
          intent = 'support';
        } else {
          const run = p.role === 'ST' ? 4.5 : p.role === 'CM' ? 2.5 : 1.2;
          targetX = clamp(base.x + dir * run, -COURT.halfL + 2, COURT.halfL - 2);
          targetZ = base.z + (p.role === 'ST' ? Math.sin(s.clock * 0.35) * 1.8 : 0);
          sprint = p.role === 'ST' || (p.role === 'CM' && distanceBall < 10);
          intent = 'attack';
        }
      }

      ai.targetX = targetX;
      ai.targetZ = targetZ;
      ai.sprint = sprint;
      ai.intent = intent;
    }

    const dx = ai.targetX - p.x;
    const dz = ai.targetZ - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.18) {
      p.moveX = dx / d;
      p.moveZ = dz / d;
      if (d < 0.8) {
        p.moveX *= 0.55;
        p.moveZ *= 0.55;
      }
    }
    p.wantSprint = ai.sprint && p.stamina > 18;
  }

  carrierAI(p, dt) {
    const s = this.state;
    const ball = s.ball;
    const dir = this.attackDir(p.team);
    const goalX = this.targetGoalX(p.team);
    const distGoal = Math.hypot(goalX - p.x, p.z);
    const pressure = this.nearestOpponent(p.team, p.x, p.z);
    const pressureDist = pressure ? Math.hypot(pressure.x - p.x, pressure.z - p.z) : 99;
    const base = this.formationPosition(p, ball.x, ball.z);
    p.ai.think -= dt;

    // decision to shoot or pass
    if (p.ai.think <= 0) {
      p.ai.think = 0.15;
      const goalOpen = Math.abs(p.z) < 7.2;
      if (distGoal < 9.5 && goalOpen && chance(0.018 + (distGoal < 6 ? 0.012 : 0))) {
        const aimZ = clamp(p.z * 0.45 + rand(-1.1, 1.1), -COURT.goalHalf + 0.3, COURT.goalHalf - 0.3);
        this.doShot(p, clamp(0.65 + (9.5 - distGoal) * 0.04, 0.55, 0.95), aimZ);
        return;
      }
      if (pressureDist < 2.8 && chance(0.05)) {
        const target = this.findPassTarget(p);
        if (target) {
          this.doPass(p, target);
          return;
        }
      }
      if (pressureDist < 2.1 && chance(0.025)) {
        const goalAimZ = p.z > 0 ? COURT.goalHalf - 0.45 : -COURT.goalHalf + 0.45;
        this.doShot(p, 0.55, goalAimZ);
        return;
      }
    }

    let targetX = goalX - dir * 1.8;
    let targetZ = clamp(p.z * 0.55 + rand(-0.2, 0.2), -COURT.halfW + 2, COURT.halfW - 2);
    if (pressure) {
      const px = p.x - pressure.x;
      const pz = p.z - pressure.z;
      const pd = Math.hypot(px, pz) || 1;
      targetX += (px / pd) * 1.2;
      targetZ += (pz / pd) * 2.5;
    }
    if (Math.abs(p.z) > COURT.halfW - 2.2) targetZ = Math.sign(p.z) * (COURT.halfW - 3.2);
    targetX = clamp(targetX, -COURT.halfL + 1.5, COURT.halfL - 0.9);
    targetZ = clamp(targetZ, -COURT.halfW + 1.2, COURT.halfW - 1.2);
    const dx = targetX - p.x;
    const dz = targetZ - p.z;
    const d = Math.hypot(dx, dz) || 1;
    p.moveX = dx / d;
    p.moveZ = dz / d;
    p.wantSprint = p.stamina > 25 && distGoal > 4;
    if (pressureDist < 1.2 && p.tackleCd <= 0 && chance(0.04)) {
      // held ball under pressure: shield rather than panic
    }
  }

  findPassTarget(p) {
    const s = this.state;
    const dir = this.attackDir(p.team);
    let best = null;
    let bestScore = -Infinity;
    for (const mate of s.players) {
      if (mate.team !== p.team || mate.id === p.id || mate.role === 'GK') continue;
      const dx = mate.x - p.x;
      const dz = mate.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 2 || d > 18) continue;
      const forward = (dx * dir - Math.abs(dz) * 0.2) / Math.max(d, 1);
      const goalProx = (mate.x * dir) / COURT.halfL;
      const nearest = this.nearestOpponent(p.team, mate.x, mate.z);
      const open = nearest ? Math.hypot(nearest.x - mate.x, nearest.z - mate.z) : 10;
      const score = forward * 2.2 + goalProx * 1.6 + open * 0.15 - d * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = mate;
      }
    }
    return best;
  }

  gkAI(p, dt) {
    const s = this.state;
    const ball = s.ball;
    const dir = this.attackDir(p.team);
    const goalX = this.ownGoalX(p.team);
    const lineX = goalX + dir * 0.75;
    const ballInOwnHalf = (ball.x - goalX) * dir < 11;
    const ballNear = Math.hypot(ball.x - p.x, ball.z - p.z) < 9.5;
    let targetX = lineX;
    let targetZ = clamp(ball.z * 0.45, -1.25, 1.25);
    if (ballInOwnHalf && ballNear && !ball.owner) {
      targetX = goalX + dir * clamp((ball.x - goalX) * dir * 0.34, 0.5, 4.5);
      targetZ = clamp(ball.z * 0.65, -2.6, 2.6);
    }
    if (ball.owner) {
      const owner = this.playerById(ball.owner);
      if (owner && owner.team !== p.team && ballNear) {
        targetX = goalX + dir * clamp((ball.x - goalX) * dir * 0.18, 0.5, 2.2);
        targetZ = clamp(ball.z * 0.72, -1.8, 1.8);
      }
    }
    // anticipate shots
    if (!ball.owner && Math.hypot(ball.vx, ball.vz) > 13) {
      const coming = (ball.x - goalX) * -dir;
      if (coming > 0 && coming < 15) {
        const t = Math.max(0.05, Math.min(0.8, Math.abs((goalX - ball.x) / (ball.vx || 0.01))));
        const predZ = ball.z + ball.vz * t;
        if (Math.abs(predZ) < 4.2) {
          targetZ = clamp(predZ, -COURT.goalHalf + 0.25, COURT.goalHalf - 0.25);
          targetX = lineX;
          if (p.action !== ACTION.dive && Math.abs(predZ - p.z) > 0.75 && chance(0.2)) {
            p.action = ACTION.dive;
            p.actionT = 0.55;
            p.goalSide = Math.sign(predZ - p.z) || 1;
          }
        }
      }
    }
    const dx = targetX - p.x;
    const dz = targetZ - p.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.12) {
      p.moveX = dx / d;
      p.moveZ = dz / d;
    }
    p.wantSprint = d > 1.6;
    if (p.action === ACTION.dive) {
      p.moveX *= 0.2;
      p.moveZ *= 0.2;
    }
    if (ball.owner === p.id) {
      // hold for a beat then distribute
      p.holding = true;
      p.holdTimer = (p.holdTimer || 0) + dt;
      p.moveX *= 0.2;
      p.moveZ *= 0.2;
      if (p.holdTimer > 1.0) {
        const target = this.findPassTarget(p) || s.players.find((q) => q.team === p.team && q.id !== p.id);
        if (target) this.doPass(p, target, 1.15);
        else this.doShot(p, 0.7);
        p.holdTimer = 0;
        p.holding = false;
      }
    }
  }

  updateMovements(dt) {
    const s = this.state;
    for (const p of s.players) {
      if (p.action === ACTION.slide) {
        p.vx *= Math.exp(-3.4 * dt);
        p.vz *= Math.exp(-3.4 * dt);
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        p.stamina = Math.max(0, p.stamina - dt * 8);
        this.constrainPlayer(p);
        continue;
      }
      if (p.action === ACTION.hurt) {
        p.vx *= Math.exp(-10 * dt);
        p.vz *= Math.exp(-10 * dt);
        p.x += p.vx * dt;
        p.z += p.vz * dt;
        this.constrainPlayer(p);
        continue;
      }
      let mx = p.moveX || 0;
      let mz = p.moveZ || 0;
      const mag = Math.hypot(mx, mz);
      if (mag > 1) {
        mx /= mag;
        mz /= mag;
      }
      const hasBall = s.ball.owner === p.id;
      const isGK = p.role === 'GK';
      let maxSpeed = p.speed * (p.wantSprint && p.stamina > 4 ? 1.34 : 1);
      if (hasBall) maxSpeed *= 0.91;
      if (isGK) maxSpeed *= 1.03;
      if (p.stamina <= 4) maxSpeed *= 0.85;
      if (mag > 0.1) {
        const turn = isGK ? 9 : 15;
        const targetVx = mx * maxSpeed;
        const targetVz = mz * maxSpeed;
        p.vx = lerp(p.vx, targetVx, 1 - Math.exp(-turn * dt));
        p.vz = lerp(p.vz, targetVz, 1 - Math.exp(-turn * dt));
        const desired = Math.atan2(mz, mx);
        p.dir = angleLerp(p.dir, desired, 1 - Math.exp(-12 * dt));
      } else {
        p.vx *= Math.exp(-8 * dt);
        p.vz *= Math.exp(-8 * dt);
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      const sprinting = p.wantSprint && mag > 0.1 && p.stamina > 4;
      p.stamina = clamp(p.stamina + (sprinting ? -dt * 17 : dt * 8.5), 0, 100);
      this.constrainPlayer(p);
      if (p.charge > 0) p.charge = Math.min(1, p.charge + dt * 0.0);
    }
  }

  constrainPlayer(p) {
    const margin = 0.55;
    p.x = clamp(p.x, -COURT.halfL + margin, COURT.halfL - margin);
    p.z = clamp(p.z, -COURT.halfW + margin, COURT.halfW - margin);
    // goal area allows goalkeeper a little extra
    if (p.role === 'GK') {
      const own = this.ownGoalX(p.team);
      if (Math.abs(p.x - own) < 1.4 && Math.abs(p.z) < 1.55) {
        p.x = clamp(p.x, Math.min(own, own + this.attackDir(p.team) * 1.5), Math.max(own, own + this.attackDir(p.team) * 1.5));
      }
    }
  }

  resolvePlayerCollisions() {
    const ps = this.state.players;
    for (let i = 0; i < ps.length; i += 1) {
      for (let j = i + 1; j < ps.length; j += 1) {
        const a = ps[i];
        const b = ps[j];
        let dx = b.x - a.x;
        let dz = b.z - a.z;
        let d = Math.hypot(dx, dz);
        const minD = PLAYER.radius * 2;
        if (d > 0.0001 && d < minD) {
          const push = (minD - d) * 0.5;
          dx /= d;
          dz /= d;
          a.x -= dx * push;
          a.z -= dz * push;
          b.x += dx * push;
          b.z += dz * push;
          if (a.action === ACTION.slide && b.action !== ACTION.slide && s2(b)) {
            b.action = ACTION.hurt;
            b.actionT = 0.24;
            b.vx += dx * 2;
            b.vz += dz * 2;
          }
          if (b.action === ACTION.slide && a.action !== ACTION.slide) {
            a.action = ACTION.hurt;
            a.actionT = 0.24;
            a.vx -= dx * 2;
            a.vz -= dz * 2;
          }
        }
      }
    }
  }

  updatePossession(dt) {
    const s = this.state;
    const ball = s.ball;
    ball.pickupLock = Math.max(0, ball.pickupLock - dt);
    if (ball.owner) {
      const owner = this.playerById(ball.owner);
      if (!owner) {
        ball.owner = null;
        return;
      }
      if (owner.action === ACTION.slide || owner.action === ACTION.hurt) {
        this.releaseBall(owner, 0.5);
        return;
      }
      const speed = Math.hypot(owner.vx, owner.vz);
      const dribble = 0.55 + clamp(speed * 0.04, 0, 0.16);
      const targetX = owner.x + Math.cos(owner.dir) * dribble;
      const targetZ = owner.z + Math.sin(owner.dir) * dribble;
      ball.x = lerp(ball.x, targetX, 1 - Math.exp(-22 * dt));
      ball.z = lerp(ball.z, targetZ, 1 - Math.exp(-22 * dt));
      ball.y = COURT.ballRadius + Math.abs(Math.sin(performance.now() * 0.016)) * 0.015;
      ball.vx = owner.vx;
      ball.vz = owner.vz;
      ball.vy = 0;
      this.checkTackles(owner, dt);
      return;
    }
    if (ball.pickupLock > 0) return;
    if (ball.y > 0.75) return;
    let best = null;
    let bestD = Infinity;
    for (const p of s.players) {
      if (p.action === ACTION.slide || p.action === ACTION.hurt) continue;
      const d = Math.hypot(p.x - ball.x, p.z - ball.z);
      const reach = p.role === 'GK' ? 1.18 : 0.74;
      if (d < reach && d < bestD) {
        bestD = d;
        best = p;
      }
    }
    if (best) {
      const ballSpeed = Math.hypot(ball.vx, ball.vz);
      if (ballSpeed > 17 && best.role !== 'GK' && chance(0.45)) {
        // first touch is heavy: deflect instead of instant control
        const dx = ball.x - best.x;
        const dz = ball.z - best.z;
        const d = Math.hypot(dx, dz) || 1;
        ball.vx = (dx / d) * ballSpeed * 0.42 + best.vx * 0.3;
        ball.vz = (dz / d) * ballSpeed * 0.42 + best.vz * 0.3;
        ball.lastTouch = best.id;
        ball.lastTeam = best.team;
        ball.pickupLock = 0.18;
        return;
      }
      this.takePossession(best);
    }
  }

  takePossession(p) {
    const s = this.state;
    s.ball.owner = p.id;
    s.ball.lastTouch = p.id;
    s.ball.lastTeam = p.team;
    s.possession = p.team;
    p.holding = p.role === 'GK';
    p.charge = 0;
    s.ball.vx = p.vx;
    s.ball.vz = p.vz;
    s.ball.y = COURT.ballRadius;
    if (s.human[p.team] && s.active[p.team] !== p.id) {
      // if a teammate wins the ball, give control to them only if close to user
      const active = this.playerById(s.active[p.team]);
      if (active && Math.hypot(active.x - p.x, active.z - p.z) < 6) this.setActive(p.team, p.id);
    }
  }

  releaseBall(p, power = 0.4) {
    const s = this.state;
    if (s.ball.owner !== p.id) return;
    s.ball.owner = null;
    s.ball.pickupLock = 0.3;
    const speed = Math.hypot(p.vx, p.vz);
    s.ball.vx = p.vx * 0.6 + Math.cos(p.dir) * power * 2;
    s.ball.vz = p.vz * 0.6 + Math.sin(p.dir) * power * 2;
    s.ball.vy = 0.4;
  }

  checkTackles(owner, dt) {
    const s = this.state;
    for (const p of s.players) {
      if (p.team === owner.team || p.action === ACTION.slide) continue;
      const d = Math.hypot(p.x - s.ball.x, p.z - s.ball.z);
      if (d < 0.76 && p.tackleCd <= 0 && chance(0.008)) {
        this.tackle(owner, p);
      }
    }
  }

  startSlide(p) {
    if (p.tackleCd > 0 || p.action === ACTION.slide || p.action === ACTION.hurt) return;
    if (p.role === 'GK') return;
    p.action = ACTION.slide;
    p.actionT = 0.5;
    p.tackleCd = 1.25;
    p.vx = Math.cos(p.dir) * 9.2;
    p.vz = Math.sin(p.dir) * 9.2;
    p.stamina = Math.max(0, p.stamina - 5);
    this.emit('tackle', { team: p.team, x: p.x, z: p.z });
    const owner = this.state.ball.owner ? this.playerById(this.state.ball.owner) : null;
    if (owner && owner.team !== p.team) {
      const d = Math.hypot(owner.x - p.x, owner.z - p.z);
      if (d < 1.9) {
        this.tackle(owner, p);
      }
    } else if (!owner) {
      const bd = Math.hypot(this.state.ball.x - p.x, this.state.ball.z - p.z);
      if (bd < 1.1) {
        this.state.ball.vx = Math.cos(p.dir) * 7 + p.vx * 0.2;
        this.state.ball.vz = Math.sin(p.dir) * 7 + p.vz * 0.2;
        this.state.ball.lastTouch = p.id;
        this.state.ball.lastTeam = p.team;
        this.state.ball.pickupLock = 0.25;
      }
    }
  }

  tackle(owner, tackler) {
    const s = this.state;
    const diff = Math.hypot(owner.x - tackler.x, owner.z - tackler.z);
    if (diff > 2.1) return;
    const winChance = clamp(0.62 - diff * 0.12 + (tackler.stamina - owner.stamina) * 0.002, 0.25, 0.88);
    if (chance(winChance)) {
      s.ball.owner = null;
      const angle = Math.atan2(owner.z - tackler.z, owner.x - tackler.x);
      s.ball.vx = Math.cos(angle) * 3.2 + tackler.vx * 0.4;
      s.ball.vz = Math.sin(angle) * 3.2 + tackler.vz * 0.4;
      s.ball.vy = 0.8;
      s.ball.pickupLock = 0.08;
      s.ball.lastTouch = tackler.id;
      s.ball.lastTeam = tackler.team;
      owner.action = ACTION.hurt;
      owner.actionT = 0.28;
      tackler.action = ACTION.slide;
      tackler.actionT = Math.max(tackler.actionT, 0.28);
      s.stats[tackler.team].tackles += 1;
      this.emit('tackle', { team: tackler.team, x: tackler.x, z: tackler.z, won: true });
      // tackler recovers the loose ball if close
      if (chance(0.55)) {
        s.ball.owner = tackler.id;
        s.ball.lastTouch = tackler.id;
        tackler.action = ACTION.idle;
        tackler.actionT = 0;
      }
    } else {
      owner.action = ACTION.hurt;
      owner.actionT = 0.15;
      tackler.action = ACTION.slide;
      tackler.actionT = 0.55;
      this.emit('tackle', { team: tackler.team, x: tackler.x, z: tackler.z, won: false });
    }
  }

  doPass(p, target = null, powerScale = 1) {
    const s = this.state;
    if (s.ball.owner !== p.id) return;
    if (p.action === ACTION.slide) return;
    const mate = target || this.findPassTarget(p);
    if (!mate) {
      this.doShot(p, 0.42);
      return;
    }
    const lead = Math.max(0.12, Math.hypot(mate.x - p.x, mate.z - p.z) / 22);
    const tx = mate.x + mate.vx * lead;
    const tz = mate.z + mate.vz * lead;
    let dx = tx - p.x;
    let dz = tz - p.z;
    const d = Math.hypot(dx, dz) || 1;
    dx /= d;
    dz /= d;
    const speed = clamp(d * 1.35 + 5.5, 9.5, 21) * powerScale;
    s.ball.owner = null;
    s.ball.pickupLock = 0.18;
    s.ball.vx = dx * speed;
    s.ball.vz = dz * speed;
    s.ball.vy = Math.min(2.2, 0.7 + d * 0.035);
    s.ball.y = 0.22;
    s.ball.lastTouch = p.id;
    s.ball.lastTeam = p.team;
    p.action = ACTION.pass;
    p.actionT = 0.24;
    p.charge = 0;
    s.stats[p.team].passes += 1;
    p.passTarget = mate.id;
    this.emit('pass', { team: p.team, x: p.x, z: p.z });
  }

  doShot(p, power = 0.7, aimZ = null) {
    const s = this.state;
    if (s.ball.owner !== p.id) return;
    const dir = this.attackDir(p.team);
    const goalX = this.targetGoalX(p.team);
    const zAim = aimZ === null
      ? clamp(p.z * 0.45 + rand(-1.2, 1.2), -COURT.goalHalf + 0.25, COURT.goalHalf - 0.25)
      : aimZ;
    const dx = goalX - p.x;
    const dz = zAim - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const spread = (1 - power) * 0.12 + 0.02;
    const aimX = dx / d;
    const aimZv = dz / d + rand(-spread, spread);
    const norm = Math.hypot(aimX, aimZv) || 1;
    const speed = 19 + power * 12;
    s.ball.owner = null;
    s.ball.pickupLock = 0.24;
    s.ball.vx = (aimX / norm) * speed;
    s.ball.vz = (aimZv / norm) * speed;
    s.ball.vy = 1.2 + power * 3.4;
    s.ball.y = 0.26;
    s.ball.lastTouch = p.id;
    s.ball.lastTeam = p.team;
    p.action = ACTION.shoot;
    p.actionT = 0.32;
    p.charge = 0;
    s.stats[p.team].shots += 1;
    this.emit('shot', { team: p.team, power, player: p.name, x: p.x, z: p.z });
  }

  updateBall(dt) {
    const s = this.state;
    const b = s.ball;
    if (b.owner) return;
    if (b.pickupLock < 0) b.pickupLock = 0;
    const gravity = 15.5;
    const rolling = b.y <= COURT.ballRadius + 0.012;
    if (!rolling) {
      b.vy -= gravity * dt;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.z += b.vz * dt;
    b.rx += b.vz * dt * 2.8;
    b.rz -= b.vx * dt * 2.8;
    if (b.y <= COURT.ballRadius) {
      b.y = COURT.ballRadius;
      if (b.vy < -0.7) {
        b.vy = -b.vy * 0.54;
        if (Math.abs(b.vy) < 0.2) b.vy = 0;
        this.emit('bounce', { x: b.x, z: b.z });
      } else {
        b.vy = 0;
      }
    }
    const friction = rolling ? Math.exp(-0.78 * dt) : Math.exp(-0.09 * dt);
    b.vx *= friction;
    b.vz *= friction;

    // side walls
    const wallX = COURT.wallL;
    const wallZ = COURT.wallW;
    if (Math.abs(b.z) > wallZ - COURT.ballRadius) {
      b.z = Math.sign(b.z) * (wallZ - COURT.ballRadius);
      b.vz *= -0.72;
      b.vx *= 0.94;
      b.lastTeam = null;
      this.emit('wall', { x: b.x, z: b.z });
    }
    // end walls / goal interiors
    const inMouth = Math.abs(b.z) < COURT.goalHalf + 0.05 && b.y < COURT.goalHeight + 0.15;
    if (Math.abs(b.x) > wallX - COURT.ballRadius) {
      if (!inMouth) {
        b.x = Math.sign(b.x) * (wallX - COURT.ballRadius);
        b.vx *= -0.68;
        b.vz *= 0.94;
        b.lastTeam = null;
        this.emit('wall', { x: b.x, z: b.z });
      } else if (Math.abs(b.x) > wallX + COURT.netDepth) {
        b.x = Math.sign(b.x) * (wallX + COURT.netDepth);
        b.vx *= -0.3;
        b.vz *= 0.8;
        b.vy = Math.abs(b.vy) * 0.3;
      }
    }
    // goal posts
    for (const side of [-1, 1]) {
      const px = side * (COURT.halfL + 0.35);
      for (const z of [-COURT.goalHalf, COURT.goalHalf]) {
        const dx = b.x - px;
        const dz = b.z - z;
        const d = Math.hypot(dx, dz);
        const rr = COURT.ballRadius + 0.07;
        if (d < rr && d > 0.001) {
          const nx = dx / d;
          const nz = dz / d;
          b.x = px + nx * rr;
          b.z = z + nz * rr;
          const dot = b.vx * nx + b.vz * nz;
          b.vx = (b.vx - 2 * dot * nx) * 0.7;
          b.vz = (b.vz - 2 * dot * nz) * 0.7;
          this.emit('post', { x: b.x, z: b.z });
        }
      }
    }
    // crossbar (rough)
    if (b.y > COURT.goalHeight - 0.08 && b.y < COURT.goalHeight + 0.1) {
      for (const side of [-1, 1]) {
        const px = side * (COURT.halfL + 0.35);
        if (Math.abs(b.x - px) < 0.2 && Math.abs(b.z) < COURT.goalHalf) {
          b.vy = -Math.abs(b.vy) * 0.45 - 0.4;
          b.y = COURT.goalHeight - 0.11;
          this.emit('post', { x: b.x, z: b.z });
        }
      }
    }
    // ball-player deflections
    for (const p of s.players) {
      if (p.id === b.lastTouch || b.y > 1.35) continue;
      const dx = b.x - p.x;
      const dz = b.z - p.z;
      const d = Math.hypot(dx, dz);
      const rr = PLAYER.radius + COURT.ballRadius;
      if (d < rr && d > 0.001) {
        const nx = dx / d;
        const nz = dz / d;
        const speed = Math.hypot(b.vx, b.vz);
        b.x = p.x + nx * rr;
        b.z = p.z + nz * rr;
        if (speed > 4) {
          b.vx = nx * speed * 0.5 + p.vx * 0.5;
          b.vz = nz * speed * 0.5 + p.vz * 0.5;
          b.lastTouch = p.id;
          b.lastTeam = p.team;
          b.pickupLock = Math.min(b.pickupLock, 0.12);
        }
      }
    }
  }

  checkGoal() {
    const s = this.state;
    if (s.phase !== PHASE.playing) return;
    const b = s.ball;
    if (b.y > COURT.goalHeight - 0.06) return;
    if (Math.abs(b.z) > COURT.goalHalf - 0.03) return;
    if (b.x > COURT.halfL + 0.28) {
      this.scoreGoal(0);
    } else if (b.x < -COURT.halfL - 0.28) {
      this.scoreGoal(1);
    }
  }

  scoreGoal(teamScored) {
    const s = this.state;
    const touch = s.ball.lastTouch ? this.playerById(s.ball.lastTouch) : null;
    const ownGoal = touch && touch.team !== teamScored;
    let scorer = touch && touch.team === teamScored ? touch : this.closestToBall(teamScored);
    if (!scorer) scorer = s.players[teamScored * 5 + 4];
    if (ownGoal) scorer = touch;
    s.score[teamScored] += 1;
    s.lastGoalTeam = teamScored;
    s.lastScorer = { name: scorer.name, team: scorer.team, number: scorer.number, ownGoal: !!ownGoal };
    s.goalMinute = Math.max(1, Math.ceil((MATCH.halfSeconds - s.clock) / 60)) + (s.half - 1) * 3;
    s.phase = PHASE.goal;
    s.phaseT = MATCH.goalPause;
    s.ball.owner = null;
    s.ball.pickupLock = 10;
    s.ball.vx *= 0.2;
    s.ball.vz *= 0.2;
    s.ball.vy = Math.min(1.5, s.ball.vy);
    s.stats[teamScored].shots += 0;
    if (scorer.team === teamScored) scorer.goals += 1;
    for (const p of s.players) {
      if (p.team === teamScored) {
        p.action = ACTION.celebrate;
        p.actionT = 4;
      }
    }
    this.emit('goal', {
      team: teamScored,
      scorer: scorer.name,
      number: scorer.number,
      minute: s.goalMinute,
      ownGoal: !!ownGoal,
      score: [...s.score],
      ballX: s.ball.x,
      ballZ: s.ball.z,
    });
  }

  closestToBall(team) {
    return this.state.players
      .filter((p) => p.team === team)
      .sort((a, b) => Math.hypot(a.x - this.state.ball.x, a.z - this.state.ball.z) - Math.hypot(b.x - this.state.ball.x, b.z - this.state.ball.z))[0];
  }

  serialize() {
    const s = this.state;
    const players = s.players.map((p) => [
      Math.round(p.x * 100) / 100,
      Math.round(p.z * 100) / 100,
      Math.round(p.dir * 100) / 100,
      p.action,
      Math.round(p.actionT * 100) / 100,
      Math.round(p.stamina),
      Math.round((p.charge || 0) * 100) / 100,
    ]);
    return {
      t: Date.now(),
      ph: s.phase,
      pt: Math.round(s.phaseT * 10) / 10,
      cl: Math.round(s.clock * 10) / 10,
      h: s.half,
      sc: [...s.score],
      at: [...s.attacks],
      ap: [...s.active],
      b: [
        Math.round(s.ball.x * 100) / 100,
        Math.round(s.ball.y * 100) / 100,
        Math.round(s.ball.z * 100) / 100,
        Math.round(s.ball.vx * 100) / 100,
        Math.round(s.ball.vy * 100) / 100,
        Math.round(s.ball.vz * 100) / 100,
        s.ball.owner,
      ],
      p: players,
      st: s.stats,
      lg: s.lastGoalTeam,
      ls: s.lastScorer,
    };
  }

  applySnapshot(snap) {
    const s = this.state;
    s.phase = snap.ph;
    s.phaseT = snap.pt;
    s.clock = snap.cl;
    s.half = snap.h;
    s.score = snap.sc;
    s.attacks = snap.at;
    s.active = snap.ap;
    snap.p.forEach((v, i) => {
      const p = s.players[i];
      if (!p) return;
      p.x = v[0];
      p.z = v[1];
      p.dir = v[2];
      p.action = v[3];
      p.actionT = v[4];
      p.stamina = v[5];
      p.charge = v[6];
    });
    s.ball.x = snap.b[0];
    s.ball.y = snap.b[1];
    s.ball.z = snap.b[2];
    s.ball.vx = snap.b[3];
    s.ball.vy = snap.b[4];
    s.ball.vz = snap.b[5];
    s.ball.owner = snap.b[6];
    s.stats = snap.st;
    s.lastGoalTeam = snap.lg;
    s.lastScorer = snap.ls;
  }
}

function s2(p) {
  return p.action !== ACTION.slide;
}
