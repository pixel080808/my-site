let cart = [];
let products = [];
let categories = [];
let orders = [];
let slides = [];
let orderFields = [];
let settings = {};
let currentProduct = null;
let currentCategory = null;
let currentSubcategory = null;
let selectedMattressSizes = {};
let currentSlideIndex = 0;
let slideInterval;
let currentGalleryIndex = 0;
let currentGalleryImages = [];
let removeCartIndex = -1;
let searchResults = [];
let baseSearchResults = [];
let isSearchActive = false;
let isSearchPending = false;
let filteredProducts = [];
let selectedColors = {};
let ws;
const activeTimers = new Map();
let parentGroupProduct = null;
const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://mebli.onrender.com';
const NO_IMAGE_URL = 'https://placehold.co/300x200?text=Фото+відсутнє';

        function transliterate(str) {
            const uaToEn = {
                'а': 'a', 'б': 'b', 'в': 'v', 'г': 'h', 'ґ': 'g', 'д': 'd', 'е': 'e', 'є': 'ye',
                'ж': 'zh', 'з': 'z', 'и': 'y', 'і': 'i', 'ї': 'yi', 'й': 'y', 'к': 'k', 'л': 'l',
                'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
                'ф': 'f', 'х': 'kh', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ь': '',
                'ю': 'yu', 'я': 'ya', 'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'H', 'Ґ': 'G', 'Д': 'D',
                'Е': 'E', 'Є': 'Ye', 'Ж': 'Zh', 'З': 'Z', 'И': 'Y', 'І': 'I', 'Ї': 'Yi', 'Й': 'Y',
                'К': 'K', 'Л': 'L', 'М': 'M', 'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S',
                'Т': 'T', 'У': 'U', 'Ф': 'F', 'Х': 'Kh', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Shch',
                'Ь': '', 'Ю': 'Yu', 'Я': 'Ya'
            };
            return str.split('').map(char => uaToEn[char] || char).join('').replace(/\s+/g, '-').toLowerCase();
        }

function loadFromStorage(key, defaultValue) {
    try {
        const compressed = localStorage.getItem(key);
        if (!compressed) return defaultValue;
        const decompressed = LZString.decompressFromUTF16(compressed);
        if (!decompressed) {
            console.warn(`Дані для ${key} не вдалося декомпресувати, повертаємо значення за замовчуванням`);
            localStorage.removeItem(key);
            return defaultValue;
        }
        return JSON.parse(decompressed) || defaultValue;
    } catch (e) {
        console.error(`Помилка парсингу ${key}:`, e);
        localStorage.removeItem(key); // Очищаємо пошкоджені дані
        return defaultValue;
    }
}

function saveToStorage(key, value) {
    try {
        // Перевіряємо, чи можна серіалізувати об'єкт
        const testStringify = JSON.stringify(value);
        if (typeof testStringify !== 'string') {
            console.error(`Помилка: Дані для ${key} не можуть бути серіалізовані в JSON`);
            return;
        }
        localStorage.setItem(key, LZString.compressToUTF16(testStringify));
    } catch (e) {
        console.error(`Помилка збереження ${key}:`, e);
        if (e.name === 'QuotaExceededError') {
            localStorage.clear();
            localStorage.setItem(key, LZString.compressToUTF16(JSON.stringify(value)));
            showNotification('Локальне сховище очищено через перевищення квоти.', 'error');
        }
    }
}

async function loadCartFromServer() {
    try {
        const cartId = localStorage.getItem('cartId');
        if (!cartId) {
            console.warn('cartId відсутній, створюємо новий');
            const newCartId = 'cart-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('cartId', newCartId);
            cart = [];
            saveToStorage('cart', cart);
            return;
        }
        const response = await fetchWithRetry(`${BASE_URL}/api/cart?cartId=${cartId}`, 3, 1000);
        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
            const errorText = await response.text();
            console.error(`Сервер повернув не JSON: ${contentType}, Тіло: ${errorText}`);
            throw new Error('Сервер повернув не JSON: ' + contentType);
        }
        cart = await response.json() || [];
        cart = cart.filter(item => {
            const isValid = item && 
                typeof item.id === 'number' && 
                !isNaN(item.id) && 
                item.name && 
                typeof item.quantity === 'number' && 
                typeof item.price === 'number';
            if (!isValid) {
                console.warn('Елемент кошика з сервера видалено через некоректні дані:', item);
            }
            return isValid;
        });
        saveToStorage('cart', cart);
    } catch (e) {
        console.error('Помилка завантаження кошика:', e);
        try {
            cart = loadFromStorage('cart', []);
            cart = cart.filter(item => {
                const isValid = item && 
                    typeof item.id === 'number' && 
                    !isNaN(item.id) && 
                    item.name && 
                    typeof item.quantity === 'number' && 
                    typeof item.price === 'number';
                if (!isValid) {
                    console.warn('Елемент кошика з localStorage видалено через некоректні дані:', item);
                }
                return isValid;
            });
            saveToStorage('cart', cart);
        } catch (localError) {
            console.error('Помилка завантаження кошика з localStorage:', localError);
            cart = [];
            saveToStorage('cart', cart);
            showNotification('Кошик очищено через пошкоджені дані.', 'warning');
        }
        showNotification('Не вдалося завантажити кошик із сервера. Використано локальні дані.', 'error');
    }
}

// Викликайте цю функцію за потреби, наприклад, для адміністратора
// triggerCleanupOldCarts();

async function saveCartToServer() {
    let cartItems = [];
    
    // Перевіряємо, чи є кошик у localStorage
    const cartData = localStorage.getItem('cart');
    if (cartData) {
        try {
            const decompressed = LZString.decompressFromUTF16(cartData);
            if (!decompressed) {
                console.warn('Дані кошика не вдалося декомпресувати, очищаємо кошик');
                cartItems = [];
                localStorage.setItem('cart', LZString.compressToUTF16(JSON.stringify(cartItems)));
            } else {
                cartItems = JSON.parse(decompressed);
                if (!Array.isArray(cartItems)) {
                    console.warn('Кошик у localStorage не є масивом, очищаємо його');
                    cartItems = [];
                    localStorage.setItem('cart', LZString.compressToUTF16(JSON.stringify(cartItems)));
                }
            }
        } catch (error) {
            console.error('Помилка парсингу кошика з localStorage:', error);
            cartItems = [];
            localStorage.setItem('cart', LZString.compressToUTF16(JSON.stringify(cartItems)));
        }
    }

    // Фільтруємо некоректні елементи кошика
    const filteredCartItems = cartItems.filter(item => {
        const isValid = item && 
            typeof item.id === 'number' && 
            !isNaN(item.id) && 
            item.name && 
            typeof item.quantity === 'number' && 
            typeof item.price === 'number';
        if (!isValid) {
            console.warn('Елемент кошика видалено через некоректні дані:', item);
        }
        return isValid;
    });

    // Оновлюємо глобальний cart
    cart = filteredCartItems;
    saveToStorage('cart', cart);

    // Перевіряємо або генеруємо cartId
    let cartId = localStorage.getItem('cartId');
    if (!cartId) {
        cartId = 'cart-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('cartId', cartId);
        console.log('Новий cartId згенеровано:', cartId);
    }

    try {
        const response = await fetch(`${BASE_URL}/api/cart?cartId=${cartId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': localStorage.getItem('csrfToken')
            },
            body: JSON.stringify(filteredCartItems),
            credentials: 'include'
        });

        const responseBody = await response.json();
        if (!response.ok) {
            console.error(`Помилка сервера: ${response.status}, Тіло:`, responseBody);
            throw new Error(`Помилка сервера: ${response.status}`);
        }
        console.log('Кошик успішно збережено на сервері');
    } catch (error) {
        console.error('Помилка збереження кошика:', error);
        throw error;
    }
}

async function triggerCleanupOldCarts() {
    try {
        const response = await fetch(`${BASE_URL}/api/cleanup-carts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        if (!response.ok) {
            throw new Error('Не вдалося очистити старі кошики');
        }
        const data = await response.json();
        console.log(data.message);
        showNotification(data.message, 'success');
    } catch (err) {
        console.error('Помилка при виклику очищення кошиків:', err);
        showNotification('Не вдалося очистити старі кошики!', 'error');
    }
}

async function loginUser(email, password) {
    try {
        const response = await fetch(`${BASE_URL}/api/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Помилка входу: ${response.status}, ${errorText}`);
        }
        const data = await response.json();
        localStorage.setItem('authToken', data.token);
        showNotification('Вхід виконано успішно!', 'success');
    } catch (error) {
        console.error('Помилка входу:', error);
        showNotification('Не вдалося увійти. Перевірте дані.', 'error');
    }
}

async function fetchWithRetry(url, retries = 3, delay = 1000, options = {}) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Fetching ${url}, attempt ${i + 1}`);
            const response = await fetch(url, { ...options, credentials: 'include' });
            if (!response.ok) throw new Error(`HTTP error! Status: ${response.status}`);
            console.log(`Fetch ${url} successful`);
            return response;
        } catch (error) {
            console.error(`Fetch attempt ${i + 1} failed:`, error);
            if (i === retries - 1) {
                showNotification('Не вдалося підключитися до сервера! Спробуйте пізніше.', 'error');
                throw error; // Кидаємо помилку замість повернення null
            }
            console.warn(`Retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
}

async function fetchPublicData() {
    try {
        console.log('Fetching products...');
        const response = await fetchWithRetry(`${BASE_URL}/api/public/products`);
        if (response) {
            products = await response.json();
            console.log('Products fetched:', products.length);
        } else {
            throw new Error('Не вдалося отримати продукти');
        }

        console.log('Fetching categories...');
        const catResponse = await fetchWithRetry(`${BASE_URL}/api/public/categories`);
        if (catResponse) {
            categories = await catResponse.json();
            console.log('Categories fetched:', categories.length);
        } else {
            throw new Error('Не вдалося отримати категорії');
        }

        console.log('Fetching slides...');
        const slidesResponse = await fetchWithRetry(`${BASE_URL}/api/public/slides`);
        if (slidesResponse) {
            slides = await slidesResponse.json();
            console.log('Slides fetched:', slides.length);
        } else {
            throw new Error('Не вдалося отримати слайди');
        }

        console.log('Fetching settings...');
        const settingsResponse = await fetchWithRetry(`${BASE_URL}/api/public/settings`);
        if (settingsResponse) {
            settings = await settingsResponse.json();
            console.log('Settings fetched:', settings);
        } else {
            throw new Error('Не вдалося отримати налаштування');
        }
    } catch (e) {
        console.error('Помилка завантаження даних через HTTP:', e);
        showNotification('Не вдалося завантажити дані з сервера!', 'error');
    }
}

async function fetchCsrfToken() {
    try {
        const response = await fetchWithRetry(`${BASE_URL}/api/csrf-token`, 3, 1000);
        if (response) {
            console.log('Відповідь сервера для CSRF-токена:', response.status, response.statusText);
            const contentType = response.headers.get('Content-Type');
            console.log('Content-Type:', contentType);
            const data = await response.json();
            console.log('Дані відповіді:', data);
            if (data.csrfToken) {
                localStorage.setItem('csrfToken', data.csrfToken);
                console.log('CSRF-токен отримано:', data.csrfToken);
                return data.csrfToken;
            } else {
                console.warn('CSRF-токен не отримано від сервера:', data);
                localStorage.removeItem('csrfToken');
                showNotification('Не вдалося отримати CSRF-токен. Деякі функції будуть збережені локально.', 'warning');
                return null;
            }
        } else {
            throw new Error('Не вдалося отримати відповідь від сервера');
        }
    } catch (e) {
        console.error('Помилка отримання CSRF-токена:', e);
        localStorage.removeItem('csrfToken');
        showNotification('Не вдалося отримати CSRF-токен. Дані будуть збережені локально.', 'warning');
        return null;
    }
}

