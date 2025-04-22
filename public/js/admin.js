let activeTab = 'products';
let newProduct = {
    type: 'simple', 
    photos: [],
    colors: [],
    sizes: [],
    groupProducts: [],
    active: true,
    visible: true
};
let session;
let products = [];
let categories = [];
let orders = [];
let slides = [];
let filters = [];
let settings = {
    name: '',
    baseUrl: '', // Додано для базового URL
    logo: '',
    logoWidth: '',
    favicon: '',
    contacts: { phones: '', addresses: '', schedule: '' },
    socials: [],
    showSocials: true,
    about: '',
    showSlides: true,
    slideWidth: '',
    slideHeight: '',
    slideInterval: '',
    categoryWidth: '',
    categoryHeight: '',
    productWidth: '',
    productHeight: ''
};
let currentPage = 1;
const productsPerPage = 20;
const ordersPerPage = 20;
const sessionTimeout = 30 * 60 * 1000;
let inactivityTimer;
let materials = [];
let brands = [];
const orderFields = [
    { name: 'name', label: 'Ім’я' },
    { name: 'phone', label: 'Телефон' },
    { name: 'email', label: 'Email' },
    { name: 'address', label: 'Адреса' },
    { name: 'comment', label: 'Коментар' }
];
let unsavedChanges = false;
let aboutEditor; // Глобальна змінна для редактора
let productEditor; // Додаємо глобальну змінну для редактора товару
let selectedMedia = null; // Додаємо змінну для зберігання вибраного медіа
let socket;

async function loadProducts(page = 1, limit = 10) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            console.warn('Токен відсутній. Використовуються локальні продукти.');
            renderAdmin('products');
            return;
        }

        const token = localStorage.getItem('adminToken');
        const baseUrl = settings.baseUrl || 'https://mebli.onrender.com';
        const response = await fetch(`${baseUrl}/api/products?page=${page}&limit=${limit}`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('adminToken');
                session = { isActive: false, timestamp: 0 };
                localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
                showSection('admin-login');
                showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
                return;
            }
            throw new Error(`Не вдалося завантажити продукти: ${text}`);
        }

        const data = await response.json();
        console.log('Сира відповідь API для продуктів:', data);
        products = Array.isArray(data.products) ? data.products : Array.isArray(data) ? data : [];
        console.log('Продукти успішно завантажено:', products.length);
        renderAdmin('products');
    } catch (err) {
        console.error('Помилка завантаження продуктів:', err);
        showNotification('Помилка завантаження продуктів: ' + err.message);
        products = Array.isArray(products) ? products : [];
        renderAdmin('products');
    }
}

async function loadCategories() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/categories', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('adminToken');
                localStorage.removeItem('csrfToken');
                session = { isActive: false, timestamp: 0 };
                localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
                showSection('admin-login');
                showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
                return;
            }
            try {
                const errorData = JSON.parse(text);
                throw new Error(`Не вдалося завантажити категорії: ${errorData.error || response.statusText}`);
            } catch {
                throw new Error(`Не вдалося завантажити категорії: ${response.status} ${text}`);
            }
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            console.error('Отримано некоректні дані категорій:', data);
            categories = [];
            showNotification('Отримано некоректні дані категорій');
        } else {
            categories = data;
            console.log('Категорії завантажено:', categories);
            updateSubcategories();
            renderCategoriesAdmin();
        }
    } catch (e) {
        console.error('Помилка завантаження категорій:', e);
        showNotification('Помилка завантаження категорій: ' + e.message);
        categories = [];
        renderCategoriesAdmin();
    }
}

async function loadSettings() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            console.warn('Токен відсутній. Використовуються локальні налаштування.');
            return;
        }

        const token = localStorage.getItem('adminToken');
        const baseUrl = settings.baseUrl || 'https://mebli.onrender.com';
        const response = await fetch(`${baseUrl}/api/settings`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('adminToken');
                session = { isActive: false, timestamp: 0 };
                localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
                showSection('admin-login');
                showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
                return;
            }
            throw new Error(`Не вдалося завантажити налаштування: ${text}`);
        }

        const data = await response.json();
        console.log('Дані з /api/settings:', data);
        settings = { ...settings, ...data };
        console.log('Оновлені settings:', settings);

        if (document.getElementById('store-name')) {
            document.getElementById('store-name').value = settings.name || '';
            document.getElementById('base-url').value = settings.baseUrl || '';
            document.getElementById('logo-url').value = settings.logo || '';
            document.getElementById('logo-width').value = settings.logoWidth || '';
            document.getElementById('favicon-url').value = settings.favicon || '';
            document.getElementById('contact-phones').value = settings.contacts?.phones || '';
            document.getElementById('contact-addresses').value = settings.contacts?.addresses || '';
            document.getElementById('contact-schedule').value = settings.contacts?.schedule || '';
            document.getElementById('social-toggle').checked = settings.showSocials || false;
            document.getElementById('category-width').value = settings.categoryWidth || '';
            document.getElementById('category-height').value = settings.categoryHeight || '';
            document.getElementById('product-width').value = settings.productWidth || '';
            document.getElementById('product-height').value = settings.productHeight || '';
            document.getElementById('slide-width').value = settings.slideshow?.width || '';
            document.getElementById('slide-height').value = settings.slideshow?.height || '';
            document.getElementById('slide-interval').value = settings.slideshow?.interval || '';
            document.getElementById('slide-toggle').checked = settings.slideshow?.show || false;

            if (settings.about) {
                console.log('Встановлено вміст "Про нас":', settings.about);
                if (typeof aboutEditor !== 'undefined' && aboutEditor.root) {
                    aboutEditor.root.innerHTML = settings.about;
                }
            }

            if (typeof renderSocialsAdmin === 'function') {
                renderSocialsAdmin();
            }
        }

        if (typeof renderSettingsAdmin === 'function' && document.getElementById('store-name')) {
            renderSettingsAdmin();
        }
    } catch (err) {
        console.error('Помилка завантаження налаштувань:', err);
        showNotification('Помилка завантаження налаштувань: ' + err.message);
    }
}

async function fetchWithAuth(url, options = {}) {
    console.log('Request URL:', url);
    console.log('Request Options:', JSON.stringify(options, null, 2));

    const token = localStorage.getItem('adminToken');
    if (!token) {
        console.error('Токен відсутній');
        throw new Error('Токен відсутній. Увійдіть знову.');
    }

    const baseUrl = settings.baseUrl || 'https://mebli.onrender.com';
    // Перетворюємо відносний URL в абсолютний, якщо потрібно
    const fullUrl = url.startsWith('http') ? url : `${baseUrl}${url.startsWith('/') ? '' : '/'}${url}`;

    // Отримуємо CSRF-токен для запитів, що змінюють дані
    let csrfToken = localStorage.getItem('csrfToken');
    if (!csrfToken && (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE')) {
        try {
            const csrfResponse = await fetch(`${baseUrl}/api/csrf-token`, {
                method: 'GET',
                credentials: 'include',
                signal: AbortSignal.timeout(5000) // Тайм-аут 5 секунд
            });
            if (!csrfResponse.ok) {
                throw new Error(`Не вдалося отримати CSRF-токен: ${csrfResponse.statusText}`);
            }
            const csrfData = await csrfResponse.json();
            csrfToken = csrfData.csrfToken;
            if (!csrfToken) {
                throw new Error('CSRF-токен не отримано у відповіді');
            }
            localStorage.setItem('csrfToken', csrfToken);
            console.log('Отримано CSRF-токен:', csrfToken);
        } catch (err) {
            console.error('Помилка отримання CSRF-токена:', err);
            throw err;
        }
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(csrfToken && (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE') ? { 'X-CSRF-Token': csrfToken } : {})
    };

    const response = await fetch(fullUrl, {
        ...options,
        headers,
        credentials: 'include',
        signal: AbortSignal.timeout(10000) // Тайм-аут 10 секунд
    });

    if (response.status === 401) {
        console.log('Отримано 401, намагаємося оновити токен');
        const tokenRefreshed = await refreshToken();
        if (tokenRefreshed) {
            const newToken = localStorage.getItem('adminToken');
            const newResponse = await fetch(fullUrl, {
                ...options,
                headers: {
                    ...headers,
                    'Authorization': `Bearer ${newToken}`
                },
                credentials: 'include',
                signal: AbortSignal.timeout(10000)
            });
            console.log('Повторний запит після оновлення токена:', newResponse.status);
            return newResponse;
        }
        throw new Error('Не вдалося оновити токен');
    } else if (response.status === 403 && (options.method === 'POST' || options.method === 'PUT' || options.method === 'DELETE')) {
        console.log('Отримано 403, намагаємося оновити CSRF-токен');
        try {
            const csrfResponse = await fetch(`${baseUrl}/api/csrf-token`, {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
                credentials: 'include',
                signal: AbortSignal.timeout(5000)
            });
            if (csrfResponse.ok) {
                const csrfData = await csrfResponse.json();
                const newCsrfToken = csrfData.csrfToken;
                if (!newCsrfToken) {
                    throw new Error('Новий CSRF-токен не отримано');
                }
                localStorage.setItem('csrfToken', newCsrfToken);
                console.log('Оновлено CSRF-токен:', newCsrfToken);
                return fetchWithAuth(url, options); // Повторити запит
            }
            throw new Error('Не вдалося отримати новий CSRF-токен');
        } catch (err) {
            console.error('Помилка повторного отримання CSRF-токена:', err);
            throw err;
        }
    }

    console.log('Відповідь API:', response.status, response.statusText);
    return response;
}

async function loadOrders() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            console.warn('Токен відсутній. Використовуються локальні замовлення.');
            renderAdmin('orders');
            return;
        }

        const token = localStorage.getItem('adminToken');
        const baseUrl = settings.baseUrl || 'https://mebli.onrender.com';
        const response = await fetch(`${baseUrl}/api/orders`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('adminToken');
                session = { isActive: false, timestamp: 0 };
                localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
                showSection('admin-login');
                showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
                return;
            }
            throw new Error(`Не вдалося завантажити замовлення: ${text}`);
        }

        const data = await response.json();
        console.log('Сира відповідь API для замовлень:', data);
        orders = Array.isArray(data.orders) ? data.orders : Array.isArray(data) ? data : [];
        console.log('Замовлення успішно завантажено:', orders.length);
        renderAdmin('orders');
    } catch (err) {
        console.error('Помилка завантаження замовлень:', err);
        showNotification('Помилка завантаження замовлень: ' + err.message);
        orders = Array.isArray(orders) ? orders : [];
        renderAdmin('orders');
    }
}

async function loadSlides() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/slides', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('adminToken');
                session = { isActive: false, timestamp: 0 };
                localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
                showSection('admin-login');
                showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
                return;
            }
            throw new Error(`Не вдалося завантажити слайди: ${text}`);
        }

        slides = await response.json();
        renderSlidesAdmin();
    } catch (e) {
        console.error('Помилка завантаження слайдів:', e);
        showNotification('Помилка: ' + e.message);
        slides = [];
        renderSlidesAdmin();
    }
}

async function loadMaterials() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            console.warn('Токен відсутній. Завантаження локальних даних для тестування.');
            materials = [];
            updateMaterialOptions();
            return;
        }

        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/materials', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('adminToken');
                session = { isActive: false, timestamp: 0 };
                localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
                showSection('admin-login');
                showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
                return;
            }
            throw new Error(`Не вдалося завантажити матеріали: ${text}`);
        }

        materials = await response.json();
        updateMaterialOptions();
    } catch (e) {
        console.error('Помилка завантаження матеріалів:', e);
        showNotification(e.message);
        materials = [];
        updateMaterialOptions();
    }
}

async function loadBrands() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            console.warn('Токен відсутній. Завантаження локальних даних для тестування.');
            brands = [];
            updateBrandOptions();
            return;
        }

        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/brands', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('adminToken');
                session = { isActive: false, timestamp: 0 };
                localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
                showSection('admin-login');
                showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
                return;
            }
            throw new Error(`Не вдалося завантажити бренди: ${text}`);
        }

        brands = await response.json();
        updateBrandOptions();
    } catch (e) {
        console.error('Помилка завантаження брендів:', e);
        showNotification(e.message);
        brands = [];
        updateBrandOptions();
    }
}

function renderFilters() {
    const filterList = document.getElementById('filter-list-admin');
    if (filterList) {
        filterList.innerHTML = filters.map((f, index) => `
            <div>
                ${f.label} (${f.name}, ${f.type}): ${f.options.join(', ')}
                <button class="delete-btn" onclick="deleteFilter(${index})">Видалити</button>
            </div>
        `).join('');
    }
    resetInactivityTimer();
}

async function deleteFilter(index) {
    if (confirm('Ви впевнені, що хочете видалити цей фільтр?')) {
        try {
            const tokenRefreshed = await refreshToken();
            if (!tokenRefreshed) {
                showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
                showSection('admin-login');
                return;
            }

            filters.splice(index, 1);

            const token = localStorage.getItem('adminToken');
            const baseUrl = settings.baseUrl || 'https://mebli.onrender.com';
            const response = await fetch(`${baseUrl}/api/settings`, {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({ ...settings, filters })
            });

            if (!response.ok) {
                throw new Error('Не вдалося оновити фільтри');
            }

            renderFilters();
            showNotification('Фільтр видалено!');
        } catch (err) {
            console.error('Помилка видалення фільтру:', err);
            showNotification('Помилка: ' + err.message);
        }
    }
}

function updateMaterialOptions() {
    const materialInput = document.getElementById('product-material');
    if (materialInput && materialInput.tagName === 'INPUT') {
        // Якщо це текстове поле, нічого не робимо, але в майбутньому можна замінити на <select>
    } else if (materialInput && materialInput.tagName === 'SELECT') {
        materialInput.innerHTML = '<option value="">Виберіть матеріал</option>' +
            materials.map(m => `<option value="${m}">${m}</option>`).join('');
    }
}

function updateBrandOptions() {
    const brandInput = document.getElementById('product-brand');
    if (brandInput && brandInput.tagName === 'INPUT') {
        // Якщо це текстове поле, нічого не робимо, але в майбутньому можна замінити на <select>
    } else if (brandInput && brandInput.tagName === 'SELECT') {
        brandInput.innerHTML = '<option value="">Виберіть бренд</option>' +
            brands.map(b => `<option value="${b}">${b}</option>`).join('');
    }
}

let isInitializing = false;

async function initializeData() {
    if (isInitializing) {
        console.log('Ініціалізація вже виконується, пропускаємо');
        return;
    }

    isInitializing = true;
    try {
        const results = await Promise.allSettled([
            loadProducts(),
            loadCategories(),
            loadSettings(),
            loadOrders(),
            loadSlides(),
            loadMaterials(),
            loadBrands(),
            loadFilters()
        ]);
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`Помилка завантаження ${['products', 'categories', 'settings', 'orders', 'slides', 'materials', 'brands', 'filters'][index]}:`, result.reason);
                showNotification(`Помилка завантаження даних: ${result.reason.message}`);
            }
        });
        initializeEditors();
        console.log('Усі дані успішно ініціалізовані');
    } catch (e) {
        console.error('Помилка ініціалізації даних:', e);
        showNotification('Помилка при завантаженні даних: ' + e.message);
    } finally {
        isInitializing = false;
    }
}

async function checkAuth() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showSection('admin-login');
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            return;
        }

        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/auth/check', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (response.ok) {
            showSection('admin-panel');
            await initializeData();
            connectAdminWebSocket();
            startTokenRefreshTimer(); // Додаємо виклик
            resetInactivityTimer();
        } else {
            showSection('admin-login');
            if (response.status === 401 || response.status === 403) {
                showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
            }
        }
    } catch (e) {
        console.error('Помилка перевірки авторизації:', e);
        showSection('admin-login');
        showNotification('Не вдалося перевірити авторизацію. Перевірте з’єднання.');
    }
}

function openResizeModal(media) {
    if (!media) {
        console.warn('Медіа-елемент не передано');
        return;
    }

    // Знімаємо виділення з попереднього елемента
    const previouslySelected = document.querySelector('.quill-media-selected');
    if (previouslySelected) {
        previouslySelected.classList.remove('quill-media-selected');
    }

    // Виділяємо поточний елемент
    media.classList.add('quill-media-selected');
    // Зберігаємо медіа в локальній змінній або скидаємо глобальну
    window.selectedMedia = media;

    // Перевіряємо існування полів
    const widthInput = document.getElementById('media-width');
    const heightInput = document.getElementById('media-height');
    const resizeModal = document.getElementById('resize-modal');

    if (!widthInput || !heightInput || !resizeModal) {
        console.warn('Елементи #media-width, #media-height або #resize-modal не знайдено');
        return;
    }

    // Отримуємо поточні розміри
    const currentWidth = media.getAttribute('width') || media.style.width || '';
    const currentHeight = media.getAttribute('height') || media.style.height || '';

    // Заповнюємо поля модального вікна
    widthInput.value = currentWidth;
    heightInput.value = currentHeight;

    // Відкриваємо модальне вікно
    resizeModal.classList.add('active');
    console.log('Відкрито модальне вікно для медіа:', { tag: media.tagName, width: currentWidth, height: currentHeight });
    resetInactivityTimer();
}

function closeResizeModal() {
    const resizeModal = document.getElementById('resize-modal');
    if (resizeModal) {
        resizeModal.classList.remove('active');
    } else {
        console.warn('Елемент #resize-modal не знайдено');
    }

    // Знімаємо виділення
    if (window.selectedMedia) {
        window.selectedMedia.classList.remove('quill-media-selected');
        window.selectedMedia = null;
        console.log('Очищено selectedMedia');
    }
    resetInactivityTimer();
    console.log('Модальне вікно закрито');
}

function saveMediaSize() {
    if (!selectedMedia) return;

    const width = document.getElementById('media-width').value.trim();
    const height = document.getElementById('media-height').value.trim();

    // Перевіряємо, чи введені значення коректні
    const isValidDimension = (value) => {
        return value === '' || /^\d+(\.\d+)?(%|px)?$/.test(value);
    };

    if (!isValidDimension(width) || !isValidDimension(height)) {
        alert('Введіть коректні розміри (наприклад, 300, 50%, 200px)!');
        return;
    }

    // Застосовуємо розміри
    if (width) {
        selectedMedia.setAttribute('width', width);
        selectedMedia.style.width = width;
        // Для iframe додаємо стиль max-width, щоб уникнути переповнення
        if (selectedMedia.tagName === 'IFRAME') {
            selectedMedia.style.maxWidth = '100%';
        }
    } else {
        selectedMedia.removeAttribute('width');
        selectedMedia.style.width = '';
        if (selectedMedia.tagName === 'IFRAME') {
            selectedMedia.style.maxWidth = '';
        }
    }

    if (height) {
        selectedMedia.setAttribute('height', height);
        selectedMedia.style.height = height;
    } else {
        selectedMedia.removeAttribute('height');
        selectedMedia.style.height = '';
    }

    // Оновлюємо приховане поле з вмістом редактора
    const editorId = selectedMedia.closest('#about-editor') ? 'about-edit' : 'product-description';
    const editor = selectedMedia.closest('#about-editor') ? aboutEditor : document.querySelector('#product-description-editor').__quill;
    document.getElementById(editorId).value = editor.root.innerHTML;

    // Закриваємо модальне вікно
    closeResizeModal();
    unsavedChanges = true;
    resetInactivityTimer();
}

function setDefaultVideoSizes(editor, editorId) {
    if (!editor || !editor.root) {
        console.warn('Редактор або editor.root не визначені');
        return;
    }

    const editorElement = document.getElementById(editorId);
    if (!editorElement) {
        console.warn(`Елемент #${editorId} не знайдено`);
        return;
    }

    let changesMade = false;
    const iframes = editor.root.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        if (!iframe.style.width && !iframe.style.height) {
            iframe.style.width = '50%';
            iframe.style.height = '300px';
            iframe.style.maxWidth = '100%';
            changesMade = true;
            console.log('Встановлено розміри для iframe:', { width: '50%', height: '300px' });
        }
    });

    editorElement.value = editor.root.innerHTML;
    if (changesMade) {
        unsavedChanges = true;
        console.log(`Оновлено вміст редактора для #${editorId}, unsavedChanges = true`);
    } else {
        console.log(`Розміри iframe не змінено для #${editorId}`);
    }
}

function initializeEditors() {
    const aboutEditorElement = document.getElementById('about-editor');
    if (!aboutEditorElement) {
        console.warn('Елемент #about-editor не знайдено, пропускаємо ініціалізацію.');
        return;
    }

    if (window.aboutEditor) {
        console.log('Редактор "Про нас" уже ініціалізований, пропускаємо.');
        return;
    }

    const aboutToolbarOptions = [
        ['bold', 'italic', 'underline', 'strike'],
        ['blockquote', 'code-block'],
        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
        [{ 'script': 'sub' }, { 'script': 'super' }],
        [{ 'indent': '-1' }, { 'indent': '+1' }],
        [{ 'direction': 'rtl' }],
        [{ 'size': ['small', false, 'large', 'huge'] }],
        [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
        [{ 'color': [] }, { 'background': [] }],
        [{ 'font': [] }],
        [{ 'align': [] }],
        ['clean'],
        ['image', 'video'],
        [{ 'undo': 'undo' }, { 'redo': 'redo' }]
    ];

    try {
        // Реєструємо кастомні кнопки undo/redo
        Quill.register('modules/undo', function(quill) {
            return {
                undo: () => quill.history.undo()
            };
        }, true);
        Quill.register('modules/redo', function(quill) {
            return {
                redo: () => quill.history.redo()
            };
        }, true);

        window.aboutEditor = new Quill('#about-editor', {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: aboutToolbarOptions,
                    handlers: {
                        undo: function() { this.quill.history.undo(); },
                        redo: function() { this.quill.history.redo(); }
                    }
                },
                history: {
                    delay: 1000,
                    maxStack: 500,
                    userOnly: true
                }
            }
        });

        window.aboutEditor.on('text-change', () => {
            const content = window.aboutEditor.root.innerHTML;
            const aboutEdit = document.getElementById('about-edit');
            if (aboutEdit) {
                aboutEdit.value = content;
            } else {
                console.warn('Елемент #about-edit не знайдено');
            }
            console.log('Вміст редактора змінено:', content);
            unsavedChanges = true;
            resetInactivityTimer();

            // Оновлення стану кнопок undo/redo
            const undoButton = document.querySelector('.ql-undo');
            const redoButton = document.querySelector('.ql-redo');
            if (undoButton && redoButton) {
                window.aboutEditor.history.stack.undo.length > 0
                    ? undoButton.removeAttribute('disabled')
                    : undoButton.setAttribute('disabled', 'true');
                window.aboutEditor.history.stack.redo.length > 0
                    ? redoButton.removeAttribute('disabled')
                    : redoButton.setAttribute('disabled', 'true');
            }
        });

        // Завантажуємо початковий вміст
        const aboutEdit = document.getElementById('about-edit');
        if (typeof settings.about === 'string' && settings.about.trim()) {
            try {
                window.aboutEditor.root.innerHTML = settings.about;
                console.log('Встановлено вміст "Про нас":', settings.about);
            } catch (e) {
                console.error('Помилка при встановленні вмісту "Про нас":', e);
                window.aboutEditor.setText(settings.about, 'silent');
            }
        } else {
            console.log('settings.about порожній або невалідний, редактор очищено.');
            window.aboutEditor.setText('', 'silent');
        }
        if (aboutEdit) {
            aboutEdit.value = settings.about || '';
        } else {
            console.warn('Елемент #about-edit не знайдено');
        }

        // Обробник кліків для зміни розмірів медіа
        window.aboutEditor.root.addEventListener('click', (e) => {
            const target = e.target;
            if (target.tagName === 'IMG' || target.tagName === 'IFRAME') {
                if (typeof openResizeModal === 'function') {
                    openResizeModal(target);
                } else {
                    console.warn('Функція openResizeModal не визначена');
                }
            }
        });

        // Обробка вставки медіа
        window.aboutEditor.clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
            if (node.tagName === 'IMG' || node.tagName === 'IFRAME') {
                const src = node.getAttribute('src');
                if (src) {
                    const insert = node.tagName === 'IMG' ? { image: src } : { video: src };
                    return { ops: [{ insert }] };
                }
            }
            return delta;
        });

        // Встановлюємо розміри для відео за замовчуванням
        if (typeof setDefaultVideoSizes === 'function') {
            setDefaultVideoSizes(window.aboutEditor, 'about-edit');
            console.log('Викликано setDefaultVideoSizes для aboutEditor');
        } else {
            console.warn('Функція setDefaultVideoSizes не визначена');
        }
    } catch (e) {
        console.error('Помилка ініціалізації Quill-редактора:', e);
        showNotification('Не вдалося ініціалізувати редактор: ' + e.message);
    }
}

