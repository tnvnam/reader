// ---------------- DOM ELEMENTS ----------------
const textInput = document.getElementById('textInput');
const inputSheet = document.getElementById('inputSheet');
const inputModeBadge = document.getElementById('inputModeBadge');
const readerContent = document.getElementById('reader-content');
const chapterEndCard = document.getElementById('chapterEndCard');
const progressFill = document.getElementById('progress-fill');
const metaCapsule = document.getElementById('metaCapsule');
const statWords = document.getElementById('statWords');
const statPercent = document.getElementById('statPercent');
const curtain = document.getElementById('curtain');

const drawerNav = document.getElementById('drawer-nav');
const drawerOpts = document.getElementById('drawer-opts');
const modalGuide = document.getElementById('modalGuide');

const tocContainer = document.getElementById('tocContainer');
const historyContainer = document.getElementById('historyContainer');
const dropArea = document.getElementById('dropArea');
const fileUpload = document.getElementById('fileUpload');
const replaceInput = document.getElementById('replaceInput');
const scrollSpeedSlider = document.getElementById('scrollSpeedSlider');

const btnAutoScroll = document.getElementById('btnAutoScroll');
const btnTTS = document.getElementById('btnTTS');

const pickerBg = document.getElementById('pickerBg');
const pickerText = document.getElementById('pickerText');
const pickerDialogue = document.getElementById('pickerDialogue');

// ---------------- STATES ----------------
// Lưu văn bản đang đọc trong biến JS thay vì giữ nguyên trong <textarea> để chống lag iPhone
let activeStoryText = '';
let isAppendMode = false;

let isAutoScrolling = false;
let autoScrollTimer = null;
let synth = window.speechSynthesis;
let ttsActive = false;
let currentParaIdx = 0;

let isBionic = false;
let isUnbreak = false;
let isTwoCols = false;
let isAltParaColor = true;
let textAlignMode = 'justify';

// ---------------- TEXT PROCESSING ----------------
const isChapter = (str) =>
  /^(chương|hồi|quyển|tiết|thứ)\s+[0-9ivxlcdm]+/i.test(str.trim()) ||
  /^chương\s+/i.test(str.trim());

const formatDialogue = (str) => {
  return str
    .replace(/(".*?"|“.*?”|「.*?」)/g, '<span class="dialogue">$1</span>')
    .replace(/^(-\s.*)/g, '<span class="dialogue">$1</span>');
};

const applyBionic = (str) => {
  if (!isBionic) return str;
  return str.replace(/([a-zA-ZÀ-ỹ0-9]+)/g, (match) => {
    const mid = Math.ceil(match.length / 2);
    return `<span class="bionic-lead">${match.slice(0, mid)}</span>${match.slice(mid)}`;
  });
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
      if (from) {
        out = out.replaceAll(new RegExp(from, 'gi'), to);
      }
    }
  });
  return out;
};

