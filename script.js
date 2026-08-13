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

/** 從新聞連結網域取得favicon小圖標網址（用Google公開的favicon服務，不依賴
 *  rss2json的thumbnail欄位——Google新聞RSS本身的description沒有內嵌圖片，
 *  rss2json抓不到縮圖，改用來源網站的favicon當小圖標） */
function faviconUrl(link) {
  try {
    const hostname = new URL(link).hostname;
    return `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
  } catch {
    return '';
  }
}

/** 簡單字串雜湊（純前端演算，不抓任何外部資料），同一個標題永遠算出同一個值 */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0; // 轉成32位元整數
  }
  return Math.abs(hash);
}

/** 依標題算出一組固定的漸層色帶（同一則新聞每次重新整理顏色都一樣），
 *  取代真實文章配圖——這個新聞來源(Google新聞RSS)本身沒有圖可用 */
function gradientForTitle(title) {
  const hue1 = hashString(title) % 360;
  const hue2 = (hue1 + 45) % 360;
  return `linear-gradient(135deg, hsl(${hue1}, 70%, 55%), hsl(${hue2}, 70%, 55%))`;
}

/** 透過 rss2json 抓取單一來源。注意：刻意不加任何新參數（例如count/timeoutMs）——
 *  這裡多帶favicon只是多衍生資料，不影響函式簽名，也就不會影響到其他直接把
 *  fetchRSS當回呼傳的地方(例如即時科技新聞用的NEWS_SOURCES.map(fetchRSS))，
 *  維持首頁完全不受影響。（曾經多帶excerpt，但Google新聞RSS的description欄位
 *  實測只是「標題+來源名稱」，跟標題幾乎重複、沒有實質摘要價值，已拿掉不用） */
async function fetchRSS(source) {
  const api = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}&count=10`;
  try {
    const res = await fetch(api);
    const data = await res.json();
    if (data.status !== 'ok') return [];
    return data.items.map(item => ({
      title:     item.title.trim(),
      link:      item.link,
      pubDate:   new Date(item.pubDate),
      source:    source.name,
      bg:        source.bg,
      text:      source.text,
      favicon:   faviconUrl(item.link),
    }));
  } catch {
    return [];
  }
}

/** 產生「即時科技新聞」黑色列表區塊的HTML；首頁小工具跟news-tech.html新頁面共用
 *  同一份render邏輯與資料，維持單一資料來源（比照tsmcNewsListHtml的作法） */
function newsHeroListHtml(items) {
  return `
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

  container.innerHTML = newsHeroListHtml(all.slice(0, 16));
}

/* ── 台積電（2330）個股新聞來源設定 ── */
const TSMC_NEWS_SOURCE = {
  name: 'Google 新聞',
  url: 'https://news.google.com/rss/search?q=' + encodeURIComponent('台積電 OR 2330') + '&hl=zh-TW&gl=TW&ceid=TW:zh-Hant',
};

/** 產生「台積電新聞」黑色列表區塊的HTML；首頁小工具跟news-tsmc.html新頁面共用
 *  同一份render邏輯與資料，維持單一資料來源 */
function tsmcNewsListHtml(items) {
  return `
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

/** 渲染台積電（2330）個股新聞區（做法同即時科技新聞，只是只抓台積電相關） */
async function renderTsmcNews() {
  const container = document.getElementById('tsmcNews');
  if (!container) return;

  const items = (await fetchRSS(TSMC_NEWS_SOURCE)).sort((a, b) => b.pubDate - a.pubDate).slice(0, 12);

  if (!items.length) {
    container.innerHTML = '<p class="news-error">暫時無法取得台積電相關新聞，請稍後重新整理。</p>';
    return;
  }

  container.innerHTML = tsmcNewsListHtml(items);
}

/** 渲染「台積電(2330)即時新聞」選單頁面（news-tsmc.html專用）：只fetch一次，
 *  同一批資料同時渲染上方黑色列表(跟首頁一樣)跟下方卡片牆，不是分開再打一次API */
async function renderTsmcNewsPage() {
  const listEl = document.getElementById('tsmcNews');
  const cardEl = document.getElementById('tsmcNewsCards');
  if (!listEl || !cardEl) return;

  const items = (await fetchRSS(TSMC_NEWS_SOURCE)).sort((a, b) => b.pubDate - a.pubDate).slice(0, 10);

  if (!items.length) {
    listEl.innerHTML = '<p class="news-error">暫時無法取得台積電相關新聞，請稍後重新整理。</p>';
    return;
  }

  listEl.innerHTML = tsmcNewsListHtml(items);
  cardEl.innerHTML = items.map(item => newsCardHtml(item)).join('');
}

/** 產生單則新聞卡片HTML；showBadge=true時額外顯示來源badge(即時科技新聞是多
 *  來源，需要標出各則來自哪個來源；台積電新聞只有單一來源不需要) */
function newsCardHtml(item, showBadge = false) {
  return `
    <a class="news-card" href="${item.link}" target="_blank" rel="noopener noreferrer">
      <div class="news-card-accent" style="background:${gradientForTitle(item.title)};"></div>
      <div class="news-card-body">
        <div class="news-card-meta">
          ${item.favicon ? `<img class="news-card-favicon" src="${item.favicon}" alt="" loading="lazy" onerror="this.remove()">` : ''}
          ${showBadge ? `<span class="news-badge" style="background:${item.bg};color:${item.text};">${item.source}</span>` : ''}
          <span class="news-card-time">${timeAgo(item.pubDate)}</span>
        </div>
        <h3 class="news-card-title">${item.title}</h3>
      </div>
    </a>
  `;
}

/** 渲染「即時科技新聞」選單頁面（news-tech.html專用）：只fetch一次，
 *  同一批資料同時渲染上方黑色列表(跟首頁一樣)跟下方卡片牆，不是分開再打一次API */
async function renderNewsHeroPage() {
  const listEl = document.getElementById('newsHero');
  const cardEl = document.getElementById('newsHeroCards');
  if (!listEl || !cardEl) return;

  const results = await Promise.all(NEWS_SOURCES.map(s => fetchRSS(s)));
  const all = results.flat().sort((a, b) => b.pubDate - a.pubDate);

  if (!all.length) {
    listEl.innerHTML = '<p class="news-error">暫時無法取得新聞資料，請稍後重新整理。</p>';
    return;
  }

  const items = all.slice(0, 16);
  listEl.innerHTML = newsHeroListHtml(items);
  cardEl.innerHTML = items.map(item => newsCardHtml(item, true)).join('');
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
  } else if (document.getElementById('tsmcNewsCards')) {
    // 台積電（2330）即時新聞選單頁
    renderTsmcNewsPage();
  } else if (document.getElementById('newsHeroCards')) {
    // 即時科技新聞選單頁
    renderNewsHeroPage();
  } else {
    // 首頁：即時新聞
    renderNewsHero();
    renderTsmcNews();
  }
});
