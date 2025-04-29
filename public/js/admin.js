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
};
let currentPage = 1;
const productsPerPage = 20;
const ordersPerPage = 20;
const sessionTimeout = 30 * 60 * 1000;
let inactivityTimer;
let materials = [];
let brands = [];
const orderFields = [
    { name: 'name', label: "Ім'я" },
    { name: 'surname', label: 'Прізвище' },
    { name: 'phone', label: 'Телефон' },
    { name: 'email', label: 'Електронна пошта' },
    { name: 'address', label: 'Адреса доставки' },
    { name: 'payment', label: 'Спосіб оплати' }
];
let unsavedChanges = false;
let aboutEditor; // Глобальна змінна для редактора
let productEditor; // Додаємо глобальну змінну для редактора товару
let selectedMedia = null; // Додаємо змінну для зберігання вибраного медіа
let socket;

async function loadProducts() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/products', {
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
            throw new Error(`Не вдалося завантажити товари: ${text}`);
        }

        products = await response.json();
        console.log('Товари завантажено:', products);
        renderAdmin('products');
    } catch (e) {
        console.error('Помилка завантаження товарів:', e);
        showNotification(e.message);
        products = [];
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
            showNotification('Не вдалося оновити токен. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const response = await fetchWithAuth('/api/settings');

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
            throw new Error(`Не вдалося завантажити налаштування: ${text}`);
        }

        const serverSettings = await response.json();
        settings = {
            ...settings,
            name: serverSettings.name || settings.name,
            baseUrl: serverSettings.baseUrl || settings.baseUrl,
            logo: serverSettings.logo || settings.logo,
            logoWidth: serverSettings.logoWidth || settings.logoWidth,
            favicon: serverSettings.favicon || settings.favicon,
            contacts: {
                phones: serverSettings.contacts?.phones || settings.contacts.phones,
                addresses: serverSettings.contacts?.addresses || settings.contacts.addresses,
                schedule: serverSettings.contacts?.schedule || settings.contacts.schedule
            },
            socials: serverSettings.socials || settings.socials,
            showSocials: serverSettings.showSocials !== undefined ? serverSettings.showSocials : settings.showSocials,
            about: serverSettings.about || settings.about,
            showSlides: serverSettings.showSlides !== undefined ? serverSettings.showSlides : settings.showSlides,
            slideWidth: serverSettings.slideWidth || settings.slideWidth,
            slideHeight: serverSettings.slideHeight || settings.slideHeight,
            slideInterval: serverSettings.slideInterval || settings.slideInterval
        };

        console.log('Оновлені settings:', settings);

        // Оновлення редактора "Про нас"
        if (aboutEditor) {
            if (settings.about) {
                try {
                    aboutEditor.root.innerHTML = settings.about;
                    console.log('Встановлено вміст "Про нас":', settings.about);
                } catch (e) {
                    console.error('Помилка при встановленні вмісту "Про нас":', e);
                    aboutEditor.setText(settings.about || '', 'silent');
                }
            } else {
                console.log('settings.about порожній, редактор очищено.');
                aboutEditor.setText('', 'silent');
            }
            const aboutEdit = document.getElementById('about-edit');
            if (aboutEdit) aboutEdit.value = settings.about || '';
        }

        renderSettingsAdmin();
    } catch (e) {
        console.error('Помилка завантаження налаштувань:', e);
        showNotification('Помилка завантаження налаштувань: ' + e.message);
        renderSettingsAdmin();
    }
}

