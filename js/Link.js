const projects = [
  { title: "Homepage", url: "./index.html", description: "https://PlayLimitXT.github.io/\nhttps://PLXT.pages.dev/\nThese URLs are also used to replace the \"./\" in links to other projects." },
  { title: "Login Page", url: "./Project/Key/index.html", description: "./Project/Key" },
  { title: "HTML Runner", url: "./Project/HTML_Runner/index.html", description: "./Project/HTML_Runner" },
  { title: "Markdown", url: "./Project/Markdown/index.html", description: "./Project/Markdown" },
  { title: "Crypto", url: "./Project/Crypto/index.html", description: "./Project/Crypto" },
  { title: "AI Chat", url: "./Project/AI/index.html", description: "./Project/AI" },
  { title: "AI Chess", url: "./Project/Chess/index.html", description: "./Project/Chess" },
  { title: "Password Evaluation", url: "./Project/Pswd_Evaluation/index.html", description: "./Project/Pswd_Evaluation" },
  { title: "Unicode Fonts Generator", url: "./Project/Unicode_Fonts/index.html", description: "./Project/Unicode_Fonts" },
  { title: "Rubik's Cube", url: "./Project/Rubik's Cube/index.html", description: "./Project/Rubik's Cube" },
  { title: "Rubik's Cube Tools", url: "./Project/Cube/index.html", description: "./Project/Cube" },
  { title: "Check-In System", url: "./Project/Check-In-System/index.html", description: "./Project/Check-In-System" },
  { title: "Chrome Dinosaur Game", url: "./Project/Chrome-Dinosaur/index.html", description: "./Project/Chrome-Dinosaur" },
  { title: "log", url: "./Project/Web_Log/index.html", description: "./Project/Web_Log" },
  { title: "WebsiteVersions", url: "./Project/Website_Versions/index.html", description: "./Project/Website_Versions" },
  { title: "QR Generator", url: "./Project/QR-Generator/index.html", description: "./Project/QR-Generator - Generate QR codes instantly" },
  { title: "Color Picker", url: "./Project/Color-Picker/index.html", description: "./Project/Color-Picker - Pick and convert colors (HEX/RGB/HSL)" },
  { title: "Countdown Timer", url: "./Project/Countdown-Timer/index.html", description: "./Project/Countdown-Timer - Count down to your special moments" },
  { title: "Password Generator", url: "./Project/Password-Generator/index.html", description: "./Project/Password-Generator - Create secure passwords instantly" },

  { title: "Clock", url: "./Project/Clock/index.html", description: "./Project/Clock - Multiple time zones at a glance" },
  { title: "Metronome", url: "./Project/Metronome/index.html", description: "./Project/Metronome - Keep perfect time with adjustable BPM" },
  { title: "Regex Tester", url: "./Project/Regex-Tester/index.html", description: "./Project/Regex-Tester - Test regular expressions with real-time matching" },
  { title: "JSON Formatter", url: "./Project/JSON-Formatter/index.html", description: "./Project/JSON-Formatter - Format, validate and minify JSON data" },
  { title: "Stopwatch", url: "./Project/Stopwatch/index.html", description: "./Project/Stopwatch - Precise stopwatch with lap recording" },
  { title: "UUID Generator", url: "./Project/UUID-Generator/index.html", description: "./Project/UUID-Generator - Generate unique identifiers instantly" },
  { title: "Unix Timestamp", url: "./Project/Unix-Timestamp/index.html", description: "./Project/Unix-Timestamp - Convert between timestamps and dates" },
  { title: "Word Counter", url: "./Project/Word-Counter/index.html", description: "./Project/Word-Counter - Analyze text with detailed statistics" },
  { title: "SVG Viewer", url: "./Project/SVG-Viewer/index.html", description: "./Project/SVG-Viewer - Preview SVG files and code instantly" },
  { title: "Random Number", url: "./Project/Random-Number/index.html", description: "./Project/Random-Number - Generate random numbers with custom settings" },
  { title: "Reaction Test", url: "./Project/Reaction-Test/index.html", description: "./Project/Reaction-Test - Test your reaction speed" },
  { title: "User Agent Parser", url: "./Project/User-Agent/index.html", description: "./Project/User-Agent - Parse, modify and generate UA strings" },
  { title: "Base64 Image", url: "./Project/Base64-Image/index.html", description: "./Project/Base64-Image - Convert images to Base64 and vice versa" },
  { title: "Keyboard Tester", url: "./Project/Keyboard-Tester/index.html", description: "./Project/Keyboard-Tester - Test your keyboard keys visually" }
];

const originalProjects = [...projects];

const projectsGrid = document.getElementById('projectsGrid');
const alphabetIndex = document.getElementById('alphabetIndex');
const searchInput = document.getElementById('searchInput');
const sortAscBtn = document.getElementById('sortAsc');
const sortDescBtn = document.getElementById('sortDesc');
const sortDefaultBtn = document.getElementById('sortDefault');

