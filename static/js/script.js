// =============================================================================
// КОНСТАНТЫ И ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ
// =============================================================================

const CONFIG = {
    DB_NAME: 'MedicalInsightDB',
    DB_VERSION: 1,
    STORE_NAME: 'chats',
    KEYS: {
        CURRENT_CHAT_ID: 'medical_insight_current_chat',
        LAST_CHAT_ID: 'medical_insight_last_id',
        DRAFT_PREFIX: 'draft_'
    }
};

let db = null;
let currentChatId = null;
let activeRequests = new Map();
let hasEmptyChat = false;
let initialTheme = null;

// Переменные для сайдбара
let sidebar = null;
let sidebarOverlay = null;
let mobileMenuToggle = null;
let toggleBtn = null;

// Состояние приложения
let appState = {
    isInChat: false,
    isWelcomeScreenVisible: true
};

// =============================================================================
// УПРАВЛЕНИЕ САЙДБАРОМ
// =============================================================================

function initSidebar() {
    sidebar = document.querySelector('.sidebar');
    sidebarOverlay = document.getElementById('sidebarOverlay');
    mobileMenuToggle = document.getElementById('mobileMenuToggle');
    mobileCloseToggle = document.getElementById('mobileCloseToggle');
    mobileCloseBtn = document.getElementById('mobileCloseBtn');
    toggleBtn = document.querySelector('.toggle-btn');

    if (!sidebar) {
        console.error('Sidebar не найден!');
        return;
    }

    // 1. ДЕСКТОПНОЕ СВОРАЧИВАНИЕ (только на экранах > 768px)
    if (toggleBtn) {
        toggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();

            // Работает только на десктопе
            if (window.innerWidth > 768) {
                sidebar.classList.toggle('collapsed');

                const icon = toggleBtn.querySelector('i');
                if (sidebar.classList.contains('collapsed')) {
                    icon.className = 'fas fa-chevron-right';
                } else {
                    icon.className = 'fas fa-chevron-left';
                }
            }
        });
    }

    // 2. ОТКРЫТИЕ МОБИЛЬНОГО МЕНЮ (кнопка гамбургера)
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            openSidebar();
        });
    }

    // 3. ЗАКРЫТИЕ ЧЕРЕЗ КНОПКУ КРЕСТИКА (вне сайдбара)
    if (mobileCloseToggle) {
        mobileCloseToggle.addEventListener('click', function(e) {
            e.stopPropagation();
            closeSidebar();
        });
    }

    // 4. ЗАКРЫТИЕ ЧЕРЕЗ КНОПКУ X В САЙДБАРЕ
    if (mobileCloseBtn) {
        mobileCloseBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            closeSidebar();
        });
    }

    // 5. ЗАКРЫТИЕ ПО КЛИКУ НА ОВЕРЛЕЙ
    if (sidebarOverlay) {
        sidebarOverlay.addEventListener('click', function(e) {
            // Проверяем, что клик именно на оверлей, а не на дочерние элементы
            if (e.target === sidebarOverlay) {
                closeSidebar();
            }
        });
    }

    // 6. ЗАКРЫТИЕ ПО ESC
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && sidebar.classList.contains('active')) {
            closeSidebar();
        }
    });

    // 7. ЗАКРЫТИЕ МЕНЮ ПРИ ВЫБОРЕ ЧАТА
    const chatHistory = document.getElementById('chatHistory');
    if (chatHistory) {
        chatHistory.addEventListener('click', function(e) {
            const chatItem = e.target.closest('.chat-item');

            if (chatItem && window.innerWidth <= 768) {
                setTimeout(() => closeSidebar(), 100);
            }
        });
    }

    // 8. АДАПТАЦИЯ ПРИ ИЗМЕНЕНИИ РАЗМЕРА ОКНА
    let resizeTimer;
    window.addEventListener('resize', function() {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(handleSidebarResize, 250);
    });

    // Инициализация при загрузке
    handleSidebarResize();
}

function openSidebar() {
    if (sidebar) {
        sidebar.classList.add('active');
        document.body.classList.add('sidebar-open');
    }
    if (sidebarOverlay) {
        sidebarOverlay.classList.add('active');
    }
    // Прячем гамбургер, показываем крестик
    if (mobileMenuToggle) mobileMenuToggle.style.display = 'none';
    if (mobileCloseToggle) mobileCloseToggle.style.display = 'flex';
}

function closeSidebar() {
    if (sidebar) {
        sidebar.classList.remove('active');
        document.body.classList.remove('sidebar-open');
    }
    if (sidebarOverlay) {
        sidebarOverlay.classList.remove('active');
    }
    // Показываем гамбургер, прячем крестик
    if (mobileMenuToggle) mobileMenuToggle.style.display = 'flex';
    if (mobileCloseToggle) mobileCloseToggle.style.display = 'none';
}

function handleSidebarResize() {
    if (window.innerWidth > 768) {
        // На десктопе
        if (mobileMenuToggle) mobileMenuToggle.style.display = 'none';
        if (mobileCloseToggle) mobileCloseToggle.style.display = 'none';
        if (sidebarOverlay) sidebarOverlay.style.display = 'none';

        // Закрываем сайдбар если открыт
        closeSidebar();
        document.body.classList.remove('sidebar-open');

        // Восстанавливаем нормальное состояние сайдбара
        if (sidebar) {
            sidebar.style.position = '';
            sidebar.style.left = '';
            sidebar.style.width = '';
            sidebar.style.transform = '';
        }
    } else {
        // На мобильных
        if (sidebar.classList.contains('active')) {
            if (mobileMenuToggle) mobileMenuToggle.style.display = 'none';
            if (mobileCloseToggle) mobileCloseToggle.style.display = 'flex';
        } else {
            if (mobileMenuToggle) mobileMenuToggle.style.display = 'flex';
            if (mobileCloseToggle) mobileCloseToggle.style.display = 'none';
        }
        if (sidebarOverlay) sidebarOverlay.style.display = 'block';

        // Убираем класс collapsed на мобильных
        if (sidebar) {
            sidebar.classList.remove('collapsed');
        }
        // Гарантируем, что сайдбар скрыт по умолчанию
        if (sidebar && !sidebar.classList.contains('active')) {
            sidebar.style.transform = 'translateX(-100%)';
        }
    }
}