function connectPublicWebSocket() {
    const wsUrl = window.location.hostname === 'localhost' 
        ? 'ws://localhost:3000' 
        : 'wss://mebli.onrender.com';
    
    if (ws && ws.readyState === WebSocket.OPEN) {
        console.log('Публічний WebSocket уже підключено.');
        return;
    }

    ws = new WebSocket(wsUrl);

    let reconnectAttempts = 0;
    const maxAttempts = 5;

    ws.onopen = () => {
        console.log('Публічний WebSocket підключено');
        reconnectAttempts = 0; // Скидаємо лічильник при успішному підключенні
        ['products', 'categories', 'settings', 'slides'].forEach(type => {
            ws.send(JSON.stringify({ type, action: 'subscribe' }));
        });
    };

    ws.onmessage = (event) => {
        try {
            const message = JSON.parse(event.data);
            if (!message.type || !('data' in message)) {
                throw new Error('Некоректний формат повідомлення WebSocket');
            }
            const { type, data } = message;
            console.log('Отримано повідомлення WebSocket:', { type, data });

            switch (type) {
                case 'products':
                    products = data;
                    updateCartPrices();
                    if (document.getElementById('catalog').classList.contains('active')) {
                        renderCatalog(currentCategory, currentSubcategory, currentProduct);
                    } else if (document.getElementById('product-details').classList.contains('active') && currentProduct) {
                        currentProduct = products.find(p => p.id === currentProduct.id) || currentProduct;
                        renderProductDetails();
                    } else if (document.getElementById('cart').classList.contains('active')) {
                        renderCart();
                    }
                    break;
                case 'categories':
                    categories = data;
                    renderCategories();
                    renderCatalogDropdown();
                    if (document.getElementById('catalog').classList.contains('active')) {
                        renderCatalog(currentCategory, currentSubcategory, currentProduct);
                    }
                    break;
                case 'settings':
                    settings = {
                        ...settings,
                        ...data,
                        contacts: { ...settings.contacts, ...(data.contacts || {}) },
                        socials: data.socials || settings.socials,
                        showSocials: data.showSocials !== undefined ? data.showSocials : settings.showSocials,
                        showSlides: data.showSlides !== undefined ? data.showSlides : settings.showSlides
                    };
                    updateHeader();
                    // Завжди викликаємо ці функції, щоб оновити DOM незалежно від активної секції
                    renderContacts(); // Оновлюємо контакти та соціальні мережі
                    renderAbout();    // Оновлюємо секцію "Про нас"
                    renderSlideshow(); // Оновлюємо слайдшоу
                    // Оновлюємо favicon
                    const oldFavicon = document.querySelector('link[rel="icon"]');
                    if (oldFavicon) oldFavicon.remove();
                    const faviconUrl = settings.favicon || 'https://www.google.com/favicon.ico';
                    const favicon = document.createElement('link');
                    favicon.rel = 'icon';
                    favicon.type = 'image/x-icon';
                    favicon.href = faviconUrl;
                    document.head.appendChild(favicon);
                    break;
                case 'slides':
                    slides = data;
                    if (settings.showSlides && slides.length > 0) {
                        renderSlideshow();
                    }
                    break;
                default:
                    console.warn('Невідомий тип повідомлення:', type);
            }
        } catch (e) {
            console.error('Помилка обробки WebSocket:', e);
            showNotification('Помилка синхронізації даних!', 'error');
        }
    };

    ws.onclose = (event) => {
        console.log('Публічний WebSocket відключено:', { code: event.code, reason: event.reason });
        if (event.code !== 1000 && reconnectAttempts < maxAttempts) {
            reconnectAttempts++;
            console.log(`Спроба перепідключення ${reconnectAttempts} з ${maxAttempts}`);
            setTimeout(connectPublicWebSocket, 2000);
        } else if (reconnectAttempts >= maxAttempts) {
            console.error('Досягнуто максимальної кількості спроб підключення');
            showNotification('Не вдалося підключитися до сервера!', 'error');
        }
    };

    ws.onerror = (error) => {
        console.error('Помилка WebSocket:', error);
    };
}

async function initializeData() {
    let cartId = localStorage.getItem('cartId');
    if (!cartId) {
        cartId = 'cart-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('cartId', cartId);
    }

    await fetchCsrfToken();
    await loadCartFromServer();
    selectedColors = loadFromStorage('selectedColors', {});
    selectedMattressSizes = loadFromStorage('selectedMattressSizes', {});
    parentGroupProduct = loadFromStorage('parentGroupProduct', null);
    currentCategory = loadFromStorage('currentCategory', null);
    currentSubcategory = loadFromStorage('currentSubcategory', null);

    orderFields = loadFromStorage('orderFields', [
        { name: 'name', label: 'Ім\'я', type: 'text', required: true },
        { name: 'surname', label: 'Прізвище', type: 'text', required: true },
        { name: 'phone', label: 'Телефон', type: 'tel', required: true },
        { name: 'email', label: 'Email', type: 'email', required: false },
        { name: 'address', label: 'Адреса доставки', type: 'text', required: true },
        { name: 'payment', label: 'Оплата', type: 'select', options: ['Готівкою', 'Безготівковий розрахунок'], required: true }
    ]);
    if (!localStorage.getItem('orderFields')) saveToStorage('orderFields', orderFields);

    orders = loadFromStorage('orders', []);
    if (orders.length > 5) orders = orders.slice(-5);
    saveToStorage('orders', orders);

    products = [];
    categories = [];
    slides = [];
    settings = {
        name: 'Меблевий магазин',
        logo: NO_IMAGE_URL,
        logoWidth: 150,
        contacts: { phones: '', addresses: '', schedule: '' },
        socials: [],
        showSocials: true,
        about: '',
        showSlides: true,
        slideInterval: 3000,
        favicon: ''
    };

    connectPublicWebSocket();

    try {
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                console.warn('Дані від WebSocket не отримано вчасно, використовуємо HTTP');
                clearInterval(checkInterval);
                reject(new Error('WebSocket timeout'));
            }, 5000);

            const checkInterval = setInterval(() => {
                if (ws.readyState === WebSocket.OPEN && products.length > 0 && categories.length > 0 && slides.length > 0 && Object.keys(settings).length > 0) {
                    clearTimeout(timeout);
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 100);
        });
    } catch (error) {
        console.warn('Завантаження через WebSocket не вдалося, використовуємо HTTP:', error);
        await fetchPublicData();
    }

    updateHeader();
    renderCategories();
    renderCatalogDropdown();
}

async function updateProducts() {
    try {
        const response = await fetchWithRetry(`${BASE_URL}/api/public/products?_v=${Date.now()}`);
        products = await response.json(); // Додаємо await response.json()
        saveToStorage('products', products);
        const productList = document.getElementById('product-list');
        if (productList) {
            const existingTimers = productList.querySelectorAll('.sale-timer');
            existingTimers.forEach(timer => {
                if (timer.dataset.intervalId) clearInterval(parseInt(timer.dataset.intervalId));
            });
        }
        if (document.getElementById('catalog').classList.contains('active')) {
            renderCatalog(currentCategory, currentSubcategory, currentProduct);
        } else if (document.getElementById('product-details').classList.contains('active') && currentProduct) {
            currentProduct = products.find(p => p.id === currentProduct.id) || currentProduct;
            renderProductDetails();
        }
        updateCartPrices();
    } catch (error) {
        console.error('Error fetching products:', error);
        products = loadFromStorage('products', []);
    }
}

function showSection(sectionId) {
    try {
        // Приховуємо всі секції
        document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));

        // Перевіряємо існування секції
        const section = document.getElementById(sectionId);
        if (!section) {
            console.error(`Section with ID "${sectionId}" not found in DOM`);
            showNotification('Секція не знайдена!', 'error');
            return; // Зупиняємо виконання, якщо секція не знайдена
        }

        // Показуємо потрібну секцію
        section.classList.add('active');
        let newPath = '/';

        // Логіка для кожної секції
        if (sectionId === 'home') {
            currentProduct = null;
            currentCategory = null;
            currentSubcategory = null;
            parentGroupProduct = null;
            saveToStorage('parentGroupProduct', null);
            isSearchActive = false;
            searchResults = [];
            baseSearchResults = [];
            renderCategories();
            updateCartCount();
            newPath = '/';
        } else if (sectionId === 'catalog') {
            if (!isSearchActive && !currentCategory) {
                currentProduct = null;
                currentSubcategory = null;
                parentGroupProduct = null;
                saveToStorage('parentGroupProduct', null);
                newPath = '/catalog';
            } else if (currentProduct) {
                showSection('product-details');
                return;
            } else if (currentSubcategory) {
                if (!currentCategory) {
                    console.error('currentCategory is not set, but currentSubcategory exists:', currentSubcategory);
                    showNotification('Помилка: Категорія не визначена!', 'error');
                    showSection('catalog');
                    return;
                }
                const catSlug = transliterate(currentCategory.replace('ь', ''));
                const subCatSlug = transliterate(currentSubcategory.replace('ь', ''));
                newPath = `/${catSlug}/${subCatSlug}`;
            } else if (currentCategory) {
                const catSlug = transliterate(currentCategory.replace('ь', ''));
                newPath = `/${catSlug}`;
            }
            renderCatalog(currentCategory, currentSubcategory, currentProduct);
        } else if (sectionId === 'cart') {
            parentGroupProduct = null;
            saveToStorage('parentGroupProduct', null);
            renderCart();
            newPath = '/cart';
        } else if (sectionId === 'contacts') {
            parentGroupProduct = null;
            saveToStorage('parentGroupProduct', null);
            renderContacts();
            newPath = '/contacts';
        } else if (sectionId === 'about') {
            parentGroupProduct = null;
            saveToStorage('parentGroupProduct', null);
            renderAbout();
            newPath = '/about';
        } else if (sectionId === 'product-details') {
            if (!currentProduct) {
                showNotification('Товар не знайдено!', 'error');
                showSection('catalog');
                return;
            }
            if (!currentCategory || !currentSubcategory) {
                console.error('currentCategory or currentSubcategory is not set for product-details:', { currentCategory, currentSubcategory });
                showNotification('Помилка: Категорія або підкатегорія не визначені!', 'error');
                showSection('catalog');
                return;
            }
            renderProductDetails();
            const catSlug = transliterate(currentCategory.replace('ь', ''));
            const subCatSlug = transliterate(currentSubcategory.replace('ь', ''));
            newPath = `/${catSlug}/${subCatSlug}/${currentProduct.slug}`;
        }

        // Зберігаємо стан
        saveToStorage('currentCategory', currentCategory);
        saveToStorage('currentSubcategory', currentSubcategory);

        // Оновлюємо URL
        history.pushState({ sectionId }, '', newPath);

        // Оновлюємо мета-теги та breadcrumbs
        updateMetaTags(sectionId === 'product-details' ? currentProduct : null);
        renderBreadcrumbs();

        // Прокручуємо сторінку вгору
        window.scrollTo(0, 0);

        // Очищаємо таймери
        activeTimers.forEach((id) => clearInterval(id));
        activeTimers.clear();
    } catch (error) {
        console.error('Помилка в showSection:', error);
        showNotification('Виникла помилка при перемиканні секції!', 'error');
        showSection('home'); // Повертаємося на головну сторінку у разі помилки
    }
}

function updateMetaTags(product) {
    document.title = product ? `${product.name} | ${settings.name}` : settings.name;
    const descTag = document.querySelector('meta[name="description"]');
    if (descTag) descTag.content = product ? (product.description || settings.name) : 'Меблевий магазин - широкий вибір меблів для дому.';
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = document.title;
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.content = descTag.content;
    const ogImage = document.querySelector('meta[property="og:image"]');
    if (ogImage && product?.photos?.[0]) ogImage.content = product.photos[0];
}

