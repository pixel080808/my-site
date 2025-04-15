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

        categories = await response.json();
        console.log('Категорії завантажено:', categories);
        renderCategoriesAdmin();
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

        const token = localStorage.getItem('adminToken');
        if (!token) {
            console.warn('Токен відсутній. Використовуються локальні налаштування.');
            renderSettingsAdmin();
            return;
        }

        const response = await fetch('/api/settings', {
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
            try {
                const errorData = JSON.parse(text);
                throw new Error(`Не вдалося завантажити налаштування: ${errorData.error || response.statusText}`);
            } catch {
                throw new Error(`Не вдалося завантажити налаштування: ${response.status} ${text}`);
            }
        }

        const serverSettings = await response.json();
        console.log('Дані з /api/settings:', serverSettings);

        // Зберігаємо тільки визначені поля, щоб уникнути перезапису порожніми значеннями
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
            about: serverSettings.about || settings.about, // Зберігаємо about, якщо є
            showSlides: serverSettings.showSlides !== undefined ? serverSettings.showSlides : settings.showSlides,
            slideWidth: serverSettings.slideWidth || settings.slideWidth,
            slideHeight: serverSettings.slideHeight || settings.slideHeight,
            slideInterval: serverSettings.slideInterval || settings.slideInterval,
            categoryWidth: serverSettings.categoryWidth || settings.categoryWidth,
            categoryHeight: serverSettings.categoryHeight || settings.categoryHeight,
            productWidth: serverSettings.productWidth || settings.productWidth,
            productHeight: serverSettings.productHeight || settings.productHeight
        };

        console.log('Оновлені settings:', settings);

// Оновлюємо редактор "Про нас"
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
        console.log('settings.about порожній, редактор залишається без змін.');
        // Не очищаємо редактор, щоб уникнути втрати локальних змін
    }
    document.getElementById('about-edit').value = settings.about || '';
}

        renderSettingsAdmin();
    } catch (e) {
        console.error('Помилка завантаження налаштувань:', e);
        showNotification('Помилка завантаження налаштувань: ' + e.message);
        renderSettingsAdmin(); // Рендеримо з локальними даними
    }
}

async function fetchWithAuth(url, options = {}) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            throw new Error('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
        }

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

        const token = localStorage.getItem('adminToken');
        const headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
            'X-CSRF-Token': csrfToken
        };

        // Не додаємо Content-Type для multipart/form-data
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`Помилка запиту до ${url}: ${response.status} ${text}`);
            if (response.status === 401 || response.status === 403) {
                const refreshed = await refreshToken();
                if (refreshed) {
                    const newToken = localStorage.getItem('adminToken');
                    const newCsrfResponse = await fetch('https://mebli.onrender.com/api/csrf-token', {
                        method: 'GET',
                        credentials: 'include'
                    });
                    const newCsrfData = await newCsrfResponse.json();
                    const newCsrfToken = newCsrfData.csrfToken;

                    const retryHeaders = {
                        ...options.headers,
                        'Authorization': `Bearer ${newToken}`,
                        'X-CSRF-Token': newCsrfToken
                    };
                    if (!(options.body instanceof FormData)) {
                        retryHeaders['Content-Type'] = 'application/json';
                    }

                    const retryResponse = await fetch(url, {
                        ...options,
                        headers: retryHeaders,
                        credentials: 'include'
                    });
                    if (!retryResponse.ok) {
                        throw new Error(`Повторний запит не вдався: ${retryResponse.statusText}`);
                    }
                    return retryResponse;
                } else {
                    throw new Error('Не вдалося оновити токен.');
                }
            }
            throw new Error(`Помилка: ${response.status} ${text}`);
        }

        return response;
    } catch (err) {
        console.error('Помилка fetchWithAuth:', err);
        showNotification(err.message);
        throw err;
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

        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/orders', {
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

        orders = await response.json();
        sortOrders('date-desc');
        renderAdmin('orders');
    } catch (e) {
        console.error('Помилка завантаження замовлень:', e);
        showNotification(e.message);
        orders = [];
        renderAdmin('orders');
    }
}

async function loadSlides() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const response = await fetchWithAuth('/api/slides');
        if (!response.ok) {
            throw new Error(`Помилка завантаження слайдів: ${response.statusText}`);
        }
        slides = await response.json();
        if (document.getElementById('slides-admin')?.style.display !== 'none') {
            renderSlidesAdmin();
        }
    } catch (err) {
        console.error('Помилка завантаження слайдів:', err);
        showNotification('Не вдалося завантажити слайди: ' + err.message);
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
                <button class="delete-filter-btn" data-index="${index}">Видалити</button>
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
    try {
        await Promise.all([
            loadProducts(),
            loadCategories(),
            loadSlides(),
            loadOrders(),
            loadSettings()
        ]);
    } catch (err) {
        console.error('Помилка ініціалізації даних:', err);
        showNotification('Не вдалося завантажити дані: ' + err.message);
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
    resetInactivityTimer(); // Додаємо виклик
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
        [{ 'undo': 'undo' }, { 'redo': 'redo' }],
    ];

    try {
        Quill.register('modules/undo', function (quill) {
            return {
                undo: () => quill.history.undo(),
            };
        }, true);
        Quill.register('modules/redo', function (quill) {
            return {
                redo: () => quill.history.redo(),
            };
        }, true);

        aboutEditor = new Quill('#about-editor', {
            theme: 'snow',
            modules: {
                toolbar: {
                    container: aboutToolbarOptions,
                    handlers: {
                        undo: function () {
                            this.quill.history.undo();
                        },
                        redo: function () {
                            this.quill.history.redo();
                        },
                        image: async function () {
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
                                            showNotification('Токен відсутній. Увійдіть знову.');
                                            showSection('admin-login');
                                            return;
                                        }
                                        const formData = new FormData();
                                        formData.append('file', file);
                                        const response = await fetchWithAuth('/api/upload', {
                                            method: 'POST',
                                            body: formData,
                                        });
                                        const data = await response.json();
                                        if (data.url) {
                                            const range = this.quill.getSelection() || { index: 0 };
                                            this.quill.insertEmbed(range.index, 'image', data.url);
                                        }
                                    } catch (err) {
                                        console.error('Помилка завантаження зображення:', err);
                                        showNotification('Не вдалося завантажити зображення: ' + err.message);
                                    }
                                }
                            };
                        },
                        video: function () {
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
                                const range = this.quill.getSelection() || { index: 0 };
                                this.quill.insertEmbed(range.index, 'video', url);
                                setDefaultVideoSizes(this.quill, 'about-edit');
                            }
                        },
                    },
                },
                history: {
                    delay: 1000,
                    maxStack: 500,
                    userOnly: true,
                },
            },
        });

        aboutEditor.on('text-change', async () => {
            const content = aboutEditor.root.innerHTML;
            document.getElementById('about-edit').value = content;
            console.log('Вміст редактора змінено:', content);
            unsavedChanges = true;

            try {
                const tokenRefreshed = await refreshToken();
                if (!tokenRefreshed) {
                    showNotification('Токен відсутній. Увійдіть знову.');
                    showSection('admin-login');
                    return;
                }
                const response = await fetchWithAuth('/api/settings', {
                    method: 'PUT',
                    body: JSON.stringify({ about: content }),
                });
                if (!response.ok) {
                    throw new Error('Не вдалося зберегти "Про нас"');
                }
                unsavedChanges = false;
                showNotification('Розділ "Про нас" збережено!');
            } catch (err) {
                console.error('Помилка збереження "Про нас":', err);
                showNotification('Не вдалося зберегти "Про нас": ' + err.message);
            }

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
            resetInactivityTimer();
        });

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

        const observer = new MutationObserver((mutations) => {
            mutations.forEach(mutation => {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE && (node.tagName === 'IMG' || node.tagName === 'IFRAME')) {
                        node.addEventListener('click', () => openResizeModal(node));
                    }
                });
            });
        });
        observer.observe(aboutEditor.root, { childList: true, subtree: true });

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
        console.error('Помилка ініціалізації Quill-редактора:', err);
        showNotification('Не вдалося ініціалізувати редактор: ' + err.message);
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
        const csrfText = await csrfResponse.text();
        console.log('Відповідь CSRF-запиту:', csrfText);

        if (!csrfResponse.ok) {
            throw new Error(`Не вдалося отримати CSRF-токен: ${csrfResponse.status} ${csrfText}`);
        }

        let csrfData;
        try {
            csrfData = JSON.parse(csrfText);
        } catch (jsonError) {
            throw new Error('Некоректна відповідь CSRF-запиту: не вдалося розпарсити JSON');
        }

        const csrfToken = csrfData.csrfToken;
        if (!csrfToken) {
            throw new Error('CSRF-токен не отримано від сервера');
        }
        console.log('Отримано CSRF-токен:', csrfToken);

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
        const responseText = await response.text();
        console.log('Відповідь сервера:', responseText);

        if (!response.ok) {
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
            data = JSON.parse(responseText);
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
        showNotification('Вхід виконано!');
        resetInactivityTimer();
    } catch (e) {
        console.error('Помилка входу:', e);
        showNotification('Помилка входу: ' + e.message);
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    session = { isActive: false, timestamp: 0 };
    localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
    if (socket) socket.close();
    showSection('admin-login');
    showNotification('Ви вийшли з системи');
}

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
        document.querySelectorAll('.admin-tab').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
        const tab = document.getElementById(tabId);
        const button = Array.from(document.querySelectorAll('.tab-btn')).find(btn => btn.getAttribute('onclick') === `showAdminTab('${tabId}')`);
        if (tab && button) {
            tab.classList.add('active');
            button.classList.add('active');
            currentPage = 1;
            renderAdmin(tabId);
            resetInactivityTimer();
        }
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
        const logoWidth = parseInt(document.getElementById('logo-width').value) || settings.logoWidth;
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
            logoWidth: logoWidth || settings.logoWidth,
            favicon: finalFaviconUrl || settings.favicon
        };

        console.log('Надсилаємо налаштування:', updatedSettings);

        const response = await fetchWithAuth('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(updatedSettings)
        });

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

