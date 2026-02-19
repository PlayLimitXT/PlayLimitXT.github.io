// DOM Elements
const testArea = document.getElementById('test-area');
const testText = document.getElementById('test-text');
const currentTimeEl = document.getElementById('current-time');
const bestTimeEl = document.getElementById('best-time');
const avgTimeEl = document.getElementById('avg-time');
const attemptsEl = document.getElementById('attempts');
const historyList = document.getElementById('history-list');
const resetBtn = document.getElementById('reset-btn');

// State
let state = 'waiting'; // waiting, ready, go, result, early
let startTime = 0;
let timeout = null;
let results = [];

// Get rating class
function getRatingClass(time) {
    if (time < 200) return 'excellent';
    if (time < 300) return 'good';
    if (time < 400) return 'average';
    return 'slow';
}

// Get rating text
function getRatingText(time) {
    if (time < 200) return 'Excellent!';
    if (time < 300) return 'Good!';
    if (time < 400) return 'Average';
    return 'Slow';
}

// Update stats
function updateStats() {
    attemptsEl.textContent = results.length;
    
    if (results.length > 0) {
        const best = Math.min(...results);
        const avg = Math.round(results.reduce((a, b) => a + b, 0) / results.length);
        
        bestTimeEl.textContent = best;
        avgTimeEl.textContent = avg;
    }
}

// Render history
function renderHistory() {
    if (results.length === 0) {
        historyList.innerHTML = '<div class="placeholder">No attempts yet</div>';
        return;
    }

    historyList.innerHTML = results.slice().reverse().map((r, i) => `
        <div class="history-item">
            <span class="history-index">#${results.length - i}</span>
            <span class="history-time ${getRatingClass(r)}">${r}ms</span>
        </div>
    `).join('');
}

// Start test
function startTest() {
    state = 'ready';
    testArea.className = 'test-area ready';
    testText.innerHTML = 'Wait for green...';

    const delay = Math.random() * 3000 + 2000; // 2-5 seconds

    timeout = setTimeout(() => {
        state = 'go';
        testArea.className = 'test-area go';
        testText.innerHTML = 'CLICK NOW!';
        startTime = performance.now();
    }, delay);
}

// Handle click
function handleClick() {
    if (state === 'waiting') {
        startTest();
        return;
    }

    if (state === 'ready') {
        // Too early
        clearTimeout(timeout);
        state = 'early';
        testArea.className = 'test-area early';
        testText.innerHTML = 'Too early!<br><small>Click to try again</small>';
        return;
    }

    if (state === 'go') {
        const reactionTime = Math.round(performance.now() - startTime);
        results.push(reactionTime);
        
        state = 'result';
        testArea.className = 'test-area result';
        testText.innerHTML = `
            ${getRatingText(reactionTime)}
            <span class="time">${reactionTime}ms</span>
            <small>Click to try again</small>
        `;

        currentTimeEl.textContent = reactionTime;
        updateStats();
        renderHistory();
        return;
    }

    if (state === 'result' || state === 'early') {
        startTest();
    }
}

// Reset
function reset() {
    clearTimeout(timeout);
    state = 'waiting';
    testArea.className = 'test-area waiting';
    testText.innerHTML = 'Click to Start';
    results = [];
    
    currentTimeEl.textContent = '-';
    bestTimeEl.textContent = '-';
    avgTimeEl.textContent = '-';
    attemptsEl.textContent = '0';
    
    renderHistory();
}

// Event listeners
testArea.addEventListener('click', handleClick);
resetBtn.addEventListener('click', reset);

// Keyboard support
document.addEventListener('keydown', e => {
    if (e.code === 'Space') {
        e.preventDefault();
        handleClick();
    }
});