function renderBreadcrumbs() {
    const breadcrumbsContainer = document.getElementById('breadcrumbs');
    if (!breadcrumbsContainer) return;

    while (breadcrumbsContainer.firstChild) {
        breadcrumbsContainer.removeChild(breadcrumbsContainer.firstChild);
    }

    breadcrumbsContainer.classList.add('breadcrumbs-container');

    const homeSpan = document.createElement('span');
    const homeLink = document.createElement('a');
    homeLink.href = '/';
    homeLink.textContent = 'Головна';
    homeLink.classList.add('breadcrumb-link');
    homeLink.style.display = 'inline-block';
    homeLink.onclick = (e) => {
        e.preventDefault();
        currentCategory = null;
        currentSubcategory = null;
        currentProduct = null;
        isSearchActive = false;
        showSection('home');
    };
    homeSpan.appendChild(homeLink);
    breadcrumbsContainer.appendChild(homeSpan);

    const pathSegments = window.location.pathname.slice(1).split('/').filter(segment => segment);
    if (isSearchActive && document.getElementById('search')?.value) {
        homeSpan.appendChild(document.createTextNode(' > '));
        const searchSpan = document.createElement('span');
        const searchLink = document.createElement('a');
        searchLink.href = '/catalog';
        searchLink.textContent = `Результати пошуку "${document.getElementById('search').value}"`;
        searchLink.classList.add('breadcrumb-link');
        searchLink.style.display = 'inline-block';
        searchLink.style.padding = '0 5px';
        searchLink.onclick = (e) => {
            e.preventDefault();
            currentCategory = null;
            currentSubcategory = null;
            currentProduct = null;
            showSection('catalog');
        };
        searchSpan.appendChild(searchLink);
        breadcrumbsContainer.appendChild(searchSpan);
    } else if (pathSegments.length > 0) {
        homeSpan.appendChild(document.createTextNode(' > '));
        let currentPath = '';

        pathSegments.forEach((segment, index) => {
            currentPath = index === 0 ? `/${segment}` : `${currentPath}/${segment}`;

            const span = document.createElement('span');
            const link = document.createElement('a');
            link.href = currentPath;
            link.classList.add('breadcrumb-link');
            link.style.display = 'inline-block';
            link.style.padding = '0 5px';

            let displayText = segment;
            if (segment === 'contacts') displayText = 'Контакти';
            else if (segment === 'about') displayText = 'Про нас';
            else if (segment === 'cart') displayText = 'Кошик';
            else if (index === pathSegments.length - 1 && currentProduct) {
                displayText = currentProduct.name;
                link.style.cursor = 'default';
                link.onclick = (e) => e.preventDefault();
            } else {
                const cat = categories.find(c => transliterate(c.name.replace('ь', '')) === segment);
                if (cat) displayText = cat.name;
                else {
                    const subCat = categories.flatMap(c => c.subcategories || []).find(sc => transliterate(sc.name.replace('ь', '')) === segment);
                    if (subCat) displayText = subCat.name;
                }
            }

            link.textContent = displayText;
            link.dataset.path = currentPath;

            if (index !== pathSegments.length - 1 || !currentProduct) {
                link.onclick = (e) => {
                    e.preventDefault();
                    const parts = currentPath.slice(1).split('/');
                    if (parts[0] === 'contacts') {
                        showSection('contacts');
                    } else if (parts[0] === 'about') {
                        showSection('about');
                    } else if (parts[0] === 'cart') {
                        showSection('cart');
                    } else {
                        const cat = categories.find(c => transliterate(c.name.replace('ь', '')) === parts[0]);
                        if (cat) {
                            currentCategory = cat.name;
                            currentSubcategory = null;
                            currentProduct = null;
                            if (parts.length >= 2) {
                                const subCat = categories.flatMap(c => c.subcategories || []).find(sc => transliterate(sc.name.replace('ь', '')) === parts[1]);
                                if (subCat) currentSubcategory = subCat.name;
                            }
                            showSection('catalog');
                        }
                    }
                };
            }

            span.appendChild(link);

            if (index < pathSegments.length - 1) {
                span.appendChild(document.createTextNode(' > '));
            }

            breadcrumbsContainer.appendChild(span);
        });
    }

    breadcrumbsContainer.style.display = (pathSegments.length === 0 && !isSearchActive) ? 'none' : 'block';
}

        document.addEventListener('click', (e) => {
            const catalogMenu = document.querySelector('.catalog-menu');
            const dropdown = document.getElementById('catalog-dropdown');
            if (!catalogMenu.contains(e.target) && dropdown.classList.contains('active')) {
                dropdown.classList.remove('active');
            }
        });

function renderCategories() {
    const catDiv = document.getElementById('categories');
    if (!catDiv) {
        console.warn('Елемент #categories не знайдено в DOM');
        return;
    }
    while (catDiv.firstChild) catDiv.removeChild(catDiv.firstChild);

    if (!categories || categories.length === 0) {
        const p = document.createElement('p');
        p.textContent = 'Категорії відсутні';
        catDiv.appendChild(p);
        return;
    }

    categories.forEach(cat => {
        const categoryDiv = document.createElement('div');
        categoryDiv.className = 'category';

        const img = document.createElement('img');
        img.src = cat.photo || NO_IMAGE_URL; // Змінено з cat.image на cat.photo
        img.alt = cat.name;
        img.loading = 'lazy';
        img.onerror = () => { img.src = NO_IMAGE_URL; };
        img.onclick = () => { 
            currentCategory = cat.name; 
            currentSubcategory = null; 
            currentProduct = null; 
            showSection('catalog'); 
        };
        categoryDiv.appendChild(img);

        const p = document.createElement('p');
        p.textContent = cat.name;
        p.onclick = () => { 
            currentCategory = cat.name; 
            currentSubcategory = null; 
            currentProduct = null; 
            showSection('catalog'); 
        };
        categoryDiv.appendChild(p);

        const subcategoriesDiv = document.createElement('div');
        subcategoriesDiv.className = 'subcategories';
        (cat.subcategories || []).forEach(sub => {
            const subP = document.createElement('p');
            subP.textContent = sub.name;
            subP.onclick = () => { 
                currentCategory = cat.name; 
                currentSubcategory = sub.name; 
                currentProduct = null; 
                showSection('catalog'); 
            };
            subcategoriesDiv.appendChild(subP);
        });
        categoryDiv.appendChild(subcategoriesDiv);

        catDiv.appendChild(categoryDiv);
    });

    renderSlideshow();
    renderCatalogDropdown();
}

function renderCatalogDropdown() {
    const dropdown = document.getElementById('catalog-dropdown');
    if (!dropdown || !categories) return;
    while (dropdown.firstChild) dropdown.removeChild(dropdown.firstChild);

    categories.forEach(cat => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'dropdown-item';

        const span = document.createElement('span');
        span.textContent = cat.name;
        span.onclick = () => { 
            currentProduct = null; 
            currentCategory = cat.name; 
            currentSubcategory = null; 
            showSection('catalog'); 
        };
        itemDiv.appendChild(span);

        const subDropdown = document.createElement('div');
        subDropdown.className = 'sub-dropdown';
        (cat.subcategories || []).forEach(sub => {
            const p = document.createElement('p');
            p.textContent = sub.name;
            p.onclick = () => { 
                currentProduct = null; 
                currentCategory = cat.name; 
                currentSubcategory = sub.name; 
                showSection('catalog'); 
            };
            subDropdown.appendChild(p);
        });
        itemDiv.appendChild(subDropdown);

        dropdown.appendChild(itemDiv);
    });
}

function renderCatalog(category = null, subcategory = null, product = null) {
    currentCategory = category;
    currentSubcategory = subcategory;
    if (product) {
        currentProduct = product;
        showSection('product-details');
        return;
    }
    const productsDiv = document.getElementById('products');
    if (!productsDiv) return;
    while (productsDiv.firstChild) productsDiv.removeChild(productsDiv.firstChild);

    if (isSearchActive) {
        const query = document.getElementById('search').value.toLowerCase().trim();
        const h2 = document.createElement('h2');
        h2.textContent = `Результати пошуку ${query ? `за "${query}"` : ''}`;
        productsDiv.appendChild(h2);

        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'catalog-controls';
        controlsDiv.appendChild(createSortMenu());
        controlsDiv.appendChild(createPerPageMenu());
        const perPageHidden = document.createElement('input');
        perPageHidden.type = 'hidden';
        perPageHidden.id = 'per-page-hidden';
        perPageHidden.value = '20';
        controlsDiv.appendChild(perPageHidden);
        productsDiv.appendChild(controlsDiv);

        const productList = document.createElement('div');
        productList.id = 'product-list';
        productList.className = 'product-grid';
        productsDiv.appendChild(productList);

        filteredProducts = [...searchResults]; // Завжди оновлюємо filteredProducts
        if (searchResults.length > 0) {
            renderProducts(filteredProducts);
        } else {
            const p = document.createElement('p');
            p.textContent = 'Нічого не знайдено';
            productList.appendChild(p);
        }
    } else if (!category) {
        const h2 = document.createElement('h2');
        h2.textContent = 'Виберіть категорію';
        productsDiv.appendChild(h2);

        const categoryList = document.createElement('div');
        categoryList.className = 'category-list';
        categories.forEach(cat => {
            const itemDiv = document.createElement('div');
            itemDiv.className = 'category-item';

            const img = document.createElement('img');
            img.src = cat.image || NO_IMAGE_URL;
            img.alt = cat.name;
            img.loading = 'lazy';
            img.onclick = () => {
                currentCategory = cat.name;
                currentSubcategory = null;
                currentProduct = null;
                showSection('catalog');
            };
            itemDiv.appendChild(img);

            const p = document.createElement('p');
            p.textContent = cat.name;
            p.onclick = () => {
                currentCategory = cat.name;
                currentSubcategory = null;
                currentProduct = null;
                showSection('catalog');
            };
            itemDiv.appendChild(p);

            categoryList.appendChild(itemDiv);
        });
        productsDiv.appendChild(categoryList);
        filteredProducts = []; // Оновлюємо filteredProducts
    } else {
        const selectedCat = categories.find(c => c.name === category);
        if (!selectedCat) {
            const p = document.createElement('p');
            p.textContent = 'Категорія не знайдена';
            productsDiv.appendChild(p);
            filteredProducts = []; // Оновлюємо filteredProducts
            return;
        }

        if (!currentProduct) {
            const h2 = document.createElement('h2');
            h2.textContent = category;
            productsDiv.appendChild(h2);

            const subFilterDiv = document.createElement('div');
            subFilterDiv.id = 'subcategory-filter';
            subFilterDiv.className = 'subcategory-filter';
            const subButtonsDiv = document.createElement('div');
            subButtonsDiv.className = 'subcategory-buttons';

            const allBtn = document.createElement('button');
            allBtn.textContent = 'Усі';
            allBtn.onclick = () => {
                currentSubcategory = null;
                showSection('catalog');
            };
            subButtonsDiv.appendChild(allBtn);

            (selectedCat.subcategories || []).forEach(sub => {
                const btn = document.createElement('button');
                btn.textContent = sub.name;
                btn.onclick = () => {
                    currentSubcategory = sub.name;
                    showSection('catalog');
                };
                subButtonsDiv.appendChild(btn);
            });
            subFilterDiv.appendChild(subButtonsDiv);
            productsDiv.appendChild(subFilterDiv);

            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'catalog-controls';
            controlsDiv.appendChild(createSortMenu());
            controlsDiv.appendChild(createPerPageMenu());
            const perPageHidden = document.createElement('input');
            perPageHidden.type = 'hidden';
            perPageHidden.id = 'per-page-hidden';
            perPageHidden.value = '20';
            controlsDiv.appendChild(perPageHidden);
            productsDiv.appendChild(controlsDiv);
        }

        const productList = document.createElement('div');
        productList.id = 'product-list';
        productList.className = 'product-grid';
        productsDiv.appendChild(productList);

        filteredProducts = products.filter(p => 
            p.category === category && 
            (!subcategory || p.subcategory === subcategory) &&
            p.visible
        );
        renderProducts(filteredProducts);
    }
    renderFilters();
    renderBreadcrumbs();
}

function createSortMenu() {
    const sortMenu = document.createElement('div');
    sortMenu.className = 'sort-menu';

    const sortBtn = document.createElement('button');
    sortBtn.className = 'sort-btn';
    sortBtn.textContent = 'Сортування ▼';
    sortBtn.onclick = () => {
        sortDropdown.style.display = sortDropdown.style.display === 'block' ? 'none' : 'block';
    };
    sortMenu.appendChild(sortBtn);

    const sortDropdown = document.createElement('div');
    sortDropdown.className = 'sort-dropdown';
    sortDropdown.style.display = 'none'; // Додаємо початковий стиль

    const sortOptions = [
        { text: 'Назва (А-Я)', value: 'name-asc' },
        { text: 'Назва (Я-А)', value: 'name-desc' },
        { text: 'Ціна (зростання)', value: 'price-asc' },
        { text: 'Ціна (спадання)', value: 'price-desc' },
        { text: 'Популярність', value: 'popularity' }
    ];
    sortOptions.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt.text;
        btn.onclick = () => {
            sortProducts(opt.value);
            sortDropdown.style.display = 'none';
        };
        sortDropdown.appendChild(btn);
    });
    sortMenu.appendChild(sortDropdown);

    return sortMenu;
}