function addToolbarEventListeners() {
    const toolbar = document.querySelector('#about-editor').previousElementSibling;
    if (toolbar && toolbar.classList.contains('ql-toolbar')) {
        const undoButton = toolbar.querySelector('.ql-undo');
        const redoButton = toolbar.querySelector('.ql-redo');
        if (undoButton) {
            undoButton.addEventListener('click', () => {
                aboutEditor.history.undo();
            });
        }
        if (redoButton) {
            redoButton.addEventListener('click', () => {
                aboutEditor.history.redo();
            });
        }
    } else {
        console.error('Панель інструментів для aboutEditor не знайдена');
    }
}

function initializeProductEditor(description = '', descriptionDelta = null) {
    const editorElement = document.getElementById('product-description-editor');
    if (!editorElement) {
        console.warn('Елемент #product-description-editor не знайдено, пропускаємо ініціалізацію.');
        return;
    }

    try {
        productEditor = new Quill('#product-description-editor', {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: [
                        ['bold', 'italic', 'underline'],
                        [{ 'header': 2 }, { 'header': 3 }],
                        ['link', 'image', 'video'],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'undo': 'undo' }, { 'redo': 'redo' }],
                        ['clean']
                    ],
                    handlers: {
                        undo: function() { this.quill.history.undo(); },
                        redo: function() { this.quill.history.redo(); }
                    }
                },
                history: {
                    delay: 1000,
                    maxStack: 100,
                    userOnly: true
                }
            }
        });

        // Встановлюємо вміст редактора
        if (descriptionDelta) {
            productEditor.setContents(descriptionDelta, 'silent');
        } else if (description) {
            try {
                const delta = productEditor.clipboard.convert(description);
                productEditor.setContents(delta, 'silent');
            } catch (e) {
                console.error('Помилка при встановленні вмісту редактора товару:', e);
                productEditor.setContents([{ insert: description }], 'silent');
            }
        } else {
            productEditor.setContents([], 'silent');
        }
        document.getElementById('product-description').value = productEditor.root.innerHTML;

        // Додаємо обробник для завантаження зображень через панель інструментів
        const toolbar = productEditor.getModule('toolbar');
        toolbar.addHandler('image', async () => {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/jpeg,image/png,image/gif,image/webp');
            input.click();
            input.onchange = async () => {
                const file = input.files[0];
                if (file) {
                    const validation = validateFile(file);
                    if (!validation.valid) {
                        showNotification(validation.error);
                        return;
                    }

                    try {
                        const tokenRefreshed = await refreshToken();
                        if (!tokenRefreshed) {
                            showNotification('Токен відсутній. Будь ласка, увійдіть знову.');
                            showSection('admin-login');
                            return;
                        }

                        const token = localStorage.getItem('adminToken');
                        const formData = new FormData();
                        formData.append('file', file);
                        const response = await fetchWithAuth('/api/upload', {
                            method: 'POST',
                            body: formData
                        });

                        if (!response.ok) {
                            throw new Error(`Помилка завантаження зображення: ${response.statusText}`);
                        }

                        const data = await response.json();
                        if (data.url) {
                            const range = productEditor.getSelection() || { index: 0 };
                            productEditor.insertEmbed(range.index, 'image', data.url);
                            setDefaultVideoSizes(productEditor, 'product-description');
                        }
                    } catch (err) {
                        console.error('Помилка завантаження зображення:', err);
                        showNotification('Не вдалося завантажити зображення: ' + err.message);
                    }
                }
            };
        });

        // Додаємо обробник для вставки відео
        toolbar.addHandler('video', () => {
            let url = prompt('Введіть URL відео (наприклад, https://www.youtube.com/watch?v=VIDEO_ID):');
            if (url) {
                const watchRegex = /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=([^\s&]+)/;
                const embedRegex = /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/([^\s]+)/;
                const shortRegex = /^(https?:\/\/)?youtu\.be\/([^\s]+)/;

                let videoId = null;
                if (watchRegex.test(url)) {
                    const match = url.match(watchRegex);
                    videoId = match[3];
                    url = `https://www.youtube.com/embed/${videoId}`;
                } else if (embedRegex.test(url)) {
                    const match = url.match(embedRegex);
                    videoId = match[3];
                    url = `https://www.youtube.com/embed/${videoId}`;
                } else if (shortRegex.test(url)) {
                    const match = url.match(shortRegex);
                    videoId = match[2];
                    url = `https://www.youtube.com/embed/${videoId}`;
                } else {
                    showNotification('Введіть коректний URL для YouTube відео');
                    return;
                }

                const range = productEditor.getSelection() || { index: 0 };
                productEditor.insertEmbed(range.index, 'video', url);
                setDefaultVideoSizes(productEditor, 'product-description');
            }
        });

        // Обробник для оновлення прихованого поля
        productEditor.on('text-change', () => {
            document.getElementById('product-description').value = productEditor.root.innerHTML;
            unsavedChanges = true;
        });

        // Обробник вибору медіа
        productEditor.on('selection-change', (range) => {
            if (range && range.length > 0) {
                const [embed] = productEditor.getContents(range.index, range.length).ops.filter(op => op.insert && (op.insert.image || op.insert.video));
                selectedMedia = embed ? { type: embed.insert.image ? 'image' : 'video', url: embed.insert.image || embed.insert.video } : null;
            } else {
                selectedMedia = null;
            }
        });

        // Обробник кліків для зображень і відео
        productEditor.root.addEventListener('click', (e) => {
            const target = e.target;
            if (target.tagName === 'IMG' || target.tagName === 'IFRAME') {
                openResizeModal(target);
            }
        });

        // Обробник вставки зображень через копіювання/вставку
        productEditor.clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
            if (node.tagName === 'IMG') {
                const src = node.getAttribute('src');
                if (src) {
                    return { ops: [{ insert: { image: src } }] };
                }
            }
            return delta;
        });

        resetInactivityTimer();
    } catch (e) {
        console.error('Помилка ініціалізації редактора продуктів:', e);
        showNotification('Не вдалося ініціалізувати редактор продуктів: ' + e.message);
    }
}

function showSection(sectionId) {
    console.log('Показуємо секцію:', sectionId);
    const sections = document.querySelectorAll('.section');
    sections.forEach(el => el.classList.remove('active'));

    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        console.log(`Секція ${sectionId} показана, classList:`, section.classList.toString());
        if (sectionId === 'admin-panel' && typeof renderAdmin === 'function') {
            const currentTab = localStorage.getItem('currentAdminTab') || 'site-editing';
            renderAdmin(currentTab);
            console.log('Викликано renderAdmin для вкладки:', currentTab);
        }
    } else {
        console.error('Секція не знайдена:', sectionId);
        console.log('Доступні секції:', Array.from(sections).map(el => el.id));
    }
}

session = { isActive: false, timestamp: 0 };

async function login() {
    const username = document.getElementById('admin-username')?.value?.trim();
    const password = document.getElementById('admin-password')?.value;

    if (!username || !password) {
        showNotification('Введіть ім’я користувача та пароль!');
        return;
    }

    console.log('Спроба входу:', { username, passwordLength: password.length });

    try {
        // Отримуємо CSRF-токен
        console.log('Отримуємо CSRF-токен...');
        const csrfResponse = await fetch('https://mebli.onrender.com/api/csrf-token', {
            method: 'GET',
            credentials: 'include'
        });

        console.log('Статус CSRF-запиту:', csrfResponse.status);
        if (!csrfResponse.ok) {
            const csrfText = await csrfResponse.text();
            throw new Error(`Не вдалося отримати CSRF-токен: ${csrfResponse.status} ${csrfText}`);
        }

        let csrfData;
        try {
            csrfData = await csrfResponse.json();
        } catch (jsonError) {
            throw new Error('Некоректна відповідь CSRF-запиту: не вдалося розпарсити JSON');
        }

        const csrfToken = csrfData.csrfToken;
        if (!csrfToken) {
            throw new Error('CSRF-токен не отримано від сервера');
        }
        console.log('Отримано CSRF-токен:', csrfToken);
        localStorage.setItem('csrfToken', csrfToken);

        // Відправляємо запит на логін
        console.log('Відправляємо запит на логін:', { username });
        const response = await fetch('https://mebli.onrender.com/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });

        console.log('Статус відповіді:', response.status);
        if (!response.ok) {
            const responseText = await response.text();
            try {
                const errorData = JSON.parse(responseText);
                showNotification(`Помилка входу: ${errorData.error || response.statusText}`);
                return;
            } catch (jsonError) {
                showNotification(`Помилка входу: ${response.status} ${responseText}`);
                return;
            }
        }

        let data;
        try {
            data = await response.json();
        } catch (jsonError) {
            throw new Error('Некоректна відповідь сервера: не вдалося розпарсити JSON');
        }

        console.log('Отримано дані:', data);

        if (!data.token) {
            throw new Error('Токен не отримано від сервера');
        }

        localStorage.setItem('adminToken', data.token);
        session = { isActive: true, timestamp: Date.now() };
        localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
        showSection('admin-panel');
        await initializeData();
        connectAdminWebSocket();
        startTokenRefreshTimer(); // Додаємо виклик
        setTimeout(() => {
            if (!socket || socket.readyState !== WebSocket.OPEN) {
                console.warn('WebSocket не підключено після входу');
                showNotification('Не вдалося підключити WebSocket. Деякі функції можуть бути недоступні.');
            }
        }, 3000);
        showNotification('Вхід виконано!');
        resetInactivityTimer();
    } catch (e) {
        console.error('Помилка входу:', e);
        showNotification('Помилка входу: ' + e.message);
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    localStorage.removeItem('csrfToken'); // Очищаємо CSRF-токен
    session = { isActive: false, timestamp: 0 };
    localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, 'User logged out');
    }
    socket = null; // Очищаємо socket
    showSection('admin-login');
    showNotification('Ви вийшли з системи');
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Ініціалізація елементів форми
        const usernameInput = document.getElementById('admin-username');
        const passwordInput = document.getElementById('admin-password');
        const loginBtn = document.getElementById('login-btn');

        if (usernameInput) {
            usernameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && passwordInput) {
                    passwordInput.focus();
                }
            });
        } else {
            console.warn('Елемент #admin-username не знайдено');
        }

        if (passwordInput) {
            passwordInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    login();
                }
            });
        } else {
            console.warn('Елемент #admin-password не знайдено');
        }

        if (loginBtn) {
            loginBtn.addEventListener('click', login);
        } else {
            console.warn('Елемент #login-btn не знайдено');
        }

        console.log('Ініціалізація адмін-панелі');
        await checkAuth();
        showSection('admin-panel');
        renderAdmin('site-editing');
        connectAdminWebSocket();
        console.log('Усі дані успішно ініціалізовані');
    } catch (err) {
        console.error('Помилка ініціалізації:', err);
        showNotification('Помилка ініціалізації: ' + err.message);
    }
});

async function refreshToken(attempt = 1) {
    const maxAttempts = 3;
    try {
        const token = localStorage.getItem('adminToken');
        if (!token) {
            console.warn('Токен відсутній.');
            return false;
        }

        const baseUrl = settings.baseUrl || 'https://mebli.onrender.com';
        // Отримуємо CSRF-токен перед оновленням
        const csrfResponse = await fetch(`${baseUrl}/api/csrf-token`, {
            method: 'GET',
            credentials: 'include',
            signal: AbortSignal.timeout(5000) // Тайм-аут 5 секунд
        });

        if (!csrfResponse.ok) {
            throw new Error(`Не вдалося отримати CSRF-токен: ${csrfResponse.statusText}`);
        }

        const csrfData = await csrfResponse.json();
        const csrfToken = csrfData.csrfToken;
        if (!csrfToken) {
            throw new Error('CSRF-токен не отримано');
        }

        const response = await fetch(`${baseUrl}/api/auth/refresh`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include',
            signal: AbortSignal.timeout(5000) // Тайм-аут 5 секунд
        });

        if (!response.ok) {
            if (response.status === 401 || response.status === 403) {
                if (attempt < maxAttempts) {
                    console.log(`Спроба ${attempt} оновлення токена не вдалася, повторюємо...`);
                    await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                    return refreshToken(attempt + 1);
                }
                throw new Error('Не вдалося оновити токен: доступ заборонено.');
            }
            throw new Error(`Помилка оновлення токена: ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.token) {
            throw new Error('Токен не отримано у відповіді API');
        }

        localStorage.setItem('adminToken', data.token);
        localStorage.setItem('csrfToken', csrfToken); // Зберігаємо CSRF-токен
        session = { isActive: true, timestamp: Date.now() };
        localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
        console.log('Токен успішно оновлено:', { token: data.token, csrfToken });
        return true;
    } catch (err) {
        console.error(`Помилка оновлення токена (спроба ${attempt}):`, err);
        if (attempt >= maxAttempts) {
            localStorage.removeItem('adminToken');
            session = { isActive: false, timestamp: 0 };
            localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
            showSection('admin-login');
            showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
        }
        return false;
    }
}

function startTokenRefreshTimer() {
    setInterval(async () => {
        if (session.isActive) {
            await refreshToken();
        }
    }, 25 * 60 * 1000); // 25 хвилин
}

function showNotification(message) {
    const notification = document.getElementById('notification');
    if (notification) {
        // Очищаємо попередній тайм-аут
        if (window.notificationTimeout) {
            clearTimeout(window.notificationTimeout);
        }
        notification.textContent = message;
        notification.classList.add('active');
        window.notificationTimeout = setTimeout(() => {
            notification.classList.remove('active');
            console.log('Сповіщення приховано:', message);
        }, 5000);
        console.log('Сповіщення показано:', message);
    } else {
        console.warn('Елемент #notification не знайдено');
    }
}

function resetInactivityTimer() {
    if (typeof sessionTimeout !== 'number' || sessionTimeout <= 0) {
        console.warn('sessionTimeout не визначений або некоректний:', sessionTimeout);
        return;
    }

    clearTimeout(window.inactivityTimer);
    window.inactivityTimer = setTimeout(() => {
        if (typeof logout === 'function') {
            logout();
            showNotification('Сесію завершено через 30 хвилин бездіяльності');
            console.log('Сесію завершено через неактивність');
        } else {
            console.warn('Функція logout не визначена');
        }
    }, sessionTimeout);
    console.log('Таймер неактивності скинуто, sessionTimeout:', sessionTimeout);
}

function showAdminTab(tab) {
    console.log('Перемикання на вкладку:', tab);
    
    // Перевірка допустимих вкладок
    const validTabs = ['site-editing', 'products', 'orders', 'filters'];
    if (!validTabs.includes(tab)) {
        console.warn('Недопустима вкладка:', tab);
        showNotification(`Вкладка ${tab} не підтримується`);
        return;
    }

    // Оновлення стилів вкладок
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));
    const activeBtn = document.querySelector(`.tab-btn[onclick="showAdminTab('${tab}')"]`);
    if (activeBtn) {
        activeBtn.classList.add('active');
    } else {
        console.warn('Кнопка для вкладки не знайдена:', tab);
    }

    // Зберігаємо активну вкладку
    localStorage.setItem('currentAdminTab', tab);

    // Викликаємо рендеринг
    renderAdmin(tab);
    resetInactivityTimer();
}

async function updateStoreInfo() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const name = document.getElementById('store-name').value;
        const baseUrl = document.getElementById('base-url').value;
        const logoUrl = document.getElementById('logo-url').value;
        const logoFile = document.getElementById('logo-file').files[0];
        const logoWidthInput = document.getElementById('logo-width').value;
        const logoWidth = logoWidthInput ? parseInt(logoWidthInput) || 0 : 0; // Змінено
        const faviconUrl = document.getElementById('favicon-url').value;
        const faviconFile = document.getElementById('favicon-file').files[0];

        const token = localStorage.getItem('adminToken');
        let finalLogoUrl = logoUrl;
        let finalFaviconUrl = faviconUrl;

        // Отримуємо CSRF-токен
        const csrfResponse = await fetch('https://mebli.onrender.com/api/csrf-token', {
            method: 'GET',
            credentials: 'include'
        });
        const csrfData = await csrfResponse.json();
        const csrfToken = csrfData.csrfToken;

        // Завантаження логотипу
        if (logoFile) {
            const validation = validateFile(logoFile);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', logoFile);
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'include',
                body: formData
            });
            if (!response.ok) {
                throw new Error(`Помилка завантаження логотипу: ${response.statusText}`);
            }
            const data = await response.json();
            finalLogoUrl = data.url;
        }

        // Завантаження фавікону
        if (faviconFile) {
            const validation = validateFile(faviconFile);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', faviconFile);
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'X-CSRF-Token': csrfToken
                },
                credentials: 'include',
                body: formData
            });
            if (!response.ok) {
                throw new Error(`Помилка завантаження фавікону: ${response.statusText}`);
            }
            const data = await response.json();
            finalFaviconUrl = data.url;
        }

        const updatedSettings = {
            name: name || settings.name,
            baseUrl: baseUrl || settings.baseUrl,
            logo: finalLogoUrl || settings.logo,
            logoWidth: logoWidth, // Змінено
            favicon: finalFaviconUrl || settings.favicon
        };

        console.log('Надсилаємо налаштування:', updatedSettings);

        const response = await fetchWithAuth('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(updatedSettings)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка оновлення налаштувань: ${errorData.error || response.statusText}`);
        }

        const serverSettings = await response.json();
        settings = { ...settings, ...serverSettings };
        renderSettingsAdmin();
        showNotification('Налаштування магазину оновлено!');
        unsavedChanges = false;
        resetInactivityTimer();

        // Очистка полів файлів
        document.getElementById('logo-file').value = '';
        document.getElementById('favicon-file').value = '';
    } catch (err) {
        console.error('Помилка при оновленні налаштувань:', err);
        showNotification('Помилка оновлення налаштувань: ' + err.message);
    }
}

async function updateContacts() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        settings.contacts.phones = document.getElementById('contact-phones').value;
        settings.contacts.addresses = document.getElementById('contact-addresses').value;
        settings.contacts.schedule = document.getElementById('contact-schedule').value;

        // Оновлюємо поле name замість storeName
        const updatedSettings = {
            ...settings,
            name: settings.storeName || settings.name || '', // Використовуємо name
            contacts: settings.contacts
        };

        // Видаляємо системні поля та storeName
        const { _id, __v, updatedAt, createdAt, storeName, ...cleanedSettings } = updatedSettings;

        console.log('Надсилаємо контакти:', cleanedSettings);

        const token = localStorage.getItem('adminToken');
        const baseUrl = settings.baseUrl || 'https://mebli.onrender.com';
        const response = await fetchWithAuth(`${baseUrl}/api/settings`, {
            method: 'PUT',
            body: JSON.stringify(cleanedSettings)
        });

        showNotification('Контакти оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка при оновленні контактів:', err);
        showNotification('Помилка при оновленні контактів: ' + err.message);
    }
}

    function addSocial() {
        const url = document.getElementById('social-url').value;
        const icon = document.getElementById('social-icon').value;

        if (url) {
            settings.socials.push({ url, icon });
            localStorage.setItem('settings', LZString.compressToUTF16(JSON.stringify(settings)));
            document.getElementById('social-url').value = '';
            renderAdmin();
            showNotification('Соцмережу додано!');
            unsavedChanges = false;
            resetInactivityTimer();
        } else {
            alert('Введіть URL соцмережі!');
        }
    }

    function editSocial(index) {
        const url = prompt('Введіть новий URL соцмережі:', settings.socials[index].url);
        if (url) {
            settings.socials[index].url = url;
            localStorage.setItem('settings', LZString.compressToUTF16(JSON.stringify(settings)));
            renderAdmin();
            showNotification('Соцмережу відредаговано!');
            unsavedChanges = false;
            resetInactivityTimer();
        }
    }

    function deleteSocial(index) {
        if (confirm('Ви впевнені, що хочете видалити цю соцмережу?')) {
            settings.socials.splice(index, 1);
            localStorage.setItem('settings', LZString.compressToUTF16(JSON.stringify(settings)));
            renderAdmin();
            showNotification('Соцмережу видалено!');
            unsavedChanges = false;
            resetInactivityTimer();
        }
    }

    function toggleSocials() {
        settings.showSocials = document.getElementById('social-toggle').checked;
        localStorage.setItem('settings', LZString.compressToUTF16(JSON.stringify(settings)));
        renderAdmin();
        showNotification('Налаштування соцмереж збережено!');
        unsavedChanges = false;
        resetInactivityTimer();
    }

    function formatText(command) {
        const textarea = document.getElementById('about-edit');
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        const selectedText = textarea.value.substring(start, end);
        let newText = '';

        if (command === 'bold') {
            newText = `<b>${selectedText}</b>`;
        } else if (command === 'italic') {
            newText = `<i>${selectedText}</i>`;
        } else if (command === 'underline') {
            newText = `<u>${selectedText}</u>`;
        } else if (command === 'h2') {
            newText = `<h2>${selectedText}</h2>`;
        } else if (command === 'p') {
            newText = `<p>${selectedText}</p>`;
        }

        textarea.value = textarea.value.substring(0, start) + newText + textarea.value.substring(end);
        unsavedChanges = true;
        resetInactivityTimer();
    }

async function updateAbout() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        settings.about = document.getElementById('about-edit').value;

        console.log('Надсилаємо "Про нас":', settings.about);

        const response = await fetchWithAuth('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ about: settings.about })
        });

        const serverSettings = await response.json();
        settings = { ...settings, ...serverSettings };
        renderSettingsAdmin();
        showNotification('Інформацію "Про нас" оновлено!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення "Про нас":', err);
        showNotification('Помилка оновлення "Про нас": ' + err.message);
    }
}

