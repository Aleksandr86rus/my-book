(function () {
  "use strict";

  const TOTAL = 163;                               // всего страниц
  const ASPECT = 3 / 4;                            // пропорция страницы: ширина / высота
  const pageSrc = n => `images/page (${n}).jpg`;   // имя должно точно совпадать с файлом

  const $ = id => document.getElementById(id);
  const el = {
    book: $("book"),
    app: $("app"),
    loader: $("loader"),
    progress: $("progressFill"),
    indicator: $("pageIndicator"),
    slider: $("pageSlider"),
    prev: $("btnPrev"),
    next: $("btnNext"),
    thumbBtn: $("btnThumbnails"),
    fullBtn: $("btnFullscreen"),
    thumbPanel: $("thumbnailsPanel"),
    thumbGrid: $("thumbnailsGrid"),
    thumbClose: $("btnCloseThumbnails"),
    container: $("bookContainer")
  };

  let cur = 1;                                     // номер первой страницы в кадре

  const isPortrait = () => window.innerHeight > window.innerWidth;
  const step = () => (isPortrait() ? 1 : 2);

  // ---------- размеры ----------
  function sizeBook() {
    const portrait = isPortrait();
    const availW = window.innerWidth - (portrait ? 16 : 40);
    const availH = window.innerHeight - (portrait ? 140 : 120);
    let w, h;
    if (portrait) {
      w = availW;
      h = w / ASPECT;
      if (h > availH) { h = availH; w = h * ASPECT; }
    } else {
      h = availH;
      w = h * ASPECT * 2;
      if (w > availW) { w = availW; h = w / (2 * ASPECT); }
    }
    el.book.style.width = Math.floor(w) + "px";
    el.book.style.height = Math.floor(h) + "px";
  }

  // ---------- страницы ----------
  function pageNode(n, side) {
    const page = document.createElement("div");
    page.className = "page page-" + side;
    if (n <= TOTAL) {
      const img = document.createElement("img");
      img.alt = "Страница " + n;
      img.src = pageSrc(n);
      img.onerror = () => {
        img.remove();
        page.classList.add("broken");
        page.textContent = "Не загрузилась страница " + n;
      };
      page.appendChild(img);
    } else {
      page.classList.add("empty");
    }
    return page;
  }

  function render() {
    const portrait = isPortrait();
    const old = el.book.querySelector(".spread");

    const spread = document.createElement("div");
    spread.className = "spread" + (portrait ? " single" : "");
    spread.appendChild(pageNode(cur, "left"));
    if (!portrait) spread.appendChild(pageNode(cur + 1, "right"));

    spread.style.opacity = "0";
    el.book.appendChild(spread);
    requestAnimationFrame(() => { spread.style.opacity = "1"; });

    if (old) {
      old.style.opacity = "0";
      setTimeout(() => old.remove(), 300);
    }
  }

  function updateUI() {
    const portrait = isPortrait();
    el.indicator.textContent = (portrait || cur === TOTAL)
      ? `Стр. ${cur} / ${TOTAL}`
      : `Стр. ${cur}–${cur + 1} / ${TOTAL}`;
    el.slider.value = cur;
    el.prev.disabled = cur <= 1;
    el.next.disabled = cur >= TOTAL;
  }

  function preload(from, count) {
    for (let n = from; n < from + count && n <= TOTAL; n++) {
      const im = new Image();
      im.src = pageSrc(n);
    }
  }

  // ---------- навигация ----------
  function go(p) {
    p = Math.max(1, Math.min(TOTAL, p));
    if (!isPortrait() && p % 2 === 0) p -= 1;     // в развороте левая страница нечётная
    if (p === cur) return;
    cur = p;
    render();
    updateUI();
    preload(cur + 1, 4);                           // подгружаем следующие в фоне
  }

  const next = () => go(cur + step());
  const prev = () => go(cur - step());

  function redraw() {
    if (!isPortrait() && cur % 2 === 0) cur -= 1;
    el.book.innerHTML = "";
    sizeBook();
    render();
    updateUI();
  }

  // ---------- миниатюры ----------
  function buildThumbs() {
    for (let n = 1; n <= TOTAL; n++) {
      const item = document.createElement("div");
      item.className = "thumb-item";

      const img = document.createElement("img");
      img.loading = "lazy";
      img.alt = "Страница " + n;
      img.src = pageSrc(n);

      const label = document.createElement("div");
      label.className = "thumb-label";
      label.textContent = n;

      item.append(img, label);
      item.onclick = () => {
        go(n);
        el.thumbPanel.classList.add("hidden");
      };
      el.thumbGrid.appendChild(item);
    }
  }

  function openThumbs() {
    if (!el.thumbGrid.children.length) buildThumbs();
    [...el.thumbGrid.children].forEach((item, i) =>
      item.classList.toggle("active", i + 1 === cur));
    el.thumbPanel.classList.remove("hidden");
  }

  // ---------- события ----------
  function bindEvents() {
    el.prev.onclick = prev;
    el.next.onclick = next;
    el.slider.oninput = () => go(Number(el.slider.value));
    el.thumbBtn.onclick = openThumbs;
    el.thumbClose.onclick = () => el.thumbPanel.classList.add("hidden");

    if (document.documentElement.requestFullscreen) {
      el.fullBtn.onclick = () => {
        if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
        else document.documentElement.requestFullscreen().catch(() => {});
      };
    } else {
      el.fullBtn.style.display = "none";           // iPhone Safari не поддерживает
    }

    document.addEventListener("keydown", e => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
      else if (e.key === "Escape") el.thumbPanel.classList.add("hidden");
    });

    let sx = 0, sy = 0;
    el.container.addEventListener("touchstart", e => {
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
    }, { passive: true });
    el.container.addEventListener("touchend", e => {
      const dx = e.changedTouches[0].clientX - sx;
      const dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) {
        if (dx < 0) next();
        else prev();
      }
    }, { passive: true });

    window.addEventListener("resize", redraw);
  }

  // ---------- запуск ----------
  async function init() {
    el.app.classList.remove("hidden");
    el.slider.min = 1;
    el.slider.max = TOTAL;
    sizeBook();

    // ждём первые страницы, но не дольше 6 секунд
    const first = new Promise(done => {
      const im = new Image();
      im.onload = im.onerror = done;
      im.src = pageSrc(1);
    });
    await Promise.race([first, new Promise(r => setTimeout(r, 6000))]);

    el.progress.style.width = "100%";
    render();
    updateUI();
    preload(2, 6);

    el.loader.classList.add("fade-out");
    setTimeout(() => el.loader.remove(), 700);

    bindEvents();
  }

  init();
})();