function createPerPageMenu() {
    const perPageMenu = document.createElement('div');
    perPageMenu.className = 'per-page-menu';

    const perPageBtn = document.createElement('button');
    perPageBtn.className = 'per-page-btn';
    perPageBtn.textContent = 'Кількість ▼';
    perPageBtn.onclick = () => {
        perPageDropdown.style.display = perPageDropdown.style.display === 'block' ? 'none' : 'block';
    };
    perPageMenu.appendChild(perPageBtn);

    const perPageDropdown = document.createElement('div');
    perPageDropdown.className = 'per-page-dropdown';
    perPageDropdown.style.display = 'none'; // Додаємо початковий стиль

    [10, 20, 50].forEach(num => {
        const btn = document.createElement('button');
        btn.textContent = num;
        btn.onclick = () => {
            document.getElementById('per-page-hidden').value = num;
            renderProducts(isSearchActive ? searchResults : filteredProducts);
            perPageDropdown.style.display = 'none';
        };
        perPageDropdown.appendChild(btn);
    });
    perPageMenu.appendChild(perPageDropdown);

    return perPageMenu;
}

function renderFilters() {
    const filterList = document.getElementById('filter-list');
    if (!filterList || currentProduct) return;
    while (filterList.firstChild) filterList.removeChild(filterList.firstChild);

    const relevantProducts = filteredProducts;
    const brands = [...new Set(relevantProducts.map(p => p.brand).filter(Boolean))];
    const materials = [...new Set(relevantProducts.map(p => p.material).filter(Boolean))];
    
    // Статичний діапазон цін (можна змінювати тут)
    const priceRanges = ['0-3000', '3000-5000', '5000-7000', '7000-10000', '10000+'];

    if (brands.length > 0) {
        filterList.appendChild(createFilterBlock('Виробник', 'brand', brands));
    }
    if (materials.length > 0) {
        filterList.appendChild(createFilterBlock('Матеріал', 'material', materials));
    }
    filterList.appendChild(createFilterBlock('Ціна', 'price', priceRanges));
}

function createFilterBlock(title, name, options) {
    const block = document.createElement('div');
    block.className = 'filter-block';

    const h4 = document.createElement('h4');
    h4.textContent = title;
    block.appendChild(h4);

    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'filter-options';

    options.forEach(opt => {
        const label = document.createElement('label');
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = name;
        input.value = opt;
        input.onchange = () => filterProducts();
        label.appendChild(input);
        label.appendChild(document.createTextNode(` ${opt}`)); // Додаємо пробіл для кращого вигляду
        optionsDiv.appendChild(label);
    });

    block.appendChild(optionsDiv);
    return block;
}

function filterProducts() {
    let base = isSearchActive ? [...baseSearchResults] : products.filter(p => 
        p.category === currentCategory && 
        (!currentSubcategory || p.subcategory === currentSubcategory) &&
        p.visible
    );
    let filtered = [...base];
    let hasActiveFilters = false;

    ['brand', 'material', 'price'].forEach(name => {
        const checked = Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(input => input.value);
        if (checked.length > 0) {
            hasActiveFilters = true;
            if (name === 'price') {
                filtered = filtered.filter(p => {
                    const price = p.salePrice && new Date(p.saleEnd) > new Date() ? p.salePrice : p.price;
                    return checked.some(range => {
                        if (range.endsWith('+')) {
                            return price >= parseInt(range.replace('+', ''));
                        }
                        const [min, max] = range.split('-').map(Number);
                        return price >= min && price <= max;
                    });
                });
            } else {
                filtered = filtered.filter(p => checked.includes(p[name]));
            }
        }
    });

    if (!hasActiveFilters && isSearchActive) filtered = [...baseSearchResults];
    filteredProducts = filtered;
    if (isSearchActive) searchResults = filtered;
    renderProducts(filtered);
}

function sortProducts(sortType = 'name-asc') {
    let filtered = isSearchActive ? [...searchResults] : [...filteredProducts];
    if (sortType === 'name-asc') {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortType === 'name-desc') {
        filtered.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortType === 'price-asc') {
        filtered.sort((a, b) => {
            const priceA = (a.salePrice && new Date(a.saleEnd) > new Date() ? a.salePrice : a.price) || 0;
            const priceB = (b.salePrice && new Date(b.saleEnd) > new Date() ? b.salePrice : b.price) || 0;
            return priceA - priceB;
        });
    } else if (sortType === 'price-desc') {
        filtered.sort((a, b) => {
            const priceA = (a.salePrice && new Date(a.saleEnd) > new Date() ? a.salePrice : a.price) || 0;
            const priceB = (b.salePrice && new Date(b.saleEnd) > new Date() ? b.salePrice : b.price) || 0;
            return priceB - priceA;
        });
    } else if (sortType === 'popularity') {
        filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    }
    filteredProducts = filtered;
    if (isSearchActive) searchResults = filtered;
    renderProducts(filtered);
}

function renderProducts(filtered) {
    const productList = document.getElementById('product-list');
    if (!productList) return;

    // Очищаємо старі таймери перед рендерингом
    const existingTimers = productList.querySelectorAll('.sale-timer');
    existingTimers.forEach(timer => {
        if (timer.dataset.intervalId) {
            clearInterval(parseInt(timer.dataset.intervalId));
        }
    });

    while (productList.firstChild) productList.removeChild(productList.firstChild);
    document.querySelector('.filters').style.display = currentProduct ? 'none' : 'block';

    if (currentProduct) {
        showSection('product-details');
        return;
    }

    const perPage = parseInt(document.getElementById('per-page-hidden')?.value) || 20;
    const activeProducts = filtered.slice(0, perPage);
    const isHomePage = !currentCategory && !isSearchActive;

    if (activeProducts.length === 0) {
        const p = document.createElement('p');
        p.textContent = 'Нічого не знайдено';
        productList.appendChild(p);
        return;
    }

    activeProducts.forEach(product => {
        const productDiv = document.createElement('div');
        productDiv.className = 'product';

        const img = document.createElement('img');
        img.src = product.photos?.[0] || NO_IMAGE_URL;
        img.alt = product.name;
        img.loading = 'lazy';
        img.onclick = () => openProduct(product.id);
        productDiv.appendChild(img);

        const h3 = document.createElement('h3');
        h3.textContent = product.name;
        productDiv.appendChild(h3);

        const priceDiv = document.createElement('div');
        priceDiv.className = 'price';
        const isOnSale = product.salePrice && new Date(product.saleEnd) > new Date();
        if (product.type === 'mattresses' && product.sizes?.length > 0) {
            const minPrice = Math.min(...product.sizes.map(s => s.price));
            if (isHomePage || currentCategory) {
                const startSpan = document.createElement('span');
                startSpan.className = 'price-start';
                startSpan.textContent = 'Починаючи з ';
                priceDiv.appendChild(startSpan);
                const valueSpan = document.createElement('span');
                valueSpan.className = 'price-value';
                valueSpan.textContent = `${minPrice} грн`;
                priceDiv.appendChild(valueSpan);
            } else {
                const regularSpan = document.createElement('span');
                regularSpan.className = 'regular-price';
                regularSpan.textContent = `${minPrice} грн`;
                priceDiv.appendChild(regularSpan);
            }
        } else if (product.type === 'group' && product.groupProducts?.length > 0) {
            const groupPrices = product.groupProducts.map(id => {
                const p = products.find(p => p.id === id);
                return p ? (p.salePrice && new Date(p.saleEnd) > new Date() ? p.salePrice : p.price) : Infinity;
            });
            const minPrice = Math.min(...groupPrices);
            if (isHomePage || currentCategory) {
                const startSpan = document.createElement('span');
                startSpan.className = 'price-start';
                startSpan.textContent = 'Починаючи з ';
                priceDiv.appendChild(startSpan);
                const valueSpan = document.createElement('span');
                valueSpan.className = 'price-value';
                valueSpan.textContent = `${minPrice} грн`;
                priceDiv.appendChild(valueSpan);
            } else {
                const regularSpan = document.createElement('span');
                regularSpan.className = 'regular-price';
                regularSpan.textContent = `${minPrice} грн`;
                priceDiv.appendChild(regularSpan);
            }
        } else {
            if (isOnSale) {
                const saleSpan = document.createElement('span');
                saleSpan.className = 'sale-price';
                saleSpan.textContent = `${product.salePrice} грн`;
                priceDiv.appendChild(saleSpan);
                const regularSpan = document.createElement('s');
                regularSpan.className = 'regular-price';
                regularSpan.textContent = `${product.price} грн`;
                priceDiv.appendChild(regularSpan);
            } else {
                const regularSpan = document.createElement('span');
                regularSpan.className = 'regular-price';
                regularSpan.textContent = `${product.price} грн`;
                priceDiv.appendChild(regularSpan);
            }
        }
        productDiv.appendChild(priceDiv);

        if (isOnSale) {
            const timerDiv = document.createElement('div');
            timerDiv.className = 'sale-timer';
            timerDiv.id = `timer-${product.id}`;
            productDiv.appendChild(timerDiv);
            updateSaleTimer(product.id, product.saleEnd);
        }

        const btn = document.createElement('button');
        btn.className = 'buy-btn';
        if (product.type === 'mattresses' || product.type === 'group') {
            btn.textContent = 'Детальніше';
            btn.onclick = () => openProduct(product.id);
        } else {
            btn.textContent = 'Додати в кошик';
            btn.onclick = () => product.colors?.length > 1 ? (openProduct(product.id), showNotification('Виберіть потрібний колір', 'error')) : addToCartWithColor(product.id);
        }
        productDiv.appendChild(btn);

        productList.appendChild(productDiv);
    });
}