const smartUnbreak = (str) => {
  if (!isUnbreak) return str;
  const rawLines = str.split('\n');
  let res = '';
  for (let i = 0; i < rawLines.length; i++) {
    let cur = rawLines[i].trim();
    if (!cur) continue;
    res += cur;
    if (!/[.!?…”"']$/.test(cur) && !isChapter(cur)) {
      res += ' ';
    } else {
      res += '\n\n';
    }
  }
  return res;
};

const cleanRaw = (raw) => {
  return raw
    .replace(/nguồn\s*:\s*[^\n]+/gi, '')
    .replace(/truyện\s*được\s*đăng\s*tại[^\n]+/gi, '')
    .replace(/chúc\s*bạn\s*đọc\s*truyện\s*vui\s*vẻ[^\n]*/gi, '');
};

// ---------------- FAST CLEAR TEXTAREA (CHỐNG LAG IOS) ----------------
const fastClearTextarea = (el) => {
  // Ngắt focus trước khi xóa để iOS WebKit không tính toán lại vùng chọn
  el.blur();
  requestAnimationFrame(() => {
    el.value = '';
  });
};

// ---------------- RENDER READER ----------------
const renderReader = (fromHistory = false) => {
  let text = cleanRaw(activeStoryText);
  text = smartUnbreak(text);
  text = applyReplacements(text);

  if (!text.trim()) {
    readerContent.innerHTML = '';
    metaCapsule.style.display = 'none';
    chapterEndCard.classList.add('hidden');
    return;
  }

  const lines = text
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  let wordCount = 0;
  let chapterIdx = 0;
  tocContainer.innerHTML = '';

  let firstTitle = '';
  let pCount = 0;

  const html = lines
    .map((line) => {
      wordCount += line.split(/\s+/).length;
      if (isChapter(line)) {
        if (!firstTitle) firstTitle = line;
        chapterIdx++;
        const cId = `chap-${chapterIdx}`;

        const tItem = document.createElement('div');
        tItem.className = 'toc-item';
        tItem.innerText = line;
        tItem.onclick = () => {
          document.getElementById(cId)?.scrollIntoView({ behavior: 'smooth' });
          closeAllDrawers();
        };
        tocContainer.appendChild(tItem);

        return `<div id="${cId}" class="chapter-heading">${line}</div>`;
      }
      const idx = pCount++;
      let formatted = formatDialogue(line);
      if (isBionic) formatted = applyBionic(formatted);
      return `<p class="para" data-index="${idx}">${formatted}</p>`;
    })
    .join('');

  readerContent.innerHTML = html;
  metaCapsule.style.display = 'flex';
  chapterEndCard.classList.remove('hidden');

  const mins = Math.ceil(wordCount / 220);
  statWords.innerText = `${wordCount.toLocaleString()} từ (~${mins} phút)`;

  localStorage.setItem('lumina_saved_text', activeStoryText);
  if (!fromHistory) {
    saveHistoryRecord(firstTitle || lines[0].substring(0, 36), activeStoryText);
  }

  restoreSavedMarker();
};

// ---------------- CHAPTER WORKFLOW (THÊM / ĐÓNG CHƯƠNG) ----------------
const submitInputText = () => {
  const incoming = textInput.value.trim();
  if (!incoming) return;

  if (isAppendMode && activeStoryText.trim()) {
    activeStoryText = activeStoryText.trim() + '\n\n' + incoming;
  } else {
    activeStoryText = incoming;
    clearBookmarkData();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  isAppendMode = false;
  updateInputModeUI();
  renderReader();

  // Giải phóng bộ nhớ <textarea> sau khi đã nạp xong để iPhone luôn mượt
  fastClearTextarea(textInput);
  inputSheet.classList.add('hidden');
};

// Tắt chương hiện tại & Mở ô trống chèn chương mới
const closeChapterAndOpenBlank = () => {
  if (ttsActive) toggleTTS();
  if (isAutoScrolling) toggleAutoScroll();

  activeStoryText = '';
  clearBookmarkData();
  localStorage.removeItem('lumina_saved_text');
  localStorage.removeItem('lumina_scroll_pos');

  readerContent.innerHTML = '';
  metaCapsule.style.display = 'none';
  chapterEndCard.classList.add('hidden');

  isAppendMode = false;
  updateInputModeUI();
  fastClearTextarea(textInput);
  inputSheet.classList.remove('hidden');

  window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Mở ô trống để nối thêm chương mới vào bên dưới chương hiện tại
const openAppendChapterMode = () => {
  isAppendMode = true;
  updateInputModeUI();
  fastClearTextarea(textInput);
  inputSheet.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const updateInputModeUI = () => {
  if (isAppendMode) {
    inputModeBadge.innerText = 'Chế độ: ➕ Nối thêm chương vào cuối';
  } else {
    inputModeBadge.innerText = 'Chế độ: 📖 Thay chương mới';
  }
};

// ---------------- BOOKMARK PIN LOGIC ----------------
const isWordChar = (char) => /[a-zA-Z0-9À-ỹ_]/.test(char);
const findWordEnd = (text, offset) => {
  let end = offset;
  while (end < text.length && isWordChar(text[end])) end++;
  return end;
};

readerContent.addEventListener('click', (e) => {
  const para = e.target.closest('.para');
  if (!para) return;

  const index = parseInt(para.dataset.index, 10);

  if (para.classList.contains('bookmarked')) {
    clearBookmarkData();
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

  const marker = document.createElement('span');
  marker.className = 'exact-marker';
  marker.innerText = '📌';

  let charOffset = 0;

  if (targetNode && targetNode.nodeType === Node.TEXT_NODE && para.contains(targetNode)) {
    const textVal = targetNode.nodeValue;
    const finalOffset = findWordEnd(textVal, targetOffset);

    const parent = targetNode.parentNode;
    if (finalOffset < textVal.length) {
      const afterText = targetNode.splitText(finalOffset);
      parent.insertBefore(marker, afterText);
    } else {
      parent.insertBefore(marker, targetNode.nextSibling);
    }
    charOffset = getCharOffsetInRoot(marker, para);
  } else {
    para.appendChild(marker);
    charOffset = para.textContent.length;
  }

  para.classList.add('bookmarked');
  currentParaIdx = index;

  localStorage.setItem('lumina_bookmark_data', JSON.stringify({ index, charOffset }));
});

const getCharOffsetInRoot = (node, root) => {
  let offset = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
  let cur;
  while ((cur = walker.nextNode())) {
    if (cur === node || node.contains(cur)) break;
    offset += cur.textContent.length;
  }
  return offset;
};

const clearBookmarkData = () => {
  clearBookmarkUI();
  localStorage.removeItem('lumina_bookmark_data');
};

const clearBookmarkUI = () => {
  document.querySelectorAll('.para.bookmarked').forEach((p) => p.classList.remove('bookmarked'));
  document.querySelectorAll('.exact-marker').forEach((m) => m.remove());
};

const restoreSavedMarker = () => {
  const raw = localStorage.getItem('lumina_bookmark_data');
  if (!raw) return;

  try {
    const { index, charOffset } = JSON.parse(raw);
    const para = document.querySelector(`.para[data-index="${index}"]`);
    if (!para) return;

    clearBookmarkUI();
    para.classList.add('bookmarked');
    currentParaIdx = index;

    const marker = document.createElement('span');
    marker.className = 'exact-marker';
    marker.innerText = '📌';

    let currentLen = 0;
    let inserted = false;
    const walker = document.createTreeWalker(para, NodeFilter.SHOW_TEXT, null, false);
    let node;
    while ((node = walker.nextNode())) {
      const nextLen = currentLen + node.textContent.length;
      if (charOffset <= nextLen) {
        let splitPos = Math.max(0, charOffset - currentLen);
        splitPos = findWordEnd(node.textContent, splitPos);

        const parent = node.parentNode;
        if (node.length > splitPos) {
          const secondPart = node.splitText(splitPos);
          parent.insertBefore(marker, secondPart);
        } else {
          parent.insertBefore(marker, node.nextSibling);
        }
        inserted = true;
        break;
      }
      currentLen = nextLen;
    }

    if (!inserted) para.appendChild(marker);
  } catch (e) {
    console.error(e);
  }
};

// ---------------- HISTORY MANAGEMENT ----------------
const saveHistoryRecord = (title, content) => {
  let list = JSON.parse(localStorage.getItem('lumina_histories') || '[]');
  list = list.filter((h) => h.content !== content);
  list.unshift({ title, content, date: new Date().toLocaleDateString('vi-VN') });
  if (list.length > 15) list.pop();
  localStorage.setItem('lumina_histories', JSON.stringify(list));
  buildHistoryUI();
};

const buildHistoryUI = () => {
  const list = JSON.parse(localStorage.getItem('lumina_histories') || '[]');
  historyContainer.innerHTML =
    list.length === 0
      ? '<div style="color:var(--text-sub);font-size:13px;padding:8px;">Chưa có lịch sử</div>'
      : '';
  list.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'history-card';
    card.innerHTML = `<strong>${item.title}</strong><small>${item.date}</small>`;
    card.onclick = () => {
      activeStoryText = item.content;
      fastClearTextarea(textInput);
      inputSheet.classList.add('hidden');
      renderReader(true);
      closeAllDrawers();
    };
    historyContainer.appendChild(card);
  });
};

// ---------------- TEXT TO SPEECH (TTS) ----------------
const toggleTTS = () => {
  if (ttsActive) {
    synth.cancel();
    ttsActive = false;
    btnTTS.classList.remove('active');
    document.querySelectorAll('.para.speaking').forEach((p) => p.classList.remove('speaking'));
  } else {
    synth.cancel();
    ttsActive = true;
    btnTTS.classList.add('active');
    playSpeech(currentParaIdx);
  }
};

const playSpeech = (idx) => {
  if (!ttsActive) return;
  const target = document.querySelector(`.para[data-index="${idx}"]`);
  if (!target) {
    toggleTTS();
    return;
  }

  document.querySelectorAll('.para.speaking').forEach((p) => p.classList.remove('speaking'));
  target.classList.add('speaking');
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });

  let textNode = target.cloneNode(true);
  textNode.querySelectorAll('.exact-marker').forEach((m) => m.remove());

  const utter = new SpeechSynthesisUtterance(textNode.innerText);
  utter.lang = 'vi-VN';
  utter.rate = 1.0;

  utter.onend = () => {
    if (!ttsActive) return;
    currentParaIdx = idx + 1;
    playSpeech(currentParaIdx);
  };

  utter.onerror = () => {
    if (ttsActive) toggleTTS();
  };

  synth.speak(utter);
};

// ---------------- UI & APPEARANCE SETTINGS ----------------
const applyTheme = (theme) => {
  const isSpotlight = document.body.classList.contains('spotlight-on');
  document.body.className = theme;
  if (isSpotlight) document.body.classList.add('spotlight-on');
  if (isAltParaColor) document.body.classList.add('alt-para-on');

  document.querySelectorAll('.theme-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.theme === theme);
  });

  localStorage.setItem('lumina_theme', theme);
};

