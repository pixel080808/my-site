let cart = [];
let products = [];
let categories = [];
let orders = [];
let slides = [];
let filters = [];
let orderFields = [];
let settings = {};
let currentProduct = null;
let currentCategory = null;
let currentSubcategory = null;
let currentSort = '';
let perPage = 20;
let currentPage = 1;
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
let displayedProducts = 20; // Початкова кількість товарів
const productsPerLoad = 20; // Кількість товарів для завантаження
const activeTimers = new Map();
let parentGroupProduct = null;
const BASE_URL = window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://mebli.onrender.com';
const NO_IMAGE_URL = 'https://placehold.co/300x200?text=Фото+відсутнє';

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

const debouncedRenderCart = debounce(renderCart, 100);

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
        const data = JSON.parse(decompressed) || defaultValue;
        if (key === 'products') {
            const validCategories = categories.map(cat => cat.name);
            const validSubcategories = categories.flatMap(cat => (cat.subcategories || []).map(sub => sub.name));
            return data.map(product => {
                if (product.subcategory && !validSubcategories.includes(product.subcategory)) {
                    console.warn(`Очищаємо невалідну підкатегорію ${product.subcategory} для товару ${product.name}`);
                    return { ...product, subcategory: null };
                }
                return product;
            });
        }
        return data;
    } catch (e) {
        console.error(`Помилка парсингу ${key}:`, e);
        localStorage.removeItem(key);
        return defaultValue;
    }
}

function saveToStorage(key, value) {
    try {
        const testStringify = JSON.stringify(value);
        if (typeof testStringify !== 'string') {
            console.error(`Помилка: Дані для ${key} не можуть бути серіалізовані в JSON`);
            return;
        }
        const compressed = LZString.compressToUTF16(testStringify);
        if (!compressed) {
            console.error(`Помилка стиснення даних для ${key}`);
            return;
        }
        localStorage.setItem(key, compressed);
    } catch (e) {
        console.error(`Помилка збереження ${key}:`, e);
        if (e.name === 'QuotaExceededError') {
            localStorage.clear();
            const compressed = LZString.compressToUTF16(JSON.stringify(value));
            localStorage.setItem(key, compressed);
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
            cart = loadFromStorage('cart', []);
            saveToStorage('cart', cart);
            updateCartCount();
            return;
        }

        const response = await fetchWithRetry(`${BASE_URL}/api/cart?cartId=${cartId}`, 3, 1000);
        if (!response) {
            console.error('Відповідь від сервера відсутня для cartId:', cartId);
            throw new Error('Не вдалося отримати відповідь від сервера');
        }

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Помилка сервера: ${response.status}, Тіло: ${errorText}`);
            throw new Error(`Помилка сервера: ${response.status}`);
        }

        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
            const errorText = await response.text();
            console.error(`Сервер повернув не JSON: ${contentType}, Тіло: ${errorText}`);
            throw new Error('Некоректний формат відповіді сервера');
        }

        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
            cart = data.map(item => ({
                id: Number(item.id),
                name: item.name || '',
                quantity: item.quantity || 1,
                price: item.price || 0,
                photo: item.photo || '',
                color: item.color || null
            }));
        } else {
            cart = loadFromStorage('cart', []);
            console.log('Сервер повернув порожній кошик, використовуємо локальні дані:', cart);
            if (cart.length > 0) {
                await saveCartToServer();
            }
        }

        cart = cart.filter(item => {
            const isValid = item && typeof item.id === 'number' && item.name && typeof item.quantity === 'number' && typeof item.price === 'number';
            if (!isValid) {
                console.warn('Елемент кошика видалено через некоректні дані:', item);
            }
            return isValid;
        });

        saveToStorage('cart', cart);
        updateCartCount();
    } catch (e) {
        console.error('Помилка завантаження кошика:', e);
        cart = loadFromStorage('cart', []);
        cart = cart.filter(item => {
            const isValid = item && typeof item.id === 'number' && item.name && typeof item.quantity === 'number' && typeof item.price === 'number';
            if (!isValid) {
                console.warn('Елемент кошика видалено через некоректні дані:', item);
            }
            return isValid;
        });
        saveToStorage('cart', cart);
        showNotification('Не вдалося завантажити кошик із сервера. Використано локальні дані.', 'warning');
        try {
            await triggerCleanupOldCarts();
        } catch (cleanupError) {
            console.error('Помилка очищення старих кошиків:', cleanupError);
        }
        updateCartCount();
    }
}

async function saveCartToServer() {
    let cartItems = loadFromStorage('cart', []);

    if (!Array.isArray(cartItems)) {
        console.warn('Кошик у localStorage не є масивом, скидаємо');
        cartItems = [];
        saveToStorage('cart', cartItems);
    }

    const filteredCartItems = cartItems
        .map(item => {
            if (typeof item.id !== 'number' || isNaN(item.id)) {
                console.warn('Некоректний id в елементі кошика:', item);
                return null;
            }
            const product = products.find(p => p.id === item.id);
            if (!product) {
                console.warn('Продукт не знайдено для id:', item.id);
                return null;
            }
            let colorData = null;
            if (item.color && item.color.name) {
                colorData = {
                    name: item.color.name || 'Не вказано',
                    value: item.color.value || item.color.name || '',
                    priceChange: item.color.priceChange || 0,
                    photo: item.color.photo || ''
                };
                if (item.color.size) {
                    colorData.size = item.color.size;
                }
            }
            return {
                id: Number(item.id),
                name: item.name || '',
                quantity: Number(item.quantity) || 1,
                price: Number(item.price) || 0,
                photo: item.photo || '',
                color: colorData
            };
        })
        .filter(item => item !== null && item.name && item.quantity > 0 && item.price >= 0);

    console.log('Дані кошика перед відправкою:', JSON.stringify(filteredCartItems, null, 2));

    if (!BASE_URL) {
        console.error('BASE_URL не визначено');
        showNotification('Помилка: сервер недоступний. Дані збережено локально.', 'error');
        debouncedRenderCart();
        return;
    }

    let cartId = localStorage.getItem('cartId');
    if (!cartId) {
        cartId = 'cart-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('cartId', cartId);
        console.log('Згенеровано новий cartId:', cartId);
    }

    let csrfToken = localStorage.getItem('csrfToken');
    if (!csrfToken) {
        console.warn('CSRF-токен відсутній, намагаємося отримати новий');
        csrfToken = await fetchCsrfToken();
        if (!csrfToken) {
            console.error('Не вдалося отримати CSRF-токен');
            showNotification('Дані збережено локально, але не вдалося синхронізувати з сервером.', 'warning');
            debouncedRenderCart();
            return;
        }
    }

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            const response = await fetch(`${BASE_URL}/api/cart?cartId=${encodeURIComponent(cartId)}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(filteredCartItems),
                credentials: 'include',
                mode: 'cors'
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Помилка сервера (спроба ${attempt + 1}): ${response.status}, Тіло:`, errorText);
                if (response.status === 403) {
                    console.warn('CSRF-токен недійсний, очищаємо та пробуємо ще раз');
                    localStorage.removeItem('csrfToken');
                    csrfToken = await fetchCsrfToken();
                    if (!csrfToken) {
                        throw new Error('Не вдалося отримати новий CSRF-токен');
                    }
                    attempt++;
                    continue;
                } else if (response.status === 429) {
                    console.warn('Занадто багато запитів, чекаємо перед повторною спробою');
                    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
                    attempt++;
                    continue;
                } else if (response.status === 400) {
                    console.error('Некоректні дані кошика:', errorText);
                    showNotification('Помилка: некоректні дані кошика.', 'error');
                    return;
                }
                throw new Error(`Помилка сервера: ${response.status} - ${errorText}`);
            }

            const responseBody = await response.json();
            console.log('Кошик успішно збережено на сервері:', responseBody);

            cart = filteredCartItems.map(item => ({
                ...item,
                id: Number(item.id),
                quantity: Number(item.quantity),
                price: Number(item.price)
            }));
            saveToStorage('cart', cart);
            debouncedRenderCart();
            return;

        } catch (error) {
            console.error(`Помилка збереження кошика (спроба ${attempt + 1}):`, error.message, error.stack);
            attempt++;
            if (attempt < maxRetries) {
                console.log(`Повторна спроба через ${1000 * attempt} мс...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            } else {
                console.error('Усі спроби збереження провалилися');
                saveToStorage('cart', cartItems);
                showNotification('Дані збережено локально, але не вдалося синхронізувати з сервером.', 'warning');
                debouncedRenderCart();
                return;
            }
        }
    }
}