async function updateContacts(event) {
    event.preventDefault();
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const phoneInput = document.getElementById('contacts-phone');
        const emailInput = document.getElementById('contacts-email');
        const addressInput = document.getElementById('contacts-address');

        if (!phoneInput || !emailInput || !addressInput) {
            showNotification('Елементи форми контактів не знайдено');
            return;
        }

        const contacts = {
            phone: phoneInput.value.trim(),
            email: emailInput.value.trim(),
            address: addressInput.value.trim(),
        };

        const response = await fetchWithAuth('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ contacts }),
        });

        if (!response.ok) {
            throw new Error(`Не вдалося оновити контакти: ${response.statusText}`);
        }

        showNotification('Контакти оновлено!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення контактів:', err);
        showNotification('Не вдалося оновити контакти: ' + err.message);
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
            showNotification('Токен відсутній. Увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const about = aboutEditor?.getContents ? aboutEditor.getContents() : '';
        const response = await fetchWithAuth('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ about }),
        });

        if (!response.ok) {
            throw new Error(`Не вдалося оновити "Про нас": ${response.statusText}`);
        }

        // Чекаємо WebSocket-оновлення
        showNotification('Розділ "Про нас" оновлено!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення "Про нас":', err);
        showNotification('Не вдалося оновити "Про нас": ' + err.message);
    }
}

function renderPagination(totalItems, itemsPerPage, currentPage, containerId, onPageChange) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn(`Контейнер для пагінації #${containerId} не знайдено`);
        return;
    }

    let paginationHTML = '<div class="pagination">';
    if (currentPage > 1) {
        paginationHTML += `<button onclick="${onPageChange}(${currentPage - 1})">Попередня</button>`;
    }
    for (let i = 1; i <= totalPages; i++) {
        paginationHTML += `<button class="${i === currentPage ? 'active' : ''}" onclick="${onPageChange}(${i})">${i}</button>`;
    }
    if (currentPage < totalPages) {
        paginationHTML += `<button onclick="${onPageChange}(${currentPage + 1})">Наступна</button>`;
    }
    paginationHTML += '</div>';

    container.innerHTML = paginationHTML;
}

function changeProductPage(page) {
    settings.currentProductPage = page;
    renderAdmin('products');
}

function changeOrderPage(page) {
    settings.currentOrderPage = page;
    renderAdmin('orders');
}

