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
            cart = data.map(item => {
                const product = products.find(p => p.id === item.id);
                if (product?.type === 'mattresses') {
                    return {
                        id: Number(item.id),
                        name: item.name || '',
                        quantity: item.quantity || 1,
                        price: item.price || 0,
                        photo: item.photo || '',
                        color: null,
                        size: item.size || null
                    };
                }
                return {
                    id: Number(item.id),
                    name: item.name || '',
                    quantity: item.quantity || 1,
                    price: item.price || 0,
                    photo: item.photo || '',
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
    try {
        let cartItems = loadFromStorage('cart', []);

        if (!Array.isArray(cartItems)) {
            console.warn('Кошик у localStorage не є масивом, скидаємо');
            cartItems = [];
            saveToStorage('cart', cartItems);
        }

        const filteredCartItems = cartItems
            .map(item => {
                if (typeof item.id !== 'number' || isNaN(item.id)) {
                    console.warn('Некоректний ID в елементі кошика:', item);
                    return null;
                }
                const product = products.find(p => p.id === item.id);
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
                        price = parseFloat(sizeInfo.price || price);
                        sizeData = item.size;
                    } else {
                        console.log(`Матрац ${item.name} без розміру, використовуємо базову ціну: ${price}`);
                    }
                } else if (item.color) {
                    colorData = {
                        name: item.color.name || 'Не вказано',
                        value: item.color.value || item.color.name || '',
                        priceChange: parseFloat(item.color.priceChange || 0),
                        photo: item.color.photo || null
                    };
                    price += parseFloat(colorData.priceChange || 0);
                }

                const cartItem = {
                    id: Number(item.id),
                    name: item.name || '',
                    quantity: Number(item.quantity) || 1,
                    price: parseFloat(price) || 0,
                    photo: product.photos?.[0] || NO_IMAGE_URL,
                    color: colorData,
                    size: sizeData
                };
                return cartItem;
            })
            .filter(item => item !== null && item.name && item.quantity > 0 && item.price >= 0 && !isNaN(item.price));

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
                        showNotification(`Помилка: ${JSON.parse(errorText).error || 'Некоректні дані кошика.'}`, 'error');
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
        showNotification('Помилка збереження кошика!', 'error');
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
                clearInterval(checkInterval);
                resolve();
            }
        }, 10000);
    });

    restoreSearchState();

    // Відновлюємо фільтри та сортування
    if (Object.keys(activeFilters).length > 0) {
        applySavedFilters(activeFilters);
    }
    if (currentSort) {
        sortProducts(currentSort);
    }

    updateHeader();
    renderCategories();
    renderCatalogDropdown();
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
    if (!productGrid) {
        console.warn('Елемент .product-grid не знайдено');
        return;
    }

    console.log('loadMoreProducts: currentPage=', currentPage, 'allProducts.length=', allProducts.length);

    const currentCount = productGrid.children.length;
    const productsPerLoad = currentCount >= perPage ? 14 : perPage - currentCount;
    const startIndex = currentCount;
    const productsToShow = allProducts.slice(startIndex, startIndex + productsPerLoad);

    console.log('productsToShow.length=', productsToShow.length, 'startIndex=', startIndex, 'productsPerLoad=', productsPerLoad);

    if (productsToShow.length === 0) {
        const showMoreBtn = document.querySelector('.show-more-btn');
        if (showMoreBtn) {
            showMoreBtn.disabled = true;
            showMoreBtn.textContent = 'Більше немає товарів';
        }
        return;
    }

    while (productGrid.firstChild) {
        productGrid.removeChild(productGrid.firstChild);
    }

    const allProductsToShow = allProducts.slice(0, startIndex + productsPerLoad);
    let addedCount = 0;

    allProductsToShow.forEach(product => {
        const productElement = createProductElement(product);
        productGrid.appendChild(productElement);
        addedCount++;
    });

    console.log('Added products:', addedCount);

    const showMoreBtn = document.querySelector('.show-more-btn');
    const displayedCount = productGrid.children.length;
    if (showMoreBtn) {
        if (displayedCount >= allProducts.length) {
            showMoreBtn.disabled = true;
            showMoreBtn.textContent = 'Більше немає товарів';
        } else {
            showMoreBtn.disabled = false;
            showMoreBtn.textContent = 'Показати ще';
        }
    }

    const totalPages = Math.ceil(allProducts.length / perPage);
    renderPagination(totalPages, allProducts.length);

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

                if (product.colors?.length > 0 && selectedColors[id] !== undefined) {
                    const colorIndex = parseInt(selectedColors[id]);
                    if (product.colors[colorIndex]) {
                        price += parseFloat(product.colors[colorIndex].priceChange || 0);
                    }
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
    } catch (error) {
        console.error('Помилка в updateFloatingGroupCart:', error);
        showNotification('Помилка оновлення плаваючої кнопки кошика!', 'error');
    }
}

