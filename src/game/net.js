import { Peer } from 'peerjs';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function makeRoomCode() {
  const bytes = new Uint8Array(5);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

export class OnlineNet {
  constructor() {
    this.peer = null;
    this.conn = null;
    this.isHost = false;
    this.code = '';
    this.connected = false;
    this.destroyed = false;
    this.handlers = { status: [], data: [], connected: [], closed: [], error: [] };
  }

  on(event, fn) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(fn);
    return this;
  }

  fire(event, payload) {
    for (const fn of this.handlers[event] || []) fn(payload);
  }

  makePeer(id = undefined) {
    if (this.peer) this.peer.destroy();
    this.peer = new Peer(id, {
      debug: 1,
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' },
        ],
      },
    });
    this.peer.on('error', (error) => {
      if (this.destroyed) return;
      this.fire('error', error);
    });
    this.peer.on('disconnected', () => {
      if (!this.destroyed && this.peer && !this.peer.destroyed) {
        try { this.peer.reconnect(); } catch {}
      }
    });
    return this.peer;
  }

  host() {
    this.isHost = true;
    this.destroyed = false;
    this.code = makeRoomCode();
    this.fire('status', { state: 'creating' });
    this.makePeer(`khamasi-${this.code}`);
    this.peer.on('open', () => {
      this.fire('status', { state: 'waiting', code: this.code });
    });
    this.peer.on('connection', (conn) => {
      if (this.conn && this.conn.open) {
        conn.close();
        return;
      }
      this.conn = conn;
      this.bindConnection(conn);
    });
    return this.code;
  }

  join(code) {
    this.isHost = false;
    this.destroyed = false;
    this.code = code.toUpperCase().trim();
    this.fire('status', { state: 'connecting' });
    this.makePeer();
    this.peer.on('open', () => {
      const conn = this.peer.connect(`khamasi-${this.code}`, { reliable: true });
      this.conn = conn;
      this.bindConnection(conn);
      setTimeout(() => {
        if (!this.connected && !this.destroyed) {
          this.fire('status', { state: 'timeout' });
        }
      }, 12000);
    });
    return this.code;
  }

  bindConnection(conn) {
    conn.on('open', () => {
      this.connected = true;
      this.fire('status', { state: 'connected', code: this.code });
      this.fire('connected', { host: this.isHost });
    });
    conn.on('data', (data) => this.fire('data', data));
    conn.on('close', () => {
      this.connected = false;
      if (!this.destroyed) {
        this.fire('closed', {});
        this.fire('status', { state: 'closed' });
      }
    });
    conn.on('error', (err) => this.fire('error', err));
  }

  send(data) {
    if (this.conn && this.conn.open) {
      try {
        this.conn.send(data);
        return true;
      } catch {
        return false;
      }
    }
    return false;
  }

  close() {
    this.destroyed = true;
    this.connected = false;
    try { this.conn?.close(); } catch {}
    try { this.peer?.destroy(); } catch {}
    this.conn = null;
    this.peer = null;
  }
}