function renderAdmin(section = 'site-editing') {
    console.log('Рендеринг адмін-панелі з activeTab:', section, 'settings:', settings, 'Продукти:', products?.length || 0, 'Замовлення:', orders?.length || 0);

    const content = document.getElementById('admin-content');
    if (!content) {
        console.error('Елемент #admin-content не знайдено');
        showNotification('Помилка: контейнер адмін-панелі не знайдено');
        return;
    }

    // Зберігаємо поточну вкладку
    localStorage.setItem('currentAdminTab', section);

    // Очищаємо вміст
    content.innerHTML = '';

    // Встановлюємо активну вкладку
    const tabs = document.querySelectorAll('.tab-btn');
    tabs.forEach(tab => tab.classList.remove('active'));
    const activeTab = document.querySelector(`.tab-btn[onclick="showAdminTab('${section}')"]`);
    if (activeTab) {
        activeTab.classList.add('active');
    } else {
        console.warn(`Кнопка для вкладки ${section} не знайдена`);
    }

    // Створюємо контейнер для вкладки
    const tabContent = document.createElement('div');
    tabContent.className = `admin-tab ${section} active`;
    tabContent.id = section;
    content.appendChild(tabContent);

    try {
if (section === 'products') {
    tabContent.innerHTML = `
        <div class="admin-section">
            <h3>Товари</h3>
            <div class="product-controls">
                <button onclick="openAddProductModal()">Додати товар</button>
                <select id="cat-list">
                    <option value="">Виберіть категорію</option>
                </select>
                <select id="product-category">
                    <option value="">Виберіть категорію</option>
                    ${categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                </select>
                <select id="product-subcategory">
                    <option value="">Без підкатегорії</option>
                </select>
                <div class="sort-menu">
                    <button class="sort-btn">Сортування ▼</button>
                    <div class="sort-dropdown">
                        <button onclick="sortAdminProducts('id-asc')">ID (зростання)</button>
                        <button onclick="sortAdminProducts('id-desc')">ID (спадання)</button>
                        <button onclick="sortAdminProducts('name-asc')">Назва (А-Я)</button>
                        <button onclick="sortAdminProducts('name-desc')">Назва (Я-А)</button>
                        <button onclick="sortAdminProducts('brand-asc')">Виробник (А-Я)</button>
                        <button onclick="sortAdminProducts('brand-desc')">Виробник (Я-А)</button>
                        <button onclick="sortAdminProducts('price-asc')">Ціна (зростання)</button>
                        <button onclick="sortAdminProducts('price-desc')">Ціна (спадання)</button>
                    </div>
                </div>
                <div class="backup-group">
                    <button onclick="exportPrices()">Експортувати ціни</button>
                    <div class="import-group">
                        <input accept=".txt,.csv" id="bulk-price-file" style="display: none;" type="file"/>
                        <button class="import-btn" onclick="document.getElementById('bulk-price-file').click()">Оновити ціни з файлу</button>
                    </div>
                </div>
            </div>
            <div class="product-admin-item" id="product-list-header">
                <span>№</span>
                <span>Тип</span>
                <span>Назва</span>
                <span>Виробник</span>
                <span>Ціна</span>
                <span>Акційна ціна</span>
                <span>Статус</span>
            </div>
            <div id="product-list"></div>
            <div class="pagination" id="pagination"></div>
        </div>
    `;

    const productList = document.getElementById('product-list');
    if (productList) {
        productList.innerHTML = Array.isArray(products) && products.length > 0
            ? products.map((p, i) => `
                <div class="product-admin-item">
                    <span>${i + 1}</span>
                    <span>${p.type || 'N/A'}</span>
                    <span>${p.name}</span>
                    <span>${p.brand || 'N/A'}</span>
                    <span>${p.price || '0'} грн</span>
                    <span>${p.salePrice || '-'}</span>
                    <span class="status-column">
                        <button class="${p.status === 'В наявності' ? 'edit-btn' : ''}" onclick="updateProductStatus(${i}, 'В наявності')">В наявності</button>
                        <button class="${p.status === 'Немає в наявності' ? 'edit-btn' : ''}" onclick="updateProductStatus(${i}, 'Немає в наявності')">Немає</button>
                        <button class="${p.status === 'Очікується' ? 'edit-btn' : ''}" onclick="updateProductStatus(${i}, 'Очікується')">Очікується</button>
                        <button class="edit-btn" onclick="editProduct(${i})">Редагувати</button>
                        <button class="delete-btn" onclick="deleteProduct(${i})">Видалити</button>
                    </span>
                </div>
            `).join('')
            : '<p>Продукти відсутні</p>';
        console.log('Продукти відрендерено:', products.length);
    }

    const catList = document.getElementById('cat-list');
    if (catList) {
        catList.innerHTML = Array.isArray(categories) && categories.length > 0
            ? `<option value="">Виберіть категорію</option>` + categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('')
            : '<option value="">Категорії відсутні</option>';
        console.log('Категорії відрендерено для #cat-list:', categories.length);
    }

    if (typeof updateSubcategories === 'function') {
        updateSubcategories();
    }

    renderPagination(products.length, 10, 'pagination', currentPage);

        } else if (section === 'categories') {
            tabContent.innerHTML = `
                <div class="admin-section">
                    <h3>Категорії</h3>
                    <div id="category-list-admin"></div>
                </div>
            `;

            const categoryList = document.getElementById('category-list-admin');
            if (categoryList) {
                categoryList.innerHTML = Array.isArray(categories) && categories.length > 0
                    ? categories.map((cat, index) => `
                        <div class="category-item">
                            <span>${cat.name}</span>
                            <button class="move-up" data-index="${index}">↑</button>
                            <button class="move-down" data-index="${index}">↓</button>
                            <button class="edit-btn" onclick="editCategory('${cat._id}')">Редагувати</button>
                            <button class="delete-btn" onclick="deleteCategory('${cat._id}')">Видалити</button>
                            <div class="subcategories">
                                ${Array.isArray(cat.subcategories) && cat.subcategories.length > 0
                                    ? cat.subcategories.map((sub, subIndex) => `
                                        <div class="subcategory-item">
                                            <span>${sub.name}</span>
                                            <button class="move-up" data-cat-id="${cat._id}" data-sub-index="${subIndex}">↑</button>
                                            <button class="move-down" data-cat-id="${cat._id}" data-sub-index="${subIndex}">↓</button>
                                            <button class="edit-btn" onclick="editSubcategory('${cat._id}', '${sub._id}')">Редагувати</button>
                                            <button class="delete-btn" onclick="deleteSubcategory('${cat._id}', '${sub._id}')">Видалити</button>
                                        </div>
                                    `).join('')
                                    : '<p>Підкатегорії відсутні</p>'}
                            </div>
                        </div>
                    `).join('')
                    : '<p>Категорії відсутні</p>';
                console.log('Категорії відрендерено:', categories.length);

                // Делегування подій
                categoryList.removeEventListener('click', handleCategoryClick);
                categoryList.addEventListener('click', handleCategoryClick);

                function handleCategoryClick(event) {
                    const target = event.target;
                    const index = parseInt(target.dataset.index);
                    const catId = target.dataset.catId;
                    const subIndex = parseInt(target.dataset.subIndex);

                    if (target.classList.contains('move-up') && !isNaN(index)) {
                        moveCategoryUp(index);
                    } else if (target.classList.contains('move-down') && !isNaN(index)) {
                        moveCategoryDown(index);
                    } else if (target.classList.contains('move-up') && catId && !isNaN(subIndex)) {
                        moveSubcategoryUp(catId, subIndex);
                    } else if (target.classList.contains('move-down') && catId && !isNaN(subIndex)) {
                        moveSubcategoryDown(catId, subIndex);
                    }
                }
            }

        } else if (section === 'site-editing') {
            console.log('Ініціалізація site-editing');
            tabContent.innerHTML = `
                <div id="site-editing" class="admin-tab active">
                    <div class="admin-section">
                        <h3>Логотип та назва</h3>
                        <form id="store-info-form" onsubmit="event.preventDefault(); updateStoreInfo();">
                            <input id="store-name" placeholder="Назва магазину" type="text"/><br/>
                            <label for="store-name">Назва магазину</label>
                            <input id="base-url" placeholder="Базовий URL (наприклад, https://www.yourdomain.com)" type="text"/><br/>
                            <label for="base-url">Базовий URL сайту</label>
                            <input class="logo-input" id="logo-url" placeholder="URL логотипу" type="text"/><br/>
                            <label for="logo-url">URL логотипу</label>
                            <input accept="image/*" id="logo-file" type="file"/><br/>
                            <label for="logo-file">Завантажте логотип</label>
                            <input id="logo-width" max="500" min="50" placeholder="Ширина логотипу (px)" type="number"/><br/>
                            <label for="logo-width">Ширина логотипу (px)</label>
                            <input id="favicon-url" placeholder="URL favicon" type="text"/><br/>
                            <label for="favicon-url">URL favicon</label>
                            <input accept="image/*" id="favicon-file" type="file"/><br/>
                            <label for="favicon-file">Завантажте favicon</label>
                            <button type="submit">Зберегти</button>
                        </form>
                    </div>
                    <div class="admin-section">
                        <h3>Контакти</h3>
                        <form id="contacts-form" onsubmit="event.preventDefault(); updateContacts();">
                            <textarea id="contact-phones" placeholder="Телефони"></textarea><br/>
                            <label for="contact-phones">Телефони (наприклад, +38 (067) 123-45-67)</label>
                            <textarea id="contact-addresses" placeholder="Адреси"></textarea><br/>
                            <label for="contact-addresses">Адреси (наприклад, м. Київ, вул. Меблева, 1)</label>
                            <textarea id="contact-schedule" placeholder="Графік роботи"></textarea><br/>
                            <label for="contact-schedule">Графік роботи (наприклад, Пн-Пт: 9:00-18:00)</label>
                            <button type="submit">Зберегти</button>
                        </form>
                    </div>
                    <div class="admin-section">
                        <h3>Соціальні мережі</h3>
                        <form id="social-form" onsubmit="event.preventDefault(); addSocial();">
                            <input id="social-url" placeholder="Посилання" type="text"/><br/>
                            <label for="social-url">URL соцмережі</label>
                            <select id="social-icon">
                                <option value="🔗">Загальний (🔗)</option>
                                <option value="📘">Facebook (📘)</option>
                                <option value="📸">Instagram (📸)</option>
                                <option value="🐦">Twitter (🐦)</option>
                                <option value="▶️">YouTube (▶️)</option>
                                <option value="✈️">Telegram (✈️)</option>
                            </select><br/>
                            <label for="social-icon">Іконка соцмережі</label>
                            <button type="submit">Додати</button>
                        </form>
                        <label>
                            <input id="social-toggle" onchange="toggleSocials()" type="checkbox"/>
                            Показувати соціальні мережі
                        </label>
                        <div id="social-list"></div>
                    </div>
                    <div class="admin-section">
                        <h3>Про нас</h3>
                        <form id="about-form" onsubmit="event.preventDefault(); updateAbout();">
                            <div id="about-editor"></div>
                            <input id="about-edit" type="hidden"/>
                            <label for="about-edit">Опис "Про нас"</label>
                            <button type="submit">Зберегти</button>
                        </form>
                    </div>
                    <div class="admin-section">
                        <h3>Категорії</h3>
                        <form id="category-form" onsubmit="event.preventDefault(); addCategory();">
                            <input id="category-name" placeholder="Назва категорії" type="text"><br/>
                            <label for="category-name">Назва категорії</label>
                            <input id="category-slug" placeholder="Шлях категорії (наприклад, kuhni)" type="text"><br/>
                            <label for="category-slug">Шлях категорії</label>
                            <input id="category-photo-url" placeholder="URL картинки (300x200)" type="text"><br/>
                            <label for="category-photo-url">URL зображення</label>
                            <input accept="image/*" id="category-photo-file" type="file"><br/>
                            <label for="category-photo-file">Завантажте зображення</label>
                            <select id="category-visible">
                                <option value="true">Показувати</option>
                                <option value="false">Приховати</option>
                            </select><br/>
                            <label for="category-visible">Видимість</label>
                            <button type="submit">Додати категорію</button>
                        </form>
                        <div id="category-list-admin"></div>
                        <h4>Підкатегорії</h4>
                        <form id="subcategory-form" onsubmit="event.preventDefault(); addSubcategory();">
                            <input id="subcategory-name" placeholder="Назва підкатегорії" type="text"/><br/>
                            <label for="subcategory-name">Назва підкатегорії</label>
                            <input id="subcategory-slug" placeholder="Шлях підкатегорії (наприклад, kuhni-naborom)" type="text"/><br/>
                            <label for="subcategory-slug">Шлях підкатегорії</label>
                            <input id="subcategory-photo-url" placeholder="URL картинки (150x150)" type="text"/><br/>
                            <label for="subcategory-photo-url">URL зображення</label>
                            <input accept="image/*" id="subcategory-photo-file" type="file"/><br/>
                            <label for="subcategory-photo-file">Завантажте зображення</label>
                            <select id="subcategory-category">
                                <option value="">Виберіть категорію</option>
                            </select><br/>
                            <label for="subcategory-category">Категорія для підкатегорії</label>
                            <select id="subcategory-visible">
                                <option value="true">Показувати</option>
                                <option value="false">Приховати</option>
                            </select><br/>
                            <label for="subcategory-visible">Видимість</label>
                            <button type="submit">Додати підкатегорію</button>
                        </form>
                    </div>
                    <div class="admin-section">
                        <h3>Налаштування категорій</h3>
                        <form id="category-settings-form" onsubmit="event.preventDefault(); updateCategorySettings();">
                            <input id="category-width" max="500" min="100" placeholder="Ширина категорії (px, 100-500)" type="number"/><br/>
                            <label for="category-width">Ширина категорії (px)</label>
                            <input id="category-height" max="500" min="100" placeholder="Висота категорії (px, 100-500)" type="number"/><br/>
                            <label for="category-height">Висота категорії (px)</label>
                            <button type="submit">Зберегти налаштування</button>
                        </form>
                    </div>
                    <div class="admin-section">
                        <h3>Налаштування товарів</h3>
                        <form id="product-settings-form" onsubmit="event.preventDefault(); updateProductSettings();">
                            <input id="product-width" max="500" min="200" placeholder="Ширина товару (px, 200-500)" type="number"/><br/>
                            <label for="product-width">Ширина товару (px)</label>
                            <input id="product-height" max="500" min="200" placeholder="Висота товару (px, 200-500)" type="number"/><br/>
                            <label for="product-height">Висота товару (px)</label>
                            <button type="submit">Зберегти налаштування</button>
                        </form>
                    </div>
                    <div class="admin-section">
                        <h3>Фільтри</h3>
                        <form id="filter-form" onsubmit="event.preventDefault(); addFilter();">
                            <input id="filter-name" placeholder="Назва (англ.)" type="text"/><br/>
                            <label for="filter-name">Назва фільтру (наприклад, brand)</label>
                            <input id="filter-label" placeholder="Підпис" type="text"/><br/>
                            <label for="filter-label">Відображувана назва (наприклад, Виробник)</label>
                            <input id="filter-options" placeholder="Опції (через кому)" type="text"/><br/>
                            <label for="filter-options">Опції (наприклад, Гербор, Matroluxe)</label>
                            <button type="submit">Додати фільтр</button>
                        </form>
                        <div id="filter-list-admin"></div>
                    </div>
                    <div class="admin-section">
                        <h3>Поля замовлення</h3>
                        <form id="order-field-form" onsubmit="event.preventDefault(); addOrderField();">
                            <input id="order-field-name" placeholder="Назва (англ.)" type="text"/><br/>
                            <label for="order-field-name">Назва поля (наприклад, name)</label>
                            <input id="order-field-label" placeholder="Підпис" type="text"/><br/>
                            <label for="order-field-label">Відображувана назва (наприклад, Ім'я)</label>
                            <select id="order-field-type">
                                <option value="text">Текст</option>
                                <option value="email">Email</option>
                                <option value="select">Вибір</option>
                            </select><br/>
                            <label for="order-field-type">Тип поля</label>
                            <input id="order-field-options" placeholder="Опції (через кому, для select)" type="text"/><br/>
                            <label for="order-field-options">Опції для вибору (наприклад, Готівкою, Карткою)</label>
                            <button type="submit">Додати поле</button>
                        </form>
                        <div id="order-field-list"></div>
                    </div>
                    <div class="admin-section">
                        <h3>Слайдшоу</h3>
                        <form id="slideshow-settings-form" onsubmit="event.preventDefault(); updateSlideshowSettings();">
                            <input id="slide-width" max="100" min="10" placeholder="Ширина слайду (%, 10-100)" type="number"/><br/>
                            <label for="slide-width">Ширина слайду (%)</label>
                            <input id="slide-height" max="500" min="100" placeholder="Висота слайду (px, 100-500)" type="number"/><br/>
                            <label for="slide-height">Висота слайду (px)</label>
                            <input id="slide-interval" placeholder="Інтервал (мс)" type="number"/><br/>
                            <label for="slide-interval">Інтервал слайдів (мс)</label>
                            <button type="submit">Зберегти налаштування</button>
                        </form>
                        <form id="slide-form" onsubmit="event.preventDefault(); addSlide();">
                            <input id="slide-img-url" placeholder="URL картинки" type="text"/><br/>
                            <label for="slide-img-url">URL зображення слайду</label>
                            <input accept="image/*" id="slide-img-file" type="file"/><br/>
                            <label for="slide-img-file">Завантажте зображення</label>
                            <input id="slide-title" placeholder="Заголовок слайду" type="text"/><br/>
                            <label for="slide-title">Заголовок слайду</label>
                            <input id="slide-text" placeholder="Текст слайду" type="text"/><br/>
                            <label for="slide-text">Текст слайду</label>
                            <input id="slide-link" placeholder="Посилання" type="text"/><br/>
                            <label for="slide-link">Посилання слайду</label>
                            <input id="slide-link-text" placeholder="Текст посилання" type="text"/><br/>
                            <label for="slide-link-text">Текст посилання</label>
                            <input id="slide-order" placeholder="Порядковий номер" type="number"/><br/>
                            <label for="slide-order">Порядок слайду</label>
                            <button type="submit">Додати слайд</button>
                        </form>
                        <label>
                            <input id="slide-toggle" onchange="toggleSlideshow()" type="checkbox"/>
                            Показати слайдшоу
                        </label>
                        <div id="slides-list-admin"></div>
                    </div>
                    <div class="admin-section">
                        <h3>Бекап</h3>
                        <div class="backup-group">
                            <button onclick="exportSiteBackup()">Експортувати (Сайт)</button>
                            <div class="import-group">
                                <input accept=".json" id="import-site-file" style="display: none;" type="file"/>
                                <button class="import-btn" onclick="document.getElementById('import-site-file').click()">Імпортувати файл (Сайт)</button>
                            </div>
                        </div>
                        <div class="backup-group">
                            <button onclick="exportProductsBackup()">Експортувати (Товари)</button>
                            <div class="import-group">
                                <input accept=".json" id="import-products-file" style="display: none;" type="file"/>
                                <button class="import-btn" onclick="document.getElementById('import-products-file').click()">Імпортувати файл (Товари)</button>
                            </div>
                        </div>
                        <div class="backup-group">
                            <button onclick="exportOrdersBackup()">Експортувати (Замовлення)</button>
                            <div class="import-group">
                                <input accept=".json" id="import-orders-file" style="display: none;" type="file"/>
                                <button class="import-btn" onclick="document.getElementById('import-orders-file').click()">Імпортувати файл (Замовлення)</button>
                            </div>
                        </div>
                        <div class="backup-group">
                            <button onclick="downloadSitemap()">Завантажити Sitemap</button>
                        </div>
                    </div>
                </div>
            `;

            // Використовуємо setTimeout для забезпечення оновлення DOM перед викликом залежних функцій
            setTimeout(() => {
                // Ініціалізація залежних компонентів
                if (typeof renderSettingsAdmin === 'function' && document.getElementById('store-name')) {
                    renderSettingsAdmin();
                    console.log('Викликано renderSettingsAdmin');
                }
                if (typeof renderSlidesAdmin === 'function' && document.getElementById('slides-list-admin')) {
                    renderSlidesAdmin();
                    console.log('Викликано renderSlidesAdmin');
                } else {
                    console.warn('renderSlidesAdmin не викликано: slides-list-admin не знайдено або функція відсутня');
                }
                const aboutEditor = document.getElementById('about-editor');
                if (aboutEditor && typeof initializeEditors === 'function') {
                    initializeEditors();
                    console.log('Викликано initializeEditors');
                } else {
                    console.warn('Елемент #about-editor не знайдено, відкладено ініціалізацію редактора');
                }
                // Додаткові ініціалізації для інших секцій, якщо потрібно
                if (document.getElementById('social-list') && typeof renderSocials === 'function') {
                    renderSocials();
                    console.log('Викликано renderSocials');
                }
                if (document.getElementById('category-list-admin') && typeof renderCategoriesAdmin === 'function') {
                    renderCategoriesAdmin();
                    console.log('Викликано renderCategoriesAdmin');
                }
                if (document.getElementById('filter-list-admin') && typeof renderFiltersAdmin === 'function') {
                    renderFiltersAdmin();
                    console.log('Викликано renderFiltersAdmin');
                }
                if (document.getElementById('order-field-list') && typeof renderOrderFields === 'function') {
                    renderOrderFields();
                    console.log('Викликано renderOrderFields');
                }
            }, 0);

        } else if (section === 'orders') {
            tabContent.innerHTML = `
                <div class="admin-section orders-section">
                    <h3>Замовлення</h3>
                    <div class="sort-menu">
                        <button class="sort-btn">Сортування ▼</button>
                        <div class="sort-dropdown">
                            <button onclick="sortOrders('date-desc')">Дата (новіші)</button>
                            <button onclick="sortOrders('date-asc')">Дата (старіші)</button>
                            <button onclick="sortOrders('total-desc')">Сума (спадання)</button>
                            <button onclick="sortOrders('total-asc')">Сума (зростання)</button>
                            <button onclick="sortOrders('status-asc')">Статус (А-Я)</button>
                            <button onclick="sortOrders('status-desc')">Статус (Я-А)</button>
                        </div>
                    </div>
                    <div class="filter-options">
                        <label>Фільтр за статусом:</label>
                        <select id="order-status-filter" onchange="filterOrders()">
                            <option value="">Усі статуси</option>
                            <option value="Нове замовлення">Нове замовлення</option>
                            <option value="В обробці">В обробці</option>
                            <option value="Відправлено">Відправлено</option>
                            <option value="Завершено">Завершено</option>
                        </select>
                    </div>
                    <div id="order-list"></div>
                    <div class="pagination" id="order-pagination"></div>
                </div>
            `;

            const orderList = document.getElementById('order-list');
            if (orderList) {
                orderList.innerHTML = Array.isArray(orders) && orders.length > 0
                    ? orders.map((order, i) => `
                        <div class="order-item">
                            <span>Замовлення #${order.id || i + 1}</span>
                            <span>${new Date(order.date).toLocaleString()}</span>
                            <span>${order.total || 0} грн</span>
                            <button class="edit-btn" onclick="viewOrder(${i})">Переглянути</button>
                        </div>
                    `).join('')
                    : '<p>Замовлення відсутні</p>';
                console.log('Замовлення відрендерено:', orders.length);
            }

            renderPagination(orders.length, 10, 'order-pagination', currentPage);

        } else if (section === 'filters') {
            tabContent.innerHTML = `
                <div class="admin-section">
                    <h3>Фільтри</h3>
                    <div id="filter-list"></div>
                </div>
            `;

            const filterList = document.getElementById('filter-list');
            if (filterList) {
                filterList.innerHTML = Array.isArray(filters) && filters.length > 0
                    ? filters.map(f => `
                        <div class="filter-item">
                            <span>${f.label || f.name}</span>
                            <button class="edit-btn" onclick="editFilter('${f.name}')">Редагувати</button>
                            <button class="delete-btn" onclick="deleteFilter('${f.name}')">Видалити</button>
                        </div>
                    `).join('')
                    : '<p>Фільтри відсутні</p>';
                console.log('Фільтри відрендерено:', filters.length);
            }
        } else {
            console.warn('Невідома секція:', section);
            tabContent.innerHTML = '<p>Секція не підтримується</p>';
        }

        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка рендерингу адмін-панелі:', err);
        showNotification('Помилка рендерингу: ' + err.message);
    }
}