function renderProductDetails() {
    const productDetails = document.getElementById('product-details');
    if (!productDetails || !currentProduct) return;

    try {
        document.querySelectorAll('.sale-timer').forEach(timer => {
            if (timer.dataset.intervalId) {
                clearInterval(parseInt(timer.dataset.intervalId));
            }
        });
        while (productDetails.firstChild) productDetails.removeChild(productDetails.firstChild);

        const product = currentProduct;
        const isOnSale = product.salePrice && new Date(product.saleEnd) > new Date();
        let initialPrice = isOnSale ? product.salePrice : product.price || 0;

        const container = document.createElement('div');
        container.className = 'product-detail-container';

        if (parentGroupProduct) {
            const backButton = document.createElement('button');
            backButton.className = 'back-to-group-btn';
            backButton.textContent = `Назад до "${parentGroupProduct.name}"`;
            backButton.onclick = () => {
                currentProduct = parentGroupProduct;
                parentGroupProduct = null;
                saveToStorage('parentGroupProduct', null);
                showSection('product-details');
            };
            container.appendChild(backButton);
        }

        const topDiv = document.createElement('div');
        topDiv.className = 'product-detail-top';

        const leftDiv = document.createElement('div');
        leftDiv.className = 'product-detail-left';
        const mainImg = document.createElement('img');
        mainImg.src = product.photos?.[0] || NO_IMAGE_URL;
        mainImg.className = 'main-product-image';
        mainImg.alt = product.name;
        mainImg.loading = 'lazy';
        mainImg.onclick = () => openGallery(product.id);
        leftDiv.appendChild(mainImg);

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'thumbnail-container';
        product.photos?.forEach((photo, index) => {
            const thumbImg = document.createElement('img');
            thumbImg.src = photo;
            thumbImg.className = 'thumbnail';
            thumbImg.alt = `Мініатюра ${index + 1}`;
            thumbImg.loading = 'lazy';
            thumbImg.onclick = () => { mainImg.src = photo; openGallery(product.id, index); };
            thumbnailContainer.appendChild(thumbImg);
        });
        leftDiv.appendChild(thumbnailContainer);
        topDiv.appendChild(leftDiv);

        const rightDiv = document.createElement('div');
        rightDiv.className = 'product-detail-right';
        const h2 = document.createElement('h2');
        h2.textContent = product.name;
        rightDiv.appendChild(h2);

        const priceDiv = document.createElement('div');
        priceDiv.className = 'price product-detail-price';
        priceDiv.id = `price-${product.id}`;
        if (product.type === 'mattresses' && product.sizes?.length > 0) {
            const minPrice = Math.min(...product.sizes.map(s => s.price));
            const regularSpan = document.createElement('span');
            regularSpan.className = 'regular-price';
            regularSpan.textContent = `${minPrice} грн`;
            priceDiv.appendChild(regularSpan);
            const sizeP = document.createElement('p');
            sizeP.innerHTML = '<strong>Розміри:</strong> ';
            const sizeSelect = document.createElement('select');
            sizeSelect.id = `mattress-size-${product.id}`;
            sizeSelect.className = 'custom-select';
            sizeSelect.onchange = () => updateMattressPrice(product.id);
            product.sizes.forEach(s => {
                const option = document.createElement('option');
                option.value = s.name;
                option.setAttribute('data-price', s.price);
                option.textContent = `${s.name} - ${s.price} грн`;
                sizeSelect.appendChild(option);
            });
            sizeP.appendChild(sizeSelect);
            rightDiv.appendChild(priceDiv);
            rightDiv.appendChild(sizeP);
        } else if (product.type === 'group' && product.groupProducts?.length > 0) {
            const totalPriceDiv = document.createElement('div');
            totalPriceDiv.className = 'group-total-price';
            totalPriceDiv.textContent = 'Оберіть складові товари для розрахунку ціни';
            rightDiv.appendChild(totalPriceDiv);
        } else {
            if (isOnSale) {
                const saleSpan = document.createElement('span');
                saleSpan.className = 'sale-price';
                saleSpan.textContent = `${initialPrice} грн`;
                priceDiv.appendChild(saleSpan);
                const regularSpan = document.createElement('s');
                regularSpan.className = 'regular-price';
                regularSpan.textContent = `${product.price} грн`;
                priceDiv.appendChild(regularSpan);
            } else {
                const regularSpan = document.createElement('span');
                regularSpan.className = 'regular-price';
                regularSpan.textContent = `${initialPrice} грн`;
                priceDiv.appendChild(regularSpan);
            }
            rightDiv.appendChild(priceDiv);
            if (isOnSale) {
                const timerDiv = document.createElement('div');
                timerDiv.className = 'sale-timer';
                timerDiv.id = `timer-${product.id}`;
                rightDiv.appendChild(timerDiv);
                updateSaleTimer(product.id, product.saleEnd);
            }
        }

        if (product.type !== 'mattresses' && product.type !== 'group') {
            const qtyDiv = document.createElement('div');
            qtyDiv.className = 'quantity-selector';
            const minusBtn = document.createElement('button');
            minusBtn.className = 'quantity-btn';
            minusBtn.setAttribute('aria-label', 'Зменшити кількість');
            minusBtn.textContent = '-';
            minusBtn.onclick = () => changeQuantity(product.id, -1);
            qtyDiv.appendChild(minusBtn);
            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.id = `quantity-${product.id}`;
            qtyInput.min = '1';
            qtyInput.value = '1';
            qtyInput.readOnly = true;
            qtyDiv.appendChild(qtyInput);
            const plusBtn = document.createElement('button');
            plusBtn.className = 'quantity-btn';
            plusBtn.setAttribute('aria-label', 'Збільшити кількість');
            plusBtn.textContent = '+';
            plusBtn.onclick = () => changeQuantity(product.id, 1);
            qtyDiv.appendChild(plusBtn);
            rightDiv.appendChild(qtyDiv);
        }

        const buyBtn = document.createElement('button');
        buyBtn.className = 'buy-btn';
        buyBtn.textContent = 'Додати в кошик';
        buyBtn.onclick = () => addToCartWithColor(product.id);
        if (product.type !== 'group') rightDiv.appendChild(buyBtn);

        if (product.colors?.length >= 1) {
            const hasPhotos = product.colors.some(c => c.photo);
            if (hasPhotos) {
                const colorP = document.createElement('p');
                colorP.innerHTML = '<strong>Колір:</strong>';
                rightDiv.appendChild(colorP);
                const colorDiv = document.createElement('div');
                colorDiv.id = `color-options-${product.id}`;
                product.colors.forEach((c, i) => {
                    const circle = document.createElement('div');
                    circle.className = 'color-circle';
                    circle.style.background = c.photo ? `url(${c.photo})` : c.value;
                    circle.setAttribute('data-index', i);
                    circle.onclick = () => selectColor(product.id, i);
                    const span = document.createElement('span');
                    span.textContent = c.name;
                    circle.appendChild(span);
                    colorDiv.appendChild(circle);
                });
                rightDiv.appendChild(colorDiv);
            } else {
                const colorP = document.createElement('p');
                colorP.innerHTML = '<strong>Колір:</strong> ';
                const colorSelect = document.createElement('select');
                colorSelect.id = `color-select-${product.id}`;
                colorSelect.className = 'custom-select';
                colorSelect.onchange = () => updateColorPrice(product.id);
                product.colors.forEach((c, i) => {
                    const option = document.createElement('option');
                    option.value = i;
                    option.setAttribute('data-price-change', c.priceChange);
                    option.textContent = c.name;
                    colorSelect.appendChild(option);
                });
                colorP.appendChild(colorSelect);
                rightDiv.appendChild(colorP);
            }
        }

        const charDiv = document.createElement('div');
        charDiv.className = 'product-characteristics';
        charDiv.appendChild(createCharP('Виробник', product.brand || 'Не вказано'));
        charDiv.appendChild(createCharP('Матеріал', product.material || 'Не вказано'));
        if (product.widthCm) charDiv.appendChild(createCharP('Ширина', `${product.widthCm} см`));
        if (product.depthCm) charDiv.appendChild(createCharP('Глибина', `${product.depthCm} см`));
        if (product.heightCm) charDiv.appendChild(createCharP('Висота', `${product.heightCm} см`));
        if (product.lengthCm) charDiv.appendChild(createCharP('Довжина', `${product.lengthCm} см`));
        rightDiv.appendChild(charDiv);

        topDiv.appendChild(rightDiv);
        container.appendChild(topDiv);

        if (product.type === 'group' && product.groupProducts?.length > 0) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'group-products';
            const h3 = document.createElement('h3');
            h3.textContent = 'Складові товари';
            groupDiv.appendChild(h3);

            product.groupProducts.forEach(id => {
                const p = products.find(p => p.id === id);
                if (!p) {
                    console.warn(`Груповий товар з ID ${id} не знайдено`);
                    return;
                }
                const itemDiv = document.createElement('div');
                itemDiv.className = 'group-product-item';

                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = p.id;
                checkbox.onchange = () => updateGroupSelection(product.id);
                label.appendChild(checkbox);

                const img = document.createElement('img');
                img.src = p.photos?.[0] || NO_IMAGE_URL;
                img.alt = p.name;
                img.onclick = () => openProduct(p.id);
                label.appendChild(img);

                const infoDiv = document.createElement('div');
                infoDiv.className = 'group-product-info';

                const h4 = document.createElement('h4');
                h4.textContent = p.name;
                h4.onclick = () => openProduct(p.id);
                infoDiv.appendChild(h4);

                const priceDiv = document.createElement('div');
                priceDiv.className = 'price';
                const isOnSaleP = p.salePrice && new Date(p.saleEnd) > new Date();
                if (isOnSaleP) {
                    const saleSpan = document.createElement('span');
                    saleSpan.className = 'sale-price';
                    saleSpan.textContent = `${p.salePrice} грн`;
                    priceDiv.appendChild(saleSpan);
                    const regularSpan = document.createElement('s');
                    regularSpan.className = 'regular-price';
                    regularSpan.textContent = `${p.price} грн`;
                    priceDiv.appendChild(regularSpan);
                } else {
                    const regularSpan = document.createElement('span');
                    regularSpan.className = 'regular-price';
                    regularSpan.textContent = `${p.price} грн`;
                    priceDiv.appendChild(regularSpan);
                }
                infoDiv.appendChild(priceDiv);

                const dimensions = [];
                if (p.widthCm) dimensions.push({ label: 'шир.', value: `${p.widthCm} см` });
                if (p.depthCm) dimensions.push({ label: 'гл.', value: `${p.depthCm} см` });
                if (p.heightCm) dimensions.push({ label: 'вис.', value: `${p.heightCm} см` });
                if (p.lengthCm) dimensions.push({ label: 'дов.', value: `${p.lengthCm} см` });
                if (dimensions.length > 0) {
                    const dimensionsDiv = document.createElement('div');
                    dimensionsDiv.className = 'dimensions';
                    dimensionsDiv.textContent = 'Розміри: ';
                    dimensions.forEach((dim, index) => {
                        const dimensionItem = document.createElement('span');
                        dimensionItem.className = 'dimension-item';
                        const labelSpan = document.createElement('span');
                        labelSpan.className = 'label';
                        labelSpan.textContent = dim.label;
                        const valueSpan = document.createElement('span');
                        valueSpan.className = 'value';
                        valueSpan.textContent = dim.value;
                        dimensionItem.appendChild(labelSpan);
                        dimensionItem.appendChild(valueSpan);
                        dimensionsDiv.appendChild(dimensionItem);
                        if (index < dimensions.length - 1) {
                            dimensionsDiv.appendChild(document.createTextNode(', '));
                        }
                    });
                    infoDiv.appendChild(dimensionsDiv);
                }

                label.appendChild(infoDiv);
                itemDiv.appendChild(label);
                groupDiv.appendChild(itemDiv);
            });

            const groupBtn = document.createElement('button');
            groupBtn.className = 'buy-btn';
            groupBtn.textContent = 'Додати в кошик';
            groupBtn.onclick = () => addGroupToCart(product.id);
            groupDiv.appendChild(groupBtn);
            container.appendChild(groupDiv);
        }

        if (product.description && product.description.trim() !== '') {
            const descDiv = document.createElement('div');
            descDiv.className = 'product-detail-description';
            descDiv.appendChild(createCharP('Опис', product.description));
            container.appendChild(descDiv);
        }

        productDetails.appendChild(container);

        if (product.type === 'mattresses' && selectedMattressSizes[product.id]) {
            document.getElementById(`mattress-size-${product.id}`).value = selectedMattressSizes[product.id];
            updateMattressPrice(product.id);
        }
        if (product.colors?.length >= 1 && selectedColors[product.id] !== undefined) {
            if (product.colors.some(c => c.photo)) {
                document.querySelector(`#color-options-${product.id} .color-circle[data-index="${selectedColors[product.id]}"]`)?.classList.add('selected');
            } else {
                document.getElementById(`color-select-${product.id}`).value = selectedColors[product.id];
                updateColorPrice(product.id);
            }
        }
        renderBreadcrumbs();
    } catch (error) {
        console.error('Помилка в renderProductDetails:', error.message, error.stack);
        showNotification('Помилка при відображенні товару!', 'error');
        showSection('home');
    }
}

function createCharP(label, value) {
    const p = document.createElement('p');
    const span = document.createElement('span');
    span.style.whiteSpace = 'nowrap'; // Додаємо стиль безпосередньо
    span.innerHTML = `<strong>${label}:</strong> ${value}`; // Додано пробіл після двокрапки
    p.appendChild(span);
    return p;
}

