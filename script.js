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

/** 取得 YouTube 縮圖 URL（優先最高畫質） */
function ytThumb(id) {
  return `https://img.youtube.com/vi/${id}/maxresdefault.jpg`;
}

/** 縮圖載入後檢查：若是 120×90 預設灰圖則降級 */
function ytThumbCheck(img) {
  const id = img.src.match(/vi\/([^/]+)\//)?.[1];
  if (!id) return;
  if (img.naturalWidth <= 120) {
    // maxresdefault 不存在，改用 sddefault（640×480）
    if (img.src.includes('maxresdefault')) {
      img.src = `https://img.youtube.com/vi/${id}/sddefault.jpg`;
    } else if (img.src.includes('sddefault')) {
      img.src = `https://img.youtube.com/vi/${id}/hqdefault.jpg`;
    }
  }
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

/* ── 即時新聞來源設定 ── */
const NEWS_SOURCES = [
  {
    name: '科技新報',
    url: 'https://technews.tw/feed/',
    bg: '#172554', text: '#93c5fd',
  },
  {
    name: '數位時代',
    url: 'https://www.bnext.com.tw/rss',
    bg: '#14532d', text: '#86efac',
  },
  {
    name: 'iThome',
    url: 'https://www.ithome.com.tw/rss',
    bg: '#431407', text: '#fdba74',
  },
];

/** 把 RSS 日期距今轉為「xx 分鐘前」格式 */
function timeAgo(date) {
  const mins = Math.floor((Date.now() - date) / 60000);
  if (mins < 1)  return '剛剛';
  if (mins < 60) return `${mins} 分鐘前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs} 小時前`;
  return `${Math.floor(hrs / 24)} 天前`;
}

/** 透過 rss2json 抓取單一來源 */
async function fetchRSS(source) {
  const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}&count=10`;
  try {
    const res = await fetch(api);
    const data = await res.json();
    if (data.status !== 'ok') return [];
    return data.items.map(item => ({
      title:   item.title.trim(),
      link:    item.link,
      pubDate: new Date(item.pubDate),
      source:  source.name,
      bg:      source.bg,
      text:    source.text,
    }));
  } catch {
    return [];
  }
}

/** 渲染即時科技新聞區（取代 Hero Slider） */
async function renderNewsHero() {
  const container = document.getElementById('newsHero');
  if (!container) return;

  // 並行抓取所有來源
  const results = await Promise.all(NEWS_SOURCES.map(fetchRSS));
  const all = results.flat().sort((a, b) => b.pubDate - a.pubDate);

  if (!all.length) {
    container.innerHTML = '<p class="news-error">暫時無法取得新聞資料，請稍後重新整理。</p>';
    return;
  }

  const items = all.slice(0, 16);

  container.innerHTML = `
    <div class="news-hero-header">
      <span class="news-live-dot"></span>
      <span class="news-hero-label">即時科技新聞</span>
      <div class="news-source-tags">
        ${NEWS_SOURCES.map(s =>
          `<span class="news-stag" style="background:${s.bg};color:${s.text};">${s.name}</span>`
        ).join('')}
      </div>
    </div>
    <ul class="news-list">
      ${items.map(item => `
        <li class="news-item">
          <span class="news-badge" style="background:${item.bg};color:${item.text};">${item.source}</span>
          <a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
          <span class="news-time">${timeAgo(item.pubDate)}</span>
        </li>
      `).join('')}
    </ul>
  `;
}

const PER_PAGE = 7; // 每頁：1 精選 + 6 小卡

/** 產生分頁網址 */
function pageUrl(p, cat, tag) {
  const params = new URLSearchParams();
  if (cat) params.set('cat', cat);
  if (tag) params.set('tag', tag);
  if (p > 1) params.set('page', String(p));
  const q = params.toString();
  return `index.html${q ? '?' + q : ''}`;
}

/** 渲染頁碼列 */
function renderPagination(current, total, cat, tag) {
  if (total <= 1) return '';

  // 產生頁碼序列（含省略號）
  const nums = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || Math.abs(i - current) <= 1) {
      nums.push(i);
    } else if (nums[nums.length - 1] !== '…') {
      nums.push('…');
    }
  }

  const prev = current > 1
    ? `<a href="${pageUrl(current - 1, cat, tag)}" class="page-btn" aria-label="上一頁">‹</a>`
    : `<span class="page-btn disabled">‹</span>`;
  const next = current < total
    ? `<a href="${pageUrl(current + 1, cat, tag)}" class="page-btn" aria-label="下一頁">›</a>`
    : `<span class="page-btn disabled">›</span>`;

  const pages = nums.map(n =>
    n === '…'
      ? `<span class="page-ellipsis">…</span>`
      : `<a href="${pageUrl(n, cat, tag)}" class="page-btn${n === current ? ' active' : ''}">${n}</a>`
  ).join('');

  return `<nav class="pagination" aria-label="文章分頁">${prev}${pages}${next}</nav>`;
}

/** 渲染「最新文章」欄（精選卡 + 小卡 grid + 分頁） */
function renderLatestSection(articles) {
  const container = document.getElementById('latestArticles');
  if (!container) return;

  const cat  = getParam('cat');
  const tag  = getParam('tag');
  const page = Math.max(1, parseInt(getParam('page') || '1', 10));

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

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const safePage   = Math.min(page, totalPages);
  const pageItems  = filtered.slice((safePage - 1) * PER_PAGE, safePage * PER_PAGE);
  const [featured, ...rest] = pageItems;

  container.innerHTML = `
    <article class="featured-card card">
      <a href="article.html?slug=${featured.slug}" class="card-img-wrap">
        <img src="${ytThumb(featured.youtubeId)}" alt="${featured.title}" loading="lazy" width="800" height="420" onload="ytThumbCheck(this)">
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

    ${rest.length > 0 ? `
    <div class="cards-grid">
      ${rest.map(a => `
        <article class="card small-card">
          <a href="article.html?slug=${a.slug}" class="card-img-wrap">
            <img src="${ytThumb(a.youtubeId)}" alt="${a.title}" loading="lazy" width="400" height="250" onload="ytThumbCheck(this)">
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

    ${renderPagination(safePage, totalPages, cat, tag)}
  `;
}

/** 渲染熱門標籤（從所有文章的 tags 統計） */
function renderTagCloud(articles) {
  const el = document.getElementById('tagCloud');
  if (!el) return;
  const count = {};
  articles.forEach(a => (a.tags || []).forEach(t => { count[t] = (count[t] || 0) + 1; }));
  const sorted = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (!sorted.length) { el.style.display = 'none'; return; }
  el.innerHTML = sorted.map(([tag]) =>
    `<a href="index.html?tag=${encodeURIComponent(tag)}" class="tag-item">${tag}</a>`
  ).join('');
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
        <img src="${ytThumb(a.youtubeId)}" alt="${a.title}" loading="lazy" width="600" height="360" onload="ytThumbCheck(this)">
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
    // 首頁：並行執行新聞抓取 + 文章渲染
    renderNewsHero(); // 不 await，讓新聞與文章同時載入
    renderLatestSection(articles);
    renderPopularList(articles);
    renderTagCloud(articles);
    renderCategorySection(articles);
  }
});
