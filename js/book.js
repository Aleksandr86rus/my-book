(function() {
    "use strict";

    const TOTAL_PAGES = 163;
    const pagesList = Array.from({ length: TOTAL_PAGES }, (_, i) => `images/page (${i + 1}).jpg`);

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
        doubleTapDelay: 300
    };

    let state = {
        currentSpread: 0,
        isVertical: false,
        isAnimating: false,
        zoom: 1,
        panX: 0,
        panY: 0,
        isFullscreenMode: false,
        isUIVisible: true,
        uiTimer: null,
        touchStartX: 0,
        touchStartY: 0,
        touchStartTime: 0,
        lastTapTime: 0
    };

    // DOM элементы
    let book, leftPage, rightPage, prevBtn, nextBtn, pageCounter, pageSlider;
    let fullscreenBtn, exitFullscreenBtn, thumbnailsBtn, thumbnailsOverlay, thumbnailsContainer;
    let zoomInBtn, zoomOutBtn, zoomResetBtn, zoomIndicator, header, footer, loadingScreen;

    function showLoading(show) {
        loadingScreen = document.getElementById('loading-screen');
        if (loadingScreen) loadingScreen.style.display = show ? 'flex' : 'none';
    }

    function detectOrientation() {
        state.isVertical = window.innerHeight > window.innerWidth;
        document.body.classList.toggle('vertical', state.isVertical);
    }

    function calculateBookSize() {
        if (!book) return;
        const vh = window.innerHeight;
        const vw = window.innerWidth;
        
        let availableH = vh - (state.isFullscreenMode ? 0 : 120);
        let availableW = vw - (state.isFullscreenMode ? 0 : 40);
        
        if (state.isVertical) {
            let w = availableW;
            let h = w / CONFIG.aspectRatio;
            if (h > availableH) {
                h = availableH;
                w = h * CONFIG.aspectRatio;
            }
            book.style.width = Math.floor(w) + 'px';
            book.style.height = Math.floor(h) + 'px';
        } else {
            let h = availableH;
            let w = h * CONFIG.aspectRatio * 2;
            if (w > availableW) {
                w = availableW;
                h = (w / 2) / CONFIG.aspectRatio;
            }
            book.style.width = Math.floor(w) + 'px';
            book.style.height = Math.floor(h) + 'px';
        }
    }

    function createPage(index, side) {
        const pg = document.createElement('div');
        pg.className = `page ${side}`;
        if (index >= 0 && index < CONFIG.pages.length) {
            const img = new Image();
            img.src = CONFIG.pages[index];
            img.alt = `Page ${index + 1}`;
            pg.appendChild(img);
            
            const num = document.createElement('div');
            num.className = 'page-number';
            num.textContent = index + 1;
            pg.appendChild(num);
        } else {
            pg.classList.add('empty');
        }
        return pg;
    }

    async function preloadImages(spreadIndex) {
        const start = spreadIndex * 2;
        const end = Math.min(start + CONFIG.preloadBatch, CONFIG.pages.length);
        const promises = [];
        for (let i = start; i < end; i++) {
            promises.push(new Promise(res => {
                const img = new Image();
                img.onload = img.onerror = res;
                img.src = CONFIG.pages[i];
            }));
        }
        await Promise.all(promises);
    }

    function renderCurrentSpread() {
        if (!leftPage || !rightPage) return;
        leftPage.innerHTML = '';
        rightPage.innerHTML = '';
        
        const leftIdx = state.currentSpread * 2;
        const rightIdx = leftIdx + 1;
        
        leftPage.appendChild(createPage(leftIdx, 'left'));
        if (!state.isVertical) {
            rightPage.appendChild(createPage(rightIdx, 'right'));
            rightPage.style.display = 'block';
        } else {
            rightPage.style.display = 'none';
        }
    }// ==================== ZOOM (МАСШТАБ) ====================

    function applyTransform(animated = true) {
        if (!book) return;
        book.style.transition = animated ? 'transform 0.25s ease-out' : 'none';
        book.style.transform = `scale(${state.zoom}) translate(${state.panX}px, ${state.panY}px)`;
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
        const bw = book.clientWidth;
        const bh = book.clientHeight;
        const overflowX = (bw * state.zoom - bw) / (2 * state.zoom);
        const overflowY = (bh * state.zoom - bh) / (2 * state.zoom);
        state.panX = Math.max(-overflowX, Math.min(overflowX, state.panX));
        state.panY = Math.max(-overflowY, Math.min(overflowY, state.panY));
    }

    function resetZoom(animated = true) {
        state.zoom = 1;
        state.panX = 0;
        state.panY = 0;
        applyTransform(animated);
    }

    function zoomAt(clientX, clientY, newZoom) {
        newZoom = clampZoom(newZoom);
        const rect = book.getBoundingClientRect();
        const mouseX = (clientX - rect.left) / state.zoom - rect.width / 2;
        const mouseY = (clientY - rect.top) / state.zoom - rect.height / 2;

        state.zoom = newZoom;
        clampPan();
        applyTransform(true);
    }

    // ==================== FULLSCREEN ====================

    function toggleFullscreenMode() {
        state.isFullscreenMode = !state.isFullscreenMode;
        document.body.classList.toggle('fullscreen-mode', state.isFullscreenMode);

        if (state.isFullscreenMode) {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen();
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            if (fullscreenBtn) fullscreenBtn.style.display = 'none';
            if (exitFullscreenBtn) exitFullscreenBtn.style.display = 'flex';
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
            if (fullscreenBtn) fullscreenBtn.style.display = 'flex';
            if (exitFullscreenBtn) exitFullscreenBtn.style.display = 'none';
        }

        resetZoom(false);
        setTimeout(() => {
            calculateBookSize();
            renderCurrentSpread();
        }, 100);
    }

    // ==================== TOUCH / GESTURES ====================

    function getDistance(t1, t2) {
        return Math.sqrt(Math.pow(t2.clientX - t1.clientX, 2) + Math.pow(t2.clientY - t1.clientY, 2));
    }

    function initTouch() {
        let startDist = 0;
        let startZoom = 1;

        book.addEventListener('touchstart', (e) => {
            if (state.isAnimating) return;
            if (e.touches.length === 2) {
                startDist = getDistance(e.touches[0], e.touches[1]);
                startZoom = state.zoom;
            } else if (e.touches.length === 1) {
                state.touchStartX = e.touches[0].clientX;
                state.touchStartY = e.touches[0].clientY;
                state.touchStartTime = Date.now();
            }
        }, { passive: true });

        book.addEventListener('touchmove', (e) => {
            if (state.isAnimating) return;
            if (e.touches.length === 2) {
                const dist = getDistance(e.touches[0], e.touches[1]);
                const scale = dist / startDist;
                state.zoom = clampZoom(startZoom * scale);
                applyTransform(false);
            }
        }, { passive: true });

        book.addEventListener('touchend', (e) => {
            if (state.zoom > 1) return;
            
            const dx = e.changedTouches[0].clientX - state.touchStartX;
            const dy = e.changedTouches[0].clientY - state.touchStartY;
            const dt = Date.now() - state.touchStartTime;

            if (Math.abs(dx) > CONFIG.swipeThreshold && dt < 500) {
                if (dx < 0) goNext();
                else goPrev();
            }
        }, { passive: true });

        book.addEventListener('dblclick', (e) => {
            if (state.zoom > 1) resetZoom();
            else zoomAt(e.clientX, e.clientY, CONFIG.doubleTapZoom);
        });
    }

    // ==================== ANIMATIONS ====================

    function flipToSpread(newSpread, direction) {
        if (state.isAnimating) return;
        state.isAnimating = true;

        if (state.isVertical) {
            animateSlide(newSpread, direction);
        } else {
            animateFlip(newSpread, direction);
        }
    }

    function animateFlip(newSpread, direction) {
        const isForward = direction === 'next';
        const flipPage = document.createElement('div');
        flipPage.className = 'flip-page';
        
        const front = document.createElement('div');
        front.className = 'flip-face flip-front';
        const back = document.createElement('div');
        back.className = 'flip-face flip-back';

        const currentRightIdx = state.currentSpread * 2 + 1;
        const currentLeftIdx = state.currentSpread * 2;
        const newLeftIdx = newSpread * 2;
        const newRightIdx = newSpread * 2 + 1;

        if (isForward) {
            front.appendChild(createPage(currentRightIdx, 'right'));
            back.appendChild(createPage(newLeftIdx, 'left'));
            flipPage.style.right = '0';
            flipPage.style.transformOrigin = 'left center';
        } else {
            front.appendChild(createPage(currentLeftIdx, 'left'));
            back.appendChild(createPage(newRightIdx, 'right'));
            flipPage.style.left = '0';
            flipPage.style.transformOrigin = 'right center';
        }

        flipPage.appendChild(front);
        flipPage.appendChild(back);
        book.appendChild(flipPage);

        // Перерисовываем содержимое под анимацией
        state.currentSpread = newSpread;
        renderCurrentSpread();

        requestAnimationFrame(() => {
            flipPage.style.transition = `transform ${CONFIG.flipDuration}ms cubic-bezier(0.33, 1, 0.68, 1)`;
            flipPage.style.transform = isForward ? 'rotateY(-180deg)' : 'rotateY(180deg)';
        });

        setTimeout(() => {
            flipPage.remove();
            state.isAnimating = false;
            updateNavigation();
        }, CONFIG.flipDuration + 50);
    }

    function animateSlide(newSpread, direction) {
        const isForward = direction === 'next';
        leftPage.style.transition = 'transform 0.6s ease-in-out, opacity 0.6s';
        leftPage.style.transform = `translateY(${isForward ? '-100%' : '100%'})`;
        leftPage.style.opacity = '0';

        setTimeout(() => {
            state.currentSpread = newSpread;
            renderCurrentSpread();
            leftPage.style.transition = 'none';
            leftPage.style.transform = `translateY(${isForward ? '100%' : '-100%'})`;
            
            requestAnimationFrame(() => {
                leftPage.style.transition = 'transform 0.6s ease-out, opacity 0.6s';
                leftPage.style.transform = 'translateY(0)';
                leftPage.style.opacity = '1';
                state.isAnimating = false;
                updateNavigation();
            });
        }, 600);
    }// ==================== НАВИГАЦИЯ ====================

    function goNext() {
        const maxSpread = Math.ceil(CONFIG.pages.length / 2) - 1;
        if (state.currentSpread < maxSpread) {
            flipToSpread(state.currentSpread + 1, 'next');
        }
    }

    function goPrev() {
        if (state.currentSpread > 0) {
            flipToSpread(state.currentSpread - 1, 'prev');
        }
    }

    function goToSpread(s) {
        s = Math.max(0, Math.min(Math.ceil(CONFIG.pages.length / 2) - 1, s));
        if (s === state.currentSpread) return;
        flipToSpread(s, s > state.currentSpread ? 'next' : 'prev');
    }

    function updateNavigation() {
        const maxSpread = Math.ceil(CONFIG.pages.length / 2) - 1;
        
        if (prevBtn) prevBtn.disabled = state.currentSpread <= 0;
        if (nextBtn) nextBtn.disabled = state.currentSpread >= maxSpread;
        
        if (pageSlider) {
            pageSlider.max = maxSpread;
            pageSlider.value = state.currentSpread;
        }

        if (pageCounter) {
            const current = state.currentSpread * 2 + 1;
            const total = CONFIG.pages.length;
            pageCounter.textContent = state.isVertical 
                ? `Стр. ${current} / ${total}`
                : `Стр. ${current}-${Math.min(current + 1, total)} / ${total}`;
        }
    }

    // ==================== ИНТЕРФЕЙС / UI ====================

    function showUI() {
        if (header) header.classList.add('visible');
        if (footer) footer.classList.add('visible');
        state.isUIVisible = true;
        resetUITimer();
    }

    function hideUI() {
        if (header) header.classList.remove('visible');
        if (footer) footer.classList.remove('visible');
        state.isUIVisible = false;
    }

    function resetUITimer() {
        clearTimeout(state.uiTimer);
        if (state.isFullscreenMode) {
            state.uiTimer = setTimeout(hideUI, CONFIG.autoHideUI);
        }
    }

    function renderThumbnails() {
        if (!thumbnailsContainer) return;
        thumbnailsContainer.innerHTML = '';
        const maxSpread = Math.ceil(CONFIG.pages.length / 2) - 1;

        for (let i = 0; i <= maxSpread; i++) {
            const thumb = document.createElement('div');
            thumb.className = 'thumb';
            const img = new Image();
            img.src = CONFIG.pages[i * 2];
            img.loading = 'lazy';
            thumb.appendChild(img);
            thumb.addEventListener('click', () => {
                goToSpread(i);
                if (thumbnailsOverlay) thumbnailsOverlay.classList.remove('visible');
            });
            thumbnailsContainer.appendChild(thumb);
        }
    }

    // ==================== ИНИЦИАЛИЗАЦИЯ ====================

    function initEvents() {
        if (prevBtn) prevBtn.onclick = goPrev;
        if (nextBtn) nextBtn.onclick = goNext;
        
        if (pageSlider) {
            pageSlider.oninput = (e) => goToSpread(parseInt(e.target.value));
        }

        if (fullscreenBtn) fullscreenBtn.onclick = toggleFullscreenMode;
        if (exitFullscreenBtn) exitFullscreenBtn.onclick = toggleFullscreenMode;

        if (thumbnailsBtn) {
            thumbnailsBtn.onclick = () => {
                renderThumbnails();
                thumbnailsOverlay.classList.add('visible');
            };
        }

        if (thumbnailsOverlay) {
            thumbnailsOverlay.onclick = (e) => {
                if (e.target === thumbnailsOverlay) thumbnailsOverlay.classList.remove('visible');
            };
        }

        window.addEventListener('resize', () => {
            detectOrientation();
            calculateBookSize();
            renderCurrentSpread();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight') goNext();
            if (e.key === 'ArrowLeft') goPrev();
            if (e.key === 'Escape') {
                if (state.zoom > 1) resetZoom();
                else if (state.isFullscreenMode) toggleFullscreenMode();
            }
        });

        // Показ UI при клике
        document.addEventListener('click', () => {
            if (!state.isUIVisible) showUI();
            else resetUITimer();
        });
    }

    async function init() {
        // Кэшируем элементы
        book = document.getElementById('book');
        leftPage = document.getElementById('left-page');
        rightPage = document.getElementById('right-page');
        prevBtn = document.getElementById('prev-btn');
        nextBtn = document.getElementById('next-btn');
        pageCounter = document.getElementById('page-counter');
        pageSlider = document.getElementById('page-slider');
        header = document.querySelector('.header');
        footer = document.querySelector('.footer');
        fullscreenBtn = document.getElementById('fullscreen-btn');
        exitFullscreenBtn = document.getElementById('exit-fullscreen-btn');
        thumbnailsBtn = document.getElementById('thumbnails-btn');
        thumbnailsOverlay = document.getElementById('thumbnails-overlay');
        thumbnailsContainer = document.getElementById('thumbnails-container');

        detectOrientation();
        calculateBookSize();
        
        await preloadImages(0);
        renderCurrentSpread();
        updateNavigation();
        initTouch();
        initEvents();
        
        showLoading(false); // Убираем экран загрузки
        showUI();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