// Custom Color Pickers
const applyCustomColor = (cssVar, value, storageKey) => {
  document.documentElement.style.setProperty(cssVar, value);
  localStorage.setItem(storageKey, value);
};

const resetCustomColors = () => {
  ['--bg', '--text-main', '--dialogue'].forEach((prop) =>
    document.documentElement.style.removeProperty(prop)
  );
  localStorage.removeItem('lumina_custom_bg');
  localStorage.removeItem('lumina_custom_text');
  localStorage.removeItem('lumina_custom_dialogue');
};

pickerBg.addEventListener('input', (e) =>
  applyCustomColor('--bg', e.target.value, 'lumina_custom_bg')
);
pickerText.addEventListener('input', (e) =>
  applyCustomColor('--text-main', e.target.value, 'lumina_custom_text')
);
pickerDialogue.addEventListener('input', (e) =>
  applyCustomColor('--dialogue', e.target.value, 'lumina_custom_dialogue')
);

const toggleAltParaColor = () => {
  isAltParaColor = !isAltParaColor;
  document.body.classList.toggle('alt-para-on', isAltParaColor);
  const btn = document.getElementById('btnAltParaColor');
  btn.innerText = isAltParaColor
    ? '🎨 Đổi màu đoạn chẵn/lẻ: Bật'
    : '🎨 Đổi màu đoạn chẵn/lẻ: Tắt';
  btn.classList.toggle('active', isAltParaColor);
  localStorage.setItem('lumina_alt_para', isAltParaColor);
};