async function renderAdmin(activeTab = 'site-editing') {
    const adminPanel = document.getElementById('admin-panel');
    if (!adminPanel) {
        console.warn('Елемент #admin-panel не знайдено');
        return;
    }

    adminPanel.innerHTML = `
        <div class="admin-tabs">
            <button class="${activeTab === 'site-editing' ? 'active' : ''}" onclick="showAdminTab('site-editing')">Редагування сайту</button>
            <button class="${activeTab === 'products' ? 'active' : ''}" onclick="showAdminTab('products')">Товари</button>
            <button class="${activeTab === 'orders' ? 'active' : ''}" onclick="showAdminTab('orders')">Замовлення</button>
            <button class="${activeTab === 'categories' ? 'active' : ''}" onclick="showAdminTab('categories')">Категорії</button>
            <button class="${activeTab === 'filters' ? 'active' : ''}" onclick="showAdminTab('filters')">Фільтри</button>
            <button class="${activeTab === 'slides' ? 'active' : ''}" onclick="showAdminTab('slides')">Слайди</button>
            <button onclick="logout()">Вийти</button>
        </div>
        <div id="admin-content"></div>
    `;

    const content = document.getElementById('admin-content');
    if (!content) {
        console.warn('Елемент #admin-content не знайдено');
        return;
    }

    switch (activeTab) {
        case 'site-editing':
            content.innerHTML = `
                <div class="admin-section" id="site-editing">
                    <h2>Налаштування сайту</h2>
                    <form onsubmit="updateSiteSettings(event)">
                        <div class="form-group">
                            <label for="site-name">Назва сайту</label>
                            <input type="text" id="site-name" value="${settings.name || ''}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="base-url">Базовий URL</label>
                            <input type="text" id="base-url" value="${settings.baseUrl || ''}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="logo-url">URL логотипу</label>
                            <input type="text" id="logo-url" value="${settings.logo || ''}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="logo-file">Файл логотипу</label>
                            <input type="file" id="logo-file" accept="image/*" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="logo-width">Ширина логотипу (px)</label>
                            <input type="number" id="logo-width" value="${settings.logoWidth || ''}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="favicon-url">URL favicon</label>
                            <input type="text" id="favicon-url" value="${settings.favicon || ''}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="favicon-file">Файл favicon</label>
                            <input type="file" id="favicon-file" accept="image/*" class="form-control">
                        </div>
                        <button type="submit">Зберегти налаштування</button>
                    </form>
                    <h2>Контакти</h2>
                    <form onsubmit="updateContacts(event)">
                        <div class="form-group">
                            <label for="contacts-phone">Телефон</label>
                            <input type="text" id="contacts-phone" value="${settings.contacts?.phone || ''}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="contacts-email">Email</label>
                            <input type="text" id="contacts-email" value="${settings.contacts?.email || ''}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="contacts-address">Адреса</label>
                            <input type="text" id="contacts-address" value="${settings.contacts?.address || ''}" class="form-control">
                        </div>
                        <button type="submit">Зберегти контакти</button>
                    </form>
                    <h2>Соціальні мережі</h2>
                    <form onsubmit="addSocial(event)">
                        <div class="form-group">
                            <label for="social-name">Назва</label>
                            <input type="text" id="social-name" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="social-url">URL</label>
                            <input type="text" id="social-url" class="form-control">
                        </div>
                        <button type="submit">Додати</button>
                    </form>
                    <div id="socials-list">
                        ${settings.socials?.map(s => `
                            <div class="social-item">
                                ${s.name}: <a href="${s.url}">${s.url}</a>
                                <button onclick="deleteSocial('${s.name}')">Видалити</button>
                            </div>
                        `).join('') || ''}
                    </div>
                    <h2>Про нас</h2>
                    <div id="about-editor"></div>
                    <input type="hidden" id="about-edit">
                </div>
            `;
            initializeEditors();
            break;

        case 'products':
            const productsPerPage = 10;
            const currentProductPage = settings.currentProductPage || 1;
            const start = (currentProductPage - 1) * productsPerPage;
            const end = start + productsPerPage;
            const paginatedProducts = products.slice(start, end);

            content.innerHTML = `
                <div class="admin-section" id="products-admin">
                    <h2>Товари</h2>
                    <button onclick="openAddProductModal()">Додати товар</button>
                    <div id="products-list">
                        ${paginatedProducts.map(p => `
                            <div class="product-item">
                                <img src="${p.photos?.[0] || ''}" alt="${p.name}" style="max-width: 100px;">
                                <div>
                                    <strong>${p.name}</strong><br>
                                    ${p.price || 'Ціна залежить від розміру'} грн<br>
                                    ${p.category || 'Без категорії'} / ${p.subcategory || 'Без підкатегорії'}<br>
                                    ${p.visible ? 'Видимий' : 'Прихований'}<br>
                                    Тип: ${p.type}
                                </div>
                                <button onclick="editProduct('${p._id}')">Редагувати</button>
                                <button onclick="deleteProduct('${p._id}')">Видалити</button>
                            </div>
                        `).join('')}
                    </div>
                    <div id="products-pagination"></div>
                </div>
            `;
            renderPagination(
                products.length,
                productsPerPage,
                currentProductPage,
                'products-pagination',
                'changeProductPage'
            );
            break;

        case 'orders':
            const ordersPerPage = 10;
            const currentOrderPage = settings.currentOrderPage || 1;
            const orderStart = (currentOrderPage - 1) * ordersPerPage;
            const orderEnd = orderStart + ordersPerPage;
            const paginatedOrders = orders.slice(orderStart, orderEnd);

            content.innerHTML = `
                <div class="admin-section" id="orders-admin">
                    <h2>Замовлення</h2>
                    <div id="orders-list">
                        ${paginatedOrders.map(o => `
                            <div class="order-item">
                                <strong>Замовлення #${o._id}</strong><br>
                                ${o.name}<br>
                                ${o.phone}<br>
                                ${o.total} грн<br>
                                Статус: ${o.status}<br>
                                <button onclick="editOrder('${o._id}')">Редагувати</button>
                            </div>
                        `).join('')}
                    </div>
                    <div id="orders-pagination"></div>
                </div>
            `;
            renderPagination(
                orders.length,
                ordersPerPage,
                currentOrderPage,
                'orders-pagination',
                'changeOrderPage'
            );
            break;

        case 'categories':
            content.innerHTML = `
                <div class="admin-section" id="categories-admin">
                    <h2>Категорії</h2>
                    <form onsubmit="addCategory(event)">
                        <div class="form-group">
                            <label for="category-name">Назва категорії</label>
                            <input type="text" id="category-name" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="category-slug">Slug</label>
                            <input type="text" id="category-slug" class="form-control">
                        </div>
                        <button type="submit">Додати категорію</button>
                    </form>
                    <div id="categories-list">
                        ${categories.map(c => `
                            <div class="category-item">
                                ${c.name} (${c.slug})
                                <button onclick="editCategory('${c._id}')">Редагувати</button>
                                <button onclick="deleteCategory('${c._id}')">Видалити</button>
                                <form onsubmit="addSubcategory(event, '${c._id}')">
                                    <input type="text" id="subcategory-name-${c._id}" placeholder="Назва підкатегорії" class="form-control">
                                    <input type="text" id="subcategory-slug-${c._id}" placeholder="Slug підкатегорії" class="form-control">
                                    <button type="submit">Додати підкатегорію</button>
                                </form>
                                <div class="subcategories">
                                    ${c.subcategories?.map(s => `
                                        <div class="subcategory-item">
                                            ${s.name} (${s.slug})
                                            <button onclick="deleteSubcategory('${c._id}', '${s._id}')">Видалити</button>
                                        </div>
                                    `).join('') || ''}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
            break;

        case 'filters':
            content.innerHTML = `
                <div class="admin-section" id="filters-admin">
                    <h2>Фільтри</h2>
                    <form onsubmit="addFilter(event)">
                        <div class="form-group">
                            <label for="filter-name">Назва фільтра</label>
                            <input type="text" id="filter-name" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="filter-type">Тип фільтра</label>
                            <select id="filter-type" class="form-control">
                                <option value="select">Вибір</option>
                                <option value="range">Діапазон</option>
                            </select>
                        </div>
                        <button type="submit">Додати фільтр</button>
                    </form>
                    <div id="filters-list">
                        ${settings.filters?.map(f => `
                            <div class="filter-item">
                                ${f.name} (${f.type})
                                <button onclick="deleteFilter('${f.name}')">Видалити</button>
                            </div>
                        `).join('') || ''}
                    </div>
                </div>
            `;
            break;

        case 'slides':
            content.innerHTML = `
                <div class="admin-section" id="slides-admin">
                    <h2>Слайди</h2>
                    <div id="slides-list-admin"></div>
                    <h3>Додати слайд</h3>
                    <form onsubmit="addSlide(event)">
                        <div class="form-group">
                            <label for="slide-img-url">URL зображення</label>
                            <input type="text" id="slide-img-url" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="slide-img-file">Файл зображення</label>
                            <input type="file" id="slide-img-file" class="form-control" accept="image/jpeg,image/png,image/gif,image/webp">
                        </div>
                        <div class="form-group">
                            <label for="slide-title">Заголовок</label>
                            <input type="text" id="slide-title" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="slide-text">Текст</label>
                            <input type="text" id="slide-text" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="slide-link">Посилання</label>
                            <input type="text" id="slide-link" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="slide-link-text">Текст посилання</label>
                            <input type="text" id="slide-link-text" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="slide-order">Порядок</label>
                            <input type="number" id="slide-order" class="form-control">
                        </div>
                        <button type="submit" id="add-slide-btn">Додати слайд</button>
                    </form>
                    <h3>Налаштування слайдшоу</h3>
                    <form onsubmit="updateSlideshowSettings(event)">
                        <div class="form-group">
                            <label for="slide-width">Ширина слайду (%)</label>
                            <input type="number" id="slide-width" value="${settings.slideWidth || 100}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="slide-height">Висота слайду (px)</label>
                            <input type="number" id="slide-height" value="${settings.slideHeight || 300}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="slide-interval">Інтервал (мс)</label>
                            <input type="number" id="slide-interval" value="${settings.slideInterval || 5000}" class="form-control">
                        </div>
                        <div class="form-group">
                            <label for="slide-toggle">Показувати слайдшоу</label>
                            <input type="checkbox" id="slide-toggle" ${settings.showSlides ? 'checked' : ''}>
                        </div>
                        <button type="submit">Зберегти налаштування</button>
                    </form>
                </div>
            `;
            renderSlidesAdmin();
            break;
    }

    resetInactivityTimer();
}

function renderCategoriesAdmin() {
    const catList = document.getElementById('cat-list');
    if (catList) {
        catList.innerHTML = categories.map(cat => `
            <div class="category-item">
                ${cat.name}
                <button class="edit-btn" onclick="editCategory('${cat._id}')">Редагувати</button>
                <button class="delete-btn" onclick="deleteCategory('${cat._id}')">Видалити</button>
                <div class="subcat-list">
                    ${(cat.subcategories || []).map(sub => `
                        <p>
                            ${sub.name}
                            <button class="edit-btn" onclick="editSubcategory('${cat._id}', '${sub._id}')">Редагувати</button>
                            <button class="delete-btn" onclick="deleteSubcategory('${cat._id}', '${sub._id}')">Видалити</button>
                        </p>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }
    const subcatSelect = document.getElementById('subcat-category');
    if (subcatSelect) {
        subcatSelect.innerHTML = '<option value="">Виберіть категорію</option>' + 
            categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }
}

function renderSocialsAdmin() {
    const socialList = document.getElementById('social-list');
    if (!socialList) return;
    socialList.innerHTML = settings.socials.map((social, index) => `
        <div class="social-item">
            <span class="social-icon">${social.icon}</span>
            <span>${social.url}</span>
            <button class="delete-btn" onclick="deleteSocial(${index})">Видалити</button>
        </div>
    `).join('');
}

function renderSettingsAdmin() {
    document.getElementById('store-name').value = settings.name || '';
    document.getElementById('base-url').value = settings.baseUrl || '';
    document.getElementById('logo-url').value = settings.logo || '';
    document.getElementById('logo-width').value = settings.logoWidth || '';
    document.getElementById('favicon-url').value = settings.favicon || '';
    document.getElementById('contact-phones').value = settings.contacts.phones || '';
    document.getElementById('contact-addresses').value = settings.contacts.addresses || '';
    document.getElementById('contact-schedule').value = settings.contacts.schedule || '';
    document.getElementById('social-toggle').checked = settings.showSocials;
    renderSocialsAdmin(); // Викликаємо функцію для соціальних мереж
    document.getElementById('category-width').value = settings.categoryWidth || '';
    document.getElementById('category-height').value = settings.categoryHeight || '';
    document.getElementById('product-width').value = settings.productWidth || '';
    document.getElementById('product-height').value = settings.productHeight || '';
    document.getElementById('slide-width').value = settings.slideWidth || '';
    document.getElementById('slide-height').value = settings.slideHeight || '';
    document.getElementById('slide-interval').value = settings.slideInterval || '';
    document.getElementById('slide-toggle').checked = settings.showSlides;
}

function renderSlidesAdmin() {
    const slidesList = document.getElementById('slides-list-admin');
    if (!slidesList) {
        console.warn('Елемент #slides-list-admin не знайдено. Можливо, вкладка "Слайди" не активна.');
        return;
    }

    slidesList.innerHTML = slides
        .sort((a, b) => a.order - b.order)
        .map((slide, index) => `
            <div class="slide-item">
                <img src="${slide.url}" alt="Слайд ${index + 1}" style="max-width: 100px;">
                <div>
                    <strong>${slide.title || 'Без назви'}</strong><br>
                    ${slide.text || ''}<br>
                    ${slide.link ? `<a href="${slide.link}">${slide.linkText || 'Перейти'}</a>` : ''}
                </div>
                <button onclick="deleteSlide('${slide._id}')">Видалити</button>
                <button onclick="editSlide('${slide._id}')">Редагувати</button>
            </div>
        `).join('');

    const formInputs = [
        'slide-img-url',
        'slide-img-file',
        'slide-title',
        'slide-text',
        'slide-link',
        'slide-link-text',
        'slide-order'
    ];
    formInputs.forEach(id => {
        const input = document.getElementById(id);
        if (input) input.value = '';
    });

    const addSlideBtn = document.getElementById('add-slide-btn');
    if (addSlideBtn) {
        addSlideBtn.onclick = debounce(addSlide, 300);
    }

    resetInactivityTimer();
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.remove('active');
        modal.innerHTML = '';
    }
    newProduct = {
        type: 'simple',
        photos: [],
        colors: [],
        sizes: [],
        groupProducts: [],
        active: true,
        visible: true,
    };
    unsavedChanges = false;
    resetInactivityTimer();
}

