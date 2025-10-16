//Copyright © 2025 PlayLimitXT
function loadArticles() {
    const filterList = document.querySelector('.filter-list');
    if (!filterList) {
        return;
    }
    
    filterList.innerHTML = '<div class="loading">Loading...</div>';
    
    fetch('/articles/config.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('ERROR: ' + response.status);
            }
            return response.json();
        })
        .then(articles => {
            filterList.innerHTML = '';
            
            const fragment = document.createDocumentFragment();
            
            articles.forEach((article, index) => {
                const articleElement = document.createElement('div');
                articleElement.className = `blog-article-block mix all ${article.category} col-lg-6 col-md-12 col-sm-12 wow fadeInUp`;
                articleElement.setAttribute('data-wow-delay', `${index * 500}ms`);
                articleElement.setAttribute('data-wow-duration', '1500ms');
                
                articleElement.innerHTML = `
                    <div class="inner-box">
                        <div class="image">
                            <a href="${article.link}"><img src=${article.image} class="rounded-image" /></a>
                        </div>
                        <div class="lower-content">
                            <ul class="post-meta">
                                <li><a href="${article.link}">${article.categoryDisplay || article.category}</a></li>
                                <li><a href="${article.link}">${article.date}</a></li>
                                <li><a href="${article.link}">${article.author}</a></li>
                            </ul>
                            <h3><a href="${article.link}">${article.title}</a></h3>
                            <div class="text">${article.description}</div>
                        </div>
                    </div>
                `;
                fragment.appendChild(articleElement);
            });
            
            const moreButton = document.createElement('div');
            moreButton.className = 'load-more wow fadeInUp';
            moreButton.setAttribute('data-wow-delay', `${articles.length * 100}ms`);
            moreButton.setAttribute('data-wow-duration', '1500ms');
            moreButton.innerHTML = '<a href="#">More</a>';
            
            fragment.appendChild(moreButton);
            filterList.appendChild(fragment);
            
            initMixitup();
            initWow();
        })
        .catch(error => {
            filterList.innerHTML = `
                <div class="error">
                    ERROR: ${error.message}
                </div>
            `;
        });
}

function initMixitup() {
    if (typeof mixitup !== 'undefined') {
        try {
            const container = document.querySelector('.mixitup-gallery');
            if (container) {
                if (container.mixItUp) {
                    container.mixItUp.destroy();
                }
                
                const mixer = mixitup(container, {
                    animation: {
                        duration: 300
                    }
                });
                
                const filters = document.querySelectorAll('.filter');
                filters.forEach(filter => {
                    filter.addEventListener('click', function() {
                        const filterValue = this.getAttribute('data-filter');
                        filters.forEach(f => f.classList.remove('active'));
                        this.classList.add('active');
                        mixer.filter(filterValue);
                    });
                });
            }
        } catch (e) {
        }
    }
}

function initWow() {
    if (typeof WOW !== 'undefined') {
        try {
            if (!window.wowInitialized) {
                new WOW({
                    boxClass: 'wow',
                    animateClass: 'animated',
                    offset: 100,
                    mobile: true,
                    live: true
                }).init();
                window.wowInitialized = true;
            }
        } catch (e) {
        }
    }
}

document.addEventListener('DOMContentLoaded', function() {
    loadArticles();
    const scrollTopBtn = document.querySelector('.scroll-to-top');
    if (scrollTopBtn) {
        scrollTopBtn.addEventListener('click', function() {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }
    setTimeout(() => {
        document.querySelector('li[data-filter=".community"]').click();
        document.querySelector('li[data-filter="all"]').click();
    }, 500);
});

window.addEventListener('error', function(e) {
});