function updateSaleTimer(productId, saleEnd) {
    const timerElement = document.getElementById(`timer-${productId}`);
    if (!timerElement || !saleEnd) return;
    const product = products.find(p => p.id === productId);
    if (!product) {
        timerElement.textContent = 'Товар недоступний';
        clearInterval(activeTimers.get(productId));
        activeTimers.delete(productId);
        return;
    }

    if (activeTimers.has(productId)) {
        clearInterval(activeTimers.get(productId));
        activeTimers.delete(productId);
    }

    const endDate = new Date(saleEnd);
    const update = () => {
        const now = new Date();
        const timeLeft = endDate - now;
        if (timeLeft <= 0) {
            timerElement.textContent = 'Акція закінчилася';
            product.salePrice = null;
            product.saleEnd = null;
            if (currentProduct && currentProduct.id === productId) {
                currentProduct = product;
                renderProductDetails();
            }
            if (document.getElementById('catalog').classList.contains('active')) {
                renderProducts(isSearchActive ? searchResults : filteredProducts);
            }
            updateCartPrices();
            saveCartToServer();
            renderCart();
            clearInterval(activeTimers.get(productId));
            activeTimers.delete(productId);
            return;
        }
        const days = Math.floor(timeLeft / (1000 * 60 * 60 * 24));
        const hours = Math.floor((timeLeft % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
        timerElement.textContent = `До кінця акції: ${days}д ${hours}г ${minutes}хв ${seconds}с`;
    };
    update();
    const intervalId = setInterval(update, 1000);
    timerElement.dataset.intervalId = intervalId;
    activeTimers.set(productId, intervalId);
}

function selectColor(productId, index) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    selectedColors[productId] = index;
    saveToStorage('selectedColors', selectedColors); // Зберігаємо вибір кольору
    const circles = document.querySelectorAll(`#color-options-${productId} .color-circle`);
    circles.forEach(c => c.classList.remove('selected'));
    circles[index].classList.add('selected');
    const priceElement = document.getElementById(`price-${productId}`);
    const basePrice = product.salePrice && new Date(product.saleEnd) > new Date() ? product.salePrice : product.price || 0;
    const newPrice = basePrice + (product.colors[index].priceChange || 0);
    const isOnSale = product.salePrice && new Date(product.saleEnd) > new Date();
    while (priceElement.firstChild) priceElement.removeChild(priceElement.firstChild);
    if (isOnSale) {
        const saleSpan = document.createElement('span');
        saleSpan.className = 'sale-price';
        saleSpan.textContent = `${newPrice} грн`;
        priceElement.appendChild(saleSpan);
        const regularSpan = document.createElement('s');
        regularSpan.className = 'regular-price';
        regularSpan.textContent = `${product.price + (product.colors[index].priceChange || 0)} грн`;
        priceElement.appendChild(regularSpan);
    } else {
        const regularSpan = document.createElement('span');
        regularSpan.className = 'regular-price';
        regularSpan.textContent = `${newPrice} грн`;
        priceElement.appendChild(regularSpan);
    }
}

function updateColorPrice(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) return;
    const select = document.getElementById(`color-select-${productId}`);
    const index = parseInt(select.value);
    selectedColors[productId] = index;
    saveToStorage('selectedColors', selectedColors); // Зберігаємо вибір кольору
    const priceElement = document.getElementById(`price-${productId}`);
    const basePrice = product.salePrice && new Date(product.saleEnd) > new Date() ? product.salePrice : product.price || 0;
    const newPrice = basePrice + (product.colors[index].priceChange || 0);
    const isOnSale = product.salePrice && new Date(product.saleEnd) > new Date();
    while (priceElement.firstChild) priceElement.removeChild(priceElement.firstChild);
    if (isOnSale) {
        const saleSpan = document.createElement('span');
        saleSpan.className = 'sale-price';
        saleSpan.textContent = `${newPrice} грн`;
        priceElement.appendChild(saleSpan);
        const regularSpan = document.createElement('s');
        regularSpan.className = 'regular-price';
        regularSpan.textContent = `${product.price + (product.colors[index].priceChange || 0)} грн`;
        priceElement.appendChild(regularSpan);
    } else {
        const regularSpan = document.createElement('span');
        regularSpan.className = 'regular-price';
        regularSpan.textContent = `${newPrice} грн`;
        priceElement.appendChild(regularSpan);
    }
}

function updateMattressPrice(productId) {
    const select = document.getElementById(`mattress-size-${productId}`);
    const priceElement = document.getElementById(`price-${productId}`);
    if (select && priceElement) {
        const selectedPrice = select.options[select.selectedIndex].getAttribute('data-price');
        while (priceElement.firstChild) priceElement.removeChild(priceElement.firstChild);
        const regularSpan = document.createElement('span');
        regularSpan.className = 'regular-price';
        regularSpan.textContent = `${selectedPrice} грн`;
        priceElement.appendChild(regularSpan);
        selectedMattressSizes[productId] = select.value;
        saveToStorage('selectedMattressSizes', selectedMattressSizes); // Зберігаємо вибір розміру
    }
}

function updateGroupSelection(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || product.type !== 'group') return;

    const checkboxes = document.querySelectorAll(`.group-product-item input[type="checkbox"]:checked`);
    let totalPrice = 0;
    checkboxes.forEach(cb => {
        const id = parseInt(cb.value);
        const p = products.find(p => p.id === id);
        if (p) {
            const price = p.salePrice && new Date(p.saleEnd) > new Date() ? p.salePrice : p.price || 0;
            totalPrice += price;
        }
    });

    const priceDiv = document.createElement('div');
    priceDiv.className = 'group-total-price';
    priceDiv.textContent = `Загальна ціна: ${totalPrice} грн`;
    
    const existingPriceDiv = document.querySelector('.group-total-price');
    if (existingPriceDiv) existingPriceDiv.remove();
    
    const groupDiv = document.querySelector('.group-products');
    if (groupDiv) groupDiv.insertBefore(priceDiv, groupDiv.querySelector('.buy-btn'));
}

async function addToCartWithColor(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || !product.id) {
        console.error('Товар не знайдено або відсутній ID:', productId);
        showNotification('Товар не знайдено!', 'error');
        return;
    }

    if (product.colors?.length > 1 && selectedColors[productId] === undefined) {
        showNotification('Будь ласка, виберіть колір!', 'error');
        return;
    }

    let price = 0;
    let colorName = '';

    if (product.type === 'group' && product.groupProducts?.length > 0) {
        const groupPrices = product.groupProducts.map(id => {
            const p = products.find(p => p.id === id);
            if (!p) {
                console.warn(`Груповий товар з ID ${id} не знайдено`);
                return 0;
            }
            const pPrice = (p.salePrice && new Date(p.saleEnd) > new Date() ? p.salePrice : p.price) || 0;
            if (pPrice === undefined || isNaN(pPrice)) {
                console.error(`Некоректна ціна для товару ID ${id}:`, p);
                return 0;
            }
            return pPrice;
        });
        price = groupPrices.reduce((sum, p) => sum + p, 0);
    } else {
        price = (product.salePrice && new Date(product.saleEnd) > new Date() ? product.salePrice : product.price) || 0;
        if (isNaN(price)) {
            console.error(`Некоректна ціна для товару ID ${productId}:`, product);
            price = 0;
        }
    }

    if (product.colors?.length > 0) {
        const colorIndex = selectedColors[productId] !== undefined ? selectedColors[productId] : 0;
        if (!product.colors[colorIndex]) {
            showNotification('Обраний колір більше недоступний!', 'error');
            delete selectedColors[productId];
            saveToStorage('selectedColors', selectedColors);
            return;
        }
        colorName = product.colors[colorIndex].name || 'Не вказано';
        if (product.type !== 'group') {
            price = (product.salePrice && new Date(product.saleEnd) > new Date() ? product.salePrice : product.price) || 0;
            if (isNaN(price)) price = 0;
            price += product.colors[colorIndex].priceChange || 0;
        }
    }

    if (product.type === 'mattresses') {
        const select = document.getElementById(`mattress-size-${productId}`);
        if (!select || !selectedMattressSizes[productId]) {
            showNotification('Будь ласка, виберіть розмір!', 'error');
            return;
        }
        const size = selectedMattressSizes[productId];
        const sizeData = product.sizes.find(s => s.name === size);
        if (!sizeData) {
            showNotification('Обраний розмір більше недоступний!', 'error');
            delete selectedMattressSizes[productId];
            saveToStorage('selectedMattressSizes', selectedMattressSizes);
            return;
        }
        if (sizeData.price === undefined || isNaN(sizeData.price)) {
            console.error(`Некоректна ціна для розміру ${size} товару ID ${productId}:`, sizeData);
            showNotification('Помилка: Некоректна ціна розміру товару!', 'error');
            return;
        }
        price = sizeData.price;
        colorName = colorName ? `${colorName} (${size})` : size;
    }

    const quantity = parseInt(document.getElementById(`quantity-${productId}`)?.value) || 1;
    if (isNaN(quantity) || quantity < 1) {
        console.error(`Некоректна кількість для товару ID ${productId}:`, quantity);
        showNotification('Помилка: Некоректна кількість!', 'error');
        return;
    }

    const cartItem = {
        id: product.id,
        name: product.name || 'Без назви',
        color: colorName || 'Не вказано',
        price: price,
        quantity: quantity,
        photo: product.photos?.[0] || NO_IMAGE_URL
    };

    console.log('Сформований cartItem:', cartItem);

    if (!cartItem.id || !cartItem.name || cartItem.price === undefined || isNaN(cartItem.price) || !cartItem.quantity) {
        console.error('Некоректні дані товару:', cartItem);
        showNotification('Помилка: Некоректні дані товару!', 'error');
        return;
    }

    const existingItemIndex = cart.findIndex(item => item.id === cartItem.id && item.color === cartItem.color);
    if (existingItemIndex > -1) cart[existingItemIndex].quantity += cartItem.quantity;
    else cart.push(cartItem);

    saveToStorage('cart', cart);
    updateCartCount();
    renderCart();
    showNotification(`${product.name} додано до кошика!`, 'success');

    try {
        await saveCartToServer();
    } catch (error) {
        console.error('Помилка синхронізації кошика з сервером:', error);
        showNotification('Дані збережено локально, але не вдалося синхронізувати з сервером.', 'warning');
    }
}

       async function addGroupToCart(productId) {
            const product = products.find(p => p.id === productId);
            if (!product || product.type !== 'group') return;
            const checkboxes = document.querySelectorAll(`.group-product-item input[type="checkbox"]:checked`);
            if (checkboxes.length === 0) {
                showNotification('Будь ласка, виберіть хоча б один товар!', 'error');
                return;
            }
            checkboxes.forEach(cb => {
                const id = parseInt(cb.value);
                const p = products.find(p => p.id === id);
                if (p) {
                    const price = p.salePrice && new Date(p.saleEnd) > new Date() ? p.salePrice : p.price || 0;
                    const cartItem = {
                        id: p.id,
                        name: p.name,
                        price,
                        quantity: 1,
                        photo: p.photos?.[0] || NO_IMAGE_URL
                    };
                    const existingItemIndex = cart.findIndex(item => item.id === cartItem.id && item.name === cartItem.name);
                    if (existingItemIndex > -1) cart[existingItemIndex].quantity += 1;
                    else cart.push(cartItem);
                }
            });
            saveToStorage('cart', cart);
            await saveCartToServer();
            updateCartCount();
            showNotification('Вибрані товари додано до кошика!', 'success');
            renderCart();
        }

function openProduct(productId) {
    const product = products.find(p => p.id === productId);
    if (!product) {
        showNotification('Товар не знайдено!', 'error');
        return;
    }
    if (typeof product.category !== 'string' || !product.category) {
        showNotification('Некоректна категорія товару!', 'error');
        showSection('home');
        return;
    }
    if (product.subcategory && typeof product.subcategory !== 'string') {
        showNotification('Некоректна підкатегорія товару!', 'error');
        showSection('home');
        return;
    }

    const subCategoryExists = product.subcategory
        ? categories.flatMap(cat => cat.subcategories || []).some(sub => sub.name === product.subcategory)
        : true;
    if (!subCategoryExists) {
        showNotification('Підкатегорія товару більше не існує!', 'error');
        showSection('home');
        return;
    }

    // Перевіряємо, чи існує елемент product-details
    const productDetailsSection = document.getElementById('product-details');
    if (!productDetailsSection) {
        console.error('Element with ID "product-details" not found in DOM');
        showNotification('Помилка: секція товару не знайдена!', 'error');
        showSection('home');
        return;
    }

    // Перевіряємо, чи цей товар є частиною групового товару
    const groupProduct = products.find(p => p.type === 'group' && p.groupProducts?.includes(productId));
    if (groupProduct && currentProduct?.type === 'group') {
        parentGroupProduct = currentProduct;
        saveToStorage('parentGroupProduct', parentGroupProduct);
    } else {
        parentGroupProduct = null;
        saveToStorage('parentGroupProduct', null);
    }

    currentProduct = product;
    currentCategory = product.category;
    currentSubcategory = product.subcategory;
    isSearchActive = false;
    searchResults = [];
    baseSearchResults = [];
    showSection('product-details');
}

