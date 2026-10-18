/* ==========================================================================
   LUMINA READER STUDIO — CORE ENGINE
   - Quản lý & Xoá từng chương cụ thể
   - Ghim từ Zero-Layout-Shift (Không đẩy/mất chữ trên iPhone)
   - Chế độ Lật trang sách (Book Flip Mode) + Cảm ứng vuốt/chạm
   ========================================================================== */

// ---------------- DOM ELEMENTS ----------------
const zenHeader = document.getElementById('zenHeader');
const islandDock = document.getElementById('islandDock');
const headerTitle = document.getElementById('headerTitle');
const statWords = document.getElementById('statWords');
const statPercent = document.getElementById('statPercent');
const progressFill = document.getElementById('progress-fill');
const eyeCareOverlay = document.getElementById('eye-care-overlay');
const toastPill = document.getElementById('toast-pill');

const inputSheet = document.getElementById('inputSheet');
const textInput = document.getElementById('textInput');
const inputModeBadge = document.getElementById('inputModeBadge');
const composerWordCount = document.getElementById('composerWordCount');
const btnCancelComposer = document.getElementById('btnCancelComposer');

const bookViewport = document.getElementById('book-viewport');
const readerContent = document.getElementById('reader-content');
const chapterEndCard = document.getElementById('chapterEndCard');
const endCardSummary = document.getElementById('endCardSummary');
const btnJumpBookmark = document.getElementById('btnJumpBookmark');

const bookPagerBar = document.getElementById('bookPagerBar');
const btnPrevPage = document.getElementById('btnPrevPage');
const btnNextPage = document.getElementById('btnNextPage');
const pagerInfo = document.getElementById('pagerInfo');
const pageSlider = document.getElementById('pageSlider');
const tapZoneLeft = document.getElementById('tapZoneLeft');
const tapZoneRight = document.getElementById('tapZoneRight');

const searchPanel = document.getElementById('searchPanel');
const searchInput = document.getElementById('searchInput');
const searchCount = document.getElementById('searchCount');

const drawerNav = document.getElementById('drawer-nav');
const drawerOpts = document.getElementById('drawer-opts');
const modalGuide = document.getElementById('modalGuide');
const curtain = document.getElementById('curtain');

const tocContainer = document.getElementById('tocContainer');
const historyContainer = document.getElementById('historyContainer');
const dropArea = document.getElementById('dropArea');
const fileUpload = document.getElementById('fileUpload');
const replaceInput = document.getElementById('replaceInput');

const autoScrollHud = document.getElementById('autoScrollHud');
const hudSpeedVal = document.getElementById('hudSpeedVal');
const btnAutoScroll = document.getElementById('btnAutoScroll');

const ttsHud = document.getElementById('ttsHud');
const btnTTS = document.getElementById('btnTTS');
const btnTtsRate = document.getElementById('btnTtsRate');
const btnSleepTimer = document.getElementById('btnSleepTimer');

const pickerBg = document.getElementById('pickerBg');
const pickerText = document.getElementById('pickerText');
const pickerDialogue = document.getElementById('pickerDialogue');
const pickerChapter = document.getElementById('pickerChapter');
const warmthSlider = document.getElementById('warmthSlider');
const warmthValLabel = document.getElementById('warmthValLabel');

// ---------------- APPLICATION STATE ----------------
// Danh sách chương có cấu trúc: [{ id, title, rawLines, wordCount }]
let chaptersList = [];
let allRenderBlocks = []; // Danh sách phẳng các khối (tiêu đề + đoạn văn) để phân trang
let isAppendMode = false;
let totalWordsCount = 0;

// Chế độ đọc: 'scroll' (Cuộn dọc) hoặc 'book' (Lật trang sách)
let readingMode = 'scroll';
let flipAnimStyle = 'slide'; // 'slide' | 'curl'
let bookPages = []; // Mảng chứa danh sách khối của từng trang
let currentPageIdx = 0;

let isAutoScrolling = false;
let scrollSpeed = 3;
let scrollRafId = null;
let scrollAccumulator = 0;

let synth = window.speechSynthesis;
let ttsActive = false;
let ttsRate = 1.0;
let currentParaIdx = 0;
let sleepTimerMinutes = 0;
let sleepTimeoutId = null;

let isBionic = false;
let isUnbreak = false;
let isTwoCols = false;
let isDropCap = true;
let textAlignMode = 'justify';

let searchMatches = [];
let currentMatchIdx = -1;
let lastScrollY = 0;
let toastTimer = null;

// ---------------- TOAST FEEDBACK ----------------
const showToast = (msg) => {
  toastPill.innerText = msg;
  toastPill.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastPill.classList.remove('show'), 2200);
};

// ---------------- ZERO-LAG CLEAR TRÊN IPHONE ----------------
const instantClearInput = (inputEl) => {
  inputEl.blur();
  requestAnimationFrame(() => {
    inputEl.value = '';
    if (inputEl === textInput) composerWordCount.innerText = '0 từ';
  });
};

textInput.addEventListener('input', () => {
  const val = textInput.value.trim();
  if (!val) {
    composerWordCount.innerText = '0 từ';
    return;
  }
  composerWordCount.innerText = `${val.split(/\s+/).length.toLocaleString()} từ`;
});

// ---------------- XỬ LÝ VĂN BẢN & TÁCH CHƯƠNG CẤU TRÚC ----------------
const isChapterHeading = (str) =>
  /^(chương|hồi|quyển|tiết|thứ|phần|chapter)\s+[0-9ivxlcdm]+/i.test(str.trim()) ||
  /^chương\s+/i.test(str.trim());

const cleanRaw = (raw) => {
  return raw
    .replace(/nguồn\s*:\s*[^\n]+/gi, '')
    .replace(/truyện\s*được\s*đăng\s*tại[^\n]+/gi, '')
    .replace(/chúc\s*bạn\s*đọc\s*truyện\s*vui\s*vẻ[^\n]*/gi, '');
};

const smartUnbreak = (str) => {
  if (!isUnbreak) return str;
  const rawLines = str.split('\n');
  let res = '';
  for (let i = 0; i < rawLines.length; i++) {
    let cur = rawLines[i].trim();
    if (!cur) continue;
    res += cur;
    if (!/[.!?…”"':]$/.test(cur) && !isChapterHeading(cur)) {
      res += ' ';
    } else {
      res += '\n\n';
    }
  }
  return res;
};

const applyReplacements = (str) => {
  const raw = replaceInput.value.trim();
  if (!raw) return str;
  let out = str;
  raw.split('\n').forEach((rule) => {
    const parts = rule.split('=');
    if (parts.length === 2) {
      const from = parts[0].trim();
      const to = parts[1].trim();
      if (from) out = out.replaceAll(new RegExp(from, 'gi'), to);
    }
  });
  return out;
};

const formatDialogue = (str) => {
  return str
    .replace(/(".*?"|“.*?”|「.*?」)/g, '<span class="dialogue">$1</span>')
    .replace(/^(-\s.*|–\s.*|—\s.*)/g, '<span class="dialogue">$1</span>');
};

const applyBionic = (str) => {
  if (!isBionic) return str;
  return str.replace(/([a-zA-ZÀ-ỹ0-9]+)/g, (match) => {
    const mid = Math.ceil(match.length / 2);
    return `<span class="bionic-lead">${match.slice(0, mid)}</span>${match.slice(mid)}`;
  });
};

// Tách một khối văn bản thô thành mảng các chương độc lập
const parseTextIntoChapters = (rawText) => {
  let cleaned = cleanRaw(rawText);
  cleaned = smartUnbreak(cleaned);
  const lines = cleaned
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) return [];

  const parsed = [];
  let currentChap = null;

  lines.forEach((line) => {
    if (isChapterHeading(line)) {
      if (currentChap && (currentChap.lines.length > 0 || currentChap.hasExplicitTitle)) {
        parsed.push(currentChap);
      }
      currentChap = {
        id: 'chap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        title: line,
        hasExplicitTitle: true,
        lines: []
      };
    } else {
      if (!currentChap) {
        currentChap = {
          id: 'chap-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
          title: line.length > 42 ? line.substring(0, 42) + '...' : line,
          hasExplicitTitle: false,
          lines: []
        };
      }
      currentChap.lines.push(line);
    }
  });

  if (currentChap) parsed.push(currentChap);
  return parsed;
};

