// Chinese / English. The lobby opens games with ?lang=zh|en: that choice wins and is remembered.
const KEY = 'hn.lang';
let lang = 'zh';
try {
  const q = (location.search.match(/[?&]lang=(zh|en)(?![a-z])/) || [])[1];
  if (q) { lang = q; localStorage.setItem(KEY, q); }
  else { const s = localStorage.getItem(KEY); lang = s === 'en' || s === 'zh' ? s : /^zh/i.test(navigator.language || 'zh') ? 'zh' : 'en'; }
} catch (e) { /* private mode */ }
export const getLang = () => lang;
export function setLang(l) { lang = l; try { localStorage.setItem(KEY, l); } catch (e) { /* ignore */ } document.documentElement.lang = l === 'zh' ? 'zh-Hant' : 'en'; }
export const t = (k, ...a) => { const v = TXT[lang][k] ?? TXT.en[k] ?? k; return typeof v === 'function' ? v(...a) : v; };

const TXT = {
  zh: {
    title: '德州撲克之夜', sub: "Hold'em Night", lang: 'EN',
    yourName: '你的名字', avatar: '頭像', create: '🏠 建立房間', join: '🔗 加入房間', practice: '🤖 和電腦練習', roomCode: '房間代碼',
    joinGo: '加入', settings: '房間設定', chips: '起始籌碼', blinds: '盲注', timer: '思考時間', off: '不限', sec: (n) => `${n} 秒`,
    playMoney: '只用遊戲籌碼，不涉及真錢。', share: '把連結傳給朋友，他們打開就能加入：', copy: '複製連結', copied: '已複製！',
    connecting: '連線中……', hostWait: '等待玩家加入。人數夠了就按「開始」。', start: '▶ 開始', addBot: '＋ 電腦', removeBot: '－ 電腦',
    players: (n) => `${n} 位玩家`, fold: '棄牌', check: '過牌', call: (n) => `跟注 ${n}`, bet: '下注', raise: '加注', raiseTo: (n) => `加注到 ${n}`, betTo: (n) => `下注 ${n}`,
    allin: '全下', confirm: '確定', cancel: '取消', halfPot: '½ 池', twoThirds: '⅔ 池', pot: '底池', yourTurn: '輪到你了！',
    waiting: '等待下一手牌……', notEnough: '至少要 2 位有籌碼的玩家', rebuy: '補充籌碼', sitOut: '暫時離座', sitIn: '回到座位', leave: '離開',
    leaveQ: '確定要離開牌桌嗎？', hostLeftQ: '你是房主，離開的話這桌就結束了。確定嗎？', hostGone: '房主離開了，牌桌結束。', full: '牌桌已滿（最多 8 人）',
    noRoom: '找不到這個房間，檢查一下代碼？', taken: '這個房間代碼剛好被用了，再試一次。', netErr: '連線出了問題，請重新整理再試。',
    noPeer: '無法載入連線元件（可能被網路擋住了）。可以先和電腦練習。', chat: '聊天', say: '說點什麼……', send: '送出',
    joined: (n) => `${n} 加入了牌桌`, left: (n) => `${n} 離開了`, dc: '斷線', bot: '電腦',
    wins: (n, a) => `${n} 贏得 ${a}`, with: (h) => `（${h}）`, hand: (n) => `第 ${n} 手`, pots: '底池', side: '邊池',
    H: { high: '高牌', pair: '一對', twopair: '兩對', trips: '三條', straight: '順子', flush: '同花', full: '葫蘆', quads: '四條', sflush: '同花順', royal: '皇家同花順' },
    A: { fold: '棄牌', check: '過牌', call: '跟注', bet: '下注', raise: '加注', allin: '全下', sb: '小盲', bb: '大盲' },
    log: { hand: (n) => `── 第 ${n} 手 ──`, flop: '翻牌', turn: '轉牌', river: '河牌' },
    help: '說明', helpBody: [
      '德州撲克：每人 2 張底牌，加上桌上 5 張公共牌，組出最好的 5 張牌。',
      '下注順序：翻牌前、翻牌（3 張）、轉牌、河牌。每輪可以棄牌、過牌、跟注或加注；全下後若有人籌碼更多會產生邊池。',
      '牌型由大到小：同花順、四條、葫蘆、同花、順子、三條、兩對、一對、高牌。',
      '連線：一個人建立房間，把連結或代碼傳給朋友就能一起玩（最多 8 人，房主可以加電腦）。房主的瀏覽器負責發牌，房主關掉頁面牌桌就會結束。少數網路環境（例如某些公司或學校網路）可能連不上。',
    ],
  },
  en: {
    title: "Hold'em Night", sub: '德州撲克之夜', lang: '中文',
    yourName: 'Your name', avatar: 'Avatar', create: '🏠 Create a room', join: '🔗 Join a room', practice: '🤖 Practise with bots', roomCode: 'Room code',
    joinGo: 'Join', settings: 'Room settings', chips: 'Starting chips', blinds: 'Blinds', timer: 'Turn time', off: 'No limit', sec: (n) => `${n} s`,
    playMoney: 'Play chips only: no real money.', share: 'Send this link to friends, they open it and join:', copy: 'Copy link', copied: 'Copied!',
    connecting: 'Connecting...', hostWait: 'Waiting for players. Press Start when everyone is in.', start: '▶ Start', addBot: '+ Bot', removeBot: '− Bot',
    players: (n) => `${n} players`, fold: 'Fold', check: 'Check', call: (n) => `Call ${n}`, bet: 'Bet', raise: 'Raise', raiseTo: (n) => `Raise to ${n}`, betTo: (n) => `Bet ${n}`,
    allin: 'All-in', confirm: 'OK', cancel: 'Cancel', halfPot: '½ pot', twoThirds: '⅔ pot', pot: 'Pot', yourTurn: 'Your turn!',
    waiting: 'Waiting for the next hand...', notEnough: 'Needs at least 2 players with chips', rebuy: 'Rebuy', sitOut: 'Sit out', sitIn: 'Sit back in', leave: 'Leave',
    leaveQ: 'Leave the table?', hostLeftQ: 'You are the host: leaving ends this table. Leave?', hostGone: 'The host left; the table is closed.', full: 'The table is full (8 max)',
    noRoom: "Couldn't find that room. Check the code?", taken: 'That room code was taken; try again.', netErr: 'Connection problem: refresh and try again.',
    noPeer: "Couldn't load the connection library (maybe blocked). You can still practise with bots.", chat: 'Chat', say: 'Say something...', send: 'Send',
    joined: (n) => `${n} joined the table`, left: (n) => `${n} left`, dc: 'offline', bot: 'Bot',
    wins: (n, a) => `${n} wins ${a}`, with: (h) => ` (${h})`, hand: (n) => `Hand #${n}`, pots: 'Pot', side: 'Side pot',
    H: { high: 'High card', pair: 'Pair', twopair: 'Two pair', trips: 'Three of a kind', straight: 'Straight', flush: 'Flush', full: 'Full house', quads: 'Four of a kind', sflush: 'Straight flush', royal: 'Royal flush' },
    A: { fold: 'Fold', check: 'Check', call: 'Call', bet: 'Bet', raise: 'Raise', allin: 'All-in', sb: 'SB', bb: 'BB' },
    log: { hand: (n) => `── Hand #${n} ──`, flop: 'Flop', turn: 'Turn', river: 'River' },
    help: 'Help', helpBody: [
      "Texas Hold'em: everyone gets 2 hole cards and shares 5 community cards; make the best 5-card hand.",
      'Betting rounds: preflop, flop (3 cards), turn, river. Each round you can fold, check, call or raise; all-ins against bigger stacks make side pots.',
      'Hands from best to worst: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, pair, high card.',
      'Online: one player creates a room and sends the link or code to friends (8 players max; the host can add bots). The host\'s browser deals the cards, so closing it ends the table. A few networks (some offices or schools) may block the connection.',
    ],
  },
};
