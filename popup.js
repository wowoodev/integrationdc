const galleryIdInput = document.getElementById("galleryIdInput");
const addBtn = document.getElementById("addBtn");
const galleryList = document.getElementById("galleryList");
const openViewerBtn = document.getElementById("openViewerBtn");
const messageEl = document.getElementById("message");
const presetTabs = [...document.querySelectorAll(".preset-tab")];
const presetNameInput = document.getElementById("presetNameInput");
const renamePresetBtn = document.getElementById("renamePresetBtn");
const presetInfo = document.getElementById("presetInfo");

const GALLERY_URL_CANDIDATES = [
  (id) => `https://gall.dcinside.com/board/lists/?id=${encodeURIComponent(id)}`,
  (id) => `https://gall.dcinside.com/mgallery/board/lists/?id=${encodeURIComponent(id)}`,
  (id) => `https://gall.dcinside.com/mini/board/lists/?id=${encodeURIComponent(id)}`
];

const DEFAULT_PRESETS = [
  { name: "프리셋1", galleries: [] },
  { name: "프리셋2", galleries: [] },
  { name: "프리셋3", galleries: [] }
];

function setMessage(text, isError = true) {
  messageEl.textContent = text;
  messageEl.style.color = isError ? "#fca5a5" : "#86efac";
}

function cleanGalleryName(rawTitle) {
  if (!rawTitle) return "";
  return rawTitle
    .replace(/\s*-\s*커뮤니티 포털 디시인사이드\s*$/i, "")
    .replace(/\s*(마이너|미니)?\s*갤러리\s*$/i, "")
    .trim();
}

