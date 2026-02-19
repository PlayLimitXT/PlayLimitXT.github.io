// DOM Elements
const versionSelect = document.getElementById('version-select');
const quantitySelect = document.getElementById('quantity-select');
const formatSelect = document.getElementById('format-select');
const generateBtn = document.getElementById('generate-btn');
const copyAllBtn = document.getElementById('copy-all-btn');
const clearBtn = document.getElementById('clear-btn');
const output = document.getElementById('output');
const countBadge = document.getElementById('count-badge');

let uuids = [];

// Generate UUID v4
function generateUUIDv4() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Generate UUID v1 (simulated timestamp-based)
function generateUUIDv1() {
    const now = Date.now();
    const hex = now.toString(16).padStart(12, '0');
    const random = Array.from({ length: 20 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-1${random.slice(0, 3)}-${random.slice(3, 7)}-${random.slice(7, 19)}`;
}

// Format UUID
function formatUUID(uuid) {
    const format = formatSelect.value;
    switch (format) {
        case 'uppercase':
            return uuid.toUpperCase();
        case 'nodash':
            return uuid.replace(/-/g, '');
        case 'braces':
            return `{${uuid}}`;
        default:
            return uuid;
    }
}

// Generate UUIDs
function generate() {
    const version = versionSelect.value;
    const quantity = parseInt(quantitySelect.value);
    
    uuids = [];
    for (let i = 0; i < quantity; i++) {
        const uuid = version === 'v4' ? generateUUIDv4() : generateUUIDv1();
        uuids.push(formatUUID(uuid));
    }
    
    renderOutput();
}

// Render output
function renderOutput() {
    if (uuids.length === 0) {
        output.innerHTML = '<div class="placeholder">Click Generate to create UUIDs</div>';
        countBadge.textContent = '0';
        return;
    }
    
    output.innerHTML = uuids.map((uuid, i) => `
        <div class="uuid-item">
            <span class="uuid-text">${uuid}</span>
            <div class="uuid-actions">
                <button class="uuid-btn" onclick="copySingle(${i})" title="Copy">
                    <i class="fas fa-copy"></i>
                </button>
            </div>
        </div>
    `).join('');
    
    countBadge.textContent = uuids.length;
}

// Copy single UUID
function copySingle(index) {
    navigator.clipboard.writeText(uuids[index]);
    showToast('Copied!');
}

// Copy all UUIDs
function copyAll() {
    if (uuids.length === 0) {
        showToast('Nothing to copy');
        return;
    }
    navigator.clipboard.writeText(uuids.join('\n'));
    showToast('All UUIDs copied!');
}

// Clear
function clearAll() {
    uuids = [];
    renderOutput();
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
copyAllBtn.addEventListener('click', copyAll);
clearBtn.addEventListener('click', clearAll);

// Auto-generate on load
generate();
