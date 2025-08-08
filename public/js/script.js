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
let currentPage = 1;
const perPage = 20;
let selectedMattressSizes = {};
let currentSlideIndex = 0;
let slideInterval;
let currentGalleryIndex = 0;
let currentGalleryImages = [];
let removeCartIndex = -1;
let searchResults = [];
let baseSearchResults = [];
let baseFilteredProducts = [];
let isSearchActive = false;
let isSearchPending = false;
let filteredProducts = [];
let selectedColors = {};
let ws;
const activeTimers = new Map();
let parentGroupProduct = null;
let searchQuery = '';
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
            const result = data.map(product => {
                if (product.subcategory && !validSubcategories.includes(product.subcategory)) {
                    console.warn(`Очищаємо невалідну підкатегорію ${product.subcategory} для товару ${product.name}`);
                    return { ...product, subcategory: null };
                }
                return product;
            });
            result.forEach(p => {
                if (p.type === 'mattresses') {
                    p.salePrice = null;
                    p.saleEnd = null;
                }
            });
            return result;
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
            console.error('Локальне сховище очищено через перевищення квоти.');
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
            cart = data.map(item => {
                const product = products.find(p => p._id === item.id || p.id === item.id);
                if (product?.type === 'mattresses') {
                    return {
                        id: product._id || item.id,
                        name: item.name || '',
                        quantity: item.quantity || 1,
                        price: item.price || 0,
                        photo: item.photo || '',
                        color: null,
                        size: item.size || null
                    };
                }
                
                // Для товарів з кольорами відновлюємо структуру кольорів
                let colors = null;
                if (item.color) {
                    // Для старої структури або коли є тільки один колір
                    colors = [{
                        name: item.color.name,
                        value: item.color.value || item.color.name,
                        priceChange: parseFloat(item.color.priceChange || 0),
                        photo: item.color.photo,
                        globalIndex: 0,
                        blockIndex: 0,
                        colorIndex: 0
                    }];
                }
                // Примітка: для товарів з кількома кольорами, інформація про всі кольори
                // не зберігається на сервері, тому після перезавантаження сторінки
                // буде відображатися тільки ціна без назв всіх кольорів
                
                return {
                    id: product._id || item.id,
                    name: item.name || '',
                    quantity: item.quantity || 1,
                    price: item.price || 0,
                    photo: item.photo || '',
                    colors: colors,
                    color: item.color || null,
                    size: item.size || null
                };
            });
        } else {
            cart = loadFromStorage('cart', []);
            console.log('Сервер повернув порожній кошик, використовуємо локальні дані:', cart);
            if (cart.length > 0) {
                await saveCartToServer();
            }
        }

        cart = cart.filter(item => {
            const isValid = item && (typeof item.id === 'string' || typeof item.id === 'number') && item.name && typeof item.quantity === 'number' && typeof item.price === 'number';
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
            const isValid = item && (typeof item.id === 'string' || typeof item.id === 'number') && item.name && typeof item.quantity === 'number' && typeof item.price === 'number';
            if (!isValid) {
                console.warn('Елемент кошика видалено через некоректні дані:', item);
            }
            return isValid;
        });
        saveToStorage('cart', cart);
        console.warn('Не вдалося завантажити кошик із сервера. Використано локальні дані.');
        try {
            await triggerCleanupOldCarts();
        } catch (cleanupError) {
            console.error('Помилка очищення старих кошиків:', cleanupError);
        }
        updateCartCount();
    }
}

async function saveCartToServer() {
    try {
        let cartItems = loadFromStorage('cart', []);

        if (!Array.isArray(cartItems)) {
            console.warn('Кошик у localStorage не є масивом, скидаємо');
            cartItems = [];
            saveToStorage('cart', cartItems);
        }

        const filteredCartItems = cartItems
            .map(item => {
                if (typeof item.id !== 'string' && typeof item.id !== 'number') {
                    console.warn('Некоректний ID в елементі кошика:', item);
                    return null;
                }
                const product = products.find(p => p._id === item.id || p.id === item.id);
                if (!product) {
                    console.warn('Товар не знайдено для ID:', item.id);
                    return null;
                }
                let colorData = null;
                let sizeData = item.size || null;
                let price = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date()) ? parseFloat(product.salePrice) : parseFloat(product.price || 0);

                if (product.type === 'mattresses') {
                    if (item.color && !item.size && product.sizes?.some(s => s.name === item.color.name)) {
                        console.warn(`Невалідний елемент матраца ${item.name}: розмір в color (${item.color.name}), але size null. Пропускаємо.`);
                        return null;
                    }
                    if (item.size) {
                        const sizeInfo = product.sizes?.find(s => s.name === item.size);
                        if (!sizeInfo) {
                            console.warn(`Розмір ${item.size} не знайдено для товару ${item.name}`);
                            return null;
                        }
                        // Спочатку перевіряємо акційну ціну розміру
                        if (sizeInfo.salePrice && sizeInfo.salePrice < sizeInfo.price) {
                            price = parseFloat(sizeInfo.salePrice);
                        } else {
                            price = parseFloat(sizeInfo.price || price);
                        }
                        sizeData = item.size;
                    } else {
                        console.log(`Матрац ${item.name} без розміру, використовуємо базову ціну: ${price}`);
                    }
                } else if (item.colors && Array.isArray(item.colors) && item.colors.length > 0) {
                    // Нова структура - масив кольорів
                    let totalColorPriceChange = 0;
                    
                    item.colors.forEach(color => {
                        if (color && color.priceChange) {
                            totalColorPriceChange += parseFloat(color.priceChange);
                        }
                    });
                    price += totalColorPriceChange;
                    
                    // Для товарів з кількома кольорами не встановлюємо color,
                    // щоб уникнути помилки валідації на сервері
                    colorData = null;
                } else if (item.color) {
                    // Стара структура - один колір
                    colorData = {
                        name: item.color.name || 'Не вказано',
                        value: item.color.value || item.color.name || '',
                        priceChange: parseFloat(item.color.priceChange || 0),
                        photo: item.color.photo || null
                    };
                    price += parseFloat(colorData.priceChange || 0);
                }

                const cartItem = {
                    id: product._id || item.id,
                    name: item.name || '',
                    quantity: Number(item.quantity) || 1,
                    price: parseFloat(price) || 0,
                    photo: product.photos?.[0] || NO_IMAGE_URL,
                    color: colorData,
                    colors: item.colors && Array.isArray(item.colors) && item.colors.length > 0 ? item.colors : undefined,
                    size: sizeData
                };
                return cartItem;
            })
            .filter(item => item !== null && item.name && item.quantity > 0 && item.price >= 0 && !isNaN(item.price));

        console.log('Дані кошика перед відправкою:', JSON.stringify(filteredCartItems, null, 2));
        // Логування для діагностики (можна видалити після виправлення)
        // console.log('Детальна інформація про товари в кошику:');
        // filteredCartItems.forEach((item, index) => {
        //     console.log(`Товар ${index + 1}:`, {
        //         id: item.id,
        //         idType: typeof item.id,
        //         name: item.name,
        //         quantity: item.quantity,
        //         price: item.price
        //     });
        // });

        if (!BASE_URL) {
            console.error('BASE_URL не визначено');
            console.error('Помилка: сервер недоступний. Дані збережено локально.');
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
                        showNotification(`Помилка: ${JSON.parse(errorText).error || 'Некоректні дані кошика.'}`, 'error');
                        return;
                    }
                    throw new Error(`Помилка сервера: ${response.status} - ${errorText}`);
                }

                const responseBody = await response.json();
                console.log('Кошик успішно збережено на сервері:', responseBody);

                cart = filteredCartItems.map(item => ({
                    ...item,
                    id: item.id,
                    quantity: Number(item.quantity),
                    price: parseFloat(item.price),
                    size: item.size
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
    } catch (error) {
        console.error('Критична помилка в saveCartToServer:', error);
        console.error('Помилка збереження кошика!');
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
        console.error('Не вдалося очистити старі кошики!');
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
        console.warn('Не вдалося завантажити дані з сервера. Використано локальні дані.');
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
                console.error('Не вдалося отримати CSRF-токен. Спробуйте ще раз.');
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
                console.error('Помилка синхронізації даних: ' + message.error);
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
                    console.error('Помилка: виявлено товари з однаковими ідентифікаторами!');
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
            console.error('Помилка обробки даних із сервера!');
        }
    };

    ws.onerror = (error) => {
        console.error('Помилка WebSocket:', error);
        console.error('Помилка з\'єднання з сервером!');
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
            console.error('Не вдалося підключитися до сервера після кількох спроб.');
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
    currentSort = loadFromStorage('currentSort', '');
    const activeFilters = loadFromStorage('activeFilters', {});

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
        { name: 'promo', label: 'Товари з акціями', type: 'checkbox', options: ['Акція'] },
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
    // Спочатку спробуємо завантажити дані через HTTP швидко
    await fetchPublicData();
    
    // Якщо HTTP не дав результатів, чекаємо на WebSocket
    if (products.length === 0 || categories.length === 0) {
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
                    console.warn('Дані від WebSocket не отримано, повторно використовуємо HTTP');
                    await fetchPublicData();
                    if (products.length === 0 || categories.length === 0) {
                        console.error('Дані не завантажено через HTTP:', { products: products.length, categories: categories.length });
                        console.error('Не вдалося завантажити дані з сервера!');
                    } else {
                        console.log('Дані отримано через HTTP:', { products: products.length, categories: categories.length });
                    }
                    clearInterval(checkInterval);
                    resolve();
                }
            }, 2000);
        });
    } else {
        console.log('Дані отримано через HTTP:', { products: products.length, categories: categories.length });
    }

    restoreSearchState();

    // Відновлюємо фільтри та сортування
    if (Object.keys(activeFilters).length > 0) {
        applySavedFilters(activeFilters);
    }
    if (currentSort) {
        sortProducts(currentSort);
    }
    
    // Відновлюємо графічне відображення вибраних кольорів
    restoreSelectedColors();

    updateHeader();
    renderCategories();
    renderCatalogDropdown();
    if (typeof updateFloatingFavorite === 'function') {
        updateFloatingFavorite();
    }
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
    let allProducts = isSearchActive ? searchResults : filteredProducts;
    const productGrid = document.querySelector('.product-grid');
    const productList = document.querySelector('.product-list');
    
    // Визначаємо який елемент використовується
    const productContainer = productGrid || productList;
    if (!productContainer) {
        console.warn('Елемент .product-grid або .product-list не знайдено');
        return;
    }

    console.log('loadMoreProducts: currentPage=', currentPage, 'allProducts.length=', allProducts.length);

    const currentCount = productContainer.children.length;
    const productsPerLoad = currentCount >= perPage ? 14 : perPage - currentCount;
    const startIndex = currentCount;
    const productsToShow = allProducts.slice(startIndex, startIndex + productsPerLoad);

    console.log('productsToShow.length=', productsToShow.length, 'startIndex=', startIndex, 'productsPerLoad=', productsPerLoad);

    if (productsToShow.length === 0) {
        const showMoreBtn = document.querySelector('.show-more-btn');
        if (showMoreBtn) {
            showMoreBtn.disabled = true;
            showMoreBtn.innerHTML = '<span style="font-size: 18px; margin-right: 8px;">&#10004;</span><span>Більше немає товарів</span>';
        }
        return;
    }

    while (productContainer.firstChild) {
        productContainer.removeChild(productContainer.firstChild);
    }

    const allProductsToShow = allProducts.slice(0, startIndex + productsPerLoad);
    let addedCount = 0;

    allProductsToShow.forEach(product => {
        const productElement = createProductElement(product);
        productContainer.appendChild(productElement);
        addedCount++;
    });

    console.log('Added products:', addedCount);

    // Оновлюємо currentPage на основі кількості відображених товарів
    const newDisplayedCount = productContainer.children.length;
    currentPage = Math.ceil(newDisplayedCount / perPage);
    console.log('Updated currentPage to:', currentPage, 'based on displayed count:', newDisplayedCount);

    const showMoreBtn = document.querySelector('.show-more-btn');
    if (showMoreBtn) {
        if (newDisplayedCount >= allProducts.length) {
            showMoreBtn.disabled = true;
            showMoreBtn.innerHTML = '<span style="font-size: 18px; margin-right: 8px;">&#10004;</span><span>Більше немає товарів</span>';
        } else {
            showMoreBtn.disabled = false;
            showMoreBtn.innerHTML = '<span style="font-size: 18px; margin-right: 8px;">&#8634;</span><span>Показати ще</span>';
        }
    }

    const totalPages = Math.ceil(allProducts.length / perPage);
    renderPagination(totalPages, allProducts.length, true);

    updateHistoryState();
}

async function updateFloatingGroupCart() {
    const floatingGroupCart = document.getElementById('floating-group-cart');
    if (!floatingGroupCart || !currentProduct || currentProduct.type !== 'group') {
        if (floatingGroupCart) {
            floatingGroupCart.classList.remove('visible');
        }
        return;
    }

    try {
        const savedSelection = loadFromStorage(`groupSelection_${currentProduct._id}`, {});
        let totalPrice = 0;
        let hasSelection = false;

        currentProduct.groupProducts.forEach(id => {
            const product = products.find(p => p._id === id);
            if (product && savedSelection[id] && savedSelection[id] > 0) {
                const isOnSale = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date());
                let price = isOnSale ? parseFloat(product.salePrice) : parseFloat(product.price || 0);

                if (selectedColors[id] && Object.keys(selectedColors[id]).length > 0) {
                    const allColors = getAllColors(product);
                    Object.values(selectedColors[id]).forEach(globalIndex => {
                        const selectedColor = allColors.find(color => color.globalIndex === globalIndex);
                        if (selectedColor) {
                            price += parseFloat(selectedColor.priceChange || 0);
                        }
                    });
                }

                if (product.type === 'mattresses' && selectedMattressSizes[id]) {
                    const sizeInfo = product.sizes?.find(s => s.name === selectedMattressSizes[id]);
                    if (sizeInfo) {
                        price = parseFloat(sizeInfo.price || price);
                    }
                }

                totalPrice += price * savedSelection[id];
                hasSelection = true;
            }
        });

        const floatingPrice = floatingGroupCart.querySelector('.floating-group-price span');
        if (floatingPrice) {
            floatingPrice.textContent = `${totalPrice} грн`;
        }

        const floatingBtn = floatingGroupCart.querySelector('.floating-group-buy-btn');
        if (floatingBtn) {
            floatingBtn.disabled = !hasSelection;
            floatingBtn.onclick = hasSelection ? () => addGroupToCart(currentProduct._id) : null;
        }

        floatingGroupCart.classList.toggle('visible', hasSelection && currentProduct.type === 'group');
        
        // Відновлюємо графічне відображення вибраних кольорів
        restoreSelectedColors();

    } catch (error) {
        console.error('Помилка в updateFloatingGroupCart:', error);
        console.error('Помилка в updateFloatingGroupCart:', error);
    }
}

