const GALLERY_URL_CANDIDATES = [
  (id) => ({ type: "regular", url: `https://gall.dcinside.com/board/lists/?id=${encodeURIComponent(id)}` }),
  (id) => ({ type: "minor", url: `https://gall.dcinside.com/mgallery/board/lists/?id=${encodeURIComponent(id)}` }),
  (id) => ({ type: "mini", url: `https://gall.dcinside.com/mini/board/lists/?id=${encodeURIComponent(id)}` })
];

const KBO_TEAM_COLORS = {
  ncdinos: "#315288",
  giants_new3: "#041E42",
  hanwhaeagles_new: "#FC4E00",
  doosanbears_new1: "#1A1748",
  tigers_new2: "#EA0029",
  sh_new: "#570514",
  lgtwins_new: "#C30452",
  samsunglions_new: "#074CA1",
  skwyverns_new1: "#CE0E2D",
  ktwiz: "#000000"
};

const RANDOM_BADGE_COLORS = [
  "#4F46E5",
  "#0F766E",
  "#B45309",
  "#BE185D",
  "#1D4ED8",
  "#15803D",
  "#7C3AED",
  "#C2410C",
  "#334155",
  "#0E7490",
  "#9333EA",
  "#A16207"
];

const DEFAULT_PRESETS = [
  { name: "프리셋1", galleries: [] },
  { name: "프리셋2", galleries: [] },
  { name: "프리셋3", galleries: [] }
];

const POSTS_PER_PAGE = 50;

const statusEl = document.getElementById("status");
const tbody = document.getElementById("postTableBody");
const reloadBtn = document.getElementById("reloadBtn");
const themeToggleBtn = document.getElementById("themeToggleBtn");
const galleryFilterToggleBtn = document.getElementById("galleryFilterToggleBtn");
const recommendFilterToggleBtn = document.getElementById("recommendFilterToggleBtn");
const galleryFilterPanel = document.getElementById("galleryFilterPanel");
const recommendFilterPanel = document.getElementById("recommendFilterPanel");
const galleryCheckboxList = document.getElementById("galleryCheckboxList");
const recommendMinInput = document.getElementById("recommendMinInput");
const applyRecommendFilterBtn = document.getElementById("applyRecommendFilterBtn");
const resetRecommendFilterBtn = document.getElementById("resetRecommendFilterBtn");
const viewerSubText = document.getElementById("viewerSubText");
const viewerTitle = document.getElementById("viewerTitle");
const paginationEl = document.getElementById("pagination");
const sortButtons = [...document.querySelectorAll(".sort-btn")];

let allPosts = [];
let currentSort = "latest";
let currentTheme = "light";
let currentPreset = { name: "프리셋1", galleries: [] };
let selectedGalleryIds = new Set();
let recommendMinFilter = 0;
let currentPage = 1;

function setStatus(text) {
  if (statusEl) statusEl.textContent = text;
}

function cloneDefaultPresets() {
  return DEFAULT_PRESETS.map((preset) => ({
    name: preset.name,
    galleries: []
  }));
}

async function ensureStorageState() {
  const stored = await chrome.storage.local.get([
    "presets",
    "activePresetIndex",
    "galleries",
    "viewerTheme",
    "viewerSelectedGalleryIds",
    "viewerRecommendMin"
  ]);

  let presets = Array.isArray(stored.presets) && stored.presets.length === 3
    ? stored.presets.map((preset, index) => ({
      name: preset?.name || `프리셋${index + 1}`,
      galleries: Array.isArray(preset?.galleries) ? preset.galleries : []
    }))
    : cloneDefaultPresets();

  if ((!stored.presets || !Array.isArray(stored.presets)) && Array.isArray(stored.galleries) && stored.galleries.length) {
    presets[0].galleries = stored.galleries;
  }

  let activePresetIndex = Number.isInteger(stored.activePresetIndex) ? stored.activePresetIndex : 0;
  if (activePresetIndex < 0 || activePresetIndex > 2) activePresetIndex = 0;

  await chrome.storage.local.set({ presets, activePresetIndex });

  return {
    presets,
    activePresetIndex,
    viewerTheme: stored.viewerTheme,
    viewerSelectedGalleryIds: Array.isArray(stored.viewerSelectedGalleryIds) ? stored.viewerSelectedGalleryIds : null,
    viewerRecommendMin: Number.isFinite(stored.viewerRecommendMin) ? stored.viewerRecommendMin : 0
  };
}

