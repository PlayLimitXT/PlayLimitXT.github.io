document.addEventListener('DOMContentLoaded', () => {
    const passwordOutput = document.getElementById('password-output');
    const copyBtn = document.getElementById('copy-btn');
    const strengthBar = document.getElementById('strength-bar');
    const strengthText = document.getElementById('strength-text');
    const lengthSlider = document.getElementById('length-slider');
    const lengthValue = document.getElementById('length-value');
    const uppercaseCb = document.getElementById('uppercase');
    const lowercaseCb = document.getElementById('lowercase');
    const numbersCb = document.getElementById('numbers');
    const symbolsCb = document.getElementById('symbols');
    const generateBtn = document.getElementById('generate-btn');
    const historyList = document.getElementById('history-list');

    const charSets = {
        uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        lowercase: 'abcdefghijklmnopqrstuvwxyz',
        numbers: '0123456789',
        symbols: '!@#$%^&*()_+-=[]{}|;:,.<>?'
    };

    // Common passwords/patterns for weakness check
    const commonPatterns = [
        'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', 'master',
        'dragon', '111111', 'baseball', 'iloveyou', 'trustno1', 'sunshine',
        'princess', 'welcome', 'shadow', 'superman', 'michael', 'football'
    ];

    let history = [];

    // Generate password on load
    generatePassword();

    lengthSlider.addEventListener('input', () => {
        lengthValue.textContent = lengthSlider.value;
        generatePassword();
    });

    [uppercaseCb, lowercaseCb, numbersCb, symbolsCb].forEach(cb => {
        cb.addEventListener('change', generatePassword);
    });

    generateBtn.addEventListener('click', generatePassword);

    function generatePassword() {
        let chars = '';
        if (uppercaseCb.checked) chars += charSets.uppercase;
        if (lowercaseCb.checked) chars += charSets.lowercase;
        if (numbersCb.checked) chars += charSets.numbers;
        if (symbolsCb.checked) chars += charSets.symbols;

        if (!chars) {
            passwordOutput.value = 'Select at least one option';
            updateStrength(0, 'No options selected', 0);
            return;
        }

        const length = parseInt(lengthSlider.value);
        let password = '';

        // Ensure at least one character from each selected set
        const selectedSets = [];
        if (uppercaseCb.checked) selectedSets.push(charSets.uppercase);
        if (lowercaseCb.checked) selectedSets.push(charSets.lowercase);
        if (numbersCb.checked) selectedSets.push(charSets.numbers);
        if (symbolsCb.checked) selectedSets.push(charSets.symbols);

        for (let i = 0; i < selectedSets.length && i < length; i++) {
            const set = selectedSets[i];
            password += set[Math.floor(Math.random() * set.length)];
        }

        // Fill the rest randomly
        for (let i = password.length; i < length; i++) {
            password += chars[Math.floor(Math.random() * chars.length)];
        }

        // Shuffle password
        password = password.split('').sort(() => Math.random() - 0.5).join('');

        passwordOutput.value = password;
        
        // Calculate strength with improved algorithm
        const strengthResult = calculateStrength(password, chars.length);
        updateStrength(strengthResult.score, strengthResult.label, strengthResult.entropy);
        addToHistory(password);
    }

    function calculateStrength(password, charsetSize) {
        let score = 0;
        let entropy = 0;
        
        // Calculate entropy (bits)
        entropy = Math.log2(charsetSize) * password.length;
        
        // 1. Length Score (max 25 points)
        if (password.length >= 8) score += 10;
        if (password.length >= 12) score += 5;
        if (password.length >= 16) score += 5;
        if (password.length >= 20) score += 5;
        
        // 2. Character Variety (max 30 points)
        let variety = 0;
        if (/[a-z]/.test(password)) variety += 1;
        if (/[A-Z]/.test(password)) variety += 1;
        if (/[0-9]/.test(password)) variety += 1;
        if (/[^a-zA-Z0-9]/.test(password)) variety += 1;
        score += variety * 7.5;
        
        // 3. Entropy Bonus (max 25 points)
        if (entropy >= 30) score += 5;
        if (entropy >= 50) score += 5;
        if (entropy >= 70) score += 5;
        if (entropy >= 100) score += 10;
        
        // 4. Pattern Penalties
        const lowerPassword = password.toLowerCase();
        
        // Check for common patterns
        for (const pattern of commonPatterns) {
            if (lowerPassword.includes(pattern)) {
                score -= 20;
                break;
            }
        }
        
        // Check for sequential characters
        if (/(.)\1{2,}/.test(password)) score -= 10; // Repeated chars
        if (/(?:abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz)/i.test(password)) score -= 10;
        if (/(?:012|123|234|345|456|567|678|789)/.test(password)) score -= 10;
        if (/(?:qwe|wer|ert|rty|tyu|yui|uio|iop|asd|sdf|dfg|fgh|ghj|hjk|jkl|zxc|xcv|cvb|vbn|bnm)/i.test(password)) score -= 10;
        
        // Ensure score is between 0-100
        score = Math.max(0, Math.min(100, score));
        
        // Determine label
        let label;
        if (score < 20) label = 'Very Weak';
        else if (score < 40) label = 'Weak';
        else if (score < 60) label = 'Fair';
        else if (score < 80) label = 'Good';
        else if (score < 90) label = 'Strong';
        else label = 'Excellent';
        
        return { score, label, entropy: Math.round(entropy) };
    }

    function updateStrength(score, label, entropy) {
        strengthBar.style.setProperty('--strength', `${score}%`);
        
        let color;
        if (score < 20) {
            color = '#ff4757';
        } else if (score < 40) {
            color = '#ff6b81';
        } else if (score < 60) {
            color = '#ffa502';
        } else if (score < 80) {
            color = '#2ed573';
        } else if (score < 90) {
            color = '#00d9ff';
        } else {
            color = '#00ff88';
        }
        
        strengthBar.style.setProperty('--strength-color', color);
        strengthText.textContent = `${label} (${score}%) - Entropy: ${entropy} bits`;
        strengthText.style.color = color;
    }

    function addToHistory(password) {
        // Remove if already exists
        history = history.filter(p => p !== password);
        history.unshift(password);
        history = history.slice(0, 5); // Keep only last 5
        renderHistory();
    }

    function renderHistory() {
        historyList.innerHTML = history.map(p => 
            `<div class="history-item" data-password="${p}">${p.substring(0, 24)}${p.length > 24 ? '...' : ''}</div>`
        ).join('');

        historyList.querySelectorAll('.history-item').forEach(item => {
            item.addEventListener('click', () => {
                navigator.clipboard.writeText(item.dataset.password);
                item.style.background = 'rgba(0, 255, 136, 0.2)';
                setTimeout(() => {
                    item.style.background = '';
                }, 500);
            });
        });
    }

    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(passwordOutput.value);
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
        setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`;
        }, 1500);
    });
});