function showSection(sectionId) {
    console.log('showSection: Відображаємо секцію:', sectionId);

    // Очищаємо обробники випадаючих меню розмірів
    document.querySelectorAll('.custom-select').forEach(select => {
        if (select._closeDropdownHandler) {
            document.removeEventListener('click', select._closeDropdownHandler);
            delete select._closeDropdownHandler;
        }
    });

    document.querySelectorAll('.section').forEach(el => {
        el.classList.remove('active');
        el.style.display = 'none';
    });

    const section = document.getElementById(sectionId);
    const burgerMenu = document.getElementById('burger-menu');
    const burgerContent = document.getElementById('burger-content');
    const filters = document.querySelector('.filters');
    const floatingCart = document.getElementById('floating-cart');
    const floatingGroupCart = document.getElementById('floating-group-cart');

    if (filters && window.innerWidth < 992) {
        filters.classList.remove('active');
    }

    if (!section) {
        console.warn(`Секція з ID ${sectionId} не знайдена`);
        console.warn(`Секція з ID ${sectionId} не знайдена`);
        showSection('home');
        return;
    }

    section.classList.add('active');
    section.style.display = 'block';

    if (burgerMenu && floatingCart) {
        const header = document.querySelector('header');
        const headerHeight = header ? header.offsetHeight : 0;
        const floatingFavorite = document.getElementById('floating-favorite');
        const handleScroll = () => {
            // Перевіряємо, чи видно постійні кнопки (хедер)
            const header = document.querySelector('header');
            const headerBottom = header ? header.offsetTop + header.offsetHeight : 0;
            const isHeaderVisible = window.scrollY < headerBottom;
            
            // Не показуємо плаваючі кнопки на головній сторінці
            const isHomePage = sectionId === 'home';
            
            // Спрощена логіка: показуємо плаваючі кнопки при прокручуванні більше 100px
            if (window.scrollY > 100 && !isHomePage) {
                burgerMenu.classList.add('visible');
                floatingCart.classList.add('visible');
                if (floatingFavorite) {
                    floatingFavorite.classList.add('visible');
                }
                if (sectionId === 'product-details' && currentProduct?.type === 'group' && floatingGroupCart) {
                    floatingGroupCart.classList.add('visible');
                }

            } else {
                burgerMenu.classList.remove('visible');
                floatingCart.classList.remove('visible');
                if (floatingFavorite) {
                    floatingFavorite.classList.remove('visible');
                }
                if (floatingGroupCart) {
                    floatingGroupCart.classList.remove('visible');
                }
                burgerMenu.classList.remove('active');
                burgerContent.classList.remove('active');

            }
        };

        if (window.scrollHandler) {
            window.removeEventListener('scroll', window.scrollHandler);
        }
        window.scrollHandler = handleScroll;
        window.addEventListener('scroll', handleScroll);
        
        // Викликаємо обробник одразу для перевірки поточного стану
        handleScroll();
    }

    if (burgerMenu && burgerContent) {
        burgerMenu.classList.remove('active');
        burgerContent.classList.remove('active');
    }

    let newPath = '/';
    const searchInput = document.getElementById('search');
    if (searchInput && sectionId !== 'catalog') {
        searchInput.value = '';
    }
    
    // Скидаємо фільтри при переході на інші сторінки (крім каталогу та кошика)
    if (sectionId !== 'catalog' && sectionId !== 'product-details' && sectionId !== 'cart') {
        clearFilters();
    }

    if (sectionId === 'home') {
        currentProduct = null;
        currentCategory = null;
        currentSubcategory = null;
        parentGroupProduct = null;
        saveToStorage('parentGroupProduct', null);
        isSearchActive = false;
        searchQuery = '';
        searchResults = [];
        baseSearchResults = [];
        saveToStorage('searchResults', []);
        saveToStorage('searchQuery', '');
        saveToStorage('isSearchActive', false);
        if (typeof renderCategories === 'function') {
            renderCategories();
        }
            if (typeof updateCartCount === 'function') {
        updateCartCount();
    }
    if (typeof updateFloatingFavorite === 'function') {
        updateFloatingFavorite();
    }
    newPath = '/';
    } else if (sectionId === 'catalog') {
        if (isSearchActive && searchQuery) {
            newPath = `/catalog/search/${transliterate(searchQuery.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-'))}`;
            if (typeof renderCatalog === 'function') {
                renderCatalog(null, null, null, searchResults);
            }
        } else if (currentCategory) {
            const catSlug = transliterate(currentCategory.replace('ь', ''));
            const subCatSlug = currentSubcategory ? transliterate(currentSubcategory.replace('ь', '')) : '';
            newPath = `/${catSlug}${subCatSlug ? `/${subCatSlug}` : ''}`;
            if (typeof renderCatalog === 'function') {
                renderCatalog(currentCategory, currentSubcategory, null);
            }
        } else {
            showSection('home');
            return;
        }
        if (currentPage > 1) {
            newPath += `?page=${currentPage}`;
        }
        if (typeof updateFloatingFavorite === 'function') {
            updateFloatingFavorite();
        }
    } else if (sectionId === 'cart') {
        parentGroupProduct = null;
        saveToStorage('parentGroupProduct', null);
        if (typeof renderCart === 'function') {
            renderCart();
        }
        if (typeof updateFloatingFavorite === 'function') {
            updateFloatingFavorite();
        }
        newPath = '/cart';
    } else if (sectionId === 'contacts') {
        if (typeof renderContacts === 'function') {
            renderContacts();
        }
        if (typeof updateFloatingFavorite === 'function') {
            updateFloatingFavorite();
        }
        newPath = '/contacts';
    } else if (sectionId === 'about') {
        if (typeof renderAbout === 'function') {
            renderAbout();
        }
        if (typeof updateFloatingFavorite === 'function') {
            updateFloatingFavorite();
        }
        newPath = '/about';
    } else if (sectionId === 'product-details') {
        if (!currentProduct) {
            if (typeof showNotification === 'function') {
                showNotification('Товар не знайдено!', 'error');
            }
            showSection('home');
            return;
        }
        if (typeof renderProductDetails === 'function') {
            renderProductDetails().then(() => {
                if (currentProduct && currentProduct.type === 'group' && typeof updateFloatingGroupCart === 'function') {
                    updateFloatingGroupCart();
                }
                if (typeof updateFloatingFavorite === 'function') {
                    updateFloatingFavorite();
                }
            }).catch(error => {
                console.error('Помилка в renderProductDetails:', error);
                if (typeof showNotification === 'function') {
                    showNotification('Помилка при відображенні товару!', 'error');
                }
                showSection('home');
            });
        } else {
            console.error('renderProductDetails function is not defined');
            showSection('home');
            return;
        }
        const catSlug = currentCategory ? transliterate(currentCategory.replace('ь', '')) : '';
        const subCatSlug = currentSubcategory ? transliterate(currentSubcategory.replace('ь', '')) : '';
        newPath = `/${catSlug}${subCatSlug ? `/${subCatSlug}` : ''}/${currentProduct ? currentProduct.slug : ''}`;
    }

    const productGrid = document.querySelector('.product-grid');
    const displayedProducts = productGrid ? productGrid.children.length : 0;
    const state = {
        sectionId,
        path: newPath,
        stateId: `${sectionId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        currentPage: currentPage || 1,
        scrollY: sectionId === 'catalog' ? window.scrollY : 0,
        displayedProducts: sectionId === 'catalog' ? displayedProducts : 0,
        currentCategory: currentCategory,
        currentSubcategory: currentSubcategory,
        isSearchActive: isSearchActive,
        searchQuery: searchQuery
    };

    if (history.state && history.state.sectionId === sectionId && history.state.path === newPath) {
        history.replaceState(state, '', newPath);
    } else {
        history.pushState(state, '', newPath);
    }

    saveToStorage('currentCategory', currentCategory);
    saveToStorage('currentSubcategory', currentSubcategory);
    saveToStorage('lastCatalogState', state);
    if (typeof updateMetaTags === 'function') {
        updateMetaTags(sectionId === 'product-details' && currentProduct ? currentProduct : null, currentCategory, currentSubcategory);
    }
    if (typeof renderBreadcrumbs === 'function') {
        renderBreadcrumbs();
    }

    activeTimers.forEach((id) => clearInterval(id));
    activeTimers.clear();

    document.dispatchEvent(new Event('sectionChange'));

    // Скидання скролу випадаючого меню Каталог
    const catalogDropdown = document.getElementById('catalog-dropdown');
    if (catalogDropdown) {
        catalogDropdown.scrollTop = 0;
    }

    // Оновлюємо лічильники обраних товарів при зміні секції
    if (typeof updateFavoriteCount === 'function') {
        updateFavoriteCount();
    }
    if (typeof updateFloatingFavorite === 'function') {
        updateFloatingFavorite();
    }
}

function updateMetaTags(product = null, category = null, subcategory = null) {
    let title = settings.metaTitle || settings.name || 'Меблевий магазин';
    let description = settings.metaDescription || 'Меблевий магазин - широкий вибір меблів для дому.';
    let keywords = settings.metaKeywords || 'меблі, меблевий магазин, вітальні, спальні, кухні, матраци, купити меблі';
    let ogImage = settings.logo || '';

    if (category) {
        title = category.metaTitle || category.name || title;
        description = category.metaDescription || description;
        keywords = category.metaKeywords || keywords;
        ogImage = category.photo || ogImage;
    }
    if (subcategory) {
        title = subcategory.metaTitle || subcategory.name || title;
        description = subcategory.metaDescription || description;
        keywords = subcategory.metaKeywords || keywords;
        ogImage = subcategory.photo || ogImage;
    }
    if (product) {
        title = product.metaTitle || product.name || title;
        description = product.metaDescription || product.description || description;
        keywords = product.metaKeywords || keywords;
        ogImage = (product.photos && product.photos[0]) || ogImage;
    }
    document.title = title;
    const descTag = document.querySelector('meta[name="description"]');
    if (descTag) descTag.content = description;
    const keywordsTag = document.querySelector('meta[name="keywords"]');
    if (keywordsTag) keywordsTag.content = keywords;
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) ogTitle.content = title;
    const ogDesc = document.querySelector('meta[property="og:description"]');
    if (ogDesc) ogDesc.content = description;
    const ogImageTag = document.querySelector('meta[property="og:image"]');
    if (ogImageTag && ogImage) ogImageTag.content = ogImage;
    const twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (twitterTitle) twitterTitle.content = title;
    const twitterDesc = document.querySelector('meta[name="twitter:description"]');
    if (twitterDesc) twitterDesc.content = description;
    const twitterImage = document.querySelector('meta[name="twitter:image"]');
    if (twitterImage && ogImage) twitterImage.content = ogImage;
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
        
        // Якщо є поточний товар і він був знайдений через пошук, додаємо його категорію
        if (currentProduct && currentProduct.category) {
            searchSpan.appendChild(document.createTextNode(' > '));
            const categorySpan = document.createElement('span');
            const categoryLink = document.createElement('a');
            categoryLink.href = `/${currentProduct.category}`;
            // Знаходимо правильну назву категорії
            const cat = categories.find(c => c.slug === currentProduct.category);
            categoryLink.textContent = cat ? cat.name : currentProduct.category;
            categoryLink.classList.add('breadcrumb-link');
            categoryLink.style.display = 'inline-block';
            categoryLink.style.padding = '0 5px';
            categoryLink.onclick = (e) => {
                e.preventDefault();
                const cat = categories.find(c => c.slug === currentProduct.category);
                if (cat) {
                    currentCategory = cat.slug;
                    currentSubcategory = null;
                    currentProduct = null;
                    isSearchActive = false;
                    searchQuery = '';
                    searchResults = [];
                    showSection('catalog');
                }
            };
            categorySpan.appendChild(categoryLink);
            breadcrumbsContainer.appendChild(categorySpan);
            
            // Якщо є підкатегорія, додаємо її
            if (currentProduct.subcategory) {
                categorySpan.appendChild(document.createTextNode(' > '));
                const subcategorySpan = document.createElement('span');
                const subcategoryLink = document.createElement('a');
                
                // Знаходимо правильну назву підкатегорії
                const subCat = cat && cat.subcategories ? cat.subcategories.find(sc => sc.name === currentProduct.subcategory) : null;
                
                // Використовуємо slug для URL і назву для відображення
                subcategoryLink.href = `/${currentProduct.category}/${subCat ? subCat.slug : currentProduct.subcategory}`;
                subcategoryLink.textContent = subCat ? subCat.name : currentProduct.subcategory;
                subcategoryLink.classList.add('breadcrumb-link');
                subcategoryLink.style.display = 'inline-block';
                subcategoryLink.style.padding = '0 5px';
                subcategoryLink.onclick = (e) => {
                    e.preventDefault();
                    const cat = categories.find(c => c.slug === currentProduct.category);
                    if (cat) {
                        currentCategory = cat.slug;
                        currentSubcategory = subCat ? subCat.name : currentProduct.subcategory;
                        currentProduct = null;
                        isSearchActive = false;
                        searchQuery = '';
                        searchResults = [];
                        showSection('catalog');
                    }
                };
                subcategorySpan.appendChild(subcategoryLink);
                breadcrumbsContainer.appendChild(subcategorySpan);
            }
        }
    } else if (pathSegments.length > 0) {
        homeSpan.appendChild(document.createTextNode(' > '));
        let currentPath = '';

        pathSegments.forEach((segment, index) => {
            // Декодуємо URL сегмент
            const decodedSegment = decodeURIComponent(segment);
            currentPath = index === 0 ? `/${decodedSegment}` : `${currentPath}/${decodedSegment}`;
            


            const span = document.createElement('span');
            const link = document.createElement('a');
            link.href = currentPath;
            link.classList.add('breadcrumb-link');
            link.style.display = 'inline-block';
            link.style.padding = '0 5px';

            let displayText = decodedSegment;

            // Визначаємо, що показувати
            if (segment === 'contacts') displayText = 'Контакти';
            else if (segment === 'about') displayText = 'Про нас';
            else if (segment === 'cart') displayText = 'Кошик';
            else if (index === pathSegments.length - 1 && currentProduct) {
                displayText = currentProduct.name;
                link.style.cursor = 'default';
                link.onclick = (e) => e.preventDefault();
            } else {
                // Пошук категорії по slug
                const cat = categories.find(c => c.slug === decodedSegment);
                if (cat) {
                    displayText = cat.name;
                } else {
                    // Пошук підкатегорії по slug
                    // Спочатку знаходимо категорію з попереднього сегмента
                    if (index > 0) {
                        const prevSegment = decodeURIComponent(pathSegments[index - 1]);
                        const prevCat = categories.find(c => c.slug === prevSegment);
                        if (prevCat) {
                            // Спочатку шукаємо по точному slug
                            let subCat = (prevCat.subcategories || []).find(sc => sc.slug === decodedSegment);
                            
                            // Якщо не знайдено, шукаємо по транслитерованому slug
                            if (!subCat) {
                                subCat = (prevCat.subcategories || []).find(sc => transliterate(sc.name.replace('ь', '')) === decodedSegment);
                            }
                            
                            if (subCat) {
                                displayText = subCat.name;
                            }
                        }
                    }
                    // Якщо не знайдено в попередній категорії, шукаємо по всіх
                    if (displayText === decodedSegment) {
                        let subCat = categories.flatMap(c => c.subcategories || []).find(sc => sc.slug === decodedSegment);
                        if (subCat) {
                            displayText = subCat.name;
                        }
                    }
                }
            }

            link.textContent = displayText;
            link.dataset.path = currentPath;

            // Додаємо обробник переходу для всіх breadcrumb, крім останнього (поточна сторінка)
            if (index !== pathSegments.length - 1 || !currentProduct) {
                link.onclick = (e) => {
                    e.preventDefault();
                    const parts = currentPath.slice(1).split('/');
                    // parts[0] - категорія, parts[1] - підкатегорія (якщо є)
                    if (parts[0] === 'contacts') {
                        showSection('contacts');
                    } else if (parts[0] === 'about') {
                        showSection('about');
                    } else if (parts[0] === 'cart') {
                        showSection('cart');
                    } else {
                        // Категорія
                        const cat = categories.find(c => c.slug === parts[0]);
                        if (cat) {
                            currentCategory = cat.slug;
                            currentProduct = null;
                            // Скидаємо стан пошуку при переході на категорію через breadcrumbs
                            isSearchActive = false;
                            searchQuery = '';
                            searchResults = [];
                            // Якщо клік по категорії (index === 0), підкатегорія не встановлюється
                            if (parts.length >= 2 && index > 0) {
                                // Якщо клік по підкатегорії
                                const subCat = (cat.subcategories || []).find(sc => sc.slug === parts[1]);
                                if (subCat) {
                                    currentSubcategory = subCat.name;
                                } else {
                                    currentSubcategory = null;
                                }
                            } else {
                                // Якщо клік по категорії
                                currentSubcategory = null;
                            }
                            showSection('catalog');
                        }
                    }
                };
            } else {
                // Останній breadcrumb (поточний товар) — не клікабельний
                link.onclick = (e) => e.preventDefault();
                link.style.cursor = 'default';
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
            // Перевіряємо, чи елементи існують
            if (!catalogMenu || !dropdown) return;

            if (!catalogMenu.contains(e.target) && dropdown.classList.contains('active')) {
                dropdown.classList.remove('active');
                // Якщо клік був по посиланню — блокуємо перехід
                if (e.target.closest('a')) {
                    e.preventDefault();
                }
                e.stopPropagation();
                return false;
            }
        });

function renderCategories() {
    const catDiv = document.getElementById('categories');
    if (!catDiv) return;
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
        imgLink.href = `/${cat.slug}`;
        imgLink.onclick = (e) => {
            e.preventDefault();
            currentCategory = cat.slug;
            currentSubcategory = null;
            currentProduct = null;
            isSearchActive = false;
            searchQuery = '';
            searchResults = [];
            baseSearchResults = [];
            saveToStorage('isSearchActive', false);
            saveToStorage('searchQuery', '');
            saveToStorage('searchResults', []);
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
        pLink.href = `/${cat.slug}`;
        pLink.onclick = (e) => {
            e.preventDefault();
            currentCategory = cat.slug;
            currentSubcategory = null;
            currentProduct = null;
            isSearchActive = false;
            searchQuery = '';
            searchResults = [];
            baseSearchResults = [];
            saveToStorage('isSearchActive', false);
            saveToStorage('searchQuery', '');
            saveToStorage('searchResults', []);
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
            subLink.href = `/${cat.slug}/${sub.slug}`;
            subLink.onclick = (e) => {
                e.preventDefault();
                currentCategory = cat.slug;
                currentSubcategory = sub.name;
                currentProduct = null;
                isSearchActive = false;
                searchQuery = '';
                searchResults = [];
                baseSearchResults = [];
                saveToStorage('isSearchActive', false);
                saveToStorage('searchQuery', '');
                saveToStorage('searchResults', []);
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
        itemDiv.dataset.category = cat.slug;

        // Створюємо контейнер для зображення та тексту
        const contentContainer = document.createElement('div');
        contentContainer.style.display = 'flex';
        contentContainer.style.alignItems = 'center';
        contentContainer.style.gap = '10px';

        // Додаємо мініатюру зображення категорії
        const categoryImg = document.createElement('img');
        categoryImg.src = cat.photo || NO_IMAGE_URL;
        categoryImg.alt = cat.name;
        categoryImg.style.width = '45px';
        categoryImg.style.height = '45px';
        categoryImg.style.objectFit = 'cover';
        categoryImg.style.borderRadius = '4px';
        categoryImg.style.flexShrink = '0';
        categoryImg.loading = 'lazy';
        categoryImg.onerror = () => { categoryImg.src = NO_IMAGE_URL; };
        contentContainer.appendChild(categoryImg);

        const span = document.createElement('span');
        span.textContent = cat.name;
        span.style.textDecoration = 'none';
        span.style.cursor = 'pointer';
        span.style.display = 'block';
        span.style.padding = '8px 5px';
        span.style.margin = '0';
        span.style.fontWeight = 'bold';
        span.style.flex = '1';

        // Динамічний розмір шрифту залежно від розміру екрану
        if (window.innerWidth <= 650) {
            span.style.fontSize = '14px';
        } else if (window.innerWidth <= 920) {
            span.style.fontSize = '15px';
        } else {
            span.style.fontSize = '16px';
        }

        // Змінні для обробки сенсорних подій
        let touchStartY = 0;
        let touchStartTime = 0;
        let hasMoved = false;
        let touchTimeout = null;

        const toggleSubDropdown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            const currentItem = itemDiv;
            const subList = currentItem.querySelector('.sub-list');
            const isActive = subList.classList.contains('active');

            // Закриваємо всі інші підкатегорії
            document.querySelectorAll('.sub-list').forEach(sl => {
                if (sl !== subList) {
                    sl.classList.remove('active');
                }
            });
            document.querySelectorAll('#catalog-dropdown .dropdown-item').forEach(it => {
                if (it !== currentItem) {
                    it.classList.remove('active');
                }
            });
            document.querySelectorAll('#catalog-dropdown .dropdown-item span').forEach(sp => {
                if (sp !== span) {
                    sp.classList.remove('active');
                }
            });

            // Перемикаємо поточну підкатегорію
            if (subList) {
                if (isActive) {
                    subList.classList.remove('active');
                    currentItem.classList.remove('active');
                    span.classList.remove('active');
                } else {
                    subList.classList.add('active');
                    currentItem.classList.add('active');
                    span.classList.add('active');
                }
            }
        };

        contentContainer.appendChild(span);

        span.addEventListener('mouseenter', () => span.classList.add('active'));
        span.addEventListener('mouseleave', () => {
            if (!itemDiv.classList.contains('active')) span.classList.remove('active');
        });

        if (cat.subcategories && cat.subcategories.length > 0) {
            // Використовуємо тільки click подію для всіх пристроїв
            span.addEventListener('click', toggleSubDropdown);
        }

        // Змінні для обробки сенсорних подій для переходу в категорію
        let categoryTouchStartY = 0;
        let categoryTouchStartTime = 0;
        let categoryHasMoved = false;
        let categoryTouchTimeout = null;

        const goToCategory = (e) => {
            if (!cat.subcategories || cat.subcategories.length === 0) {
                e.preventDefault();
                currentProduct = null;
                currentCategory = cat.slug;
                currentSubcategory = null;
                isSearchActive = false;
                searchQuery = '';
                searchResults = [];
                baseSearchResults = [];
                saveToStorage('isSearchActive', false);
                saveToStorage('searchQuery', '');
                saveToStorage('searchResults', []);
                showSection('catalog');
                document.querySelectorAll('#catalog-dropdown .dropdown-item').forEach(it => it.classList.remove('active'));
                document.querySelectorAll('#catalog-dropdown .dropdown-item span').forEach(sp => sp.classList.remove('active'));
                dropdown.classList.remove('active');
                document.querySelectorAll('.sub-list').forEach(sl => sl.classList.remove('active'));
                dropdown.scrollTop = 0;
            }
        };

        // Використовуємо тільки click подію для всіх пристроїв
        span.addEventListener('click', goToCategory);

        itemDiv.appendChild(contentContainer);

        const subList = document.createElement('div');
        subList.className = 'sub-list';
        subList.style.display = 'none';
        subList.style.paddingLeft = '30px';
        // Переконаємося, що підкатегорії відображаються знизу категорії
        subList.style.position = 'static';
        subList.style.width = '100%';
        subList.style.left = 'auto';
        subList.style.top = 'auto';
        subList.style.transform = 'none';

        const styleObserver = new MutationObserver(() => {
            subList.style.display = subList.classList.contains('active') ? 'block' : 'none';
        });
        styleObserver.observe(subList, { attributes: true, attributeFilter: ['class'] });

        (cat.subcategories || []).forEach(sub => {
            // Створюємо контейнер для зображення та тексту підкатегорії
            const subContentContainer = document.createElement('div');
            subContentContainer.style.display = 'flex';
            subContentContainer.style.alignItems = 'center';
            subContentContainer.style.gap = '8px';

            // Додаємо мініатюру зображення підкатегорії тільки якщо є фото
            if (sub.photo) {
                const subcategoryImg = document.createElement('img');
                subcategoryImg.src = sub.photo;
                subcategoryImg.alt = sub.name;
                subcategoryImg.style.width = '20px';
                subcategoryImg.style.height = '20px';
                subcategoryImg.style.objectFit = 'cover';
                subcategoryImg.style.borderRadius = '3px';
                subcategoryImg.style.flexShrink = '0';
                subcategoryImg.loading = 'lazy';
                subcategoryImg.onerror = () => { subcategoryImg.src = NO_IMAGE_URL; };
                subContentContainer.appendChild(subcategoryImg);
            }

            const p = document.createElement('p');
            p.textContent = sub.name;
            p.style.textDecoration = 'none';
            p.style.padding = '5px 5px';
            p.style.margin = '0';
            p.style.cursor = 'pointer';
            p.style.fontWeight = 'normal';
            p.style.flex = '1';

            // Динамічний розмір шрифту для підкатегорій
            if (window.innerWidth <= 650) {
                p.style.fontSize = '12px';
            } else if (window.innerWidth <= 920) {
                p.style.fontSize = '13px';
            } else {
                p.style.fontSize = '14px';
            }

            p.onmouseover = (e) => {
                if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                    e.target.style.backgroundColor = '#6b869c'; // Темний колір для темної теми
                } else {
                    e.target.style.backgroundColor = '#d8d8d8'; // Світлий колір для світлої теми
                }
            };
            p.onmouseout = (e) => { e.target.style.backgroundColor = ''; };
            subContentContainer.appendChild(p);

            // Змінні для обробки сенсорних подій для підкатегорій
            let subcategoryTouchStartY = 0;
            let subcategoryTouchStartTime = 0;
            let subcategoryHasMoved = false;
            let subcategoryTouchTimeout = null;

            const goToSubcategory = (e) => {
                e.stopPropagation();
                currentProduct = null;
                currentCategory = cat.slug;
                currentSubcategory = sub.name;
                isSearchActive = false;
                searchQuery = '';
                searchResults = [];
                baseSearchResults = [];
                saveToStorage('isSearchActive', false);
                saveToStorage('searchQuery', '');
                saveToStorage('searchResults', []);
                showSection('catalog');
                // --- Додаємо скидання підсвічування ---
                document.querySelectorAll('#catalog-dropdown .dropdown-item').forEach(it => it.classList.remove('active'));
                document.querySelectorAll('#catalog-dropdown .dropdown-item span').forEach(sp => sp.classList.remove('active'));
                dropdown.classList.remove('active');
                document.querySelectorAll('.sub-list').forEach(sl => sl.classList.remove('active'));
                // Скидання скролу при переході на будь-яку сторінку
                dropdown.scrollTop = 0;
            };

            // Використовуємо тільки click подію для всіх пристроїв
            p.addEventListener('click', goToSubcategory);
            subList.appendChild(subContentContainer);
        });

        itemDiv.appendChild(subList);
        dropdown.appendChild(itemDiv);
    });

    document.addEventListener('click', (e) => {
        const isClickInsideDropdown = dropdown.contains(e.target);
        const catalogToggle = document.getElementById('catalog-toggle');
        const isClickInsideToggle = catalogToggle && catalogToggle.contains(e.target);
        
        if (!isClickInsideDropdown && !isClickInsideToggle && dropdown.classList.contains('active')) {
            dropdown.classList.remove('active');
            document.querySelectorAll('.sub-list').forEach(sl => sl.classList.remove('active'));
            // Блокуємо подію, щоб уникнути небажаних переходів
            if (e.target.closest('a')) {
                e.preventDefault();
            }
            e.stopPropagation();
            // Скидання скролу при закритті меню
            dropdown.scrollTop = 0;
            return false;
        }
    });

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });

    // Додаємо обробник для відкриття меню Каталог
    const catalogToggle = document.getElementById('catalog-toggle');
    const catalogDropdown = document.getElementById('catalog-dropdown');
    if (catalogToggle && catalogDropdown) {
        catalogToggle.addEventListener('click', function(e) {
            // Відкриваємо меню
            setTimeout(() => {
                if (catalogDropdown.classList.contains('active')) {
                    catalogDropdown.scrollTop = 0;
                }
            }, 0);
        });
    }
}

function renderCatalog(category = null, subcategory = null, product = null, searchResultsParam = null) {
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

    const urlParams = new URLSearchParams(window.location.search);
    currentPage = parseInt(urlParams.get('page')) || 1;
    const savedState = loadFromStorage('lastCatalogState', null);
    if (savedState && savedState.sectionId === 'catalog' && savedState.path === window.location.pathname.slice(1)) {
        currentPage = savedState.currentPage || 1;
    }

    baseFilteredProducts = null;

    if (isSearchActive && searchResultsParam) {
        const h2 = document.createElement('h2');
        h2.textContent = `Результати пошуку за "${searchQuery}"`;
        productsDiv.appendChild(h2);

        productsDiv.appendChild(createControlsContainer());
        const productList = document.createElement('div');
        productList.id = 'product-list';
        productList.className = 'product-grid';
        productsDiv.appendChild(productList);

        if (searchResultsParam.length > 0) {
            filteredProducts = [...searchResultsParam];
            baseFilteredProducts = [...filteredProducts];
            console.log('Search results rendered:', filteredProducts.length, 'products');
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
            imgLink.href = `/${cat.slug}`;
            imgLink.onclick = (e) => {
                e.preventDefault();
                currentCategory = cat.slug;
                currentSubcategory = null;
                currentProduct = null;
                currentPage = 1;
                showSection('catalog');
            };
            const img = document.createElement('img');
            img.src = cat.image || cat.photo || NO_IMAGE_URL;
            img.alt = cat.name;
            img.loading = 'lazy';
            imgLink.appendChild(img);
            itemDiv.appendChild(imgLink);

            const pLink = document.createElement('a');
            pLink.href = `/${cat.slug}`;
            pLink.onclick = (e) => {
                e.preventDefault();
                currentCategory = cat.slug;
                currentSubcategory = null;
                currentProduct = null;
                currentPage = 1;
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
        const selectedCat = categories.find(c => c.slug === category);
        if (!selectedCat) {
            const p = document.createElement('p');
            p.textContent = 'Категорія не знайдена';
            productsDiv.appendChild(p);
            return;
        }

        // --- ВИПРАВЛЕНО: Відображаємо назву категорії або підкатегорії ---
        let headerText = selectedCat.name;
        let selectedSubCat = null;
        if (subcategory) {
            selectedSubCat = selectedCat.subcategories?.find(sub => sub.slug === subcategory);
            if (selectedSubCat) {
                headerText = selectedSubCat.name;
            }
        }
            const h2 = document.createElement('h2');
        h2.textContent = headerText;
            productsDiv.appendChild(h2);

        if (!currentProduct) {
            const subFilterDiv = document.createElement('div');
            subFilterDiv.id = 'subcategory-filter';
            subFilterDiv.className = 'subcategory-filter';
            const subButtonsDiv = document.createElement('div');
            subButtonsDiv.className = 'subcategory-buttons';

            const allBtnLink = document.createElement('a');
            allBtnLink.href = `/${selectedCat.slug}`;
            allBtnLink.onclick = (e) => {
                e.preventDefault();
                currentSubcategory = null;
                currentPage = 1;
                showSection('catalog');
            };
            const allBtn = document.createElement('button');
            allBtn.textContent = 'Усі';
            allBtnLink.appendChild(allBtn);
            subButtonsDiv.appendChild(allBtnLink);

            (selectedCat.subcategories || []).forEach(sub => {
                const btnLink = document.createElement('a');
                btnLink.href = `/${selectedCat.slug}/${sub.slug}`;
                btnLink.onclick = (e) => {
                    e.preventDefault();
                    currentSubcategory = sub.name;
                    currentPage = 1;
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

        let subcategoryName = null;
        if (subcategory) {
            const selectedSubCat = selectedCat.subcategories?.find(sub => sub.slug === subcategory);
            subcategoryName = selectedSubCat ? selectedSubCat.name : subcategory;
        }

        // Фільтруємо товари
        filteredProducts = products.filter(p => 
            p.category === category && 
            (!subcategoryName || p.subcategory === subcategoryName) && 
            p.visible
        );

        baseFilteredProducts = [...filteredProducts];

        if (filteredProducts.length === 0) {
            const p = document.createElement('p');
            p.textContent = 'Нічого не знайдено';
            productList.appendChild(p);
        } else {
            renderProducts(filteredProducts);
        }
    }
    renderFilters();

    // Відновлюємо сортування, якщо воно збережено
    if (currentSort) {
        sortProducts(currentSort);
    }
    
    // Відновлюємо графічне відображення вибраних кольорів
    restoreSelectedColors();
}

function createControlsContainer() {
    const filterSortContainer = document.createElement('div');
    filterSortContainer.className = 'filter-sort-container';
    filterSortContainer.style.display = 'flex';
    filterSortContainer.style.justifyContent = 'revert-layer';
    filterSortContainer.style.alignItems = 'center';
    filterSortContainer.style.width = '100%';
    filterSortContainer.style.maxWidth = '100%';
    filterSortContainer.style.padding = '10px 0';
    filterSortContainer.style.boxSizing = 'border-box';
    filterSortContainer.style.gap = '10px';

    const filterBtn = document.createElement('button');
    filterBtn.className = 'filter-btn';
    filterBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="filter-icon" style="vertical-align: middle; margin-right: 5px;">
            <path d="M3 8h18"/>
            <path d="M4 12h16"/>
            <path d="M5 16h14"/>
        </svg>
        Фільтр
    `;
    filterBtn.style.padding = '8px 16px';
    filterBtn.style.fontSize = '13px';
    filterBtn.style.whiteSpace = 'nowrap';
    filterBtn.style.border = '1px solid #ccc';
    filterBtn.style.borderRadius = '20px';
    filterBtn.style.backgroundColor = '#ffffff';
    filterBtn.style.cursor = 'pointer';
    filterBtn.style.display = 'inline-flex';
    filterBtn.style.alignItems = 'center';
    filterBtn.style.width = '120px'; // Фіксована ширина для відповідності кнопці сортування
    filterBtn.style.justifyContent = 'center';
    filterBtn.onclick = () => {
        const filters = document.querySelector('.filters');
        const nav = document.querySelector('.nav');
        if (filters) {
            filters.classList.toggle('active');
            // Додаємо/видаляємо клас filters-active для навігації
            if (filters.classList.contains('active')) {
                nav.classList.add('filters-active');
            } else {
                nav.classList.remove('filters-active');
            }
        }
    };
    filterSortContainer.appendChild(filterBtn);

    filterSortContainer.appendChild(createSortMenu());

    return filterSortContainer;
}

function createSortMenu() {
    const sortMenu = document.createElement('div');
    sortMenu.className = 'sort-menu';
    sortMenu.style.display = 'inline-flex';
    sortMenu.style.alignItems = 'center';
    sortMenu.style.marginRight = '10px';
    sortMenu.style.position = 'relative';

    const sortBtn = document.createElement('button');
    sortBtn.className = 'sort-btn';
    sortBtn.innerHTML = 'Сортування ▼';
    sortBtn.style.padding = '8px 16px';
    sortBtn.style.fontSize = '13px';
    sortBtn.style.whiteSpace = 'nowrap';
    sortBtn.style.border = '1px solid #ccc';
    sortBtn.style.borderRadius = '20px';
    sortBtn.style.backgroundColor = '#ffffff';
    sortBtn.style.cursor = 'pointer';
    sortBtn.style.display = 'inline-flex';
    sortBtn.style.alignItems = 'center';
    sortBtn.style.width = '120px'; // Фіксована ширина для узгодження з кнопкою фільтру
    sortBtn.style.justifyContent = 'center';
    sortBtn.onclick = (e) => {
        e.stopPropagation();
        const isVisible = sortDropdown.style.display === 'block';
        sortDropdown.style.display = isVisible ? 'none' : 'block';
    };
    sortMenu.appendChild(sortBtn);

    const sortDropdown = document.createElement('div');
    sortDropdown.className = 'sort-dropdown';
    sortDropdown.style.display = 'none';
    sortDropdown.style.position = 'absolute';
    sortDropdown.style.top = '100%';
    sortDropdown.style.left = '50%';
    sortDropdown.style.transform = 'translateX(-50%)';
    sortDropdown.style.backgroundColor = '#fff';
    sortDropdown.style.border = '1px solid #ccc';
    sortDropdown.style.borderRadius = '12px';
    sortDropdown.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
    sortDropdown.style.zIndex = '1000';
    sortDropdown.style.minWidth = '150px';
    sortDropdown.style.padding = '5px 0';

    const sortOptions = [
        { text: 'Назва (А-Я)', value: 'name-asc' },
        { text: 'Назва (Я-А)', value: 'name-desc' },
        { text: 'Ціна (зростання)', value: 'price-asc' },
        { text: 'Ціна (спадання)', value: 'price-desc' }
    ];
    sortOptions.forEach(opt => {
        const btn = document.createElement('button');
        btn.textContent = opt.text;
        btn.className = currentSort === opt.value ? 'selected' : '';
        btn.style.display = 'block';
        btn.style.padding = '8px 16px';
        btn.style.width = '100%';
        btn.style.textAlign = 'left';
        btn.style.border = 'none';
        btn.style.backgroundColor = 'transparent';
        btn.style.cursor = 'pointer';
        btn.onmouseover = () => { if (!btn.classList.contains('selected')) btn.style.backgroundColor = '#f0f0f0'; };
        btn.onmouseout = () => { if (!btn.classList.contains('selected')) btn.style.backgroundColor = 'transparent'; };
        btn.onclick = (e) => {
            e.stopPropagation();
            sortDropdown.querySelectorAll('button').forEach(b => {
                b.classList.remove('selected');
                b.style.backgroundColor = 'transparent';
            });
            btn.classList.add('selected');
            sortProducts(opt.value);
            sortDropdown.style.display = 'none';
        };
        sortDropdown.appendChild(btn);
    });
    sortMenu.appendChild(sortDropdown);

    document.addEventListener('click', (e) => {
        if (!sortMenu.contains(e.target) && sortDropdown.style.display === 'block') {
            sortDropdown.style.display = 'none';
            // Блокуємо подію, щоб уникнути небажаних переходів
            if (e.target.closest('a')) {
                e.preventDefault();
            }
            e.stopPropagation();
            return false;
        }
    });

    return sortMenu;
}

function getActiveFilters() {
    const activeFilters = {};
    ['promo', 'brand', 'material', 'price'].forEach(name => {
        const checked = Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(input => input.value);
        if (checked.length > 0) {
            activeFilters[name] = checked;
        }
    });
    return activeFilters;
}

function applySavedFilters(activeFilters) {
    ['promo', 'brand', 'material', 'price'].forEach(name => {
        const checkedValues = activeFilters[name] || [];
        checkedValues.forEach(value => {
            const input = document.querySelector(`input[name="${name}"][value="${value}"]`);
            if (input) {
                input.checked = true;
            }
        });
    });
    filterProducts();
}

function renderFilters() {
    const filterList = document.getElementById('filter-list');
    if (!filterList || currentProduct) return;
    while (filterList.firstChild) filterList.removeChild(filterList.firstChild);

    const relevantProducts = isSearchActive ? baseSearchResults : baseFilteredProducts;
    const activeFilters = getActiveFilters();

    const promoProducts = relevantProducts.filter(p => p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date()));
    if (promoProducts.length > 0) {
        filterList.appendChild(createFilterBlock('Товари з акціями', 'promo', ['Акція'], activeFilters));
    }

    const brands = [...new Set(relevantProducts.map(p => p.brand).filter(Boolean))];
    if (brands.length > 0) {
        filterList.appendChild(createFilterBlock('Виробник', 'brand', brands, activeFilters));
    }

    const materials = [...new Set(relevantProducts.map(p => p.material).filter(Boolean))];
    if (materials.length > 0) {
        filterList.appendChild(createFilterBlock('Матеріал', 'material', materials, activeFilters));
    }

    const priceRanges = ['0-2000', '2000-5000', '5000-10000', '10000+'];
    const priceFiltered = relevantProducts.filter(p => {
        const price = p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date()) ? p.salePrice : p.price;
        return priceRanges.some(range => {
            if (range.endsWith('+')) {
                return price >= parseInt(range.replace('+', ''));
            }
            const [min, max] = range.split('-').map(Number);
            return price >= min && price <= max;
        });
    });
    if (priceFiltered.length > 0) {
        filterList.appendChild(createFilterBlock('Ціна', 'price', priceRanges, activeFilters));
    }

    // Відновлюємо збережені фільтри після рендерингу
    const savedFilters = loadFromStorage('activeFilters', {});
    if (Object.keys(savedFilters).length > 0) {
        applySavedFilters(savedFilters);
    }
}

function createFilterBlock(title, name, options, activeFilters = {}) {
    const block = document.createElement('div');
    block.className = 'filter-block';

    const h4 = document.createElement('h4');
    h4.textContent = title;
    block.appendChild(h4);

    const optionsDiv = document.createElement('div');
    optionsDiv.className = 'filter-options';

    const relevantProducts = isSearchActive ? baseSearchResults : baseFilteredProducts;

    options.forEach(opt => {
        let count = 0;
        if (name === 'promo') {
            count = relevantProducts.filter(p => p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date())).length;
        } else if (name === 'price') {
            count = relevantProducts.filter(p => {
                const price = p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date()) ? p.salePrice : p.price;
                if (opt.endsWith('+')) {
                    return price >= parseInt(opt.replace('+', ''));
                }
                const [min, max] = opt.split('-').map(Number);
                return price >= min && price <= max;
            }).length;
        } else {
            count = relevantProducts.filter(p => p[name] === opt).length;
        }

        if (count > 0) {
            const label = document.createElement('label');
            const input = document.createElement('input');
            input.type = 'checkbox';
            input.name = name;
            input.value = opt;
            if (activeFilters[name] && activeFilters[name].includes(opt)) {
                input.checked = true;
            }
            input.onchange = () => filterProducts();
            label.appendChild(input);
            label.appendChild(document.createTextNode(` ${opt} (${count})`));
            optionsDiv.appendChild(label);
        }
    });

    if (optionsDiv.children.length > 0) {
        block.appendChild(optionsDiv);
        return block;
    }
    return null;
}

function clearFilters() {
    // Скидаємо всі активні фільтри
    const filterInputs = document.querySelectorAll('input[name="promo"], input[name="brand"], input[name="material"], input[name="price"]');
    filterInputs.forEach(input => {
        input.checked = false;
    });
    
    // Очищаємо збережені фільтри
    saveToStorage('activeFilters', {});
    
    // Скидаємо сортування
    currentSort = '';
    saveToStorage('currentSort', '');
    
    // Відновлюємо оригінальний список продуктів
    if (isSearchActive) {
        searchResults = [...baseSearchResults];
    } else {
        filteredProducts = [...baseFilteredProducts];
    }
    
    currentPage = 1;
    
    // Оновлюємо історію та рендеримо продукти тільки якщо ми на сторінці каталогу
    const activeSection = document.querySelector('.section.active');
    if (activeSection && activeSection.id === 'catalog') {
        updateHistoryState();
        renderProducts(isSearchActive ? searchResults : filteredProducts);
    }
}