function extractNumber(text) {
  if (!text) return 0;
  const cleaned = String(text).replace(/[^0-9]/g, "");
  const num = parseInt(cleaned, 10);
  return Number.isFinite(num) ? num : 0;
}

function normalizeGalleryName(rawTitle) {
  if (!rawTitle) return "";
  return rawTitle
    .replace(/\s*-\s*커뮤니티 포털 디시인사이드\s*$/i, "")
    .replace(/\s*(마이너|미니)?\s*갤러리\s*$/i, "")
    .trim();
}

function isNoticeOrAd(row) {
  const numCell = row.querySelector("td.gall_num, td:nth-child(1)");
  const titleCell = row.querySelector("td.gall_tit, td:nth-child(2)");
  const rowText = row.textContent.replace(/\s+/g, " ").trim();

  const numText = numCell?.textContent?.trim() || "";
  const titleText = titleCell?.textContent?.replace(/\s+/g, " ").trim() || "";
  const classText = row.className || "";

  const looksNotice =
    /공지|설문|이벤트|AD|광고/i.test(numText) ||
    /공지|설문|이벤트|AD|광고/i.test(titleText) ||
    /notice|fixed/i.test(classText);

  const numIsPureNumber = /^[0-9]+$/.test(numText);

  if (looksNotice) return true;
  if (!numIsPureNumber && /공지|설문|이벤트|광고/i.test(rowText)) return true;

  return false;
}

function parseDcDate(dateText) {
  if (!dateText) {
    return { timestamp: 0, precision: 0 };
  }

  const text = String(dateText).trim();
  const now = new Date();

  let m = text.match(/^(\d{4})[-.](\d{2})[-.](\d{2})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, y, mo, d, h, mi, s] = m;
    return {
      timestamp: new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s || 0)).getTime(),
      precision: 4
    };
  }

  m = text.match(/^(\d{4})[-.](\d{2})[-.](\d{2})$/);
  if (m) {
    const [, y, mo, d] = m;
    return {
      timestamp: new Date(Number(y), Number(mo) - 1, Number(d), 0, 0, 0).getTime(),
      precision: 3
    };
  }

  m = text.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (m) {
    const [, h, mi, s] = m;
    return {
      timestamp: new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(h), Number(mi), Number(s || 0)).getTime(),
      precision: 5
    };
  }

  m = text.match(/^(\d{2})[.-](\d{2})$/);
  if (m) {
    const [, mo, d] = m;
    return {
      timestamp: new Date(now.getFullYear(), Number(mo) - 1, Number(d), 0, 0, 0).getTime(),
      precision: 2
    };
  }

  const parsed = Date.parse(text);
  if (!Number.isNaN(parsed)) {
    return { timestamp: parsed, precision: 1 };
  }

  return { timestamp: 0, precision: 0 };
}

function getHeaderIndexMap(doc) {
  const table = doc.querySelector("table");
  const ths = table ? [...table.querySelectorAll("thead th, tr th")] : [];

  const map = {
    title: -1,
    date: -1,
    views: -1,
    recommend: -1
  };

  ths.forEach((th, index) => {
    const text = th.textContent.replace(/\s+/g, "").trim();

    if (text.includes("제목")) map.title = index;
    else if (text.includes("작성일") || text.includes("날짜")) map.date = index;
    else if (text.includes("조회")) map.views = index;
    else if (text.includes("추천")) map.recommend = index;
  });

  return map;
}

function getCellByHeaderIndex(row, index) {
  if (index < 0) return null;
  const cells = row.querySelectorAll("td");
  return cells[index] || null;
}

function getCommentCountFromTitleCell(titleCell) {
  if (!titleCell) return 0;

  const candidates = [
    ".reply_numbox",
    ".reply_num",
    ".num_reply",
    "em.reply_num",
    "span.reply_num"
  ];

  for (const selector of candidates) {
    const el = titleCell.querySelector(selector);
    if (el) return extractNumber(el.textContent);
  }

  const text = titleCell.textContent.replace(/\s+/g, " ").trim();

  let m = text.match(/\[(\d+)\]/);
  if (m) return Number(m[1]);

  m = text.match(/\((\d+)\)$/);
  if (m) return Number(m[1]);

  return 0;
}

function getPostNumber(row, href) {
  const numCell = row.querySelector("td.gall_num");
  const cellNum = extractNumber(numCell?.textContent);
  if (cellNum > 0) return cellNum;

  try {
    const fullUrl = href.startsWith("http") ? href : `https://gall.dcinside.com${href}`;
    const url = new URL(fullUrl);
    const no = extractNumber(url.searchParams.get("no"));
    if (no > 0) return no;
  } catch (e) { }

  return 0;
}

