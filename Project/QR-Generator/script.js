document.addEventListener('DOMContentLoaded', () => {
    const textInput = document.getElementById('text-input');
    const generateBtn = document.getElementById('generate-btn');
    const qrContainer = document.getElementById('qrcode');
    const downloadBtn = document.getElementById('download-btn');
    const sizeSelect = document.getElementById('size-select');
    const fgColorPicker = document.getElementById('fg-color');
    const bgColorPicker = document.getElementById('bg-color');
    const statusMessage = document.getElementById('status-message');

    let currentQRCode = null;

    function showStatus(message, isError = false) {
        statusMessage.textContent = message;
        statusMessage.className = 'status-message ' + (isError ? 'error' : 'success');
        statusMessage.style.display = 'block';
        setTimeout(() => {
            statusMessage.style.display = 'none';
        }, 3000);
    }

    function generateQR() {
        const text = textInput.value.trim();
        
        if (!text) {
            showStatus('Please enter text or URL', true);
            return;
        }

        // Clear previous QR code
        qrContainer.innerHTML = '';
        downloadBtn.style.display = 'none';

        try {
            const size = parseInt(sizeSelect.value);
            
            currentQRCode = new QRCode(qrContainer, {
                text: text,
                width: size,
                height: size,
                colorDark: fgColorPicker.value,
                colorLight: bgColorPicker.value,
                correctLevel: QRCode.CorrectLevel.M
            });

            downloadBtn.style.display = 'flex';
            showStatus('QR Code generated successfully!');
        } catch (e) {
            console.error(e);
            showStatus('Error generating QR code', true);
        }
    }

    function downloadQR() {
        const canvas = qrContainer.querySelector('canvas');
        if (!canvas) return;

        const link = document.createElement('a');
        link.download = 'qrcode.png';
        link.href = canvas.toDataURL('image/png');
        link.click();
    }

    // Event listeners
    generateBtn.addEventListener('click', generateQR);
    
    textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            generateQR();
        }
    });

    downloadBtn.addEventListener('click', downloadQR);

    sizeSelect.addEventListener('change', () => {
        if (textInput.value.trim()) generateQR();
    });

    fgColorPicker.addEventListener('input', () => {
        if (textInput.value.trim()) generateQR();
    });

    bgColorPicker.addEventListener('input', () => {
        if (textInput.value.trim()) generateQR();
    });

    // Generate initial QR
    textInput.value = 'https://PlayLimitXT.github.io';
    generateQR();
});
