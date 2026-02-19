document.addEventListener('DOMContentLoaded', () => {
    const bpmValue = document.getElementById('bpm-value');
    const tempoSlider = document.getElementById('tempo-slider');
    const playBtn = document.getElementById('play-btn');
    const playIcon = document.getElementById('play-icon');
    const tapBtn = document.getElementById('tap-btn');
    const beatIndicator = document.getElementById('beat-indicator');
    const beatButtons = document.querySelectorAll('.beat-btn');
    const soundButtons = document.querySelectorAll('.sound-btn');
    const volumeSlider = document.getElementById('volume-slider');

    let bpm = 120;
    let isPlaying = false;
    let currentBeat = 0;
    let beatsPerMeasure = 4;
    let soundType = 'click';
    let volume = 0.7;
    let intervalId = null;
    let audioContext = null;

    // Tap tempo
    let tapTimes = [];
    const TAP_TIMEOUT = 2000;
    let lastTapTime = 0;

    // Initialize audio context on first interaction
    function initAudio() {
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        // Resume audio context if suspended
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
    }

    // Sound generation
    function playSound(isAccent = false) {
        if (!audioContext) return;

        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        const now = audioContext.currentTime;
        
        switch(soundType) {
            case 'click':
                oscillator.type = 'square';
                oscillator.frequency.setValueAtTime(isAccent ? 1200 : 800, now);
                break;
            case 'beep':
                oscillator.type = 'sine';
                oscillator.frequency.setValueAtTime(isAccent ? 880 : 440, now);
                break;
        }

        const vol = isAccent ? volume : volume * 0.7;
        gainNode.gain.setValueAtTime(vol, now);
        gainNode.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        oscillator.start(now);
        oscillator.stop(now + 0.1);
    }

    function createBeatDots() {
        // Clear existing dots
        beatIndicator.innerHTML = '';
        
        // Create dots based on beats per measure
        for (let i = 0; i < beatsPerMeasure; i++) {
            const dot = document.createElement('div');
            dot.className = 'beat-dot';
            dot.dataset.beat = i + 1;
            beatIndicator.appendChild(dot);
        }
    }

    function updateBeatIndicator() {
        const dots = beatIndicator.querySelectorAll('.beat-dot');
        
        // Remove all active/accent classes
        dots.forEach(dot => dot.classList.remove('active', 'accent'));

        // Highlight current beat
        if (isPlaying && dots[currentBeat]) {
            dots[currentBeat].classList.add('active');
            if (currentBeat === 0) {
                dots[currentBeat].classList.add('accent');
            }
        }
    }

    function tick() {
        playSound(currentBeat === 0);
        updateBeatIndicator();
        currentBeat = (currentBeat + 1) % beatsPerMeasure;
    }

    function startMetronome() {
        initAudio();
        isPlaying = true;
        currentBeat = 0;
        playIcon.textContent = '❚❚';
        playBtn.classList.add('playing');
        
        tick();
        const intervalMs = 60000 / bpm;
        intervalId = setInterval(tick, intervalMs);
    }

    function stopMetronome() {
        isPlaying = false;
        playIcon.textContent = '▶';
        playBtn.classList.remove('playing');
        
        if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
        }
        
        // Clear beat indicator
        const dots = beatIndicator.querySelectorAll('.beat-dot');
        dots.forEach(dot => dot.classList.remove('active', 'accent'));
    }

    function updateBPM(newBpm) {
        bpm = Math.max(20, Math.min(300, newBpm));
        bpmValue.textContent = Math.round(bpm);
        tempoSlider.value = bpm;
        
        if (isPlaying) {
            stopMetronome();
            startMetronome();
        }
    }

    // Event listeners
    playBtn.addEventListener('click', () => {
        if (isPlaying) {
            stopMetronome();
        } else {
            startMetronome();
        }
    });

    tempoSlider.addEventListener('input', (e) => {
        updateBPM(parseInt(e.target.value));
    });

    tapBtn.addEventListener('click', () => {
        initAudio();
        const now = Date.now();
        
        // Reset if too much time has passed since last tap
        if (now - lastTapTime > TAP_TIMEOUT) {
            tapTimes = [];
        }
        
        tapTimes.push(now);
        lastTapTime = now;
        
        // Need at least 2 taps to calculate BPM
        if (tapTimes.length > 1) {
            const intervals = [];
            for (let i = 1; i < tapTimes.length; i++) {
                intervals.push(tapTimes[i] - tapTimes[i-1]);
            }
            const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
            const newBpm = 60000 / avgInterval;
            updateBPM(newBpm);
        }
        
        // Keep only last 8 taps
        if (tapTimes.length > 8) {
            tapTimes.shift();
        }
        
        // Visual feedback
        tapBtn.style.background = 'rgba(0, 217, 255, 0.3)';
        tapBtn.style.borderColor = '#00d9ff';
        setTimeout(() => {
            tapBtn.style.background = '';
            tapBtn.style.borderColor = '';
        }, 100);
    });

    beatButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            beatButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            beatsPerMeasure = parseInt(btn.dataset.beats);
            currentBeat = 0;
            createBeatDots();
            updateBeatIndicator();
        });
    });

    soundButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            soundButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            soundType = btn.dataset.sound;
        });
    });

    volumeSlider.addEventListener('input', (e) => {
        volume = e.target.value / 100;
    });

    // Initialize beat indicator
    createBeatDots();
    updateBeatIndicator();
});