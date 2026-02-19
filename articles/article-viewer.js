/**
 * PLXT Article Viewer
 * Dynamic Markdown article loader with premium features
 * 
 * Features:
 * - Markdown rendering with syntax highlighting
 * - Reading progress indicator
 * - Table of contents with scroll tracking
 * - Code block copy functionality
 * - Font size adjustment
 * - Smooth scrolling and animations
 */

(function() {
  'use strict';

  // ========== Configuration ==========
  const CONFIG = {
    articlesPath: 'Blog_Pages',
    configPath: 'config.json',
    defaultAuthor: 'PlayLimitXT',
    defaultLang: 'en',
    minFontSize: 10,
    maxFontSize: 22,
    fontSizeStep: 2,
    scrollOffset: 100
  };

  // ========== State ==========
  const state = {
    fontSize: 16,
    lastScrollY: 0,
    isNavHidden: false,
    headings: [],
    activeHeading: null
  };

  // ========== DOM Elements ==========
  const $ = (selector) => document.querySelector(selector);
  const $$ = (selector) => document.querySelectorAll(selector);

  const elements = {};

  // ========== Utility Functions ==========
  
  /**
   * Initialize DOM element references
   */
  function initElements() {
    elements.loadingState = $('#loading-state');
    elements.errorState = $('#error-state');
    elements.errorMessage = $('#error-message');
    elements.articleContent = $('#article-content');
    elements.articleTitle = $('#article-title');
    elements.articleCategory = $('#article-category');
    elements.articleDate = $('#article-date');
    elements.articleAuthor = $('#article-author');
    elements.authorAvatar = $('#author-avatar');
    elements.articleReadingTime = $('#article-reading-time');
    elements.articleTags = $('#article-tags');
    elements.markdownBody = $('#markdown-body');
    elements.tocContent = $('#toc-content');
    elements.articleToc = $('#article-toc');
    elements.tocToggle = $('#toc-toggle');
    elements.backToTop = $('#back-to-top');
    elements.navToggle = $('#nav-toggle');
    elements.mobileMenu = $('#mobile-menu');
    elements.articleNav = $('#article-nav');
    elements.readingProgress = $('#reading-progress');
    elements.fontControls = $('#font-controls');
    elements.fontIncrease = $('#font-increase');
    elements.fontDecrease = $('#font-decrease');
  }

  /**
   * Get article path from URL parameters
   */
  function getArticlePath() {
    const params = new URLSearchParams(window.location.search);
    return params.get('p') || params.get('path');
  }

  /**
   * Calculate reading time
   */
  function calculateReadingTime(text) {
    const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (text.match(/[a-zA-Z]+/g) || []).length;
    const minutes = Math.ceil(chineseChars / 400 + englishWords / 200);
    return Math.max(1, minutes);
  }

  /**
   * Format date with locale support
   */
  function formatDate(dateStr) {
    try {
      let date;
      if (dateStr.includes('.')) {
        const parts = dateStr.split('.');
        date = new Date(parts[0], parts[1] - 1, parts[2]);
      } else {
        date = new Date(dateStr);
      }
      
      if (isNaN(date.getTime())) return dateStr;
      
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  /**
   * Escape HTML entities
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ========== Markdown Configuration ==========
  
  function configureMarked() {
    const renderer = new marked.Renderer();
    
    // Custom code block rendering with copy button
    renderer.code = function(code, language) {
      const lang = language || 'plaintext';
      const highlighted = lang && hljs.getLanguage(lang)
        ? hljs.highlight(code, { language: lang }).value
        : escapeHtml(code);
      
      return `
        <div class="code-block" data-lang="${lang}">
          <div class="code-header">
            <span class="code-lang">${lang}</span>
            <button class="code-copy" title="Copy code">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2"/>
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
              </svg>
              <span>Copy</span>
            </button>
          </div>
          <pre><code class="hljs language-${lang}">${highlighted}</code></pre>
        </div>
      `;
    };
    
    // Custom link rendering
    renderer.link = function(href, title, text) {
      const isExternal = href.startsWith('http') || href.startsWith('//');
      const target = isExternal ? ' target="_blank" rel="noopener noreferrer"' : '';
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return `<a href="${href}"${titleAttr}${target}>${text}</a>`;
    };
    
    // Custom image rendering
    renderer.image = function(href, title, text) {
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      const alt = text || '';
      return `<figure><img src="${href}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy">${text ? `<figcaption>${escapeHtml(text)}</figcaption>` : ''}</figure>`;
    };

    marked.setOptions({
      renderer,
      breaks: true,
      gfm: true
    });
  }

  // ========== Table of Contents ==========
  
  function generateTOC() {
    const headings = $$('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4');
    state.headings = Array.from(headings);
    
    if (headings.length === 0) {
      elements.articleToc.style.display = 'none';
      return;
    }

    let tocHTML = '<ul>';
    let currentLevel = 1;
    const stack = [1];

    headings.forEach((heading, index) => {
      const level = parseInt(heading.tagName.slice(1));
      const id = `heading-${index}`;
      heading.id = id;

      // Adjust nesting level
      if (level > currentLevel) {
        tocHTML += '<ul>';
        stack.push(level);
      } else if (level < currentLevel) {
        while (stack.length > 1 && stack[stack.length - 1] > level) {
          tocHTML += '</ul>';
          stack.pop();
        }
      }
      currentLevel = level;

      tocHTML += `<li><a href="#${id}" data-id="${id}">${heading.textContent}</a></li>`;
    });

    // Close all open lists
    while (stack.length > 1) {
      tocHTML += '</ul>';
      stack.pop();
    }

    tocHTML += '</ul>';
    elements.tocContent.innerHTML = tocHTML;
  }

  function updateActiveTOItem() {
    const scrollY = window.scrollY + CONFIG.scrollOffset;
    
    let activeId = null;
    for (const heading of state.headings) {
      if (heading.offsetTop <= scrollY) {
        activeId = heading.id;
      }
    }
    
    if (activeId !== state.activeHeading) {
      state.activeHeading = activeId;
      
      $$('.toc-content a').forEach(link => {
        link.classList.toggle('active', link.dataset.id === activeId);
      });
    }
  }

  // ========== Article Loading ==========
  
  async function loadArticleInfo(articlePath) {
    try {
      const response = await fetch(CONFIG.configPath);
      if (!response.ok) return null;
      
      const articles = await response.json();
      
      const normalizedPath = articlePath.replace(/\\/g, '/');
      return articles.find(a => {
        if (a.mdPath) {
          return normalizedPath.includes(a.mdPath) || a.mdPath.includes(normalizedPath);
        }
        const linkPath = (a.link || '').replace(/\\/g, '/');
        const pathMatch = linkPath.match(/p=([^&]+)/);
        if (pathMatch) {
          return normalizedPath.includes(pathMatch[1]) || pathMatch[1].includes(normalizedPath);
        }
        return false;
      });
    } catch (e) {
      console.error('Error loading article info:', e);
      return null;
    }
  }

  async function loadMarkdown(articlePath) {
    const paths = [
      `${CONFIG.articlesPath}/${articlePath}/README.md`,
      `${CONFIG.articlesPath}/${articlePath}/index.md`,
      `${articlePath}/README.md`,
      `${articlePath}`
    ];

    for (const path of paths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          return await response.text();
        }
      } catch (e) {
        continue;
      }
    }
    
    throw new Error('Article not found');
  }

  // ========== Article Rendering ==========
  
  async function renderArticle() {
    const articlePath = getArticlePath();
    
    if (!articlePath) {
      showError('No article specified');
      return;
    }

    try {
      const [articleInfo, markdown] = await Promise.all([
        loadArticleInfo(articlePath),
        loadMarkdown(articlePath)
      ]);

      configureMarked();
      
      // Render markdown
      elements.markdownBody.innerHTML = marked.parse(markdown);
      
      // Generate TOC
      generateTOC();
      
      // Set article info
      if (articleInfo) {
        document.title = `${articleInfo.title} - PLXT`;
        elements.articleTitle.textContent = articleInfo.title;
        elements.articleCategory.textContent = articleInfo.categoryDisplay || 'Blog';
        elements.articleDate.textContent = formatDate(articleInfo.date);
        elements.articleAuthor.textContent = articleInfo.author || CONFIG.defaultAuthor;
        elements.authorAvatar.textContent = (articleInfo.author || CONFIG.defaultAuthor).charAt(0).toUpperCase();
        
        const metaDesc = document.querySelector('meta[name="description"]');
        if (metaDesc && articleInfo.description) {
          metaDesc.setAttribute('content', articleInfo.description);
        }
      } else {
        const titleMatch = markdown.match(/^#\s+(.+)$/m);
        if (titleMatch) {
          document.title = `${titleMatch[1]} - PLXT`;
          elements.articleTitle.textContent = titleMatch[1];
        }
      }

      // Calculate reading time
      const readingTime = calculateReadingTime(markdown);
      elements.articleReadingTime.textContent = `${readingTime} min read`;

      // Process images
      processImages(articlePath);

      // Setup code copy buttons
      setupCodeCopy();

      // Show content
      showContent();

    } catch (error) {
      console.error('Error loading article:', error);
      showError(error.message);
    }
  }

  function processImages(articlePath) {
    const images = $$('.markdown-body img');
    const basePath = `${CONFIG.articlesPath}/${articlePath}`;
    
    images.forEach(img => {
      const src = img.getAttribute('src');
      if (src && !src.startsWith('http') && !src.startsWith('/') && !src.startsWith('../')) {
        img.src = `${basePath}/${src}`;
      }
    });
  }

  // ========== Code Copy ==========
  
  function setupCodeCopy() {
    $$('.code-copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const codeBlock = btn.closest('.code-block');
        const code = codeBlock.querySelector('code').textContent;
        
        try {
          await navigator.clipboard.writeText(code);
          
          btn.classList.add('copied');
          btn.querySelector('span').textContent = 'Copied!';
          
          setTimeout(() => {
            btn.classList.remove('copied');
            btn.querySelector('span').textContent = 'Copy';
          }, 2000);
        } catch (e) {
          console.error('Copy failed:', e);
        }
      });
    });
  }

  // ========== UI State ==========
  
  function showContent() {
    elements.loadingState.style.display = 'none';
    elements.errorState.style.display = 'none';
    elements.articleContent.style.display = 'block';
    elements.fontControls.classList.add('visible');
  }

  function showError(message) {
    elements.loadingState.style.display = 'none';
    elements.articleContent.style.display = 'none';
    elements.errorState.style.display = 'flex';
    elements.errorMessage.textContent = message;
  }

  // ========== Event Handlers ==========
  
  function setupScrollProgress() {
    const updateProgress = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = Math.min((scrollTop / docHeight) * 100, 100);
      elements.readingProgress.style.width = `${progress}%`;
    };
    
    window.addEventListener('scroll', updateProgress, { passive: true });
    updateProgress();
  }

  function setupNavScroll() {
    let lastScroll = 0;
    
    window.addEventListener('scroll', () => {
      const currentScroll = window.scrollY;
      
      if (currentScroll > lastScroll && currentScroll > CONFIG.scrollOffset) {
        elements.articleNav.classList.add('hidden');
      } else {
        elements.articleNav.classList.remove('hidden');
      }
      
      lastScroll = currentScroll;
    }, { passive: true });
  }

  function setupBackToTop() {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 400) {
        elements.backToTop.classList.add('visible');
      } else {
        elements.backToTop.classList.remove('visible');
      }
    }, { passive: true });

    elements.backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  function setupTOCToggle() {
    elements.tocToggle.addEventListener('click', () => {
      const isHidden = elements.tocContent.classList.toggle('hidden');
      elements.tocToggle.textContent = isHidden ? 'Expand' : 'Collapse';
    });
  }

  function setupMobileMenu() {
    elements.navToggle.addEventListener('click', () => {
      elements.navToggle.classList.toggle('active');
      elements.mobileMenu.classList.toggle('active');
    });

    // Close menu on link click
    $$('.mobile-menu a').forEach(link => {
      link.addEventListener('click', () => {
        elements.navToggle.classList.remove('active');
        elements.mobileMenu.classList.remove('active');
      });
    });
  }

  function setupFontSize() {
    // Load saved font size
    const savedSize = localStorage.getItem('plxt-font-size');
    if (savedSize) {
      state.fontSize = parseInt(savedSize);
      document.documentElement.style.fontSize = `${state.fontSize}px`;
    }

    elements.fontIncrease.addEventListener('click', () => {
      if (state.fontSize < CONFIG.maxFontSize) {
        state.fontSize += CONFIG.fontSizeStep;
        document.documentElement.style.fontSize = `${state.fontSize}px`;
        localStorage.setItem('plxt-font-size', state.fontSize);
      }
    });

    elements.fontDecrease.addEventListener('click', () => {
      if (state.fontSize > CONFIG.minFontSize) {
        state.fontSize -= CONFIG.fontSizeStep;
        document.documentElement.style.fontSize = `${state.fontSize}px`;
        localStorage.setItem('plxt-font-size', state.fontSize);
      }
    });
  }

  function setupSmoothScroll() {
    // Handle TOC link clicks
    elements.tocContent.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        e.preventDefault();
        const target = $(e.target.getAttribute('href'));
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });

    // Update active TOC item on scroll
    window.addEventListener('scroll', updateActiveTOItem, { passive: true });
  }

  function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Escape - close mobile menu
      if (e.key === 'Escape') {
        elements.navToggle.classList.remove('active');
        elements.mobileMenu.classList.remove('active');
      }
      
      // Arrow up - back to top
      if (e.key === 'Home') {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  }

  // ========== Initialization ==========
  
  function init() {
    initElements();
    setupScrollProgress();
    setupNavScroll();
    setupBackToTop();
    setupTOCToggle();
    setupMobileMenu();
    setupFontSize();
    setupSmoothScroll();
    setupKeyboardShortcuts();
    renderArticle();
  }

  // Start when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();