// Đồng bộ mảng chương về lại chuỗi lưu trữ
const serializeChapters = () => {
  return chaptersList
    .map((c) => {
      if (c.hasExplicitTitle) {
        return c.title + '\n\n' + c.lines.join('\n\n');
      }
      return c.lines.join('\n\n');
    })
    .join('\n\n');
};

// ---------------- XOÁ TỪNG CHƯƠNG CỤ THỂ ----------------
const deleteChapterById = (chapId) => {
  const idx = chaptersList.findIndex((c) => c.id === chapId);
  if (idx === -1) return;

  const removedTitle = chaptersList[idx].title;
  chaptersList.splice(idx, 1);

  if (chaptersList.length === 0) {
    closeCurrentAndOpenBlank();
    showToast(`Đã xoá "${removedTitle}"`);
    return;
  }

  const combined = serializeChapters();
  localStorage.setItem('lumina_saved_text', combined);
  rebuildAndRender(true);
  showToast(`Đã xoá: ${removedTitle}`);
};

window.deleteChapterById = deleteChapterById;

// ---------------- DỰNG CẤU TRÚC RENDER & PHÂN TRANG SÁCH ----------------
const rebuildAndRender = (preservePosition = false) => {
  if (chaptersList.length === 0) {
    readerContent.innerHTML = '';
    chapterEndCard.classList.add('hidden');
    bookPagerBar.classList.add('hidden');
    tapZoneLeft.classList.add('hidden');
    tapZoneRight.classList.add('hidden');
    btnCancelComposer.classList.add('hidden');
    tocContainer.innerHTML = '<div style="color:var(--text-sub);font-size:13px;padding:8px;">Chưa có chương nào</div>';
    headerTitle.innerText = 'Lumina Studio';
    statWords.innerText = 'Chưa nạp chương';
    return;
  }

  totalWordsCount = 0;
  allRenderBlocks = [];
  tocContainer.innerHTML = '';
  let globalParaIdx = 0;

  chaptersList.forEach((chap, cIdx) => {
    let chapWords = 0;
    if (chap.hasExplicitTitle) {
      chapWords += chap.title.split(/\s+/).length;
    }
    chap.lines.forEach((l) => {
      chapWords += l.split(/\s+/).length;
    });
    chap.wordCount = chapWords;
    totalWordsCount += chapWords;

    const domChapId = `dom-${chap.id}`;

    // Tạo khối tiêu đề chương (Có nút Xoá chương cụ thể ngay trên đầu chương)
    const displayTitle = applyReplacements(chap.title);
    allRenderBlocks.push({
      type: 'heading',
      chapId: chap.id,
      domId: domChapId,
      title: displayTitle,
      wordCount: chapWords,
      charWeight: 180,
      html: `
        <div id="${domChapId}" class="chapter-header-wrap" data-chap-id="${chap.id}">
          <h2 class="chapter-heading">${displayTitle}</h2>
          <div class="chapter-meta-bar">
            <span>Chương ${cIdx + 1}/${chaptersList.length} • ${chapWords.toLocaleString()} từ</span>
            <button type="button" class="btn-del-chap-inline" onclick="deleteChapterById('${chap.id}')">
              🗑️ Xoá chương này
            </button>
          </div>
        </div>
      `
    });

    // Tạo mục lục kèm nút xoá từng chương
    const tocRow = document.createElement('div');
    tocRow.className = 'list-row-card';
    tocRow.innerHTML = `
      <div class="list-row-info">
        <strong>${displayTitle}</strong>
        <small>${chapWords.toLocaleString()} từ</small>
      </div>
      <button type="button" class="row-del-btn" title="Xoá chương này">🗑️</button>
    `;
    tocRow.querySelector('.list-row-info').onclick = () => {
      jumpToChapter(chap.id, domChapId);
      closeAllOverlays();
    };
    tocRow.querySelector('.row-del-btn').onclick = (e) => {
      e.stopPropagation();
      deleteChapterById(chap.id);
    };
    tocContainer.appendChild(tocRow);

    // Tạo các đoạn văn trong chương
    chap.lines.forEach((rawLine, lIdx) => {
      let line = applyReplacements(rawLine);
      let formatted = formatDialogue(line);
      if (isBionic) formatted = applyBionic(formatted);

      const pIdx = globalParaIdx++;
      const firstClass = lIdx === 0 ? 'first-of-chap' : '';

      allRenderBlocks.push({
        type: 'para',
        chapId: chap.id,
        paraIndex: pIdx,
        rawText: line,
        charWeight: Math.max(90, line.length),
        html: `<p class="para ${firstClass}" data-index="${pIdx}">${formatted}</p>`
      });
    });
  });

  btnCancelComposer.classList.remove('hidden');
  const mainTitle = applyReplacements(chaptersList[0].title);
  headerTitle.innerText =
    chaptersList.length > 1 ? `${mainTitle} (+${chaptersList.length - 1} chương)` : mainTitle;

  const mins = Math.max(1, Math.ceil(totalWordsCount / 230));
  statWords.innerText = `${chaptersList.length} chương • ${totalWordsCount.toLocaleString()} từ (~${mins}p)`;
  endCardSummary.innerText = `Đã đọc hết ${chaptersList.length} chương (${totalWordsCount.toLocaleString()} từ). Bạn muốn tắt chương để mở khung trống hay nối thêm chương mới?`;

  if (readingMode === 'book') {
    buildBookPages(preservePosition);
  } else {
    renderScrollMode();
  }
};

// ---------------- CHẾ ĐỘ CUỘN DỌC (SCROLL MODE) ----------------
const renderScrollMode = () => {
  document.body.classList.remove('mode-book');
  bookPagerBar.classList.add('hidden');
  tapZoneLeft.classList.add('hidden');
  tapZoneRight.classList.add('hidden');

  readerContent.innerHTML = `<div class="chapter-block">${allRenderBlocks.map((b) => b.html).join('')}</div>`;
  chapterEndCard.classList.remove('hidden');

  restoreSavedMarker();
};

// ---------------- CHẾ ĐỘ LẬT TRANG SÁCH (BOOK FLIP MODE) ----------------
const calculateTargetCharsPerPage = () => {
  const fontSize = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--font-size')) || 20;
  const lineHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--line-height')) || 1.9;
  const availH = Math.max(360, window.innerHeight - 230);
  const availW = Math.min(window.innerWidth - 40, parseInt(getComputedStyle(document.documentElement).getPropertyValue('--content-width')) || 760);

  const linesPerPage = Math.max(8, Math.floor(availH / (fontSize * lineHeight)));
  const charsPerLine = Math.max(28, Math.floor(availW / (fontSize * 0.55)));
  return Math.floor(linesPerPage * charsPerLine * 0.78);
};