const applyFont = (type) => {
  const fontMap = {
    sans: 'var(--font-sans)',
    serif: 'var(--font-serif)',
    lora: 'var(--font-lora)',
    literata: 'var(--font-literata)'
  };
  document.documentElement.style.setProperty('--font-body', fontMap[type] || fontMap.sans);

  document.getElementById('btnFontSans').classList.toggle('active', type === 'sans');
  document.getElementById('btnFontSerif').classList.toggle('active', type === 'serif');
  document.getElementById('btnFontLora').classList.toggle('active', type === 'lora');
  document.getElementById('btnFontLiterata').classList.toggle('active', type === 'literata');
  localStorage.setItem('lumina_font', type);
};

const stepFontSize = (delta) => {
  let cur =
    parseInt(getComputedStyle(document.documentElement).getPropertyValue('--font-size')) || 19;
  cur = Math.min(34, Math.max(14, cur + delta));
  document.documentElement.style.setProperty('--font-size', cur + 'px');
  localStorage.setItem('lumina_font_size', cur);
};

const stepLineHeight = (delta) => {
  let cur =
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--line-height')) ||
    1.88;
  cur = Math.min(2.5, Math.max(1.4, +(cur + delta).toFixed(2)));
  document.documentElement.style.setProperty('--line-height', cur);
  localStorage.setItem('lumina_line_height', cur);
};

