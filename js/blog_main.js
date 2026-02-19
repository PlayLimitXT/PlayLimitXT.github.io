// 1. Click Firework Ripple Effect
(function clickEffect() {
  let balls = [];
  let longPressed = false;
  let longPress;
  let multiplier = 0;
  let width, height;
  let origin;
  let normal;
  let ctx;
  const colours = ["#F73859", "#14FFEC", "#00E0FF", "#FF99FE", "#FAF15D"];
  const canvas = document.createElement("canvas");
  document.body.appendChild(canvas);
  canvas.setAttribute("style", "width: 100%; height: 100%; top: 0; left: 0; z-index: 99999; position: fixed; pointer-events: none;");
  
  if (canvas.getContext && window.addEventListener) {
    ctx = canvas.getContext("2d");
    updateSize();
    window.addEventListener('resize', updateSize, false);
    loop();
    window.addEventListener("mousedown", function(e) {
      pushBalls(randBetween(10, 20), e.clientX, e.clientY);
      document.body.classList.add("is-pressed");
      longPress = setTimeout(function(){
        document.body.classList.add("is-longpress");
        longPressed = true;
      }, 500);
    }, false);
    window.addEventListener("mouseup", function(e) {
      clearInterval(longPress);
      if (longPressed == true) {
        document.body.classList.remove("is-longpress");
        pushBalls(randBetween(50 + Math.ceil(multiplier), 100 + Math.ceil(multiplier)), e.clientX, e.clientY);
        longPressed = false;
      }
      document.body.classList.remove("is-pressed");
    }, false);
    window.addEventListener("mousemove", function(e) {
      let x = e.clientX;
      let y = e.clientY;
    }, false);
  }

  function updateSize() {
    canvas.width = window.innerWidth * 2;
    canvas.height = window.innerHeight * 2;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(2, 2);
    width = (canvas.width = window.innerWidth);
    height = (canvas.height = window.innerHeight);
    origin = {
      x: width / 2,
      y: height / 2
    };
    normal = {
      x: width / 2,
      y: height / 2
    };
  }

  class Ball {
    constructor(x = origin.x, y = origin.y) {
      this.x = x;
      this.y = y;
      this.angle = Math.PI * 2 * Math.random();
      if (longPressed == true) {
        this.multiplier = randBetween(14 + multiplier, 15 + multiplier);
      } else {
        this.multiplier = randBetween(6, 12);
      }
      this.vx = (this.multiplier + Math.random() * 0.5) * Math.cos(this.angle);
      this.vy = (this.multiplier + Math.random() * 0.5) * Math.sin(this.angle);
      this.r = randBetween(8, 12) + 3 * Math.random();
      this.color = colours[Math.floor(Math.random() * colours.length)];
    }
    update() {
      this.x += this.vx - normal.x;
      this.y += this.vy - normal.y;
      normal.x = -2 / window.innerWidth * Math.sin(this.angle);
      normal.y = -2 / window.innerHeight * Math.cos(this.angle);
      this.r -= 0.3;
      this.vx *= 0.9;
      this.vy *= 0.9;
    }
  }

  function pushBalls(count = 1, x = origin.x, y = origin.y) {
    for (let i = 0; i < count; i++) {
      balls.push(new Ball(x, y));
    }
  }

  function randBetween(min, max) {
    return Math.floor(Math.random() * max) + min;
  }

  function loop() {
    ctx.fillStyle = "rgba(255, 255, 255, 0)";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < balls.length; i++) {
      let b = balls[i];
      if (b.r < 0) continue;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2, false);
      ctx.fill();
      b.update();
    }
    if (longPressed == true) {
      multiplier += 0.2;
    } else if (!longPressed && multiplier >= 0) {
      multiplier -= 0.4;
    }
    removeBall();
    requestAnimationFrame(loop);
  }

  function removeBall() {
    for (let i = 0; i < balls.length; i++) {
      let b = balls[i];
      if (b.x + b.r < 0 || b.x - b.r > width || b.y + b.r < 0 || b.y - b.r > height || b.r < 0) {
        balls.splice(i, 1);
      }
    }
  }
})();

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

// 2. Scroll Reveal (Intersection Observer)
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

// 3. Dynamic Blog Content Loading
let articles = [];
let categories = new Map();
let tags = new Set();

// Function to load articles from config.json
async function loadArticles() {
  try {
    const response = await fetch('./articles/config.json');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    articles = await response.json();

    // Sort articles by date (newest first)
    articles.sort((a, b) => new Date(b.date) - new Date(a.date));

    // Process categories and tags
    processCategoriesAndTags();

    // Render the blog content
    renderBlogContent();
  } catch (error) {
    console.error('Error loading articles:', error);
    document.getElementById('blog-posts-container').innerHTML =
      '<div class="loading"><p>Error loading articles. Please try again later.</p></div>';
  }
}

// Process categories and tags from articles
function processCategoriesAndTags() {
  categories.clear();
  tags.clear();

  articles.forEach(article => {
    // Count articles per category
    if (categories.has(article.categoryDisplay)) {
      categories.set(article.categoryDisplay, categories.get(article.categoryDisplay) + 1);
    } else {
      categories.set(article.categoryDisplay, 1);
    }

    // Extract tags from description (this is a simple implementation)
    // In a real scenario, you might have a dedicated tags field in your JSON
    const words = article.description.split(' ');
    words.forEach(word => {
      if (word.length > 4 && word.length < 12) {
        tags.add(word.toLowerCase());
      }
    });
  });
}