function updateMobileMenuIcon() {
    if (!mobileMenuToggle) {
        console.warn('⚠️ mobileMenuToggle не найден в updateMobileMenuIcon');
        return;
    }

    const icon = mobileMenuToggle.querySelector('i');
    if (!icon) {
        console.warn('⚠️ Иконка не найдена в mobileMenuToggle');
        return;
    }

    if (sidebar && sidebar.classList.contains('active')) {
        // Меню открыто - показываем крестик
        console.log('🔄 Меняем иконку на крестик');
        icon.className = 'fas fa-times';
    } else {
        // Меню закрыто - показываем гамбургер
        console.log('🔄 Меняем иконку на гамбургер');
        icon.className = 'fas fa-bars';
    }
}

// =============================================================================
// СЛОЙ РАБОТЫ С БАЗОЙ ДАННЫХ (INDEXED DB)
// =============================================================================

const ChatStorage = {
    open: () => {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(CONFIG.DB_NAME, CONFIG.DB_VERSION);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(CONFIG.STORE_NAME)) {
                    db.createObjectStore(CONFIG.STORE_NAME, { keyPath: 'id' });
                }
            };

            request.onsuccess = (event) => {
                db = event.target.result;
                resolve(db);
            };

            request.onerror = (event) => {
                console.error("IndexedDB error:", event.target.error);
                reject("Error opening database");
            };
        });
    },

    getAll: () => {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const transaction = db.transaction([CONFIG.STORE_NAME], 'readonly');
            const store = transaction.objectStore(CONFIG.STORE_NAME);
            const request = store.getAll();

            request.onsuccess = () => {
                const chatsObj = {};
                request.result.forEach(chat => {
                    chatsObj[chat.id] = chat;
                });
                resolve(chatsObj);
            };
            request.onerror = () => reject(request.error);
        });
    },

    saveChat: (chat) => {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const transaction = db.transaction([CONFIG.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(CONFIG.STORE_NAME);
            const request = store.put(chat);

            request.onsuccess = () => resolve(true);
            request.onerror = () => {
                console.error("Ошибка сохранения чата:", request.error);
                alert("Ошибка сохранения: недостаточно места на диске.");
                reject(request.error);
            };
        });
    },

    getChat: (id) => {
        return new Promise((resolve, reject) => {
            if (!db) return reject("DB not initialized");
            const transaction = db.transaction([CONFIG.STORE_NAME], 'readonly');
            const store = transaction.objectStore(CONFIG.STORE_NAME);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },

    deleteChat: (id) => {
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([CONFIG.STORE_NAME], 'readwrite');
            const store = transaction.objectStore(CONFIG.STORE_NAME);
            store.delete(id);
            transaction.oncomplete = () => resolve(true);
            transaction.onerror = () => reject(transaction.error);
        });
    }
};

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await ChatStorage.open();
        initializeApp();
        attachEventListeners();
        await checkEmptyChats();
        await loadChatHistory();
        await restoreLastSession();
        initTheme();
        initSidebar();
        updateAppState();
    } catch (e) {
        console.error("Initialization error:", e);
    }
});

function initializeApp() {
    if (!localStorage.getItem(CONFIG.KEYS.LAST_CHAT_ID)) {
        localStorage.setItem(CONFIG.KEYS.LAST_CHAT_ID, '0');
    }
}

// =============================================================================
// ФУНКЦИЯ attachEventListeners
// =============================================================================

function attachEventListeners() {
    const chatForm = document.getElementById('chatForm');
    if (chatForm) chatForm.addEventListener('submit', handleFormSubmit);

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        autoResizeTextarea.call(messageInput);

        messageInput.addEventListener('input', function() {
            autoResizeTextarea.call(this);
            saveChatDraft.call(this);
            updateSendButtonState();
        });

        messageInput.addEventListener('keydown', handleKeyDown);
        messageInput.addEventListener('focus', updateSendButtonState);
        messageInput.addEventListener('blur', updateSendButtonState);
    }

    const newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) newChatBtn.addEventListener('click', handleNewChat);

    const startBtn = document.querySelector('.start-btn');
    if (startBtn) startBtn.addEventListener('click', handleNewChat);

    const logoBtn = document.getElementById('logoBtn');
    if (logoBtn) logoBtn.addEventListener('click', () => {
        showWelcomeScreen();
        setTimeout(scrollWelcomeScreenToTop, 100);
    });

    document.querySelectorAll('.scenario-card').forEach(card => {
        card.addEventListener('click', () => {
            handleScenarioClick(card.getAttribute('data-prompt'));
        });
    });

    // Настройки темы
    const settingsBtn = document.getElementById('settingsBtn');
    const settingsModal = document.getElementById('settingsModal');
    const closeSettingsModal = document.getElementById('closeSettingsModal');

    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            initialTheme = currentTheme;
            initSettingsTabs();
            settingsModal.classList.add('active');
            document.body.style.overflow = 'hidden';

            setTimeout(() => {
                const modalBody = settingsModal.querySelector('.modal-body');
                if (modalBody) {
                    modalBody.scrollTop = 0;
                }
            }, 50);
        });
    }

    if (closeSettingsModal) {
        closeSettingsModal.addEventListener('click', () => {
            settingsModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        });
    }

    if (settingsModal) {
        settingsModal.addEventListener('click', (e) => {
            if (e.target === settingsModal) {
                settingsModal.classList.remove('active');
                document.body.style.overflow = 'auto';
            }
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && settingsModal.classList.contains('active')) {
            settingsModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    });

    observeChatChanges();
}

// =============================================================================
// ФУНКЦИИ САЙДБАРА И НАВИГАЦИИ
// =============================================================================