function renderCategoriesAdmin() {
    const categoryList = document.getElementById('category-list-admin');
    if (!categoryList) {
        console.error('Елемент #category-list-admin не знайдено');
        return;
    }

    categoryList.innerHTML = categories && Array.isArray(categories) && categories.length > 0
        ? categories.map((category, index) => `
            <div class="category-item">
                <div class="category-order-controls">
                    <button class="move-btn move-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
                    <button class="move-btn move-down" data-index="${index}" ${index === categories.length - 1 ? 'disabled' : ''}>↓</button>
                </div>
                ${category.photo ? `<img src="${category.photo}" alt="${category.name}" class="category-photo">` : ''}
                <div class="category-details">
                    <strong>${category.name}</strong> (Шлях: ${category.slug}, ${category.visible ? 'Показується' : 'Приховано'})
                    <div class="category-actions">
                        <button class="edit-btn" data-id="${category._id}">Редагувати</button>
                        <button class="delete-btn" data-id="${category._id}">Видалити</button>
                    </div>
                </div>
                <div class="subcategories">
                    ${category.subcategories && Array.isArray(category.subcategories) && category.subcategories.length > 0
                        ? category.subcategories.map((sub, subIndex) => `
                            <div class="subcategory-item">
                                <div class="subcategory-order-controls">
                                    <button class="move-btn sub-move-up" data-cat-id="${category._id}" data-sub-index="${subIndex}" ${subIndex === 0 ? 'disabled' : ''}>↑</button>
                                    <button class="move-btn sub-move-down" data-cat-id="${category._id}" data-sub-index="${subIndex}" ${subIndex === category.subcategories.length - 1 ? 'disabled' : ''}>↓</button>
                                </div>
                                ${sub.photo ? `<img src="${sub.photo}" alt="${sub.name}" class="subcategory-photo">` : ''}
                                <div class="subcategory-details">
                                    ${sub.name} (Шлях: ${sub.slug}, ${sub.visible ? 'Показується' : 'Приховано'})
                                    <div class="subcategory-actions">
                                        <button class="sub-edit" data-cat-id="${category._id}" data-sub-id="${sub._id}">Редагувати</button>
                                        <button class="sub-delete" data-cat-id="${category._id}" data-sub-id="${sub._id}">Видалити</button>
                                    </div>
                                </div>
                            </div>
                        `).join('')
                        : '<p>Підкатегорії відсутні</p>'}
                </div>
            </div>
        `).join('')
        : '<p>Категорії відсутні</p>';

    // Видаляємо попередні слухачі подій
    categoryList.removeEventListener('click', handleCategoryClick);
    // Додаємо нові слухачі подій
    categoryList.addEventListener('click', handleCategoryClick);

    function handleCategoryClick(event) {
        const target = event.target;
        if (target.classList.contains('move-up')) {
            const index = parseInt(target.dataset.index);
            moveCategoryUp(index);
        } else if (target.classList.contains('move-down')) {
            const index = parseInt(target.dataset.index);
            moveCategoryDown(index);
        } else if (target.classList.contains('edit-btn')) {
            const id = target.dataset.id;
            openEditCategoryModal(id);
        } else if (target.classList.contains('delete-btn')) {
            const id = target.dataset.id;
            deleteCategory(id);
        } else if (target.classList.contains('sub-move-up')) {
            const catId = target.dataset.catId;
            const subIndex = parseInt(target.dataset.subIndex);
            moveSubcategoryUp(catId, subIndex);
        } else if (target.classList.contains('sub-move-down')) {
            const catId = target.dataset.catId;
            const subIndex = parseInt(target.dataset.subIndex);
            moveSubcategoryDown(catId, subIndex);
        } else if (target.classList.contains('sub-edit')) {
            const catId = target.dataset.catId;
            const subId = target.dataset.subId;
            openEditSubcategoryModal(catId, subId);
        } else if (target.classList.contains('sub-delete')) {
            const catId = target.dataset.catId;
            const subId = target.dataset.subId;
            deleteSubcategory(catId, subId);
        }
    }

    // Оновлюємо випадаючі списки
    const subcatSelect = document.getElementById('subcategory-category');
    if (subcatSelect) {
        const currentValue = subcatSelect.value;
        subcatSelect.innerHTML = '<option value="">Виберіть категорію</option>' +
            (categories && Array.isArray(categories)
                ? categories.map(c => `<option value="${c._id}">${c.name}</option>`).join('')
                : '');
        subcatSelect.value = currentValue || '';
    }

    const productCatSelect = document.getElementById('product-category');
    if (productCatSelect) {
        const currentValue = productCatSelect.value;
        productCatSelect.innerHTML = '<option value="">Без категорії</option>' +
            (categories && Array.isArray(categories)
                ? categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('')
                : '');
        productCatSelect.value = currentValue || '';
        if (typeof updateSubcategories === 'function') {
            updateSubcategories();
        }
    }

    resetInactivityTimer();
}

function renderSocialsAdmin() {
    const socialList = document.getElementById('social-list');
    if (!socialList) {
        console.warn('Елемент #social-list не знайдено');
        return;
    }

    socialList.innerHTML = settings.socials && Array.isArray(settings.socials) && settings.socials.length > 0
        ? settings.socials.map((social, index) => `
            <div class="social-item">
                <span class="social-icon">${social.icon || '🔗'}</span>
                <span>${social.url}</span>
                <button class="delete-btn" data-index="${index}">Видалити</button>
            </div>
        `).join('')
        : '<p>Соціальні мережі відсутні</p>';

    socialList.removeEventListener('click', handleSocialClick);
    socialList.addEventListener('click', handleSocialClick);

    function handleSocialClick(event) {
        const target = event.target;
        if (target.classList.contains('delete-btn')) {
            const index = parseInt(target.dataset.index);
            deleteSocial(index);
        }
    }
}

async function deleteCategory(categoryId) {
    console.log('Спроба видалити категорію з ID:', categoryId);
    if (!confirm('Ви впевнені, що хочете видалити цю категорію? Усі товари в цій категорії втратять прив’язку до неї.')) {
        return;
    }

    try {
        const category = categories.find(c => c._id === categoryId);
        if (!category) {
            showNotification('Категорія не знайдена!');
            return;
        }

        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const response = await fetchWithAuth(`/api/categories/${encodeURIComponent(category.slug)}`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-Token': localStorage.getItem('csrfToken') // Додаємо CSRF-токен
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка: ${response.status} ${JSON.stringify(errorData)}`);
        }

        categories = categories.filter(c => c._id !== categoryId);
        renderCategoriesAdmin();
        renderAdmin('products');
        showNotification('Категорію видалено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка видалення категорії:', err);
        showNotification('Не вдалося видалити категорію: ' + err.message);
    }
}

function renderSettingsAdmin() {
    console.log('Викликано renderSettingsAdmin');
    if (!document.getElementById('store-name')) {
        console.warn('Елемент #store-name не знайдено, пропускаємо рендеринг налаштувань');
        return;
    }

    try {
        const fields = [
            { id: 'store-name', value: settings.name || '' },
            { id: 'base-url', value: settings.baseUrl || '' },
            { id: 'logo-url', value: settings.logo || '' },
            { id: 'logo-width', value: settings.logoWidth || 150 },
            { id: 'favicon-url', value: settings.favicon || '' },
            { id: 'contact-phones', value: settings.contacts?.phones || '' },
            { id: 'contact-addresses', value: settings.contacts?.addresses || '' },
            { id: 'contact-schedule', value: settings.contacts?.schedule || '' },
            { id: 'social-toggle', value: settings.showSocials !== false, type: 'checked' },
            { id: 'category-width', value: settings.categoryWidth || 200 },
            { id: 'category-height', value: settings.categoryHeight || 150 },
            { id: 'product-width', value: settings.productWidth || 300 },
            { id: 'product-height', value: settings.productHeight || 280 },
            { id: 'slide-width', value: settings.slideWidth || 100 },
            { id: 'slide-height', value: settings.slideHeight || 300 },
            { id: 'slide-interval', value: settings.slideInterval || 5000 },
            { id: 'slide-toggle', value: settings.showSlides !== false, type: 'checked' },
        ];

        fields.forEach(field => {
            const element = document.getElementById(field.id);
            if (element) {
                if (field.type === 'checked') {
                    element.checked = field.value;
                } else {
                    element.value = field.value;
                }
            } else {
                console.warn(`Елемент #${field.id} не знайдено`);
            }
        });

        if (typeof renderSocialsAdmin === 'function') {
            renderSocialsAdmin();
        } else {
            console.warn('Функція renderSocialsAdmin не визначена');
        }

        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка в renderSettingsAdmin:', err);
        showNotification('Помилка рендерингу налаштувань: ' + err.message);
    }
}

function renderSlidesAdmin() {
    const slidesList = document.getElementById('slides-list-admin');
    if (!slidesList) {
        console.warn('Елемент #slides-list-admin не знайдено');
        return;
    }

    // Оновлюємо лише вміст списку слайдів
    slidesList.innerHTML = slides && Array.isArray(slides) && slides.length > 0
        ? slides.map(s => `
            <div class="slide-item">
                <img src="${s.photo}" style="max-width: 100px;">
                <p>Позиція: ${s.position}, ${s.active ? 'Активний' : 'Неактивний'}</p>
                <button onclick="editSlide('${s._id}')">Редагувати</button>
                <button onclick="deleteSlide('${s._id}')">Видалити</button>
            </div>
        `).join('')
        : '<p>Слайди відсутні</p>';

    // Оновлюємо поля налаштувань слайдів
    const slideWidth = document.getElementById('slide-width');
    const slideHeight = document.getElementById('slide-height');
    const slideInterval = document.getElementById('slide-interval');
    const slideToggle = document.getElementById('slide-toggle');

    if (slideWidth) slideWidth.value = settings.slideWidth || 100;
    if (slideHeight) slideHeight.value = settings.slideHeight || 300;
    if (slideInterval) slideInterval.value = settings.slideInterval || 5000;
    if (slideToggle) slideToggle.checked = settings.showSlides !== false;

    // Призначення обробника для кнопки addSlide
    const slideImgFile = document.getElementById('slide-img-file');
    if (slideImgFile && slideImgFile.parentElement) {
        const addSlideButton = slideImgFile.parentElement.querySelector('button[onclick="addSlide()"]');
        if (addSlideButton) {
            addSlideButton.onclick = debounce(addSlide, 300);
            console.log('Обробник для addSlide призначено');
        } else {
            console.warn('Кнопка з onclick="addSlide()" не знайдена');
        }
    } else {
        console.warn('Елемент #slide-img-file або його parentElement не знайдено');
    }

    resetInactivityTimer();
}

function renderPagination(totalItems, itemsPerPage, containerId, currentPage) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`Елемент #${containerId} не знайдено`);
        return;
    }

    const totalPages = Math.ceil(totalItems / itemsPerPage);
    container.innerHTML = '';
    if (totalPages <= 1) return;

    const section = containerId === 'product-pagination' ? 'products' : 'orders';

    if (currentPage > 1) {
        const prevBtn = document.createElement('button');
        prevBtn.textContent = 'Попередня';
        prevBtn.dataset.action = 'prev';
        container.appendChild(prevBtn);
    }

    for (let i = 1; i <= totalPages; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = i === currentPage ? 'active' : '';
        btn.dataset.page = i;
        container.appendChild(btn);
    }

    if (currentPage < totalPages) {
        const nextBtn = document.createElement('button');
        nextBtn.textContent = 'Наступна';
        nextBtn.dataset.action = 'next';
        container.appendChild(nextBtn);
    }

    container.removeEventListener('click', handlePaginationClick);
    container.addEventListener('click', handlePaginationClick);

    function handlePaginationClick(event) {
        const target = event.target;
        if (target.dataset.action === 'prev') {
            currentPage--;
            renderAdmin(section);
        } else if (target.dataset.action === 'next') {
            currentPage++;
            renderAdmin(section);
        } else if (target.dataset.page) {
            currentPage = parseInt(target.dataset.page);
            renderAdmin(section);
        }
    }
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.remove('active');
        modal.innerHTML = '';
        console.log('Модальне вікно закрито');
    }
    resetInactivityTimer();
}

function validateFile(file) {
    const maxSize = 10 * 1024 * 1024; // 10 МБ
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        return { valid: false, error: 'Непідтримуваний тип файлу!' };
    }
    if (file.size > maxSize) {
        return { valid: false, error: 'Файл занадто великий (максимум 10 МБ)!' };
    }
    return { valid: true };
}

function openEditCategoryModal(categoryId) {
    const category = categories.find(c => c._id === categoryId);
    if (category) {
        const modal = document.getElementById('modal');
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Редагувати категорію #${categoryId}</h3>
                <input type="text" id="category-name" value="${category.name}"><br/>
                <label for="category-name">Назва категорії</label>
                <input type="text" id="category-slug" value="${category.slug || ''}"><br/>
                <label for="category-slug">Шлях категорії</label>
                <input type="text" id="category-photo-url" value="${category.photo || ''}" placeholder="URL фотографії"><br/>
                <label for="category-photo-url">URL фотографії</label>
                <input type="file" id="category-photo-file" accept="image/jpeg,image/png,image/gif,image/webp"><br/>
                <label for="category-photo-file">Завантажте фотографію</label>
                <select id="category-visible">
                    <option value="true" ${category.visible ? 'selected' : ''}>Показувати</option>
                    <option value="false" ${!category.visible ? 'selected' : ''}>Приховати</option>
                </select><br/>
                <label for="category-visible">Видимість</label>
                <div class="modal-actions">
                    <button onclick="saveEditedCategory('${categoryId}')">Зберегти</button>
                    <button onclick="closeModal()">Скасувати</button>
                </div>
            </div>
        `;
        modal.classList.add('active');
        console.log('Модальне вікно для редагування категорії відкрито:', categoryId);
        resetInactivityTimer();
    }
}

function openAddCategoryModal() {
    const modal = document.getElementById('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Додати категорію</h3>
            <input type="text" id="category-name" placeholder="Назва категорії"><br/>
            <label for="category-name">Назва категорії</label>
            <input type="text" id="category-slug" placeholder="Шлях категорії"><br/>
            <label for="category-slug">Шлях категорії</label>
            <input type="text" id="category-photo-url" placeholder="URL фотографії"><br/>
            <label for="category-photo-url">URL фотографії</label>
            <input type="file" id="category-photo-file" accept="image/jpeg,image/png,image/gif,image/webp"><br/>
            <label for="category-photo-file">Завантажте фотографію</label>
            <select id="category-visible">
                <option value="true">Показувати</option>
                <option value="false">Приховати</option>
            </select><br/>
            <label for="category-visible">Видимість</label>
            <div class="modal-actions">
                <button onclick="addCategory()">Зберегти</button>
                <button onclick="closeModal()">Скасувати</button>
            </div>
        </div>
    `;
    modal.classList.add('active');

    // Дебагінг
    setTimeout(() => {
        console.log('Елементи форми після відкриття модального вікна:', {
            nameInput: !!document.getElementById('category-name'),
            slugInput: !!document.getElementById('category-slug'),
            photoUrlInput: !!document.getElementById('category-photo-url'),
            fileInput: !!document.getElementById('category-photo-file'),
            visibleSelect: !!document.getElementById('category-visible')
        });
    }, 0);

    resetInactivityTimer();
}

async function saveAddCategory() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const name = document.getElementById('category-name')?.value.trim();
        const slug = document.getElementById('category-slug')?.value.trim();
        const photoUrl = document.getElementById('category-photo-url')?.value.trim();
        const photoFile = document.getElementById('category-photo-file')?.files[0];

        if (!name || !slug) {
            showNotification('Назва та шлях категорії обов’язкові!');
            return;
        }

        const slugCheck = await fetchWithAuth(`/api/categories?slug=${encodeURIComponent(slug)}`);
        const existingCategories = await slugCheck.json();
        if (existingCategories.some(c => c.slug === slug)) {
            showNotification('Шлях категорії має бути унікальним!');
            return;
        }

        let category = { name, slug, photo: photoUrl || null, subcategories: [] };

        if (photoFile) {
            const validation = validateFile(photoFile);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', photoFile);
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData
            });
            if (!response.ok) {
                throw new Error('Помилка завантаження зображення');
            }
            const data = await response.json();
            category.photo = data.url;
        }

        const response = await fetchWithAuth('/api/categories', {
            method: 'POST',
            body: JSON.stringify(category)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка створення категорії: ${errorData.error || response.statusText}`);
        }

        const newCategory = await response.json();
        categories.push(newCategory);
        closeModal();
        renderCategoriesAdmin();
        showNotification('Категорію додано!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка при додаванні категорії:', err);
        showNotification('Не вдалося додати категорію: ' + err.message);
    }
}

async function saveEditedCategory(categoryId) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const nameInput = document.getElementById('category-name');
        const slugInput = document.getElementById('category-slug');
        const photoUrlInput = document.getElementById('category-photo-url');
        const photoFileInput = document.getElementById('category-photo-file');
        const visibleSelect = document.getElementById('category-visible');

        if (!nameInput || !slugInput || !photoUrlInput || !photoFileInput || !visibleSelect) {
            showNotification('Елементи форми не знайдено.');
            return;
        }

        const name = nameInput.value.trim();
        const slug = slugInput.value.trim();
        let photo = photoUrlInput.value.trim();
        const visible = visibleSelect.value === 'true';

        if (!name || !slug) {
            showNotification('Назва та шлях категорії обов’язкові!');
            return;
        }

        if (!/^[a-z0-9-]+$/.test(slug)) {
            showNotification('Шлях категорії може містити лише малі літери, цифри та дефіси!');
            return;
        }

        if (categories.some(c => c.slug === slug && c._id !== categoryId)) {
            showNotification('Шлях категорії має бути унікальним!');
            return;
        }

        if (photo && !/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/.test(photo)) {
            showNotification('URL фотографії має бути валідним (jpg, jpeg, png, gif, webp)!');
            return;
        }

        if (photoFileInput.files[0]) {
            const file = photoFileInput.files[0];
            const validation = validateFile(file);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
                }
            });
            if (!response.ok) {
                throw new Error('Помилка завантаження зображення');
            }
            const data = await response.json();
            photo = data.url;
        }

        const updatedCategory = {
            name,
            slug,
            photo: photo || '',
            visible
        };

        const response = await fetchWithAuth(`/api/categories/${categoryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(updatedCategory)
        });

        if (!response.ok) {
            throw new Error('Не вдалося оновити категорію');
        }

        const savedCategory = await response.json();
        const index = categories.findIndex(c => c._id === categoryId);
        if (index !== -1) {
            categories[index] = savedCategory;
        }
        console.log('Категорію оновлено:', savedCategory); // Додано логування
        closeModal();
        renderCategoriesAdmin();
        showNotification('Категорію оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка редагування категорії:', err);
        showNotification('Не вдалося оновити категорію: ' + err.message);
    }
}

async function addCategory() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const nameInput = document.getElementById('category-name');
        const slugInput = document.getElementById('category-slug');
        const fileInput = document.getElementById('category-photo-file');
        const photoUrlInput = document.getElementById('category-photo-url');
        const visibleSelect = document.getElementById('category-visible');

        if (!nameInput || !slugInput || !fileInput || !photoUrlInput || !visibleSelect) {
            showNotification('Не вдалося знайти всі необхідні поля форми.');
            console.error('Елементи форми не знайдено:', {
                nameInput: !!nameInput,
                slugInput: !!slugInput,
                fileInput: !!fileInput,
                photoUrlInput: !!photoUrlInput,
                visibleSelect: !!visibleSelect
            });
            return;
        }

        const name = nameInput.value.trim();
        const slug = slugInput.value.trim();
        const visible = visibleSelect.value === 'true';
        const file = fileInput.files[0];
        const photoUrl = photoUrlInput.value.trim();

        // Клієнтська валідація
        if (!name || !slug) {
            showNotification('Введіть назву та шлях категорії!');
            return;
        }

        if (!/^[a-z0-9-]+$/.test(slug)) {
            showNotification('Шлях категорії може містити лише малі літери, цифри та дефіси!');
            return;
        }

        if (photoUrl && !/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/.test(photoUrl)) {
            showNotification('URL фотографії має бути валідним (jpg, jpeg, png, gif, webp)!');
            return;
        }

        // Перевірка унікальності slug
        const slugCheck = await fetchWithAuth(`/api/categories?slug=${encodeURIComponent(slug)}`);
        if (!slugCheck.ok) {
            throw new Error('Помилка перевірки унікальності шляху');
        }
        const existingCategories = await slugCheck.json();
        if (existingCategories.some(c => c.slug === slug)) {
            showNotification('Шлях категорії має бути унікальним!');
            return;
        }

        let photo = '';
        if (file) {
            const validation = validateFile(file);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Помилка завантаження зображення: ${errorData.error || response.statusText}`);
            }
            const data = await response.json();
            photo = data.url;
        } else if (photoUrl) {
            photo = photoUrl;
        }

        const category = {
            name,
            slug,
            photo,
            visible,
            subcategories: [],
            order: categories.length // Автоматично встановлюємо порядок
        };

        console.log('Дані для сервера:', category);

        const response = await fetchWithAuth('/api/categories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken')
            },
            body: JSON.stringify(category)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Помилка сервера:', JSON.stringify(errorData, null, 2));
            throw new Error(`Не вдалося додати категорію: ${errorData.error || response.statusText}`);
        }

        const newCategory = await response.json();
        categories.push(newCategory);
        closeModal();
        renderCategoriesAdmin();
        showNotification('Категорію додано!');
        resetInactivityTimer();

        nameInput.value = '';
        slugInput.value = '';
        photoUrlInput.value = '';
        fileInput.value = '';
        visibleSelect.value = 'true';
    } catch (err) {
        console.error('Помилка при додаванні категорії:', err);
        showNotification('Не вдалося додати категорію: ' + err.message);
    }
}

async function editCategory(categoryId) {
    const nameInput = document.getElementById('category-name');
    if (!nameInput) {
        showNotification('Елемент форми для назви категорії не знайдено. Перевірте HTML.');
        return;
    }

    const name = nameInput.value.trim();
    if (!name) {
        showNotification('Введіть назву категорії!');
        return;
    }

    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const category = categories.find(c => c._id === categoryId);
        if (!category) {
            showNotification('Категорія не знайдена!');
            return;
        }

        const updatedCategory = { ...category, name };
        const response = await fetchWithAuth(`/api/categories/${categoryId}`, {
            method: 'PUT',
            body: JSON.stringify(updatedCategory)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Не вдалося оновити категорію: ${errorData.error || response.statusText}`);
        }

        const updatedCategoryData = await response.json();
        const index = categories.findIndex(c => c._id === categoryId);
        if (index !== -1) {
            categories[index] = updatedCategoryData;
        }
        closeModal();
        renderCategoriesAdmin();
        showNotification('Категорію оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка редагування категорії:', err);
        showNotification('Не вдалося оновити категорію: ' + err.message);
    }
}

