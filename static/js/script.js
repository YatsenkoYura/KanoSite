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

let db = null; // Объект базы данных IndexedDB
let currentChatId = null;
let activeRequests = new Map();

// =============================================================================
// СЛОЙ РАБОТЫ С БАЗОЙ ДАННЫХ (INDEXED DB)
// =============================================================================

const ChatStorage = {
    // Открытие базы данных
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

    // Получить все чаты
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

    // Сохранить один чат
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

    // Получить один чат
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

    // Удалить чат
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
        await ChatStorage.open(); // Открываем базу

        initializeApp();
        attachEventListeners();
        await loadChatHistory();
        await restoreLastSession();
    } catch (e) {
        console.error("Initialization error:", e);
    }
});

function initializeApp() {
    if (!localStorage.getItem(CONFIG.KEYS.LAST_CHAT_ID)) {
        localStorage.setItem(CONFIG.KEYS.LAST_CHAT_ID, '0');
    }
}

function attachEventListeners() {
    const chatForm = document.getElementById('chatForm');
    if (chatForm) chatForm.addEventListener('submit', handleFormSubmit);

    const messageInput = document.getElementById('messageInput');
    if (messageInput) {
        messageInput.addEventListener('input', autoResizeTextarea);
        messageInput.addEventListener('keydown', handleKeyDown);
        messageInput.addEventListener('input', saveChatDraft);
    }

    const newChatBtn = document.getElementById('newChatBtn');
    if (newChatBtn) newChatBtn.addEventListener('click', createNewChat);

    const logoBtn = document.getElementById('logoBtn');
    if (logoBtn) logoBtn.addEventListener('click', showWelcomeScreen);

    const toggleBtn = document.querySelector('.toggle-btn');
    if (toggleBtn) toggleBtn.addEventListener('click', toggleSidebar);

    document.querySelectorAll('.scenario-card').forEach(card => {
        card.addEventListener('click', () => {
            handleScenarioClick(card.getAttribute('data-prompt'));
        });
    });
}

// =============================================================================
// УПРАВЛЕНИЕ ЧАТАМИ
// =============================================================================

function createNewChat() {
    if (!currentChatId) return;
    showWelcomeScreen();
}

async function loadChat(chatId) {
    if (chatId === currentChatId) {
        const msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.focus();
        return;
    }

    try {
        const chat = await ChatStorage.getChat(chatId);

        if (!chat) {
            console.error('Чат не найден:', chatId);
            showWelcomeScreen();
            return;
        }

        currentChatId = chatId;
        localStorage.setItem(CONFIG.KEYS.CURRENT_CHAT_ID, chatId);

        const titleElement = document.getElementById('currentChatTitle');
        if (titleElement) titleElement.textContent = chat.title;

        hideWelcomeScreen();

        const messageContainer = document.getElementById('messageContainer');
        if (messageContainer) {
            messageContainer.innerHTML = '';
            for (const msg of chat.messages) {
                displayMessage(msg.content, msg.type, msg.plotData || null, false);
            }
        }

        const request = activeRequests.get(chatId);
        if (request && request.isProcessing && currentChatId === chatId) {
            showTypingIndicator();
        }

        await updateChatHistoryUI();
        updateSendButtonState();
        loadChatDraft(chatId);
        scrollToBottom();

    } catch (e) {
        console.error("Ошибка загрузки чата:", e);
    }
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
// ОБРАБОТКА СООБЩЕНИЙ
// =============================================================================

async function handleFormSubmit(e) {
    e.preventDefault();
    const messageInput = document.getElementById('messageInput');
    const message = messageInput ? messageInput.value.trim() : '';

    if (!message) return;

    if (messageInput) {
        messageInput.value = '';
        autoResizeTextarea.call(messageInput);
    }

    if (currentChatId) clearChatDraft(currentChatId);

    // Создание нового чата
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

        hideWelcomeScreen();
        const titleElement = document.getElementById('currentChatTitle');
        if (titleElement) titleElement.textContent = newChat.title;

        const messageContainer = document.getElementById('messageContainer');
        if (messageContainer) messageContainer.innerHTML = '';
    }

    if (activeRequests.has(currentChatId)) return;

    await sendMessage(message);
}

