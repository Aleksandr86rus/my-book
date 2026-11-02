(function () {
    'use strict';

    // ============================================
    //  КОНФИГУРАЦИЯ
    // ============================================
    const TOTAL_PAGES = 163;
    const pagesList = [];
    for (let i = 1; i <= TOTAL_PAGES; i++) {
        pagesList.push(`images/page (${i}).jpg`);
    }

    const CONFIG = {
        pages: pagesList,
        flipDuration: 1100,
        autoHideUI: 3000,
        aspectRatio: 3 / 4,
        swipeThreshold: 50,
        preloadBatch: 10,
        minZoom: 1,
        maxZoom: 4,
        doubleTapZoom: 2.5,
        doubleTapDelay: 300,
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
        isFullscreenMode: false,
        touchStartX: 0,
        touchStartY: 0,
        touchStartTime: 0,
        loadedImages: new Set(),

        zoom: 1,
        panX: 0,
        panY: 0,
        lastTapTime: 0,
        isPinching: false,
        isPanning: false,
        pinchStartDist: 0,
        pinchStartZoom: 1,
        pinchCenterX: 0,
        pinchCenterY: 0,
        panStartX: 0,
        panStartY: 0,
        panStartPanX: 0,
        panStartPanY: 0,
        zoomIndicatorTimeout: null,
    };

    function getTotalSpreads() {
        return state.isVertical ? state.totalPages : Math.ceil(state.totalPages / 2);
    }

    function getMaxSpread() {
        return getTotalSpreads() - 1;
    }

    function isZoomed() {
        return state.zoom > 1.01;
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
        zoomIndicator: null,
        zoomResetBtn: null,
        exitFsBtn: null,
    };

    function createExtraUI() {
        const indicator = document.createElement('div');
        indicator.className = 'zoom-indicator';
        indicator.textContent = '100%';
        document.body.appendChild(indicator);
        DOM.zoomIndicator = indicator;

        const resetBtn = document.createElement('button');
        resetBtn.className = 'zoom-reset-btn';
        resetBtn.title = 'Сбросить масштаб';
        resetBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>';
        resetBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            resetZoom(true);
        });
        document.body.appendChild(resetBtn);
        DOM.zoomResetBtn = resetBtn;

        const exitBtn = document.createElement('button');
        exitBtn.className = 'exit-fullscreen-btn';
        exitBtn.title = 'Выйти из полного экрана';
        exitBtn.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3"/></svg>';
        exitBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleFullscreenMode();
        });
        document.body.appendChild(exitBtn);
        DOM.exitFsBtn = exitBtn;
    }

    // ============================================
    //  ЗАГРУЗКА
    // ============================================
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
                    if (loaded >= batchSize) setTimeout(resolve, 300);
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

    function backgroundPreload() {
        let i = CONFIG.preloadBatch;
        const loadNext = () => {
            if (i >= CONFIG.pages.length) return;
            loadImage(i, () => { i++; setTimeout(loadNext, 50); });
        };
        loadNext();
    }

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
    //  ОРИЕНТАЦИЯ / РАЗМЕРЫ
    // ============================================
    function detectOrientation() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const wasVertical = state.isVertical;
        state.isVertical = h > w;
        document.body.classList.toggle('vertical-mode', state.isVertical);
        return wasVertical !== state.isVertical;
    }

    function calculateBookSize() {
        const winW = window.innerWidth;
        const winH = window.innerHeight;

        const headerH = state.isFullscreenMode ? 0 : 56;
        const footerH = state.isFullscreenMode ? 0 : 52;
        const padding = state.isFullscreenMode ? 0 : 20;

        const availW = winW - padding * 2;
        const availH = winH - headerH - footerH - padding * 2;

        let bookW, bookH;
        if (state.isVertical) {
            const pageAR = CONFIG.aspectRatio;
            bookH = availH;
            bookW = bookH * pageAR;
            if (bookW > availW) { bookW = availW; bookH = bookW / pageAR; }
        } else {
            const spreadAR = CONFIG.aspectRatio * 2;
            bookH = availH;
            bookW = bookH * spreadAR;
            if (bookW > availW) { bookW = availW; bookH = bookW / spreadAR; }
        }

        DOM.book.style.width = Math.floor(bookW) + 'px';
        DOM.book.style.height = Math.floor(bookH) + 'px';
    }

    // ============================================
    //  РЕНДЕР
    // ============================================
    function renderBook() {
        DOM.book.innerHTML = '';
        if (state.isVertical) renderSingleMode();
        else renderDoubleMode();
        updateNavigation();
        preloadNeighbors();
        applyTransform(false);
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

        if (leftIdx < state.totalPages) spread.appendChild(createPage(leftIdx, 'left'));
        else {
            const e = document.createElement('div');
            e.className = 'page page-left';
            e.innerHTML = '<div class="page-inner" style="background:#f5f0e8;"></div>';
            spread.appendChild(e);
        }

        if (rightIdx < state.totalPages) spread.appendChild(createPage(rightIdx, 'right'));
        else {
            const e = document.createElement('div');
            e.className = 'page page-right';
            e.innerHTML = '<div class="page-inner" style="background:#f5f0e8;"></div>';
            spread.appendChild(e);
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
    }// ==================== ZOOM ====================

    function applyTransform(animated = true) {
        if (!DOM.pageSpread) return;
        DOM.pageSpread.style.transition = animated
            ? 'transform 0.25s ease-out'
            : 'none';
        DOM.pageSpread.style.transform =
            `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
    }

    function showZoomIndicator() {
        if (!DOM.zoomIndicator) return;
        DOM.zoomIndicator.textContent = `${Math.round(state.zoom * 100)}%`;
        DOM.zoomIndicator.classList.add('visible');
        clearTimeout(state.zoomIndicatorTimer);
        state.zoomIndicatorTimer = setTimeout(() => {
            DOM.zoomIndicator.classList.remove('visible');
        }, 1200);
    }

    function clampZoom(z) {
        return Math.max(CONFIG.minZoom, Math.min(CONFIG.maxZoom, z));
    }

    function clampPan() {
        if (state.zoom <= 1) {
            state.panX = 0;
            state.panY = 0;
            return;
        }
        const bw = DOM.book.clientWidth;
        const bh = DOM.book.clientHeight;
        const sw = DOM.pageSpread.offsetWidth;
        const sh = DOM.pageSpread.offsetHeight;
        const overflowX = Math.max(0, (sw * state.zoom - bw) / 2);
        const overflowY = Math.max(0, (sh * state.zoom - bh) / 2);
        state.panX = Math.max(-overflowX, Math.min(overflowX, state.panX));
        state.panY = Math.max(-overflowY, Math.min(overflowY, state.panY));
    }

    function resetZoom(animated = true) {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        applyTransform(animated);
        showZoomIndicator();
    }

    function zoomAt(clientX, clientY, newZoom) {
        newZoom = clampZoom(newZoom);
        if (newZoom === state.zoom) return;

        const rect = DOM.pageSpread.getBoundingClientRect();
        const originX = clientX - rect.left - rect.width / 2;
        const originY = clientY - rect.top - rect.height / 2;

        const ratio = newZoom / state.zoom;
        state.panX = originX - ratio * (originX - state.panX);
        state.panY = originY - ratio * (originY - state.panY);
        state.zoom = newZoom;

        clampPan();
        applyTransform(true);
        showZoomIndicator();
    }

    // ==================== FULLSCREEN MODE ====================

    function toggleFullscreenMode() {
        state.isFullscreenMode = !state.isFullscreenMode;
        document.body.classList.toggle('fullscreen-mode', state.isFullscreenMode);

        if (state.isFullscreenMode) {
            requestBrowserFullscreen();
            if (DOM.fullscreenBtn) DOM.fullscreenBtn.style.display = 'none';
            if (DOM.exitFullscreenBtn) DOM.exitFullscreenBtn.style.display = 'flex';
        } else {
            exitBrowserFullscreen();
            if (DOM.fullscreenBtn) DOM.fullscreenBtn.style.display = 'flex';
            if (DOM.exitFullscreenBtn) DOM.exitFullscreenBtn.style.display = 'none';
        }

        resetZoom(false);
        calculateBookSize();
        renderSpread();
    }

    function requestBrowserFullscreen() {
        const el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen();
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else if (el.msRequestFullscreen) el.msRequestFullscreen();
    }

    function exitBrowserFullscreen() {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
    }

    function onFullscreenChange() {
        const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (!isFS && state.isFullscreenMode) {
            state.isFullscreenMode = false;
            document.body.classList.remove('fullscreen-mode');
            if (DOM.fullscreenBtn) DOM.fullscreenBtn.style.display = 'flex';
            if (DOM.exitFullscreenBtn) DOM.exitFullscreenBtn.style.display = 'none';
            resetZoom(false);
            calculateBookSize();
            renderSpread();
        }
    }

    // ==================== TOUCH ====================

    function getDistance(t1, t2) {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getCenter(t1, t2) {
        return {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2,
        };
    }

    function initTouch() {
        const el = DOM.book;
        let startTouches = null;
        let startZoom = 1;
        let startPan = { x: 0, y: 0 };
        let startCenter = null;
        let isPinching = false;
        let isPanning = false;
        let swipeStartX = 0;
        let swipeStartY = 0;
        let swipeStartTime = 0;
        let lastTapTime = 0;
        let lastTapPos = { x: 0, y: 0 };
        let singleTapTimer = null;

        el.addEventListener('touchstart', (e) => {
            if (state.isAnimating) return;
            const touches = e.touches;

            if (touches.length === 2) {
                e.preventDefault();
                isPinching = true;
                isPanning = false;
                startZoom = state.zoom;
                startPan = { x: state.panX, y: state.panY };
                startCenter = getCenter(touches[0], touches[1]);
                startTouches = getDistance(touches[0], touches[1]);
            } else if (touches.length === 1) {
                isPinching = false;
                if (state.zoom > 1) {
                    isPanning = true;
                    startPan = { x: state.panX, y: state.panY };
                    swipeStartX = touches[0].clientX;
                    swipeStartY = touches[0].clientY;
                } else {
                    isPanning = false;
                    swipeStartX = touches[0].clientX;
                    swipeStartY = touches[0].clientY;
                    swipeStartTime = Date.now();
                }
            }
        }, { passive: false });

        el.addEventListener('touchmove', (e) => {
            if (state.isAnimating) return;
            const touches = e.touches;

            if (touches.length === 2 && isPinching) {
                e.preventDefault();
                const dist = getDistance(touches[0], touches[1]);
                const center = getCenter(touches[0], touches[1]);
                const scale = dist / startTouches;
                const newZoom = clampZoom(startZoom * scale);

                const dx = center.x - startCenter.x;
                const dy = center.y - startCenter.y;

                state.panX = startPan.x + dx;
                state.panY = startPan.y + dy;
                state.zoom = newZoom;
                clampPan();
                applyTransform(false);
                showZoomIndicator();
            } else if (touches.length === 1 && isPanning && state.zoom > 1) {
                e.preventDefault();
                const dx = touches[0].clientX - swipeStartX;
                const dy = touches[0].clientY - swipeStartY;
                state.panX = startPan.x + dx;
                state.panY = startPan.y + dy;
                clampPan();
                applyTransform(false);
            }
        }, { passive: false });

        el.addEventListener('touchend', (e) => {
            if (state.isAnimating) return;

            if (isPinching && e.touches.length < 2) {
                isPinching = false;
                applyTransform(true);
                return;
            }

            if (isPanning && e.touches.length === 0) {
                isPanning = false;
                applyTransform(true);
                return;
            }

            if (e.touches.length === 0 && !isPinching && state.zoom <= 1) {
                const dx = e.changedTouches[0].clientX - swipeStartX;
                const dy = e.changedTouches[0].clientY - swipeStartY;
                const dt = Date.now() - swipeStartTime;

                // Swipe
                if (Math.abs(dx) > CONFIG.swipeThreshold &&
                    Math.abs(dx) > Math.abs(dy) && dt < 500) {
                    if (dx < 0) goNext();
                    else goPrev();
                    return;
                }

                // Double-tap
                const now = Date.now();
                const tapX = e.changedTouches[0].clientX;
                const tapY = e.changedTouches[0].clientY;
                const distFromLast = Math.sqrt(
                    (tapX - lastTapPos.x) ** 2 + (tapY - lastTapPos.y) ** 2
                );

                if (now - lastTapTime < CONFIG.doubleTapDelay && distFromLast < 30) {
                    clearTimeout(singleTapTimer);
                    lastTapTime = 0;
                    if (state.zoom > 1) {
                        resetZoom(true);
                    } else {
                        zoomAt(tapX, tapY, CONFIG.doubleTapZoom);
                    }
                    return;
                }

                lastTapTime = now;
                lastTapPos = { x: tapX, y: tapY };

                // Single tap → toggle UI in fullscreen
                singleTapTimer = setTimeout(() => {
                    if (state.isFullscreenMode) {
                        if (DOM.uiOverlay && DOM.uiOverlay.classList.contains('visible')) {
                            hideUI();
                        } else {
                            showUI();
                        }
                    }
                }, CONFIG.doubleTapDelay + 50);
            }
        }, { passive: false });

        el.addEventListener('touchcancel', () => {
            isPinching = false;
            isPanning = false;
        });

        // Double-click (desktop)
        el.addEventListener('dblclick', (e) => {
            if (state.zoom > 1) {
                resetZoom(true);
            } else {
                zoomAt(e.clientX, e.clientY, CONFIG.doubleTapZoom);
            }
        });
    }

    // ==================== FLIP ANIMATION ====================

    function flipToSpread(newSpread, direction) {
        if (state.isAnimating) return;
        if (newSpread < 0 || newSpread > state.maxSpread) return;
        if (newSpread === state.currentSpread) return;

        if (state.isPortrait) {
            animateSlide(newSpread, direction);
        } else {
            animateFlip(newSpread, direction);
        }
    }

    function animateFlip(newSpread, direction) {
        state.isAnimating = true;
        const isForward = direction === 'next';

        // Flip container
        const flipContainer = document.createElement('div');
        flipContainer.className = 'flip-container';
        flipContainer.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            perspective: 3000px;
            z-index: 100; pointer-events: none;
        `;

        // Flipping page
        const flipPage = document.createElement('div');
        flipPage.className = 'flip-page';
        flipPage.style.cssText = `
            position: absolute; top: 0;
            width: 50%; height: 100%;
            transform-style: preserve-3d;
            transition: transform ${CONFIG.flipDuration}ms cubic-bezier(0.33, 0.0, 0.15, 1.0);
            transform-origin: ${isForward ? 'left center' : 'right center'};
        `;
        if (isForward) flipPage.style.right = '0';
        else flipPage.style.left = '0';

        // Front face
        const front = document.createElement('div');
        front.className = 'flip-face flip-front';
        front.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            backface-visibility: hidden;
            overflow: hidden; background: #f5f0e8;
        `;

        // Back face
        const back = document.createElement('div');
        back.className = 'flip-face flip-back';
        back.style.cssText = `
            position: absolute; top: 0; left: 0;
            width: 100%; height: 100%;
            backface-visibility: hidden;
            transform: rotateY(180deg);
            overflow: hidden; background: #f5f0e8;
        `;

        // Fill front (current page being flipped)
        const currentPages = DOM.pageSpread.querySelectorAll('.book-page');
        if (isForward && currentPages.length >= 2) {
            front.innerHTML = currentPages[1].innerHTML;
        } else if (!isForward && currentPages.length >= 1) {
            front.innerHTML = currentPages[0].innerHTML;
        }

        // Fill back (new page revealed)
        const newLeft = newSpread * 2;
        const newRight = newLeft + 1;
        if (isForward) {
            back.innerHTML = createPage(newRight).innerHTML;
        } else {
            back.innerHTML = createPage(newLeft).innerHTML;
        }

        flipPage.appendChild(front);
        flipPage.appendChild(back);

        // Shadow
        const shadow = document.createElement('div');
        shadow.className = 'flip-shadow';
        shadow.style.cssText = `
            position: absolute; top: 0;
            width: 50%; height: 100%;
            background: linear-gradient(${isForward ? 'to left' : 'to right'},
                rgba(0,0,0,0.25), transparent);
            opacity: 0;
            transition: opacity ${CONFIG.flipDuration}ms ease;
            pointer-events: none; z-index: 99;
        `;
        if (isForward) shadow.style.left = '0';
        else shadow.style.right = '0';

        flipContainer.appendChild(flipPage);
        flipContainer.appendChild(shadow);
        DOM.book.style.position = 'relative';
        DOM.book.appendChild(flipContainer);

        // Start animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                flipPage.style.transform =
                    `rotateY(${isForward ? -180 : 180}deg)`;
                shadow.style.opacity = '1';
                setTimeout(() => { shadow.style.opacity = '0'; },
                    CONFIG.flipDuration * 0.6);
            });
        });

        // Cleanup
        setTimeout(() => {
            state.currentSpread = newSpread;
            renderSpread();
            updateNavigation();
            flipContainer.remove();
            state.isAnimating = false;
        }, CONFIG.flipDuration + 50);
    }

    function animateSlide(newSpread, direction) {
        state.isAnimating = true;
        const isForward = direction === 'next';

        DOM.pageSpread.style.transition =
            'transform 0.7s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.7s ease';
        DOM.pageSpread.style.transform =
            `translateY(${isForward ? '-100%' : '100%'}) scale(0.92)`;
        DOM.pageSpread.style.opacity = '0';

        setTimeout(() => {
            state.currentSpread = newSpread;
            renderSpread();
            updateNavigation();

            DOM.pageSpread.style.transition = 'none';
            DOM.pageSpread.style.transform =
                `translateY(${isForward ? '100%' : '-100%'}) scale(0.92)`;
            DOM.pageSpread.style.opacity = '0';

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    DOM.pageSpread.style.transition =
                        'transform 0.7s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.7s ease';
                    DOM.pageSpread.style.transform = 'translateY(0) scale(1)';
                    DOM.pageSpread.style.opacity = '1';

                    setTimeout(() => { state.isAnimating = false; }, 720);
                });
            });
        }, 700);
    }// ===================== ZOOM =====================
    function applyTransform(animated = true) {
        const pages = book.querySelectorAll('.page');
        const transition = animated ? 'transform 0.3s ease-out' : 'none';
        pages.forEach(p => {
            p.style.transition = transition;
            p.style.transform = `scale(${state.zoom}) translate(${state.panX}px, ${state.panY}px)`;
        });
    }

    function showZoomIndicator() {
        if (!zoomIndicator) return;
        zoomIndicator.textContent = Math.round(state.zoom * 100) + '%';
        zoomIndicator.classList.add('visible');
        clearTimeout(zoomIndicator._timer);
        zoomIndicator._timer = setTimeout(() => {
            zoomIndicator.classList.remove('visible');
        }, 1200);
    }

    function clampZoom(z) {
        return Math.max(CONFIG.minZoom, Math.min(CONFIG.maxZoom, z));
    }

    function clampPan() {
        if (state.zoom <= 1) {
            state.panX = 0;
            state.panY = 0;
            return;
        }
        const maxPanX = (state.bookWidth / 2) * (state.zoom - 1);
        const maxPanY = (state.bookHeight / 2) * (state.zoom - 1);
        state.panX = Math.max(-maxPanX, Math.min(maxPanX, state.panX));
        state.panY = Math.max(-maxPanY, Math.min(maxPanY, state.panY));
    }

    function resetZoom(animated = true) {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        applyTransform(animated);
        showZoomIndicator();
    }

    function zoomAt(newZoom, cx, cy, animated = true) {
        const oldZoom = state.zoom;
        newZoom = clampZoom(newZoom);
        if (newZoom === oldZoom) return;

        const rect = book.getBoundingClientRect();
        const originX = cx - rect.left - rect.width / 2;
        const originY = cy - rect.top - rect.height / 2;

        state.panX = originX - (originX - state.panX) * (newZoom / oldZoom);
        state.panY = originY - (originY - state.panY) * (newZoom / oldZoom);
        state.zoom = newZoom;

        clampPan();
        applyTransform(animated);
        showZoomIndicator();
    }

    // ===================== FULLSCREEN MODE =====================
    function toggleFullscreenMode() {
        state.isFullscreenMode = !state.isFullscreenMode;

        if (state.isFullscreenMode) {
            document.body.classList.add('fullscreen-mode');
            requestBrowserFullscreen();
            resetZoom(false);
        } else {
            document.body.classList.remove('fullscreen-mode');
            exitBrowserFullscreen();
            resetZoom(false);
        }

        calculateBookSize();
        renderCurrentSpread();
        updateNavigation();
    }

    function requestBrowserFullscreen() {
        const el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else if (el.msRequestFullscreen) el.msRequestFullscreen();
    }

    function exitBrowserFullscreen() {
        if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        else if (document.msExitFullscreen) document.msExitFullscreen();
    }

    function onFullscreenChange() {
        const isFS = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (!isFS && state.isFullscreenMode) {
            state.isFullscreenMode = false;
            document.body.classList.remove('fullscreen-mode');
            resetZoom(false);
            calculateBookSize();
            renderCurrentSpread();
            updateNavigation();
        }
    }

    // ===================== TOUCH =====================
    function getDistance(t1, t2) {
        const dx = t1.clientX - t2.clientX;
        const dy = t1.clientY - t2.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    function getCenter(t1, t2) {
        return {
            x: (t1.clientX + t2.clientX) / 2,
            y: (t1.clientY + t2.clientY) / 2
        };
    }

    function initTouch() {
        let initialPinchDist = 0;
        let initialZoom = 1;
        let isPinching = false;
        let pinchCenter = { x: 0, y: 0 };
        let singleTouchId = null;

        book.addEventListener('touchstart', (e) => {
            if (state.isAnimating) return;

            if (e.touches.length === 2) {
                isPinching = true;
                initialPinchDist = getDistance(e.touches[0], e.touches[1]);
                initialZoom = state.zoom;
                pinchCenter = getCenter(e.touches[0], e.touches[1]);
                e.preventDefault();
            } else if (e.touches.length === 1) {
                isPinching = false;
                singleTouchId = e.touches[0].identifier;
                state.touchStartX = e.touches[0].clientX;
                state.touchStartY = e.touches[0].clientY;
                state.lastTouchX = e.touches[0].clientX;
                state.lastTouchY = e.touches[0].clientY;
                state.touchStartTime = Date.now();

                if (state.zoom > 1) {
                    state.isPanning = true;
                }
            }
        }, { passive: false });

        book.addEventListener('touchmove', (e) => {
            if (state.isAnimating) return;

            if (e.touches.length === 2 && isPinching) {
                e.preventDefault();
                const dist = getDistance(e.touches[0], e.touches[1]);
                const scale = dist / initialPinchDist;
                const newZoom = clampZoom(initialZoom * scale);
                const center = getCenter(e.touches[0], e.touches[1]);
                zoomAt(newZoom, center.x, center.y, false);
            } else if (e.touches.length === 1 && !isPinching) {
                const touch = e.touches[0];

                if (state.isPanning && state.zoom > 1) {
                    e.preventDefault();
                    const dx = touch.clientX - state.lastTouchX;
                    const dy = touch.clientY - state.lastTouchY;
                    state.panX += dx / state.zoom;
                    state.panY += dy / state.zoom;
                    clampPan();
                    applyTransform(false);
                    state.lastTouchX = touch.clientX;
                    state.lastTouchY = touch.clientY;
                }
            }
        }, { passive: false });

        book.addEventListener('touchend', (e) => {
            if (isPinching && e.touches.length < 2) {
                isPinching = false;
                if (state.zoom <= 1.05) resetZoom();
                return;
            }

            if (e.touches.length === 0 && !isPinching) {
                state.isPanning = false;

                const dx = e.changedTouches[0].clientX - state.touchStartX;
                const dy = e.changedTouches[0].clientY - state.touchStartY;
                const dt = Date.now() - state.touchStartTime;
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);

                // Double tap detection
                const now = Date.now();
                if (absDx < 15 && absDy < 15 && dt < 300) {
                    if (now - state.lastTapTime < CONFIG.doubleTapDelay) {
                        // Double tap
                        e.preventDefault();
                        if (state.zoom > 1.1) {
                            resetZoom();
                        } else {
                            const cx = e.changedTouches[0].clientX;
                            const cy = e.changedTouches[0].clientY;
                            zoomAt(CONFIG.doubleTapZoom, cx, cy);
                        }
                        state.lastTapTime = 0;
                        return;
                    }
                    state.lastTapTime = now;
                }

                // Swipe detection (only when not zoomed)
                if (state.zoom <= 1.05 && absDx > CONFIG.swipeThreshold && absDx > absDy * 1.5 && dt < 500) {
                    if (state.isVertical) {
                        if (dy < -CONFIG.swipeThreshold) goNext();
                        else if (dy > CONFIG.swipeThreshold) goPrev();
                    } else {
                        if (dx < -CONFIG.swipeThreshold) goNext();
                        else if (dx > CONFIG.swipeThreshold) goPrev();
                    }
                }
            }
        }, { passive: false });

        book.addEventListener('touchcancel', () => {
            isPinching = false;
            state.isPanning = false;
        });

        // Double-click zoom for desktop
        book.addEventListener('dblclick', (e) => {
            if (state.zoom > 1.1) {
                resetZoom();
            } else {
                zoomAt(CONFIG.doubleTapZoom, e.clientX, e.clientY);
            }
        });

        // Single click to toggle UI
        book.addEventListener('click', (e) => {
            if (state.zoom > 1.05) return;
            if (e.detail > 1) return; // ignore dblclick
            if (state.isUIVisible) {
                hideUI();
            } else {
                showUI();
            }
        });
    }

    // ===================== FLIP ANIMATION =====================
    function flipToSpread(newSpread, direction) {
        if (state.isAnimating) return;
        if (newSpread < 0 || newSpread >= Math.ceil(CONFIG.pages.length / 2)) return;
        if (newSpread === state.currentSpread) return;

        state.isAnimating = true;

        if (state.isVertical) {
            animateSlide(newSpread, direction);
        } else {
            animateFlip(newSpread, direction);
        }
    }

    function animateFlip(newSpread, direction) {
        const isForward = direction === 'next';

        // Create the flipping page element
        const flipPage = document.createElement('div');
        flipPage.className = 'flip-page';

        const frontFace = document.createElement('div');
        frontFace.className = 'flip-face flip-front';

        const backFace = document.createElement('div');
        backFace.className = 'flip-face flip-back';

        // Set content for front and back
        if (isForward) {
            // Flipping forward: front shows current right page, back shows new left page
            const rightIdx = state.currentSpread * 2 + 1;
            const newLeftIdx = newSpread * 2;
            if (rightIdx < CONFIG.pages.length) {
                frontFace.appendChild(createPage(rightIdx, 'right'));
            }
            if (newLeftIdx < CONFIG.pages.length) {
                backFace.appendChild(createPage(newLeftIdx, 'left'));
            }
            flipPage.style.right = '0';
            flipPage.style.transformOrigin = 'left center';
            flipPage.style.transform = 'rotateY(0deg)';
        } else {
            // Flipping backward: front shows current left page, back shows new right page
            const leftIdx = state.currentSpread * 2;
            const newRightIdx = newSpread * 2 + 1;
            if (leftIdx < CONFIG.pages.length) {
                frontFace.appendChild(createPage(leftIdx, 'left'));
            }
            if (newRightIdx < CONFIG.pages.length) {
                backFace.appendChild(createPage(newRightIdx, 'right'));
            }
            flipPage.style.left = '0';
            flipPage.style.transformOrigin = 'right center';
            flipPage.style.transform = 'rotateY(0deg)';
        }

        flipPage.appendChild(frontFace);
        flipPage.appendChild(backFace);
        book.appendChild(flipPage);

        // Add shadow overlay
        const shadow = document.createElement('div');
        shadow.className = 'flip-shadow';
        book.appendChild(shadow);

        // Prepare new content underneath
        if (isForward) {
            const newLeftIdx = newSpread * 2;
            const newRightIdx = newSpread * 2 + 1;
            renderPage(leftPage, newLeftIdx, 'left');
            renderPage(rightPage, newRightIdx, 'right');
        } else {
            const newLeftIdx = newSpread * 2;
            const newRightIdx = newSpread * 2 + 1;
            renderPage(leftPage, newLeftIdx, 'left');
            renderPage(rightPage, newRightIdx, 'right');
        }

        // Trigger animation
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                flipPage.classList.add('flipping');
                if (isForward) {
                    flipPage.style.transform = 'rotateY(-180deg)';
                } else {
                    flipPage.style.transform = 'rotateY(180deg)';
                }
                shadow.classList.add('active');
            });
        });

        // Cleanup after animation
        setTimeout(() => {
            flipPage.remove();
            shadow.remove();
            state.currentSpread = newSpread;
            state.isAnimating = false;
            updateNavigation();
            preloadImages(newSpread);
        }, CONFIG.flipDuration + 50);
    }

    function animateSlide(newSpread, direction) {
        const isForward = direction === 'next';
        const currentContent = book.querySelector('.pages-container') || book;

        // Create new content
        const newLeftIdx = newSpread * 2;
        const newRightIdx = newSpread * 2 + 1;

        // Animate out current
        const pages = book.querySelectorAll('.page');
        pages.forEach(p => {
            p.style.transition = `transform 0.7s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.7s ease`;
            p.style.transform = `translateY(${isForward ? '-100%' : '100%'}) scale(0.92)`;
            p.style.opacity = '0';
        });

        setTimeout(() => {
            renderPage(leftPage, newLeftIdx, 'left');
            renderPage(rightPage, newRightIdx, 'right');

            const newPages = book.querySelectorAll('.page');
            newPages.forEach(p => {
                p.style.transition = 'none';
                p.style.transform = `translateY(${isForward ? '100%' : '-100%'}) scale(0.92)`;
                p.style.opacity = '0';
            });

            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    newPages.forEach(p => {
                        p.style.transition = `transform 0.7s cubic-bezier(0.22, 0.61, 0.36, 1), opacity 0.7s ease`;
                        p.style.transform = 'translateY(0) scale(1)';
                        p.style.opacity = '1';
                    });
                });
            });

            state.currentSpread = newSpread;
            state.isAnimating = false;
            updateNavigation();
            preloadImages(newSpread);
        }, 700);
    }// ===================== NAVIGATION =====================
    function goNext() {
        if (state.isAnimating) return;
        const maxSpread = Math.ceil(CONFIG.pages.length / 2) - 1;
        if (state.currentSpread >= maxSpread) return;
        flipToSpread(state.currentSpread + 1, 'next');
    }

    function goPrev() {
        if (state.isAnimating) return;
        if (state.currentSpread <= 0) return;
        flipToSpread(state.currentSpread - 1, 'prev');
    }

    function goToSpread(spread) {
        if (state.isAnimating) return;
        const maxSpread = Math.ceil(CONFIG.pages.length / 2) - 1;
        spread = Math.max(0, Math.min(maxSpread, spread));
        if (spread === state.currentSpread) return;
        const direction = spread > state.currentSpread ? 'next' : 'prev';
        flipToSpread(spread, direction);
    }

    function goToPage(pageNum) {
        const idx = pageNum - 1;
        if (idx < 0 || idx >= CONFIG.pages.length) return;
        const spread = Math.floor(idx / 2);
        goToSpread(spread);
    }

    function updateNavigation() {
        const maxSpread = Math.ceil(CONFIG.pages.length / 2) - 1;

        // Buttons
        if (prevBtn) {
            prevBtn.disabled = state.currentSpread <= 0;
            prevBtn.classList.toggle('disabled', state.currentSpread <= 0);
        }
        if (nextBtn) {
            nextBtn.disabled = state.currentSpread >= maxSpread;
            nextBtn.classList.toggle('disabled', state.currentSpread >= maxSpread);
        }

        // Page counter
        const leftIdx = state.currentSpread * 2;
        const rightIdx = leftIdx + 1;
        let pageText = '';
        if (state.isVertical) {
            pageText = `Стр. ${leftIdx + 1} / ${CONFIG.pages.length}`;
        } else {
            if (rightIdx < CONFIG.pages.length) {
                pageText = `Стр. ${leftIdx + 1}–${rightIdx + 1} / ${CONFIG.pages.length}`;
            } else {
                pageText = `Стр. ${leftIdx + 1} / ${CONFIG.pages.length}`;
            }
        }
        if (pageCounter) pageCounter.textContent = pageText;

        // Slider
        if (pageSlider) {
            pageSlider.max = maxSpread;
            pageSlider.value = state.currentSpread;
        }

        // Highlight active thumbnail
        if (thumbnailsContainer) {
            const thumbs = thumbnailsContainer.querySelectorAll('.thumb');
            thumbs.forEach((t, i) => {
                t.classList.toggle('active', i === state.currentSpread);
            });
        }
    }

    // ===================== THUMBNAILS =====================
    function renderThumbnails() {
        if (!thumbnailsContainer) return;
        thumbnailsContainer.innerHTML = '';

        const maxSpread = Math.ceil(CONFIG.pages.length / 2) - 1;
        for (let s = 0; s <= maxSpread; s++) {
            const thumb = document.createElement('div');
            thumb.className = 'thumb';
            if (s === state.currentSpread) thumb.classList.add('active');

            const leftIdx = s * 2;
            const rightIdx = leftIdx + 1;

            if (state.isVertical) {
                const img = document.createElement('img');
                img.src = CONFIG.pages[leftIdx];
                img.alt = `Стр. ${leftIdx + 1}`;
                img.loading = 'lazy';
                thumb.appendChild(img);
            } else {
                const row = document.createElement('div');
                row.className = 'thumb-spread';
                const imgL = document.createElement('img');
                imgL.src = CONFIG.pages[leftIdx];
                imgL.alt = `Стр. ${leftIdx + 1}`;
                imgL.loading = 'lazy';
                row.appendChild(imgL);
                if (rightIdx < CONFIG.pages.length) {
                    const imgR = document.createElement('img');
                    imgR.src = CONFIG.pages[rightIdx];
                    imgR.alt = `Стр. ${rightIdx + 1}`;
                    imgR.loading = 'lazy';
                    row.appendChild(imgR);
                }
                thumb.appendChild(row);
            }

            const label = document.createElement('span');
            label.className = 'thumb-label';
            label.textContent = s * 2 + 1;
            thumb.appendChild(label);

            thumb.addEventListener('click', () => {
                goToSpread(s);
                closeThumbnails();
            });

            thumbnailsContainer.appendChild(thumb);
        }
    }

    function openThumbnails() {
        if (!thumbnailsOverlay) return;
        renderThumbnails();
        thumbnailsOverlay.classList.add('visible');
        state.isThumbnailsOpen = true;
    }

    function closeThumbnails() {
        if (!thumbnailsOverlay) return;
        thumbnailsOverlay.classList.remove('visible');
        state.isThumbnailsOpen = false;
    }

    // ===================== UI =====================
    function showUI() {
        if (header) header.classList.add('visible');
        if (footer) footer.classList.add('visible');
        state.isUIVisible = true;
        resetUITimer();
    }

    function hideUI() {
        if (state.isThumbnailsOpen) return;
        if (header) header.classList.remove('visible');
        if (footer) footer.classList.remove('visible');
        state.isUIVisible = false;
    }

    function resetUITimer() {
        clearTimeout(state.uiTimer);
        if (state.isFullscreenMode) {
            state.uiTimer = setTimeout(() => {
                hideUI();
            }, CONFIG.autoHideUI);
        }
    }

    function showTouchFeedback(x, y) {
        const ripple = document.createElement('div');
        ripple.className = 'touch-ripple';
        ripple.style.left = x + 'px';
        ripple.style.top = y + 'px';
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
    }

    // ===================== KEYBOARD =====================
    function initKeyboard() {
        document.addEventListener('keydown', (e) => {
            if (state.isThumbnailsOpen && e.key === 'Escape') {
                closeThumbnails();
                return;
            }

            switch (e.key) {
                case 'ArrowRight':
                case 'ArrowDown':
                case ' ':
                case 'PageDown':
                    e.preventDefault();
                    goNext();
                    break;
                case 'ArrowLeft':
                case 'ArrowUp':
                case 'PageUp':
                    e.preventDefault();
                    goPrev();
                    break;
                case 'Home':
                    e.preventDefault();
                    goToSpread(0);
                    break;
                case 'End':
                    e.preventDefault();
                    goToSpread(Math.ceil(CONFIG.pages.length / 2) - 1);
                    break;
                case 'f':
                case 'F':
                    e.preventDefault();
                    toggleFullscreenMode();
                    break;
                case '+':
                case '=':
                    e.preventDefault();
                    zoomAt(state.zoom + 0.5, window.innerWidth / 2, window.innerHeight / 2);
                    break;
                case '-':
                case '_':
                    e.preventDefault();
                    zoomAt(state.zoom - 0.5, window.innerWidth / 2, window.innerHeight / 2);
                    break;
                case '0':
                    e.preventDefault();
                    resetZoom();
                    break;
                case 'Escape':
                    if (state.zoom > 1.05) {
                        resetZoom();
                    } else if (state.isFullscreenMode) {
                        toggleFullscreenMode();
                    }
                    break;
            }
        });
    }

    // ===================== EVENTS =====================
    function initEvents() {
        // Navigation buttons
        if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); goPrev(); });
        if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); goNext(); });

        // Slider
        if (pageSlider) {
            pageSlider.addEventListener('input', (e) => {
                goToSpread(parseInt(e.target.value));
            });
        }

        // Fullscreen
        if (fullscreenBtn) {
            fullscreenBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFullscreenMode();
            });
        }
        if (exitFullscreenBtn) {
            exitFullscreenBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFullscreenMode();
            });
        }

        // Thumbnails
        if (thumbnailsBtn) {
            thumbnailsBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (state.isThumbnailsOpen) closeThumbnails();
                else openThumbnails();
            });
        }
        if (thumbnailsOverlay) {
            thumbnailsOverlay.addEventListener('click', (e) => {
                if (e.target === thumbnailsOverlay) closeThumbnails();
            });
        }

        // Zoom buttons
        if (zoomInBtn) {
            zoomInBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                zoomAt(state.zoom + 0.5, window.innerWidth / 2, window.innerHeight / 2);
            });
        }
        if (zoomOutBtn) {
            zoomOutBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                zoomAt(state.zoom - 0.5, window.innerWidth / 2, window.innerHeight / 2);
            });
        }
        if (zoomResetBtn) {
            zoomResetBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                resetZoom();
            });
        }

        // Fullscreen change (browser ESC)
        document.addEventListener('fullscreenchange', onFullscreenChange);
        document.addEventListener('webkitfullscreenchange', onFullscreenChange);

        // Orientation change
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                detectOrientation();
                calculateBookSize();
                renderCurrentSpread();
                updateNavigation();
            }, 300);
        });

        // Resize
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                detectOrientation();
                calculateBookSize();
                renderCurrentSpread();
                resetZoom(false);
            }, 200);
        });

        // Mouse wheel zoom
        book.addEventListener('wheel', (e) => {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.3 : 0.3;
            zoomAt(state.zoom + delta, e.clientX, e.clientY);
        }, { passive: false });
    }

    // ===================== HELPERS =====================
    function convertPosition(pageNum) {
        return Math.max(1, Math.min(CONFIG.pages.length, pageNum));
    }

    // ===================== INIT =====================
    async function init() {
        showLoading(true);

        // Cache DOM
        book = document.getElementById('book');
        leftPage = document.getElementById('left-page');
        rightPage = document.getElementById('right-page');
        prevBtn = document.getElementById('prev-btn');
        nextBtn = document.getElementById('next-btn');
        pageCounter = document.getElementById('page-counter');
        pageSlider = document.getElementById('page-slider');
        fullscreenBtn = document.getElementById('fullscreen-btn');
        exitFullscreenBtn = document.getElementById('exit-fullscreen-btn');
        thumbnailsBtn = document.getElementById('thumbnails-btn');
        thumbnailsOverlay = document.getElementById('thumbnails-overlay');
        thumbnailsContainer = document.getElementById('thumbnails-container');
        zoomInBtn = document.getElementById('zoom-in-btn');
        zoomOutBtn = document.getElementById('zoom-out-btn');
        zoomResetBtn = document.getElementById('zoom-reset-btn');
        zoomIndicator = document.getElementById('zoom-indicator');
        header = document.querySelector('.header');
        footer = document.querySelector('.footer');

        if (!book) {
            console.error('Элемент #book не найден!');
            return;
        }

        // Create extra UI if missing
        createExtraUI();

        // Detect orientation
        detectOrientation();
        calculateBookSize();

        // Preload first batch
        await preloadImages(0);

        // Render
        renderCurrentSpread();
        updateNavigation();

        // Init interactions
        initTouch();
        initKeyboard();
        initEvents();

        showLoading(false);
        showUI();

        console.log(`📖 Фотокнига загружена: ${CONFIG.pages.length} страниц`);
    }

    // ===================== START =====================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
