// DOM Elements
const textInput = document.getElementById('text-input');
const charCount = document.getElementById('char-count');
const charNoSpace = document.getElementById('char-no-space');
const wordCount = document.getElementById('word-count');
const sentenceCount = document.getElementById('sentence-count');
const paragraphCount = document.getElementById('paragraph-count');
const readingTime = document.getElementById('reading-time');
const speakingTime = document.getElementById('speaking-time');
const avgWordLength = document.getElementById('avg-word-length');
const avgSentenceLength = document.getElementById('avg-sentence-length');
const longestWord = document.getElementById('longest-word');
const copyBtn = document.getElementById('copy-btn');
const clearBtn = document.getElementById('clear-btn');

// Calculate statistics
function calculateStats() {
    const text = textInput.value;
    
    // Characters
    const chars = text.length;
    const charsNoSpace = text.replace(/\s/g, '').length;
    
    // Words
    const words = text.trim() === '' ? [] : text.trim().split(/\s+/).filter(w => w.length > 0);
    const wordNum = words.length;
    
    // Sentences
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const sentenceNum = sentences.length;
    
    // Paragraphs
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);
    const paragraphNum = paragraphs.length;
    
    // Reading time (200 words per minute)
    const readMin = Math.ceil(wordNum / 200);
    
    // Speaking time (150 words per minute)
    const speakMin = Math.ceil(wordNum / 150);
    
    // Average word length
    const avgWordLen = wordNum > 0 
        ? (words.reduce((sum, w) => sum + w.replace(/[^a-zA-Z]/g, '').length, 0) / wordNum).toFixed(1)
        : 0;
    
    // Average sentence length
    const avgSentLen = sentenceNum > 0 
        ? (wordNum / sentenceNum).toFixed(1)
        : 0;
    
    // Longest word
    let longest = '-';
    if (words.length > 0) {
        longest = words.reduce((a, b) => 
            a.replace(/[^a-zA-Z]/g, '').length >= b.replace(/[^a-zA-Z]/g, '').length ? a : b
        );
        if (longest.length > 20) longest = longest.substring(0, 20) + '...';
    }
    
    // Update display
    charCount.textContent = chars;
    charNoSpace.textContent = charsNoSpace;
    wordCount.textContent = wordNum;
    sentenceCount.textContent = sentenceNum;
    paragraphCount.textContent = paragraphNum;
    readingTime.textContent = readMin + ' min';
    speakingTime.textContent = speakMin + ' min';
    avgWordLength.textContent = avgWordLen;
    avgSentenceLength.textContent = avgSentLen;
    longestWord.textContent = longest;
}

// Copy text
function copyText() {
    if (textInput.value.trim() === '') {
        showToast('Nothing to copy');
        return;
    }
    navigator.clipboard.writeText(textInput.value);
    showToast('Copied to clipboard!');
}

// Clear text
function clearText() {
    textInput.value = '';
    calculateStats();
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
textInput.addEventListener('input', calculateStats);
copyBtn.addEventListener('click', copyText);
clearBtn.addEventListener('click', clearText);

// Initial calculation
calculateStats();
