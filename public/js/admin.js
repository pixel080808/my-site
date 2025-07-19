let isLoadingOrders = false;
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
let originalProducts = [];
let categories = [];
let orders = [];
let slides = [];
let settings = {
    name: '',
    baseUrl: '',
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
let orderNumberCache = new Map();
let totalOrders = 0;
let totalProducts = 0;
let lastOrderNumber = parseInt(localStorage.getItem('lastOrderNumber')) || 0;
let ordersCurrentPage = 1;
let productsCurrentPage = 1;
const productsPerPage = 20;
const ordersPerPage = 20;
const sessionTimeout = 30 * 60 * 1000;
let lastPageBeforeSearch = 1;
let inactivityTimer;
let isModalOpen = false;
let materials = [];
let brands = [];
let isLoadingProducts = false;
let isUpdatingCategories = false;
const orderFields = [
    { name: 'name', label: "Ім\'я" },
    { name: 'surname', label: 'Прізвище' },
    { name: 'phone', label: 'Телефон' },
    { name: 'email', label: 'Електронна пошта' },
    { name: 'address', label: 'Адреса доставки' },
    { name: 'payment', label: 'Спосіб оплати' }
];
let unsavedChanges = false;
let aboutEditor;
let productEditor;
let groupProductPage = 1;
let groupProductTotal = 0;
let groupProductLimit = 15;
let selectedMedia = null;
let socket;

function handleError(err, defaultMessage) {
    let errorMessage = defaultMessage;
    if (err.status === 400 && err.errorData) {
        errorMessage += `: ${err.errorData.error || 'Невірні дані'}`;
        if (err.errorData.details) {
            errorMessage += `. Деталі: ${Array.isArray(err.errorData.details) ? err.errorData.details.join(', ') : err.errorData.details}`;
        }
    } else {
        errorMessage += `: ${err.message}`;
    }
    console.error(`${defaultMessage}:`, err);
    showNotification(errorMessage);
}

async function loadProducts(page = 1, limit = productsPerPage) {
    try {
        isLoadingProducts = true;
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            console.warn('Токен відсутній. Завантаження локальних даних для тестування.');
            products = [];
            originalProducts = [];
            productsCurrentPage = 1;
            renderAdmin('products');
            return;
        }

        productsCurrentPage = page;
        const response = await fetchWithAuth(`/api/products?page=${page}&limit=${limit}`);
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

        const data = await response.json();
        if (!data.products || !Array.isArray(data.products)) {
            products = [];
            totalProducts = data.total || 0;
        } else {
            products = data.products;
            totalProducts = data.total || products.length;
        }

        if (!totalProducts && products.length === 0) {
            totalProducts = 0;
        }

        const globalIndex = (page - 1) * limit + 1;
        products.forEach((p, index) => {
            if (!p.tempNumber) {
                p.tempNumber = globalIndex + index;
            }
        });

        originalProducts = [...products];

        console.log('Завантажено товари:', products, 'totalItems:', totalProducts, 'page:', page);
        renderAdmin('products', { products: products, total: totalProducts, page: page });
    } catch (e) {
        console.error('Помилка завантаження товарів:', e);
        showNotification('Помилка завантаження товарів: ' + e.message);
        products = [];
        originalProducts = [];
        productsCurrentPage = 1;
        renderAdmin('products');
    } finally {
        isLoadingProducts = false;
    }
}

async function loadCategories() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return null;
        }

        const token = localStorage.getItem('adminToken');
        const response = await fetch('/api/categories', {
            headers: {
                'Authorization': 'Bearer ' + token.toString(),
                'Content-Type': 'application/json'
            },
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('adminToken');
                localStorage.removeItem('csrfToken');
                session = { isAuthenticated: false, timestamp: 0 };
                localStorage.setItem('adminSession', JSON.stringify(session));
                showSection('admin-login');
                showNotification('Сесія закінчилася. Будь ласка, увій знови.');
                return null;
            }
            try {
                const errorData = JSON.parse(text);
                throw new Error(`Не вдалося знайти категорії: ${errorData.error || response.statusText}`);
            } catch {
                throw new Error(`Не вдалося знайти категорії: ${response.status} ${text}`);
            }
        }

        const data = await response.json();
        if (!Array.isArray(data)) {
            console.error('Invalid categories data received:', data);
            categories = [];
            showNotification('Invalid categories data received');
            return null;
        }

        categories = data.map(c => ({
            ...c,
            subcategories: Array.isArray(c.subcategories) ? c.subcategories : []
        }));
        const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id);
        const invalidCategories = categories.filter(c => !c._id || !isValidId(c._id));
        const invalidSubcategories = categories.flatMap(c => 
            (c.subcategories || []).filter(s => !s._id || !isValidId(s._id) || !s.slug || !s.name)
        );
        if (invalidCategories.length > 0 || invalidSubcategories.length > 0) {
            console.error('Found categories or subcategories with invalid format:', {
                invalidCategories,
                invalidSubcategories
            });
            showNotification('Some categories or subcategories have invalid format.');
            categories = categories.filter(c => c._id && isValidId(c._id));
            categories.forEach(c => {
                c.subcategories = (c.subcategories || []).filter(s => s._id && isValidId(s._id) && s.slug && s.name);
            });
        }
        console.log('Categories loaded:', JSON.stringify(categories, null, 2));
        renderCategoriesAdmin();
        return categories;
    } catch (e) {
        console.error('Error loading categories:', e);
        showNotification('Error loading categories: ' + e.message);
        categories = [];
        renderCategoriesAdmin();
        return null;
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
                throw new Error(`Не вдалося отримати CSRF-токен: ${csrfResponse.statusText}`);
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

    try {
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
                        'Authorization': `Bearer ${newToken}`,
                        ...(csrfToken && (options.method === 'POST' || options.method === 'PUT' || options.method === 'PATCH' || options.method === 'DELETE') ? { 'X-CSRF-Token': csrfToken } : {})
                    },
                    credentials: 'include'
                });
                if (!newResponse.ok) {
                    let errorData;
                    try {
                        errorData = await newResponse.json();
                    } catch {
                        errorData = { error: `HTTP error ${newResponse.status}` };
                    }
                    console.error('Помилка повторного запиту:', { url, status: newResponse.status, errorData });
                    const error = new Error(errorData.error || errorData.message || `HTTP error ${newResponse.status}`);
                    error.status = newResponse.status;
                    error.errorData = errorData;
                    if (errorData.details) {
                        if (Array.isArray(errorData.details)) {
                            error.message += `: ${errorData.details.join(', ')}`;
                        } else if (typeof errorData.details === 'string') {
                            error.message += `: ${errorData.details}`;
                        } else if (typeof errorData.details === 'object') {
                            error.message += `: ${JSON.stringify(errorData.details)}`;
                        }
                    }
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
            let errorData;
            try {
                errorData = await response.json();
            } catch {
                errorData = { error: `HTTP error ${response.status}` };
            }
            console.error('Помилка запиту:', { url, status: response.status, errorData });
            const error = new Error(errorData.error || errorData.message || `HTTP error ${response.status}`);
            error.status = response.status;
            error.errorData = errorData;
            if (errorData.details) {
                if (Array.isArray(errorData.details)) {
                    error.message += `: ${errorData.details.join(', ')}`;
                } else if (typeof errorData.details === 'string') {
                    error.message += `: ${errorData.details}`;
                } else if (typeof errorData.details === 'object') {
                    error.message += `: ${JSON.stringify(errorData.details)}`;
                }
            }
            throw error;
        }

        return response;
    } catch (err) {
        console.error('Помилка виконання запиту:', err);
        throw err;
    }
}

function broadcast(type, data) {
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type, action: 'update', data }));
        console.log(`Broadcasting ${type} update:`, data);
    } else {
        console.warn(`WebSocket is not open, cannot broadcast ${type} update`);
    }
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

            if (typeof renderSocials === 'function' && document.getElementById('contacts-socials')) {
                renderSocials();
            }

            return;
        } catch (err) {
            retries++;
            console.error(`Помилка оновлення соціальних мереж (спроба ${retries}/${maxRetries}):`, err);
            if (retries === maxRetries) {
                showNotification('Помилка оновлення соціальних мереж: ' + err.message);
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

async function loadOrders(page = 1, limit = ordersPerPage, statusFilter = '') {
    if (isLoadingOrders) {
        console.log('Завантаження замовлень уже триває, пропускаємо новий виклик loadOrders');
        return;
    }

    isLoadingOrders = true;
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            console.warn('Токен відсутній. Завантаження локальних даних для тестування.');
            orders = [];
            ordersCurrentPage = 1;
            renderAdmin('orders');
            return;
        }

        ordersCurrentPage = page;
        const queryParams = new URLSearchParams({ page: page, limit: limit });
        if (statusFilter && statusFilter !== 'Усі статуси') {
            queryParams.append('status', statusFilter);
        }
        const response = await fetchWithAuth(`/api/orders?${queryParams.toString()}`);
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
        let ordersData = data.orders || data;
        if (!Array.isArray(ordersData)) {
            console.error('Очікувався масив замовлень, отрирано:', data);
            orders = [];
            showNotification('Отрирано некоректні дані замовлень');
            ordersCurrentPage = 1;
            renderAdmin('orders');
            return;
        }

        if (orderNumberCache.size === 0) {
            const allOrdersResponse = await fetchWithAuth(`/api/orders?limit=9999`);
            if (!allOrdersResponse.ok) {
                throw new Error('Не вдалося завантажити всі замовлення для кешу');
            }
            const allOrdersData = await allOrdersResponse.json();
            let allOrders = allOrdersData.orders || allOrdersData;
            allOrders.sort((a, b) => new Date(b.date) - new Date(a.date));
            allOrders.forEach((order, idx) => {
                orderNumberCache.set(order._id, idx + 1);
            });
        }

        const unifiedStatuses = ['Нове замовлення', 'В обробці', 'Відправлено', 'Доставлено', 'Скасовано'];
        let filteredOrders = statusFilter
            ? ordersData.filter(order => unifiedStatuses.includes(order.status) && (statusFilter === 'Усі статуси' || order.status === statusFilter))
            : ordersData.filter(order => unifiedStatuses.includes(order.status));

        totalOrders = data.total || filteredOrders.length;

        const globalIndex = (page - 1) * limit + 1;
        orders = filteredOrders.map((order, index) => {
            const cachedNumber = orderNumberCache.get(order._id);
            return { ...order, orderNumber: cachedNumber || (globalIndex + index) };
        });

        console.log('loadOrders: totalOrders =', totalOrders, 'ordersCurrentPage =', ordersCurrentPage, 'statusFilter =', statusFilter);
        renderAdmin('orders', { total: totalOrders, page: page });
    } catch (e) {
        console.error('Помилка завантаження замовлень:', e);
        showNotification('Помилка завантаження замовлень: ' + e.message);
        orders = [];
        ordersCurrentPage = 1;
        renderAdmin('orders');
    } finally {
        isLoadingOrders = false;
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
    } else if (materialInput && materialInput.tagName === 'SELECT') {
        materialInput.innerHTML = '<option value="">Виберіть матеріал</option>' +
            materials.map(m => `<option value="${m}">${m}</option>`).join('');
    }
}

