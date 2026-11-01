/**
 * 📖 Flipbook Application
 * Оптимизировано для большого количества страниц (163+)
 */

(function () {
    'use strict';

    // ==========================================
    // КОНФИГУРАЦИЯ
    // ==========================================
    const CONFIG = {
        pages: [],
        flipDuration: 800,
        swipeThreshold: 50,
        showHint: true,
        hintDuration: 4000
    };

    // Генерация массива страниц от 1 до 163
    for (let i = 1; i <= 163; i++) {
        CONFIG.pages.push(`images/page (${i}).jpg`);
    }

    // ==========================================
    // СОСТОЯНИЕ
    // ==========================================
    const state = {
        currentPage: 0,
        totalPages: CONFIG.pages.length,
        isAnimating: false,
        touchStartX: 0,
        touchStartY: 0,
        touchEndX: 0,
        barsVisible: true,
        imagesLoaded: 0
    };

    // ==========================================
    // DOM ЭЛЕМЕНТЫ
    // ==========================================
    const DOM = {};

    function cacheDom() {
        DOM.loader = document.getElementById('loader');
        DOM.progressFill = document.getElementById('progressFill');
        DOM.loadingText = document.getElementById('loadingText');
        DOM.app = document.getElementById('app');
        DOM.header = document.getElementById('header');
        DOM.footer = document.getElementById('footer');
        DOM.book = document.getElementById('book');
        DOM.bookContainer = document.getElementById('bookContainer');
        DOM.pageIndicator = document.getElementById('pageIndicator');
        DOM.pageSlider = document.getElementById('pageSlider');
        DOM.btnPrev = document.getElementById('btnPrev');
        DOM.btnNext = document.getElementById('btnNext');
        DOM.btnFullscreen = document.getElementById('btnFullscreen');
        DOM.btnThumbnails = document.getElementById('btnThumbnails');
        DOM.thumbnailsPanel = document.getElementById('thumbnailsPanel');
        DOM.thumbnailsGrid = document.getElementById('thumbnailsGrid');
        DOM.btnCloseThumbnails = document.getElementById('btnCloseThumbnails');
    }

    // ==========================================
    // ИНИЦИАЛИЗАЦИЯ
    // ==========================================
    function init() {
        cacheDom();
        preloadImages();
    }

    // ==========================================
    // ПРЕДЗАГРУЗКА (только первые 10 + остальные лениво)
    // ==========================================
    function preloadImages() {
        const preloadCount = Math.min(10, CONFIG.pages.length);
        let loaded = 0;

        if (preloadCount === 0) {
            onAllImagesLoaded();
            return;
        }

        // Загружаем первые 10 страниц, остальные — лениво
        for (let i = 0; i < preloadCount; i++) {
            const img = new Image();
            img.onload = img.onerror = () => {
                loaded++;
                const percent = Math.round((loaded / preloadCount) * 100);
                DOM.progressFill.style.width = percent + '%';
                DOM.loadingText.textContent = `Загрузка: ${loaded} из ${preloadCount}`;

                if (loaded === preloadCount) {
                    setTimeout(onAllImagesLoaded, 300);
                }
            };
            img.src = CONFIG.pages[i];
        }
    }

    function onAllImagesLoaded() {
        DOM.loader.classList.add('fade-out');
        setTimeout(() => {
            DOM.loader.classList.add('hidden');
            DOM.app.classList.remove('hidden');
            buildBook();
            buildThumbnails();
            setupSlider();
            bindEvents();
            updateUI();
            showHint();
            // Фоновая подгрузка остальных
            lazyLoadRemaining();
        }, 500);
    }

    // Фоновая загрузка остальных картинок
    function lazyLoadRemaining() {
        let i = 10;
        function loadNext() {
            if (i >= CONFIG.pages.length) return;
            const img = new Image();
            img.onload = img.onerror = () => {
                i++;
                // Загружаем по 3 за раз с задержкой
                if (i % 3 === 0) {
                    setTimeout(loadNext, 50);
                } else {
                    loadNext();
                }
            };
            img.src = CONFIG.pages[i];
        }
        loadNext();
    }

    // ==========================================
    // ПОСТРОЕНИЕ КНИГИ
    // ==========================================
    function buildBook() {
        DOM.book.innerHTML = '';

        // Для оптимизации: создаём DocumentFragment
        const fragment = document.createDocumentFragment();

        CONFIG.pages.forEach((src, index) => {
            const page = document.createElement('div');
            page.className = 'page';
            page.dataset.index = index;
            page.style.zIndex = state.totalPages - index;

            // Скрываем далёкие страницы для производительности
            if (index > 10) {
                page.style.visibility = 'hidden';
            }

            // Передняя сторона
            const front = document.createElement('div');
            front.className = 'page-front';
            const frontImg = document.createElement('img');
            frontImg.alt = `Страница ${index + 1}`;
            frontImg.draggable = false;
            
            // Первые 10 — сразу, остальные — лениво
            if (index < 10) {
                frontImg.src = src;
            } else {
                frontImg.dataset.src = src;
                frontImg.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAwIiBoZWlnaHQ9IjUzMyIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjMmEyYTNlIi8+PC9zdmc+';
            }
            front.appendChild(frontImg);

            // Номер страницы
            const frontNum = document.createElement('div');
            frontNum.className = 'page-number';
            frontNum.textContent = index + 1;
            front.appendChild(frontNum);

            // Задняя сторона
            const back = document.createElement('div');
            back.className = 'page-back';
            const backInner = document.createElement('div');
            backInner.style.cssText = `
                width: 100%; height: 100%;
                background: linear-gradient(135deg, #2a2a3e, #1a1a2e);
                display: flex; align-items: center; justify-content: center;
            `;
            backInner.innerHTML = `<span style="font-size: 2rem; opacity: 0.15;">📖</span>`;
            back.appendChild(backInner);

            page.appendChild(front);
            page.appendChild(back);
            fragment.appendChild(page);
        });

        DOM.book.appendChild(fragment);
    }

    // Подгрузка картинки страницы при приближении
    function ensurePageLoaded(pageIndex) {
        const pages = DOM.book.querySelectorAll('.page');
        
        // Загружаем текущую и ±5 соседних
        for (let i = Math.max(0, pageIndex - 3); i <= Math.min(state.totalPages - 1, pageIndex + 5); i++) {
            const page = pages[i];
            if (!page) continue;
            
            page.style.visibility = 'visible';
            
            const img = page.querySelector('.page-front img');
            if (img && img.dataset.src && !img.dataset.loaded) {
                img.src = img.dataset.src;
                img.dataset.loaded = 'true';
            }
        }

        // Скрываем далёкие страницы
        pages.forEach((page, i) => {
            if (i < pageIndex - 5 || i > pageIndex + 10) {
                if (!page.classList.contains('flipped')) {
                    page.style.visibility = 'hidden';
                }
            }
        });
    }

    // ==========================================
    // МИНИАТЮРЫ
    // ==========================================
    function buildThumbnails() {
        DOM.thumbnailsGrid.innerHTML = '';
        const fragment = document.createDocumentFragment();

        CONFIG.pages.forEach((src, index) => {
            const item = document.createElement('div');
            item.className = 'thumbnail-item' + (index === state.currentPage ? ' active' : '');
            item.dataset.index = index;

            const img = document.createElement('img');
            img.src = src;
            img.alt = `Страница ${index + 1}`;
            img.loading = 'lazy';

            const label = document.createElement('div');
            label.className = 'thumbnail-label';
            label.textContent = `${index + 1}`;

            item.appendChild(img);
            item.appendChild(label);
            fragment.appendChild(item);

            item.addEventListener('click', () => {
                goToPage(index);
                closeThumbnails();
            });
        });

        DOM.thumbnailsGrid.appendChild(fragment);
    }

    function updateThumbnailsActive() {
        const items = DOM.thumbnailsGrid.querySelectorAll('.thumbnail-item');
        items.forEach((item, i) => {
            item.classList.toggle('active', i === state.currentPage);
        });
    }

    // ==========================================
    // СЛАЙДЕР
    // ==========================================
    function setupSlider() {
        DOM.pageSlider.min = 0;
        DOM.pageSlider.max = state.totalPages - 1;
        DOM.pageSlider.value = state.currentPage;
    }

    // ==========================================
    // НАВИГАЦИЯ
    // ==========================================
    function nextPage() {
        if (state.isAnimating || state.currentPage >= state.totalPages - 1) return;

        state.isAnimating = true;
        const pages = DOM.book.querySelectorAll('.page');
        const page = pages[state.currentPage];

        // Убедимся что следующие страницы загружены
        ensurePageLoaded(state.currentPage + 1);

        page.classList.add('flipping');
        page.classList.add('flipped');

        playFlipSound();

        setTimeout(() => {
            page.classList.remove('flipping');
            state.currentPage++;
            state.isAnimating = false;
            updateUI();
            ensurePageLoaded(state.currentPage);
        }, CONFIG.flipDuration);
    }

    function prevPage() {
        if (state.isAnimating || state.currentPage <= 0) return;

        state.isAnimating = true;
        state.currentPage--;

        const pages = DOM.book.querySelectorAll('.page');
        const page = pages[state.currentPage];

        ensurePageLoaded(state.currentPage);

        page.classList.add('flipping');
        page.classList.remove('flipped');

        playFlipSound();

        setTimeout(() => {
            page.classList.remove('flipping');
            state.isAnimating = false;
            updateUI();
            ensurePageLoaded(state.currentPage);
        }, CONFIG.flipDuration);
    }

    function goToPage(targetPage) {
        if (state.isAnimating) return;
        if (targetPage < 0 || targetPage >= state.totalPages) return;
        if (targetPage === state.currentPage) return;

        const pages = DOM.book.querySelectorAll('.page');

        // Мгновенно перемотать без анимации
        pages.forEach((page, i) => {
            page.style.transition = 'none';
            page.style.visibility = 'visible';
            if (i < targetPage) {
                page.classList.add('flipped');
                page.style.zIndex = 0;
            } else {
                page.classList.remove('flipped');
                page.style.zIndex = state.totalPages - i;
            }
        });

        // Вернуть анимацию
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                pages.forEach(page => {
                    page.style.transition = '';
                });
            });
        });

        state.currentPage = targetPage;
        updateUI();
        ensurePageLoaded(state.currentPage);
    }

    // ==========================================
    // ОБНОВЛЕНИЕ UI
    // ==========================================
    function updateUI() {
        DOM.pageIndicator.textContent = `${state.currentPage + 1} / ${state.totalPages}`;
        DOM.pageSlider.value = state.currentPage;
        DOM.btnPrev.disabled = state.currentPage <= 0;
        DOM.btnNext.disabled = state.currentPage >= state.totalPages - 1;
        updateThumbnailsActive();
    }

    // ==========================================
    // СОБЫТИЯ
    // ==========================================
    function bindEvents() {
        DOM.btnNext.addEventListener('click', (e) => {
            e.stopPropagation();
            nextPage();
        });

        DOM.btnPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            prevPage();
        });

        // Клик по книге
        DOM.bookContainer.addEventListener('click', (e) => {
            if (e.target.closest('.nav-btn') || e.target.closest('.header-btn')) return;

            const rect = DOM.bookContainer.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const midX = rect.width / 2;

            if (clickX > midX) {
                nextPage();
            } else {
                prevPage();
            }
        });

        // Тач
        DOM.bookContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
        DOM.bookContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
        DOM.bookContainer.addEventListener('touchend', handleTouchEnd, { passive: true });

        // Клавиатура
        document.addEventListener('keydown', handleKeyboard);

        // Колесо мыши
        DOM.bookContainer.addEventListener('wheel', handleWheel, { passive: false });

        // Слайдер
        DOM.pageSlider.addEventListener('input', () => {
            const target = parseInt(DOM.pageSlider.value);
            goToPage(target);
        });

        // Полный экран
        DOM.btnFullscreen.addEventListener('click', toggleFullscreen);

        // Миниатюры
        DOM.btnThumbnails.addEventListener('click', openThumbnails);
        DOM.btnCloseThumbnails.addEventListener('click', closeThumbnails);

        // Двойной тап
        let lastTap = 0;
        DOM.bookContainer.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTap < 300) {
                toggleBars();
                e.preventDefault();
            }
            lastTap = now;
        });
    }

    // ==========================================
    // TOUCH
    // ==========================================
    function handleTouchStart(e) {
        state.touchStartX = e.touches[0].clientX;
        state.touchStartY = e.touches[0].clientY;
    }

    function handleTouchMove(e) {
        if (!state.touchStartX) return;
        const diffX = Math.abs(e.touches[0].clientX - state.touchStartX);
        const diffY = Math.abs(e.touches[0].clientY - state.touchStartY);

        if (diffX > diffY && diffX > 10) {
            e.preventDefault();
        }
    }

    function handleTouchEnd(e) {
        state.touchEndX = e.changedTouches[0].clientX;
        const diffX = state.touchStartX - state.touchEndX;
        const diffY = Math.abs(e.changedTouches[0].clientY - state.touchStartY);

        if (Math.abs(diffX) > CONFIG.swipeThreshold && Math.abs(diffX) > diffY) {
            if (diffX > 0) {
                nextPage();
            } else {
                prevPage();
            }
        }

        state.touchStartX = 0;
        state.touchStartY = 0;
    }

    // ==========================================
    // KEYBOARD
    // ==========================================
    function handleKeyboard(e) {
        switch (e.key) {
            case 'ArrowRight':
            case 'ArrowDown':
            case ' ':
                e.preventDefault();
                nextPage();
                break;
            case 'ArrowLeft':
            case 'ArrowUp':
                e.preventDefault();
                prevPage();
                break;
            case 'Home':
                e.preventDefault();
                goToPage(0);
                break;
            case 'End':
                e.preventDefault();
                goToPage(state.totalPages - 1);
                break;
            case 'Escape':
                if (!DOM.thumbnailsPanel.classList.contains('hidden')) {
                    closeThumbnails();
                } else if (document.fullscreenElement) {
                    document.exitFullscreen();
                }
                break;
            case 'f':
            case 'F':
                toggleFullscreen();
                break;
        }
    }

    // ==========================================
    // MOUSE WHEEL
    // ==========================================
    let wheelTimeout = null;
    function handleWheel(e) {
        e.preventDefault();

        if (wheelTimeout) return;

        wheelTimeout = setTimeout(() => {
            wheelTimeout = null;
        }, CONFIG.flipDuration + 100);

        if (e.deltaY > 0 || e.deltaX > 0) {
            nextPage();
        } else if (e.deltaY < 0 || e.deltaX < 0) {
            prevPage();
        }
    }

    // ==========================================
    // FULLSCREEN
    // ==========================================
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            document.documentElement.requestFullscreen().catch(() => {});
        } else {
            document.exitFullscreen();
        }
    }

    // ==========================================
    // THUMBNAILS
    // ==========================================
    function openThumbnails() {
        updateThumbnailsActive();
        DOM.thumbnailsPanel.classList.remove('hidden');

        setTimeout(() => {
            const active = DOM.thumbnailsGrid.querySelector('.active');
            if (active) {
                active.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }, 100);
    }

    function closeThumbnails() {
        DOM.thumbnailsPanel.classList.add('hidden');
    }

    // ==========================================
    // BARS
    // ==========================================
    function toggleBars() {
        state.barsVisible = !state.barsVisible;
        DOM.header.classList.toggle('hidden-bar', !state.barsVisible);
        DOM.footer.classList.toggle('hidden-bar', !state.barsVisible);
    }

    // ==========================================
    // HINT
    // ==========================================
    function showHint() {
        if (!CONFIG.showHint) return;

        const hintKey = 'flipbook_hint_shown';
        if (localStorage.getItem(hintKey)) return;

        const hint = document.createElement('div');
        hint.className = 'touch-hint';
        hint.textContent = '👆 Свайпайте или нажимайте для перелистывания';
        document.body.appendChild(hint);

        setTimeout(() => {
            hint.style.transition = 'opacity 0.5s ease';
            hint.style.opacity = '0';
            setTimeout(() => hint.remove(), 500);
        }, CONFIG.hintDuration);

        localStorage.setItem(hintKey, 'true');
    }

    // ==========================================
    // SOUND
    // ==========================================
    function playFlipSound() {
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();

            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);

            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(200, audioCtx.currentTime + 0.08);

            gainNode.gain.setValueAtTime(0.03, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);

            oscillator.start(audioCtx.currentTime);
            oscillator.stop(audioCtx.currentTime + 0.1);
        } catch (e) {}
    }

    // ==========================================
    // UTILITIES
    // ==========================================
    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // ==========================================
    // ЗАПУСК
    // ==========================================
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