function showSection(sectionId) {
    console.log('showSection: Відображаємо секцію:', sectionId);

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
        if (typeof showNotification === 'function') {
            showNotification('Сторінку не знайдено!', 'error');
        }
        showSection('home');
        return;
    }

    section.classList.add('active');
    section.style.display = 'block';

    if (burgerMenu && floatingCart) {
        const header = document.querySelector('header');
        const headerHeight = header ? header.offsetHeight : 0;
        const handleScroll = () => {
            if (window.scrollY > headerHeight) {
                burgerMenu.classList.add('visible');
                floatingCart.classList.add('visible');
                if (sectionId === 'product-details' && currentProduct?.type === 'group' && floatingGroupCart) {
                    floatingGroupCart.classList.add('visible');
                }
            } else {
                burgerMenu.classList.remove('visible');
                floatingCart.classList.remove('visible');
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
    } else if (sectionId === 'cart') {
        parentGroupProduct = null;
        saveToStorage('parentGroupProduct', null);
        if (typeof renderCart === 'function') {
            renderCart();
        }
        newPath = '/cart';
    } else if (sectionId === 'contacts') {
        if (typeof renderContacts === 'function') {
            renderContacts();
        }
        newPath = '/contacts';
    } else if (sectionId === 'about') {
        if (typeof renderAbout === 'function') {
            renderAbout();
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
                if (currentProduct.type === 'group' && typeof updateFloatingGroupCart === 'function') {
                    updateFloatingGroupCart();
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
        const catSlug = transliterate(currentCategory.replace('ь', ''));
        const subCatSlug = currentSubcategory ? transliterate(currentSubcategory.replace('ь', '')) : '';
        newPath = `/${catSlug}${subCatSlug ? `/${subCatSlug}` : ''}/${currentProduct.slug}`;
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
        updateMetaTags(sectionId === 'product-details' ? currentProduct : null);
    }
    if (typeof renderBreadcrumbs === 'function') {
        renderBreadcrumbs();
    }

    activeTimers.forEach((id) => clearInterval(id));
    activeTimers.clear();

    document.dispatchEvent(new Event('sectionChange'));
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
        pLink.href = `/${transliterate(cat.name.replace('ь', ''))}`;
        pLink.style.textDecoration = 'none';
        pLink.onclick = (e) => {
            e.preventDefault();
            currentCategory = cat.name;
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
            subLink.href = `/${transliterate(cat.name.replace('ь', ''))}/${transliterate(sub.name.replace('ь', ''))}`;
            subLink.style.textDecoration = 'none';
            subLink.onclick = (e) => {
                e.preventDefault();
                currentCategory = cat.name;
                currentSubcategory = sub.slug || transliterate(sub.name.replace('ь', ''));
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
        itemDiv.dataset.category = cat.name;

        const span = document.createElement('span');
        span.textContent = cat.name;
        span.style.textDecoration = 'none';
        span.style.cursor = 'pointer';
        span.style.display = 'block';
        span.style.padding = '8px 5px';
        span.style.margin = '0';
        span.style.fontWeight = 'bold';

        // Динамічний розмір шрифту залежно від розміру екрану
        if (window.innerWidth <= 650) {
            span.style.fontSize = '14px';
        } else if (window.innerWidth <= 920) {
            span.style.fontSize = '15px';
        } else {
            span.style.fontSize = '16px';
        }

        const toggleSubDropdown = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const currentItem = itemDiv;
            const subList = currentItem.querySelector('.sub-list');
            const isActive = subList.classList.contains('active');

            document.querySelectorAll('.sub-list').forEach(sl => sl.classList.remove('active'));

            if (!isActive && subList) {
                subList.classList.add('active');
            }
        };

        span.addEventListener('click', toggleSubDropdown);
        span.addEventListener('touchend', toggleSubDropdown);

        span.addEventListener('click', (e) => {
            if (!cat.subcategories || cat.subcategories.length === 0) {
                e.preventDefault();
                currentProduct = null;
                currentCategory = cat.name;
                currentSubcategory = null;
                isSearchActive = false;
                searchQuery = '';
                searchResults = [];
                baseSearchResults = [];
                saveToStorage('isSearchActive', false);
                saveToStorage('searchQuery', '');
                saveToStorage('searchResults', []);
                showSection('catalog');
                dropdown.classList.remove('active');
            }
        });

        itemDiv.appendChild(span);

        const subList = document.createElement('div');
        subList.className = 'sub-list';
        subList.style.display = 'none';
        subList.style.paddingLeft = '30px';

        const styleObserver = new MutationObserver(() => {
            subList.style.display = subList.classList.contains('active') ? 'block' : 'none';
        });
        styleObserver.observe(subList, { attributes: true, attributeFilter: ['class'] });

        (cat.subcategories || []).forEach(sub => {
            const p = document.createElement('p');
            p.textContent = sub.name;
            p.style.textDecoration = 'none';
            p.style.padding = '5px 5px';
            p.style.margin = '0';
            p.style.cursor = 'pointer';
            p.style.fontWeight = 'normal';

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
            p.onclick = (e) => {
                e.stopPropagation();
                currentProduct = null;
                currentCategory = cat.name;
                currentSubcategory = sub.slug || transliterate(sub.name.replace('ь', ''));
                isSearchActive = false;
                searchQuery = '';
                searchResults = [];
                baseSearchResults = [];
                saveToStorage('isSearchActive', false);
                saveToStorage('searchQuery', '');
                saveToStorage('searchResults', []);
                showSection('catalog');
                dropdown.classList.remove('active');
                document.querySelectorAll('.sub-list').forEach(sl => sl.classList.remove('active'));
            };
            subList.appendChild(p);
        });

        itemDiv.appendChild(subList);
        dropdown.appendChild(itemDiv);
    });

    document.addEventListener('click', (e) => {
        const isClickInsideDropdown = dropdown.contains(e.target);
        const isClickInsideToggle = document.getElementById('catalog-toggle').contains(e.target);
        if (!isClickInsideDropdown && !isClickInsideToggle) {
            dropdown.classList.remove('active');
            document.querySelectorAll('.sub-list').forEach(sl => sl.classList.remove('active'));
        }
    });

    dropdown.addEventListener('click', (e) => {
        e.stopPropagation();
    });
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
            imgLink.href = `/${transliterate(cat.name.replace('ь', ''))}`;
            imgLink.onclick = (e) => {
                e.preventDefault();
                currentCategory = cat.name;
                currentSubcategory = null;
                currentProduct = null;
                currentPage = 1;
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
                currentPage = 1;
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
                    currentSubcategory = sub.slug || transliterate(sub.name.replace('ь', ''));
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

        let subcategorySlug = null;
        if (subcategory) {
            const selectedSubCat = selectedCat.subcategories?.find(sub => sub.name === subcategory || sub.slug === subcategory);
            subcategorySlug = selectedSubCat ? (selectedSubCat.slug || transliterate(selectedSubCat.name.replace('ь', ''))) : subcategory;
        }

        filteredProducts = products.filter(p => 
            p.category === category && 
            (!subcategorySlug || p.subcategory === subcategorySlug) && 
            p.visible
        );

        baseFilteredProducts = [...filteredProducts];

        console.log('Filtered products for category:', category, 'subcategory:', subcategory, 'subcategorySlug:', subcategorySlug, 'count:', filteredProducts.length);

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
        if (filters) filters.classList.toggle('active');
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
        sortDropdown.style.display = sortDropdown.style.display === 'block' ? 'none' : 'block';
    };
    sortMenu.appendChild(sortBtn);

    const sortDropdown = document.createElement('div');
    sortDropdown.className = 'sort-dropdown';
    sortDropdown.style.display = 'none';
    sortDropdown.style.position = 'absolute';
    sortDropdown.style.backgroundColor = '#fff';
    sortDropdown.style.border = '1px solid #ccc';
    sortDropdown.style.borderRadius = '12px';
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
        filtered.sort((a, b) => b.name.localeCompare(b.name));
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
    } else if (sortType === 'popularity') {
        filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
    }

    filteredProducts = filtered;
    if (isSearchActive) searchResults = filtered;

    updateHistoryState();
    renderProducts(isSearchActive ? searchResults : filteredProducts);
}

function renderProducts(filtered) {
    const productList = document.getElementById('product-list');
    if (!productList) return;

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

    let activeProducts = [...filtered];

    if (currentSort) {
        if (currentSort === 'name-asc') {
            activeProducts.sort((a, b) => a.name.localeCompare(b.name));
        } else if (currentSort === 'name-desc') {
            activeProducts.sort((a, b) => b.name.localeCompare(b.name));
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

    const totalItems = activeProducts.length;
    const totalPages = Math.ceil(totalItems / perPage);

    const start = (currentPage - 1) * perPage;
    const productsToShow = activeProducts.slice(start, start + perPage);

    console.log('renderProducts: currentPage=', currentPage, 'start=', start, 'productsToShow.length=', productsToShow.length, 'totalItems=', totalItems);

    if (productsToShow.length === 0) {
        const p = document.createElement('p');
        p.textContent = 'Нічого не знайдено';
        productList.appendChild(p);
        renderPagination(totalPages, totalItems);
        return;
    }

    productsToShow.forEach(product => {
        const productElement = createProductElement(product);
        productList.appendChild(productElement);
    });

    const showMoreBtn = document.querySelector('.show-more-btn');
    const displayedCount = productList.children.length;
    if (showMoreBtn) {
        if (displayedCount >= totalItems) {
            showMoreBtn.disabled = true;
            showMoreBtn.textContent = 'Більше немає товарів';
        } else {
            showMoreBtn.disabled = false;
            showMoreBtn.textContent = 'Показати ще';
        }
    }

    renderPagination(totalPages, totalItems);

    updateHistoryState();
}

function renderPagination(totalPages, totalItems) {
    const paginationDiv = document.getElementById('pagination') || createPaginationDiv();
    while (paginationDiv.firstChild) paginationDiv.removeChild(paginationDiv.firstChild);

    const paginationContainer = document.createElement('div');
    paginationContainer.className = 'pagination-container';

    const showMoreBtn = document.createElement('button');
    showMoreBtn.textContent = 'Показати ще';
    showMoreBtn.className = 'show-more-btn';
    showMoreBtn.onclick = loadMoreProducts;

    const productGrid = document.querySelector('.product-grid');
    const displayedCount = productGrid ? productGrid.children.length : 0;
    if (displayedCount >= totalItems) {
        showMoreBtn.disabled = true;
        showMoreBtn.textContent = 'Більше немає товарів';
    }
    paginationContainer.appendChild(showMoreBtn);

    const paginationInnerDiv = document.createElement('div');
    paginationInnerDiv.className = 'pagination';

    const prevButton = document.createElement('button');
    prevButton.textContent = '←';
    prevButton.className = 'pagination-btn pagination-arrow';
    prevButton.disabled = currentPage === 1;
    prevButton.onclick = () => {
        if (currentPage > 1) {
            currentPage--;
            const productGrid = document.querySelector('.product-grid');
            if (productGrid) {
                while (productGrid.firstChild) productGrid.removeChild(productGrid.firstChild);
            }
            const start = (currentPage - 1) * perPage;
            const end = start + perPage;
            const productsToShow = (isSearchActive ? searchResults : filteredProducts).slice(start, end);
            productsToShow.forEach(product => {
                const productElement = createProductElement(product);
                productGrid.appendChild(productElement);
            });
            updateHistoryState();
            renderPagination(totalPages, totalItems);
        }
    };
    paginationInnerDiv.appendChild(prevButton);

    for (let i = 1; i <= totalPages; i++) {
        const pageButton = document.createElement('button');
        pageButton.textContent = i;
        pageButton.className = 'pagination-btn' + (currentPage === i ? ' active' : '');
        pageButton.onclick = () => {
            currentPage = i;
            const productGrid = document.querySelector('.product-grid');
            if (productGrid) {
                while (productGrid.firstChild) productGrid.removeChild(productGrid.firstChild);
            }
            const start = (currentPage - 1) * perPage;
            const end = start + perPage;
            const productsToShow = (isSearchActive ? searchResults : filteredProducts).slice(start, end);
            productsToShow.forEach(product => {
                const productElement = createProductElement(product);
                productGrid.appendChild(productElement);
            });
            updateHistoryState();
            renderPagination(totalPages, totalItems);
            const showMoreBtn = document.querySelector('.show-more-btn');
            if (showMoreBtn) {
                if (end >= totalItems) {
                    showMoreBtn.disabled = true;
                    showMoreBtn.textContent = 'Більше немає товарів';
                } else {
                    showMoreBtn.disabled = false;
                    showMoreBtn.textContent = 'Показати ще';
                }
            }
        };
        paginationInnerDiv.appendChild(pageButton);
    }

    const nextButton = document.createElement('button');
    nextButton.textContent = '→';
    nextButton.className = 'pagination-btn pagination-arrow';
    nextButton.disabled = currentPage === totalPages;
    nextButton.onclick = () => {
        if (currentPage < totalPages) {
            currentPage++;
            const productGrid = document.querySelector('.product-grid');
            if (productGrid) {
                while (productGrid.firstChild) productGrid.removeChild(productGrid.firstChild);
            }
            const start = (currentPage - 1) * perPage;
            const end = start + perPage;
            const productsToShow = (isSearchActive ? searchResults : filteredProducts).slice(start, end);
            productsToShow.forEach(product => {
                const productElement = createProductElement(product);
                productGrid.appendChild(productElement);
            });
            updateHistoryState();
            renderPagination(totalPages, totalItems);
        }
    };
    paginationInnerDiv.appendChild(nextButton);

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
        console.warn('Created new product-div element');
    }

    if (!currentProduct) {
        console.error('currentProduct is missing');
        if (typeof showNotification === 'function' && typeof showSection === 'function') {
            showNotification('Товар не знайдено!', 'error');
            showSection('home');
        } else {
            console.error('showNotification or showSection function is not defined');
        }
        return Promise.resolve();
    }

    console.log('Rendering product details for:', currentProduct.name, 'Slug:', currentProduct.slug, 'ID:', currentProduct._id);

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
            thumbImg.onclick = typeof openGalleryiamasGallery === 'function' ? () => {
                mainImg.src = photo;
                openGallery(product.slug, index);
            } : null;
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
            // Шукаємо мінімальну акційну ціну серед розмірів
            const saleSizes = product.sizes.filter(s => s.salePrice && s.salePrice < s.price);
            const minSale = saleSizes.length > 0 ? Math.min(...saleSizes.map(s => s.salePrice)) : null;
            const minPrice = Math.min(...product.sizes.map(s => s.price));
            if (minSale !== null && minSale < minPrice) {
                const regularSpan = document.createElement('s');
                regularSpan.className = 'regular-price';
                regularSpan.textContent = `${minPrice} грн`;
                priceDiv.appendChild(regularSpan);
                const saleSpan = document.createElement('span');
                saleSpan.className = 'sale-price';
                saleSpan.textContent = `${minSale} грн`;
                priceDiv.appendChild(saleSpan);
            } else {
                const regularSpan = document.createElement('span');
                regularSpan.className = 'regular-price';
                regularSpan.textContent = `${minPrice} грн`;
                priceDiv.appendChild(regularSpan);
            }
        } else if (product.type === 'group' && product.groupProducts?.length > 0) {
            const groupPriceDiv = document.createElement('div');
            groupPriceDiv.className = 'group-total-price';
            groupPriceDiv.innerHTML = `Загальна ціна: <span style="white-space: nowrap;">0 грн</span>`;
            rightDiv.appendChild(groupPriceDiv);
        } else {
            if (isOnSale) {
                const regularSpan = document.createElement('s');
                regularSpan.className = 'regular-price';
                regularSpan.textContent = `${product.price} грн`;
                priceDiv.appendChild(regularSpan);
                const saleSpan = document.createElement('span');
                saleSpan.className = 'sale-price';
                saleSpan.textContent = `${initialPrice} грн`;
                priceDiv.appendChild(saleSpan);
            } else {
                const regularSpan = document.createElement('span');
                regularSpan.className = 'regular-price';
                regularSpan.textContent = `${initialPrice} грн`;
                priceDiv.appendChild(regularSpan);
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
            const sizeSelect = document.createElement('select');
            sizeSelect.id = `mattress-size-${product._id}`;
            sizeSelect.className = 'custom-select';
            product.sizes.forEach(size => {
                const option = document.createElement('option');
                option.value = size.name;
                option.textContent = `${size.name} — ${size.price} грн${size.salePrice && size.salePrice < size.price ? ` (акція: ${size.salePrice} грн)` : ''}`;
                option.setAttribute('data-price', size.price);
                if (size.salePrice && size.salePrice < size.price) {
                    option.setAttribute('data-sale-price', size.salePrice);
                }
                sizeSelect.appendChild(option);
            });
            sizeSelect.onchange = typeof updateMattressPrice === 'function' ? () => updateMattressPrice(product._id) : null;
            sizeDiv.appendChild(sizeSelect);
            rightDiv.appendChild(sizeDiv);
            selectedMattressSizes[product._id] = sizeSelect.value;
            saveToStorage('selectedMattressSizes', selectedMattressSizes);
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

        const buyBtn = document.createElement('button');
        buyBtn.className = 'buy-btn';
        buyBtn.textContent = 'Додати в кошик';
        buyBtn.onclick = typeof addToCartWithColor === 'function' ? () => addToCartWithColor(product._id) : null;
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
                    circle.onclick = typeof selectColor === 'function' ? () => selectColor(product._id, i) : null;
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
                colorSelect.onchange = typeof updateColorPrice === 'function' ? () => updateColorPrice(product._id) : null;
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
            product.groupProducts.forEach(id => {
                const p = products.find(p => p._id === id);
                if (!p) {
                    console.warn(`Груповий товар з ID ${id} не знайдено`);
                    return;
                }
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

                const dimensions = [];
                if (p.widthCm) dimensions.push(p.widthCm);
                if (p.heightCm) dimensions.push(p.heightCm);
                if (p.depthCm) dimensions.push(p.depthCm);
                if (p.lengthCm) dimensions.push(p.lengthCm);
                if (dimensions.length > 0) {
                    const dimensionsDiv = document.createElement('div');
                    dimensionsDiv.className = 'dimensions';

                    const valuesSpan = document.createElement('span');
                    valuesSpan.className = 'dimension-values';
                    for (let i = 0; i < dimensions.length; i++) {
                        const formattedValue = Number.isInteger(dimensions[i]) ? dimensions[i] : dimensions[i].toFixed(1).replace('.', ',');
                        valuesSpan.appendChild(document.createTextNode(`${formattedValue} см`));
                        if (i < dimensions.length - 1) {
                            valuesSpan.appendChild(document.createTextNode(' × '));
                        }
                    }
                    dimensionsDiv.appendChild(valuesSpan);

                    const labelsDiv = document.createElement('div');
                    labelsDiv.className = 'dimension-labels';
                    const labels = ['Шир.', 'Вис.', 'Гл.', 'Дов.'];
                    dimensions.forEach((_, i) => {
                        const labelSpan = document.createElement('span');
                        labelSpan.className = 'dimension-label';
                        labelSpan.textContent = labels[i];
                        labelsDiv.appendChild(labelSpan);
                    });
                    dimensionsDiv.appendChild(labelsDiv);

                    itemDiv.appendChild(dimensionsDiv);
                }

                const priceDiv = document.createElement('div');
                priceDiv.className = 'price';
                const isOnSaleP = p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date());
                if (isOnSaleP) {
                    const regularSpan = document.createElement('s');
                    regularSpan.className = 'regular-price';
                    regularSpan.textContent = `${p.price} грн`;
                    priceDiv.appendChild(regularSpan);
                    const saleSpan = document.createElement('span');
                    saleSpan.className = 'sale-price';
                    saleSpan.textContent = `${p.salePrice} грн`;
                    priceDiv.appendChild(saleSpan);
                } else {
                    const regularSpan = document.createElement('span');
                    regularSpan.className = 'regular-price';
                    regularSpan.textContent = `${p.price} грн`;
                    priceDiv.appendChild(regularSpan);
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
            document.getElementById(`mattress-size-${product._id}`).value = selectedMattressSizes[product._id];
            if (typeof updateMattressPrice === 'function') {
                await updateMattressPrice(product._id);
            }
        }
        if (product.colors?.length >= 1 && selectedColors[product._id] !== undefined) {
            if (product.colors.some(c => c.photo)) {
                document.querySelector(`#color-options-${product._id} .color-circle[data-index="${selectedColors[product._id]}"]`)?.classList.add('selected');
            } else {
                document.getElementById(`color-select-${product._id}`).value = selectedColors[product._id];
                if (typeof updateColorPrice === 'function') {
                    await updateColorPrice(product._id);
                }
            }
        }
        if (typeof renderBreadcrumbs === 'function') {
            await renderBreadcrumbs();
        }

        return Promise.resolve();
    } catch (error) {
        console.error('Помилка в renderProductDetails:', error.message, error.stack);
        if (typeof showNotification === 'function' && typeof showSection === 'function') {
            showNotification('Помилка при відображенні товару!', 'error');
            showSection('home');
        }
        return Promise.resolve();
    }
}

function sanitizeHTML(html) {
    // Декодуємо HTML-сутності
    const textarea = document.createElement('textarea');
    textarea.innerHTML = html;
    const decodedHTML = textarea.value;

    const allowedTags = ['p', 'br', 'strong', 'em', 'ul', 'li', 'img'];
    const allowedAttributes = {
        img: ['src', 'alt', 'width', 'height', 'class']
    };
    
    const div = document.createElement('div');
    div.innerHTML = decodedHTML;
    
    function cleanElement(element) {
        if (element.nodeType !== Node.ELEMENT_NODE) return;
        
        const tagName = element.tagName.toLowerCase();
        if (!allowedTags.includes(tagName)) {
            element.replaceWith(...element.childNodes);
            return;
        }
        
        const allowedAttrs = allowedAttributes[tagName] || [];
        Array.from(element.attributes).forEach(attr => {
            if (!allowedAttrs.includes(attr.name)) {
                element.removeAttribute(attr.name);
            } else if (attr.name === 'src' && tagName === 'img') {
                const src = attr.value;
                if (!src.startsWith('http://') && !src.startsWith('https://') && !src.startsWith('/')) {
                    element.removeAttribute('src');
                }
            }
        });
        
        Array.from(element.children).forEach(cleanElement);
    }
    
    Array.from(div.children).forEach(cleanElement);
    return div; // Повертаємо DOM-елемент замість HTML-рядка
}

function formatNumber(value) {
    if (typeof value === 'number') {
        return value.toLocaleString('uk-UA', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(',', ',');
    }
    return value.toString();
}

function changeGroupQuantity(groupProductId, productId, change) {
    const qtyInput = document.getElementById(`group-quantity-${groupProductId}-${productId}`);
    if (qtyInput) {
        let qty = parseInt(qtyInput.value) + change;
        if (qty < 0) qty = 0;
        qtyInput.value = qty;
        updateGroupSelectionWithQuantity(groupProductId);
        updateFloatingGroupCart(); // Додаємо виклик для оновлення плаваючої кнопки
    }
}

function updateGroupSelectionWithQuantity(productId) {
    const product = products.find(p => p._id === productId);
    if (!product || product.type !== 'group') {
        console.warn('Товар не є груповим або не знайдено:', productId);
        return;
    }

    let totalPrice = 0;
    const selectedItems = {};

    product.groupProducts.forEach(id => {
        const qtyInput = document.getElementById(`group-quantity-${productId}-${id}`);
        if (qtyInput) {
            const quantity = parseInt(qtyInput.value) || 0;
            if (quantity > 0) {
                const p = products.find(p => p._id === id);
                if (p) {
                    const isOnSale = p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date());
                    let price = isOnSale ? parseFloat(p.salePrice) : parseFloat(p.price || 0);

                    // Враховуємо колір
                    if (p.colors?.length > 0 && selectedColors[id] !== undefined) {
                        const colorIndex = parseInt(selectedColors[id]);
                        if (p.colors[colorIndex]) {
                            price += parseFloat(p.colors[colorIndex].priceChange || 0);
                        }
                    }

                    // Враховуємо розмір для матраців
                    if (p.type === 'mattresses' && selectedMattressSizes[id]) {
                        const sizeInfo = p.sizes?.find(s => s.name === selectedMattressSizes[id]);
                        if (sizeInfo) {
                            price = parseFloat(sizeInfo.price || price);
                        }
                    }

                    totalPrice += price * quantity;
                    selectedItems[id] = quantity;
                }
            }
        }
    });

    const priceDiv = document.querySelector('.group-total-price');
    if (priceDiv) {
        priceDiv.innerHTML = `Загальна ціна: <span style="white-space: nowrap;">${totalPrice} грн</span>`;
    }

    const floatingPrice = document.querySelector('.floating-group-price');
    if (floatingPrice) {
        floatingPrice.innerHTML = `Загальна ціна: <span style="white-space: nowrap;">${totalPrice} грн</span>`;
    }

    saveToStorage(`groupSelection_${productId}`, selectedItems);
    updateFloatingGroupCart(); // Додаємо виклик для синхронізації
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
    productElement.appendChild(imgLink);

    const h3Link = document.createElement('a');
    h3Link.href = `/${transliterate(product.category.replace('ь', ''))}${product.subcategory ? `/${transliterate(product.subcategory.replace('ь', ''))}` : ''}/${product.slug}`;
    h3Link.onclick = (e) => {
        e.preventDefault();
        openProduct(product.slug);
    };
    const h3 = document.createElement('h3');
    h3.textContent = product.name;
    h3Link.appendChild(h3);
    productElement.appendChild(h3Link);

    const priceDiv = document.createElement('div');
    priceDiv.className = 'price';
    const isOnSale = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date());

    if (product.type === 'mattresses' && product.sizes?.length > 0) {
        // Шукаємо мінімальну акційну ціну серед розмірів
        const saleSizes = product.sizes.filter(s => s.salePrice && s.salePrice < s.price);
        const minSale = saleSizes.length > 0 ? Math.min(...saleSizes.map(s => s.salePrice)) : null;
        const minPrice = Math.min(...product.sizes.map(s => s.price));
        if (minSale !== null && minSale < minPrice) {
            const regularSpan = document.createElement('s');
            regularSpan.className = 'regular-price';
            regularSpan.textContent = `${minPrice} грн`;
            priceDiv.appendChild(regularSpan);
            const saleSpan = document.createElement('span');
            saleSpan.className = 'sale-price';
            saleSpan.textContent = `${minSale} грн`;
            priceDiv.appendChild(saleSpan);
        } else {
            const regularSpan = document.createElement('span');
            regularSpan.className = 'regular-price';
            regularSpan.textContent = `${minPrice} грн`;
            priceDiv.appendChild(regularSpan);
        }
    } else if (product.type === 'group' && product.groupProducts?.length > 0) {
        const groupPrices = product.groupProducts.map(id => {
            const p = products.find(p => p._id === id);
            return p ? (p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date()) ? p.salePrice : p.price) : Infinity;
        });
        const minPrice = Math.min(...groupPrices);
        const regularSpan = document.createElement('span');
        regularSpan.className = 'regular-price';
        regularSpan.textContent = `${minPrice} грн`;
        priceDiv.appendChild(regularSpan);
    } else {
        if (isOnSale) {
            const regularSpan = document.createElement('s');
            regularSpan.className = 'regular-price';
            regularSpan.textContent = `${product.price} грн`;
            priceDiv.appendChild(regularSpan);
            const saleSpan = document.createElement('span');
            saleSpan.className = 'sale-price';
            saleSpan.textContent = `${product.salePrice} грн`;
            priceDiv.appendChild(saleSpan);
        } else {
            const regularSpan = document.createElement('span');
            regularSpan.className = 'regular-price';
            regularSpan.textContent = `${product.price} грн`;
            priceDiv.appendChild(regularSpan);
        }
    }

    // Додаємо іконку кошика лише для простих товарів (не матраци і не групові)
    if (product.type !== 'mattresses' && product.type !== 'group') {
        const cartIcon = document.createElement('div');
        cartIcon.className = 'cart-icon';
        cartIcon.onclick = async (e) => {
            e.preventDefault();
            if (product.colors?.length > 1) {
                openProduct(product.slug);
                showNotification('Виберіть потрібний колір', 'error');
                return;
            }
            await addToCartWithColor(product._id);
            cartIcon.classList.add('added');
            setTimeout(() => cartIcon.classList.remove('added'), 2000);
        };
        priceDiv.appendChild(cartIcon);
    }

    productElement.appendChild(priceDiv);

    if (isOnSale && product.saleEnd) {
        const timerDiv = document.createElement('div');
        timerDiv.className = 'sale-timer';
        timerDiv.id = `timer-${product._id}`;
        productElement.appendChild(timerDiv);
        updateSaleTimer(product._id, product.saleEnd);
    }

    return productElement;
}

function updateSaleTimer(productId, saleEnd) {
    const timerElement = document.getElementById(`timer-${productId}`);
    if (!timerElement || !saleEnd) return; // Якщо немає дати закінчення, акція безкінечна
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
    const basePrice = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date()) ? product.salePrice : product.price || 0;
    const newPrice = basePrice + (product.colors[index].priceChange || 0);
    const isOnSale = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date());
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
    const basePrice = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date()) ? product.salePrice : product.price || 0;
    const newPrice = basePrice + (product.colors[index].priceChange || 0);
    const isOnSale = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date());
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
        const selectedOption = select.options[select.selectedIndex];
        const price = selectedOption.getAttribute('data-price');
        const salePrice = selectedOption.getAttribute('data-sale-price');
        while (priceElement.firstChild) priceElement.removeChild(priceElement.firstChild);
        if (salePrice && !isNaN(salePrice) && parseFloat(salePrice) > 0 && parseFloat(salePrice) < parseFloat(price)) {
            const regularSpan = document.createElement('s');
            regularSpan.className = 'regular-price';
            regularSpan.textContent = `${price} грн`;
            priceElement.appendChild(regularSpan);
            const saleSpan = document.createElement('span');
            saleSpan.className = 'sale-price';
            saleSpan.textContent = `${salePrice} грн`;
            priceElement.appendChild(saleSpan);
        } else {
            const regularSpan = document.createElement('span');
            regularSpan.className = 'regular-price';
            regularSpan.textContent = `${price} грн`;
            priceElement.appendChild(regularSpan);
        }
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
            const price = p.salePrice && (p.saleEnd === null || new Date(p.saleEnd) > new Date()) ? p.salePrice : p.price || 0;
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
        console.error('Некоректний ID продукту:', product);
        showNotification('Помилка: товар має некоректний числовий ідентифікатор!', 'error');
        return;
    }
    if (product.colors?.length > 1 && selectedColors[productId] === undefined && product.type !== 'mattresses') {
        showNotification('Будь ласка, виберіть колір!', 'error');
        return;
    }

    let price = parseFloat(product.price || 0);
    let colorData = null;
    let sizeData = null;

    if (product.type !== 'mattresses' && product.colors?.length > 0) {
        const colorIndex = selectedColors[productId] !== undefined ? parseInt(selectedColors[productId]) : 0;
        if (!product.colors[colorIndex]) {
            showNotification('Обраний колір більше недоступний!', 'error');
            delete selectedColors[productId];
            saveToStorage('selectedColors', selectedColors);
            return;
        }
        colorData = {
            name: product.colors[colorIndex].name || 'Не вказано',
            value: product.colors[colorIndex].value || product.colors[colorIndex].name || '',
            priceChange: parseFloat(product.colors[colorIndex].priceChange || 0),
            photo: product.colors[colorIndex].photo || ''
        };
        price = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date()) ? parseFloat(product.salePrice) : parseFloat(product.price || 0);
        price += parseFloat(colorData.priceChange);
        console.log(`Колір для товару ${product.name}: ${colorData.name}`);
    }

    if (product.type === 'mattresses') {
        const select = document.getElementById(`mattress-size-${productId}`);
        if (!select || !selectedMattressSizes[productId]) {
            showNotification('Будь ласка, виберіть розмір!', 'error');
            return;
        }
        const size = selectedMattressSizes[productId];
        const sizeInfo = product.sizes?.find(s => s.name === size);
        if (!sizeInfo) {
            showNotification('Обраний розмір більше недоступний!', 'error');
            delete selectedMattressSizes[productId];
            saveToStorage('selectedMattressSizes', selectedMattressSizes);
            return;
        }
        price = parseFloat(sizeInfo.price || 0);
        if (isNaN(price) || price <= 0) {
            console.error(`Некоректна ціна для розміру ${size} товару ${product.name}: ${price}`);
            showNotification('Помилка: некоректна ціна для обраного розміру!', 'error');
            return;
        }
        sizeData = size;
    }

    const qtyInput = document.getElementById(`quantity-${productId}`);
    const quantity = qtyInput ? parseInt(qtyInput.value) || 1 : 1;

    const normalizedColorName = colorData ? colorData.name.toLowerCase().replace(/\s+/g, '-') : 'no-color';
    const normalizedSize = sizeData ? sizeData.toLowerCase().replace(/\s+/g, '-') : 'no-size';
    const cartItemKey = `${product.id}_${normalizedColorName}_${normalizedSize}`;

    const cartItem = {
        id: product.id,
        cartItemKey: cartItemKey,
        name: product.name || 'Без імені',
        quantity: quantity,
        price: price,
        photo: product.photos?.[0] || NO_IMAGE_URL,
        color: colorData,
        size: sizeData,
        brand: product.brand || 'Не вказано'
    };

    if (!cartItem.id || !cartItem.name || !cartItem.quantity || !cartItem.price || isNaN(cartItem.price)) {
        console.error('Некоректний елемент кошика:', cartItem);
        showNotification('Помилка: некоректні дані товару!', 'error');
        return;
    }

    const existingItemIndex = cart.findIndex(item => {
        const itemColorName = item.color ? item.color.name.toLowerCase().replace(/\s+/g, '-') : 'no-color';
        const itemSize = item.size ? item.size.toLowerCase().replace(/\s+/g, '-') : 'no-size';
        return `${item.id}_${itemColorName}_${itemSize}` === cartItemKey;
    });

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
    if (!product || product.type !== 'group') {
        console.error('Помилка: груповий товар не знайдено або не є груповим:', productId);
        showNotification('Помилка: груповий товар не знайдено!', 'error');
        return;
    }

    const selectedItems = loadFromStorage(`groupSelection_${productId}`, {});
    const selectedCount = Object.values(selectedItems).reduce((sum, qty) => sum + (parseInt(qty) || 0), 0);

    if (selectedCount === 0) {
        console.warn('Не вибрано жодного товару для додавання до кошика');
        showNotification('Будь ласка, виберіть хоча б один товар!', 'error');
        return;
    }

    let cart = loadFromStorage('cart', []);

    // Перевірка валідності вибраних товарів
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

        // Перевірка кольору, якщо товар має кольори
        if (p.colors?.length > 0 && selectedColors[p._id] !== undefined) {
            const colorIndex = parseInt(selectedColors[p._id]);
            if (p.colors[colorIndex]) {
                selectedColor = {
                    name: p.colors[colorIndex].name || 'Не вказано',
                    value: p.colors[colorIndex].value || p.colors[colorIndex].name || '',
                    priceChange: parseFloat(p.colors[colorIndex].priceChange || 0),
                    photo: p.colors[colorIndex].photo || null
                };
                price += selectedColor.priceChange;
            } else {
                console.warn(`Колір ${selectedColors[p._id]} недоступний для товару ${p.name}`);
                invalidItems.push(p.name);
                continue;
            }
        }

        // Перевірка розміру, якщо товар є матрацом
        if (p.type === 'mattresses' && selectedMattressSizes[p._id]) {
            selectedSize = selectedMattressSizes[p._id];
            const sizeInfo = p.sizes?.find(s => s.name === selectedSize);
            if (sizeInfo) {
                price = parseFloat(sizeInfo.price || price);
            } else {
                console.warn(`Розмір ${selectedSize} недоступний для товару ${p.name}`);
                invalidItems.push(p.name);
                continue;
            }
        }

        // Формуємо унікальний ключ для кошика
        const normalizedColorName = selectedColor ? selectedColor.name.toLowerCase().replace(/\s+/g, '-') : 'no-color';
        const normalizedSize = selectedSize ? selectedSize.toLowerCase().replace(/\s+/g, '-') : 'no-size';
        const cartItemId = `${p.id}_${normalizedColorName}_${normalizedSize}`;

        const cartItem = {
            id: p.id, // Використовуємо числовий id
            cartItemKey: cartItemId,
            productId: p._id, // Зберігаємо _id для посилань
            name: p.name,
            price: parseFloat(price),
            quantity: qty,
            photo: p.photos?.[0] || NO_IMAGE_URL,
            color: selectedColor,
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
        showNotification(`Не вдалося додати товари: ${invalidItems.join(', ')}`, 'error');
        return;
    }

    if (cartItemsToAdd.length === 0) {
        console.warn('Немає валідних товарів для додавання до кошика');
        showNotification('Не вибрано валідних товарів для додавання!', 'error');
        return;
    }

    // Додаємо товари до кошика
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

        // Скидаємо вибір групових товарів
        saveToStorage(`groupSelection_${productId}`, {});
        
        // Скидаємо значення кількості в інтерфейсі
        product.groupProducts.forEach(id => {
            const qtyInput = document.getElementById(`group-quantity-${productId}-${id}`);
            if (qtyInput) {
                qtyInput.value = '0';
            }
        });

        // Оновлюємо ціну та плаваючу кнопку
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
        // Оновлюємо локальний кеш
        products = products.filter(p => p._id !== product._id);
        products.push(product);
        saveToStorage('products', products);
        return product;
    } catch (error) {
        console.error('Помилка отримання продукту за slug:', slug, 'Помилка:', error.message);
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

    const catSlug = transliterate(currentCategory.replace('ь', ''));
    const subCatSlug = currentSubcategory ? transliterate(currentSubcategory.replace('ь', '')) : '';
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
        searchResults: searchResults.map(p => p._id)
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
    cart.forEach(item => {
        const product = products.find(p => p.id === item.id);
        if (!product) return;

        let price = product.price || 0;
        const isOnSale = product.salePrice && (product.saleEnd === null || new Date(product.saleEnd) > new Date());

        if (product.type === 'mattresses' && item.size) {
            const sizeInfo = product.sizes?.find(s => s.name === item.size);
            if (sizeInfo) {
                price = sizeInfo.price || price;
            }
        } else if (item.color && item.color.priceChange) {
            price = (isOnSale ? product.salePrice : product.price) + (item.color.priceChange || 0);
        } else {
            price = isOnSale ? product.salePrice : product.price;
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
        showNotification('Помилка відображення кошика!', 'error');
        return;
    }

    if (!products || products.length === 0) {
        console.warn('Масив products порожній, перевірте WebSocket або локальні дані');
        showNotification('Список товарів порожній!', 'warning');
        return;
    }

    console.log('Поточний масив products:', products);
    console.log('Поточний масив cart перед фільтрацією:', JSON.parse(JSON.stringify(cart)));

    const initialCartLength = cart.length;
    cart = cart.filter(item => {
        const product = products.find(p => p.id === item.id);
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

        const product = products.find(p => p.id === item.id);
        let isAvailable = true;
        if (product && product.type === 'mattresses' && item.size) {
            const sizeInfo = product.sizes?.find(s => s.name === item.size);
            isAvailable = !!sizeInfo;
            console.log(`Перевірка розміру для товару ${item.name}: розмір ${item.size}, доступний: ${isAvailable}, поточні розміри:`, product.sizes?.map(s => s.name) || []);
        } else if (item.color && item.color.name && product && product.colors) {
            const itemColorName = item.color.name.toLowerCase().trim();
            isAvailable = product.colors.some(color => color.name?.toLowerCase().trim() === itemColorName);
            console.log(`Перевірка кольору для товару ${item.name}: колір ${itemColorName}, доступний: ${isAvailable}, поточні кольори:`, product.colors.map(c => c.name));
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
        span.textContent = `${item.name}${item.color && item.color.name && product?.type !== 'mattresses' ? ` (${item.color.name})` : ''}${item.size ? ` (${item.size})` : ''} - ${item.price * item.quantity} грн`;
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
        if (!item.id || typeof item.id !== 'number' || !item.name || typeof item.quantity !== 'number' || typeof item.price !== 'number' || isNaN(item.price)) {
            console.warn(`Некоректний елемент кошика: ${JSON.stringify(item)}`);
            unavailableItems.push(item);
            return;
        }
        const product = products.find(p => p.id === item.id);
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
            showNotification('Усі товари в кошику недоступні або мають некоректні дані та були видалені. Додайте нові товари.', 'error');
            debouncedRenderCart();
            return;
        }

        showNotification('Деякі товари в кошику недоступні або мають некоректні дані та були видалені. Перевірте кошик перед оформленням замовлення.', 'warning');
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
            const product = products.find(p => p.id === item.id);
            let colorData = null;
            if (item.color && item.color.name) {
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
                id: Number(item.id),
                name: itemName,
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
        const isValid = item && typeof item.id === 'number' && item.name && typeof item.quantity === 'number' && typeof item.price === 'number' && !isNaN(item.price);
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
            thumbImg.onclick = () => {
                currentGalleryIndex = i;
                img.src = currentGalleryImages[currentGalleryIndex];
                updateThumbnails();
            };
            thumbnails.appendChild(thumbImg);
        });

        modal.style.display = 'flex';
        modal.classList.add('active');
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
            showSection('cart');
        } else if (parts[0] === 'contacts') {
            showSection('contacts');
        } else if (parts[0] === 'about') {
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
        } else if (parts[0] === 'catalog') {
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
                console.log('history.pushState виконано для каталогу:', state);
            }
        } else {
            const cat = categories.find(c => transliterate(c.name.replace('ь', '')) === parts[0]);
            if (cat) {
                currentCategory = cat.name;
                currentSubcategory = null;
                currentProduct = null;
                isSearchActive = false;

                if (parts.length >= 2) {
                    let productSlug = parts[parts.length - 1];
                    let subCatSlug = parts.length >= 3 ? parts[1] : null;

                    const subCat = cat.subcategories?.find(sc => transliterate(sc.name.replace('ь', '')) === subCatSlug || sc.slug === subCatSlug);
                    if (subCat) {
                        currentSubcategory = subCat.name;
                    } else if (parts.length === 2) {
                        subCatSlug = null;
                    }

                    if ((parts.length === 2 && !subCat) || parts.length === 3) {
                        console.log('Спроба знайти продукт за slug:', productSlug);
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
                            if (!isPopstate) {
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
                            }
                            return;
                        } else {
                            console.error('Продукт не знайдено для slug:', productSlug);
                            showNotification('Товар не знайдено!', 'error');
                            showSection('home');
                            return;
                        }
                    }
                }

                console.log('Відображаємо каталог для категорії:', currentCategory, 'підкатегорії:', currentSubcategory);
                showSection('catalog');
                if (Object.keys(savedFilters).length > 0) {
                    applySavedFilters(savedFilters);
                }
                if (currentSort) {
                    sortProducts(currentSort);
                }
                if (!isPopstate) {
                    const state = {
                        sectionId: 'catalog',
                        path: `/${parts[0]}${currentSubcategory ? `/${transliterate(currentSubcategory.replace('ь', ''))}` : ''}`,
                        stateId: `catalog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        currentPage: 1,
                        currentCategory: currentCategory,
                        currentSubcategory: currentSubcategory,
                        isSearchActive: false,
                        searchQuery: '',
                        activeFilters: savedFilters,
                        currentSort: currentSort
                    };
                    history.pushState(state, '', `/${parts[0]}${currentSubcategory ? `/${transliterate(currentSubcategory.replace('ь', ''))}` : ''}`);
                    console.log('history.pushState виконано для каталогу:', state);
                }
            } else {
                console.error('Категорія не знайдена для slug:', parts[0]);
                showNotification('Сторінку не знайдено!', 'error');
                showSection('home');
            }
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
        showNotification('Помилка завантаження сторінки!', 'error');
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

            window.addEventListener('scroll', () => {
                const headerHeight = header.offsetHeight;
                if (window.scrollY > headerHeight) {
                    burgerMenu.classList.add('visible');
                    floatingCart.classList.add('visible');
                } else {
                    burgerMenu.classList.remove('visible');
                    burgerMenu.classList.remove('active');
                    burgerContent.classList.remove('active');
                    burgerCatalogDropdown.classList.remove('active');
                    floatingCart.classList.remove('visible');
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
                    categoryItem.innerHTML = `
                        <a href="#" onclick="currentCategory='${category.name}'; currentSubcategory=null; showSection('catalog'); return false;">${category.name}</a>
                        <div class="burger-subcategory">
                            ${(category.subcategories || []).map(sub => `
                                <a href="#" onclick="currentCategory='${category.name}'; currentSubcategory='${sub.name}'; showSection('catalog'); return false;">${sub.name}</a>
                            `).join('')}
                        </div>
                    `;
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

        // Обробка початкового шляху
        const path = window.location.pathname.slice(1) || '';
        console.log('Обробка початкового шляху:', path);
        const parts = path.split('/').filter(p => p);

        if (parts[0] === 'catalog' && parts[1] === 'search') {
            const query = parts[2] ? transliterate(parts[2], true) : loadFromStorage('searchQuery', '');
            isSearchActive = loadFromStorage('isSearchActive', false);
            const searchResultIds = loadFromStorage('searchResults', []);
            searchResults = searchResultIds
                .map(id => products.find(p => p._id === id))
                .filter(p => p);
            baseSearchResults = [...searchResults];

            if (query) {
                console.log('DOMContentLoaded: Відновлюємо пошук за запитом:', query);
                searchQuery = query;
                saveToStorage('searchQuery', query);
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
                console.log('DOMContentLoaded: history.replaceState виконано для пошуку:', state);
            } else {
                console.warn('DOMContentLoaded: Запит пошуку відсутній, показуємо каталог');
                showSection('catalog');
            }
        } else if (parts.length >= 2) {
            const slug = parts[parts.length - 1];
            const subCatSlug = parts.length >= 3 ? parts[parts.length - 2] : null;
            const catSlug = parts[0];
            console.log('DOMContentLoaded: Обробка шляху, slug:', slug, 'catSlug:', catSlug, 'subCatSlug:', subCatSlug);

            const category = categories.find(c => transliterate(c.name.replace('ь', '')) === catSlug);
            
            if (category) {
                const subcategory = category.subcategories?.find(sub => 
                    sub.slug === slug || transliterate(sub.name.replace('ь', '')) === slug
                );

                if (subcategory) {
                    currentCategory = category.name;
                    currentSubcategory = subcategory.name;
                    console.log('DOMContentLoaded: Знайдено підкатегорію:', currentSubcategory);
                    renderCatalog(currentCategory, currentSubcategory);
                    showSection('catalog');
                    const newPath = `/${catSlug}/${slug}`;
                    const state = {
                        sectionId: 'catalog',
                        path: newPath,
                        stateId: `catalog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        currentPage: 1,
                        currentCategory: currentCategory,
                        currentSubcategory: currentSubcategory,
                        isSearchActive: false,
                        searchQuery: ''
                    };
                    history.replaceState(state, '', newPath);
                    console.log('DOMContentLoaded: history.replaceState виконано для каталогу:', state);
                } else {
                    // Спроба знайти продукт
                    let product = products.find(p => p.slug === slug);
                    if (!product) {
                        product = await fetchProductBySlug(slug);
                    }
                    if (product) {
                        currentProduct = product;
                        currentCategory = product.category;
                        currentSubcategory = product.subcategory || null;
                        const newPath = `/${catSlug}${subCatSlug ? `/${subCatSlug}` : ''}/${slug}`;
                        const state = {
                            sectionId: 'product-details',
                            path: newPath,
                            stateId: `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            currentPage: 1,
                            currentCategory: currentCategory,
                            currentSubcategory: currentSubcategory,
                            isSearchActive: false,
                            searchQuery: '',
                            productId: product._id
                        };
                        history.replaceState(state, '', newPath);
                        console.log('DOMContentLoaded: history.replaceState виконано:', state);
                        console.log('DOMContentLoaded: Відображаємо product-details для продукту:', product.name);
                        showSection('product-details');
                    } else {
                        console.error('DOMContentLoaded: Продукт не знайдено для slug:', slug);
                        showNotification('Товар не знайдено!', 'error');
                        showSection('home');
                    }
                }
            } else {
                console.error('DOMContentLoaded: Категорія не знайдена для catSlug:', catSlug);
                showNotification('Категорія не знайдена!', 'error');
                showSection('home');
            }
        } else {
            console.log('DOMContentLoaded: Викликаємо handleNavigation для шляху:', path);
            await handleNavigation(path, false);
        }

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
        showNotification('Помилка ініціалізації сторінки!', 'error');
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
                        showMoreBtn.textContent = 'Більше немає товарів';
                    } else {
                        showMoreBtn.disabled = false;
                        showMoreBtn.textContent = 'Показати ще';
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
                    showNotification('Товар не знайдено!', 'error');
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
                const slug = parts[parts.length - 1];
                const subCatSlug = parts.length >= 3 ? parts[parts.length - 2] : null;
                const catSlug = parts[0];

                const category = categories.find(c => transliterate(c.name.replace('ь', '')) === catSlug);
                if (category) {
                    const subcategory = category.subcategories?.find(sub => 
                        sub.slug === slug || transliterate(sub.name.replace('ь', '')) === slug
                    );
                    if (subcategory) {
                        currentCategory = category.name;
                        currentSubcategory = subcategory.name;
                        console.log('popstate: Знайдено підкатегорію:', currentSubcategory);
                        renderCatalog(currentCategory, currentSubcategory);
                        showSection('catalog');
                        const state = {
                            sectionId: 'catalog',
                            path: `/${catSlug}/${slug}`,
                            stateId: `catalog_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            currentPage: 1,
                            currentCategory: currentCategory,
                            currentSubcategory: currentSubcategory,
                            isSearchActive: false,
                            searchQuery: ''
                        };
                        history.replaceState(state, '', `/${catSlug}/${slug}`);
                        console.log('popstate: history.replaceState виконано:', state);
                        return;
                    }
                }
                // Продовжити обробку як продукт
                if (slug && slug !== '[object Object]') {
                    console.log('popstate: Спроба знайти продукт за slug:', slug);
                    currentProduct = products.find(p => p.slug === slug) || await fetchProductBySlug(slug);
                    if (currentProduct) {
                        currentCategory = currentProduct.category;
                        currentSubcategory = currentProduct.subcategory || null;
                        console.log('popstate: Продукт знайдено:', currentProduct.name, 'Відображаємо product-details');
                        showSection('product-details');
                        const state = {
                            sectionId: 'product-details',
                            path: `/${catSlug}${subCatSlug ? `/${subCatSlug}` : ''}/${slug}`,
                            stateId: `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                            currentPage: 1,
                            currentCategory: currentCategory,
                            currentSubcategory: currentSubcategory,
                            isSearchActive: false,
                            searchQuery: '',
                            productId: currentProduct._id
                        };
                        history.replaceState(state, '', `/${catSlug}${subCatSlug ? `/${subCatSlug}` : ''}/${slug}`);
                        console.log('popstate: history.replaceState виконано:', state);
                        return;
                    } else {
                        console.error('popstate: Продукт не знайдено для slug:', slug);
                        showNotification('Товар не знайдено!', 'error');
                        showSection('home');
                        return;
                    }
                }
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