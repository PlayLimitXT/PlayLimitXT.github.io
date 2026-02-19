// 1. Mouse Spotlight Effect
const spotlight = document.getElementById('spotlight');
document.addEventListener('mousemove', (e) => {
  const x = e.clientX / window.innerWidth * 100;
  const y = e.clientY / window.innerHeight * 100;
  spotlight.style.setProperty('--x', `${x}%`);
  spotlight.style.setProperty('--y', `${y}%`);
});

// 2. Advanced Mobile Menu Animation
const menuToggle = document.getElementById('mobile-menu');
const navLinks = document.querySelector('.nav-links');
const navItems = document.querySelectorAll('.nav-links a');
const icon = menuToggle.querySelector('i');

menuToggle.addEventListener('click', () => {
  const isActive = navLinks.classList.toggle('active');

  // Icon Switch
  icon.classList = isActive ? 'fas fa-times' : 'fas fa-bars';

  // Stagger Animation for links
  if (isActive) {
    navItems.forEach((link, index) => {
      link.style.transitionDelay = `${0.2 + (index * 0.1)}s`;
    });
  } else {
    navItems.forEach(link => {
      link.style.transitionDelay = '0s';
    });
  }
});

// Close menu on click
navItems.forEach(item => item.addEventListener('click', () => {
  navLinks.classList.remove('active');
  icon.classList = 'fas fa-bars';
}));

// 3. Typewriter Effect (Looping)
const textElement = document.getElementById('typewriter');
const phrases = ["Experiences", "Software", "Games", "Solutions", "Music", "Videos", "Algorithm", "Analysis"];
let phraseIndex = 0;
let charIndex = 0;
let isDeleting = false;
let typeSpeed = 100;

function type() {
  const currentPhrase = phrases[phraseIndex];

  if (isDeleting) {
    textElement.textContent = currentPhrase.substring(0, charIndex - 1);
    charIndex--;
    typeSpeed = 50; // Faster deleting
  } else {
    textElement.textContent = currentPhrase.substring(0, charIndex + 1);
    charIndex++;
    typeSpeed = 150; // Normal typing
  }

  if (!isDeleting && charIndex === currentPhrase.length) {
    isDeleting = true;
    typeSpeed = 2000; // Pause at end
  } else if (isDeleting && charIndex === 0) {
    isDeleting = false;
    phraseIndex = (phraseIndex + 1) % phrases.length;
    typeSpeed = 500; // Pause before typing new
  }

  setTimeout(type, typeSpeed);
}

document.addEventListener('DOMContentLoaded', type);

// 4. Scroll Reveal (Intersection Observer)
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('show');
    }
  });
}, {
  threshold: 0.1
});

document.querySelectorAll('.hidden').forEach(el => observer.observe(el));

// 5. Tech Marquee - Duplicate items for seamless loop
const techTrack = document.getElementById('tech-track');
if (techTrack) {
  const techItems = techTrack.innerHTML;
  techTrack.innerHTML += techItems;
}

// 6. Stats Counter Animation
function animateCounter(element, target, duration = 2000) {
  const start = 0;
  const startTime = performance.now();
  const isInfinity = target === '∞';
  
  if (isInfinity) {
    element.textContent = '∞';
    return;
  }

  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const easeOutQuart = 1 - Math.pow(1 - progress, 4);
    const current = Math.floor(start + (target - start) * easeOutQuart);
    
    if (target >= 1000000) {
      element.textContent = (current / 1000000).toFixed(0) + 'M+';
    } else if (target >= 1000) {
      element.textContent = (current / 1000).toFixed(0) + 'K+';
    } else {
      element.textContent = current + '+';
    }

    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }

  requestAnimationFrame(update);
}

const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const statNums = entry.target.querySelectorAll('.stat-num');
      statNums.forEach(stat => {
        const text = stat.textContent;
        let target;
        if (text.includes('M')) {
          target = 1000000;
        } else if (text.includes('K')) {
          target = parseInt(text) * 1000;
        } else if (text === '∞') {
          target = '∞';
        } else {
          target = parseInt(text);
        }
        animateCounter(stat, target);
      });
      statsObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

const statsGrid = document.querySelector('.stats-grid');
if (statsGrid) {
  statsObserver.observe(statsGrid);
}