async function saveCategoryEdit(categoryId) {
    const nameInput = document.getElementById('cat-name');
    const slugInput = document.getElementById('cat-slug');
    const imgUrlInput = document.getElementById('cat-img-url');
    const imgFileInput = document.getElementById('cat-img-file');

    if (!nameInput || !slugInput || !imgUrlInput || !imgFileInput) {
        console.error('Елементи форми не знайдено:', {
            nameInput: !!nameInput,
            slugInput: !!slugInput,
            imgUrlInput: !!imgUrlInput,
            imgFileInput: !!imgFileInput
        });
        showNotification('Елементи форми для категорії не знайдено. Перевірте HTML.');
        return;
    }

    const name = nameInput.value.trim();
    const slug = slugInput.value.trim();
    let photo = imgUrlInput.value.trim(); // Змінено з img на photo

    if (!name || !slug) {
        showNotification('Назва та шлях категорії обов’язкові!');
        return;
    }

    try {
        if (imgFileInput.files.length > 0) {
            const formData = new FormData();
            formData.append('file', imgFileInput.files[0]);
            const uploadResponse = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData
            });
            const uploadData = await uploadResponse.json();
            photo = uploadData.url; // Змінено з img на photo
        }

        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const response = await fetchWithAuth(`/api/categories/${categoryId}`, {
            method: 'PUT',
            body: JSON.stringify({ name, slug, photo }) // Змінено з img на photo
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка: ${response.status} ${JSON.stringify(errorData)}`);
        }

        const updatedCategory = await response.json();
        const index = categories.findIndex(c => c._id === categoryId);
        if (index !== -1) {
            categories[index] = updatedCategory;
        }
        renderCategoriesAdmin();
        renderAdmin('categories');
        showNotification('Категорію оновлено!');
        closeModal();
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка редагування категорії:', err);
        showNotification('Не вдалося оновити категорію: ' + err.message);
    }
}

async function moveCategoryUp(index) {
    try {
        if (!Array.isArray(categories)) {
            console.error('categories не є масивом:', categories);
            showNotification('Помилка: категорії не завантажено');
            return;
        }

        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        if (index <= 0 || index >= categories.length) {
            console.error('Невалідний індекс:', index);
            return;
        }

        const originalCategories = [...categories];
        [categories[index - 1], categories[index]] = [categories[index], categories[index - 1]];
        console.log('Новий порядок категорій:', categories.map(c => c.name)); // Додано логування

        const categoriesOrder = {
            categories: categories.map((cat, idx) => ({
                _id: cat._id,
                order: idx
            }))
        };

        const response = await fetchWithAuth('/api/categories/order', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(categoriesOrder)
        });

        if (!response.ok) {
            categories = originalCategories;
            throw new Error('Не вдалося оновити порядок категорій');
        }

        renderCategoriesAdmin();
        showNotification('Порядок категорій оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка зміни порядку категорій:', err);
        showNotification('Не вдалося змінити порядок: ' + err.message);
    }
}

async function moveCategoryDown(index) {
    try {
        if (!Array.isArray(categories)) {
            console.error('categories не є масивом:', categories);
            showNotification('Помилка: категорії не завантажено');
            return;
        }

        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        if (index < 0 || index >= categories.length - 1) {
            console.error('Невалідний індекс:', index);
            return;
        }

        const originalCategories = [...categories];
        [categories[index], categories[index + 1]] = [categories[index + 1], categories[index]];
        console.log('Новий порядок категорій:', categories.map(c => c.name)); // Додано логування

        const categoriesOrder = {
            categories: categories.map((cat, idx) => ({
                _id: cat._id,
                order: idx
            }))
        };

        const response = await fetchWithAuth('/api/categories/order', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(categoriesOrder)
        });

        if (!response.ok) {
            categories = originalCategories;
            throw new Error('Не вдалося оновити порядок категорій');
        }

        renderCategoriesAdmin();
        showNotification('Порядок категорій оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка зміни порядку категорій:', err);
        showNotification('Не вдалося змінити порядок: ' + err.message);
    }
}

function openAddSubcategoryModal() {
    const modal = document.getElementById('modal');
    if (!modal) {
        console.error('Модальне вікно не знайдено!');
        showNotification('Модальне вікно не знайдено.');
        return;
    }

    modal.innerHTML = `
        <div class="modal-content">
            <h3>Додати підкатегорію</h3>
            <select id="subcategory-category">
                <option value="">Оберіть категорію</option>
                ${categories.map(c => `<option value="${c._id}">${c.name}</option>`).join('')}
            </select><br/>
            <label for="subcategory-category">Категорія</label>
            <input type="text" id="subcategory-name" placeholder="Назва підкатегорії"><br/>
            <label for="subcategory-name">Назва підкатегорії</label>
            <input type="text" id="subcategory-slug" placeholder="Шлях підкатегорії"><br/>
            <label for="subcategory-slug">Шлях підкатегорії</label>
            <input type="text" id="subcategory-photo-url" placeholder="URL фотографії"><br/>
            <label for="subcategory-photo-url">URL фотографії</label>
            <input type="file" id="subcategory-photo-file" accept="image/jpeg,image/png,image/gif,image/webp"><br/>
            <label for="subcategory-photo-file">Завантажте фотографію</label>
            <select id="subcategory-visible">
                <option value="true">Показувати</option>
                <option value="false">Приховати</option>
            </select><br/>
            <label for="subcategory-visible">Видимість</label>
            <div class="modal-actions">
                <button onclick="addSubcategory()">Зберегти</button>
                <button onclick="closeModal()">Скасувати</button>
            </div>
        </div>
    `;
    modal.classList.add('active');
    console.log('Модальне вікно для додавання підкатегорії відкрито');
    resetInactivityTimer();
}

async function saveEditedSubcategory(categoryId, subcategoryId) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const nameInput = document.getElementById('subcategory-name');
        const slugInput = document.getElementById('subcategory-slug');
        const photoUrlInput = document.getElementById('subcategory-photo-url');
        const photoFileInput = document.getElementById('subcategory-photo-file');
        const visibleSelect = document.getElementById('subcategory-visible');

        if (!nameInput || !slugInput || !photoUrlInput || !photoFileInput || !visibleSelect) {
            console.error('Елементи форми відсутні:', {
                nameInput: !!nameInput,
                slugInput: !!slugInput,
                photoUrlInput: !!photoUrlInput,
                photoFileInput: !!photoFileInput,
                visibleSelect: !!visibleSelect
            });
            showNotification('Елементи форми для редагування підкатегорії не знайдено.');
            return;
        }

        const name = nameInput.value.trim();
        const slug = slugInput.value.trim();
        const visible = visibleSelect.value === 'true';
        let photo = photoUrlInput.value.trim();

        // Валідація
        if (!name || !slug) {
            showNotification('Назва та шлях підкатегорії обов’язкові!');
            return;
        }

        if (!/^[a-z0-9-]+$/.test(slug)) {
            showNotification('Шлях підкатегорії може містити лише малі літери, цифри та дефіси!');
            return;
        }

        const category = categories.find(c => c._id === categoryId);
        if (!category) {
            showNotification('Категорія не знайдена!');
            return;
        }

        // Перевірка унікальності slug у межах категорії
        if (category.subcategories.some(s => s.slug === slug && s._id !== subcategoryId)) {
            showNotification('Шлях підкатегорії має бути унікальним у цій категорії!');
            return;
        }

        // Завантаження фото
        if (photoFileInput.files[0]) {
            const file = photoFileInput.files[0];
            const validation = validateFile(file);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
                }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Помилка завантаження зображення: ${errorData.error || response.statusText}`);
            }
            const data = await response.json();
            photo = data.url;
        }

        const updatedSubcategory = {
            name,
            slug,
            photo: photo || '',
            visible
        };

        console.log('Надсилаємо дані на сервер:', JSON.stringify(updatedSubcategory, null, 2));

        const response = await fetchWithAuth(`/api/categories/${categoryId}/subcategories/${subcategoryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(updatedSubcategory)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Деталі помилки сервера:', JSON.stringify(errorData, null, 2));
            throw new Error(`Не вдалося оновити підкатегорію: ${errorData.error || response.statusText}`);
        }

        const updatedCategory = await response.json();
        const catIndex = categories.findIndex(c => c._id === categoryId);
        if (catIndex !== -1) {
            categories[catIndex] = updatedCategory;
        } else {
            throw new Error('Категорія не знайдена в локальному масиві.');
        }

        closeModal();
        renderCategoriesAdmin();
        showNotification('Підкатегорію оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка при оновленні підкатегорії:', err);
        showNotification('Не вдалося оновити підкатегорію: ' + err.message);
    }
}

async function addSubcategory() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const categorySelect = document.getElementById('subcategory-category');
        const nameInput = document.getElementById('subcategory-name');
        const slugInput = document.getElementById('subcategory-slug');
        const photoUrlInput = document.getElementById('subcategory-photo-url');
        const photoFileInput = document.getElementById('subcategory-photo-file');
        const visibleSelect = document.getElementById('subcategory-visible');

        if (!categorySelect || !nameInput || !slugInput || !photoUrlInput || !photoFileInput || !visibleSelect) {
            console.error('Елементи форми відсутні:', {
                categorySelect: !!categorySelect,
                nameInput: !!nameInput,
                slugInput: !!slugInput,
                photoUrlInput: !!photoUrlInput,
                photoFileInput: !!photoFileInput,
                visibleSelect: !!visibleSelect
            });
            showNotification('Елементи форми для підкатегорії не знайдено.');
            return;
        }

        const categoryId = categorySelect.value;
        const name = nameInput.value.trim();
        const slug = slugInput.value.trim();
        const visible = visibleSelect.value === 'true';
        const photoUrl = photoUrlInput.value.trim();

        console.log('Дані підкатегорії:', { categoryId, name, slug, visible, photoUrl });

        if (!categoryId || !name || !slug) {
            showNotification('Виберіть категорію, введіть назву та шлях підкатегорії!');
            return;
        }

        if (!/^[a-z0-9-]+$/.test(slug)) {
            showNotification('Шлях підкатегорії може містити лише малі літери, цифри та дефіси!');
            return;
        }

        if (photoUrl && !/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/.test(photoUrl)) {
            showNotification('URL фотографії має бути валідним (jpg, jpeg, png, gif, webp)!');
            return;
        }

        const category = categories.find(c => c._id === categoryId);
        if (!category) {
            showNotification('Обрана категорія не знайдена!');
            return;
        }

        // Перевірка унікальності slug у межах категорії
        if (category.subcategories.some(s => s.slug === slug)) {
            showNotification('Шлях підкатегорії має бути унікальним у цій категорії!');
            return;
        }

        let photo = '';
        if (photoFileInput.files[0]) {
            const file = photoFileInput.files[0];
            const validation = validateFile(file);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
                }
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Помилка завантаження зображення: ${errorData.error || response.statusText}`);
            }
            const data = await response.json();
            photo = data.url;
        } else if (photoUrl) {
            photo = photoUrl;
        }

        const newSubcategory = { name, slug, photo, visible };
        console.log('Дані нової підкатегорії:', newSubcategory);

        const response = await fetchWithAuth(`/api/categories/${category._id}/subcategories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(newSubcategory)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Не вдалося додати підкатегорію: ${errorData.error || response.statusText}`);
        }

        const updatedCategory = await response.json();
        const index = categories.findIndex(c => c._id === category._id);
        categories[index] = updatedCategory;
        closeModal();
        renderCategoriesAdmin();
        showNotification('Підкатегорію додано!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка при додаванні підкатегорії:', err);
        showNotification('Не вдалося додати підкатегорію: ' + err.message);
    }
}

function openEditSubcategoryModal(categoryId, subcategoryId) {
    const category = categories.find(c => c._id === categoryId);
    if (!category) {
        showNotification('Категорія не знайдена!');
        return;
    }

    const subcategory = category.subcategories.find(s => s._id === subcategoryId);
    if (!subcategory) {
        showNotification('Підкатегорія не знайдена!');
        return;
    }

    const modal = document.getElementById('modal');
    if (!modal) {
        console.error('Модальне вікно не знайдено!');
        showNotification('Модальне вікно не знайдено.');
        return;
    }

    modal.innerHTML = `
        <div class="modal-content">
            <h3>Редагувати підкатегорію</h3>
            <input type="text" id="subcategory-name" value="${subcategory.name}"><br/>
            <label for="subcategory-name">Назва підкатегорії</label>
            <input type="text" id="subcategory-slug" value="${subcategory.slug}"><br/>
            <label for="subcategory-slug">Шлях підкатегорії</label>
            <input type="text" id="subcategory-photo-url" value="${subcategory.photo || ''}"><br/>
            <label for="subcategory-photo-url">URL фотографії</label>
            <input type="file" id="subcategory-photo-file" accept="image/jpeg,image/png,image/gif,image/webp"><br/>
            <label for="subcategory-photo-file">Завантажте фотографію</label>
            <select id="subcategory-visible">
                <option value="true" ${subcategory.visible ? 'selected' : ''}>Показувати</option>
                <option value="false" ${!subcategory.visible ? 'selected' : ''}>Приховати</option>
            </select><br/>
            <label for="subcategory-visible">Видимість</label>
            <div class="modal-actions">
                <button onclick="saveEditedSubcategory('${categoryId}', '${subcategory._id}')">Зберегти</button>
                <button onclick="closeModal()">Скасувати</button>
            </div>
        </div>
    `;
    modal.classList.add('active');
    console.log('Модальне вікно для редагування підкатегорії відкрито:', { categoryId, subcategoryId });
    resetInactivityTimer();
}

async function saveSubcategoryEdit(categoryId, subcategoryId) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const nameInput = document.getElementById('subcategory-name');
        const slugInput = document.getElementById('subcategory-slug');
        const photoUrlInput = document.getElementById('subcategory-photo-url');
        const photoFileInput = document.getElementById('subcategory-photo-file');
        const visibleSelect = document.getElementById('subcategory-visible');

        if (!nameInput || !slugInput || !photoUrlInput || !photoFileInput || !visibleSelect) {
            showNotification('Елементи форми не знайдено.');
            return;
        }

        const name = nameInput.value.trim();
        const slug = slugInput.value.trim();
        let photo = photoUrlInput.value.trim();
        const visible = visibleSelect.value === 'true';

        if (!name || !slug) {
            showNotification('Назва та шлях підкатегорії обов’язкові!');
            return;
        }

        if (!/^[a-z0-9-]+$/.test(slug)) {
            showNotification('Шлях підкатегорії може містити лише малі літери, цифри та дефіси!');
            return;
        }

        const category = categories.find(c => c._id === categoryId);
        if (!category) {
            showNotification('Категорія не знайдена!');
            return;
        }

        if (category.subcategories.some(s => s.slug === slug && s._id !== subcategoryId)) {
            showNotification('Шлях підкатегорії має бути унікальним у цій категорії!');
            return;
        }

        if (photo && !/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/.test(photo)) {
            showNotification('URL фотографії має бути валідним (jpg, jpeg, png, gif, webp)!');
            return;
        }

        if (photoFileInput.files[0]) {
            const file = photoFileInput.files[0];
            const validation = validateFile(file);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
                }
            });
            if (!response.ok) {
                throw new Error('Помилка завантаження зображення');
            }
            const data = await response.json();
            photo = data.url;
        }

        const updatedSubcategory = {
            _id: subcategoryId,
            name,
            slug,
            photo: photo || '',
            visible
        };

        const response = await fetchWithAuth(`/api/categories/${categoryId}/subcategories/${subcategoryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(updatedSubcategory)
        });

        if (!response.ok) {
            throw new Error('Не вдалося оновити підкатегорію');
        }

        const updatedCategory = await response.json();
        const index = categories.findIndex(c => c._id === categoryId);
        if (index !== -1) {
            categories[index] = updatedCategory;
        }
        console.log('Підкатегорію оновлено:', updatedSubcategory); // Додано логування
        closeModal();
        renderCategoriesAdmin();
        showNotification('Підкатегорію оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка редагування підкатегорії:', err);
        showNotification('Не вдалося оновити підкатегорію: ' + err.message);
    }
}

async function deleteSubcategory(categoryId, subcatName) {
    if (!confirm('Ви впевнені, що хочете видалити цю підкатегорію? Усі товари в цій підкатегорії втратять прив’язку до неї.')) {
        return;
    }

    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const category = categories.find(c => c._id === categoryId);
        if (!category) {
            showNotification('Категорія не знайдена!');
            return;
        }

        const subcategory = category.subcategories.find(s => s.name === subcatName);
        if (!subcategory) {
            showNotification('Підкатегорія не знайдена!');
            return;
        }

        category.subcategories = category.subcategories.filter(s => s.name !== subcatName);

        const response = await fetchWithAuth(`/api/categories/${categoryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken')
            },
            body: JSON.stringify(category)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Не вдалося видалити підкатегорію: ${errorData.error || response.statusText}`);
        }

        const updatedCategory = await response.json();
        const index = categories.findIndex(c => c._id === categoryId);
        categories[index] = updatedCategory;

        products.forEach(p => {
            if (p.subcategory === subcatName && p.category === category.name) {
                p.subcategory = '';
            }
        });

        renderCategoriesAdmin();
        renderAdmin('products');
        showNotification('Підкатегорію видалено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка видалення підкатегорії:', err);
        showNotification('Не вдалося видалити підкатегорію: ' + err.message);
    }
}


async function moveSubcategoryUp(categoryId, index) {
    try {
        if (!Array.isArray(categories)) {
            console.error('categories не є масивом:', categories);
            showNotification('Помилка: категорії не завантажено');
            return;
        }

        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const category = categories.find(c => c._id === categoryId);
        if (!category || !Array.isArray(category.subcategories) || index <= 0 || index >= category.subcategories.length) {
            console.error('Невалідний індекс або категорія:', { categoryId, index });
            return;
        }

        const originalSubcategories = [...category.subcategories];
        [category.subcategories[index - 1], category.subcategories[index]] = [category.subcategories[index], category.subcategories[index - 1]];
        console.log('Новий порядок підкатегорій:', category.subcategories.map(s => s.name)); // Додано логування

        const subcategoriesOrder = {
            subcategories: category.subcategories.map((subcat, idx) => ({
                _id: subcat._id,
                order: idx
            })).filter(item => item._id && /^[0-9a-fA-F]{24}$/.test(item._id))
        };

        if (subcategoriesOrder.subcategories.length !== category.subcategories.length) {
            category.subcategories = originalSubcategories;
            showNotification('Помилка: не всі підкатегорії мають валідні ID.');
            return;
        }

        const response = await fetchWithAuth(`/api/categories/${categoryId}/subcategories/order`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(subcategoriesOrder)
        });

        if (!response.ok) {
            category.subcategories = originalSubcategories;
            throw new Error('Не вдалося оновити порядок підкатегорій');
        }

        const updatedCategory = await response.json();
        const catIndex = categories.findIndex(c => c._id === categoryId);
        if (catIndex !== -1) {
            categories[catIndex] = updatedCategory;
        }
        console.log('Порядок підкатегорій оновлено:', updatedCategory);
        renderCategoriesAdmin();
        showNotification('Порядок підкатегорій оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка зміни порядку підкатегорій:', err);
        showNotification('Не вдалося змінити порядок: ' + err.message);
    }
}

async function moveSubcategoryDown(categoryId, index) {
    try {
        if (!Array.isArray(categories)) {
            console.error('categories не є масивом:', categories);
            showNotification('Помилка: категорії не завантажено');
            return;
        }

        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const category = categories.find(c => c._id === categoryId);
        if (!category || !Array.isArray(category.subcategories) || index < 0 || index >= category.subcategories.length - 1) {
            console.error('Невалідний індекс або категорія:', { categoryId, index });
            return;
        }

        const originalSubcategories = [...category.subcategories];
        [category.subcategories[index], category.subcategories[index + 1]] = [category.subcategories[index + 1], category.subcategories[index]];
        console.log('Новий порядок підкатегорій:', category.subcategories.map(s => s.name)); // Додано логування

        const subcategoriesOrder = {
            subcategories: category.subcategories.map((subcat, idx) => ({
                _id: subcat._id,
                order: idx
            })).filter(item => item._id && /^[0-9a-fA-F]{24}$/.test(item._id))
        };

        if (subcategoriesOrder.subcategories.length !== category.subcategories.length) {
            category.subcategories = originalSubcategories;
            showNotification('Помилка: не всі підкатегорії мають валідні ID.');
            return;
        }

        const response = await fetchWithAuth(`/api/categories/${categoryId}/subcategories/order`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(subcategoriesOrder)
        });

        if (!response.ok) {
            category.subcategories = originalSubcategories;
            throw new Error('Не вдалося оновити порядок підкатегорій');
        }

        const updatedCategory = await response.json();
        const catIndex = categories.findIndex(c => c._id === categoryId);
        if (catIndex !== -1) {
            categories[catIndex] = updatedCategory;
        }
        console.log('Порядок підкатегорій оновлено:', updatedCategory);
        renderCategoriesAdmin();
        showNotification('Порядок підкатегорій оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка зміни порядку підкатегорій:', err);
        showNotification('Не вдалося змінити порядок: ' + err.message);
    }
}

async function updateCategorySettings() {
    const width = parseInt(document.getElementById('category-width').value) || 300;
    const height = parseInt(document.getElementById('category-height').value) || 200;
    const token = localStorage.getItem('adminToken');

    if (width < 100 || width > 500 || height < 100 || height > 500) {
        alert('Ширина та висота категорії мають бути в межах 100-500 px!');
        return;
    }

    settings.categoryWidth = width;
    settings.categoryHeight = height;

    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: {
                credentials: 'include',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ categoryWidth: width, categoryHeight: height })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Не вдалося оновити налаштування категорій: ${errorData.error}`);
        }

        showNotification('Налаштування категорій оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення налаштувань категорій:', err);
        showNotification(err.message);
    }
}