const toggleTextAlign = () => {
  textAlignMode = textAlignMode === 'justify' ? 'left' : 'justify';
  document.documentElement.style.setProperty('--text-align', textAlignMode);
  document.getElementById('btnAlign').innerText =
    textAlignMode === 'justify' ? 'Căn lề: Đều 2 bên' : 'Căn lề: Trái';
  localStorage.setItem('lumina_align', textAlignMode);
};

const applyWidth = (w) => {
  document.documentElement.style.setProperty('--content-width', w);
  localStorage.setItem('lumina_width', w);
};

const toggleSpotlight = () => {
  document.body.classList.toggle('spotlight-on');
  const isOn = document.body.classList.contains('spotlight-on');
  const btn = document.getElementById('btnSpotlight');
  btn.innerText = isOn ? '💡 Đèn Rọi: Bật' : '💡 Đèn Rọi: Tắt';
  btn.classList.toggle('active', isOn);
  localStorage.setItem('lumina_spotlight', isOn);
};

const toggleBionic = () => {
  isBionic = !isBionic;
  document.getElementById('btnBionic').innerText = isBionic ? 'Bionic: Bật' : 'Bionic: Tắt';
  document.getElementById('btnBionic').classList.toggle('active', isBionic);
  localStorage.setItem('lumina_bionic', isBionic);
  renderReader(true);
};

const toggleUnbreak = () => {
  isUnbreak = !isUnbreak;
  document.getElementById('btnUnbreak').innerText = isUnbreak
    ? 'Vá ngắt dòng: Bật'
    : 'Vá ngắt dòng: Tắt';
  document.getElementById('btnUnbreak').classList.toggle('active', isUnbreak);
  localStorage.setItem('lumina_unbreak', isUnbreak);
};

const toggleTwoCols = () => {
  isTwoCols = !isTwoCols;
  document.documentElement.style.setProperty('--column-count', isTwoCols ? '2' : '1');
  document.getElementById('btnTwoCols').innerText = isTwoCols ? '2 Cột: Bật' : '2 Cột: Tắt';
  document.getElementById('btnTwoCols').classList.toggle('active', isTwoCols);
  localStorage.setItem('lumina_cols', isTwoCols);
};

scrollSpeedSlider.oninput = () => {
  localStorage.setItem('lumina_scroll_speed', scrollSpeedSlider.value);
};

const commitReplacements = () => {
  localStorage.setItem('lumina_replacements', replaceInput.value);
  renderReader(true);
};

// ---------------- AUTO SCROLL ----------------
const toggleAutoScroll = () => {
  isAutoScrolling = !isAutoScrolling;
  btnAutoScroll.classList.toggle('active', isAutoScrolling);

  if (isAutoScrolling) {
    const speed = scrollSpeedSlider.value;
    const interval = Math.max(12, 60 - speed * 5);
    autoScrollTimer = setInterval(() => {
      window.scrollBy(0, 1);
      if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 5) {
        toggleAutoScroll();
      }
    }, interval);
  } else {
    clearInterval(autoScrollTimer);
  }
};

// ---------------- FILE UPLOAD & DRAG DROP ----------------
dropArea.onclick = () => fileUpload.click();
fileUpload.onchange = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    activeStoryText = isAppendMode && activeStoryText
      ? activeStoryText + '\n\n' + ev.target.result
      : ev.target.result;
    isAppendMode = false;
    updateInputModeUI();
    renderReader();
    fastClearTextarea(textInput);
    inputSheet.classList.add('hidden');
  };
  reader.readAsText(file);
};

