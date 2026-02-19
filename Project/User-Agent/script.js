// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const uaInput = document.getElementById('ua-input');
const parseBtn = document.getElementById('parse-btn');
const useMyUABtn = document.getElementById('use-my-ua');
const parseResult = document.getElementById('parse-result');
const copyUABtn = document.getElementById('copy-ua');
const genBrowser = document.getElementById('gen-browser');
const genOs = document.getElementById('gen-os');
const genDevice = document.getElementById('gen-device');
const generateBtn = document.getElementById('generate-btn');
const generatedUA = document.getElementById('generated-ua');
const copyGeneratedBtn = document.getElementById('copy-generated');
const testGeneratedBtn = document.getElementById('test-generated');
const presetsGrid = document.getElementById('presets-grid');

// User Agent Database
const uaDatabase = {
    chrome: {
        windows: {
            desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        mac: {
            desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        linux: {
            desktop: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        android: {
            mobile: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
            tablet: 'Mozilla/5.0 (Linux; Android 14; Pixel Tablet) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        ios: {
            mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1',
            tablet: 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1'
        }
    },
    firefox: {
        windows: {
            desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
        },
        mac: {
            desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0'
        },
        linux: {
            desktop: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0'
        },
        android: {
            mobile: 'Mozilla/5.0 (Android 14; Mobile; rv:121.0) Gecko/121.0 Firefox/121.0',
            tablet: 'Mozilla/5.0 (Android 14; Tablet; rv:121.0) Gecko/121.0 Firefox/121.0'
        },
        ios: {
            mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/121.0 Mobile/15E148 Safari/605.1.15',
            tablet: 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/121.0 Mobile/15E148 Safari/605.1.15'
        }
    },
    safari: {
        mac: {
            desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
        },
        ios: {
            mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
            tablet: 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1'
        }
    },
    edge: {
        windows: {
            desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
        },
        mac: {
            desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
        },
        android: {
            mobile: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 EdgA/120.0.0.0'
        },
        ios: {
            mobile: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 EdgiOS/120.0.0.0 Mobile/15E148 Safari/605.1.15'
        }
    },
    opera: {
        windows: {
            desktop: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0'
        },
        mac: {
            desktop: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0'
        },
        android: {
            mobile: 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36 OPR/73.0.0.0'
        }
    }
};

// Presets
const presets = [
    { name: 'Chrome Windows', browser: 'chrome', os: 'windows', device: 'desktop' },
    { name: 'Chrome Android', browser: 'chrome', os: 'android', device: 'mobile' },
    { name: 'Safari macOS', browser: 'safari', os: 'mac', device: 'desktop' },
    { name: 'Safari iOS', browser: 'safari', os: 'ios', device: 'mobile' },
    { name: 'Firefox Linux', browser: 'firefox', os: 'linux', device: 'desktop' },
    { name: 'Edge Windows', browser: 'edge', os: 'windows', device: 'desktop' },
    { name: 'Chrome iPad', browser: 'chrome', os: 'ios', device: 'tablet' },
    { name: 'Opera Windows', browser: 'opera', os: 'windows', device: 'desktop' }
];

// Tab switching
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabContents.forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(`${btn.dataset.tab}-tab`).classList.add('active');
    });
});

