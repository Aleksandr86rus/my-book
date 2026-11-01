(function () {
    'use strict';

    // ============================================
    //  КОНФИГУРАЦИЯ
    // ============================================
    
    // Автоматическая генерация списка страниц: page (1).jpg ... page (163).jpg
    const TOTAL_PAGES = 163;
    const pagesList = [];
    for (let i = 1; i <= TOTAL_PAGES; i++) {
        pagesList.push(`images/page (${i}).jpg`);
    }

    const CONFIG = {
        pages: pagesList,
        flipDuration: 800,       // мс — длительность перелистывания
        autoHideUI: 3000,        // мс — автоскрытие UI
        aspectRatio: 3 / 4,      // соотношение сторон одной страницы (ширина/высота)
        swipeThreshold: 50,      // пикселей для свайпа
        preloadBatch: 10,        // сколько первых страниц грузить для старта
    };

    // ============================================
    //  СОСТОЯНИЕ
    // ============================================
    const state = {
        currentSpread: 0,
        totalPages: CONFIG.pages.length,
        isVertical: false,
        isAnimating: false,
        uiVisible: true,
        uiTimeout: null,
        touchStartX: 0,
        touchStartY: 0,
        touchStartTime: 0,
        imagesLoaded: 0,
        loadedImages: new Set(), // кэш загруженных индексов
    };

    function getTotalSpreads() {
        if (state.isVertical) return state.totalPages;
        return Math.ceil(state.totalPages / 2);
    }

    function getMaxSpread() {
        return getTotalSpreads() - 1;
    }

    // ============================================
    //  DOM
    // ============================================
    const $ = (sel) => document.querySelector(sel);

    const DOM = {
        loader: $('#loader'),
        progressFill: $('#progressFill'),
        loadingText: $('#loadingText'),
        app: $('#app'),
        header: $('#header'),
        footer: $('#footer'),
        book: $('#book'),
        bookContainer: $('#bookContainer'),
        pageIndicator: $('#pageIndicator'),
        pageSlider: $('#pageSlider'),
        btnPrev: $('#btnPrev'),
        btnNext: $('#btnNext'),
        btnFullscreen: $('#btnFullscreen'),
        btnThumbnails: $('#btnThumbnails'),
        thumbnailsPanel: $('#thumbnailsPanel'),
        thumbnailsGrid: $('#thumbnailsGrid'),
        btnCloseThumbnails: $('#btnCloseThumbnails'),
    };

    // ============================================
    //  УМНАЯ ЗАГРУЗКА (прогрессивная)
    // ============================================
    // Грузим первые N страниц для быстрого старта,
    // остальные подгружаются в фоне и по требованию
    function preloadInitial() {
        return new Promise((resolve) => {
            const batchSize = Math.min(CONFIG.preloadBatch, CONFIG.pages.length);
            let loaded = 0;

            if (batchSize === 0) { resolve(); return; }

            for (let i = 0; i < batchSize; i++) {
                loadImage(i, () => {
                    loaded++;
                    const pct = Math.round((loaded / batchSize) * 100);
                    DOM.progressFill.style.width = pct + '%';
                    DOM.loadingText.textContent = `Загрузка... ${loaded}/${batchSize}`;

                    if (loaded >= batchSize) {
                        setTimeout(resolve, 300);
                    }
                });
            }
        });
    }

    function loadImage(idx, callback) {
        if (state.loadedImages.has(idx)) {
            if (callback) callback();
            return;
        }
        const img = new Image();
        img.onload = img.onerror = () => {
            state.loadedImages.add(idx);
            if (callback) callback();
        };
        img.src = CONFIG.pages[idx];
    }

    // Фоновая подгрузка остальных страниц
    function backgroundPreload() {
        let i = CONFIG.preloadBatch;
        const loadNext = () => {
            if (i >= CONFIG.pages.length) return;
            loadImage(i, () => {
                i++;
                // небольшая пауза, чтобы не блокировать UI
                setTimeout(loadNext, 50);
            });
        };
        loadNext();
    }

    // Приоритетная подгрузка соседних страниц
    function preloadNeighbors() {
        const current = state.currentSpread;
        const indices = [];

        if (state.isVertical) {
            for (let d = -2; d <= 2; d++) {
                const i = current + d;
                if (i >= 0 && i < state.totalPages) indices.push(i);
            }
        } else {
            for (let d = -1; d <= 2; d++) {
                const spread = current + d;
                if (spread < 0) continue;
                const left = spread * 2;
                const right = left + 1;
                if (left < state.totalPages) indices.push(left);
                if (right < state.totalPages) indices.push(right);
            }
        }

        indices.forEach(i => loadImage(i));
    }

    // ============================================
    //  ОРИЕНТАЦИЯ
    // ============================================
    function detectOrientation() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const wasVertical = state.isVertical;
        state.isVertical = h > w;

        document.body.classList.toggle('vertical-mode', state.isVertical);
        return wasVertical !== state.isVertical;
    }

    // ============================================
    //  РАЗМЕРЫ
    // ============================================
    function calculateBookSize() {
        const winW = window.innerWidth;
        const winH = window.innerHeight;
        const headerH = 56;
        const footerH = 52;
        const padding = 20;

        const availW = winW - padding * 2;
        const availH = winH - headerH - footerH - padding * 2;

        let bookW, bookH;

        if (state.isVertical) {
            const pageAR = CONFIG.aspectRatio;
            bookH = availH;
            bookW = bookH * pageAR;
            if (bookW > availW) {
                bookW = availW;
                bookH = bookW / pageAR;
            }
        } else {
            const spreadAR = CONFIG.aspectRatio * 2;
            bookH = availH;
            bookW = bookH * spreadAR;
            if (bookW > availW) {
                bookW = availW;
                bookH = bookW / spreadAR;
            }
        }

        DOM.book.style.width = Math.floor(bookW) + 'px';
        DOM.book.style.height = Math.floor(bookH) + 'px';
    }

    // ============================================
    //  РЕНДЕР
    // ============================================
    function renderBook() {
        DOM.book.innerHTML = '';
        if (state.isVertical) {
            renderSingleMode();
        } else {
            renderDoubleMode();
        }
        updateNavigation();
        preloadNeighbors();
    }

    function renderSingleMode() {
        const idx = state.currentSpread;
        const src = CONFIG.pages[idx];
        if (!src) return;

        const container = document.createElement('div');
        container.className = 'slide-container current-slide';

        const pageDiv = document.createElement('div');
        pageDiv.className = 'page-inner';

        const img = document.createElement('img');
        img.src = src;
        img.alt = `Страница ${idx + 1}`;
        img.draggable = false;

        const num = document.createElement('div');
        num.className = 'page-number';
        num.textContent = idx + 1;
        num.style.cssText = 'position:absolute;bottom:12px;right:16px;color:rgba(0,0,0,0.3);font-size:0.75rem;z-index:5;';

        pageDiv.appendChild(img);
        container.appendChild(pageDiv);
        container.appendChild(num);
        DOM.book.appendChild(container);
    }

    function renderDoubleMode() {
        const spreadIdx = state.currentSpread;
        const leftIdx = spreadIdx * 2;
        const rightIdx = leftIdx + 1;

        const spread = document.createElement('div');
        spread.className = 'spread';

        if (leftIdx < state.totalPages) {
            spread.appendChild(createPage(leftIdx, 'left'));
        } else {
            const empty = document.createElement('div');
            empty.className = 'page page-left';
            empty.innerHTML = '<div class="page-inner" style="background:#f5f0e8;"></div>';
            spread.appendChild(empty);
        }

        if (rightIdx < state.totalPages) {
            spread.appendChild(createPage(rightIdx, 'right'));
        } else {
            const empty = document.createElement('div');
            empty.className = 'page page-right';
            empty.innerHTML = '<div class="page-inner" style="background:#f5f0e8;"></div>';
            spread.appendChild(empty);
        }

        DOM.book.appendChild(spread);
    }

    function createPage(pageIdx, side) {
        const page = document.createElement('div');
        page.className = `page page-${side}`;

        const inner = document.createElement('div');
        inner.className = 'page-inner';

        const img = document.createElement('img');
        img.src = CONFIG.pages[pageIdx];
        img.alt = `Страница ${pageIdx + 1}`;
        img.draggable = false;

        const num = document.createElement('div');
        num.className = 'page-number';
        num.textContent = pageIdx + 1;

        inner.appendChild(img);
        page.appendChild(inner);
        page.appendChild(num);

        return page;
    }

    // ============================================
    //  АНИМАЦИИ
    // ============================================
    function flipToSpread(targetSpread, direction) {
        if (state.isAnimating) return;
        if (targetSpread < 0 || targetSpread > getMaxSpread()) return;
        if (targetSpread === state.currentSpread) return;

        state.isAnimating = true;

        if (state.isVertical) {
            animateSlide(targetSpread, direction);
        } else {
            animateFlip(targetSpread, direction);
        }
    }

    function animateFlip(targetSpread, direction) {
        const bookRect = DOM.book.getBoundingClientRect();
        const halfW = bookRect.width / 2;
        const h = bookRect.height;

        const flipPage = document.createElement('div');
        flipPage.className = 'flip-page';
        flipPage.style.width = halfW + 'px';
        flipPage.style.height = h + 'px';

        const front = document.createElement('div');
        front.className = 'flip-front';
        const back = document.createElement('div');
        back.className = 'flip-back';

        const shadow = document.createElement('div');
        shadow.className = 'flip-shadow';

        if (direction === 'next') {
            flipPage.classList.add('flip-from-right');
            flipPage.style.left = halfW + 'px';
            flipPage.style.transformOrigin = 'left center';
            flipPage.style.transform = 'rotateY(0deg)';

            const curRight = state.currentSpread * 2 + 1;
            if (curRight < state.totalPages) {
                const imgF = document.createElement('img');
                imgF.src = CONFIG.pages[curRight];
                imgF.draggable = false;
                front.appendChild(imgF);
            } else {
                front.style.background = '#f5f0e8';
            }

            const newLeft = targetSpread * 2;
            if (newLeft < state.totalPages) {
                const imgB = document.createElement('img');
                imgB.src = CONFIG.pages[newLeft];
                imgB.draggable = false;
                back.appendChild(imgB);
            } else {
                back.style.background = '#f5f0e8';
            }

            shadow.classList.add('flip-shadow-right');
            shadow.style.left = '0';
        } else {
            flipPage.classList.add('flip-from-left');
            flipPage.style.left = '0';
            flipPage.style.transformOrigin = 'right center';
            flipPage.style.transform = 'rotateY(0deg)';

            const curLeft = state.currentSpread * 2;
            if (curLeft < state.totalPages) {
                const imgF = document.createElement('img');
                imgF.src = CONFIG.pages[curLeft];
                imgF.draggable = false;
                front.appendChild(imgF);
            }

            const newRight = targetSpread * 2 + 1;
            if (newRight < state.totalPages) {
                const imgB = document.createElement('img');
                imgB.src = CONFIG.pages[newRight];
                imgB.draggable = false;
                back.appendChild(imgB);
            } else {
                back.style.background = '#f5f0e8';
            }

            shadow.classList.add('flip-shadow-left');
            shadow.style.left = halfW + 'px';
        }

        flipPage.appendChild(front);
        flipPage.appendChild(back);
        DOM.book.appendChild(flipPage);
        DOM.book.appendChild(shadow);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                shadow.classList.add('active');
                flipPage.style.transform = direction === 'next'
                    ? 'rotateY(-180deg)'
                    : 'rotateY(180deg)';
            });
        });

        setTimeout(() => {
            state.currentSpread = targetSpread;
            if (flipPage.parentNode) DOM.book.removeChild(flipPage);
            if (shadow.parentNode) DOM.book.removeChild(shadow);
            renderBook();
            state.isAnimating = false;
        }, CONFIG.flipDuration);
    }

    function animateSlide(targetSpread, direction) {
        const currentSlide = DOM.book.querySelector('.slide-container');
        if (!currentSlide) {
            state.currentSpread = targetSpread;
            renderBook();
            state.isAnimating = false;
            return;
        }

        const newSrc = CONFIG.pages[targetSpread];
        if (!newSrc) { state.isAnimating = false; return; }

        const newSlide = document.createElement('div');
        newSlide.className = 'slide-container';

        const pageDiv = document.createElement('div');
        pageDiv.className = 'page-inner';

        const img = document.createElement('img');
        img.src = newSrc;
        img.draggable = false;

        pageDiv.appendChild(img);
        newSlide.appendChild(pageDiv);

        const offset = direction === 'next' ? '100%' : '-100%';
        newSlide.style.transform = `translateX(${offset})`;
        newSlide.style.opacity = '0.5';

        DOM.book.appendChild(newSlide);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                const exit = direction === 'next' ? '-100%' : '100%';
                currentSlide.style.transform = `translateX(${exit})`;
                currentSlide.style.opacity = '0.5';
                newSlide.style.transform = 'translateX(0)';
                newSlide.style.opacity = '1';
            });
        });

        setTimeout(() => {
            state.currentSpread = targetSpread;
            if (currentSlide.parentNode) currentSlide.parentNode.removeChild(currentSlide);
            newSlide.className = 'slide-container current-slide';
            updateNavigation();
            preloadNeighbors();
            state.isAnimating = false;
        }, 500);
    }

    // ============================================
    //  НАВИГАЦИЯ
    // ============================================
    function goNext() {
        if (state.currentSpread < getMaxSpread()) {
            flipToSpread(state.currentSpread + 1, 'next');
        }
    }

    function goPrev() {
        if (state.currentSpread > 0) {
            flipToSpread(state.currentSpread - 1, 'prev');
        }
    }

    function goToSpread(idx) {
        if (idx === state.currentSpread) return;
        const dir = idx > state.currentSpread ? 'next' : 'prev';
        if (Math.abs(idx - state.currentSpread) > 1) {
            state.currentSpread = idx;
            renderBook();
        } else {
            flipToSpread(idx, dir);
        }
    }

    function goToPage(pageIdx) {
        let spread = state.isVertical ? pageIdx : Math.floor(pageIdx / 2);
        spread = Math.max(0, Math.min(spread, getMaxSpread()));
        if (spread === state.currentSpread) return;
        state.currentSpread = spread;
        renderBook();
    }

    function updateNavigation() {
        const current = state.currentSpread;
        const max = getMaxSpread();

        DOM.btnPrev.classList.toggle('disabled', current <= 0);
        DOM.btnNext.classList.toggle('disabled', current >= max);

        if (state.isVertical) {
            DOM.pageIndicator.textContent = `${current + 1} / ${state.totalPages}`;
        } else {
            const l = current * 2 + 1;
            const r = Math.min(current * 2 + 2, state.totalPages);
            DOM.pageIndicator.textContent = (l === r)
                ? `${l} / ${state.totalPages}`
                : `${l}–${r} / ${state.totalPages}`;
        }

        DOM.pageSlider.max = max;
        DOM.pageSlider.value = current;

        resetUITimer();
    }

    // ============================================
    //  МИНИАТЮРЫ (виртуализация для 163 стр.)
    // ============================================
    function renderThumbnails() {
        DOM.thumbnailsGrid.innerHTML = '';

        CONFIG.pages.forEach((src, idx) => {
            const item = document.createElement('div');
            item.className = 'thumb-item';

            let isActive = state.isVertical
                ? idx === state.currentSpread
                : Math.floor(idx / 2) === state.currentSpread;
            if (isActive) item.classList.add('active');

            const img = document.createElement('img');
            img.src = src;
            img.alt = `Страница ${idx + 1}`;
            img.loading = 'lazy';   // ВАЖНО: ленивая загрузка браузером
            img.decoding = 'async';

            const label = document.createElement('div');
            label.className = 'thumb-label';
            label.textContent = `Стр. ${idx + 1}`;

            item.appendChild(img);
            item.appendChild(label);

            item.addEventListener('click', () => {
                closeThumbnails();
                goToPage(idx);
            });

            DOM.thumbnailsGrid.appendChild(item);
        });

        // Прокрутить к активной
        setTimeout(() => {
            const active = DOM.thumbnailsGrid.querySelector('.thumb-item.active');
            if (active) active.scrollIntoView({ behavior: 'instant', block: 'center' });
        }, 50);
    }

    function openThumbnails() {
        renderThumbnails();
        DOM.thumbnailsPanel.classList.remove('hidden');
    }

    function closeThumbnails() {
        DOM.thumbnailsPanel.classList.add('hidden');
    }

    // ============================================
    //  ПОЛНЫЙ ЭКРАН
    // ============================================
    function toggleFullscreen() {
        if (!document.fullscreenElement && !document.webkitFullscreenElement) {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    }

    // ============================================
    //  UI АВТОСКРЫТИЕ
    // ============================================
    function showUI() {
        state.uiVisible = true;
        DOM.header.classList.remove('auto-hidden');
        DOM.footer.classList.remove('auto-hidden');
    }

    function hideUI() {
        state.uiVisible = false;
        DOM.header.classList.add('auto-hidden');
        DOM.footer.classList.add('auto-hidden');
    }

    function resetUITimer() {
        showUI();
        clearTimeout(state.uiTimeout);
        state.uiTimeout = setTimeout(hideUI, CONFIG.autoHideUI);
    }

    // ============================================
    //  TOUCH
    // ============================================
    function initTouch() {
        const el = DOM.bookContainer;
        let isDragging = false;

        el.addEventListener('touchstart', (e) => {
            if (state.isAnimating) return;
            const t = e.touches[0];
            state.touchStartX = t.clientX;
            state.touchStartY = t.clientY;
            state.touchStartTime = Date.now();
            isDragging = true;
        }, { passive: true });

        el.addEventListener('touchend', (e) => {
            if (!isDragging || state.isAnimating) return;
            isDragging = false;

            const t = e.changedTouches[0];
            const dx = t.clientX - state.touchStartX;
            const dy = t.clientY - state.touchStartY;
            const dt = Date.now() - state.touchStartTime;

            if (Math.abs(dx) > CONFIG.swipeThreshold && Math.abs(dx) > Math.abs(dy)) {
                if (dx < 0) goNext(); else goPrev();
            } else if (Math.abs(dx) < 10 && Math.abs(dy) < 10 && dt < 300) {
                if (state.uiVisible) hideUI(); else resetUITimer();
                showTouchFeedback(t.clientX, t.clientY);
            }
        }, { passive: true });

        el.addEventListener('click', (e) => {
            if (state.isAnimating) return;
            // Если это был touch, click не вызываем повторно (handled)
            if (e.detail === 0) return;

            const rect = el.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const third = rect.width / 3;

            if (x < third) goPrev();
            else if (x > third * 2) goNext();
            else {
                if (state.uiVisible) hideUI(); else resetUITimer();
            }
        });
    }

    function showTouchFeedback(x, y) {
        const hint = document.createElement('div');
        hint.className = 'touch-hint';
        hint.style.left = (x - 30) + 'px';
        hint.style.top = (y - 30) + 'px';
        document.body.appendChild(hint);
        setTimeout(() => hint.remove(), 600);
    }

    // ============================================
    //  КЛАВИАТУРА
    // ============================================
    function initKeyboard() {
        document.addEventListener('keydown', (e) => {
            switch (e.key) {
                case 'ArrowRight':
                case 'ArrowDown':
                case ' ':
                case 'PageDown':
                    e.preventDefault(); goNext(); break;
                case 'ArrowLeft':
                case 'ArrowUp':
                case 'PageUp':
                    e.preventDefault(); goPrev(); break;
                case 'Home':
                    e.preventDefault(); goToSpread(0); break;
                case 'End':
                    e.preventDefault(); goToSpread(getMaxSpread()); break;
                case 'f':
                case 'F':
                    toggleFullscreen(); break;
                case 'Escape':
                    if (!DOM.thumbnailsPanel.classList.contains('hidden')) closeThumbnails();
                    break;
            }
        });
    }

    // ============================================
    //  СОБЫТИЯ
    // ============================================
    function initEvents() {
        DOM.btnPrev.addEventListener('click', (e) => { e.stopPropagation(); goPrev(); });
        DOM.btnNext.addEventListener('click', (e) => { e.stopPropagation(); goNext(); });

        DOM.pageSlider.addEventListener('input', (e) => {
            goToSpread(parseInt(e.target.value));
        });

        DOM.btnFullscreen.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); });
        DOM.btnThumbnails.addEventListener('click', (e) => { e.stopPropagation(); openThumbnails(); });
        DOM.btnCloseThumbnails.addEventListener('click', closeThumbnails);

        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const changed = detectOrientation();
                if (changed) convertPosition();
                calculateBookSize();
                renderBook();
            }, 150);
        });

        document.addEventListener('mousemove', () => resetUITimer());

        DOM.bookContainer.addEventListener('wheel', (e) => {
            e.preventDefault();
            if (state.isAnimating) return;
            if (e.deltaY > 0 || e.deltaX > 0) goNext();
            else goPrev();
        }, { passive: false });
    }

    function convertPosition() {
        if (state.isVertical) {
            state.currentSpread = state.currentSpread * 2;
            if (state.currentSpread >= state.totalPages) {
                state.currentSpread = state.totalPages - 1;
            }
        } else {
            state.currentSpread = Math.floor(state.currentSpread / 2);
        }
    }

    // ============================================
    //  СТАРТ
    // ============================================
    async function init() {
        DOM.loadingText.textContent = `Подготовка ${TOTAL_PAGES} страниц...`;

        await preloadInitial();

        DOM.loader.classList.add('fade-out');
        setTimeout(() => { DOM.loader.style.display = 'none'; }, 600);
        DOM.app.classList.remove('hidden');

        detectOrientation();
        calculateBookSize();
        renderBook();

        initTouch();
        initKeyboard();
        initEvents();
        resetUITimer();

        // В фоне подгружаем остальные страницы
        setTimeout(backgroundPreload, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