function validateFile(file) {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const maxSize = 5 * 1024 * 1024; // 5 МБ
    if (!allowedTypes.includes(file.type)) {
        return { valid: false, error: 'Дозволені лише файли JPEG, PNG, GIF або WebP' };
    }
    if (file.size > maxSize) {
        return { valid: false, error: 'Файл занадто великий. Максимум 5 МБ.' };
    }
    return { valid: true };
}

async function addCategory() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const name = document.getElementById('cat-name').value;
        const slug = document.getElementById('cat-slug').value;
        const imgUrl = document.getElementById('cat-img-url').value;
        const imgFile = document.getElementById('cat-img-file').files[0];

        if (!name || !slug) {
            showNotification('Введіть назву та шлях категорії!');
            return;
        }

        // Перевірка унікальності назви (локально)
        const existingCategory = categories.find(cat => cat.name.toLowerCase() === name.toLowerCase());
        if (existingCategory) {
            showNotification('Категорія з такою назвою вже існує!');
            return;
        }

        let imageUrl = imgUrl;
        if (imgFile) {
            const validation = validateFile(imgFile);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', imgFile);
            const uploadResponse = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData
            });
            const uploadData = await uploadResponse.json();
            if (uploadData.url) {
                imageUrl = uploadData.url;
            } else {
                throw new Error('Не вдалося завантажити зображення');
            }
        }

        const category = { name, slug, img: imageUrl || '', subcategories: [] }; // Змінено image на img
        const response = await fetchWithAuth('/api/categories', {
            method: 'POST',
            body: JSON.stringify(category)
        });

        const newCategory = await response.json();
        categories.push(newCategory);
        renderCategoriesAdmin();
        showNotification('Категорію додано!');
        document.getElementById('cat-name').value = '';
        document.getElementById('cat-slug').value = '';
        document.getElementById('cat-img-url').value = '';
        document.getElementById('cat-img-file').value = '';
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка додавання категорії:', err);
        showNotification('Помилка додавання категорії: ' + err.message);
    }
}

    function editCategory(name) {
        const category = categories.find(c => c.name === name);
        if (category) {
            const modal = document.getElementById('modal');
            modal.innerHTML = `
                <div class="modal-content">
                    <h3>Редагувати категорію</h3>
                    <input type="text" id="edit-cat-name" value="${category.name}"><br/>
                    <label for="edit-cat-name">Назва категорії</label>
                    <input type="text" id="edit-cat-slug" value="${category.slug}"><br/>
                    <label for="edit-cat-slug">Шлях категорії</label>
                    <input type="text" id="edit-cat-img-url" value="${category.img || ''}"><br/>
                    <label for="edit-cat-img-url">URL зображення</label>
                    <input type="file" id="edit-cat-img-file" accept="image/*"><br/>
                    <label for="edit-cat-img-file">Завантажте зображення</label>
                    ${category.img ? `<img src="${category.img}" style="max-width: 100px;">` : ''}
                    <div class="modal-actions">
                        <button id="save-cat-btn">Зберегти</button>
                        <button id="cancel-cat-btn">Скасувати</button>
                    </div>
                </div>
            `;
            modal.classList.add('active');
            document.getElementById('save-cat-btn').addEventListener('click', () => saveCategoryEdit(name));
            document.getElementById('cancel-cat-btn').addEventListener('click', closeModal);
            resetInactivityTimer();
        }
    }

    function saveCategoryEdit(oldName) {
        const category = categories.find(c => c.name === oldName);
        if (category) {
            const newName = document.getElementById('edit-cat-name').value;
            const newSlug = document.getElementById('edit-cat-slug').value;
            const newImgUrl = document.getElementById('edit-cat-img-url').value;
            const newImgFile = document.getElementById('edit-cat-img-file').files[0];

            if (newName && newSlug) {
                if (categories.some(c => c.slug === newSlug && c.name !== oldName)) {
                    alert('Шлях категорії має бути унікальним!');
                    return;
                }
                category.name = newName;
                category.slug = newSlug;
                if (newImgUrl) category.img = newImgUrl;

                if (newImgFile) {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        category.img = e.target.result;
                        updateProductsCategory(oldName, newName);
                        localStorage.setItem('categories', LZString.compressToUTF16(JSON.stringify(categories)));
                        localStorage.setItem('products', LZString.compressToUTF16(JSON.stringify(products)));
                        closeModal();
                        renderAdmin();
                        showNotification('Категорію відредаговано!');
                        unsavedChanges = false;
                        resetInactivityTimer();
                    };
                    reader.readAsDataURL(newImgFile);
                } else {
                    updateProductsCategory(oldName, newName);
                    localStorage.setItem('categories', LZString.compressToUTF16(JSON.stringify(categories)));
                    localStorage.setItem('products', LZString.compressToUTF16(JSON.stringify(products)));
                    closeModal();
                    renderAdmin();
                    showNotification('Категорію відредаговано!');
                    unsavedChanges = false;
                    resetInactivityTimer();
                }
            } else {
                alert('Введіть назву та шлях!');
            }
        }
    }

    function updateProductsCategory(oldName, newName) {
        products.forEach(p => {
            if (p.category === oldName) p.category = newName;
        });
    }

    function deleteCategory(name) {
        if (confirm('Ви впевнені, що хочете видалити цю категорію?')) {
            categories = categories.filter(c => c.name !== name);
            products.forEach(p => {
                if (p.category === name) {
                    p.category = '';
                    p.subcategory = '';
                }
            });
            localStorage.setItem('categories', LZString.compressToUTF16(JSON.stringify(categories)));
            localStorage.setItem('products', LZString.compressToUTF16(JSON.stringify(products)));
            renderAdmin();
            showNotification('Категорію видалено!');
            unsavedChanges = false;
            resetInactivityTimer();
        }
    }

    function moveCategoryUp(index) {
        if (index > 0) {
            [categories[index - 1], categories[index]] = [categories[index], categories[index - 1]];
            localStorage.setItem('categories', LZString.compressToUTF16(JSON.stringify(categories)));
            renderAdmin();
            resetInactivityTimer();
        }
    }

    function moveCategoryDown(index) {
        if (index < categories.length - 1) {
            [categories[index], categories[index + 1]] = [categories[index + 1], categories[index]];
            localStorage.setItem('categories', LZString.compressToUTF16(JSON.stringify(categories)));
            renderAdmin();
            resetInactivityTimer();
        }
    }