function hexToRgb(hex) {
  const normalized = String(hex).replace("#", "").trim();
  const full = normalized.length === 3 ? normalized.split("").map((ch) => ch + ch).join("") : normalized;
  const num = parseInt(full, 16);

  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  };
}

function getContrastTextColor(hex) {
  const { r, g, b } = hexToRgb(hex);
  const brightness = (r * 299 + g * 587 + b * 114) / 1000;
  return brightness >= 145 ? "#111111" : "#ffffff";
}

function getHashNumber(text) {
  let hash = 0;
  const value = String(text || "");
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function getGalleryBadgeStyle(galleryId) {
  const id = String(galleryId || "").trim().toLowerCase();
  let backgroundColor = KBO_TEAM_COLORS[id];

  if (!backgroundColor) {
    const hash = getHashNumber(id);
    backgroundColor = RANDOM_BADGE_COLORS[hash % RANDOM_BADGE_COLORS.length];
  }

  const color = getContrastTextColor(backgroundColor);
  return `background:${backgroundColor};color:${color};border-color:${backgroundColor};`;
}

async function fetchGalleryDocs(id, pageCount = 2) {
  for (const maker of GALLERY_URL_CANDIDATES) {
    const info = maker(id);

    try {
      const docs = [];
      let galleryName = "";

      for (let page = 1; page <= pageCount; page++) {
        const pageUrl = `${info.url}&page=${page}`;
        const res = await fetch(pageUrl, { credentials: "include" });
        if (!res.ok) continue;

        const html = await res.text();

        if (
          html.includes("존재하지 않는") ||
          html.includes("잘못된 접근") ||
          html.includes("페이지를 찾을 수 없습니다")
        ) {
          continue;
        }

        const doc = new DOMParser().parseFromString(html, "text/html");
        const title = normalizeGalleryName(doc.querySelector("title")?.textContent?.trim() || "");

        if (title && (doc.querySelector("table.gall_list") || doc.querySelector("tbody tr"))) {
          if (!galleryName) galleryName = title;
          docs.push(doc);
        }
      }

      if (docs.length) {
        return { docs, galleryName };
      }
    } catch (e) {
      console.error("fetchGalleryDocs error:", e);
    }
  }

  throw new Error(`갤러리 조회 실패: ${id}`);
}

function parseGalleryPosts(doc, galleryName, galleryId) {
  const rows = [...doc.querySelectorAll("tbody tr")];
  const posts = [];
  const headerIndexMap = getHeaderIndexMap(doc);

  rows.forEach((row, rowIndex) => {
    if (isNoticeOrAd(row)) return;

    const titleCell =
      row.querySelector("td.gall_tit") ||
      getCellByHeaderIndex(row, headerIndexMap.title);

    const linkEl =
      titleCell?.querySelector("a[href*='/board/view/']") ||
      titleCell?.querySelector("a[href*='view']") ||
      row.querySelector("a[href*='/board/view/']") ||
      row.querySelector("a[href*='view']");

    if (!titleCell || !linkEl) return;

    const title = linkEl.textContent.replace(/\s+/g, " ").trim();
    if (!title) return;

    const href = linkEl.getAttribute("href") || "";
    const fullUrl = href.startsWith("http") ? href : `https://gall.dcinside.com${href}`;

    const recommendCell =
      row.querySelector("td.gall_recommend") ||
      getCellByHeaderIndex(row, headerIndexMap.recommend);

    const viewsCell =
      row.querySelector("td.gall_count, td.gall_hit") ||
      getCellByHeaderIndex(row, headerIndexMap.views);

    const dateCell =
      row.querySelector("td.gall_date") ||
      getCellByHeaderIndex(row, headerIndexMap.date);

    const recommend = extractNumber(recommendCell?.textContent);
    const comments = getCommentCountFromTitleCell(titleCell);
    const views = extractNumber(viewsCell?.textContent);

    const dateText =
      dateCell?.getAttribute("title") ||
      dateCell?.textContent?.trim() ||
      "-";

    const { timestamp, precision } = parseDcDate(dateText);
    const postNo = getPostNumber(row, href);

    posts.push({
      galleryId,
      galleryName,
      title,
      url: fullUrl,
      recommend,
      comments,
      views,
      dateText,
      timestamp,
      precision,
      postNo,
      rowOrder: rowIndex
    });
  });

  return posts;
}
function dedupePosts(posts) {
  const map = new Map();

  posts.forEach((post) => {
    const key = post.url || `${post.galleryId}-${post.postNo}`;
    if (!map.has(key)) {
      map.set(key, post);
    }
  });

  return [...map.values()];
}
function sortPosts(posts, sortType) {
  const copied = [...posts];

  if (sortType === "recommend") {
    copied.sort((a, b) =>
      b.recommend - a.recommend ||
      b.comments - a.comments ||
      b.timestamp - a.timestamp ||
      b.precision - a.precision ||
      a.rowOrder - b.rowOrder
    );
  } else if (sortType === "comments") {
    copied.sort((a, b) =>
      b.comments - a.comments ||
      b.recommend - a.recommend ||
      b.timestamp - a.timestamp ||
      b.precision - a.precision ||
      a.rowOrder - b.rowOrder
    );
  } else if (sortType === "views") {
    copied.sort((a, b) =>
      b.views - a.views ||
      b.recommend - a.recommend ||
      b.timestamp - a.timestamp ||
      b.precision - a.precision ||
      a.rowOrder - b.rowOrder
    );
  } else {
    copied.sort((a, b) =>
      b.timestamp - a.timestamp ||
      b.precision - a.precision ||
      b.postNo - a.postNo ||
      a.rowOrder - b.rowOrder
    );
  }

  return copied;
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function getThemeLabel(theme) {
  return theme === "dark" ? "라이트모드" : "다크모드";
}

function applyTheme(theme) {
  currentTheme = theme === "dark" ? "dark" : "light";
  document.body.classList.toggle("dark", currentTheme === "dark");
  if (themeToggleBtn) themeToggleBtn.textContent = getThemeLabel(currentTheme);
}

async function loadTheme(themeValue) {
  const theme = themeValue === "dark" ? "dark" : "light";
  applyTheme(theme);
}

async function toggleTheme() {
  const nextTheme = currentTheme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  await chrome.storage.local.set({ viewerTheme: nextTheme });
}

function openPanel(panel) {
  const willOpen = panel && !panel.classList.contains("open");

  [galleryFilterPanel, recommendFilterPanel].forEach((target) => {
    if (!target) return;
    target.classList.remove("open");
  });

  if (galleryFilterToggleBtn) galleryFilterToggleBtn.classList.remove("active");
  if (recommendFilterToggleBtn) recommendFilterToggleBtn.classList.remove("active");

  if (panel && willOpen) {
    panel.classList.add("open");

    if (panel === galleryFilterPanel && galleryFilterToggleBtn) {
      galleryFilterToggleBtn.classList.add("active");
    }

    if (panel === recommendFilterPanel && recommendFilterToggleBtn) {
      recommendFilterToggleBtn.classList.add("active");
    }
  }
}

function getAppliedPosts() {
  return allPosts.filter((post) => {
    if (!selectedGalleryIds.has(post.galleryId)) return false;
    if (recommendMinFilter > 0 && post.recommend < recommendMinFilter) return false;
    return true;
  });
}

function updateViewerSubText() {
  const presetName = currentPreset.name || "DC 통합 갤러리";
  const filteredCount = getAppliedPosts().length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / POSTS_PER_PAGE));

  if (viewerTitle) {
    viewerTitle.textContent = presetName;
  }

  if (!viewerSubText) return;

  viewerSubText.textContent =
    `갤러리 ${currentPreset.galleries.length}개 / 선택 ${selectedGalleryIds.size}개 / 추천필터 ${recommendMinFilter} / 총 ${filteredCount}개 / ${currentPage}페이지/${totalPages}`;
}

