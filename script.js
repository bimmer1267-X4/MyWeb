'use strict';

/* ============================================================
   ZenTech — 互動腳本
   功能：
     1. 從 articles.json 動態載入文章
     2. 首頁：Hero 輪播、最新文章、分類文章、熱門側邊欄
     3. 文章頁：渲染完整文章 + YouTube 嵌入 + 相關文章
     4. 漢堡選單 / 搜尋列
   ============================================================ */

/* ── 工具函式 ── */

/** 格式化日期：'2026-03-22' → '2026年3月22日' */
function formatDate(str) {
  const [y, m, d] = str.split('-');
  return `${y}年${parseInt(m)}月${parseInt(d)}日`;
}

/** 格式化日期（短）：'2026-03-22' → '2026.03.22' */
function formatDateShort(str) {
  return str.replace(/-/g, '.');
}

/** 取得 YouTube 縮圖 URL（高畫質，若 maxres 不存在則 fallback） */
function ytThumb(id) {
  return `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
}

/** 從 URL query string 取得參數 */
function getParam(key) {
  return new URLSearchParams(window.location.search).get(key);
}

/** 判斷目前是否在文章頁 */
function isArticlePage() {
  return window.location.pathname.includes('article.html');
}

/* ── 載入文章資料 ── */

let _articlesCache = null;

async function loadArticles() {
  if (_articlesCache) return _articlesCache;
  try {
    const res = await fetch('articles.json');
    if (!res.ok) throw new Error('fetch failed');
    _articlesCache = await res.json();
    return _articlesCache;
  } catch (e) {
    console.error('無法載入 articles.json：', e);
    return [];
  }
}

/* ============================================================
   首頁渲染
   ============================================================ */

/** 渲染 Hero 輪播（前 3 篇） */
function renderHeroSlider(articles) {
  const heroArticles = articles.slice(0, 3);
  const track = document.getElementById('sliderTrack');
  const dotsContainer = document.getElementById('sliderDots');
  if (!track || !dotsContainer) return;

  track.innerHTML = heroArticles.map(a => `
    <article class="slide" style="--bg: url('${ytThumb(a.youtubeId)}')">
      <div class="slide-overlay"></div>
      <div class="slide-content">
        <span class="tag">${a.category}</span>
        <h2><a href="article.html?slug=${a.slug}">${a.title}</a></h2>
        <div class="slide-meta">
          <time datetime="${a.date}">${formatDate(a.date)}</time>
        </div>
      </div>
    </article>
  `).join('');

  dotsContainer.innerHTML = heroArticles.map((_, i) => `
    <button class="dot${i === 0 ? ' active' : ''}" role="tab"
      aria-selected="${i === 0}" aria-label="第 ${i + 1} 張"></button>
  `).join('');
}

/** 渲染「最新文章」欄（精選卡 + 小卡 grid） */
function renderLatestSection(articles) {
  const container = document.getElementById('latestArticles');
  if (!container) return;

  const cat = getParam('cat');
  const tag = getParam('tag');
  let filtered = articles;
  if (cat) filtered = articles.filter(a => a.category === cat);
  if (tag) filtered = articles.filter(a => a.tags.includes(tag));

  // 更新區塊標題
  const titleEl = document.getElementById('mainSectionTitle');
  if (titleEl) {
    if (cat) titleEl.textContent = `${cat} 文章`;
    else if (tag) titleEl.textContent = `標籤：${tag}`;
    else titleEl.textContent = '最新文章';
  }

  if (filtered.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:20px 0;">沒有找到相關文章。</p>';
    return;
  }

  const [featured, ...rest] = filtered;
  const smallCards = rest.slice(0, 6);

  container.innerHTML = `
    <article class="featured-card card">
      <a href="article.html?slug=${featured.slug}" class="card-img-wrap">
        <img src="${ytThumb(featured.youtubeId)}" alt="${featured.title}" loading="lazy" width="800" height="420">
        <span class="card-tag">${featured.category}</span>
      </a>
      <div class="card-body">
        <h3><a href="article.html?slug=${featured.slug}">${featured.title}</a></h3>
        <p class="card-excerpt">${featured.excerpt}</p>
        <div class="card-meta">
          <time datetime="${featured.date}">${formatDateShort(featured.date)}</time>
        </div>
      </div>
    </article>

    ${smallCards.length > 0 ? `
    <div class="cards-grid">
      ${smallCards.map(a => `
        <article class="card small-card">
          <a href="article.html?slug=${a.slug}" class="card-img-wrap">
            <img src="${ytThumb(a.youtubeId)}" alt="${a.title}" loading="lazy" width="400" height="250">
            <span class="card-tag">${a.category}</span>
          </a>
          <div class="card-body">
            <h3><a href="article.html?slug=${a.slug}">${a.title}</a></h3>
            <div class="card-meta">
              <time datetime="${a.date}">${formatDateShort(a.date)}</time>
            </div>
          </div>
        </article>
      `).join('')}
    </div>` : ''}
  `;
}

/** 渲染熱門文章側邊欄（前 5 篇） */
function renderPopularList(articles) {
  const list = document.getElementById('popularList');
  if (!list) return;
  list.innerHTML = articles.slice(0, 5).map((a, i) => `
    <li>
      <a href="article.html?slug=${a.slug}">
        <span class="popular-num">${String(i + 1).padStart(2, '0')}</span>
        <div>
          <p class="popular-title">${a.title}</p>
          <time datetime="${a.date}">${formatDateShort(a.date)}</time>
        </div>
      </a>
    </li>
  `).join('');
}

/** 渲染分類文章區（AI 焦點等） */
function renderCategorySection(articles) {
  const container = document.getElementById('categoryArticles');
  const titleEl = document.getElementById('categorySectionTitle');
  const linkEl = document.getElementById('categorySectionLink');
  if (!container) return;

  // 預設顯示 AI 分類，若已在篩選模式則顯示「評測」
  const currentCat = getParam('cat') || getParam('tag') || getParam('q');
  const displayCat = currentCat ? '評測' : 'AI';

  if (titleEl) titleEl.textContent = `${displayCat} 焦點`;
  if (linkEl) linkEl.href = `index.html?cat=${displayCat}`;

  const catArticles = articles.filter(a => a.category === displayCat).slice(0, 6);
  if (catArticles.length === 0) {
    container.innerHTML = '';
    document.getElementById('categorySection')?.style.setProperty('display', 'none');
    return;
  }

  container.innerHTML = catArticles.map(a => `
    <article class="card">
      <a href="article.html?slug=${a.slug}" class="card-img-wrap">
        <img src="${ytThumb(a.youtubeId)}" alt="${a.title}" loading="lazy" width="600" height="360">
        <span class="card-tag">${a.category}</span>
      </a>
      <div class="card-body">
        <h3><a href="article.html?slug=${a.slug}">${a.title}</a></h3>
        <p class="card-excerpt">${a.excerpt}</p>
        <div class="card-meta">
          <time datetime="${a.date}">${formatDateShort(a.date)}</time>
        </div>
      </div>
    </article>
  `).join('');
}

/* ============================================================
   文章頁渲染
   ============================================================ */

function renderArticlePage(articles) {
  const slug = getParam('slug');
  const main = document.getElementById('articleMain');
  if (!main) return;

  const article = articles.find(a => a.slug === slug);

  if (!article) {
    main.innerHTML = `
      <div class="article-not-found">
        <h2>找不到這篇文章</h2>
        <p>文章可能已被移除，或網址有誤。</p>
        <p><a href="index.html">← 回到首頁</a></p>
      </div>
    `;
    return;
  }

  // 更新 <title> 和 <meta description>
  document.getElementById('pageTitle').textContent = `${article.title} - ZenTech`;
  const descEl = document.getElementById('pageDesc');
  if (descEl) descEl.setAttribute('content', article.excerpt);

  main.innerHTML = `
    <nav class="breadcrumb" aria-label="麵包屑">
      <a href="index.html">首頁</a>
      <span class="sep">›</span>
      <a href="index.html?cat=${article.category}">${article.category}</a>
      <span class="sep">›</span>
      <span class="current">${article.title}</span>
    </nav>

    <div class="article-meta-top">
      <span class="article-cat-tag">${article.category}</span>
      <time class="article-date" datetime="${article.date}">${formatDate(article.date)}</time>
    </div>

    <h1 class="article-title">${article.title}</h1>
    <p class="article-excerpt">${article.excerpt}</p>

    <div class="yt-embed-wrap">
      <iframe
        src="https://www.youtube.com/embed/${article.youtubeId}?rel=0"
        title="${article.title}"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowfullscreen
        loading="lazy">
      </iframe>
    </div>

    <div class="article-body">
      ${article.content.map(item => {
        if (typeof item === 'string') return `<p>${item}</p>`;
        if (item.type === 'image') return `
          <figure class="article-figure">
            <img src="${item.src}" alt="${item.alt || ''}" loading="lazy">
            ${item.caption ? `<figcaption>${item.caption}</figcaption>` : ''}
          </figure>`;
        return '';
      }).join('')}
    </div>

    ${article.tags.length > 0 ? `
    <div class="article-tags">
      ${article.tags.map(t => `<a href="index.html?tag=${t}" class="tag-item">${t}</a>`).join('')}
    </div>` : ''}

    <div class="article-share">
      <span>分享：</span>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(window.location.href)}"
         target="_blank" rel="noopener" class="share-btn fb">Facebook</a>
      <a href="https://www.youtube.com/@Dennis-In-TW"
         target="_blank" rel="noopener" class="share-btn yt">YouTube 頻道</a>
      <a href="https://line.me/R/msg/text/?${encodeURIComponent(article.title + ' ' + window.location.href)}"
         target="_blank" rel="noopener" class="share-btn line">LINE</a>
    </div>
  `;

  // 渲染相關文章（同分類，排除自己）
  const related = articles.filter(a => a.category === article.category && a.slug !== slug).slice(0, 5);
  const relatedList = document.getElementById('relatedList');
  if (relatedList) {
    if (related.length === 0) {
      relatedList.innerHTML = '<li style="color:var(--text-muted);font-size:13px;">暫無相關文章</li>';
    } else {
      relatedList.innerHTML = related.map((a, i) => `
        <li>
          <a href="article.html?slug=${a.slug}">
            <span class="popular-num">${String(i + 1).padStart(2, '0')}</span>
            <div>
              <p class="popular-title">${a.title}</p>
              <time datetime="${a.date}">${formatDateShort(a.date)}</time>
            </div>
          </a>
        </li>
      `).join('');
    }
  }
}

/* ============================================================
   Hero 輪播邏輯
   ============================================================ */
function initSlider() {
  const track = document.getElementById('sliderTrack');
  const dotsContainer = document.getElementById('sliderDots');
  const prevBtn = document.getElementById('sliderPrev');
  const nextBtn = document.getElementById('sliderNext');
  if (!track) return;

  const dots = dotsContainer ? dotsContainer.querySelectorAll('.dot') : [];
  const total = dots.length;
  if (total === 0) return;

  let current = 0;
  let isPaused = false;
  let autoplayTimer = null;

  function goTo(index) {
    current = (index + total) % total;
    track.style.transform = `translateX(-${current * 100}%)`;
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === current);
      d.setAttribute('aria-selected', i === current ? 'true' : 'false');
    });
  }

  function next() { goTo(current + 1); }
  function prev() { goTo(current - 1); }

  function startAutoplay() {
    if (autoplayTimer) clearInterval(autoplayTimer);
    autoplayTimer = setInterval(() => { if (!isPaused) next(); }, 4000);
  }

  function deferResume() {
    isPaused = true;
    clearTimeout(window._sliderResumeTimer);
    window._sliderResumeTimer = setTimeout(() => { isPaused = false; }, 6000);
  }

  dots.forEach((dot, i) => {
    dot.addEventListener('click', () => { goTo(i); deferResume(); });
  });
  prevBtn?.addEventListener('click', () => { prev(); deferResume(); });
  nextBtn?.addEventListener('click', () => { next(); deferResume(); });

  let touchStartX = 0;
  track.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  track.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); deferResume(); }
  }, { passive: true });

  track.addEventListener('mouseenter', () => { isPaused = true; });
  track.addEventListener('mouseleave', () => { isPaused = false; });

  goTo(0);
  startAutoplay();
}

/* ============================================================
   漢堡選單
   ============================================================ */
function initHamburger() {
  const hamburger = document.getElementById('hamburger');
  const mainNav = document.getElementById('mainNav');
  if (!hamburger || !mainNav) return;

  hamburger.addEventListener('click', () => {
    const isOpen = mainNav.classList.toggle('open');
    hamburger.classList.toggle('open', isOpen);
    hamburger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  mainNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      mainNav.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      mainNav.classList.remove('open');
      hamburger.classList.remove('open');
      hamburger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }
  });
}

/* ============================================================
   主程式入口
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  initHamburger();

  const articles = await loadArticles();

  if (isArticlePage()) {
    // 文章頁
    renderArticlePage(articles);
  } else {
    // 首頁
    renderHeroSlider(articles);
    initSlider();
    renderLatestSection(articles);
    renderPopularList(articles);
    renderCategorySection(articles);
  }
});
