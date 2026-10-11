// Peer-to-peer networking with PeerJS (WebRTC; the free PeerJS cloud server only helps the browsers find each other).
// The host's browser owns the game; players connect to the host with a 6-letter room code.
const PREFIX = 'holdemnight-v1-';
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const makeCode = () => Array.from({ length: 6 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
const hasPeer = () => typeof window !== 'undefined' && typeof window.Peer === 'function';

export class HostNet {
  // h: { onOpen(), onJoin(cid), onMsg(cid, msg), onLeave(cid), onError(kind) }
  constructor(code, h) { this.code = code; this.h = h; this.conns = new Map(); this.seen = new Map(); }
  start() {
    if (!hasPeer()) { this.h.onError('nopeer'); return; }
    this.peer = new window.Peer(PREFIX + this.code, { debug: 0 });
    this.peer.on('open', () => this.h.onOpen());
    this.peer.on('error', (e) => this.h.onError(e.type === 'unavailable-id' ? 'taken' : e.type || 'error'));
    this.peer.on('disconnected', () => { try { this.peer.reconnect(); } catch (e) { /* closed */ } });
    this.peer.on('connection', (conn) => {
      const cid = conn.peer + ':' + Math.random().toString(36).slice(2, 6);
      conn.on('open', () => { this.conns.set(cid, conn); this.seen.set(cid, Date.now()); this.h.onJoin(cid); });
      conn.on('data', (d) => { this.seen.set(cid, Date.now()); if (d && d.t !== 'ping') this.h.onMsg(cid, d); });
      const gone = () => { if (this.conns.delete(cid)) this.h.onLeave(cid); };
      conn.on('close', gone); conn.on('error', gone);
    });
    // drop players we have not heard from (WebRTC close events can be slow)
    this.beat = setInterval(() => { const now = Date.now(); for (const [cid, t] of this.seen) if (now - t > 16000 && this.conns.has(cid)) { try { this.conns.get(cid).close(); } catch (e) { /* ignore */ } this.conns.delete(cid); this.seen.delete(cid); this.h.onLeave(cid); } }, 4000);
  }
  send(cid, msg) { const c = this.conns.get(cid); if (c && c.open) try { c.send(msg); } catch (e) { /* ignore */ } }
  close() { clearInterval(this.beat); for (const c of this.conns.values()) try { c.close(); } catch (e) { /* ignore */ } try { this.peer && this.peer.destroy(); } catch (e) { /* ignore */ } }
}

export class ClientNet {
  // h: { onOpen(), onMsg(msg), onClose(), onError(kind) }
  constructor(code, h) { this.code = code; this.h = h; }
  start() {
    if (!hasPeer()) { this.h.onError('nopeer'); return; }
    this.tries = 0;
    this.peer = new window.Peer(undefined, { debug: 0 });
    // the host may still be registering (or refreshing): try again a few times before giving up
    this.peer.on('error', (e) => {
      if (e.type === 'peer-unavailable' && this.tries < 5) { this.tries++; setTimeout(() => this.dial(), 2500); return; }
      this.h.onError(e.type === 'peer-unavailable' ? 'noroom' : e.type || 'error');
    });
    this.peer.on('open', () => this.dial());
  }
  dial() {
    this.conn = this.peer.connect(PREFIX + this.code, { reliable: true });
    this.conn.on('open', () => { this.h.onOpen(); clearInterval(this.ping); this.ping = setInterval(() => this.send({ t: 'ping' }), 5000); });
    this.conn.on('data', (d) => this.h.onMsg(d));
    this.conn.on('close', () => { clearInterval(this.ping); this.h.onClose(); });
  }
  send(msg) { if (this.conn && this.conn.open) try { this.conn.send(msg); } catch (e) { /* ignore */ } }
  close() { clearInterval(this.ping); try { this.peer && this.peer.destroy(); } catch (e) { /* ignore */ } }
}