const buildBookPages = (preservePage = false) => {
  document.body.classList.add('mode-book');
  const budget = calculateTargetCharsPerPage();
  bookPages = [];

  let curPage = [];
  let curWeight = 0;

  allRenderBlocks.forEach((block) => {
    // Nếu gặp tiêu đề chương mới và trang hiện tại đã có nội dung, sang trang mới cho đẹp
    if (block.type === 'heading' && curPage.length > 0) {
      bookPages.push(curPage);
      curPage = [block];
      curWeight = block.charWeight;
      return;
    }

    if (curWeight + block.charWeight > budget && curPage.length > 0) {
      bookPages.push(curPage);
      curPage = [block];
      curWeight = block.charWeight;
    } else {
      curPage.push(block);
      curWeight += block.charWeight;
    }
  });

  if (curPage.length > 0) bookPages.push(curPage);
  if (bookPages.length === 0) bookPages.push([]);

  if (!preservePage) {
    // Nếu có ghim, mở đúng trang chứa đoạn đang ghim
    const savedPin = localStorage.getItem('lumina_bookmark_data');
    if (savedPin) {
      try {
        const { index } = JSON.parse(savedPin);
        const foundPage = bookPages.findIndex((p) => p.some((b) => b.paraIndex === index));
        currentPageIdx = foundPage !== -1 ? foundPage : 0;
      } catch (e) {
        currentPageIdx = 0;
      }
    } else {
      currentPageIdx = 0;
    }
  } else {
    currentPageIdx = Math.min(currentPageIdx, bookPages.length - 1);
  }

  bookPagerBar.classList.remove('hidden');
  tapZoneLeft.classList.remove('hidden');
  tapZoneRight.classList.remove('hidden');
  pageSlider.max = bookPages.length;

  renderCurrentBookPage();
};

const renderCurrentBookPage = (direction = null) => {
  const pageBlocks = bookPages[currentPageIdx] || [];
  readerContent.innerHTML = `<div class="chapter-block">${pageBlocks.map((b) => b.html).join('')}</div>`;

  // Hiệu ứng lật trang
  if (direction) {
    const animClass =
      flipAnimStyle === 'curl'
        ? direction === 'next'
          ? 'flip-curl-next'
          : 'flip-curl-prev'
        : direction === 'next'
        ? 'flip-slide-next'
        : 'flip-slide-prev';
    readerContent.classList.remove('flip-slide-next', 'flip-slide-prev', 'flip-curl-next', 'flip-curl-prev');
    void readerContent.offsetWidth;
    readerContent.classList.add(animClass);
  }

  // Chỉ hiện thẻ Kết thúc chương ở trang cuối cùng
  const isLastPage = currentPageIdx >= bookPages.length - 1;
  chapterEndCard.classList.toggle('hidden', !isLastPage);

  // Cập nhật thanh phân trang
  const totalP = bookPages.length;
  const pct = Math.round(((currentPageIdx + 1) / totalP) * 100);
  pagerInfo.innerText = `Trang ${currentPageIdx + 1} / ${totalP}`;
  pageSlider.value = currentPageIdx + 1;
  btnPrevPage.disabled = currentPageIdx <= 0;
  btnNextPage.disabled = isLastPage;

  progressFill.style.width = `${pct}%`;
  statPercent.innerText = `${pct}%`;

  restoreSavedMarker();
  window.scrollTo({ top: 0, behavior: 'instant' });
};

const turnBookPage = (delta) => {
  if (readingMode !== 'book') return;
  const nextIdx = currentPageIdx + delta;
  if (nextIdx < 0 || nextIdx >= bookPages.length) return;
  currentPageIdx = nextIdx;
  renderCurrentBookPage(delta > 0 ? 'next' : 'prev');
};

btnPrevPage.onclick = () => turnBookPage(-1);
btnNextPage.onclick = () => turnBookPage(1);
tapZoneLeft.onclick = () => turnBookPage(-1);
tapZoneRight.onclick = () => turnBookPage(1);
pageSlider.oninput = (e) => {
  currentPageIdx = parseInt(e.target.value, 10) - 1;
  renderCurrentBookPage();
};

// Cảm ứng Vuốt Trái / Phải trên iPhone để lật trang
let touchStartX = 0;
let touchStartY = 0;
bookViewport.addEventListener(
  'touchstart',
  (e) => {
    if (readingMode !== 'book') return;
    touchStartX = e.changedTouches[0].screenX;
    touchStartY = e.changedTouches[0].screenY;
  },
  { passive: true }
);

bookViewport.addEventListener(
  'touchend',
  (e) => {
    if (readingMode !== 'book') return;
    const dx = e.changedTouches[0].screenX - touchStartX;
    const dy = e.changedTouches[0].screenY - touchStartY;
    if (Math.abs(dx) > 52 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      if (dx < 0) turnBookPage(1);
      else turnBookPage(-1);
    }
  },
  { passive: true }
);

const setReadingMode = (mode) => {
  readingMode = mode;
  localStorage.setItem('lumina_read_mode', mode);

  document.getElementById('btnModeScroll').classList.toggle('active', mode === 'scroll');
  document.getElementById('btnModeBook').classList.toggle('active', mode === 'book');
  document.getElementById('btnBookModeDock').classList.toggle('active', mode === 'book');
  document.getElementById('btnQuickReadMode').innerText = mode === 'book' ? '📖 Sách' : '↕️ Cuộn';

  if (isAutoScrolling && mode === 'book') stopAutoScroll();
  rebuildAndRender(true);
};
window.setReadingMode = setReadingMode;

const setFlipAnimation = (style) => {
  flipAnimStyle = style;
  localStorage.setItem('lumina_flip_anim', style);
  document.getElementById('btnAnimSlide').classList.toggle('active', style === 'slide');
  document.getElementById('btnAnimCurl').classList.toggle('active', style === 'curl');
};
window.setFlipAnimation = setFlipAnimation;

const jumpToChapter = (chapId, domChapId) => {
  if (readingMode === 'book') {
    const pIdx = bookPages.findIndex((p) => p.some((b) => b.chapId === chapId));
    if (pIdx !== -1) {
      currentPageIdx = pIdx;
      renderCurrentBookPage();
    }
  } else {
    document.getElementById(domChapId)?.scrollIntoView({ behavior: 'smooth' });
  }
};

// ---------------- GHIM TỪ ZERO-LAYOUT-SHIFT (FIX TRIỆT ĐỂ LỖI IPHONE) ----------------
const isWordChar = (char) => /[a-zA-Z0-9À-ỹ_]/.test(char);

const findWordBounds = (text, clickOffset) => {
  let start = Math.min(clickOffset, text.length - 1);
  if (start < 0) return { start: 0, end: 0 };

  // Nếu bấm trúng khoảng trắng, lùi về từ gần nhất
  if (!isWordChar(text[start]) && start > 0 && isWordChar(text[start - 1])) {
    start--;
  }
  let end = start;
  while (start > 0 && isWordChar(text[start - 1])) start--;
  while (end < text.length && isWordChar(text[end])) end++;
  return { start, end };
};