function updateBrandOptions() {
    const brandInput = document.getElementById('product-brand');
    if (brandInput && brandInput.tagName === 'INPUT') {
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
            await loadCategories();
            await initializeData();
            connectAdminWebSocket();
            startTokenRefreshTimer();
            resetInactivityTimer();

            if (activeTab === 'products') {
                await loadProducts(productsCurrentPage, productsPerPage);
            }
        } else {
            showSection('admin-login');
            if (response.status === 401 || response.status === 403) {
                showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
            }
        }
    } catch (e) {
        console.error('Помилка перевірки авторизації:', e);
        showSection('admin-login');
        showNotification('Не вдалося перевірити авторизацію. Перевірте з\'єднання.');
    }
}

    function openResizeModal(media) {
        const previouslySelected = document.querySelector('.quill-media-selected');
        if (previouslySelected) {
            previouslySelected.classList.remove('quill-media-selected');
        }

        media.classList.add('quill-media-selected');
        selectedMedia = media;

        const currentWidth = media.getAttribute('width') || media.style.width || '';
        const currentHeight = media.getAttribute('height') || media.style.height || '';

        document.getElementById('media-width').value = currentWidth;
        document.getElementById('media-height').value = currentHeight;

        const resizeModal = document.getElementById('resize-modal');
        resizeModal.classList.add('active');
        resetInactivityTimer();
    }

    function closeResizeModal() {
        const resizeModal = document.getElementById('resize-modal');
        resizeModal.classList.remove('active');

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

    const isValidDimension = (value) => {
        return value === '' || /^\d+(\.\d+)?(%|px)?$/.test(value);
    };

    if (!isValidDimension(width) || !isValidDimension(height)) {
        alert('Введіть коректні розміри (наприклад, 300, 50%, 200px)!');
        return;
    }

    if (width) {
        selectedMedia.setAttribute('width', width);
        selectedMedia.style.width = width;
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

    const editorId = selectedMedia.closest('#about-editor') ? 'about-edit' : 'product-description';
    const editor = selectedMedia.closest('#about-editor') ? aboutEditor : document.querySelector('#product-description-editor').__quill;
    document.getElementById(editorId).value = editor.root.innerHTML;

    closeResizeModal();
    unsavedChanges = true;
    resetInactivityTimer();
}

function setDefaultVideoSizes(editor, editorId) {
    const iframes = editor.root.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        if (!iframe.style.width && !iframe.style.height) {
            iframe.style.width = '50%';
            iframe.style.height = '300px';
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

        productEditor.on('text-change', () => {
            document.getElementById('product-description').value = productEditor.root.innerHTML;
            unsavedChanges = true;
        });

        productEditor.on('selection-change', (range) => {
            if (range && range.length > 0) {
                const [embed] = productEditor.getContents(range.index, range.length).ops.filter(op => op.insert && (op.insert.image || op.insert.video));
                selectedMedia = embed ? { type: embed.insert.image ? 'image' : 'video', url: embed.insert.image || embed.insert.video } : null;
            } else {
                selectedMedia = null;
            }
        });

        productEditor.root.addEventListener('click', (e) => {
            const target = e.target;
            if (target.tagName === 'IMG' || target.tagName === 'IFRAME') {
                openResizeModal(target);
            }
        });

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

function showModal(content) {
    const modal = document.getElementById('modal');
    if (!modal) {
        console.error('Модальне вікно #modal не знайдено');
        showNotification('Помилка: модальне вікно не знайдено');
        return;
    }
    modal.innerHTML = content;
    modal.style.display = 'block';
    modal.classList.add('active');
    isModalOpen = true;
    resetInactivityTimer();
}

session = { isActive: false, timestamp: 0 };

async function login() {
    const username = document.getElementById('admin-username')?.value?.trim();
    const password = document.getElementById('admin-password')?.value;

    if (!username || !password) {
        showNotification('Введіть ім\'я користувача та пароль!');
        return;
    }

    console.log('Спроба входу:', { username, passwordLength: password.length });

    try {
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
        startTokenRefreshTimer();
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
    localStorage.removeItem('csrfToken');
    session = { isActive: false, timestamp: 0 };
    localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.close(1000, 'User logged out');
    }
    socket = null;
    showSection('admin-login');
    showNotification('Ви вийшли з системи');
}

document.addEventListener('DOMContentLoaded', () => {
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

    if (document.getElementById('about-editor')) {
        initializeEditors();
    }

    if (document.getElementById('orders')) {
        loadOrders(1, ordersPerPage);
    }

    const searchInput = document.getElementById('product-search');
    if (searchInput) {
        searchInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const query = searchInput.value.trim();
                if (!query) {
                    clearSearch();
                } else {
                    searchProducts();
                }
            }
        });
        searchInput.addEventListener('input', () => {
            if (!searchInput.value) {
                clearSearch();
            }
        });
    }

    const searchButton = document.getElementById('search-button');
    if (searchButton) {
        searchButton.addEventListener('click', () => {
            const query = document.getElementById('product-search').value.trim();
            if (!query) {
                clearSearch();
            } else {
                searchProducts();
            }
        });
    } else {
        console.warn('Елемент #search-button не знайдено');
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
    }, 25 * 60 * 1000);
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
        const logoWidth = logoWidthInput ? parseInt(logoWidthInput) || 0 : 0;
        const faviconUrl = document.getElementById('favicon-url').value;
        const faviconFile = document.getElementById('favicon-file').files[0];

        const token = localStorage.getItem('adminToken');
        let finalLogoUrl = logoUrl;
        let finalFaviconUrl = faviconUrl;

        const csrfResponse = await fetch('https://mebli.onrender.com/api/csrf-token', {
            method: 'GET',
            credentials: 'include'
        });
        const csrfData = await csrfResponse.json();
        const csrfToken = csrfData.csrfToken;

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
            logoWidth: logoWidth,
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

        const phones = document.getElementById('contact-phones').value.trim();
        const addresses = document.getElementById('contact-addresses').value.trim();
        const schedule = document.getElementById('contact-schedule').value.trim();

        if (!phones || !addresses || !schedule) {
            showNotification('Усі поля контактів (телефони, адреси, графік) мають бути заповнені.');
            return;
        }

        const phoneRegex = /^\+?[0-9\s\-()]{9,}$/;
        if (!phoneRegex.test(phones)) {
            showNotification('Некоректний формат номеру телефону. Використовуйте формат, наприклад, +380123456789.');
            return;
        }

        const contacts = {
            phones,
            addresses,
            schedule
        };

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

        settings.contacts = responseData.contacts || contacts;
        settings.name = responseData.name || settings.name;

        showNotification('Контакти успішно оновлено!');
        renderSettingsAdmin();
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
    if (url === null) return;

    const name = prompt('Введіть нову назву соцмережі:', social.name || '');
    if (name === null) return;

    const urlRegex = /^(https?:\/\/[^\s$.?#].[^\s]*)$/;
    if (!url || !urlRegex.test(url)) {
        showNotification('Введіть коректний URL (наприклад, https://facebook.com)!');
        return;
    }

    if (!name.trim() || name.trim().length < 2) {
        showNotification('Назва соцмережі повинна містити принаймні 2 символи!');
        return;
    }

    const iconSelect = document.createElement('select');
    iconSelect.innerHTML = `
        <option value="🔗" ${social.icon === '🔗' ? 'selected' : ''}>Загальний (🔗)</option>
        <option value="📘" ${social.icon === '📘' ? 'selected' : ''}>Facebook (📘)</option>
        <option value="📸" ${social.icon === '📸' ? 'selected' : ''}>Instagram (📸)</option>
        <option value="🐦" ${social.icon === '🐦' ? 'selected' : ''}>Twitter (🐦)</option>
        <option val▶️" ${social.icon === '▶️' ? 'selected' : ''}>YouTube (▶️)</option>
        <option value="✈️" ${social.icon === '✈️' ? 'selected' : ''}>Telegram (✈️)</option>
    `;
    const iconPrompt = document.createElement('div');
    iconPrompt.innerHTML = '<label>Виберіть іконку:</label>';
    iconPrompt.appendChild(iconSelect);
    document.body.appendChild(iconPrompt);

    const confirmEdit = confirm('Підтвердіть редагування соцмережі');
    if (confirmEdit) {
        settings.socials[index].url = url;
        settings.socials[index].icon = iconSelect.value;
        settings.socials[index].name = name.trim();
        await updateSocials();
    }

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

function renderAdmin(section = activeTab, data = {}) {
    console.log('Рендеринг адмін-панелі з activeTab:', section);

    try {
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
            if (Array.isArray(categories) && categories.length > 0) {
                renderCategoriesAdmin();
            } else {
                catList.innerHTML = '<p>Категорії ще завантажуються...</p>';
            }
        } else {
            console.warn('Елемент #category-list-admin не знайдено');
        }
    } catch (e) {
        console.error(`Помилка рендерингу вкладки ${section}:`, e);
        showNotification(`Помилка рендерингу вкладки ${section}: ${e.message}`);
    }

    if (section === 'products') {
        if (!data.products && (products.length === 0 || products.length > productsPerPage)) {
            loadProducts(productsCurrentPage, productsPerPage);
            return;
        }

        const productList = document.getElementById('product-list-admin');
        if (productList) {
            const currentProducts = data.products || products;
            const totalItems = data.total !== undefined ? data.total : totalProducts;
            const currentPage = data.page || productsCurrentPage;

            productList.innerHTML = Array.isArray(currentProducts) && currentProducts.length > 0
                ? currentProducts.map(p => {
                    const priceInfo = p.type === 'simple'
                        ? `${p.price || '0'} грн`
                        : (p.sizes?.length > 0
                            ? `від ${Math.min(...p.sizes.map(s => s.price))} грн`
                            : 'Ціна не вказана');
                    const salePriceInfo = p.type === 'simple'
                        ? (p.salePrice != null && p.salePrice !== undefined ? `${p.salePrice} грн` : '-')
                        : (p.sizes?.length > 0
                            ? (() => {
                                const salePrices = p.sizes
                                    .filter(s => s.salePrice != null && s.salePrice !== undefined)
                                    .map(s => `${s.salePrice} грн`);
                                return salePrices.length > 0 ? salePrices.join(', ') : '-';
                            })()
                            : '-');
                    return `
                        <div class="product-admin-item">
                            <span>#${p.tempNumber}</span>
                            <span>${p.type}</span>
                            <span>${p.name}</span>
                            <span>${p.brand || 'Без бренду'}</span>
                            <span>${priceInfo}</span>
                            <span>${salePriceInfo}</span>
                            <div class="status-column">
                                <button onclick="openEditProductModal('${p._id}')">Редагувати</button>
                                <button onclick="deleteProduct('${p._id}')">Видалити</button>
                                <button onclick="toggleProductActive('${p._id}', ${p.active})">${p.active ? 'Деактивувати' : 'Активувати'}</button>
                            </div>
                        </div>
                    `;
                }).join('')
                : '<p>Товари відсутні</p>';

            renderPagination(totalItems, productsPerPage, 'pagination', currentPage);
        } else {
            console.warn('Елемент #product-list-admin не знайдено');
        }
    } else if (section === 'orders') {
        if (!data.products && (orders.length === 0 || orders.length > ordersPerPage) && !isLoadingOrders) {
            const statusFilter = document.getElementById('order-status-filter')?.value || '';
            loadOrders(ordersCurrentPage, ordersPerPage, statusFilter);
            return;
        }

        const orderList = document.getElementById('order-list');
        if (orderList) {
            orderList.innerHTML = Array.isArray(orders) && orders.length > 0
                ? orders.map((o, index) => {
                    const orderDate = o.date ? new Date(o.date) : new Date();
                    const formattedDate = isNaN(orderDate.getTime())
                        ? 'Невідома дата'
                        : orderDate.toLocaleString('uk-UA', {
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
                            <span>#${o.orderNumber || (index + 1)} ${formattedDate} - ${o.total || '0'} грн (${o.status || 'Н/Д'})</span>
                            <div>
                                <button class="edit-btn" onclick="viewOrder(${orders.indexOf(o)})">Переглянути</button>
                                <button class="toggle-btn" onclick="changeOrderStatus(${orders.indexOf(o)})">Змінити статус</button>
                                <button class="delete-btn" onclick="deleteOrder(${orders.indexOf(o)})">Видалити</button>
                            </div>
                        </div>
                    `;
                }).join('')
                : '<p>Замовлення відсутні</p>';

            const orderControls = document.getElementById('order-controls');
            if (orderControls) {
                orderControls.innerHTML = `
                    <select id="order-status-filter" onchange="filterOrders()">
                        <option value="Усі статуси">Усі статуси</option>
                        <option value="Нове замовлення">Нове замовлення</option>
                        <option value="В обробці">В обробці</option>
                        <option value="Відправлено">Відправлено</option>
                        <option value="Доставлено">Доставлено</option>
                        <option value="Скасовано">Скасовано</option>
                    </select>
                    <select id="order-sort" onchange="sortOrders(this.value)">
                        <option value="date-desc">Дата (новіші)</option>
                        <option value="date-asc">Дата (старіші)</option>
                        <option value="total-desc">Сума (спадання)</option>
                        <option value="total-asc">Сума (зростання)</option>
                    </select>
                `;
            }

            const totalItems = data.total !== undefined && data.total !== null ? data.total : totalOrders;
            renderPagination(totalItems, ordersPerPage, 'order-pagination', ordersCurrentPage);
        } else {
            console.warn('Елемент #order-list не знайдено');
        }
    } else if (section === 'categories') {
        if (typeof renderCategoriesAdmin === 'function' && Array.isArray(categories) && categories.length > 0) {
            renderCategoriesAdmin();
        } else {
            const catList = document.getElementById('category-list-admin');
            if (catList) {
                catList.innerHTML = '<p>Категорії ще завантажуються...</p>';
            }
        }
    } else if (section === 'site-editing') {
        if (typeof renderSettingsAdmin === 'function') renderSettingsAdmin();
        if (typeof renderSlidesAdmin === 'function') renderSlidesAdmin();
    } else {
        console.warn(`Невідома вкладка: ${section}`);
    }

    resetInactivityTimer();
}

function renderCategoriesAdmin() {
    const categoryList = document.getElementById('category-list-admin');
    if (!categoryList) {
        console.error('Елемент #category-list-admin не знайдено');
        return;
    }

    console.log('Рендеринг категорій:', JSON.stringify(categories, null, 2));

    if (!Array.isArray(categories) || categories.length === 0) {
        categoryList.innerHTML = '<p>Категорії відсутні.</p>';
        return;
    }

    const normalizedCategories = categories.map(cat => cat.category || cat);
    const sortedCategories = [...normalizedCategories].sort((a, b) => (a.order || 0) - (b.order || 0));

    categoryList.innerHTML = sortedCategories.map((category, index) => {
        const sortedSubcategories = Array.isArray(category.subcategories)
            ? [...category.subcategories].sort((a, b) => (a.order || 0) - (b.order || 0))
            : [];

        return `
        <div class="category-item">
            <div class="category-order-controls">
                <button class="move-btn move-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="move-btn move-down" data-index="${index}" ${index === sortedCategories.length - 1 ? 'disabled' : ''}>↓</button>
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
                ${sortedSubcategories.length > 0 ? sortedSubcategories.map((sub, subIndex) => `
                    <div class="subcategory-item">
                        <div class="subcategory-order-controls">
                            <button class="move-btn sub-move-up" data-cat-id="${category._id}" data-sub-id="${sub._id}" ${subIndex === 0 ? 'disabled' : ''}>↑</button>
                            <button class="move-btn sub-move-down" data-cat-id="${category._id}" data-sub-id="${sub._id}" ${subIndex === sortedSubcategories.length - 1 ? 'disabled' : ''}>↓</button>
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
        `;
    }).join('');

    // Видаляємо старий слухач подій, якщо він існує
    const handleClick = debounce((event) => {
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
            const category = normalizedCategories.find(c => c._id === catId);
            if (category && Array.isArray(category.subcategories)) {
                const subIndex = category.subcategories.findIndex(s => s._id === subId);
                if (subIndex !== -1) {
                    moveSubcategoryUp(catId, subIndex);
                }
            }
        } else if (target.classList.contains('sub-move-down')) {
            const catId = target.dataset.catId;
            const subId = target.dataset.subId;
            const category = normalizedCategories.find(c => c._id === catId);
            if (category && Array.isArray(category.subcategories)) {
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
    }, 300);

    // Видаляємо попередній слухач, якщо він був доданий
    categoryList.removeEventListener('click', categoryList._clickHandler);
    categoryList._clickHandler = handleClick; // Зберігаємо посилання на новий слухач
    categoryList.addEventListener('click', handleClick);

    const subcatSelect = document.getElementById('subcategory-category');
    if (subcatSelect) {
        const currentValue = subcatSelect.value;
        subcatSelect.innerHTML = '<option value="">Виберіть категорію</option>' +
            sortedCategories.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
        subcatSelect.value = currentValue || '';
    }

    const productCatSelect = document.getElementById('product-category');
    if (productCatSelect) {
        const currentValue = productCatSelect.value;
        productCatSelect.innerHTML = '<option value="">Без категорії</option>' +
            sortedCategories.map(c => `<option value="${c.slug}" ${c.slug === currentValue ? 'selected' : ''}>${c.name}</option>`).join('');
        productCatSelect.value = currentValue || '';
        updateSubcategories();
    }

    resetInactivityTimer();
}

function renderSocialsAdmin() {
    const socialList = document.getElementById('social-list');
    if (!socialList) return;

    if (!settings.showSocials) {
        socialList.innerHTML = '<p>Соціальні мережі відключені (не відображаються на сайті)</p>';
    } else {
        socialList.innerHTML = '';
    }

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
    if (!confirm('Ви впевнені, що хочете видалити цю категорію? Усі товари в цій категорії втратять прив\'язку до неї.')) {
        return;
    }

    try {
        isUpdatingCategories = true;
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

        categories = categories.filter(c => c._id !== categoryId);
        renderCategoriesAdmin();

        const response = await fetchWithAuth(`https://mebli.onrender.com/api/categories/id/${categoryId}`, {
            method: 'DELETE',
            headers: {
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            }
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка: ${errorData.error || response.statusText}`);
        }

        localStorage.setItem('categories', JSON.stringify(categories));
        renderAdmin('products');
        showNotification('Категорію видалено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка видалення категорії:', err);
        showNotification('Не вдалося видалити категорію: ' + err.message);
        categories = JSON.parse(localStorage.getItem('categories') || '[]');
        renderCategoriesAdmin();
    } finally {
        isUpdatingCategories = false;
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

    renderSocialsAdmin();

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
    renderSlideModal(); // Викликаємо модальне вікно для нового слайду
}

function renderSlideModal(slide = {}) {
    const modalContent = `
        <div class="modal-content">
            <h2>${slide._id ? 'Редагувати слайд' : 'Додати слайд'}</h2>
            <label>Фото слайду:</label>
            <input type="file" id="slide-photo-file" accept="image/*">
            ${slide.photo ? `<img src="${slide.photo}" alt="Slide Photo" style="max-width: 100px; margin-top: 10px;">` : ''}
            <label>Посилання:</label>
            <input type="text" id="slide-link" value="${slide.link || ''}" placeholder="Введіть URL">
            <label>Порядок:</label>
            <input type="number" id="slide-order" value="${slide.order !== undefined ? slide.order : slides.length}" min="0">
            <div class="modal-actions">
                <button onclick="${slide._id ? `updateSlide('${slide._id}')` : 'addSlide()'}">Зберегти</button>
                <button onclick="closeSlideModal()">Скасувати</button>
            </div>
        </div>
    `;
    showModal(modalContent);
}

// Окрема функція для закриття модального вікна слайдів
function closeSlideModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.remove('active');
        modal.style.display = ''; // Скидаємо display для слайдів
        modal.innerHTML = '';
        isModalOpen = false;
        console.log('Модальне вікно слайдів закрито');
    }
    resetInactivityTimer();
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
                <button class="edit-btn" onclick="renderSlideModal({ _id: '${s._id}', photo: '${s.photo || s.image}', link: '${s.link || ''}', order: ${s.order || index} })">Редагувати</button>
                <button class="delete-btn" onclick="deleteSlide(${index})">Видалити</button>
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
    if (!container) {
        console.warn(`Контейнер для пагінації з ID ${containerId} не знайдено`);
        return;
    }

    container.innerHTML = '';
    if (totalPages <= 1) return;

    const page = containerId === 'order-pagination' ? ordersCurrentPage : productsCurrentPage;

    const prevBtn = document.createElement('button');
    prevBtn.textContent = 'Попередня';
    prevBtn.disabled = page <= 1;
    prevBtn.onclick = () => {
        if (page > 1) {
            const newPage = page - 1;
            if (containerId === 'order-pagination') {
                const statusFilter = document.getElementById('order-status-filter')?.value || '';
                loadOrders(newPage, itemsPerPage, statusFilter);
            } else {
                loadProducts(newPage, itemsPerPage);
            }
        }
    };
    container.appendChild(prevBtn);

    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);
    for (let i = startPage; i <= endPage; i++) {
        const btn = document.createElement('button');
        btn.textContent = i;
        btn.className = i === page ? 'active' : '';
        btn.onclick = () => {
            if (containerId === 'order-pagination') {
                const statusFilter = document.getElementById('order-status-filter')?.value || '';
                loadOrders(i, itemsPerPage, statusFilter);
            } else {
                loadProducts(i, itemsPerPage);
            }
        };
        container.appendChild(btn);
    }

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Наступна';
    nextBtn.disabled = page >= totalPages;
    nextBtn.onclick = () => {
        if (page < totalPages) {
            const newPage = page + 1;
            if (containerId === 'order-pagination') {
                const statusFilter = document.getElementById('order-status-filter')?.value || '';
                loadOrders(newPage, itemsPerPage, statusFilter);
            } else {
                loadProducts(newPage, itemsPerPage);
            }
        }
    };
    container.appendChild(nextBtn);
}

function closeModal() {
    const modal = document.getElementById('modal');
    if (modal) {
        modal.classList.remove('active');
        // Скидаємо display тільки якщо він був встановлений
        if (modal.style.display === 'block') {
            modal.style.display = '';
        }
        modal.innerHTML = '';
        isModalOpen = false;
        console.log('Модальне вікно закрито');
    }
    newProduct = {}; // Скидаємо newProduct
    unsavedChanges = false; // Скидаємо прапорець незбережених змін
    resetInactivityTimer();
}

function validateFile(file) {
    const maxSize = 10 * 1024 * 1024;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
        return { valid: false, error: 'Непідтримуваний тип файлу!' };
    }
    if (file.size > maxSize) {
        return { valid: false, error: 'Файл занадто великий (максимум 10 МБ)!' };
    }
    return { valid: true };
}

function sanitize(str) {
    if (typeof str !== 'string' || str === null || str === undefined) {
        return ''; // Повертаємо порожній рядок лише для некоректних значень
    }
    return str.replace(/[<>"]/g, (char) => ({
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
    })[char] || char).trim();
}

function openEditCategoryModal(categoryId) {
    const modal = document.getElementById('modal');
    if (!modal) {
        console.error('Модальне вікно з id="modal" не знайдено!');
        showNotification('Модальне вікно не знайдено.');
        return;
    }

    const category = categories.find(c => c._id === categoryId);
    if (!category) {
        console.error('Категорію з id', categoryId, 'не знайдено');
        showNotification('Категорію не знайдено.');
        return;
    }

    modal.innerHTML = `
        <div class="modal-content">
            <h3>Редагувати категорію</h3>
            <form id="edit-category-form">
                <input id="category-name" placeholder="Назва категорії" type="text" value="${sanitize(category.name) || ''}" required /><br/>
                <label for="category-name">Назва категорії</label>
                <input id="category-slug" placeholder="Шлях категорії" type="text" value="${sanitize(category.slug) || ''}" required /><br/>
                <label for="category-slug">Шлях категорії</label>
                <input id="category-photo-url" placeholder="URL зображення" type="text" value="${sanitize(category.photo) || ''}" /><br/>
                <label for="category-photo-url">URL зображення</label>
                <input accept="image/*" id="category-photo-file" type="file" /><br/>
                <label for="category-photo-file">Завантажте зображення</label>
                <select id="category-visible">
                    <option value="true" ${category.visible ? 'selected' : ''}>Показувати</option>
                    <option value="false" ${!category.visible ? 'selected' : ''}>Приховати</option>
                </select><br/>
                <label for="category-visible">Видимість</label>
                <div class="modal-actions">
                    <button type="submit">Зберегти</button>
                    <button type="button" onclick="closeModal()">Скасувати</button>
                </div>
            </form>
        </div>
    `;

    modal.classList.add('active');
    isModalOpen = true;
    console.log('Відкрито модальне вікно для редагування категорії:', categoryId);

    const form = document.getElementById('edit-category-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateCategoryData(categoryId);
    });

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
            showNotification('Назва та шлях категорії обов\'язкові!');
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

async function updateCategoryData(categoryId) {
    try {
        isUpdatingCategories = true;
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        // Вибираємо форму саме з модального вікна
        const modal = document.getElementById('modal');
        const nameInput = modal.querySelector('#category-name');
        const slugInput = modal.querySelector('#category-slug');
        const fileInput = modal.querySelector('#category-photo-file');
        const photoUrlInput = modal.querySelector('#category-photo-url');
        const visibleSelect = modal.querySelector('#category-visible');

        if (!nameInput || !slugInput || !fileInput || !photoUrlInput || !visibleSelect) {
            showNotification('Не вдалося знайти всі необхідні поля форми.');
            return;
        }

        const name = nameInput.value.trim();
        const slug = slugInput.value.trim() || name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '');
        const visible = visibleSelect.value === 'true';
        const file = fileInput.files[0];
        const photoUrl = photoUrlInput.value.trim();

        if (!name || !slug) {
            showNotification('Введіть назву та шлях категорії!');
            return;
        }

        if (!/^[a-z0-9-]+$/.test(slug)) {
            showNotification('Шлях категорії може містити лише малі літери, цифри та дефіси!');
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
        // Якщо ні файл, ні URL не вказані, залишаємо photo порожнім

        const category = categories.find(c => c._id === categoryId);
        const updatedCategory = {
            name,
            slug,
            photo: photo, // Дозволяємо порожнє значення
            visible,
            order: category ? category.order : 0,
            subcategories: category ? category.subcategories : []
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
            const errorData = await response.json();
            throw new Error(`Помилка оновлення категорії: ${errorData.error || response.statusText}`);
        }

        const responseData = await response.json();
        const updatedCategoryData = responseData.category || responseData;

        categories = categories.map(c =>
            c._id === categoryId
                ? { ...updatedCategoryData, subcategories: updatedCategoryData.subcategories || [] }
                : c
        );
        localStorage.setItem('categories', JSON.stringify(categories));
        broadcast('categories', categories);

        closeModal();
        await loadCategories();
        renderCategoriesAdmin();
        showNotification('Категорію оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення категорії:', err);
        showNotification('Не вдалося оновити категорію: ' + err.message);
    } finally {
        isUpdatingCategories = false;
    }
}

function deepEqual(a, b) {
    if (a === b) return true;
    if (a == null || b == null) return a === b;
    if (typeof a !== 'object' || typeof b !== 'object') return a === b;

    if (Array.isArray(a) && Array.isArray(b)) {
        if (a.length !== b.length) return false;
        return a.every((item, index) => deepEqual(item, b[index]));
    }

    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;

    for (const key of keysA) {
        if (!keysB.includes(key) || !deepEqual(a[key], b[key])) return false;
    }
    return true;
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

        console.log('Дані для сервера:', category);

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

async function moveCategory(categoryIndex, direction) {
    try {
        if (categoryIndex < 0 || categoryIndex >= categories.length) {
            showNotification('Невірний індекс категорії');
            return;
        }

        const movedCategory = categories[categoryIndex];
        let targetCategory;

        // Конвертуємо числові напрямки в рядки
        if (direction === -1 || direction === 'up') {
            if (categoryIndex > 0) {
                targetCategory = categories[categoryIndex - 1];
            } else {
                console.log('Неможливо перемістити категорію вгору');
                return;
            }
        } else if (direction === 1 || direction === 'down') {
            if (categoryIndex < categories.length - 1) {
                targetCategory = categories[categoryIndex + 1];
            } else {
                console.log('Неможливо перемістити категорію вниз');
                return;
            }
        } else {
            console.log('Невірний напрямок:', direction);
            return;
        }

        // Міняємо порядки
        const tempOrder = movedCategory.order;
        movedCategory.order = targetCategory.order;
        targetCategory.order = tempOrder;

        // Сортуємо категорії за новим порядком
        const sortedCategories = [...categories].sort((a, b) => (a.order || 0) - (b.order || 0));

        console.log('sortedCategories:', sortedCategories);
        console.log('Тип sortedCategories:', typeof sortedCategories);
        console.log('Array.isArray(sortedCategories):', Array.isArray(sortedCategories));
        
        const payload = {
            categories: sortedCategories.map(cat => ({
                _id: String(cat._id),
                order: Number(cat.order)
            }))
        };

        console.log('Відправляємо дані для оновлення порядку:', payload);
        console.log('Тип payload.categories:', typeof payload.categories);
        console.log('Довжина payload.categories:', payload.categories.length);
        console.log('JSON.stringify(payload):', JSON.stringify(payload));
        payload.categories.forEach((cat, index) => {
            console.log(`Категорія ${index}:`, cat);
            console.log(`  _id: ${cat._id} (тип: ${typeof cat._id})`);
            console.log(`  order: ${cat.order} (тип: ${typeof cat.order})`);
        });

        const response = await fetchWithAuth('/api/categories/order', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Помилка зміни порядку категорій');
        }

        const result = await response.json();
        showNotification('Порядок категорій оновлено', 'success');
        
        // Оновлюємо локальні дані після успішного оновлення
        if (result.categories) {
            categories = result.categories;
        renderCategoriesAdmin();
        }
        
    } catch (error) {
        console.error('Помилка зміни порядку категорій:', error);
        showNotification('Помилка зміни порядку категорій: ' + error.message, 'error');
        
        // Відновлюємо початковий порядок
        if (typeof renderCategoriesAdmin === 'function') {
            renderCategoriesAdmin();
        } else {
            // Якщо функція renderCategoriesAdmin не існує, просто перезавантажуємо сторінку
            location.reload();
        }
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

async function updateSubcategoryData(categoryId, subcategoryId) {
    try {
        isUpdatingCategories = true;
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        // Вибираємо форму саме з модального вікна
        const modal = document.getElementById('modal');
        const nameInput = modal.querySelector('#subcategory-name');
        const slugInput = modal.querySelector('#subcategory-slug');
        const photoUrlInput = modal.querySelector('#subcategory-photo-url');
        const photoFileInput = modal.querySelector('#subcategory-photo-file');
        const visibleSelect = modal.querySelector('#subcategory-visible');

        if (!nameInput || !slugInput || !visibleSelect) {
            showNotification('Елементи форми для редагування підкатегорії не знайдено.');
            return;
        }

        const name = nameInput.value?.trim();
        const slug = slugInput.value?.trim() || name.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/(^-|-$)/g, '');
        const visible = visibleSelect.value === 'true';
        let photo = photoUrlInput?.value?.trim() || '';

        if (!name || name.length < 1) {
            showNotification('Назва підкатегорії є обов\'язковою та повинна містити хоча б 1 символ!');
            return;
        }

        if (!slug || !/^[a-z0-9-]+$/.test(slug)) {
            showNotification('Шлях підкатегорії є обов\'язковим і може містити лише малі літери, цифри та дефіси!');
            return;
        }

        const category = categories.find(c => c._id === categoryId);
        if (!category) {
            showNotification('Категорію не знайдено!');
            return;
        }

        const subcategory = category.subcategories.find(sub => sub._id === subcategoryId);
        if (!subcategory) {
            showNotification('Підкатегорію не знайдено!');
            return;
        }

        const existingSubcategory = category.subcategories.find(sub => sub.name === name && sub._id !== subcategoryId);
        if (existingSubcategory) {
            showNotification('Назва підкатегорії має бути унікальною в цій категорії!');
            return;
        }

        const existingSlug = category.subcategories.find(sub => sub.slug === slug && sub._id !== subcategoryId);
        if (existingSlug) {
            showNotification('Шлях підкатегорії має бути унікальним в цій категорії!');
            return;
        }

        if (photo && !/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)$/i.test(photo)) {
            showNotification('URL фотографії має бути валідним (jpg, jpeg, png, gif, webp)!');
            return;
        }

        if (photoFileInput?.files?.length > 0) {
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
            if (!data.url) throw new Error('Помилка завантаження фото');
            photo = data.url;
        }
        // Якщо ні файл, ні URL не вказані, залишаємо photo порожнім

        const updatedSubcategory = {
            name,
            slug,
            photo: photo, // Дозволяємо порожнє значення
            visible,
            order: typeof subcategory.order === "number" ? subcategory.order : 0
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
            const errorData = await response.json();
            throw new Error(`Помилка оновлення підкатегорії: ${errorData.error || response.statusText}`);
        }

        const responseData = await response.json();
        const updatedCategoryData = responseData.category;

        categories = categories.map(c =>
            c._id === categoryId
                ? { ...updatedCategoryData, subcategories: updatedCategoryData.subcategories || [] }
                : c
        );
        localStorage.setItem('categories', JSON.stringify(categories));
        broadcast('categories', categories);

        closeModal();
        await loadCategories();
        renderCategoriesAdmin();
        showNotification('Підкатегорію оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення підкатегорії:', err);
        showNotification('Не вдалося оновити підкатегорію: ' + err.message);
    } finally {
        isUpdatingCategories = false;
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
    const modal = document.getElementById('modal');
    if (!modal) {
        console.error('Модальне вікно з id="modal" не знайдено!');
        showNotification('Модальне вікно не знайдено.');
        return;
    }

    const category = categories.find(c => c._id === categoryId);
    if (!category) {
        console.error('Категорію з id', categoryId, 'не знайдено');
        showNotification('Категорію не знайдено.');
        return;
    }

    const subcategory = category.subcategories.find(s => s._id === subcategoryId);
    if (!subcategory) {
        console.error('Підкатегорію з id', subcategoryId, 'не знайдено');
        showNotification('Підкатегорію не знайдено.');
        return;
    }

    modal.innerHTML = `
        <div class="modal-content">
            <h3>Редагувати підкатегорію</h3>
            <form id="edit-subcategory-form">
                <input id="subcategory-name" placeholder="Назва підкатегорії" type="text" value="${sanitize(subcategory.name) || ''}" required /><br/>
                <label for="subcategory-name">Назва підкатегорії</label>
                <input id="subcategory-slug" placeholder="Шлях підкатегорії" type="text" value="${sanitize(subcategory.slug) || ''}" required /><br/>
                <label for="subcategory-slug">Шлях підкатегорії</label>
                <input id="subcategory-photo-url" placeholder="URL зображення" type="text" value="${sanitize(subcategory.photo) || ''}" /><br/>
                <label for="subcategory-photo-url">URL зображення</label>
                <input accept="image/*" id="subcategory-photo-file" type="file" /><br/>
                <label for="subcategory-photo-file">Завантажте зображення</label>
                <select id="subcategory-visible">
                    <option value="true" ${subcategory.visible ? 'selected' : ''}>Показувати</option>
                    <option value="false" ${!subcategory.visible ? 'selected' : ''}>Приховати</option>
                </select><br/>
                <label for="subcategory-visible">Видимість</label>
                <div class="modal-actions">
                    <button type="submit">Зберегти</button>
                    <button type="button" onclick="closeModal()">Скасувати</button>
                </div>
            </form>
        </div>
    `;

    modal.classList.add('active');
    isModalOpen = true;
    console.log('Відкрито модальне вікно для редагування підкатегорії:', subcategoryId);

    const form = document.getElementById('edit-subcategory-form');
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await updateSubcategoryData(categoryId, subcategoryId);
    });

    resetInactivityTimer();
}

async function deleteSubcategory(categoryId, subcategoryId) {
    if (!confirm('Ви впевнені, що хочете видалити цю підкатегорію? Усі товари в цій підкатегорії втратять прив\'язку до неї.')) {
        return;
    }

    try {
        isUpdatingCategories = true;
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

        const subcategory = category.subcategories.find(s => s._id === subcategoryId);
        if (!subcategory) {
            showNotification('Підкатегорія не знайдена!');
            return;
        }

        const categoryIndex = categories.findIndex(c => c._id === categoryId);
        categories[categoryIndex].subcategories = categories[categoryIndex].subcategories.filter(s => s._id !== subcategoryId);
        renderCategoriesAdmin();

        const response = await fetchWithAuth(`https://mebli.onrender.com/api/categories/${categoryId}/subcategories/${subcategoryId}`, {
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
        categories[categoryIndex] = { ...updatedCategory, subcategories: updatedCategory.subcategories || [] };
        localStorage.setItem('categories', JSON.stringify(categories));

        // Підкатегорія успішно видалена
        showNotification('Підкатегорію видалено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка видалення підкатегорії:', err);
        showNotification('Не вдалося видалити підкатегорію: ' + err.message);
        categories = JSON.parse(localStorage.getItem('categories') || '[]');
        renderCategoriesAdmin();
    } finally {
        isUpdatingCategories = false;
    }
}

async function moveSubcategory(categoryId, subIndex, direction) {
    const category = categories.find(c => c._id === categoryId);
    if (!category) return;
        const sortedSubcategories = [...category.subcategories].sort((a, b) => (a.order || 0) - (b.order || 0));
    if ((direction === -1 && subIndex <= 0) || (direction === 1 && subIndex >= sortedSubcategories.length - 1)) return;

        const sub1 = sortedSubcategories[subIndex];
    const sub2 = sortedSubcategories[subIndex + direction];

    const tempOrder = sub1.order;
    sub1.order = sub2.order;
    sub2.order = tempOrder;

    const payload = {
        subcategories: sortedSubcategories.map(sub => ({
            _id: String(sub._id),
            order: Number(sub.order)
        }))
    };

    try {
        const response = await fetchWithAuth(`/api/categories/${categoryId}/subcategories/order`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || response.statusText);
        }

        // Оновлюємо локальні дані одразу
        const updatedCategory = await response.json();
        categories = categories.map(c =>
            c._id === categoryId ? updatedCategory : c
        );
        localStorage.setItem('categories', JSON.stringify(categories));
        broadcast('categories', categories);

        renderCategoriesAdmin();
        showNotification('Порядок підкатегорій змінено!');
    } catch (err) {
        console.error('Помилка зміни порядку підкатегорій:', err);
        showNotification('Не вдалося змінити порядок підкатегорій: ' + err.message);
    }
}

async function moveCategoryUp(index) {
    return moveCategory(index, -1);
}

async function moveCategoryDown(index) {
    return moveCategory(index, 1);
}

async function moveSubcategoryUp(categoryId, subIndex) {
    return moveSubcategory(categoryId, subIndex, -1);
}

async function moveSubcategoryDown(categoryId, subIndex) {
    return moveSubcategory(categoryId, subIndex, 1);
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

async function updateSlide(slideId) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const photoFileInput = document.getElementById('slide-photo-file');
        const link = document.getElementById('slide-link')?.value?.trim() || '';
        const orderInput = document.getElementById('slide-order')?.value;
        const order = orderInput ? parseInt(orderInput) : slides.length;

        let photo = '';
        if (photoFileInput?.files?.length > 0) {
            const file = photoFileInput.files[0];
            const validation = validateFile(file);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', file);
            const uploadResponse = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData
            });
            if (!uploadResponse.ok) {
                throw new Error('Помилка завантаження фото');
            }
            const uploadData = await uploadResponse.json();
            photo = uploadData.url;
        }

        const slide = slides.find(s => s._id === slideId || s.id === slideId);
        if (!slide) {
            showNotification('Слайд не знайдено!');
            return;
        }

        const slideData = {
            photo: photo || slide.photo || slide.image,
            link,
            order
        };

        console.log('Надсилаємо оновлені дані слайду:', slideData);

        // Використовуємо slide.id замість slideId для API запиту
        const apiId = slide.id || slideId;
        const response = await fetchWithAuth(`/api/slides/${apiId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(slideData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка оновлення слайду: ${errorData.error || response.statusText}`);
        }

        const updatedSlide = await response.json();
        const index = slides.findIndex(s => s._id === slideId || s.id === slideId);
        if (index !== -1) {
            slides[index] = updatedSlide;
        }
        renderSlidesAdmin();
        closeSlideModal();
        showNotification('Слайд оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення слайду:', err);
        showNotification('Не вдалося оновити слайд: ' + err.message);
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

        const photoFileInput = document.getElementById('slide-photo-file');
        const link = document.getElementById('slide-link')?.value?.trim() || '';
        const orderInput = document.getElementById('slide-order')?.value;
        const order = orderInput ? parseInt(orderInput) : slides.length;

        let photo = '';
        if (photoFileInput?.files?.length > 0) {
            const file = photoFileInput.files[0];
            const validation = validateFile(file);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', file);
            const uploadResponse = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData
            });
            if (!uploadResponse.ok) {
                throw new Error('Помилка завантаження фото');
            }
            const uploadData = await uploadResponse.json();
            photo = uploadData.url;
        }

        if (!photo) {
            showNotification('Додайте фото для слайду!');
            return;
        }

        const slideData = {
            photo,
            link,
            order
        };

        console.log('Надсилаємо дані слайду:', slideData);

        const response = await fetchWithAuth('/api/slides', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(slideData)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка додавання слайду: ${errorData.error || response.statusText}`);
        }

        const newSlide = await response.json();
        slides.push(newSlide);
        renderSlidesAdmin();
        closeSlideModal();
        showNotification('Слайд додано!');
        
        // Оновлюємо список слайдів з сервера
        await loadSlides();
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка додавання слайду:', err);
        showNotification('Не вдалося додати слайд: ' + err.message);
    }
}

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
        cancelButton.addEventListener('click', closeSlideModal);
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
                    closeSlideModal();
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
                closeSlideModal();
                renderAdmin();
                showNotification('Слайд відредаговано!');
                unsavedChanges = false;
                resetInactivityTimer();
            }
        }
    }

    async function deleteSlide(index) {
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

            const slide = slides[index];
            if (!slide || !slide._id) {
                showNotification('Слайд не знайдено!');
                return;
            }

            console.log('Видаляємо слайд:', slide._id, 'з індексу:', index);

            const response = await fetchWithAuth(`/api/slides/${slide._id}`, {
                method: 'DELETE',
                headers: {
                    'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
                }
            });

            console.log('Відповідь сервера на видалення слайду:', response.status, response.statusText);

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`Помилка видалення слайду: ${errorData.error || response.statusText}`);
            }

            // Видаляємо слайд з локального масиву
            slides.splice(index, 1);
            
            // Оновлюємо відображення
            renderSlidesAdmin();
            showNotification('Слайд видалено!');
            
            // Оновлюємо список слайдів з сервера
            await loadSlides();
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
    // Створюємо копію товарів для експорту
    const productsForExport = products.map(product => {
        const productCopy = { ...product };
        
        // Додаємо originalId для всіх товарів
        productCopy.originalId = product._id;
        
        // Якщо це груповий товар, замінюємо ID на повну інформацію про товари
        if (productCopy.type === 'group' && productCopy.groupProducts && Array.isArray(productCopy.groupProducts)) {
            const fullGroupProducts = [];
            
            for (const groupProductId of productCopy.groupProducts) {
                // Знаходимо повну інформацію про товар в групі
                const groupProduct = products.find(p => p._id === groupProductId || p.id === groupProductId);
                if (groupProduct) {
                    // Створюємо копію товару без системних полів
                    const { _id, createdAt, updatedAt, __v, ...cleanedGroupProduct } = groupProduct;
                    
                    // Очищаємо вкладені об'єкти
                    if (cleanedGroupProduct.sizes && Array.isArray(cleanedGroupProduct.sizes)) {
                        cleanedGroupProduct.sizes = cleanedGroupProduct.sizes.map(size => {
                            const { _id, ...cleanedSize } = size;
                            return cleanedSize;
                        });
                    }
                    
                    if (cleanedGroupProduct.colors && Array.isArray(cleanedGroupProduct.colors)) {
                        cleanedGroupProduct.colors = cleanedGroupProduct.colors.map(color => {
                            const { _id, ...cleanedColor } = color;
                            return cleanedColor;
                        });
                    }
                    
                    // Додаємо оригінальний ID як посилання
                    cleanedGroupProduct.originalId = _id;
                    fullGroupProducts.push(cleanedGroupProduct);
                }
            }
            
            // Замінюємо масив ID на масив повних об'єктів товарів
            productCopy.groupProducts = fullGroupProducts;
        }
        
        return productCopy;
    });

    const blob = new Blob([JSON.stringify(productsForExport)], { type: 'application/json' });
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

async function importSiteBackup() {
    const file = document.getElementById('import-site-file')?.files[0];
    if (!file) {
        showNotification('Виберіть файл для імпорту!');
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

            const data = JSON.parse(e.target.result);
            if (!data.settings && !data.categories && !data.slides) {
                throw new Error('Файл не містить даних для імпорту (settings, categories або slides)');
            }

            const cleanedData = {
                settings: data.settings || {},
                categories: data.categories || [],
                slides: data.slides || []
            };

            if (cleanedData.settings) {
                const { _id, createdAt, updatedAt, __v, storeName, ...cleanedSettings } = cleanedData.settings;
                if (storeName) {
                    cleanedSettings.name = storeName;
                }
                if (cleanedSettings.socials && Array.isArray(cleanedSettings.socials)) {
                    cleanedSettings.socials = cleanedSettings.socials.map(social => {
                        const { _id, ...cleanedSocial } = social;
                        return cleanedSocial;
                    });
                }
                if (cleanedSettings.filters && Array.isArray(cleanedSettings.filters)) {
                    cleanedSettings.filters = cleanedSettings.filters.map(filter => {
                        const { _id, ...cleanedFilter } = filter;
                        return cleanedFilter;
                    });
                }
                if (cleanedSettings.orderFields && Array.isArray(cleanedSettings.orderFields)) {
                    cleanedSettings.orderFields = cleanedSettings.orderFields.map(field => {
                        const { _id, ...cleanedField } = field;
                        return cleanedField;
                    });
                }
                cleanedData.settings = cleanedSettings;
            }

            if (cleanedData.categories && Array.isArray(cleanedData.categories)) {
                cleanedData.categories = cleanedData.categories.map(category => {
                    const { _id, createdAt, updatedAt, __v, ...cleanedCategory } = category;
                    if (cleanedCategory.subcategories && Array.isArray(cleanedCategory.subcategories)) {
                        cleanedCategory.subcategories = cleanedCategory.subcategories.map(sub => {
                            const { _id, ...cleanedSub } = sub;
                            return cleanedSub;
                        });
                    }
                    return cleanedCategory;
                });
            }

            if (cleanedData.slides && Array.isArray(cleanedData.slides)) {
                cleanedData.slides = cleanedData.slides.map(slide => {
                    const { _id, createdAt, updatedAt, __v, ...cleanedSlide } = slide;
                    return cleanedSlide;
                });
            }

            const formData = new FormData();
            const blob = new Blob([JSON.stringify(cleanedData)], { type: 'application/json' });
            formData.append('file', blob, 'site-backup.json');

            const response = await fetchWithAuth('/api/import/site', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Помилка імпорту даних сайту: ${errorData}`);
            }

            await Promise.all([
                loadSettings(),
                loadCategories(),
                loadSlides()
            ]);

            renderAdmin();
            showNotification('Бекап сайту імпортовано!');
            unsavedChanges = false;
            resetInactivityTimer();
        } catch (err) {
            console.error('Помилка імпорту сайту:', err);
            showNotification('Помилка імпорту сайту: ' + err.message);
        }
    };
    reader.readAsText(file);
}

async function importProductsBackup() {
    const file = document.getElementById('import-products-file').files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const productsData = JSON.parse(e.target.result);
                const tokenRefreshed = await refreshToken();
                if (!tokenRefreshed) {
                    showNotification('Токен відсутній. Будь ласка, увійдіть знову.');
                    showSection('admin-login');
                    return;
                }

                // Просто очищаємо системні поля, сервер сам обробить зв'язки
                const cleanedProductsData = productsData.map(product => {
                    const { _id, createdAt, updatedAt, __v, tempNumber, id, ...cleanedProduct } = product;

                    if (cleanedProduct.sizes && Array.isArray(cleanedProduct.sizes)) {
                        cleanedProduct.sizes = cleanedProduct.sizes.map(size => {
                            const { _id, ...cleanedSize } = size;
                            return cleanedSize;
                        });
                    }

                    if (cleanedProduct.colors && Array.isArray(cleanedProduct.colors)) {
                        cleanedProduct.colors = cleanedProduct.colors.map(color => {
                            const { _id, ...cleanedColor } = color;
                            return cleanedColor;
                        });
                    }

                    return cleanedProduct;
                });

                // Створюємо FormData і додаємо файл
                const formData = new FormData();
                const blob = new Blob([JSON.stringify(cleanedProductsData)], { type: 'application/json' });
                formData.append('file', blob, 'products-backup.json');

                const response = await fetchWithAuth('/api/import/products', {
                    method: 'POST',
                    body: formData
                });
                
                if (!response.ok) {
                    const errorText = await response.text();
                    let errorMessage = 'Помилка імпорту товарів';
                    
                    try {
                        const errorData = JSON.parse(errorText);
                        if (errorData.error) {
                            errorMessage = errorData.error;
                            if (errorData.details) {
                                errorMessage += ': ' + JSON.stringify(errorData.details);
                            }
                        }
                    } catch (parseError) {
                        errorMessage = errorText;
                    }
                    
                    throw new Error(errorMessage);
                }

                const result = await response.json();
                await loadProducts(productsCurrentPage, productsPerPage);
                renderAdmin();
                showNotification('Бекап товарів імпортовано!');
                unsavedChanges = false;
                resetInactivityTimer();
            } catch (err) {
                console.error('Помилка імпорту товарів:', err);
                showNotification('Помилка імпорту товарів: ' + err.message);
            }
        };
        reader.readAsText(file);
    } else {
        showNotification('Виберіть файл для імпорту!');
    }
}

