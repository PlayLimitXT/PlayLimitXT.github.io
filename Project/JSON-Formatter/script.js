// DOM Elements
const inputEditor = document.getElementById('input-editor');
const outputEditor = document.getElementById('output-editor');
const indentSelect = document.getElementById('indent-select');
const formatBtn = document.getElementById('format-btn');
const minifyBtn = document.getElementById('minify-btn');
const copyBtn = document.getElementById('copy-btn');
const clearBtn = document.getElementById('clear-btn');
const inputStatus = document.getElementById('input-status');
const outputStatus = document.getElementById('output-status');
const errorPanel = document.getElementById('error-panel');
const errorMessage = document.getElementById('error-message');
const jsonSize = document.getElementById('json-size');
const jsonDepth = document.getElementById('json-depth');
const jsonKeys = document.getElementById('json-keys');
const jsonValues = document.getElementById('json-values');

// Format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Get JSON depth
function getJsonDepth(obj, depth = 0) {
    if (typeof obj !== 'object' || obj === null) return depth;
    const values = Array.isArray(obj) ? obj : Object.values(obj);
    if (values.length === 0) return depth + 1;
    return Math.max(...values.map(v => getJsonDepth(v, depth + 1)));
}

// Count keys
function countKeys(obj) {
    if (typeof obj !== 'object' || obj === null) return 0;
    let count = Array.isArray(obj) ? 0 : Object.keys(obj).length;
    const values = Array.isArray(obj) ? obj : Object.values(obj);
    for (const v of values) {
        count += countKeys(v);
    }
    return count;
}

// Count values
function countValues(obj) {
    if (typeof obj !== 'object' || obj === null) return 1;
    const values = Array.isArray(obj) ? obj : Object.values(obj);
    return values.reduce((sum, v) => sum + countValues(v), 0);
}

// Syntax highlighting
function highlightJson(json) {
    return json
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?)/g, match => {
            if (match.endsWith(':')) {
                return '<span class="json-key">' + match + '</span>';
            }
            return '<span class="json-string">' + match + '</span>';
        })
        .replace(/\b(true|false)\b/g, '<span class="json-boolean">$1</span>')
        .replace(/\bnull\b/g, '<span class="json-null">null</span>')
        .replace(/\b(-?\d+\.?\d*([eE][+-]?\d+)?)\b/g, '<span class="json-number">$1</span>')
        .replace(/([{}\[\]])/g, '<span class="json-bracket">$1</span>');
}

// Show error
function showError(msg) {
    errorMessage.textContent = msg;
    errorPanel.classList.add('show');
    outputStatus.innerHTML = '<i class="fas fa-times-circle"></i> Invalid JSON';
    outputStatus.className = 'status invalid';
}

// Hide error
function hideError() {
    errorPanel.classList.remove('show');
    outputStatus.innerHTML = '<i class="fas fa-check-circle"></i> Valid JSON';
    outputStatus.className = 'status valid';
}

// Show toast
function showToast(message, type = 'default') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<i class="fas fa-check-circle"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Format JSON
function formatJson() {
    const input = inputEditor.value.trim();

    if (!input) {
        outputEditor.innerHTML = '<span style="color: var(--text-muted);">Output will appear here...</span>';
        hideError();
        updateStats('');
        return;
    }

    try {
        const parsed = JSON.parse(input);
        const indent = indentSelect.value === 'tab' ? '\t' : parseInt(indentSelect.value);
        const formatted = JSON.stringify(parsed, null, indent);

        outputEditor.innerHTML = highlightJson(formatted);
        hideError();
        updateStats(input, parsed);
    } catch (e) {
        showError(`Parse error: ${e.message}`);
        outputEditor.innerHTML = '<span style="color: var(--error);">Invalid JSON - cannot format</span>';
        updateStats('');
    }
}

// Minify JSON
function minifyJson() {
    const input = inputEditor.value.trim();

    if (!input) {
        showToast('Nothing to minify');
        return;
    }

    try {
        const parsed = JSON.parse(input);
        const minified = JSON.stringify(parsed);
        inputEditor.value = minified;
        formatJson();
        showToast('JSON minified', 'success');
    } catch (e) {
        showError(`Parse error: ${e.message}`);
    }
}

// Copy to clipboard
async function copyToClipboard() {
    const input = inputEditor.value.trim();

    if (!input) {
        showToast('Nothing to copy');
        return;
    }

    try {
        await navigator.clipboard.writeText(outputEditor.textContent || input);
        showToast('Copied to clipboard', 'success');
    } catch (e) {
        showToast('Failed to copy');
    }
}

// Clear
function clearAll() {
    inputEditor.value = '';
    outputEditor.innerHTML = '<span style="color: var(--text-muted);">Output will appear here...</span>';
    hideError();
    updateStats('');
}

// Update stats
function updateStats(input, parsed = null) {
    jsonSize.textContent = formatBytes(new Blob([input]).size);

    if (parsed) {
        jsonDepth.textContent = getJsonDepth(parsed);
        jsonKeys.textContent = countKeys(parsed);
        jsonValues.textContent = countValues(parsed);
    } else {
        jsonDepth.textContent = '0';
        jsonKeys.textContent = '0';
        jsonValues.textContent = '0';
    }
}

// Event listeners
formatBtn.addEventListener('click', formatJson);
minifyBtn.addEventListener('click', minifyJson);
copyBtn.addEventListener('click', copyToClipboard);
clearBtn.addEventListener('click', clearAll);
indentSelect.addEventListener('change', formatJson);

// Auto-format on paste
inputEditor.addEventListener('paste', () => {
    setTimeout(formatJson, 10);
});

// Initial state
formatJson();