dropArea.ondragover = (e) => {
  e.preventDefault();
  dropArea.classList.add('dragover');
};
dropArea.ondragleave = () => dropArea.classList.remove('dragover');
dropArea.ondrop = (e) => {
  e.preventDefault();
  dropArea.classList.remove('dragover');
  if (e.dataTransfer.files.length) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      activeStoryText = ev.target.result;
      renderReader();
      fastClearTextarea(textInput);
      inputSheet.classList.add('hidden');
    };
    reader.readAsText(e.dataTransfer.files[0]);
  }
};

// ---------------- DRAWERS & EVENT LISTENERS ----------------
const closeAllDrawers = () => {
  drawerNav.classList.remove('open');
  drawerOpts.classList.remove('open');
  modalGuide.classList.remove('open');
  curtain.classList.remove('active');
};

document.getElementById('btnOpenNav').onclick = () => {
  closeAllDrawers();
  drawerNav.classList.add('open');
  curtain.classList.add('active');
};
document.getElementById('btnOpenOpts').onclick = () => {
  closeAllDrawers();
  drawerOpts.classList.add('open');
  curtain.classList.add('active');
};
document.getElementById('btnHelp').onclick = () => {
  closeAllDrawers();
  modalGuide.classList.add('open');
  curtain.classList.add('active');
};

document.getElementById('btnCloseNav').onclick = closeAllDrawers;
document.getElementById('btnCloseOpts').onclick = closeAllDrawers;
document.getElementById('btnCloseGuide').onclick = closeAllDrawers;
curtain.onclick = closeAllDrawers;

// Nút mở/ẩn khung nhập (Chỉ nạp text vào ô khi người dùng muốn xem/sửa)
document.getElementById('btnToggleInput').onclick = () => {
  const willShow = inputSheet.classList.contains('hidden');
  inputSheet.classList.toggle('hidden');
  if (willShow) {
    isAppendMode = false;
    updateInputModeUI();
  }
};

// Các nút Xoá nhanh & Dán nhanh trên Mobile
document.getElementById('btnClearMainText').onclick = () => fastClearTextarea(textInput);
document.getElementById('btnClearReplace').onclick = () => {
  fastClearTextarea(replaceInput);
  localStorage.removeItem('lumina_replacements');
  renderReader(true);
};

document.getElementById('btnPasteClipboard').onclick = async () => {
  try {
    const clipText = await navigator.clipboard.readText();
    if (clipText) {
      textInput.value = clipText;
      submitInputText();
    }
  } catch (err) {
    textInput.focus();
  }
};

document.getElementById('btnStartRead').onclick = submitInputText;
document.getElementById('btnFinishAndNew').onclick = closeChapterAndOpenBlank;
document.getElementById('btnNewBlankChap').onclick = closeChapterAndOpenBlank;
document.getElementById('btnQuickNewChap').onclick = closeChapterAndOpenBlank;
document.getElementById('btnAppendChapter').onclick = openAppendChapterMode;

document.getElementById('btnClearHistory').onclick = () => {
  localStorage.removeItem('lumina_histories');
  buildHistoryUI();
};

document.getElementById('btnScrollTop').onclick = () =>
  window.scrollTo({ top: 0, behavior: 'smooth' });
btnAutoScroll.onclick = toggleAutoScroll;
btnTTS.onclick = toggleTTS;

// Tự động đọc ngay khi dán vào ô textInput
textInput.addEventListener('paste', () => {
  setTimeout(() => {
    submitInputText();
  }, 60);
});

