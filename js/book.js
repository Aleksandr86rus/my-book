/**
 * 📖 Flipbook Application
 * Полностью адаптивная книга с перелистыванием
 */

(function () {
    'use strict';

    // ==========================================
    // КОНФИГУРАЦИЯ
    // ==========================================
    const CONFIG = {
        // Массив путей к картинкам
        // Измените пути и количество под свои файлы!
        pages: [
            'images/page1.jpg',
            'images/page2.jpg',
            'images/page3.jpg',
            'images/page4.jpg',
            'images/page5.jpg',
            'images/page6.jpg',
            'images/page7.jpg',
            'images/page8.jpg',
            'images/page9.jpg',
            'images/page10.jpg'
        ],
        // Скорость анимации перелистывания (мс)
        flipDuration: 800,
        // Минимальная дистанция свайпа (px)
        swipeThreshold: 50,
        // Показывать подсказку при первом запуске
        showHint: true,
        // Время показа подсказки (мс)
        hintDuration: 4000
    };

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
    // ПРЕДЗАГРУЗКА ИЗОБРАЖЕНИЙ
    // ==========================================
    function preloadImages() {
        let loaded = 0;
        const total = CONFIG.pages.length;

        if (total === 0) {
            onAllImagesLoaded();
            return;
        }

        CONFIG.pages.forEach((src, index) => {
            const img = new Image();
            img.onload = img.onerror = () => {
                loaded++;
                const percent = Math.round((loaded / total) * 100);
                DOM.progressFill.style.width = percent + '%';
                DOM.loadingText.textContent = `Загрузка: ${loaded} из ${total}`;

                if (loaded === total) {
                    setTimeout(onAllImagesLoaded, 300);
                }
            };
            img.src = src;
        });
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
        }, 500);
    }

    // ==========================================
    // ПОСТРОЕНИЕ КНИГИ
    // ==========================================
    function buildBook() {
        DOM.book.innerHTML = '';

        CONFIG.pages.forEach((src, index) => {
            const page = document.createElement('div');
            page.className = 'page';
            page.dataset.index = index;
            page.style.zIndex = state.totalPages - index;

            // Передняя сторона
            const front = document.createElement('div');
            front.className = 'page-front';
            const frontImg = document.createElement('img');
            frontImg.src = src;
            frontImg.alt = `Страница ${index + 1}`;
            frontImg.draggable = false;
            front.appendChild(frontImg);

            // Номер страницы (перед)
            const frontNum = document.createElement('div');
            frontNum.className = 'page-number';
            frontNum.textContent = index + 1;
            front.appendChild(frontNum);

            // Задняя сторона (показывает следующую страницу зеркально или пустая)
            const back = document.createElement('div');
            back.className = 'page-back';

            // На задней стороне — та же картинка (зеркально отражённая стилем)
            // Или можно оставить пустой
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
            DOM.book.appendChild(page);
        });
    }

    // ==========================================
    // МИНИАТЮРЫ
    // ==========================================
    function buildThumbnails() {
        DOM.thumbnailsGrid.innerHTML = '';

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
            label.textContent = `Стр. ${index + 1}`;

            item.appendChild(img);
            item.appendChild(label);
            DOM.thumbnailsGrid.appendChild(item);

            item.addEventListener('click', () => {
                goToPage(index);
                closeThumbnails();
            });
        });
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
        const page = DOM.book.querySelectorAll('.page')[state.currentPage];
        
        page.classList.add('flipping');
        page.classList.add('flipped');

        // Звук перелистывания (опционально)
        playFlipSound();

        setTimeout(() => {
            page.classList.remove('flipping');
            state.currentPage++;
            state.isAnimating = false;
            updateUI();
        }, CONFIG.flipDuration);
    }

    function prevPage() {
        if (state.isAnimating || state.currentPage <= 0) return;

        state.isAnimating = true;
        state.currentPage--;

        const page = DOM.book.querySelectorAll('.page')[state.currentPage];
        
        page.classList.add('flipping');
        page.classList.remove('flipped');

        playFlipSound();

        setTimeout(() => {
            page.classList.remove('flipping');
            state.isAnimating = false;
            updateUI();
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
            if (i < targetPage) {
                page.classList.add('flipped');
            } else {
                page.classList.remove('flipped');
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
    }

    // ==========================================
    // ОБНОВЛЕНИЕ UI
    // ==========================================
    function updateUI() {
        // Индикатор страницы
        DOM.pageIndicator.textContent = `${state.currentPage + 1} / ${state.totalPages}`;

        // Слайдер
        DOM.pageSlider.value = state.currentPage;

        // Кнопки навигации
        DOM.btnPrev.disabled = state.currentPage <= 0;
        DOM.btnNext.disabled = state.currentPage >= state.totalPages - 1;

        // Миниатюры
        updateThumbnailsActive();
    }

    // ==========================================
    // СОБЫТИЯ
    // ==========================================
    function bindEvents() {
        // Кнопки навигации
        DOM.btnNext.addEventListener('click', (e) => {
            e.stopPropagation();
            nextPage();
        });

        DOM.btnPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            prevPage();
        });

        // Клик по книге (правая/левая половина)
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

        // Тач — свайп
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

        // Двойной тап — показать/скрыть бары
        let lastTap = 0;
        DOM.bookContainer.addEventListener('touchend', (e) => {
            const now = Date.now();
            if (now - lastTap < 300) {
                toggleBars();
                e.preventDefault();
            }
            lastTap = now;
        });

        // Resize
        window.addEventListener('resize', debounce(() => {
            // Пересчитать, если нужно
        }, 250));
    }

    // ==========================================
    // TOUCH HANDLING
    // ==========================================
    function handleTouchStart(e) {
        state.touchStartX = e.touches[0].clientX;
        state.touchStartY = e.touches[0].clientY;
    }

    function handleTouchMove(e) {
        // Предотвращаем скролл при горизонтальном свайпе
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

        // Только горизонтальный свайп
        if (Math.abs(diffX) > CONFIG.swipeThreshold && Math.abs(diffX) > diffY) {
            if (diffX > 0) {
                nextPage(); // Свайп влево → следующая
            } else {
                prevPage(); // Свайп вправо → предыдущая
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

        // Прокрутить к активной
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
    // BARS TOGGLE
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
        hint.textContent = '👆 Нажимайте или свайпайте для перелистывания';
        document.body.appendChild(hint);

        setTimeout(() => {
            hint.style.transition = 'opacity 0.5s ease';
            hint.style.opacity = '0';
            setTimeout(() => hint.remove(), 500);
        }, CONFIG.hintDuration);

        localStorage.setItem(hintKey, 'true');
    }

    // ==========================================
    // SOUND (опционально)
    // ==========================================
    function playFlipSound() {
        // Создаём лёгкий звук перелистывания через Web Audio API
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
        } catch (e) {
            // Игнорируем ошибки аудио
        }
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
