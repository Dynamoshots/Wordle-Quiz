import './style.css';

const ANSWER      = 'DEBIT';
const MAX_GUESSES = 6;
const WORD_LENGTH = 5;
const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbzHGwiyHKgArGclJvK39I0tmMF-xKQ2fpoUox46xROW3xgsCK5heYAzFfZA6PfNtuVv/exec';

let playerEmail  = '';
let currentRow   = 0;
let currentCol   = 0;
let currentGuess = [];
let gameOver     = false;
let resultGrid   = [];

// ── Email Gate ───────────────────────────────────────────────
document.getElementById('email-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') handleEmailSubmit();
});
document.getElementById('start-btn').addEventListener('click', handleEmailSubmit);

async function handleEmailSubmit() {
  const input = document.getElementById('email-input');
  const errEl = document.getElementById('email-error');
  const btn   = document.getElementById('start-btn');
  const email = input.value.trim().toLowerCase();
  errEl.textContent = '';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errEl.textContent = 'Please enter a valid email address.';
    return;
  }

  btn.disabled    = true;
  btn.textContent = 'Checking...';

  try {
    const res  = await fetch(`${APPS_SCRIPT_URL}?action=check&email=${encodeURIComponent(email)}`, {
      redirect: 'follow',
      mode: 'cors'
    });
    const data = await res.json();
    if (data.played) {
      document.getElementById('email-gate').style.display = 'none';
      document.getElementById('already-played').classList.add('show');
      return;
    }
  } catch (e) {
    // If check fails, let them play (fail open)
    console.warn('Check failed, proceeding:', e.message);
  }

  playerEmail = email;
  document.getElementById('email-gate').style.display = 'none';
  document.getElementById('game-wrap').classList.add('show');
  btn.disabled    = false;
  btn.textContent = 'Start Playing';
}

// ── Build Board ──────────────────────────────────────────────
const boardEl = document.getElementById('board');
for (let r = 0; r < MAX_GUESSES; r++) {
  const row = document.createElement('div');
  row.classList.add('row');
  row.id = `row-${r}`;
  for (let c = 0; c < WORD_LENGTH; c++) {
    const tile = document.createElement('div');
    tile.classList.add('tile');
    tile.id = `tile-${r}-${c}`;
    row.appendChild(tile);
  }
  boardEl.appendChild(row);
}

// ── Build Keyboard ───────────────────────────────────────────
const keyRows = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['ENTER','Z','X','C','V','B','N','M','⌫']
];
const kbEl = document.getElementById('keyboard');
keyRows.forEach(keys => {
  const row = document.createElement('div');
  row.classList.add('kb-row');
  keys.forEach(k => {
    const btn = document.createElement('button');
    btn.classList.add('key');
    if (k === 'ENTER' || k === '⌫') btn.classList.add('wide');
    btn.textContent = k;
    btn.dataset.key = k;
    btn.addEventListener('click', () => handleKey(k));
    row.appendChild(btn);
  });
  kbEl.appendChild(row);
});

// ── Keyboard Input ───────────────────────────────────────────
document.addEventListener('keydown', e => {
  if (!document.getElementById('game-wrap').classList.contains('show')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === 'Enter') handleKey('ENTER');
  else if (e.key === 'Backspace') handleKey('⌫');
  else if (/^[a-zA-Z]$/.test(e.key)) handleKey(e.key.toUpperCase());
});

function handleKey(key) {
  if (gameOver) return;
  if (key === '⌫') deleteLetter();
  else if (key === 'ENTER') submitGuess();
  else if (/^[A-Z]$/.test(key) && currentCol < WORD_LENGTH) addLetter(key);
}

function addLetter(letter) {
  if (currentCol >= WORD_LENGTH) return;
  const tile = getTile(currentRow, currentCol);
  tile.textContent = letter;
  tile.classList.add('filled');
  tile.classList.remove('shake');
  void tile.offsetWidth;
  currentGuess.push(letter);
  currentCol++;
}

function deleteLetter() {
  if (currentCol === 0) return;
  currentCol--;
  currentGuess.pop();
  const tile = getTile(currentRow, currentCol);
  tile.textContent = '';
  tile.classList.remove('filled');
}