function filterProducts() {
    let base = isSearchActive ? [...baseSearchResults] : [...baseFilteredProducts];
    let filtered = [...base];
    let hasActiveFilters = false;

    const activeFilters = getActiveFilters();

    ['promo', 'brand', 'material', 'price'].forEach(name => {
        const checked = activeFilters[name] || [];
        if (checked.length > 0) {
            hasActiveFilters = true;
            if (name === 'promo') {
                filtered = filtered.filter(p => p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date()));
            } else if (name === 'price') {
                filtered = filtered.filter(p => {
                    const price = p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date()) ? p.salePrice : p.price;
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

    if (!hasActiveFilters) {
        filteredProducts = [...base];
        if (isSearchActive) searchResults = [...base];
    } else {
        filteredProducts = filtered;
        if (isSearchActive) searchResults = filtered;
    }

    currentPage = 1;
    saveToStorage('activeFilters', activeFilters);
    updateHistoryState();
    renderProducts(isSearchActive ? searchResults : filteredProducts);
}

function sortProducts(sortType) {
    currentSort = sortType;
    saveToStorage('currentSort', currentSort);

    let filtered = isSearchActive ? [...baseSearchResults] : [...baseFilteredProducts];

    if (sortType === 'name-asc') {
        filtered.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sortType === 'name-desc') {
        filtered.sort((a, b) => b.name.localeCompare(a.name));
    } else if (sortType === 'price-asc') {
        filtered.sort((a, b) => {
            const priceA = (a.salePrice && (a.saleEnd === null || new Date(a.saleEnd) > new Date()) ? a.salePrice : a.price) || 0;
            const priceB = (b.salePrice && (b.saleEnd === null || new Date(b.saleEnd) > new Date()) ? b.salePrice : b.price) || 0;
            return priceA - priceB;
        });
    } else if (sortType === 'price-desc') {
        filtered.sort((a, b) => {
            const priceA = (a.salePrice && (a.saleEnd === null || new Date(a.saleEnd) > new Date()) ? a.salePrice : a.price) || 0;
            const priceB = (b.salePrice && (b.saleEnd === null || new Date(b.saleEnd) > new Date()) ? b.salePrice : b.price) || 0;
            return priceB - priceA;
        });
    }

    filteredProducts = filtered;
    if (isSearchActive) searchResults = filtered;

    updateHistoryState();
    renderProducts(isSearchActive ? searchResults : filteredProducts);
}

function renderProducts(filtered) {
    const productList = document.getElementById('product-list');
    const productGrid = document.querySelector('.product-grid');
    const productContainer = productList || productGrid;
    
    if (!productContainer) return;

    const existingTimers = productContainer.querySelectorAll('.sale-timer');
    existingTimers.forEach(timer => {
        if (timer.dataset.intervalId) {
            clearInterval(parseInt(timer.dataset.intervalId));
        }
    });

    while (productContainer.firstChild) productContainer.removeChild(productContainer.firstChild);

    document.querySelector('.filters').style.display = currentProduct ? 'none' : 'block';

    if (currentProduct) {
        showSection('product-details');
        return;
    }

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
        }
    }

    const totalItems = activeProducts.length;
    const totalPages = Math.ceil(totalItems / perPage);

    const start = (currentPage - 1) * perPage;
    const productsToShow = activeProducts.slice(start, start + perPage);

    console.log('renderProducts: currentPage=', currentPage, 'start=', start, 'productsToShow.length=', productsToShow.length, 'totalItems=', totalItems);

    if (productsToShow.length === 0) {
        const p = document.createElement('p');
        p.textContent = 'Нічого не знайдено';
        productContainer.appendChild(p);
        renderPagination(totalPages, totalItems, true);
        return;
    }

    productsToShow.forEach(product => {
        const productElement = createProductElement(product);
        productContainer.appendChild(productElement);
    });

    const showMoreBtn = document.querySelector('.show-more-btn');
    const displayedCount = productContainer.children.length;
    
    // Оновлюємо currentPage на основі відображених товарів
    if (displayedCount > 0) {
        const calculatedPage = Math.ceil(displayedCount / perPage);
        if (calculatedPage !== currentPage) {
            currentPage = calculatedPage;
            console.log('Updated currentPage in renderProducts to:', currentPage, 'based on displayed count:', displayedCount);
        }
    }
    
    if (showMoreBtn) {
        if (displayedCount >= totalItems) {
            showMoreBtn.disabled = true;
            showMoreBtn.textContent = 'Більше немає товарів';
        } else {
            showMoreBtn.disabled = false;
            showMoreBtn.textContent = 'Показати ще';
        }
    }

    renderPagination(totalPages, totalItems, true);

    updateHistoryState();
    
    // Відновлюємо графічне відображення вибраних кольорів
    restoreSelectedColors();
}

function renderPagination(totalPages, totalItems, autoUpdateCurrentPage = true) {
    const paginationDiv = document.getElementById('pagination') || createPaginationDiv();
    while (paginationDiv.firstChild) paginationDiv.removeChild(paginationDiv.firstChild);

    const paginationContainer = document.createElement('div');
    paginationContainer.className = 'pagination-container';

    const showMoreBtn = document.createElement('button');
    showMoreBtn.className = 'show-more-btn';
    
    // Створюємо іконку пів кола зі стрілкою
    const icon = document.createElement('span');
    icon.innerHTML = '&#8634;'; // Unicode символ для пів кола зі стрілкою
    icon.style.cssText = 'font-size: 18px; margin-right: 8px;';
    
    const text = document.createElement('span');
    text.textContent = 'Показати ще';
    
    showMoreBtn.appendChild(icon);
    showMoreBtn.appendChild(text);
    showMoreBtn.onclick = loadMoreProducts;

    const productGrid = document.querySelector('.product-grid');
    const productList = document.querySelector('.product-list');
    const productContainer = productGrid || productList;
    const displayedCount = productContainer ? productContainer.children.length : 0;
    
    // Оновлюємо currentPage на основі відображених товарів тільки якщо autoUpdateCurrentPage = true
    if (autoUpdateCurrentPage && displayedCount > 0) {
        const calculatedPage = Math.ceil(displayedCount / perPage);
        if (calculatedPage !== currentPage) {
            currentPage = calculatedPage;
            console.log('Updated currentPage in renderPagination to:', currentPage, 'based on displayed count:', displayedCount);
        }
    }
    
    if (displayedCount >= totalItems) {
        showMoreBtn.disabled = true;
        showMoreBtn.innerHTML = '<span style="font-size: 18px; margin-right: 8px;">&#10004;</span><span>Більше немає товарів</span>';
    }
    paginationContainer.appendChild(showMoreBtn);

    const paginationInnerDiv = document.createElement('div');
    paginationInnerDiv.className = 'pagination';

    // Додаємо кнопку "Назад" тільки якщо не перша сторінка і є більше однієї сторінки
    if (currentPage > 1 && totalPages > 1) {
        const prevButton = document.createElement('button');
        prevButton.className = 'pagination-btn';
        prevButton.setAttribute('data-direction', 'prev');
        prevButton.disabled = false;
        prevButton.onclick = () => {
            if (currentPage > 1) {
                currentPage--;
                const productGrid = document.querySelector('.product-grid');
                const productList = document.querySelector('.product-list');
                const productContainer = productGrid || productList;
                if (productContainer) {
                    while (productContainer.firstChild) productContainer.removeChild(productContainer.firstChild);
                }
                const start = (currentPage - 1) * perPage;
                const end = start + perPage;
                const productsToShow = (isSearchActive ? searchResults : filteredProducts).slice(start, end);
                productsToShow.forEach(product => {
                    const productElement = createProductElement(product);
                    productContainer.appendChild(productElement);
                });
                updateHistoryState();
                renderPagination(totalPages, totalItems, false);
            }
        };
        paginationInnerDiv.appendChild(prevButton);
    }

    // Функція для створення кнопки сторінки
    function createPageButton(pageNum, text = pageNum, isActive = false) {
        const btn = document.createElement('button');
        btn.textContent = text;
        btn.className = `pagination-btn ${isActive ? 'active' : ''}`;
        btn.onclick = () => {
            currentPage = pageNum;
            const productGrid = document.querySelector('.product-grid');
            const productList = document.querySelector('.product-list');
            const productContainer = productGrid || productList;
            if (productContainer) {
                while (productContainer.firstChild) productContainer.removeChild(productContainer.firstChild);
            }
            const start = (currentPage - 1) * perPage;
            const end = start + perPage;
            const productsToShow = (isSearchActive ? searchResults : filteredProducts).slice(start, end);
            productsToShow.forEach(product => {
                const productElement = createProductElement(product);
                productContainer.appendChild(productElement);
            });
            updateHistoryState();
            renderPagination(totalPages, totalItems, false);
            const showMoreBtn = document.querySelector('.show-more-btn');
            if (showMoreBtn) {
                if (end >= totalItems) {
                    showMoreBtn.disabled = true;
                    showMoreBtn.innerHTML = '<span style="font-size: 18px; margin-right: 8px;">&#10004;</span><span>Більше немає товарів</span>';
                } else {
                    showMoreBtn.disabled = false;
                    showMoreBtn.innerHTML = '<span style="font-size: 18px; margin-right: 8px;">&#8634;</span><span>Показати ще</span>';
                }
            }
        };
        return btn;
    }

    // Функція для створення еліпсиса
    function createEllipsis() {
        const span = document.createElement('span');
        span.textContent = '...';
        span.className = 'pagination-ellipsis';
        return span;
    }

    // Логіка відображення сторінок
    const pages = [];
    
    if (totalPages <= 7) {
        // Якщо сторінок мало, показуємо всі
        for (let i = 1; i <= totalPages; i++) {
            pages.push(createPageButton(i, i, i === currentPage));
        }
    } else {
        // Якщо сторінок багато, використовуємо еліпсис
        if (currentPage <= 4) {
            // Показуємо перші 5 сторінок + еліпсис + останню
            for (let i = 1; i <= 5; i++) {
                pages.push(createPageButton(i, i, i === currentPage));
            }
            pages.push(createEllipsis());
            pages.push(createPageButton(totalPages, totalPages, false));
        } else if (currentPage >= totalPages - 3) {
            // Показуємо першу + еліпсис + останні 5 сторінок
            pages.push(createPageButton(1, 1, false));
            pages.push(createEllipsis());
            for (let i = totalPages - 4; i <= totalPages; i++) {
                pages.push(createPageButton(i, i, i === currentPage));
            }
        } else {
            // Показуємо першу + еліпсис + поточну та 2 сусідні + еліпсис + останню
            pages.push(createPageButton(1, 1, false));
            pages.push(createEllipsis());
            for (let i = currentPage - 1; i <= currentPage + 1; i++) {
                pages.push(createPageButton(i, i, i === currentPage));
            }
            pages.push(createEllipsis());
            pages.push(createPageButton(totalPages, totalPages, false));
        }
    }

    // Додаємо всі кнопки сторінок
    pages.forEach(pageBtn => paginationInnerDiv.appendChild(pageBtn));

    // Додаємо кнопку "Вперед" тільки якщо не остання сторінка і є більше однієї сторінки
    if (currentPage < totalPages && totalPages > 1) {
        const nextButton = document.createElement('button');
        nextButton.className = 'pagination-btn';
        nextButton.setAttribute('data-direction', 'next');
        nextButton.disabled = false;
        nextButton.onclick = () => {
            if (currentPage < totalPages) {
                currentPage++;
                const productGrid = document.querySelector('.product-grid');
                const productList = document.querySelector('.product-list');
                const productContainer = productGrid || productList;
                if (productContainer) {
                    while (productContainer.firstChild) productContainer.removeChild(productContainer.firstChild);
                }
                const start = (currentPage - 1) * perPage;
                const end = start + perPage;
                const productsToShow = (isSearchActive ? searchResults : filteredProducts).slice(start, end);
                productsToShow.forEach(product => {
                    const productElement = createProductElement(product);
                    productContainer.appendChild(productElement);
                });
                updateHistoryState();
                renderPagination(totalPages, totalItems, false);
            }
        };
        paginationInnerDiv.appendChild(nextButton);
    }

    paginationContainer.appendChild(paginationInnerDiv);
    paginationDiv.appendChild(paginationContainer);
}

function updateHistoryState() {
    const catSlug = currentCategory ? transliterate(currentCategory.replace('ь', '')) : '';
    const subCatSlug = currentSubcategory ? transliterate(currentSubcategory.replace('ь', '')) : '';
    let newPath = isSearchActive
        ? `/catalog/search/${transliterate(searchQuery.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-'))}`
        : currentCategory
        ? `/${catSlug}${subCatSlug ? `/${subCatSlug}` : ''}`
        : '/catalog';

    const activeFilters = getActiveFilters();
    const queryParams = new URLSearchParams();
    if (currentPage > 1) {
        queryParams.set('page', currentPage);
    }
    if (Object.keys(activeFilters).length > 0) {
        queryParams.set('filters', encodeURIComponent(JSON.stringify(activeFilters)));
    }
    if (currentSort) {
        queryParams.set('sort', currentSort);
    }
    const queryString = queryParams.toString();
    if (queryString) {
        newPath += `?${queryString}`;
    }

    const productGrid = document.querySelector('.product-grid');
    const displayedProducts = productGrid ? productGrid.children.length : 0;

    const state = {
        sectionId: 'catalog',
        path: newPath,
        stateId: `catalog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        currentPage: currentPage || 1,
        scrollY: window.scrollY,
        displayedProducts: displayedProducts,
        currentCategory: currentCategory,
        currentSubcategory: currentSubcategory,
        isSearchActive: isSearchActive,
        searchQuery: searchQuery,
        searchResults: searchResults.map(p => p._id),
        activeFilters: activeFilters,
        currentSort: currentSort
    };

    history.replaceState(state, '', newPath);
    saveToStorage('lastCatalogState', state);
    saveToStorage('activeFilters', activeFilters);
}

function createPaginationDiv() {
    const paginationDiv = document.createElement('div');
    paginationDiv.id = 'pagination';
    paginationDiv.className = 'pagination';
    const productsDiv = document.getElementById('products');
    if (productsDiv) {
        productsDiv.appendChild(paginationDiv);
    }
    return paginationDiv;
}

// Функція для отримання всіх кольорів з блоків
function getAllColors(product) {
    if (product.colorBlocks && Array.isArray(product.colorBlocks)) {
        const allColors = [];
        product.colorBlocks.forEach((block, blockIndex) => {
            if (block.colors && Array.isArray(block.colors)) {
                block.colors.forEach((color, colorIndex) => {
                    const colorObj = {
                        ...color,
                        blockIndex,
                        colorIndex,
                        blockName: block.blockName || 'Колір',
                        globalIndex: allColors.length
                    };
                    allColors.push(colorObj);
                });
            }
        });
        return allColors;
    } else if (product.colors && Array.isArray(product.colors)) {
        // Для старої структури
        return product.colors.map((color, index) => ({
            ...color,
            blockIndex: 0,
            colorIndex: index,
            blockName: 'Колір',
            globalIndex: index
        }));
    }
    return [];
}

async function renderProductDetails() {
    const productSection = document.getElementById('product-details');
    if (!productSection) {
        console.error('Product details section not found, redirecting to home');
        if (typeof showSection === 'function') {
            showSection('home');
        } else {
            console.error('showSection function is not defined');
        }
        return Promise.resolve();
    }

    let productDetails = document.getElementById('product-div');
    if (!productDetails) {
        productDetails = document.createElement('div');
        productDetails.id = 'product-div';
        productSection.appendChild(productDetails);

    }

    if (!currentProduct) {

        if (typeof showSection === 'function') {
            showSection('home');
        }
        return Promise.resolve();
    }



    try {
        // Очищення попередніх таймерів
        document.querySelectorAll('.sale-timer').forEach(timer => {
            if (timer.dataset.intervalId) {
                clearInterval(parseInt(timer.dataset.intervalId));
            }
        });

        // Очищення вмісту productDetails
        while (productDetails.firstChild) {
            productDetails.removeChild(productDetails.firstChild);
        }

        const product = currentProduct;
        const isOnSale = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date());
        let initialPrice = isOnSale ? product.salePrice : product.price || 0;

        const container = document.createElement('div');
        container.className = 'product-detail-container';

        // Логіка для групового товару
        if (parentGroupProduct) {
            const backButton = document.createElement('button');
            backButton.className = 'back-to-group-btn';
            backButton.textContent = `Назад до "${parentGroupProduct.name}"`;
            backButton.onclick = () => {
                currentProduct = parentGroupProduct;
                parentGroupProduct = null;
                saveToStorage('parentGroupProduct', null);
                if (typeof showSection === 'function') {
                    showSection('product-details');
                    if (currentProduct.type === 'group') {
                        updateFloatingGroupCart();
                    }
                }
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
        mainImg.onclick = typeof openGallery === 'function' ? () => openGallery(product.slug) : null;
        leftDiv.appendChild(mainImg);

        const thumbnailContainer = document.createElement('div');
        thumbnailContainer.className = 'thumbnail-container';
        product.photos?.forEach((photo, index) => {
            const thumbImg = document.createElement('img');
            thumbImg.src = photo;
            thumbImg.className = 'thumbnail';
            thumbImg.alt = `Мініатюра ${index + 1}`;
            thumbImg.loading = 'lazy';
            // Додаємо відкриття галереї по кліку на мініатюру (тільки на сторінці товару)
            thumbImg.onclick = () => {
                if (typeof openGallery === 'function') {
                    openGallery(product.slug, index);
                }
            };
            thumbnailContainer.appendChild(thumbImg);
        });
        leftDiv.appendChild(thumbnailContainer);
        topDiv.appendChild(leftDiv);

        const rightDiv = document.createElement('div');
        rightDiv.className = 'product-detail-right';

        const h2 = document.createElement('h2');
        h2.textContent = product.name;
        rightDiv.appendChild(h2);

// Для матраців не відображаємо ціну зверху
if (!(product.type === 'mattresses' && product.sizes?.length > 0)) {
        const priceDiv = document.createElement('div');
        priceDiv.className = 'price product-detail-price';
        priceDiv.id = `price-${product._id}`;
    if (product.type === 'group' && product.groupProducts?.length > 0) {
            const groupPrices = product.groupProducts.map(id => {
                const p = products.find(p => p._id === id);
                if (!p) return Infinity;
                if (p.type === 'mattresses' && p.sizes?.length > 0) {
                    const saleSizes = p.sizes.filter(s => s.salePrice && s.salePrice < s.price);
                    const minSale = saleSizes.length > 0 ? Math.min(...saleSizes.map(s => s.salePrice)) : null;
                    const minPrice = Math.min(...p.sizes.map(s => s.price));
                    return (minSale !== null && minSale < minPrice) ? minSale : minPrice;
                }
                return (p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date())) ? p.salePrice : p.price;
            });
            const minPrice = Math.min(...groupPrices);
            const regularSpan = document.createElement('span');
            regularSpan.className = 'regular-price';
        regularSpan.innerHTML = `<span class='price-suffix'>від</span> <span class='price-value'>${minPrice}</span> <span class='price-suffix'>грн</span>`;
            priceDiv.appendChild(regularSpan);
        const emptySpan = document.createElement('span');
        emptySpan.style.visibility = 'hidden';
        emptySpan.textContent = '0 грн';
        priceDiv.appendChild(emptySpan);
        } else {
            if (isOnSale) {
            const regularSpan = document.createElement('span');
                regularSpan.className = 'regular-price';
regularSpan.innerHTML = `<s class='price-value'>${product.price}</s> <span class='price-suffix'>грн</span>`;
                priceDiv.appendChild(regularSpan);
                const saleSpan = document.createElement('span');
                saleSpan.className = 'sale-price';
            saleSpan.innerHTML = `<span class='price-value'>${initialPrice}</span> <span class='price-suffix'>грн</span>`;
                priceDiv.appendChild(saleSpan);
            } else {
                const regularSpan = document.createElement('span');
                regularSpan.className = 'regular-price';
            regularSpan.innerHTML = `<span class='price-value'>${initialPrice}</span> <span class='price-suffix'>грн</span>`;
                priceDiv.appendChild(regularSpan);
            const emptySpan = document.createElement('span');
            emptySpan.style.visibility = 'hidden';
            emptySpan.textContent = '0 грн';
            priceDiv.appendChild(emptySpan);
        }
            }
            rightDiv.appendChild(priceDiv);
            if (isOnSale && product.saleEnd && typeof updateSaleTimer === 'function') {
                const timerDiv = document.createElement('div');
                timerDiv.className = 'sale-timer';
                timerDiv.id = `timer-${product._id}`;
                rightDiv.appendChild(timerDiv);
                await updateSaleTimer(product._id, product.saleEnd);
            }
        }

        // Додаємо select для вибору розміру матрацу
        if (product.type === 'mattresses' && product.sizes?.length > 0) {
            const sizeDiv = document.createElement('div');
            sizeDiv.className = 'mattress-size-select';
            const sizeLabel = document.createElement('label');
            sizeLabel.textContent = 'Розмір:';
            sizeLabel.setAttribute('for', `mattress-size-${product._id}`);
            sizeDiv.appendChild(sizeLabel);

            // Кастомний селект
            const customSelect = document.createElement('div');
            customSelect.className = 'custom-mattress-select';
            customSelect.tabIndex = 0;
            customSelect.style.position = 'relative';
            customSelect.style.width = '260px'; // ширше
            customSelect.style.minWidth = '305px';

            const selectedDiv = document.createElement('div');
            selectedDiv.className = 'selected-option';
            selectedDiv.style.cursor = 'pointer';
            selectedDiv.style.padding = '8px 12px';
            selectedDiv.style.border = '1px solid #bbb';
            selectedDiv.style.borderRadius = '12px';
            selectedDiv.style.background = '#fff';
            selectedDiv.style.minHeight = '38px';
            selectedDiv.style.display = 'flex';
            selectedDiv.style.alignItems = 'center';
            selectedDiv.style.justifyContent = 'space-between';
            selectedDiv.style.fontSize = '16px';
            selectedDiv.style.userSelect = 'none';
            selectedDiv.style.position = 'relative';
            selectedDiv.style.minWidth = '285px';

            // Додаємо стрілку
            const arrow = document.createElement('span');
            arrow.innerHTML = '&#9662;';
            arrow.style.marginLeft = '12px';
            arrow.style.fontSize = '18px';
            arrow.style.color = '#888';
            arrow.style.pointerEvents = 'none';
            selectedDiv.appendChild(arrow);

            function getOptionHTML(size) {
                if (size.salePrice && size.salePrice < size.price) {
                    return `<span style="display:inline-flex;align-items:center;gap:8px;min-width:258px;">${size.name} — <s style="color:#888;">${size.price} грн</s> <span style="color:#fb5050;font-weight:bold;">${size.salePrice} грн</span></span>`;
                } else {
                    return `<span style="display:inline-flex;align-items:center;gap:8px;min-width:180px;">${size.name} — <span style="color:#222;" class="price-value">${size.price}</span> <span class="price-suffix">грн</span></span>`;
                }
            }

            let selectedSize = product.sizes[0];
            selectedDiv.innerHTML = getOptionHTML(selectedSize);
            selectedDiv.appendChild(arrow);
            customSelect.appendChild(selectedDiv);

            // Список опцій
            const optionsList = document.createElement('ul');
            optionsList.className = 'custom-options-list';
            optionsList.style.position = 'absolute';
            optionsList.style.left = '0';
            optionsList.style.right = '0';
            optionsList.style.top = '110%';
            optionsList.style.zIndex = '1000';
            optionsList.style.background = '#fff';
            optionsList.style.border = '1px solid #bbb';
            optionsList.style.borderRadius = '12px';
            optionsList.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
            optionsList.style.margin = '0';
            optionsList.style.padding = '4px 0';
            optionsList.style.display = 'none';
            optionsList.style.listStyle = 'none';
            optionsList.style.maxHeight = '220px';
            optionsList.style.overflowY = 'auto';
            optionsList.style.minWidth = '220px';

            product.sizes.forEach(size => {
                const li = document.createElement('li');
                li.className = 'custom-option';
                li.innerHTML = getOptionHTML(size);
                li.style.padding = '8px 12px';
                li.style.cursor = 'pointer';
                li.style.fontSize = '16px';
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.justifyContent = 'space-between';
                li.style.minWidth = '200px';
                li.onmouseenter = () => li.style.background = '#f5f5f5';
                li.onmouseleave = () => li.style.background = '#fff';
                li.onclick = () => {
                    selectedSize = size;
                    selectedDiv.innerHTML = getOptionHTML(size);
                    selectedDiv.appendChild(arrow);
                    optionsList.style.display = 'none';
                    selectedMattressSizes[product._id] = size.name;
                    saveToStorage('selectedMattressSizes', selectedMattressSizes);
                    if (typeof updateMattressPrice === 'function') updateMattressPrice(product._id);
                };
                optionsList.appendChild(li);
            });
            customSelect.appendChild(optionsList);

            // Відкриття/закриття списку
let wasJustClosed = false;
            selectedDiv.onclick = function(e) {
                e.stopPropagation();
    if (optionsList.style.display === 'block') {
        optionsList.style.display = 'none';
        arrow.style.transform = 'none';
    } else {
        optionsList.style.display = 'block';
        arrow.style.transform = 'rotate(180deg)';
    }
            };
            // Створюємо унікальний обробник для цього випадаючого меню
            const closeDropdownHandler = function(e) {
    if (!customSelect.contains(e.target) && optionsList.style.display === 'block') {
                    optionsList.style.display = 'none';
                    arrow.style.transform = 'none';
        wasJustClosed = true;
                    // Блокуємо подію, щоб уникнути небажаних переходів
                        e.preventDefault();
        e.stopPropagation();
        setTimeout(() => { wasJustClosed = false; }, 0);
        return false;
                    }
    if (wasJustClosed) {
        e.preventDefault();
                    e.stopPropagation();
        wasJustClosed = false;
                    return false;
                }
            };
document.addEventListener('click', closeDropdownHandler, true);
            
            // Зберігаємо посилання на обробник для можливого видалення
            customSelect._closeDropdownHandler = closeDropdownHandler;
            customSelect.onkeydown = function(e) {
                if (e.key === 'Enter' || e.key === ' ') {
                    optionsList.style.display = optionsList.style.display === 'block' ? 'none' : 'block';
                    arrow.style.transform = optionsList.style.display === 'block' ? 'rotate(180deg)' : 'none';
                }
            };

            sizeDiv.appendChild(customSelect);
            rightDiv.appendChild(sizeDiv);
            // Встановлюємо вибраний розмір за замовчуванням (тільки якщо ще не вибрано)
            if (!selectedMattressSizes[product._id]) {
                selectedMattressSizes[product._id] = selectedSize.name;
                saveToStorage('selectedMattressSizes', selectedMattressSizes);
            }
        }

        if (product.type !== 'mattresses' && product.type !== 'group') {
            const qtyDiv = document.createElement('div');
            qtyDiv.className = 'quantity-selector';
            const minusBtn = document.createElement('button');
            minusBtn.className = 'quantity-btn';
            minusBtn.setAttribute('aria-label', 'Зменшити кількість');
            minusBtn.textContent = '-';
            minusBtn.onclick = typeof changeQuantity === 'function' ? () => changeQuantity(product._id, -1) : null;
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
            plusBtn.onclick = typeof changeQuantity === 'function' ? () => changeQuantity(product._id, 1) : null;
            qtyDiv.appendChild(plusBtn);
            rightDiv.appendChild(qtyDiv);
        }

        // === Кнопка купити та favorite ===
        const actionsRow = document.createElement('div');
        actionsRow.style.display = 'flex';
        actionsRow.style.alignItems = 'center';
        actionsRow.style.gap = '1px';

        const buyBtn = document.createElement('button');
        buyBtn.className = 'buy-btn';
        buyBtn.textContent = 'Додати в кошик';
        buyBtn.onclick = typeof addToCartWithColor === 'function' ? () => addToCartWithColor(product._id) : null;
        if (product.type !== 'group') actionsRow.appendChild(buyBtn);

        // Додаємо іконку серця поруч з кнопкою купити
        const favoriteIcon = document.createElement('div');
        favoriteIcon.className = 'favorite-icon';
        favoriteIcon.style.display = 'inline-block';
        favoriteIcon.style.marginLeft = '0';
        favoriteIcon.setAttribute('data-product-id', product._id);
        favoriteIcon.innerHTML = `
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M13 23s-7.5-5.7-9.7-9.1C1.1 11.1 1 8.2 3.1 6.3c2.1-1.9 5.2-1.2 6.7 1C11 8.2 11.9 9.2 13 10.3c1.1-1.1 2-2.1 3.2-3C17.7 5.1 20.8 4.4 22.9 6.3c2.1 1.9 2 4.8-.2 7.6C20.5 17.3 13 23 13 23z" stroke="#10b981" stroke-width="2" fill="none"/>
          </svg>
        `;
        function updateFavoriteIcon() {
            if (isFavorite(product._id)) {
                favoriteIcon.classList.add('active');
            } else {
                favoriteIcon.classList.remove('active');
            }
        }
        updateFavoriteIcon();
        favoriteIcon.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            toggleFavorite(product._id);
            updateFavoriteIcon();
        };
        actionsRow.appendChild(favoriteIcon);
        rightDiv.appendChild(actionsRow);

        // Функція для отримання всіх кольорів з блоків


        // Відображаємо кольори згруповано по блоках
        if (product.colorBlocks && Array.isArray(product.colorBlocks)) {
            product.colorBlocks.forEach((block, blockIndex) => {
                if (block.colors && Array.isArray(block.colors) && block.colors.length > 0) {
                    const colorP = document.createElement('p');
                    colorP.innerHTML = `<strong>${block.blockName}:</strong>`;
                    rightDiv.appendChild(colorP);
                    const colorDiv = document.createElement('div');
                    colorDiv.id = `color-options-${product._id}-${blockIndex}`;

                    block.colors.forEach((c, i) => {
                        const circle = document.createElement('div');
                        circle.className = 'color-circle';
                        circle.style.background = c.photo ? `url(${c.photo})` : c.value;
                        circle.setAttribute('data-index', i);
                        circle.setAttribute('data-block-index', blockIndex);

                        const span = document.createElement('span');
                        span.textContent = c.name;

                        // Додаємо клас expanded лише для вибраного кольору
                        const globalIndex = getAllColors(product).findIndex(color => 
                            color.blockIndex === blockIndex && color.colorIndex === i
                        );
                        if (selectedColors[product._id]?.[blockIndex] === globalIndex) {
                            span.classList.add('expanded');
                        }

                        circle.onclick = () => {
                            // Знімаємо expanded з усіх span в цьому блоці
                            const allSpans = colorDiv.querySelectorAll('span');
                            allSpans.forEach(s => s.classList.remove('expanded'));
                            // Додаємо expanded лише для поточного
                            span.classList.add('expanded');
                            // Викликаємо вибір кольору
                            if (typeof selectColor === 'function') selectColor(product._id, blockIndex, globalIndex);
                        };

                        circle.appendChild(span);
                        colorDiv.appendChild(circle);
                    });
                    rightDiv.appendChild(colorDiv);
                }
            });
        } else if (product.colors && Array.isArray(product.colors) && product.colors.length > 0) {
            // Для старої структури
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

                const span = document.createElement('span');
                span.textContent = c.name;

                // Додаємо клас expanded лише для вибраного кольору
                if (selectedColors[product._id]?.[0] === i) {
                    span.classList.add('expanded');
                }

                circle.onclick = () => {
                    // Знімаємо expanded з усіх span
                    const allSpans = colorDiv.querySelectorAll('span');
                    allSpans.forEach(s => s.classList.remove('expanded'));
                    // Додаємо expanded лише для поточного
                    span.classList.add('expanded');
                    // Викликаємо вибір кольору (якщо потрібно)
                    if (typeof selectColor === 'function') selectColor(product._id, 0, i);
                };

                circle.appendChild(span);
                colorDiv.appendChild(circle);
            });
            rightDiv.appendChild(colorDiv);
        }

        const charDiv = document.createElement('div');
        charDiv.className = 'product-characteristics';
        // Виробник
        if (product.brand && product.brand.trim() !== '' && product.brand !== 'Не вказано') {
            charDiv.appendChild(createCharP('Виробник', product.brand));
        }
        // Матеріал
        if (product.material && product.material.trim() !== '') {
            charDiv.appendChild(createCharP('Матеріал', product.material));
        }
        // Розміри
        const dimensions = [];
        if (product.widthCm) dimensions.push({ label: 'Ширина', value: product.widthCm });
        if (product.heightCm) dimensions.push({ label: 'Висота', value: product.heightCm });
        if (product.depthCm) dimensions.push({ label: 'Глибина', value: product.depthCm });
        if (product.lengthCm) dimensions.push({ label: 'Довжина', value: product.lengthCm });
        if (dimensions.length > 0 && product.type !== 'group') {
            dimensions.forEach(dim => {
                const formattedValue = Number.isInteger(dim.value) ? dim.value : dim.value.toFixed(1).replace('.', ',');
                charDiv.appendChild(createCharP(dim.label, `${formattedValue} см`));
            });
        }
        rightDiv.appendChild(charDiv);

        topDiv.appendChild(rightDiv);
        container.appendChild(topDiv);

        if (product.type === 'group' && product.groupProducts?.length > 0) {
            const groupDiv = document.createElement('div');
            groupDiv.className = 'group-products';

            const savedSelection = loadFromStorage(`groupSelection_${product._id}`, {});
            // Завантажуємо повну інформацію про товари у групі
            const groupProductsData = [];
            for (const id of product.groupProducts) {
                let p = products.find(p => p._id === id);
                if (!p) {
                    console.warn(`Груповий товар з ID ${id} не знайдено`);
                    continue;
                }
                
                // Якщо товар не має повної інформації про кольори, спробуємо завантажити його окремо
                if (!p.colorBlocks && !p.colors) {
                    try {
                        const response = await fetch(`${BASE_URL}/api/public/products?slug=${p.slug}`);
                        if (response.ok) {
                            const productsData = await response.json();
                            const fullProduct = productsData.find(prod => prod._id === id);
                            if (fullProduct) {
                                // Оновлюємо товар в масиві products
                                const index = products.findIndex(prod => prod._id === id);
                                if (index !== -1) {
                                    products[index] = { ...products[index], ...fullProduct };
                                    p = products[index];
                                }
                            }
                        }
                    } catch (error) {
                        console.warn(`Не вдалося завантажити повну інформацію про товар ${id}:`, error);
                    }
                }
                
                groupProductsData.push(p);
            }
            
            groupProductsData.forEach(p => {
                const itemDiv = document.createElement('div');
                itemDiv.className = 'group-product-item product';

                const imgLink = document.createElement('a');
                imgLink.href = `/${transliterate(p.category.replace('ь', ''))}${p.subcategory ? `/${transliterate(p.subcategory.replace('ь', ''))}` : ''}/${p.slug}`;
                imgLink.onclick = (e) => {
                    e.preventDefault();
                    parentGroupProduct = product;
                    saveToStorage('parentGroupProduct', parentGroupProduct);
                    currentProduct = p;
                    if (typeof showSection === 'function') {
                        showSection('product-details');
                    }
                };
                const img = document.createElement('img');
                img.src = p.photos?.[0] || NO_IMAGE_URL;
                img.alt = p.name;
                img.loading = 'lazy';
                imgLink.appendChild(img);
                itemDiv.appendChild(imgLink);

                const h3Link = document.createElement('a');
                h3Link.href = `/${transliterate(p.category.replace('ь', ''))}${p.subcategory ? `/${transliterate(p.subcategory.replace('ь', ''))}` : ''}/${p.slug}`;
                h3Link.onclick = (e) => {
                    e.preventDefault();
                    parentGroupProduct = product;
                    saveToStorage('parentGroupProduct', parentGroupProduct);
                    currentProduct = p;
                    if (typeof showSection === 'function') {
                        showSection('product-details');
                    }
                };
                const h3 = document.createElement('h3');
                h3.textContent = p.name;
                h3Link.appendChild(h3);
                itemDiv.appendChild(h3Link);

                // Додаємо вибір кольорів відразу під назвою товару
                if (p.colorBlocks && Array.isArray(p.colorBlocks) && p.colorBlocks.length > 0) {
                    // Нова структура з блоками кольорів
                    p.colorBlocks.forEach((block, blockIndex) => {
                        if (block.colors && Array.isArray(block.colors) && block.colors.length > 0) {
                            const colorDiv = document.createElement('div');
                            colorDiv.className = 'group-product-colors';
                            colorDiv.style.marginTop = '5px';
                            colorDiv.style.marginBottom = '5px';
                            
                            const colorLabel = document.createElement('p');
                            colorLabel.innerHTML = `<strong>${block.blockName || block.name || 'Колір'}:</strong>`;
                            colorLabel.style.marginBottom = '4px';
                            colorLabel.style.fontSize = '14px';
                            colorDiv.appendChild(colorLabel);
                            
                            const colorOptionsDiv = document.createElement('div');
                            colorOptionsDiv.className = 'color-options';
                            colorOptionsDiv.style.display = 'flex';
                            colorOptionsDiv.style.flexWrap = 'wrap';
                            colorOptionsDiv.style.justifyContent = 'center';
                            
                            // Адаптивні відступи залежно від розміру екрану
                            if (window.innerWidth <= 480) {
                                colorOptionsDiv.style.gap = '11px';
                                colorOptionsDiv.style.padding = '0 1px';
                            } else if (window.innerWidth <= 768) {
                                colorOptionsDiv.style.gap = '13px';
                                colorOptionsDiv.style.padding = '0 2px';
                            } else {
                                colorOptionsDiv.style.gap = '15px';
                                colorOptionsDiv.style.padding = '0 3px';
                            }
                            
                            block.colors.forEach((color, colorIndex) => {
                                // Обчислюємо глобальний індекс кольору
                                let globalIndex = colorIndex;
                                for (let i = 0; i < blockIndex; i++) {
                                    if (p.colorBlocks[i] && p.colorBlocks[i].colors) {
                                        globalIndex += p.colorBlocks[i].colors.length;
                                    }
                                }
                                
                                const colorCircle = document.createElement('div');
                                colorCircle.className = 'color-circle group-color-circle';
                                colorCircle.style.width = '45px';
                                colorCircle.style.height = '45px';
                                colorCircle.style.borderRadius = '50%';
                                colorCircle.style.border = '2px solid #ddd';
                                colorCircle.style.cursor = 'pointer';
                                colorCircle.style.position = 'relative';
                                colorCircle.style.background = color.photo ? `url(${color.photo}) center/cover` : color.value;
                                colorCircle.setAttribute('data-product-id', p._id);
                                colorCircle.setAttribute('data-color-index', globalIndex);
                                colorCircle.setAttribute('data-block-index', blockIndex);
                                
                                // Перевіряємо, чи цей колір вже вибраний
                                const currentSelectedColor = selectedColors[p._id]?.[blockIndex];
                                if (currentSelectedColor === globalIndex) {
                                    colorCircle.classList.add('selected');
                                    colorCircle.style.border = '2px solid #60A5FA';
                                }
                                
                                colorCircle.onclick = () => selectGroupProductColor(p._id, blockIndex, globalIndex);
                                
                                // Додаємо назву кольору при наведенні
                                colorCircle.title = color.name;
                                
                                colorOptionsDiv.appendChild(colorCircle);
                            });
                            
                            colorDiv.appendChild(colorOptionsDiv);
                            itemDiv.appendChild(colorDiv);
                        }
                    });
                } else if (p.colors && Array.isArray(p.colors) && p.colors.length > 0) {
                    // Стара структура з одним блоком кольорів
                    const colorDiv = document.createElement('div');
                    colorDiv.className = 'group-product-colors';
                    colorDiv.style.marginTop = '5px';
                    colorDiv.style.marginBottom = '5px';
                    
                    const colorLabel = document.createElement('p');
                    colorLabel.innerHTML = '<strong>Колір:</strong>';
                    colorLabel.style.marginBottom = '4px';
                    colorLabel.style.fontSize = '14px';
                    colorDiv.appendChild(colorLabel);
                    
                    const colorOptionsDiv = document.createElement('div');
                    colorOptionsDiv.className = 'color-options';
                    colorOptionsDiv.style.display = 'flex';
                    colorOptionsDiv.style.flexWrap = 'wrap';
                    colorOptionsDiv.style.justifyContent = 'center';
                    
                    // Адаптивні відступи залежно від розміру екрану
                    if (window.innerWidth <= 480) {
                        colorOptionsDiv.style.gap = '11px';
                        colorOptionsDiv.style.padding = '0 1px';
                    } else if (window.innerWidth <= 768) {
                        colorOptionsDiv.style.gap = '13px';
                        colorOptionsDiv.style.padding = '0 2px';
                    } else {
                        colorOptionsDiv.style.gap = '15px';
                        colorOptionsDiv.style.padding = '0 3px';
                    }
                    
                    p.colors.forEach((color, colorIndex) => {
                        const colorCircle = document.createElement('div');
                        colorCircle.className = 'color-circle group-color-circle';
                        colorCircle.style.width = '45px';
                        colorCircle.style.height = '45px';
                        colorCircle.style.borderRadius = '50%';
                        colorCircle.style.border = '2px solid #ddd';
                        colorCircle.style.cursor = 'pointer';
                        colorCircle.style.position = 'relative';
                        colorCircle.style.background = color.photo ? `url(${color.photo}) center/cover` : color.value;
                        colorCircle.setAttribute('data-product-id', p._id);
                        colorCircle.setAttribute('data-color-index', colorIndex);
                        colorCircle.setAttribute('data-block-index', '0');
                        
                        // Перевіряємо, чи цей колір вже вибраний
                        const currentSelectedColor = selectedColors[p._id]?.[0];
                        if (currentSelectedColor === colorIndex) {
                            colorCircle.classList.add('selected');
                            colorCircle.style.border = '2px solid #60A5FA';
                        }
                        
                        colorCircle.onclick = () => selectGroupProductColor(p._id, 0, colorIndex);
                        
                        // Додаємо назву кольору при наведенні
                        colorCircle.title = color.name;
                        
                        colorOptionsDiv.appendChild(colorCircle);
                    });
                    
                    colorDiv.appendChild(colorOptionsDiv);
                    itemDiv.appendChild(colorDiv);
                } else {
                    // Додаємо прозорий плейсхолдер для товарів без кольорів
                    const colorPlaceholder = document.createElement('div');
                    colorPlaceholder.className = 'group-product-colors-placeholder';
                    colorPlaceholder.style.height = '30px';
                    colorPlaceholder.style.marginTop = '5px';
                    colorPlaceholder.style.marginBottom = '5px';
                    colorPlaceholder.style.opacity = '0';
                    itemDiv.appendChild(colorPlaceholder);
                }

                const dimensions = [];
                if (p.widthCm) dimensions.push(p.widthCm);
                if (p.heightCm) dimensions.push(p.heightCm);
                if (p.depthCm) dimensions.push(p.depthCm);
                if (p.lengthCm) dimensions.push(p.lengthCm);
                if (dimensions.length > 0) {
                    const dimensionsDiv = document.createElement('div');
                    dimensionsDiv.className = 'dimensions';

                    const labels = ['Шир.', 'Вис.', 'Гл.', 'Дов.'];

                    // Створюємо контейнер для всіх пар позначення-значення
                    const dimensionsContainer = document.createElement('div');
                    dimensionsContainer.style.display = 'flex';
                    dimensionsContainer.style.justifyContent = 'center';
                    dimensionsContainer.style.alignItems = 'center';
                    dimensionsContainer.style.gap = '6px';
                    dimensionsContainer.className = 'dimensions-container';
                    
                    // Прибираємо відступи на екранах до 480px
                    if (window.innerWidth <= 480) {
                        dimensionsContainer.style.gap = '0px';
                        dimensionsContainer.style.flexWrap = 'nowrap';
                        dimensionsContainer.style.padding = '0 2px 0 0';
                        dimensionsContainer.style.margin = '0';
                        dimensionsContainer.style.justifyContent = 'center';
                        dimensionsContainer.style.width = '100%';
                    }

                    for (let i = 0; i < dimensions.length; i++) {
                        // Створюємо контейнер для кожної пари позначення-значення
                        const pairContainer = document.createElement('div');
                        pairContainer.style.display = 'flex';
                        pairContainer.style.flexDirection = 'column';
                        pairContainer.style.alignItems = 'center';
                        pairContainer.style.minWidth = '50px';
                        pairContainer.className = 'dimension-pair';
                        
                        // Налаштовуємо для екранів до 480px
                        if (window.innerWidth <= 480) {
                            pairContainer.style.minWidth = 'auto';
                            pairContainer.style.margin = '0';
                            pairContainer.style.gap = '1px';
                            pairContainer.style.flex = '0 1 auto';
                            pairContainer.style.display = 'flex';
                            pairContainer.style.flexDirection = 'column';
                            pairContainer.style.alignItems = 'center';
                        }

                        // Додаємо позначення
                        const labelSpan = document.createElement('span');
                        labelSpan.className = 'dimension-label';
                        labelSpan.textContent = labels[i];
                        labelSpan.style.textAlign = 'center';
                        labelSpan.style.fontSize = '12px';
                        // Додаємо підтримку темної теми
                        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                            labelSpan.style.color = '#ffffff';
                        } else {
                            labelSpan.style.color = '#000000';
                        }
                        labelSpan.style.marginBottom = '2px';
                        
                        // Адаптивний розмір шрифту на екранах до 480px
                        if (window.innerWidth <= 480) {
                            // Адаптивний розмір шрифту: мінімум 8px, максимум 14px, залежить від ширини вікна
                            const fontSize = Math.max(8, Math.min(14, window.innerWidth * 0.035));
                            labelSpan.style.fontSize = fontSize + 'px';
                        }
                        
                        pairContainer.appendChild(labelSpan);
                        
                        // Додаємо значення
                        const valueSpan = document.createElement('span');
                        valueSpan.className = 'dimension-value';
                        const formattedValue = Number.isInteger(dimensions[i]) ? dimensions[i] : dimensions[i].toFixed(1).replace('.', ',');
                        valueSpan.textContent = `${formattedValue} см`;
                        valueSpan.style.textAlign = 'center';
                        valueSpan.style.fontSize = '14px';
                        
                        // Адаптивний розмір шрифту на екранах до 480px
                        if (window.innerWidth <= 480) {
                            // Адаптивний розмір шрифту: мінімум 9px, максимум 14px, залежить від ширини вікна
                            const fontSize = Math.max(9, Math.min(14, window.innerWidth * 0.04));
                            valueSpan.style.fontSize = fontSize + 'px';
                        }
                        
                        pairContainer.appendChild(valueSpan);

                        dimensionsContainer.appendChild(pairContainer);
                        
                        // Додаємо роздільник між парами (крім останньої)
                        if (i < dimensions.length - 1) {
                            const separator = document.createElement('span');
                            separator.textContent = '×';
                            separator.style.color = '#666';
                            separator.style.fontSize = '14px';
                            // Прибираємо відступи навколо роздільника на екранах до 480px
                        if (window.innerWidth <= 480) {
                            separator.style.margin = '0';
                            // Адаптивний розмір шрифту: мінімум 8px, максимум 14px, залежить від ширини вікна
                            const fontSize = Math.max(8, Math.min(14, window.innerWidth * 0.04));
                            separator.style.fontSize = fontSize + 'px';
                        } else {
                            separator.style.margin = '0 1px';
                        }
                            separator.className = 'dimension-separator';
                            dimensionsContainer.appendChild(separator);
                        }
                    }

                    dimensionsDiv.appendChild(dimensionsContainer);
                    itemDiv.appendChild(dimensionsDiv);
                } else {
                    // Додаємо прозорий плейсхолдер для товарів без розмірів
                    const dimensionsPlaceholder = document.createElement('div');
                    dimensionsPlaceholder.className = 'dimensions';
                    dimensionsPlaceholder.style.visibility = 'hidden';
                    dimensionsPlaceholder.style.minHeight = '60px';
                    dimensionsPlaceholder.style.margin = '0 0 15px 0';
                    itemDiv.appendChild(dimensionsPlaceholder);
                }

                const priceDiv = document.createElement('div');
                priceDiv.className = 'price';
                if (p.type === 'mattresses' && p.sizes?.length > 0) {
                    const saleSizes = p.sizes.filter(s => s.salePrice && s.salePrice < s.price);
                    const minSale = saleSizes.length > 0 ? Math.min(...saleSizes.map(s => s.salePrice)) : null;
                    const minPrice = Math.min(...p.sizes.map(s => s.price));
                    if (minSale !== null && minSale < minPrice) {
                        const regularSpan = document.createElement('span');
                        regularSpan.className = 'regular-price';
                        regularSpan.innerHTML = `<s class='price-value'>${minPrice}</s> <span class='price-suffix'>грн</span>`;
                        priceDiv.appendChild(regularSpan);
                        const saleSpan = document.createElement('span');
                        saleSpan.className = 'sale-price';
                        saleSpan.innerHTML = `<span class='price-value'>${minSale}</span> <span class='price-suffix'>грн</span>`;
                        priceDiv.appendChild(saleSpan);
                    } else {
                        // Додаємо прозорий рядок для вирівнювання з товарами, що мають акцію
                        const emptySpan = document.createElement('span');
                        emptySpan.style.visibility = 'hidden';
                        emptySpan.innerHTML = `<s class='price-value'>${minPrice}</s> <span class='price-suffix'>грн</span>`;
                        priceDiv.appendChild(emptySpan);
                        const regularSpan = document.createElement('span');
                        regularSpan.className = 'regular-price';
                        regularSpan.innerHTML = `<span class='price-value'>${minPrice}</span> <span class='price-suffix'>грн</span>`;
                        priceDiv.appendChild(regularSpan);
                    }
                } else {
                    const isOnSaleP = p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date());
                    if (isOnSaleP) {
                        const regularSpan = document.createElement('span');
                        regularSpan.className = 'regular-price';
regularSpan.innerHTML = `<s class='price-value'>${p.price}</s> <span class='price-suffix'>грн</span>`;
                        priceDiv.appendChild(regularSpan);
                        const saleSpan = document.createElement('span');
                        saleSpan.className = 'sale-price';
                        saleSpan.innerHTML = `<span class='price-value'>${p.salePrice}</span> <span class='price-suffix'>грн</span>`;
                        priceDiv.appendChild(saleSpan);
                    } else {
                        // Додаємо прозорий рядок для вирівнювання з товарами, що мають акцію
                        const emptySpan = document.createElement('span');
                        emptySpan.style.visibility = 'hidden';
                        emptySpan.innerHTML = `<s class='price-value'>${p.price}</s> <span class='price-suffix'>грн</span>`;
                        priceDiv.appendChild(emptySpan);
                        const regularSpan = document.createElement('span');
                        regularSpan.className = 'regular-price';
                        regularSpan.innerHTML = `<span class='price-value'>${p.price}</span> <span class='price-suffix'>грн</span>`;
                        priceDiv.appendChild(regularSpan);
                    }
                }
                itemDiv.appendChild(priceDiv);

                const qtyDiv = document.createElement('div');
                qtyDiv.className = 'quantity-selector';
                const minusBtn = document.createElement('button');
                minusBtn.className = 'quantity-btn';
                minusBtn.setAttribute('aria-label', 'Зменшити кількість');
                minusBtn.textContent = '-';
                minusBtn.onclick = typeof changeGroupQuantity === 'function' ? () => changeGroupQuantity(product._id, p._id, -1) : null;
                qtyDiv.appendChild(minusBtn);

                const qtyInput = document.createElement('input');
                qtyInput.type = 'number';
                qtyInput.id = `group-quantity-${product._id}-${p._id}`;
                qtyInput.min = '0';
                qtyInput.value = savedSelection[p._id] || '0';
                qtyInput.readOnly = true;
                qtyDiv.appendChild(qtyInput);

                const plusBtn = document.createElement('button');
                plusBtn.className = 'quantity-btn';
                plusBtn.setAttribute('aria-label', 'Збільшити кількість');
                plusBtn.textContent = '+';
                plusBtn.onclick = typeof changeGroupQuantity === 'function' ? () => changeGroupQuantity(product._id, p._id, 1) : null;
                qtyDiv.appendChild(plusBtn);
                itemDiv.appendChild(qtyDiv);

                groupDiv.appendChild(itemDiv);
            });

            container.appendChild(groupDiv);

            const floatingContainer = document.createElement('div');
            floatingContainer.className = 'floating-group-cart';
            floatingContainer.id = 'floating-group-cart';
            const floatingPrice = document.createElement('span');
            floatingPrice.className = 'floating-group-price';
            floatingPrice.innerHTML = `Загальна ціна: <span style="white-space: nowrap;">0 грн</span>`;
            floatingContainer.appendChild(floatingPrice);

            const floatingBtn = document.createElement('button');
            floatingBtn.className = 'floating-group-buy-btn';
            floatingBtn.textContent = 'Додати в кошик';
            floatingBtn.onclick = typeof addGroupToCart === 'function' ? () => addGroupToCart(product._id) : null;
            floatingContainer.appendChild(floatingBtn);
            container.appendChild(floatingContainer);

            if (typeof updateGroupSelectionWithQuantity === 'function') {
                await updateGroupSelectionWithQuantity(product._id);
            }
            await updateFloatingGroupCart(); // Додаємо виклик для оновлення цін і стану
            
            // Оновлюємо ціни товарів у групі з урахуванням вибраних кольорів
            product.groupProducts.forEach(groupProductId => {
                if (selectedColors[groupProductId] !== undefined) {
                    updateGroupProductPrice(groupProductId);
                }
            });

            const handleScroll = () => {
                const groupProducts = document.querySelector('.group-products');
                if (groupProducts) {
                    const rect = groupProducts.getBoundingClientRect();
                    const isVisible = rect.top < window.innerHeight && rect.bottom > 0;
                    floatingContainer.classList.toggle('visible', isVisible && product.type === 'group');
                }
            };

            handleScroll();

            window.addEventListener('scroll', handleScroll);
            const cleanup = () => {
                window.removeEventListener('scroll', handleScroll);
            };
            document.addEventListener('sectionChange', cleanup, { once: true });
        }

        if (product.description && product.description.trim() !== '') {
            const descDiv = document.createElement('div');
            descDiv.className = 'product-detail-description';
            descDiv.appendChild(createCharP('Опис', product.description));
            container.appendChild(descDiv);
        }

        productDetails.appendChild(container);

        if (product.type === 'mattresses' && selectedMattressSizes[product._id]) {
            // document.getElementById(`mattress-size-${product._id}`).value = selectedMattressSizes[product._id]; // Видалено, бо кастомний селект
            if (typeof updateMattressPrice === 'function') {
                await updateMattressPrice(product._id);
            }
        }
        const allColors = getAllColors(product);
        if (allColors.length >= 1 && selectedColors[product._id] !== undefined) {
            const selectedColor = allColors[selectedColors[product._id]];
            if (selectedColor && selectedColor.photo) {
                document.querySelector(`#color-options-${product._id}-${selectedColor.blockIndex} .color-circle[data-index="${selectedColor.colorIndex}"]`)?.classList.add('selected');
            } else {
                const colorSelectElement = document.getElementById(`color-select-${product._id}`);
                if (colorSelectElement) {
                    colorSelectElement.value = selectedColors[product._id];
                    if (typeof updateColorPrice === 'function') {
                        await updateColorPrice(product._id);
                    }
                }
            }
        }
        if (typeof renderBreadcrumbs === 'function') {
            await renderBreadcrumbs();
        }

        // Оновлюємо ціну при завантаженні сторінки, якщо вибраний колір
        if (selectedColors[product._id] !== undefined) {
            if (product.type === 'group') {
                updateFloatingGroupCart();
                // Оновлюємо ціни всіх товарів у групі
                if (product.groupProducts) {
                    product.groupProducts.forEach(groupProductId => {
                        if (selectedColors[groupProductId] !== undefined) {
                            updateGroupProductPrice(groupProductId);
                        }
                    });
                }
            } else {
                // Невелика затримка для забезпечення рендерингу DOM
                setTimeout(() => {
                    updateColorPrice(product._id);
                }, 100);
            }
        }

        // ОНОВЛЮЄМО СТАН ІКОНКИ ПІСЛЯ РЕНДЕРУ
        updateFavoriteIconsOnPage();
        
        // Відновлюємо графічне відображення вибраних кольорів
        restoreSelectedColors();

        return Promise.resolve();
    } catch (error) {
        console.error('Помилка в renderProductDetails:', error.message, error.stack);
        if (typeof showSection === 'function') {
            showSection('home');
        }
        return Promise.resolve();
    }
}