async function addSubcategory(event, categoryId) {
    event.preventDefault();
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const nameInput = document.getElementById(`subcategory-name-${categoryId}`);
        const slugInput = document.getElementById(`subcategory-slug-${categoryId}`);

        if (!nameInput || !slugInput) {
            showNotification('Елементи форми для підкатегорії не знайдено');
            return;
        }

        const name = nameInput.value.trim();
        const slug = slugInput.value.trim();

        if (!name || !slug) {
            showNotification('Заповніть усі поля!');
            return;
        }

        const response = await fetchWithAuth(`/api/categories/${categoryId}/subcategories`, {
            method: 'POST',
            body: JSON.stringify({ name, slug }),
        });

        if (!response.ok) {
            throw new Error(`Не вдалося додати підкатегорію: ${response.statusText}`);
        }

        const updatedCategory = await response.json();
        const categoryIndex = categories.findIndex(c => c._id === categoryId);
        if (categoryIndex !== -1) {
            categories[categoryIndex] = updatedCategory;
        } else {
            categories.push(updatedCategory);
        }

        renderAdmin('categories');
        showNotification('Підкатегорію додано!');
        nameInput.value = '';
        slugInput.value = '';
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка додавання підкатегорії:', err);
        showNotification('Не вдалося додати підкатегорію: ' + err.message);
    }
}

    function editSubcategory(categoryName, subcatName) {
        const category = categories.find(c => c.name === categoryName);
        if (category) {
            const subcategory = category.subcategories.find(s => s.name === subcatName);
            if (subcategory) {
                const modal = document.getElementById('modal');
                modal.innerHTML = `
                    <div class="modal-content">
                        <h3>Редагувати підкатегорію</h3>
                        <input type="text" id="edit-subcat-name" value="${subcategory.name}"><br/>
                        <label for="edit-subcat-name">Назва підкатегорії</label>
                        <input type="text" id="edit-subcat-slug" value="${subcategory.slug}"><br/>
                        <label for="edit-subcat-slug">Шлях підкатегорії</label>
                        <input type="text" id="edit-subcat-img-url" value="${subcategory.img || ''}"><br/>
                        <label for="edit-subcat-img-url">URL зображення</label>
                        <input type="file" id="edit-subcat-img-file" accept="image/*"><br/>
                        <label for="edit-subcat-img-file">Завантажте зображення</label>
                        ${subcategory.img ? `<img src="${subcategory.img}" style="max-width: 100px;">` : ''}
                        <div class="modal-actions">
                            <button id="save-subcat-btn">Зберегти</button>
                            <button id="cancel-subcat-btn">Скасувати</button>
                        </div>
                    </div>
                `;
                modal.classList.add('active');
                document.getElementById('save-subcat-btn').addEventListener('click', () => saveSubcategoryEdit(categoryName, subcatName));
                document.getElementById('cancel-subcat-btn').addEventListener('click', closeModal);
                resetInactivityTimer();
            }
        }
    }

    function saveSubcategoryEdit(categoryName, oldName) {
        const category = categories.find(c => c.name === categoryName);
        if (category) {
            const subcategory = category.subcategories.find(s => s.name === oldName);
            if (subcategory) {
                const newName = document.getElementById('edit-subcat-name').value;
                const newSlug = document.getElementById('edit-subcat-slug').value;
                const newImgUrl = document.getElementById('edit-subcat-img-url').value;
                const newImgFile = document.getElementById('edit-subcat-img-file').files[0];

                if (newName && newSlug) {
                    if (category.subcategories.some(s => s.slug === newSlug && s.name !== oldName)) {
                        alert('Шлях підкатегорії має бути унікальним у межах категорії!');
                        return;
                    }
                    subcategory.name = newName;
                    subcategory.slug = newSlug;
                    if (newImgUrl) subcategory.img = newImgUrl;

                    if (newImgFile) {
                        const reader = new FileReader();
                        reader.onload = (e) => {
                            subcategory.img = e.target.result;
                            updateProductsSubcategory(categoryName, oldName, newName);
                            localStorage.setItem('categories', LZString.compressToUTF16(JSON.stringify(categories)));
                            localStorage.setItem('products', LZString.compressToUTF16(JSON.stringify(products)));
                            closeModal();
                            renderAdmin();
                            showNotification('Підкатегорію відредаговано!');
                            unsavedChanges = false;
                            resetInactivityTimer();
                        };
                        reader.readAsDataURL(newImgFile);
                    } else {
                        updateProductsSubcategory(categoryName, oldName, newName);
                        localStorage.setItem('categories', LZString.compressToUTF16(JSON.stringify(categories)));
                        localStorage.setItem('products', LZString.compressToUTF16(JSON.stringify(products)));
                        closeModal();
                        renderAdmin();
                        showNotification('Підкатегорію відредаговано!');
                        unsavedChanges = false;
                        resetInactivityTimer();
                    }
                } else {
                    alert('Введіть назву та шлях!');
                }
            }
        }
    }

    function updateProductsSubcategory(categoryName, oldSubcatName, newSubcatName) {
        products.forEach(p => {
            if (p.category === categoryName && p.subcategory === oldSubcatName) {
                p.subcategory = newSubcatName;
            }
        });
    }

    function deleteSubcategory(categoryName, subcatName) {
        if (confirm('Ви впевнені, що хочете видалити цю підкатегорію?')) {
            const category = categories.find(c => c.name === categoryName);
            if (category) {
                category.subcategories = category.subcategories.filter(s => s.name !== subcatName);
                products.forEach(p => {
                    if (p.category === categoryName && p.subcategory === subcatName) {
                        p.subcategory = '';
                    }
                });
                localStorage.setItem('categories', LZString.compressToUTF16(JSON.stringify(categories)));
                localStorage.setItem('products', LZString.compressToUTF16(JSON.stringify(products)));
                renderAdmin();
                showNotification('Підкатегорію видалено!');
                unsavedChanges = false;
                resetInactivityTimer();
            }
        }
    }

    function moveSubcategoryUp(categoryName, index) {
        const category = categories.find(c => c.name === categoryName);
        if (category && index > 0) {
            [category.subcategories[index - 1], category.subcategories[index]] = [category.subcategories[index], category.subcategories[index - 1]];
            localStorage.setItem('categories', LZString.compressToUTF16(JSON.stringify(categories)));
            renderAdmin();
            resetInactivityTimer();
        }
    }

    function moveSubcategoryDown(categoryName, index) {
        const category = categories.find(c => c.name === categoryName);
        if (category && index < category.subcategories.length - 1) {
            [category.subcategories[index], category.subcategories[index + 1]] = [category.subcategories[index + 1], category.subcategories[index]];
            localStorage.setItem('categories', LZString.compressToUTF16(JSON.stringify(categories)));
            renderAdmin();
            resetInactivityTimer();
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
            renderFilters(); // Замінено на renderFilters
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
        renderFilters(); // Замінено на renderFilters
    } catch (err) {
        console.error('Помилка завантаження фільтрів:', err);
        showNotification('Помилка завантаження фільтрів: ' + err.message);
        renderFilters(); // Рендеримо локальні дані при помилці
    }
}

async function addFilter(event) {
    event.preventDefault();
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const nameInput = document.getElementById('filter-name');
        const typeInput = document.getElementById('filter-type');

        if (!nameInput || !typeInput) {
            showNotification('Елементи форми для фільтра не знайдено');
            return;
        }

        const name = nameInput.value.trim();
        const type = typeInput.value;

        if (!name || !type) {
            showNotification('Заповніть усі поля!');
            return;
        }

        settings.filters = settings.filters || [];
        settings.filters.push({ name, type });

        const response = await fetchWithAuth('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ filters: settings.filters }),
        });

        if (!response.ok) {
            throw new Error(`Не вдалося додати фільтр: ${response.statusText}`);
        }

        renderAdmin('filters');
        showNotification('Фільтр додано!');
        nameInput.value = '';
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка додавання фільтра:', err);
        showNotification('Не вдалося додати фільтр: ' + err.message);
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
    const token = localStorage.getItem('adminToken');
    if (!token) {
        showNotification('Токен відсутній. Будь ласка, увійдіть знову.');
        showSection('admin-login');
        return;
    }

    const name = document.getElementById('order-field-name').value;
    const label = document.getElementById('order-field-label').value;
    const type = document.getElementById('order-field-type').value;
    const options = document.getElementById('order-field-options').value.split(',').map(o => o.trim());

    if (!name || !label) {
        alert('Введіть назву та підпис для поля!');
        return;
    }

    const field = { name, label, type };
    if (type === 'select' && options.length > 0) field.options = options;

    try {
        const response = await fetch('/api/order-fields', {
            method: 'POST',
            headers: {
                credentials: 'include',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(field)
        });

        if (!response.ok) throw new Error('Не вдалося додати поле замовлення');
        orderFields.push(field);
        document.getElementById('order-field-name').value = '';
        document.getElementById('order-field-label').value = '';
        document.getElementById('order-field-options').value = '';
        renderAdmin('order-fields');
        showNotification('Поле замовлення додано!');
        resetInactivityTimer();
    } catch (e) {
        console.error('Помилка додавання поля замовлення:', e);
        showNotification(e.message);
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

        const imgUrlInput = document.getElementById('slide-img-url');
        const imgFileInput = document.getElementById('slide-img-file');
        const titleInput = document.getElementById('slide-title');
        const textInput = document.getElementById('slide-text');
        const linkInput = document.getElementById('slide-link');
        const linkTextInput = document.getElementById('slide-link-text');
        const orderInput = document.getElementById('slide-order');

        if (!imgUrlInput || !imgFileInput || !titleInput || !textInput || !linkInput || !linkTextInput || !orderInput) {
            console.error('Не знайдено елементи форми для слайду');
            showNotification('Помилка: форма для слайду не знайдена');
            return;
        }

        const imgUrl = imgUrlInput.value.trim();
        const imgFile = imgFileInput.files[0];
        const title = titleInput.value.trim();
        const text = textInput.value.trim();
        const link = linkInput.value.trim();
        const linkText = linkTextInput.value.trim();
        const order = parseInt(orderInput.value) || slides.length + 1;

        if (!imgUrl && !imgFile) {
            showNotification('Введіть URL зображення або виберіть файл!');
            return;
        }

        let imageUrl = imgUrl;

        // Завантаження зображення, якщо вибрано файл
        if (imgFile) {
            const validation = validateFile(imgFile);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', imgFile);
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                throw new Error(`Помилка завантаження зображення: ${response.statusText}`);
            }
            const data = await response.json();
            imageUrl = data.url;
        }

        const slide = {
            url: imageUrl, // Змінено з img на url
            title: title || '',
            text: text || '',
            link: link || '',
            linkText: linkText || '',
            order,
        };

        const response = await fetchWithAuth('/api/slides', {
            method: 'POST',
            body: JSON.stringify(slide),
        });

        if (!response.ok) {
            throw new Error(`Не вдалося додати слайд: ${response.statusText}`);
        }

        const newSlide = await response.json();
        slides.push(newSlide);
        renderSlidesAdmin();
        showNotification('Слайд додано!');
        unsavedChanges = false;
        resetInactivityTimer();

        // Очистка полів
        imgUrlInput.value = '';
        imgFileInput.value = '';
        titleInput.value = '';
        textInput.value = '';
        linkInput.value = '';
        linkTextInput.value = '';
        orderInput.value = '';
    } catch (err) {
        console.error('Помилка додавання слайду:', err);
        showNotification('Не вдалося додати слайд: ' + err.message);
    }
}

