# Hold'em Night 德州撲克之夜

Texas Hold'em with friends, online, in the browser. Play chips only, no real money. Chinese and English.

**Play:** https://ywchen0711.github.io/holdem-night/

## How it works
- One player presses **Create a room** and gets a 6-letter room code and a link. Friends open the link (or type the
  code) and sit down. Up to 8 players; the host can add bots to fill seats and presses Start.
- There is no game server: browsers talk to each other directly with WebRTC (PeerJS; the free PeerJS cloud server only
  introduces the browsers). The **host's browser deals and runs the table**, and each player is sent only their own
  hole cards. Closing the host's tab ends the table. A few strict networks (some offices or schools) may block
  peer-to-peer connections.
- **Practise with bots** works offline, without any network.

## Rules
Full no-limit Hold'em: dealer button, small and big blinds (heads-up: the button posts the small blind and acts first
preflop), preflop / flop / turn / river, fold / check / call / bet / raise / all-in with minimum raises, side pots,
best five of seven at showdown, split pots with odd chips to the first winner left of the button. Turn timer (auto
check or fold), rebuys, sitting out, reconnecting to your seat after a refresh, chat and emoji reactions.

## Code
- `js/poker.js` cards, hand evaluation, the table state machine, side pots (no DOM)
- `js/bot.js` bots: Monte Carlo win chance against the pot odds
- `js/net.js` PeerJS host / client · `js/main.js` the host loop, lobby, table UI, chat · `js/i18n.js` text
- `node tools/test.mjs` hand rankings, rules edge cases, side pots and hundreds of bot hands (chips must be conserved)