function searchProducts() {
    const searchInput = document.getElementById('search');
    const query = searchInput.value.toLowerCase().trim();
    if (!query) {
        showNotification('Введіть запит для пошуку!', 'error');
        return;
    }
    searchResults = products.filter(p => 
        p.visible && 
        (p.name.toLowerCase().includes(query) || 
        (p.brand || '').toLowerCase().includes(query))
    );
    baseSearchResults = [...searchResults];
    isSearchActive = true;
    currentProduct = null;
    currentCategory = null;
    currentSubcategory = null;
    isSearchPending = true;

    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    document.getElementById('catalog').classList.add('active');
    renderCatalog();
    window.location.hash = '#catalog';
    isSearchPending = false; // Переміщено сюди
}

// Нова функція для оновлення цін у кошику
async function updateCartPrices() {
    cart.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) return;
        const isOnSale = product.salePrice && new Date(product.saleEnd) > new Date();
        const colorIndex = selectedColors[item.id] || 0;
        const colorPriceChange = product.colors?.[colorIndex]?.priceChange || 0;

        if (product.type === 'mattresses' && selectedMattressSizes[item.id]) {
            item.price = product.sizes.find(s => s.name === selectedMattressSizes[item.id])?.price || product.price;
        } else if (!isOnSale && product.salePrice) {
            // Акція закінчилася
            item.price = product.price + colorPriceChange;
        } else {
            item.price = (isOnSale ? product.salePrice : product.price) + colorPriceChange;
        }
    });
    saveToStorage('cart', cart);
}

async function renderCart() {
    const cartItems = document.getElementById('cart-items');
    const cartContent = document.getElementById('cart-content');
    if (!cartItems || !cartContent) return;

    const existingTimers = cartItems.querySelectorAll('.sale-timer');
    existingTimers.forEach(timer => {
        if (timer.dataset.intervalId) {
            clearInterval(parseInt(timer.dataset.intervalId));
        }
    });
    while (cartItems.firstChild) cartItems.removeChild(cartItems.firstChild);
    while (cartContent.firstChild) cartContent.removeChild(cartContent.firstChild);

    if (cart.length === 0) {
        const p = document.createElement('p');
        p.className = 'empty-cart';
        p.textContent = 'Кошик порожній';
        cartContent.appendChild(p);
        renderBreadcrumbs();
        updateCartCount();
        return;
    }

    await updateCartPrices(); // Оновлюємо ціни перед рендерингом

    cart = cart.filter(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) {
            console.warn(`Товар з ID ${item.id} не знайдено, видаляємо з кошика`);
            return false;
        }
        return true;
    });
    saveToStorage('cart', cart);

    cart.forEach((item, index) => {
        const product = products.find(p => p.id === item.id);
        const itemDiv = document.createElement('div');
        itemDiv.className = 'cart-item';

        const img = document.createElement('img');
        img.src = item.photo;
        img.className = 'cart-item-image';
        img.alt = item.name;
        img.loading = 'lazy';
        img.onclick = () => openProduct(item.id);
        itemDiv.appendChild(img);

        const span = document.createElement('span');
        span.textContent = `${item.name}${item.color && item.color !== 'Не вказано' ? ` (${item.color})` : ''} - ${item.price * item.quantity} грн`;
        span.onclick = () => openProduct(item.id);
        itemDiv.appendChild(span);

        const qtyDiv = document.createElement('div');
        qtyDiv.className = 'quantity-selector';
        const minusBtn = document.createElement('button');
        minusBtn.className = 'quantity-btn';
        minusBtn.setAttribute('aria-label', 'Зменшити кількість');
        minusBtn.textContent = '-';
        minusBtn.onclick = () => updateCartQuantity(index, -1);
        qtyDiv.appendChild(minusBtn);
        const qtyInput = document.createElement('input');
        qtyInput.type = 'number';
        qtyInput.id = `cart-quantity-${index}`;
        qtyInput.min = '1';
        qtyInput.value = item.quantity;
        qtyInput.readOnly = true;
        qtyDiv.appendChild(qtyInput);
        const plusBtn = document.createElement('button');
        plusBtn.className = 'quantity-btn';
        plusBtn.setAttribute('aria-label', 'Збільшити кількість');
        plusBtn.textContent = '+';
        plusBtn.onclick = () => updateCartQuantity(index, 1);
        qtyDiv.appendChild(plusBtn);
        itemDiv.appendChild(qtyDiv);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'remove-btn';
        removeBtn.setAttribute('aria-label', 'Видалити товар');
        removeBtn.textContent = 'Видалити';
        removeBtn.onclick = () => promptRemoveFromCart(index);
        itemDiv.appendChild(removeBtn);

        const isOnSale = product.salePrice && new Date(product.saleEnd) > new Date();
        if (isOnSale) {
            const timerDiv = document.createElement('div');
            timerDiv.className = 'sale-timer';
            timerDiv.id = `timer-${item.id}`;
            itemDiv.appendChild(timerDiv);
            updateSaleTimer(item.id, product.saleEnd);
        }

        cartItems.appendChild(itemDiv);
    });

    const totalP = document.createElement('p');
    totalP.className = 'cart-total';
    totalP.textContent = `Загальна сума: ${cart.reduce((sum, item) => sum + item.price * item.quantity, 0)} грн`;
    cartContent.appendChild(totalP);

    const h3 = document.createElement('h3');
    h3.textContent = 'Оформлення замовлення';
    cartContent.appendChild(h3);

    const form = document.createElement('div');
    form.id = 'order-form';
    form.className = 'order-form';
    orderFields.forEach(f => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'form-group';

        const label = document.createElement('label');
        label.htmlFor = `order-${f.name}`;
        label.textContent = `${f.label}${f.required ? ' *' : ''}`;
        groupDiv.appendChild(label);

        if (f.type === 'select') {
            const select = document.createElement('select');
            select.id = `order-${f.name}`;
            select.className = 'order-input custom-select';
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = `Виберіть ${f.label.toLowerCase()}`;
            select.appendChild(defaultOption);
            f.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                select.appendChild(option);
            });
            groupDiv.appendChild(select);
        } else {
            const input = document.createElement('input');
            input.type = f.type;
            input.id = `order-${f.name}`;
            input.className = 'order-input';
            input.required = f.required;
            groupDiv.appendChild(input);
        }
        form.appendChild(groupDiv);
    });

    const submitBtn = document.createElement('button');
    submitBtn.className = 'submit-order';
    submitBtn.textContent = 'Оформити замовлення';
    submitBtn.onclick = () => submitOrder();
    form.appendChild(submitBtn);
    cartContent.appendChild(form);

    renderBreadcrumbs();
    updateCartCount();
}

        function promptRemoveFromCart(index) {
            removeCartIndex = index;
            const modal = document.getElementById('confirm-modal');
            if (modal) {
                modal.style.display = 'flex';
                modal.classList.add('active');
            }
        }

async function confirmRemoveFromCart() {
    if (removeCartIndex >= 0 && removeCartIndex < cart.length) {
        const removedItem = cart[removeCartIndex];
        cart.splice(removeCartIndex, 1);
        
        // Зберігаємо локально та оновлюємо інтерфейс
        saveToStorage('cart', cart);
        updateCartCount();
        await renderCart();
        showNotification(`${removedItem.name} видалено з кошика!`, 'success');
        
        // Синхронізуємо з сервером у фоновому режимі
        try {
            await saveCartToServer();
        } catch (error) {
            console.error('Помилка синхронізації кошика з сервером:', error);
            showNotification('Дані збережено локально, але не вдалося синхронізувати з сервером.', 'warning');
        }
    } else {
        showNotification('Помилка при видаленні товару!', 'error');
    }
    closeConfirmModal();
}

        function closeConfirmModal() {
            const modal = document.getElementById('confirm-modal');
            if (modal) {
                modal.style.display = 'none';
                modal.classList.remove('active');
            }
            removeCartIndex = -1;
        }

async function updateCartQuantity(index, change) {
    if (cart[index]) {
        cart[index].quantity = Math.max(1, cart[index].quantity + change);
        
        // Зберігаємо локально та оновлюємо інтерфейс
        saveToStorage('cart', cart);
        updateCartCount();
        renderCart();
        
        // Синхронізуємо з сервером у фоновому режимі
        try {
            await saveCartToServer();
        } catch (error) {
            console.error('Помилка синхронізації кошика з сервером:', error);
            showNotification('Дані збережено локально, але не вдалося синхронізувати з сервером.', 'warning');
        }
    }
}

        function updateCartCount() {
            const count = cart.reduce((sum, item) => sum + item.quantity, 0);
            const cartCount = document.querySelector('.cart-count');
            if (cartCount) {
                cartCount.textContent = count > 0 ? count : '0';
                cartCount.style.display = 'inline';
            }
        }