function syncSelectAllCheckbox() {
  const selectAllCheckbox = galleryCheckboxList?.querySelector('input[data-role="select-all"]');
  if (!selectAllCheckbox) return;

  const total = currentPreset.galleries.length;
  const selected = currentPreset.galleries.filter((gallery) => selectedGalleryIds.has(gallery.id)).length;

  if (total === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
    return;
  }

  if (selected === 0) {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = false;
  } else if (selected === total) {
    selectAllCheckbox.checked = true;
    selectAllCheckbox.indeterminate = false;
  } else {
    selectAllCheckbox.checked = false;
    selectAllCheckbox.indeterminate = true;
  }
}

async function saveSelectedGalleryIds() {
  await chrome.storage.local.set({
    viewerSelectedGalleryIds: [...selectedGalleryIds]
  });
}

function renderGalleryCheckboxList() {
  if (!galleryCheckboxList) return;

  galleryCheckboxList.innerHTML = "";

  if (!currentPreset.galleries.length) {
    galleryCheckboxList.innerHTML = `<div class="gallery-check-item"><span class="gallery-check-label">갤러리 없음</span></div>`;
    return;
  }

  const allItem = document.createElement("label");
  allItem.className = "gallery-check-item";

  const allCheckbox = document.createElement("input");
  allCheckbox.type = "checkbox";
  allCheckbox.setAttribute("data-role", "select-all");

  allCheckbox.addEventListener("change", async () => {
    if (allCheckbox.checked) {
      selectedGalleryIds = new Set(currentPreset.galleries.map((gallery) => gallery.id));
    } else {
      selectedGalleryIds = new Set();
    }

    currentPage = 1;
    await saveSelectedGalleryIds();
    renderGalleryCheckboxList();
    renderPosts();
  });

  const allText = document.createElement("span");
  allText.className = "gallery-check-label";
  allText.textContent = "전체선택";

  allItem.appendChild(allCheckbox);
  allItem.appendChild(allText);
  galleryCheckboxList.appendChild(allItem);

  currentPreset.galleries.forEach((gallery) => {
    const item = document.createElement("label");
    item.className = "gallery-check-item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = gallery.id;
    checkbox.checked = selectedGalleryIds.has(gallery.id);

    checkbox.addEventListener("change", async () => {
      if (checkbox.checked) {
        selectedGalleryIds.add(gallery.id);
      } else {
        selectedGalleryIds.delete(gallery.id);
      }

      currentPage = 1;
      await saveSelectedGalleryIds();
      syncSelectAllCheckbox();
      renderPosts();
    });

    const text = document.createElement("span");
    text.className = "gallery-check-label";
    text.textContent = gallery.name;

    item.appendChild(checkbox);
    item.appendChild(text);
    galleryCheckboxList.appendChild(item);
  });

  syncSelectAllCheckbox();
}