function updateFavoriteIconsOnPage() {
    const favoriteIcons = document.querySelectorAll('.favorite-icon[data-product-id]');
    const favs = getFavorites();
    favoriteIcons.forEach(icon => {
        const productId = icon.getAttribute('data-product-id');
        if (favs.includes(productId) || favs.includes(Number(productId))) {
            icon.classList.add('active');
        } else {
            icon.classList.remove('active');
        }
    });
}

async function addGroupToCart(productId) {
    const product = products.find(p => p._id === productId);
    if (!product || product.type !== 'group') {
        console.error('Помилка: груповий товар не знайдено або не є груповим:', productId);
        return;
    }

    const selectedItems = loadFromStorage(`groupSelection_${productId}`, {});
    const selectedCount = Object.values(selectedItems).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);

    if (selectedCount === 0) {
        console.warn('Не вибрано жодного товару для додавання до кошика');
        return;
    }

    // Перевіряємо, чи вибрані кольори для товарів з кольорами
    const productsNeedingColors = [];
    for (const [id, quantity] of Object.entries(selectedItems)) {
        const qty = parseInt(quantity);
        if (qty <= 0) continue;

        const p = products.find(p => p._id === id);
        if (!p) continue;

        // Якщо у товару є кольори і їх більше одного
        const allColors = getAllColors(p);
        if (allColors.length > 1) {
            const selectedColorIndices = selectedColors[p._id];
            if (!selectedColorIndices || Object.keys(selectedColorIndices).length === 0) {
                productsNeedingColors.push(p.name);
            }
        }
    }

    if (productsNeedingColors.length > 0) {
        showNotification(`Виберіть колір для товарів: ${productsNeedingColors.join(', ')}`, 'warning');
        return;
    }

    let cart = loadFromStorage('cart', []);

    const invalidItems = [];
    const cartItemsToAdd = [];

    for (const [id, quantity] of Object.entries(selectedItems)) {
        const qty = parseInt(quantity);
        if (qty <= 0) continue;

        const p = products.find(p => p._id === id);
        if (!p) {
            console.warn(`Товар з ID ${id} не знайдено`);
            invalidItems.push(id);
            continue;
        }

        const isOnSale = p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date());
        let price = isOnSale ? parseFloat(p.salePrice) : parseFloat(p.price || 0);
        let selectedColor = null;
        let selectedSize = null;

        const allColors = getAllColors(p);
        if (allColors.length > 0) {
            let selectedColorsForCart = [];
            
            // Якщо у товару тільки один колір - вибираємо його автоматично
            if (allColors.length === 1) {
                selectedColors[p._id] = { 0: 0 };
                saveToStorage('selectedColors', selectedColors);
                selectedColorsForCart.push(allColors[0]);
            } else {
                // Якщо кольорів більше - використовуємо вибрані
                const selectedColorIndices = selectedColors[p._id];
                if (!selectedColorIndices || Object.keys(selectedColorIndices).length === 0) {
                    console.warn(`Кольори не вибрані для товару ${p.name}`);
                    invalidItems.push(p.name);
                    continue;
                }
                
                // Отримуємо всі вибрані кольори
                Object.values(selectedColorIndices).forEach(globalIndex => {
                    const selectedColor = allColors.find(color => color.globalIndex === globalIndex);
                    if (selectedColor) {
                        selectedColorsForCart.push(selectedColor);
                    }
                });
            }
            
            // Додаємо зміну ціни від усіх вибраних кольорів
            selectedColorsForCart.forEach(color => {
                price += parseFloat(color.priceChange || 0);
            });
            
            // Створюємо об'єкт кольорів для кошика
            selectedColor = selectedColorsForCart.length === 1 ? selectedColorsForCart[0] : selectedColorsForCart;
        }

        if (p.type === 'mattresses' && selectedMattressSizes[p._id]) {
            selectedSize = selectedMattressSizes[p._id];
            const sizeInfo = p.sizes?.find(s => s.name === selectedSize);
            if (sizeInfo) {
                // Перевіряємо акційну ціну розміру
                if (sizeInfo.salePrice && sizeInfo.salePrice < sizeInfo.price) {
                    price = parseFloat(sizeInfo.salePrice);
                } else {
                    price = parseFloat(sizeInfo.price || price);
                }
            } else {
                console.warn(`Розмір ${selectedSize} недоступний для товару ${p.name}`);
                invalidItems.push(p.name);
                continue;
            }
        }

        // Створюємо унікальний ключ для кошика
        let normalizedColorName = 'no-color';
        if (Array.isArray(selectedColor)) {
            normalizedColorName = selectedColor.map(c => c.name.toLowerCase().replace(/\s+/g, '-')).join('_');
        } else if (selectedColor && selectedColor.name) {
            normalizedColorName = selectedColor.name.toLowerCase().replace(/\s+/g, '-');
        }
        const normalizedSize = selectedSize ? selectedSize.toLowerCase().replace(/\s+/g, '-') : 'no-size';
        const cartItemId = `${p._id || p.id}_${normalizedColorName}_${normalizedSize}`;

        const cartItem = {
            id: p._id || p.id,
            cartItemKey: cartItemId,
            productId: p._id,
            name: p.name,
            price: parseFloat(price),
            quantity: qty,
            photo: p.photos?.[0] || NO_IMAGE_URL,
            colors: Array.isArray(selectedColor) ? selectedColor : (selectedColor ? [selectedColor] : null),
            size: selectedSize,
            groupParentId: productId
        };

        if (isNaN(cartItem.price) || cartItem.price <= 0 || !cartItem.name || !cartItem.quantity) {
            console.error('Некоректний елемент кошика:', cartItem);
            invalidItems.push(p.name);
            continue;
        }

        cartItemsToAdd.push(cartItem);
    }

    if (invalidItems.length > 0) {
        console.warn('Недоступні товари:', invalidItems);
        console.error(`Не вдалося додати товари: ${invalidItems.join(', ')}`);
        return;
    }

    if (cartItemsToAdd.length === 0) {
        console.warn('Немає валідних товарів для додавання до кошика');
        console.error('Не вибрано валідних товарів для додавання!');
        return;
    }

    cartItemsToAdd.forEach(cartItem => {
        const existingItemIndex = cart.findIndex(item => item.cartItemKey === cartItem.cartItemKey);
        if (existingItemIndex > -1) {
            cart[existingItemIndex].quantity += cartItem.quantity;
        } else {
            cart.push(cartItem);
        }
    });

    try {
        saveToStorage('cart', cart);
        await saveCartToServer();
        updateCartCount();
        debouncedRenderCart();
        showNotification('Вибрані товари додано до кошика!', 'success');

        saveToStorage(`groupSelection_${productId}`, {});
        
        product.groupProducts.forEach(id => {
            const qtyInput = document.getElementById(`group-quantity-${productId}-${id}`);
            if (qtyInput) {
                qtyInput.value = '0';
            }
        });

        const priceDiv = document.querySelector('.group-total-price');
        if (priceDiv) {
            priceDiv.innerHTML = `Загальна ціна: <span style="white-space: nowrap;">0 грн</span>`;
        }
        await updateFloatingGroupCart();
    } catch (error) {
        console.error('Помилка синхронізації кошика з сервером:', error);
        showNotification('Дані збережено локально, але не вдалося синхронізувати з сервером.', 'warning');
    }
}

