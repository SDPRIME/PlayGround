export class InputController {
  constructor() {
    this.keys = new Set();
    this.touch = {
      mx: 0,
      mz: 0,
      sprint: false,
      shootHeld: false,
      pass: false,
      tackle: false,
      switch: false,
      shootDown: false,
      shootUp: false,
    };
    this.edges = {
      shootDown: false,
      shootUp: false,
      pass: false,
      tackle: false,
      switch: false,
    };
    this.stickPointer = null;
    this.stickOrigin = { x: 0, y: 0 };
    this.stickRadius = 56;
    this.shootPointer = null;
    this.enabled = true;
    this.joystick = document.getElementById('joystick-zone');
    this.knob = document.getElementById('joystick-knob');
    this.bindKeyboard();
    this.bindTouch();
  }

  bindKeyboard() {
    const arrows = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Tab']);
    window.addEventListener('keydown', (e) => {
      if (arrows.has(e.code)) e.preventDefault();
      if (e.code === 'Tab' && !e.repeat) {
        this.edges.switch = true;
        return;
      }
      if (e.code === 'Space') {
        if (!e.repeat) {
          this.edges.shootDown = true;
          this.touch.shootHeld = true;
        }
        return;
      }
      if ((e.code === 'KeyE' || e.code === 'KeyJ') && !e.repeat) this.edges.pass = true;
      if ((e.code === 'KeyF' || e.code === 'KeyK') && !e.repeat) this.edges.tackle = true;
      if (e.code === 'KeyQ' && !e.repeat) this.edges.switch = true;
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') {
        this.touch.shootHeld = false;
        this.edges.shootUp = true;
        return;
      }
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.touch.shootHeld = false;
      this.touch.sprint = false;
      this.resetStick();
    });
  }

  bindTouch() {
    if (!this.joystick) return;
    const start = (e) => {
      if (this.stickPointer !== null) return;
      this.stickPointer = e.pointerId;
      const rect = this.joystick.getBoundingClientRect();
      this.stickOrigin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      this.stickRadius = rect.width * 0.36;
      this.joystick.setPointerCapture(e.pointerId);
      this.moveStick(e.clientX, e.clientY);
      e.preventDefault();
    };
    const move = (e) => {
      if (e.pointerId !== this.stickPointer) return;
      this.moveStick(e.clientX, e.clientY);
      e.preventDefault();
    };
    const end = (e) => {
      if (e.pointerId !== this.stickPointer) return;
      this.stickPointer = null;
      this.resetStick();
      e.preventDefault();
    };
    this.joystick.addEventListener('pointerdown', start);
    this.joystick.addEventListener('pointermove', move);
    this.joystick.addEventListener('pointerup', end);
    this.joystick.addEventListener('pointercancel', end);

    document.querySelectorAll('.touch-btn').forEach((btn) => {
      const action = btn.dataset.action;
      const down = (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.setPointerCapture(e.pointerId);
        btn.classList.add('held');
        if (action === 'shoot') {
          this.touch.shootHeld = true;
          this.touch.shootDown = true;
          this.edges.shootDown = true;
          this.shootPointer = e.pointerId;
        } else if (action === 'sprint') {
          this.touch.sprint = true;
        } else {
          this.touch[action] = true;
          this.edges[action] = true;
        }
      };
      const up = (e) => {
        e.preventDefault();
        btn.classList.remove('held');
        if (action === 'shoot') {
          if (this.shootPointer === e.pointerId || e.type === 'pointercancel') {
            this.touch.shootHeld = false;
            this.touch.shootUp = true;
            this.edges.shootUp = true;
            this.shootPointer = null;
          }
        } else if (action === 'sprint') {
          this.touch.sprint = false;
        }
      };
      btn.addEventListener('pointerdown', down);
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
      btn.addEventListener('lostpointercapture', up);
    });
  }

  moveStick(clientX, clientY) {
    let dx = clientX - this.stickOrigin.x;
    let dy = clientY - this.stickOrigin.y;
    const length = Math.hypot(dx, dy);
    if (length > this.stickRadius) {
      dx = (dx / length) * this.stickRadius;
      dy = (dy / length) * this.stickRadius;
    }
    this.touch.mx = dx / this.stickRadius;
    this.touch.mz = dy / this.stickRadius;
    if (this.knob) this.knob.style.transform = `translate(${dx * 0.7}px, ${dy * 0.7}px)`;
  }

  resetStick() {
    this.touch.mx = 0;
    this.touch.mz = 0;
    if (this.knob) this.knob.style.transform = 'translate(0, 0)';
  }

  reset() {
    this.edges = { shootDown: false, shootUp: false, pass: false, tackle: false, switch: false };
    this.touch.shootDown = false;
    this.touch.shootUp = false;
    this.touch.pass = false;
    this.touch.tackle = false;
    this.touch.switch = false;
    this.keys.clear();
    this.touch.shootHeld = false;
    this.touch.sprint = false;
    this.resetStick();
    document.querySelectorAll('.touch-btn').forEach((b) => b.classList.remove('held'));
  }

  read() {
    const k = this.keys;
    let mx = 0;
    let mz = 0;
    if (k.has('KeyA') || k.has('ArrowLeft')) mx -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) mx += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) mz -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) mz += 1;
    mx += this.touch.mx;
    mz += this.touch.mz;
    const m = Math.hypot(mx, mz);
    if (m > 1) {
      mx /= m;
      mz /= m;
    }
    const input = {
      mx,
      mz,
      sprint: k.has('ShiftLeft') || k.has('ShiftRight') || this.touch.sprint,
      shootHeld: this.touch.shootHeld,
      shootDown: this.edges.shootDown,
      shootUp: this.edges.shootUp,
      pass: this.edges.pass,
      tackle: this.edges.tackle,
      switch: this.edges.switch,
    };
    this.edges.shootDown = false;
    this.edges.shootUp = false;
    this.edges.pass = false;
    this.edges.tackle = false;
    this.edges.switch = false;
    return input;
  }

  isDown() {
    return {
      mx: (this.keys.has('KeyD') || this.keys.has('ArrowRight') ? 1 : 0) - (this.keys.has('KeyA') || this.keys.has('ArrowLeft') ? 1 : 0) + this.touch.mx,
      mz: (this.keys.has('KeyS') || this.keys.has('ArrowDown') ? 1 : 0) - (this.keys.has('KeyW') || this.keys.has('ArrowUp') ? 1 : 0) + this.touch.mz,
      shootHeld: this.touch.shootHeld,
      sprint: this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touch.sprint,
    };
  }
}
