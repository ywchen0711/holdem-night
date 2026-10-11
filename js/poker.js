// Texas Hold'em: cards, hand evaluation and the table state machine (blinds, betting rounds, side pots, showdown).
// Pure logic: the host runs it; tools/test.mjs runs it in Node.

export const RANKS = '23456789TJQKA';
export const SUITS = 'shdc';
export const rankOf = (c) => RANKS.indexOf(c[0]) + 2;
export const suitOf = (c) => c[1];
export function newDeck(rnd = Math.random) {
  const d = [];
  for (const r of RANKS) for (const s of SUITS) d.push(r + s);
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

// ------------------------------------------------------------------ hand evaluation
export const CATS = ['high', 'pair', 'twopair', 'trips', 'straight', 'flush', 'full', 'quads', 'sflush'];
// value of exactly 5 cards: category * 15^5 + tie-break ranks
export function eval5(cards) {
  const rs = cards.map(rankOf).sort((a, b) => b - a);
  const flush = cards.every((c) => c[1] === cards[0][1]);
  const uniq = [...new Set(rs)];
  let straightTop = 0;
  if (uniq.length === 5) {
    if (rs[0] - rs[4] === 4) straightTop = rs[0];
    else if (rs[0] === 14 && rs[1] === 5 && rs[4] === 2) straightTop = 5;            // the wheel A-2-3-4-5
  }
  const cnt = {}; for (const r of rs) cnt[r] = (cnt[r] || 0) + 1;
  const groups = Object.entries(cnt).map(([r, n]) => [n, +r]).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
  let cat, tb;
  if (straightTop && flush) { cat = 8; tb = [straightTop]; }
  else if (groups[0][0] === 4) { cat = 7; tb = [groups[0][1], groups[1][1]]; }
  else if (groups[0][0] === 3 && groups[1][0] === 2) { cat = 6; tb = [groups[0][1], groups[1][1]]; }
  else if (flush) { cat = 5; tb = rs; }
  else if (straightTop) { cat = 4; tb = [straightTop]; }
  else if (groups[0][0] === 3) { cat = 3; tb = groups.map((g) => g[1]); }
  else if (groups[0][0] === 2 && groups[1][0] === 2) { cat = 2; tb = groups.map((g) => g[1]); }
  else if (groups[0][0] === 2) { cat = 1; tb = groups.map((g) => g[1]); }
  else { cat = 0; tb = rs; }
  let v = cat;
  for (let i = 0; i < 5; i++) v = v * 15 + (tb[i] || 0);
  return v;
}
// best 5 of 5..7 cards -> { value, cat, cards }
export function bestHand(cards) {
  let best = null;
  const n = cards.length;
  const pick = (start, chosen) => {
    if (chosen.length === 5) { const v = eval5(chosen); if (!best || v > best.value) best = { value: v, cards: chosen.slice() }; return; }
    for (let i = start; i <= n - (5 - chosen.length); i++) { chosen.push(cards[i]); pick(i + 1, chosen); chosen.pop(); }
  };
  pick(0, []);
  best.cat = Math.floor(best.value / 15 ** 5);
  return best;
}

// ------------------------------------------------------------------ the table
// seat: { id, name, avatar, chips, cards, bet (this street), total (this hand), folded, allIn, inHand, sitOut, bot, last }
export class Table {
  constructor(o = {}) {
    this.maxSeats = o.maxSeats || 8;
    this.seats = new Array(this.maxSeats).fill(null);
    this.sb = o.sb || 10; this.bb = o.bb || 20; this.startChips = o.startChips || 1000;
    this.button = -1; this.street = 'idle'; this.board = []; this.deck = [];
    this.toAct = -1; this.currentBet = 0; this.minRaise = this.bb; this.need = new Set();
    this.handNo = 0; this.result = null; this.log = []; this.rnd = o.rnd || Math.random;
  }
  // ---------------------------------------------------------------- seating
  sit(i, p) { if (this.seats[i]) return false; this.seats[i] = { chips: this.startChips, cards: [], bet: 0, total: 0, folded: true, allIn: false, inHand: false, sitOut: false, last: null, ...p }; return true; }
  freeSeat() { return this.seats.findIndex((s) => !s); }
  // leaving mid-hand folds; the seat (and its chips in the pot) stays until the hand is over
  leave(i) {
    const s = this.seats[i]; if (!s) return;
    if (this.isPlaying() && s.inHand) {
      s.leaving = true;
      if (!s.folded) { this.fold(i); if (this.toAct === i) this.afterAction(); else if (this.aliveSeats().length <= 1) this.finish(this.aliveSeats()); }
      return;
    }
    this.seats[i] = null;
  }
  aliveSeats() { return this.seats.map((s, j) => (s && s.inHand && !s.folded ? j : -1)).filter((j) => j >= 0); }
  isPlaying() { return ['preflop', 'flop', 'turn', 'river'].includes(this.street); }
  players() { return this.seats.map((s, i) => (s ? i : -1)).filter((i) => i >= 0); }
  next(i, pred) { for (let k = 1; k <= this.maxSeats; k++) { const j = (i + k) % this.maxSeats; if (this.seats[j] && pred(this.seats[j], j)) return j; } return -1; }
  canStart() { return this.seats.filter((s) => s && !s.sitOut && s.chips > 0).length >= 2; }

  // ---------------------------------------------------------------- a new hand
  startHand() {
    if (!this.canStart()) return false;
    this.seats = this.seats.map((s) => (s && s.leaving ? null : s));
    if (!this.canStart()) return false;
    this.handNo++; this.result = null; this.board = []; this.deck = newDeck(this.rnd);
    for (const s of this.seats) if (s) Object.assign(s, { cards: [], bet: 0, total: 0, folded: true, allIn: false, inHand: false, last: null, shown: false });
    const live = (s) => !s.sitOut && s.chips > 0;
    for (const s of this.seats) if (s && live(s)) { s.inHand = true; s.folded = false; }
    this.button = this.next(this.button < 0 ? this.maxSeats - 1 : this.button, (s) => s.inHand);
    const inCount = this.seats.filter((s) => s && s.inHand).length;
    // heads-up: the button posts the small blind and acts first before the flop
    const sbSeat = inCount === 2 ? this.button : this.next(this.button, (s) => s.inHand);
    const bbSeat = this.next(sbSeat, (s) => s.inHand);
    this.sbSeat = sbSeat; this.bbSeat = bbSeat;
    this.post(sbSeat, this.sb, 'sb'); this.post(bbSeat, this.bb, 'bb');
    for (let r = 0; r < 2; r++) for (let k = 1; k <= this.maxSeats; k++) { const j = (this.button + k) % this.maxSeats; const s = this.seats[j]; if (s && s.inHand) s.cards.push(this.deck.pop()); }
    this.street = 'preflop';
    this.currentBet = this.bb; this.minRaise = this.bb;
    this.need = new Set(this.players().filter((j) => this.seats[j].inHand && !this.seats[j].allIn));
    this.toAct = this.next(bbSeat, (s) => s.inHand && !s.folded && !s.allIn);
    this.addLog({ k: 'hand', n: this.handNo });
    if (this.need.size === 0 || this.toAct < 0) this.afterAction();
    return true;
  }
  post(i, amt, what) {
    const s = this.seats[i], a = Math.min(amt, s.chips);
    s.chips -= a; s.bet += a; s.total += a; if (s.chips === 0) s.allIn = true;
    s.last = { type: what, amount: a };
    this.addLog({ k: what, seat: i, amount: a });
  }
  // ---------------------------------------------------------------- actions
  legal(i) {
    const s = this.seats[i];
    if (!this.isPlaying() || i !== this.toAct || !s || s.folded || s.allIn) return null;
    const toCall = Math.min(this.currentBet - s.bet, s.chips);
    const maxTo = s.bet + s.chips;
    const minTo = Math.min(maxTo, this.currentBet + this.minRaise);
    const othersCanAct = this.seats.some((o, j) => o && j !== i && o.inHand && !o.folded && !o.allIn);
    return { toCall, canCheck: toCall === 0, minTo, maxTo, canRaise: maxTo > this.currentBet && othersCanAct, currentBet: this.currentBet, pot: this.potTotal() };
  }
  // action: { type: 'fold' | 'check' | 'call' | 'raise', to (raise-to amount) } -> true if accepted
  act(i, a) {
    const L = this.legal(i);
    if (!L) return false;
    const s = this.seats[i];
    if (a.type === 'fold') { if (L.canCheck && !a.force) a = { type: 'check' }; else return this.fold(i), this.afterAction(), true; }
    if (a.type === 'check') { if (!L.canCheck) return false; s.last = { type: 'check' }; this.addLog({ k: 'check', seat: i }); }
    else if (a.type === 'call') {
      if (L.toCall === 0) { s.last = { type: 'check' }; this.addLog({ k: 'check', seat: i }); }
      else { this.put(i, L.toCall); s.last = { type: s.allIn ? 'allin' : 'call', amount: s.bet }; this.addLog({ k: 'call', seat: i, amount: L.toCall }); }
    } else if (a.type === 'raise') {
      if (!L.canRaise) return false;
      const before = this.currentBet;
      let to = Math.max(L.minTo, Math.min(L.maxTo, Math.floor(a.to || 0)));
      const inc = to - this.currentBet;
      this.put(i, to - s.bet);
      if (inc >= this.minRaise) this.minRaise = inc;
      this.currentBet = Math.max(this.currentBet, to);
      // a raise re-opens the action for everyone else still able to act
      this.need = new Set(this.players().filter((j) => j !== i && this.seats[j].inHand && !this.seats[j].folded && !this.seats[j].allIn));
      s.last = { type: s.allIn ? 'allin' : before === 0 ? 'bet' : 'raise', amount: to };
      this.addLog({ k: s.last.type, seat: i, amount: to });
    } else return false;
    this.need.delete(i);
    this.afterAction();
    return true;
  }
  put(i, amt) { const s = this.seats[i], a = Math.min(amt, s.chips); s.chips -= a; s.bet += a; s.total += a; if (s.chips === 0) s.allIn = true; }
  fold(i, quiet) { const s = this.seats[i]; s.folded = true; s.last = { type: 'fold' }; this.need.delete(i); if (!quiet) this.addLog({ k: 'fold', seat: i }); }

  afterAction() {
    const alive = this.seats.map((s, j) => (s && s.inHand && !s.folded ? j : -1)).filter((j) => j >= 0);
    if (alive.length <= 1) return this.finish(alive);
    const canAct = alive.filter((j) => !this.seats[j].allIn);
    const matched = alive.every((j) => this.seats[j].allIn || this.seats[j].bet === this.currentBet);
    if (this.need.size === 0 && matched) return this.nextStreet();
    if (canAct.length <= 1 && matched && (canAct.length === 0 || this.seats[canAct[0]].bet >= this.currentBet)) return this.nextStreet();
    this.toAct = this.next(this.toAct, (s, j) => s.inHand && !s.folded && !s.allIn && (this.need.has(j) || s.bet < this.currentBet));
    if (this.toAct < 0) this.nextStreet();
  }
  nextStreet() {
    for (const s of this.seats) if (s) { s.bet = 0; if (s.last && s.last.type !== 'fold' && s.last.type !== 'allin') s.last = null; }
    this.currentBet = 0; this.minRaise = this.bb;
    const order = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown' };
    this.street = order[this.street];
    if (this.street === 'flop') { this.deck.pop(); this.board.push(this.deck.pop(), this.deck.pop(), this.deck.pop()); }
    if (this.street === 'turn' || this.street === 'river') { this.deck.pop(); this.board.push(this.deck.pop()); }
    if (this.street === 'showdown') return this.finish(this.seats.map((s, j) => (s && s.inHand && !s.folded ? j : -1)).filter((j) => j >= 0));
    this.addLog({ k: this.street, board: this.board.slice() });
    const alive = this.players().filter((j) => this.seats[j].inHand && !this.seats[j].folded);
    const canAct = alive.filter((j) => !this.seats[j].allIn);
    if (canAct.length <= 1) { this.toAct = -1; this.runout = true; return; }       // nobody left to bet: the host deals the rest out
    this.need = new Set(canAct);
    this.toAct = this.next(this.button, (s, j) => canAct.includes(j));
  }
  // deal one more street when everybody is all-in (the host calls this with a pause for drama)
  runOut() { if (this.runout && this.isPlaying()) { this.runout = false; this.nextStreet(); } }

  potTotal() { return this.seats.reduce((a, s) => a + (s ? s.total : 0), 0); }
  // side pots from everyone's total contribution this hand
  pots() {
    const contrib = this.seats.map((s, j) => (s && s.total > 0 ? { j, total: s.total, live: s.inHand && !s.folded } : null)).filter(Boolean);
    const levels = [...new Set(contrib.filter((c) => c.live).map((c) => c.total))].sort((a, b) => a - b);
    const pots = []; let prev = 0;
    for (const lv of levels) {
      let amount = 0;
      for (const c of contrib) amount += Math.max(0, Math.min(c.total, lv) - prev);
      const elig = contrib.filter((c) => c.live && c.total >= lv).map((c) => c.j);
      if (amount > 0) pots.push({ amount, elig });
      prev = lv;
    }
    // money above the highest live contribution (only possible from folded players) joins the last pot
    const extra = contrib.reduce((a, c) => a + Math.max(0, c.total - prev), 0);
    if (extra && pots.length) pots[pots.length - 1].amount += extra;
    return pots;
  }
  finish(alive) {
    this.toAct = -1;
    const res = { pots: [], hands: {}, handNo: this.handNo, board: this.board.slice() };
    if (alive.length === 1) {
      const w = alive[0], amount = this.potTotal();
      this.seats[w].chips += amount;
      res.pots.push({ amount, winners: [w], share: amount });
      res.uncontested = true;
      this.addLog({ k: 'win', seat: w, amount });
    } else {
      for (const j of alive) { const s = this.seats[j]; res.hands[j] = bestHand(s.cards.concat(this.board)); s.shown = true; }
      for (const p of this.pots()) {
        const best = Math.max(...p.elig.map((j) => res.hands[j].value));
        const winners = p.elig.filter((j) => res.hands[j].value === best);
        const share = Math.floor(p.amount / winners.length);
        let odd = p.amount - share * winners.length;
        // odd chips go to the first winners clockwise from the button
        const ordered = winners.slice().sort((a, b) => ((a - this.button + this.maxSeats) % this.maxSeats) - ((b - this.button + this.maxSeats) % this.maxSeats));
        for (const w of ordered) { this.seats[w].chips += share + (odd > 0 ? 1 : 0); if (odd > 0) odd--; }
        res.pots.push({ amount: p.amount, winners, share });
        for (const w of winners) this.addLog({ k: 'win', seat: w, amount: share, cat: res.hands[w].cat });
      }
    }
    for (const s of this.seats) if (s) { s.bet = 0; }
    this.street = 'done';
    this.result = res;
    return res;
  }
  addLog(e) { this.log.push(e); if (this.log.length > 60) this.log.shift(); }

  // what one seat may see (other players' cards stay hidden unless shown down)
  view(viewer) {
    return {
      seats: this.seats.map((s, j) => s && { name: s.name, avatar: s.avatar, chips: s.chips, bet: s.bet, total: s.total, folded: s.folded, allIn: s.allIn, inHand: s.inHand, sitOut: s.sitOut, bot: !!s.bot, last: s.last, connected: s.connected !== false,
        cards: s.cards.length ? (j === viewer || (s.shown && this.street === 'done') ? s.cards : s.cards.map(() => '??')) : [] }),
      button: this.button, sbSeat: this.sbSeat, bbSeat: this.bbSeat, street: this.street, board: this.board, toAct: this.toAct, currentBet: this.currentBet,
      pot: this.potTotal(), pots: this.isPlaying() ? this.pots().map((p) => p.amount) : [], sb: this.sb, bb: this.bb, handNo: this.handNo,
      legal: viewer >= 0 ? this.legal(viewer) : null, result: this.result, you: viewer, log: this.log.slice(-14),
    };
  }
}