async function fetchProductBySlug(slug) {
    // Перевіряємо, чи slug відповідає категорії
    const category = categories.find(c => transliterate(c.name.replace('ь', '')) === slug);
    if (category) {
        console.log('fetchProductBySlug: slug відповідає категорії:', category.name);
        currentCategory = category.name;
        currentSubcategory = null;
        currentProduct = null;
        isSearchActive = false;
        renderCatalog(currentCategory, null);
        showSection('catalog');
        return null; // Повертаємо null, щоб позначити, що це не продукт
    }

    // Перевіряємо, чи slug відповідає підкатегорії
    const subcategory = categories
        .flatMap(c => c.subcategories || [])
        .find(sc => sc.slug === slug || transliterate(sc.name.replace('ь', '')) === slug);
    if (subcategory) {
        const parentCategory = categories.find(c => c.subcategories?.includes(subcategory));
        if (parentCategory) {
            console.log('fetchProductBySlug: slug відповідає підкатегорії:', subcategory.name);
            currentCategory = parentCategory.name;
            currentSubcategory = subcategory.name;
            currentProduct = null;
            isSearchActive = false;
            renderCatalog(currentCategory, currentSubcategory);
            showSection('catalog');
            return null; // Повертаємо null, щоб позначити, що це не продукт
        }
    }

    // Якщо це не категорія і не підкатегорія, шукаємо продукт
    const cachedProduct = products.find(p => p.slug === slug);
    if (cachedProduct) {
        console.log('Продукт знайдено в локальному кеші:', cachedProduct.name, 'ID:', cachedProduct._id);
        return cachedProduct;
    }

    try {
        console.log('Запит продукту за slug:', slug, 'URL:', `${BASE_URL}/api/public/products?slug=${encodeURIComponent(slug)}`);
        const response = await fetchWithRetry(`${BASE_URL}/api/public/products?slug=${encodeURIComponent(slug)}`, { retries: 3 });
        console.log('Статус відповіді сервера:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Помилка сервера при запиті продукту:', response.status, errorText);
            throw new Error(`HTTP error! Status: ${response.status}, Response: ${errorText}`);
        }

        const contentType = response.headers.get('Content-Type');
        if (!contentType.includes('application/json')) {
            const errorText = await response.text();
            console.error('Сервер повернув не JSON:', contentType, 'Response:', errorText);
            throw new Error('Некоректний формат відповіді сервера');
        }

        const data = await response.json();
        console.log('Відповідь сервера для slug:', slug, 'Дані:', JSON.stringify(data, null, 2));

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
        console.error('Помилка отримання продукту за slug:', slug, 'Помилка:', error.message);
        return null;
    }
}

async function validateAndFixPageState() {
    const path = window.location.pathname.slice(1) || '';
    const parts = path.split('/').filter(p => p).map(p => decodeURIComponent(p));

    // Якщо шлях порожній, показуємо головну сторінку
    if (!parts.length) {
        currentCategory = null;
        currentSubcategory = null;
        currentProduct = null;
        isSearchActive = false;
        clearFilters();
        showSection('home');
        return;
    }

    // --- Обробка спеціальних сторінок ---
    if (parts[0] === 'about') {
        clearFilters();
        showSection('about');
        return;
    }
    if (parts[0] === 'contacts') {
        clearFilters();
        showSection('contacts');
        return;
    }
    if (parts[0] === 'cart') {
        clearFilters();
        showSection('cart');
        return;
    }
    if (parts[0] === 'catalog' && parts[1] === 'search') {
        showSection('catalog');
        return;
    }

    // --- Категорія/підкатегорія/товар ---
    // 1. Категорія по slug
    const cat = categories.find(c => c.slug === parts[0]);
    if (cat) {
        currentCategory = cat.slug;
        currentSubcategory = null;
        currentProduct = null;
        isSearchActive = false;

        // 2. Підкатегорія по slug
        if (parts.length === 2) {
            // Спочатку шукаємо по точному slug
            let subCat = (cat.subcategories || []).find(sub => sub.slug === parts[1]);
            
            // Якщо не знайдено, шукаємо по транслитерованому slug
            if (!subCat) {
                subCat = (cat.subcategories || []).find(sub => transliterate(sub.name.replace('ь', '')) === parts[1]);
            }
            
            if (subCat) {
                currentSubcategory = subCat.name;
                renderCatalog(currentCategory, currentSubcategory);
                showSection('catalog');
                return;
            }
            // Якщо parts[1] не підкатегорія, можливо це товар у цій категорії
            const product = products.find(p => p.slug === parts[1]);
            if (product) {
                currentProduct = product;
                currentCategory = product.category;
                currentSubcategory = product.subcategory || null;
                showSection('product-details');
                return;
            }
        }
        // 3. Підкатегорія + товар
        if (parts.length === 3) {
            // Спочатку шукаємо по точному slug
            let subCat = (cat.subcategories || []).find(sub => sub.slug === parts[1]);
            
            // Якщо не знайдено, шукаємо по транслитерованому slug
            if (!subCat) {
                subCat = (cat.subcategories || []).find(sub => transliterate(sub.name.replace('ь', '')) === parts[1]);
            }
            
            if (subCat) {
                currentSubcategory = subCat.name;
                const product = products.find(p => p.slug === parts[2]);
                if (product) {
                    currentProduct = product;
                    currentCategory = product.category;
                    currentSubcategory = product.subcategory || null;
                    showSection('product-details');
                    return;
                }
                // Якщо підкатегорія є, але товару немає — показуємо підкатегорію
                renderCatalog(currentCategory, currentSubcategory);
                showSection('catalog');
                return;
            }
        }
        // Якщо тільки категорія
        renderCatalog(currentCategory, null);
        showSection('catalog');
        return;
    }

    // --- Якщо не знайдено категорію, шукаємо товар по slug серед усіх продуктів ---
    if (parts.length >= 1) {
        const productSlug = parts[parts.length - 1];
        const product = products.find(p => p.slug === productSlug);
        if (product) {
            currentProduct = product;
            currentCategory = product.category;
            currentSubcategory = product.subcategory || null;
            showSection('product-details');
            return;
        }
        
        // Якщо товар не знайдено в локальних даних, спробуємо завантажити з сервера
        if (parts.length === 1) {
            const fetchedProduct = await fetchProductFromServer(productSlug);
            if (fetchedProduct) {
                currentProduct = fetchedProduct;
                currentCategory = fetchedProduct.category;
                currentSubcategory = fetchedProduct.subcategory || null;
                showSection('product-details');
                return;
            }
        }
    }

    // Якщо нічого не знайдено, показуємо головну сторінку
    console.warn('Сторінку не знайдено для шляху:', path);
    clearFilters();
    showSection('home');
}

async function fetchProductFromServer(slug) {
    try {
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

        products = products.filter(p => p._id !== product._id);
        products.push(product);
        saveToStorage('products', products);
        return product;
    } catch (error) {
        console.error('Помилка отримання продукту за slug:', error);
        return null;
    }
}

async function openProduct(slugOrId) {
    
    if (currentCategory || isSearchActive) {
        saveScrollPosition();
    }

    let product = null;
    if (typeof slugOrId === 'string' && slugOrId.includes('-')) {
        product = products.find(p => p._id === slugOrId);
    } else {
        product = products.find(p => p.slug === slugOrId);
    }

    if (!product && typeof slugOrId === 'string') {
        product = await fetchProductBySlug(slugOrId);
    }

    if (!product) {
        console.error('Product not found for slug or ID:', slugOrId);
        showSection('home');
        return;
    }

    if (typeof product._id !== 'string' || !product._id) {
        console.error('Некоректний _id продукту:', product);
        showSection('home');
        return;
    }



    const duplicateSlug = products.filter(p => p.slug === product.slug);
    if (duplicateSlug.length > 1) {
        console.warn('Duplicate slugs found:', product.slug, duplicateSlug);
        showSection('home');
        return;
    }

const categoryExists = categories.some(cat => cat.slug === product.category);
    if (!categoryExists) {
        console.error('Category does not exist:', product.category);
        showSection('home');
        return;
    }

    const subCategoryExists = product.subcategory 
        ? categories
        .filter(cat => cat.slug === product.category)
            .flatMap(cat => cat.subcategories || [])
            .some(sub => sub.name === product.subcategory)
        : true;
    if (!subCategoryExists) {
        console.warn('Subcategory does not exist:', product.subcategory, 'for product:', product.name);
        product.subcategory = null;
        currentSubcategory = null;
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

    const catSlug = transliterate(currentCategory.replace('ь', ''));
    
    // Знаходимо slug підкатегорії за назвою
    let subCatSlug = '';
    if (currentSubcategory) {
        const category = categories.find(c => c.slug === product.category);
        const subcategory = category?.subcategories?.find(sub => sub.name === currentSubcategory);
        subCatSlug = subcategory ? subcategory.slug : '';
    }
    
    const newPath = `/${catSlug}${subCatSlug ? `/${subCatSlug}` : ''}/${product.slug}`;
    const state = {
        sectionId: 'product-details',
        path: newPath,
        stateId: `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        currentPage: 1,
        currentCategory: currentCategory,
        currentSubcategory: currentSubcategory,
        isSearchActive: isSearchActive,
        searchQuery: searchQuery,
        searchResults: searchResults.map(p => p._id),
        // Зберігаємо інформацію про те, що товар був знайдений через пошук
        wasFoundViaSearch: isSearchActive
    };
    history.pushState(state, '', newPath);

    showSection('product-details');
}

function normalizeString(str) {
    return str ? str.normalize('NFC').toLowerCase() : '';
}

function searchProducts(query = '') {
    const searchInput = document.getElementById('search');
    const burgerSearchInput = document.querySelector('#burger-search');
    searchQuery = normalizeString(query || burgerSearchInput?.value.trim() || searchInput?.value.trim() || '');

    if (!searchQuery) {
        console.log('Порожній запит пошуку, дія не виконується');
        showNotification('Введіть пошуковий запит!', 'warning');
        return;
    }
    if (isSearchPending) {
        console.log('Пошук уже в процесі, ігноруємо повторний запит');
        return;
    }
    isSearchPending = true;

    console.log('Пошук за запитом:', searchQuery);
    console.log('Доступні продукти:', products);

    if (!history.state || !history.state.stateId) {
        const currentSection = document.querySelector('.section.active')?.id || 'home';
        const currentPath = window.location.pathname || '/';
        const currentState = {
            sectionId: currentSection,
            path: currentPath,
            stateId: `${currentSection}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            currentPage: currentPage || 1,
            currentCategory: currentCategory,
            currentSubcategory: currentSubcategory,
            isSearchActive: isSearchActive,
            searchQuery: searchQuery,
            scrollY: window.scrollY
        };
        history.replaceState(currentState, '', currentPath);
        console.log('Збережено поточний стан перед пошуком:', currentState);
    }

    searchResults = products.filter(p => {
        if (!p.visible) {
            console.log(`Продукт ${p.name} невидимий:`, p);
            return false;
        }
        const name = normalizeString(p.name);
        const brand = normalizeString(p.brand || '');
        const description = normalizeString(p.description || '');
        const matches = name.includes(searchQuery) || brand.includes(searchQuery) || description.includes(searchQuery);
        console.log(`Продукт ${p.name}, збіги: ${matches}`, { name, description });
        return matches;
    });

    baseSearchResults = [...searchResults];
    isSearchActive = true;
    currentProduct = null;
    currentCategory = null;
    currentSubcategory = null;

    saveToStorage('searchResults', searchResults.map(p => p._id));
    saveToStorage('searchQuery', searchQuery);
    saveToStorage('isSearchActive', isSearchActive);

    const validSections = ['home', 'catalog', 'cart', 'contacts', 'about', 'product-details'];
    const currentSection = document.querySelector('.section.active')?.id || 'home';
    if (validSections.includes(currentSection)) {
        showSection('catalog');
    }

    renderCatalog(null, null, null, searchResults);
    isSearchPending = false;

    const searchSlug = transliterate(searchQuery.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-'));
    const newPath = `/catalog/search/${searchSlug}`;
    const searchState = {
        sectionId: 'catalog',
        path: newPath,
        stateId: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        currentPage: 1,
        scrollY: 0,
        displayedProducts: document.querySelector('.product-grid')?.children.length || 0,
        currentCategory: null,
        currentSubcategory: null,
        isSearchActive: true,
        searchQuery: searchQuery,
        searchResults: searchResults.map(p => p._id)
    };

    history.replaceState(searchState, '', newPath);
    console.log('Оновлено стан пошуку:', searchState);
}

function restoreSearchState() {
    isSearchActive = loadFromStorage('isSearchActive', false);
    searchQuery = loadFromStorage('searchQuery', '');
    const searchResultIds = loadFromStorage('searchResults', []);
    searchResults = searchResultIds
        .map(id => products.find(p => p._id === id))
        .filter(p => p);
    baseSearchResults = [...searchResults];
}

async function updateCartPrices() {
    let cart = loadFromStorage('cart', []);
    if (!Array.isArray(cart)) cart = [];
    
    cart.forEach(item => {
        const product = products.find(p => p._id === item.id || p.id === item.id);
        if (!product) return;

        // Завжди перераховуємо ціну для товарів з кольорами, щоб гарантувати правильність
        // Це особливо важливо для товарів з кількома кольорами, де ціна може бути неправильною
        let shouldRecalculate = true;
        
        // Для товарів без кольорів, можна пропустити перерахунок
        if (!item.colors && !item.color) {
            shouldRecalculate = false;
        } else if (item.colors && Array.isArray(item.colors) && item.colors.length > 0) {
            // Якщо є кольори, завжди перераховуємо ціну
            shouldRecalculate = true;
        } else if (item.color && !item.color.priceChange) {
            shouldRecalculate = false;
        }

        if (!shouldRecalculate) {
            return;
        }

        let price = product.price || 0;
        const isOnSale = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date());

        if (product.type === 'mattresses' && item.size) {
            const sizeInfo = product.sizes?.find(s => s.name === item.size);
            if (sizeInfo) {
                console.log('updateCartPrices - Size info for', item.size, ':', sizeInfo);
                // Спочатку перевіряємо акційну ціну розміру
                if (sizeInfo.salePrice && sizeInfo.salePrice < sizeInfo.price) {
                    price = sizeInfo.salePrice;
                    console.log('updateCartPrices - Using sale price for size:', sizeInfo.salePrice);
                } else {
                    price = sizeInfo.price || price;
                    console.log('updateCartPrices - Using regular price for size:', sizeInfo.price);
                }
            }
        } else {
            // Обробляємо кольори
            let totalColorPriceChange = 0;
            
            // Нова структура (масив кольорів)
            if (item.colors && Array.isArray(item.colors) && item.colors.length > 0) {
                item.colors.forEach(color => {
                    if (color && color.priceChange) {
                        totalColorPriceChange += parseFloat(color.priceChange);
                    }
                });
            } 
            // Стара структура (один колір)
            else if (item.color && item.color.priceChange) {
                totalColorPriceChange += parseFloat(item.color.priceChange);
            }
            
            // Використовуємо базову ціну товару + зміну від кольорів
            const basePrice = isOnSale ? product.salePrice : product.price;
            price = basePrice + totalColorPriceChange;
        }

        item.price = parseFloat(price);
    });
    
    saveToStorage('cart', cart);
}

async function renderCart() {
    const cartItems = document.getElementById('cart-items');
    const cartContent = document.getElementById('cart-content');
    if (!cartItems || !cartContent) {
        console.error('Елементи cart-items або cart-content не знайдено');
        console.error('Помилка відображення кошика!');
        return;
    }

    if (!products || products.length === 0) {
        console.warn('Масив products порожній, перевірте WebSocket або локальні дані');
        console.warn('Список товарів порожній!');
        return;
    }

    let cart = loadFromStorage('cart', []);
    if (!Array.isArray(cart)) cart = [];
    
    console.log('Поточний масив products:', products);
    console.log('Поточний масив cart перед фільтрацією:', JSON.parse(JSON.stringify(cart)));

    const initialCartLength = cart.length;
    cart = cart.filter(item => {
        const product = products.find(p => p._id === item.id || p.id === item.id);
        if (!product) {
            console.warn(`Товар з id ${item.id} і key ${item.cartItemKey} недоступний і буде видалений з кошика:`, item);
            return false;
        }
        if (product.type === 'mattresses' && item.size) {
            const sizeInfo = product.sizes?.find(s => s.name === item.size);
            if (!sizeInfo) {
                console.warn(`Розмір ${item.size} недоступний для товару ${item.name}, видаляємо з кошика`);
                return false;
            }
        }
        return true;
    });

    if (initialCartLength !== cart.length) {
        console.log(`Видалено ${initialCartLength - cart.length} недоступних або невалідних товарів з кошика`);
        saveToStorage('cart', cart);
        try {
            await saveCartToServer();
        } catch (error) {
            console.error('Помилка синхронізації кошика з сервером:', error);
            showNotification('Дані збережено локально, але не вдалося синхронізувати з сервером.', 'warning');
        }
    }

    console.log('Поточний масив cart після фільтрації:', JSON.parse(JSON.stringify(cart)));

    const activeElement = document.activeElement;
    const activeElementId = activeElement?.id;
    const activeElementValue = activeElement?.value || '';

    const existingTimers = cartItems.querySelectorAll('.sale-timer');
    existingTimers.forEach(timer => {
        if (timer.dataset.intervalId) clearInterval(parseInt(timer.dataset.intervalId));
    });
    while (cartItems.firstChild) cartItems.removeChild(cartItems.firstChild);
    while (cartContent.firstChild) cartContent.removeChild(cartContent.firstChild);

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
        const itemDiv = document.createElement('div');
        itemDiv.className = 'cart-item';
        itemDiv.dataset.cartItemKey = item.cartItemKey;

        itemDiv.addEventListener('click', (e) => {
            const target = e.target;
            if (!target.closest('button') && !target.closest('input') && target.tagName !== 'IMG' && target.tagName !== 'SPAN') {
                window.getSelection().removeAllRanges();
            }
        });

        const product = products.find(p => p._id === item.id || p.id === item.id);
        let isAvailable = true;
        if (product && product.type === 'mattresses' && item.size) {
            const sizeInfo = product.sizes?.find(s => s.name === item.size);
            isAvailable = !!sizeInfo;
            console.log(`Перевірка розміру для товару ${item.name}: розмір ${item.size}, доступний: ${isAvailable}, поточні розміри:`, product.sizes?.map(s => s.name) || []);
        } else if ((item.color && item.color.name) || (item.colors && Array.isArray(item.colors) && item.colors.length > 0)) {
            const allColors = getAllColors(product);
            
            if (item.colors && Array.isArray(item.colors)) {
                // Перевіряємо всі кольори з нової структури
                isAvailable = item.colors.every(itemColor => {
                    const itemColorName = itemColor.name.toLowerCase().trim();
                    return allColors.some(color => color.name?.toLowerCase().trim() === itemColorName);
                });
                console.log(`Перевірка кольорів для товару ${item.name}: кольори ${item.colors.map(c => c.name)}, доступні: ${isAvailable}, поточні кольори:`, allColors.map(c => c.name));
            } else if (item.color && item.color.name) {
                // Для старої структури (один колір)
                const itemColorName = item.color.name.toLowerCase().trim();
                isAvailable = allColors.some(color => color.name?.toLowerCase().trim() === itemColorName);
                console.log(`Перевірка кольору для товару ${item.name}: колір ${itemColorName}, доступний: ${isAvailable}, поточні кольори:`, allColors.map(c => c.name));
            }
        } else if (!product) {
            console.warn(`Товар з id ${item.id} не знайдено в products під час рендерингу:`, item);
            isAvailable = false;
        }

        const img = document.createElement('img');
        img.src = product ? (product.photos?.[0] || NO_IMAGE_URL) : NO_IMAGE_URL;
        img.className = 'cart-item-image';
        img.alt = item.name;
        img.loading = 'lazy';
        img.style.cursor = 'pointer';
        img.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openProduct(product?.slug || '');
        };
        itemDiv.appendChild(img);

        const span = document.createElement('span');
        let displayName = item.name;
        if (product?.type === 'mattresses') {
            if (item.size && !item.name.includes(`(${item.size})`)) {
                displayName = `${item.name} (${item.size})`;
            }
        } else {
            // Обробляємо кольори
            if (item.colors && Array.isArray(item.colors) && item.colors.length > 0) {
                // Сортуємо кольори за blockIndex для правильного порядку відображення
                const sortedColors = item.colors.sort((a, b) => (a.blockIndex || 0) - (b.blockIndex || 0));
                const colorNames = sortedColors.map(color => color.name).join(', ');
                displayName += ` (${colorNames})`;
            } else if (item.color && item.color.name) {
                // Для старої структури (один колір)
                displayName += ` (${item.color.name})`;
            }
            if (item.size) {
                displayName += ` (${item.size})`;
            }
        }
        const totalPrice = item.price * item.quantity;
        span.textContent = `${displayName} - ${totalPrice} грн`;
        if (!isAvailable) {
            span.textContent += ' (Товар недоступний)';
            span.style.color = 'red';
        }
        span.style.cursor = 'pointer';
        span.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            openProduct(product?.slug || '');
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
        qtyInput.id = `cart-quantity-${item.cartItemKey}`;
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
	removeBtn.className = 'remove-btn rm-btn-del';
	removeBtn.setAttribute('aria-label', 'Видалити товар');
	const iconSpan = document.createElement('span');
	iconSpan.className = 'rm-btn-icon';
	removeBtn.appendChild(iconSpan);
	removeBtn.onclick = () => promptRemoveFromCart(index);
	itemDiv.appendChild(removeBtn);

        if (product?.salePrice && product.saleEnd && (product.saleEnd === null || new Date(product.saleEnd) > new Date())) {
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
    totalP.textContent = `Разом: ${cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)} грн`;
    cartContent.appendChild(totalP);

const h3 = document.createElement('h3');
h3.textContent = 'Оформити замовлення';
h3.className = 'cart-heading';
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
    defaultOption.textContent = f.name === 'payment' ? 'Спосіб оплати' : `Оберіть ${f.label.toLowerCase()}`;
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
        console.error('Помилка при видаленні товару!');
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
        
        // Оновлюємо ціни для товарів з кольорами
        await updateCartPrices();
        
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
    const cart = loadFromStorage('cart') || [];
    const totalItems = cart.reduce((sum, item) => sum + (item.quantity || 0), 0);

    const headerCartCount = document.querySelector('.cart .cart-count');
    if (headerCartCount) {
        headerCartCount.textContent = totalItems > 0 ? totalItems : '';
    }

    const burgerCartCount = document.querySelector('.burger-content .cart span');
    if (burgerCartCount) {
        burgerCartCount.textContent = totalItems > 0 ? totalItems : '';
    }

    const floatingCartCount = document.querySelector('.floating-cart .cart-count');
    if (floatingCartCount) {
        floatingCartCount.textContent = totalItems > 0 ? totalItems : '';
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

    const unavailableItems = [];
    cart.forEach(item => {
        if (!item.id || (typeof item.id !== 'string' && typeof item.id !== 'number') || !item.name || typeof item.quantity !== 'number' || typeof item.price !== 'number' || isNaN(item.price)) {
            console.warn(`Некоректний елемент кошика: ${JSON.stringify(item)}`);
            unavailableItems.push(item);
            return;
        }
        const product = products.find(p => p._id === item.id || p.id === item.id);
        if (!product) {
            console.warn(`Товар з id ${item.id} не знайдено в products`);
            unavailableItems.push(item);
            return;
        }
        if (product.type === 'mattresses' && !item.size) {
            console.warn(`Розмір відсутній для матраца: ${item.name}`);
            unavailableItems.push(item);
        }
    });

    if (unavailableItems.length > 0) {
        cart = cart.filter(item => !unavailableItems.includes(item));
        saveToStorage('cart', cart);
        try {
            await saveCartToServer();
        } catch (error) {
            console.error('Помилка синхронізації кошика з сервером:', error);
            showNotification('Дані збережено локально, але не вдалося синхронізувати з сервером.', 'warning');
        }

        if (cart.length === 0) {
            console.error('Усі товари в кошику недоступні або мають некоректні дані та були видалені.');
            debouncedRenderCart();
            return;
        }

        console.warn('Деякі товари в кошику недоступні або мають некоректні дані та були видалені.');
        debouncedRenderCart();
        return;
    }

    const orderData = {
        cartId: localStorage.getItem('cartId') || '',
        date: new Date().toISOString(),
        status: 'Нове замовлення',
        total: cart.reduce((sum, item) => sum + item.price * item.quantity, 0),
        customer,
        items: cart.map(item => {
            const product = products.find(p => p._id === item.id || p.id === item.id);
            let colorData = null;
            
            // Обробка масиву кольорів (нова структура)
            if (item.colors && Array.isArray(item.colors) && item.colors.length > 0) {
                // Сортуємо кольори за blockIndex для правильного порядку
                const sortedColors = item.colors.sort((a, b) => (a.blockIndex || 0) - (b.blockIndex || 0));
                const colorNames = sortedColors.map(color => color.name).join(', ');
                colorData = {
                    name: colorNames,
                    value: colorNames,
                    priceChange: sortedColors.reduce((sum, color) => sum + (color.priceChange || 0), 0),
                    photo: sortedColors.find(color => color.photo)?.photo || ''
                };
            } else if (item.color && item.color.name) {
                // Стара структура (один колір)
                colorData = {
                    name: item.color.name || 'Не вказано',
                    value: item.color.value || item.color.name || '',
                    priceChange: item.color.priceChange || 0,
                    photo: item.color.photo || ''
                };
            }
            
            if (product?.type === 'mattresses' && item.size) {
                colorData = {
                    name: item.size,
                    value: item.size,
                    priceChange: 0,
                    photo: null
                };
            }
            
            const itemName = product?.type === 'mattresses' && item.size ? `${item.name} (${item.size})` : item.name;
            const orderItem = {
                id: item.id, // Залишаємо ID як є (рядок або число)
                name: itemName,
                brand: product?.brand || '', // Додаємо бренд
                quantity: Number(item.quantity),
                price: Number(item.price),
                photo: item.photo || (product?.photos?.[0] || NO_IMAGE_URL),
                color: colorData,
                size: item.size || null
            };
            return orderItem;
        })
    };

    orderData.items = orderData.items.filter(item => {
        const isValid = item && (typeof item.id === 'number' || typeof item.id === 'string') && item.name && typeof item.quantity === 'number' && typeof item.price === 'number' && !isNaN(item.price);
        if (!isValid) {
            console.warn('Елемент замовлення видалено через некоректні дані:', item);
        }
        return isValid;
    });

    if (orderData.items.length === 0) {
        console.error('Помилка: немає валідних товарів для замовлення!');
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

            delete orderData.id;

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
                        console.error(`Помилка: ${errorData.message || 'Некоректні дані замовлення'}`);
                    } catch (e) {
                        console.error(`Помилка: ${errorText}`);
                    }
                    return;
                } else if (response.status === 429) {
                    console.error('Занадто багато запитів. Спробуйте ще раз пізніше.');
                    return;
                }
                throw new Error(`Помилка сервера: ${response.status} - ${errorText}`);
            }

            const responseData = await response.json();
            if (!responseData || !responseData._id) {
                throw new Error('Некоректна відповідь сервера: orderId відсутній');
            }

            console.log('Замовлення успішно оформ16:54:29 оформлено:', responseData);

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
                console.warn('Не вдалося оформити замовлення! Дані збережено локально.');
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
        const defaultLogo = '/assets/logo/prostirmebliv-logo-horizontal.svg';
        const logoUrl = (settings.logo && settings.logo.trim()) ? settings.logo : defaultLogo;
        console.log('Оновлення логотипу:', logoUrl);
        logo.style.backgroundImage = `url(${logoUrl})`;
        if (settings.logoWidth && Number(settings.logoWidth) > 0) {
            logo.style.width = `${settings.logoWidth}px`;
        } else {
            logo.style.removeProperty('width');
        }
        // Не примушуємо висоту, дозволяємо керувати через CSS
        logo.style.removeProperty('height');
        const img = new Image();
        img.src = logoUrl;
        img.onerror = () => {
            console.warn('Помилка завантаження логотипу, використовуємо NO_IMAGE_URL');
            logo.style.backgroundImage = `url(${defaultLogo})`;
        };
    }
    const logoText = document.getElementById('logo-text');
    if (logoText) logoText.textContent = settings.name || '';
    const phones = document.getElementById('phones');
    if (phones) {
        // Очищаємо попередній вміст
        phones.innerHTML = '';
        const phonesRaw = settings.contacts?.phones || '';
        const phoneList = phonesRaw.split(/\n|,|;/).map(p => p.trim()).filter(Boolean);
        if (phoneList.length === 0) return;
        // Основний телефон (перший)
        const mainPhone = document.createElement('span');
        mainPhone.className = 'main-phone';
        mainPhone.textContent = phoneList[0];
        phones.appendChild(mainPhone);
        // Стрілка для меню
        let phoneMenu = null;
        let arrow = null;
        let closeDropdownHandler = null;
        // Видаляємо старе меню, якщо воно є
        if (window.__phoneDropdownMenu) {
            window.__phoneDropdownMenu.remove();
            window.__phoneDropdownMenu = null;
        }
        if (window.__phoneDropdownThemeListener) {
            window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', window.__phoneDropdownThemeListener);
            window.__phoneDropdownThemeListener = null;
        }
        if (phoneList.length > 1) {
            arrow = document.createElement('span');
            arrow.className = 'phone-dropdown-arrow';
            arrow.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
            phones.appendChild(arrow);
            // Меню створюємо у body
            function createPhoneMenu() {
                if (window.__phoneDropdownMenu) {
                    window.__phoneDropdownMenu.remove();
                    window.__phoneDropdownMenu = null;
                }
                phoneMenu = document.createElement('div');
                phoneMenu.className = 'phone-dropdown-menu phone-dropdown-portal';
                phoneMenu.style.position = 'fixed';
                phoneMenu.style.zIndex = '2147483647';
                phoneMenu.style.display = 'none';
                phoneMenu.style.minWidth = '170px';
                phoneMenu.style.maxWidth = '200px';
                phoneMenu.style.textAlign = 'center';
                phoneMenu.style.borderRadius = '14px';
                phoneMenu.style.boxShadow = '0 8px 32px rgba(0,0,0,0.18)';
                phoneMenu.style.whiteSpace = 'nowrap';
                phoneMenu.style.transform = 'none';
                function applyMenuTheme() {
                    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                        phoneMenu.style.background = '#23272f';
                        phoneMenu.style.color = '#e6e6e6';
                        phoneMenu.style.border = '1px solid #333';
                        phoneMenu.style.position = 'fixed';
                        phoneMenu.style.zIndex = '2147483647';
                    } else {
                        phoneMenu.style.background = '#fff';
                        phoneMenu.style.color = '#222';
                        phoneMenu.style.border = '1px solid #e0e0e0';
                        phoneMenu.style.position = 'fixed';
                        phoneMenu.style.zIndex = '2147483647';
                    }
                }
                applyMenuTheme();
                // Динамічне перемикання теми
                window.__phoneDropdownThemeListener = function() {
                    applyMenuTheme();
                    phoneMenu.querySelectorAll('.phone-dropdown-item').forEach(item => {
                        if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
                            item.style.color = '#e6e6e6';
                        } else {
                            item.style.color = '#222';
                        }
                    });
                    
                    // Якщо меню відкрите, оновлюємо його позицію
                    if (phoneMenu.style.display === 'block') {
                        updateMenuPosition();
                    }
                };
                window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', window.__phoneDropdownThemeListener);
                phoneList.forEach(phone => {
                    const item = document.createElement('div');
                    item.className = 'phone-dropdown-item';
                    item.textContent = phone;
                    item.onclick = (e) => {
                        e.stopPropagation();
                        phoneMenu.style.display = 'none';
                        if (arrow) arrow.classList.remove('active');
                        if (window.__phoneDropdownMenu) {
                            window.__phoneDropdownMenu.remove();
                            window.__phoneDropdownMenu = null;
                        }
                        window.location.href = `tel:${phone.replace(/[^+\d]/g, '')}`;
                    };
                    phoneMenu.appendChild(item);
                });
                document.body.appendChild(phoneMenu);
                window.__phoneDropdownMenu = phoneMenu;
            }
            // Відкриття/закриття меню
            phones.onclick = (e) => {
                e.stopPropagation();
                // Якщо меню не існує або було видалено — створити заново
                if (!window.__phoneDropdownMenu || !document.body.contains(window.__phoneDropdownMenu)) {
                    createPhoneMenu();
                }
                phoneMenu = window.__phoneDropdownMenu;
                if (phoneMenu.style.display === 'block') {
                    phoneMenu.style.display = 'none';
                    arrow.classList.remove('active');
                } else {
                    // Позиціонуємо меню під телефоном
                    const rect = phones.getBoundingClientRect();
                    phoneMenu.style.display = 'block';
                    arrow.classList.add('active');
                    
                    // Невелика затримка для правильного розрахунку ширини меню
                    setTimeout(() => {
                        const menuWidth = phoneMenu.offsetWidth || 170;
                        let left = rect.left + rect.width/2 - menuWidth/2;
                        
                        // Перевіряємо, чи меню не виходить за межі екрану
                        if (left < 10) {
                            left = 10; // Мінімальний відступ від лівого краю
                        } else if (left + menuWidth > window.innerWidth - 10) {
                            left = window.innerWidth - menuWidth - 10; // Мінімальний відступ від правого краю
                        }
                        
                        phoneMenu.style.left = left + 'px';
                        phoneMenu.style.top = (rect.bottom + 6) + 'px';
                    }, 0);
                }
            };
            
            // Оновлюємо позицію меню при прокрутці
            const updateMenuPosition = () => {
                if (phoneMenu && phoneMenu.style.display === 'block') {
                    const rect = phones.getBoundingClientRect();
                    const menuWidth = phoneMenu.offsetWidth || 170;
                    let left = rect.left + rect.width/2 - menuWidth/2;
                    
                    // Перевіряємо, чи меню не виходить за межі екрану
                    if (left < 10) {
                        left = 10; // Мінімальний відступ від лівого краю
                    } else if (left + menuWidth > window.innerWidth - 10) {
                        left = window.innerWidth - menuWidth - 10; // Мінімальний відступ від правого краю
                    }
                    
                    phoneMenu.style.left = left + 'px';
                    phoneMenu.style.top = (rect.bottom + 6) + 'px';
                    
                    // Додатково переконуємося, що меню має правильну позицію
                    phoneMenu.style.position = 'fixed';
                    phoneMenu.style.zIndex = '2147483647';
                }
            };
            
            // Закриваємо меню при прокрутці
            const closeMenuOnScroll = () => {
                if (phoneMenu && phoneMenu.style.display === 'block') {
                    phoneMenu.style.display = 'none';
                    if (arrow) arrow.classList.remove('active');
                    
                    // Додатково переконуємося, що меню має правильну позицію при закритті
                    phoneMenu.style.position = 'fixed';
                    phoneMenu.style.zIndex = '2147483647';
                }
            };
            
            // Додаємо обробник прокрутки
            window.addEventListener('scroll', updateMenuPosition);
            window.addEventListener('scroll', closeMenuOnScroll);
            window.addEventListener('resize', updateMenuPosition);
            // Закриття при кліку поза меню
            closeDropdownHandler = function(e) {
                // Перевіряємо, чи елементи існують
                if (!phones || !phoneMenu) return;
                
                if (!phones.contains(e.target) && !phoneMenu.contains(e.target)) {
                    phoneMenu.style.display = 'none';
                    if (arrow) arrow.classList.remove('active');
                }
            };
            document.addEventListener('click', closeDropdownHandler);
            
            // Зберігаємо посилання на обробники для очищення
            const scrollHandler = updateMenuPosition;
            const scrollCloseHandler = closeMenuOnScroll;
            const resizeHandler = updateMenuPosition;
            
            window.addEventListener('beforeunload', () => {
                if (window.__phoneDropdownMenu) window.__phoneDropdownMenu.remove();
                if (window.__phoneDropdownThemeListener) window.matchMedia('(prefers-color-scheme: dark)').removeEventListener('change', window.__phoneDropdownThemeListener);
                window.removeEventListener('scroll', scrollHandler);
                window.removeEventListener('scroll', scrollCloseHandler);
                window.removeEventListener('resize', resizeHandler);
            });
        } else {
            // Якщо лише один телефон, клік дзвонить
            phones.onclick = () => {
                window.location.href = `tel:${phoneList[0].replace(/[^+\d]/g, '')}`;
            };
        }
    }
}

