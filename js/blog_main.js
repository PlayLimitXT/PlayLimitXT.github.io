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

// 3. Scroll Reveal (Intersection Observer)
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

// 4. Dynamic Blog Content Loading
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