function renderPagination(totalPosts) {
  if (!paginationEl) return;

  paginationEl.innerHTML = "";

  const totalPages = Math.max(1, Math.ceil(totalPosts / POSTS_PER_PAGE));

  if (totalPages <= 1) return;

  const prevBtn = document.createElement("button");
  prevBtn.className = "page-btn";
  prevBtn.textContent = "이전";
  prevBtn.disabled = currentPage <= 1;
  prevBtn.addEventListener("click", () => {
    if (currentPage > 1) {
      currentPage--;
      renderPosts();
    }
  });
  paginationEl.appendChild(prevBtn);

  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);

  if (endPage - startPage + 1 < maxVisible) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  for (let page = startPage; page <= endPage; page++) {
    const btn = document.createElement("button");
    btn.className = `page-btn ${page === currentPage ? "active" : ""}`;
    btn.textContent = String(page);
    btn.addEventListener("click", () => {
      currentPage = page;
      renderPosts();
    });
    paginationEl.appendChild(btn);
  }

  const nextBtn = document.createElement("button");
  nextBtn.className = "page-btn";
  nextBtn.textContent = "다음";
  nextBtn.disabled = currentPage >= totalPages;
  nextBtn.addEventListener("click", () => {
    if (currentPage < totalPages) {
      currentPage++;
      renderPosts();
    }
  });
  paginationEl.appendChild(nextBtn);
}

