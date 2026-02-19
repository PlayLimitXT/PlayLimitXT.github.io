// DOM Elements
const currentTs = document.getElementById('current-ts');
const copyCurrentBtn = document.getElementById('copy-current');
const tsInput = document.getElementById('ts-input');
const tsConvertBtn = document.getElementById('ts-convert');
const tsResult = document.getElementById('ts-result');
const dateInput = document.getElementById('date-input');
const dateConvertBtn = document.getElementById('date-convert');
const dateResult = document.getElementById('date-result');
const formatsList = document.getElementById('formats-list');

// Update current timestamp
function updateCurrentTimestamp() {
    const now = Math.floor(Date.now() / 1000);
    currentTs.textContent = now;
}

// Format date
function formatDate(date) {
    return {
        local: date.toLocaleString(),
        utc: date.toUTCString(),
        iso: date.toISOString(),
        date: date.toLocaleDateString(),
        time: date.toLocaleTimeString(),
        day: date.toLocaleDateString('en-US', { weekday: 'long' }),
        month: date.toLocaleDateString('en-US', { month: 'long' }),
        year: date.getFullYear()
    };
}

// Timestamp to date conversion
function convertTimestamp() {
    const ts = tsInput.value.trim();
    if (!ts) {
        tsResult.innerHTML = '<div class="placeholder">Enter a timestamp to convert</div>';
        return;
    }

    let timestamp = parseInt(ts);
    if (isNaN(timestamp)) {
        tsResult.innerHTML = '<div class="placeholder" style="color: var(--error);">Invalid timestamp</div>';
        return;
    }

    // Auto-detect seconds vs milliseconds
    if (timestamp > 9999999999) {
        timestamp = Math.floor(timestamp / 1000);
    }

    const date = new Date(timestamp * 1000);
    const formats = formatDate(date);

    tsResult.innerHTML = `
        <div class="result-item">
            <span class="result-label">Local</span>
            <span class="result-value">${formats.local}</span>
        </div>
        <div class="result-item">
            <span class="result-label">UTC</span>
            <span class="result-value">${formats.utc}</span>
        </div>
        <div class="result-item">
            <span class="result-label">ISO 8601</span>
            <span class="result-value">${formats.iso}</span>
        </div>
        <div class="result-item">
            <span class="result-label">Date</span>
            <span class="result-value">${formats.date}</span>
        </div>
        <div class="result-item">
            <span class="result-label">Time</span>
            <span class="result-value">${formats.time}</span>
        </div>
    `;
}

// Date to timestamp conversion
function convertDate() {
    const dateVal = dateInput.value;
    if (!dateVal) {
        dateResult.innerHTML = '<div class="placeholder">Select a date to convert</div>';
        return;
    }

    const date = new Date(dateVal);
    const timestamp = Math.floor(date.getTime() / 1000);
    const ms = date.getTime();

    dateResult.innerHTML = `
        <div class="result-item">
            <span class="result-label">Unix (seconds)</span>
            <span class="result-value">${timestamp}</span>
        </div>
        <div class="result-item">
            <span class="result-label">Milliseconds</span>
            <span class="result-value">${ms}</span>
        </div>
        <div class="result-item">
            <span class="result-label">ISO 8601</span>
            <span class="result-value">${date.toISOString()}</span>
        </div>
    `;
}

// Update formats list
function updateFormats() {
    const now = new Date();
    
    const formats = [
        { label: 'ISO 8601', value: now.toISOString() },
        { label: 'RFC 2822', value: now.toUTCString() },
        { label: 'Locale String', value: now.toLocaleString() },
        { label: 'Date Only', value: now.toLocaleDateString() },
        { label: 'Time Only', value: now.toLocaleTimeString() },
        { label: 'YYYY-MM-DD', value: now.toISOString().split('T')[0] },
        { label: 'HH:MM:SS', value: now.toTimeString().split(' ')[0] },
        { label: 'Milliseconds', value: now.getTime().toString() }
    ];

    formatsList.innerHTML = formats.map(f => `
        <div class="format-item">
            <span class="format-label">${f.label}</span>
            <span>
                <span class="format-value">${f.value}</span>
                <button class="copy-btn" onclick="copyText('${f.value}')">
                    <i class="fas fa-copy"></i>
                </button>
            </span>
        </div>
    `).join('');
}

// Copy text
function copyText(text) {
    navigator.clipboard.writeText(text);
    showToast('Copied!');
}

// Copy current timestamp
function copyCurrent() {
    navigator.clipboard.writeText(currentTs.textContent);
    showToast('Timestamp copied!');
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
copyCurrentBtn.addEventListener('click', copyCurrent);
tsConvertBtn.addEventListener('click', convertTimestamp);
dateConvertBtn.addEventListener('click', convertDate);

// Enter key support
tsInput.addEventListener('keypress', e => {
    if (e.key === 'Enter') convertTimestamp();
});

// Set default date input value
dateInput.value = new Date().toISOString().slice(0, 16);

// Update every second
setInterval(() => {
    updateCurrentTimestamp();
    updateFormats();
}, 1000);

// Initial update
updateCurrentTimestamp();
updateFormats();
