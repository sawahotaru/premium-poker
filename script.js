const SUITS = ['♠', '♣', '♥', '♦'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const VALUE_MAP = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };

const MIN_BET = 10;
const MAX_BET = 100;
const BET_STEP = 10;
const START_CREDITS = 1000;

let deck = [];
let hand = [];
let holds = [false, false, false, false, false];
let credits = START_CREDITS;
let bet = MIN_BET;
let gameState = 'IDLE'; // IDLE, DEALT
let busy = false;       // guards against double-clicks during transitions

const dealBtn = document.getElementById('deal-btn');
const msgArea = document.getElementById('message-area');
const creditsEl = document.getElementById('credits');
const betEl = document.getElementById('bet');
const betMinusBtn = document.getElementById('bet-minus');
const betPlusBtn = document.getElementById('bet-plus');
const gameOverEl = document.getElementById('game-over');
const bgMusic = document.getElementById('bg-music');
const musicIcon = document.getElementById('music-icon');

function initDeck() {
    deck = [];
    for (let suit of SUITS) {
        for (let val of VALUES) {
            deck.push({ suit, val, color: (suit === '♥' || suit === '♦') ? 'red' : 'black' });
        }
    }
}

function shuffle() {
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
}

function updateUI() {
    creditsEl.textContent = credits;
    hand.forEach((card, i) => {
        const cardEl = document.getElementById(`card-${i}`);
        const front = cardEl.querySelector('.card-front');
        front.innerHTML = `<span>${card.val}</span><span>${card.suit}</span>`;
        cardEl.className = `card flipped ${card.color} ${holds[i] ? 'held' : ''}`;
    });
}

function resetCards() {
    for (let i = 0; i < 5; i++) {
        const cardEl = document.getElementById(`card-${i}`);
        cardEl.className = 'card';
        holds[i] = false;
    }
}

// Re-trigger the flip animation only on the given card indices.
function reflipCards(indices) {
    indices.forEach(i => {
        const cardEl = document.getElementById(`card-${i}`);
        cardEl.classList.remove('flipped');
    });
    // force reflow so removing + re-adding the class restarts the transition
    void document.body.offsetWidth;
    indices.forEach(i => {
        document.getElementById(`card-${i}`).classList.add('flipped');
    });
}

function clearPayoutHighlight() {
    document.querySelectorAll('.payout-row.highlight')
        .forEach(row => row.classList.remove('highlight'));
}

function highlightPayout(key) {
    clearPayoutHighlight();
    if (!key) return;
    const row = document.querySelector(`.payout-row[data-hand="${key}"]`);
    if (row) row.classList.add('highlight');
}

function updateBetUI() {
    betEl.textContent = bet;
    // bet controls only usable while idle and within bounds
    const locked = gameState !== 'IDLE' || busy;
    betMinusBtn.disabled = locked || bet <= MIN_BET;
    betPlusBtn.disabled = locked || bet >= MAX_BET || bet + BET_STEP > credits;
}

function changeBet(delta) {
    if (gameState !== 'IDLE' || busy) return;
    const next = bet + delta;
    if (next < MIN_BET || next > MAX_BET) return;
    if (next > credits) return; // can't bet more than you have
    bet = next;
    updateBetUI();
}

function toggleHold(i) {
    if (gameState !== 'DEALT') return;
    holds[i] = !holds[i];
    const cardEl = document.getElementById(`card-${i}`);
    cardEl.classList.toggle('held', holds[i]);
}

async function handleAction() {
    if (busy) return; // ignore rapid double-clicks while a phase is in progress

    if (gameState === 'IDLE') {
        if (credits < bet) {
            alert('Not enough credits!');
            return;
        }
        busy = true;
        clearPayoutHighlight();
        credits -= bet;
        creditsEl.textContent = credits;
        gameState = 'DEALT';
        dealBtn.textContent = 'DRAW';
        msgArea.textContent = 'Hold cards and Draw!';
        msgArea.classList.remove('hidden');
        updateBetUI();

        initDeck();
        shuffle();
        hand = deck.splice(0, 5);
        resetCards();
        setTimeout(() => {
            updateUI();
            busy = false; // ready for holds / draw once cards are shown
            updateBetUI();
        }, 100);
    } else if (gameState === 'DEALT') {
        busy = true;
        const drawn = [];
        for (let i = 0; i < 5; i++) {
            if (!holds[i]) {
                hand[i] = deck.pop();
                drawn.push(i);
            }
        }
        gameState = 'IDLE';
        dealBtn.textContent = 'DEAL';
        updateUI();
        if (drawn.length) reflipCards(drawn); // animate only replaced cards
        evaluateHand();
        busy = false;
        updateBetUI();
        checkGameOver();
    }
}

