// DOM Elements
const result = document.getElementById('result');
const minValue = document.getElementById('min-value');
const maxValue = document.getElementById('max-value');
const quantity = document.getElementById('quantity');
const decimals = document.getElementById('decimals');
const uniqueCheck = document.getElementById('unique-check');
const sortCheck = document.getElementById('sort-check');
const generateBtn = document.getElementById('generate-btn');
const copyBtn = document.getElementById('copy-btn');
const clearHistoryBtn = document.getElementById('clear-history');
const historyList = document.getElementById('history-list');

let history = [];
let currentResult = [];

// Generate random number
function generate() {
    const min = parseFloat(minValue.value) || 0;
    const max = parseFloat(maxValue.value) || 100;
    const qty = Math.min(parseInt(quantity.value) || 1, 100);
    const dec = Math.min(parseInt(decimals.value) || 0, 10);
    const unique = uniqueCheck.checked;
    const sort = sortCheck.checked;

    if (min > max) {
        showToast('Minimum must be less than maximum');
        return;
    }

    if (unique && (max - min) < qty - 1) {
        showToast('Range too small for unique numbers');
        return;
    }

    // Animation
    result.classList.add('animating');
    let animCount = 0;
    const animInterval = setInterval(() => {
        result.textContent = Math.floor(Math.random() * (max - min + 1) + min);
        animCount++;
        if (animCount > 10) {
            clearInterval(animInterval);
            result.classList.remove('animating');
            
            // Generate actual results
            currentResult = [];
            const used = new Set();

            for (let i = 0; i < qty; i++) {
                let num;
                if (unique) {
                    do {
                        num = (Math.random() * (max - min) + min).toFixed(dec);
                    } while (used.has(num));
                    used.add(num);
                } else {
                    num = (Math.random() * (max - min) + min).toFixed(dec);
                }
                currentResult.push(parseFloat(num));
            }

            if (sort) currentResult.sort((a, b) => a - b);

            // Display
            if (qty === 1) {
                result.textContent = currentResult[0];
            } else {
                result.textContent = currentResult.join(', ');
            }

            // Add to history
            addToHistory(min, max, currentResult);
        }
    }, 50);
}

// Add to history
function addToHistory(min, max, nums) {
    history.unshift({ min, max, nums, time: new Date() });
    if (history.length > 10) history.pop();
    renderHistory();
}

// Render history
function renderHistory() {
    if (history.length === 0) {
        historyList.innerHTML = '<div class="placeholder">No history yet</div>';
        return;
    }

    historyList.innerHTML = history.map(h => `
        <div class="history-item">
            <span class="history-range">${h.min} - ${h.max}</span>
            <span class="history-result">${h.nums.join(', ')}</span>
        </div>
    `).join('');
}

// Copy result
function copyResult() {
    if (currentResult.length === 0) {
        showToast('Nothing to copy');
        return;
    }
    navigator.clipboard.writeText(currentResult.join(', '));
    showToast('Copied to clipboard!');
}

// Clear history
function clearHistory() {
    history = [];
    renderHistory();
}

// Show toast
function showToast(message) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas fa-check"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Event listeners
generateBtn.addEventListener('click', generate);
copyBtn.addEventListener('click', copyResult);
clearHistoryBtn.addEventListener('click', clearHistory);

// Enter key
document.addEventListener('keypress', e => {
    if (e.key === 'Enter') generate();
});

// Initial generate
generate();
