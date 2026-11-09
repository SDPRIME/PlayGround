import './style.css';
import { TEAMS, getTeam, randomOpponent } from './data/teams.js';
import { Arena } from './game/arena.js';
import { MatchSim, createMatchState } from './game/simulation.js';
import { InputController } from './game/input.js';
import { AudioEngine } from './game/audio.js';
import { OnlineNet } from './game/net.js';
import { PHASE, ROLE_LABEL, MATCH, clamp, angleLerp } from './game/constants.js';

const $ = (id) => document.getElementById(id);

class GameApp {
  constructor() {
    window.__gameApp = this;
    this.selectedIndex = Math.max(0, TEAMS.findIndex((t) => t.id === localStorage.getItem('khamasi-team')));
    if (this.selectedIndex < 0) this.selectedIndex = 0;
    this.quality = localStorage.getItem('khamasi-quality') || 'low';
    this.mode = 'menu';
    this.matchActive = false;
    this.paused = false;
    this.ownTeam = 0;
    this.homeTeam = TEAMS[0];
    this.awayTeam = TEAMS[1];
    this.sim = null;
    this.state = null;
    this.net = null;
    this.netRole = null;
    this.remoteInput = this.blankInput();
    this.currentConfig = null;
    this.guestSnapshot = null;
    this.guestTargets = null;
    this.lastFrame = performance.now();
    this.lastHud = 0;
    this.lastNet = 0;
    this.lastGuestSend = 0;
    this.lastPhase = null;
    this.finished = false;
    this.events = [];
    this.feedTimers = [];
    this.audio = new AudioEngine();
    this.input = new InputController();
    this.arena = new Arena($('arena'), this.quality);
    this.arena.scene.background = this.arena.scene.background || null;
    this.bindUI();
    this.updateTeamUI();
    this.applyQualityLabel();
    $('boot')?.classList.add('done');
    requestAnimationFrame((t) => this.loop(t));
    document.fonts?.ready.then(() => {
      this.arena.setMenuTeams(this.homeTeam, this.awayTeam);
    });
    window.addEventListener('resize', () => this.arena.resize());
  }

  blankInput() {
    return { mx: 0, mz: 0, sprint: false, shootHeld: false, shootDown: false, shootUp: false, pass: false, tackle: false, switch: false };
  }