readerContent.addEventListener('click', (e) => {
  if (e.target.closest('.btn-del-chap-inline')) return;
  const para = e.target.closest('.para');
  if (!para) return;

  const index = parseInt(para.dataset.index, 10);

  // Chạm lại vào đoạn đang ghim để huỷ ghim
  if (para.classList.contains('bookmarked')) {
    clearBookmarkData();
    showToast('Đã bỏ ghim vị trí đọc');
    return;
  }

  clearBookmarkUI();

  let targetNode = null;
  let targetOffset = 0;

  if (document.caretRangeFromPoint) {
    const range = document.caretRangeFromPoint(e.clientX, e.clientY);
    if (range) {
      targetNode = range.startContainer;
      targetOffset = range.startOffset;
    }
  } else if (document.caretPositionFromPoint) {
    const pos = document.caretPositionFromPoint(e.clientX, e.clientY);
    if (pos) {
      targetNode = pos.offsetNode;
      targetOffset = pos.offset;
    }
  }

  let charOffset = 0;

  if (targetNode && targetNode.nodeType === Node.TEXT_NODE && para.contains(targetNode)) {
    // Tính vị trí ký tự tuyệt đối trong đoạn trước khi bọc thẻ
    const baseOffset = getCharOffsetBeforeNode(targetNode, para);
    const { start, end } = findWordBounds(targetNode.nodeValue, targetOffset);
    charOffset = baseOffset + start;
    wrapWordAtNode(targetNode, start, end);
  } else {
    charOffset = 0;
    highlightWordByCharOffset(para, 0);
  }

  para.classList.add('bookmarked');
  currentParaIdx = index;
  btnJumpBookmark.classList.remove('hidden');

  localStorage.setItem('lumina_bookmark_data', JSON.stringify({ index, charOffset }));
  showToast('📌 Đã ghim vị trí đọc');
});

const getCharOffsetBeforeNode = (targetNode, root) => {
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  let cur;
  while ((cur = walker.nextNode())) {
    if (cur === targetNode) break;
    offset += cur.nodeValue.length;
  }
  return offset;
};

// Bọc đúng từ được chọn bằng <span class="pinned-word"> không chiếm chiều ngang phụ
const wrapWordAtNode = (textNode, start, end) => {
  const val = textNode.nodeValue;
  if (end <= start || start >= val.length) return;

  const afterNode = textNode.splitText(start);
  afterNode.splitText(end - start);

  const pinSpan = document.createElement('span');
  pinSpan.className = 'pinned-word';
  pinSpan.textContent = afterNode.nodeValue;
  afterNode.parentNode.replaceChild(pinSpan, afterNode);
};

const highlightWordByCharOffset = (para, charOffset) => {
  let currentLen = 0;
  const walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT, null, false);
  let node;
  while ((node = walker.nextNode())) {
    const nextLen = currentLen + node.nodeValue.length;
    if (charOffset < nextLen) {
      const localOffset = Math.max(0, charOffset - currentLen);
      const { start, end } = findWordBounds(node.nodeValue, localOffset);
      wrapWordAtNode(node, start, end);
      return;
    }
    currentLen = nextLen;
  }
};

// Gỡ ghim và normalize() để gộp lại Text Node nguyên vẹn như ban đầu
const clearBookmarkUI = () => {
  document.querySelectorAll('.pinned-word').forEach((span) => {
    const parent = span.parentNode;
    const textNode = document.createTextNode(span.textContent);
    parent.replaceChild(textNode, span);
    parent.normalize();
  });
  document.querySelectorAll('.para.bookmarked').forEach((p) => p.classList.remove('bookmarked'));
};

const clearBookmarkData = () => {
  clearBookmarkUI();
  btnJumpBookmark.classList.add('hidden');
  localStorage.removeItem('lumina_bookmark_data');
};

const restoreSavedMarker = () => {
  const raw = localStorage.getItem('lumina_bookmark_data');
  if (!raw) {
    btnJumpBookmark.classList.add('hidden');
    return;
  }

  try {
    const { index, charOffset } = JSON.parse(raw);
    btnJumpBookmark.classList.remove('hidden');
    currentParaIdx = index;

    const para = document.querySelector(`.para[data-index="${index}"]`);
    if (!para) return; // Có thể đang ở trang khác trong chế độ Lật sách

    clearBookmarkUI();
    para.classList.add('bookmarked');
    highlightWordByCharOffset(para, charOffset || 0);
  } catch (e) {
    console.error(e);
  }
};