async function sendMessage(message) {
    // 1. Проверка спецкоманд
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
        console.log("🚀 Отправка запроса:", message);

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: message,
                chat_id: targetChatId
            }),
            signal: abortController.signal
        });

        if (!response.ok) throw new Error('Ошибка сервера');

        const data = await response.json();
        console.log("📥 Ответ сервера:", data);

        let responseText = data.response;
        let plotData = data.plot || null;
        // Мы больше не парсим JSON вручную, сервер уже прислал готовый объект или null

        if (currentChatId === targetChatId) hideTypingIndicator();

        if (currentChatId === targetChatId) {
            displayMessage(responseText, 'ai', plotData);
        }

        await saveMessageToChat(targetChatId, responseText, 'ai', plotData);
        await loadChatHistory();

    } catch (error) {
        if (error.name === 'AbortError') {
            if (currentChatId === targetChatId) hideTypingIndicator();
            return;
        }
        console.error('Ошибка sendMessage:', error);
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

// =============================================================================
// ОТОБРАЖЕНИЕ (DISPLAY)
// =============================================================================

function displayMessage(content, type, plotData = null, shouldScroll = true) {
    const messageContainer = document.getElementById('messageContainer');
    if (!messageContainer) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${type}-message`;

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    contentDiv.innerHTML = formatMessageContent(content);

    // === ЛОГИКА ДЛЯ PNG (MATPLOTLIB) ===
    if (plotData && plotData.type === 'png' && plotData.data) {
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

        // Можно добавить увеличение по клику
        img.onclick = function() {
            // Логика модального окна (опционально)
            const w = window.open("");
            w.document.write(img.outerHTML);
        };

        plotContainer.appendChild(img);
        contentDiv.appendChild(plotContainer);
    }
    // === КОНЕЦ ЛОГИКИ ДЛЯ PNG ===

    // Старая логика Plotly (можно оставить для совместимости со старой историей, если нужно)
    else if (plotData && plotData.type === 'plotly') {
         // ... ваш старый код для plotly ...
    }

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = getCurrentTime();

    contentDiv.appendChild(timeDiv);
    messageDiv.appendChild(contentDiv);
    messageContainer.appendChild(messageDiv);

    if (shouldScroll) scrollToBottom();
}

function renderPlotlyGraph(containerId, plotData) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (typeof Plotly === 'undefined') {
        container.innerHTML = '<div style="color:red;">Plotly.js не загружен</div>';
        return;
    }

    try {
        const serverData = plotData.data;
        Plotly.newPlot(container, serverData.data, serverData.layout, {
            responsive: true,
            displayModeBar: true,
            displaylogo: false,
            modeBarButtonsToRemove: ['sendDataToCloud', 'select2d', 'lasso2d']
        });

        window.addEventListener('resize', () => {
            if (document.body.contains(container)) Plotly.Plots.resize(container);
        });
    } catch (e) {
        console.error("Plotly render error:", e);
        container.innerHTML = '<div style="color:red;">Ошибка рендера графика</div>';
    }
}

function formatMessageContent(content) {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    return tempDiv.innerHTML;
}

// =============================================================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// =============================================================================

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

// =============================================================================
// САЙДБАР И ИСТОРИЯ
// =============================================================================

async function loadChatHistory() {
    const chatHistory = document.getElementById('chatHistory');
    if (!chatHistory) return;

    try {
        const chats = await ChatStorage.getAll();
        chatHistory.innerHTML = '';

        const chatArray = Object.values(chats).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));

        if (chatArray.length === 0) {
            chatHistory.innerHTML = '<div class="no-chats">Нет сохраненных чатов</div>';
            return;
        }

        chatArray.forEach(chat => {
            if (chat.messages.length === 0) return;

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

async function updateChatHistoryUI() {
    await loadChatHistory();
}

async function deleteChat(chatId, event) {
    if (event) event.stopPropagation();

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
            showWelcomeScreen();
        }
        await loadChatHistory();
    } catch (e) {
        console.error("Ошибка удаления чата:", e);
    }
}

// =============================================================================
// DRAFTS
// =============================================================================
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

// =============================================================================
// UI UTILS
// =============================================================================
function showWelcomeScreen() {
    document.getElementById('welcomeSection').style.display = 'block';
    document.getElementById('messageContainer').style.display = 'none';
    document.getElementById('currentChatTitle').textContent = 'Медицинский инсайт';

    const msgInput = document.getElementById('messageInput');
    if (msgInput) { msgInput.value = ''; autoResizeTextarea.call(msgInput); msgInput.focus(); }

    if (currentChatId) clearChatDraft(currentChatId);
    currentChatId = null;
    localStorage.removeItem(CONFIG.KEYS.CURRENT_CHAT_ID);

    document.querySelectorAll('.chat-item').forEach(i => i.classList.remove('active'));
    updateSendButtonState();
}

function hideWelcomeScreen() {
    document.getElementById('welcomeSection').style.display = 'none';
    document.getElementById('messageContainer').style.display = 'flex';
}

function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const btn = document.querySelector('.toggle-btn i');
    if (sidebar && btn) {
        sidebar.classList.toggle('collapsed');
        btn.className = sidebar.classList.contains('collapsed') ? 'fas fa-chevron-right' : 'fas fa-chevron-left';
    }
}

async function restoreLastSession() {
    const lastId = localStorage.getItem(CONFIG.KEYS.CURRENT_CHAT_ID);
    if (lastId) {
        const chat = await ChatStorage.getChat(lastId);
        if (chat && chat.messages.length > 0) loadChat(lastId);
        else showWelcomeScreen();
    }
}

async function handleScenarioClick(prompt) {
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

    hideWelcomeScreen();
    document.getElementById('currentChatTitle').textContent = newChat.title;
    document.getElementById('messageContainer').innerHTML = '';
    await loadChatHistory();

    setTimeout(() => { sendMessage(prompt); inp.value = ''; autoResizeTextarea.call(inp); }, 100);
}

function updateSendButtonState() {
    const btn = document.getElementById('sendBtn');
    if (!btn) return;
    if (!currentChatId) { btn.disabled = false; return; }
    const req = activeRequests.get(currentChatId);
    btn.disabled = req ? req.isProcessing : false;
}

function autoResizeTextarea() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
}

function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        document.getElementById('chatForm').dispatchEvent(new Event('submit'));
    }
}