function parseInputGalleryIds(raw) {
  return [...new Set(
    String(raw || "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
  )];
}

function cloneDefaultPresets() {
  return DEFAULT_PRESETS.map((preset) => ({
    name: preset.name,
    galleries: []
  }));
}

async function ensureStorageState() {
  const stored = await chrome.storage.local.get(["presets", "activePresetIndex", "galleries"]);

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

  await chrome.storage.local.set({
    presets,
    activePresetIndex
  });

  return { presets, activePresetIndex };
}

async function getState() {
  return ensureStorageState();
}

async function saveState(presets, activePresetIndex) {
  await chrome.storage.local.set({ presets, activePresetIndex });
}

async function resolveGalleryInfo(galleryId) {
  for (const makeUrl of GALLERY_URL_CANDIDATES) {
    const url = makeUrl(galleryId);

    try {
      const res = await fetch(url, { credentials: "include" });
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
      const title = doc.querySelector("title")?.textContent?.trim() || "";
      const cleanedName = cleanGalleryName(title);

      const hasListTable =
        doc.querySelector("table.gall_list") ||
        doc.querySelector(".gall_listwrap") ||
        doc.querySelector("tbody tr");

      if (cleanedName && hasListTable) {
        return {
          id: galleryId,
          name: cleanedName
        };
      }
    } catch (e) {
      console.error(e);
    }
  }

  throw new Error("갤러리를 찾지 못함");
}

function renderPresetTabs(presets, activePresetIndex) {
  presetTabs.forEach((tab, index) => {
    tab.classList.toggle("active", index === activePresetIndex);
    tab.textContent = presets[index]?.name || `프리셋${index + 1}`;
  });
}

function renderPresetInfo(preset) {
  presetNameInput.value = preset.name;
  presetInfo.textContent = `${preset.name} / 총 ${preset.galleries.length}개 갤러리`;
}

function renderGalleryListByPreset(preset) {
  galleryList.innerHTML = "";

  if (!preset.galleries.length) {
    const li = document.createElement("li");
    li.innerHTML = `<div class="gallery-meta"><div class="gallery-name">추가된 갤러리 없음</div></div>`;
    galleryList.appendChild(li);
    return;
  }

  preset.galleries.forEach((gallery, index) => {
    const li = document.createElement("li");

    const meta = document.createElement("div");
    meta.className = "gallery-meta";

    const name = document.createElement("div");
    name.className = "gallery-name";
    name.textContent = gallery.name;

    const id = document.createElement("div");
    id.className = "gallery-id";
    id.textContent = gallery.id;

    meta.appendChild(name);
    meta.appendChild(id);

    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "삭제";
    removeBtn.addEventListener("click", async () => {
      const { presets, activePresetIndex } = await getState();
      presets[activePresetIndex].galleries.splice(index, 1);
      await saveState(presets, activePresetIndex);
      await renderAll();
      setMessage("삭제 완료", false);
    });

    li.appendChild(meta);
    li.appendChild(removeBtn);
    galleryList.appendChild(li);
  });
}

async function renderAll() {
  const { presets, activePresetIndex } = await getState();
  const preset = presets[activePresetIndex];
  renderPresetTabs(presets, activePresetIndex);
  renderPresetInfo(preset);
  renderGalleryListByPreset(preset);
}

async function switchPreset(index) {
  const { presets } = await getState();
  await saveState(presets, index);
  await renderAll();
  setMessage(`${presets[index].name} 선택됨`, false);
}

async function renamePreset() {
  const nextName = presetNameInput.value.trim();
  if (!nextName) {
    setMessage("프리셋 이름 입력해야 함");
    return;
  }

  const { presets, activePresetIndex } = await getState();
  presets[activePresetIndex].name = nextName;
  await saveState(presets, activePresetIndex);
  await renderAll();
  setMessage("프리셋 이름 변경 완료", false);
}

async function addGalleries() {
  const rawInput = galleryIdInput.value.trim();
  const galleryIds = parseInputGalleryIds(rawInput);

  if (!galleryIds.length) {
    setMessage("갤러리 id 입력해야 함");
    return;
  }

  addBtn.disabled = true;
  setMessage("갤러리 확인 중...", false);

  try {
    const { presets, activePresetIndex } = await getState();
    const currentPreset = presets[activePresetIndex];
    const storedIdSet = new Set(currentPreset.galleries.map((g) => g.id));
    const nextGalleries = [...currentPreset.galleries];

    let addedCount = 0;
    const skippedIds = [];
    const failedIds = [];

    for (const galleryId of galleryIds) {
      if (storedIdSet.has(galleryId)) {
        skippedIds.push(galleryId);
        continue;
      }

      try {
        const resolved = await resolveGalleryInfo(galleryId);
        nextGalleries.push({
          id: resolved.id,
          name: resolved.name
        });
        storedIdSet.add(resolved.id);
        addedCount++;
      } catch (e) {
        console.error(e);
        failedIds.push(galleryId);
      }
    }

    presets[activePresetIndex].galleries = nextGalleries;
    await saveState(presets, activePresetIndex);
    await renderAll();
    galleryIdInput.value = "";

    const messageParts = [];
    if (addedCount > 0) messageParts.push(`추가 ${addedCount}개`);
    if (skippedIds.length > 0) messageParts.push(`중복 ${skippedIds.length}개`);
    if (failedIds.length > 0) messageParts.push(`실패 ${failedIds.length}개`);

    if (!messageParts.length) {
      setMessage("처리된 갤러리 없음");
      return;
    }

    setMessage(messageParts.join(" / "), failedIds.length > 0);
  } catch (e) {
    console.error(e);
    setMessage("갤러리 추가 중 오류 발생");
  } finally {
    addBtn.disabled = false;
  }
}

function openViewer() {
  const url = chrome.runtime.getURL("viewer.html");
  window.open(url, "_blank");
}

presetTabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    switchPreset(Number(tab.dataset.index));
  });
});

renamePresetBtn.addEventListener("click", renamePreset);
addBtn.addEventListener("click", addGalleries);

presetNameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") renamePreset();
});

galleryIdInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") addGalleries();
});

openViewerBtn.addEventListener("click", openViewer);

renderAll();