async function editSlide(slideId) {
    const slide = slides.find(s => s._id === slideId);
    if (slide) {
        const modal = document.getElementById('modal');
        modal.innerHTML = `
            <div class="modal-content">
                <h3>Редагувати слайд</h3>
                <div class="form-group">
                    <label for="edit-slide-order">Порядковий номер</label>
                    <input type="number" id="edit-slide-order" value="${slide.order}" class="form-control">
                </div>
                <div class="form-group">
                    <label for="edit-slide-img-url">URL зображення</label>
                    <input type="text" id="edit-slide-img-url" value="${slide.url || ''}" class="form-control">
                </div>
                <div class="form-group">
                    <label for="edit-slide-img-file">Завантажте зображення</label>
                    <input type="file" id="edit-slide-img-file" accept="image/jpeg,image/png,image/gif,image/webp" class="form-control">
                    ${slide.url ? `<img src="${slide.url}" style="max-width: 100px; margin-top: 10px;">` : ''}
                </div>
                <div class="form-group">
                    <label for="edit-slide-title">Заголовок</label>
                    <input type="text" id="edit-slide-title" value="${slide.title || ''}" class="form-control">
                </div>
                <div class="form-group">
                    <label for="edit-slide-text">Текст</label>
                    <input type="text" id="edit-slide-text" value="${slide.text || ''}" class="form-control">
                </div>
                <div class="form-group">
                    <label for="edit-slide-link">Посилання</label>
                    <input type="text" id="edit-slide-link" value="${slide.link || ''}" class="form-control">
                </div>
                <div class="form-group">
                    <label for="edit-slide-link-text">Текст посилання</label>
                    <input type="text" id="edit-slide-link-text" value="${slide.linkText || ''}" class="form-control">
                </div>
                <div class="modal-actions">
                    <button id="save-slide-btn">Зберегти</button>
                    <button id="cancel-slide-btn">Скасувати</button>
                </div>
            </div>
        `;
        modal.classList.add('active');
        document.getElementById('save-slide-btn').addEventListener('click', () => saveSlideEdit(slideId));
        document.getElementById('cancel-slide-btn').addEventListener('click', closeModal);
        resetInactivityTimer();
    }
}

async function saveSlideEdit(slideId) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const orderInput = document.getElementById('edit-slide-order');
        const imgUrlInput = document.getElementById('edit-slide-img-url');
        const imgFileInput = document.getElementById('edit-slide-img-file');
        const titleInput = document.getElementById('edit-slide-title');
        const textInput = document.getElementById('edit-slide-text');
        const linkInput = document.getElementById('edit-slide-link');
        const linkTextInput = document.getElementById('edit-slide-link-text');

        if (!orderInput || !imgUrlInput || !imgFileInput || !titleInput || !textInput || !linkInput || !linkTextInput) {
            showNotification('Помилка: форма редагування слайду не знайдена');
            return;
        }

        const newOrder = parseInt(orderInput.value);
        const newImgUrl = imgUrlInput.value.trim();
        const newImgFile = imgFileInput.files[0];
        const newTitle = titleInput.value.trim();
        const newText = textInput.value.trim();
        const newLink = linkInput.value.trim();
        const newLinkText = linkTextInput.value.trim();

        if (isNaN(newOrder)) {
            showNotification('Введіть коректний порядковий номер слайду!');
            return;
        }

        let imageUrl = newImgUrl;

        // Завантаження нового зображення, якщо вибрано файл
        if (newImgFile) {
            const validation = validateFile(newImgFile);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', newImgFile);
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData,
            });
            if (!response.ok) {
                throw new Error(`Помилка завантаження зображення: ${response.statusText}`);
            }
            const data = await response.json();
            imageUrl = data.url;
        }

        const updatedSlide = {
            url: imageUrl || slides.find(s => s._id === slideId).url,
            title: newTitle || '',
            text: newText || '',
            link: newLink || '',
            linkText: newLinkText || '',
            order: newOrder,
        };

        const response = await fetchWithAuth(`/api/slides/${slideId}`, {
            method: 'PUT',
            body: JSON.stringify(updatedSlide),
        });

        if (!response.ok) {
            throw new Error(`Не вдалося оновити слайд: ${response.statusText}`);
        }

        // Чекаємо WebSocket-оновлення замість ручного оновлення slides
        closeModal();
        showNotification('Слайд відредаговано!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка редагування слайду:', err);
        showNotification('Не вдалося відредагувати слайд: ' + err.message);
    }
}