function scrollWelcomeScreenToTop() {
    const welcomeSection = document.getElementById('welcomeSection');
    const chatContainer = document.querySelector('.chat-container');

    if (welcomeSection && welcomeSection.style.display !== 'none') {
        if (chatContainer) {
            chatContainer.scrollTo({
                top: 0,
                behavior: 'smooth'
            });

            setTimeout(() => {
                chatContainer.scrollTop = 0;
            }, 100);
        }

        if (welcomeSection.scrollHeight > welcomeSection.clientHeight) {
            welcomeSection.scrollTo({
                top: 0,
                behavior: 'smooth'
            });

            setTimeout(() => {
                welcomeSection.scrollTop = 0;
            }, 100);
        }
    }
}

function updateChatHeaderVisibility() {
    const welcomeSection = document.getElementById('welcomeSection');
    const chatHeader = document.querySelector('.chat-header');

    if (!welcomeSection || !chatHeader) return;

    const isWelcomeVisible = welcomeSection.style.display !== 'none';

    if (isWelcomeVisible) {
        chatHeader.classList.add('hidden');
        document.body.classList.remove('chat-active');
    } else {
        chatHeader.classList.remove('hidden');
        document.body.classList.add('chat-active');
    }
}

function observeChatChanges() {
    const observer = new MutationObserver(() => {
        updateChatHeaderVisibility();
    });

    const welcomeSection = document.getElementById('welcomeSection');
    if (welcomeSection) {
        observer.observe(welcomeSection, {
            attributes: true,
            attributeFilter: ['style']
        });
    }

    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) {
        observer.observe(chatContainer, {
            childList: true,
            subtree: true
        });
    }
}

// =============================================================================
// ОСНОВНАЯ ЛОГИКА УПРАВЛЕНИЯ ВИДИМОСТЬЮ ЭКРАНОВ
// =============================================================================

function updateAppState() {
    const welcomeSection = document.getElementById('welcomeSection');
    const messageContainer = document.getElementById('messageContainer');
    const inputContainer = document.getElementById('inputContainer');
    const chatHeader = document.querySelector('.chat-header');

    if (!welcomeSection || !messageContainer || !inputContainer || !chatHeader) {
        console.error('Не найдены необходимые DOM элементы');
        return;
    }

    if (appState.isInChat) {
        // Режим чата - скрываем welcome screen
        welcomeSection.style.display = 'none';
        messageContainer.style.display = 'flex';
        inputContainer.style.display = 'block';
        chatHeader.classList.remove('hidden');
        document.body.classList.add('chat-active');
        appState.isWelcomeScreenVisible = false;
    } else {
        // Режим приветственного экрана
        welcomeSection.style.display = 'block';
        messageContainer.style.display = 'none';
        inputContainer.style.display = 'none';
        chatHeader.classList.add('hidden');
        document.body.classList.remove('chat-active');
        appState.isWelcomeScreenVisible = true;
    }
}

function forceHideWelcomeScreen() {
    const welcomeSection = document.getElementById('welcomeSection');
    if (welcomeSection) {
        welcomeSection.style.display = 'none';
        welcomeSection.style.visibility = 'hidden';
        welcomeSection.style.opacity = '0';
        welcomeSection.style.position = 'absolute';
        welcomeSection.style.zIndex = '-1000';
    }

    const messageContainer = document.getElementById('messageContainer');
    if (messageContainer) {
        messageContainer.style.display = 'flex';
    }

    const inputContainer = document.getElementById('inputContainer');
    if (inputContainer) {
        inputContainer.style.display = 'block';
    }

    appState.isInChat = true;
    appState.isWelcomeScreenVisible = false;
}

function forceShowWelcomeScreen() {
    const welcomeSection = document.getElementById('welcomeSection');
    if (welcomeSection) {
        welcomeSection.style.display = 'block';
        welcomeSection.style.visibility = 'visible';
        welcomeSection.style.opacity = '1';
        welcomeSection.style.position = '';
        welcomeSection.style.zIndex = '';
    }

    const messageContainer = document.getElementById('messageContainer');
    if (messageContainer) {
        messageContainer.style.display = 'none';
    }

    const inputContainer = document.getElementById('inputContainer');
    if (inputContainer) {
        inputContainer.style.display = 'none';
    }

    appState.isInChat = false;
    appState.isWelcomeScreenVisible = true;
}

// =============================================================================
// ТЕМА И НАСТРОЙКИ
// =============================================================================

let currentTheme = localStorage.getItem('medical_insight_theme') || 'light';

function initTheme() {
    document.body.classList.toggle('dark-theme', currentTheme === 'dark');
    updateThemeSelectionInModal();
}

function applyTheme(theme, showNotificationFlag = true) {
    if (theme !== currentTheme) {
        currentTheme = theme;
        document.body.classList.toggle('dark-theme', theme === 'dark');
        localStorage.setItem('medical_insight_theme', theme);
        updateThemeSelectionInModal();

        if (showNotificationFlag) {
            showNotification(`Тема изменена на ${theme === 'dark' ? 'темную' : 'светлую'}`, 'theme');
        }
    }
}