async function importOrdersBackup() {
    const file = document.getElementById('import-orders-file')?.files[0];
    if (!file) {
        showNotification('Виберіть файл для імпорту!');
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

            const ordersData = JSON.parse(e.target.result);
            if (!Array.isArray(ordersData)) {
                throw new Error('Файл не містить масиву замовлень');
            }

            const cleanedOrdersData = ordersData.map(order => {
                const { _id, createdAt, updatedAt, __v, orderNumber, ...cleanedOrder } = order;
                if (cleanedOrder.customer && typeof cleanedOrder.customer === 'object') {
                    const { _id: customerId, ...cleanedCustomer } = cleanedOrder.customer;
                    cleanedOrder.customer = cleanedCustomer;
                }
                if (cleanedOrder.items && Array.isArray(cleanedOrder.items)) {
                    cleanedOrder.items = cleanedOrder.items.map(item => {
                        const { _id, ...cleanedItem } = item;
                        if (cleanedItem.color && typeof cleanedItem.color === 'object') {
                            const { _id: colorId, ...cleanedColor } = cleanedItem.color;
                            cleanedItem.color = cleanedColor;
                        }
                        return cleanedItem;
                    });
                }
                return cleanedOrder;
            });

            const formData = new FormData();
            const blob = new Blob([JSON.stringify(cleanedOrdersData)], { type: 'application/json' });
            formData.append('file', blob, 'orders-backup.json');

            const response = await fetchWithAuth('/api/import/orders', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.text();
                throw new Error(`Помилка імпорту замовлень: ${errorData}`);
            }

            const statusFilter = document.getElementById('order-status-filter')?.value || '';
            await loadOrders(ordersCurrentPage, ordersPerPage, statusFilter);

            renderAdmin();
            showNotification('Бекап замовлень імпортовано!');
            unsavedChanges = false;
            resetInactivityTimer();
        } catch (err) {
            console.error('Помилка імпорту замовлень:', err);
            showNotification('Помилка імпорту замовлень: ' + err.message);
        }
    };
    reader.readAsText(file);
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