async function updateProductSettings() {
    const width = parseInt(document.getElementById('product-width').value) || 300;
    const height = parseInt(document.getElementById('product-height').value) || 300;
    const token = localStorage.getItem('adminToken');

    if (width < 200 || width > 500 || height < 200 || height > 500) {
        alert('Ширина та висота товару мають бути в межах 200-500 px!');
        return;
    }

    settings.productWidth = width;
    settings.productHeight = height;

    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: {
                credentials: 'include',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ productWidth: width, productHeight: height })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Не вдалося оновити налаштування товарів: ${errorData.error}`);
        }

        showNotification('Налаштування товарів оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення налаштувань товарів:', err);
        showNotification(err.message);
    }
}

async function loadFilters() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            console.warn('Токен відсутній. Використовуються локальні фільтри.');
            renderAdmin('filters');
            return;
        }

        const token = localStorage.getItem('adminToken');
        const baseUrl = settings.baseUrl || 'https://mebli.onrender.com';
        const response = await fetch(`${baseUrl}/api/filters`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('adminToken');
                session = { isActive: false, timestamp: 0 };
                localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
                showSection('admin-login');
                showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
                return;
            }
            throw new Error(`Не вдалося завантажити фільтри: ${text}`);
        }

        filters = await response.json();
        console.log('Фільтри успішно завантажено:', filters.length); // Додано логування
        renderAdmin('filters');
    } catch (err) {
        console.error('Помилка завантаження фільтрів:', err);
        showNotification('Помилка завантаження фільтрів: ' + err.message);
        renderAdmin('filters'); // Рендеримо локальні дані при помилці
    }
}

async function addFilter() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const labelInput = document.getElementById('filter-label');
        const nameInput = document.getElementById('filter-name');
        const typeSelect = document.getElementById('filter-type');
        const optionsInput = document.getElementById('filter-options');

        if (!labelInput || !nameInput || !typeSelect || !optionsInput) {
            showNotification('Елементи форми для фільтра не знайдено');
            return;
        }

        const label = labelInput.value.trim();
        const name = nameInput.value.trim();
        const type = typeSelect.value;
        const options = optionsInput.value.split(',').map(opt => opt.trim()).filter(opt => opt);

        if (!label || !name || !type || options.length === 0) {
            showNotification('Заповніть усі поля фільтра!');
            return;
        }

        if (filters.some(f => f.name === name)) {
            showNotification('Фільтр з такою назвою вже існує!');
            return;
        }

        const newFilter = { label, name, type, options };
        filters.push(newFilter);
        console.log('Новий фільтр додано локально:', newFilter); // Додано логування

        const response = await fetchWithAuth('/api/filters', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(newFilter)
        });

        if (!response.ok) {
            filters.pop(); // Відкочуємо локальні зміни
            throw new Error('Не вдалося зберегти фільтр на сервері');
        }

        renderAdmin('filters');
        showNotification('Фільтр додано!');
        labelInput.value = '';
        nameInput.value = '';
        typeSelect.value = 'select';
        optionsInput.value = '';
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка додавання фільтру:', err);
        showNotification('Помилка: ' + err.message);
    }
}

    function editFilter(name) {
        const filter = filters.find(f => f.name === name);
        if (filter) {
            const modal = document.getElementById('modal');
            modal.innerHTML = `
                <div class="modal-content">
                    <h3>Редагувати фільтр</h3>
                    <input type="text" id="edit-filter-name" value="${filter.name}" readonly><br/>
                    <label for="edit-filter-name">Назва фільтру</label>
                    <input type="text" id="edit-filter-label" value="${filter.label}"><br/>
                    <label for="edit-filter-label">Відображувана назва</label>
                    <input type="text" id="edit-filter-options" value="${filter.options.join(', ')}"><br/>
                    <label for="edit-filter-options">Опції (через кому)</label>
                    <div class="modal-actions">
                        <button id="save-filter-btn">Зберегти</button>
                        <button id="cancel-filter-btn">Скасувати</button>
                    </div>
                </div>
            `;
            modal.classList.add('active');
            document.getElementById('save-filter-btn').addEventListener('click', () => saveFilterEdit(name));
            document.getElementById('cancel-filter-btn').addEventListener('click', closeModal);
            resetInactivityTimer();
        }
    }

    function saveFilterEdit(name) {
        const filter = filters.find(f => f.name === name);
        if (filter) {
            const newLabel = document.getElementById('edit-filter-label').value;
            const newOptions = document.getElementById('edit-filter-options').value.split(',').map(o => o.trim()).filter(o => o);

            if (newLabel && newOptions.length > 0) {
                filter.label = newLabel;
                filter.options = newOptions;
                localStorage.setItem('filters', LZString.compressToUTF16(JSON.stringify(filters)));
                closeModal();
                renderAdmin();
                showNotification('Фільтр відредаговано!');
                unsavedChanges = false;
                resetInactivityTimer();
            } else {
                alert('Введіть підпис та опції!');
            }
        }
    }

    function deleteFilter(name) {
        if (confirm('Ви впевнені, що хочете видалити цей фільтр?')) {
            filters = filters.filter(f => f.name !== name);
            localStorage.setItem('filters', LZString.compressToUTF16(JSON.stringify(filters)));
            renderAdmin();
            showNotification('Фільтр видалено!');
            unsavedChanges = false;
            resetInactivityTimer();
        }
    }

    function moveFilterUp(index) {
        if (index > 0) {
            [filters[index - 1], filters[index]] = [filters[index], filters[index - 1]];
            localStorage.setItem('filters', LZString.compressToUTF16(JSON.stringify(filters)));
            renderAdmin();
            resetInactivityTimer();
        }
    }

    function moveFilterDown(index) {
        if (index < filters.length - 1) {
            [filters[index], filters[index + 1]] = [filters[index + 1], filters[index]];
            localStorage.setItem('filters', LZString.compressToUTF16(JSON.stringify(filters)));
            renderAdmin();
            resetInactivityTimer();
        }
    }

async function addOrderField() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const nameInput = document.getElementById('order-field-name');
        const labelInput = document.getElementById('order-field-label');
        const typeSelect = document.getElementById('order-field-type');
        const optionsInput = document.getElementById('order-field-options');

        if (!nameInput || !labelInput || !typeSelect || !optionsInput) {
            showNotification('Елементи форми для поля замовлення не знайдено');
            return;
        }

        const name = nameInput.value.trim();
        const label = labelInput.value.trim();
        const type = typeSelect.value;
        const options = optionsInput.value.split(',').map(o => o.trim()).filter(o => o);

        if (!name || !label) {
            showNotification('Введіть назву та підпис для поля!');
            return;
        }

        if (orderFields.some(f => f.name === name)) {
            showNotification('Поле з такою назвою вже існує!');
            return;
        }

        const field = { name, label, type };
        if (type === 'select' && options.length > 0) {
            field.options = options;
        }

        const response = await fetchWithAuth('/api/order-fields', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(field)
        });

        if (!response.ok) {
            throw new Error('Не вдалося додати поле замовлення');
        }

        orderFields.push(field);
        console.log('Нове поле замовлення додано:', field); // Додано логування
        nameInput.value = '';
        labelInput.value = '';
        typeSelect.value = 'text';
        optionsInput.value = '';
        renderAdmin('order-fields');
        showNotification('Поле замовлення додано!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка додавання поля замовлення:', err);
        showNotification('Помилка: ' + err.message);
    }
}

    function editOrderField(name) {
        const field = orderFields.find(f => f.name === name);
        if (field) {
            const modal = document.getElementById('modal');
            modal.innerHTML = `
                <div class="modal-content">
                    <h3>Редагувати поле замовлення</h3>
                    <input type="text" id="edit-order-field-name" value="${field.name}" readonly><br/>
                    <label for="edit-order-field-name">Назва поля</label>
                    <input type="text" id="edit-order-field-label" value="${field.label}"><br/>
                    <label for="edit-order-field-label">Відображувана назва</label>
                    <select id="edit-order-field-type">
                        <option value="text" ${field.type === 'text' ? 'selected' : ''}>Текст</option>
                        <option value="email" ${field.type === 'email' ? 'selected' : ''}>Email</option>
                        <option value="select" ${field.type === 'select' ? 'selected' : ''}>Вибір</option>
                    </select><br/>
                    <label for="edit-order-field-type">Тип поля</label>
                    <input type="text" id="edit-order-field-options" value="${field.options ? field.options.join(', ') : ''}" ${field.type !== 'select' ? 'disabled' : ''}><br/>
                    <label for="edit-order-field-options">Опції (через кому, для select)</label>
                    <div class="modal-actions">
                        <button id="save-order-field-btn">Зберегти</button>
                        <button id="cancel-order-field-btn">Скасувати</button>
                    </div>
                </div>
            `;
            modal.classList.add('active');
            document.getElementById('edit-order-field-type').addEventListener('change', (e) => {
                document.getElementById('edit-order-field-options').disabled = e.target.value !== 'select';
            });
            document.getElementById('save-order-field-btn').addEventListener('click', () => saveOrderFieldEdit(name));
            document.getElementById('cancel-order-field-btn').addEventListener('click', closeModal);
            resetInactivityTimer();
        }
    }

    function saveOrderFieldEdit(name) {
        const field = orderFields.find(f => f.name === name);
        if (field) {
            const newLabel = document.getElementById('edit-order-field-label').value;
            const newType = document.getElementById('edit-order-field-type').value;
            const newOptions = document.getElementById('edit-order-field-options').value.split(',').map(o => o.trim()).filter(o => o);

            if (newLabel) {
                field.label = newLabel;
                field.type = newType;
                if (newType === 'select') {
                    if (newOptions.length > 0) {
                        field.options = newOptions;
                    } else {
                        alert('Введіть опції для типу "Вибір"!');
                        return;
                    }
                } else {
                    delete field.options;
                }
                localStorage.setItem('orderFields', LZString.compressToUTF16(JSON.stringify(orderFields)));
                closeModal();
                renderAdmin();
                showNotification('Поле замовлення відредаговано!');
                unsavedChanges = false;
                resetInactivityTimer();
            } else {
                alert('Введіть відображувану назву!');
            }
        }
    }

    function deleteOrderField(name) {
        if (confirm('Ви впевнені, що хочете видалити це поле?')) {
            orderFields = orderFields.filter(f => f.name !== name);
            localStorage.setItem('orderFields', LZString.compressToUTF16(JSON.stringify(orderFields)));
            renderAdmin();
            showNotification('Поле замовлення видалено!');
            unsavedChanges = false;
            resetInactivityTimer();
        }
    }

async function updateSlideshowSettings() {
    const width = parseInt(document.getElementById('slide-width').value) || 100;
    const height = parseInt(document.getElementById('slide-height').value) || 300;
    const interval = parseInt(document.getElementById('slide-interval').value) || 5000;
    const token = localStorage.getItem('adminToken');

    if (width < 10 || width > 100) {
        alert('Ширина слайду має бути в межах 10-100%!');
        return;
    }
    if (height < 100 || height > 500) {
        alert('Висота слайду має бути в межах 100-500 px!');
        return;
    }
    if (interval < 1000) {
        alert('Інтервал слайдів має бути не менше 1000 мс!');
        return;
    }

    settings.slideWidth = width;
    settings.slideHeight = height;
    settings.slideInterval = interval;

    try {
        const response = await fetch('/api/settings', {
            method: 'PUT',
            headers: {
                credentials: 'include',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ slideWidth: width, slideHeight: height, slideInterval: interval })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Не вдалося оновити налаштування слайдшоу: ${errorData.error}`);
        }

        showNotification('Налаштування слайдшоу оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення налаштувань слайдшоу:', err);
        showNotification(err.message);
    }
}

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

const debouncedRenderAdmin = debounce(renderAdmin, 100);

async function addSlide() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const photoUrlInput = document.getElementById('slide-photo-url');
        const photoFileInput = document.getElementById('slide-photo-file');
        const linkInput = document.getElementById('slide-link');
        const positionInput = document.getElementById('slide-position');
        const activeCheckbox = document.getElementById('slide-active');

        if (!photoUrlInput || !photoFileInput || !positionInput || !activeCheckbox) {
            showNotification('Елементи форми для слайду не знайдено');
            return;
        }

        let photo = photoUrlInput.value.trim();
        const link = linkInput ? linkInput.value.trim() : '';
        const position = parseInt(positionInput.value) || slides.length + 1;
        const active = activeCheckbox.checked;

        if (!photo && !photoFileInput.files[0]) {
            showNotification('Виберіть фото або вкажіть URL!');
            return;
        }

        if (photo && !/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/.test(photo)) {
            showNotification('URL фотографії має бути валідним (jpg, jpeg, png, gif, webp)!');
            return;
        }

        if (photoFileInput.files[0]) {
            const file = photoFileInput.files[0];
            const validation = validateFile(file);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
                }
            });
            if (!response.ok) {
                throw new Error('Помилка завантаження зображення');
            }
            const data = await response.json();
            photo = data.url;
        }

        const newSlide = { photo, link, position, active };
        const response = await fetchWithAuth('/api/slides', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(newSlide)
        });

        if (!response.ok) {
            throw new Error('Не вдалося додати слайд');
        }

        const savedSlide = await response.json();
        slides.push(savedSlide);
        console.log('Новий слайд додано:', savedSlide); // Додано логування
        renderSlidesAdmin();
        showNotification('Слайд додано!');
        photoUrlInput.value = '';
        if (linkInput) linkInput.value = '';
        positionInput.value = '';
        activeCheckbox.checked = true;
        photoFileInput.value = '';
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка додавання слайду:', err);
        showNotification('Помилка: ' + err.message);
    }
}

async function editSlide(slideId) {
    const slide = slides.find(s => s._id === slideId);
    if (!slide) {
        showNotification('Слайд не знайдено!');
        return;
    }

    const modal = document.getElementById('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Редагувати слайд</h3>
            <input type="number" id="edit-slide-position" value="${slide.position}"><br/>
            <label for="edit-slide-position">Позиція</label>
            <input type="text" id="edit-slide-photo-url" value="${slide.photo || ''}"><br/>
            <label for="edit-slide-photo-url">URL зображення</label>
            <input type="file" id="edit-slide-photo-file" accept="image/jpeg,image/png,image/gif,image/webp"><br/>
            <label for="edit-slide-photo-file">Завантажте зображення</label>
            ${slide.photo ? `<img src="${slide.photo}" style="max-width: 100px;">` : ''}
            <input type="text" id="edit-slide-link" value="${slide.link || ''}"><br/>
            <label for="edit-slide-link">Посилання</label>
            <input type="checkbox" id="edit-slide-active" ${slide.active ? 'checked' : ''}><br/>
            <label for="edit-slide-active">Активний</label>
            <div class="modal-actions">
                <button onclick="saveSlideEdit('${slideId}')">Зберегти</button>
                <button onclick="closeModal()">Скасувати</button>
            </div>
        </div>
    `;
    modal.classList.add('active');
    resetInactivityTimer();
}

async function saveSlideEdit(slideId) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const positionInput = document.getElementById('edit-slide-position');
        const photoUrlInput = document.getElementById('edit-slide-photo-url');
        const photoFileInput = document.getElementById('edit-slide-photo-file');
        const linkInput = document.getElementById('edit-slide-link');
        const activeCheckbox = document.getElementById('edit-slide-active');

        if (!positionInput || !photoUrlInput || !photoFileInput || !linkInput || !activeCheckbox) {
            showNotification('Елементи форми для слайду не знайдено');
            return;
        }

        let photo = photoUrlInput.value.trim();
        const link = linkInput.value.trim();
        const position = parseInt(positionInput.value) || 1;
        const active = activeCheckbox.checked;

        if (!photo && !photoFileInput.files[0]) {
            showNotification('Вкажіть URL або завантажте зображення!');
            return;
        }

        if (photo && !/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/.test(photo)) {
            showNotification('URL фотографії має бути валідним (jpg, jpeg, png, gif, webp)!');
            return;
        }

        if (photoFileInput.files[0]) {
            const file = photoFileInput.files[0];
            const validation = validateFile(file);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', file);
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData,
                headers: {
                    'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
                }
            });
            if (!response.ok) {
                throw new Error('Помилка завантаження зображення');
            }
            const data = await response.json();
            photo = data.url;
        }

        const updatedSlide = { photo, link, position, active };
        const response = await fetchWithAuth(`/api/slides/${slideId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(updatedSlide)
        });

        if (!response.ok) {
            throw new Error('Не вдалося оновити слайд');
        }

        const savedSlide = await response.json();
        const index = slides.findIndex(s => s._id === slideId);
        if (index !== -1) {
            slides[index] = savedSlide;
        }
        console.log('Слайд оновлено:', savedSlide); // Додано логування
        closeModal();
        renderSlidesAdmin();
        showNotification('Слайд оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка редагування слайду:', err);
        showNotification('Помилка: ' + err.message);
    }
}

async function deleteSlide(slideId) {
    if (!confirm('Ви впевнені, що хочете видалити цей слайд?')) {
        return;
    }

    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const response = await fetchWithAuth(`/api/slides/${slideId}`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            }
        });

        if (!response.ok) {
            throw new Error('Не вдалося видалити слайд');
        }

        slides = slides.filter(s => s._id !== slideId);
        console.log('Слайд видалено:', slideId); // Додано логування
        renderSlidesAdmin();
        showNotification('Слайд видалено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка видалення слайду:', err);
        showNotification('Помилка: ' + err.message);
    }
}

    function toggleSlideshow() {
        settings.showSlides = document.getElementById('slide-toggle').checked;
        localStorage.setItem('settings', LZString.compressToUTF16(JSON.stringify(settings)));
        renderAdmin();
        showNotification('Налаштування слайдшоу збережено!');
        unsavedChanges = false;
        resetInactivityTimer();
    }

    function exportSiteBackup() {
        const data = {
            settings,
            categories,
            filters,
            orderFields,
            slides
        };
        const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'site-backup.json';
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Бекап сайту експортовано!');
        resetInactivityTimer();
    }

    function exportProductsBackup() {
        const blob = new Blob([JSON.stringify(products)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'products-backup.json';
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Бекап товарів експортовано!');
        resetInactivityTimer();
    }

    function exportOrdersBackup() {
        const blob = new Blob([JSON.stringify(orders)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'orders-backup.json';
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Бекап замовлень експортовано!');
        resetInactivityTimer();
    }

    function importSiteBackup() {
        const file = document.getElementById('import-site-file').files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    settings = data.settings || settings;
                    categories = data.categories || categories;
                    filters = data.filters || filters;
                    orderFields = data.orderFields || orderFields;
                    slides = data.slides || slides;
                    localStorage.setItem('settings', LZString.compressToUTF16(JSON.stringify(settings)));
                    localStorage.setItem('categories', LZString.compressToUTF16(JSON.stringify(categories)));
                    localStorage.setItem('filters', LZString.compressToUTF16(JSON.stringify(filters)));
                    localStorage.setItem('orderFields', LZString.compressToUTF16(JSON.stringify(orderFields)));
                    localStorage.setItem('slides', LZString.compressToUTF16(JSON.stringify(slides)));
                    renderAdmin();
                    showNotification('Бекап сайту імпортовано!');
                    unsavedChanges = false;
                    resetInactivityTimer();
                } catch (err) {
                    alert('Помилка імпорту: ' + err.message);
                }
            };
            reader.readAsText(file);
        } else {
            alert('Виберіть файл для імпорту!');
        }
    }

    function importProductsBackup() {
        const file = document.getElementById('import-products-file').files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    products = JSON.parse(e.target.result);
                    localStorage.setItem('products', LZString.compressToUTF16(JSON.stringify(products)));
                    renderAdmin();
                    showNotification('Бекап товарів імпортовано!');
                    unsavedChanges = false;
                    resetInactivityTimer();
                } catch (err) {
                    alert('Помилка імпорту: ' + err.message);
                }
            };
            reader.readAsText(file);
        } else {
            alert('Виберіть файл для імпорту!');
        }
    }

    function importOrdersBackup() {
        const file = document.getElementById('import-orders-file').files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    orders = JSON.parse(e.target.result);
                    localStorage.setItem('orders', LZString.compressToUTF16(JSON.stringify(orders)));
                    renderAdmin();
                    showNotification('Бекап замовлень імпортовано!');
                    unsavedChanges = false;
                    resetInactivityTimer();
                } catch (err) {
                    alert('Помилка імпорту: ' + err.message);
                }
            };
            reader.readAsText(file);
        } else {
            alert('Виберіть файл для імпорту!');
        }
    }

    function generateSitemap() {
        const baseUrl = settings.baseUrl || 'https://www.example.com';
        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>${baseUrl}/</loc>
        <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
        <changefreq>daily</changefreq>
        <priority>1.0</priority>
    </url>`;

        categories.forEach(cat => {
            sitemap += `
    <url>
        <loc>${baseUrl}/catalog/${cat.slug}</loc>
        <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.8</priority>
    </url>`;
            (cat.subcategories || []).forEach(sub => {
                sitemap += `
    <url>
        <loc>${baseUrl}/catalog/${cat.slug}/${sub.slug}</loc>
        <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.7</priority>
    </url>`;
            });
        });

        products.forEach(product => {
            if (product.visible) {
                sitemap += `
    <url>
        <loc>${baseUrl}/product/${product.slug}</loc>
        <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.6</priority>
    </url>`;
            }
        });

        sitemap += `
</urlset>`;
        return sitemap;
    }

    function downloadSitemap() {
        const sitemap = generateSitemap();
        const blob = new Blob([sitemap], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sitemap.xml';
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Sitemap завантажено!');
        resetInactivityTimer();
    }

// Додаємо обробники подій для автоматичного імпорту після вибору файлу
document.getElementById('import-site-file').addEventListener('change', function() {
    importSiteBackup();
});

document.getElementById('import-products-file').addEventListener('change', function() {
    importProductsBackup();
});

document.getElementById('import-orders-file').addEventListener('change', function() {
    importOrdersBackup();
});

document.getElementById('bulk-price-file').addEventListener('change', function() {
    uploadBulkPrices();
});

function openAddProductModal() {
    // Скидаємо поля глобальної змінної newProduct замість створення нової
    newProduct.type = 'simple';
    newProduct.photos = [];
    newProduct.colors = [];
    newProduct.sizes = [];
    newProduct.groupProducts = [];
    newProduct.active = true;
    newProduct.visible = true;

    const modal = document.getElementById('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Додати товар</h3>
            <select id="product-type" onchange="updateProductType()">
                <option value="simple">Простий товар</option>
                <option value="mattresses">Матраци</option>
                <option value="group">Груповий товар</option>
            </select><br/>
            <label for="product-type">Тип товару</label>
            <input type="text" id="product-name" placeholder="Назва товару"><br/>
            <label for="product-name">Назва товару</label>
            <input type="text" id="product-slug" placeholder="Шлях товару"><br/>
            <label for="product-slug">Шлях товару</label>
            <input type="text" id="product-brand" placeholder="Виробник"><br/>
            <label for="product-brand">Виробник</label>
            <select id="product-category">
                <option value="">Без категорії</option>
                ${categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
            </select><br/>
            <label for="product-category">Категорія</label>
            <select id="product-subcategory">
                <option value="">Без підкатегорії</option>
            </select><br/>
            <label for="product-subcategory">Підкатегорія</label>
            <input type="text" id="product-material" placeholder="Матеріал"><br/>
            <label for="product-material">Матеріал</label>
            <div id="price-fields"></div>
            <input type="datetime-local" id="product-sale-end" placeholder="Дата закінчення акції"><br/>
            <label for="product-sale-end">Дата закінчення акції</label>
            <select id="product-visible">
                <option value="true">Показувати на сайті</option>
                <option value="false">Не показувати</option>
            </select><br/>
            <label for="product-visible">Видимість</label>
            <div id="product-description-editor"></div>
            <input type="hidden" id="product-description">
            <label for="product-description">Опис товару</label>
            <h4>Розміри</h4>
            <input type="number" id="product-width-cm" placeholder="Ширина (см)" min="0" step="0.1"><br/>
            <label for="product-width-cm">Ширина (см)</label>
            <input type="number" id="product-depth-cm" placeholder="Глибина (см)" min="0" step="0.1"><br/>
            <label for="product-depth-cm">Глибина (см)</label>
            <input type="number" id="product-height-cm" placeholder="Висота (см)" min="0" step="0.1"><br/>
            <label for="product-height-cm">Висота (см)</label>
            <input type="number" id="product-length-cm" placeholder="Довжина (см)" min="0" step="0.1"><br/>
            <label for="product-length-cm">Довжина (см)</label>
            <h4>Фотографії</h4>
            <input type="text" id="product-photo-url" placeholder="URL фотографії"><br/>
            <label for="product-photo-url">URL фотографії</label>
            <input type="file" id="product-photo-file" accept="image/jpeg,image/png,image/gif,image/webp" multiple><br/>
            <label for="product-photo-file">Завантажте фотографію</label>
            <button onclick="addProductPhoto()">Додати фото</button>
            <div id="product-photo-list" class="photo-list"></div>
            <h4>Кольори</h4>
            <input type="text" id="product-color-name" placeholder="Назва кольору"><br/>
            <label for="product-color-name">Назва кольору</label>
            <input type="color" id="product-color-value" value="#000000"><br/>
            <label for="product-color-value">Значення кольору</label>
            <input type="number" id="product-color-price-change" placeholder="Зміна ціни (грн)" step="0.01"><br/>
            <label for="product-color-price-change">Зміна ціни для кольору (грн)</label>
            <input type="text" id="product-color-photo-url" placeholder="URL фото кольору"><br/>
            <label for="product-color-photo-url">URL фото кольору</label>
            <input type="file" id="product-color-photo-file" accept="image/jpeg,image/png,image/gif,image/webp"><br/>
            <label for="product-color-photo-file">Завантажте фото кольору</label>
            <button onclick="addProductColor()">Додати колір</button>
            <div id="product-color-list" class="color-photo-list"></div>
            <div id="mattress-sizes" class="type-specific">
                <h4>Розміри матраців</h4>
                <input type="text" id="mattress-size-name" placeholder="Розмір (наприклад, 90x190)"><br/>
                <label for="mattress-size-name">Розмір</label>
                <input type="number" id="mattress-size-price" placeholder="Ціна (грн)" min="0"><br/>
                <label for="mattress-size-price">Ціна (грн)</label>
                <button onclick="addMattressSize()">Додати розмір</button>
                <div id="mattress-size-list"></div>
            </div>
            <div id="group-products" class="type-specific">
                <h4>Групові товари</h4>
                <div class="group-product-search">
                    <input type="text" id="group-product-search" placeholder="Пошук товарів" oninput="searchGroupProducts()">
                    <div id="group-product-results"></div>
                </div>
                <div id="group-product-list"></div>
            </div>
            <div class="modal-actions">
                <button onclick="saveNewProduct()">Зберегти</button>
                <button onclick="closeModal()">Скасувати</button>
            </div>
        </div>
    `;
    modal.classList.add('active');
    updateProductType();
    initializeProductEditor();

    // Додаємо обробники подій після ініціалізації DOM
    setTimeout(() => {
        const categorySelect = document.getElementById('product-category');
        if (categorySelect) {
            categorySelect.addEventListener('change', updateSubcategories);
            updateSubcategories();
        }

        const photoInput = document.getElementById('product-photo-file');
        if (photoInput) {
            photoInput.addEventListener('change', () => {
                const files = photoInput.files;
                Array.from(files).forEach(file => {
                    if (!newProduct.photos.includes(file)) {
                        newProduct.photos.push(file);
                    }
                });
                renderPhotoList();
                resetInactivityTimer();
            });
        }

        const colorPhotoInput = document.getElementById('product-color-photo-file');
        if (colorPhotoInput) {
            colorPhotoInput.addEventListener('change', () => {
                const file = colorPhotoInput.files[0];
                if (file) {
                    const name = document.getElementById('product-color-name').value;
                    const value = document.getElementById('product-color-value').value;
                    const priceChange = parseFloat(document.getElementById('product-color-price-change').value) || 0;
                    if (name && value) {
                        const color = { name, value, priceChange, photo: file };
                        newProduct.colors.push(color);
                        document.getElementById('product-color-name').value = '';
                        document.getElementById('product-color-value').value = '#000000';
                        document.getElementById('product-color-price-change').value = '';
                        document.getElementById('product-color-photo-url').value = '';
                        document.getElementById('product-color-photo-file').value = '';
                        renderColorsList();
                        resetInactivityTimer();
                    }
                }
            });
        }
    }, 0);

    resetInactivityTimer();
}

function updateProductType() {
    newProduct.type = document.getElementById('product-type').value;
    document.querySelectorAll('.type-specific').forEach(el => el.classList.remove('active'));
    if (newProduct.type === 'mattresses') {
        document.getElementById('mattress-sizes').classList.add('active');
    } else if (newProduct.type === 'group') {
        document.getElementById('group-products').classList.add('active');
    }
    renderPriceFields(); // Оновлюємо поля ціни
    resetInactivityTimer();
}

function renderPriceFields() {
    const priceFields = document.getElementById('price-fields');
    if (!priceFields) return; // Захист від помилки, якщо контейнер не знайдено

    if (newProduct.type === 'simple') {
        priceFields.innerHTML = `
            <input type="number" id="product-price" value="${newProduct.price || ''}" placeholder="Ціна (грн)" min="0"><br/>
            <label for="product-price">Ціна (грн)</label>
            <input type="number" id="product-sale-price" value="${newProduct.salePrice || ''}" placeholder="Акційна ціна (грн)" min="0"><br/>
            <label for="product-sale-price">Акційна ціна (грн)</label>
        `;
    } else {
        priceFields.innerHTML = ''; // Очищаємо поля для матраців і групових товарів
    }
}