btnJumpBookmark.onclick = () => {
  const raw = localStorage.getItem('lumina_bookmark_data');
  if (!raw) return;
  const { index } = JSON.parse(raw);

  if (readingMode === 'book') {
    const pIdx = bookPages.findIndex((p) => p.some((b) => b.paraIndex === index));
    if (pIdx !== -1) {
      currentPageIdx = pIdx;
      renderCurrentBookPage();
    }
  }
  setTimeout(() => {
    const pinned = document.querySelector('.para.bookmarked');
    if (pinned) pinned.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 60);
};

// ---------------- NẠP / THÊM / TẮT CHƯƠNG ----------------
const commitTextAndRead = () => {
  const incoming = textInput.value.trim();
  if (!incoming) return;

  const newChaps = parseTextIntoChapters(incoming);
  if (newChaps.length === 0) return;

  if (isAppendMode && chaptersList.length > 0) {
    chaptersList = chaptersList.concat(newChaps);
    showToast(`Đã nối thêm ${newChaps.length} chương`);
  } else {
    chaptersList = newChaps;
    clearBookmarkData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    showToast(`Đã nạp ${newChaps.length} chương`);
  }

  isAppendMode = false;
  updateComposerBadge();

  const fullSerialized = serializeChapters();
  localStorage.setItem('lumina_saved_text', fullSerialized);
  saveHistoryRecord(chaptersList[0].title, fullSerialized);

  rebuildAndRender(false);
  instantClearInput(textInput);
  inputSheet.classList.add('hidden');
};

const closeCurrentAndOpenBlank = () => {
  if (ttsActive) toggleTTS();
  if (isAutoScrolling) stopAutoScroll();

  chaptersList = [];
  allRenderBlocks = [];
  clearBookmarkData();
  localStorage.removeItem('lumina_saved_text');
  localStorage.removeItem('lumina_scroll_pos');

  rebuildAndRender();

  progressFill.style.width = '0%';
  statPercent.innerText = '0%';

  isAppendMode = false;
  updateComposerBadge();
  instantClearInput(textInput);
  inputSheet.classList.remove('hidden');

  zenHeader.classList.remove('bar-hidden');
  islandDock.classList.remove('bar-hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const closeCurrentAndPasteClipboard = async () => {
  try {
    const clip = await navigator.clipboard.readText();
    if (clip && clip.trim()) {
      if (ttsActive) toggleTTS();
      if (isAutoScrolling) stopAutoScroll();
      isAppendMode = false;
      textInput.value = clip.trim();
      commitTextAndRead();
      return;
    }
  } catch (e) {
    // Fallback mở ô trống nếu iOS yêu cầu quyền dán thủ công
  }
  closeCurrentAndOpenBlank();
  showToast('Hãy chạm Dán vào ô trống');
};

const openAppendMode = () => {
  isAppendMode = true;
  updateComposerBadge();
  instantClearInput(textInput);
  inputSheet.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const updateComposerBadge = () => {
  inputModeBadge.innerText = isAppendMode
    ? '➕ Nối thêm chương vào dưới'
    : '📖 Chèn chương mới (Thay thế)';
};

// Xuất file .txt sạch
document.getElementById('btnExportTxt').onclick = () => {
  if (chaptersList.length === 0) {
    showToast('Chưa có nội dung để xuất');
    return;
  }
  const content = applyReplacements(serializeChapters());
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${chaptersList[0].title.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('Đã tải xuống file .txt');
};

// ---------------- QUẢN LÝ LỊCH SỬ (XOÁ TỪNG MỤC HOẶC TẤT CẢ) ----------------
const saveHistoryRecord = (title, content) => {
  let list = JSON.parse(localStorage.getItem('lumina_histories') || '[]');
  list = list.filter((h) => h.content !== content);
  list.unshift({
    id: 'hist-' + Date.now(),
    title,
    content,
    date:
      new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) +
      ' • ' +
      new Date().toLocaleDateString('vi-VN')
  });
  if (list.length > 20) list.pop();
  localStorage.setItem('lumina_histories', JSON.stringify(list));
  buildHistoryUI();
};

const deleteHistoryItem = (histId) => {
  let list = JSON.parse(localStorage.getItem('lumina_histories') || '[]');
  list = list.filter((h) => h.id !== histId);
  localStorage.setItem('lumina_histories', JSON.stringify(list));
  buildHistoryUI();
  showToast('Đã xoá mục lịch sử');
};

const buildHistoryUI = () => {
  const list = JSON.parse(localStorage.getItem('lumina_histories') || '[]');
  historyContainer.innerHTML =
    list.length === 0
      ? '<div style="color:var(--text-sub);font-size:13px;padding:8px;">Chưa có lịch sử</div>'
      : '';

  list.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'list-row-card';
    row.innerHTML = `
      <div class="list-row-info">
        <strong>${item.title}</strong>
        <small>${item.date}</small>
      </div>
      <button type="button" class="row-del-btn" title="Xoá mục này">🗑️</button>
    `;
    row.querySelector('.list-row-info').onclick = () => {
      chaptersList = parseTextIntoChapters(item.content);
      localStorage.setItem('lumina_saved_text', item.content);
      instantClearInput(textInput);
      inputSheet.classList.add('hidden');
      rebuildAndRender(false);
      closeAllOverlays();
    };
    row.querySelector('.row-del-btn').onclick = (e) => {
      e.stopPropagation();
      deleteHistoryItem(item.id);
    };
    historyContainer.appendChild(row);
  });
};

// ---------------- TÌM KIẾM TRONG TRUYỆN ----------------
const clearSearchHighlights = () => {
  searchMatches = [];
  currentMatchIdx = -1;
  searchCount.innerText = '0/0';
  if (chaptersList.length > 0) rebuildAndRender(true);
};

const performSearch = () => {
  const query = searchInput.value.trim();
  if (!query || chaptersList.length === 0) {
    clearSearchHighlights();
    return;
  }

  if (readingMode === 'book') setReadingMode('scroll');
  else rebuildAndRender(true);

  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  document.querySelectorAll('.para').forEach((p) => {
    if (regex.test(p.innerText)) {
      p.innerHTML = p.innerHTML.replace(regex, '<mark class="search-hit">$1</mark>');
    }
  });

  searchMatches = Array.from(document.querySelectorAll('.search-hit'));
  if (searchMatches.length > 0) {
    focusSearchMatch(0);
  } else {
    searchCount.innerText = '0/0';
  }
};

const focusSearchMatch = (idx) => {
  if (!searchMatches.length) return;
  searchMatches.forEach((m) => m.classList.remove('current-hit'));
  currentMatchIdx = (idx + searchMatches.length) % searchMatches.length;
  const target = searchMatches[currentMatchIdx];
  target.classList.add('current-hit');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  searchCount.innerText = `${currentMatchIdx + 1}/${searchMatches.length}`;
};

document.getElementById('btnToggleSearch').onclick = () => {
  searchPanel.classList.toggle('hidden');
  if (!searchPanel.classList.contains('hidden')) searchInput.focus();
};
document.getElementById('btnCloseSearch').onclick = () => {
  searchPanel.classList.add('hidden');
  clearSearchHighlights();
};
document.getElementById('btnClearSearch').onclick = () => {
  instantClearInput(searchInput);
  clearSearchHighlights();
};
searchInput.addEventListener('input', performSearch);
document.getElementById('btnSearchNext').onclick = () => focusSearchMatch(currentMatchIdx + 1);
document.getElementById('btnSearchPrev').onclick = () => focusSearchMatch(currentMatchIdx - 1);

// ---------------- CUỘN TỰ ĐỘNG 60FPS ----------------
const stepAutoScrollFrame = () => {
  if (!isAutoScrolling) return;
  scrollAccumulator += scrollSpeed * 0.28;
  if (scrollAccumulator >= 1) {
    const px = Math.floor(scrollAccumulator);
    window.scrollBy(0, px);
    scrollAccumulator -= px;
  }
  if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 4) {
    stopAutoScroll();
    return;
  }
  scrollRafId = requestAnimationFrame(stepAutoScrollFrame);
};

const startAutoScroll = () => {
  if (readingMode === 'book') setReadingMode('scroll');
  isAutoScrolling = true;
  btnAutoScroll.classList.add('active');
  autoScrollHud.classList.remove('hidden');
  scrollAccumulator = 0;
  scrollRafId = requestAnimationFrame(stepAutoScrollFrame);
};

const stopAutoScroll = () => {
  isAutoScrolling = false;
  btnAutoScroll.classList.remove('active');
  autoScrollHud.classList.add('hidden');
  if (scrollRafId) cancelAnimationFrame(scrollRafId);
};

const toggleAutoScroll = () => {
  if (isAutoScrolling) stopAutoScroll();
  else startAutoScroll();
};

document.getElementById('btnSpeedUp').onclick = () => {
  scrollSpeed = Math.min(12, scrollSpeed + 1);
  hudSpeedVal.innerText = scrollSpeed;
  localStorage.setItem('lumina_scroll_speed', scrollSpeed);
};
document.getElementById('btnSpeedDown').onclick = () => {
  scrollSpeed = Math.max(1, scrollSpeed - 1);
  hudSpeedVal.innerText = scrollSpeed;
  localStorage.setItem('lumina_scroll_speed', scrollSpeed);
};
document.getElementById('btnStopScrollHud').onclick = stopAutoScroll;

// ---------------- ĐỌC GIỌNG NÓI (TTS) & HẸN GIỜ NGỦ ----------------
const toggleTTS = () => {
  if (ttsActive) {
    stopTTS();
  } else {
    synth.cancel();
    ttsActive = true;
    btnTTS.classList.add('active');
    ttsHud.classList.remove('hidden');
    playSpeech(currentParaIdx);
  }
};

const stopTTS = () => {
  synth.cancel();
  ttsActive = false;
  btnTTS.classList.remove('active');
  ttsHud.classList.add('hidden');
  document.querySelectorAll('.para.speaking').forEach((p) => p.classList.remove('speaking'));
};

