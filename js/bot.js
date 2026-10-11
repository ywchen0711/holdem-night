// Bots: estimate the chance to win with a quick Monte Carlo against random hands, then compare with the pot odds.
import { RANKS, SUITS, bestHand, eval5 } from './poker.js?v=1';

const FULL = []; for (const r of RANKS) for (const s of SUITS) FULL.push(r + s);

// fast 7-card value: best of the 21 five-card picks
function value7(cards) {
  let best = 0;
  for (let a = 0; a < 7; a++) for (let b = a + 1; b < 7; b++) {
    const five = []; for (let k = 0; k < 7; k++) if (k !== a && k !== b) five.push(cards[k]);
    const v = eval5(five); if (v > best) best = v;
  }
  return best;
}
export function equity(hole, board, opponents, iters = 250, rnd = Math.random) {
  const used = new Set(hole.concat(board));
  const rest = FULL.filter((c) => !used.has(c));
  let score = 0;
  for (let it = 0; it < iters; it++) {
    const d = rest.slice();
    const draw = () => { const i = Math.floor(rnd() * d.length); const c = d[i]; d[i] = d[d.length - 1]; d.pop(); return c; };
    const b = board.slice(); while (b.length < 5) b.push(draw());
    const mine = value7(hole.concat(b));
    let beaten = false, ties = 0;
    for (let o = 0; o < opponents; o++) {
      const v = value7([draw(), draw()].concat(b));
      if (v > mine) { beaten = true; break; }
      if (v === mine) ties++;
    }
    if (!beaten) score += 1 / (1 + ties);
  }
  return score / iters;
}

// view: Table.view(seat) for this bot. style: 0..1 aggression
export function decide(view, style = 0.5, rnd = Math.random) {
  const me = view.seats[view.you], L = view.legal;
  if (!L) return null;
  const opp = view.seats.filter((s, j) => s && j !== view.you && s.inHand && !s.folded).length;
  const eq = equity(me.cards, view.board, Math.max(1, opp), view.board.length ? 220 : 160, rnd);
  const pot = view.pot;
  const odds = L.toCall / Math.max(1, pot + L.toCall);
  const strong = 1 / (opp + 1);                     // fair share of the pot
  const r = rnd();
  const raiseTo = (frac) => Math.max(L.minTo, Math.min(L.maxTo, Math.round((L.currentBet + pot * frac) / 10) * 10));
  // very strong: raise (sometimes slow-play)
  if (eq > strong + 0.32 && L.canRaise && r < 0.75 + style * 0.2) return { type: 'raise', to: raiseTo(eq > 0.8 ? 1 : 0.6) };
  if (eq > strong + 0.15 && L.canRaise && r < 0.35 + style * 0.3) return { type: 'raise', to: raiseTo(0.5) };
  // a small bluff now and then when nobody bet
  if (L.canCheck && L.canRaise && r < 0.08 + style * 0.08) return { type: 'raise', to: raiseTo(0.45) };
  if (L.canCheck) return { type: 'check' };
  // call if the chance to win beats the price (with a little tolerance), fold otherwise
  if (eq >= odds * (0.9 - style * 0.15) || (L.toCall <= view.bb && eq > 0.18)) return { type: 'call' };
  return { type: 'fold' };
}
export { bestHand };