// ── Dictionary Validation ────────────────────────────────────
const dictCache = new Map();
async function isValidWord(word) {
  const lower = word.toLowerCase();
  if (dictCache.has(lower)) return dictCache.get(lower);
  try {
    const res   = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${lower}`);
    const valid = res.ok;
    dictCache.set(lower, valid);
    return valid;
  } catch {
    return true; // fail open if offline
  }
}

// ── Submit Guess ─────────────────────────────────────────────
async function submitGuess() {
  if (currentCol < WORD_LENGTH) {
    shakeRow(currentRow);
    showToast('Not enough letters');
    return;
  }

  const guess = currentGuess.join('');
  showToast('Checking…');
  const valid = await isValidWord(guess);
  if (!valid) {
    shakeRow(currentRow);
    showToast('⚠️  Not a dictionary word!', 'error');
    return;
  }

  const result    = evaluateGuess(guess);
  const rowEmojis = result.map(s => s === 'correct' ? '🟩' : s === 'present' ? '🟨' : '⬛');
  resultGrid.push(rowEmojis.join(''));

  revealRow(currentRow, guess, result, async () => {
    updateKeyboard(guess, result);
    const won  = guess === ANSWER;
    const last = currentRow === MAX_GUESSES - 1;

    if (won) {
      gameOver = true;
      bounceTiles(currentRow);
      const msgs  = ['Genius! 🏆', 'Magnificent! ✨', 'Impressive! 🎯', 'Splendid! 💡', 'Great! 👏', 'Phew! 😅'];
      const score = calcScore(currentRow + 1, true);
      await submitScore(playerEmail, currentRow + 1, score, true);
      setTimeout(() => showResult(true, msgs[currentRow], currentRow + 1, score), 600);
    } else if (last) {
      gameOver = true;
      await submitScore(playerEmail, MAX_GUESSES, 0, false);
      setTimeout(() => showResult(false, '', MAX_GUESSES, 0), 600);
    }

    currentRow++;
    currentCol   = 0;
    currentGuess = [];
  });
}

// ── Scoring ──────────────────────────────────────────────────
function calcScore(att, won) {
  return won ? (MAX_GUESSES + 1 - att) * 100 : 0;
}

// ── Submit to Google Sheets ──────────────────────────────────
// Uses the exact same fetch pattern as email check (we know that works)
async function submitScore(email, attempts, score, won) {
  try {
    const params = new URLSearchParams({
      action:   'save',
      email:    email,
      attempts: String(attempts),
      score:    String(score),
      won:      String(won),
      grid:     resultGrid.join(' | ')
    });
    const url = `${APPS_SCRIPT_URL}?${params.toString()}`;
    console.log('Saving score to:', url);
    const res  = await fetch(url);
    const data = await res.json();
    console.log('Save response:', data);
  } catch (e) {
    console.warn('Score save failed:', e.message);
  }
}

// ── Evaluate Guess ───────────────────────────────────────────
function evaluateGuess(guess) {
  const result = Array(WORD_LENGTH).fill('absent');
  const aArr   = ANSWER.split('');
  const gArr   = guess.split('');
  const used   = Array(WORD_LENGTH).fill(false);
  gArr.forEach((l, i) => { if (l === aArr[i]) { result[i] = 'correct'; used[i] = true; } });
  gArr.forEach((l, i) => {
    if (result[i] === 'correct') return;
    const j = aArr.findIndex((a, idx) => a === l && !used[idx]);
    if (j !== -1) { result[i] = 'present'; used[j] = true; }
  });
  return result;
}

// ── Reveal Row ────────────────────────────────────────────────
function revealRow(row, guess, result, callback) {
  const delay = 300;
  result.forEach((state, i) => {
    const tile = getTile(row, i);
    setTimeout(() => {
      tile.classList.add('flip');
      setTimeout(() => { tile.dataset.state = state; }, 250);
    }, i * delay);
  });
  setTimeout(callback, WORD_LENGTH * delay + 300);
}

function updateKeyboard(guess, result) {
  const p = { correct: 3, present: 2, absent: 1 };
  guess.split('').forEach((l, i) => {
    const btn = document.querySelector(`.key[data-key="${l}"]`);
    if (!btn) return;
    const cur = btn.dataset.state;
    if (!cur || p[result[i]] > p[cur]) btn.dataset.state = result[i];
  });
}

function shakeRow(row) {
  document.getElementById(`row-${row}`).querySelectorAll('.tile').forEach(t => {
    t.classList.remove('shake');
    void t.offsetWidth;
    t.classList.add('shake');
  });
}

function bounceTiles(row) {
  document.getElementById(`row-${row}`).querySelectorAll('.tile').forEach((t, i) => {
    setTimeout(() => t.classList.add('bounce'), i * 80);
  });
}

function getTile(r, c) {
  return document.getElementById(`tile-${r}-${c}`);
}

// ── Toast ─────────────────────────────────────────────────────
let toastTimer;
function showToast(msg, type) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('error');
  if (type === 'error') el.classList.add('error');
  el.classList.add('show');
  clearTimeout(toastTimer);
  const duration = type === 'error' ? 2800 : 1600;
  toastTimer = setTimeout(() => { el.classList.remove('show', 'error'); }, duration);
}

// ── Result Panel ──────────────────────────────────────────────
function showResult(won, msg, attempts, score) {
  document.getElementById('result-eyebrow').textContent = won ? '🎉 You got it!' : 'The word was';
  document.getElementById('score-pill').textContent     = won ? `⭐ ${score} pts` : '❌ 0 pts';
  document.getElementById('result-msg').textContent     = won
    ? `${msg} Solved in ${attempts} ${attempts === 1 ? 'guess' : 'guesses'}.`
    : 'Better luck next time! The answer was DEBIT.';
  document.getElementById('result-panel').classList.add('show');
}

// ── Share ─────────────────────────────────────────────────────
document.getElementById('share-btn').addEventListener('click', () => {
  const lines = ['Wordle · Pine Labs Overdrive', `${currentRow}/6`, '', ...resultGrid].join('\n');
  if (navigator.clipboard) {
    navigator.clipboard.writeText(lines).then(() => showToast('Copied!'));
  }
});
