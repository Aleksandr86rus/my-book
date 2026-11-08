(function () {
  "use strict";

  const TOTAL = 163;
  const SECTION = 20;
  const MAX_ZOOM = 4;
  const DOUBLE_TAP_ZOOM = 2.5;
  const KEY = "photobook-last-page";
  const pageSrc = n => `images/page (${n}).jpg`;

  const $ = id => document.getElementById(id);
  const el = {
    app: $("app"),
    loader: $("loader"),
    progress: $("progressFill"),
    indicator: $("pageIndicator"),
    slider: $("pageSlider"),
    prev: $("btnPrev"),
    next: $("btnNext"),
    thumbBtn: $("btnThumbnails"),
    fullBtn: $("btnFullscreen"),
    container: $("bookContainer"),
    book: $("book"),
    thumbPanel: $("thumbnailsPanel"),
    thumbGrid: $("thumbnailsGrid"),
    thumbClose: $("btnCloseThumbnails")
  };

  let cur = 1;
  let zoom = 1, panX = 0, panY = 0;
  let uiVisible = true;
  let tapTimer = null, lastTapTime = 0;

  // одна картинка, которую меняем при листании
  const img = document.createElement("img");
  const msg = document.createElement("div");
  msg.className = "page-msg hidden";
  el.book.append(img, msg);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // ---------- сохранение позиции ----------
  function savePos() {
    try { localStorage.setItem(KEY, String(cur)); } catch (e) {}
  }
  function loadPos() {
    try {
      const v = parseInt(localStorage.getItem(KEY), 10);
      return v >= 1 && v <= TOTAL ? v : 1;
    } catch (e) { return 1; }
  }

  // ---------- зум и перемещение ----------
  function applyZoom(animated) {
    img.style.transition = animated
      ? "transform 0.25s ease-out, opacity 0.25s ease"
      : "none";
    img.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }

  function clampPan() {
    const w = el.book.clientWidth, h = el.book.clientHeight;
    const maxX = (zoom - 1) * w / 2;
    const maxY = (zoom - 1) * h / 2;
    panX = clamp(panX, -maxX, maxX);
    panY = clamp(panY, -maxY, maxY);
  }

  function resetZoom(animated = true) {
    zoom = 1; panX = 0; panY = 0;
    applyZoom(animated);
  }

  function zoomAt(cx, cy) {
    const r = el.container.getBoundingClientRect();
    const ox = cx - (r.left + r.width / 2);
    const oy = cy - (r.top + r.height / 2);
    zoom = DOUBLE_TAP_ZOOM;
    panX = ox * (1 - zoom);
    panY = oy * (1 - zoom);
    clampPan();
    applyZoom(true);
  }

  // ---------- показ страниц ----------
  function show(n) {
    cur = n;
    msg.classList.add("hidden");
    img.style.opacity = "0";
    img.alt = `Страница ${n}`;
    img.onload = () => { img.style.opacity = "1"; };
    img.onerror = () => {
      img.style.opacity = "0";
      msg.textContent = `Страница ${n} не загрузилась`;
      msg.classList.remove("hidden");
    };
    img.src = pageSrc(n);
  }

  function preload(n) {
    [n + 1, n + 2, n + 3, n - 1].forEach(p => {
      if (p >= 1 && p <= TOTAL) new Image().src = pageSrc(p);
    });
  }

  function updateUI() {
    el.indicator.textContent = `Стр. ${cur} / ${TOTAL}`;
    el.slider.value = cur;
    el.prev.disabled = cur <= 1;
    el.next.disabled = cur >= TOTAL;
  }

  function go(n) {
    n = clamp(Math.round(n), 1, TOTAL);
    if (n === cur) return;
    resetZoom(false);
    show(n);
    updateUI();
    savePos();
    preload(n);
  }

  const next = () => go(cur + 1);
  const prev = () => go(cur - 1);

  // ---------- панели ----------
  function setUI(visible) {
    uiVisible = visible;
    document.body.classList.toggle("ui-hidden", !visible);
  }

  // ---------- жесты (мышь и пальцы) ----------
  const pointers = new Map();
  let start = null;   // {x, y, t, panX, panY}
  let moved = false;
  let pinch = null;   // {dist, zoom}
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

  function handleTap(x, y) {
    const now = Date.now();
    const double = now - lastTapTime < 300;
    lastTapTime = now;
    clearTimeout(tapTimer);

    if (zoom > 1) {
      if (double) resetZoom();
      else tapTimer = setTimeout(() => setUI(!uiVisible), 260);
      return;
    }

    const rel = x / el.container.clientWidth;
    if (rel < 0.25) { prev(); return; }
    if (rel > 0.75) { next(); return; }

    if (double) {
      lastTapTime = 0;
      zoomAt(x, y);
      return;
    }
    tapTimer = setTimeout(() => setUI(!uiVisible), 260);
  }

  function bindGestures() {
    const c = el.container;

    c.addEventListener("pointerdown", e => {
      try { c.setPointerCapture(e.pointerId); } catch (err) {}
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 1) {
        start = { x: e.clientX, y: e.clientY, t: Date.now(), panX, panY };
        moved = false;
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { dist: dist(a, b), zoom };
        moved = true;
      }
    });

    c.addEventListener("pointermove", e => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointers.size === 2 && pinch) {
        const [a, b] = [...pointers.values()];
        zoom = clamp(pinch.zoom * dist(a, b) / pinch.dist, 1, MAX_ZOOM);
        clampPan();
        applyZoom(false);
      } else if (pointers.size === 1 && start) {
        const dx = e.clientX - start.x;
        const dy = e.clientY - start.y;
        if (Math.hypot(dx, dy) > 8) moved = true;
        if (zoom > 1) {
          panX = start.panX + dx;
          panY = start.panY + dy;
          clampPan();
          applyZoom(false);
        }
      }
    });

    const up = e => {
      if (!pointers.has(e.pointerId)) return;
      const wasSingle = pointers.size === 1;
      pointers.delete(e.pointerId);

      if (pinch) {
        if (pointers.size === 1) {
          const [p] = [...pointers.values()];
          start = { x: p.x, y: p.y, t: Date.now(), panX, panY };
          moved = true;
        }
        if (pointers.size === 0) {
          pinch = null;
          if (zoom < 1.05) resetZoom();
        }
        return;
      }

      if (!wasSingle || !start) return;

      const dx = e.clientX - start.x;
      const dy = e.clientY - start.y;

      if (moved) {
        // свайп по горизонтали, только когда фото не увеличено
        if (zoom === 1 && Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
          if (dx < 0) next(); else prev();
        }
        return;
      }

      if (Date.now() - start.t > 400) return;
      handleTap(e.clientX, e.clientY);
    };

    c.addEventListener("pointerup", up);
    c.addEventListener("pointercancel", e => {
      pointers.delete(e.pointerId);
      if (pointers.size === 0) pinch = null;
    });
  }

  // ---------- кнопки и клавиатура ----------
  function bindButtons() {
    el.prev.onclick = prev;
    el.next.onclick = next;
    el.slider.oninput = () => go(Number(el.slider.value));
    el.thumbBtn.onclick = openThumbs;
    el.thumbClose.onclick = closeThumbs;

    if (document.documentElement.requestFullscreen) {
      el.fullBtn.onclick = () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      };
    } else {
      el.fullBtn.style.display = "none"; // iPhone Safari не поддерживает
    }

    document.addEventListener("keydown", e => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") closeThumbs();
    });

    window.addEventListener("resize", () => {
      clampPan();
      applyZoom(false);
    });
  }

  // ---------- миниатюры по группам ----------
  function buildThumbTools() {
    const head = el.thumbPanel.querySelector(".thumbnails-header");
    const tools = document.createElement("div");
    tools.className = "thumb-tools";
    tools.innerHTML = `
      <div class="jump">
        <input type="number" inputmode="numeric" min="1" max="${TOTAL}"
               placeholder="№ страницы" id="jumpInput">
        <button type="button" id="jumpBtn">Открыть</button>
      </div>
      <div class="sections" id="sections"></div>`;
    head.after(tools);

    const sections = tools.querySelector("#sections");
    const count = Math.ceil(TOTAL / SECTION);
    for (let s = 0; s < count; s++) {
      const from = s * SECTION + 1;
      const to = Math.min(TOTAL, (s + 1) * SECTION);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.dataset.s = s;
      b.textContent = `${from}–${to}`;
      b.onclick = () => showSection(s);
      sections.appendChild(b);
    }

    const input = tools.querySelector("#jumpInput");
    const jump = () => {
      const n = parseInt(input.value, 10);
      if (n >= 1 && n <= TOTAL) {
        go(n);
        closeThumbs();
      }
    };
    tools.querySelector("#jumpBtn").onclick = jump;
    input.addEventListener("keydown", e => { if (e.key === "Enter") jump(); });
  }

  function showSection(s) {
    el.thumbPanel.querySelectorAll(".chip").forEach(c =>
      c.classList.toggle("active", Number(c.dataset.s) === s));

    const from = s * SECTION + 1;
    const to = Math.min(TOTAL, (s + 1) * SECTION);
    const frag = document.createDocumentFragment();

    el.thumbGrid.innerHTML = "";
    for (let n = from; n <= to; n++) {
      const item = document.createElement("div");
      item.className = "thumb-item" + (n === cur ? " active" : "");

      const im = document.createElement("img");
      im.loading = "lazy";
      im.alt = `Страница ${n}`;
      im.src = pageSrc(n);

      const label = document.createElement("div");
      label.className = "thumb-label";
      label.textContent = n;

      item.append(im, label);
      item.onclick = () => { go(n); closeThumbs(); };
      frag.appendChild(item);
    }
    el.thumbGrid.appendChild(frag);
    el.thumbGrid.scrollTop = 0;
  }

  function openThumbs() {
    showSection(Math.floor((cur - 1) / SECTION));
    el.thumbPanel.classList.remove("hidden");
  }

  function closeThumbs() {
    el.thumbPanel.classList.add("hidden");
  }

  // ---------- запуск ----------
  function loaded(src, ms) {
    return new Promise(res => {
      const p = new Image();
      p.onload = p.onerror = () => res();
      p.src = src;
      setTimeout(res, ms);
    });
  }

  async function init() {
    el.app.classList.remove("hidden");
    el.slider.min = 1;
    el.slider.max = TOTAL;

    buildThumbTools();
    bindButtons();
    bindGestures();

    const start = loadPos();
    cur = start;

    await loaded(pageSrc(start), 6000);
    el.progress.style.width = "100%";

    show(start);
    updateUI();
    preload(start);
    setUI(true);

    setTimeout(() => el.loader.classList.add("fade-out"), 200);
    setTimeout(() => el.loader.remove(), 900);
  }

  init();
})();