function renderPosts() {
  const filteredPosts = sortPosts(getAppliedPosts(), currentSort);
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / POSTS_PER_PAGE));

  if (currentPage > totalPages) {
    currentPage = totalPages;
  }

  const startIndex = (currentPage - 1) * POSTS_PER_PAGE;
  const pagedPosts = filteredPosts.slice(startIndex, startIndex + POSTS_PER_PAGE);

  tbody.innerHTML = "";

  if (!pagedPosts.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="empty">조건에 맞는 글 없음</td></tr>';
    renderPagination(filteredPosts.length);
    updateViewerSubText();
    return;
  }

  const html = pagedPosts.map((post) => {
    const commentHtml = post.comments > 0
      ? `<span class="comment-inline">[${post.comments}]</span>`
      : "";

    return `
      <tr>
        <td class="col-gallery">
          <span class="gallery-badge" style="${getGalleryBadgeStyle(post.galleryId)}">${escapeHtml(post.galleryName)}</span>
        </td>
        <td class="col-title">
          <a class="title-link" href="${post.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(post.title)}</a>${commentHtml}
        </td>
        <td class="col-num">${post.recommend}</td>
        <td class="col-num">${post.comments}</td>
        <td class="col-num">${post.views}</td>
        <td class="col-date">${escapeHtml(post.dateText)}</td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = html;
  renderPagination(filteredPosts.length);
  updateViewerSubText();
}

async function applyRecommendFilter() {
  const value = Math.max(0, Number(recommendMinInput.value || 0));
  recommendMinFilter = Number.isFinite(value) ? value : 0;
  currentPage = 1;
  await chrome.storage.local.set({ viewerRecommendMin: recommendMinFilter });
  renderPosts();
  setStatus(`추천수 필터 적용: ${recommendMinFilter} 이상`);
}

async function resetRecommendFilter() {
  recommendMinFilter = 0;
  recommendMinInput.value = "";
  currentPage = 1;
  await chrome.storage.local.set({ viewerRecommendMin: 0 });
  renderPosts();
  setStatus("추천수 필터 초기화");
}

async function loadPosts() {
  setStatus("갤러리 불러오는 중...");
  tbody.innerHTML = '<tr><td colspan="6" class="empty">불러오는 중...</td></tr>';

  if (!currentPreset.galleries.length) {
    setStatus("현재 프리셋에 추가된 갤러리 없음");
    tbody.innerHTML = '<tr><td colspan="6" class="empty">팝업에서 현재 프리셋에 갤러리를 먼저 추가하셈 ㅇㅇ</td></tr>';
    renderGalleryCheckboxList();
    updateViewerSubText();
    renderPagination(0);
    return;
  }

  const results = await Promise.allSettled(
    currentPreset.galleries.map(async (gallery) => {
      const { docs, galleryName } = await fetchGalleryDocs(gallery.id, 2);

      const mergedPosts = docs.flatMap((doc) =>
        parseGalleryPosts(doc, galleryName || gallery.name, gallery.id)
      );

      return dedupePosts(mergedPosts);
    })
  );

  const merged = [];
  const errors = [];

  results.forEach((result, index) => {
    if (result.status === "fulfilled") {
      merged.push(...result.value);
    } else {
      console.error(result.reason);
      errors.push(currentPreset.galleries[index].name || currentPreset.galleries[index].id);
    }
  });

  allPosts = merged;
  currentPage = 1;
  renderPosts();

  if (errors.length) {
    setStatus(`불러오기 완료: ${getAppliedPosts().length}개 / 실패: ${errors.join(", ")}`);
  } else {
    setStatus(`불러오기 완료: ${getAppliedPosts().length}개 표시 중`);
  }
}

async function initializeViewerState() {
  const state = await ensureStorageState();
  currentPreset = state.presets[state.activePresetIndex] || DEFAULT_PRESETS[0];

  const presetGalleryIds = currentPreset.galleries.map((g) => g.id);

  if (state.viewerSelectedGalleryIds && state.viewerSelectedGalleryIds.length) {
    const validIds = state.viewerSelectedGalleryIds.filter((id) => presetGalleryIds.includes(id));
    selectedGalleryIds = new Set(validIds.length ? validIds : presetGalleryIds);
  } else {
    selectedGalleryIds = new Set(presetGalleryIds);
  }

  recommendMinFilter = Number.isFinite(state.viewerRecommendMin) ? Math.max(0, state.viewerRecommendMin) : 0;
  recommendMinInput.value = recommendMinFilter > 0 ? String(recommendMinFilter) : "";

  currentPage = 1;

  await loadTheme(state.viewerTheme);
  renderGalleryCheckboxList();
  updateViewerSubText();
}

sortButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    sortButtons.forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    currentSort = btn.dataset.sort;
    currentPage = 1;
    renderPosts();
  });
});

if (reloadBtn) reloadBtn.addEventListener("click", loadPosts);
if (themeToggleBtn) themeToggleBtn.addEventListener("click", toggleTheme);
if (galleryFilterToggleBtn) galleryFilterToggleBtn.addEventListener("click", () => openPanel(galleryFilterPanel));
if (recommendFilterToggleBtn) recommendFilterToggleBtn.addEventListener("click", () => openPanel(recommendFilterPanel));
if (applyRecommendFilterBtn) applyRecommendFilterBtn.addEventListener("click", applyRecommendFilter);
if (resetRecommendFilterBtn) resetRecommendFilterBtn.addEventListener("click", resetRecommendFilter);

(async function init() {
  await initializeViewerState();
  await loadPosts();
})();