const playSpeech = (idx) => {
  if (!ttsActive) return;

  // Nếu ở chế độ Lật sách và đoạn cần đọc nằm ở trang khác, tự lật sang trang đó
  if (readingMode === 'book') {
    const targetPage = bookPages.findIndex((p) => p.some((b) => b.paraIndex === idx));
    if (targetPage !== -1 && targetPage !== currentPageIdx) {
      currentPageIdx = targetPage;
      renderCurrentBookPage('next');
    }
  }

  const target = document.querySelector(`.para[data-index="${idx}"]`);
  if (!target) {
    stopTTS();
    return;
  }

  document.querySelectorAll('.para.speaking').forEach((p) => p.classList.remove('speaking'));
  target.classList.add('speaking');
  if (readingMode === 'scroll') {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  const utter = new SpeechSynthesisUtterance(target.innerText);
  utter.lang = 'vi-VN';
  utter.rate = ttsRate;

  document.getElementById('ttsStatusLabel').innerText = `Câu #${idx + 1}`;

  utter.onend = () => {
    if (!ttsActive) return;
    currentParaIdx = idx + 1;
    playSpeech(currentParaIdx);
  };
  utter.onerror = () => {
    if (ttsActive) stopTTS();
  };

  synth.speak(utter);
};

document.getElementById('btnTtsPrev').onclick = () => {
  if (currentParaIdx > 0) {
    synth.cancel();
    currentParaIdx--;
    playSpeech(currentParaIdx);
  }
};
document.getElementById('btnTtsNext').onclick = () => {
  synth.cancel();
  currentParaIdx++;
  playSpeech(currentParaIdx);
};
document.getElementById('btnTtsStop').onclick = stopTTS;

btnTtsRate.onclick = () => {
  const rates = [0.8, 1.0, 1.2, 1.4, 1.6];
  const next = rates[(rates.indexOf(ttsRate) + 1) % rates.length] || 1.0;
  ttsRate = next;
  btnTtsRate.innerText = `${next.toFixed(1)}x`;
  if (ttsActive) {
    synth.cancel();
    playSpeech(currentParaIdx);
  }
};

btnSleepTimer.onclick = () => {
  const minsList = [0, 15, 30, 60];
  sleepTimerMinutes = minsList[(minsList.indexOf(sleepTimerMinutes) + 1) % minsList.length];
  clearTimeout(sleepTimeoutId);

  if (sleepTimerMinutes === 0) {
    btnSleepTimer.innerText = '🌙 Tắt hẹn giờ';
    showToast('Đã tắt hẹn giờ ngủ');
  } else {
    btnSleepTimer.innerText = `🌙 ${sleepTimerMinutes}p`;
    showToast(`Sẽ tự dừng sau ${sleepTimerMinutes} phút`);
    sleepTimeoutId = setTimeout(() => {
      if (ttsActive) stopTTS();
      if (isAutoScrolling) stopAutoScroll();
      sleepTimerMinutes = 0;
      btnSleepTimer.innerText = '🌙 Tắt hẹn giờ';
    }, sleepTimerMinutes * 60000);
  }
};

// ---------------- STUDIO GIAO DIỆN & CHỮ ----------------
const applyTheme = (theme) => {
  const isSpot = document.body.classList.contains('spotlight-on');
  const isBook = readingMode === 'book';
  document.body.className = theme;
  if (isSpot) document.body.classList.add('spotlight-on');
  if (isDropCap) document.body.classList.add('dropcap-on');
  if (isBook) document.body.classList.add('mode-book');

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });
  localStorage.setItem('lumina_theme', theme);
};
window.applyTheme = applyTheme;

const applyCustomColor = (cssVar, val, key) => {
  document.documentElement.style.setProperty(cssVar, val);
  localStorage.setItem(key, val);
};

const resetCustomColors = () => {
  ['--bg', '--text-main', '--dialogue', '--chapter'].forEach((p) =>
    document.documentElement.style.removeProperty(p)
  );
  localStorage.removeItem('lumina_custom_bg');
  localStorage.removeItem('lumina_custom_text');
  localStorage.removeItem('lumina_custom_dialogue');
  localStorage.removeItem('lumina_custom_chapter');
  showToast('Đã khôi phục màu gốc');
};
window.resetCustomColors = resetCustomColors;

pickerBg.addEventListener('input', (e) => applyCustomColor('--bg', e.target.value, 'lumina_custom_bg'));
pickerText.addEventListener('input', (e) => applyCustomColor('--text-main', e.target.value, 'lumina_custom_text'));
pickerDialogue.addEventListener('input', (e) => applyCustomColor('--dialogue', e.target.value, 'lumina_custom_dialogue'));
pickerChapter.addEventListener('input', (e) => applyCustomColor('--chapter', e.target.value, 'lumina_custom_chapter'));

const applyWarmth = (val) => {
  const alpha = (val / 100) * 0.45;
  eyeCareOverlay.style.background = `rgba(255, 140, 20, ${alpha})`;
  warmthValLabel.innerText = `${val}%`;
  localStorage.setItem('lumina_warmth', val);
};
warmthSlider.addEventListener('input', (e) => applyWarmth(e.target.value));

const applyFont = (type) => {
  const map = {
    sans: 'var(--font-sans)',
    literata: 'var(--font-literata)',
    lora: 'var(--font-lora)',
    serif: 'var(--font-serif)'
  };
  document.documentElement.style.setProperty('--font-body', map[type] || map.literata);

  document.getElementById('btnFontSans').classList.toggle('active', type === 'sans');
  document.getElementById('btnFontLiterata').classList.toggle('active', type === 'literata');
  document.getElementById('btnFontLora').classList.toggle('active', type === 'lora');
  document.getElementById('btnFontSerif').classList.toggle('active', type === 'serif');
  localStorage.setItem('lumina_font', type);
};
window.applyFont = applyFont;

const stepFontSize = (delta) => {
  let cur = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--font-size')) || 20;
  cur = Math.min(34, Math.max(14, cur + delta));
  document.documentElement.style.setProperty('--font-size', cur + 'px');
  document.getElementById('lblFontSize').innerText = cur + 'px';
  localStorage.setItem('lumina_font_size', cur);
  if (readingMode === 'book') buildBookPages(true);
};
window.stepFontSize = stepFontSize;

const stepLineHeight = (delta) => {
  let cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--line-height')) || 1.9;
  cur = Math.min(2.5, Math.max(1.4, +(cur + delta).toFixed(1)));
  document.documentElement.style.setProperty('--line-height', cur);
  document.getElementById('lblLineHeight').innerText = cur;
  localStorage.setItem('lumina_line_height', cur);
  if (readingMode === 'book') buildBookPages(true);
};
window.stepLineHeight = stepLineHeight;

const stepParaGap = (delta) => {
  let cur = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--para-gap')) || 1.2;
  cur = Math.min(2.4, Math.max(0.6, +(cur + delta).toFixed(1)));
  document.documentElement.style.setProperty('--para-gap', cur + 'em');
  document.getElementById('lblParaGap').innerText = cur + 'em';
  localStorage.setItem('lumina_para_gap', cur);
};
window.stepParaGap = stepParaGap;

const toggleTextAlign = () => {
  textAlignMode = textAlignMode === 'justify' ? 'left' : 'justify';
  document.documentElement.style.setProperty('--text-align', textAlignMode);
  document.getElementById('btnAlign').innerText =
    textAlignMode === 'justify' ? 'Căn lề: Đều 2 bên' : 'Căn lề: Căn trái';
  localStorage.setItem('lumina_align', textAlignMode);
};
window.toggleTextAlign = toggleTextAlign;