async function triggerCleanupOldCarts() {
    try {
        const csrfToken = localStorage.getItem('csrfToken');
        if (!csrfToken) {
            throw new Error('CSRF-токен відсутній');
        }
        const response = await fetch(`${BASE_URL}/api/cleanup-carts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
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

async function fetchWithRetry(url, options = {}, retries = 5, backoff = 500) {
    const headers = { ...options.headers };
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Fetching ${url}, attempt ${i + 1}`);
            if (!localStorage.getItem('csrfToken')) {
                const csrfToken = await fetchCsrfToken();
                if (!csrfToken) {
                    throw new Error('Failed to obtain CSRF token');
                }
            }
            const response = await fetch(url, {
                ...options,
                headers: {
                    ...headers,
                    'X-CSRF-Token': localStorage.getItem('csrfToken') || ''
                },
                credentials: 'include'
            });
            console.log(`Fetch ${url} status: ${response.status}`);
            if (!response.ok) {
                let errorMessage = `HTTP error! Status: ${response.status}`;
                const errorText = await response.text();
                if (response.status === 401) errorMessage = 'Unauthorized: Invalid or missing credentials';
                else if (response.status === 403) errorMessage = 'Forbidden: Access denied';
                else if (response.status === 429) errorMessage = 'Too Many Requests: Please try again later';
                console.error(`HTTP error details: ${response.status}, Body: ${errorText}`);
                throw new Error(errorMessage);
            }
            return response;
        } catch (error) {
            console.error(`Fetch attempt ${i + 1} failed:`, error.message);
            if (i < retries - 1) {
                console.log(`Retrying in ${backoff}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoff));
                backoff *= 2;
            } else {
                console.error(`All ${retries} attempts for ${url} failed`);
                throw error;
            }
        }
    }
}

async function fetchPublicData() {
    try {
        console.log('Fetching products...');
        const productResponse = await fetchWithRetry(`${BASE_URL}/api/public/products`);
        if (productResponse && productResponse.ok) {
            products = await productResponse.json();
            products = products.filter(p => p.id && p.name && p.slug && p.visible !== false);
            console.log('Відфільтровані продукти:', products);
            saveToStorage('products', products);
        } else {
            console.warn('Не вдалося отримати продукти, використовуємо локальні дані');
            products = loadFromStorage('products', []);
        }

console.log('Fetching categories...');
const catResponse = await fetchWithRetry(`${BASE_URL}/api/public/categories`);
if (catResponse && catResponse.ok) {
    categories = await catResponse.json();
    console.log('Categories fetched:', categories.length, 'Details:', JSON.stringify(categories, null, 2));
    saveToStorage('categories', categories);
} else {
    console.warn('Не вдалося отримати категорії, використовуємо локальні дані');
    categories = loadFromStorage('categories', []);
}

        console.log('Fetching slides...');
        const slidesResponse = await fetchWithRetry(`${BASE_URL}/api/public/slides`);
        if (slidesResponse && slidesResponse.ok) {
            slides = await slidesResponse.json();
            console.log('Slides fetched:', slides.length);
            saveToStorage('slides', slides);
        } else {
            console.warn('Не вдалося отримати слайди, використовуємо локальні дані');
            slides = loadFromStorage('slides', []);
        }

        console.log('Fetching settings...');
        const settingsResponse = await fetchWithRetry(`${BASE_URL}/api/public/settings`);
        if (settingsResponse && settingsResponse.ok) {
            settings = await settingsResponse.json();
            console.log('Settings fetched:', settings);
            saveToStorage('settings', settings);
        } else {
            console.warn('Не вдалося отримати налаштування, використовуємо локальні дані');
            settings = loadFromStorage('settings', {
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
            });
        }

        if (products.length === 0 || categories.length === 0) {
            throw new Error('Дані не завантажено: продукти або категорії відсутні');
        }
    } catch (e) {
        console.error('Помилка завантаження даних через HTTP:', e);
        products = loadFromStorage('products', []);
        categories = loadFromStorage('categories', []);
        slides = loadFromStorage('slides', []);
        settings = loadFromStorage('settings', {
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
        });
        showNotification('Не вдалося завантажити дані з сервера. Використано локальні дані.', 'warning');
    }
}

async function fetchCsrfToken(retries = 3, delay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            console.log(`Fetching CSRF token, attempt ${i + 1}...`);
            const response = await fetch(`${BASE_URL}/api/csrf-token`, {
                method: 'GET',
                credentials: 'include',
                headers: {
                    'Accept': 'application/json'
                }
            });
            console.log(`Fetch CSRF token status: ${response.status}`);
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`HTTP error! Status: ${response.status}, Body: ${errorText}`);
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            const data = await response.json();
            if (data.csrfToken) {
                localStorage.setItem('csrfToken', data.csrfToken);
                console.log('CSRF-токен отримано:', data.csrfToken);
                return data.csrfToken;
            } else {
                throw new Error('CSRF token not found in response');
            }
        } catch (e) {
            console.error(`Attempt ${i + 1} failed:`, e);
            if (i === retries - 1) {
                console.error('All attempts to fetch CSRF token failed');
                showNotification('Не вдалося отримати CSRF-токен. Спробуйте ще раз.', 'error');
                return null;
            }
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return null;
}

function connectPublicWebSocket() {
    const wsUrl = window.location.hostname === 'localhost' 
        ? 'ws://localhost:3000' 
        : 'wss://mebli.onrender.com';
    
    if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
        console.log('WebSocket уже підключено, пропускаємо повторне підключення');
        return;
    }

    ws = new WebSocket(wsUrl);

    let reconnectAttempts = 0;
    const maxAttempts = 5;

    ws.onopen = () => {
        console.log('Публічний WebSocket підключено');
        reconnectAttempts = 0;
        const subscriptions = ['products', 'categories', 'settings', 'slides'];
        subscriptions.forEach(type => {
            ws.send(JSON.stringify({ type, action: 'subscribe' }));
        });
    };

    ws.onmessage = async (event) => {
        try {
            const message = JSON.parse(event.data);
            console.log('WebSocket message received:', { type: message.type, dataLength: message.data?.length });

            if (!message.type) {
                console.warn('Повідомлення WebSocket без типу:', message);
                return;
            }
            if (message.error) {
                console.error('Помилка від WebSocket:', message.error, message.details);
                showNotification('Помилка синхронізації даних: ' + message.error, 'error');
                return;
            }
            if (!message.hasOwnProperty('data')) {
                console.warn('Повідомлення WebSocket без даних:', message);
                return;
            }

            const { type, data } = message;

            if (type === 'products') {
                products = [];
                const uniqueProducts = [];
                const seenSlugs = new Set();

                for (const product of data) {
                    if (!product.slug) {
                        console.warn('Продукт без slug проігноровано:', product);
                        continue;
                    }
                    if (!seenSlugs.has(product.slug)) {
                        uniqueProducts.push(product);
                        seenSlugs.add(product.slug);
                    } else {
                        console.warn(`Дубльований товар з slug ${product.slug} проігноровано:`, product);
                    }
                }

                const slugCounts = uniqueProducts.reduce((acc, p) => {
                    acc[p.slug] = (acc[p.slug] || 0) + 1;
                    return acc;
                }, {});
                const duplicates = Object.entries(slugCounts).filter(([slug, count]) => count > 1);
                if (duplicates.length > 0) {
                    console.error('Знайдено товари з однаковими slug після фільтрації:', duplicates);
                    showNotification('Помилка: виявлено товари з однаковими ідентифікаторами!', 'error');
                    return;
                }

                products = uniqueProducts;
                console.log('Оновлено продукти:', products.length, 'елементів');
                saveToStorage('products', products);

                await updateCartPrices();
                if (document.getElementById('catalog').classList.contains('active')) {
                    renderCatalog(currentCategory, currentSubcategory, currentProduct);
                } else if (document.getElementById('product-details').classList.contains('active') && currentProduct) {
                    currentProduct = products.find(p => p.slug === currentProduct.slug) || currentProduct;
                    console.log('Updated currentProduct:', currentProduct?.name, currentProduct?.slug);
                    renderProductDetails();
                } else if (document.getElementById('cart').classList.contains('active')) {
                    debouncedRenderCart();
                }
            } else if (type === 'categories') {
                categories = data;
                saveToStorage('categories', categories);
                renderCategories();
                renderCatalogDropdown();
                if (document.getElementById('catalog').classList.contains('active')) {
                    renderCatalog(currentCategory, currentSubcategory, currentProduct);
                }
            } else if (type === 'settings') {
                settings = {
                    ...settings,
                    ...data,
                    contacts: { ...settings.contacts, ...(data.contacts || {}) },
                    socials: data.socials || settings.socials,
                    showSocials: data.showSocials !== undefined ? data.showSocials : settings.showSocials,
                    showSlides: data.showSlides !== undefined ? data.showSlides : settings.showSlides
                };
                saveToStorage('settings', settings);
                updateHeader();
                renderContacts();
                renderAbout();
                renderSlideshow();
                const oldFavicon = document.querySelector('link[rel="icon"]');
                if (oldFavicon && data.favicon) {
                    const newFavicon = document.createElement('link');
                    newFavicon.rel = 'icon';
                    newFavicon.href = data.favicon;
                    oldFavicon.parentNode.replaceChild(newFavicon, oldFavicon);
                }
            } else if (type === 'slides') {
                slides = data;
                saveToStorage('slides', slides);
                renderSlideshow();
            }
        } catch (error) {
            console.error('Помилка обробки повідомлення WebSocket:', error);
            showNotification('Помилка обробки даних із сервера!', 'error');
        }
    };

    ws.onerror = (error) => {
        console.error('Помилка WebSocket:', error);
        showNotification('Помилка з\'єднання з сервером!', 'error');
    };

    ws.onclose = (event) => {
        console.warn('WebSocket закрито:', { code: event.code, reason: event.reason });
        if (reconnectAttempts < maxAttempts) {
            const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
            console.log(`Спроба повторного підключення ${reconnectAttempts + 1}/${maxAttempts} через ${delay} мс`);
            setTimeout(() => {
                reconnectAttempts++;
                connectPublicWebSocket();
            }, delay);
        } else {
            console.error('Досягнуто максимальної кількості спроб повторного підключення');
            showNotification('Не вдалося підключитися до сервера після кількох спроб. Будь ласка, перевірте з\'єднання.', 'error');
        }
    };
}

async function initializeData() {
    let cartId = localStorage.getItem('cartId');
    if (!cartId) {
        cartId = 'cart-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('cartId', cartId);
    }

    let tempCart = loadFromStorage('cart', []);
    if (tempCart.some(item => typeof item.id !== 'number')) {
        console.warn('Corrupted cart data detected, resetting cart');
        cart = [];
        cartId = 'cart-' + Math.random().toString(36).substr(2, 9);
        localStorage.setItem('cartId', cartId);
        saveToStorage('cart', cart);
    }

    await fetchCsrfToken();
    await loadCartFromServer();
    selectedColors = loadFromStorage('selectedColors', {});
    selectedMattressSizes = loadFromStorage('selectedMattressSizes', {});
    parentGroupProduct = loadFromStorage('parentGroupProduct', null);
    currentCategory = loadFromStorage('currentCategory', null);
    currentSubcategory = loadFromStorage('currentSubcategory', null);
    currentSort = loadFromStorage('currentSort', ''); // Завантажуємо збережене сортування

    orderFields = loadFromStorage('orderFields', [
        { name: 'name', label: 'Ім\'я', type: 'text', required: true },
        { name: 'surname', label: 'Прізвище', type: 'text', required: true },
        { name: 'phone', label: 'Телефон', type: 'tel', required: true },
        { name: 'email', label: 'Email', type: 'email', required: false },
        { name: 'address', label: 'Адреса доставки', type: 'text', required: true },
        { name: 'payment', label: 'Оплата', type: 'select', options: ['Готівкою', 'Безготівковий розрахунок'], required: true }
    ]);
    if (!localStorage.getItem('orderFields')) saveToStorage('orderFields', orderFields);

    filters = loadFromStorage('filters', [
        { name: 'brand', label: 'Виробник', type: 'checkbox', options: ['Дубок', 'Matroluxe', 'Сокме', 'Еверест'] },
        { name: 'price', label: 'Ціна', type: 'checkbox', options: ['0-2000', '2000-5000', '5000-10000', '10000+'] },
        { name: 'material', label: 'Матеріал', type: 'checkbox', options: ['Дерево', 'Пружинний блок', 'Метал', 'Тканина'] }
    ]);
    if (!localStorage.getItem('filters')) saveToStorage('filters', filters);

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
    await new Promise(resolve => {
        let receivedData = false;
        const checkInterval = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN && products.length > 0 && categories.length > 0) {
                console.log('Дані отримано через WebSocket:', { products: products.length, categories: categories.length });
                receivedData = true;
                clearInterval(checkInterval);
                resolve();
            }
        }, 100);

        setTimeout(async () => {
            if (!receivedData) {
                console.warn('Дані від WebSocket не отримано, використовуємо HTTP');
                await fetchPublicData();
                if (products.length === 0 || categories.length === 0) {
                    console.error('Дані не завантажено через HTTP:', { products: products.length, categories: categories.length });
                    showNotification('Не вдалося завантажити дані з сервера!', 'error');
                } else {
                    console.log('Дані отримано через HTTP:', { products: products.length, categories: categories.length });
                }
                updateHeader();
                renderCategories();
                renderCatalogDropdown();
                clearInterval(checkInterval);
                resolve();
            }
        }, 10000);
    });
}

async function updateProducts() {
    try {
        const response = await fetchWithRetry(`${BASE_URL}/api/public/products?_v=${Date.now()}`);
        products = await response.json();
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
            currentProduct = products.find(p => p._id === currentProduct._id) || currentProduct;
            renderProductDetails();
        }
        updateCartPrices();
    } catch (error) {
        console.error('Error fetching products:', error);
        products = loadFromStorage('products', []);
    }
}

function loadMoreProducts() {
    const productGrid = document.querySelector('.product-grid');
    if (!productGrid) {
        console.warn('Елемент .product-grid не знайдено');
        return;
    }
    let allProducts = loadFromStorage('products', []); // Використовуємо loadFromStorage
    const nextProducts = allProducts.slice(displayedProducts, displayedProducts + productsPerLoad);

    nextProducts.forEach(product => {
        const productElement = document.createElement('div');
        productElement.classList.add('product');
        productElement.innerHTML = `
            <img src="${product.image || NO_IMAGE_URL}" alt="${product.name}">
            <h3>${product.name}</h3>
            <div class="price">${product.price || 'N/A'} грн</div>
            <button class="buy-btn" onclick="addToCart(${product.id || 0})">Купити</button>
            <button class="details-btn" onclick="showProductDetails(${product.id || 0})">Деталі</button>
        `;
        productGrid.appendChild(productElement);
    });

    displayedProducts += productsPerLoad;

    if (displayedProducts >= allProducts.length) {
        const showMoreBtn = document.querySelector('.show-more-btn');
        if (showMoreBtn) {
            showMoreBtn.disabled = true;
            showMoreBtn.textContent = 'Більше немає товарів';
        }
    }
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(el => el.classList.remove('active'));
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
        let newPath = '/';
        const searchInput = document.getElementById('search');
        if (searchInput) {
            searchInput.value = '';
        }
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
            renderProductDetails();
            const catSlug = transliterate(currentCategory.replace('ь', ''));
            const subCatSlug = currentSubcategory ? transliterate(currentSubcategory.replace('ь', '')) : '';
            newPath = `/${catSlug}${subCatSlug ? `/${subCatSlug}` : ''}/${currentProduct.slug}`;
        }
        saveToStorage('currentCategory', currentCategory);
        saveToStorage('currentSubcategory', currentSubcategory);
        const stateId = `${sectionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        history.pushState({ sectionId, path: newPath, stateId }, '', newPath);
        updateMetaTags(sectionId === 'product-details' ? currentProduct : null);
        renderBreadcrumbs();
        window.scrollTo(0, 0);

        activeTimers.forEach((id) => clearInterval(id));
        activeTimers.clear();
        const searchButton = document.querySelector('.search-btn');
        if (searchButton) {
            searchButton.onclick = (e) => {
                e.preventDefault();
                searchProducts();
            };
        }
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

        const imgLink = document.createElement('a');
        imgLink.href = `/${transliterate(cat.name.replace('ь', ''))}`;
        imgLink.style.textDecoration = 'none';
        imgLink.onclick = (e) => {
            e.preventDefault();
            currentCategory = cat.name;
            currentSubcategory = null;
            currentProduct = null;
            showSection('catalog');
        };
        const img = document.createElement('img');
        img.src = cat.photo || NO_IMAGE_URL;
        img.alt = cat.name;
        img.loading = 'lazy';
        img.onerror = () => { img.src = NO_IMAGE_URL; };
        imgLink.appendChild(img);
        categoryDiv.appendChild(imgLink);

        const pLink = document.createElement('a');
        pLink.href = `/${transliterate(cat.name.replace('ь', ''))}`;
        pLink.style.textDecoration = 'none';
        pLink.onclick = (e) => {
            e.preventDefault();
            currentCategory = cat.name;
            currentSubcategory = null;
            currentProduct = null;
            showSection('catalog');
        };
        const p = document.createElement('p');
        p.textContent = cat.name;
        pLink.appendChild(p);
        categoryDiv.appendChild(pLink);

        const subcategoriesDiv = document.createElement('div');
        subcategoriesDiv.className = 'subcategories';
        (cat.subcategories || []).forEach(sub => {
            const subLink = document.createElement('a');
            subLink.href = `/${transliterate(cat.name.replace('ь', ''))}/${transliterate(sub.name.replace('ь', ''))}`;
            subLink.style.textDecoration = 'none';
            subLink.onclick = (e) => {
                e.preventDefault();
                currentCategory = cat.name;
                currentSubcategory = sub.name;
                currentProduct = null;
                showSection('catalog');
            };
            const subP = document.createElement('p');
            subP.textContent = sub.name;
            subLink.appendChild(subP);
            subcategoriesDiv.appendChild(subLink);
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
        span.style.textDecoration = 'none';
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
            p.style.textDecoration = 'none';
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

        productsDiv.appendChild(createControlsContainer());
        const productList = document.createElement('div');
        productList.id = 'product-list';
        productList.className = 'product-grid';
        productsDiv.appendChild(productList);

        if (searchResults.length > 0) {
            filteredProducts = [...searchResults];
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

            const imgLink = document.createElement('a');
            imgLink.href = `/${transliterate(cat.name.replace('ь', ''))}`;
            imgLink.onclick = (e) => {
                e.preventDefault();
                currentCategory = cat.name;
                currentSubcategory = null;
                currentProduct = null;
                showSection('catalog');
            };
            const img = document.createElement('img');
            img.src = cat.image || NO_IMAGE_URL;
            img.alt = cat.name;
            img.loading = 'lazy';
            imgLink.appendChild(img);
            itemDiv.appendChild(imgLink);

            const pLink = document.createElement('a');
            pLink.href = `/${transliterate(cat.name.replace('ь', ''))}`;
            pLink.onclick = (e) => {
                e.preventDefault();
                currentCategory = cat.name;
                currentSubcategory = null;
                currentProduct = null;
                showSection('catalog');
            };
            const p = document.createElement('p');
            p.textContent = cat.name;
            pLink.appendChild(p);
            itemDiv.appendChild(pLink);

            categoryList.appendChild(itemDiv);
        });
        productsDiv.appendChild(categoryList);
    } else {
        const selectedCat = categories.find(c => c.name === category);
        if (!selectedCat) {
            const p = document.createElement('p');
            p.textContent = 'Категорія не знайдена';
            productsDiv.appendChild(p);
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

            const allBtnLink = document.createElement('a');
            allBtnLink.href = `/${transliterate(category.replace('ь', ''))}`;
            allBtnLink.onclick = (e) => {
                e.preventDefault();
                currentSubcategory = null;
                showSection('catalog');
            };
            const allBtn = document.createElement('button');
            allBtn.textContent = 'Усі';
            allBtnLink.appendChild(allBtn);
            subButtonsDiv.appendChild(allBtnLink);

            (selectedCat.subcategories || []).forEach(sub => {
                const btnLink = document.createElement('a');
                btnLink.href = `/${transliterate(category.replace('ь', ''))}/${transliterate(sub.name.replace('ь', ''))}`;
                btnLink.onclick = (e) => {
                    e.preventDefault();
                    currentSubcategory = sub.name;
                    showSection('catalog');
                };
                const btn = document.createElement('button');
                btn.textContent = sub.name;
                btnLink.appendChild(btn);
                subButtonsDiv.appendChild(btnLink);
            });
            subFilterDiv.appendChild(subButtonsDiv);
            productsDiv.appendChild(subFilterDiv);

            productsDiv.appendChild(createControlsContainer());
        }

        const productList = document.createElement('div');
        productList.id = 'product-list';
        productList.className = 'product-grid';
        productsDiv.appendChild(productList);

        let subcategorySlug = null;
        if (subcategory) {
            const subCat = (selectedCat.subcategories || []).find(sub => sub.name === subcategory);
            if (subCat) {
                subcategorySlug = subCat.slug;
            } else {
                console.warn(`Підкатегорія з назвою "${subcategory}" не знайдена в категорії "${category}"`);
            }
        }

        filteredProducts = products.filter(p => 
            p.category === category && 
            (!subcategorySlug || p.subcategory === subcategorySlug) && 
            p.visible
        );

        if (filteredProducts.length === 0) {
            const p = document.createElement('p');
            p.textContent = 'Нічого не знайдено';
            productList.appendChild(p);
        } else {
            renderProducts(filteredProducts);
        }
    }
    renderFilters();
    renderBreadcrumbs();
}

// Допоміжна функція для створення контейнера з елементами сортування та кількості
function createControlsContainer() {
    const filterSortContainer = document.createElement('div');
    filterSortContainer.className = 'filter-sort-container';
    filterSortContainer.style.display = 'flex';
    filterSortContainer.style.justifyContent = 'space-between';
    filterSortContainer.style.alignItems = 'center';
    filterSortContainer.style.width = '100%';
    filterSortContainer.style.maxWidth = '100%';
    filterSortContainer.style.padding = '10px 0';
    filterSortContainer.style.boxSizing = 'border-box';
    filterSortContainer.style.gap = '10px'; // Додаємо відступ між елементами
    filterSortContainer.appendChild(createSortMenu());
    filterSortContainer.appendChild(createPerPageMenu());
    const perPageHidden = document.createElement('input');
    perPageHidden.type = 'hidden';
    perPageHidden.id = 'per-page-hidden';
    perPageHidden.value = '20';
    filterSortContainer.appendChild(perPageHidden);
    return filterSortContainer;
}

function createSortMenu() {
    const sortMenu = document.createElement('div');
    sortMenu.className = 'sort-menu';
    sortMenu.style.display = 'inline-flex'; // Забезпечуємо горизонтальне розміщення
    sortMenu.style.alignItems = 'center';
    sortMenu.style.marginRight = '10px'; // Відступ між "Сортування" і "Кількість"

    const sortBtn = document.createElement('button');
    sortBtn.className = 'sort-btn';
    sortBtn.textContent = 'Сортування ▼';
    sortBtn.style.padding = '8px 12px';
    sortBtn.style.fontSize = '14px';
    sortBtn.style.whiteSpace = 'nowrap'; // Запобігаємо перенесенню тексту
    sortBtn.style.border = '1px solid #ccc';
    sortBtn.style.borderRadius = '4px';
    sortBtn.style.backgroundColor = '#f5f5f5';
    sortBtn.style.cursor = 'pointer';
    sortBtn.onclick = () => {
        sortDropdown.style.display = sortDropdown.style.display === 'block' ? 'none' : 'block';
    };
    sortMenu.appendChild(sortBtn);

    const sortDropdown = document.createElement('div');
    sortDropdown.className = 'sort-dropdown';
    sortDropdown.style.display = 'none';
    sortDropdown.style.position = 'absolute';
    sortDropdown.style.backgroundColor = '#fff';
    sortDropdown.style.border = '1px solid #ccc';
    sortDropdown.style.borderRadius = '4px';
    sortDropdown.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
    sortDropdown.style.zIndex = '1000';
    sortDropdown.style.marginTop = '5px';

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
        btn.className = currentSort === opt.value ? 'selected' : '';
        btn.style.display = 'block';
        btn.style.padding = '8px 12px';
        btn.style.width = '100%';
        btn.style.textAlign = 'left';
        btn.style.border = 'none';
        btn.style.backgroundColor = currentSort === opt.value ? '#e0e0e0' : 'transparent';
        btn.style.cursor = 'pointer';
        btn.onmouseover = () => { btn.style.backgroundColor = '#f0f0f0'; };
        btn.onmouseout = () => { btn.style.backgroundColor = currentSort === opt.value ? '#e0e0e0' : 'transparent'; };
        btn.onclick = () => {
            sortProducts(opt.value);
            sortDropdown.style.display = 'none';
            sortDropdown.querySelectorAll('button').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
        };
        sortDropdown.appendChild(btn);
    });
    sortMenu.appendChild(sortDropdown);

    return sortMenu;
}

function createPerPageMenu() {
    const perPageMenu = document.createElement('div');
    perPageMenu.className = 'per-page-menu';
    perPageMenu.style.display = 'inline-flex'; // Забезпечуємо горизонтальне розміщення
    perPageMenu.style.alignItems = 'center';

    const perPageBtn = document.createElement('button');
    perPageBtn.className = 'per-page-btn';
    perPageBtn.textContent = 'Кількість ▼';
    perPageBtn.style.padding = '8px 12px';
    perPageBtn.style.fontSize = '14px';
    perPageBtn.style.whiteSpace = 'nowrap'; // Запобігаємо перенесенню тексту
    perPageBtn.style.border = '1px solid #ccc';
    perPageBtn.style.borderRadius = '4px';
    perPageBtn.style.backgroundColor = '#f5f5f5';
    perPageBtn.style.cursor = 'pointer';
    perPageBtn.onclick = () => {
        perPageDropdown.style.display = perPageDropdown.style.display === 'block' ? 'none' : 'block';
    };
    perPageMenu.appendChild(perPageBtn);

    const perPageDropdown = document.createElement('div');
    perPageDropdown.className = 'per-page-dropdown';
    perPageDropdown.style.display = 'none';
    perPageDropdown.style.position = 'absolute';
    perPageDropdown.style.backgroundColor = '#fff';
    perPageDropdown.style.border = '1px solid #ccc';
    perPageDropdown.style.borderRadius = '4px';
    perPageDropdown.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
    perPageDropdown.style.zIndex = '1000';
    perPageDropdown.style.marginTop = '5px';

    [10, 20, 50].forEach(num => {
        const btn = document.createElement('button');
        btn.textContent = num;
        btn.style.display = 'block';
        btn.style.padding = '8px 12px';
        btn.style.width = '100%';
        btn.style.textAlign = 'left';
        btn.style.border = 'none';
        btn.style.backgroundColor = 'transparent';
        btn.style.cursor = 'pointer';
        btn.onmouseover = () => { btn.style.backgroundColor = '#f0f0f0'; };
        btn.onmouseout = () => { btn.style.backgroundColor = 'transparent'; };
        btn.onclick = () => {
            document.getElementById('per-page-hidden').value = num;
            renderProducts(isSearchActive ? searchResults : filteredProducts);
            perPageDropdown.style.display = 'none';
            perPageBtn.textContent = `Кількість: ${num} ▼`; // Оновлюємо текст кнопки
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
        label.appendChild(document.createTextNode(` ${opt}`));
        optionsDiv.appendChild(label);
    });

    block.appendChild(optionsDiv);
    return block;
}

function filterProducts() {
    let base = isSearchActive ? [...baseSearchResults] : products.filter(p => {
        const categoryMatch = p.category === currentCategory;
        let subcategoryMatch = true;
        if (currentSubcategory) {
            const selectedCat = categories.find(c => c.name === currentCategory);
            const subCat = selectedCat?.subcategories?.find(sub => sub.name === currentSubcategory);
            const subcategorySlug = subCat ? subCat.slug : null;
            subcategoryMatch = !subcategorySlug || p.subcategory === subcategorySlug;
        }
        return categoryMatch && subcategoryMatch && p.visible;
    });

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

    // Якщо немає активних фільтрів, повертаємо базовий список товарів
    if (!hasActiveFilters) {
        filtered = [...base];
    }

    filteredProducts = filtered;
    if (isSearchActive) searchResults = filtered;
    renderProducts(filtered);
}

function sortProducts(sortType) {
    // Зберігаємо вибраний тип сортування
    currentSort = sortType;
    saveToStorage('currentSort', currentSort); // Зберігаємо в localStorage для стійкості

    // Вибираємо масив для сортування
    let filtered = isSearchActive ? [...searchResults] : [...filteredProducts];

    // Виконуємо сортування
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

    // Оновлюємо глобальні змінні
    filteredProducts = filtered;
    if (isSearchActive) searchResults = filtered;

    // Оновлюємо відображення
    renderProducts(isSearchActive ? searchResults : filteredProducts);
}

function renderProducts(filtered) {
    const productList = document.getElementById('product-list');
    if (!productList) return;

    // Очищаємо таймери
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

    // Застосовуємо сортування, якщо currentSort встановлено
    let activeProducts = [...filtered];
    if (currentSort) {
        if (currentSort === 'name-asc') {
            activeProducts.sort((a, b) => a.name.localeCompare(b.name));
        } else if (currentSort === 'name-desc') {
            activeProducts.sort((a, b) => b.name.localeCompare(a.name));
        } else if (currentSort === 'price-asc') {
            activeProducts.sort((a, b) => {
                const priceA = (a.salePrice && new Date(a.saleEnd) > new Date() ? a.salePrice : a.price) || 0;
                const priceB = (b.salePrice && new Date(b.saleEnd) > new Date() ? b.salePrice : b.price) || 0;
                return priceA - priceB;
            });
        } else if (currentSort === 'price-desc') {
            activeProducts.sort((a, b) => {
                const priceA = (a.salePrice && new Date(a.saleEnd) > new Date() ? a.salePrice : a.price) || 0;
                const priceB = (b.salePrice && new Date(b.saleEnd) > new Date() ? b.salePrice : b.price) || 0;
                return priceB - priceA;
            });
        } else if (currentSort === 'popularity') {
            activeProducts.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
        }
    }

    const perPage = parseInt(document.getElementById('per-page-hidden')?.value) || 20;
    activeProducts = activeProducts.slice(0, perPage);
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

        const imgLink = document.createElement('a');
        imgLink.href = `/${transliterate(product.category.replace('ь', ''))}${product.subcategory ? `/${transliterate(product.subcategory.replace('ь', ''))}` : ''}/${product.slug}`;
        imgLink.onclick = (e) => {
            e.preventDefault();
            openProduct(product.slug);
        };
        const img = document.createElement('img');
        img.src = product.photos?.[0] || NO_IMAGE_URL;
        img.alt = product.name;
        img.loading = 'lazy';
        imgLink.appendChild(img);
        productDiv.appendChild(imgLink);

        const h3Link = document.createElement('a');
        h3Link.href = `/${transliterate(product.category.replace('ь', ''))}${product.subcategory ? `/${transliterate(product.subcategory.replace('ь', ''))}` : ''}/${product.slug}`;
        h3Link.onclick = (e) => {


            e.preventDefault();
            openProduct(product.slug);
        };
        const h3 = document.createElement('h3');
        h3.textContent = product.name;
        h3Link.appendChild(h3);
        productDiv.appendChild(h3Link);

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
                const p = products.find(p => p._id === id);
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
            timerDiv.id = `timer-${product._id}`;
            productDiv.appendChild(timerDiv);
            updateSaleTimer(product._id, product.saleEnd);
        }

        const btn = document.createElement('button');
        btn.className = 'buy-btn';
        if (product.type === 'mattresses' || product.type === 'group') {
            btn.textContent = 'Детальніше';
            btn.onclick = () => openProduct(product.slug);
        } else {
            btn.textContent = 'Додати в кошик';
            btn.onclick = () => product.colors?.length > 1 ? (openProduct(product.slug), showNotification('Виберіть потрібний колір', 'error')) : addToCartWithColor(product._id);
        }
        productDiv.appendChild(btn);

        productList.appendChild(productDiv);
    });
}