function renderContacts() {
    const contactInfo = document.getElementById('contact-info');
    const socials = document.getElementById('socials');
    if (!contactInfo || !socials) return;
    while (contactInfo.firstChild) contactInfo.removeChild(contactInfo.firstChild);
    while (socials.firstChild) socials.removeChild(socials.firstChild);

    const h2 = document.createElement('h2');
    h2.textContent = 'Контакти';
    h2.className = 'section-heading';
    contactInfo.appendChild(h2);

    const phones = settings.contacts?.phones || 'Немає даних';
    const addresses = settings.contacts?.addresses || 'Немає даних';
    const schedule = settings.contacts?.schedule || 'Немає даних';

    const phonesLines = phones.split(/[\n,]+/).map(p => p.trim()).filter(p => p);
    const addressesLines = addresses.split(/[\n,]+/).map(a => a.trim()).filter(a => a);
    const scheduleLines = schedule.split(/[\n,]+/).map(s => s.trim()).filter(s => s);

    const phonesP = document.createElement('p');
    const strongPhones = document.createElement('strong');
    strongPhones.textContent = 'Телефони: ';
    phonesP.appendChild(strongPhones);
    phonesLines.forEach((line, index) => {
        const span = document.createElement('span');
        span.textContent = line;
        span.style.display = 'block';
        phonesP.appendChild(span);
    });
    contactInfo.appendChild(phonesP);

    const addressesP = document.createElement('p');
    const strongAddresses = document.createElement('strong');
    strongAddresses.textContent = 'Адреси: ';
    addressesP.appendChild(strongAddresses);
    const addressSpan = document.createElement('span');
    addressSpan.textContent = addressesLines.join(', ');
    addressSpan.style.display = 'block';
    addressesP.appendChild(addressSpan);
    contactInfo.appendChild(addressesP);

    const scheduleP = document.createElement('p');
    const strongSchedule = document.createElement('strong');
    strongSchedule.textContent = 'Графік роботи: ';
    scheduleP.appendChild(strongSchedule);
    scheduleLines.forEach((line, index) => {
        const span = document.createElement('span');
        span.textContent = line;
        span.style.display = 'block';
        scheduleP.appendChild(span);
    });
    contactInfo.appendChild(scheduleP);

    if (settings.showSocials && settings.socials?.length > 0) {
        const h3 = document.createElement('h3');
        h3.textContent = 'Ми в соціальних мережах';
        h3.className = 'contacts-heading';
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

    let isProcessing = false; // Захист від повторних викликів

    slides.forEach((slide, i) => {
        const slideDiv = document.createElement('div');
        slideDiv.className = `slide${i === currentSlideIndex ? ' active' : ''}`;

        // Обробка вмісту слайду
        if (slide.link) {
            const linkWrapper = document.createElement('a');
            linkWrapper.href = slide.link;
            linkWrapper.className = 'slide-link';
            linkWrapper.style.display = 'block';
            linkWrapper.style.width = '100%';
            linkWrapper.style.height = '100%';
            linkWrapper.style.cursor = 'pointer';
            linkWrapper.style.textDecoration = 'none';

            const img = document.createElement('img');
            img.src = slide.photo || NO_IMAGE_URL;
            img.alt = slide.name || `Слайд ${i + 1}`;
            img.loading = 'lazy';
            linkWrapper.appendChild(img);

            const contentDiv = document.createElement('div');
            contentDiv.className = 'slide-content';
            const h2 = document.createElement('h2');
            h2.textContent = slide.title || '';
            contentDiv.appendChild(h2);
            const p = document.createElement('p');
            p.textContent = slide.text || '';
            contentDiv.appendChild(p);
            linkWrapper.appendChild(contentDiv);

            slideDiv.appendChild(linkWrapper);
        } else {
            const img = document.createElement('img');
            img.src = slide.photo || NO_IMAGE_URL;
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
            slideDiv.appendChild(contentDiv);
        }

        // Підтримка сенсорних жестів (тільки свайп)
        let touchStartX = 0;
        let touchEndX = 0;
        let touchStartY = 0;
        let touchEndY = 0;
        const minSwipeDistance = 50; // Мінімальна відстань для свайпу
        const maxVerticalDistance = 30; // Максимальна вертикальна відстань для розпізнавання свайпу

        slideDiv.addEventListener('touchstart', (e) => {
            if (!slide.link) {
                e.preventDefault(); // Блокуємо стандартну поведінку лише для слайдів без посилань
            }
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
            touchEndX = 0;
            touchEndY = 0;
        }, { passive: !slide.link }); // passive: false лише для слайдів без посилань

        slideDiv.addEventListener('touchmove', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            touchEndY = e.changedTouches[0].screenY;
        }, { passive: true });

        slideDiv.addEventListener('touchend', (e) => {
            if (isProcessing) return;
            isProcessing = true;

            const swipeDistanceX = touchEndX - touchStartX;
            const swipeDistanceY = Math.abs(touchEndY - touchStartY);

            if (Math.abs(swipeDistanceX) > minSwipeDistance && swipeDistanceY < maxVerticalDistance) {
                if (swipeDistanceX < 0) {
                    currentSlideIndex = (currentSlideIndex + 1) % slides.length;
                } else {
                    currentSlideIndex = (currentSlideIndex - 1 + slides.length) % slides.length;
                }
                renderSlideshow();
                startSlideshow();
            }

            setTimeout(() => {
                isProcessing = false;
            }, 100);
        }, { passive: true });

        // Запобігаємо перемиканню слайдів при кліках (крім посилань)
        slideDiv.addEventListener('click', (e) => {
            if (!slide.link) {
                e.preventDefault(); // Блокуємо кліки для слайдів без посилань
            }
        }, { passive: false });

        slideshow.appendChild(slideDiv);
    });

    const navDiv = document.createElement('div');
    navDiv.className = 'slide-nav';
    slides.forEach((_, i) => {
        const btn = document.createElement('button');
        btn.className = `slide-btn${i === currentSlideIndex ? ' active' : ''}`;
        btn.onclick = () => { 
            if (!isProcessing) {
                isProcessing = true;
                currentSlideIndex = i;
                renderSlideshow();
                startSlideshow();
                setTimeout(() => { isProcessing = false; }, 100);
            }
        };
        navDiv.appendChild(btn);
    });
    slideshow.appendChild(navDiv);

    const prevBtn = document.createElement('button');
    prevBtn.className = 'slide-arrow slide-arrow-prev';
    prevBtn.setAttribute('aria-label', 'Попередній слайд');
    prevBtn.textContent = '◄';
    prevBtn.onclick = () => { 
        if (!isProcessing) {
            isProcessing = true;
            currentSlideIndex = (currentSlideIndex - 1 + slides.length) % slides.length;
            renderSlideshow();
            startSlideshow();
            setTimeout(() => { isProcessing = false; }, 100);
        }
    };
    slideshow.appendChild(prevBtn);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'slide-arrow slide-arrow-next';
    nextBtn.setAttribute('aria-label', 'Наступний слайд');
    nextBtn.textContent = '►';
    nextBtn.onclick = () => { 
        if (!isProcessing) {
            isProcessing = true;
            currentSlideIndex = (currentSlideIndex + 1) % slides.length;
            renderSlideshow();
            startSlideshow();
            setTimeout(() => { isProcessing = false; }, 100);
        }
    };
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
    currentGalleryImages = [...product.photos];
    currentGalleryIndex = Math.max(0, Math.min(index, product.photos.length - 1));
    const modal = document.getElementById('gallery-modal');
    const img = document.getElementById('gallery-image');
    const thumbnails = document.getElementById('gallery-thumbnails');
    if (modal && img && thumbnails) {
        img.src = currentGalleryImages[currentGalleryIndex];
        console.log('Встановлено зображення:', img.src);

        // Clear and rebuild thumbnails
        thumbnails.innerHTML = '';
        currentGalleryImages.forEach((photo, i) => {
            const thumbImg = document.createElement('img');
            thumbImg.src = photo;
            thumbImg.className = `thumbnail ${i === currentGalleryIndex ? 'active' : ''}`;
            thumbImg.alt = `Мініатюра ${i + 1}`;
            thumbImg.loading = 'lazy';
            // Додаємо відкриття галереї по кліку на мініатюру (тільки на сторінці товару)
            thumbImg.onclick = () => {
                if (typeof openGallery === 'function') {
                    openGallery(product.slug, i);
                }
            };
            thumbnails.appendChild(thumbImg);
        });

        modal.style.display = 'flex';
        modal.classList.add('active');
        
        // Блокуємо прокрутку основної сторінки
        document.body.style.overflow = 'hidden';
        
        // Додаємо обробник колеса миші для гортання фото
        const handleWheel = (e) => {
            e.preventDefault();
            if (e.deltaY > 0) {
                // Прокрутка вниз - наступне фото
                nextGalleryImage();
            } else {
                // Прокрутка вгору - попереднє фото
                prevGalleryImage();
            }
        };
        
        // Зберігаємо обробник для подальшого видалення
        modal._wheelHandler = handleWheel;
        modal.addEventListener('wheel', handleWheel, { passive: false });
        
        // Повертаємо на початок сторінки, щоб уникнути появи плаваючих кнопок
        window.scrollTo(0, 0);
        
        // Додаємо обробник клавіші Escape для закриття галереї
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                closeGallery();
            } else if (e.key === 'ArrowLeft') {
                // Стрілка вліво - попереднє фото
                prevGalleryImage();
            } else if (e.key === 'ArrowRight') {
                // Стрілка вправо - наступне фото
                nextGalleryImage();
            }
        };
        
        // Зберігаємо обробник для подальшого видалення
        modal._keyHandler = handleKeyDown;
        document.addEventListener('keydown', handleKeyDown);
        
        // Додаємо обробник кліку на фон для закриття галереї
        const handleModalClick = (e) => {
            if (e.target === modal) {
                closeGallery();
            }
        };
        
        // Зберігаємо обробник для подальшого видалення
        modal._clickHandler = handleModalClick;
        modal.addEventListener('click', handleModalClick);
        
    } else {
        console.error('Модальне вікно, зображення або контейнер мініатюр не знайдено:', { modal, img, thumbnails });
    }
}

function updateThumbnails() {
    const thumbnails = document.getElementById('gallery-thumbnails');
    if (thumbnails) {
        const thumbImages = thumbnails.getElementsByClassName('thumbnail');
        for (let thumb of thumbImages) {
            thumb.classList.remove('active');
            if (thumb.src === currentGalleryImages[currentGalleryIndex]) {
                thumb.classList.add('active');
            }
        }
    }
}

function prevGalleryImage() {
    if (currentGalleryImages.length === 0) return;
    currentGalleryIndex = (currentGalleryIndex - 1 + currentGalleryImages.length) % currentGalleryImages.length;
    const img = document.getElementById('gallery-image');
    if (img) {
        img.src = currentGalleryImages[currentGalleryIndex];
        updateThumbnails();
    }
}

function nextGalleryImage() {
    if (currentGalleryImages.length === 0) return;
    currentGalleryIndex = (currentGalleryIndex + 1) % currentGalleryImages.length;
    const img = document.getElementById('gallery-image');
    if (img) {
        img.src = currentGalleryImages[currentGalleryIndex];
        updateThumbnails();
    }
}

function closeGallery() {
    const modal = document.getElementById('gallery-modal');
    if (modal) {
        modal.style.display = 'none';
        modal.classList.remove('active');
        
        // Відновлюємо прокрутку основної сторінки
        document.body.style.overflow = '';
        
        // Видаляємо обробник колеса миші
        if (modal._wheelHandler) {
            modal.removeEventListener('wheel', modal._wheelHandler);
            delete modal._wheelHandler;
        }
        
        // Видаляємо обробник клавіші Escape
        if (modal._keyHandler) {
            document.removeEventListener('keydown', modal._keyHandler);
            delete modal._keyHandler;
        }
        
        // Видаляємо обробник кліку на фон
        if (modal._clickHandler) {
            modal.removeEventListener('click', modal._clickHandler);
            delete modal._clickHandler;
        }
    }
    currentGalleryImages = []; 
    currentGalleryIndex = 0;
    console.log('Галерею закрито, currentGalleryImages очищено');
}