async function fetchWithAuth(url, options = {}) {
    console.log('Request URL:', url);
    console.log('Request Options:', JSON.stringify(options, null, 2));
    const token = localStorage.getItem('adminToken');
    if (!token) {
        throw new Error('Токен відсутній. Увійдіть знову.');
    }

    let csrfToken = localStorage.getItem('csrfToken');
    if (!csrfToken && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH' || options.method === 'DELETE')) {
        try {
            const csrfResponse = await fetch('https://mebli.onrender.com/api/csrf-token', {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include'
            });
            if (!csrfResponse.ok) {
                throw new Error('Не вдалося отримати CSRF-токен');
            }
            const csrfData = await csrfResponse.json();
            csrfToken = csrfData.csrfToken;
            localStorage.setItem('csrfToken', csrfToken);
        } catch (err) {
            console.error('Помилка отримання CSRF-токена:', err);
            throw err;
        }
    }

    const headers = {
        'Authorization': `Bearer ${token}`,
        ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
        ...(csrfToken && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH' || options.method === 'DELETE') ? { 'X-CSRF-Token': csrfToken } : {})
    };

    const response = await fetch(url, {
        ...options,
        headers,
        credentials: 'include'
    });

    if (response.status === 401) {
        const tokenRefreshed = await refreshToken();
        if (tokenRefreshed) {
            const newToken = localStorage.getItem('adminToken');
            const newResponse = await fetch(url, {
                ...options,
                headers: {
                    ...headers,
                    'Authorization': `Bearer ${newToken}`
                },
                credentials: 'include'
            });
            if (!newResponse.ok) {
                const errorData = await newResponse.json().catch(() => ({}));
                console.error('Деталі помилки запиту:', errorData); // Додаємо логування
                const error = new Error(errorData.error || `HTTP error ${newResponse.status}`);
                error.errorData = errorData;
                throw error;
            }
            return newResponse;
        }
    } else if (response.status === 403 && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH' || options.method === 'DELETE')) {
        try {
            const csrfResponse = await fetch('https://mebli.onrender.com/api/csrf-token', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` },
                credentials: 'include'
            });
            if (csrfResponse.ok) {
                const csrfData = await csrfResponse.json();
                localStorage.setItem('csrfToken', csrfData.csrfToken);
                return fetchWithAuth(url, options);
            }
        } catch (err) {
            console.error('Помилка повторного отримання CSRF-токена:', err);
        }
    }

    if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('Помилка запиту:', { url, status: response.status, errorData });
        const error = new Error(errorData.error || `HTTP error ${response.status}`);
        error.errorData = errorData;
        throw error;
    }

    return response;
}

async function updateSocials() {
    const maxRetries = 3;
    let retries = 0;

    while (retries < maxRetries) {
        try {
            const tokenRefreshed = await refreshToken();
            if (!tokenRefreshed) {
                showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
                showSection('admin-login');
                return;
            }

            // Очищаємо socials від _id
            const cleanedSocials = settings.socials.map(({ _id, ...rest }) => rest);

            console.log('Надсилаємо соціальні мережі:', {
                socials: cleanedSocials,
                showSocials: settings.showSocials
            });

            const response = await fetchWithAuth('/api/settings', {
                method: 'PUT',
                body: JSON.stringify({
                    socials: cleanedSocials,
                    showSocials: settings.showSocials
                })
            });

            const serverSettings = await response.json();
            settings = { ...settings, ...serverSettings };
            renderSettingsAdmin();
            renderSocialsAdmin();
            showNotification('Соціальні мережі оновлено!');
            unsavedChanges = false;
            resetInactivityTimer();

            // Оновлюємо відображення на головній сторінці (якщо ми не в адмін-панелі)
            if (typeof renderSocials === 'function' && document.getElementById('contacts-socials')) {
                renderSocials();
            }

            return;
        } catch (err) {
            retries++;
            console.error(`Помилка оновлення соціальних мереж (спроба ${retries}/${maxRetries}):`, err);
            if (retries === maxRetries) {
                showNotification('Помилка оновлення соціальних мереж: ' + err.message);
                // Завантажуємо актуальні налаштування з сервера
                try {
                    const response = await fetchWithAuth('/api/settings', {
                        method: 'GET'
                    });
                    const serverSettings = await response.json();
                    settings = { ...settings, ...serverSettings };
                    renderSettingsAdmin();
                    renderSocialsAdmin();
                } catch (fetchErr) {
                    console.error('Помилка завантаження налаштувань після невдалого оновлення:', fetchErr);
                }
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * retries));
        }
    }
}

async function loadOrders() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            console.warn('Токен відсутній. Завантаження локальних даних для тестування.');
            orders = [];
            sortOrders('date-desc');
            renderAdmin('orders');
            return;
        }

        const response = await fetchWithAuth('/api/orders');

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
        let ordersData = data;
        if (!Array.isArray(data)) {
            if (data.orders && Array.isArray(data.orders)) {
                ordersData = data.orders;
            } else {
                console.error('Очікувався масив замовлень, отримано:', data);
                orders = [];
                showNotification('Отримано некоректні дані замовлень');
                renderAdmin('orders');
                return;
            }
        }

        orders = ordersData;
        sortOrders('date-desc');
        renderAdmin('orders');
    } catch (e) {
        console.error('Помилка завантаження замовлень:', e);
        showNotification('Помилка завантаження замовлень: ' + e.message);
        orders = [];
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

        const response = await fetchWithAuth('/api/slides');

        if (!response.ok) {
            const text = await response.text();
            throw new Error(`Не вдалося завантажити слайди: ${text}`);
        }

        const data = await response.json();
        let slidesData = data;
        if (!Array.isArray(data)) {
            if (data.slides && Array.isArray(data.slides)) {
                slidesData = data.slides;
            } else {
                console.error('Очікувався масив слайдів, отримано:', data);
                slides = [];
                showNotification('Отримано некоректні дані слайдів');
                renderSlidesAdmin();
                return;
            }
        }

        slides = slidesData;
        renderSlidesAdmin();
    } catch (e) {
        console.error('Помилка завантаження слайдів:', e);
        showNotification('Помилка завантаження слайдів: ' + e.message);
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
            loadBrands()
        ]);
        results.forEach((result, index) => {
            if (result.status === 'rejected') {
                console.error(`Помилка завантаження ${['products', 'categories', 'settings', 'orders', 'slides', 'materials', 'brands'][index]}:`, result.reason);
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
            startTokenRefreshTimer();
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

    // Функції для роботи з модальним вікном зміни розмірів
    function openResizeModal(media) {
        // Знітаємо виділення з попереднього елемента
        const previouslySelected = document.querySelector('.quill-media-selected');
        if (previouslySelected) {
            previouslySelected.classList.remove('quill-media-selected');
        }

        // Виділяємо поточний елемент
        media.classList.add('quill-media-selected');
        selectedMedia = media;

        // Отримуємо поточні розміри
        const currentWidth = media.getAttribute('width') || media.style.width || '';
        const currentHeight = media.getAttribute('height') || media.style.height || '';

        // Заповнюємо поля модального вікна
        document.getElementById('media-width').value = currentWidth;
        document.getElementById('media-height').value = currentHeight;

        // Відкриваємо модальне вікно
        const resizeModal = document.getElementById('resize-modal');
        resizeModal.classList.add('active');
        resetInactivityTimer();
    }

    function closeResizeModal() {
        const resizeModal = document.getElementById('resize-modal');
        resizeModal.classList.remove('active');

        // Знітаємо виділення
        if (selectedMedia) {
            selectedMedia.classList.remove('quill-media-selected');
            selectedMedia = null;
        }
        resetInactivityTimer();
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
    const iframes = editor.root.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        if (!iframe.style.width && !iframe.style.height) {
            iframe.style.width = '50%'; // Початкова ширина 50%
            iframe.style.height = '300px'; // Початкова висота
            iframe.style.maxWidth = '100%';
        }
    });
    document.getElementById(editorId).value = editor.root.innerHTML;
    unsavedChanges = true;
}

function initializeEditors() {
    const aboutEditorElement = document.getElementById('about-editor');
    if (!aboutEditorElement) {
        console.warn('Елемент #about-editor не знайдено, пропускаємо ініціалізацію.');
        return;
    }

    if (aboutEditor) {
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
        Quill.register('modules/undo', function(quill) {
            return { undo: () => quill.history.undo() };
        }, true);
        Quill.register('modules/redo', function(quill) {
            return { redo: () => quill.history.redo() };
        }, true);

        aboutEditor = new Quill('#about-editor', {
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

        aboutEditor.on('text-change', () => {
            const content = aboutEditor.root.innerHTML;
            document.getElementById('about-edit').value = content;
            console.log('Вміст редактора змінено:', content);
            unsavedChanges = true;
            resetInactivityTimer();

            const undoButton = document.querySelector('.ql-undo');
            const redoButton = document.querySelector('.ql-redo');
            if (undoButton && redoButton) {
                aboutEditor.history.stack.undo.length > 0
                    ? undoButton.removeAttribute('disabled')
                    : undoButton.setAttribute('disabled', 'true');
                aboutEditor.history.stack.redo.length > 0
                    ? redoButton.removeAttribute('disabled')
                    : redoButton.setAttribute('disabled', 'true');
            }
        });

        // Додаємо MutationObserver для відстеження змін у DOM
        const observer = new MutationObserver(() => {
            console.log('DOM змінено в редакторі');
            resetInactivityTimer();
        });
        observer.observe(aboutEditorElement, { childList: true, subtree: true });

        if (settings.about) {
            try {
                aboutEditor.root.innerHTML = settings.about;
                console.log('Встановлено вміст "Про нас":', settings.about);
            } catch (e) {
                console.error('Помилка при встановленні вмісту "Про нас":', e);
                aboutEditor.setText(settings.about || '', 'silent');
            }
        } else {
            console.log('settings.about порожній, редактор очищено.');
            aboutEditor.setText('', 'silent');
        }
        document.getElementById('about-edit').value = settings.about || '';

        aboutEditor.root.addEventListener('click', (e) => {
            const target = e.target;
            if (target.tagName === 'IMG' || target.tagName === 'IFRAME') {
                openResizeModal(target);
            }
        });

        aboutEditor.clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
            if (node.tagName === 'IMG' || node.tagName === 'IFRAME') {
                const src = node.getAttribute('src');
                if (src) {
                    const insert = node.tagName === 'IMG' ? { image: src } : { video: src };
                    return { ops: [{ insert }] };
                }
            }
            return delta;
        });

        setDefaultVideoSizes(aboutEditor, 'about-edit');
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
        if (sectionId === 'admin-panel') {
            renderAdmin();
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

document.addEventListener('DOMContentLoaded', () => {
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

    // Перевірка сесії
    const storedSession = localStorage.getItem('adminSession');
    const token = localStorage.getItem('adminToken');

    if (storedSession && token) {
        try {
            session = JSON.parse(LZString.decompressFromUTF16(storedSession));
            if (session.isActive && (Date.now() - session.timestamp) < sessionTimeout) {
                checkAuth();
            } else {
                localStorage.removeItem('adminToken');
                localStorage.removeItem('csrfToken');
                session = { isActive: false, timestamp: 0 };
                localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
                showSection('admin-login');
            }
        } catch (e) {
            console.error('Помилка розшифровки сесії:', e);
            localStorage.removeItem('adminToken');
            localStorage.removeItem('csrfToken');
            session = { isActive: false, timestamp: 0 };
            localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
            showSection('admin-login');
        }
    } else {
        session = { isActive: false, timestamp: 0 };
        localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
        showSection('admin-login');
    }

    // Ініціалізація редакторів
    if (document.getElementById('about-editor')) {
        initializeEditors();
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

        // Отримуємо CSRF-токен перед оновленням
        const csrfResponse = await fetch('https://mebli.onrender.com/api/csrf-token', {
            method: 'GET',
            credentials: 'include'
        });

        if (!csrfResponse.ok) {
            throw new Error(`Не вдалося отримати CSRF-токен: ${csrfResponse.statusText}`);
        }

        const csrfData = await csrfResponse.json();
        const csrfToken = csrfData.csrfToken;
        if (!csrfToken) {
            throw new Error('CSRF-токен не отримано');
        }

        const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include'
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
        localStorage.setItem('adminToken', data.token);
        session = { isActive: true, timestamp: Date.now() };
        localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
        console.log('Токен успішно оновлено.');
        return true;
    } catch (err) {
        console.error('Помилка оновлення токена:', err);
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
            notification.textContent = message;
            notification.classList.add('active');
            setTimeout(() => notification.classList.remove('active'), 5000);
        }
    }

    function resetInactivityTimer() {
        clearTimeout(inactivityTimer);
        inactivityTimer = setTimeout(() => {
            logout();
            showNotification('Сесію завершено через 30 хвилин бездіяльності');
        }, sessionTimeout);
    }

function showAdminTab(tabId) {
    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const tab = document.getElementById(tabId);
    if (tab) {
        tab.classList.add('active');
        document.querySelector(`.tab-btn[onclick="showAdminTab('${tabId}')"]`).classList.add('active');
    }
    if (tabId === 'products') {
        activeTab = 'products';
        renderCategoriesAdmin();
        renderAdmin('products');
    } else if (tabId === 'site-editing') {
        activeTab = 'categories';
        renderAdmin('categories');
    } else if (tabId === 'orders') {
        activeTab = 'orders';
        renderAdmin('orders');
    }
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

        // Отримуємо значення полів
        const phones = document.getElementById('contact-phones').value.trim();
        const addresses = document.getElementById('contact-addresses').value.trim();
        const schedule = document.getElementById('contact-schedule').value.trim();

        // Валідація полів
        if (!phones || !addresses || !schedule) {
            showNotification('Усі поля контактів (телефони, адреси, графік) мають бути заповнені.');
            return;
        }

        // Валідація формату телефонів (наприклад, +380 або масив номерів)
        const phoneRegex = /^\+?[0-9\s\-()]{9,}$/;
        if (!phoneRegex.test(phones)) {
            showNotification('Некоректний формат номеру телефону. Використовуйте формат, наприклад, +380123456789.');
            return;
        }

        // Формуємо об'єкт contacts
        const contacts = {
            phones,
            addresses,
            schedule
        };

        // Формуємо дані для відправки (лише contacts)
        const updatedSettings = {
            contacts
        };

        console.log('Надсилаємо контакти:', updatedSettings);

        const baseUrl = settings.baseUrl || 'https://mebli.onrender.com';
        const response = await fetchWithAuth(`${baseUrl}/api/settings`, {
            method: 'PUT',
            body: JSON.stringify(updatedSettings)
        });

        const responseData = await response.json();
        console.log('Отримано відповідь від сервера:', responseData);

        // Оновлюємо локальні settings
        settings.contacts = responseData.contacts || contacts;
        settings.name = responseData.name || settings.name;

        showNotification('Контакти успішно оновлено!');
        renderSettingsAdmin(); // Оновлюємо UI
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка при оновленні контактів:', err);
        let errorMessage = 'Помилка при оновленні контактів: ' + err.message;
        if (err.errorData) {
            errorMessage += '\nДеталі: ' + JSON.stringify(err.errorData, null, 2);
            console.error('Деталі помилки сервера:', err.errorData);
        }
        showNotification(errorMessage);
    }
}

async function addSocial() {
    const url = document.getElementById('social-url').value.trim();
    const icon = document.getElementById('social-icon').value;
    const nameInput = document.getElementById('social-name')?.value.trim() || '';

    if (!url) {
        showNotification('Введіть URL соцмережі!');
        return;
    }

    if (!nameInput || nameInput.length < 2) {
        showNotification('Назва соцмережі повинна містити принаймні 2 символи!');
        return;
    }

    const urlRegex = /^(https?:\/\/[^\s$.?#].[^\s]*)$/;
    if (!urlRegex.test(url)) {
        showNotification('Введіть коректний URL (наприклад, https://facebook.com)!');
        return;
    }

    settings.socials = settings.socials || [];
    settings.socials.push({ url, icon, name: nameInput });
    document.getElementById('social-url').value = '';
    document.getElementById('social-icon').value = '🔗';
    if (document.getElementById('social-name')) {
        document.getElementById('social-name').value = '';
    }
    await updateSocials();
}

async function editSocial(index) {
    const social = settings.socials[index];
    const url = prompt('Введіть новий URL соцмережі:', social.url);
    if (url === null) return; // Користувач скасував

    const name = prompt('Введіть нову назву соцмережі:', social.name || '');
    if (name === null) return; // Користувач скасував

    const urlRegex = /^(https?:\/\/[^\s$.?#].[^\s]*)$/;
    if (!url || !urlRegex.test(url)) {
        showNotification('Введіть коректний URL (наприклад, https://facebook.com)!');
        return;
    }

    if (!name.trim() || name.trim().length < 2) {
        showNotification('Назва соцмережі повинна містити принаймні 2 символи!');
        return;
    }

    // Створюємо тимчасовий select для вибору іконки
    const iconSelect = document.createElement('select');
    iconSelect.innerHTML = `
        <option value="🔗" ${social.icon === '🔗' ? 'selected' : ''}>Загальний (🔗)</option>
        <option value="📘" ${social.icon === '📘' ? 'selected' : ''}>Facebook (📘)</option>
        <option value="📸" ${social.icon === '📸' ? 'selected' : ''}>Instagram (📸)</option>
        <option value="🐦" ${social.icon === '🐦' ? 'selected' : ''}>Twitter (🐦)</option>
        <option value="▶️" ${social.icon === '▶️' ? 'selected' : ''}>YouTube (▶️)</option>
        <option value="✈️" ${social.icon === '✈️' ? 'selected' : ''}>Telegram (✈️)</option>
    `;
    const iconPrompt = document.createElement('div');
    iconPrompt.innerHTML = '<label>Виберіть іконку:</label>';
    iconPrompt.appendChild(iconSelect);
    document.body.appendChild(iconPrompt);

    // Показуємо модальне вікно або чекаємо вибору
    const confirmEdit = confirm('Підтвердіть редагування соцмережі');
    if (confirmEdit) {
        settings.socials[index].url = url;
        settings.socials[index].icon = iconSelect.value;
        settings.socials[index].name = name.trim();
        await updateSocials();
    }

    // Прибираємо тимчасовий елемент
    document.body.removeChild(iconPrompt);
}

async function deleteSocial(index) {
    if (confirm('Ви впевнені, що хочете видалити цю соцмережу?')) {
        settings.socials.splice(index, 1);
        await updateSocials();
    }
}

async function toggleSocials() {
    settings.showSocials = document.getElementById('social-toggle').checked;
    await updateSocials();
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

function renderAdmin(section = activeTab) {
    console.log('Рендеринг адмін-панелі з activeTab:', section, 'settings:', settings);

    try {
        // Оновлення полів налаштувань
        const storeName = document.getElementById('store-name');
        if (storeName) storeName.value = settings.name || '';
        else console.warn('Елемент #store-name не знайдено');

        const baseUrl = document.getElementById('base-url');
        if (baseUrl) baseUrl.value = settings.baseUrl || '';
        else console.warn('Елемент #base-url не знайдено');

        const logoUrl = document.getElementById('logo-url');
        if (logoUrl) logoUrl.value = settings.logo || '';
        else console.warn('Елемент #logo-url не знайдено');

        const logoWidth = document.getElementById('logo-width');
        if (logoWidth) logoWidth.value = settings.logoWidth || 150;
        else console.warn('Елемент #logo-width не знайдено');

        const faviconUrl = document.getElementById('favicon-url');
        if (faviconUrl) faviconUrl.value = settings.favicon || '';
        else console.warn('Елемент #favicon-url не знайдено');

        const contacts = settings.contacts || { phones: '', addresses: '', schedule: '' };
        const contactPhones = document.getElementById('contact-phones');
        if (contactPhones) contactPhones.value = contacts.phones || '';
        else console.warn('Елемент #contact-phones не знайдено');

        const contactAddresses = document.getElementById('contact-addresses');
        if (contactAddresses) contactAddresses.value = contacts.addresses || '';
        else console.warn('Елемент #contact-addresses не знайдено');

        const contactSchedule = document.getElementById('contact-schedule');
        if (contactSchedule) contactSchedule.value = contacts.schedule || '';
        else console.warn('Елемент #contact-schedule не знайдено');

        // Ініціалізація редактора "Про нас"
        if (document.getElementById('about-editor')) {
            if (!aboutEditor) {
                initializeEditors();
            }
            try {
                if (settings.aboutDelta) {
                    aboutEditor.setContents(settings.aboutDelta, 'silent');
                } else if (settings.about) {
                    const delta = aboutEditor.clipboard.convert(settings.about);
                    aboutEditor.setContents(delta, 'silent');
                } else {
                    aboutEditor.setContents([], 'silent');
                }
                const aboutEdit = document.getElementById('about-edit');
                if (aboutEdit) aboutEdit.value = aboutEditor.root.innerHTML;
            } catch (e) {
                console.error('Помилка ініціалізації aboutEditor:', e);
                showNotification('Помилка завантаження даних для сторінки "Про нас"');
            }
        } else if (document.getElementById('about-edit')) {
            const aboutEdit = document.getElementById('about-edit');
            aboutEdit.value = settings.about || '';
        } else {
            console.warn('Елементи #about-editor або #about-edit не знайдено');
        }

        const socialToggle = document.getElementById('social-toggle');
        if (socialToggle) socialToggle.checked = settings.showSocials !== false;
        else console.warn('Елемент #social-toggle не знайдено');

        const slideToggle = document.getElementById('slide-toggle');
        if (slideToggle) slideToggle.checked = settings.showSlides !== false;
        else console.warn('Елемент #slide-toggle не знайдено');

        const slideWidth = document.getElementById('slide-width');
        if (slideWidth) slideWidth.value = settings.slideWidth || 75;
        else console.warn('Елемент #slide-width не знайдено');

        const slideHeight = document.getElementById('slide-height');
        if (slideHeight) slideHeight.value = settings.slideHeight || 200;
        else console.warn('Елемент #slide-height не знайдено');

        const slideInterval = document.getElementById('slide-interval');
        if (slideInterval) slideInterval.value = settings.slideInterval || 3000;
        else console.warn('Елемент #slide-interval не знайдено');

        renderSocialsAdmin();

        const catList = document.getElementById('category-list-admin');
        if (catList) {
            console.log('Рендеринг category-list-admin, categories:', categories);
            catList.innerHTML = categories && Array.isArray(categories) && categories.length > 0
                ? categories.map((c, index) => `
                    <div class="category-item">
                        <button class="move-btn move-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
                        <button class="move-btn move-down" data-index="${index}" ${index === categories.length - 1 ? 'disabled' : ''}>↓</button>
                        ${c.name} (${c.slug}) 
                        <button class="edit-btn" data-id="${c._id}">Редагувати</button> 
                        <button class="delete-btn" data-id="${c._id}>Видалити</button>
                    </div>
                    <div class="subcat-list">
                        ${(c.subcategories && Array.isArray(c.subcategories) ? c.subcategories : []).map((sub, subIndex) => `
                            <p>
                                <button class="move-btn sub-move-up" data-cat-id="${c._id}" data-sub-index="${subIndex}" ${subIndex === 0 ? 'disabled' : ''}>↑</button>
                                <button class="move-btn sub-move-down" data-cat-id="${c._id}" data-sub-index="${subIndex}" ${subIndex === (c.subcategories.length - 1) ? 'disabled' : ''}>↓</button>
                                ${sub.name} (${sub.slug}) 
                                <button class="edit-btn sub-edit" data-cat-id="${c._id}" data-sub-name="${sub.name}">Редагувати</button> 
                                <button class="delete-btn sub-delete" data-cat-id="${c._id}" data-sub-name="${sub.name}">Видалити</button>
                            </p>
                        `).join('')}
                    </div>
                `).join('')
                : '<p>Категорії відсутні</p>';
            catList.removeEventListener('click', handleCatListClick);
            catList.addEventListener('click', handleCatListClick);
        } else {
            console.warn('Елемент #category-list-admin не знайдено');
        }

        function handleCatListClick(event) {
            const target = event.target;
            const categoryId = target.dataset.id;
            const subName = target.dataset.subName;
            const catId = target.dataset.catId;
            const subIndex = target.dataset.subIndex ? parseInt(target.dataset.subIndex) : null;
            const index = target.dataset.index ? parseInt(target.dataset.index) : null;

            if (target.classList.contains('move-up') && index !== null) {
                moveCategoryUp(index);
            } else if (target.classList.contains('move-down') && index !== null) {
                moveCategoryDown(index);
            } else if (target.classList.contains('edit-btn') && !target.classList.contains('sub-edit') && categoryId) {
                openEditCategoryModal(categoryId);
            } else if (target.classList.contains('delete-btn') && !target.classList.contains('sub-delete') && categoryId) {
                deleteCategory(categoryId);
            } else if (target.classList.contains('sub-move-up') && catId && subIndex !== null) {
                moveSubcategoryUp(catId, subIndex);
            } else if (target.classList.contains('sub-move-down') && catId && subIndex !== null) {
                moveSubcategoryDown(catId, subIndex);
            } else if (target.classList.contains('sub-edit') && catId && subName) {
                openEditSubcategoryModal(catId, subName);
            } else if (target.classList.contains('sub-delete') && catId && subName) {
                deleteSubcategory(catId, subName);
            }
        }

        if (section === 'products') {
            const productList = document.getElementById('product-list-admin');
            if (productList) {
                const start = (currentPage - 1) * productsPerPage;
                const end = start + productsPerPage;
                productList.innerHTML = Array.isArray(products) && products.length > 0
                    ? products.slice(start, end).map(p => {
                        const priceInfo = p.type === 'simple'
                            ? (p.salePrice && p.salePrice < p.price
                                ? `<s>${p.price} грн</s> ${p.salePrice} грн`
                                : `${p.price || '0'} грн`)
                            : (p.sizes?.length > 0
                                ? `від ${Math.min(...p.sizes.map(s => s.price))} грн`
                                : 'Ціна не вказана');
                        return `
                            <div class="product-admin-item">
                                <span>#${p.id || p._id}</span>
                                <span>${p.type}</span>
                                <span>${p.name}</span>
                                <span>${p.brand || 'Без бренду'}</span>
                                <span>${priceInfo}</span>
                                <span>${p.salePrice || '-'}</span>
                                <div class="status-column">
                                    <button onclick="openEditProductModal('${p._id}')">Редагувати</button>
                                    <button onclick="deleteProduct('${p._id}')">Видалити</button>
                                    <button onclick="toggleProductActive('${p._id}', ${p.active})">${p.active ? 'Деактивувати' : 'Активувати'}</button>
                                </div>
                            </div>
                        `;
                    }).join('')
                    : '<p>Товари відсутні</p>';
                renderPagination(products.length, productsPerPage, 'pagination', currentPage);
            } else {
                console.warn('Елемент #product-list-admin не знайдено');
            }
        } else if (section === 'orders') {
            const orderList = document.getElementById('order-list');
            if (orderList) {
                const statusFilter = document.getElementById('order-status-filter')?.value || '';
                let filteredOrders = Array.isArray(orders) ? [...orders] : [];
                if (statusFilter) {
                    filteredOrders = filteredOrders.filter(o => o.status === statusFilter);
                }
                const start = (currentPage - 1) * ordersPerPage;
                const end = start + ordersPerPage;
                const paginatedOrders = filteredOrders.slice(start, end);
                orderList.innerHTML = paginatedOrders.length > 0
                    ? paginatedOrders.map((o, index) => {
                        const orderDate = new Date(o.date);
                        const formattedDate = orderDate.toLocaleString('uk-UA', {
                            timeZone: settings.timezone || 'Europe/Kyiv',
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                            second: '2-digit'
                        });
                        return `
                            <div class="order-item">
                                <span>#${start + index + 1} ${formattedDate} - ${o.total} грн (${o.status})</span>
                                <div>
                                    <button class="edit-btn" onclick="viewOrder(${orders.indexOf(o)})">Переглянути</button>
                                    <button class="toggle-btn" onclick="changeOrderStatus(${orders.indexOf(o)})">Змінити статус</button>
                                    <button class="delete-btn" onclick="deleteOrder(${orders.indexOf(o)})">Видалити</button>
                                </div>
                            </div>
                        `;
                    }).join('')
                    : '<p>Замовлення відсутні</p>';
                renderPagination(filteredOrders.length, ordersPerPage, 'order-pagination', currentPage);
            } else {
                console.warn('Елемент #order-list не знайдено');
            }
        } else if (section === 'categories') {
            if (typeof renderCategoriesAdmin === 'function') {
                renderCategoriesAdmin();
            } else {
                console.warn('Функція renderCategoriesAdmin не визначена');
            }
        } else if (section === 'site-editing') {
            if (typeof renderSettingsAdmin === 'function') renderSettingsAdmin();
            if (typeof renderSlidesAdmin === 'function') renderSlidesAdmin();
        } else {
            console.warn(`Невідома вкладка: ${section}`);
        }

        resetInactivityTimer();
    } catch (e) {
        console.error(`Помилка рендерингу вкладки ${section}:`, e);
        showNotification(`Помилка рендерингу вкладки ${section}: ${e.message}`);
    }
}

function renderCategoriesAdmin() {
    const categoryList = document.getElementById('category-list-admin');
    if (!categoryList) {
        console.error('Елемент #category-list-admin не знайдено');
        return;
    }

    categoryList.innerHTML = categories.map((category, index) => `
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
                ${category.subcategories && Array.isArray(category.subcategories) && category.subcategories.length > 0 ? category.subcategories.map((sub, subIndex) => `
                    <div class="subcategory-item">
                        <div class="subcategory-order-controls">
                            <button class="move-btn sub-move-up" data-cat-id="${category._id}" data-sub-id="${sub._id}" ${subIndex === 0 ? 'disabled' : ''}>↑</button>
                            <button class="move-btn sub-move-down" data-cat-id="${category._id}" data-sub-id="${sub._id}" ${subIndex === (category.subcategories.length - 1) ? 'disabled' : ''}>↓</button>
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
                `).join('') : '<p>Підкатегорії відсутні</p>'}
            </div>
        </div>
    `).join('');

    // Видаляємо попередні слухачі подій
    const newCategoryList = categoryList.cloneNode(true);
    categoryList.parentNode.replaceChild(newCategoryList, categoryList);

    // Додаємо нові слухачі подій
    newCategoryList.addEventListener('click', (event) => {
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
            const subId = target.dataset.subId;
            const category = categories.find(c => c._id === catId);
            if (category && category.subcategories) {
                const subIndex = category.subcategories.findIndex(s => s._id === subId);
                if (subIndex !== -1) {
                    moveSubcategoryUp(catId, subIndex);
                }
            }
        } else if (target.classList.contains('sub-move-down')) {
            const catId = target.dataset.catId;
            const subId = target.dataset.subId;
            const category = categories.find(c => c._id === catId);
            if (category && category.subcategories) {
                const subIndex = category.subcategories.findIndex(s => s._id === subId);
                if (subIndex !== -1) {
                    moveSubcategoryDown(catId, subIndex);
                }
            }
        } else if (target.classList.contains('sub-edit')) {
            const catId = target.dataset.catId;
            const subId = target.dataset.subId;
            openEditSubcategoryModal(catId, subId);
        } else if (target.classList.contains('sub-delete')) {
            const catId = target.dataset.catId;
            const subId = target.dataset.subId;
            deleteSubcategory(catId, subId);
        }
    });

    // Оновлюємо випадаючі списки
    const subcatSelect = document.getElementById('subcategory-category');
    if (subcatSelect) {
        const currentValue = subcatSelect.value;
        subcatSelect.innerHTML = '<option value="">Виберіть категорію</option>' +
            categories.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
        subcatSelect.value = currentValue || '';
    }

    const productCatSelect = document.getElementById('product-category');
    if (productCatSelect) {
        const currentValue = productCatSelect.value;
        productCatSelect.innerHTML = '<option value="">Без категорії</option>' +
            categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        productCatSelect.value = currentValue || '';
        updateSubcategories();
    }

    resetInactivityTimer();
}

function renderSocialsAdmin() {
    const socialList = document.getElementById('social-list');
    if (!socialList) return;

    // Якщо showSocials вимкнено, показуємо повідомлення, але дозволяємо редагувати список
    if (!settings.showSocials) {
        socialList.innerHTML = '<p>Соціальні мережі відключені (не відображаються на сайті)</p>';
    } else {
        socialList.innerHTML = '';
    }

    // Завжди показуємо список соціальних мереж для редагування
    const socialItems = settings.socials && Array.isArray(settings.socials)
        ? settings.socials.map((social, index) => `
            <div class="social-item">
                <span class="social-icon">${social.icon}</span>
                <span>${social.name} (${social.url})</span>
                <button class="edit-btn" onclick="editSocial(${index})">Редагувати</button>
                <button class="delete-btn" onclick="deleteSocial(${index})">Видалити</button>
            </div>
        `).join('')
        : '<p>Соціальні мережі відсутні</p>';

    socialList.innerHTML += socialItems;
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

        const response = await fetchWithAuth(`/api/categories/${categoryId}`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
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
    const storeName = document.getElementById('store-name');
    if (storeName) storeName.value = settings.name || '';

    const baseUrl = document.getElementById('base-url');
    if (baseUrl) baseUrl.value = settings.baseUrl || '';

    const logoUrl = document.getElementById('logo-url');
    if (logoUrl) logoUrl.value = settings.logo || '';

    const logoWidth = document.getElementById('logo-width');
    if (logoWidth) logoWidth.value = settings.logoWidth || '';

    const faviconUrl = document.getElementById('favicon-url');
    if (faviconUrl) faviconUrl.value = settings.favicon || '';

    const contactPhones = document.getElementById('contact-phones');
    if (contactPhones) contactPhones.value = settings.contacts.phones || '';

    const contactAddresses = document.getElementById('contact-addresses');
    if (contactAddresses) contactAddresses.value = settings.contacts.addresses || '';

    const contactSchedule = document.getElementById('contact-schedule');
    if (contactSchedule) contactSchedule.value = settings.contacts.schedule || '';

    const socialToggle = document.getElementById('social-toggle');
    if (socialToggle) socialToggle.checked = settings.showSocials;

    renderSocialsAdmin(); // Викликаємо функцію для соціальних мереж

    const slideWidth = document.getElementById('slide-width');
    if (slideWidth) slideWidth.value = settings.slideWidth || '';

    const slideHeight = document.getElementById('slide-height');
    if (slideHeight) slideHeight.value = settings.slideHeight || '';

    const slideInterval = document.getElementById('slide-interval');
    if (slideInterval) slideInterval.value = settings.slideInterval || '';

    const slideToggle = document.getElementById('slide-toggle');
    if (slideToggle) slideToggle.checked = settings.showSlides;
}

function openNewSlideModal() {
    const modal = document.getElementById('modal');
    if (!modal) {
        console.error('Модальне вікно #modal не знайдено');
        showNotification('Помилка: модальне вікно не знайдено');
        return;
    }

    modal.innerHTML = `
        <div class="modal-content">
            <span class="modal-close" onclick="closeModal()">&times;</span>
            <h3>Додати новий слайд</h3>
            <form id="new-slide-form" onsubmit="event.preventDefault(); addSlide();">
                <input id="slide-photo-url" placeholder="URL картинки" type="text"/>
                <label for="slide-photo-url">URL зображення слайду</label>
                <input accept="image/*" id="slide-photo-file" type="file"/>
                <label for="slide-photo-file">Завантажте зображення</label>
                <input id="slide-title" placeholder="Заголовок слайду" type="text"/>
                <label for="slide-title">Заголовок слайду</label>
                <input id="slide-text" placeholder="Текст слайду" type="text"/>
                <label for="slide-text">Текст слайду</label>
                <input id="slide-link" placeholder="Посилання" type="text"/>
                <label for="slide-link">Посилання слайду</label>
                <input id="slide-link-text" placeholder="Текст посилання" type="text"/>
                <label for="slide-link-text">Текст посилання</label>
                <input id="slide-order" placeholder="Порядковий номер" type="number"/>
                <label for="slide-order">Порядок слайду</label>
                <button type="submit">Додати слайд</button>
            </form>
        </div>
    `;
    modal.style.display = 'block';
}

function renderSlidesAdmin() {
    const slidesList = document.getElementById('slides-list-admin');
    if (!slidesList) {
        console.warn('Елемент #slides-list-admin не знайдено');
        return;
    }

    console.log('Рендеринг слайдів:', slides);
    slidesList.innerHTML = Array.isArray(slides) && slides.length > 0
        ? slides.map((s, index) => `
            <div class="slide">
                <img src="${s.image || s.photo || ''}" alt="Слайд ${index + 1}" width="100">
                <button onclick="deleteSlide(${index})">Видалити</button>
            </div>
        `).join('')
        : '<p>Слайди відсутні</p>';

    const addSlideBtn = document.getElementById('add-slide-btn');
    if (addSlideBtn) {
        addSlideBtn.removeEventListener('click', openNewSlideModal);
        addSlideBtn.addEventListener('click', openNewSlideModal);
    } else {
        console.warn('Елемент #add-slide-btn не знайдено');
    }

    resetInactivityTimer();
}

    function renderPagination(totalItems, itemsPerPage, containerId, currentPage) {
        const totalPages = Math.ceil(totalItems / itemsPerPage);
        const container = document.getElementById(containerId);
        container.innerHTML = '';
        if (totalPages <= 1) return;

        if (currentPage > 1) {
            const prevBtn = document.createElement('button');
            prevBtn.textContent = 'Попередня';
            prevBtn.onclick = () => { currentPage--; renderAdmin(containerId === 'pagination' ? 'products' : 'orders'); };
            container.appendChild(prevBtn);
        }

        for (let i = 1; i <= totalPages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            btn.className = i === currentPage ? 'active' : '';
            btn.onclick = () => { currentPage = i; renderAdmin(containerId === 'pagination' ? 'products' : 'orders'); };
            container.appendChild(btn);
        }

        if (currentPage < totalPages) {
            const nextBtn = document.createElement('button');
            nextBtn.textContent = 'Наступна';
            nextBtn.onclick = () => { currentPage++; renderAdmin(containerId === 'pagination' ? 'products' : 'orders'); };
            container.appendChild(nextBtn);
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
    if (!category) {
        showNotification('Категорія не знайдена!');
        return;
    }

    const modal = document.getElementById('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Редагувати категорію #${categoryId}</h3>
            <input type="text" id="category-name" value="${category.name}" required><br/>
            <label for="category-name">Назва категорії</label>
            <input type="text" id="category-slug" value="${category.slug || ''}" required><br/>
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
            console.error('Елементи форми відсутні:', {
                nameInput: !!nameInput,
                slugInput: !!slugInput,
                photoUrlInput: !!photoUrlInput,
                photoFileInput: !!photoFileInput,
                visibleSelect: !!visibleSelect
            });
            showNotification('Елементи форми для редагування категорії не знайдено.');
            return;
        }

        const name = nameInput.value.trim();
        const slug = slugInput.value.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const visible = visibleSelect.value === 'true';
        let photo = photoUrlInput.value.trim();

        // Клієнтська валідація
        if (!name || !slug) {
            showNotification('Назва та шлях категорії є обов’язковими!');
            return;
        }

        if (!/^[a-z0-9-]+$/.test(slug)) {
            showNotification('Шлях категорії може містити лише малі літери, цифри та дефіси!');
            return;
        }

        // Перевірка унікальності slug
        const slugCheck = await fetchWithAuth(`/api/categories?slug=${encodeURIComponent(slug)}`);
        const existingCategories = await slugCheck.json();
        if (existingCategories.some(c => c.slug === slug && c._id !== categoryId)) {
            showNotification('Шлях категорії має бути унікальним!');
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

        const category = categories.find(c => c._id === categoryId);
        if (!category) {
            showNotification('Категорія не знайдена!');
            return;
        }

        const updatedCategory = {
            name,
            slug,
            photo: photo || category.photo || '',
            visible,
            order: category.order || 0,
            subcategories: (category.subcategories || []).map(sub => ({
                _id: sub._id,
                name: sub.name,
                slug: sub.slug,
                photo: sub.photo || '',
                visible: sub.visible,
                order: sub.order || 0
            }))
        };

        console.log('Надсилаємо дані для оновлення категорії:', JSON.stringify(updatedCategory, null, 2));

        const response = await fetchWithAuth(`/api/categories/${categoryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(updatedCategory)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Помилка сервера:', JSON.stringify(errorData, null, 2));
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
        console.error('Помилка при оновленні категорії:', err);
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
        const slug = slugInput.value.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

        const category = {
            name,
            slug,
            photo,
            visible,
            subcategories: [],
            order: categories.length
        };

        console.log('Дані для сервера:', JSON.stringify(category, null, 2));

        const response = await fetchWithAuth('/api/categories', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
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
    if (index <= 0 || index >= categories.length) return;
    try {
        const categoryOrder = {
            categories: categories.map((cat, idx) => ({
                _id: cat._id,
                order: idx === index ? idx - 1 : idx === index - 1 ? idx : idx
            })).filter(item => item._id && /^[0-9a-fA-F]{24}$/.test(item._id))
        };

        console.log('Надсилаємо дані для зміни порядку категорій:', JSON.stringify(categoryOrder, null, 2));

        const response = await fetchWithAuth('/api/categories/order', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(categoryOrder)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Помилка сервера:', JSON.stringify(errorData, null, 2));
            throw new Error(`Не вдалося змінити порядок: ${errorData.error || response.statusText}`);
        }

        // Оновлюємо локальний масив
        [categories[index], categories[index - 1]] = [categories[index - 1], categories[index]];
        categories.forEach((cat, idx) => {
            cat.order = idx;
        });

        renderCategoriesAdmin();
        showNotification('Порядок категорій змінено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка зміни порядку категорій:', err);
        showNotification('Не вдалося змінити порядок: ' + err.message);
    }
}

async function moveCategoryDown(index) {
    if (index >= categories.length - 1 || index < 0) return;
    try {
        const categoryOrder = {
            categories: categories.map((cat, idx) => ({
                _id: cat._id,
                order: idx === index ? idx + 1 : idx === index + 1 ? idx : idx
            })).filter(item => item._id && /^[0-9a-fA-F]{24}$/.test(item._id))
        };

        console.log('Надсилаємо дані для зміни порядку категорій:', JSON.stringify(categoryOrder, null, 2));

        const response = await fetchWithAuth('/api/categories/order', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(categoryOrder)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Помилка сервера:', JSON.stringify(errorData, null, 2));
            throw new Error(`Не вдалося змінити порядок: ${errorData.error || response.statusText}`);
        }

        // Оновлюємо локальний масив
        [categories[index], categories[index + 1]] = [categories[index + 1], categories[index]];
        categories.forEach((cat, idx) => {
            cat.order = idx;
        });

        renderCategoriesAdmin();
        showNotification('Порядок категорій змінено!');
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
        const slug = slugInput.value.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const visible = visibleSelect.value === 'true';
        let photo = photoUrlInput.value.trim();

        // Клієнтська валідація
        if (!name || !slug) {
            showNotification('Назва та шлях підкатегорії є обов’язковими!');
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

        const subcategory = category.subcategories.find(s => s._id === subcategoryId);
        if (!subcategory) {
            showNotification('Підкатегорія не знайдена!');
            return;
        }

        // Перевірка унікальності slug
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
            photo: photo || subcategory.photo || '',
            visible,
            order: subcategory.order || 0
        };

        console.log('Надсилаємо дані для оновлення підкатегорії:', JSON.stringify(updatedSubcategory, null, 2));

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
            console.error('Помилка сервера:', JSON.stringify(errorData, null, 2));
            throw new Error(`Не вдалося оновити підкатегорію: ${errorData.error || response.statusText}`);
        }

        const updatedCategory = await response.json();
        const catIndex = categories.findIndex(c => c._id === categoryId);
        if (catIndex !== -1) {
            categories[catIndex] = updatedCategory;
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
        const slug = slugInput.value.trim() || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
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

        const newSubcategory = {
            name,
            slug,
            photo,
            visible,
            order: category.subcategories.length
        };

        console.log('Дані нової підкатегорії:', JSON.stringify(newSubcategory, null, 2));

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
            <input type="text" id="subcategory-name" value="${subcategory.name}" required><br/>
            <label for="subcategory-name">Назва підкатегорії</label>
            <input type="text" id="subcategory-slug" value="${subcategory.slug}" required><br/>
            <label for="subcategory-slug">Шлях підкатегорії</label>
            <input type="text" id="subcategory-photo-url" value="${subcategory.photo || ''}" placeholder="URL фотографії"><br/>
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

async function saveSubcategoryEdit(categoryId, originalSubcatName) {
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
        const visible = visibleSelect.value === 'true';
        let photo = photoUrlInput.value.trim();

        // Клієнтська валідація
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
        if (category.subcategories.some(s => s.slug === slug && s.name !== originalSubcatName)) {
            showNotification('Шлях підкатегорії має бути унікальним у цій категорії!');
            return;
        }

        // Завантаження нового фото, якщо вибрано
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
                body: formData
            });
            if (!response.ok) {
                throw new Error('Помилка завантаження зображення');
            }
            const data = await response.json();
            photo = data.url;
        }

        const subcatIndex = category.subcategories.findIndex(s => s.name === originalSubcatName);
        if (subcatIndex === -1) {
            showNotification('Підкатегорія не знайдена!');
            return;
        }

        const existingSubcat = category.subcategories[subcatIndex];
        category.subcategories[subcatIndex] = {
            _id: existingSubcat._id, // Зберігаємо _id
            name,
            slug,
            photo: photo || existingSubcat.photo || '',
            visible
        };

        const updatedData = {
            subcategories: category.subcategories.map(subcat => ({
                _id: subcat._id,
                name: subcat.name,
                slug: subcat.slug,
                photo: subcat.photo || '',
                visible: subcat.visible
            }))
        };
        console.log('Оновлені дані для сервера:', updatedData);

        const response = await fetchWithAuth(`/api/categories/${categoryId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken')
            },
            body: JSON.stringify(updatedData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Деталі помилки сервера:', JSON.stringify(errorData, null, 2));
            throw new Error(`Не вдалося оновити підкатегорію: ${errorData.error || response.statusText}`);
        }

        const updatedCategory = await response.json();
        const index = categories.findIndex(c => c._id === categoryId);
        categories[index] = updatedCategory;
        closeModal();
        renderCategoriesAdmin();
        showNotification('Підкатегорію оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка редагування підкатегорії:', err);
        showNotification('Не вдалося оновити підкатегорію: ' + err.message);
    }
}

async function deleteSubcategory(categoryId, subcategoryId) {
    if (!confirm('Ви впевнені, що хочете видалити цю підкатегорію? Усі товари в цій підкатегорії втратять прив’язку до неї.')) {
        return;
    }

    try {
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

        const response = await fetchWithAuth(`/api/categories/${categoryId}/subcategories/${subcategoryId}`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Не вдалося видалити підкатегорію: ${errorData.error || response.statusText}`);
        }

        const updatedCategory = await response.json();
        const index = categories.findIndex(c => c._id === categoryId);
        categories[index] = updatedCategory;

        products.forEach(p => {
            if (p.subcategory === subcategory.name && p.category === category.name) {
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

async function moveSubcategoryUp(categoryId, subIndex) {
    const category = categories.find(cat => cat._id === categoryId);
    if (!category || subIndex <= 0 || subIndex >= category.subcategories.length) return;
    try {
        const subcategoriesOrder = {
            subcategories: category.subcategories.map((subcat, idx) => ({
                _id: subcat._id,
                order: idx === subIndex ? idx - 1 : idx === subIndex - 1 ? idx : idx
            })).filter(item => item._id && /^[0-9a-fA-F]{24}$/.test(item._id))
        };

        console.log('Надсилаємо дані для зміни порядку підкатегорій:', JSON.stringify(subcategoriesOrder, null, 2));

        const response = await fetchWithAuth(`/api/categories/${categoryId}/subcategories/order`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(subcategoriesOrder)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Помилка сервера:', JSON.stringify(errorData, null, 2));
            throw new Error(`Не вдалося змінити порядок: ${errorData.error || response.statusText}`);
        }

        // Оновлюємо локальний масив
        [category.subcategories[subIndex], category.subcategories[subIndex - 1]] = [
            category.subcategories[subIndex - 1],
            category.subcategories[subIndex]
        ];
        category.subcategories.forEach((subcat, idx) => {
            subcat.order = idx;
        });

        renderCategoriesAdmin();
        showNotification('Порядок підкатегорій змінено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка зміни порядку підкатегорій:', err);
        showNotification('Не вдалося змінити порядок: ' + err.message);
    }
}

async function moveSubcategoryDown(categoryId, subIndex) {
    const category = categories.find(cat => cat._id === categoryId);
    if (!category || subIndex >= category.subcategories.length - 1 || subIndex < 0) return;
    try {
        const subcategoriesOrder = {
            subcategories: category.subcategories.map((subcat, idx) => ({
                _id: subcat._id,
                order: idx === subIndex ? idx + 1 : idx === subIndex + 1 ? idx : idx
            })).filter(item => item._id && /^[0-9a-fA-F]{24}$/.test(item._id))
        };

        console.log('Надсилаємо дані для зміни порядку підкатегорій:', JSON.stringify(subcategoriesOrder, null, 2));

        const response = await fetchWithAuth(`/api/categories/${categoryId}/subcategories/order`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(subcategoriesOrder)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Помилка сервера:', JSON.stringify(errorData, null, 2));
            throw new Error(`Не вдалося змінити порядок: ${errorData.error || response.statusText}`);
        }

        // Оновлюємо локальний масив
        [category.subcategories[subIndex], category.subcategories[subIndex + 1]] = [
            category.subcategories[subIndex + 1],
            category.subcategories[subIndex]
        ];
        category.subcategories.forEach((subcat, idx) => {
            subcat.order = idx;
        });

        renderCategoriesAdmin();
        showNotification('Порядок підкатегорій змінено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка зміни порядку підкатегорій:', err);
        showNotification('Не вдалося змінити порядок: ' + err.message);
    }
}

async function updateSlideshowSettings() {
    const width = parseInt(document.getElementById('slide-width').value) || 100;
    const height = parseInt(document.getElementById('slide-height').value) || 300;
    const interval = parseInt(document.getElementById('slide-interval').value) || 5000;

    if (width < 10 || width > 100) {
        showNotification('Ширина слайду має бути в межах 10-100%!');
        return;
    }
    if (height < 100 || height > 500) {
        showNotification('Висота слайду має бути в межах 100-500 px!');
        return;
    }
    if (interval < 1000) {
        showNotification('Інтервал слайдів має бути не менше 1000 мс!');
        return;
    }

    settings.slideWidth = width;
    settings.slideHeight = height;
    settings.slideInterval = interval;

    try {
        await fetchWithAuth('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ slideWidth: width, slideHeight: height, slideInterval: interval })
        });

        showNotification('Налаштування слайдшоу оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення налаштувань слайдшоу:', err);
        showNotification('Не вдалося оновити налаштування: ' + err.message);
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
                body: formData
            });
            const data = await response.json();
            photo = data.url;
        }

        const response = await fetchWithAuth('/api/slides', {
            method: 'POST',
            body: JSON.stringify({ photo, link, position, active })
        });

        const newSlide = await response.json();
        slides.push(newSlide);
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

// Додаємо дебонсінг
const addSlideBtn = document.getElementById('add-slide-btn');
if (addSlideBtn) {
    addSlideBtn.addEventListener('click', debounce(addSlide, 300));
} else {
    console.warn('Кнопка #add-slide-btn не знайдена');
}

function editSlide(order) {
    const slide = slides.find(s => s.order === order);
    if (!slide) {
        showNotification('Слайд не знайдено!');
        return;
    }

    const modal = document.getElementById('modal');
    if (!modal) {
        console.error('Елемент #modal не знайдено');
        showNotification('Не вдалося відкрити модальне вікно');
        return;
    }

    modal.innerHTML = `
        <div class="modal-content">
            <h3>Редагувати слайд</h3>
            <input type="number" id="edit-slide-order" value="${slide.order}"><br/>
            <label for="edit-slide-order">Порядковий номер</label>
            <input type="text" id="edit-slide-img-url" value="${slide.img || ''}"><br/>
            <label for="edit-slide-img-url">URL зображення</label>
            <input type="file" id="edit-slide-img-file" accept="image/*"><br/>
            <label for="edit-slide-img-file">Завантажте зображення</label>
            ${slide.img ? `<img src="${slide.img}" style="max-width: 100px;">` : ''}
            <input type="text" id="edit-slide-url" value="${slide.url || ''}"><br/>
            <label for="edit-slide-url">Посилання</label>
            <div class="modal-actions">
                <button id="save-slide-btn">Зберегти</button>
                <button id="cancel-slide-btn">Скасувати</button>
            </div>
        </div>
    `;
    modal.classList.add('active');

    const saveButton = document.getElementById('save-slide-btn');
    const cancelButton = document.getElementById('cancel-slide-btn');
    if (saveButton) {
        saveButton.addEventListener('click', () => saveSlideEdit(order));
    } else {
        console.warn('Кнопка #save-slide-btn не знайдена');
    }
    if (cancelButton) {
        cancelButton.addEventListener('click', closeModal);
    } else {
        console.warn('Кнопка #cancel-slide-btn не знайдена');
    }

    resetInactivityTimer();
}

    function saveSlideEdit(oldOrder) {
        const newOrder = parseInt(document.getElementById('edit-slide-order').value);
        const newImgUrl = document.getElementById('edit-slide-img-url').value;
        const newImgFile = document.getElementById('edit-slide-img-file').files[0];
        const newUrl = document.getElementById('edit-slide-url').value;

        if (isNaN(newOrder)) {
            alert('Введіть порядковий номер слайду!');
            return;
        }

        const slide = slides.find(s => s.order === oldOrder);
        if (slide) {
            slide.order = newOrder;
            slide.url = newUrl || '#';
            if (newImgUrl) slide.img = newImgUrl;

            if (newImgFile) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    slide.img = e.target.result;
                    slides = slides.filter(s => s.order !== oldOrder);
                    slides.push(slide);
                    slides.sort((a, b) => a.order - b.order);
                    localStorage.setItem('slides', LZString.compressToUTF16(JSON.stringify(slides)));
                    closeModal();
                    renderAdmin();
                    showNotification('Слайд відредаговано!');
                    unsavedChanges = false;
                    resetInactivityTimer();
                };
                reader.readAsDataURL(newImgFile);
            } else {
                slides = slides.filter(s => s.order !== oldOrder);
                slides.push(slide);
                slides.sort((a, b) => a.order - b.order);
                localStorage.setItem('slides', LZString.compressToUTF16(JSON.stringify(slides)));
                closeModal();
                renderAdmin();
                showNotification('Слайд відредаговано!');
                unsavedChanges = false;
                resetInactivityTimer();
            }
        }
    }

    function deleteSlide(order) {
        if (confirm('Ви впевнені, що хочете видалити цей слайд?')) {
            slides = slides.filter(s => s.order !== order);
            localStorage.setItem('slides', LZString.compressToUTF16(JSON.stringify(slides)));
            renderAdmin();
            showNotification('Слайд видалено!');
            unsavedChanges = false;
            resetInactivityTimer();
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
                slides = data.slides || slides;
                localStorage.setItem('settings', LZString.compressToUTF16(JSON.stringify(settings)));
                localStorage.setItem('categories', LZString.compressToUTF16(JSON.stringify(categories)));
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
    newProduct = {
        type: 'simple',
        photos: [],
        colors: [],
        sizes: [],
        groupProducts: [],
        active: true,
        visible: true
    };

    const modal = document.getElementById('modal');
    if (!modal) {
        console.error('Елемент #modal не знайдено');
        showNotification('Не вдалося відкрити модальне вікно');
        return;
    }

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
            <button id="add-subcategory-btn">Додати підкатегорію</button><br/>
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
                <button id="save-product-btn">Зберегти</button>
                <button id="cancel-product-btn">Скасувати</button>
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
        } else {
            console.warn('Елемент #product-category не знайдено');
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
        } else {
            console.warn('Елемент #product-photo-file не знайдено');
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
        } else {
            console.warn('Елемент #product-color-photo-file не знайдено');
        }

        // Додаємо обробники для кнопок модального вікна
        const saveButton = document.getElementById('save-product-btn');
        if (saveButton) {
            saveButton.addEventListener('click', saveNewProduct);
        } else {
            console.warn('Кнопка #save-product-btn не знайдена');
        }

        const cancelButton = document.getElementById('cancel-product-btn');
        if (cancelButton) {
            cancelButton.addEventListener('click', closeModal);
        } else {
            console.warn('Кнопка #cancel-product-btn не знайдена');
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
    const addSubcategoryBtn = document.getElementById('add-subcategory-btn');

    if (!categorySelect || !subcategorySelect) {
        console.warn('Елементи #product-category або #product-subcategory не знайдено');
        return;
    }

    const categoryName = categorySelect.value;
    console.log('Оновлення підкатегорій для categoryName:', categoryName);
    subcategorySelect.innerHTML = '<option value="">Без підкатегорії</option>';

    if (!categoryName) {
        console.log('Категорія не вибрана');
        if (addSubcategoryBtn) {
            addSubcategoryBtn.style.display = 'none';
        }
        return;
    }

    const category = categories.find(c => c.name === categoryName);
    console.log('Знайдена категорія:', category);
    if (category && Array.isArray(category.subcategories)) {
        category.subcategories.forEach(sub => {
            if (sub.name && sub.slug) {
                const option = document.createElement('option');
                option.value = sub.slug;
                option.textContent = sub.name;
                subcategorySelect.appendChild(option);
            }
        });
    }

    if (addSubcategoryBtn) {
        addSubcategoryBtn.style.display = 'block';
        addSubcategoryBtn.onclick = () => {
            const newSubcategory = prompt('Введіть назву нової підкатегорії:');
            if (newSubcategory && categoryName) {
                const category = categories.find(c => c.name === categoryName);
                if (category) {
                    const newSub = {
                        name: newSubcategory,
                        slug: newSubcategory.toLowerCase().replace(/\s+/g, '-'),
                        order: category.subcategories.length,
                        visible: true
                    };
                    category.subcategories.push(newSub);
                    saveSubcategory(category._id, newSub)
                        .then(() => {
                            updateSubcategories();
                            showNotification('Підкатегорію додано!');
                        })
                        .catch(err => {
                            console.error('Помилка додавання підкатегорії:', err);
                            showNotification('Не вдалося додати підкатегорію: ' + err.message);
                        });
                }
            }
        };
    } else {
        console.warn('Елемент #add-subcategory-btn не знайдено');
    }

    resetInactivityTimer();
}

async function saveSubcategory(categoryId, subcategory) {
    try {
        const token = localStorage.getItem('adminToken');
        const response = await fetch(`/api/categories/${categoryId}/subcategories`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(subcategory),
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error('Не вдалося зберегти підкатегорію');
        }
        showNotification('Підкатегорію додано');
    } catch (e) {
        console.error('Помилка збереження підкатегорії:', e);
        showNotification('Помилка: ' + e.message);
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

        if (!nameInput || !slugInput || !categoryInput || !subcategoryInput || !visibleSelect || !descriptionInput) {
            showNotification('Елементи форми для товару не знайдено');
            return;
        }

        const name = nameInput.value.trim();
        const slug = slugInput.value.trim();
        const brand = brandInput ? brandInput.value.trim() : '';
        const category = categoryInput.value.trim();
        const subcategory = subcategoryInput.value.trim();
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

        if (!name || !slug || !category) {
            showNotification('Введіть назву, шлях товару та категорію!');
            return;
        }

        const slugCheck = await fetchWithAuth(`/api/products?slug=${encodeURIComponent(slug)}`);
        const existingProducts = await slugCheck.json();
        console.log('Отримано existingProducts:', existingProducts);
        if (!existingProducts.products || !Array.isArray(existingProducts.products)) {
            console.error('Некоректна структура existingProducts:', existingProducts);
            throw new Error('Некоректна відповідь сервера при перевірці slug');
        }
        if (existingProducts.products.some(p => p.slug === slug)) {
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

        // Перевірка категорії та підкатегорії
        const categoryObj = categories.find(c => c.name === category);
        if (!categoryObj) {
            showNotification('Обрана категорія не існує!');
            return;
        }

        let subcategorySlug = '';
        if (subcategory) {
            const subcategoryObj = categoryObj.subcategories.find(sub => sub.name === subcategory);
            if (!subcategoryObj) {
                showNotification('Обрана підкатегорія не існує в цій категорії!');
                return;
            }
            subcategorySlug = subcategoryObj.slug; // Використовуємо slug
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
            category,
            subcategory: subcategorySlug, // Надсилаємо slug
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
                priceChange: color.priceChange || 0,
                photo: null
            })),
            sizes: newProduct.sizes,
            groupProducts: newProduct.groupProducts,
            active: true,
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

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка додавання товару: ${errorData.error || response.statusText}`);
        }

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
                const subcat = category.subcategories.find(sub => sub.slug === product.subcategory);
                if (subcat) {
                    subcatSelect.value = subcat.slug;
                } else {
                    console.warn(`Підкатегорія ${product.subcategory} не знайдена в категорії ${product.category}`);
                }
            } else {
                console.warn(`Категорія ${product.category} не знайдена`);
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

        if (!Array.isArray(products)) {
            console.error('Список продуктів не ініціалізований');
            showNotification('Помилка: список продуктів не ініціалізований');
            return;
        }

        const productObj = products.find(p => p._id === productId);
        if (!productObj || !productObj._id) {
            showNotification('Товар не знайдено або відсутній ID!');
            return;
        }

        const name = document.getElementById('product-name')?.value.trim();
        const slug = document.getElementById('product-slug')?.value.trim();
        const brand = document.getElementById('product-brand')?.value.trim();
        const category = document.getElementById('product-category')?.value.trim();
        const subcategory = document.getElementById('product-subcategory')?.value.trim();
        const material = document.getElementById('product-material')?.value.trim();
        let price = null;
        let salePrice = null;
        if (newProduct.type === 'simple') {
            price = parseFloat(document.getElementById('product-price')?.value) || null;
            salePrice = parseFloat(document.getElementById('product-sale-price')?.value) || null;
        }
        const saleEnd = document.getElementById('product-sale-end')?.value || null;
        const visible = document.getElementById('product-visible')?.value === 'true';
        const description = document.getElementById('product-description')?.value || '';
        const widthCm = parseFloat(document.getElementById('product-width-cm')?.value) || null;
        const depthCm = parseFloat(document.getElementById('product-depth-cm')?.value) || null;
        const heightCm = parseFloat(document.getElementById('product-height-cm')?.value) || null;
        const lengthCm = parseFloat(document.getElementById('product-length-cm')?.value) || null;

        // Валідація
        if (!name || !slug) {
            showNotification('Введіть назву та шлях товару!');
            return;
        }

        if (!category) {
            showNotification('Виберіть категорію!');
            return;
        }

        // Перевірка унікальності slug
        const slugCheck = await fetchWithAuth(`/api/products?slug=${encodeURIComponent(slug)}`);
        const existingProducts = await slugCheck.json();
        if (!existingProducts.products || !Array.isArray(existingProducts.products)) {
            console.error('Некоректна структура existingProducts:', existingProducts);
            throw new Error('Некоректна відповідь сервера при перевірці slug');
        }
        if (existingProducts.products.some(p => p.slug === slug && p._id !== productId)) {
            showNotification('Шлях товару має бути унікальним!');
            return;
        }

        // Перевірка категорії та під Wиборка slug для підкатегорії
        const categoryObj = categories.find(c => c.name === category);
        if (!categoryObj) {
            showNotification('Обрана категорія не існує!');
            return;
        }

        let subcategorySlug = '';
        if (subcategory) {
            const subcategoryObj = categoryObj.subcategories.find(sub => sub.name === subcategory);
            if (!subcategoryObj) {
                showNotification('Обрана підкатегорія не існує в цій категорії!');
                return;
            }
            subcategorySlug = subcategoryObj.slug; // Використовуємо slug
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

        // Додавання бренду, якщо він новий
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

        // Додавання матеріалу, якщо він новий
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
            category,
            subcategory: subcategorySlug, // Надсилаємо slug
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

        // Обробка зображень у описі
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

        // Завантаження основних фото
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

        // Завантаження фото кольорів
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

        // Відправка запиту на сервер
        const response = await fetchWithAuth(`/api/products/${productId}`, {
            method: 'PUT',
            body: JSON.stringify(product)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка оновлення товару: ${errorData.error || response.statusText}`);
        }

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
    if (!confirm('Ви впевнені, що хочете видалити цей товар?')) {
        return;
    }

    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        if (!Array.isArray(products)) {
            console.error('Список продуктів не ініціалізований');
            showNotification('Помилка: список продуктів не ініціалізований');
            return;
        }

        const response = await fetchWithAuth(`/api/products/${productId}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка при видаленні товару: ${errorData.error || response.statusText}`);
        }

        products = products.filter(p => p._id !== productId);
        products.forEach(p => {
            if (p.type === 'group' && Array.isArray(p.groupProducts)) {
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

async function toggleProductActive(productId, currentActive) {
    try {
        // Перевірка наявності токена та його оновлення
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        // Перевірка валідності productId
        if (!productId || typeof productId !== 'string') {
            console.error('Невірний або відсутній productId:', productId);
            showNotification('Помилка: невірний ID товару');
            return;
        }

        // Отримання актуального списку продуктів з сервера
        const response = await fetchWithAuth('/api/products');
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка при отриманні продуктів: ${errorData.error || response.statusText}`);
        }
        const fetchedProducts = await response.json();
        products = fetchedProducts.products || [];

        // Пошук продукту в локальному масиві
        const product = products.find(p => p._id === productId);
        if (!product) {
            console.error(`Продукт із ID ${productId} не знайдено`);
            showNotification('Товар не знайдено!');
            return;
        }

        // Визначення нового статусу
        const newActiveStatus = currentActive !== undefined ? !currentActive : !product.active;

        // Відправка запиту на сервер для оновлення статусу
        const updateResponse = await fetchWithAuth(`/api/products/${productId}/toggle-active`, {
            method: 'PATCH',
            body: JSON.stringify({ active: newActiveStatus })
        });

        if (!updateResponse.ok) {
            const errorData = await updateResponse.json();
            throw new Error(`Помилка при оновленні статусу: ${errorData.error || updateResponse.statusText}`);
        }

        const updatedProduct = await updateResponse.json();
        // Оновлення локального масиву продуктів
        const productIndex = products.findIndex(p => p._id === productId);
        if (productIndex !== -1) {
            products[productIndex] = updatedProduct;
        }

        renderAdmin('products');
        showNotification(`Товар ${newActiveStatus ? 'активовано' : 'деактивовано'}!`);
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка при оновленні статусу товару:', err);
        showNotification('Не вдалося оновити статус товару: ' + err.message);
    }
}

    function sortAdminProducts(sortType) {
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
        renderAdmin('products');
        resetInactivityTimer();
    }

function sortOrders(sortType) {
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
                    <option value="Доставлено" ${order.status === 'Доставлено' ? 'selected' : ''}>Доставлено</option>
                    <option value="Скасовано" ${order.status === 'Скасовано' ? 'selected' : ''}>Скасовано</option>
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

        // Перевіряємо, чи є елементи в items
        if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
            showNotification('Замовлення не містить товарів! Додайте товари перед зміною статусу.');
            return;
        }

        // Нормалізуємо items
        const cleanedItems = order.items.map(item => {
            const { _id, ...cleanedItem } = item;
            return {
                id: cleanedItem.id,
                name: cleanedItem.name || 'Невідомий товар',
                quantity: parseInt(cleanedItem.quantity) || 1,
                price: parseFloat(cleanedItem.price) || 0,
                color: cleanedItem.color || '',
                photo: cleanedItem.photo && typeof cleanedItem.photo === 'string' && cleanedItem.photo.trim() !== '' ? cleanedItem.photo : null
            };
        });

        // Перевіряємо, чи ціни в межах розумного
        const hasInvalidPrice = cleanedItems.some(item => item.price < 0 || item.price > 1000000);
        if (hasInvalidPrice) {
            showNotification('Одна або кілька цін у замовленні мають некоректне значення (занадто велике або від’ємне).');
            return;
        }

        const updatedOrder = {
            status: newStatus,
            date: order.date,
            total: parseFloat(order.total) || 0,
            customer: order.customer,
            items: cleanedItems
        };

        const response = await fetchWithAuth(`/api/orders/${order._id}`, {
            method: 'PUT',
            body: JSON.stringify(updatedOrder)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Не вдалося оновити статус замовлення');
        }

        const updatedOrderFromServer = await response.json();
        // Оновлюємо локальний масив orders
        orders[index] = { ...order, ...updatedOrderFromServer };
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

            // Перевіряємо, чи замовлення існує на сервері
            const checkResponse = await fetchWithAuth(`/api/orders/${order._id}`, {
                method: 'GET'
            });
            if (!checkResponse.ok) {
                const errorData = await checkResponse.json();
                throw new Error(errorData.error || 'Замовлення не знайдено на сервері');
            }

            const deleteResponse = await fetchWithAuth(`/api/orders/${order._id}`, {
                method: 'DELETE'
            });

            if (!deleteResponse.ok) {
                const errorData = await deleteResponse.json();
                throw new Error(errorData.error || 'Не вдалося видалити замовлення');
            }

            // Видаляємо замовлення з локального масиву
            const orderIndex = orders.findIndex(o => o._id === order._id);
            if (orderIndex !== -1) {
                orders.splice(orderIndex, 1);
            } else {
                console.warn('Замовлення не знайдено в локальному масиві після видалення');
            }

            renderAdmin('orders');
            showNotification('Замовлення видалено!');
            unsavedChanges = false;
            resetInactivityTimer();
        } catch (err) {
            console.error('Помилка видалення замовлення:', err);
            showNotification('Не вдалося видалити замовлення: ' + err.message);
            // Завантажуємо актуальний список замовлень з сервера
            try {
                const response = await fetchWithAuth('/api/orders', { method: 'GET' });
                if (response.ok) {
                    orders = await response.json();
                    renderAdmin('orders');
                }
            } catch (fetchErr) {
                console.error('Помилка завантаження замовлень після невдалого видалення:', fetchErr);
            }
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
        ['products', 'categories', 'settings', 'orders', 'slides', 'materials', 'brands'].forEach(type => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type, action: 'subscribe' }));
            }
        });
    };

    socket.onmessage = (event) => {
        try {
            const { type, data } = JSON.parse(event.data);
            console.log(`Отримано WebSocket оновлення для ${type}:`, data);
            if (type === 'settings' && data) {
                settings = { ...settings, ...data };
                renderSettingsAdmin();
            } else if (type === 'products') {
                if (Array.isArray(data)) {
                    products = data;
                    if (document.querySelector('#products.active')) {
                        renderAdmin('products');
                    }
                } else {
                    console.warn('Некоректні дані продуктів:', data);
                }
            } else if (type === 'categories') {
                if (Array.isArray(data)) {
                    categories = data;
                    renderCategoriesAdmin();
                } else {
                    console.warn('Некоректні дані категорій:', data);
                    loadCategories();
                }
            } else if (type === 'orders') {
                if (Array.isArray(data)) {
                    orders = data;
                    if (document.querySelector('#orders.active')) {
                        renderAdmin('orders');
                    }
                } else {
                    console.warn('Некоректні дані замовлень:', data);
                }
            } else if (type === 'slides') {
                if (Array.isArray(data)) {
                    slides = data;
                    if (document.querySelector('#site-editing.active')) {
                        renderSlidesAdmin();
                    }
                } else {
                    console.warn('Некоректні дані слайдів:', data);
                }
            } else if (type === 'materials') {
                if (Array.isArray(data)) {
                    materials = data;
                    updateMaterialOptions();
                } else {
                    console.warn('Некоректні дані матеріалів:', data);
                }
            } else if (type === 'brands') {
                if (Array.isArray(data)) {
                    brands = data;
                    updateBrandOptions();
                } else {
                    console.warn('Некоректні дані брендів:', data);
                }
            } else if (type === 'error') {
                console.error('WebSocket помилка від сервера:', data);
                showNotification('Помилка WebSocket: ' + data.error);
                if (data.error.includes('неавторизований')) {
                    localStorage.removeItem('adminToken');
                    localStorage.removeItem('adminSession');
                    showSection('admin-login');
                }
            }
        } catch (e) {
            console.error('Помилка обробки WebSocket-повідомлення:', e);
            showNotification('Помилка обробки WebSocket-повідомлення: ' + e.message);
        }
    };
}