function evaluateHand() {
    const counts = {};
    const suits = {};
    const values = hand.map(c => VALUE_MAP[c.val]).sort((a, b) => a - b);

    hand.forEach(c => {
        counts[c.val] = (counts[c.val] || 0) + 1;
        suits[c.suit] = (suits[c.suit] || 0) + 1;
    });

    const isFlush = Object.values(suits).some(s => s === 5);
    let isStraight = true;
    for (let i = 0; i < 4; i++) {
        if (values[i+1] !== values[i] + 1) isStraight = false;
    }
    // Ace-low straight
    if (!isStraight && values.join(',') === '2,3,4,5,14') isStraight = true;

    const countArr = Object.values(counts).sort((a, b) => b - a);
    const pairs = countArr.filter(c => c === 2).length;

    let result = '';
    let key = '';
    let multiplier = 0;

    if (isFlush && isStraight && values[0] === 10 && values[4] === 14) { result = 'ROYAL FLUSH!'; key = 'ROYAL'; multiplier = 250; }
    else if (isFlush && isStraight) { result = 'STRAIGHT FLUSH!'; key = 'STRAIGHT_FLUSH'; multiplier = 50; }
    else if (countArr[0] === 4) { result = 'FOUR OF A KIND!'; key = 'FOUR'; multiplier = 25; }
    else if (countArr[0] === 3 && countArr[1] === 2) { result = 'FULL HOUSE!'; key = 'FULL_HOUSE'; multiplier = 9; }
    else if (isFlush) { result = 'FLUSH!'; key = 'FLUSH'; multiplier = 6; }
    else if (isStraight) { result = 'STRAIGHT!'; key = 'STRAIGHT'; multiplier = 4; }
    else if (countArr[0] === 3) { result = 'THREE OF A KIND!'; key = 'THREE'; multiplier = 3; }
    else if (pairs === 2) { result = 'TWO PAIR!'; key = 'TWO_PAIR'; multiplier = 2; }
    else if (pairs === 1) {
        const jackOrBetter = Object.keys(counts).some(v => ['J', 'Q', 'K', 'A'].includes(v) && counts[v] === 2);
        if (jackOrBetter) { result = 'JACKS OR BETTER!'; key = 'JACKS'; multiplier = 1; }
    }

    highlightPayout(key);

    if (multiplier > 0) {
        const win = bet * multiplier;
        credits += win;
        msgArea.textContent = `WIN: ${win} (${result})`;
        creditsEl.textContent = credits;
    } else {
        msgArea.textContent = 'No Luck this time.';
    }
}

function checkGameOver() {
    if (credits < MIN_BET) {
        gameOverEl.classList.remove('hidden');
    }
    // clamp bet if credits dropped below current bet
    if (bet > credits && credits >= MIN_BET) {
        bet = Math.max(MIN_BET, Math.floor(credits / BET_STEP) * BET_STEP);
        updateBetUI();
    }
}

function restartGame() {
    credits = START_CREDITS;
    bet = MIN_BET;
    gameState = 'IDLE';
    busy = false;
    hand = [];
    holds = [false, false, false, false, false];
    resetCards();
    for (let i = 0; i < 5; i++) {
        document.getElementById(`card-${i}`).querySelector('.card-front').innerHTML = '?';
    }
    clearPayoutHighlight();
    creditsEl.textContent = credits;
    dealBtn.textContent = 'DEAL';
    msgArea.textContent = 'Game Started!';
    msgArea.classList.add('hidden');
    gameOverEl.classList.add('hidden');
    updateBetUI();
}

function toggleMusic() {
    if (bgMusic.paused) {
        bgMusic.play();
        musicIcon.textContent = '🔊';
    } else {
        bgMusic.pause();
        musicIcon.textContent = '🔇';
    }
}

// initialize bet control state on load
updateBetUI();