async function deleteSlide(slideId) {
    if (!confirm('Ви впевнені, що хочете видалити цей слайд?')) return;
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Увійдіть знову.');
            showSection('admin-login');
            return;
        }

        if (!slideId.match(/^[0-9a-fA-F]{24}$/)) {
            throw new Error('Невалідний ID слайду');
        }

        const response = await fetchWithAuth(`/api/slides/${slideId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error(`Не вдалося видалити слайд: ${response.statusText}`);
        }

        showNotification('Слайд видалено!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка видалення слайду:', err);
        showNotification('Не вдалося видалити слайд: ' + err.message);
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
            <form onsubmit="saveNewProduct(event)">
                <div class="form-group">
                    <label for="product-type">Тип товару</label>
                    <select id="product-type" onchange="updateProductType()" class="form-control">
                        <option value="simple">Простий товар</option>
                        <option value="mattresses">Матраци</option>
                        <option value="group">Груповий товар</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="product-name">Назва товару</label>
                    <input type="text" id="product-name" placeholder="Назва товару" class="form-control" required>
                </div>
                <div class="form-group">
                    <label for="product-slug">Шлях товару</label>
                    <input type="text" id="product-slug" placeholder="Шлях товару" class="form-control" required>
                </div>
                <div class="form-group">
                    <label for="product-brand">Виробник</label>
                    <input type="text" id="product-brand" placeholder="Виробник" class="form-control">
                </div>
                <div class="form-group">
                    <label for="product-category">Категорія</label>
                    <select id="product-category" class="form-control" required>
                        <option value="">Виберіть категорію</option>
                        ${categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label for="product-subcategory">Підкатегорія</label>
                    <select id="product-subcategory" class="form-control">
                        <option value="">Без підкатегорії</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="product-material">Матеріал</label>
                    <input type="text" id="product-material" placeholder="Матеріал" class="form-control">
                </div>
                <div id="price-fields" class="form-group"></div>
                <div class="form-group">
                    <label for="product-sale-end">Дата закінчення акції</label>
                    <input type="datetime-local" id="product-sale-end" class="form-control">
                </div>
                <div class="form-group">
                    <label for="product-visible">Видимість</label>
                    <select id="product-visible" class="form-control">
                        <option value="true">Показувати на сайті</option>
                        <option value="false">Не показувати</option>
                    </select>
                </div>
                <div class="form-group">
                    <label for="product-description">Опис товару</label>
                    <div id="product-description-editor"></div>
                    <input type="hidden" id="product-description">
                </div>
                <h4>Розміри</h4>
                <div class="form-group">
                    <label for="product-width-cm">Ширина (см)</label>
                    <input type="number" id="product-width-cm" placeholder="Ширина (см)" min="0" step="0.1" class="form-control">
                </div>
                <div class="form-group">
                    <label for="product-depth-cm">Глибина (см)</label>
                    <input type="number" id="product-depth-cm" placeholder="Глибина (см)" min="0" step="0.1" class="form-control">
                </div>
                <div class="form-group">
                    <label for="product-height-cm">Висота (см)</label>
                    <input type="number" id="product-height-cm" placeholder="Висота (см)" min="0" step="0.1" class="form-control">
                </div>
                <div class="form-group">
                    <label for="product-length-cm">Довжина (см)</label>
                    <input type="number" id="product-length-cm" placeholder="Довжина (см)" min="0" step="0.1" class="form-control">
                </div>
                <h4>Фотографії</h4>
                <div class="form-group">
                    <label for="product-photo-url">URL фотографії</label>
                    <input type="text" id="product-photo-url" placeholder="URL фотографії" class="form-control">
                </div>
                <div class="form-group">
                    <label for="product-photo-file">Завантажте фотографію</label>
                    <input type="file" id="product-photo-file" accept="image/jpeg,image/png,image/gif,image/webp" multiple class="form-control">
                </div>
                <button type="button" onclick="addProductPhoto()">Додати фото</button>
                <div id="product-photo-list" class="photo-list"></div>
                <h4>Кольори</h4>
                <div class="form-group">
                    <label for="product-color-name">Назва кольору</label>
                    <input type="text" id="product-color-name" placeholder="Назва кольору" class="form-control">
                </div>
                <div class="form-group">
                    <label for="product-color-value">Значення кольору</label>
                    <input type="color" id="product-color-value" value="#000000" class="form-control">
                </div>
                <div class="form-group">
                    <label for="product-color-price-change">Зміна ціни для кольору (грн)</label>
                    <input type="number" id="product-color-price-change" placeholder="Зміна ціни (грн)" step="0.01" class="form-control">
                </div>
                <div class="form-group">
                    <label for="product-color-photo-url">URL фото кольору</label>
                    <input type="text" id="product-color-photo-url" placeholder="URL фото кольору" class="form-control">
                </div>
                <div class="form-group">
                    <label for="product-color-photo-file">Завантажте фото кольору</label>
                    <input type="file" id="product-color-photo-file" accept="image/jpeg,image/png,image/gif,image/webp" class="form-control">
                </div>
                <button type="button" onclick="addProductColor()">Додати колір</button>
                <div id="product-color-list" class="color-photo-list"></div>
                <div id="mattress-sizes" class="type-specific">
                    <h4>Розміри матраців</h4>
                    <div class="form-group">
                        <label for="mattress-size-name">Розмір</label>
                        <input type="text" id="mattress-size-name" placeholder="Розмір (наприклад, 90x190)" class="form-control">
                    </div>
                    <div class="form-group">
                        <label for="mattress-size-price">Ціна (грн)</label>
                        <input type="number" id="mattress-size-price" placeholder="Ціна (грн)" min="0" class="form-control">
                    </div>
                    <button type="button" onclick="addMattressSize()">Додати розмір</button>
                    <div id="mattress-size-list"></div>
                </div>
                <div id="group-products" class="type-specific">
                    <h4>Групові товари</h4>
                    <div class="group-product-search">
                        <input type="text" id="group-product-search" placeholder="Пошук товарів" oninput="searchGroupProducts()" class="form-control">
                        <div id="group-product-results"></div>
                    </div>
                    <div id="group-product-list"></div>
                </div>
                <div class="modal-actions">
                    <button type="submit">Зберегти</button>
                    <button type="button" onclick="closeModal()">Скасувати</button>
                </div>
            </form>
        </div>
    `;
    modal.classList.add('active');
    updateProductType();
    initializeProductEditor();

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
                resetInactivityTimer(); // Додаємо виклик тут
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
                        resetInactivityTimer(); // Додаємо виклик тут
                    }
                }
            });
        }
    }, 0);

    resetInactivityTimer(); // Додаємо виклик у кінці функції
}

function updateProductType() {
    const type = document.getElementById('product-type').value;
    newProduct.type = type;

    const priceFields = document.getElementById('price-fields');
    const mattressSizes = document.getElementById('mattress-sizes');
    const groupProducts = document.getElementById('group-products');

    if (!priceFields || !mattressSizes || !groupProducts) {
        console.warn('Елементи для типу товару не знайдено');
        return;
    }

    priceFields.innerHTML = '';
    mattressSizes.style.display = 'none';
    groupProducts.style.display = 'none';

    if (type === 'simple') {
        priceFields.innerHTML = `
            <div class="form-group">
                <label for="product-price">Ціна (грн)</label>
                <input type="number" id="product-price" placeholder="Ціна (грн)" min="0" step="0.01" class="form-control" required>
            </div>
            <div class="form-group">
                <label for="product-sale-price">Акційна ціна (грн)</label>
                <input type="number" id="product-sale-price" placeholder="Акційна ціна (грн)" min="0" step="0.01" class="form-control">
            </div>
        `;
    } else if (type === 'mattresses') {
        mattressSizes.style.display = 'block';
    } else if (type === 'group') {
        groupProducts.style.display = 'block';
    }

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
        const category = document.getElementById('product-category').value;
        const subcatSelect = document.getElementById('product-subcategory');
        const cat = categories.find(c => c.name === category);
        subcatSelect.innerHTML = '<option value="">Без підкатегорії</option>' + 
            (cat ? cat.subcategories.map(s => `<option value="${s.name}">${s.name}</option>`).join('') : '');
        resetInactivityTimer();
    }

function addProductPhoto() {
    const urlInput = document.getElementById('product-photo-url');
    const fileInput = document.getElementById('product-photo-file');

    if (!urlInput || !fileInput) {
        showNotification('Елементи для фото не знайдено');
        return;
    }

    const url = urlInput.value.trim();
    const files = fileInput.files;

    if (url) {
        if (!url.match(/\.(jpeg|jpg|png|gif|webp)$/i)) {
            showNotification('URL фото має бути зображенням (jpeg, png, gif, webp)');
            return;
        }
        newProduct.photos.push(url);
        urlInput.value = '';
    }

    Array.from(files).forEach(file => {
        const validation = validateFile(file);
        if (!validation.valid) {
            showNotification(validation.error);
            return;
        }
        if (!newProduct.photos.includes(file)) {
            newProduct.photos.push(file);
        }
    });

    fileInput.value = '';
    renderPhotoList();
    resetInactivityTimer();
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
                <span style="background-color: ${color.value}; width: 20px; height: 20px; display: inline-block;"></span>
                ${color.name} (Зміна ціни: ${color.priceChange} грн)
                ${photoSrc ? `<img src="${photoSrc}" alt="Фото кольору ${color.name}" style="max-width: 30px;">` : ''}
                <button class="delete-color-btn" data-index="${index}">Видалити</button>
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
    const nameInput = document.getElementById('mattress-size-name');
    const priceInput = document.getElementById('mattress-size-price');

    if (!nameInput || !priceInput) {
        showNotification('Елементи форми для розміру матрацу не знайдено');
        return;
    }

    const name = nameInput.value.trim();
    const price = parseFloat(priceInput.value);

    if (!name) {
        showNotification('Введіть назву розміру!');
        return;
    }

    if (isNaN(price) || price <= 0) {
        showNotification('Введіть коректну ціну!');
        return;
    }

    newProduct.sizes.push({ name, price });
    nameInput.value = '';
    priceInput.value = '';

    renderMattressSizes();
    resetInactivityTimer();
}

