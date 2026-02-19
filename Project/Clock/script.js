document.addEventListener('DOMContentLoaded', () => {
    const hourHand = document.getElementById('hour-hand');
    const minuteHand = document.getElementById('minute-hand');
    const secondHand = document.getElementById('second-hand');
    const hoursEl = document.getElementById('hours');
    const minutesEl = document.getElementById('minutes');
    const secondsEl = document.getElementById('seconds');
    const ampmEl = document.getElementById('ampm');
    const dateDisplay = document.getElementById('date-display');
    const timezoneInfo = document.getElementById('timezone-info');
    const formatToggle = document.getElementById('format-toggle');
    const worldClocksGrid = document.getElementById('world-clocks');
    const utcTimeEl = document.getElementById('utc-time');

    let is24Hour = false;

    // World clocks - one representative city per timezone
    const worldClocks = [
        { city: 'Baker Island', offset: -12, country: 'USA' },
        { city: 'Pago Pago', offset: -11, country: 'American Samoa' },
        { city: 'Honolulu', offset: -10, country: 'USA' },
        { city: 'Anchorage', offset: -9, country: 'USA' },
        { city: 'Los Angeles', offset: -8, country: 'USA' },
        { city: 'Denver', offset: -7, country: 'USA' },
        { city: 'Chicago', offset: -6, country: 'USA' },
        { city: 'New York', offset: -5, country: 'USA' },
        { city: 'Caracas', offset: -4, country: 'Venezuela' },
        { city: 'São Paulo', offset: -3, country: 'Brazil' },
        { city: 'Fernando de Noronha', offset: -2, country: 'Brazil' },
        { city: 'Azores', offset: -1, country: 'Portugal' },
        { city: 'London', offset: 0, country: 'UK' },
        { city: 'Paris', offset: 1, country: 'France' },
        { city: 'Cairo', offset: 2, country: 'Egypt' },
        { city: 'Moscow', offset: 3, country: 'Russia' },
        { city: 'Dubai', offset: 4, country: 'UAE' },
        { city: 'Karachi', offset: 5, country: 'Pakistan' },
        { city: 'Dhaka', offset: 6, country: 'Bangladesh' },
        { city: 'Bangkok', offset: 7, country: 'Thailand' },
        { city: 'Shanghai', offset: 8, country: 'China' },
        { city: 'Tokyo', offset: 9, country: 'Japan' },
        { city: 'Sydney', offset: 10, country: 'Australia' },
        { city: 'Solomon Islands', offset: 11, country: 'Oceania' },
        { city: 'Auckland', offset: 12, country: 'New Zealand' },
        { city: 'Phoenix Islands', offset: 13, country: 'Kiribati' },
        { city: 'Line Islands', offset: 14, country: 'Kiribati' }
    ];

    // Get user's timezone offset
    function getUserTimezoneOffset() {
        return -new Date().getTimezoneOffset() / 60;
    }

    // Format timezone offset string
    function formatTimezoneOffset(offset) {
        const sign = offset >= 0 ? '+' : '';
        return `UTC${sign}${offset}`;
    }

    function updateClock() {
        const now = new Date();
        const hours = now.getHours();
        const minutes = now.getMinutes();
        const seconds = now.getSeconds();
        const milliseconds = now.getMilliseconds();

        // Analog clock
        const secondDegrees = (seconds + milliseconds / 1000) * 6;
        const minuteDegrees = (minutes + seconds / 60) * 6;
        const hourDegrees = (hours % 12 + minutes / 60) * 30;

        secondHand.style.transform = `rotate(${secondDegrees}deg)`;
        minuteHand.style.transform = `rotate(${minuteDegrees}deg)`;
        hourHand.style.transform = `rotate(${hourDegrees}deg)`;

        // Digital clock
        if (is24Hour) {
            hoursEl.textContent = String(hours).padStart(2, '0');
            ampmEl.style.display = 'none';
        } else {
            hoursEl.textContent = String(hours % 12 || 12).padStart(2, '0');
            ampmEl.textContent = hours >= 12 ? 'PM' : 'AM';
            ampmEl.style.display = 'inline';
        }
        minutesEl.textContent = String(minutes).padStart(2, '0');
        secondsEl.textContent = String(seconds).padStart(2, '0');

        // Date display
        const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        dateDisplay.textContent = now.toLocaleDateString('en-US', options);

        // Timezone info
        const userOffset = getUserTimezoneOffset();
        timezoneInfo.textContent = `Your Timezone: ${formatTimezoneOffset(userOffset)}`;

        // UTC time
        const utcHours = now.getUTCHours();
        const utcMinutes = now.getUTCMinutes();
        const utcSeconds = now.getUTCSeconds();
        utcTimeEl.textContent = `${String(utcHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')}:${String(utcSeconds).padStart(2, '0')}`;

        // World clocks
        updateWorldClocks(now);
    }

    function updateWorldClocks(now) {
        const items = worldClocksGrid.querySelectorAll('.world-clock-item');
        items.forEach((item, index) => {
            const clock = worldClocks[index];
            const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
            const cityTime = new Date(utc + (3600000 * clock.offset));
            
            const hours = cityTime.getHours();
            const minutes = cityTime.getMinutes();
            
            // Format based on 12/24 hour setting
            let timeStr;
            if (is24Hour) {
                timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
            } else {
                const h12 = hours % 12 || 12;
                const ampm = hours >= 12 ? 'PM' : 'AM';
                timeStr = `${String(h12).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
            }
            
            // Format date
            const dateStr = cityTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
            
            item.querySelector('.time').textContent = timeStr;
            item.querySelector('.date').textContent = dateStr;
            item.querySelector('.offset').textContent = formatTimezoneOffset(clock.offset);
        });
    }

    function initWorldClocks() {
        worldClocks.forEach(clock => {
            const item = document.createElement('div');
            item.className = 'world-clock-item';
            item.innerHTML = `
                <div class="city">${clock.city}</div>
                <div class="country">${clock.country}</div>
                <div class="time">--:--</div>
                <div class="date">--- --</div>
                <div class="offset">${formatTimezoneOffset(clock.offset)}</div>
            `;
            worldClocksGrid.appendChild(item);
        });
    }

    formatToggle.addEventListener('change', () => {
        is24Hour = formatToggle.checked;
        updateClock();
    });

    initWorldClocks();
    updateClock();
    setInterval(updateClock, 50); // Smooth second hand
});