function showNotification(message, type = 'success') {
    const notification = document.getElementById('notification');
    if (!notification) return;
    notification.textContent = message;
    notification.classList.remove('success', 'error');
    notification.classList.add(type, 'show');
    
    setTimeout(() => {
        notification.classList.remove('show');
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

function changeGroupQuantity(groupId, productId, change) {
    // Отримуємо поточний вибір з localStorage
    const selectionKey = `groupSelection_${groupId}`;
    const selection = loadFromStorage(selectionKey, {});
    let currentQty = parseInt(selection[productId] || 0);
    currentQty = isNaN(currentQty) ? 0 : currentQty;
    let newQty = currentQty + change;
    if (newQty < 0) newQty = 0;
    selection[productId] = newQty;
    saveToStorage(selectionKey, selection);

    // Оновлюємо input на сторінці
    const qtyInput = document.getElementById(`group-quantity-${groupId}-${productId}`);
    if (qtyInput) {
        qtyInput.value = newQty;
    }

    // Оновлюємо плаваючу панель з ціною
    if (typeof updateFloatingGroupCart === 'function') {
        updateFloatingGroupCart();
    }
    
    // Оновлюємо ціну товару в групі з урахуванням вибраного кольору
    if (selectedColors[productId] !== undefined) {
        updateGroupProductPrice(productId);
    }
}

async function handleNavigation(path, isPopstate = false) {
    try {
        console.log('Обробка навігації для шляху:', path, 'isPopstate:', isPopstate);
        const parts = path.split('/').filter(p => p);

        if (!categories.length || !products.length) {
            console.warn('Дані ще не завантажені, чекаємо ініціалізації...');
            await initializeData();
            console.log('Дані ініціалізовано. Категорії:', categories.length, 'Продукти:', products.length);
        }

        const urlParams = new URLSearchParams(window.location.search);
        const savedFilters = urlParams.get('filters') ? JSON.parse(decodeURIComponent(urlParams.get('filters'))) : loadFromStorage('activeFilters', {});
        currentSort = urlParams.get('sort') || loadFromStorage('currentSort', '');

        if (!parts.length) {
            currentCategory = null;
            currentSubcategory = null;
            currentProduct = null;
            isSearchActive = false;
            // Скидаємо фільтри при переході на головну сторінку
            clearFilters();
            showSection('home');
            if (!isPopstate) {
                const state = {
                    sectionId: 'home',
                    path: '/',
                    stateId: `home_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    currentPage: 1,
                    currentCategory: null,
                    currentSubcategory: null,
                    isSearchActive: false,
                    searchQuery: '',
                    activeFilters: {},
                    currentSort: ''
                };
                history.pushState(state, '', '/');
                console.log('history.pushState виконано для головної сторінки:', state);
            }
            return;
        }

        if (parts[0] === 'cart') {
            clearFilters();
            showSection('cart');
        } else if (parts[0] === 'contacts') {
            clearFilters();
            showSection('contacts');
        } else if (parts[0] === 'about') {
            clearFilters();
            showSection('about');
        } else if (parts[0] === 'catalog' && parts[1] === 'search') {
            const query = parts[2] ? transliterate(parts[2], true) : loadFromStorage('searchQuery', '');
            isSearchActive = loadFromStorage('isSearchActive', false);
            const searchResultIds = loadFromStorage('searchResults', []);
            searchResults = searchResultIds
                .map(id => products.find(p => p._id === id))
                .filter(p => p);
            baseSearchResults = [...searchResults];

            if (query) {
                if (!searchResults.length || searchQuery !== query) {
                    console.log('Виконуємо пошук за запитом:', query);
                    await searchProducts(query);
                } else {
                    console.log('Відновлюємо результати пошуку для запиту:', query);
                    showSection('catalog');
                }
                if (Object.keys(savedFilters).length > 0) {
                    applySavedFilters(savedFilters);
                }
                if (currentSort) {
                    sortProducts(currentSort);
                }
            } else {
                console.warn('Запит пошуку відсутній, перенаправляємо на каталог');
                showSection('catalog');
                currentCategory = null;
                currentSubcategory = null;
                isSearchActive = false;
                saveToStorage('isSearchActive', false);
                saveToStorage('searchQuery', '');
                saveToStorage('searchResults', []);
            }
        } else {
                    // Викликаємо validateAndFixPageState для обробки шляху
        await validateAndFixPageState();
                        return;
        }

        if (!isPopstate) {
            const stateId = `nav_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const state = {
                sectionId: document.querySelector('.section.active')?.id || 'home',
                path: `/${path}`,
                stateId,
                currentPage: currentPage || 1,
                currentCategory,
                currentSubcategory,
                isSearchActive,
                searchQuery,
                activeFilters: savedFilters,
                currentSort: currentSort
            };
            history.pushState(state, '', `/${path}`);
            console.log('history.pushState виконано для загального стану:', state);
        }
    } catch (error) {
        console.error('Помилка обробки навігації:', error);
        console.error('Помилка завантаження сторінки!');
        showSection('home');
    }
}

function saveScrollPosition() {
    const scrollY = window.scrollY;
    const productGrid = document.querySelector('.product-grid');
    const displayedProducts = productGrid ? productGrid.children.length : 0;
    const catSlug = currentCategory ? transliterate(currentCategory.replace('ь', '')) : '';
    const subCatSlug = currentSubcategory ? transliterate(currentSubcategory.replace('ь', '')) : '';
    let newPath = isSearchActive
        ? `/catalog/search/${transliterate(searchQuery.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-'))}`
        : currentCategory
        ? `/${catSlug}${subCatSlug ? `/${subCatSlug}` : ''}`
        : '/catalog';
    if (currentPage > 1) {
        newPath += `?page=${currentPage}`;
    }
    const state = {
        sectionId: 'catalog',
        path: newPath,
        stateId: `catalog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        currentPage: currentPage || 1,
        scrollY: scrollY,
        displayedProducts: displayedProducts,
        currentCategory: currentCategory,
        currentSubcategory: currentSubcategory,
        isSearchActive: isSearchActive,
        searchQuery: searchQuery,
        searchResults: searchResults.map(p => p._id)
    };
    history.pushState(state, '', newPath);
    saveToStorage('lastCatalogState', state);
}

document.addEventListener('DOMContentLoaded', async () => {
    try {
        console.log('Ініціалізація програми...');

        document.querySelectorAll('.section').forEach(el => {
            el.style.display = 'none';
        });

        await initializeData();
        console.log('Дані ініціалізовано. Категорії:', categories.length, 'Продукти:', products.length);
        updateHeader();
        updateCartCount();
        if (typeof updateFloatingFavorite === 'function') {
            updateFloatingFavorite();
        }

        renderCatalogDropdown();

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
            }, { once: false });
        } else {
            console.warn('Кнопка пошуку не знайдено');
        }

        const navLinks = [
            { id: 'nav-home', section: 'home' },
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

        const burgerIcon = document.getElementById('burger-icon');
        const burgerMenu = document.getElementById('burger-menu');
        const burgerContent = document.getElementById('burger-content');
        const burgerSearch = document.getElementById('burger-search');
        const burgerSearchBtn = document.querySelector('.burger-search-btn');
        const burgerCatalogToggle = document.getElementById('burger-catalog-toggle');
        const burgerCatalogDropdown = document.getElementById('burger-catalog-dropdown');
        const header = document.querySelector('header');
        const floatingCart = document.getElementById('floating-cart');

        if (burgerIcon && burgerMenu && burgerContent) {
            burgerIcon.addEventListener('click', () => {
                burgerMenu.classList.toggle('active');
                burgerContent.classList.toggle('active');
                if (!burgerContent.classList.contains('active')) {
                    burgerCatalogDropdown.classList.remove('active');
                }
            });

            burgerContent.querySelectorAll('a:not(#burger-catalog-toggle)').forEach(link => {
                link.addEventListener('click', () => {
                    burgerMenu.classList.remove('active');
                    burgerContent.classList.remove('active');
                    burgerCatalogDropdown.classList.remove('active');
                });
            });

            document.addEventListener('click', function(e) {
                const isBurgerIcon = burgerIcon.contains(e.target);
                const isMenu = burgerMenu.contains(e.target) || burgerContent.contains(e.target);
                const isMenuOpen = burgerMenu.classList.contains('active') && burgerContent.classList.contains('active');
                if (!isBurgerIcon && !isMenu && isMenuOpen) {
                    burgerMenu.classList.remove('active');
                    burgerContent.classList.remove('active');
                    if (burgerCatalogDropdown) burgerCatalogDropdown.classList.remove('active');
                    e.stopPropagation();
                    e.preventDefault();
                    return false;
                }
            }, true);

            window.addEventListener('scroll', () => {
                const headerHeight = header.offsetHeight;
                const floatingFavorite = document.getElementById('floating-favorite');
                if (window.scrollY > headerHeight) {
                    burgerMenu.classList.add('visible');
                    floatingCart.classList.add('visible');
                    if (floatingFavorite) {
                        floatingFavorite.classList.add('visible');
                    }
                } else {
                    burgerMenu.classList.remove('visible');
                    burgerMenu.classList.remove('active');
                    burgerContent.classList.remove('active');
                    burgerCatalogDropdown.classList.remove('active');
                    floatingCart.classList.remove('visible');
                    if (floatingFavorite) {
                        floatingFavorite.classList.remove('visible');
                    }
                }
            });

            if (floatingCart) {
                floatingCart.addEventListener('click', () => {
                    showSection('cart');
                    burgerMenu.classList.remove('active');
                    burgerContent.classList.remove('active');
                    burgerCatalogDropdown.classList.remove('active');
                });
            }

            if (burgerSearch && burgerSearchBtn) {
                burgerSearch.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        const query = burgerSearch.value.trim();
                        if (query) {
                            searchProducts(query);
                            burgerMenu.classList.remove('active');
                            burgerContent.classList.remove('active');
                            burgerCatalogDropdown.classList.remove('active');
                        } else {
                            showNotification('Введіть пошуковий запит!', 'warning');
                        }
                    }
                });
                burgerSearchBtn.addEventListener('click', (e) => {
                    e.preventDefault();
                    const query = burgerSearch.value.trim();
                    if (query) {
                        searchProducts(query);
                        burgerMenu.classList.remove('active');
                        burgerContent.classList.remove('active');
                        burgerCatalogDropdown.classList.remove('active');
                    } else {
                        showNotification('Введіть пошуковий запит!', 'warning');
                    }
                });
            } else {
                console.warn('Елементи пошуку в бургер-меню не знайдено');
            }

            if (burgerCatalogToggle && burgerCatalogDropdown) {
                while (burgerCatalogDropdown.firstChild) {
                    burgerCatalogDropdown.removeChild(burgerCatalogDropdown.firstChild);
                }

                categories.forEach(category => {
                    const categoryItem = document.createElement('div');
                    categoryItem.classList.add('burger-category-item');
                    
                    // Створюємо посилання для категорії
                    const categoryLink = document.createElement('a');
                    categoryLink.href = '#';
                    categoryLink.textContent = category.name;
                    categoryLink.addEventListener('click', (e) => {
                        e.preventDefault();
                        currentProduct = null;
                        currentCategory = category.slug;
                        currentSubcategory = null;
                        isSearchActive = false;
                        searchQuery = '';
                        searchResults = [];
                        baseSearchResults = [];
                        saveToStorage('isSearchActive', false);
                        saveToStorage('searchQuery', '');
                        saveToStorage('searchResults', []);
                        showSection('catalog');
                        burgerMenu.classList.remove('active');
                        burgerContent.classList.remove('active');
                        burgerCatalogDropdown.classList.remove('active');
                    });
                    categoryItem.appendChild(categoryLink);
                    
                    // Створюємо контейнер для підкатегорій
                    const subcategoryContainer = document.createElement('div');
                    subcategoryContainer.className = 'burger-subcategory';
                    
                    // Додаємо підкатегорії
                    (category.subcategories || []).forEach(sub => {
                        const subcategoryLink = document.createElement('a');
                        subcategoryLink.href = '#';
                        subcategoryLink.textContent = sub.name;
                        subcategoryLink.addEventListener('click', (e) => {
                            e.preventDefault();
                            currentProduct = null;
                            currentCategory = category.slug;
                            currentSubcategory = sub.name;
                            isSearchActive = false;
                            searchQuery = '';
                            searchResults = [];
                            baseSearchResults = [];
                            saveToStorage('isSearchActive', false);
                            saveToStorage('searchQuery', '');
                            saveToStorage('searchResults', []);
                            showSection('catalog');
                            burgerMenu.classList.remove('active');
                            burgerContent.classList.remove('active');
                            burgerCatalogDropdown.classList.remove('active');
                        });
                        subcategoryContainer.appendChild(subcategoryLink);
                    });
                    
                    categoryItem.appendChild(subcategoryContainer);
                    burgerCatalogDropdown.appendChild(categoryItem);
                });

                burgerCatalogToggle.addEventListener('click', (e) => {
                    e.preventDefault();
                    burgerCatalogDropdown.classList.toggle('active');
                });

                const contactInfo = document.createElement('div');
                contactInfo.className = 'burger-contact-info';
                contactInfo.appendChild(createCharP('Телефони', settings.contacts?.phones || 'Немає даних'));
                contactInfo.appendChild(createCharP('Адреси', settings.contacts?.addresses || 'Немає даних'));
                contactInfo.appendChild(createCharP('Графік роботи', settings.contacts?.schedule || 'Немає даних'));
                burgerContent.appendChild(contactInfo);

                const socials = document.createElement('div');
                socials.className = 'burger-socials';
                if (settings.showSocials && settings.socials?.length > 0) {
                    const h3 = document.createElement('h3');
                    h3.textContent = 'Ми в соціальних мережах';
                    socials.appendChild(h3);
                    settings.socials.forEach(s => {
                        const a = document.createElement('a');
                        a.href = s.url || '#';
                        a.target = '_blank';
                        a.className = 'burger-social-link';
                        a.textContent = `${s.icon || '🔗'} ${s.name || 'Посилання'}`;
                        socials.appendChild(a);
                    });
                }
                burgerContent.appendChild(socials);
            } else {
                console.warn('Елементи каталогу в бургер-меню не знайдено');
            }
        } else {
            console.warn('Елементи бургер-меню не знайдено');
        }

        // Викликаємо validateAndFixPageState для обробки початкового шляху
        await validateAndFixPageState();

        const activeSection = document.querySelector('.section.active');
        if (activeSection) {
            activeSection.style.display = 'block';
            console.log('DOMContentLoaded: Активна секція:', activeSection.id);
        } else {
            console.warn('Активна секція не знайдена, показуємо головну');
            showSection('home');
        }

        const preloader = document.getElementById('preloader');
        if (preloader) {
            preloader.style.display = 'none';
        }

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

        const filters = document.querySelector('.filters');
        const backBtn = document.querySelector('.filters .back-btn');

        if (backBtn) {
            backBtn.addEventListener('click', () => {
                if (filters) filters.classList.remove('active');
                // Видаляємо клас filters-active з навігації
                const nav = document.querySelector('.nav');
                if (nav) nav.classList.remove('filters-active');
                toggleBodyScroll(false);
                const headerHeight = document.querySelector('header').offsetHeight;
                if (window.scrollY > headerHeight) {
                    burgerMenu.classList.add('visible');
                    floatingCart.classList.add('visible');
                }
            });
        }

        const toggleBodyScroll = (lock) => {
            document.body.classList.toggle('no-scroll', lock);
        };

        const filterToggle = document.querySelector('#catalog .container .filter-toggle');
        if (filterToggle) {
            filterToggle.addEventListener('click', () => {
                filters.classList.add('active');
                // Додаємо клас filters-active для навігації
                const nav = document.querySelector('.nav');
                if (nav) nav.classList.add('filters-active');
                toggleBodyScroll(true);
                burgerMenu.classList.remove('active');
                burgerMenu.classList.remove('visible');
                burgerContent.classList.remove('active');
                burgerCatalogDropdown.classList.remove('active');
                floatingCart.classList.remove('visible');
            });
        }

        const filterScroll = document.querySelector('.filter-scroll');
        if (filterScroll) {
            filterScroll.addEventListener('wheel', (e) => {
                const scrollHeight = filterScroll.scrollHeight;
                const clientHeight = filterScroll.clientHeight;
                const scrollTop = filterScroll.scrollTop;

                if (scrollHeight > clientHeight) {
                    if (e.deltaY < 0 && scrollTop === 0) {
                        e.preventDefault();
                    } else if (e.deltaY > 0 && scrollTop >= scrollHeight - clientHeight - 1) {
                        e.preventDefault();
                    }
                }
            }, { passive: false });

            filterScroll.addEventListener('touchmove', (e) => {
                const scrollHeight = filterScroll.scrollHeight;
                const clientHeight = filterScroll.clientHeight;
                const scrollTop = filterScroll.scrollTop;

                if (scrollHeight > clientHeight) {
                    if ((e.touches[0].clientY > e.targetTouches[0].clientY && scrollTop === 0) ||
                        (e.touches[0].clientY < e.targetTouches[0].clientY && scrollTop >= scrollHeight - clientHeight - 1)) {
                        e.preventDefault();
                    }
                }
            }, { passive: false });
        }

        if (!localStorage.getItem('products')) {
            const initialProducts = [
                { id: 1, name: "Стіл дерев'яний", price: "5000", image: "https://picsum.photos/200/200" },
            ];
            saveToStorage('products', initialProducts);
        }

        console.log('Програма ініціалізована успішно');
    } catch (error) {
        console.error('Помилка в DOMContentLoaded:', error);
        console.error('Помилка ініціалізації сторінки!');
        showSection('home');
        const preloader = document.getElementById('preloader');
        if (preloader) {
            preloader.style.display = 'none';
        }
    }
});

window.addEventListener('popstate', async (event) => {
    try {
        console.log('Подія popstate:', location.pathname, 'state:', event.state);
        const state = event.state || {};
        const path = location.pathname.slice(1) || '';
        const parts = path.split('/').filter(p => p);

        currentPage = state.currentPage || 1;
        currentCategory = state.currentCategory || loadFromStorage('currentCategory', null);
        currentSubcategory = state.currentSubcategory || loadFromStorage('currentSubcategory', null);
        isSearchActive = state.isSearchActive || loadFromStorage('isSearchActive', false);
        searchQuery = state.searchQuery || loadFromStorage('searchQuery', '');
        if (state.searchResults) {
            searchResults = state.searchResults
                .map(id => products.find(p => p._id === id))
                .filter(p => p);
            baseSearchResults = [...searchResults];
            saveToStorage('searchResults', state.searchResults);
        }

        const productGrid = document.querySelector('.product-grid');
        if (productGrid) {
            while (productGrid.firstChild) productGrid.removeChild(productGrid.firstChild);
        }

        if (state.sectionId) {
            if (state.sectionId === 'catalog') {
                currentProduct = null;

                let allProducts = isSearchActive && searchQuery ? searchResults : filteredProducts;
                if (!allProducts || allProducts.length === 0) {
                    if (isSearchActive && searchQuery) {
                        console.log('popstate: Відновлюємо пошук за запитом:', searchQuery);
                        const searchResultIds = loadFromStorage('searchResults', []);
                        searchResults = searchResultIds
                            .map(id => products.find(p => p._id === id))
                            .filter(p => p);
                        baseSearchResults = [...searchResults];
                        if (!searchResults.length) {
                            await searchProducts(searchQuery);
                        } else {
                            showSection('catalog');
                        }
                    } else {
                        const selectedCat = categories.find(c => c.name === currentCategory);
                        let subcategorySlug = null;
                        if (currentSubcategory && selectedCat) {
                            const subCat = (selectedCat.subcategories || []).find(sub => sub.name === currentSubcategory);
                            subcategorySlug = subCat ? subCat.slug : null;
                        }
                        allProducts = products.filter(p => 
                            p.category === currentCategory && 
                            (!subcategorySlug || p.subcategory === subcategorySlug) && 
                            p.visible
                        );
                        filteredProducts = allProducts;
                        baseFilteredProducts = [...allProducts];
                    }
                }

                const targetCount = currentPage === 1 ? perPage : perPage + 14;
                const productsToShow = allProducts.slice(0, Math.min(targetCount, allProducts.length));

                console.log('popstate: currentPage=', currentPage, 'targetCount=', targetCount, 'productsToShow.length=', productsToShow.length, 'allProducts.length=', allProducts.length);

                if (productGrid && productsToShow.length > 0) {
                    productsToShow.forEach(product => {
                        if (!productGrid.querySelector(`[data-id="${product._id}"]`)) {
                            const productElement = createProductElement(product);
                            productGrid.appendChild(productElement);
                        }
                    });
                }

                showSection('catalog');
                if (state.scrollY) {
                    window.scrollTo(0, state.scrollY);
                }

                const showMoreBtn = document.querySelector('.show-more-btn');
                if (showMoreBtn) {
                    const displayedCount = productGrid ? productGrid.children.length : 0;
                    if (displayedCount >= allProducts.length || displayedCount >= perPage + 14) {
                        showMoreBtn.disabled = true;
                        showMoreBtn.innerHTML = '<span style="font-size: 18px; margin-right: 8px;">&#10004;</span><span>Більше немає товарів</span>';
                    } else {
                        showMoreBtn.disabled = false;
                        showMoreBtn.innerHTML = '<span style="font-size: 18px; margin-right: 8px;">&#8634;</span><span>Показати ще</span>';
                    }
                }
            } else if (state.sectionId === 'product-details') {
                const slug = path.split('/').pop();
                console.log('popstate: Обробка product-details, slug:', slug);
                if (!slug || slug === '[object Object]') {
                    console.warn('Невалідний slug:', slug);
                    showNotification('Товар не знайдено!', 'error');
                    showSection('home');
                    return;
                }
                currentProduct = products.find(p => p.slug === slug) || await fetchProductBySlug(slug);
                if (!currentProduct) {
                    console.error('Продукт не знайдено для slug:', slug);
                    showSection('home');
                    return;
                }
                currentCategory = currentProduct.category;
                currentSubcategory = currentProduct.subcategory || null;
                console.log('popstate: Відображаємо product-details для продукту:', currentProduct.name);
                showSection('product-details');
            } else {
                currentProduct = null;
                console.log('popstate: Відображаємо секцію:', state.sectionId);
                showSection(state.sectionId);
            }
        } else {
            console.log('popstate: history.state відсутній, обробляємо шлях:', path);
            if (parts[0] === 'catalog' && parts[1] === 'search') {
                const query = parts[2] ? transliterate(parts[2], true) : loadFromStorage('searchQuery', '');
                console.log('popstate: Відновлюємо пошук за запитом:', query);
                isSearchActive = loadFromStorage('isSearchActive', false);
                const searchResultIds = loadFromStorage('searchResults', []);
                searchResults = searchResultIds
                    .map(id => products.find(p => p._id === id))
                    .filter(p => p);
                baseSearchResults = [...searchResults];

                if (query) {
                    searchQuery = query;
                    saveToStorage('searchQuery', searchQuery);
                    saveToStorage('isSearchActive', true);
                    if (!searchResults.length) {
                        await searchProducts(query);
                    } else {
                        showSection('catalog');
                    }
                    const newPath = `/catalog/search/${transliterate(query.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-'))}`;
                    const state = {
                        sectionId: 'catalog',
                        path: newPath,
                        stateId: `search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        currentPage: 1,
                        currentCategory: null,
                        currentSubcategory: null,
                        isSearchActive: true,
                        searchQuery: query,
                        searchResults: searchResults.map(p => p._id)
                    };
                    history.replaceState(state, '', newPath);
                    console.log('popstate: history.replaceState виконано для пошуку:', state);
                } else {
                    console.warn('popstate: Запит пошуку відсутній, показуємо каталог');
                    showSection('catalog');
                }
            } else if (parts.length >= 2) {
                let productSlug = parts[parts.length - 1];
                let subCatSlug = parts.length >= 3 ? parts[1] : null;

                // Спочатку спробуємо знайти продукт за slug
                let product = products.find(p => p.slug === productSlug);
                if (!product) {
                    console.log('Продукт не знайдено в локальному кеші, запитуємо з сервера:', productSlug);
                    product = await fetchProductBySlug(productSlug);
                }
                
                if (product) {
                    currentProduct = product;
                    currentCategory = product.category;
                    currentSubcategory = product.subcategory || null;
                    console.log('Продукт знайдено:', product.name, 'Відображаємо product-details');
                    showSection('product-details');
                    const state = {
                        sectionId: 'product-details',
                        path: `/${parts[0]}${subCatSlug ? `/${subCatSlug}` : ''}/${productSlug}`,
                        stateId: `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        currentPage: 1,
                        currentCategory: currentCategory,
                        currentSubcategory: currentSubcategory,
                        isSearchActive: false,
                        searchQuery: '',
                        productId: product._id,
                        activeFilters: {},
                        currentSort: ''
                    };
                    history.pushState(state, '', `/${parts[0]}${subCatSlug ? `/${subCatSlug}` : ''}/${productSlug}`);
                    console.log('history.pushState виконано:', state);
                    return;
                }

                // Якщо продукт не знайдено, перевіряємо чи це підкатегорія
                const category = categories.find(c => transliterate(c.name.replace('ь', '')) === parts[0]);
                if (category) {
                    const subcategory = category.subcategories?.find(sub => 
                        sub.slug === subCatSlug || transliterate(sub.name.replace('ь', '')) === subCatSlug
                    );
                    if (subcategory) {
                        currentCategory = category.name;
                        currentSubcategory = subcategory.name;
                        console.log('popstate: Знайдено підкатегорію:', currentSubcategory);
                        renderCatalog(currentCategory, currentSubcategory);
                        showSection('catalog');
                        const state = {
                            sectionId: 'catalog',
                            path: `/${parts[0]}/${subCatSlug}`,
                            stateId: `catalog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            currentPage: 1,
                            currentCategory: currentCategory,
                            currentSubcategory: currentSubcategory,
                            isSearchActive: false,
                            searchQuery: ''
                        };
                        history.replaceState(state, '', `/${parts[0]}/${subCatSlug}`);
                        console.log('popstate: history.replaceState виконано для каталогу:', state);
                        return;
                    }
                }
                
                // Якщо не знайдено ні продукт, ні підкатегорію
                console.error('popstate: Продукт або підкатегорію не знайдено для slug:', productSlug);
                showNotification('Товар не знайдено!', 'error');
                showSection('home');
            } else {
                currentProduct = null;
                const category = categories.find(c => transliterate(c.name.replace('ь', '')) === parts[0])?.name || null;
                let subcategory = null;
                if (parts[1] && category) {
                    const selectedCat = categories.find(c => c.name === category);
                    subcategory = selectedCat?.subcategories?.find(sub => transliterate(sub.name.replace('ь', '')) === parts[1])?.name || null;
                }

                currentCategory = category;
                currentSubcategory = subcategory;
                currentPage = parseInt(new URLSearchParams(window.location.search).get('page')) || 1;
                console.log('popstate: Відображаємо каталог для категорії:', currentCategory, 'підкатегорії:', currentSubcategory);
                showSection('catalog');
            }
        }
    } catch (error) {
        console.error('Помилка в обробнику popstate:', error);
        console.error('Помилка навігації!');
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

const responsiveStyle = document.createElement('style');
responsiveStyle.textContent = `
    @media (min-width: 920px) {
        .filter-btn {
            display: none !important;
        }
    }
`;
document.head.appendChild(responsiveStyle);

const filterStyle = document.createElement('style');
filterStyle.textContent = `
    .filter-block {
        margin-bottom: 15px;
    }
    .filter-block h4 {
        margin: 0 0 10px 0;
        font-size: 16px;
        font-weight: bold;
    }
    .filter-options label {
        display: block;
        margin: 5px 0;
        font-size: 14px;
    }
    .filter-options input[type="checkbox"] {
        margin-right: 5px;
    }
`;
document.head.appendChild(filterStyle);

/* Додаю CSS для select, щоб <option> з innerHTML виглядали коректно */
if (!document.getElementById('mattress-select-style')) {
    const mattressSelectStyle = document.createElement('style');
    mattressSelectStyle.id = 'mattress-select-style';
    mattressSelectStyle.textContent = `
    select.custom-select option span {
      color: #d32f2f;
      font-weight: bold;
    }
    `;
    document.head.appendChild(mattressSelectStyle);
}

// Додаю функцію для додавання товару в кошик
function addToCart(cartItem) {
    console.log('addToCart called with cartItem:', cartItem);
    console.log('addToCart - cartItem.price:', cartItem.price);
    let cart = loadFromStorage('cart', []);
    if (!Array.isArray(cart)) cart = [];
    
    // Для товарів з кольорами порівнюємо ключові властивості
    const isSameColors = (a, b) => {
        // Якщо обидва null або undefined - вони однакові
        if (!a && !b) return true;
        
        // Якщо один null/undefined, а інший порожній масив - вони однакові
        if ((!a && Array.isArray(b) && b.length === 0) || (!b && Array.isArray(a) && a.length === 0)) return true;
        
        // Якщо один null/undefined, а інший не порожній - вони різні
        if (!a || !b) return false;
        
        // Якщо це масив кольорів (нова структура)
        if (Array.isArray(a) && Array.isArray(b)) {
            if (a.length !== b.length) return false;
            return a.every((colorA, index) => {
                const colorB = b[index];
                // Порівнюємо основні властивості, blockIndex може бути відсутнім
                return colorA.name === colorB.name && 
                       colorA.value === colorB.value && 
                       Number(colorA.priceChange) === Number(colorB.priceChange) && 
                       colorA.photo === colorB.photo;
                // Видаляємо перевірку blockIndex, оскільки вона може бути відсутньою
            });
        }
        
        // Для старої структури (один колір)
        return a.name === b.name && a.value === b.value && Number(a.priceChange) === Number(b.priceChange) && a.photo === b.photo;
    };
    
    const existing = cart.find(item => {
        const sameId = item.id === cartItem.id;
        const sameSize = item.size === cartItem.size;
        const sameColors = isSameColors(item.colors || item.color, cartItem.colors || cartItem.color);
        
        const comparisonDetails = {
            itemId: item.id,
            cartItemId: cartItem.id,
            sameId: sameId,
            itemSize: item.size,
            cartItemSize: cartItem.size,
            sameSize: sameSize,
            itemColors: item.colors || item.color,
            cartItemColors: cartItem.colors || cartItem.color,
            sameColors: sameColors,
            itemIdType: typeof item.id,
            cartItemIdType: typeof cartItem.id,
            itemSizeType: typeof item.size,
            cartItemSizeType: typeof cartItem.size,
            itemIdStrict: item.id === cartItem.id,
            itemSizeStrict: item.size === cartItem.size
        };
        console.log('addToCart - Comparing items:', JSON.stringify(comparisonDetails, null, 2));
        
        return sameId && sameSize && sameColors;
    });
    
    if (existing) {
        console.log('addToCart - Found existing item, updating quantity from', existing.quantity, 'to', existing.quantity + cartItem.quantity);
        existing.quantity += cartItem.quantity;
    } else {
        console.log('addToCart - No existing item found, adding new item to cart');
        cart.push(cartItem);
    }
    
    saveToStorage('cart', cart);
    console.log('Cart saved, current cart:', cart);
    console.log('Cart saved - first item price:', cart[0]?.price);
    
    // НЕ викликаємо updateCartPrices тут, оскільки ціна вже правильно розрахована
    // updateCartPrices() буде викликано в renderCart при необхідності
    
    if (typeof saveCartToServer === 'function') {
        saveCartToServer();
    }
}

// === ФУНКЦІЇ ДЛЯ ОБРАНОГО === //
function getFavorites() {
    const favorites = loadFromStorage('favorites', []);
    console.log('getFavorites: loaded favorites =', favorites);
    
    // Перевіряємо, чи всі ID товарів існують в списку товарів
    if (favorites.length > 0 && typeof products !== 'undefined' && products.length > 0) {
        const validFavorites = favorites.filter(id => {
            const productExists = products.some(p => p._id === id);
            if (!productExists) {
                console.warn('getFavorites: removing invalid product ID:', id);
            }
            return productExists;
        });
        
        if (validFavorites.length !== favorites.length) {
            console.log('getFavorites: cleaned favorites from', favorites.length, 'to', validFavorites.length);
            saveToStorage('favorites', validFavorites);
            return validFavorites;
        }
    }
    
    return favorites;
}

function updateFavoriteCount() {
    const badge = document.getElementById('favorite-count-badge');
    if (badge) {
        const favorites = getFavorites();
        const count = favorites.length;
        console.log('updateFavoriteCount: favorites =', favorites, 'count =', count);
        
        if (count > 0) {
            badge.textContent = count;
            badge.style.display = 'flex';
        } else {
            badge.textContent = '';
            badge.style.display = 'none';
        }
        badge.setAttribute('data-count', count);
    } else {
        console.warn('updateFavoriteCount: badge element not found');
    }
}
window.addEventListener('DOMContentLoaded', () => {
    console.log('DOMContentLoaded: updating favorite count');
    updateFavoriteCount();
    updateFloatingFavorite();
});

// Функція для примусового оновлення лічильників обраних товарів
function forceUpdateFavoriteCounters() {
    console.log('forceUpdateFavoriteCounters: forcing update');
    updateFavoriteCount();
    updateFloatingFavorite();
}

function updateFloatingFavorite() {
    const favBtn = document.getElementById('floating-favorite');
    const badge = document.getElementById('floating-favorite-count');
    if (!favBtn || !badge) {
        console.warn('updateFloatingFavorite: elements not found');
        return;
    }
    const favorites = getFavorites();
    const count = favorites.length;
    console.log('updateFloatingFavorite: favorites =', favorites, 'count =', count);
    
    if (count > 0) {
        badge.textContent = count;
        badge.style.display = 'flex';
    } else {
        badge.textContent = '';
        badge.style.display = 'none';
    }
    badge.setAttribute('data-count', count);
}
window.addEventListener('DOMContentLoaded', updateFloatingFavorite);

window.addEventListener('DOMContentLoaded', () => {
    const floatingFavBtn = document.getElementById('floating-favorite');
    if (floatingFavBtn) {
        floatingFavBtn.onclick = (e) => {
            e.preventDefault();
            renderFavoriteModal();
        };
    }
});

function isFavorite(productId) {
    const favs = getFavorites();
    return favs.includes(productId);
}
function addFavorite(productId) {
    let favs = getFavorites();
    if (!favs.includes(productId)) {
        favs.push(productId);
        saveToStorage('favorites', favs);
        updateFavoriteCount();
        if (typeof updateFloatingFavorite === 'function') {
            updateFloatingFavorite();
        }
    }
}

function removeFavorite(productId) {
    let favs = getFavorites();
    favs = favs.filter(id => id !== productId);
    saveToStorage('favorites', favs);
    updateFavoriteCount();
    if (typeof updateFloatingFavorite === 'function') {
        updateFloatingFavorite();
    }
    updateFavoriteIconsOnPage(); // ОНОВЛЮЄМО ВСІ ІКОНКИ
}

function toggleFavorite(productId) {
    if (isFavorite(productId)) {
        removeFavorite(productId);
        showNotification('Товар видалено з обраного', 'success');
    } else {
        addFavorite(productId);
        showNotification('Товар додано в обране!', 'success');
    }
    updateFavoriteCount();
    if (typeof updateFloatingFavorite === 'function') {
        updateFloatingFavorite();
    }
}

if (!document.getElementById('favorite-style')) {
    const favoriteStyle = document.createElement('style');
    favoriteStyle.id = 'favorite-style';
    favoriteStyle.textContent = `
    .favorite-icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-right: 10px;
      cursor: pointer;
      transition: transform 0.15s;
      opacity: 0.8;
    }
    .favorite-icon svg {
      width: 26px;
      height: 26px;
      stroke: #10b981;
      fill: none;
      transition: fill 0.2s, stroke 0.2s;
    }
    .favorite-icon.active svg {
      fill: #10b981;
      stroke: #388e3c;
      opacity: 1;
    }
    .favorite-icon:hover svg {
      filter: drop-shadow(0 0 4px #a5d6a7);
      opacity: 1;
    }
    `;
    document.head.appendChild(favoriteStyle);
}

if (!document.getElementById('favorite-modal-style')) {
    const style = document.createElement('style');
    style.id = 'favorite-modal-style';
    style.textContent = `
    .favorite-modal-bg {
      position: fixed; left: 0; top: 0; width: 100vw; height: 100vh;
      background: rgba(0,0,0,0.25); z-index: 10000; display: flex; align-items: center; justify-content: center;
    }
    .favorite-modal {
      background: #fff; border-radius: 16px; box-shadow: 0 8px 32px rgba(0,0,0,0.18);
      min-width: 320px; max-width: 95vw; min-height: 120px; max-height: 80vh; overflow-y: auto; padding: 28px 16px 18px 16px; position: relative;
      display: flex; flex-direction: column; align-items: flex-start;
    }
    .favorite-modal h2 { font-size: 1.3em; margin: 0 0 18px 0; }
    .favorite-modal .favorite-list { width: 100%; }
    .favorite-modal .favorite-item { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .favorite-modal .favorite-item img { width: 74px; height: 64px; object-fit: cover; border-radius: 8px; }
    .favorite-modal .favorite-item .remove-fav { color: #d32f2f; background: none; border: none; font-size: 28px; cursor: pointer; margin-left: 8px; }
    .favorite-modal .close-fav-modal { position: absolute; top: 10px; right: 16px; background: none; border: none; font-size: 28px; color: #888; cursor: pointer; }
    .favorite-modal .favorite-item .fav-title { font-weight: 500; font-size: 1.05em; }
    .favorite-modal .favorite-item .fav-price { color: #388e3c; font-weight: 500; margin-left: 8px; }
    .favorite-modal .favorite-item .fav-link { color: #1976d2; text-decoration: underline; cursor: pointer; }

    @media (prefers-color-scheme: dark) {
      .favorite-modal-bg {
        background: rgba(10, 14, 24, 0.75);
      }
      .favorite-modal {
        background: #232833;
        color: #f1f1f1;
        box-shadow: 0 8px 32px rgba(0,0,0,0.7);
        border: 1px solid #333a4d;
      }
      .favorite-modal h2 {
        color: #f1f1f1;
      }
      .favorite-modal .favorite-item .fav-title,
      .favorite-modal .favorite-item .fav-link {
        color: #4ecdc4;
      }
      .favorite-modal .favorite-item .fav-link:hover {
        color: #63e6be;
      }
      .favorite-modal .favorite-item .fav-price {
        color: #34d399;
      }
      .favorite-modal .favorite-item .remove-fav {
        color: #ff4d4f;
      }
      .favorite-modal .close-fav-modal {
        color: #f1f1f1;
      }
      .favorite-modal .close-fav-modal:hover {
        color: #ff4d4f;
      }
    }
    `;
    document.head.appendChild(style);
}

function renderFavoriteModal() {
    let modalBg = document.getElementById('favorite-modal-bg');
    if (modalBg) modalBg.remove();
    modalBg = document.createElement('div');
    modalBg.className = 'favorite-modal-bg';
    modalBg.id = 'favorite-modal-bg';
    modalBg.onclick = (e) => { if (e.target === modalBg) closeFavoriteModal(); };

    const modal = document.createElement('div');
    modal.className = 'favorite-modal';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-fav-modal';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = closeFavoriteModal;
    modal.appendChild(closeBtn);
    const h2 = document.createElement('h2');
    h2.textContent = 'Обране';
    modal.appendChild(h2);
    const listDiv = document.createElement('div');
    listDiv.className = 'favorite-list';
    const favs = getFavorites();
    if (!favs.length) {
        const p = document.createElement('p');
        p.textContent = 'Список обраного порожній.';
        listDiv.appendChild(p);
    } else {
        favs.forEach(id => {
            const p = products.find(p => p._id === id);
            if (!p) return;
            const itemDiv = document.createElement('div');
            itemDiv.className = 'favorite-item';
            const img = document.createElement('img');
            img.src = p.photos?.[0] || NO_IMAGE_URL;
            img.alt = p.name;
            img.onclick = () => { closeFavoriteModal(); openProduct(p.slug); };
            itemDiv.appendChild(img);
            const title = document.createElement('span');
            title.className = 'fav-title';
            title.textContent = p.name;
            title.onclick = () => { closeFavoriteModal(); openProduct(p.slug); };
            title.classList.add('fav-link');
            itemDiv.appendChild(title);
            // === Ціна для матраців ===
            if (p.type === 'mattresses' && p.sizes?.length > 0) {
                const saleSizes = p.sizes.filter(s => s.salePrice && s.salePrice < s.price);
                const minSale = saleSizes.length > 0 ? Math.min(...saleSizes.map(s => s.salePrice)) : null;
                const minPrice = Math.min(...p.sizes.map(s => s.price));
                if (minSale !== null && minSale < minPrice) {
                    const regularSpan = document.createElement('s');
                    regularSpan.className = 'fav-price';
                    regularSpan.style.color = '#888';
                    regularSpan.textContent = `${minPrice} грн`;
                    itemDiv.appendChild(regularSpan);
                    const saleSpan = document.createElement('span');
                    saleSpan.className = 'fav-price';
                    saleSpan.style.color = '#ef4444';
                    saleSpan.style.fontWeight = 'bold';
                    saleSpan.style.marginLeft = '8px';
                    saleSpan.textContent = `${minSale} грн`;
                    itemDiv.appendChild(saleSpan);
                } else {
                    const price = document.createElement('span');
                    price.className = 'fav-price';
                    price.textContent = `${minPrice} грн`;
                    itemDiv.appendChild(price);
                }
            } else if (p.type === 'group' && p.groupProducts?.length > 0) {
                const groupPrices = p.groupProducts.map(id => {
                    const gp = products.find(pr => pr._id === id);
                    if (!gp) return Infinity;
                    if (gp.type === 'mattresses' && gp.sizes?.length > 0) {
                        const saleSizes = gp.sizes.filter(s => s.salePrice && s.salePrice < s.price);
                        const minSale = saleSizes.length > 0 ? Math.min(...saleSizes.map(s => s.salePrice)) : null;
                        const minPrice = Math.min(...gp.sizes.map(s => s.price));
                        return (minSale !== null && minSale < minPrice) ? minSale : minPrice;
                    }
                    return (gp.salePrice && (gp.saleEnd === null || new Date(gp.saleEnd) > new Date())) ? gp.salePrice : gp.price;
                });
                const minPrice = Math.min(...groupPrices);
                const price = document.createElement('span');
                price.className = 'fav-price';
                price.textContent = `від ${minPrice} грн`;
                itemDiv.appendChild(price);
            } else if (typeof p.price !== 'undefined') {
                const price = document.createElement('span');
                price.className = 'fav-price';
                price.textContent = (p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date())) ? `${p.salePrice} грн` : `${p.price} грн`;
                itemDiv.appendChild(price);
            }
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-fav';
            removeBtn.innerHTML = '&times;';
            removeBtn.title = 'Видалити з обраного';
            removeBtn.onclick = () => { 
                removeFavorite(p._id); 
                renderFavoriteModal(); 
                if (typeof updateFloatingFavorite === 'function') {
                    updateFloatingFavorite();
                }
            };
            itemDiv.appendChild(removeBtn);
            listDiv.appendChild(itemDiv);
        });
    }
    modal.appendChild(listDiv);
    modalBg.appendChild(modal);
    document.body.appendChild(modalBg);
    // Після оновлення списку модалки оновлюємо іконки на сторінці
    updateFavoriteIconsOnPage();
}

function closeFavoriteModal() {
    const modalBg = document.getElementById('favorite-modal-bg');
    if (modalBg) modalBg.remove();
}

const favHeaderIcon = document.getElementById('favorite-header-icon');
if (favHeaderIcon) {
    favHeaderIcon.onclick = (e) => {
        e.preventDefault();
        renderFavoriteModal();
    };
}

function updateFavoriteIconsOnPage() {
    const favs = getFavorites();
    document.querySelectorAll('.favorite-icon[data-product-id]').forEach(icon => {
        const pid = icon.getAttribute('data-product-id');
        if (favs.includes(pid) || favs.includes(Number(pid))) {
            icon.classList.add('active');
        } else {
            icon.classList.remove('active');
        }
    });
}

function createCharP(label, value) {
    const p = document.createElement('p');
    const strong = document.createElement('strong');
    strong.textContent = `${label}: `;
    p.appendChild(strong);

    if (typeof value === 'string') {
        const span = document.createElement('span');
        span.innerHTML = value; // Використовуємо innerHTML для обробки <br>
        span.style.marginLeft = '10px';
        span.style.whiteSpace = 'pre-wrap'; // Дозволяє відображати перенос рядків
        p.appendChild(span);
    } else {
        const span = document.createElement('span');
        span.innerHTML = value;
        span.style.marginLeft = '10px';
        span.style.whiteSpace = 'pre-wrap';
        p.appendChild(span);
    }

    return p;
}

function createProductElement(product) {
    const productElement = document.createElement('div');
    productElement.className = 'product';
    productElement.dataset.id = product._id;
    productElement.style.position = 'relative';

    // --- Зображення ---
    const imgLink = document.createElement('a');
    // Знаходимо slug підкатегорії за назвою
    const category = categories.find(c => c.slug === product.category);
    const subcategory = category?.subcategories?.find(sub => sub.name === product.subcategory);
    const subcategorySlug = subcategory ? subcategory.slug : '';
    
    imgLink.href = `/${transliterate(product.category.replace('ь', ''))}${subcategorySlug ? `/${subcategorySlug}` : ''}/${product.slug}`;
    imgLink.onclick = (e) => {
        e.preventDefault();
        openProduct(product.slug);
    };
    imgLink.style.display = 'block';
    imgLink.style.position = 'relative';

    const img = document.createElement('img');
    img.src = product.photos?.[0] || NO_IMAGE_URL;
    img.alt = product.name;
    img.loading = 'lazy';
    img.style.display = 'block';
    img.style.width = '100%';
    img.style.height = 'auto';
    imgLink.appendChild(img);
    productElement.appendChild(imgLink);

    // --- Назва ---
    const h3Link = document.createElement('a');
    h3Link.href = `/${transliterate(product.category.replace('ь', ''))}${subcategorySlug ? `/${subcategorySlug}` : ''}/${product.slug}`;
    h3Link.onclick = (e) => {
        e.preventDefault();
        openProduct(product.slug);
    };
    const h3 = document.createElement('h3');
    h3.textContent = product.name;
    h3Link.appendChild(h3);
    productElement.appendChild(h3Link);

    // --- Ціна ---
    const priceDiv = document.createElement('div');
    priceDiv.className = 'price';
    priceDiv.style.display = 'flex';
    priceDiv.style.flexDirection = 'column';
    priceDiv.style.justifyContent = 'flex-start';
    priceDiv.style.minHeight = '2.6em';

    // --- Нижній рядок: ціна (без кнопок) ---
    const rowBottom = document.createElement('div');
    rowBottom.className = 'product-row-bottom';
    rowBottom.style.display = 'flex';
    rowBottom.style.alignItems = 'center';
    rowBottom.style.justifyContent = 'flex-start';
    rowBottom.style.gap = '8px';
    rowBottom.style.minWidth = '0';

    // --- Ціна (priceFlex) ---
    const priceFlex = document.createElement('div');
    priceFlex.className = 'price-flex';
    priceFlex.style.flex = '1 1 auto';
    priceFlex.style.minWidth = '0';
    priceFlex.style.display = 'flex';
    priceFlex.style.alignItems = 'center';

    // --- Кнопки справа внизу (favorite + cart) ---
    const actionsColFixed = document.createElement('div');
    actionsColFixed.style.position = 'absolute';
    actionsColFixed.style.right = '10px';
    actionsColFixed.style.bottom = '10px';
    actionsColFixed.style.display = 'flex';
    actionsColFixed.style.flexDirection = 'column';
    actionsColFixed.style.alignItems = 'flex-end';
    actionsColFixed.style.gap = '8px';
    actionsColFixed.style.zIndex = '2';

    // --- Серце (favorite) ---
    const favoriteIcon = document.createElement('div');
    favoriteIcon.className = 'favorite-icon';
    favoriteIcon.setAttribute('data-product-id', product._id);
    favoriteIcon.innerHTML = `
      <svg width="26" height="26" viewBox="0 0 26 26" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M13 23s-7.5-5.7-9.7-9.1C1.1 11.1 1 8.2 3.1 6.3c2.1-1.9 5.2-1.2 6.7 1C11 8.2 11.9 9.2 13 10.3c1.1-1.1 2-2.1 3.2-3C17.7 5.1 20.8 4.4 22.9 6.3c2.1 1.9 2 4.8-.2 7.6C20.5 17.3 13 23 13 23z" stroke="#10b981" stroke-width="2" fill="none"/>
      </svg>
    `;
    function updateFavoriteIcon() {
        if (isFavorite(product._id)) {
            favoriteIcon.classList.add('active');
        } else {
            favoriteIcon.classList.remove('active');
        }
    }
    updateFavoriteIcon();
    favoriteIcon.onclick = (e) => {
        e.stopPropagation();
        toggleFavorite(product._id);
        updateFavoriteIcon();
    };
    actionsColFixed.appendChild(favoriteIcon);

    // --- Кошик (cart) ---
    let cartIcon = null;
    if (product.type !== 'mattresses' && product.type !== 'group') {
        cartIcon = document.createElement('div');
        cartIcon.className = 'cart-icon';
        cartIcon.onclick = async (e) => {
            e.preventDefault();
            const allColors = getAllColors(product);
            if (allColors.length > 1) {
                openProduct(product.slug);
                console.error('Виберіть потрібний колір');
                return;
            }
            await addToCartWithColor(product._id);
            cartIcon.classList.add('added');
            setTimeout(() => cartIcon.classList.remove('added'), 2000);
        };
        actionsColFixed.appendChild(cartIcon);
    }

    // --- Верхній рядок: перекреслена ціна (якщо є акція) ---
    let hasOldPrice = false;
    const isOnSale = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date());

    if (product.type === 'mattresses' && product.sizes?.length > 0) {
        const saleSizes = product.sizes.filter(s => s.salePrice && s.salePrice < s.price);
        const minSale = saleSizes.length > 0 ? Math.min(...saleSizes.map(s => s.salePrice)) : null;
        const minPrice = Math.min(...product.sizes.map(s => s.price));
        if (minSale !== null && minSale < minPrice) {
            // Верхній рядок — перекреслена ціна
            const oldRow = document.createElement('div');
            oldRow.style.display = 'flex';
            oldRow.style.alignItems = 'center';
            oldRow.style.justifyContent = 'flex-start';
            oldRow.style.minHeight = '1.2em';
            const regularSpan = document.createElement('span');
            regularSpan.className = 'regular-price';
            regularSpan.innerHTML = `<s class='price-value'>${minPrice}</s> <span class='price-suffix'>грн</span>`;
            oldRow.appendChild(regularSpan);
            priceDiv.appendChild(oldRow);
            hasOldPrice = true;
            // Нижній рядок — акційна ціна
            const saleSpan = document.createElement('span');
            saleSpan.className = 'sale-price';
            saleSpan.innerHTML = `<span class='price-value'>${minSale}</span> <span class='price-suffix'>грн</span>`;
            priceFlex.appendChild(saleSpan);
        } else {
            // Додаємо прозорий рядок для вирівнювання з товарами, що мають акцію
            const emptyRow = document.createElement('div');
            emptyRow.style.minHeight = '1.2em';
            emptyRow.style.visibility = 'hidden';
            emptyRow.innerHTML = `<span class='price-value'>${minPrice}</span> <span class='price-suffix'>грн</span>`;
            priceDiv.appendChild(emptyRow);
            // Один рядок — звичайна ціна (тепер на тому ж рівні, що й акційна ціна)
            const regularSpan = document.createElement('span');
            regularSpan.className = 'regular-price';
            regularSpan.innerHTML = `<span class='price-value'>${minPrice}</span> <span class='price-suffix'>грн</span>`;
            priceFlex.appendChild(regularSpan);
        }
    } else if (product.type === 'group' && product.groupProducts?.length > 0) {
        const groupPrices = product.groupProducts.map(id => {
            const p = products.find(p => p._id === id);
            if (!p) return Infinity;
            if (p.type === 'mattresses' && p.sizes?.length > 0) {
                const saleSizes = p.sizes.filter(s => s.salePrice && s.salePrice < s.price);
                const minSale = saleSizes.length > 0 ? Math.min(...saleSizes.map(s => s.salePrice)) : null;
                const minPrice = Math.min(...p.sizes.map(s => s.price));
                return (minSale !== null && minSale < minPrice) ? minSale : minPrice;
            }
            return (p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date())) ? p.salePrice : p.price;
        });
        const minPrice = Math.min(...groupPrices);
        // Додаємо прозорий рядок для вирівнювання з товарами, що мають акцію
        const emptyRow = document.createElement('div');
        emptyRow.style.minHeight = '1.2em';
        emptyRow.style.visibility = 'hidden';
        emptyRow.innerHTML = `<span class='price-value'>${minPrice}</span> <span class='price-suffix'>грн</span>`;
        priceDiv.appendChild(emptyRow);
        const regularSpan = document.createElement('span');
        regularSpan.className = 'regular-price';
        regularSpan.innerHTML = `<span class='price-suffix'>від</span> <span class='price-value'>${minPrice}</span> <span class='price-suffix'>грн</span>`;
        priceFlex.appendChild(regularSpan);
    } else {
        if (isOnSale) {
            // Верхній рядок — перекреслена ціна
            const oldRow = document.createElement('div');
            oldRow.style.display = 'flex';
            oldRow.style.alignItems = 'center';
            oldRow.style.justifyContent = 'flex-start';
            oldRow.style.minHeight = '1.2em';
            const regularSpan = document.createElement('span');
            regularSpan.className = 'regular-price';
            regularSpan.innerHTML = `<s class='price-value'>${product.price}</s> <span class='price-suffix'>грн</span>`;
            oldRow.appendChild(regularSpan);
            priceDiv.appendChild(oldRow);
            hasOldPrice = true;
            // Нижній рядок — акційна ціна
            const saleSpan = document.createElement('span');
            saleSpan.className = 'sale-price';
            saleSpan.innerHTML = `<span class='price-value'>${product.salePrice}</span> <span class='price-suffix'>грн</span>`;
            priceFlex.appendChild(saleSpan);
        } else {
            // Додаємо прозорий рядок для вирівнювання з товарами, що мають акцію
            const emptyRow = document.createElement('div');
            emptyRow.style.minHeight = '1.2em';
            emptyRow.style.visibility = 'hidden';
            emptyRow.innerHTML = `<span class='price-value'>${product.price}</span> <span class='price-suffix'>грн</span>`;
            priceDiv.appendChild(emptyRow);
            // Один рядок — звичайна ціна (тепер на тому ж рівні, що й акційна ціна)
            const regularSpan = document.createElement('span');
            regularSpan.className = 'regular-price';
            regularSpan.innerHTML = `<span class='price-value'>${product.price}</span> <span class='price-suffix'>грн</span>`;
            priceFlex.appendChild(regularSpan);
        }
    }

    // --- Додаємо priceFlex у rowBottom ---
    rowBottom.appendChild(priceFlex);
    priceDiv.appendChild(rowBottom);
    productElement.appendChild(priceDiv);

    // --- Додаємо actionsColFixed (favorite + cart) у productElement ---
    productElement.appendChild(actionsColFixed);

    return productElement;
}

async function addToCartWithColor(productId) {
    const product = products.find(p => p._id === productId || p.id === productId);
    if (!product) {
        console.error('Товар не знайдено!');
        return;
    }
    
    // Отримуємо всі кольори з блоків
    const allColors = getAllColors(product);
    const selectedColorIndices = selectedColors[product._id] || {};
    
    // Перевіряємо, чи вибрано хоча б один колір з кожного блоку
    if (product.colorBlocks && product.colorBlocks.length > 0) {
        const requiredBlocks = product.colorBlocks.length;
        const selectedBlocks = Object.keys(selectedColorIndices).length;
        
        if (selectedBlocks < requiredBlocks) {
            console.warn(`Потрібно вибрати колір з кожного блоку (вибрано ${selectedBlocks} з ${requiredBlocks})`);
            showNotification(`Виберіть колір з кожного блоку кольорів`, 'warning');
            return;
        }
    } else if (allColors.length > 0) {
        // Для старої структури або одного блоку
        if (!selectedColorIndices[0] && allColors.length > 1) {
            console.warn('Виберіть потрібний колір');
            showNotification('Виберіть потрібний колір', 'warning');
            return;
        }
    }
    
    let size = null;
    if (product.type === 'mattresses' && product.sizes?.length > 0) {
        size = selectedMattressSizes[product._id] || product.sizes[0]?.name;
        console.log('Selected size for mattress:', size);
        console.log('Available sizes:', product.sizes);
    }
    
    const qtyInput = document.getElementById(`quantity-${product._id}`);
    let quantity = 1;
    if (qtyInput && !isNaN(parseInt(qtyInput.value))) {
        quantity = Math.max(1, parseInt(qtyInput.value));
    }
    
    let price = product.price;
    if (product.type === 'mattresses' && size) {
        const sizeInfo = product.sizes.find(s => s.name === size);
        if (sizeInfo) {
            console.log('Size info for', size, ':', sizeInfo);
            // Спочатку перевіряємо акційну ціну розміру
            if (sizeInfo.salePrice && sizeInfo.salePrice < sizeInfo.price) {
                price = sizeInfo.salePrice;
                console.log('Using sale price for size:', sizeInfo.salePrice);
            } else {
                price = sizeInfo.price;
                console.log('Using regular price for size:', sizeInfo.price);
            }
        }
    }
    
    // Перевіряємо загальну акційну ціну товару (якщо немає розміру або акційної ціни розміру)
    if (product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date())) {
        // Для матраців з розмірами використовуємо акційну ціну тільки якщо немає акційної ціни розміру
        if (product.type === 'mattresses' && size) {
            const sizeInfo = product.sizes.find(s => s.name === size);
            if (!sizeInfo || !sizeInfo.salePrice || sizeInfo.salePrice >= sizeInfo.price) {
                price = product.salePrice;
            }
        } else {
            price = product.salePrice;
        }
    }
    
    // Додаємо зміну ціни від усіх вибраних кольорів
    let totalPriceChange = 0;
    Object.values(selectedColorIndices).forEach(globalIndex => {
        const selectedColor = allColors.find(color => color.globalIndex === globalIndex);
        if (selectedColor && selectedColor.priceChange) {
            totalPriceChange += parseFloat(selectedColor.priceChange);
        }
    });
    
    price += totalPriceChange;
    
    console.log('addToCartWithColor - Product:', product.name, 'Type:', product.type, 'Final price:', price, 'Original price:', product.price, 'Sale price:', product.salePrice);
    
    // Створюємо об'єкт кольорів для кошика
    const selectedColorsForCart = [];
    Object.entries(selectedColorIndices).forEach(([blockIndex, globalIndex]) => {
        const selectedColor = allColors.find(color => color.globalIndex === globalIndex);
        if (selectedColor) {
            selectedColorsForCart.push({
                ...selectedColor,
                blockIndex: parseInt(blockIndex)
            });
        }
    });
    
    const cartItem = {
        id: product._id || product.id,
        name: product.name,
        quantity,
        price: parseFloat(price),
        photo: product.photos?.[0] || NO_IMAGE_URL,
        colors: selectedColorsForCart, // Зберігаємо всі вибрані кольори
        size
    };
    

    

    
    addToCart(cartItem);
    showNotification('Товар додано в кошик!', 'success');
    updateCartCount();
    
    // НЕ викликаємо updateCartPrices тут, оскільки ціна вже правильно розрахована
    // updateCartPrices() буде викликано в renderCart при необхідності
    
    // Оновлюємо плаваючий кошик, якщо він є
    if (typeof updateFloatingGroupCart === 'function' && currentProduct && currentProduct.type === 'group') {
        updateFloatingGroupCart();
    }
}

function selectColor(productId, blockIndex, globalIndex) {
    if (!selectedColors[productId]) {
        selectedColors[productId] = {};
    }
    selectedColors[productId][blockIndex] = globalIndex;
    saveToStorage('selectedColors', selectedColors);
    
    // Знаходимо товар для отримання інформації про блоки
    const product = products.find(p => p._id === productId || p.id === productId);
    if (!product) return;
    
    // Отримуємо всі кольори з блоками
    const allColors = getAllColors(product);
    const selectedColor = allColors.find(color => color.globalIndex === globalIndex);
    
    if (selectedColor) {
        // Підсвічування вибраного кольору в правильному блоці
        const colorCircles = document.querySelectorAll(`#color-options-${productId}-${selectedColor.blockIndex} .color-circle`);
        colorCircles.forEach((circle, idx) => {
            if (idx === selectedColor.colorIndex) {
                circle.classList.add('selected');
            } else {
                circle.classList.remove('selected');
            }
        });
        
        // Оновлюємо ціну після вибору кольору
        updateColorPrice(productId);
        
        // Додатково оновлюємо ціну для групових товарів
        if (currentProduct && currentProduct.type === 'group') {
            updateFloatingGroupCart();
        }
    }
}

function selectGroupProductColor(productId, blockIndex, globalIndex) {
    if (!selectedColors[productId]) {
        selectedColors[productId] = {};
    }
    selectedColors[productId][blockIndex] = globalIndex;
    saveToStorage('selectedColors', selectedColors);
    
    // Підсвічування вибраних кольорів в групових товарах
    const colorCircles = document.querySelectorAll(`.group-color-circle[data-product-id="${productId}"]`);
    colorCircles.forEach((circle) => {
        const circleColorIndex = parseInt(circle.getAttribute('data-color-index'));
        const circleBlockIndex = parseInt(circle.getAttribute('data-block-index') || '0');
        
        // Перевіряємо, чи цей колір вибраний у своєму блоці
        const isSelectedInBlock = selectedColors[productId]?.[circleBlockIndex] === circleColorIndex;
        
        if (isSelectedInBlock) {
            circle.classList.add('selected');
            circle.style.border = '2px solid #60A5FA';
        } else {
            circle.classList.remove('selected');
            circle.style.border = '2px solid #ddd';
        }
    });
    
    // Оновлюємо ціну в плаваючому кошику
    if (currentProduct && currentProduct.type === 'group') {
        updateFloatingGroupCart();
    } else {
        // Оновлюємо ціну для звичайного товару
        updateColorPrice(productId);
    }
    
    // Оновлюємо ціну товару в груповому товарі
    updateGroupProductPrice(productId);
}

function updateColorPrice(productId) {
    const product = products.find(p => p._id === productId || p.id === productId);
    if (!product) return;
    
    const allColors = getAllColors(product);
    const selectedColorIndices = selectedColors[productId];
    
    if (selectedColorIndices) {
        let totalPriceChange = 0;
        Object.values(selectedColorIndices).forEach(globalIndex => {
            const selectedColor = allColors.find(color => color.globalIndex === globalIndex);
            if (selectedColor) {
                totalPriceChange += parseFloat(selectedColor.priceChange || 0);
            }
        });
        
        // Знаходимо елемент ціни на сторінці товару - шукаємо в різних місцях
        let priceElement = document.querySelector('#product-details .price');
        if (!priceElement) {
            priceElement = document.querySelector('.product-details .price');
        }
        if (!priceElement) {
            priceElement = document.querySelector('.price');
        }
        
        if (priceElement) {
            const isOnSale = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date());
            let basePrice = isOnSale ? parseFloat(product.salePrice) : parseFloat(product.price || 0);
            let finalPrice = basePrice + totalPriceChange;
            
            // Оновлюємо відображення ціни
            const priceValueElements = priceElement.querySelectorAll('.price-value');
            if (priceValueElements.length > 0) {
                priceValueElements.forEach(element => {
                    if (element.parentElement.classList.contains('sale-price')) {
                        // Для акційної ціни
                        element.textContent = finalPrice.toFixed(0);
                    } else if (!element.parentElement.classList.contains('original-price')) {
                        // Для звичайної ціни
                        element.textContent = finalPrice.toFixed(0);
                    }
                });
            } else {
                // Якщо немає елементів .price-value, оновлюємо весь текст ціни
                priceElement.textContent = finalPrice.toFixed(0) + ' грн';
            }
        }
    }
}

function restoreSelectedColors() {
    // Відновлюємо графічне відображення вибраних кольорів для всіх товарів
    Object.keys(selectedColors).forEach(productId => {
        const product = products.find(p => p._id === productId || p.id === productId);
        if (!product) return;
        
        const selectedColorIndices = selectedColors[productId];
        if (!selectedColorIndices) return;
        
        // Для групових товарів
        const groupColorCircles = document.querySelectorAll(`.group-color-circle[data-product-id="${productId}"]`);
        if (groupColorCircles.length > 0) {
            groupColorCircles.forEach((circle) => {
                const circleColorIndex = parseInt(circle.getAttribute('data-color-index'));
                const circleBlockIndex = parseInt(circle.getAttribute('data-block-index') || '0');
                
                // Перевіряємо, чи цей колір вибраний у своєму блоці
                const isSelectedInBlock = selectedColorIndices[circleBlockIndex] === circleColorIndex;
                
                if (isSelectedInBlock) {
                    circle.classList.add('selected');
                    circle.style.border = '2px solid #60A5FA';
                } else {
                    circle.classList.remove('selected');
                    circle.style.border = '2px solid #ddd';
                }
            });
        }
        
        // Для звичайних товарів
        Object.entries(selectedColorIndices).forEach(([blockIndex, globalIndex]) => {
            const allColors = getAllColors(product);
            const selectedColor = allColors.find(color => color.globalIndex === globalIndex);
            
            if (selectedColor) {
                const colorCircles = document.querySelectorAll(`#color-options-${productId}-${selectedColor.blockIndex} .color-circle`);
                colorCircles.forEach((circle, idx) => {
                    if (idx === selectedColor.colorIndex) {
                        circle.classList.add('selected');
                    } else {
                        circle.classList.remove('selected');
                    }
                });
            }
        });
    });
}

function updateGroupProductPrice(productId) {
    const product = products.find(p => p._id === productId || p.id === productId);
    if (!product) return;
    
    const allColors = getAllColors(product);
    const selectedColorIndices = selectedColors[productId];
    
    if (selectedColorIndices) {
        let totalPriceChange = 0;
        Object.values(selectedColorIndices).forEach(globalIndex => {
            const selectedColor = allColors.find(color => color.globalIndex === globalIndex);
            if (selectedColor) {
                totalPriceChange += parseFloat(selectedColor.priceChange || 0);
            }
        });
        
        // Знаходимо елемент ціни товару в груповому товарі
        // Шукаємо всі елементи з ціною в групових товарах
        const groupProducts = document.querySelectorAll('.group-product-item');
        let priceElement = null;
        
        for (const item of groupProducts) {
            // Перевіряємо, чи це правильний товар (за назвою або іншими атрибутами)
            const productName = item.querySelector('h3')?.textContent;
            if (productName === product.name) {
                priceElement = item.querySelector('.price');
                break;
            }
        }
        
        if (priceElement) {
            const isOnSale = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date());
            let basePrice = isOnSale ? parseFloat(product.salePrice) : parseFloat(product.price || 0);
            let finalPrice = basePrice + totalPriceChange;
            
            // Оновлюємо відображення ціни
            const priceValueElements = priceElement.querySelectorAll('.price-value');
            priceValueElements.forEach(element => {
                if (element.parentElement.classList.contains('sale-price')) {
                    // Для акційної ціни
                    element.textContent = finalPrice.toFixed(0);
                } else if (!element.parentElement.classList.contains('original-price')) {
                    // Для звичайної ціни
                    element.textContent = finalPrice.toFixed(0);
                }
            });
        }
    }
}

// ... existing code ...
        // Додаю закриття меню фільтрів при кліку поза ним
        document.addEventListener('click', function(e) {
            const filters = document.querySelector('.filters');
            const isFiltersOpen = filters && filters.classList.contains('active');
            if (isFiltersOpen) {
                const isFilters = filters.contains(e.target);
                const filterBtn = document.querySelector('.filter-btn');
                const isFilterBtn = filterBtn && filterBtn.contains(e.target);
                if (!isFilters && !isFilterBtn) {
                    filters.classList.remove('active');
                    // Видаляємо клас filters-active з навігації
                    const nav = document.querySelector('.nav');
                    if (nav) nav.classList.remove('filters-active');
                    e.stopPropagation();
                    e.preventDefault();
                    return false;
                }
            }
        }, true);
// ... existing code ...

// Додаю закриття меню "Телефони" при кліку поза ним з блокуванням переходу
document.addEventListener('click', function(e) {
    const phoneMenu = window.__phoneDropdownMenu;
    const arrow = document.querySelector('.phone-dropdown-arrow');
    const phones = document.getElementById('phones');
    const isPhoneMenuOpen = phoneMenu && phoneMenu.style.display === 'block';
    if (isPhoneMenuOpen) {
        const isMenu = phoneMenu.contains(e.target);
        const isPhones = phones && phones.contains(e.target);
        if (!isMenu && !isPhones) {
            phoneMenu.style.display = 'none';
            if (arrow) arrow.classList.remove('active');
            e.stopPropagation();
            e.preventDefault();
            return false;
        }
    }
}, true);

        // Додаю закриття меню "Сортування" при кліку поза ним з блокуванням переходу
        document.addEventListener('click', function(e) {
            const sortDropdown = document.querySelector('.sort-dropdown');
            const isSortOpen = sortDropdown && sortDropdown.style.display === 'block';
            if (isSortOpen) {
                const isDropdown = sortDropdown.contains(e.target);
                const sortBtn = document.querySelector('.sort-btn');
                const isSortBtn = sortBtn && sortBtn.contains(e.target);
                if (!isDropdown && !isSortBtn) {
                    sortDropdown.style.display = 'none';
                    e.stopPropagation();
                    e.preventDefault();
                    return false;
                }
            }
        }, true);

        // Додаю закриття меню "Каталог" при кліку поза ним з блокуванням переходу
        document.addEventListener('click', function(e) {
            const catalogDropdown = document.getElementById('catalog-dropdown');
            const catalogToggle = document.getElementById('catalog-toggle');
            const isCatalogOpen = catalogDropdown && catalogDropdown.classList.contains('active');
            if (isCatalogOpen) {
                const isDropdown = catalogDropdown.contains(e.target);
                const isToggle = catalogToggle && catalogToggle.contains(e.target);
                if (!isDropdown && !isToggle) {
                    catalogDropdown.classList.remove('active');
                    document.querySelectorAll('.sub-list').forEach(sl => sl.classList.remove('active'));
                    e.stopPropagation();
                    e.preventDefault();
                    return false;
                }
            }
        }, true);

        // Додаю закриття випадаючих меню розмірів матраців при кліку поза ними з блокуванням переходу
        document.addEventListener('click', function(e) {
            const customSelects = document.querySelectorAll('.custom-select');
            customSelects.forEach(select => {
                const optionsList = select.querySelector('.custom-options-list');
                const isOpen = optionsList && optionsList.style.display === 'block';
                if (isOpen) {
                    const isInside = select.contains(e.target);
                    if (!isInside) {
                        optionsList.style.display = 'none';
                        const arrow = select.querySelector('.custom-select-arrow');
                        if (arrow) arrow.style.transform = 'none';
                        e.stopPropagation();
                        e.preventDefault();
                        return false;
                    }
                }
            });
        }, true);