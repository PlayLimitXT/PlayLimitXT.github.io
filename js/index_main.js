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