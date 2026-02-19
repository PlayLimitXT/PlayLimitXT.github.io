document.addEventListener('DOMContentLoaded', () => {
    const colorPreview = document.getElementById('color-preview');
    const nativePicker = document.getElementById('native-picker');
    const hexInput = document.getElementById('hex-value');
    const rgbInput = document.getElementById('rgb-value');
    const hslInput = document.getElementById('hsl-value');
    const rSlider = document.getElementById('r-slider');
    const gSlider = document.getElementById('g-slider');
    const bSlider = document.getElementById('b-slider');
    const rValue = document.getElementById('r-value');
    const gValue = document.getElementById('g-value');
    const bValue = document.getElementById('b-value');
    const palette = document.getElementById('palette');
    const addColorBtn = document.getElementById('add-color');

    let savedColors = JSON.parse(localStorage.getItem('savedColors') || '[]');

    function updateColor(hex) {
        const rgb = hexToRgb(hex);
        const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);

        // Update preview
        colorPreview.style.background = hex;
        colorPreview.style.boxShadow = `0 20px 60px ${hex}66`;

        // Update values
        hexInput.value = hex.toUpperCase();
        rgbInput.value = `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
        hslInput.value = `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;

        // Update sliders
        rSlider.value = rgb.r;
        gSlider.value = rgb.g;
        bSlider.value = rgb.b;
        rValue.textContent = rgb.r;
        gValue.textContent = rgb.g;
        bValue.textContent = rgb.b;

        nativePicker.value = hex;
    }

    function hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : null;
    }

    function rgbToHex(r, g, b) {
        return '#' + [r, g, b].map(x => {
            const hex = x.toString(16);
            return hex.length === 1 ? '0' + hex : hex;
        }).join('');
    }

    function rgbToHsl(r, g, b) {
        r /= 255; g /= 255; b /= 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b);
        let h, s, l = (max + min) / 2;

        if (max === min) {
            h = s = 0;
        } else {
            const d = max - min;
            s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
            switch (max) {
                case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
                case g: h = ((b - r) / d + 2) / 6; break;
                case b: h = ((r - g) / d + 4) / 6; break;
            }
        }

        return {
            h: Math.round(h * 360),
            s: Math.round(s * 100),
            l: Math.round(l * 100)
        };
    }

    // Native picker change
    nativePicker.addEventListener('input', (e) => {
        updateColor(e.target.value);
    });

    // Slider changes
    [rSlider, gSlider, bSlider].forEach(slider => {
        slider.addEventListener('input', () => {
            const hex = rgbToHex(
                parseInt(rSlider.value),
                parseInt(gSlider.value),
                parseInt(bSlider.value)
            );
            updateColor(hex);
        });
    });

    // Copy buttons
    document.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = document.getElementById(btn.dataset.target);
            navigator.clipboard.writeText(target.value);
            btn.textContent = 'Copied!';
            btn.classList.add('copied');
            setTimeout(() => {
                btn.textContent = 'Copy';
                btn.classList.remove('copied');
            }, 1500);
        });
    });

    // Save color
    addColorBtn.addEventListener('click', () => {
        const hex = hexInput.value;
        if (!savedColors.includes(hex)) {
            savedColors.push(hex);
            localStorage.setItem('savedColors', JSON.stringify(savedColors));
            renderPalette();
        }
    });

    function renderPalette() {
        const colors = palette.querySelectorAll('.palette-color');
        colors.forEach(c => c.remove());
        
        savedColors.forEach((color, index) => {
            const div = document.createElement('div');
            div.className = 'palette-color';
            div.style.background = color;
            div.title = color;
            div.addEventListener('click', () => updateColor(color));
            div.addEventListener('contextmenu', (e) => {
                e.preventDefault();
                savedColors.splice(index, 1);
                localStorage.setItem('savedColors', JSON.stringify(savedColors));
                renderPalette();
            });
            palette.insertBefore(div, addColorBtn);
        });
    }

    renderPalette();
});