const debouncedUpdateSubcategories = debounce(updateSubcategories, 100);

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
                ${categories.map(c => `<option value="${c.slug}" ${c.slug === newProduct.category ? 'selected' : ''}>${c.name}</option>`).join('')}
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
            <input type="datetime-local" id="product-sale-end" placeholder="Дата закінчення акції (необов'язково)"><br/>
            <label for="product-sale-end">Дата закінчення акції (залиште порожнім для безкінечної акції)</label>
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

        const saveButton = document.getElementById('save-product-btn');
        if (saveButton) {
            saveButton.addEventListener('click', saveNewProduct);
        } else {
            console.warn('Кнопка #save-product-btn не знайдена');
        }

        // Додаємо обробник подій для акційної ціни в режимі додавання
        const salePriceInput = document.getElementById('product-sale-price');
        if (salePriceInput) {
            salePriceInput.addEventListener('input', function() {
                const salePrice = parseFloat(this.value);
                const price = parseFloat(document.getElementById('product-price')?.value || 0);
                
                if (!isNaN(salePrice) && salePrice > 0) {
                    // Якщо встановлюється акційна ціна, встановлюємо акцію на безкінечний період за замовчуванням
                    if (!newProduct.saleEnd) {
                        newProduct.saleEnd = null; // null означає безкінечну акцію
                        console.log('Встановлено безкінечну акцію для нового товару');
                    }
                } else if (isNaN(salePrice) || salePrice <= 0) {
                    // Якщо акційна ціна видаляється, видаляємо і дату закінчення
                    newProduct.saleEnd = null;
                    console.log('Видалено акцію для нового товару');
                }
            });
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
    const typeSelect = document.getElementById('product-type');
    if (typeSelect) {
        newProduct.type = typeSelect.value;
    } else {
        console.warn('Елемент #product-type не знайдено, використовуємо поточний тип:', newProduct.type);
    }
    document.querySelectorAll('.type-specific').forEach(el => el.classList.remove('active'));
    if (newProduct.type === 'mattresses') {
        document.getElementById('mattress-sizes')?.classList.add('active');
    } else if (newProduct.type === 'group') {
        document.getElementById('group-products')?.classList.add('active');
    }
    renderPriceFields();
    resetInactivityTimer();
}