function renderMattressSizes() {
    const sizeList = document.getElementById('mattress-size-list');
    if (!sizeList) return;

    sizeList.innerHTML = newProduct.sizes
        .map((size, index) => `
            <div class="size-item">
                ${size.name}: ${size.price} грн
                <button onclick="removeMattressSize(${index})">Видалити</button>
            </div>
        `)
        .join('');
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
                    <button class="delete-group-product-btn" data-product-id="${pid}">Видалити</button>
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

async function saveNewProduct(event) {
    event.preventDefault();
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Увійдіть знову.');
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
        const visibleInput = document.getElementById('product-visible');
        const descriptionInput = document.getElementById('product-description');
        const widthCmInput = document.getElementById('product-width-cm');
        const depthCmInput = document.getElementById('product-depth-cm');
        const heightCmInput = document.getElementById('product-height-cm');
        const lengthCmInput = document.getElementById('product-length-cm');

        if (!nameInput || !slugInput || !brandInput || !categoryInput || !subcategoryInput || !materialInput || !visibleInput || !descriptionInput) {
            showNotification('Не всі поля форми знайдено!');
            return;
        }

        const name = nameInput.value.trim();
        const slug = slugInput.value.trim();
        const brand = brandInput.value.trim();
        const category = categoryInput.value;
        const subcategory = subcategoryInput.value;
        const material = materialInput.value.trim();
        let price = null;
        let salePrice = null;
        if (newProduct.type === 'simple') {
            price = priceInput ? parseFloat(priceInput.value) : null;
            salePrice = salePriceInput ? parseFloat(salePriceInput.value) || null : null;
        }
        const saleEnd = saleEndInput ? saleEndInput.value : null;
        const visible = visibleInput.value === 'true';
        const description = descriptionInput.value || '';
        const widthCm = widthCmInput ? parseFloat(widthCmInput.value) || null : null;
        const depthCm = depthCmInput ? parseFloat(depthCmInput.value) || null : null;
        const heightCm = heightCmInput ? parseFloat(heightCmInput.value) || null : null;
        const lengthCm = lengthCmInput ? parseFloat(lengthCmInput.value) || null : null;

        if (!name || !slug || !category) {
            showNotification('Введіть назву, шлях і категорію товару!');
            return;
        }

        const slugCheck = await fetchWithAuth(`/api/products?slug=${encodeURIComponent(slug)}`);
        const existingProducts = await slugCheck.json();
        if (existingProducts.some(p => p.slug === slug)) {
            showNotification('Шлях товару має бути унікальним!');
            return;
        }

        if (newProduct.type === 'simple' && (isNaN(price) || price <= 0)) {
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

        if (brand && !brands.includes(brand)) {
            try {
                const response = await fetchWithAuth('/api/brands', {
                    method: 'POST',
                    body: JSON.stringify({ name: brand }),
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
                    body: JSON.stringify({ name: material }),
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
                photo: null,
            })),
            sizes: newProduct.sizes,
            groupProducts: newProduct.groupProducts,
            active: true,
            visible: visible,
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
                        body: formData,
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
                    body: formData,
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
                        body: formData,
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
            body: JSON.stringify(product),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Не вдалося додати товар: ${errorData.error || response.statusText}`);
        }

        const newProductData = await response.json();
        products.push(newProductData);
        closeModal();
        renderAdmin('products');
        showNotification('Товар додано!');
        unsavedChanges = false;
        resetInactivityTimer();

        newProduct = {
            type: 'simple',
            photos: [],
            colors: [],
            sizes: [],
            groupProducts: [],
            active: true,
            visible: true,
        };
    } catch (err) {
        console.error('Помилка при додаванні товару:', err);
        showNotification('Не вдалося додати товар: ' + err.message);
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
            subcatSelect.value = product.subcategory;
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
        const videos = doc.querySelectorAll('iframe');

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
    }
}

async function deleteProduct(productId) {
    if (!confirm('Ви впевнені, що хочете видалити цей товар?')) return;
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Увійдіть знову.');
            showSection('admin-login');
            return;
        }

        if (!productId.match(/^[0-9a-fA-F]{24}$/)) {
            throw new Error('Невалідний ID товару');
        }

        const response = await fetchWithAuth(`/api/products/${productId}`, {
            method: 'DELETE',
        });

        if (!response.ok) {
            throw new Error(`Не вдалося видалити товар: ${response.statusText}`);
        }

        showNotification('Товар видалено!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка при видаленні товару:', err);
        showNotification('Не вдалося видалити товар: ' + err.message);
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
        const response = await fetch(`/api/products/${productId}`, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
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

function uploadBulkPrices() {
    const file = document.getElementById('bulk-price-file').files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {  // Додано async тут
            const token = localStorage.getItem('adminToken');
            if (!token) {
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
                            const response = await fetch(`/api/products/${id}`, {
                                method: 'PUT',
                                headers: {
                                    credentials: 'include',
                                    'Content-Type': 'application/json'
                                },
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
                                const response = await fetch(`/api/products/${id}`, {
                                    method: 'PUT',
                                    headers: {
                                        credentials: 'include',
                                        'Content-Type': 'application/json'
                                    },
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
        };
        reader.readAsText(file);
    } else {
        alert('Виберіть файл для завантаження!');
    }
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
        const formattedDate = orderDate.toLocaleString('uk-UA', {
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
    if (!confirm('Ви впевнені, що хочете видалити це замовлення?')) return;

    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const order = orders[index];
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
    } catch (e) {
        console.error('Помилка видалення замовлення:', e);
        showNotification('Не вдалося видалити замовлення: ' + e.message);
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

document.addEventListener('DOMContentLoaded', async () => {
    console.log('DOM завантажено, ініціалізація...');

    // Ініціалізація елементів форми логіну
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
                await checkAuth();
            } else {
                localStorage.removeItem('adminToken');
                session = { isActive: false, timestamp: 0 };
                localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
                showSection('admin-login');
            }
        } catch (e) {
            console.error('Помилка розшифровки сесії:', e);
            localStorage.removeItem('adminToken');
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

    // Ініціалізація делегування подій
    addEventDelegations();
});

document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);

function addEventDelegations() {
    document.addEventListener('click', (e) => {
        const target = e.target;

        // Делегування для кнопок видалення фільтрів
        if (target.classList.contains('delete-filter-btn')) {
            const index = parseInt(target.dataset.index);
            if (!isNaN(index)) {
                deleteFilter(index);
            }
        }

        // Делегування для кнопок видалення кольорів
        if (target.classList.contains('delete-color-btn')) {
            const index = parseInt(target.dataset.index);
            if (!isNaN(index)) {
                deleteProductColor(index);
            }
        }

        // Делегування для кнопок видалення розмірів матраців
        if (target.classList.contains('delete-size-btn')) {
            const index = parseInt(target.dataset.index);
            if (!isNaN(index)) {
                deleteMattressSize(index);
            }
        }

        // Делегування для кнопок групових товарів
        if (target.classList.contains('delete-group-product-btn')) {
            const productId = parseInt(target.dataset.productId);
            if (!isNaN(productId)) {
                deleteGroupProduct(productId);
            }
        }
    });
}

// Викликати після завантаження DOM
document.addEventListener('DOMContentLoaded', () => {
    addEventDelegations();
});

function connectAdminWebSocket() {
  const wsUrl = window.location.hostname === 'localhost' ? 'ws://localhost:3000' : 'wss://mebli.onrender.com';
  const maxAttempts = 5;
  let attempt = 1;

  const connect = async () => {
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

    socket.onopen = () => {
      console.log('Адмін підключено до WebSocket');
      ['products', 'categories', 'settings', 'orders', 'slides', 'materials', 'brands', 'filters'].forEach(type => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type, action: 'subscribe' }));
        }
      });
      resetInactivityTimer();
      attempt = 1;
    };

    socket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('Отримано WebSocket-повідомлення:', message);
        if (!message.type || !message.data) {
          throw new Error('Невалідний формат WebSocket-повідомлення');
        }
        const { type, data } = message;

        switch (type) {
          case 'products':
            products = Array.isArray(data) ? data : [];
            if (document.getElementById('products-admin')?.style.display !== 'none') {
              renderAdmin('products');
            }
            break;
          case 'categories':
            categories = Array.isArray(data) ? data : [];
            if (document.getElementById('categories-admin')?.style.display !== 'none') {
              renderCategoriesAdmin();
            }
            break;
          case 'settings':
            settings = typeof data === 'object' ? { ...settings, ...data } : settings;
            if (document.getElementById('site-editing')?.style.display !== 'none') {
              renderSettingsAdmin();
            }
            break;
          case 'orders':
            orders = Array.isArray(data) ? data : [];
            if (document.getElementById('orders-admin')?.style.display !== 'none') {
              renderAdmin('orders');
            }
            break;
          case 'slides':
            slides = Array.isArray(data) ? data : [];
            if (document.getElementById('slides-admin')?.style.display !== 'none') {
              renderSlidesAdmin();
            }
            break;
          case 'materials':
            materials = Array.isArray(data) ? data : [];
            updateMaterialOptions();
            break;
          case 'brands':
            brands = Array.isArray(data) ? data : [];
            updateBrandOptions();
            break;
          case 'filters':
            filters = Array.isArray(data) ? data : [];
            renderFilters();
            break;
          default:
            console.warn('Невідомий тип WebSocket-повідомлення:', type);
        }
        resetInactivityTimer();
      } catch (err) {
        console.error('Помилка обробки WebSocket-повідомлення:', err, 'Дані:', event.data);
      }
    };

    socket.onclose = async () => {
      console.log(`WebSocket закрито, спроба ${attempt}/${maxAttempts} перепідключення...`);
      if (attempt <= maxAttempts) {
        const tokenRefreshed = await refreshToken();
        if (tokenRefreshed) {
          setTimeout(() => connect(), 5000 * attempt);
        } else {
          console.warn('Не вдалося оновити токен, припиняємо спроби');
          showSection('admin-login');
        }
      } else {
        console.error('Досягнуто максимум спроб перепідключення');
        showNotification('Втрачено з’єднання з сервером. Увійдіть знову.');
        showSection('admin-login');
      }
      attempt++;
    };

    socket.onerror = (error) => {
      console.error('Помилка WebSocket:', error);
      showNotification('Помилка підключення до WebSocket. Перевірте з’єднання.');
    };
  };

  connect();
}