// DOM Elements
const hoursEl = document.getElementById('hours');
const minutesEl = document.getElementById('minutes');
const secondsEl = document.getElementById('seconds');
const millisecondsEl = document.getElementById('milliseconds');
const startBtn = document.getElementById('start-btn');
const lapBtn = document.getElementById('lap-btn');
const resetBtn = document.getElementById('reset-btn');
const lapsList = document.getElementById('laps-list');
const lapCount = document.getElementById('lap-count');
const stopwatchCard = document.querySelector('.stopwatch-card');

// State
let isRunning = false;
let startTime = 0;
let elapsedTime = 0;
let animationId = null;
let laps = [];

// Format time
function formatTime(ms) {
    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;

    return {
        hours: String(hours).padStart(2, '0'),
        minutes: String(minutes).padStart(2, '0'),
        seconds: String(seconds).padStart(2, '0'),
        milliseconds: '.' + String(milliseconds).padStart(3, '0')
    };
}

// Update display
function updateDisplay() {
    const time = formatTime(elapsedTime);
    hoursEl.textContent = time.hours;
    minutesEl.textContent = time.minutes;
    secondsEl.textContent = time.seconds;
    millisecondsEl.textContent = time.milliseconds;
}

// Animation loop
function animate(timestamp) {
    if (!isRunning) return;

    elapsedTime = Date.now() - startTime;
    updateDisplay();
    animationId = requestAnimationFrame(animate);
}

// Start/Stop
function toggleStart() {
    if (isRunning) {
        // Stop
        isRunning = false;
        cancelAnimationFrame(animationId);
        startBtn.innerHTML = '<i class="fas fa-play"></i><span>Resume</span>';
        startBtn.classList.remove('running');
        stopwatchCard.classList.remove('running');
    } else {
        // Start
        isRunning = true;
        startTime = Date.now() - elapsedTime;
        animate();
        startBtn.innerHTML = '<i class="fas fa-pause"></i><span>Pause</span>';
        startBtn.classList.add('running');
        stopwatchCard.classList.add('running');
        lapBtn.disabled = false;
        resetBtn.disabled = false;
    }
}

// Record lap
function recordLap() {
    if (!isRunning && elapsedTime === 0) return;

    const lapTime = elapsedTime;
    const prevTotal = laps.length > 0 ? laps[laps.length - 1].total : 0;
    const lapDiff = lapTime - prevTotal;

    laps.push({
        number: laps.length + 1,
        total: lapTime,
        diff: lapDiff
    });

    renderLaps();
    lapCount.textContent = `${laps.length} lap${laps.length !== 1 ? 's' : ''}`;
}

// Render laps
function renderLaps() {
    if (laps.length === 0) {
        lapsList.innerHTML = '<div class="placeholder">No laps recorded yet</div>';
        return;
    }

    // Find fastest and slowest
    let fastestIndex = 0;
    let slowestIndex = 0;

    laps.forEach((lap, index) => {
        if (lap.diff < laps[fastestIndex].diff) fastestIndex = index;
        if (lap.diff > laps[slowestIndex].diff) slowestIndex = index;
    });

    let html = '';

    // Render in reverse order (newest first)
    for (let i = laps.length - 1; i >= 0; i--) {
        const lap = laps[i];
        let className = 'lap-item';

        if (laps.length > 1) {
            if (i === fastestIndex) className += ' fastest';
            else if (i === slowestIndex) className += ' slowest';
        }

        html += `
            <div class="${className}">
                <span class="lap-number">Lap ${lap.number}</span>
                <div class="lap-times">
                    <span class="lap-time">${formatTimeForDisplay(lap.diff)}</span>
                    ${laps.length > 1 ? `<span class="lap-diff">${formatTimeForDisplay(lap.total)}</span>` : ''}
                </div>
            </div>
        `;
    }

    lapsList.innerHTML = html;
}

// Format time for display
function formatTimeForDisplay(ms) {
    const time = formatTime(ms);
    let result = '';

    if (time.hours !== '00') {
        result = `${time.hours}:${time.minutes}:${time.seconds}${time.milliseconds}`;
    } else if (time.minutes !== '00') {
        result = `${time.minutes}:${time.seconds}${time.milliseconds}`;
    } else {
        result = `${time.seconds}${time.milliseconds}`;
    }

    return result;
}

// Reset
function reset() {
    isRunning = false;
    cancelAnimationFrame(animationId);
    elapsedTime = 0;
    laps = [];

    updateDisplay();
    renderLaps();

    startBtn.innerHTML = '<i class="fas fa-play"></i><span>Start</span>';
    startBtn.classList.remove('running');
    stopwatchCard.classList.remove('running');
    lapBtn.disabled = true;
    resetBtn.disabled = true;
    lapCount.textContent = '0 laps';
}

// Event listeners
startBtn.addEventListener('click', toggleStart);
lapBtn.addEventListener('click', recordLap);
resetBtn.addEventListener('click', reset);

// Keyboard shortcuts
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        toggleStart();
    } else if (e.code === 'KeyL' && isRunning) {
        recordLap();
    } else if (e.code === 'KeyR' && (elapsedTime > 0 || laps.length > 0)) {
        reset();
    }
});

// Initial display
updateDisplay();