// Parse User Agent
function parseUA(ua) {
    const result = {
        browser: 'Unknown',
        browserVersion: '-',
        engine: '-',
        os: 'Unknown',
        osVersion: '-',
        device: '-',
        cpu: '-',
        deviceType: 'Desktop'
    };

    // Browser detection
    if (ua.includes('Firefox/')) {
        result.browser = 'Firefox';
        result.browserVersion = ua.match(/Firefox\/(\d+\.?\d*)/)?.[1] || '-';
        result.engine = 'Gecko';
    } else if (ua.includes('Edg/')) {
        result.browser = 'Edge';
        result.browserVersion = ua.match(/Edg\/(\d+\.?\d*)/)?.[1] || '-';
        result.engine = 'Blink';
    } else if (ua.includes('OPR/')) {
        result.browser = 'Opera';
        result.browserVersion = ua.match(/OPR\/(\d+\.?\d*)/)?.[1] || '-';
        result.engine = 'Blink';
    } else if (ua.includes('Chrome/')) {
        result.browser = 'Chrome';
        result.browserVersion = ua.match(/Chrome\/(\d+\.?\d*)/)?.[1] || '-';
        result.engine = 'Blink';
    } else if (ua.includes('Safari/') && !ua.includes('Chrome')) {
        result.browser = 'Safari';
        result.browserVersion = ua.match(/Version\/(\d+\.?\d*)/)?.[1] || '-';
        result.engine = 'WebKit';
    }

    // OS detection
    if (ua.includes('Windows NT 10.0')) {
        result.os = 'Windows';
        result.osVersion = '10/11';
    } else if (ua.includes('Windows NT 6.3')) {
        result.os = 'Windows';
        result.osVersion = '8.1';
    } else if (ua.includes('Mac OS X')) {
        result.os = 'macOS';
        result.osVersion = ua.match(/Mac OS X (\d+[._]\d+)/)?.[1]?.replace('_', '.') || '-';
    } else if (ua.includes('Android')) {
        result.os = 'Android';
        result.osVersion = ua.match(/Android (\d+\.?\d*)/)?.[1] || '-';
        result.deviceType = 'Mobile';
    } else if (ua.includes('iPhone') || ua.includes('iPad')) {
        result.os = 'iOS';
        result.osVersion = ua.match(/OS (\d+[._]\d+)/)?.[1]?.replace('_', '.') || '-';
        result.deviceType = ua.includes('iPad') ? 'Tablet' : 'Mobile';
    } else if (ua.includes('Linux')) {
        result.os = 'Linux';
        result.osVersion = '-';
    }

    // Device detection
    if (ua.includes('iPhone')) result.device = 'iPhone';
    else if (ua.includes('iPad')) result.device = 'iPad';
    else if (ua.includes('Pixel')) result.device = 'Google Pixel';
    else if (ua.includes('Samsung')) result.device = 'Samsung';
    else if (ua.includes('Mobile')) result.device = 'Mobile Device';
    else result.device = 'Desktop';

    // CPU detection
    if (ua.includes('x86_64') || ua.includes('Win64')) result.cpu = 'x64';
    else if (ua.includes('arm') || ua.includes('ARM')) result.cpu = 'ARM';
    else if (ua.includes('aarch64')) result.cpu = 'ARM64';
    else result.cpu = '-';

    // Device type override
    if (ua.includes('Mobile') && !ua.includes('iPad')) result.deviceType = 'Mobile';
    if (ua.includes('Tablet') || ua.includes('iPad')) result.deviceType = 'Tablet';

    return result;
}

// Parse button
parseBtn.addEventListener('click', () => {
    const ua = uaInput.value.trim();
    if (!ua) {
        showToast('Please enter a User Agent string');
        return;
    }

    const result = parseUA(ua);
    
    document.getElementById('browser-name').textContent = result.browser;
    document.getElementById('browser-version').textContent = result.browserVersion;
    document.getElementById('engine').textContent = result.engine;
    document.getElementById('os').textContent = result.os;
    document.getElementById('os-version').textContent = result.osVersion;
    document.getElementById('device').textContent = result.device;
    document.getElementById('cpu').textContent = result.cpu;
    document.getElementById('device-type').textContent = result.deviceType;

    parseResult.classList.remove('hidden');
});

// Use my UA
useMyUABtn.addEventListener('click', () => {
    uaInput.value = navigator.userAgent;
    showToast('Your UA loaded!');
});

// Copy UA
copyUABtn.addEventListener('click', () => {
    navigator.clipboard.writeText(uaInput.value);
    showToast('Copied!');
});

// Generate UA
function generateUA() {
    const browser = genBrowser.value;
    const os = genOs.value;
    const device = genDevice.value;

    if (uaDatabase[browser] && uaDatabase[browser][os] && uaDatabase[browser][os][device]) {
        return uaDatabase[browser][os][device];
    }
    
    // Fallback
    return uaDatabase.chrome.windows.desktop;
}

generateBtn.addEventListener('click', () => {
    const ua = generateUA();
    generatedUA.textContent = ua;
    showToast('UA generated!');
});

// Copy generated
copyGeneratedBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(generatedUA.textContent);
    showToast('Copied!');
});

// Test generated
testGeneratedBtn.addEventListener('click', () => {
    uaInput.value = generatedUA.textContent;
    tabBtns[0].click();
    parseBtn.click();
});

// Render presets
function renderPresets() {
    presetsGrid.innerHTML = presets.map(p => `
        <button class="preset-btn" data-browser="${p.browser}" data-os="${p.os}" data-device="${p.device}">
            <div class="preset-name">${p.name}</div>
            <div class="preset-info">${p.browser} • ${p.os}</div>
        </button>
    `).join('');

    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const browser = btn.dataset.browser;
            const os = btn.dataset.os;
            const device = btn.dataset.device;
            
            if (uaDatabase[browser] && uaDatabase[browser][os] && uaDatabase[browser][os][device]) {
                uaInput.value = uaDatabase[browser][os][device];
                tabBtns[0].click();
                parseBtn.click();
            }
        });
    });
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

// Initialize
renderPresets();
generatedUA.textContent = generateUA();