function updateSubcategories() {
    const categorySelect = document.getElementById('product-category');
    const subcategorySelect = document.getElementById('product-subcategory');
    if (!categorySelect || !subcategorySelect) {
        console.warn('Елементи #product-category або #product-subcategory не знайдено');
        return;
    }

    const categoryName = categorySelect.value;
    subcategorySelect.innerHTML = '<option value="">Без підкатегорії</option>';

    if (!Array.isArray(categories)) {
        console.warn('categories не є масивом:', categories);
        return;
    }

    const category = categories.find(c => c.name === categoryName);
    if (category && Array.isArray(category.subcategories)) {
        category.subcategories.forEach(sub => {
            if (sub.name && sub.slug) {
                const option = document.createElement('option');
                option.value = sub.slug;
                option.textContent = sub.name;
                subcategorySelect.appendChild(option);
            }
        });
        console.log('Оновлено підкатегорії для категорії:', categoryName, category.subcategories.map(s => s.name)); // Додано логування
    }
}

function addProductPhoto() {
    const url = document.getElementById('product-photo-url').value;
    const fileInput = document.getElementById('product-photo-file');
    const files = fileInput.files;

    if (files.length > 0) {
        let allValid = true;
        Array.from(files).forEach(file => {
            const validation = validateFile(file);
            if (!validation.valid) {
                alert(validation.error);
                allValid = false;
                return;
            }
            newProduct.photos.push(file);
        });
        if (allValid) {
            fileInput.value = '';
            document.getElementById('product-photo-url').value = '';
            renderPhotoList();
            resetInactivityTimer();
        }
    } else if (url) {
        newProduct.photos.push(url);
        document.getElementById('product-photo-url').value = '';
        document.getElementById('product-photo-file').value = '';
        renderPhotoList();
        resetInactivityTimer();
    } else {
        alert('Введіть URL або завантажте файл!');
    }
}

function renderPhotoList() {
    const photoList = document.getElementById('product-photo-list');
    photoList.innerHTML = newProduct.photos.map((photo, index) => {
        let photoSrc = '';
        if (typeof photo === 'string') {
            photoSrc = photo;
        } else if (photo instanceof File) {
            photoSrc = URL.createObjectURL(photo);
        }
        return `
            <div class="photo-item draggable" draggable="true" ondragstart="dragPhoto(event, ${index})" ondragover="allowDropPhoto(event)" ondrop="dropPhoto(event, ${index})">
                <img src="${photoSrc}" style="max-width: 50px;">
                <button class="delete-btn" onclick="deleteProductPhoto(${index})">Видалити</button>
            </div>
        `;
    }).join('');
}

    function dragPhoto(event, index) {
        event.dataTransfer.setData('text/plain', index);
        event.target.classList.add('dragging');
    }

    function allowDropPhoto(event) {
        event.preventDefault();
    }

    function dropPhoto(event, targetIndex) {
        event.preventDefault();
        const sourceIndex = parseInt(event.dataTransfer.getData('text/plain'));
        if (sourceIndex !== targetIndex) {
            const [movedPhoto] = newProduct.photos.splice(sourceIndex, 1);
            newProduct.photos.splice(targetIndex, 0, movedPhoto);
            renderPhotoList();
            resetInactivityTimer();
        }
        document.querySelectorAll('.photo-item').forEach(item => item.classList.remove('dragging'));
    }

    function deleteProductPhoto(index) {
        newProduct.photos.splice(index, 1);
        renderPhotoList();
        resetInactivityTimer();
    }

function addProductColor() {
    const name = document.getElementById('product-color-name').value;
    const value = document.getElementById('product-color-value').value;
    const priceChange = parseFloat(document.getElementById('product-color-price-change').value) || 0;
    const url = document.getElementById('product-color-photo-url').value;
    const colorPhotoInput = document.getElementById('product-color-photo-file');
    const file = colorPhotoInput ? colorPhotoInput.files[0] : null;

    if (name && value) {
        const color = { name, value, priceChange };
        if (file) {
            const validation = validateFile(file);
            if (!validation.valid) {
                alert(validation.error);
                return;
            }
            color.photo = file; // Зберігаємо файл, а не Base64
            newProduct.colors.push(color);
            document.getElementById('product-color-name').value = '';
            document.getElementById('product-color-value').value = '#000000';
            document.getElementById('product-color-price-change').value = '';
            document.getElementById('product-color-photo-url').value = '';
            if (colorPhotoInput) colorPhotoInput.value = '';
            renderColorsList();
            resetInactivityTimer();
        } else if (url) {
            color.photo = url;
            newProduct.colors.push(color);
            document.getElementById('product-color-name').value = '';
            document.getElementById('product-color-value').value = '#000000';
            document.getElementById('product-color-price-change').value = '';
            document.getElementById('product-color-photo-url').value = '';
            if (colorPhotoInput) colorPhotoInput.value = '';
            renderColorsList();
            resetInactivityTimer();
        } else {
            newProduct.colors.push(color);
            document.getElementById('product-color-name').value = '';
            document.getElementById('product-color-value').value = '#000000';
            document.getElementById('product-color-price-change').value = '';
            document.getElementById('product-color-photo-url').value = '';
            if (colorPhotoInput) colorPhotoInput.value = '';
            renderColorsList();
            resetInactivityTimer();
        }
    } else {
        alert('Введіть назву та виберіть колір!');
    }
}

function renderColorsList() {
    const colorList = document.getElementById('product-color-list');
    if (!colorList) {
        console.warn('Елемент #product-color-list не знайдено, пропускаємо рендеринг кольорів.');
        return;
    }
    colorList.innerHTML = newProduct.colors.map((color, index) => {
        const photoSrc = color.photo instanceof File ? URL.createObjectURL(color.photo) : color.photo || '';
        return `
            <div class="color-item" style="border: 1px solid #ddd; padding: 5px; margin: 5px 0;">
                <span style="background-color: ${color.value};"></span>
                ${color.name} (Зміна ціни: ${color.priceChange} грн)
                ${photoSrc ? `<img src="${photoSrc}" alt="Фото кольору ${color.name}" style="max-width: 30px;">` : ''}
                <button class="delete-btn" onclick="deleteProductColor(${index})">Видалити</button>
            </div>
        `;
    }).join('');
}

    function deleteProductColor(index) {
        newProduct.colors.splice(index, 1);
        renderColorsList();
        resetInactivityTimer();
    }

    function addMattressSize() {
        const name = document.getElementById('mattress-size-name').value;
        const price = parseFloat(document.getElementById('mattress-size-price').value);

        if (name && !isNaN(price) && price >= 0) {
            newProduct.sizes.push({ name, price });
            document.getElementById('mattress-size-name').value = '';
            document.getElementById('mattress-size-price').value = '';
            renderMattressSizes();
            resetInactivityTimer();
        } else {
            alert('Введіть розмір та ціну!');
        }
    }

    function renderMattressSizes() {
        const sizeList = document.getElementById('mattress-size-list');
        sizeList.innerHTML = newProduct.sizes.map((size, index) => `
            <div class="mattress-size">
                ${size.name}: ${size.price} грн
                <button class="delete-btn" onclick="deleteMattressSize(${index})">Видалити</button>
            </div>
        `).join('');
    }

    function deleteMattressSize(index) {
        newProduct.sizes.splice(index, 1);
        renderMattressSizes();
        resetInactivityTimer();
    }

function searchGroupProducts() {
    const query = document.getElementById('group-product-search').value.toLowerCase();
    const results = document.getElementById('group-product-results');
    const filteredProducts = products.filter(p => 
        p.active && 
        p.type === 'simple' &&  // Змінено з p.type !== 'group' на p.type === 'simple'
        (p.name.toLowerCase().includes(query) || p.id.toString().includes(query))
    );
    results.innerHTML = filteredProducts.slice(0, 5).map(p => `
        <div>
            #${p.id} ${p.name}
            <button onclick="addGroupProduct(${p.id})">Додати</button>
        </div>
    `).join('');
    resetInactivityTimer();
}

    function addGroupProduct(productId) {
        if (!newProduct.groupProducts.includes(productId)) {
            newProduct.groupProducts.push(productId);
            renderGroupProducts();
            document.getElementById('group-product-search').value = '';
            document.getElementById('group-product-results').innerHTML = '';
            resetInactivityTimer();
        }
    }

    function renderGroupProducts() {
        const groupList = document.getElementById('group-product-list');
        if (groupList) {
            groupList.innerHTML = newProduct.groupProducts.map((pid, index) => {
                const p = products.find(pr => pr.id === pid);
                return p ? `
                    <div class="group-product draggable" draggable="true" ondragstart="dragGroupProduct(event, ${index})" ondragover="allowDropGroupProduct(event)" ondrop="dropGroupProduct(event, ${index})">
                        #${p.id} ${p.name}
                        <button class="delete-btn" onclick="deleteGroupProduct(${pid})">Видалити</button>
                    </div>
                ` : '';
            }).join('');
        }
    }

    function dragGroupProduct(event, index) {
        event.dataTransfer.setData('text/plain', index);
        event.target.classList.add('dragging');
    }

    function allowDropGroupProduct(event) {
        event.preventDefault();
    }

    function dropGroupProduct(event, targetIndex) {
        event.preventDefault();
        const sourceIndex = parseInt(event.dataTransfer.getData('text/plain'));
        if (sourceIndex !== targetIndex) {
            const [movedProduct] = newProduct.groupProducts.splice(sourceIndex, 1);
            newProduct.groupProducts.splice(targetIndex, 0, movedProduct);
            renderGroupProducts();
            unsavedChanges = true;
            resetInactivityTimer();
        }
        document.querySelectorAll('.group-product').forEach(item => item.classList.remove('dragging'));
    }

    function deleteGroupProduct(productId) {
        newProduct.groupProducts = newProduct.groupProducts.filter(pid => pid !== productId);
        renderGroupProducts();
        resetInactivityTimer();
    }

