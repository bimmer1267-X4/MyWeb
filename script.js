'use strict';

/* ============================================================
   ２３３０．順順來 — 互動腳本
   功能：
     1. 首頁：即時科技新聞、TSMC 儀表板 iframe 高度同步
     2. 文章頁：從 articles.json 渲染完整文章 + YouTube 嵌入 + 相關文章
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

/** 去除HTML標籤取得純文字（rss2json的description/content欄位是原始RSS描述的HTML片段） */
function stripHtml(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

/* ── 載入文章資料 ── */

let _articlesCache = null;

async function loadArticles() {
  if (_articlesCache) return _articlesCache;
  try {
    const res = await fetch('articles.json');
    if (!res.ok) throw new Error('fetch failed');
    const data = await res.json();
    _articlesCache = data.sort((a, b) => new Date(b.date) - new Date(a.date));
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

/** 透過 rss2json 抓取單一來源；count 預設10（首頁小工具用），新聞卡片牆頁面會傳較大的值。
 *  fetch() 本身沒有內建逾時，count拉高時rss2json有時回應會變慢甚至不回應，用
 *  AbortController加一個逾時上限，避免呼叫端(render函式)因為Promise永遠不resolve
 *  而卡在loading spinner畫面出不來 */
async function fetchRSS(source, count = 10, timeoutMs = 12000) {
  const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}&count=${count}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(api, { signal: controller.signal });
    const data = await res.json();
    if (data.status !== 'ok') return [];
    return data.items.map(item => ({
      title:     item.title.trim(),
      link:      item.link,
      pubDate:   new Date(item.pubDate),
      source:    source.name,
      bg:        source.bg,
      text:      source.text,
      // thumbnail/description不是每則新聞都有，缺欄位時給空字串，渲染端各自優雅處理
      thumbnail: item.thumbnail || '',
      excerpt:   stripHtml(item.description || item.content || '').slice(0, 90),
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
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

/* ── 台積電（2330）個股新聞來源設定 ── */
const TSMC_NEWS_SOURCE = {
  name: 'Google 新聞',
  url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('台積電 OR 2330') + '&hl=zh-TW&gl=TW&ceid=TW:zh-Hant',
};

/** 渲染台積電（2330）個股新聞區（做法同即時科技新聞，只是只抓台積電相關） */
async function renderTsmcNews() {
  const container = document.getElementById('tsmcNews');
  if (!container) return;

  const items = (await fetchRSS(TSMC_NEWS_SOURCE)).sort((a, b) => b.pubDate - a.pubDate).slice(0, 12);

  if (!items.length) {
    container.innerHTML = '<p class="news-error">暫時無法取得台積電相關新聞，請稍後重新整理。</p>';
    return;
  }

  container.innerHTML = `
    <div class="news-hero-header">
      <span class="news-live-dot"></span>
      <span class="news-hero-label">台積電（2330）即時新聞</span>
    </div>
    <ul class="news-list">
      ${items.map(item => `
        <li class="news-item">
          <a href="${item.link}" target="_blank" rel="noopener noreferrer">${item.title}</a>
          <span class="news-time">${timeAgo(item.pubDate)}</span>
        </li>
      `).join('')}
    </ul>
  `;
}

/* ============================================================
   新聞卡片牆頁面（news-tsmc.html / news-tech.html）
   跟首頁小工具共用同一份 NEWS_SOURCES/TSMC_NEWS_SOURCE/fetchRSS，
   差別只在拉高抓取筆數、不截斷、多渲染圖片與摘要
   ============================================================ */

/** 產生單則新聞卡片HTML；showBadge=true時顯示來源badge(多來源的科技新聞頁用) */
function newsCardHtml(item, showBadge) {
  return `
    <a class="news-card" href="${item.link}" target="_blank" rel="noopener noreferrer">
      ${item.thumbnail ? `
        <div class="news-card-img">
          <img src="${item.thumbnail}" alt="" loading="lazy" onerror="this.closest('.news-card-img').remove()">
        </div>` : ''}
      <div class="news-card-body">
        ${showBadge ? `<span class="news-badge" style="background:${item.bg};color:${item.text};">${item.source}</span>` : ''}
        <h3 class="news-card-title">${item.title}</h3>
        ${item.excerpt ? `<p class="news-card-excerpt">${item.excerpt}</p>` : ''}
        <span class="news-card-time">${timeAgo(item.pubDate)}</span>
      </div>
    </a>
  `;
}

/** 渲染即時科技新聞卡片牆（news-tech.html）：三個來源全部合併，依時間新到舊排序，不截斷筆數 */
async function renderNewsHeroFull() {
  const container = document.getElementById('newsHeroFull');
  if (!container) return;

  const results = await Promise.all(NEWS_SOURCES.map(s => fetchRSS(s, 30)));
  const all = results.flat().sort((a, b) => b.pubDate - a.pubDate);

  if (!all.length) {
    container.innerHTML = '<p class="news-error">暫時無法取得新聞資料，請稍後重新整理。</p>';
    return;
  }

  container.innerHTML = all.map(item => newsCardHtml(item, true)).join('');
}

/** 渲染台積電（2330）即時新聞卡片牆（news-tsmc.html）：依時間新到舊排序，不截斷筆數 */
async function renderTsmcNewsFull() {
  const container = document.getElementById('tsmcNewsFull');
  if (!container) return;

  const items = (await fetchRSS(TSMC_NEWS_SOURCE, 30)).sort((a, b) => b.pubDate - a.pubDate);

  if (!items.length) {
    container.innerHTML = '<p class="news-error">暫時無法取得台積電相關新聞，請稍後重新整理。</p>';
    return;
  }

  container.innerHTML = items.map(item => newsCardHtml(item, false)).join('');
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
  document.getElementById('pageTitle').textContent = `${article.title} - ２３３０．順順來`;
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
      <a href="https://www.youtube.com/@shunshun-dev"
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
   TSMC (2330) 儀表板 iframe 高度同步
   ============================================================ */
function initDashboardEmbed() {
  const frame = document.getElementById('dashboardFrame');
  if (!frame) return;
  window.addEventListener('message', (e) => {
    if (e.origin !== 'https://bimmer1267-x4.github.io') return;
    if (!e.data || e.data.type !== 'tsmc-dashboard-height') return;
    const height = Number(e.data.height);
    if (height > 0) frame.style.height = `${height}px`;
  });
}

/* ============================================================
   主程式入口
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {
  initDashboardEmbed();

  if (isArticlePage()) {
    // 文章頁
    const articles = await loadArticles();
    renderArticlePage(articles);
  } else if (document.getElementById('tsmcNewsFull')) {
    // 台積電（2330）即時新聞卡片牆頁
    renderTsmcNewsFull();
  } else if (document.getElementById('newsHeroFull')) {
    // 即時科技新聞卡片牆頁
    renderNewsHeroFull();
  } else {
    // 首頁：即時新聞
    renderNewsHero();
    renderTsmcNews();
  }
});