function initSettingsTabs() {
    const modalBody = document.querySelector('#settingsModal .modal-body');
    if (!modalBody) return;

    modalBody.innerHTML = `
        <div class="settings-tabs">
            <div class="tab-buttons">
                <button class="tab-btn active" data-tab="instructions">
                    <i class="fas fa-graduation-cap"></i> Инструкция
                </button>
                <button class="tab-btn" data-tab="theme">
                    <i class="fas fa-palette"></i> Тема
                </button>
            </div>

            <div class="tab-content active" id="instructionsTab">
                <div class="rules-container">
                    <section class="rule-section">
                        <h3><i class="fas fa-search"></i> Для аналитики и получения выводов</h3>
                        <p>Сформулируйте подробный вопрос. Укажите:</p>
                        <ul class="requirements-list">
                            <li><strong>Цель:</strong> анализ, сравнение, выявление причин, прогноз.</li>
                            <li><strong>Заболевание:</strong> конкретное название (гипертоническая болезнь, COVID-19).</li>
                            <li><strong>Контекст:</strong> временные рамки, географическое ограничение, целевая группа.</li>
                            <li><strong>Глубина анализа:</strong> что именно вас интересует (тренды, корреляции, аномалии).</li>
                        </ul>

                        <div class="example-container">
                            <h4><i class="fas fa-eye"></i> Пример подробного промта для анализа:</h4>
                            <blockquote class="example">
                                <p>"Проанализируй динамику заболеваемости COVID-19 среди детей 3-7 лет в Калининском и Фрунзенском районах с сентября 2023 по март 2024. Выяви основные пики и возможные причины их возникновения. Сравни с аналогичным периодом прошлого года."</p>
                            </blockquote>
                        </div>
                    </section>

                    <section class="rule-section">
                        <h3><i class="fa-solid fa-chart-bar"></i> Примеры запросов</h3>
                        <div class="example-grid">
                            <div class="example-card">
                                <h4><i class="fas fa-chart-line"></i> Анализ</h4>
                                <p>"Проанализируй заболеваемость ОРВИ по всем районам Петербурга за последние 3 года. Выяви районы с максимальной и минимальной заболеваемостью."</p>
                            </div>
                            <div class="example-card">
                                <h4><i class="fas fa-balance-scale"></i> Сравнение</h4>
                                <p>"Сравни динамику сердечно-сосудистых заболеваний в Центральном и Василеостровском районах с 2020 по 2023 год."</p>
                            </div>
                            <div class="example-card">
                                <h4><i class="fa-solid fa-chart-simple"></i> Прогноз</h4>
                                <p>"Спрогнозируй заболеваемость гриппом на зимний сезон 2024-2025. Укажи возможные пиковые периоды."</p>
                            </div>
                            <div class="example-card">
                                <h4><i class="fas fa-lightbulb"></i> Рекомендации</h4>
                                <p>"Дай рекомендации по распределению медицинского оборудования для поликлиник Приморского района на основе данных о заболеваемости."</p>
                            </div>
                        </div>
                    </section>

                    <div class="summary">
                        <p><i class="fas fa-bullseye"></i> <strong>Общее правило:</strong> Чем конкретнее и детальнее ваш запрос, тем точнее и полезнее будет ответ или визуализация от AI-агента.</p>
                    </div>
                </div>
            </div>

            <div class="tab-content" id="themeTab">
                <div class="settings-section">
                    <h3><i class="fas fa-moon"></i> Выбор темы</h3>
                    <p>Выберите тему интерфейса для комфортной работы:</p>

                    <div class="theme-options">
                        <div class="theme-option" data-theme="light">
                            <div class="theme-preview light-theme">
                                <div class="preview-sidebar"></div>
                                <div class="preview-main"></div>
                            </div>
                            <div class="theme-info">
                                <h4>Светлая</h4>
                                <p>Классическая светлая тема</p>
                            </div>
                            <div class="theme-check">
                                <i class="fas fa-check"></i>
                            </div>
                        </div>

                        <div class="theme-option" data-theme="dark">
                            <div class="theme-preview dark-theme">
                                <div class="preview-sidebar"></div>
                                <div class="preview-main"></div>
                            </div>
                            <div class="theme-info">
                                <h4>Темная</h4>
                                <p>Уменьшает нагрузку на глаза</p>
                            </div>
                            <div class="theme-check">
                                <i class="fas fa-check"></i>
                            </div>
                        </div>
                    </div>

                    <div class="theme-actions">
                        <button class="btn-primary" id="applyThemeBtn">Применить тему</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    modalBody.scrollTop = 0;

    const tabBtns = modalBody.querySelectorAll('.tab-btn');
    const tabContents = modalBody.querySelectorAll('.tab-content');

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');

            tabBtns.forEach(b => b.classList.remove('active'));
            tabContents.forEach(c => c.classList.remove('active'));

            btn.classList.add('active');
            const activeTab = document.getElementById(`${tabId}Tab`);
            activeTab.classList.add('active');

            activeTab.scrollTop = 0;
        });
    });

    const newThemeOptions = modalBody.querySelectorAll('.theme-option');
    newThemeOptions.forEach(option => {
        option.addEventListener('click', () => {
            const theme = option.getAttribute('data-theme');
            newThemeOptions.forEach(opt => opt.classList.remove('active'));
            option.classList.add('active');
        });
    });

    const applyThemeBtn = modalBody.querySelector('#applyThemeBtn');
    if (applyThemeBtn) {
        applyThemeBtn.addEventListener('click', () => {
            const selectedTheme = modalBody.querySelector('.theme-option.active').getAttribute('data-theme');

            if (selectedTheme !== initialTheme) {
                applyTheme(selectedTheme);
            }

            document.getElementById('settingsModal').classList.remove('active');
            document.body.style.overflow = 'auto';
        });
    }

    updateThemeSelectionInModal();
}

function updateThemeSelectionInModal() {
    const themeOptions = document.querySelectorAll('.theme-option');
    themeOptions.forEach(option => {
        const theme = option.getAttribute('data-theme');
        option.classList.toggle('active', theme === currentTheme);
    });
}

// =============================================================================
// ФУНКЦИИ ДЛЯ УПРАВЛЕНИЯ ПУСТЫМИ ЧАТАМИ
// =============================================================================

async function checkEmptyChats() {
    try {
        const chats = await ChatStorage.getAll();
        const emptyChat = Object.values(chats).find(chat => chat.messages.length === 0);
        hasEmptyChat = !!emptyChat;
    } catch (e) {
        console.error("Ошибка проверки пустых чатов:", e);
        hasEmptyChat = false;
    }
}

// =============================================================================
// ФУНКЦИИ ЧАТА
// =============================================================================

async function loadChat(chatId) {
    if (chatId === currentChatId) {
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.focus();
        return;
    }

    if (currentChatId) {
        const currentChat = await ChatStorage.getChat(currentChatId);
        if (currentChat && currentChat.messages.length === 0) {
            await ChatStorage.deleteChat(currentChatId);
            hasEmptyChat = false;
        }
    }

    try {
        const chat = await ChatStorage.getChat(chatId);

        if (!chat) {
            await showWelcomeScreen();
            return;
        }

        currentChatId = chatId;
        localStorage.setItem(CONFIG.KEYS.CURRENT_CHAT_ID, chatId);
        appState.isInChat = true;

        document.getElementById('currentChatTitle').textContent = chat.title;
        forceHideWelcomeScreen();

        const messageContainer = document.getElementById('messageContainer');
        if (messageContainer) {
            messageContainer.innerHTML = '';
            messageContainer.style.display = 'flex';
            for (const msg of chat.messages) {
                displayMessage(msg.content, msg.type, msg.plotData || null, false);
            }
        }

        const request = activeRequests.get(chatId);
        if (request && request.isProcessing && currentChatId === chatId) {
            showTypingIndicator();
        }

        await loadChatHistory();
        updateSendButtonState();
        loadChatDraft(chatId);
        scrollToBottom();
        updateChatHeaderVisibility();

        // Закрываем сайдбар на мобильных
        if (window.innerWidth <= 768) {
            closeSidebar();
        }

    } catch (e) {
        console.error("Ошибка загрузки чата:", e);
        forceShowWelcomeScreen();
    }
}

async function showWelcomeScreen() {
    console.log('Показываем welcome screen');

    if (currentChatId) {
        const chat = await ChatStorage.getChat(currentChatId);
        if (chat && chat.messages.length === 0) {
            await ChatStorage.deleteChat(currentChatId);
            hasEmptyChat = false;
        }
    }

    currentChatId = null;
    localStorage.removeItem(CONFIG.KEYS.CURRENT_CHAT_ID);
    appState.isInChat = false;

    document.getElementById('currentChatTitle').textContent = 'Доктор НЯМ';

    forceShowWelcomeScreen();

    const msgInput = document.getElementById('messageInput');
    if (msgInput) {
        msgInput.value = '';
        autoResizeTextarea.call(msgInput);
        msgInput.focus();
    }

    if (currentChatId) clearChatDraft(currentChatId);
    currentChatId = null;
    localStorage.removeItem(CONFIG.KEYS.CURRENT_CHAT_ID);

    document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
    updateSendButtonState();
    await loadChatHistory();
    updateChatHeaderVisibility();

    // Закрываем сайдбар на мобильных
    if (window.innerWidth <= 768) {
        closeSidebar();
    }

    scrollWelcomeScreenToTop();
}

async function handleNewChat() {
    if (hasEmptyChat) {
        const chats = await ChatStorage.getAll();
        const emptyChat = Object.values(chats).find(chat => chat.messages.length === 0);

        if (emptyChat) {
            await loadChat(emptyChat.id);
            return;
        }
    }

    const newChatId = generateChatId();
    const newChat = {
        id: newChatId,
        title: 'Новый анализ',
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await ChatStorage.saveChat(newChat);
    hasEmptyChat = true;

    currentChatId = newChatId;
    localStorage.setItem(CONFIG.KEYS.CURRENT_CHAT_ID, newChatId);
    appState.isInChat = true;

    forceHideWelcomeScreen();

    document.getElementById('currentChatTitle').textContent = newChat.title;

    const messageContainer = document.getElementById('messageContainer');
    if (messageContainer) {
        messageContainer.innerHTML = '';
        messageContainer.style.display = 'flex';
    }

    await loadChatHistory();

    const msgInput = document.getElementById('messageInput');
    if (msgInput) {
        msgInput.focus();
    }

    // Закрываем сайдбар на мобильных
    if (window.innerWidth <= 768) {
        closeSidebar();
    }
}

async function handleScenarioClick(prompt) {
    console.log('Обработка сценария:', prompt);

    if (hasEmptyChat) {
        const chats = await ChatStorage.getAll();
        const emptyChat = Object.values(chats).find(chat => chat.messages.length === 0);

        if (emptyChat) {
            await ChatStorage.deleteChat(emptyChat.id);
            hasEmptyChat = false;
        }
    }

    const inp = document.getElementById('messageInput');
    if (inp) inp.value = prompt;

    const newChatId = generateChatId();
    const newChat = {
        id: newChatId,
        title: prompt.length > 50 ? prompt.substring(0, 50) + '...' : prompt,
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };

    await ChatStorage.saveChat(newChat);
    currentChatId = newChatId;
    localStorage.setItem(CONFIG.KEYS.CURRENT_CHAT_ID, newChatId);
    hasEmptyChat = true;
    appState.isInChat = true;

    forceHideWelcomeScreen();

    document.getElementById('currentChatTitle').textContent = newChat.title;

    const messageContainer = document.getElementById('messageContainer');
    if (messageContainer) {
        messageContainer.innerHTML = '';
        messageContainer.style.display = 'flex';
    }

    await loadChatHistory();

    setTimeout(() => {
        sendMessage(prompt);
        hasEmptyChat = false;

        if (inp) {
            inp.value = '';
            autoResizeTextarea.call(inp);
            updateSendButtonState();
        }

        // Закрываем сайдбар на мобильных
        if (window.innerWidth <= 768) {
            closeSidebar();
        }
    }, 100);
}

async function handleFormSubmit(e) {
    e.preventDefault();
    console.log('Обработка отправки формы');

    const messageInput = document.getElementById('messageInput');
    const message = messageInput ? messageInput.value.trim() : '';

    if (!message) return;

    if (messageInput) {
        messageInput.value = '';
        autoResizeTextarea.call(messageInput);
        updateSendButtonState();
    }

    if (currentChatId) clearChatDraft(currentChatId);

    if (!currentChatId) {
        const newChatId = generateChatId();
        const newChat = {
            id: newChatId,
            title: message.length > 50 ? message.substring(0, 50) + '...' : message,
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        await ChatStorage.saveChat(newChat);

        currentChatId = newChatId;
        localStorage.setItem(CONFIG.KEYS.CURRENT_CHAT_ID, newChatId);
        hasEmptyChat = true;
        appState.isInChat = true;

        forceHideWelcomeScreen();

        document.getElementById('currentChatTitle').textContent = newChat.title;

        const messageContainer = document.getElementById('messageContainer');
        if (messageContainer) {
            messageContainer.innerHTML = '';
            messageContainer.style.display = 'flex';
        }
    }

    if (currentChatId) {
        const chat = await ChatStorage.getChat(currentChatId);
        if (chat && chat.messages.length === 0) {
            hasEmptyChat = false;
        }
    }

    if (activeRequests.has(currentChatId)) return;

    await sendMessage(message);
}

// =============================================================================
// ОСНОВНЫЕ ФУНКЦИИ ЧАТА
// =============================================================================

async function sendMessage(message) {
    if (await handleSpecialCommands(message)) return;

    const targetChatId = currentChatId;
    if (!targetChatId) return;
    if (activeRequests.has(targetChatId)) return;

    const abortController = new AbortController();
    activeRequests.set(targetChatId, { abortController, isProcessing: true });

    updateSendButtonState();
    displayMessage(message, 'user');

    await saveMessageToChat(targetChatId, message, 'user');
    await updateChatTitle(targetChatId, message);

    if (currentChatId === targetChatId) showTypingIndicator();
    await loadChatHistory();

    try {
        const chat = await ChatStorage.getChat(targetChatId);
        const historyMessages = chat?.messages || [];
        const messagesWithoutCurrent = historyMessages.slice(0, -1);
        const formattedHistory = getLastNMessages(messagesWithoutCurrent, 10);

        console.log('📤 Отправка запроса на сервер...');
        console.log('📝 Сообщение:', message);
        console.log('📜 История:', formattedHistory);

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                chat_id: targetChatId,
                history: formattedHistory
            }),
            signal: abortController.signal
        });

        if (!response.ok) throw new Error('Ошибка сервера');

        const data = await response.json();

        console.log('\n' + '='.repeat(60));
        console.log('📦 ПОЛНЫЙ ОТВЕТ ОТ СЕРВЕРА:');
        console.log('='.repeat(60));
        console.log('Тип ответа:', data.response_type);
        console.log('Текст ответа (первые 200 символов):', data.response?.substring(0, 200));
        console.log('Есть график?', !!data.plot);

        if (data.plot) {
            console.log('🎨 ДАННЫЕ ГРАФИКА:');
            console.log('  - Тип графика:', data.plot.type);
            console.log('  - Структура данных:', Object.keys(data.plot.data || {}));
            console.log('  - Полный объект графика:', data.plot);
        }

        if (data.error) {
            console.log('❌ Ошибка:', data.error);
        }
        console.log('='.repeat(60) + '\n');

        if (currentChatId === targetChatId) hideTypingIndicator();

        if (currentChatId === targetChatId) {
            console.log('🖥️ Отображаю сообщение...');
            displayMessage(data.response, 'ai', data.plot);
        }

        await saveMessageToChat(targetChatId, data.response, 'ai', data.plot);
        await loadChatHistory();

    } catch (error) {
        if (error.name === 'AbortError') {
            if (currentChatId === targetChatId) hideTypingIndicator();
            return;
        }
        console.error('❌ Ошибка sendMessage:', error);
        const errorText = 'Извините, произошла ошибка при обработке запроса.';

        if (currentChatId === targetChatId) {
            hideTypingIndicator();
            displayMessage(errorText, 'ai');
        }
        await saveMessageToChat(targetChatId, errorText, 'ai');
    } finally {
        activeRequests.delete(targetChatId);
        updateSendButtonState();
    }
}

async function deleteChat(chatId, event) {
    if (event) event.stopPropagation();

    const chat = await ChatStorage.getChat(chatId);
    if (chat && chat.messages.length === 0) {
        hasEmptyChat = false;
    }

    if (activeRequests.has(chatId)) {
        activeRequests.get(chatId).abortController.abort();
        activeRequests.delete(chatId);
    }
    clearChatDraft(chatId);

    try {
        await ChatStorage.deleteChat(chatId);

        if (currentChatId === chatId) {
            currentChatId = null;
            localStorage.removeItem(CONFIG.KEYS.CURRENT_CHAT_ID);
            appState.isInChat = false;
            await showWelcomeScreen();
        }
        await loadChatHistory();
    } catch (e) {
        console.error("Ошибка удаления чата:", e);
    }
}

async function restoreLastSession() {
    const lastId = localStorage.getItem(CONFIG.KEYS.CURRENT_CHAT_ID);
    if (lastId) {
        const chat = await ChatStorage.getChat(lastId);
        if (chat && chat.messages.length > 0) {
            await loadChat(lastId);
        } else {
            await showWelcomeScreen();
        }
    } else {
        await showWelcomeScreen();
    }

    updateChatHeaderVisibility();
}

async function updateChatTitle(chatId, firstMessage) {
    try {
        const chat = await ChatStorage.getChat(chatId);
        if (chat && chat.messages.length === 1) {
            chat.title = firstMessage.length > 50
                ? firstMessage.substring(0, 50) + '...'
                : firstMessage;
            chat.updatedAt = new Date().toISOString();

            await ChatStorage.saveChat(chat);
            await loadChatHistory();

            if (currentChatId === chatId) {
                const titleElement = document.getElementById('currentChatTitle');
                if (titleElement) titleElement.textContent = chat.title;
            }
        }
    } catch (e) {
        console.error("Ошибка обновления заголовка:", e);
    }
}

// =============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =============================================================================

function getLastNMessages(messages, maxCount = 10) {
    return messages.slice(-maxCount).map(msg => ({
        role: msg.type === 'user' ? 'user' : 'assistant',
        content: msg.content,
        timestamp: msg.timestamp
    }));
}

async function saveMessageToChat(chatId, content, type, plotData = null) {
    try {
        const chat = await ChatStorage.getChat(chatId);
        if (!chat) return;

        const msgObj = {
            content: content,
            type: type,
            timestamp: new Date().toISOString()
        };

        if (plotData) {
            msgObj.plotData = plotData;
        }

        chat.messages.push(msgObj);
        chat.updatedAt = new Date().toISOString();

        await ChatStorage.saveChat(chat);
    } catch (e) {
        console.error("Ошибка сохранения сообщения:", e);
    }
}

async function handleSpecialCommands(message) {
    const trimmed = message.trim().toLowerCase();
    if (trimmed === '/clear') {
        if (currentChatId) {
            const chat = await ChatStorage.getChat(currentChatId);
            if (chat) {
                chat.messages = [];
                await ChatStorage.saveChat(chat);
                loadChat(currentChatId);
            }
        }
        return true;
    }
    if (trimmed === '/help') {
        displayMessage('📋 Команды: /clear (очистить), /help (помощь)', 'ai');
        return true;
    }
    return false;
}

function displayMessage(content, type, plotData = null, shouldScroll = true) {
    console.log('\n🖼️ ВЫЗОВ displayMessage:');
    console.log('  Тип:', type);
    console.log('  Есть plotData?', !!plotData);
    if (plotData) {
        console.log('  Тип графика:', plotData.type);
        console.log('  Структура plotData:', plotData);
    }

    const messageContainer = document.getElementById('messageContainer');
    if (!messageContainer) {
        console.error('❌ messageContainer не найден!');
        return;
    }

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = formatMessageContent(content);

    if (plotData) {
        console.log('📊 Обрабатываю график...');

        if (plotData.type === 'plotly' && plotData.data) {
            console.log('✅ Тип графика: Plotly');
            console.log('✅ Данные графика присутствуют');

            const plotContainer = document.createElement('div');
            plotContainer.className = 'plotly-container';
            plotContainer.style.marginTop = '15px';
            plotContainer.style.border = '1px solid #e0e0e0';
            plotContainer.style.borderRadius = '8px';
            plotContainer.style.padding = '15px';
            plotContainer.style.backgroundColor = '#fff';

            let titleText = '📊 Визуализация данных';
            try {
                if (plotData.data.layout && plotData.data.layout.title) {
                    const t = plotData.data.layout.title;
                    titleText = typeof t === 'object' ? t.text : t;
                    if (!titleText || titleText === '') {
                        titleText = '📊 График';
                    }
                }
            } catch(e) {
                console.warn('⚠️ Не удалось извлечь заголовок графика:', e);
                titleText = '📊 График';
            }

            const plotHeader = document.createElement('div');
            plotHeader.className = 'plot-header';
            plotHeader.style.marginBottom = '10px';
            plotHeader.innerHTML = `<h4 style="margin: 0; color: #333;">${titleText}</h4>`;

            const plotDiv = document.createElement('div');
            plotDiv.className = 'plotly-graph';
            const uniqueId = `graph-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            plotDiv.id = uniqueId;
            plotDiv.style.width = '100%';
            plotDiv.style.minHeight = '450px';
            plotDiv.style.backgroundColor = '#fafafa';

            plotContainer.appendChild(plotHeader);
            plotContainer.appendChild(plotDiv);
            contentDiv.appendChild(plotContainer);

            console.log(`🎯 График будет отрисован в элементе: ${uniqueId}`);

            setTimeout(() => {
                console.log(`🎨 Начинаю отрисовку графика ${uniqueId}...`);
                const success = renderPlotlyGraph(uniqueId, plotData);
                if (success) {
                    console.log('✅ График успешно отрисован!');
                } else {
                    console.error('❌ Ошибка отрисовки графика!');
                }
            }, 100);

        } else if (plotData.type === 'png' && plotData.data) {
            console.log('📷 Тип графика: PNG');

            const plotContainer = document.createElement('div');
            plotContainer.className = 'plot-image-container';
            plotContainer.style.marginTop = '15px';

            const img = document.createElement('img');
            img.src = `data:image/png;base64,${plotData.data}`;
            img.alt = "График данных";
            img.style.maxWidth = '100%';
            img.style.borderRadius = '8px';
            img.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
            img.style.cursor = 'pointer';

            img.onclick = function() {
                const w = window.open("");
                w.document.write(img.outerHTML);
            };

            plotContainer.appendChild(img);
            contentDiv.appendChild(plotContainer);

        } else {
            console.error('❌ Неизвестный тип графика или отсутствуют данные:', plotData);
        }
    } else {
        console.log('ℹ️ График не требуется (plotData = null)');
    }

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = getCurrentTime();

    contentDiv.appendChild(timeDiv);
    messageDiv.appendChild(contentDiv);
    messageContainer.appendChild(messageDiv);

    if (shouldScroll) scrollToBottom();

    console.log('✅ Сообщение добавлено в DOM\n');
}

