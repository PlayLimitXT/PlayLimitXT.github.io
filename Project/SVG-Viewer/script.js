// DOM Elements
const svgInput = document.getElementById('svg-input');
const previewArea = document.getElementById('preview-area');
const fileInput = document.getElementById('file-input');
const clearBtn = document.getElementById('clear-btn');
const zoomIn = document.getElementById('zoom-in');
const zoomOut = document.getElementById('zoom-out');
const zoomLevel = document.getElementById('zoom-level');
const downloadBtn = document.getElementById('download-btn');
const svgSize = document.getElementById('svg-size');
const codeSize = document.getElementById('code-size');
const elementCount = document.getElementById('element-count');
const colorCount = document.getElementById('color-count');

let currentZoom = 100;
let currentSvg = null;

// Render SVG
function renderSvg() {
    const code = svgInput.value.trim();
    
    if (!code) {
        previewArea.innerHTML = `
            <div class="placeholder">
                <i class="fas fa-file-image"></i>
                <p>SVG preview will appear here</p>
            </div>
        `;
        updateStats('', null);
        currentSvg = null;
        return;
    }

    // Validate SVG
    if (!code.includes('<svg')) {
        previewArea.innerHTML = `
            <div class="placeholder" style="color: var(--error);">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Invalid SVG code</p>
            </div>
        `;
        showToast('Invalid SVG code', true);
        return;
    }

    try {
        // Parse and display SVG
        previewArea.innerHTML = code;
        currentSvg = previewArea.querySelector('svg');
        
        if (currentSvg) {
            // Ensure SVG is visible
            currentSvg.style.maxWidth = '100%';
            currentSvg.style.maxHeight = '300px';
            currentSvg.style.width = 'auto';
            currentSvg.style.height = 'auto';
            
            updateStats(code, currentSvg);
            showToast('SVG loaded successfully');
        }
    } catch (e) {
        previewArea.innerHTML = `
            <div class="placeholder" style="color: var(--error);">
                <i class="fas fa-exclamation-triangle"></i>
                <p>Error parsing SVG</p>
            </div>
        `;
        showToast('Error parsing SVG', true);
    }
}

// Update statistics
function updateStats(code, svg) {
    // Code size
    const size = new Blob([code]).size;
    codeSize.textContent = formatBytes(size);

    if (!svg) {
        svgSize.textContent = '-';
        elementCount.textContent = '0';
        colorCount.textContent = '0';
        return;
    }

    // SVG dimensions
    const bbox = svg.getBBox ? svg.getBBox() : { width: 0, height: 0 };
    const viewBox = svg.getAttribute('viewBox');
    let width = svg.getAttribute('width') || (viewBox ? viewBox.split(' ')[2] : bbox.width);
    let height = svg.getAttribute('height') || (viewBox ? viewBox.split(' ')[3] : bbox.height);
    
    width = parseInt(width) || bbox.width || 0;
    height = parseInt(height) || bbox.height || 0;
    
    svgSize.textContent = `${width} × ${height}`;

    // Element count
    const elements = svg.querySelectorAll('*');
    elementCount.textContent = elements.length;

    // Color count
    const colors = new Set();
    const styleAttrs = ['fill', 'stroke', 'color', 'stop-color'];
    
    elements.forEach(el => {
        styleAttrs.forEach(attr => {
            const val = el.getAttribute(attr);
            if (val && val !== 'none' && val !== 'transparent') {
                colors.add(val);
            }
        });
        
        const style = el.getAttribute('style');
        if (style) {
            const matches = style.match(/(fill|stroke|color):\s*([^;]+)/g);
            if (matches) {
                matches.forEach(m => {
                    const color = m.split(':')[1].trim();
                    if (color && color !== 'none' && color !== 'transparent') {
                        colors.add(color);
                    }
                });
            }
        }
    });
    
    colorCount.textContent = colors.size;
}

// Format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

// File upload
fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        svgInput.value = event.target.result;
        renderSvg();
    };
    reader.readAsText(file);
});

// Clear
clearBtn.addEventListener('click', () => {
    svgInput.value = '';
    currentZoom = 100;
    updateZoom();
    renderSvg();
});

// Zoom
function updateZoom() {
    zoomLevel.textContent = currentZoom + '%';
    if (currentSvg) {
        currentSvg.style.transform = `scale(${currentZoom / 100})`;
    }
}

zoomIn.addEventListener('click', () => {
    if (currentZoom < 200) {
        currentZoom += 25;
        updateZoom();
    }
});

zoomOut.addEventListener('click', () => {
    if (currentZoom > 25) {
        currentZoom -= 25;
        updateZoom();
    }
});

// Download
downloadBtn.addEventListener('click', () => {
    const code = svgInput.value.trim();
    if (!code) {
        showToast('No SVG to download', true);
        return;
    }

    const blob = new Blob([code], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'image.svg';
    a.click();
    URL.revokeObjectURL(url);
    showToast('SVG downloaded');
});

// Show toast
function showToast(message, isError = false) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = `toast ${isError ? 'error' : ''}`;
    toast.innerHTML = `<i class="fas fa-${isError ? 'exclamation' : 'check'}-circle"></i> ${message}`;
    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 2000);
}

// Event listeners
svgInput.addEventListener('input', renderSvg);

// Paste support
document.addEventListener('paste', (e) => {
    if (document.activeElement === svgInput) return;
    
    const text = e.clipboardData.getData('text');
    if (text && text.includes('<svg')) {
        svgInput.value = text;
        renderSvg();
        e.preventDefault();
    }
});

// Initial state
renderSvg();