async function submitOrder() {
    const customer = orderFields.reduce((acc, field) => {
        const input = document.getElementById(`order-${field.name}`);
        acc[field.name] = input ? input.value.trim() : '';
        return acc;
    }, {});

    if (orderFields.some(f => f.required && !customer[f.name])) {
        showNotification('Будь ласка, заповніть усі обов\'язкові поля!', 'error');
        return;
    }

    const nameRegex = /^[А-ЯҐЄІЇа-яґєії]{2,}$/;
    if (!nameRegex.test(customer.name)) {
        showNotification('Ім\'я має містити щонайменше 2 українські літери!', 'error');
        return;
    }
    if (!nameRegex.test(customer.surname)) {
        showNotification('Прізвище має містити щонайменше 2 українські літери!', 'error');
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (customer.email && !emailRegex.test(customer.email)) {
        showNotification('Введіть коректну email-адресу!', 'error');
        return;
    }

    if (customer.address.length < 6) {
        showNotification('Адреса доставки має містити щонайменше 6 символів!', 'error');
        return;
    }

    const phoneRegex = /^(0\d{9})$|^(\+?\d{10,15})$/;
    if (!phoneRegex.test(customer.phone)) {
        showNotification('Номер телефону має бути у форматі 0XXXXXXXXX або +380XXXXXXXXX (10-15 цифр)!', 'error');
        return;
    }

    if (!confirm('Підтвердити оформлення замовлення?')) return;

    if (!cart || cart.length === 0) {
        showNotification('Кошик порожній!', 'error');
        return;
    }

    await updateCartPrices(); // Оновлюємо ціни перед відправкою

    cart = cart.filter(item => {
        const isValid = item && 
            typeof item.id === 'number' && 
            !isNaN(item.id) && 
            item.name && 
            typeof item.quantity === 'number' && 
            typeof item.price === 'number';
        if (!isValid) {
            console.warn('Елемент кошика видалено перед оформленням замовлення через некоректні дані:', item);
        }
        return isValid;
    });

    if (cart.length === 0) {
        showNotification('Кошик містить лише некоректні товари! Очистіть кошик і додайте товари знову.', 'error');
        return;
    }

    const detailedItems = cart.map(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) {
            console.warn(`Товар з ID ${item.id} не знайдено`);
            return null;
        }

        const itemId = Number(item.id);
        if (isNaN(itemId)) {
            console.error(`Некоректний ID товару: ${item.id}`);
            return null;
        }

        const isOnSale = product.salePrice && new Date(product.saleEnd) > new Date();
        let itemPrice = isOnSale ? product.salePrice : product.price || 0;

        const itemData = {
            id: itemId,
            name: product.name,
            brand: product.brand || 'Не вказано',
            color: item.color || 'Не вказано',
            quantity: item.quantity,
            price: item.price,
            totalPrice: item.price * item.quantity
        };

        if (product.type === 'mattresses' && selectedMattressSizes[item.id]) {
            itemData.size = selectedMattressSizes[item.id];
            const sizeData = product.sizes.find(s => s.name === itemData.size);
            if (sizeData) {
                itemData.price = sizeData.price;
                itemData.totalPrice = sizeData.price * item.quantity;
            }
        }

        if (product.type === 'group' && product.groupProducts?.length > 0) {
            itemData.groupItems = product.groupProducts.map(groupProductId => {
                const groupProduct = products.find(p => p.id === groupProductId);
                if (!groupProduct) {
                    console.warn(`Груповий товар з ID ${groupProductId} не знайдено`);
                    return null;
                }
                const groupIsOnSale = groupProduct.salePrice && new Date(groupProduct.saleEnd) > new Date();
                const groupPrice = groupIsOnSale ? groupProduct.salePrice : groupProduct.price || 0;
                return {
                    id: Number(groupProduct.id),
                    name: groupProduct.name,
                    brand: groupProduct.brand || 'Не вказано',
                    price: groupPrice,
                    totalPrice: groupPrice * item.quantity
                };
            }).filter(item => item !== null);

            itemData.price = itemData.groupItems.reduce((sum, groupItem) => sum + groupItem.price, 0);
            itemData.totalPrice = itemData.price * item.quantity;
        }

        return itemData;
    }).filter(item => item !== null);

    if (!detailedItems || detailedItems.length === 0) {
        showNotification('Помилка: немає товарів для замовлення!', 'error');
        return;
    }

    const orderData = {
        date: new Date().toISOString(),
        status: 'Нове замовлення',
        total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
        customer,
        items: detailedItems
    };

    console.log('Дані замовлення перед відправкою:', JSON.stringify(orderData, null, 2));

    try {
        const csrfToken = localStorage.getItem('csrfToken');
        if (!csrfToken) {
            console.warn('CSRF-токен відсутній, замовлення збережено локально');
            orders.push(orderData);
            if (orders.length > 5) orders = orders.slice(-5);
            saveToStorage('orders', orders);
            cart = [];
            saveToStorage('cart', cart);
            const newCartId = 'cart-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('cartId', newCartId);
            selectedColors = {};
            selectedMattressSizes = {};
            saveToStorage('selectedColors', selectedColors);
            saveToStorage('selectedMattressSizes', selectedMattressSizes);
            updateCartCount();
            showNotification('Замовлення збережено локально через відсутність CSRF-токена. Зв’яжіться з підтримкою.', 'warning');
            showSection('home');
            return;
        }
        const response = await fetch(`${BASE_URL}/api/orders`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            body: JSON.stringify(orderData)
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Помилка сервера: ${response.status}, Тіло: ${errorText}`);
            throw new Error('Не вдалося оформити замовлення');
        }

        cart = [];
        saveToStorage('cart', cart);
        const newCartId = 'cart-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('cartId', newCartId);
        selectedColors = {};
        selectedMattressSizes = {};
        saveToStorage('selectedColors', selectedColors);
        saveToStorage('selectedMattressSizes', selectedMattressSizes);
        updateCartCount();
        await saveCartToServer();
        showNotification('Замовлення оформлено! Дякуємо!', 'success');
        showSection('home');
    } catch (error) {
        console.error('Помилка при оформленні замовлення:', error);
        orders.push(orderData);
        if (orders.length > 5) orders = orders.slice(-5);
        saveToStorage('orders', orders);
        showNotification('Не вдалося оформити замовлення! Дані збережено локально.', 'warning');
    }
}

function updateHeader() {
    document.title = settings.name || 'Меблевий магазин';
    const logo = document.getElementById('logo');
    if (logo) {
        const logoUrl = settings.logo || NO_IMAGE_URL;
        console.log('Оновлення логотипу:', logoUrl);
        logo.style.backgroundImage = `url(${logoUrl})`;
        logo.style.width = `${settings.logoWidth || 150}px`;
        logo.style.height = 'auto';
        // Додаємо обробник помилок
        const img = new Image();
        img.src = logoUrl;
        img.onerror = () => {
            console.warn('Помилка завантаження логотипу, використовуємо NO_IMAGE_URL');
            logo.style.backgroundImage = `url(${NO_IMAGE_URL})`;
        };
    }
    const logoText = document.getElementById('logo-text');
    if (logoText) logoText.textContent = settings.name || '';
    const phones = document.getElementById('phones');
    if (phones) phones.textContent = settings.contacts?.phones || '';
}

function renderContacts() {
    const contactInfo = document.getElementById('contact-info');
    const socials = document.getElementById('socials');
    if (!contactInfo || !socials) return;
    while (contactInfo.firstChild) contactInfo.removeChild(contactInfo.firstChild);
    while (socials.firstChild) socials.removeChild(socials.firstChild);

    contactInfo.appendChild(createCharP('Телефони', settings.contacts?.phones || 'Немає даних'));
    contactInfo.appendChild(createCharP('Адреси', settings.contacts?.addresses || 'Немає даних'));
    contactInfo.appendChild(createCharP('Графік роботи', settings.contacts?.schedule || 'Немає даних'));

    if (settings.showSocials && settings.socials?.length > 0) {
        const h3 = document.createElement('h3');
        h3.textContent = 'Ми в соціальних мережах';
        socials.appendChild(h3);
        settings.socials.forEach(s => {
            const a = document.createElement('a');
            a.href = s.url || '#';
            a.target = '_blank';
            a.className = 'social-link';
            a.textContent = `${s.icon || '🔗'} ${s.name || 'Посилання'}`;
            socials.appendChild(a);
        });
    }
    renderBreadcrumbs();
}

function renderAbout() {
    const aboutText = document.getElementById('about-text');
    if (!aboutText) return;
    while (aboutText.firstChild) aboutText.removeChild(aboutText.firstChild);

    const h2 = document.createElement('h2');
    h2.textContent = 'Про нас';
    aboutText.appendChild(h2);
    const p = document.createElement('p');
    p.innerHTML = settings.about || 'Інформація про нас відсутня';
    aboutText.appendChild(p);
    renderBreadcrumbs();
}

function renderSlideshow() {
    const slideshow = document.getElementById('slideshow');
    if (!slideshow || !settings.showSlides || slides.length === 0) {
        if (slideshow) slideshow.style.display = 'none';
        clearInterval(slideInterval);
        return;
    }
    slideshow.style.display = 'block';
    while (slideshow.firstChild) slideshow.removeChild(slideshow.firstChild);

    slides.forEach((slide, i) => {
        const slideDiv = document.createElement('div');
        slideDiv.className = `slide${i === currentSlideIndex ? ' active' : ''}`;

        const img = document.createElement('img');
        img.src = slide.url || NO_IMAGE_URL;
        img.alt = slide.name || `Слайд ${i + 1}`;
        img.loading = 'lazy';
        slideDiv.appendChild(img);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'slide-content';
        const h2 = document.createElement('h2');
        h2.textContent = slide.title || '';
        contentDiv.appendChild(h2);
        const p = document.createElement('p');
        p.textContent = slide.text || '';
        contentDiv.appendChild(p);
        const a = document.createElement('a');
        a.href = slide.link || '#';
        a.textContent = slide.linkText || 'Дізнатися більше';
        contentDiv.appendChild(a);
        slideDiv.appendChild(contentDiv);

        slideshow.appendChild(slideDiv);
    });

    const navDiv = document.createElement('div');
    navDiv.className = 'slide-nav';
    slides.forEach((_, i) => {
        const btn = document.createElement('button');
        btn.className = `slide-btn${i === currentSlideIndex ? ' active' : ''}`;
        btn.onclick = () => { currentSlideIndex = i; renderSlideshow(); startSlideshow(); };
        navDiv.appendChild(btn);
    });
    slideshow.appendChild(navDiv);

    const prevBtn = document.createElement('button');
    prevBtn.className = 'slide-arrow slide-arrow-prev';
    prevBtn.setAttribute('aria-label', 'Попередній слайд');
    prevBtn.textContent = '◄';
    prevBtn.onclick = () => { currentSlideIndex = (currentSlideIndex - 1 + slides.length) % slides.length; renderSlideshow(); startSlideshow(); };
    slideshow.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'slide-arrow slide-arrow-next';
    nextBtn.setAttribute('aria-label', 'Наступний слайд');
    nextBtn.textContent = '►';
    nextBtn.onclick = () => { currentSlideIndex = (currentSlideIndex + 1) % slides.length; renderSlideshow(); startSlideshow(); };
    slideshow.appendChild(nextBtn);

    startSlideshow();
}

        function startSlideshow() {
            if (!settings.showSlides || slides.length <= 1) return;
            clearInterval(slideInterval);
            slideInterval = setInterval(() => {
                currentSlideIndex = (currentSlideIndex + 1) % slides.length;
                renderSlideshow();
            }, settings.slideInterval || 3000);
        }

function openGallery(productId, index = 0) {
    const product = products.find(p => p.id === productId);
    if (!product || !product.photos || product.photos.length === 0) return;
    currentGalleryImages = product.photos;
    currentGalleryIndex = index;
    const modal = document.getElementById('gallery-modal');
    const img = document.getElementById('gallery-image');
    if (modal && img) {
        img.src = currentGalleryImages[currentGalleryIndex];
        modal.style.display = 'flex';
        modal.classList.add('active');
    }
}

function closeGallery() {
    const modal = document.getElementById('gallery-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
}

function prevGalleryImage() {
    if (currentGalleryImages.length === 0) return;
    currentGalleryIndex = (currentGalleryIndex - 1 + currentGalleryImages.length) % currentGalleryImages.length;
    const img = document.getElementById('gallery-image');
    if (img) img.src = currentGalleryImages[currentGalleryIndex];
}

function nextGalleryImage() {
    if (currentGalleryImages.length === 0) return;
    currentGalleryIndex = (currentGalleryIndex + 1) % currentGalleryImages.length;
    const img = document.getElementById('gallery-image');
    if (img) img.src = currentGalleryImages[currentGalleryIndex];
}

function showNotification(message, type = 'info') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

function changeQuantity(productId, change) {
    const qtyInput = document.getElementById(`quantity-${productId}`);
    if (qtyInput) {
        let qty = parseInt(qtyInput.value) + change;
        if (qty < 1) qty = 1;
        qtyInput.value = qty;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('Initializing application...');
        await initializeData();
        updateHeader();
        updateCartCount();
        const catalogToggle = document.getElementById('catalog-toggle');
        const catalogDropdown = document.getElementById('catalog-dropdown');
        if (catalogToggle && catalogDropdown) {
            catalogToggle.addEventListener('click', (e) => {
                e.preventDefault();
                catalogDropdown.classList.toggle('active');
            });
        }
        const path = window.location.pathname.slice(1);
        console.log('Processing path:', path);
        if (path) {
            const parts = path.split('/').filter(p => p);
            if (parts[0] === 'cart') {
                showSection('cart');
            } else if (parts[0] === 'contacts') {
                showSection('contacts');
            } else if (parts[0] === 'about') { // Виправлено: parts[0] замість parts(")
                showSection('about');
            } else if (parts[0] === 'catalog') {
                showSection('catalog');
            } else {
                const cat = categories.find(
                    (c) => transliterate(c.name.replace('ь', '')) === parts[0]
                );
                if (cat) {
                    currentCategory = cat.name;
                    if (parts[1]) {
                        const subCat = cat.subcategories?.find(
                            (sc) =>
                                transliterate(sc.name.replace('ь', '')) === parts[1]
                        );
                        if (subCat) currentSubcategory = subCat.name;
                        if (parts[2]) {
                            currentProduct = products.find(
                                (p) => p.slug === parts[2]
                            );
                            if (currentProduct) {
                                showSection('product-details');
                                return;
                            }
                        }
                    }
                    showSection('catalog');
                } else {
                    showSection('home');
                    showNotification('Сторінку не знайдено!', 'error');
                }
            }
        } else {
            showSection('home');
        }
        const searchInput = document.getElementById('search');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') searchProducts();
            });
        }
        console.log('Application initialized successfully');
    } catch (error) {
        console.error('Error in DOMContentLoaded:', error);
        showNotification('Помилка ініціалізації сторінки!', 'error');
    }
});