function renderPlotlyGraph(containerId, plotData) {
    console.log(`\n🎨 renderPlotlyGraph вызван для ${containerId}`);

    const container = document.getElementById(containerId);
    if (!container) {
        console.error(`❌ Контейнер ${containerId} не найден!`);
        return false;
    }

    if (typeof Plotly === 'undefined') {
        console.error('❌ Библиотека Plotly не загружена!');
        container.innerHTML = '<div style="color:red; padding: 20px; text-align: center;">⚠️ Библиотека Plotly не загружена. График недоступен.</div>';
        return false;
    }

    try {
        console.log('📊 Данные для отрисовки:', plotData.data);

        const plotlyData = plotData.data;

        if (!plotlyData || !plotlyData.data || !Array.isArray(plotlyData.data)) {
            console.error('❌ Некорректная структура данных графика!');
            console.log('Ожидалось: {data: [...], layout: {...}}');
            console.log('Получено:', plotlyData);
            container.innerHTML = '<div style="color:red; padding: 20px; text-align: center;">⚠️ Некорректная структура данных графика</div>';
            return false;
        }

        const config = {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['sendDataToCloud', 'select2d', 'lasso2d'],
            scrollZoom: true,
            toImageButtonOptions: {
                format: 'png',
                filename: 'medical_insight_plot',
                height: 600,
                width: 800,
                scale: 2
            }
        };

        console.log('🎯 Вызываю Plotly.newPlot...');
        Plotly.newPlot(container, plotlyData.data, plotlyData.layout || {}, config);
        console.log('✅ Plotly.newPlot успешно выполнен!');

        window.addEventListener('resize', () => {
            if (document.body.contains(container)) {
                Plotly.Plots.resize(container);
            }
        });

        return true;

    } catch (e) {
        console.error("❌ Ошибка Plotly render:", e);
        console.error("Stack trace:", e.stack);
        container.innerHTML = '<div style="color:red; padding: 20px; text-align: center;">⚠️ Ошибка отображения графика: ' + e.message + '</div>';
        return false;
    }
}

