import { Table, bestHand, CATS, rankOf } from './poker.js?v=1';
import { decide } from './bot.js?v=1';
import { HostNet, ClientNet, makeCode } from './net.js?v=1';
import { t, getLang, setLang } from './i18n.js?v=1';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const AVATARS = ['🐶', '🐱', '🦊', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🦄', '🐲'];
const BOT_NAMES = ['Ace Bot', 'Lucky Bot', 'River Bot', 'Bluff Bot', 'Chip Bot', 'Flop Bot', 'Kicker Bot'];
const store = { get(k, d) { try { const v = localStorage.getItem('hn.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } }, set(k, v) { try { localStorage.setItem('hn.' + k, JSON.stringify(v)); } catch (e) { /* ignore */ } } };

const S = { mode: null, host: null, net: null, view: null, extra: {}, me: { name: store.get('name', ''), avatar: store.get('avatar', AVATARS[Math.floor(Math.random() * 12)]) }, chat: [], prev: null, raise: false, sound: store.get('sound', true) };

// ------------------------------------------------------------------ sound
let ac = null;
function snd(kind) {
  if (!S.sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)(); if (ac.state === 'suspended') ac.resume();
    const tn = (f, d, type = 'square', v = 0.08, at = 0, slide) => { const o = ac.createOscillator(), g = ac.createGain(), t0 = ac.currentTime + at; o.type = type; o.frequency.setValueAtTime(f, t0); if (slide) o.frequency.exponentialRampToValueAtTime(f * slide, t0 + d); g.gain.setValueAtTime(v, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + d); };
    if (kind === 'deal') { tn(1800, 0.03, 'triangle', 0.05); tn(1400, 0.03, 'triangle', 0.05, 0.05); }
    if (kind === 'chip') { tn(2600, 0.05, 'square', 0.04); tn(3200, 0.05, 'square', 0.03, 0.04); }
    if (kind === 'check') { tn(160, 0.06, 'sine', 0.25); tn(160, 0.06, 'sine', 0.2, 0.1); }
    if (kind === 'fold') tn(500, 0.15, 'sawtooth', 0.04, 0, 0.4);
    if (kind === 'turn') { tn(880, 0.12, 'sine', 0.12); tn(1320, 0.18, 'sine', 0.1, 0.1); }
    if (kind === 'win') [523, 659, 784, 1047].forEach((f, i) => tn(f, 0.25, 'triangle', 0.1, i * 0.09));
  } catch (e) { /* no audio */ }
}

// ------------------------------------------------------------------ the host: owns the table, talks to everyone
class Host {
  constructor(settings, net) {
    this.set = settings;
    this.table = new Table({ sb: settings.blinds[0], bb: settings.blinds[1], startChips: settings.chips });
    this.net = net; this.clients = new Map(); this.started = false;
    this.mySeat = 0; this.table.sit(0, { name: S.me.name, avatar: S.me.avatar, id: 'host' });
    this.key = ''; this.deadline = 0; this.botAt = 0; this.nextHandAt = 0; this.runoutAt = 0;
    this.loop = setInterval(() => this.tick(), 150);
  }
  get T() { return this.table; }
  tick() {
    const T = this.T, now = Date.now();
    if (!this.started) return;
    if (!T.isPlaying()) {
      if (now > this.nextHandAt) {
        for (const s of T.seats) if (s && s.connected === false) s.sitOut = true;
        if (T.startHand()) { this.changed(); } else this.nextHandAt = now + 1500;
      }
      return;
    }
    if (T.toAct < 0) { if (T.runout && now > this.runoutAt) { T.runOut(); this.runoutAt = now + 1300; this.changed(); } return; }
    const key = `${T.handNo}/${T.street}/${T.toAct}/${T.log.length}`;
    if (key !== this.key) { this.key = key; this.deadline = this.set.timer ? now + this.set.timer * 1000 : 0; this.botAt = now + (params.has('fast') ? 60 : 650 + Math.random() * 900); this.changed(true); }
    const s = T.seats[T.toAct];
    if (s.bot && now > this.botAt) { const a = decide(T.view(T.toAct), s.style ?? 0.5); this.act(T.toAct, a || { type: 'fold' }); return; }
    if (!s.bot && (s.connected === false || s.sitOut) && now > this.botAt + 1500) { this.act(T.toAct, { type: 'fold' }); return; }
    if (this.deadline && now > this.deadline) this.act(T.toAct, { type: 'fold' });     // time is up: check if possible, else fold
  }
  act(seat, a) {
    const T = this.T;
    if (seat !== T.toAct) return;
    if (!T.act(seat, a)) T.act(seat, { type: 'fold', force: true });
    if (T.runout) this.runoutAt = Date.now() + 900;
    this.changed();
  }
  changed(quiet) {
    const T = this.T;
    if (T.street === 'done' && !this.doneShown) { this.doneShown = true; this.nextHandAt = Date.now() + 5500; }
    if (T.street !== 'done') this.doneShown = false;
    this.broadcast();
    void quiet;
  }
  extra() {
    const T = this.T;
    return { code: S.code, started: this.started, timer: this.deadline && T.toAct >= 0 ? { seat: T.toAct, left: Math.max(0, this.deadline - Date.now()), total: this.set.timer * 1000 } : null, host: true, practice: S.mode === 'practice', startChips: T.startChips };
  }
  broadcast() {
    const ex = this.extra();
    for (const [cid, c] of this.clients) if (c.seat >= 0) this.net.send(cid, { t: 'state', view: this.T.view(c.seat), extra: { ...ex, host: false } });
    show(this.T.view(this.mySeat), ex);
  }
  sys(text) { this.say({ name: '', text }); }
  say(m) { for (const cid of this.clients.keys()) this.net.send(cid, { t: 'chat', ...m }); addChat(m); }
  // ---------------------------------------------------------------- network events
  onJoin(cid) { this.clients.set(cid, { seat: -1 }); }
  onLeave(cid) {
    const c = this.clients.get(cid); this.clients.delete(cid);
    if (!c || c.seat < 0) return;
    const s = this.T.seats[c.seat];
    if (s) { s.connected = false; this.sysKey('left', s.name); }
    this.changed();
  }
  sysKey(k, name) { for (const cid of this.clients.keys()) this.net.send(cid, { t: 'chat', name: '', key: k, arg: name }); addChat({ name: '', key: k, arg: name }); }
  onMsg(cid, m) {
    const c = this.clients.get(cid); if (!c) return;
    const T = this.T;
    if (m.t === 'hello') {
      const name = String(m.name || 'Player').slice(0, 14), avatar = AVATARS.includes(m.avatar) ? m.avatar : '🐶';
      let seat = T.seats.findIndex((s) => s && m.token && s.id === m.token);
      if (seat >= 0) { Object.assign(T.seats[seat], { connected: true, name, avatar }); if (T.seats[seat].sitOut && T.seats[seat].chips > 0) T.seats[seat].sitOut = false; }
      else {
        seat = T.freeSeat();
        if (seat < 0) { this.net.send(cid, { t: 'error', key: 'full' }); return; }
        const token = Math.random().toString(36).slice(2, 10);
        m.token = token;
        T.sit(seat, { name, avatar, id: token, connected: true });
      }
      c.seat = seat;
      this.net.send(cid, { t: 'welcome', seat, token: m.token });
      this.sysKey('joined', name);
      this.changed();
    }
    if (m.t === 'act' && c.seat === T.toAct) this.act(c.seat, m.action);
    if (m.t === 'chat' && c.seat >= 0) this.say({ name: T.seats[c.seat].name, text: String(m.text).slice(0, 140) });
    if (m.t === 'emoji' && c.seat >= 0) this.emoji(c.seat, m.e);
    if (m.t === 'rebuy' && c.seat >= 0) this.rebuy(c.seat);
    if (m.t === 'sitout' && c.seat >= 0 && T.seats[c.seat]) { T.seats[c.seat].sitOut = !!m.out; this.changed(); }
  }
  emoji(seat, e) { for (const cid of this.clients.keys()) this.net.send(cid, { t: 'emoji', seat, e }); showEmoji(seat, e); }
  rebuy(seat) { const s = this.T.seats[seat]; if (s && s.chips === 0 && !(this.T.isPlaying() && s.inHand)) { s.chips = this.T.startChips; s.sitOut = false; this.changed(); } }
  addBot() { const i = this.T.freeSeat(); if (i < 0) { toast(t('full')); return; } const used = new Set(this.T.seats.filter(Boolean).map((s) => s.name)); const name = BOT_NAMES.find((n) => !used.has(n)) || 'Bot ' + i; this.T.sit(i, { name, avatar: '🤖', bot: true, style: 0.3 + Math.random() * 0.5, id: 'bot' + i }); this.changed(); }
  removeBot() { const i = this.T.seats.map((s, j) => (s && s.bot ? j : -1)).filter((j) => j >= 0).pop(); if (i == null) return; this.T.leave(i); this.changed(); }
  start() { if (!this.T.canStart()) { toast(t('notEnough')); return; } this.started = true; this.nextHandAt = 0; this.tick(); }
  close() { clearInterval(this.loop); this.net && this.net.close(); }
}

// ------------------------------------------------------------------ actions from this browser
function sendAct(action) {
  S.raise = false;
  if (S.host) S.host.act(S.host.mySeat, action);
  else if (S.net) S.net.send({ t: 'act', action });
}
function sendChat(text) { if (!text.trim()) return; if (S.host) S.host.say({ name: S.me.name, text }); else if (S.net) S.net.send({ t: 'chat', text }); }
function sendEmoji(e) { if (S.host) S.host.emoji(S.host.mySeat, e); else if (S.net) S.net.send({ t: 'emoji', e }); }

// ------------------------------------------------------------------ lobby
function lobby() {
  S.mode = null; document.body.className = 'lobby';
  $('lobby').hidden = false; $('table').hidden = true;
  const code = (params.get('room') || '').toUpperCase();
  $('lobby').innerHTML = `<div class="lcard">
    <h1>🂡 ${t('title')}</h1><h2>${t('sub')}</h2>
    <label>${t('yourName')}<input id="lName" maxlength="14" value="${esc(S.me.name)}" placeholder="Josh"></label>
    <div class="avs">${AVATARS.map((a) => `<button class="${a === S.me.avatar ? 'sel' : ''}" data-a="${a}">${a}</button>`).join('')}</div>
    <div class="joinRow"><input id="lCode" maxlength="6" placeholder="${t('roomCode')}" value="${esc(code)}"><button id="lJoin" class="go">${t('joinGo')}</button></div>
    <button id="lCreate" class="big">${t('create')}</button>
    <details ${code ? '' : 'open'}><summary>${t('settings')}</summary>
      <label>${t('chips')}<select id="sChips"><option>1000</option><option>2000</option><option>5000</option></select></label>
      <label>${t('blinds')}<select id="sBlinds"><option value="10/20">10 / 20</option><option value="25/50">25 / 50</option><option value="50/100">50 / 100</option></select></label>
      <label>${t('timer')}<select id="sTimer"><option value="30">${t('sec', 30)}</option><option value="20">${t('sec', 20)}</option><option value="45">${t('sec', 45)}</option><option value="0">${t('off')}</option></select></label>
    </details>
    <button id="lPractice" class="ghost">${t('practice')}</button>
    <p class="small">${t('playMoney')}</p>
    <div class="lfoot"><button id="lLang">${t('lang')}</button><button id="lHelp">${t('help')}</button></div></div>`;
  $('lobby').querySelectorAll('.avs button').forEach((b) => b.onclick = () => { S.me.avatar = b.dataset.a; store.set('avatar', S.me.avatar); lobby(); });
  const name = () => { const n = $('lName').value.trim() || (getLang() === 'zh' ? '玩家' : 'Player'); S.me.name = n.slice(0, 14); store.set('name', S.me.name); };
  const settings = () => ({ chips: +$('sChips').value, blinds: $('sBlinds').value.split('/').map(Number), timer: +$('sTimer').value });
  $('lCreate').onclick = () => { name(); createRoom(settings()); };
  $('lPractice').onclick = () => { name(); practice(settings()); };
  $('lJoin').onclick = () => { name(); const c = $('lCode').value.trim().toUpperCase(); if (c.length === 6) joinRoom(c); };
  $('lLang').onclick = () => { setLang(getLang() === 'zh' ? 'en' : 'zh'); lobby(); };
  $('lHelp').onclick = help;
}
function help() { modal(`<h2>${t('help')}</h2>${t('helpBody').map((p) => `<p>${p}</p>`).join('')}`); }

function enterTable() { $('lobby').hidden = true; $('table').hidden = false; document.body.className = 'playing'; buildTableDom(); }
function createRoom(settings, attempt = 0) {
  S.mode = 'host'; S.code = params.get('code') && attempt === 0 ? params.get('code') : makeCode();
  const net = new HostNet(S.code, {
    onOpen: () => { S.host.changed(); toast(t('hostWait'), 3000); },
    onJoin: (cid) => S.host.onJoin(cid), onLeave: (cid) => S.host.onLeave(cid), onMsg: (cid, m) => S.host.onMsg(cid, m),
    onError: (k) => { if (k === 'taken' && attempt < 3) { S.host.close(); createRoom(settings, attempt + 1); } else if (k === 'nopeer') { toast(t('noPeer'), 5000); } else toast(t('netErr'), 4000); },
  });
  S.host = new Host(settings, net);
  enterTable();
  net.start();
  S.host.changed();
}
function practice(settings) {
  S.mode = 'practice'; S.code = '';
  S.host = new Host(settings, { send() {}, close() {} });
  enterTable();
  for (let i = 0; i < 5; i++) S.host.addBot();
  S.host.start();
}
function joinRoom(code) {
  S.mode = 'client'; S.code = code;
  enterTable();
  toast(t('connecting'), 2500);
  S.net = new ClientNet(code, {
    onOpen: () => S.net.send({ t: 'hello', name: S.me.name, avatar: S.me.avatar, token: store.get('token.' + code, null) }),
    onMsg: (m) => {
      if (m.t === 'welcome') { store.set('token.' + code, m.token); S.seat = m.seat; }
      if (m.t === 'state') show(m.view, m.extra);
      if (m.t === 'chat') addChat(m);
      if (m.t === 'emoji') showEmoji(m.seat, m.e);
      if (m.t === 'error') { toast(t(m.key), 4000); setTimeout(leave, 1500); }
    },
    onClose: () => { toast(t('hostGone'), 5000); setTimeout(leave, 2500); },
    onError: (k) => { toast(k === 'noroom' ? t('noRoom') : k === 'nopeer' ? t('noPeer') : t('netErr'), 5000); setTimeout(leave, 3000); },
  });
  S.net.start();
}
function leave() {
  if (S.host) S.host.close(); if (S.net) S.net.close();
  S.host = null; S.net = null; S.view = null; S.prev = null; S.chat = [];
  if (params.has('room')) history.replaceState(null, '', location.pathname);
  params.delete('room');
  lobby();
}

// ------------------------------------------------------------------ table rendering
function buildTableDom() {
  $('table').innerHTML = `<header class="tbar"><button id="bLeave">✕</button><span id="roomChip"></span><span class="grow"></span>
      <button id="bSound">${S.sound ? '🔊' : '🔇'}</button><button id="bChat">💬<i id="chatDot"></i></button><button id="bTLang">${t('lang')}</button><button id="bTHelp">?</button></header>
    <div id="hostBar"></div>
    <div class="felt"><div class="rail"></div><div id="board"></div><div id="potTxt"></div><div id="log"></div><div id="seats"></div></div>
    <div id="mine"></div><div id="actions"></div>
    <div id="chatBox" hidden><div id="chatList"></div><div class="emojis">${['👍', '😂', '😮', '😢', '🔥', '🎉', '🤔', '😎'].map((e) => `<button data-e="${e}">${e}</button>`).join('')}</div>
      <form id="chatForm"><input id="chatIn" maxlength="140" placeholder="${t('say')}"><button>${t('send')}</button></form></div>`;
  $('bLeave').onclick = () => { if (confirm(S.mode === 'host' ? t('hostLeftQ') : t('leaveQ'))) leave(); };
  $('bSound').onclick = () => { S.sound = !S.sound; store.set('sound', S.sound); $('bSound').textContent = S.sound ? '🔊' : '🔇'; };
  $('bChat').onclick = () => { $('chatBox').hidden = !$('chatBox').hidden; $('chatDot').className = ''; };
  $('bTLang').onclick = () => { setLang(getLang() === 'zh' ? 'en' : 'zh'); buildTableDom(); if (S.view) show(S.view, S.extra, true); renderChat(); };
  $('bTHelp').onclick = help;
  $('chatForm').onsubmit = (e) => { e.preventDefault(); sendChat($('chatIn').value); $('chatIn').value = ''; };
  $('chatBox').querySelectorAll('[data-e]').forEach((b) => b.onclick = () => sendEmoji(b.dataset.e));
}
const SUIT = { s: '♠', h: '♥', d: '♦', c: '♣' };
function card(c, o = {}) {
  if (!c || c === '??') return `<div class="card back ${o.cls || ''}"></div>`;
  const r = c[0] === 'T' ? '10' : c[0], s = c[1];
  return `<div class="card s-${s} ${o.cls || ''}"><b>${r}</b><i>${SUIT[s]}</i><em>${SUIT[s]}</em></div>`;
}
const handName = (h) => { const cat = CATS[h.cat]; if (cat === 'sflush' && h.cards.some((c) => c[0] === 'A') && h.cards.some((c) => c[0] === 'K')) return t('H').royal; return t('H')[cat]; };
function seatPos(rel) {
  const a = Math.PI / 2 + (rel / 8) * Math.PI * 2;
  return { x: 50 + Math.cos(a) * 44, y: 48 + Math.sin(a) * 41 };
}
function show(view, extra, force) {
  const prev = S.view;
  S.view = view; S.extra = extra || {};
  if ($('table').hidden) return;
  sounds(prev, view);
  const me = view.you >= 0 ? view.you : 0;
  // room chip + host controls
  const players = view.seats.filter(Boolean).length;
  $('roomChip').innerHTML = S.mode === 'practice' ? `🤖 ${t('practice').replace('🤖 ', '')}` : `${t('roomCode')}: <b>${esc(extra.code || S.code)}</b> · ${t('players', players)}`;
  $('roomChip').onclick = () => copyLink();
  if (S.mode === 'host') {
    const showBar = !extra.started || view.street === 'done' || view.street === 'idle';
    $('hostBar').innerHTML = showBar ? `<div class="hb">${S.mode === 'host' && S.code ? `<span>${t('share')}</span><button id="hCopy">🔗 ${t('copy')}</button>` : ''}
      <button id="hAdd">${t('addBot')}</button><button id="hRem">${t('removeBot')}</button>${extra.started ? '' : `<button id="hStart" class="go">${t('start')}</button>`}</div>` : '';
    if ($('hCopy')) $('hCopy').onclick = copyLink;
    if ($('hAdd')) $('hAdd').onclick = () => S.host.addBot();
    if ($('hRem')) $('hRem').onclick = () => S.host.removeBot();
    if ($('hStart')) $('hStart').onclick = () => S.host.start();
  } else $('hostBar').innerHTML = '';
  // seats
  const winners = new Map();
  if (view.street === 'done' && view.result) for (const p of view.result.pots) for (const w of p.winners) winners.set(w, (winners.get(w) || 0) + p.share);
  $('seats').innerHTML = view.seats.map((s, j) => {
    if (!s) return '';
    const rel = (j - me + 8) % 8, p = seatPos(rel), bp = { x: p.x + (50 - p.x) * 0.42, y: p.y + (48 - p.y) * 0.42 };
    const isTurn = view.toAct === j, won = winners.get(j);
    const hand = view.result && view.result.hands && view.result.hands[j];
    const badge = j === view.button ? '<span class="dealer">D</span>' : '';
    const last = s.last ? `<span class="act a-${s.last.type}">${t('A')[s.last.type] || ''}${s.last.amount && s.last.type !== 'fold' && s.last.type !== 'check' ? ' ' + s.last.amount : ''}</span>` : '';
    const showCards = rel !== 0 || view.you < 0;
    return `<div class="seat ${isTurn ? 'turn' : ''} ${s.folded && view.street !== 'idle' && s.inHand ? 'folded' : ''} ${won ? 'won' : ''} ${s.connected ? '' : 'off'} ${!s.inHand ? 'out' : ''}" data-seat="${j}" style="left:${p.x}%;top:${p.y}%">
        ${showCards && s.cards.length ? `<div class="hole ${s.folded ? 'mucked' : ''}">${s.cards.map((c) => card(c, { cls: 'sm' })).join('')}</div>` : ''}
        <div class="av">${esc(s.avatar)}${badge}${isTurn && extra.timer && extra.timer.seat === j ? `<svg class="ring" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" style="animation-duration:${extra.timer.left}ms"></circle></svg>` : ''}</div>
        <div class="nm">${esc(s.name)}${s.bot ? ' <small>🤖</small>' : ''}${s.connected ? '' : ` <small>(${t('dc')})</small>`}</div>
        <div class="ch">${s.chips}${won ? ` <b class="plus">+${won}</b>` : ''}</div>${last}
        ${hand && view.street === 'done' ? `<div class="hn">${handName(hand)}</div>` : ''}
      </div>${s.bet ? `<div class="bet" style="left:${bp.x}%;top:${bp.y}%">${chipIcon()}${s.bet}</div>` : ''}`;
  }).join('');
  // board + pot
  const best = view.result && view.street === 'done' && view.result.hands ? Object.entries(view.result.hands).filter(([j]) => winners.has(+j)).flatMap(([, h]) => h.cards) : [];
  $('board').innerHTML = [0, 1, 2, 3, 4].map((i) => (view.board[i] ? card(view.board[i], { cls: best.includes(view.board[i]) ? 'hl' : '' }) : '<div class="card slot"></div>')).join('');
  const pots = view.pots && view.pots.length > 1 ? view.pots.map((a, i) => `${i ? t('side') : t('pots')} ${a}`).join(' · ') : `${t('pot')} ${view.pot}`;
  $('potTxt').innerHTML = view.pot ? `${chipIcon()} ${pots}` : view.street === 'idle' || !extra.started ? `<span class="wait">${S.mode === 'host' ? t('hostWait') : t('waiting')}</span>` : '';
  $('log').innerHTML = view.log.slice(-5).map((e) => `<div>${esc(fmtLog(e, view))}</div>`).join('');
  // my cards
  const mine = view.you >= 0 && view.seats[view.you];
  if (mine) {
    const all = mine.cards.concat(view.board), hb = mine.cards.length === 2 && all.length >= 5 ? bestHand(all) : null;
    const desc = hb ? handName(hb) : mine.cards.length === 2 && mine.cards[0][0] === mine.cards[1][0] ? t('H').pair : '';
    $('mine').innerHTML = `<div class="myCards ${mine.folded && mine.inHand ? 'mucked' : ''}">${mine.cards.map((c) => card(c, { cls: 'big ' + (best.includes(c) ? 'hl' : '') })).join('')}</div>
      <div class="myInfo"><b>${esc(mine.name)}</b> · ${mine.chips}${desc ? `<span class="desc">${desc}</span>` : ''}
      ${mine.chips === 0 && (!mine.inHand || view.street === 'done' || view.street === 'idle') ? `<button id="bRebuy">${t('rebuy')}</button>` : ''}
      ${S.mode === 'client' ? `<button id="bSitOut">${mine.sitOut ? t('sitIn') : t('sitOut')}</button>` : ''}</div>`;
    if ($('bRebuy')) $('bRebuy').onclick = () => { if (S.host) S.host.rebuy(S.host.mySeat); else S.net.send({ t: 'rebuy' }); };
    if ($('bSitOut')) $('bSitOut').onclick = () => S.net.send({ t: 'sitout', out: !mine.sitOut });
  } else $('mine').innerHTML = '';
  renderActions(view);
  if (S.timerIv) clearInterval(S.timerIv);
}
function chipIcon() { return '<i class="chip"></i>'; }
function fmtLog(e, view) {
  const nm = (j) => (view.seats[j] ? view.seats[j].name : '?'), A = t('A');
  if (e.k === 'hand') return t('log').hand(e.n);
  if (['flop', 'turn', 'river'].includes(e.k)) return `${t('log')[e.k]}: ${e.board.map((c) => (c[0] === 'T' ? '10' : c[0]) + SUIT[c[1]]).join(' ')}`;
  if (e.k === 'win') return t('wins', nm(e.seat), e.amount) + (e.cat != null ? t('with', t('H')[CATS[e.cat]]) : '');
  return `${nm(e.seat)} ${A[e.k] || e.k}${e.amount != null && e.k !== 'check' && e.k !== 'fold' ? ' ' + e.amount : ''}`;
}
function renderActions(view) {
  const L = view.legal;
  if (!L) { $('actions').innerHTML = ''; return; }
  const p = view.pot, snap = (v) => Math.max(L.minTo, Math.min(L.maxTo, Math.round(v / view.sb) * view.sb));
  const callTxt = L.toCall === 0 ? t('check') : L.toCall >= view.seats[view.you].chips ? `${t('allin')} ${L.toCall}` : t('call', L.toCall);
  const verb = view.currentBet === 0 ? t('betTo', '') : t('raiseTo', '');
  if (S.raise && L.canRaise) {
    const v = S.raiseTo || L.minTo;
    $('actions').innerHTML = `<div class="raisePanel"><div class="presets">
        <button data-v="${snap(L.currentBet + p / 2)}">${t('halfPot')}</button><button data-v="${snap(L.currentBet + (p * 2) / 3)}">${t('twoThirds')}</button>
        <button data-v="${snap(L.currentBet + p)}">${t('pot')}</button><button data-v="${L.maxTo}">${t('allin')}</button></div>
      <div class="sl"><input type="range" id="rng" min="${L.minTo}" max="${L.maxTo}" step="${view.sb}" value="${v}"><b id="rv">${v}</b></div>
      <div class="row"><button id="rCancel">${t('cancel')}</button><button id="rOk" class="go">${verb.trim()} <span id="rv2">${v}</span></button></div></div>`;
    const setV = (x) => { S.raiseTo = Math.max(L.minTo, Math.min(L.maxTo, +x)); $('rng').value = S.raiseTo; $('rv').textContent = S.raiseTo; $('rv2').textContent = S.raiseTo === L.maxTo ? t('allin') : S.raiseTo; };
    $('rng').oninput = (e) => setV(e.target.value);
    $('actions').querySelectorAll('.presets button').forEach((b) => b.onclick = () => setV(b.dataset.v));
    $('rCancel').onclick = () => { S.raise = false; renderActions(view); };
    $('rOk').onclick = () => sendAct({ type: 'raise', to: S.raiseTo || L.minTo });
    return;
  }
  $('actions').innerHTML = `<div class="turnMsg">${t('yourTurn')}</div><div class="row">
      ${L.canCheck ? '' : `<button id="aFold" class="fold">${t('fold')}</button>`}
      <button id="aCall" class="call">${callTxt}</button>
      ${L.canRaise ? `<button id="aRaise" class="raise">${view.currentBet === 0 ? t('bet') : t('raise')}</button>` : ''}</div>`;
  if ($('aFold')) $('aFold').onclick = () => sendAct({ type: 'fold', force: true });
  $('aCall').onclick = () => sendAct({ type: L.canCheck ? 'check' : 'call' });
  if ($('aRaise')) $('aRaise').onclick = () => { S.raise = true; S.raiseTo = L.minTo; renderActions(view); };
}
function sounds(prev, view) {
  if (!prev) { if (view.handNo) snd('deal'); return; }
  if (view.handNo !== prev.handNo) snd('deal');
  else if (view.board.length > prev.board.length) snd('deal');
  else if (view.street === 'done' && prev.street !== 'done') { if (view.result && view.result.pots.some((p) => p.winners.includes(view.you))) snd('win'); else snd('chip'); }
  else {
    const changed = view.seats.findIndex((s, j) => s && prev.seats[j] && JSON.stringify(s.last) !== JSON.stringify(prev.seats[j].last) && s.last);
    if (changed >= 0) { const tp = view.seats[changed].last.type; snd(tp === 'check' ? 'check' : tp === 'fold' ? 'fold' : 'chip'); }
  }
  if (view.legal && !(prev.legal)) { snd('turn'); if (navigator.vibrate) try { navigator.vibrate(60); } catch (e) { /* ignore */ } }
}
function copyLink() {
  if (!S.code) return;
  const url = `${location.origin}${location.pathname}?room=${S.code}`;
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => toast(t('copied'))).catch(() => prompt(t('share'), url));
}

// ------------------------------------------------------------------ chat, emoji, toast, modal
function addChat(m) { S.chat.push(m); if (S.chat.length > 80) S.chat.shift(); renderChat(); if ($('chatBox') && $('chatBox').hidden && m.name) $('chatDot').className = 'on'; }
function renderChat() { if (!$('chatList')) return; $('chatList').innerHTML = S.chat.map((m) => (m.name ? `<div><b>${esc(m.name)}:</b> ${esc(m.text)}</div>` : `<div class="sys">${esc(m.key ? t(m.key, m.arg) : m.text)}</div>`)).join(''); $('chatList').scrollTop = 1e6; }
function showEmoji(seat, e) {
  const el = document.querySelector(`.seat[data-seat="${seat}"]`); if (!el) return;
  const d = document.createElement('div'); d.className = 'emo'; d.textContent = e; el.appendChild(d); setTimeout(() => d.remove(), 2200);
}
function toast(m, ms = 1800) { const el = $('toast'); el.textContent = m; el.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), ms); }
function modal(html) { $('modal').innerHTML = `<div class="sheet">${html}<button class="ghost" id="mClose">OK</button></div>`; $('modal').hidden = false; $('mClose').onclick = () => { $('modal').hidden = true; }; }

// ------------------------------------------------------------------ boot
setLang(getLang());
lobby();
if (params.get('room') && params.has('autojoin')) { S.me.name = params.get('name') || S.me.name || 'Guest'; joinRoom(params.get('room').toUpperCase()); }
if (params.has('autohost')) { S.me.name = params.get('name') || 'Host'; createRoom({ chips: 1000, blinds: [10, 20], timer: 30 }); }
if (params.has('practice')) { S.me.name = params.get('name') || 'Me'; practice({ chips: 1000, blinds: [10, 20], timer: 0 }); }
window.HN = { S, Host, show, sendAct, leave, joinRoom, createRoom, practice };