let currentSort = 'default';
let currentSearchTerm = '';
let currentLetterFilter = '';

function initPage() {
  generateAlphabetIndex();
  renderProjects(originalProjects);

  searchInput.addEventListener('input', handleSearch);
  sortAscBtn.addEventListener('click', () => handleSort('asc'));
  sortDescBtn.addEventListener('click', () => handleSort('desc'));
  sortDefaultBtn.addEventListener('click', () => handleSort('default'));
}

function generateAlphabetIndex() {
  const firstLetters = new Set();

  projects.forEach(project => {
    const firstLetter = project.title.charAt(0).toUpperCase();
    if (/[A-Z]/.test(firstLetter)) {
      firstLetters.add(firstLetter);
    }
  });

  const sortedLetters = Array.from(firstLetters).sort();

  alphabetIndex.innerHTML = '';

  const allButton = document.createElement('button');
  allButton.className = 'letter-btn active';
  allButton.textContent = 'All';
  allButton.addEventListener('click', () => filterByLetter(''));
  alphabetIndex.appendChild(allButton);

  sortedLetters.forEach(letter => {
    const button = document.createElement('button');
    button.className = 'letter-btn';
    button.textContent = letter;
    button.addEventListener('click', () => filterByLetter(letter));
    alphabetIndex.appendChild(button);
  });
}

function filterByLetter(letter) {
  document.querySelectorAll('.letter-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  if (letter === '') {
    document.querySelector('.letter-btn').classList.add('active');
  } else {
    const targetBtn = [...document.querySelectorAll('.letter-btn')].find(
      btn => btn.textContent === letter
    );
    if (targetBtn) targetBtn.classList.add('active');
  }

  currentLetterFilter = letter;
  applyFiltersAndSort();
}

function handleSearch() {
  currentSearchTerm = searchInput.value.toLowerCase().trim();

  currentLetterFilter = '';

  document.querySelectorAll('.letter-btn').forEach(btn => {
    btn.classList.remove('active');
  });
  document.querySelector('.letter-btn').classList.add('active');

  applyFiltersAndSort();
}

function handleSort(sortType) {
  [sortAscBtn, sortDescBtn, sortDefaultBtn].forEach(btn => {
    btn.classList.remove('active');
  });

  if (sortType === 'asc') sortAscBtn.classList.add('active');
  else if (sortType === 'desc') sortDescBtn.classList.add('active');
  else sortDefaultBtn.classList.add('active');

  currentSort = sortType;
  applyFiltersAndSort();
}

function applyFiltersAndSort() {
  let filteredProjects = [...originalProjects];

  if (currentSearchTerm) {
    filteredProjects = filteredProjects.filter(project =>
      project.title.toLowerCase().includes(currentSearchTerm) ||
      project.description.toLowerCase().includes(currentSearchTerm)
    );
  }

  if (currentLetterFilter) {
    filteredProjects = filteredProjects.filter(project =>
      project.title.charAt(0).toUpperCase() === currentLetterFilter
    );
  }

  if (currentSort === 'asc') {
    filteredProjects.sort((a, b) => a.title.localeCompare(b.title));
  } else if (currentSort === 'desc') {
    filteredProjects.sort((a, b) => b.title.localeCompare(a.title));
  } else if (currentSort === 'default') {
    filteredProjects.sort((a, b) => {
      const indexA = originalProjects.findIndex(p => p.url === a.url);
      const indexB = originalProjects.findIndex(p => p.url === b.url);
      return indexA - indexB;
    });
  }

  renderProjects(filteredProjects);
}

function renderProjects(projectsToRender) {
  projectsGrid.innerHTML = '';

  if (projectsToRender.length === 0) {
    const noResults = document.createElement('div');
    noResults.className = 'no-results';
    noResults.textContent = 'Not found';
    projectsGrid.appendChild(noResults);
    return;
  }

  projectsToRender.forEach((project, index) => {
    const card = document.createElement('article');
    card.className = 'card';
    const stagger = 0.04 + (index * 0.04) + (Math.random() * 0.02);
    card.style.animationDelay = `${stagger}s`;

    card.innerHTML = `
      <a href="${project.url}" target="_blank">
        <h2>${project.title}</h2>
        <p>${project.description}</p>
      </a>
      <div class="spotlight"></div>
    `;

    card.addEventListener('mousemove', e => {
      const rect = card.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--spot-x', x + '%');
      card.style.setProperty('--spot-y', y + '%');
    });

    card.addEventListener('touchstart', () => {
      card.classList.add('touch-active');
    }, { passive: true });

    card.addEventListener('touchend', () => {
      card.classList.remove('touch-active');
    }, { passive: true });

    card.addEventListener('touchcancel', () => {
      card.classList.remove('touch-active');
    }, { passive: true });

    projectsGrid.appendChild(card);
  });
}

document.addEventListener('DOMContentLoaded', initPage);