// Render the blog content
function renderBlogContent() {
  renderBlogPosts();
  renderCategories();
  renderRecentPosts();
  renderTags();
}

// Helper: Generate article card HTML
function createArticleCard(article) {
  return `
    <article class="blog-post hidden">
      ${article.image ? `<img src="${article.image}" alt="${article.title}" class="blog-post-image" loading="lazy">` : ''}
      <div class="blog-post-content">
        <div class="blog-post-meta">
          <span class="blog-post-date"><i class="far fa-calendar"></i> ${article.date}</span>
          <span><i class="far fa-user"></i> ${article.author}</span>
        </div>
        <div class="blog-post-tags">
          <span class="tag">${article.categoryDisplay}</span>
        </div>
        <h2 class="blog-post-title">${article.title}</h2>
        <p class="blog-post-excerpt">${article.description}</p>
        <a href="${article.link}" class="blog-post-link">Read More <i class="fas fa-arrow-right"></i></a>
      </div>
    </article>
  `;
}

// Render blog posts
function renderBlogPosts() {
  const container = document.getElementById('blog-posts-container');

  if (articles.length === 0) {
    container.innerHTML = '<div class="loading"><p>No articles found.</p></div>';
    return;
  }

  let html = articles.map(article => createArticleCard(article)).join('');

  // Add pagination
  html += `
    <div class="pagination hidden">
      <a href="#" class="pagination-link active">1</a>
      <a href="#" class="pagination-link">2</a>
      <a href="#" class="pagination-link">3</a>
      <a href="#" class="pagination-link"><i class="fas fa-chevron-right"></i></a>
    </div>
  `;

  container.innerHTML = html;

  // Re-initialize observer for new elements
  document.querySelectorAll('#blog-posts-container .hidden').forEach(el => observer.observe(el));
}

// Render categories
function renderCategories() {
  const container = document.getElementById('categories-container');

  if (categories.size === 0) {
    container.innerHTML = '<li>No categories found.</li>';
    return;
  }

  let html = '';

  // Convert Map to Array and sort by count
  const sortedCategories = Array.from(categories.entries())
    .sort((a, b) => b[1] - a[1]);

  sortedCategories.forEach(([category, count]) => {
    html += `
                    <li class="category-item">
                        <a href="#" class="category-link" data-category="${category}">
                            <i class="fas fa-folder"></i> ${category}
                        </a>
                        <span class="category-count">${count}</span>
                    </li>
                `;
  });

  container.innerHTML = html;

  // Add event listeners for category filtering
  document.querySelectorAll('.category-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const category = e.target.getAttribute('data-category') ||
        e.target.closest('.category-link').getAttribute('data-category');
      filterByCategory(category);
    });
  });
}

// Render recent posts
function renderRecentPosts() {
  const container = document.getElementById('recent-posts-container');

  if (articles.length === 0) {
    container.innerHTML = '<li>No recent posts.</li>';
    return;
  }

  let html = '';

  // Get the 3 most recent articles
  const recentArticles = articles.slice(0, 3);

  recentArticles.forEach(article => {
    html += `
                    <li class="recent-post">
                        ${article.image ? `
                            <img src="${article.image}" alt="${article.title}" class="recent-post-image">
                        ` : `
                            <div class="recent-post-image" style="background: var(--glass-bg); display: flex; align-items: center; justify-content: center;">
                                <i class="fas fa-file-alt" style="color: var(--text-muted);"></i>
                            </div>
                        `}
                        <div class="recent-post-content">
                            <h4 class="recent-post-title">
                                <a href="${article.link}">${article.title}</a>
                            </h4>
                            <span class="recent-post-date">${article.date}</span>
                        </div>
                    </li>
                `;
  });

  container.innerHTML = html;
}

// Render tags
function renderTags() {
  const container = document.getElementById('tags-container');

  if (tags.size === 0) {
    container.innerHTML = '<span>No tags found.</span>';
    return;
  }

  let html = '';

  // Convert Set to Array and take first 10 tags
  const tagsArray = Array.from(tags).slice(0, 10);

  tagsArray.forEach(tag => {
    html += `<span class="tag">${tag}</span>`;
  });

  container.innerHTML = html;
}

// Filter articles by category
function filterByCategory(category) {
  const filteredArticles = articles.filter(article =>
    article.categoryDisplay === category
  );

  const container = document.getElementById('blog-posts-container');

  if (filteredArticles.length === 0) {
    container.innerHTML = '<div class="loading"><p>No articles found in this category.</p></div>';
  } else {
    container.innerHTML = filteredArticles.map(article => createArticleCard(article)).join('');
  }

  // Re-initialize observer for new elements
  document.querySelectorAll('#blog-posts-container .hidden').forEach(el => observer.observe(el));

  // Scroll to blog section
  document.getElementById('blog').scrollIntoView({ behavior: 'smooth' });
}

// Initialize the blog when the page loads
document.addEventListener('DOMContentLoaded', () => {
  loadArticles();
});