async function saveNewProduct() {
    const saveButton = document.querySelector('.modal-actions button:first-child');
    if (saveButton) {
        saveButton.disabled = true;
    }

    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const nameInput = document.getElementById('product-name');
        const slugInput = document.getElementById('product-slug');
        const brandInput = document.getElementById('product-brand');
        const categoryInput = document.getElementById('product-category');
        const subcategoryInput = document.getElementById('product-subcategory');
        const materialInput = document.getElementById('product-material');
        const priceInput = document.getElementById('product-price');
        const salePriceInput = document.getElementById('product-sale-price');
        const saleEndInput = document.getElementById('product-sale-end');
        const visibleSelect = document.getElementById('product-visible');
        const descriptionInput = document.getElementById('product-description');
        const widthCmInput = document.getElementById('product-width-cm');
        const depthCmInput = document.getElementById('product-depth-cm');
        const heightCmInput = document.getElementById('product-height-cm');
        const lengthCmInput = document.getElementById('product-length-cm');

        if (!nameInput || !slugInput || !visibleSelect || !descriptionInput) {
            showNotification('Елементи форми для товару не знайдено');
            return;
        }

        const name = nameInput.value.trim();
        const slug = slugInput.value.trim();
        const brand = brandInput ? brandInput.value.trim() : '';
        const category = categoryInput ? categoryInput.value.trim() : '';
        const subcategory = subcategoryInput ? subcategoryInput.value.trim() : '';
        const material = materialInput ? materialInput.value.trim() : '';
        let price = null;
        let salePrice = null;
        if (newProduct.type === 'simple' && priceInput) {
            price = parseFloat(priceInput.value) || null;
            salePrice = salePriceInput ? parseFloat(salePriceInput.value) || null : null;
        }
        const saleEnd = saleEndInput ? saleEndInput.value : null;
        const visible = visibleSelect.value === 'true';
        const description = descriptionInput.value || '';
        const widthCm = widthCmInput ? parseFloat(widthCmInput.value) || null : null;
        const depthCm = depthCmInput ? parseFloat(depthCmInput.value) || null : null;
        const heightCm = heightCmInput ? parseFloat(heightCmInput.value) || null : null;
        const lengthCm = lengthCmInput ? parseFloat(lengthCmInput.value) || null : null;

        if (!name || !slug) {
            showNotification('Введіть назву та шлях товару!');
            return;
        }

        const slugCheck = await fetchWithAuth(`/api/products?slug=${encodeURIComponent(slug)}`);
        const existingProducts = await slugCheck.json();
        if (existingProducts.some(p => p.slug === slug)) {
            showNotification('Шлях товару має бути унікальним!');
            return;
        }

        if (newProduct.type === 'simple' && (price === null || price < 0)) {
            showNotification('Введіть коректну ціну для простого товару!');
            return;
        }

        if (newProduct.type === 'mattresses' && newProduct.sizes.length === 0) {
            showNotification('Додайте хоча б один розмір для матрацу!');
            return;
        }

if (newProduct.type === 'group' && newProduct.groupProducts.length === 0) {
    showNotification('Додайте хоча б один товар до групового товару!');
    return;
}

// Додаємо перевірку підкатегорії
if (subcategory) {
    const categoryObj = categories.find(c => c.name === category);
    if (!categoryObj || !categoryObj.subcategories.some(sub => sub.name === subcategory)) {
        showNotification('Вибрана підкатегорія не існує в цій категорії!');
        return;
    }
}

        if (brand && !brands.includes(brand)) {
            try {
                const response = await fetchWithAuth('/api/brands', {
                    method: 'POST',
                    body: JSON.stringify({ name: brand })
                });
                if (response.ok) {
                    brands.push(brand);
                    updateBrandOptions();
                }
            } catch (e) {
                console.error('Помилка додавання бренду:', e);
            }
        }

        if (material && !materials.includes(material)) {
            try {
                const response = await fetchWithAuth('/api/materials', {
                    method: 'POST',
                    body: JSON.stringify({ name: material })
                });
                if (response.ok) {
                    materials.push(material);
                    updateMaterialOptions();
                }
            } catch (e) {
                console.error('Помилка додавання матеріалу:', e);
            }
        }

        let product = {
            type: newProduct.type,
            name,
            slug,
            brand: brand || '',
            category: category || '',
            subcategory: subcategory || '',
            material: material || '',
            price: newProduct.type === 'simple' ? price : null,
            salePrice: salePrice,
            saleEnd: saleEnd || null,
            description: description || '',
            widthCm,
            depthCm,
            heightCm,
            lengthCm,
            photos: [],
            colors: newProduct.colors.map(color => ({
                name: color.name,
                value: color.value,
                priceChange: color.priceChange,
                photo: null
            })),
            sizes: newProduct.sizes,
            groupProducts: newProduct.groupProducts,
            active: true,
            visible: visible
        };

        const mediaUrls = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(description, 'text/html');
        const images = doc.querySelectorAll('img');

        for (let img of images) {
            const src = img.getAttribute('src');
            if (src && src.startsWith('blob:')) {
                try {
                    const response = await fetch(src);
                    const blob = await response.blob();
                    if (blob.size > 10 * 1024 * 1024) {
                        throw new Error('Зображення занадто велике (максимум 10 МБ)');
                    }
                    const formData = new FormData();
                    formData.append('file', blob, `description-image-${Date.now()}.png`);
                    const uploadResponse = await fetchWithAuth('/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const uploadData = await uploadResponse.json();
                    if (uploadData.url) {
                        mediaUrls.push({ oldUrl: src, newUrl: uploadData.url });
                    } else {
                        throw new Error('Не вдалося завантажити зображення');
                    }
                } catch (err) {
                    console.error('Помилка завантаження зображення з опису:', err);
                    showNotification('Не вдалося завантажити зображення з опису: ' + err.message);
                    return;
                }
            }
        }

        let updatedDescription = description;
        mediaUrls.forEach(({ oldUrl, newUrl }) => {
            updatedDescription = updatedDescription.replace(oldUrl, newUrl);
        });
        product.description = updatedDescription;

        const photoFiles = newProduct.photos.filter(photo => photo instanceof File);
        for (let file of photoFiles) {
            const validation = validateFile(file);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            try {
                const formData = new FormData();
                formData.append('file', file);
                const response = await fetchWithAuth('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                product.photos.push(data.url);
            } catch (err) {
                console.error('Помилка завантаження фото:', err);
                showNotification('Не вдалося завантажити фото: ' + err.message);
                return;
            }
        }

        product.photos.push(...newProduct.photos.filter(photo => typeof photo === 'string'));

        for (let i = 0; i < newProduct.colors.length; i++) {
            const color = newProduct.colors[i];
            if (color.photo instanceof File) {
                const validation = validateFile(color.photo);
                if (!validation.valid) {
                    showNotification(validation.error);
                    return;
                }
                try {
                    const formData = new FormData();
                    formData.append('file', color.photo);
                    const response = await fetchWithAuth('/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();
                    product.colors[i].photo = data.url;
                } catch (err) {
                    console.error('Помилка завантаження фото кольору:', err);
                    showNotification('Не вдалося завантажити фото кольору: ' + err.message);
                    return;
                }
            } else if (typeof color.photo === 'string') {
                product.colors[i].photo = color.photo;
            }
        }

        const response = await fetchWithAuth('/api/products', {
            method: 'POST',
            body: JSON.stringify(product)
        });

        const newProductData = await response.json();
        products.push(newProductData);
        closeModal();
        renderAdmin('products');
        showNotification('Товар додано!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка при додаванні товару:', err);
        showNotification('Не вдалося додати товар: ' + err.message);
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
        }
    }
}

async function openEditProductModal(productId) {
    const product = products.find(p => p._id === productId);
    if (product) {
        newProduct = { ...product, colors: [...product.colors], photos: [...product.photos], sizes: [...product.sizes], groupProducts: [...product.groupProducts] };
        const escapedName = product.name.replace(/"/g, '&quot;');
        const modal = document.getElementById('modal');
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Редагувати товар #${product.id || product._id}</h3>
                <select id="product-type" onchange="updateProductType()">
                    <option value="simple" ${product.type === 'simple' ? 'selected' : ''}>Простий товар</option>
                    <option value="mattresses" ${product.type === 'mattresses' ? 'selected' : ''}>Матраци</option>
                    <option value="group" ${product.type === 'group' ? 'selected' : ''}>Груповий товар</option>
                </select><br/>
                <label for="product-type">Тип товару</label>
                <input type="text" id="product-name" value="${escapedName}"><br/>
                <label for="product-name">Назва товару</label>
                <input type="text" id="product-slug" value="${product.slug || ''}"><br/>
                <label for="product-slug">Шлях товару</label>
                <input type="text" id="product-brand" value="${product.brand || ''}"><br/>
                <label for="product-brand">Виробник</label>
                <select id="product-category">
                    <option value="">Без категорії</option>
                    ${categories.map(c => `<option value="${c.name}" ${c.name === product.category ? 'selected' : ''}>${c.name}</option>`).join('')}
                </select><br/>
                <label for="product-category">Категорія</label>
                <select id="product-subcategory">
                    <option value="">Без підкатегорії</option>
                </select><br/>
                <label for="product-subcategory">Підкатегорія</label>
                <input type="text" id="product-material" value="${product.material || ''}" placeholder="Матеріал"><br/>
                <label for="product-material">Матеріал</label>
                <div id="price-fields"></div>
                <input type="datetime-local" id="product-sale-end" value="${product.saleEnd || ''}"><br/>
                <label for="product-sale-end">Дата закінчення акції</label>
                <select id="product-visible">
                    <option value="true" ${product.visible ? 'selected' : ''}>Показувати на сайті</option>
                    <option value="false" ${!product.visible ? 'selected' : ''}>Не показувати</option>
                </select><br/>
                <label for="product-visible">Видимість</label>
                <div id="product-description-editor"></div>
                <input type="hidden" id="product-description">
                <label for="product-description">Опис товару</label>
                <h4>Розміри</h4>
                <input type="number" id="product-width-cm" value="${product.widthCm || ''}" placeholder="Ширина (см)" min="0" step="0.1"><br/>
                <label for="product-width-cm">Ширина (см)</label>
                <input type="number" id="product-depth-cm" value="${product.depthCm || ''}" placeholder="Глибина (см)" min="0" step="0.1"><br/>
                <label for="product-depth-cm">Глибина (см)</label>
                <input type="number" id="product-height-cm" value="${product.heightCm || ''}" placeholder="Висота (см)" min="0" step="0.1"><br/>
                <label for="product-height-cm">Висота (см)</label>
                <input type="number" id="product-length-cm" value="${product.lengthCm || ''}" placeholder="Довжина (см)" min="0" step="0.1"><br/>
                <label for="product-length-cm">Довжина (см)</label>
                <h4>Фотографії</h4>
                <input type="text" id="product-photo-url" placeholder="URL фотографії"><br/>
                <label for="product-photo-url">URL фотографії</label>
                <input type="file" id="product-photo-file" accept="image/jpeg,image/png,image/gif,image/webp" multiple><br/>
                <label for="product-photo-file">Завантажте фотографію</label>
                <button onclick="addProductPhoto()">Додати фото</button>
                <div id="product-photo-list" class="photo-list"></div>
                <h4>Кольори</h4>
                <input type="text" id="product-color-name" placeholder="Назва кольору"><br/>
                <label for="product-color-name">Назва кольору</label>
                <input type="color" id="product-color-value"><br/>
                <label for="product-color-value">Значення кольору</label>
                <input type="number" id="product-color-price-change" placeholder="Зміна ціни (грн)" step="0.01"><br/>
                <label for="product-color-price-change">Зміна ціни для кольору (грн)</label>
                <input type="text" id="product-color-photo-url" placeholder="URL фото кольору"><br/>
                <label for="product-color-photo-url">URL фото кольору</label>
                <input type="file" id="product-color-photo-file" accept="image/jpeg,image/png,image/gif,image/webp"><br/>
                <label for="product-color-photo-file">Завантажте фото кольору</label>
                <button onclick="addProductColor()">Додати колір</button>
                <div id="product-color-list" class="color-photo-list"></div>
                <div id="mattress-sizes" class="type-specific">
                    <h4>Розміри матраців</h4>
                    <input type="text" id="mattress-size-name" placeholder="Розмір (наприклад, 90x190)"><br/>
                    <label for="mattress-size-name">Розмір</label>
                    <input type="number" id="mattress-size-price" placeholder="Ціна (грн)" min="0"><br/>
                    <label for="mattress-size-price">Ціна (грн)</label>
                    <button onclick="addMattressSize()">Додати розмір</button>
                    <div id="mattress-size-list"></div>
                </div>
                <div id="group-products" class="type-specific">
                    <h4>Групові товари</h4>
                    <div class="group-product-search">
                        <input type="text" id="group-product-search" placeholder="Пошук товарів" oninput="searchGroupProducts()">
                        <div id="group-product-results"></div>
                    </div>
                    <div id="group-product-list"></div>
                </div>
                <div class="modal-actions">
                    <button onclick="saveEditedProduct('${product._id}')">Зберегти</button>
                    <button onclick="closeModal()">Скасувати</button>
                </div>
            </div>
        `;
        modal.classList.add('active');
        updateProductType();
        initializeProductEditor(product.description || '', product.descriptionDelta || null);
        document.getElementById('product-category').addEventListener('change', updateSubcategories);
        updateSubcategories();
        const subcatSelect = document.getElementById('product-subcategory');
if (product.subcategory) {
    const category = categories.find(c => c.name === product.category);
    if (category) {
        const subcat = category.subcategories.find(sub => sub.name === product.subcategory);
        if (subcat) {
            subcatSelect.value = subcat.slug;
        }
    }
}
        renderColorsList();
        renderPhotoList();
        renderMattressSizes();
        renderGroupProducts();

        const photoInput = document.getElementById('product-photo-file');
        photoInput.addEventListener('change', () => {
            const files = photoInput.files;
            Array.from(files).forEach(file => {
                if (!newProduct.photos.includes(file)) {
                    newProduct.photos.push(file);
                }
            });
            renderPhotoList();
            resetInactivityTimer();
        });

        const colorPhotoInput = document.getElementById('product-color-photo-file');
        colorPhotoInput.addEventListener('change', () => {
            const file = colorPhotoInput.files[0];
            if (file) {
                const name = document.getElementById('product-color-name').value;
                const value = document.getElementById('product-color-value').value;
                const priceChange = parseFloat(document.getElementById('product-color-price-change').value) || 0;
                if (name && value) {
                    const color = { name, value, priceChange, photo: file };
                    newProduct.colors.push(color);
                    document.getElementById('product-color-name').value = '';
                    document.getElementById('product-color-value').value = '#000000';
                    document.getElementById('product-color-price-change').value = '';
                    document.getElementById('product-color-photo-url').value = '';
                    document.getElementById('product-color-photo-file').value = '';
                    renderColorsList();
                    resetInactivityTimer();
                }
            }
        });

        resetInactivityTimer();
    }
}

async function saveEditedProduct(productId) {
    const saveButton = document.querySelector('.modal-actions button:first-child');
    if (saveButton) {
        saveButton.disabled = true;
    }

    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const name = document.getElementById('product-name').value;
        const slug = document.getElementById('product-slug').value;
        const brand = document.getElementById('product-brand').value;
        const category = document.getElementById('product-category').value;
        const subcategory = document.getElementById('product-subcategory').value;
        const material = document.getElementById('product-material').value;
        let price = null;
        let salePrice = null;
        if (newProduct.type === 'simple') {
            price = parseFloat(document.getElementById('product-price')?.value) || null;
            salePrice = parseFloat(document.getElementById('product-sale-price')?.value) || null;
        }
        const saleEnd = document.getElementById('product-sale-end').value || null;
        const visible = document.getElementById('product-visible').value === 'true';
        const description = document.getElementById('product-description').value || '';
        const widthCm = parseFloat(document.getElementById('product-width-cm').value) || null;
        const depthCm = parseFloat(document.getElementById('product-depth-cm').value) || null;
        const heightCm = parseFloat(document.getElementById('product-height-cm').value) || null;
        const lengthCm = parseFloat(document.getElementById('product-length-cm').value) || null;

        if (!name || !slug) {
            showNotification('Введіть назву та шлях товару!');
            return;
        }

        const productObj = products.find(p => p._id === productId);
        if (!productObj || !productObj._id) {
            showNotification('Товар не знайдено або відсутній ID!');
            return;
        }

        const slugCheck = await fetchWithAuth(`/api/products?slug=${encodeURIComponent(slug)}`);
        const existingProducts = await slugCheck.json();
        if (existingProducts.some(p => p.slug === slug && p._id !== productId)) {
            showNotification('Шлях товару має бути унікальним!');
            return;
        }

        if (newProduct.type === 'simple' && (price === null || price < 0)) {
            showNotification('Введіть коректну ціну для простого товару!');
            return;
        }

        if (newProduct.type === 'mattresses' && newProduct.sizes.length === 0) {
            showNotification('Додайте хоча б один розмір для матрацу!');
            return;
        }

if (newProduct.type === 'group' && newProduct.groupProducts.length === 0) {
    showNotification('Додайте хоча б один товар до групового товару!');
    return;
}

// Додаємо перевірку підкатегорії
if (subcategory) {
    const categoryObj = categories.find(c => c.name === category);
    if (!categoryObj || !categoryObj.subcategories.some(sub => sub.name === subcategory)) {
        showNotification('Вибрана підкатегорія не існує в цій категорії!');
        return;
    }
}

        if (brand && !brands.includes(brand)) {
            try {
                const response = await fetchWithAuth('/api/brands', {
                    method: 'POST',
                    body: JSON.stringify({ name: brand })
                });
                if (response.ok) {
                    brands.push(brand);
                    updateBrandOptions();
                }
            } catch (e) {
                console.error('Помилка додавання бренду:', e);
            }
        }

        if (material && !materials.includes(material)) {
            try {
                const response = await fetchWithAuth('/api/materials', {
                    method: 'POST',
                    body: JSON.stringify({ name: material })
                });
                if (response.ok) {
                    materials.push(material);
                    updateMaterialOptions();
                }
            } catch (e) {
                console.error('Помилка додавання матеріалу:', e);
            }
        }

        let product = {
            type: newProduct.type,
            name,
            slug,
            brand: brand || '',
            category: category || '',
            subcategory: subcategory || '',
            material: material || '',
            price: newProduct.type === 'simple' ? price : null,
            salePrice: salePrice || null,
            saleEnd: saleEnd || null,
            description,
            widthCm,
            depthCm,
            heightCm,
            lengthCm,
            photos: [],
            colors: newProduct.colors.map(color => ({
                name: color.name,
                value: color.value,
                priceChange: color.priceChange || 0,
                photo: color.photo || null
            })),
            sizes: newProduct.sizes,
            groupProducts: newProduct.groupProducts,
            active: newProduct.active,
            visible
        };

        const mediaUrls = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(description, 'text/html');
        const images = doc.querySelectorAll('img');

        for (let img of images) {
            const src = img.getAttribute('src');
            if (src && src.startsWith('blob:')) {
                try {
                    const response = await fetch(src);
                    const blob = await response.blob();
                    const formData = new FormData();
                    formData.append('file', blob, `description-image-${Date.now()}.png`);
                    const uploadResponse = await fetchWithAuth('/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    if (!uploadResponse.ok) {
                        throw new Error('Помилка завантаження зображення');
                    }
                    const uploadData = await uploadResponse.json();
                    if (uploadData.url) {
                        mediaUrls.push({ oldUrl: src, newUrl: uploadData.url });
                    }
                } catch (err) {
                    console.error('Помилка завантаження зображення:', err);
                    showNotification('Не вдалося завантажити зображення: ' + err.message);
                    return;
                }
            }
        }

        let updatedDescription = description;
        mediaUrls.forEach(({ oldUrl, newUrl }) => {
            updatedDescription = updatedDescription.replace(oldUrl, newUrl);
        });
        product.description = updatedDescription;

        const photoFiles = newProduct.photos.filter(photo => photo instanceof File);
        for (let file of photoFiles) {
            const validation = validateFile(file);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            try {
                const formData = new FormData();
                formData.append('file', file);
                const response = await fetchWithAuth('/api/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();
                product.photos.push(data.url);
            } catch (err) {
                console.error('Помилка завантаження фото:', err);
                showNotification('Не вдалося завантажити фото: ' + err.message);
                return;
            }
        }

        product.photos.push(...newProduct.photos.filter(photo => typeof photo === 'string'));

        for (let i = 0; i < newProduct.colors.length; i++) {
            const color = newProduct.colors[i];
            if (color.photo instanceof File) {
                const validation = validateFile(color.photo);
                if (!validation.valid) {
                    showNotification(validation.error);
                    return;
                }
                try {
                    const formData = new FormData();
                    formData.append('file', color.photo);
                    const response = await fetchWithAuth('/api/upload', {
                        method: 'POST',
                        body: formData
                    });
                    const data = await response.json();
                    product.colors[i].photo = data.url;
                } catch (err) {
                    console.error('Помилка завантаження фото кольору:', err);
                    showNotification('Не вдалося завантажити фото кольору: ' + err.message);
                    return;
                }
            }
        }

        const response = await fetchWithAuth(`/api/products/${productId}`, {
            method: 'PUT',
            body: JSON.stringify(product)
        });

        const updatedProduct = await response.json();
        const index = products.findIndex(p => p._id === productId);
        if (index !== -1) {
            products[index] = updatedProduct;
        } else {
            products.push(updatedProduct);
        }
        closeModal();
        renderAdmin('products');
        showNotification('Товар оновлено!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка при оновленні товару:', err);
        showNotification('Не вдалося оновити товар: ' + err.message);
    } finally {
        if (saveButton) {
            saveButton.disabled = false;
        }
    }
}

async function deleteProduct(productId) {
    if (confirm('Ви впевнені, що хочете видалити цей товар?')) {
        try {
            const tokenRefreshed = await refreshToken();
            if (!tokenRefreshed) {
                showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
                showSection('admin-login');
                return;
            }

            const response = await fetchWithAuth(`/api/products/${productId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Помилка при видаленні товару: ' + response.statusText);
            }

            products = products.filter(p => p._id !== productId);
            products.forEach(p => {
                if (p.type === 'group') {
                    p.groupProducts = p.groupProducts.filter(pid => pid !== productId);
                }
            });
            renderAdmin('products');
            showNotification('Товар видалено!');
            unsavedChanges = false;
            resetInactivityTimer();
        } catch (err) {
            console.error('Помилка при видаленні товару:', err);
            showNotification('Не вдалося видалити товар: ' + err.message);
        }
    }
}

async function toggleProductActive(productId) {
    const product = products.find(p => p._id === productId);
    if (!product) {
        showNotification('Товар не знайдено!');
        return;
    }

    const newActiveStatus = !product.active;

    try {
        const response = await fetchWithAuth(`/api/products/${productId}`, {
            method: 'PATCH',
            body: JSON.stringify({ active: newActiveStatus })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка при оновленні статусу товару: ${errorData.error || response.statusText}`);
        }

        product.active = newActiveStatus;
        renderAdmin('products');
        showNotification(`Товар ${product.active ? 'активовано' : 'деактивовано'}!`);
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка при оновленні статусу товару:', err);
        showNotification('Не вдалося оновити статус товару: ' + err.message);
    }
}

function sortAdminProducts(sortType) {
    if (!Array.isArray(products)) {
        console.error('products не є масивом:', products);
        showNotification('Помилка: продукти не завантажено');
        return;
    }

    const [key, order] = sortType.split('-');
    products.sort((a, b) => {
        let valA, valB;
        if (key === 'id') {
            valA = a.id;
            valB = b.id;
        } else if (key === 'name') {
            valA = a.name.toLowerCase();
            valB = b.name.toLowerCase();
        } else if (key === 'brand') {
            valA = (a.brand || '').toLowerCase();
            valB = (b.brand || '').toLowerCase();
        } else if (key === 'price') {
            valA = a.price || (a.sizes ? Math.min(...a.sizes.map(s => s.price)) : Infinity);
            valB = b.price || (b.sizes ? Math.min(...b.sizes.map(s => s.price)) : Infinity);
        }
        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });
    console.log('Продукти відсортовано за:', sortType); // Додано логування
    renderAdmin('products');
    resetInactivityTimer();
}

function sortOrders(sortType) {
    if (!Array.isArray(orders)) {
        console.error('orders не є масивом:', orders);
        showNotification('Помилка: замовлення не завантажено');
        return;
    }

    const [key, order] = sortType.split('-');
    orders.sort((a, b) => {
        let valA, valB;
        if (key === 'date') {
            valA = new Date(a.date);
            valB = new Date(b.date);
        } else if (key === 'total') {
            valA = a.total || 0;
            valB = b.total || 0;
        } else if (key === 'status') {
            valA = (a.status || '').toLowerCase();
            valB = (b.status || '').toLowerCase();
        }
        if (valA < valB) return order === 'asc' ? -1 : 1;
        if (valA > valB) return order === 'asc' ? 1 : -1;
        return 0;
    });
    console.log('Замовлення відсортовано за:', sortType); // Додано логування
    currentPage = 1;
    renderAdmin('orders');
    resetInactivityTimer();
}

async function uploadBulkPrices() {
    const file = document.getElementById('bulk-price-file')?.files[0];
    if (!file) {
        showNotification('Виберіть файл для завантаження!');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const tokenRefreshed = await refreshToken();
            if (!tokenRefreshed) {
                showNotification('Токен відсутній. Будь ласка, увійдіть знову.');
                showSection('admin-login');
                return;
            }

            const lines = e.target.result.split('\n').map(line => line.trim()).filter(line => line);
            let updated = 0;
            for (const line of lines) {
                const parts = line.split(',');
                if (parts.length < 4) continue;
                const id = parseInt(parts[0].trim());
                const product = products.find(p => p.id === id);
                if (!product) continue;
                if (product.type === 'simple') {
                    const price = parseFloat(parts[parts.length - 1].trim());
                    if (!isNaN(price) && price >= 0) {
                        product.price = price;
                        try {
                            const response = await fetchWithAuth(`/api/products/${id}`, {
                                method: 'PUT',
                                body: JSON.stringify(product)
                            });
                            if (!response.ok) {
                                throw new Error(`Помилка оновлення товару #${id}: ${response.statusText}`);
                            }
                            updated++;
                        } catch (e) {
                            console.error(`Помилка оновлення товару #${id}:`, e);
                        }
                    }
                } else if (product.type === 'mattresses') {
                    const sizePart = parts[parts.length - 2].trim();
                    const price = parseFloat(parts[parts.length - 1].trim());
                    if (sizePart.startsWith('Розмір: ')) {
                        const size = sizePart.replace('Розмір: ', '').trim();
                        const sizeObj = product.sizes.find(s => s.name === size);
                        if (sizeObj && !isNaN(price) && price >= 0) {
                            sizeObj.price = price;
                            try {
                                const response = await fetchWithAuth(`/api/products/${id}`, {
                                    method: 'PUT',
                                    body: JSON.stringify(product)
                                });
                                if (!response.ok) {
                                    throw new Error(`Помилка оновлення товару #${id}: ${response.statusText}`);
                                }
                                updated++;
                            } catch (e) {
                                console.error(`Помилка оновлення товару #${id}:`, e);
                            }
                        }
                    }
                }
            }
            renderAdmin('products');
            showNotification(`Оновлено цін для ${updated} товарів!`);
            resetInactivityTimer();
        } catch (err) {
            console.error('Помилка обробки файлу цін:', err);
            showNotification('Помилка обробки файлу цін: ' + err.message);
        }
    };
    reader.readAsText(file);
}

    function exportPrices() {
        const exportData = products
            .filter(p => p.active && p.type !== 'group')
            .map(p => {
                if (p.type === 'simple') {
                    return `${p.id},${p.name},${p.brand || 'Без бренду'},${p.price || '0'}`;
                } else if (p.type === 'mattresses') {
                    return p.sizes.map(s => `${p.id},${p.name},${p.brand || 'Без бренду'},Розмір: ${s.name},${s.price || '0'}`).join('\n');
                }
                return '';
            })
            .filter(line => line)
            .join('\n');
        const blob = new Blob([exportData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'prices-export.txt';
        a.click();
        URL.revokeObjectURL(url);
        showNotification('Ціни експортовано!');
        resetInactivityTimer();
    }

function renderCountdown(product) {
    if (product.saleEnd) {
        const endDate = new Date(product.saleEnd).getTime();
        const now = new Date().getTime();
        const timeLeft = endDate - now;
        if (timeLeft > 0) {
            const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
            const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            return `<span class="sale-countdown">Залишилось: ${days}д ${hours}г ${minutes}хв</span>`;
        }
    }
    return '';
}

function viewOrder(index) {
    const order = orders[index];
    if (order) {
        // Форматуємо дату в локальний часовий пояс
const orderDate = new Date(order.date);
const formattedDate = isNaN(orderDate.getTime())
    ? 'Невідома дата'
    : orderDate.toLocaleString('uk-UA', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
      });

        const modal = document.getElementById('modal');
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Замовлення #${index + 1}</h3>
                <p>Дата: ${formattedDate}</p>
                <p>Статус: ${order.status || 'Н/Д'}</p>
                <p>Сума: ${order.total ? order.total + ' грн' : 'Н/Д'}</p>
                <h4>Дані клієнта:</h4>
                ${
                    order.customer && typeof order.customer === 'object'
                        ? Object.entries(order.customer).map(([key, value]) => {
                              const field = orderFields.find(f => f.name === key);
                              return `<p>${field ? field.label : key}: ${value}</p>`;
                          }).join('')
                        : '<p>Дані клієнта відсутні.</p>'
                }
                <h4>Товари:</h4>
                ${
                    order.items && Array.isArray(order.items) && order.items.length > 0
                        ? order.items.map(item => {
                              const product = products.find(p => p.id === item.id);
                              const colorInfo = item.color && item.color.trim() !== '' ? `, Колір: ${item.color}` : '';
                              return product
                                  ? `<p>${product.name}${colorInfo} - ${item.quantity} шт. - ${item.price} грн</p>`
                                  : `<p>Товар #${item.id} (видалений)${colorInfo} - ${item.quantity} шт. - ${item.price} грн</p>`;
                          }).join('')
                        : '<p>Товари відсутні.</p>'
                }
                <div class="modal-actions">
                    <button onclick="closeModal()">Закрити</button>
                </div>
            </div>
        `;
        modal.classList.add('active');
        resetInactivityTimer();
    } else {
        showNotification('Замовлення не знайдено!');
    }
}

function changeOrderStatus(index) {
    const order = orders[index];
    if (order) {
        const modal = document.getElementById('modal');
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Змінити статус замовлення #${index + 1}</h3>
                <p>Поточний статус: ${order.status || 'Н/Д'}</p>
                <select id="new-order-status">
                    <option value="Нове замовлення" ${order.status === 'Нове замовлення' ? 'selected' : ''}>Нове замовлення</option>
                    <option value="В обробці" ${order.status === 'В обробці' ? 'selected' : ''}>В обробці</option>
                    <option value="Відправлено" ${order.status === 'Відправлено' ? 'selected' : ''}>Відправлено</option>
                    <option value="Завершено" ${order.status === 'Завершено' ? 'selected' : ''}>Завершено</option>
                </select><br/>
                <label for="new-order-status">Новий статус</label>
                <div class="modal-actions">
                    <button onclick="saveOrderStatus(${index})">Зберегти</button>
                    <button onclick="closeModal()">Скасувати</button>
                </div>
            </div>
        `;
        modal.classList.add('active');
        resetInactivityTimer();
    }
}

async function saveOrderStatus(index) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const order = orders[index];
        const newStatus = document.getElementById('new-order-status').value;

        if (!newStatus) {
            showNotification('Виберіть новий статус!');
            return;
        }

        // Очищаємо items від системних полів
        const cleanedItems = order.items.map(item => {
            const { _id, ...cleanedItem } = item;
            return cleanedItem;
        });

        const updatedOrder = {
            status: newStatus,
            date: order.date,
            total: order.total,
            customer: order.customer,
            items: cleanedItems
        };

        const response = await fetchWithAuth(`/api/orders/${order._id}`, {
            method: 'PUT',
            body: JSON.stringify(updatedOrder)
        });

        order.status = newStatus;
        closeModal();
        renderAdmin('orders');
        showNotification('Статус замовлення змінено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення статусу замовлення:', err);
        showNotification('Не вдалося оновити статус замовлення: ' + err.message);
    }
}

async function deleteOrder(index) {
    const order = orders[index];
    if (!order) {
        showNotification('Замовлення не знайдено!');
        return;
    }

    if (confirm('Ви впевнені, що хочете видалити це замовлення?')) {
        try {
            const tokenRefreshed = await refreshToken();
            if (!tokenRefreshed) {
                showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
                showSection('admin-login');
                return;
            }

            const response = await fetchWithAuth(`/api/orders/${order._id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Не вдалося видалити замовлення');
            }

            orders.splice(index, 1);
            renderAdmin('orders');
            showNotification('Замовлення видалено!');
            unsavedChanges = false;
            resetInactivityTimer();
        } catch (err) {
            console.error('Помилка видалення замовлення:', err);
            showNotification('Не вдалося видалити замовлення: ' + err.message);
        }
    }
}

    function sortOrders(criteria) {
        const [key, direction] = criteria.split('-');
        orders.sort((a, b) => {
            let valA = key === 'date' ? new Date(a[key]) : a[key];
            let valB = key === 'date' ? new Date(b[key]) : b[key];
            if (direction === 'asc') {
                return typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB;
            } else {
                return typeof valA === 'string' ? valB.localeCompare(valA) : valB - valA;
            }
        });
        currentPage = 1;
        renderAdmin('orders');
        resetInactivityTimer();
    }

    function filterOrders() {
        currentPage = 1;
        renderAdmin('orders');
        resetInactivityTimer();
    }

document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);

function connectAdminWebSocket(attempt = 1) {
    const wsUrl = window.location.hostname === 'localhost'
        ? 'ws://localhost:3000'
        : 'wss://mebli.onrender.com';
    const token = localStorage.getItem('adminToken');

    if (!token) {
        console.warn('Токен відсутній, WebSocket не підключено');
        showSection('admin-login');
        return;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('WebSocket уже відкрито');
        return;
    }

    socket = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);

    socket.onerror = (error) => {
        console.error('Помилка WebSocket:', error);
        showNotification('Помилка WebSocket-з’єднання');
    };

    socket.onclose = (event) => {
        console.log('WebSocket закрито:', event.code, event.reason);
        if (event.code === 4001) {
            console.warn('Недійсний токен, очищення сесії');
            localStorage.removeItem('adminToken');
            localStorage.removeItem('adminSession');
            showSection('admin-login');
            showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
            return;
        }
        if (attempt <= 3) {
            setTimeout(() => {
                console.log(`Повторна спроба підключення ${attempt}...`);
                connectAdminWebSocket(attempt + 1);
            }, 5000 * attempt);
        } else {
            showNotification('Не вдалося підключитися до WebSocket після кількох спроб');
            showSection('admin-login');
        }
    };

    socket.onopen = () => {
        console.log('Адмін підключено до WebSocket');
        ['products', 'categories', 'settings', 'orders', 'slides', 'materials', 'brands', 'filters'].forEach(type => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type, action: 'subscribe' }));
            }
        });
    };

socket.onmessage = (event) => {
    try {
        const { type, data } = JSON.parse(event.data);
        console.log(`Отримано WebSocket оновлення для ${type}:`, data);

        if (!document.getElementById('admin-panel')) {
            console.warn('Адмін-панель не ініціалізована, пропускаємо WebSocket-оновлення');
            return;
        }

        setTimeout(() => {
            const currentTab = localStorage.getItem('currentAdminTab') || 'site-editing';

            if (type === 'settings') {
                settings = { ...settings, ...data };
                if (document.getElementById('store-name') && currentTab === 'site-editing') {
                    if (typeof renderSettingsAdmin === 'function') {
                        renderSettingsAdmin();
                        console.log('Оновлено settings через WebSocket');
                    }
                }
            } else if (type === 'products') {
                products = Array.isArray(data) ? data : products;
                if (document.getElementById('product-list') && currentTab === 'products') {
                    renderAdmin('products');
                    console.log('Оновлено products через WebSocket:', products.length);
                }
            } else if (type === 'categories') {
                if (Array.isArray(data)) {
                    categories = data;
                    if (document.getElementById('category-list-admin') && currentTab === 'categories') {
                        if (typeof renderCategoriesAdmin === 'function') {
                            renderCategoriesAdmin();
                            console.log('Оновлено categories через WebSocket:', categories.length);
                        }
                    }
                } else {
                    console.warn('Некоректні дані категорій:', data);
                    loadCategories();
                }
            } else if (type === 'orders') {
                orders = Array.isArray(data) ? data : orders;
                if (document.getElementById('order-list') && currentTab === 'orders') {
                    renderAdmin('orders');
                    console.log('Оновлено orders через WebSocket:', orders.length);
                }
            } else if (type === 'slides') {
                slides = Array.isArray(data) ? data : slides;
                if (document.getElementById('slides-list-admin') && currentTab === 'site-editing') {
                    if (typeof renderSlidesAdmin === 'function') {
                        renderSlidesAdmin();
                        console.log('Оновлено slides через WebSocket:', slides.length);
                    }
                }
            } else if (type === 'materials') {
                materials = Array.isArray(data) ? data : materials;
                if (typeof updateMaterialOptions === 'function') {
                    updateMaterialOptions();
                    console.log('Оновлено materials через WebSocket:', materials.length);
                }
            } else if (type === 'brands') {
                brands = Array.isArray(data) ? data : brands;
                if (typeof updateBrandOptions === 'function') {
                    updateBrandOptions();
                    console.log('Оновлено brands через WebSocket:', brands.length);
                }
            } else if (type === 'filters') {
                filters = Array.isArray(data) ? data : filters;
                if (document.getElementById('filter-list') && currentTab === 'filters') {
                    renderAdmin('filters');
                    console.log('Оновлено filters через WebSocket:', filters.length);
                }
            } else if (type === 'error') {
                console.error('WebSocket помилка від сервера:', data);
                showNotification('Помилка WebSocket: ' + (data.error || 'Невідома помилка'));
                if (data.error?.includes('неавторизований')) {
                    localStorage.removeItem('adminToken');
                    localStorage.removeItem('adminSession');
                    showSection('admin-login');
                    showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
                }
            }
        }, 100);
    } catch (e) {
        console.error('Помилка обробки WebSocket-повідомлення:', e);
        showNotification('Помилка обробки WebSocket-повідомлення: ' + e.message);
    }
};
}