function renderPriceFields() {
    const priceFields = document.getElementById('price-fields');
    if (!priceFields) return;

    if (newProduct.type === 'simple') {
        priceFields.innerHTML = `
            <input type="number" id="product-price" value="${newProduct.price || ''}" placeholder="Ціна (грн)" min="0"><br/>
            <label for="product-price">Ціна (грн)</label>
            <input type="number" id="product-sale-price" value="${newProduct.salePrice || ''}" placeholder="Акційна ціна (грн)" min="0"><br/>
            <label for="product-sale-price">Акційна ціна (грн)</label>
        `;
        
        // Додаємо обробник подій для акційної ціни
        const salePriceInput = document.getElementById('product-sale-price');
        if (salePriceInput) {
            salePriceInput.addEventListener('input', function() {
                const salePrice = parseFloat(this.value);
                const price = parseFloat(document.getElementById('product-price')?.value || 0);
                
                if (!isNaN(salePrice) && salePrice > 0) {
                    // Якщо встановлюється акційна ціна, встановлюємо акцію на безкінечний період за замовчуванням
                    if (!newProduct.saleEnd) {
                        newProduct.saleEnd = null; // null означає безкінечну акцію
                        console.log('Встановлено безкінечну акцію для товару');
                    }
                } else if (isNaN(salePrice) || salePrice <= 0) {
                    // Якщо акційна ціна видаляється, видаляємо і дату закінчення
                    newProduct.saleEnd = null;
                    console.log('Видалено акцію для товару');
                }
            });
        }
    } else {
        priceFields.innerHTML = '';
    }
}

async function updateSubcategories() {
    const modal = document.getElementById('modal');
    if (!modal || !modal.classList.contains('active')) {
        console.log('Модальне вікно не активне, пропускаємо оновлення підкатегорій');
        return Promise.resolve();
    }

    const categorySelect = document.getElementById('product-category');
    const subcategorySelect = document.getElementById('product-subcategory');
    
    if (!categorySelect || !subcategorySelect) {
        console.log('Це не модальне вікно для редагування продукту, пропускаємо оновлення підкатегорій');
        return Promise.resolve();
    }

    const categorySlug = categorySelect.value;
    console.log('Оновлення підкатегорій для categorySlug:', categorySlug);
    subcategorySelect.innerHTML = '<option value="">Без підкатегорії</option>';

    if (!categorySlug) {
        console.log('Категорія не вибрана');
        const addSubcategoryBtn = document.getElementById('add-subcategory-btn');
        if (addSubcategoryBtn) {
            addSubcategoryBtn.style.display = 'none';
        }
        return Promise.resolve();
    }

    const category = categories.find(c => c.slug === categorySlug);
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
    } else {
        console.warn('Категорія не знайдена або subcategories не є масивом:', category);
    }

    // Відновлюємо вибір підкатегорії
    if (newProduct.subcategory) {
        const category = categories.find(c => c.slug === categorySlug);
        if (category && category.subcategories.some(sub => sub.slug === newProduct.subcategory)) {
            subcategorySelect.value = newProduct.subcategory;
            console.log('Встановлено subcategory:', newProduct.subcategory);
        } else {
            subcategorySelect.value = '';
            console.warn('Підкатегорія не знайдена в опціях:', newProduct.subcategory);
        }
    }

    const addSubcategoryBtn = document.getElementById('add-subcategory-btn');
    if (addSubcategoryBtn) {
        addSubcategoryBtn.style.display = 'block';
        addSubcategoryBtn.onclick = () => {
            const newSubcategory = prompt('Введіть назву нової підкатегорії:');
            if (newSubcategory && categorySlug) {
                const category = categories.find(c => c.slug === categorySlug);
                if (category) {
                    const newSub = {
                        name: newSubcategory,
                        slug: newSubcategory.toLowerCase().replace(/\s+/g, '-'),
                        order: category.subcategories.length,
                        visible: true,
                        photo: ''
                    };
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
    return Promise.resolve();
}

async function saveSubcategory(categoryId, subcategory) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            throw new Error('Токен відсутній або недійсний');
        }

        const category = categories.find(c => c._id === categoryId);
        if (!category) {
            throw new Error('Категорія не знайдена');
        }

        if (category.subcategories.some(s => s.slug === subcategory.slug)) {
            throw new Error('Шлях підкатегорії має бути унікальним');
        }

        const response = await fetchWithAuth(`/api/categories/${categoryId}/subcategories`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
            },
            body: JSON.stringify(subcategory)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Не вдалося додати підкатегорію: ${errorData.error || response.statusText}`);
        }

        const updatedCategory = await response.json();
        const index = categories.findIndex(c => c._id === categoryId);
        categories[index] = updatedCategory;
        return updatedCategory;
    } catch (err) {
        console.error('Помилка збереження підкатегорії:', err);
        throw err;
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
            color.photo = file;
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
    const salePriceRaw = document.getElementById('mattress-size-sale-price')?.value;
    const salePrice = salePriceRaw !== '' ? parseFloat(salePriceRaw) : undefined;

    if (name && !isNaN(price) && price >= 0) {
        const sizeObj = { name, price };
        if (!isNaN(salePrice) && salePrice > 0 && salePrice < price) {
            sizeObj.salePrice = salePrice;
        }
        newProduct.sizes.push(sizeObj);
        document.getElementById('mattress-size-name').value = '';
        document.getElementById('mattress-size-price').value = '';
        if (document.getElementById('mattress-size-sale-price')) document.getElementById('mattress-size-sale-price').value = '';
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
            ${size.name}: ${size.price} грн${size.salePrice && size.salePrice < size.price ? ` <span class='sale-price'>(акція: ${size.salePrice} грн)</span>` : ''}
            <button class="edit-btn" onclick="editMattressSize(${index})">Редагувати</button>
            <button class="delete-btn" onclick="deleteMattressSize(${index})">Видалити</button>
        </div>
    `).join('');
}

function editMattressSize(index) {
    const size = newProduct.sizes[index];
    const sizeList = document.getElementById('mattress-size-list');
    sizeList.children[index].innerHTML = `
        <input type="text" id="edit-mattress-size-name-${index}" value="${size.name}" placeholder="Розмір">
        <input type="number" id="edit-mattress-size-price-${index}" value="${size.price}" placeholder="Ціна (грн)" min="0">
        <input type="number" id="edit-mattress-size-sale-price-${index}" value="${size.salePrice !== undefined ? size.salePrice : ''}" placeholder="Акційна ціна (грн)" min="0">
        <button class="save-btn" onclick="saveMattressSize(${index})">Зберегти</button>
        <button class="cancel-btn" onclick="renderMattressSizes()">Скасувати</button>
    `;
    resetInactivityTimer();
}