const toggleDropCap = () => {
  isDropCap = !isDropCap;
  document.body.classList.toggle('dropcap-on', isDropCap);
  const btn = document.getElementById('btnDropCap');
  btn.innerText = isDropCap ? 'Chữ hoa đầu chương: Bật' : 'Chữ hoa đầu chương: Tắt';
  btn.classList.toggle('active', isDropCap);
  localStorage.setItem('lumina_dropcap', isDropCap);
};
window.toggleDropCap = toggleDropCap;

const applyWidth = (w) => {
  document.documentElement.style.setProperty('--content-width', w);
  localStorage.setItem('lumina_width', w);
  if (readingMode === 'book') buildBookPages(true);
};
window.applyWidth = applyWidth;

const toggleSpotlight = () => {
  document.body.classList.toggle('spotlight-on');
  const isOn = document.body.classList.contains('spotlight-on');
  const btn = document.getElementById('btnSpotlight');
  btn.innerText = isOn ? '💡 Đèn rọi tập trung: Bật' : '💡 Đèn rọi tập trung: Tắt';
  btn.classList.toggle('active', isOn);
  localStorage.setItem('lumina_spotlight', isOn);
};
window.toggleSpotlight = toggleSpotlight;

const toggleBionic = () => {
  isBionic = !isBionic;
  const btn = document.getElementById('btnBionic');
  btn.innerText = isBionic ? 'Bionic Reading: Bật' : 'Bionic Reading: Tắt';
  btn.classList.toggle('active', isBionic);
  localStorage.setItem('lumina_bionic', isBionic);
  rebuildAndRender(true);
};
window.toggleBionic = toggleBionic;

const toggleUnbreak = () => {
  isUnbreak = !isUnbreak;
  const btn = document.getElementById('btnUnbreak');
  btn.innerText = isUnbreak ? 'Vá dòng bị gãy: Bật' : 'Vá dòng bị gãy: Tắt';
  btn.classList.toggle('active', isUnbreak);
  localStorage.setItem('lumina_unbreak', isUnbreak);
  const raw = localStorage.getItem('lumina_saved_text');
  if (raw) {
    chaptersList = parseTextIntoChapters(raw);
    rebuildAndRender(true);
  }
};
window.toggleUnbreak = toggleUnbreak;

const toggleTwoCols = () => {
  isTwoCols = !isTwoCols;
  document.documentElement.style.setProperty('--column-count', isTwoCols ? '2' : '1');
  const btn = document.getElementById('btnTwoCols');
  btn.innerText = isTwoCols ? 'Chia 2 cột (iPad/PC): Bật' : 'Chia 2 cột (iPad/PC): Tắt';
  btn.classList.toggle('active', isTwoCols);
  localStorage.setItem('lumina_cols', isTwoCols);
};
window.toggleTwoCols = toggleTwoCols;

const commitReplacements = () => {
  localStorage.setItem('lumina_replacements', replaceInput.value);
  rebuildAndRender(true);
  showToast('Đã áp dụng từ điển đổi tên');
};
window.commitReplacements = commitReplacements;

// ---------------- NẠP FILE .TXT ----------------
dropArea.onclick = () => fileUpload.click();
fileUpload.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    textInput.value = ev.target.result;
    commitTextAndRead();
  };
  reader.readAsText(file);
};

// ---------------- SỰ KIỆN NÚT BẤM & PHÍM TẮT ----------------
const closeAllOverlays = () => {
  drawerNav.classList.remove('open');
  drawerOpts.classList.remove('open');
  modalGuide.classList.remove('open');
  curtain.classList.remove('active');
};

document.getElementById('btnOpenNav').onclick = () => {
  closeAllOverlays();
  drawerNav.classList.add('open');
  curtain.classList.add('active');
};
document.getElementById('btnOpenOpts').onclick = () => {
  closeAllOverlays();
  drawerOpts.classList.add('open');
};
document.getElementById('btnHelp').onclick = () => {
  drawerOpts.classList.remove('open');
  modalGuide.classList.add('open');
  curtain.classList.add('active');
};

document.getElementById('btnCloseNav').onclick = closeAllOverlays;
document.getElementById('btnCloseOpts').onclick = closeAllOverlays;
document.getElementById('btnCloseGuide').onclick = closeAllOverlays;
curtain.onclick = closeAllOverlays;