// Phím tắt bàn phím
window.addEventListener('keydown', (e) => {
  if (document.activeElement === textInput || document.activeElement === replaceInput) return;

  if (e.code === 'Space') {
    e.preventDefault();
    toggleAutoScroll();
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

// Thanh tiến trình cuộn
window.addEventListener(
  'scroll',
  () => {
    const totalH = document.documentElement.scrollHeight - window.innerHeight;
    const progress = totalH > 0 ? (window.scrollY / totalH) * 100 : 0;
    progressFill.style.width = `${progress}%`;
    statPercent.innerText = `${Math.round(progress)}%`;
    localStorage.setItem('lumina_scroll_pos', window.scrollY);
  },
  { passive: true }
);

// ---------------- INITIALIZATION ----------------
window.addEventListener('DOMContentLoaded', () => {
  isAltParaColor = localStorage.getItem('lumina_alt_para') !== 'false';
  document.body.classList.toggle('alt-para-on', isAltParaColor);
  document.getElementById('btnAltParaColor').innerText = isAltParaColor
    ? '🎨 Đổi màu đoạn chẵn/lẻ: Bật'
    : '🎨 Đổi màu đoạn chẵn/lẻ: Tắt';

  const savedTheme = localStorage.getItem('lumina_theme') || 'theme-dark';
  applyTheme(savedTheme);

  // Khôi phục màu tùy chỉnh nếu có
  const customBg = localStorage.getItem('lumina_custom_bg');
  if (customBg) {
    document.documentElement.style.setProperty('--bg', customBg);
    pickerBg.value = customBg;
  }
  const customText = localStorage.getItem('lumina_custom_text');
  if (customText) {
    document.documentElement.style.setProperty('--text-main', customText);
    pickerText.value = customText;
  }
  const customDialogue = localStorage.getItem('lumina_custom_dialogue');
  if (customDialogue) {
    document.documentElement.style.setProperty('--dialogue', customDialogue);
    pickerDialogue.value = customDialogue;
  }

  const savedFont = localStorage.getItem('lumina_font') || 'sans';
  applyFont(savedFont);

  const savedSize = localStorage.getItem('lumina_font_size');
  if (savedSize) document.documentElement.style.setProperty('--font-size', savedSize + 'px');

  const savedLh = localStorage.getItem('lumina_line_height');
  if (savedLh) document.documentElement.style.setProperty('--line-height', savedLh);

  const savedAlign = localStorage.getItem('lumina_align');
  if (savedAlign) {
    textAlignMode = savedAlign;
    document.documentElement.style.setProperty('--text-align', savedAlign);
    document.getElementById('btnAlign').innerText =
      savedAlign === 'justify' ? 'Căn lề: Đều 2 bên' : 'Căn lề: Trái';
  }

  const savedWidth = localStorage.getItem('lumina_width');
  if (savedWidth) applyWidth(savedWidth);

  isBionic = localStorage.getItem('lumina_bionic') === 'true';
  document.getElementById('btnBionic').innerText = isBionic ? 'Bionic: Bật' : 'Bionic: Tắt';
  document.getElementById('btnBionic').classList.toggle('active', isBionic);

  isUnbreak = localStorage.getItem('lumina_unbreak') === 'true';
  document.getElementById('btnUnbreak').innerText = isUnbreak
    ? 'Vá ngắt dòng: Bật'
    : 'Vá ngắt dòng: Tắt';
  document.getElementById('btnUnbreak').classList.toggle('active', isUnbreak);

  isTwoCols = localStorage.getItem('lumina_cols') === 'true';
  document.documentElement.style.setProperty('--column-count', isTwoCols ? '2' : '1');
  document.getElementById('btnTwoCols').innerText = isTwoCols ? '2 Cột: Bật' : '2 Cột: Tắt';
  document.getElementById('btnTwoCols').classList.toggle('active', isTwoCols);

  if (localStorage.getItem('lumina_spotlight') === 'true') {
    document.body.classList.add('spotlight-on');
    document.getElementById('btnSpotlight').innerText = '💡 Đèn Rọi: Bật';
    document.getElementById('btnSpotlight').classList.add('active');
  }

  const savedSpeed = localStorage.getItem('lumina_scroll_speed');
  if (savedSpeed) scrollSpeedSlider.value = savedSpeed;

  const savedRules = localStorage.getItem('lumina_replacements');
  if (savedRules) replaceInput.value = savedRules;

  buildHistoryUI();

  const lastText = localStorage.getItem('lumina_saved_text');
  if (lastText) {
    activeStoryText = lastText;
    renderReader(true);
    inputSheet.classList.add('hidden');

    const scrollPos = localStorage.getItem('lumina_scroll_pos');
    if (scrollPos) {
      setTimeout(() => window.scrollTo({ top: parseInt(scrollPos, 10), behavior: 'smooth' }), 120);
    }
  }
});