function saveMattressSize(index) {
    const newName = document.getElementById(`edit-mattress-size-name-${index}`).value;
    const newPrice = parseFloat(document.getElementById(`edit-mattress-size-price-${index}`).value);
    const newSalePriceRaw = document.getElementById(`edit-mattress-size-sale-price-${index}`)?.value;
    const newSalePrice = newSalePriceRaw !== '' ? parseFloat(newSalePriceRaw) : undefined;

    if (newName && !isNaN(newPrice) && newPrice >= 0) {
        newProduct.sizes[index] = { name: newName, price: newPrice };
        if (!isNaN(newSalePrice) && newSalePrice > 0 && newSalePrice < newPrice) {
            newProduct.sizes[index].salePrice = newSalePrice;
        } else {
            delete newProduct.sizes[index].salePrice;
        }
        renderMattressSizes();
        resetInactivityTimer();
    } else {
        alert('Введіть коректний розмір та ціну!');
    }
}

function deleteMattressSize(index) {
    newProduct.sizes.splice(index, 1);
    renderMattressSizes();
    resetInactivityTimer();
}

async function searchGroupProducts(query = '') {
    const searchInput = document.getElementById('group-product-search');
    const actualQuery = query || (searchInput ? searchInput.value.trim() : '');
    
    const results = document.getElementById('group-product-results');
    const pagination = document.getElementById('group-product-pagination');
    
    if (!results) {
        console.error('Елемент group-product-results не знайдено');
        return;
    }

    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        // Формуємо параметри запиту
        const params = new URLSearchParams({
            page: groupProductPage.toString(),
            limit: groupProductLimit.toString(),
            type: 'simple' // Шукаємо тільки прості товари
        });

        if (actualQuery) {
            params.append('search', actualQuery);
        }

        const response = await fetchWithAuth(`/api/products?${params.toString()}`);
        
        if (!response.ok) {
            throw new Error(`Помилка запиту: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (!data.products || !Array.isArray(data.products)) {
            throw new Error('Некоректна відповідь сервера');
        }

        const groupProducts = data.products;
        const groupProductTotal = data.total || 0;

        results.innerHTML = groupProducts.map(p => `
            <div class="group-product-result-item" style="padding: 8px; border: 1px solid #ddd; margin: 2px 0; cursor: pointer;" onclick="addGroupProduct('${p._id}')">
                <strong>${p.name}</strong>
                ${p.brand ? `<br><small>Бренд: ${p.brand}</small>` : ''}
                <br><small>Ціна: ${p.price || 0} грн</small>
            </div>
        `).join('');

        // Рендеринг пагінації
        if (pagination) {
            const totalPages = Math.ceil(groupProductTotal / groupProductLimit);
            pagination.innerHTML = `
                <div style="margin-top: 10px; text-align: center;">
                    ${groupProductPage > 1 ? `<button onclick="changeGroupProductPage(${groupProductPage - 1}, '${actualQuery}')">Попередня</button>` : ''}
                    <span>Сторінка ${groupProductPage} з ${totalPages}</span>
                    ${groupProductPage < totalPages ? `<button onclick="changeGroupProductPage(${groupProductPage + 1}, '${actualQuery}')">Наступна</button>` : ''}
                </div>
            `;
        }

        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка пошуку групових товарів:', err);
        showNotification('Не вдалося завантажити товари: ' + err.message);
        if (results) {
            results.innerHTML = '<p>Помилка завантаження товарів</p>';
        }
    }
}

function changeGroupProductPage(page, query) {
    groupProductPage = page;
    searchGroupProducts(query);
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

function renderGroupProductModal() {
    const modalContent = `
        <div class="modal-content">
            <h2>Додати товари до групового товару</h2>
            <input type="text" id="group-product-search" placeholder="Пошук товарів..." oninput="searchGroupProducts(this.value)">
            <div id="group-product-results" style="max-height: 300px; overflow-y: auto;"></div>
            <div id="group-product-pagination"></div>
            <div class="modal-actions">
                <button onclick="closeModal()">Закрити</button>
            </div>
        </div>
    `;
    showModal(modalContent);
    searchGroupProducts(); // Завантажуємо першу сторінку за замовчуванням
}

function renderGroupProducts() {
    const groupList = document.getElementById('group-product-list');
    if (groupList) {
        groupList.innerHTML = newProduct.groupProducts.map((pid, index) => {
            const p = products.find(pr => pr._id === pid);
            return p ? `
                <div class="group-product draggable" draggable="true" ondragstart="dragGroupProduct(event, ${index})" ondragover="allowDropGroupProduct(event)" ondrop="dropGroupProduct(event, ${index})">
                    ${p.name}
                    <button class="delete-btn" onclick="deleteGroupProduct('${pid}')">Видалити</button>
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
    if (saveButton) saveButton.disabled = true;

    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        delete newProduct.id;
        delete newProduct._id;

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
        let saleEnd = null;
        if (newProduct.type === 'simple' && priceInput) {
            price = parseFloat(priceInput.value) || null;
            salePrice = salePriceInput ? parseFloat(salePriceInput.value) || null : null;
            if (salePrice && salePrice > 0) {
                saleEnd = saleEndInput && saleEndInput.value ? saleEndInput.value : null;
            }
        }
        const visible = visibleSelect.value === 'true';
        let description = descriptionInput.value || '';
        description = description === '<p><br></p>' ? '' : description;
        const widthCm = widthCmInput ? parseFloat(widthCmInput.value) || null : null;
        const depthCm = depthCmInput ? parseFloat(depthCmInput.value) || null : null;
        const heightCm = heightCmInput ? parseFloat(heightCmInput.value) || null : null;
        const lengthCm = lengthCmInput ? parseFloat(lengthCmInput.value) || null : null;

        if (!name || !slug || !category) {
            showNotification('Введіть назву, шлях товару та категорію!');
            return;
        }

        if (newProduct.photos.length === 0) {
            showNotification('Додайте хоча б одну фотографію товару!');
            return;
        }

        const slugCheck = await fetchWithAuth(`/api/products?slug=${encodeURIComponent(slug)}`);
        const existingProducts = await slugCheck.json();
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

        const categoryObj = categories.find(c => c.slug === category);
        if (!categoryObj) {
            showNotification('Обрана категорія не існує!');
            return;
        }

        let subcategorySlug = '';
        if (subcategory) {
            const subcategoryObj = categoryObj.subcategories.find(sub => sub.slug === subcategory);
            if (!subcategoryObj) {
                showNotification('Обрана підкатегорія не існує в цій категорії!');
                return;
            }
            subcategorySlug = subcategoryObj.slug;
        }

        let product = {
            type: newProduct.type,
            name,
            slug,
            brand: brand || '',
            category,
            subcategory: subcategorySlug,
            material: material || '',
            price: newProduct.type === 'simple' ? price : null,
            salePrice,
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
                photo: null
            })),
sizes: newProduct.type === 'mattresses'
    ? newProduct.sizes.map(size => {
        const obj = {
            name: size.name,
            price: size.price
        };
if (
    typeof size.salePrice === 'number' &&
    !isNaN(size.salePrice) &&
    size.salePrice < size.price
) {
    obj.salePrice = size.salePrice;
}
        return obj;
    })
    : newProduct.sizes,
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

        delete product.id;
        delete product._id;

        if ('id' in product) {
            console.warn('Поле id все ще присутнє перед відправкою:', product.id);
        }

        console.log('Надсилаємо продукт на сервер:', JSON.stringify(product, null, 2));

        const response = await fetchWithAuth('/api/products', {
            method: 'POST',
            body: JSON.stringify(product)
        });

        const newProductData = await response.json();
        console.log('Отримано відповідь від сервера:', JSON.stringify(newProductData, null, 2));
        if (!newProductData._id) {
            console.error('Сервер не повернув _id для нового товару:', newProductData);
            showNotification('Помилка: сервер не повернув ідентифікатор товару!');
            return;
        }

        if (products.some(p => p._id === newProductData._id)) {
            console.warn('Товар з _id', newProductData._id, 'уже існує в локальному масиві');
        } else {
            products.push(newProductData);
        }

        closeModal();
        renderAdmin('products');
        showNotification('Товар додано!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка при додаванні товару:', err);
        if (err.errorData) {
            console.error('Деталі помилки від сервера:', err.errorData);
            showNotification(`Не вдалося додати товар: ${err.errorData.error || err.message}`);
        } else {
            showNotification('Не вдалося додати товар: ' + err.message);
        }
    } finally {
        if (saveButton) saveButton.disabled = false;
    }
}