document.getElementById('btnDockInput').onclick = () => {
  closeAllOverlays();
  inputSheet.classList.toggle('hidden');
  if (!inputSheet.classList.contains('hidden')) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

document.getElementById('btnBookModeDock').onclick = () => {
  setReadingMode(readingMode === 'book' ? 'scroll' : 'book');
  showToast(readingMode === 'book' ? '📖 Chế độ Lật trang sách' : '↕️ Chế độ Cuộn dọc');
};

document.getElementById('btnQuickReadMode').onclick = () => {
  setReadingMode(readingMode === 'book' ? 'scroll' : 'book');
  showToast(readingMode === 'book' ? '📖 Chế độ Lật trang sách' : '↕️ Chế độ Cuộn dọc');
};

btnCancelComposer.onclick = () => inputSheet.classList.add('hidden');
document.getElementById('btnClearMainText').onclick = () => {
  instantClearInput(textInput);
  showToast('Đã xoá trắng ô nhập');
};
document.getElementById('btnClearReplace').onclick = () => {
  instantClearInput(replaceInput);
  localStorage.removeItem('lumina_replacements');
  rebuildAndRender(true);
  showToast('Đã xoá bảng đổi từ');
};

document.getElementById('btnPasteClipboard').onclick = async () => {
  try {
    const clip = await navigator.clipboard.readText();
    if (clip && clip.trim()) {
      textInput.value = clip;
      commitTextAndRead();
    }
  } catch (err) {
    textInput.focus();
  }
};

document.getElementById('btnStartRead').onclick = commitTextAndRead;
document.getElementById('btnFinishAndNew').onclick = closeCurrentAndOpenBlank;
document.getElementById('btnFinishAndPaste').onclick = closeCurrentAndPasteClipboard;
document.getElementById('btnNewBlankChap').onclick = closeCurrentAndOpenBlank;
document.getElementById('btnHeaderNewChap').onclick = closeCurrentAndOpenBlank;
document.getElementById('btnAppendChapter').onclick = openAppendMode;

document.getElementById('btnClearHistory').onclick = () => {
  localStorage.removeItem('lumina_histories');
  buildHistoryUI();
  showToast('Đã xoá toàn bộ lịch sử');
};

document.getElementById('btnScrollTop').onclick = () => {
  closeAllOverlays();
  if (readingMode === 'book') {
    currentPageIdx = 0;
    renderCurrentBookPage('prev');
  } else {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
};

btnAutoScroll.onclick = toggleAutoScroll;
btnTTS.onclick = toggleTTS;

textInput.addEventListener('paste', () => {
  setTimeout(() => {
    commitTextAndRead();
  }, 60);
});

// Phím tắt bàn phím (Hỗ trợ mũi tên Trái/Phải để lật trang sách)
window.addEventListener('keydown', (e) => {
  if (
    document.activeElement === textInput ||
    document.activeElement === replaceInput ||
    document.activeElement === searchInput
  )
    return;

  if (readingMode === 'book' && (e.key === 'ArrowRight' || e.key === 'PageDown')) {
    e.preventDefault();
    turnBookPage(1);
  } else if (readingMode === 'book' && (e.key === 'ArrowLeft' || e.key === 'PageUp')) {
    e.preventDefault();
    turnBookPage(-1);
  } else if (e.code === 'Space') {
    e.preventDefault();
    if (readingMode === 'book') turnBookPage(1);
    else toggleAutoScroll();
  } else if (e.key === 'j' || e.key === 'J') {
    currentParaIdx++;
    document
      .querySelector(`.para[data-index="${currentParaIdx}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (e.key === 'k' || e.key === 'K') {
    if (currentParaIdx > 0) currentParaIdx--;
    document
      .querySelector(`.para[data-index="${currentParaIdx}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  } else if (e.key === 'f' || e.key === 'F') {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
  }
});

// Tự ẩn thanh điều hướng khi cuộn dọc
window.addEventListener(
  'scroll',
  () => {
    if (readingMode === 'book') return;
    const curY = window.scrollY;
    const totalH = document.documentElement.scrollHeight - window.innerHeight;
    const progress = totalH > 0 ? Math.min(100, Math.max(0, (curY / totalH) * 100)) : 0;

    progressFill.style.width = `${progress}%`;
    statPercent.innerText = `${Math.round(progress)}%`;
    localStorage.setItem('lumina_scroll_pos', curY);

    const isNearBottom = curY + window.innerHeight >= document.documentElement.scrollHeight - 120;
    if (curY > 120 && curY > lastScrollY + 8 && !isNearBottom && searchPanel.classList.contains('hidden')) {
      zenHeader.classList.add('bar-hidden');
      islandDock.classList.add('bar-hidden');
      drawerOpts.classList.remove('open');
    } else if (curY < lastScrollY - 8 || curY < 80 || isNearBottom) {
      zenHeader.classList.remove('bar-hidden');
      islandDock.classList.remove('bar-hidden');
    }
    lastScrollY = curY;
  },
  { passive: true }
);

// ---------------- KHỞI TẠO ----------------
window.addEventListener('DOMContentLoaded', () => {
  isDropCap = localStorage.getItem('lumina_dropcap') !== 'false';
  document.body.classList.toggle('dropcap-on', isDropCap);
  const dropBtn = document.getElementById('btnDropCap');
  dropBtn.innerText = isDropCap ? 'Chữ hoa đầu chương: Bật' : 'Chữ hoa đầu chương: Tắt';
  dropBtn.classList.toggle('active', isDropCap);

  readingMode = localStorage.getItem('lumina_read_mode') || 'scroll';
  document.getElementById('btnModeScroll').classList.toggle('active', readingMode === 'scroll');
  document.getElementById('btnModeBook').classList.toggle('active', readingMode === 'book');
  document.getElementById('btnBookModeDock').classList.toggle('active', readingMode === 'book');
  document.getElementById('btnQuickReadMode').innerText = readingMode === 'book' ? '📖 Sách' : '↕️ Cuộn';

  flipAnimStyle = localStorage.getItem('lumina_flip_anim') || 'slide';
  document.getElementById('btnAnimSlide').classList.toggle('active', flipAnimStyle === 'slide');
  document.getElementById('btnAnimCurl').classList.toggle('active', flipAnimStyle === 'curl');

  const savedTheme = localStorage.getItem('lumina_theme') || 'theme-dark';
  applyTheme(savedTheme);

  const cBg = localStorage.getItem('lumina_custom_bg');
  if (cBg) { document.documentElement.style.setProperty('--bg', cBg); pickerBg.value = cBg; }
  const cTxt = localStorage.getItem('lumina_custom_text');
  if (cTxt) { document.documentElement.style.setProperty('--text-main', cTxt); pickerText.value = cTxt; }
  const cDia = localStorage.getItem('lumina_custom_dialogue');
  if (cDia) { document.documentElement.style.setProperty('--dialogue', cDia); pickerDialogue.value = cDia; }
  const cChap = localStorage.getItem('lumina_custom_chapter');
  if (cChap) { document.documentElement.style.setProperty('--chapter', cChap); pickerChapter.value = cChap; }

  const savedWarmth = localStorage.getItem('lumina_warmth') || 0;
  warmthSlider.value = savedWarmth;
  applyWarmth(savedWarmth);

  const savedFont = localStorage.getItem('lumina_font') || 'literata';
  applyFont(savedFont);

  const savedSize = localStorage.getItem('lumina_font_size');
  if (savedSize) {
    document.documentElement.style.setProperty('--font-size', savedSize + 'px');
    document.getElementById('lblFontSize').innerText = savedSize + 'px';
  }

  const savedLh = localStorage.getItem('lumina_line_height');
  if (savedLh) {
    document.documentElement.style.setProperty('--line-height', savedLh);
    document.getElementById('lblLineHeight').innerText = savedLh;
  }

  const savedGap = localStorage.getItem('lumina_para_gap');
  if (savedGap) {
    document.documentElement.style.setProperty('--para-gap', savedGap + 'em');
    document.getElementById('lblParaGap').innerText = savedGap + 'em';
  }

  const savedAlign = localStorage.getItem('lumina_align');
  if (savedAlign) {
    textAlignMode = savedAlign;
    document.documentElement.style.setProperty('--text-align', savedAlign);
    document.getElementById('btnAlign').innerText =
      savedAlign === 'justify' ? 'Căn lề: Đều 2 bên' : 'Căn lề: Căn trái';
  }

  const savedWidth = localStorage.getItem('lumina_width');
  if (savedWidth) applyWidth(savedWidth);

  isBionic = localStorage.getItem('lumina_bionic') === 'true';
  document.getElementById('btnBionic').innerText = isBionic ? 'Bionic Reading: Bật' : 'Bionic Reading: Tắt';
  document.getElementById('btnBionic').classList.toggle('active', isBionic);

  isUnbreak = localStorage.getItem('lumina_unbreak') === 'true';
  document.getElementById('btnUnbreak').innerText = isUnbreak ? 'Vá dòng bị gãy: Bật' : 'Vá dòng bị gãy: Tắt';
  document.getElementById('btnUnbreak').classList.toggle('active', isUnbreak);

  isTwoCols = localStorage.getItem('lumina_cols') === 'true';
  document.documentElement.style.setProperty('--column-count', isTwoCols ? '2' : '1');
  document.getElementById('btnTwoCols').innerText = isTwoCols ? 'Chia 2 cột (iPad/PC): Bật' : 'Chia 2 cột (iPad/PC): Tắt';
  document.getElementById('btnTwoCols').classList.toggle('active', isTwoCols);

  if (localStorage.getItem('lumina_spotlight') === 'true') {
    document.body.classList.add('spotlight-on');
    document.getElementById('btnSpotlight').innerText = '💡 Đèn rọi tập trung: Bật';
    document.getElementById('btnSpotlight').classList.add('active');
  }

  const savedSpeed = localStorage.getItem('lumina_scroll_speed');
  if (savedSpeed) {
    scrollSpeed = parseInt(savedSpeed, 10);
    hudSpeedVal.innerText = scrollSpeed;
  }

  const savedRules = localStorage.getItem('lumina_replacements');
  if (savedRules) replaceInput.value = savedRules;

  buildHistoryUI();

  const lastText = localStorage.getItem('lumina_saved_text');
  if (lastText) {
    chaptersList = parseTextIntoChapters(lastText);
    rebuildAndRender(false);
    inputSheet.classList.add('hidden');

    if (readingMode === 'scroll') {
      const scrollPos = localStorage.getItem('lumina_scroll_pos');
      if (scrollPos) {
        setTimeout(() => window.scrollTo({ top: parseInt(scrollPos, 10), behavior: 'smooth' }), 100);
      }
    }
  }
});