// DOM Elements
const keyDisplay = document.getElementById('key-display');
const infoKey = document.getElementById('info-key');
const infoCode = document.getElementById('info-code');
const infoKeyCode = document.getElementById('info-keycode');
const infoLocation = document.getElementById('info-location');
const pressCount = document.getElementById('press-count');
const uniqueKeys = document.getElementById('unique-keys');
const resetStatsBtn = document.getElementById('reset-stats');
const historyList = document.getElementById('history-list');

// State
let totalPresses = 0;
let uniqueKeySet = new Set();
let history = [];

// Location names
const locationNames = {
    0: 'Standard',
    1: 'Left',
    2: 'Right',
    3: 'Numpad'
};

// Key name mappings
const keyNames = {
    ' ': 'Space',
    'ArrowUp': '↑',
    'ArrowDown': '↓',
    'ArrowLeft': '←',
    'ArrowRight': '→',
    'Escape': 'Esc',
    'Control': 'Ctrl',
    'Meta': 'Win',
    'Alt': 'Alt',
    'Shift': 'Shift',
    'CapsLock': 'Caps',
    'Backspace': '⌫',
    'Enter': '↵',
    'Tab': '⇥',
    'Delete': 'Del',
    'Insert': 'Ins',
    'Home': 'Home',
    'End': 'End',
    'PageUp': 'PgUp',
    'PageDown': 'PgDn'
};

// Get display name for key
function getDisplayName(key) {
    return keyNames[key] || key;
}

// Highlight key on virtual keyboard
function highlightKey(code, pressed) {
    const keyElements = document.querySelectorAll(`.key[data-code="${code}"]`);
    keyElements.forEach(el => {
        if (pressed) {
            el.classList.add('pressed');
        } else {
            el.classList.remove('pressed');
        }
    });
}

// Update caps lock state
function updateCapsLock(capsOn) {
    const capsKey = document.querySelector('.key[data-code="CapsLock"]');
    if (capsKey) {
        if (capsOn) {
            capsKey.classList.add('caps-on');
        } else {
            capsKey.classList.remove('caps-on');
        }
    }
}

// Add to history
function addToHistory(key, code) {
    history.unshift({ key, code, time: Date.now() });
    if (history.length > 20) history.pop();
    renderHistory();
}

// Render history
function renderHistory() {
    historyList.innerHTML = history.map(h => 
        `<div class="history-item" title="${h.code}">${getDisplayName(h.key)}</div>`
    ).join('');
}

// Keydown handler
document.addEventListener('keydown', (e) => {
    // Prevent default for some keys
    if (['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
    }

    // Update display
    const displayName = getDisplayName(e.key);
    keyDisplay.innerHTML = displayName;

    // Update info
    infoKey.textContent = e.key;
    infoCode.textContent = e.code;
    infoKeyCode.textContent = e.keyCode;
    infoLocation.textContent = locationNames[e.location] || 'Standard';

    // Update stats
    totalPresses++;
    uniqueKeySet.add(e.code);
    pressCount.textContent = totalPresses;
    uniqueKeys.textContent = uniqueKeySet.size;

    // Highlight key
    highlightKey(e.code, true);

    // Caps lock state
    updateCapsLock(e.getModifierState('CapsLock'));

    // Add to history
    addToHistory(e.key, e.code);
});

// Keyup handler
document.addEventListener('keyup', (e) => {
    highlightKey(e.code, false);
    updateCapsLock(e.getModifierState('CapsLock'));
});

// Reset stats
resetStatsBtn.addEventListener('click', () => {
    totalPresses = 0;
    uniqueKeySet.clear();
    history = [];
    pressCount.textContent = '0';
    uniqueKeys.textContent = '0';
    keyDisplay.innerHTML = '<span class="placeholder">Press a key...</span>';
    infoKey.textContent = '-';
    infoCode.textContent = '-';
    infoKeyCode.textContent = '-';
    infoLocation.textContent = '-';
    historyList.innerHTML = '';
});

// Initial caps lock check
document.addEventListener('DOMContentLoaded', () => {
    // Check initial caps lock state (may not work on all browsers)
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    textarea.focus();
    document.execCommand('selectAll');
    const hasSelection = textarea.selectionStart !== textarea.selectionEnd;
    document.body.removeChild(textarea);
});