async function openEditProductModal(productId) {
    const product = products.find(p => p._id === productId);
    if (!product) {
        showNotification('Товар не знайдено!');
        return;
    }

    newProduct = {
        ...product,
        colors: [...product.colors],
        photos: [...product.photos],
        sizes: product.sizes ? product.sizes.filter(size => size.name && typeof size.price === 'number' && size.price >= 0) : [],
        groupProducts: [...product.groupProducts]
    };

    // Екранування HTML-символів для назви товару
    const escapedName = product.name
        .replace(/&/g, '&amp;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

    const modal = document.getElementById('modal');
    if (!modal) {
        console.error('Елемент #modal не знайдено');
        showNotification('Не вдалося відкрити модальне вікно');
        return;
    }

    modal.innerHTML = `
        <div class="modal-content">
            <h3>Редагувати товар</h3>
            <select id="product-type">
                <option value="simple" ${product.type === 'simple' ? 'selected' : ''}>Простий товар</option>
                <option value="mattresses" ${product.type === 'mattresses' ? 'selected' : ''}>Матраци</option>
                <option value="group" ${product.type === 'group' ? 'selected' : ''}>Груповий товар</option>
            </select><br/>
            <label for="product-type">Тип товару</label>
            <input type="text" id="product-name" value="${escapedName}" placeholder="Назва товару"><br/>
            <label for="product-name">Назва товару</label>
            <input type="text" id="product-slug" value="${product.slug || ''}" placeholder="Шлях товару"><br/>
            <label for="product-slug">Шлях товару</label>
            <input type="text" id="product-brand" value="${product.brand || ''}" placeholder="Виробник"><br/>
            <label for="product-brand">Виробник</label>
            <select id="product-category">
                <option value="">Без категорії</option>
                ${categories.map(c => `<option value="${c.slug}" ${c.slug === product.category ? 'selected' : ''}>${c.name}</option>`).join('')}
            </select><br/>
            <label for="product-category">Категорія</label>
            <select id="product-subcategory">
                <option value="">Без підкатегорії</option>
            </select><br/>
            <label for="product-subcategory">Підкатегорія</label>
            <button id="add-subcategory-btn">Додати підкатегорію</button><br/>
            <input type="text" id="product-material" value="${product.material || ''}" placeholder="Матеріал"><br/>
            <label for="product-material">Матеріал</label>
            <div id="price-fields"></div>
            <input type="datetime-local" id="product-sale-end" value="${product.saleEnd || ''}" placeholder="Дата закінчення акції (необов'язково)"><br/>
            <label for="product-sale-end">Дата закінчення акції (залиште порожнім для безкінечної акції)</label>
            <select id="product-visible">
                <option value="true" ${product.visible ? 'selected' : ''}>Показувати на сайті</option>
                <option value="false" ${!product.visible ? 'selected' : ''}>Не показувати</option>
            </select><br/>
            <label for="product-visible">Видимість</label>
            <div id="product-description-editor"></div>
            <input type="hidden" id="product-description" value="${product.description || ''}">
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
    initializeProductEditor(product.description || '', product.descriptionDelta || null);

    // Завантажуємо категорії перед оновленням підкатегорій
    await loadCategories();

    const categorySelect = document.getElementById('product-category');
    const subcatSelect = document.getElementById('product-subcategory');
    if (categorySelect && subcatSelect) {
        // Оновлюємо список категорій
        categorySelect.innerHTML = '<option value="">Без категорії</option>' + 
            categories.map(c => `<option value="${c.slug}" ${c.slug === product.category ? 'selected' : ''}>${c.name}</option>`).join('');
        categorySelect.addEventListener('change', updateSubcategories);

        // Оновлюємо підкатегорії
        await updateSubcategories();

        // Встановлюємо підкатегорію
        if (product.subcategory) {
            const category = categories.find(c => c.slug === product.category);
            if (category && category.subcategories.some(sub => sub.slug === product.subcategory)) {
                subcatSelect.value = product.subcategory;
                console.log('Встановлено subcategory:', product.subcategory);
            } else {
                subcatSelect.value = '';
                console.warn('Підкатегорія не знайдена в опціях:', product.subcategory);
            }
        }
    } else {
        console.warn('Елемент #product-category або #product-subcategory не знайдено');
    }

    renderColorsList();
    renderPhotoList();
    renderMattressSizes();
    renderGroupProducts();

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

    const saveButton = document.getElementById('save-product-btn');
    if (saveButton) {
        saveButton.addEventListener('click', () => saveEditedProduct(productId));
    } else {
        console.warn('Кнопка #save-product-btn не знайдена');
    }

    // Додаємо обробник подій для акційної ціни в режимі редагування
    const salePriceInput = document.getElementById('product-sale-price');
    if (salePriceInput) {
        salePriceInput.addEventListener('input', function() {
            const salePrice = parseFloat(this.value);
            const price = parseFloat(document.getElementById('product-price')?.value || 0);
            
            if (!isNaN(salePrice) && salePrice > 0) {
                // Якщо встановлюється акційна ціна, встановлюємо акцію на безкінечний період за замовчуванням
                if (!newProduct.saleEnd) {
                    newProduct.saleEnd = null; // null означає безкінечну акцію
                    console.log('Встановлено безкінечну акцію для товару при редагуванні');
                }
            } else if (isNaN(salePrice) || salePrice <= 0) {
                // Якщо акційна ціна видаляється, видаляємо і дату закінчення
                newProduct.saleEnd = null;
                console.log('Видалено акцію для товару при редагуванні');
            }
        });
    }

    const cancelButton = document.getElementById('cancel-product-btn');
    if (cancelButton) {
        cancelButton.addEventListener('click', closeModal);
    } else {
        console.warn('Кнопка #cancel-product-btn не знайдена');
    }

    // Додаємо обробник для кнопки "Додати колір" у режимі редагування
    const addColorBtn = document.querySelector('button[onclick="addProductColor()"]');
    if (addColorBtn) {
        addColorBtn.onclick = addProductColor;
    }

    resetInactivityTimer();
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
        if (!productObj || !productId) {
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
        let saleEnd = null;
        if (newProduct.type === 'simple') {
            price = parseFloat(document.getElementById('product-price')?.value) || null;
            salePrice = parseFloat(document.getElementById('product-sale-price')?.value) || null;
            if (salePrice && salePrice > 0) {
                saleEnd = document.getElementById('product-sale-end')?.value || null;
            }
        }
        const visible = document.getElementById('product-visible')?.value === 'true';
        const description = document.getElementById('product-description')?.value || '';
        const widthCm = parseFloat(document.getElementById('product-width-cm')?.value) || null;
        const depthCm = parseFloat(document.getElementById('product-depth-cm')?.value) || null;
        const heightCm = parseFloat(document.getElementById('product-height-cm')?.value) || null;
        const lengthCm = parseFloat(document.getElementById('product-length-cm')?.value) || null;

        if (!name || !slug) {
            showNotification('Введіть назву та шлях товару!');
            return;
        }

        if (!category) {
            showNotification('Виберіть категорію!');
            return;
        }

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

        const categoryObj = categories.find(c => c.slug === category);
        if (!categoryObj) {
            showNotification('Обрана категорія не існує!');
            return;
        }

        // Валідація підкатегорії
        let subcategorySlug = '';
        if (subcategory) {
            const subcategoryObj = categoryObj.subcategories.find(sub => sub.slug === subcategory);
            if (!subcategoryObj) {
                showNotification('Обрана підкатегорія не існує в цій категорії!');
                return;
            }
            subcategorySlug = subcategory;
        }
        console.log('Підкатегорія для збереження:', subcategorySlug);

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

        // Валідація groupProducts
        let validatedGroupProducts = newProduct.groupProducts;
        if (newProduct.type === 'group' && newProduct.groupProducts.length > 0) {
            const response = await fetchWithAuth(`/api/products?ids=${encodeURIComponent(newProduct.groupProducts.join(','))}`);
            const existingProducts = await response.json();
            if (!existingProducts.products || !Array.isArray(existingProducts.products)) {
                showNotification('Помилка перевірки групових товарів.');
                return;
            }
            const existingIds = existingProducts.products.map(p => p._id);
            const missingIds = newProduct.groupProducts.filter(id => !existingIds.includes(id));
            if (missingIds.length > 0) {
                validatedGroupProducts = newProduct.groupProducts.filter(id => existingIds.includes(id));
                showNotification(`Видалено ${missingIds.length} некоректних товарів із групи. Залишилось ${validatedGroupProducts.length} товарів.`);
                newProduct.groupProducts = validatedGroupProducts;
                renderGroupProducts();
                if (validatedGroupProducts.length === 0) {
                    showNotification('Усі товари в групі не знайдені. Будь ласка, додайте коректні товари.');
                    return;
                }
            }
        } else if (newProduct.type !== 'group') {
            validatedGroupProducts = [];
        }

        let validatedSizes = newProduct.sizes;
        if (newProduct.type === 'mattresses') {
            validatedSizes = newProduct.sizes.filter(size => {
                const isValid = size.name && typeof size.price === 'number' && size.price >= 0;
                return isValid;
            });
            if (validatedSizes.length === 0) {
                showNotification('Усі розміри для матрацу некоректні! Додайте коректний розмір.');
                return;
            }
        }

        const validatedColors = newProduct.colors.filter(color => {
            const isValid = color.name && color.value;
            return isValid;
        });

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
            subcategory: subcategorySlug,
            salePrice: salePrice || null,
            saleEnd: saleEnd || null,
            material: material || '',
            description,
            widthCm,
            depthCm,
            heightCm,
            lengthCm,
            photos: [],
            colors: validatedColors.map(color => ({
                name: color.name,
                value: color.value,
                priceChange: color.priceChange || 0,
                photo: color.photo || null
            })),
sizes: newProduct.type === 'mattresses'
    ? validatedSizes.map(size => {
        const obj = {
            name: size.name,
            price: size.price
        };
if (
    typeof size.salePrice === 'number' &&
    !isNaN(size.salePrice) &&
    size.salePrice < size.price
) {
    obj.salePrice = size.salePrice;
}
        return obj;
    })
    : validatedSizes,
            groupProducts: validatedGroupProducts,
            active: newProduct.active,
            visible
        };

        if (newProduct.type === 'simple') {
            product.price = price;
        }

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
                    const uploadData = await response.json();
                    if (uploadData.url) {
                        mediaUrls.push({ oldUrl: src, newUrl: uploadData.url });
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

        for (let i = 0; i < validatedColors.length; i++) {
            const color = validatedColors[i];
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

        console.log('Надсилаємо продукт на сервер:', JSON.stringify(product, null, 2));

        const response = await fetchWithAuth(`/api/products/${productId}`, {
            method: 'PUT',
            body: JSON.stringify(product)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Помилка сервера для PUT /api/products:', errorData);
            showNotification(`Помилка оновлення товару: ${errorData.error || errorData.message || response.statusText}`);
            return;
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
        showNotification(`Не вдалося оновити товар: ${err.message}`);
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
        let globalIndex = (productsCurrentPage - 1) * productsPerPage + 1;
        products.forEach((p, index) => {
            p.tempNumber = globalIndex + index;
        });

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
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        if (!productId || typeof productId !== 'string') {
            console.error('Невірний або відсутній productId:', productId);
            showNotification('Помилка: невірний ID товару');
            return;
        }

        const response = await fetchWithAuth('/api/products');
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка при отриманні продуктів: ${errorData.error || response.statusText}`);
        }
        const fetchedProducts = await response.json();
        products = fetchedProducts.products || [];

        const product = products.find(p => p._id === productId);
        if (!product) {
            console.error(`Продукт із ID ${productId} не знайдено`);
            showNotification('Товар не знайдено!');
            return;
        }

        const newActiveStatus = currentActive !== undefined ? !currentActive : !product.active;

        const updateResponse = await fetchWithAuth(`/api/products/${productId}/toggle-active`, {
            method: 'PATCH',
            body: JSON.stringify({ active: newActiveStatus })
        });

        if (!updateResponse.ok) {
            const errorData = await updateResponse.json();
            throw new Error(`Помилка при оновленні статусу: ${errorData.error || updateResponse.statusText}`);
        }

        const updatedProduct = await updateResponse.json();
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

async function sortAdminProducts(sortType) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const response = await fetchWithAuth(`/api/products?page=${productsCurrentPage}&limit=${productsPerPage}&sort=${sortType}`);
        if (!response.ok) {
            throw new Error(`Помилка запиту: ${response.status} - ${await response.text()}`);
        }

        const data = await response.json();
        if (!data.products || !Array.isArray(data.products) || !data.total) {
            throw new Error('Некоректна структура відповіді від сервера');
        }

        products = data.products;
        totalProducts = data.total;

        const globalIndex = (productsCurrentPage - 1) * productsPerPage + 1;
        products.forEach((p, index) => {
            p.tempNumber = globalIndex + index;
        });

        renderAdmin('products', { products: products, total: totalProducts, page: productsCurrentPage });
    } catch (e) {
        console.error('Помилка сортування товарів:', e);
        showNotification('Помилка сортування товарів: ' + e.message);
    }
    resetInactivityTimer();
}

async function searchProducts(page = 1) {
    const query = document.getElementById('product-search')?.value?.trim().toLowerCase();
    if (!query) {
        clearSearch();
        return;
    }

    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        if (page === 1) {
            lastPageBeforeSearch = productsCurrentPage;
        }

        productsCurrentPage = page;
        const response = await fetchWithAuth(`/api/products?search=${encodeURIComponent(query)}&page=${page}&limit=${productsPerPage}`);
        if (!response.ok) {
            throw new Error(`Помилка запиту: ${response.status} - ${await response.text()}`);
        }

        const data = await response.json();
        if (!data.products || !Array.isArray(data.products) || !data.total) {
            throw new Error('Некоректна структура відповіді від сервера');
        }

        products = data.products;
        totalProducts = data.total;
        const globalIndex = (productsCurrentPage - 1) * productsPerPage + 1;
        products.forEach((p, index) => {
            p.tempNumber = globalIndex + index;
        });

        renderAdmin('products', { products: products, total: totalProducts, page: productsCurrentPage });
    } catch (e) {
        console.error('Помилка пошуку товарів:', e);
        showNotification('Помилка пошуку товарів: ' + e.message);
        products = [];
        renderAdmin('products');
    }
    resetInactivityTimer();
}

function clearSearch() {
    const searchInput = document.getElementById('product-search');
    if (searchInput) {
        searchInput.value = '';
        productsCurrentPage = lastPageBeforeSearch;
        loadProducts(productsCurrentPage, productsPerPage);
    }
    resetInactivityTimer();
}

