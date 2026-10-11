// node tools/test.mjs : hand rankings, side pots, rules edge cases and thousands of bot hands (chips must be conserved)
import { Table, bestHand, eval5, CATS } from '../js/poker.js';
import { decide, equity } from '../js/bot.js';

let fail = 0;
const ok = (name, c, info = '') => { console.log((c ? 'PASS ' : 'FAIL ') + name + (info ? '  ' + info : '')); if (!c) fail++; };
const H = (s) => s.split(' ');
const cat = (s) => CATS[bestHand(H(s)).cat];

// 1 hand categories
ok('royal / straight flush', cat('As Ks Qs Js Ts 2d 3c') === 'sflush');
ok('wheel straight', cat('Ah 2d 3c 4s 5h Kd Kc') === 'straight');
ok('quads', cat('9h 9d 9c 9s 2h 3d 4c') === 'quads');
ok('full house from two trips', cat('8h 8d 8c 7s 7h 7d 2c') === 'full');
ok('flush beats straight', cat('2h 5h 9h Jh Kh Qd Tc') === 'flush');
ok('two pair', cat('Ah Ad Kc Ks 2h 3d 9c') === 'twopair');
ok('kicker decides', eval5(H('Ah Ad Kc 7s 2h')) > eval5(H('As Ac Qc 7d 2s')));
ok('wheel loses to six-high straight', eval5(H('Ah 2d 3c 4s 5h')) < eval5(H('2h 3d 4c 5s 6h')));
ok('ace-high straight beats king-high', eval5(H('Ah Kd Qc Js Th')) > eval5(H('Kh Qd Jc Ts 9h')));
ok('best five of seven', bestHand(H('Ah Ad Ac Kd Ks Qh Qd')).cards.filter((c) => c[0] === 'K').length === 2);

// 2 a scripted hand with an all-in and a side pot
{
  const t = new Table({ sb: 10, bb: 20, startChips: 1000, rnd: () => 0.5 });
  t.sit(0, { name: 'A' }); t.sit(1, { name: 'B' }); t.sit(2, { name: 'C' });
  t.seats[0].chips = 100; t.seats[1].chips = 500; t.seats[2].chips = 500;
  t.startHand();
  const before = t.seats.reduce((a, s) => a + (s ? s.chips + s.total : 0), 0);
  // play: everyone all-in or calls
  let guard = 0;
  while (t.isPlaying() && guard++ < 50) {
    if (t.toAct < 0) { t.runOut(); continue; }
    const L = t.legal(t.toAct);
    if (t.toAct === 0) t.act(0, { type: 'raise', to: L.maxTo });
    else if (L.canCheck) t.act(t.toAct, { type: 'check' }); else t.act(t.toAct, { type: 'call' });
  }
  const after = t.seats.reduce((a, s) => a + (s ? s.chips : 0), 0);
  ok('all-in hand finishes with a side pot', t.street === 'done' && t.result.pots.length >= 1, JSON.stringify(t.result.pots));
  ok('chips conserved in the side-pot hand', before === after, `${before} -> ${after}`);
}
// 3 heads-up: the button posts the small blind and acts first preflop
{
  const t = new Table({ sb: 10, bb: 20 });
  t.sit(2, { name: 'A' }); t.sit(5, { name: 'B' });
  t.startHand();
  ok('heads-up blinds', t.sbSeat === t.button && t.toAct === t.button, `button ${t.button} sb ${t.sbSeat} toAct ${t.toAct}`);
  t.act(t.toAct, { type: 'call' });
  ok('big blind gets its option', t.street === 'preflop' && t.toAct === t.bbSeat);
  t.act(t.toAct, { type: 'check' });
  ok('flop after the option is checked', t.street === 'flop' && t.board.length === 3 && t.toAct === t.bbSeat);
}
// 4 min-raise rule
{
  const t = new Table({ sb: 10, bb: 20 });
  for (let i = 0; i < 4; i++) t.sit(i, { name: 'P' + i });
  t.startHand();
  const L = t.legal(t.toAct);
  ok('min raise preflop is to 40', L.minTo === 40, L.minTo);
  t.act(t.toAct, { type: 'raise', to: 100 });
  ok('then the next min raise is to 180', t.legal(t.toAct).minTo === 180, t.legal(t.toAct).minTo);
}
// 5 everybody folds to the big blind
{
  const t = new Table({ sb: 10, bb: 20 });
  for (let i = 0; i < 3; i++) t.sit(i, { name: 'P' + i });
  t.startHand();
  const bb = t.bbSeat, chips = t.seats[bb].chips;
  while (t.isPlaying()) t.act(t.toAct, { type: 'fold', force: true });
  ok('walk: the big blind wins the blinds', t.result.uncontested && t.seats[bb].chips === chips + 30, t.seats[bb].chips - chips);
}
// 6 bots play many hands; chips are always conserved and every hand ends
{
  let hands = 0, bad = 0, showdowns = 0, splits = 0;
  for (let game = 0; game < 30; game++) {
    const t = new Table({ sb: 10, bb: 20, startChips: 1000 });
    const n = 2 + (game % 7);
    for (let i = 0; i < n; i++) t.sit(i, { name: 'bot' + i, bot: true });
    const total = n * 1000;
    for (let h = 0; h < 40 && t.canStart(); h++) {
      t.startHand(); hands++;
      let guard = 0;
      while (t.isPlaying() && guard++ < 200) {
        if (t.toAct < 0) { t.runOut(); continue; }
        const a = decide(t.view(t.toAct), 0.5);
        if (!t.act(t.toAct, a)) t.act(t.toAct, { type: 'fold', force: true });
      }
      if (t.street !== 'done') bad++;
      if (t.result && !t.result.uncontested) showdowns++;
      if (t.result && t.result.pots.some((p) => p.winners.length > 1)) splits++;
      const sum = t.seats.reduce((a, s) => a + (s ? s.chips : 0), 0);
      if (sum !== total) { bad++; console.log('chips', sum, total); break; }
      for (let i = 0; i < t.maxSeats; i++) if (t.seats[i] && t.seats[i].chips === 0) t.seats[i].sitOut = true;
    }
  }
  ok(`${hands} bot hands: all end, chips conserved`, bad === 0, `${showdowns} showdowns, ${splits} split pots`);
}
// 7 equity sanity
const aa = equity(H('As Ah'), [], 1, 1500), seven2 = equity(H('7c 2d'), [], 1, 1500);
ok('AA beats 72 by a lot preflop', aa > 0.78 && seven2 < 0.42, `${aa.toFixed(2)} vs ${seven2.toFixed(2)}`);
console.log(fail ? `${fail} FAILED` : 'all passed');
process.exit(fail ? 1 : 0);