async function renderProductDetails() {
    const productDetails = document.getElementById('product-details');
    if (!productDetails || !currentProduct) {
        console.error('Product details element or currentProduct missing:', { productDetails, currentProduct });
        showSection('home');
        return;
    }

    console.log('Rendering product details for:', currentProduct.name, 'Slug:', currentProduct.slug, 'ID:', currentProduct._id);

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
        mainImg.onclick = () => openGallery(product.slug);
        leftDiv.appendChild(mainImg);

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'thumbnail-container';
        product.photos?.forEach((photo, index) => {
            const thumbImg = document.createElement('img');
            thumbImg.src = photo;
            thumbImg.className = 'thumbnail';
            thumbImg.alt = `Мініатюра ${index + 1}`;
            thumbImg.loading = 'lazy';
            thumbImg.onclick = () => { mainImg.src = photo; openGallery(product.slug, index); };
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
        priceDiv.id = `price-${product._id}`;
        if (product.type === 'mattresses' && product.sizes?.length > 0) {
            const minPrice = Math.min(...product.sizes.map(s => s.price));
            const regularSpan = document.createElement('span');
            regularSpan.className = 'regular-price';
            regularSpan.textContent = `${minPrice} грн`;
            priceDiv.appendChild(regularSpan);
            const sizeP = document.createElement('p');
            sizeP.innerHTML = '<strong>Розміри:</strong> ';
            const sizeSelect = document.createElement('select');
            sizeSelect.id = `mattress-size-${product._id}`;
            sizeSelect.className = 'custom-select';
            sizeSelect.onchange = () => updateMattressPrice(product._id);
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
            const groupPriceDiv = document.createElement('div');
            groupPriceDiv.className = 'group-total-price';
            groupPriceDiv.textContent = `Загальна ціна: 0 грн`;
            rightDiv.appendChild(groupPriceDiv);
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
                timerDiv.id = `timer-${product._id}`;
                rightDiv.appendChild(timerDiv);
                updateSaleTimer(product._id, product.saleEnd);
            }
        }

        if (product.type !== 'mattresses' && product.type !== 'group') {
            const qtyDiv = document.createElement('div');
            qtyDiv.className = 'quantity-selector';
            const minusBtn = document.createElement('button');
            minusBtn.className = 'quantity-btn';
            minusBtn.setAttribute('aria-label', 'Зменшити кількість');
            minusBtn.textContent = '-';
            minusBtn.onclick = () => changeQuantity(product._id, -1);
            qtyDiv.appendChild(minusBtn);
            const qtyInput = document.createElement('input');
            qtyInput.type = 'number';
            qtyInput.id = `quantity-${product._id}`;
            qtyInput.min = '1';
            qtyInput.value = '1';
            qtyInput.readOnly = true;
            qtyDiv.appendChild(qtyInput);
            const plusBtn = document.createElement('button');
            plusBtn.className = 'quantity-btn';
            plusBtn.setAttribute('aria-label', 'Збільшити кількість');
            plusBtn.textContent = '+';
            plusBtn.onclick = () => changeQuantity(product._id, 1);
            qtyDiv.appendChild(plusBtn);
            rightDiv.appendChild(qtyDiv);
        }

        const buyBtn = document.createElement('button');
        buyBtn.className = 'buy-btn';
        buyBtn.textContent = 'Додати в кошик';
        buyBtn.onclick = () => addToCartWithColor(product._id);
        if (product.type !== 'group') rightDiv.appendChild(buyBtn);

        if (product.colors?.length >= 1) {
            const hasPhotos = product.colors.some(c => c.photo);
            if (hasPhotos) {
                const colorP = document.createElement('p');
                colorP.innerHTML = '<strong>Колір:</strong>';
                rightDiv.appendChild(colorP);
                const colorDiv = document.createElement('div');
                colorDiv.id = `color-options-${product._id}`;
                product.colors.forEach((c, i) => {
                    const circle = document.createElement('div');
                    circle.className = 'color-circle';
                    circle.style.background = c.photo ? `url(${c.photo})` : c.value;
                    circle.setAttribute('data-index', i);
                    circle.onclick = () => selectColor(product._id, i);
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
                colorSelect.id = `color-select-${product._id}`;
                colorSelect.className = 'custom-select';
                colorSelect.onchange = () => updateColorPrice(product._id);
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
        if (product.material && product.material.trim() !== '') {
            charDiv.appendChild(createCharP('Матеріал', product.material));
        }
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

            const savedSelection = loadFromStorage(`groupSelection_${product._id}`, []);
            product.groupProducts.forEach(id => {
                const p = products.find(p => p._id === id);
                if (!p) {
                    console.warn(`Груповий товар з ID ${id} не знайдено`);
                    return;
                }
                const itemDiv = document.createElement('div');
                itemDiv.className = 'group-product-item';

                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = p._id;
                checkbox.checked = savedSelection.includes(p._id);
                checkbox.onchange = () => updateGroupSelection(product._id);
                label.appendChild(checkbox);

                const img = document.createElement('img');
                img.src = p.photos?.[0] || NO_IMAGE_URL;
                img.alt = p.name;
                img.onclick = () => {
                    parentGroupProduct = product;
                    saveToStorage('parentGroupProduct', parentGroupProduct);
                    currentProduct = p;
                    showSection('product-details');
                };
                label.appendChild(img);

                const infoDiv = document.createElement('div');
                infoDiv.className = 'group-product-info';

                const h4 = document.createElement('h4');
                h4.textContent = p.name;
                h4.onclick = () => {
                    parentGroupProduct = product;
                    saveToStorage('parentGroupProduct', parentGroupProduct);
                    currentProduct = p;
                    showSection('product-details');
                };
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
            groupBtn.onclick = () => addGroupToCart(product._id);
            groupDiv.appendChild(groupBtn);
            container.appendChild(groupDiv);

            updateGroupSelection(product._id);
        }

        if (product.description && product.description.trim() !== '') {
            const descDiv = document.createElement('div');
            descDiv.className = 'product-detail-description';
            descDiv.appendChild(createCharP('Опис', product.description));
            container.appendChild(descDiv);
        }

        productDetails.appendChild(container);

        if (product.type === 'mattresses' && selectedMattressSizes[product._id]) {
            document.getElementById(`mattress-size-${product._id}`).value = selectedMattressSizes[product._id];
            updateMattressPrice(product._id);
        }
        if (product.colors?.length >= 1 && selectedColors[product._id] !== undefined) {
            if (product.colors.some(c => c.photo)) {
                document.querySelector(`#color-options-${product._id} .color-circle[data-index="${selectedColors[product._id]}"]`)?.classList.add('selected');
            } else {
                document.getElementById(`color-select-${product._id}`).value = selectedColors[product._id];
                updateColorPrice(product._id);
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
    span.style.whiteSpace = 'nowrap';
    span.innerHTML = `<strong>${label}:</strong> ${value}`;
    p.appendChild(span);
    return p;
}

function updateSaleTimer(productId, saleEnd) {
    const timerElement = document.getElementById(`timer-${productId}`);
    if (!timerElement || !saleEnd) return;
    const product = products.find(p => p._id === productId);
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
            if (currentProduct && currentProduct._id === productId) {
                currentProduct = product;
                renderProductDetails();
            }
            if (document.getElementById('catalog').classList.contains('active')) {
                renderProducts(isSearchActive ? searchResults : filteredProducts);
            }
            updateCartPrices();
            saveCartToServer();
            debouncedRenderCart();
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
    const product = products.find(p => p._id === productId);
    if (!product) return;
    selectedColors[productId] = index;
    saveToStorage('selectedColors', selectedColors);
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
    const product = products.find(p => p._id === productId);
    if (!product) return;
    const select = document.getElementById(`color-select-${productId}`);
    const index = parseInt(select.value);
    selectedColors[productId] = index;
    saveToStorage('selectedColors', selectedColors);
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
        saveToStorage('selectedMattressSizes', selectedMattressSizes);
    }
}

function updateGroupSelection(productId) {
    const product = products.find(p => p._id === productId);
    if (!product || product.type !== 'group') return;

    const checkboxes = document.querySelectorAll(`.group-product-item input[type="checkbox"]`);
    let totalPrice = 0;
    const selectedIds = [];

    checkboxes.forEach(cb => {
        const id = cb.value;
        const p = products.find(p => p._id === id);
        if (cb.checked && p) {
            const price = p.salePrice && new Date(p.saleEnd) > new Date() ? p.salePrice : p.price || 0;
            totalPrice += price;
            selectedIds.push(id);
        }
    });

    const priceDiv = document.querySelector('.group-total-price');
    if (priceDiv) {
        priceDiv.textContent = `Загальна ціна: ${totalPrice} грн`;
    } else {
        const newPriceDiv = document.createElement('div');
        newPriceDiv.className = 'group-total-price';
        newPriceDiv.textContent = `Загальна ціна: ${totalPrice} грн`;
        const groupDiv = document.querySelector('.group-products');
        if (groupDiv) groupDiv.insertBefore(newPriceDiv, groupDiv.querySelector('.buy-btn'));
    }

    saveToStorage(`groupSelection_${productId}`, selectedIds);
}

async function addToCartWithColor(productId) {
    const product = products.find(p => p._id === productId);
    if (!product) {
        console.error('Товар не знайдено за _id:', productId);
        showNotification('Товар не знайдено!', 'error');
        return;
    }
    if (typeof product.id !== 'number' || isNaN(product.id)) {
        console.error('Некоректний id продукту:', product);
        showNotification('Помилка: товар має некоректний числовий ідентифікатор!', 'error');
        return;
    }
    console.log('Додавання до кошика, продукт:', {
        id: product.id,
        name: product.name,
        slug: product.slug,
        price: product.price,
        salePrice: product.salePrice,
        colors: product.colors,
        type: product.type
    });

    if (product.colors?.length > 1 && selectedColors[productId] === undefined && product.type !== 'mattresses') {
        showNotification('Будь ласка, виберіть колір!', 'error');
        return;
    }

    let price = product.price || 0;
    let colorData = null;
    if (product.type !== 'mattresses' && product.colors?.length > 0) {
        const colorIndex = selectedColors[productId] !== undefined ? selectedColors[productId] : 0;
        if (!product.colors[colorIndex]) {
            showNotification('Обраний колір більше недоступний!', 'error');
            delete selectedColors[productId];
            saveToStorage('selectedColors', selectedColors);
            return;
        }
        colorData = {
            name: product.colors[colorIndex].name || 'Не вказано',
            value: product.colors[colorIndex].value || product.colors[colorIndex].name || '',
            priceChange: product.colors[colorIndex].priceChange || 0,
            photo: product.colors[colorIndex].photo || ''
        };
        price = product.salePrice && new Date(product.saleEnd) > new Date() ? product.salePrice : product.price || 0;
        price += colorData.priceChange;
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
        price = sizeData.price || 0;
        colorData = {
            name: size,
            value: size,
            priceChange: 0,
            photo: product.photos?.[0] || NO_IMAGE_URL
        };
    }

    const quantity = parseInt(document.getElementById(`quantity-${productId}`)?.value) || 1;
    if (quantity < 1) {
        showNotification('Кількість має бути більше 0!', 'error');
        return;
    }

    const cartItem = {
        id: product.id,
        name: product.name || 'Без назви',
        quantity: quantity,
        price: price,
        photo: product.photos?.[0] || NO_IMAGE_URL,
        color: colorData,
        brand: product.brand || 'Не вказано'
    };

    if (!cartItem.id || !cartItem.name || !cartItem.quantity || !cartItem.price) {
        console.error('Некоректний елемент кошика:', cartItem);
        showNotification('Помилка: некоректні дані товару!', 'error');
        return;
    }

    console.log('Створено cartItem:', cartItem);

    const existingItemIndex = cart.findIndex(item =>
        item.id === cartItem.id &&
        JSON.stringify(item.color) === JSON.stringify(cartItem.color) &&
        item.brand === cartItem.brand
    );

    if (existingItemIndex > -1) {
        cart[existingItemIndex].quantity += cartItem.quantity;
    } else {
        cart.push(cartItem);
    }

    saveToStorage('cart', cart);
    updateCartCount();
    debouncedRenderCart();
    showNotification(`${product.name} додано до кошика!`, 'success');

    try {
        await saveCartToServer();
    } catch (error) {
        console.error('Помилка синхронізації кошика з сервером:', error);
        showNotification('Дані збережено локально, але не вдалося синхронізувати з сервером.', 'warning');
    }
}

async function addGroupToCart(productId) {
    const product = products.find(p => p._id === productId);
    if (!product || product.type !== 'group') return;
    const checkboxes = document.querySelectorAll(`.group-product-item input[type="checkbox"]:checked`);
    if (checkboxes.length === 0) {
        showNotification('Будь ласка, виберіть хоча б один товар!', 'error');
        return;
    }
    checkboxes.forEach(cb => {
        const id = cb.value;
        const p = products.find(p => p._id === id);
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
    debouncedRenderCart();
}

async function fetchProductBySlug(slug) {
    const cachedProduct = products.find(p => p.slug === slug);
    if (cachedProduct) {
        console.log('Продукт знайдено в локальному кеші:', cachedProduct.name);
        return cachedProduct;
    }

    try {
        console.log('Запит продукту за slug:', slug);
        const response = await fetchWithRetry(`${BASE_URL}/api/public/products?slug=${slug}`, 1);
        if (!response) {
            console.error('Відповідь від сервера відсутня для slug:', slug);
            throw new Error('Не вдалося отримати відповідь від сервера');
        }
        const contentType = response.headers.get('Content-Type');
        if (!contentType || !contentType.includes('application/json')) {
            console.error('Сервер повернув не JSON:', contentType);
            throw new Error('Некоректний формат відповіді сервера');
        }
        const data = await response.json();
        console.log('Відповідь сервера:', data);

        let product = null;
        if (Array.isArray(data)) {
            product = data.find(p => p.slug === slug) || null;
        } else if (data.products && Array.isArray(data.products)) {
            product = data.products.find(p => p.slug === slug) || null;
        } else if (data.slug === slug) {
            product = data;
        }

        if (!product) {
            console.error('Продукт із slug не знайдено:', slug);
            showNotification('Товар не знайдено!', 'error');
            return null;
        }

        console.log('Знайдено продукт:', product.name, 'ID:', product._id);
        products = products.filter(p => p._id !== product._id);
        products.push(product);
        saveToStorage('products', products);
        return product;
    } catch (error) {
        console.error('Помилка отримання продукту за slug:', error);
        showNotification('Не вдалося завантажити товар через помилку сервера!', 'error');
        return null;
    }
}

async function fetchProductFromServer(slug) {
    try {
        console.log('Запит продукту за slug:', slug);
        const response = await fetchWithRetry(`${BASE_URL}/api/public/products?slug=${slug}`, 1);
        if (!response) {
            console.error('Відповідь від сервера відсутня для slug:', slug);
            throw new Error('Не вдалося отримати відповідь від сервера');
        }
        const contentType = response.headers.get('Content-Type');
        if (!contentType.includes('application/json')) {
            console.error('Сервер повернув не JSON:', contentType);
            throw new Error('Некоректний формат відповіді сервера');
        }
        const data = await response.json();
        console.log('Відповідь сервера:', data);

        let product = null;
        if (Array.isArray(data)) {
            product = data.find(p => p.slug === slug) || null;
        } else if (data.products && Array.isArray(data.products)) {
            product = data.products.find(p => p.slug === slug) || null;
        } else if (data.slug === slug) {
            product = data;
        }

        if (!product) {
            console.error('Продукт із slug не знайдено:', slug);
            showNotification('Товар не знайдено!', 'error');
            return null;
        }

        console.log('Знайдено продукт:', product.name, 'ID:', product._id);
        products = products.filter(p => p._id !== product._id);
        products.push(product);
        saveToStorage('products', products);
        return product;
    } catch (error) {
        console.error('Помилка отримання продукту за slug:', error);
        showNotification('Не вдалося завантажити товар через помилку сервера!', 'error');
        return null;
    }
}

async function openProduct(slugOrId) {
    console.log('Opening product with slug or ID:', slugOrId);
    
    let product = null;
    if (typeof slugOrId === 'string' && slugOrId.includes('-')) {
        product = products.find(p => p._id === slugOrId);
    } else {
        product = products.find(p => p.slug === slugOrId);
    }

    if (!product && typeof slugOrId === 'string') {
        product = await fetchProductBySlug(slugOrId);
        console.log('Fetched product from server:', product);
    }

    if (!product) {
        console.error('Product not found for slug or ID:', slugOrId);
        showNotification('Товар не знайдено!', 'error');
        showSection('home');
        return;
    }

    if (typeof product._id !== 'string' || !product._id) {
        console.error('Некоректний _id продукту:', product);
        showNotification('Помилка: товар має некоректний ідентифікатор!', 'error');
        showSection('home');
        return;
    }

    console.log('Found product:', product.name, 'Slug:', product.slug, '_id:', product._id);

    const duplicateSlug = products.filter(p => p.slug === product.slug);
    if (duplicateSlug.length > 1) {
        console.warn('Duplicate slugs found:', product.slug, duplicateSlug);
        showNotification('Помилка: кілька товарів мають однаковий slug!', 'error');
        showSection('home');
        return;
    }

    const categoryExists = categories.some(cat => cat.name === product.category);
    if (!categoryExists) {
        console.error('Category does not exist:', product.category);
        showNotification('Категорія товару більше не існує!', 'error');
        showSection('home');
        return;
    }

    const subCategoryExists = product.subcategory 
        ? categories
            .filter(cat => cat.name === product.category)
            .flatMap(cat => cat.subcategories || [])
            .some(sub => sub.slug === product.subcategory)
        : true;
    if (!subCategoryExists) {
        console.warn('Subcategory does not exist:', product.subcategory, 'for product:', product.name);
        product.subcategory = null;
        currentSubcategory = null;
        showNotification('Підкатегорія товару більше не існує, відображаємо без підкатегорії.', 'warning');
    }

    const groupProduct = products.find(p => p.type === 'group' && p.groupProducts?.includes(product._id));
    if (groupProduct && currentProduct?.type === 'group') {
        parentGroupProduct = currentProduct;
        saveToStorage('parentGroupProduct', parentGroupProduct);
    } else if (!parentGroupProduct) {
        parentGroupProduct = null;
        saveToStorage('parentGroupProduct', null);
    }

    currentProduct = product;
    currentCategory = product.category;
    currentSubcategory = product.subcategory || null;
    isSearchActive = false;
    searchResults = [];
    baseSearchResults = [];
    console.log('Set currentProduct:', currentProduct.name, 'Slug:', currentProduct.slug);
    
    showSection('product-details');
}

function normalizeString(str) {
    return str ? str.normalize('NFC').toLowerCase() : '';
}

function searchProducts() {
    const searchInput = document.getElementById('search');
    if (!searchInput) {
        console.error('Поле пошуку не знайдено');
        showNotification('Помилка пошуку!', 'error');
        return;
    }
    const query = normalizeString(searchInput.value.trim());
    console.log('Пошук за запитом:', query);
    console.log('Доступні продукти:', products);

    if (!query) {
        console.log('Порожній запит пошуку, дія не виконується');
        return;
    }
    if (isSearchPending) return;
    isSearchPending = true;

    searchResults = products.filter(p => {
        if (!p.visible) {
            console.log(`Продукт ${p.name} невидимий:`, p);
            return false;
        }
        const name = normalizeString(p.name);
        const brand = normalizeString(p.brand || '');
        const description = normalizeString(p.description || '');
        const matches = name.includes(query) || brand.includes(query) || description.includes(query);
        console.log(`Продукт ${p.name}, збіги: ${matches}`, { name, brand, description });
        return matches;
    });

    baseSearchResults = [...searchResults];
    isSearchActive = true;
    currentProduct = null;
    currentCategory = null;
    currentSubcategory = null;

    const validSections = ['home', 'catalog', 'cart', 'contacts', 'about', 'product-details'];
    const currentSection = document.querySelector('.section.active')?.id;
    if (validSections.includes(currentSection)) {
        showSection('catalog');
    }

    renderCatalog();
    isSearchPending = false;
    const searchSlug = transliterate(query.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-'));
    history.replaceState({ sectionId: 'catalog', path: `/catalog/search/${searchSlug}` }, '', `/catalog/search/${searchSlug}`);
}

async function updateCartPrices() {
    cart.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) return;
        const isOnSale = product.salePrice && new Date(product.saleEnd) > new Date();
        const colorIndex = selectedColors[product._id] || 0;
        const colorPriceChange = product.colors?.[colorIndex]?.priceChange || 0;

        if (product.type === 'mattresses' && selectedMattressSizes[product._id]) {
            item.price = product.sizes.find(s => s.name === selectedMattressSizes[product._id])?.price || product.price;
        } else if (!isOnSale && product.salePrice) {
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
    if (!cartItems || !cartContent) {
        console.error('Елементи cart-items або cart-content не знайдено');
        showNotification('Помилка відображення кошика!', 'error');
        return;
    }

    const activeElement = document.activeElement;
    const activeElementId = activeElement?.id;
    const activeElementValue = activeElement?.value || '';

    const existingTimers = cartItems.querySelectorAll('.sale-timer');
    existingTimers.forEach(timer => {
        if (timer.dataset.intervalId) clearInterval(parseInt(timer.dataset.intervalId));
    });
    while (cartItems.firstChild) cartItems.removeChild(cartItems.firstChild);
    while (cartContent.firstChild) cartContent.removeChild(cartContent.firstChild);

    console.log('Відображення кошика, поточний кошик:', cart);
    if (!Array.isArray(cart) || cart.length === 0) {
        const p = document.createElement('p');
        p.className = 'empty-cart';
        p.textContent = 'Кошик порожній';
        cartContent.appendChild(p);
        renderBreadcrumbs();
        updateCartCount();
        return;
    }

    await updateCartPrices();

    cart.forEach((item, index) => {
        const product = products.find(p => p.id === item.id);
        if (!product) {
            console.warn(`Товар із id ${item.id} не знайдено, видаляємо з кошика`);
            cart.splice(index, 1);
            saveToStorage('cart', cart);
            return;
        }
        if (!product.slug) {
            console.error(`Slug відсутній для продукту:`, product);
            return;
        }
        const itemDiv = document.createElement('div');
        itemDiv.className = 'cart-item';

        itemDiv.addEventListener('click', (e) => {
            const target = e.target;
            if (!target.closest('button') && !target.closest('input') && target.tagName !== 'IMG' && target.tagName !== 'SPAN') {
                window.getSelection().removeAllRanges();
            }
        });

        const img = document.createElement('img');
        img.src = item.photo || (product.photos?.[0] || NO_IMAGE_URL);
        img.className = 'cart-item-image';
        img.alt = item.name;
        img.loading = 'lazy';
        img.style.cursor = 'pointer';
        img.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openProduct(product.slug);
        };
        itemDiv.appendChild(img);

        const span = document.createElement('span');
        span.textContent = `${item.name}${item.color && item.color.name ? ` (${item.color.name})` : ''} - ${item.price * item.quantity} грн`;
        span.style.cursor = 'pointer';
        span.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openProduct(product.slug);
        };
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
        qtyInput.className = 'quantity-input';
        qtyInput.min = '1';
        qtyInput.value = item.quantity;
        qtyInput.style.appearance = 'none';
        qtyInput.style.MozAppearance = 'none';
        qtyInput.style.WebkitAppearance = 'none';
        qtyInput.oninput = (e) => {
            let newQty = parseInt(e.target.value) || 1;
            if (newQty < 1) newQty = 1;
            if (cart[index].quantity !== newQty) {
                cart[index].quantity = newQty;
                saveToStorage('cart', cart);
                updateCartCount();
                debouncedRenderCart();
                saveCartToServer().catch(error => {
                    console.error('Помилка синхронізації кошика з сервером:', error);
                    showNotification('Дані збережено локально, але не вдалося синхронізувати з сервером.', 'warning');
                });
            }
        };
        qtyInput.onwheel = (e) => e.preventDefault();
        qtyInput.onkeydown = (e) => {
            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault();
        };
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
    totalP.textContent = `Загалом: ${cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)} грн`;
    cartContent.appendChild(totalP);

    const h3 = document.createElement('h3');
    h3.textContent = 'Оформити замовлення';
    cartContent.appendChild(h3);

    const form = document.createElement('div');
    form.id = 'order-form';
    form.className = 'order-form';

    form.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    orderFields.forEach(f => {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'form-group';

        const label = document.createElement('label');
        label.htmlFor = `order-${f.name}`;
        label.textContent = `${f.label}${f.required ? ' *' : ''}`;
        groupDiv.appendChild(label);

        const savedValue = localStorage.getItem(`order-${f.name}`) || '';
        if (f.type === 'select') {
            const select = document.createElement('select');
            select.id = `order-${f.name}`;
            select.className = 'order-input custom-select';
            select.onchange = (e) => {
                localStorage.setItem(`order-${f.name}`, e.target.value);
            };
            const defaultOption = document.createElement('option');
            defaultOption.value = '';
            defaultOption.textContent = `Оберіть ${f.label.toLowerCase()}`;
            select.appendChild(defaultOption);
            f.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                if (savedValue === opt) option.selected = true;
                select.appendChild(option);
            });
            groupDiv.appendChild(select);
        } else {
            const input = document.createElement('input');
            input.type = f.type;
            input.id = `order-${f.name}`;
            input.className = 'order-input';
            input.required = f.required;
            input.value = savedValue;
            input.oninput = (e) => localStorage.setItem(`order-${f.name}`, e.target.value);
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

    if (activeElementId) {
        const newElement = document.getElementById(activeElementId);
        if (newElement) {
            newElement.value = activeElementValue || localStorage.getItem(activeElementId) || '';
            newElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            newElement.focus();
            if (activeElement.selectionStart !== undefined && activeElement.selectionEnd !== undefined) {
                newElement.setSelectionRange(activeElement.selectionStart, activeElement.selectionEnd);
            }
        }
    }

    renderBreadcrumbs();
    updateCartCount();

    const style = document.createElement('style');
    style.textContent = `
        .quantity-input::-webkit-outer-spin-button,
        .quantity-input::-webkit-inner-spin-button {
            -webkit-appearance: none;
            margin: 0;
        }
        .quantity-input {
            -moz-appearance: textfield;
            appearance: none;
        }
    `;
    document.head.appendChild(style);
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
        
        saveToStorage('cart', cart);
        updateCartCount();
        await debouncedRenderCart();
        showNotification(`${removedItem.name} видалено з кошика!`, 'success');
        
        try {
            await saveCartToServer();
        } catch (error) {
            console.error('Помилка синхронізації кошика з сервером:', error);
            showNotification('Дані збережено локально, але не вдалося синхронізувати з сервером.', 'warning');
        }
        
        showSection('cart');
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
        
        saveToStorage('cart', cart);
        updateCartCount();
        debouncedRenderCart();
        
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

    const missingFields = orderFields.filter(f => f.required && !customer[f.name]);
    if (missingFields.length > 0) {
        showNotification(`Будь ласка, заповніть обов'язкові поля: ${missingFields.map(f => f.label).join(', ')}!`, 'error');
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

    if (!cart || cart.length === 0) {
        showNotification('Кошик порожній! Додайте товари перед оформленням замовлення.', 'error');
        return;
    }

    for (const item of cart) {
        if (!item.id || typeof item.id !== 'number' || !item.name || typeof item.quantity !== 'number' || typeof item.price !== 'number') {
            showNotification('Помилка: кошик містить некоректні дані!', 'error');
            return;
        }
        const product = products.find(p => p.id === item.id);
        if (!product) {
            showNotification(`Товар "${item.name}" більше недоступний!`, 'error');
            return;
        }
    }

    const orderData = {
        cartId: localStorage.getItem('cartId') || '',
        date: new Date().toISOString(),
        status: 'Нове замовлення',
        total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
        customer,
        items: cart.map(item => {
            const product = products.find(p => p.id === item.id);
            let colorData = null;
            if (item.color && item.color.name) {
                colorData = {
                    name: item.color.name || 'Не вказано',
                    value: item.color.value || item.color.name || '',
                    priceChange: item.color.priceChange || 0,
                    photo: item.color.photo || ''
                };
                if (item.color.size) {
                    colorData.size = item.color.size;
                }
            }
            return {
                id: Number(item.id),
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                photo: item.photo || (product?.photos?.[0] || NO_IMAGE_URL),
                color: colorData
            };
        })
    };

    orderData.items = orderData.items.filter(item => {
        const isValid = item && typeof item.id === 'number' && item.name && typeof item.quantity === 'number' && typeof item.price === 'number';
        if (!isValid) {
            console.warn('Елемент замовлення видалено через некоректні дані:', item);
        }
        return isValid;
    });

    if (orderData.items.length === 0) {
        showNotification('Помилка: немає валідних товарів для замовлення!', 'error');
        return;
    }

    if (!confirm('Підтвердити оформлення замовлення?')) return;

    console.log('Дані замовлення перед відправкою:', JSON.stringify(orderData, null, 2));

    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
        try {
            let csrfToken = localStorage.getItem('csrfToken');
            if (!csrfToken) {
                console.warn('CSRF-токен відсутній, намагаємося отримати новий');
                csrfToken = await fetchCsrfToken();
                if (!csrfToken) {
                    throw new Error('Не вдалося отримати CSRF-токен');
                }
            }

            const response = await fetch(`${BASE_URL}/api/orders`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-Token': csrfToken,
                    'Accept': 'application/json'
                },
                body: JSON.stringify(orderData),
                credentials: 'include'
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.error(`Помилка сервера (спроба ${attempt + 1}): ${response.status}, Тіло: ${errorText}`);

                if (response.status === 403) {
                    console.warn('CSRF-токен недійсний, очищаємо та пробуємо ще раз');
                    localStorage.removeItem('csrfToken');
                    if (attempt < maxRetries - 1) {
                        csrfToken = await fetchCsrfToken();
                        if (!csrfToken) {
                            throw new Error('Не вдалося отримати новий CSRF-токен');
                        }
                        attempt++;
                        continue;
                    }
                } else if (response.status === 400) {
                    try {
                        const errorData = JSON.parse(errorText);
                        showNotification(`Помилка: ${errorData.message || 'Некоректні дані замовлення'}`, 'error');
                    } catch (e) {
                        showNotification(`Помилка: ${errorText}`, 'error');
                    }
                    return;
                } else if (response.status === 429) {
                    showNotification('Занадто багато запитів. Спробуйте ще раз пізніше.', 'error');
                    return;
                }
                throw new Error(`Помилка сервера: ${response.status} - ${errorText}`);
            }

            const responseData = await response.json();
            if (!responseData || !responseData.id) {
                throw new Error('Некоректна відповідь сервера: orderId відсутній');
            }

            console.log('Замовлення успішно оформлено:', responseData);

            cart = [];
            saveToStorage('cart', cart);
            const newCartId = 'cart-' + Math.random().toString(36).substr(2, 9);
            localStorage.setItem('cartId', newCartId);
            selectedColors = {};
            selectedMattressSizes = {};
            saveToStorage('selectedColors', selectedColors);
            saveToStorage('selectedMattressSizes', selectedMattressSizes);
            orderFields.forEach(f => localStorage.removeItem(`order-${f.name}`));
            await saveCartToServer();

            showNotification('Замовлення оформлено! Дякуємо!', 'success');
            showSection('home');
            return;

        } catch (error) {
            console.error(`Помилка при оформленні замовлення (спроба ${attempt + 1}):`, error);
            attempt++;
            if (attempt >= maxRetries) {
                console.error('Усі спроби оформлення замовлення провалилися');
                orders.push(orderData);
                if (orders.length > 5) orders = orders.slice(-5);
                saveToStorage('orders', orders);
                showNotification('Не вдалося оформити замовлення! Дані збережено локально.', 'warning');
                return;
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
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

function openGallery(productSlug, index = 0) {
    const product = products.find(p => p.slug === productSlug);
    if (!product || !product.photos || product.photos.length === 0) {
        console.error('Товар або фотографії не знайдено:', { productSlug, product });
        return;
    }
    console.log('Відкриття галереї для товару:', product.name, 'Slug:', product.slug, 'Фотографії:', product.photos);
    currentGalleryImages = []; 
    currentGalleryImages = [...product.photos];
    console.log('currentGalleryImages:', currentGalleryImages);
    currentGalleryIndex = Math.max(0, Math.min(index, product.photos.length - 1));
    const modal = document.getElementById('gallery-modal');
    const img = document.getElementById('gallery-image');
    if (modal && img) {
        img.src = currentGalleryImages[currentGalleryIndex];
        console.log('Встановлено зображення:', img.src);
        modal.style.display = 'flex';
        modal.classList.add('active');
    } else {
        console.error('Модальне вікно або зображення не знайдено:', { modal, img });
    }
}

function closeGallery() {
    const modal = document.getElementById('gallery-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
    }
    currentGalleryImages = []; 
    currentGalleryIndex = 0;
    console.log('Галерею закрито, currentGalleryImages очищено');
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

async function handleNavigation(path, isPopstate = false) {
    try {
        console.log('Обробка навігації для шляху:', path, 'isPopstate:', isPopstate);
        const parts = path.split('/').filter(p => p);

        if (!categories.length || !products.length) {
            console.warn('Дані ще не завантажені, чекаємо ініціалізації...');
            await initializeData();
        }

        if (!parts.length) {
            currentCategory = null;
            currentSubcategory = null;
            currentProduct = null;
            isSearchActive = false;
            showSection('home');
            return;
        }

        if (parts[0] === 'cart') {
            showSection('cart');
        } else if (parts[0] === 'contacts') {
            showSection('contacts');
        } else if (parts[0] === 'about') {
            showSection('about');
        } else if (parts[0] === 'catalog') {
            currentCategory = null;
            currentSubcategory = null;
            currentProduct = null;
            isSearchActive = false;
            showSection('catalog');
        } else {
            const cat = categories.find(c => transliterate(c.name.replace('ь', '')) === parts[0]);
            if (cat) {
                currentCategory = cat.name;
                currentSubcategory = null;
                currentProduct = null;
                isSearchActive = false;

                if (parts[1]) {
                    const subCat = cat.subcategories?.find(sc => transliterate(sc.name.replace('ь', '')) === parts[1]);
                    if (subCat) {
                        currentSubcategory = subCat.name; // Зберігаємо назву для відображення
                    }
                    if (parts[2]) {
                        const product = await fetchProductBySlug(parts[2]);
                        if (product) {
                            currentProduct = product;
                            currentCategory = product.category;
                            currentSubcategory = product.subcategory 
                                ? cat.subcategories?.find(sc => sc.slug === product.subcategory)?.name || null
                                : null;
                            showSection('product-details');
                            return;
                        } else {
                            console.error('Продукт не знайдено для slug:', parts[2]);
                            showNotification('Товар не знайдено!', 'error');
                            showSection('home');
                            return;
                        }
                    }
                }
                showSection('catalog');
            } else {
                console.error('Категорія не знайдена для slug:', parts[0]);
                showNotification('Сторінку не знайдено!', 'error');
                showSection('home');
            }
        }

        if (!isPopstate) {
            const stateId = `nav_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            history.pushState({ sectionId: document.querySelector('.section.active')?.id, path, stateId }, '', `/${path}`);
        }
    } catch (error) {
        console.error('Помилка обробки навігації:', error);
        showNotification('Помилка завантаження сторінки!', 'error');
        showSection('home');
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('Ініціалізація програми...');
        await initializeData();
        updateHeader();
        updateCartCount();

        // Налаштування каталогу
        const catalogToggle = document.getElementById('catalog-toggle');
        const catalogDropdown = document.getElementById('catalog-dropdown');
        if (catalogToggle && catalogDropdown) {
            catalogToggle.addEventListener('click', (e) => {
                e.preventDefault();
                catalogDropdown.classList.toggle('active');
            });
        } else {
            console.warn('Елементи catalog-toggle або catalog-dropdown не знайдено');
        }

        // Налаштування пошуку
        const searchInput = document.getElementById('search');
        const searchButton = document.querySelector('.search-btn');
        if (searchInput) {
            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    searchProducts();
                }
            });
        } else {
            console.warn('Поле пошуку не знайдено');
        }
        if (searchButton) {
            searchButton.addEventListener('click', (e) => {
                e.preventDefault();
                searchProducts();
            });
        } else {
            console.warn('Кнопка пошуку не знайдено');
        }

        // Налаштування навігації
        const navLinks = [
            { id: 'nav-home', section: 'home' },
            { id: 'nav-contacts', section: 'contacts' },
            { id: 'nav-about', section: 'about' },
            { id: 'logo', section: 'home' },
            { id: 'cart', section: 'cart' }
        ];

        navLinks.forEach(link => {
            const element = document.getElementById(link.id);
            if (element) {
                element.addEventListener('click', (e) => {
                    e.preventDefault();
                    showSection(link.section);
                });
            } else {
                console.warn(`Елемент із ID ${link.id} не знайдено`);
            }
        });

        // Обробка початкового шляху
        const path = window.location.pathname.slice(1) || '';
        console.log('Обробка початкового шляху:', path);
        await handleNavigation(path);

        // Обробка кліків у кошику
        const cartItems = document.getElementById('cart-items');
        if (cartItems) {
            cartItems.addEventListener('click', (e) => {
                const target = e.target;
                if (target.tagName === 'IMG' || target.tagName === 'SPAN') {
                    return;
                }
                if (!target.closest('button') && !target.closest('input')) {
                    window.getSelection().removeAllRanges();
                }
            });
        }

        // Логіка фільтрів
        const filterToggle = document.querySelector('.filter-toggle');
        const filterBtn = document.querySelector('.filter-btn');
        const filters = document.querySelector('.filters');
        const backBtn = document.querySelector('.filters .back-btn');

        if (filterToggle) {
            filterToggle.addEventListener('click', () => filters.classList.toggle('active'));
        }
        if (filterBtn) {
            filterBtn.addEventListener('click', () => filters.classList.toggle('active'));
        }
        if (backBtn) {
            backBtn.addEventListener('click', () => filters.classList.remove('active'));
        }

        // Ініціалізація даних, якщо їх немає
        if (!localStorage.getItem('products')) {
            const initialProducts = [
                { id: 1, name: "Стіл дерев'яний", price: "5000", image: "https://picsum.photos/200/200" },
                // Додайте інші товари за потребою
            ];
            saveToStorage('products', initialProducts); // Використовуємо saveToStorage
        }

        console.log('Програма ініціалізована успішно');
    } catch (error) {
        console.error('Помилка в DOMContentLoaded:', error);
        showNotification('Помилка ініціалізації сторінки!', 'error');
    }
});

window.addEventListener('popstate', async (event) => {
    try {
        console.log('Подія popstate:', window.location.pathname, 'state:', event.state);
        const path = window.location.pathname.slice(1) || '';
        await handleNavigation(path, true);
    } catch (error) {
        console.error('Помилка в обробнику popstate:', error);
        showNotification('Помилка навігації!', 'error');
        showSection('home');
    }
});

const style = document.createElement('style');
style.textContent = `
    .category a, .subcategories a, .dropdown-item span, .sub-dropdown p {
        text-decoration: none !important;
    }
    .category a:hover, .subcategories a:hover, .dropdown-item span:hover, .sub-dropdown p:hover {
        text-decoration: none !important;
    }
`;
document.head.appendChild(style);