async function sortOrders(sortType) {
    if (isLoadingOrders) {
        console.log('Завантаження замовлень уже триває, пропускаємо сортування');
        return;
    }

    const [key, direction] = sortType.split('-');
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const statusFilter = document.getElementById('order-status-filter')?.value || '';
        const queryParams = new URLSearchParams({ limit: 9999 });
        if (statusFilter && statusFilter !== 'Усі статуси') {
            queryParams.append('status', statusFilter);
        }
        const response = await fetchWithAuth(`/api/orders?${queryParams.toString()}`);
        if (!response.ok) {
            throw new Error('Не вдалося завантажити замовлення для сортування');
        }

        const data = await response.json();
        let ordersData = data.orders || data;
        if (!Array.isArray(ordersData)) {
            throw new Error('Очікувався масив замовлень');
        }

        const unifiedStatuses = ['Нове замовлення', 'В обробці', 'Відправлено', 'Доставлено', 'Скасовано'];
        let filteredOrders = statusFilter
            ? ordersData.filter(order => unifiedStatuses.includes(order.status) && (statusFilter === 'Усі статуси' || order.status === statusFilter))
            : ordersData.filter(order => unifiedStatuses.includes(order.status));

        orderNumberCache.clear();
        filteredOrders.sort((a, b) => {
            let valA = key === 'date' ? new Date(a[key] || 0) : (a[key] || (typeof a[key] === 'number' ? 0 : ''));
            let valB = key === 'date' ? new Date(b[key] || 0) : (b[key] || (typeof b[key] === 'number' ? 0 : ''));
            if (key === 'date') {
                valA = valA.getTime();
                valB = valB.getTime();
            }
            if (direction === 'asc') {
                return typeof valA === 'string' ? valA.localeCompare(valB) : valA - valB;
            } else {
                return typeof valA === 'string' ? valB.localeCompare(valA) : valB - valA;
            }
        });

        filteredOrders.forEach((order, idx) => {
            orderNumberCache.set(order._id, idx + 1);
        });

        totalOrders = filteredOrders.length;

        const start = (ordersCurrentPage - 1) * ordersPerPage;
        const end = start + ordersPerPage;
        const globalIndex = start + 1;
        orders = filteredOrders.slice(start, end).map((order, index) => {
            const cachedNumber = orderNumberCache.get(order._id);
            return { ...order, orderNumber: cachedNumber };
        });

        renderAdmin('orders', { total: totalOrders });
        resetInactivityTimer();
    } catch (e) {
        console.error('Помилка сортування замовлень:', e);
        showNotification('Помилка сортування замовлень: ' + e.message);
    }
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
            
            if (lines.length === 0) {
                showNotification('Файл порожній або не містить даних!');
                return;
            }
            
            console.log(`Знайдено ${lines.length} рядків у файлі`);
            let updated = 0;
            let counter = 1;
            
            // Створюємо мапу порядкових номерів до товарів
            const productMap = new Map();
            const activeProducts = products.filter(p => p.active && p.type !== 'group');
            
            if (activeProducts.length === 0) {
                showNotification('Немає активних товарів для імпорту!');
                return;
            }
            
            activeProducts.forEach(p => {
                if (p.type === 'simple') {
                    productMap.set(counter, p);
                    counter++;
                } else if (p.type === 'mattresses') {
                    productMap.set(counter, p);
                    counter++;
                }
            });

            console.log(`Початок обробки ${lines.length} рядків з файлу`);
            console.log(`Створено мапу з ${productMap.size} товарів для імпорту`);
            console.log('Мапа товарів:', Array.from(productMap.entries()).map(([num, p]) => `${num}: ${p.name}`));
            console.log('Починаємо групування оновлень за товарами...');
            console.log('Формат файлу: порядковий_номер,назва,бренд,ціна[,акційна_ціна]');
            console.log('Для матраців: порядковий_номер,назва,бренд,розмір,ціна[,акційна_ціна]');
            
            // Групуємо рядки за товарами для правильного оновлення матраців
            const productUpdates = new Map();
            
            for (const line of lines) {
                const parts = line.split(',');
                if (parts.length < 4) {
                    console.warn(`Пропускаємо рядок з недостатньою кількістю частин: ${line}`);
                    continue;
                }
                
                console.log(`Обробка рядка: ${line} (${parts.length} частин)`);
                
                const orderNumber = parseInt(parts[0].trim());
                const product = productMap.get(orderNumber);
                
                console.log(`Обробка рядка: ${line}`);
                console.log(`Порядковий номер: ${orderNumber}, знайдений товар:`, product ? product.name : 'не знайдено');
                
                if (!product) {
                    console.error(`Товар з порядковим номером ${orderNumber} не знайдено`);
                    continue;
                }

                if (!product._id) {
                    console.error(`Товар з порядковим номером ${orderNumber} не має _id`);
                    continue;
                }

                // Ініціалізуємо оновлення для товару, якщо ще не існує
                if (!productUpdates.has(product._id)) {
                const { _id, createdAt, updatedAt, __v, id: productId, tempNumber, ...cleanedProduct } = product;

                if (cleanedProduct.sizes && Array.isArray(cleanedProduct.sizes)) {
                    cleanedProduct.sizes = cleanedProduct.sizes.map(size => {
                        const { _id, ...cleanedSize } = size;
                        return cleanedSize;
                    });
                }

                if (cleanedProduct.colors && Array.isArray(cleanedProduct.colors)) {
                    cleanedProduct.colors = cleanedProduct.colors.map(color => {
                        const { _id, ...cleanedColor } = color;
                        return cleanedColor;
                    });
                }
                    
                    productUpdates.set(product._id, {
                        product: product,
                        data: cleanedProduct,
                        updates: []
                    });
                }
                
                const update = productUpdates.get(product._id);

                if (product.type === 'simple') {
                    const price = parseFloat(parts[3].trim());
                    const salePrice = parts.length > 4 ? parseFloat(parts[4].trim()) : null;
                    
                    console.log(`Парсинг простий товар "${product.name}": звичайна ціна=${price}, акційна ціна=${salePrice}, частин=${parts.length}`);
                    
                    if (!isNaN(price) && price >= 0) {
                        update.data.price = price;
                        update.updates.push(`ціна: ${product.price} → ${price}`);
                        console.log(`Підготовлено оновлення ціни товару "${product.name}" з ${product.price} на ${price}`);
                    }
                    
                    // Обробка акційної ціни
                    if (parts.length > 4) {
                        if (!isNaN(salePrice) && salePrice >= 0) {
                            // Акційна ціна може бути меншою або рівною звичайній
                            if (salePrice <= price) {
                                update.data.salePrice = salePrice;
                                // Встановлюємо акцію на безкінечний період за замовчуванням
                                update.data.saleEnd = null;
                                update.updates.push(`акційна ціна: ${product.salePrice || 'відсутня'} → ${salePrice}`);
                                console.log(`Підготовлено оновлення акційної ціни товару "${product.name}" на ${salePrice} (безкінечна акція)`);
                        } else {
                                console.warn(`Акційна ціна ${salePrice} не може бути більшою за звичайну ціну ${price} для товару "${product.name}"`);
                            }
                        } else {
                            console.warn(`Невірна акційна ціна "${parts[4]}" для товару "${product.name}"`);
                        }
                    } else {
                        // Якщо акційної ціни немає в файлі, видаляємо її
                        if (product.salePrice !== null) {
                            update.data.salePrice = null;
                            update.data.saleEnd = null;
                            update.updates.push(`акційна ціна: ${product.salePrice} → видалена`);
                            console.log(`Підготовлено видалення акційної ціни товару "${product.name}"`);
                        }
                    }
                } else if (product.type === 'mattresses') {
                    const sizePart = parts[3].trim();
                    const price = parseFloat(parts[4].trim());
                    const salePrice = parts.length > 5 ? parseFloat(parts[5].trim()) : null;
                    
                    console.log(`Парсинг матрац "${product.name}": розмір=${sizePart}, ціна=${price}, акційна ціна=${salePrice}, частин=${parts.length}`);
                    
                    if (sizePart.startsWith('Розмір: ')) {
                        const size = sizePart.replace('Розмір: ', '').trim();
                        const sizeObj = update.data.sizes.find(s => s.name === size);
                        if (sizeObj && !isNaN(price) && price >= 0) {
                            const oldPrice = sizeObj.price;
                            sizeObj.price = price;
                            update.updates.push(`розмір "${size}": ${oldPrice} → ${price}`);
                            console.log(`Підготовлено оновлення ціни матрацу "${product.name}" розміру "${size}" з ${oldPrice} на ${price}`);
                        }
                        // ОНОВЛЕННЯ АКЦІЙНОЇ ЦІНИ ДЛЯ КОЖНОГО РОЗМІРУ
                        if (sizeObj) {
                            if (parts.length > 5 && !isNaN(salePrice) && salePrice >= 0 && salePrice <= price) {
                                const oldSale = sizeObj.salePrice;
                                sizeObj.salePrice = salePrice;
                                update.updates.push(`акційна ціна для розміру "${size}": ${oldSale ?? 'відсутня'} → ${salePrice}`);
                                console.log(`Підготовлено оновлення акційної ціни для розміру "${size}" на ${salePrice}`);
                            } else if (parts.length <= 5 || isNaN(salePrice) || salePrice === null) {
                                // Якщо акційної ціни немає або вона некоректна — видалити
                                if (sizeObj.salePrice !== undefined && sizeObj.salePrice !== null) {
                                    sizeObj.salePrice = null;
                                    update.updates.push(`акційна ціна для розміру "${size}": видалена`);
                                    console.log(`Підготовлено видалення акційної ціни для розміру "${size}"`);
                                }
                            }
                        }
                    }
                }
            }
            
            console.log(`Групування завершено. Підготовлено оновлень для ${productUpdates.size} товарів`);
            
            // Тепер оновлюємо кожен товар один раз з усіма змінами
            for (const [productId, update] of productUpdates) {
                if (update.updates.length > 0) {
                    console.log(`Оновлюємо товар "${update.product.name}" з змінами: ${update.updates.join(', ')}`);
                    const response = await fetchWithAuth(`/api/products/${productId}`, {
                                method: 'PUT',
                        body: JSON.stringify(update.data)
                            });
                            if (response.ok) {
                                updated++;
                        console.log(`✅ Успішно оновлено товар "${update.product.name}"`);
                        console.log(`📊 Дані оновлення:`, update.data);
                            } else {
                                const text = await response.text();
                        console.error(`❌ Помилка оновлення товару "${update.product.name}": ${text}`);
                            }
                } else {
                    console.log(`Пропускаємо товар "${update.product.name}" - немає змін для оновлення`);
                }
            }

            console.log(`Завершено імпорт. Успішно оновлено ${updated} товарів з ${lines.length} рядків`);
            console.log(`Загальна статистика: ${productUpdates.size} товарів було оброблено, ${updated} оновлено`);
            
            // Підраховуємо кількість оновлень акційних цін
            let salePriceUpdates = 0;
            for (const [productId, update] of productUpdates) {
                if (update.updates.some(u => u.includes('акційна ціна'))) {
                    salePriceUpdates++;
                }
            }
            
            if (salePriceUpdates > 0) {
                console.log(`Оновлено акційних цін: ${salePriceUpdates} товарів`);
                showNotification(`Оновлено цін для ${updated} товарів (включаючи ${salePriceUpdates} акційних цін)!`);
            } else {
            showNotification(`Оновлено цін для ${updated} товарів!`);
            }
            
            await loadProducts(productsCurrentPage, productsPerPage);
            resetInactivityTimer();
        } catch (err) {
            console.error('Помилка обробки файлу цін:', err);
            showNotification('Помилка обробки файлу цін: ' + err.message);
        }
    };
    reader.readAsText(file);
}

    function exportPrices() {
        let counter = 1;
        const activeProducts = products.filter(p => p.active && p.type !== 'group');
        const productsWithSale = activeProducts.filter(p => p.salePrice !== null);
        console.log(`Експортуємо ціни для ${activeProducts.length} активних товарів`);
        console.log(`Товарів з акційними цінами: ${productsWithSale.length}`);
        
        if (activeProducts.length === 0) {
            showNotification('Немає активних товарів для експорту!');
            return;
        }
        
        const exportData = activeProducts
            .map(p => {
                if (p.type === 'simple') {
                    // Додаємо акційну ціну, якщо вона є
                    const salePrice = p.salePrice ? `,${p.salePrice}` : '';
                    const line = `${counter},${p.name},${p.brand || 'Без бренду'},${p.price || '0'}${salePrice}`;
                    console.log(`Експорт простого товару #${counter}: ${p.name} - ${p.price || '0'} грн${p.salePrice ? ` (акція: ${p.salePrice} грн)` : ''}`);
                    counter++;
                    return line;
                } else if (p.type === 'mattresses') {
                    // Для матраців для кожного розміру експортуємо свою акційну ціну
                    const lines = p.sizes.map(s => {
                        const salePrice = s.salePrice ? `,${s.salePrice}` : '';
                        return `${counter},${p.name},${p.brand || 'Без бренду'},Розмір: ${s.name},${s.price || '0'}${salePrice}`;
                    });
                    console.log(`Експорт матрацу #${counter}: ${p.name} з ${p.sizes.length} розмірами`);
                    counter++;
                    return lines.join('\n');
                }
                return '';
            })
            .filter(line => line)
            .join('\n');
        console.log('Експортовані дані:', exportData);
        console.log('Формат файлу: порядковий_номер,назва,бренд,ціна[,акційна_ціна]');
        console.log('Приклад: 1,Вітальня "Марк",Без бренду,13800,12000');
        console.log('Для матраців: порядковий_номер,назва,бренд,розмір,ціна[,акційна_ціна]');
        console.log('Приклад: 2,Матрац "Софія",Матролюкс,Розмір: 90х200,2000,1800');
        const blob = new Blob([exportData], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'prices-export.txt';
        a.click();
        URL.revokeObjectURL(url);
        
        if (productsWithSale.length > 0) {
            showNotification(`Ціни експортовано! (${productsWithSale.length} товарів з акційними цінами)`);
        } else {
        showNotification('Ціни експортовано!');
        }
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
                <h3>Замовлення #${order.orderNumber || (index + 1)}</h3>
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
                              // Формуємо інформацію про колір або розмір
                              let additionalInfo = '';
                              if (item.color && typeof item.color === 'object' && item.color.name) {
                                  additionalInfo = `, Колір: ${item.color.name}`;
                              } else if (item.size) {
                                  additionalInfo = `, Розмір: ${item.size}`;
                              }
                              
                              // Формуємо назву товару з брендом
                              let productName = item.name || 'Невідомий товар';
                              if (item.brand) {
                                  productName = `${item.name} (${item.brand})`;
                              }
                              
                              return `<p>${productName}${additionalInfo} - ${item.quantity} шт. - ${item.price} грн</p>`;
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
                <h3>Змінити статус замовлення #${order.orderNumber || (index + 1)}</h3>
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

        const updatedOrder = { status: newStatus };

        const response = await fetchWithAuth(`/api/orders/${order._id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedOrder)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Не вдалося оновити статус замовлення');
        }

        const updatedOrderFromServer = await response.json();
        orders[index] = { ...order, ...updatedOrderFromServer };
        closeModal();
        renderAdmin('orders');
        showNotification('Статус замовлення змінено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення статусу замовлення:', err);
        showNotification('Не вдалося оновити статус замовлення: ' + (err.message || 'Невідома помилка'));
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

            const orderIndex = orders.findIndex(o => o._id === order._id);
            if (orderIndex !== -1) {
                orders.splice(orderIndex, 1);
            } else {
                console.warn('Замовлення не знайдено в локальному масиві після видалення');
            }

            if (orders.length === 0) {
                lastOrderNumber = 0;
                localStorage.setItem('lastOrderNumber', lastOrderNumber);
            }

            renderAdmin('orders');
            showNotification('Замовлення видалено!');
            unsavedChanges = false;
            resetInactivityTimer();
        } catch (err) {
            console.error('Помилка видалення замовлення:', err);
            showNotification('Не вдалося видалити замовлення: ' + err.message);
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

function filterOrders() {
    const statusFilter = document.getElementById('order-status-filter')?.value || '';
    ordersCurrentPage = 1;
    loadOrders(ordersCurrentPage, ordersPerPage, statusFilter);
    resetInactivityTimer();
}

document.addEventListener('mousemove', resetInactivityTimer);
document.addEventListener('keypress', resetInactivityTimer);

function handleCategoriesUpdate(data) {
    if (isUpdatingCategories) {
        console.log('Ігноруємо WebSocket-оновлення для категорій, оскільки триває локальне оновлення');
        return;
    }
    if (!Array.isArray(data)) {
        console.error('Дані категорій не є масивом:', data);
        return;
    }
    categories = data.map(category => ({
        ...category,
        subcategories: Array.isArray(category.subcategories) ? category.subcategories : []
    }));
    console.log('Оновлено categories:', categories);
    localStorage.setItem('categories', JSON.stringify(categories));
    renderCategoriesAdmin();
}

function handleOrdersUpdate(data) {
    orders = data;
    totalOrders = data.length;
    console.log('Оновлено orders:', orders);
    if (document.querySelector('#orders.active')) {
        renderAdmin('orders', { total: totalOrders });
    }
}

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
        showNotification('Помилка WebSocket-з\'єднання');
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
        console.log(`Отрирано WebSocket оновлення для ${type}:`, data);

        if (type === 'settings' && data) {
            settings = { ...settings, ...data };
            console.log('Оновлено settings:', settings);
            renderSettingsAdmin();
        } else if (type === 'products' && Array.isArray(data)) {
            if (isLoadingProducts) {
                console.log('Завантаження товарів через loadProducts ще триває, ігноруємо WebSocket-оновлення для products');
                return;
            }
            products = data;
            totalProducts = data.length;
            console.log('Оновлено products:', products);
            const globalIndex = (productsCurrentPage - 1) * productsPerPage + 1;
            products.forEach((p, index) => {
                p.tempNumber = globalIndex + index;
            });
            if (document.querySelector('#products.active')) {
                loadProducts(productsCurrentPage, productsPerPage);
            }
        } else if (type === 'categories' && Array.isArray(data)) {
            handleCategoriesUpdate(data);
        } else if (type === 'orders' && Array.isArray(data)) {
            orders = data;
            totalOrders = data.length;
            console.log('Оновлено orders:', orders);
            if (document.querySelector('#orders.active') && !isLoadingOrders) {
                const statusFilter = document.getElementById('order-status-filter')?.value || '';
                loadOrders(ordersCurrentPage, ordersPerPage, statusFilter);
            }
        } else if (type === 'slides' && Array.isArray(data)) {
            slides = data;
            console.log('Оновлено slides:', slides);
            if (document.querySelector('#site-editing.active')) {
                renderSlidesAdmin();
            }
        } else if (type === 'materials' && Array.isArray(data)) {
            materials = data;
            console.log('Оновлено materials:', materials);
            updateMaterialOptions();
        } else if (type === 'brands' && Array.isArray(data)) {
            brands = data;
            console.log('Оновлено brands:', brands);
            updateBrandOptions();
        } else if (type === 'error') {
            // Перевіряємо, чи є data об'єктом і чи має властивість error
            const errorMessage = data && typeof data === 'object' && data.error ? data.error : 'Невідома помилка';
            console.error('WebSocket помилка від сервера:', errorMessage);
            showNotification(`Помилка WebSocket: ${errorMessage}`);
            if (errorMessage.includes('неавторизований')) {
                localStorage.removeItem('adminToken');
                localStorage.removeItem('adminSession');
                showSection('admin-login');
            }
        } else {
            console.warn(`Невідомий тип WebSocket-повідомлення: ${type}`);
        }
    } catch (e) {
        console.error('Помилка обробки WebSocket-повідомлення:', e);
        showNotification('Помилка обробки WebSocket-повідомлення: ' + e.message);
    }
  };
}