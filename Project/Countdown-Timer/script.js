document.addEventListener('DOMContentLoaded', () => {
    const daysEl = document.getElementById('days');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');
    const eventNameEl = document.getElementById('event-name');
    const eventInput = document.getElementById('event-input');
    const dateInput = document.getElementById('date-input');
    const timeInput = document.getElementById('time-input');
    const startBtn = document.getElementById('start-btn');
    const stopBtn = document.getElementById('stop-btn');
    const resetBtn = document.getElementById('reset-btn');
    const inputSection = document.getElementById('input-section');
    const controls = document.getElementById('controls');
    const countdownDisplay = document.getElementById('countdown-display');

    let countdown;
    let targetDate;

    // Set min date to today
    const today = new Date().toISOString().split('T')[0];
    dateInput.min = today;
    dateInput.value = today;

    // Presets
    document.querySelectorAll('.preset-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const preset = btn.dataset.preset;
            const now = new Date();
            
            switch(preset) {
                case 'newyear':
                    eventInput.value = 'New Year ' + (now.getFullYear() + 1);
                    dateInput.value = `${now.getFullYear() + 1}-01-01`;
                    timeInput.value = '00:00';
                    break;
                case 'christmas':
                    const christmasYear = now.getMonth() >= 11 && now.getDate() > 25 
                        ? now.getFullYear() + 1 
                        : now.getFullYear();
                    eventInput.value = 'Christmas ' + christmasYear;
                    dateInput.value = `${christmasYear}-12-25`;
                    timeInput.value = '00:00';
                    break;
            }
        });
    });

    startBtn.addEventListener('click', () => {
        const date = dateInput.value;
        const time = timeInput.value;
        
        if (!date) {
            shakeElement(dateInput);
            return;
        }

        targetDate = new Date(`${date}T${time}`);
        
        if (targetDate <= new Date()) {
            alert('Please select a future date and time');
            return;
        }

        eventNameEl.textContent = eventInput.value || 'Countdown';
        inputSection.style.display = 'none';
        controls.style.display = 'flex';
        
        startCountdown();
    });

    stopBtn.addEventListener('click', () => {
        clearInterval(countdown);
        inputSection.style.display = 'block';
        controls.style.display = 'none';
        eventNameEl.textContent = '';
        resetDisplay();
    });

    resetBtn.addEventListener('click', () => {
        clearInterval(countdown);
        startCountdown();
    });

    function startCountdown() {
        updateCountdown();
        countdown = setInterval(updateCountdown, 1000);
    }

    function updateCountdown() {
        const now = new Date();
        const diff = targetDate - now;

        if (diff <= 0) {
            clearInterval(countdown);
            countdownDisplay.classList.add('completed');
            daysEl.textContent = '00';
            hoursEl.textContent = '00';
            minutesEl.textContent = '00';
            secondsEl.textContent = '00';
            eventNameEl.textContent = '🎉 ' + (eventInput.value || 'Event') + ' has arrived! 🎉';
            return;
        }

        countdownDisplay.classList.remove('completed');

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);

        daysEl.textContent = String(days).padStart(2, '0');
        hoursEl.textContent = String(hours).padStart(2, '0');
        minutesEl.textContent = String(minutes).padStart(2, '0');
        secondsEl.textContent = String(seconds).padStart(2, '0');
    }

    function resetDisplay() {
        daysEl.textContent = '00';
        hoursEl.textContent = '00';
        minutesEl.textContent = '00';
        secondsEl.textContent = '00';
    }

    function shakeElement(el) {
        el.style.animation = 'shake 0.5s ease';
        el.style.borderColor = '#ff4757';
        setTimeout(() => {
            el.style.animation = '';
            el.style.borderColor = '';
        }, 500);
    }

    // Add shake animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes shake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-10px); }
            40%, 80% { transform: translateX(10px); }
        }
    `;
    document.head.appendChild(style);
});
