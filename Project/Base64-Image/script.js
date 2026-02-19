// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const imagePreviewPanel = document.getElementById('image-preview-panel');
const imagePreview = document.getElementById('image-preview');
const imageInfo = document.getElementById('image-info');
const clearImageBtn = document.getElementById('clear-image');
const base64OutputPanel = document.getElementById('base64-output-panel');
const base64Output = document.getElementById('base64-output');
const includePrefix = document.getElementById('include-prefix');
const copyBase64Btn = document.getElementById('copy-base64');
const downloadBase64Btn = document.getElementById('download-base64');
const base64Input = document.getElementById('base64-input');
const pasteBase64Btn = document.getElementById('paste-base64');
const convertToImageBtn = document.getElementById('convert-to-image');
const decodedImagePanel = document.getElementById('decoded-image-panel');
const decodedImage = document.getElementById('decoded-image');
const decodedSize = document.getElementById('decoded-size');
const downloadImageBtn = document.getElementById('download-image');
const downloadFormat = document.getElementById('download-format');

let currentBase64 = '';
let currentImageData = '';

// Tab switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
    });
});

// Upload area events
uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('dragover');
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
        processImage(file);
    } else {
        showToast('Please drop an image file', true);
    }
});

fileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) processImage(file);
});

// Process image to Base64
function processImage(file) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        currentBase64 = e.target.result;
        currentImageData = currentBase64;
        
        // Show preview
        imagePreview.src = currentBase64;
        imagePreviewPanel.classList.remove('hidden');
        
        // Show info
        const img = new Image();
        img.onload = () => {
            imageInfo.innerHTML = `
                <span><i class="fas fa-expand"></i> ${img.width} × ${img.height}</span>
                <span><i class="fas fa-file"></i> ${formatBytes(file.size)}</span>
                <span><i class="fas fa-image"></i> ${file.type.split('/')[1].toUpperCase()}</span>
            `;
        };
        img.src = currentBase64;
        
        // Generate Base64 output
        updateBase64Output();
        base64OutputPanel.classList.remove('hidden');
    };
    
    reader.readAsDataURL(file);
}

// Update Base64 output based on prefix checkbox
function updateBase64Output() {
    if (includePrefix.checked) {
        base64Output.value = currentBase64;
    } else {
        base64Output.value = currentBase64.split(',')[1] || currentBase64;
    }
}

includePrefix.addEventListener('change', updateBase64Output);

// Clear image
clearImageBtn.addEventListener('click', () => {
    fileInput.value = '';
    currentBase64 = '';
    currentImageData = '';
    imagePreviewPanel.classList.add('hidden');
    base64OutputPanel.classList.add('hidden');
    uploadArea.classList.remove('hidden');
});

// Copy Base64
copyBase64Btn.addEventListener('click', () => {
    navigator.clipboard.writeText(base64Output.value);
    showToast('Copied to clipboard!');
});

// Download Base64 as text
downloadBase64Btn.addEventListener('click', () => {
    const blob = new Blob([base64Output.value], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'image-base64.txt';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Downloaded!');
});

// Paste Base64
pasteBase64Btn.addEventListener('click', async () => {
    try {
        const text = await navigator.clipboard.readText();
        base64Input.value = text;
        showToast('Pasted!');
    } catch {
        showToast('Unable to paste', true);
    }
});

// Convert Base64 to Image
convertToImageBtn.addEventListener('click', () => {
    let base64 = base64Input.value.trim();
    
    if (!base64) {
        showToast('Please enter a Base64 string', true);
        return;
    }
    
    // Add prefix if missing
    if (!base64.startsWith('data:image')) {
        base64 = 'data:image/png;base64,' + base64;
    }
    
    // Validate and display
    const img = new Image();
    img.onload = () => {
        decodedImage.src = base64;
        decodedSize.textContent = `${img.width} × ${img.height}`;
        decodedImagePanel.classList.remove('hidden');
        showToast('Image decoded!');
    };
    img.onerror = () => {
        showToast('Invalid Base64 image data', true);
    };
    img.src = base64;
    currentImageData = base64;
});

// Download decoded image
downloadImageBtn.addEventListener('click', () => {
    if (!currentImageData) {
        showToast('No image to download', true);
        return;
    }
    
    const format = downloadFormat.value;
    const link = document.createElement('a');
    
    // Convert to selected format if needed
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = decodedImage;
    
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    
    link.download = `decoded-image.${format}`;
    link.href = canvas.toDataURL(`image/${format}`);
    link.click();
    showToast('Image downloaded!');
});

// Format bytes
function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

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