  bindUI() {
    const click = (id, fn) => $(id)?.addEventListener('click', (e) => {
      this.audio.unlock();
      this.audio.click();
      fn(e);
    });

    click('play-quick', () => this.startLocal());
    click('play-online', () => this.openOnline());
    click('team-prev', () => this.cycleTeam(-1));
    click('team-next', () => this.cycleTeam(1));
    click('how-btn', () => this.showModal('how-modal'));
    click('how-close', () => this.hideModal('how-modal'));
    click('how-start', () => {
      this.hideModal('how-modal');
      if (!this.matchActive) this.startLocal();
    });
    click('quality-btn', () => this.toggleQuality());
    click('sound-btn', () => this.toggleSound());
    click('pause-btn', () => this.togglePause());
    click('resume-btn', () => this.togglePause());
    click('quit-btn', () => this.returnToMenu());
    click('restart-btn', () => this.requestRematch());
    click('rematch-btn', () => this.requestRematch());
    click('ft-menu-btn', () => this.returnToMenu());
    click('ft-share-btn', () => this.shareResult());
    click('online-close', () => this.closeOnline());
    click('tab-host', () => this.setOnlineTab('host'));
    click('tab-join', () => this.setOnlineTab('join'));
    click('host-start', () => this.startOnlineHost());
    click('join-btn', () => this.joinRoom());
    click('copy-code', () => this.copyRoomCode());

    $('team-strip')?.addEventListener('click', (e) => {
      const dot = e.target.closest('.team-dot');
      if (!dot) return;
      this.selectedIndex = Number(dot.dataset.index);
      this.audio.click();
      this.updateTeamUI();
    });
    $('join-code')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.joinRoom();
    });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape') {
        if ($('online-modal').classList.contains('active')) {
          this.closeOnline();
        } else if ($('how-modal').classList.contains('active')) {
          this.hideModal('how-modal');
        } else if (this.matchActive && !this.finished) {
          this.togglePause();
        }
      }
    });
    window.addEventListener('pointerdown', () => this.audio.unlock(), { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.matchActive && !this.paused && !this.finished) {
        this.togglePause(true);
      }
    });
  }

  cycleTeam(dir) {
    this.selectedIndex = (this.selectedIndex + dir + TEAMS.length) % TEAMS.length;
    this.audio.click();
    this.updateTeamUI();
  }

  updateTeamUI() {
    const team = TEAMS[this.selectedIndex];
    const opponent = TEAMS[(this.selectedIndex + 1) % TEAMS.length];
    this.homeTeam = team;
    this.awayTeam = opponent;
    localStorage.setItem('khamasi-team', team.id);
    const panel = $('selected-team');
    if (panel) {
      panel.style.setProperty('--team-color', team.color);
      panel.style.setProperty('--team-color2', team.color2);
      panel.style.setProperty('--team-accent', team.accent);
    }
    const crest = $('team-crest-big');
    if (crest) {
      crest.style.setProperty('--team-color', team.color);
      crest.style.setProperty('--team-color2', team.color2);
      crest.querySelector('span').textContent = team.initial;
    }
    $('team-city').textContent = team.city;
    $('team-name').textContent = team.name;
    $('team-ovr').textContent = team.ovr;
    $('team-tags').innerHTML = team.tags.map((t) => `<span>${t}</span>`).join('');
    $('team-strip').innerHTML = TEAMS.map((t, i) => `<button class="team-dot ${i === this.selectedIndex ? 'active' : ''}" data-index="${i}" aria-label="${t.name}" style="--dot:${t.color}"><i></i></button>`).join('');
    $('home-badge').textContent = team.initial;
    $('home-code').textContent = team.code;
    $('home-badge').style.background = team.color;
    $('home-badge').style.color = team.ink;
    $('away-badge').textContent = opponent.initial;
    $('away-code').textContent = opponent.code;
    $('away-badge').style.background = opponent.color;
    $('away-badge').style.color = opponent.ink;
    this.arena.setMenuTeams(team, opponent);
  }

  applyQualityLabel() {
    $('quality-btn').textContent = this.quality === 'high' ? 'جودة: عالية' : 'جودة: سريعة';
  }

  toggleQuality() {
    this.quality = this.quality === 'high' ? 'low' : 'high';
    localStorage.setItem('khamasi-quality', this.quality);
    this.arena.setQuality(this.quality);
    this.applyQualityLabel();
    this.toast(this.quality === 'high' ? 'تم تفعيل الجودة العالية' : 'تم تفعيل وضع السرعة');
  }

  toggleSound() {
    this.audio.setEnabled(!this.audio.enabled);
    $('sound-btn').classList.toggle('muted', !this.audio.enabled);
    this.toast(this.audio.enabled ? 'الصوت يعمل' : 'تم كتم الصوت');
  }

  startLocal() {
    this.audio.unlock();
    const home = getTeam(TEAMS[this.selectedIndex].id);
    const away = randomOpponent(home.id);
    this.closeNet();
    this.mode = 'ai';
    this.ownTeam = 0;
    const sim = new MatchSim({ homeTeam: home, awayTeam: away, seed: Math.random() * 999999, online: false });
    sim.onEvent = (type, data) => this.onSimEvent(type, data);
    this.sim = sim;
    this.state = sim.state;
    this.homeTeam = home;
    this.awayTeam = away;
    this.launchMatchUI();
    this.audio.whistle();
    this.addFeed('KICK OFF', `${home.code} VS ${away.code}`);
  }

  startOnlineHost() {
    if (!this.net || !this.net.connected) {
      this.toast('بانتظار اتصال الخصم');
      return;
    }
    const home = getTeam(TEAMS[this.selectedIndex].id);
    const away = randomOpponent(home.id);
    const config = {
      homeTeamId: home.id,
      awayTeamId: away.id,
      seed: Math.floor(Math.random() * 999999),
      halfSeconds: MATCH.halfSeconds,
    };
    this.net.send({ type: 'start', config });
    this.hideModal('online-modal');
    this.mode = 'online-host';
    this.ownTeam = 0;
    this.currentConfig = config;
    const sim = new MatchSim({ homeTeam: home, awayTeam: away, remoteTeam: 1, seed: config.seed, online: true });
    sim.onEvent = (type, data) => this.onSimEvent(type, data);
    this.sim = sim;
    this.state = sim.state;
    this.homeTeam = home;
    this.awayTeam = away;
    this.remoteInput = this.blankInput();
    this.launchMatchUI();
    this.audio.whistle();
    this.addFeed('ONLINE', `${home.code} VS ${away.code}`);
    this.toast('تم بدء المباراة الأونلاين');
  }

  startOnlineGuest(config) {
    const home = getTeam(config.homeTeamId);
    const away = getTeam(config.awayTeamId);
    this.mode = 'online-guest';
    this.ownTeam = 1;
    this.currentConfig = config;
    this.homeTeam = home;
    this.awayTeam = away;
    this.sim = null;
    const state = createMatchState({ homeTeam: home, awayTeam: away, seed: config.seed });
    state.human = [true, true];
    state.online = true;
    state.phase = PHASE.countdown;
    state.phaseT = MATCH.kickoffPause;
    state.active = [state.players[4].id, state.players[9].id];
    this.state = state;
    this.guestSnapshot = null;
    this.guestTargets = null;
    this.hideModal('online-modal');
    this.launchMatchUI();
    this.audio.whistle();
    this.addFeed('ONLINE', 'أنت تقود ' + away.name);
  }

  launchMatchUI() {
    this.finished = false;
    this.paused = false;
    this.lastPhase = null;
    this.matchActive = true;
    this.input.reset();
    this.arena.setMatchPlayers(this.state.players, this.homeTeam, this.awayTeam);
    this.arena.setMode('game');
    this.arena.setScreenTeam(this.homeTeam, this.awayTeam);
    const menu = $('menu');
    menu.classList.add('closing');
    setTimeout(() => {
      menu.classList.remove('is-active');
      menu.classList.remove('closing');
    }, 480);
    $('hud').classList.add('active');
    $('topbar').classList.remove('is-hidden');
    this.hideModal('goal-overlay');
    this.hideModal('fulltime');
    this.hideModal('pause');
    $('goal-overlay').classList.remove('active');
    $('countdown').classList.remove('active');
    $('event-feed').innerHTML = '';
    this.updateScoreUI();
    $('net-label').textContent = this.mode === 'ai' ? 'BOT MATCH' : 'ONLINE P2P';
    $('net-label').style.color = this.mode === 'ai' ? '' : 'var(--cyan)';
    this.toast(this.mode === 'ai' ? 'اضغط Space للتسديد مع الاستمرار للقوة' : 'المضيف يتحكم بالمباراة');
  }

  returnToMenu() {
    this.closeNet();
    this.matchActive = false;
    this.paused = false;
    this.finished = false;
    this.sim = null;
    this.state = null;
    this.mode = 'menu';
    this.ownTeam = 0;
    this.hideModal('pause');
    this.hideModal('fulltime');
    this.hideModal('online-modal');
    this.hideModal('how-modal');
    $('goal-overlay').classList.remove('active');
    $('countdown').classList.remove('active');
    $('hud').classList.remove('active');
    $('topbar').classList.add('is-hidden');
    $('menu').classList.add('is-active');
    $('menu').classList.remove('closing');
    this.arena.setMode('menu');
    this.arena.setMenuTeams(this.homeTeam, this.awayTeam);
    this.input.reset();
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.05, Math.max(0.001, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (!this.matchActive) {
      this.arena.updateMenu(dt, now, this.selectedIndex);
    } else if (this.state) {
      if (!this.paused) {
        if (this.mode === 'online-guest') {
          this.updateGuest(dt);
          this.sendGuestInput(now);
        } else if (this.sim) {
          const local = this.input.read();
          this.sim.setInput(0, local);
          if (this.mode === 'online-host') {
            this.sim.setInput(1, this.remoteInput);
            this.sendHostNetwork(now);
          }
          this.sim.update(dt);
        }
        this.arena.updateGame(this.state, dt, now, this.ownTeam);
        if (this.lastPhase !== this.state.phase) this.onPhaseChange(this.state.phase);
      } else {
        this.arena.updateGame(this.state, dt, now, this.ownTeam);
      }
      if (now - this.lastHud > 55) {
        this.lastHud = now;
        this.updateHUD();
      }
    }
    this.arena.render();
  }

  onPhaseChange(phase) {
    this.lastPhase = phase;
    if (phase === PHASE.halftime) {
      this.audio.halftime();
      this.addFeed('HALF TIME', 'استراحة قصيرة — تبديل المرمى');
      this.toast('نهاية الشوط الأول');
    } else if (phase === PHASE.fulltime) {
      this.finishMatch();
    } else if (phase === PHASE.playing) {
      this.audio.setExcitement(0.38);
    }
  }

  updateGuest(dt) {
    if (!this.guestSnapshot) return;
    const snap = this.guestSnapshot;
    const s = this.state;
    s.phase = snap.ph;
    s.phaseT = snap.pt;
    s.clock = snap.cl;
    s.half = snap.h;
    if (snap.sc[0] !== s.score[0] || snap.sc[1] !== s.score[1]) {
      s.score = [...snap.sc];
      this.updateScoreUI();
    }
    s.attacks = snap.at;
    s.active = snap.ap;
    s.stats = snap.st || s.stats;
    s.lastGoalTeam = snap.lg;
    s.lastScorer = snap.ls;
    const ease = 1 - Math.exp(-24 * dt);
    snap.p.forEach((v, i) => {
      const p = s.players[i];
      if (!p) return;
      p.x += (v[0] - p.x) * ease;
      p.z += (v[1] - p.z) * ease;
      p.vx = (v[0] - p.x) * 12;
      p.vz = (v[1] - p.z) * 12;
      p.dir = angleLerp(p.dir, v[2], 1 - Math.exp(-18 * dt));
      p.action = v[3];
      p.actionT = v[4];
      p.stamina = v[5];
      p.charge = v[6];
    });
    const b = snap.b;
    s.ball.x += (b[0] - s.ball.x) * Math.min(1, ease * 1.6);
    s.ball.y += (b[1] - s.ball.y) * Math.min(1, ease * 1.6);
    s.ball.z += (b[2] - s.ball.z) * Math.min(1, ease * 1.6);
    s.ball.vx = b[3];
    s.ball.vy = b[4];
    s.ball.vz = b[5];
    s.ball.owner = b[6];
  }

  sendGuestInput(now) {
    if (!this.net || !this.net.connected || now - this.lastGuestSend < 45) return;
    this.lastGuestSend = now;
    const input = this.input.read();
    this.net.send({ type: 'input', input });
  }

  sendHostNetwork(now) {
    if (!this.net || !this.net.connected) return;
    if (now - this.lastNet < 50) return;
    this.lastNet = now;
    this.net.send({ type: 'snapshot', snap: this.sim.serialize() });
  }

  onSimEvent(type, data) {
    if (this.mode === 'online-host' && this.net?.connected && type !== 'kickoff') {
      this.net.send({ type: 'event', event: { type, data } });
    }
    this.handleEventVisual(type, data);
  }

  handleEventVisual(type, data) {
    if (type === 'goal') {
      this.showGoal(data);
      this.addFeed('GOAL', `${data.scorer} • ${data.minute}'`);
      this.updateScoreUI();
    } else if (type === 'shot') {
      this.audio.kick(data.power || 0.7);
      this.arena.addShake(0.018 + (data.power || 0.5) * 0.02);
      this.audio.setExcitement(0.85);
      setTimeout(() => this.audio.setExcitement(0.45), 900);
    } else if (type === 'pass') {
      this.audio.pass();
    } else if (type === 'tackle') {
      if (data.won) {
        this.audio.tackle();
        this.arena.addShake(0.02);
      }
    } else if (type === 'post') {
      this.audio.post();
      this.arena.addShake(0.12);
      this.addFeed('WOODWORK', 'الكرة على الخشبة!');
    } else if (type === 'wall') {
      this.audio.pass();
    } else if (type === 'countdown') {
      this.audio.countdown(data.n === 1);
    } else if (type === 'whistle') {
      this.audio.whistle();
    } else if (type === 'halftime') {
      this.audio.halftime();
      this.addFeed('HALF TIME', 'استراحة قصيرة — تبديل المرمى');
    } else if (type === 'fulltime') {
      this.finishMatch();
    } else if (type === 'secondhalf') {
      this.addFeed('SECOND HALF', 'تبديل المرمى — هيا!');
      this.audio.whistle();
    } else if (type === 'switch') {
      this.audio.click();
    }
  }

  showGoal(data) {
    const overlay = $('goal-overlay');
    const team = data.team === 0 ? this.homeTeam : this.awayTeam;
    $('goal-team').textContent = team.name;
    $('goal-player').textContent = data.ownGoal ? `OWN GOAL • ${data.scorer}` : data.scorer;
    $('goal-minute').textContent = `${data.minute}'`;
    $('goal-overlay').querySelector('.goal-content h2').style.color = team.color;
    overlay.classList.remove('active');
    // restart CSS animation
    void overlay.offsetWidth;
    overlay.classList.add('active', 'flash');
    this.audio.goal();
    this.arena.celebrate(data.team);
    this.arena.addShake(0.22);
    this.audio.setExcitement(1);
    clearTimeout(this.goalTimer);
    this.goalTimer = setTimeout(() => {
      overlay.classList.remove('active', 'flash');
      this.audio.setExcitement(0.4);
    }, 3800);
  }

  updateHUD() {
    const state = this.state;
    if (!state) return;
    this.updateScoreUI();
    const clock = Math.max(0, state.clock);
    const minutes = Math.floor(clock / 60);
    const seconds = Math.floor(clock % 60);
    $('clock').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    $('half-label').textContent = state.half === 1 ? 'H1' : 'H2';
    const team = this.ownTeam;
    const active = state.players.find((p) => p.id === state.active[team]) || state.players[team * 5 + 4];
    if (active) {
      $('player-num').textContent = active.number;
      $('player-name').textContent = active.name;
      $('player-role').textContent = ROLE_LABEL[active.role] || active.role;
      $('stamina-fill').style.width = `${active.stamina}%`;
      $('player-num').style.background = (active.team === 0 ? this.homeTeam : this.awayTeam).color;
    }
    const charge = active?.charge || 0;
    $('charge-wrap').classList.toggle('active', charge > 0.02);
    $('charge-fill').style.width = `${clamp(charge * 100, 0, 100)}%`;
    this.updateCountdown();
  }

  updateScoreUI() {
    if (!this.state) return;
    $('home-score').textContent = this.state.score[0];
    $('away-score').textContent = this.state.score[1];
    $('home-code').textContent = this.homeTeam.code;
    $('away-code').textContent = this.awayTeam.code;
    $('home-badge').textContent = this.homeTeam.initial;
    $('away-badge').textContent = this.awayTeam.initial;
    $('home-badge').style.background = this.homeTeam.color;
    $('away-badge').style.background = this.awayTeam.color;
    $('home-badge').style.color = this.homeTeam.ink;
    $('away-badge').style.color = this.awayTeam.ink;
  }

  updateCountdown() {
    const state = this.state;
    const overlay = $('countdown');
    if (!state || this.paused) {
      overlay.classList.remove('active');
      return;
    }
    if (state.phase === PHASE.countdown) {
      overlay.classList.add('active');
      $('countdown-label').textContent = state.half === 1 ? 'KICK OFF' : 'SECOND HALF';
      const n = Math.ceil(state.phaseT);
      $('countdown-num').textContent = n > 0 ? String(n) : 'GO';
      if (this._lastCountNum !== n) {
        this._lastCountNum = n;
        $('countdown-num').style.animation = 'none';
        void $('countdown-num').offsetWidth;
        $('countdown-num').style.animation = '';
      }
    } else if (state.phase === PHASE.halftime) {
      overlay.classList.add('active');
      $('countdown-label').textContent = 'HALF TIME';
      $('countdown-num').textContent = 'HT';
    } else {
      overlay.classList.remove('active');
    }
  }

  finishMatch() {
    if (this.finished || !this.state) return;
    this.finished = true;
    this.audio.fulltime();
    const [hs, as] = this.state.score;
    $('ft-home-score').textContent = hs;
    $('ft-away-score').textContent = as;
    $('ft-home-name').textContent = this.homeTeam.name;
    $('ft-away-name').textContent = this.awayTeam.name;
    $('ft-home-badge').textContent = this.homeTeam.initial;
    $('ft-away-badge').textContent = this.awayTeam.initial;
    $('ft-home-badge').style.background = this.homeTeam.color;
    $('ft-away-badge').style.background = this.awayTeam.color;
    const title = hs === as ? 'تعادل مثير' : (hs > as ? `فوز ${this.homeTeam.name}` : `فوز ${this.awayTeam.name}`);
    $('ft-title').textContent = title;
    $('ft-sub').textContent = hs === as
      ? 'لا غالب ولا مغلوب. الملعب يطلب وقتاً إضافياً.'
      : 'لعبة جيدة. الملعب يتذكر كل شيء.';
    setTimeout(() => this.showModal('fulltime'), 650);
  }

  requestRematch() {
    if (this.mode === 'online-guest') {
      this.net?.send({ type: 'rematchReq' });
      this.toast('تم إرسال طلب مباراة جديدة للمضيف');
      return;
    }
    if (this.mode === 'online-host' && this.net?.connected) {
      const config = {
        homeTeamId: this.homeTeam.id,
        awayTeamId: this.awayTeam.id,
        seed: Math.floor(Math.random() * 999999),
        halfSeconds: MATCH.halfSeconds,
      };
      this.net.send({ type: 'start', config });
      this.currentConfig = config;
      this.hideModal('fulltime');
      this.hideModal('pause');
      const sim = new MatchSim({ homeTeam: this.homeTeam, awayTeam: this.awayTeam, remoteTeam: 1, seed: config.seed, online: true });
      sim.onEvent = (type, data) => this.onSimEvent(type, data);
      this.sim = sim;
      this.state = sim.state;
      this.remoteInput = this.blankInput();
      this.launchMatchUI();
      return;
    }
    if (this.sim || this.mode === 'ai') {
      this.hideModal('fulltime');
      this.hideModal('pause');
      this.startLocal();
    }
  }

  togglePause(force = false) {
    if (!this.matchActive || this.finished) return;
    if (this.mode === 'online-guest') {
      this.net?.send({ type: 'pauseReq' });
      return;
    }
    this.paused = force ? true : !this.paused;
    if (this.mode === 'online-host') this.net?.send({ type: 'pause', paused: this.paused });
    if (this.paused) {
      this.showModal('pause');
      $('pause-sub').textContent = this.mode === 'online-host' ? 'سيتوقف الوقت لكليكما.' : 'خذ نفساً. المباراة تنتظرك.';
      $('restart-btn').style.display = '';
      this.input.reset();
    } else {
      this.hideModal('pause');
      this.input.reset();
    }
    $('countdown').classList.toggle('active', false);
    this.audio.click();
  }

  handleNetData(msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'hello') {
      this.toast('انضم خصم إلى الغرفة');
    } else if (msg.type === 'start' && this.netRole === 'join') {
      this.startOnlineGuest(msg.config);
    } else if (msg.type === 'input' && this.netRole === 'host') {
      this.remoteInput = { ...this.blankInput(), ...(msg.input || {}) };
    } else if (msg.type === 'snapshot' && this.netRole === 'join') {
      this.guestSnapshot = msg.snap;
    } else if (msg.type === 'event' && this.netRole === 'join') {
      const event = msg.event;
      if (event?.type) this.handleEventVisual(event.type, event.data || {});
    } else if (msg.type === 'pause') {
      if (this.netRole === 'join') {
        this.paused = !!msg.paused;
        if (this.paused) {
          $('pause-sub').textContent = 'أوقف المضيف المباراة مؤقتاً.';
          this.showModal('pause');
        } else {
          this.hideModal('pause');
        }
      }
    } else if (msg.type === 'pauseReq' && this.netRole === 'host') {
      this.togglePause();
    } else if (msg.type === 'rematchReq' && this.netRole === 'host') {
      this.requestRematch();
    } else if (msg.type === 'bye') {
      this.toast('غادر الخصم المباراة');
      setTimeout(() => this.returnToMenu(), 900);
    }
  }

  // ---------- online lobby ----------
  openOnline() {
    this.showModal('online-modal');
    if (!this.net) {
      this.setOnlineTab('host');
    }
  }

  closeOnline() {
    this.hideModal('online-modal');
    this.closeNet();
  }

  closeNet() {
    if (this.net) {
      if (this.mode !== 'menu') this.net.send({ type: 'bye' });
      this.net.close();
    }
    this.net = null;
    this.netRole = null;
  }

  makeNet(role) {
    if (this.net) this.net.close();
    this.net = new OnlineNet();
    this.netRole = role;
    this.net.on('status', (s) => this.onNetStatus(s));
    this.net.on('error', (e) => this.onNetError(e));
    this.net.on('connected', () => this.onNetConnected());
    this.net.on('data', (data) => this.handleNetData(data));
    this.net.on('closed', () => {
      if (!this.netRole) return;
      this.toast('انقطع الاتصال بالخصم');
      if (this.matchActive) setTimeout(() => this.returnToMenu(), 1300);
    });
    return this.net;
  }

  setOnlineTab(tab) {
    $('tab-host').classList.toggle('active', tab === 'host');
    $('tab-join').classList.toggle('active', tab === 'join');
    $('host-pane').classList.toggle('active', tab === 'host');
    $('join-pane').classList.toggle('active', tab === 'join');
    this.activeOnlineTab = tab;
    if (tab === 'host') {
      this.makeNet('host');
      const code = this.net.host();
      $('room-code').textContent = code;
      this.setHostStatus('جارٍ إنشاء الغرفة…');
      $('host-start').disabled = true;
    } else {
      if (this.net) this.net.close();
      this.net = null;
      this.netRole = null;
      $('join-status').textContent = 'جاهز للاتصال';
      $('join-status').parentElement.classList.remove('error', 'ok');
      $('join-btn').disabled = false;
    }
  }

  setHostStatus(text, kind = '') {
    const el = $('host-status');
    el.textContent = text;
    el.parentElement.classList.remove('error', 'ok');
    if (kind) el.parentElement.classList.add(kind);
  }

  onNetStatus(status) {
    if (status.state === 'creating') {
      this.setHostStatus('جارٍ إنشاء الغرفة…');
    } else if (status.state === 'waiting') {
      $('room-code').textContent = status.code;
      this.setHostStatus('الغرفة جاهزة — شارك الرمز مع صديقك');
    } else if (status.state === 'connecting') {
      $('join-status').textContent = 'جارٍ الاتصال بالغرفة…';
      $('join-status').parentElement.classList.add('ok');
    } else if (status.state === 'connected') {
      if (this.netRole === 'host') {
        this.setHostStatus('الخصم متصل — المباراة جاهزة', 'ok');
        $('host-start').disabled = false;
      } else {
        $('join-status').textContent = 'تم الاتصال — بانتظار المضيف لبدء المباراة';
        $('join-status').parentElement.classList.add('ok');
        $('join-btn').disabled = true;
      }
    } else if (status.state === 'timeout') {
      this.setJoinError('لم يتم العثور على الغرفة. تأكد من الرمز.');
      this.net?.close();
    } else if (status.state === 'closed') {
      // handled by closed event
    }
  }

  onNetError(error) {
    const code = error?.type || error?.message || 'unknown';
    if (code === 'peer-unavailable') {
      this.setJoinError('الغرفة غير موجودة أو أُغلقت');
    } else if (code === 'unavailable-id') {
      this.setHostStatus('رمز الغرفة مستخدم — يتم إنشاء رمز جديد…', 'error');
      if (this.netRole === 'host') setTimeout(() => {
        if (this.netRole === 'host') this.setOnlineTab('host');
      }, 550);
    } else if (code === 'browser-incompatible') {
      this.setJoinError('المتصفح لا يدعم اتصالات WebRTC');
    } else {
      this.setHostStatus('تعذر الاتصال بخادم المطابقة — تحقق من الشبكة', 'error');
      if (this.netRole === 'join') this.setJoinError('تعذر الاتصال — حاول مرة أخرى');
    }
    console.warn('Peer error', error);
  }

  onNetConnected() {
    this.audio.click();
    this.toast('تم الاتصال بنجاح');
    this.net.send({ type: 'hello', name: 'PLAYER' });
  }

  setJoinError(text) {
    $('join-status').textContent = text;
    $('join-status').parentElement.classList.add('error');
    $('join-btn').disabled = false;
  }

  joinRoom() {
    const code = $('join-code').value.toUpperCase().trim();
    if (code.length < 4) {
      this.setJoinError('أدخل رمز غرفة صحيحاً (٥ أحرف)');
      return;
    }
    this.makeNet('join');
    $('join-btn').disabled = true;
    this.net.join(code);
  }

  copyRoomCode() {
    const code = $('room-code').textContent;
    if (!code || code === '-----') return;
    navigator.clipboard?.writeText(code).then(() => this.toast('تم نسخ رمز الغرفة')).catch(() => this.toast(`الرمز: ${code}`));
  }

  shareResult() {
    const text = `${this.homeTeam.name} ${this.state.score[0]} - ${this.state.score[1]} ${this.awayTeam.name} • KHAMASI 5v5`;
    if (navigator.share) {
      navigator.share({ title: 'KHAMASI', text }).catch(() => {});
    } else {
      navigator.clipboard?.writeText(text).then(() => this.toast('تم نسخ النتيجة')).catch(() => this.toast(text));
    }
  }

  // ---------- ui ----------
  showModal(id) {
    $(id)?.classList.add('active');
  }

  hideModal(id) {
    $(id)?.classList.remove('active');
  }

  addFeed(label, text) {
    const feed = $('event-feed');
    const item = document.createElement('div');
    item.className = 'feed-item';
    item.innerHTML = `<b>${label}</b>${text}`;
    feed.prepend(item);
    while (feed.children.length > 4) feed.lastChild.remove();
    setTimeout(() => item.remove(), 5200);
  }

  toast(text) {
    const el = $('toast');
    $('toast-text').textContent = text;
    el.classList.add('active');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('active'), 2600);
  }
}

window.__gameApp = new GameApp();