function formatMessageContent(content) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    return tempDiv.innerHTML;
}

function showTypingIndicator() {
    const messageContainer = document.getElementById('messageContainer');
    if (!messageContainer) return;
    hideTypingIndicator();

    const typingDiv = document.createElement('div');
    typingDiv.className = 'message ai-message';
    typingDiv.id = 'typingIndicator';
    typingDiv.innerHTML = `<div class="message-content"><div class="typing-indicator"><span>AI анализирует</span><div class="typing-dots"><span></span><span></span><span></span></div></div></div>`;

    messageContainer.appendChild(typingDiv);
    scrollToBottom();
}

function hideTypingIndicator() {
    const indicator = document.getElementById('typingIndicator');
    if (indicator) indicator.remove();
}

function generateChatId() {
    const lastId = parseInt(localStorage.getItem(CONFIG.KEYS.LAST_CHAT_ID)) || 0;
    const newId = lastId + 1;
    localStorage.setItem(CONFIG.KEYS.LAST_CHAT_ID, newId.toString());
    return `chat_${newId}`;
}

function getCurrentTime() {
    const now = new Date();
    return `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
}

function scrollToBottom() {
    const chatContainer = document.querySelector('.chat-container');
    if (chatContainer) setTimeout(() => { chatContainer.scrollTop = chatContainer.scrollHeight; }, 100);
}

async function loadChatHistory() {
    const chatHistory = document.getElementById('chatHistory');
    if (!chatHistory) return;

    try {
        const chats = await ChatStorage.getAll();
        chatHistory.innerHTML = '';

        const chatArray = Object.values(chats)
            .filter(chat => chat.messages.length > 0)
            .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        if (chatArray.length === 0) {
            chatHistory.innerHTML = '<div class="no-chats">Нет сохраненных чатов</div>';
            return;
        }

        chatArray.forEach(chat => {
            const chatItem = document.createElement('div');
            chatItem.className = 'chat-item';
            if (chat.id === currentChatId) chatItem.classList.add('active');

            const request = activeRequests.get(chat.id);
            const isProcessing = request && request.isProcessing;

            chatItem.innerHTML = `
                <i class="fas fa-comment"></i>
                <span class="chat-title">${chat.title}${isProcessing ? '...' : ''}</span>
                <button class="delete-chat" title="Удалить чат"><i class="fas fa-trash"></i></button>
            `;

            chatItem.addEventListener('click', () => loadChat(chat.id));
            chatItem.querySelector('.delete-chat').addEventListener('click', (e) => deleteChat(chat.id, e));

            chatHistory.appendChild(chatItem);
        });
    } catch (e) {
        console.error("Ошибка загрузки истории:", e);
    }
}

function updateSendButtonState() {
    const btn = document.getElementById('sendBtn');
    const input = document.getElementById('messageInput');
    if (!btn || !input) return;

    const isProcessing = currentChatId ? (activeRequests.get(currentChatId)?.isProcessing || false) : false;
    const hasText = input.value.trim().length > 0;

    btn.disabled = isProcessing || !hasText;

    if (hasText && !isProcessing) {
        btn.style.opacity = '1';
        btn.style.transform = 'scale(1)';
        btn.style.cursor = 'pointer';
    } else {
        btn.style.opacity = isProcessing ? '0.7' : '0.5';
        btn.style.transform = 'scale(0.95)';
        btn.style.cursor = isProcessing ? 'wait' : 'not-allowed';
    }
}

function autoResizeTextarea() {
    const textarea = this;
    const maxHeight = 120;

    const scrollTop = textarea.scrollTop;
    textarea.style.height = 'auto';
    const newHeight = Math.min(textarea.scrollHeight, maxHeight);
    textarea.style.height = newHeight + 'px';
    textarea.scrollTop = scrollTop;

    if (newHeight >= maxHeight) {
        textarea.classList.add('scrollable');
    } else {
        textarea.classList.remove('scrollable');
    }
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('chatForm').dispatchEvent(new Event('submit'));
    }
}

function saveChatDraft() {
    if (!currentChatId) return;
    const msgInput = document.getElementById('messageInput');
    if (msgInput) {
        const val = msgInput.value.trim();
        const key = CONFIG.KEYS.DRAFT_PREFIX + currentChatId;
        val ? sessionStorage.setItem(key, val) : sessionStorage.removeItem(key);
    }
}

function loadChatDraft(chatId) {
    const msgInput = document.getElementById('messageInput');
    if (!msgInput) return;
    const val = sessionStorage.getItem(CONFIG.KEYS.DRAFT_PREFIX + chatId);
    msgInput.value = val || '';
    autoResizeTextarea.call(msgInput);
}

function clearChatDraft(chatId) {
    sessionStorage.removeItem(CONFIG.KEYS.DRAFT_PREFIX + chatId);
}

function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'theme') icon = 'palette';

    notification.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOutRight 0.3s ease';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

document.addEventListener('DOMContentLoaded', () => {
    const exampleCards = document.querySelectorAll('.example-card');
    exampleCards.forEach((card, index) => {
        card.style.opacity = '0';
        card.style.transform = 'translateY(20px)';
        card.style.transition = 'all 0.5s ease';

        setTimeout(() => {
            card.style.opacity = '1';
            card.style.transform = 'translateY(0)';
        }, 100 + (index * 100));
    });

    const ruleSections = document.querySelectorAll('.rule-section');
    ruleSections.forEach((section, index) => {
        section.style.opacity = '0';
        section.style.transform = 'translateY(20px)';
        section.style.transition = 'all 0.5s ease';

        setTimeout(() => {
            section.style.opacity = '1';
            section.style.transform = 'translateY(0)';
        }, 50 + (index * 150));
    });
});

// Добавляем мониторинг изменений DOM для отслеживания появления welcome-section
const domObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeType === 1) { // Element node
                    if (node.id === 'welcomeSection' || node.querySelector?.('#welcomeSection')) {
                        console.log('Обнаружен welcome-section в DOM');
                        if (appState.isInChat) {
                            console.log('Скрываем welcome-section, так как мы в чате');
                            forceHideWelcomeScreen();
                        }
                    }
                }
            });
        }
    });
});

// Начинаем наблюдение за изменениями в body
if (document.body) {
    domObserver.observe(document.body, {
        childList: true,
        subtree: true
    });
}