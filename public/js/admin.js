/* global LZString, Quill */

let session = { isActive: false, timestamp: 0 };
let products = [];
let categories = [];
let orders = [];
let slides = [];
let filters = [];
let orderFields = [];

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
let unsavedChanges = false;
let aboutEditor;
let productEditor;
let selectedMedia = null;
let socket;

/**
 * Validates a file based on its type and size.
 * @param {File|Blob} file - The file or blob to validate.
 * @param {string} [type='image'] - The type of file ('image' or 'video').
 * @returns {{ valid: boolean, error?: string }} - Validation result.
 */
function validateFile(file, type = 'image') {
    const maxSize = 5 * 1024 * 1024; // 5MB
    const allowedImageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const allowedVideoTypes = ['video/mp4', 'video/webm'];

    if (type === 'image' && !allowedImageTypes.includes(file.type)) {
        return { valid: false, error: `Дозволені лише формати JPEG, PNG, GIF, WebP!` };
    }

    if (type === 'video' && !allowedVideoTypes.includes(file.type)) {
        return { valid: false, error: `Дозволені лише формати MP4, WebM!` };
    }

    if (file.size > maxSize) {
        return { valid: false, error: `Розмір файлу не повинен перевищувати 5MB!` };
    }

    return { valid: true };
}

async function getCsrfToken() {
    try {
        const response = await fetch('/api/csrf-token', {
            method: 'GET',
            credentials: 'include'
        });
        if (!response.ok) {
            throw new Error(`Не вдалося отримати CSRF-токен: ${response.statusText}`);
        }
        const data = await response.json();
        return data.csrfToken;
    } catch (e) {
        console.error('Помилка отримання CSRF-токена:', e);
        showNotification('Не вдалося отримати CSRF-токен: ' + e.message);
        return null;
    }
}

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

        // Ініціалізація редакторів перед завантаженням даних
        initializeEditors();

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
            throw new Error(`Не вдалося завантажити налаштування: ${response.statusText}`);
        }

        const serverSettings = await response.json();
        settings = { ...settings, ...serverSettings, filters: serverSettings.filters || filters || [] };

        // Завантаження вмісту в редактор (перенесено в initializeEditors)
        renderSettingsAdmin();
        renderFilters();
    } catch (e) {
        console.error('Помилка завантаження налаштувань:', e);
        showNotification('Помилка завантаження налаштувань: ' + e.message);
        renderSettingsAdmin();
    }
}

async function fetchWithAuth(url, options = {}) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            throw new Error('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
        }

        const token = localStorage.getItem('adminToken');
        const csrfToken = await getCsrfToken();
        if (!csrfToken) {
            throw new Error('Не вдалося отримати CSRF-токен.');
        }

        // Налаштування заголовків
        const headers = new Headers({
            ...options.headers,
            'Authorization': `Bearer ${token}`,
            'X-CSRF-Token': csrfToken
        });

        // Якщо це FormData, не встановлюємо Content-Type (браузер зробить це автоматично)
        if (!(options.body instanceof FormData)) {
            headers.set('Content-Type', 'application/json');
        }

        const response = await fetch(url, {
            ...options,
            headers,
            credentials: 'include'
        });

        if (!response.ok) {
            const text = await response.text();
            if (response.status === 401 || response.status === 403) {
                const refreshed = await refreshToken();
                if (refreshed) {
                    const newToken = localStorage.getItem('adminToken');
                    const newCsrfToken = await getCsrfToken();
                    if (!newCsrfToken) {
                        throw new Error('Не вдалося отримати CSRF-токен для повторного запиту.');
                    }
                    const retryHeaders = new Headers({
                        ...options.headers,
                        'Authorization': `Bearer ${newToken}`,
                        'X-CSRF-Token': newCsrfToken
                    });
                    if (!(options.body instanceof FormData)) {
                        retryHeaders.set('Content-Type', 'application/json');
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
                    localStorage.removeItem('adminToken');
                    session = { isActive: false, timestamp: 0 };
                    localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
                    showSection('admin-login');
                    throw new Error('Сесія закінчилася. Будь ласка, увійдіть знову.');
                }
            }
            try {
                const errorData = JSON.parse(text);
                throw new Error(`Помилка: ${errorData.error || response.statusText}`);
            } catch {
                throw new Error(`Помилка: ${response.status} ${text}`);
            }
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

async function saveProduct(productData, method, url) {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        let name = document.getElementById('product-name').value.trim();
        let slug = document.getElementById('product-slug').value.trim();
        let brand = document.getElementById('product-brand').value.trim();
        let category = document.getElementById('product-category').value;
        let subcategory = document.getElementById('product-subcategory').value;
        let material = document.getElementById('product-material').value.trim();
        let price = null;
        let salePrice = null;
        if (productData.type === 'simple') {
            const priceValue = document.getElementById('product-price')?.value.trim();
            price = priceValue ? parseFloat(priceValue) : null;
            const salePriceValue = document.getElementById('product-sale-price')?.value.trim();
            salePrice = salePriceValue ? parseFloat(salePriceValue) : null;
        }
        const saleEnd = document.getElementById('product-sale-end').value || null;
        const description = document.getElementById('product-description').value || '';
        const widthCm = parseFloat(document.getElementById('product-width-cm').value) || null;
        const depthCm = parseFloat(document.getElementById('product-depth-cm').value) || null;
        const heightCm = parseFloat(document.getElementById('product-height-cm').value) || null;
        const lengthCm = parseFloat(document.getElementById('product-length-cm').value) || null;
        const visible = document.getElementById('product-visible').value === 'true';

        if (!name || !slug) {
            showNotification('Введіть назву та шлях товару!');
            return;
        }

        // Перевірка унікальності шляху
        try {
            const slugCheck = await fetchWithAuth(`/api/products?slug=${encodeURIComponent(slug)}`);
            const existingProducts = await slugCheck.json();
            const existingProduct = existingProducts.find(p => p.slug === slug);
            if (existingProduct && (method === 'POST' || (method === 'PUT' && existingProduct.id !== productData.id))) {
                showNotification('Шлях товару має бути унікальним!');
                return;
            }
        } catch (err) {
            console.error('Помилка перевірки унікальності:', err);
            showNotification('Помилка перевірки унікальності: ' + err.message);
            return;
        }

        if (productData.type === 'simple' && (isNaN(price) || price < 0)) {
            showNotification('Введіть коректну ціну для простого товару!');
            return;
        }

        if (salePrice !== null && (isNaN(salePrice) || salePrice < 0)) {
            showNotification('Введіть коректну акційну ціну!');
            return;
        }

        if (saleEnd) {
            const saleEndDate = new Date(saleEnd);
            if (isNaN(saleEndDate.getTime())) {
                showNotification('Введіть коректну дату закінчення акції!');
                return;
            }
            if (saleEndDate < new Date()) {
                showNotification('Дата закінчення акції не може бути в минулому!');
                return;
            }
        }

        if (productData.type === 'mattresses' && productData.sizes.length === 0) {
            showNotification('Додайте хоча б один розмір для матрацу!');
            return;
        }

        if (productData.type === 'group' && productData.groupProducts.length === 0) {
            showNotification('Додайте хоча б один товар до групового товару!');
            return;
        }

        if (widthCm !== null && (widthCm <= 0 || isNaN(widthCm))) {
            showNotification('Ширина товару має бути більше 0!');
            return;
        }

        if (depthCm !== null && (depthCm <= 0 || isNaN(depthCm))) {
            showNotification('Глибина товару має бути більше 0!');
            return;
        }

        if (heightCm !== null && (heightCm <= 0 || isNaN(heightCm))) {
            showNotification('Висота товару має бути більше 0!');
            return;
        }

        if (lengthCm !== null && (lengthCm <= 0 || isNaN(lengthCm))) {
            showNotification('Довжина товару має бути більше 0!');
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
            type: productData.type,
            name,
            slug,
            brand: brand || '',
            category: category || '',
            subcategory: subcategory || '',
            material: material || '',
            price: productData.type === 'simple' ? price : null,
            salePrice: salePrice,
            saleEnd: saleEnd || null,
            description: description || '',
            widthCm,
            depthCm,
            heightCm,
            lengthCm,
            photos: [],
            colors: productData.colors.map(color => ({
                name: color.name,
                value: color.value,
                priceChange: Number(color.priceChange) || 0,
                photo: null
            })),
            sizes: productData.sizes.map(size => ({
                name: size.name,
                price: Number(size.price) || 0
            })),
            groupProducts: productData.groupProducts,
            active: productData.active !== undefined ? productData.active : true,
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

const videos = doc.querySelectorAll('iframe');
for (let video of videos) {
    const src = video.getAttribute('src');
    if (src && src.startsWith('blob:')) {
        try {
            const response = await fetch(src);
            const blob = await response.blob();
            const validation = validateFile(blob, 'video');
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const extension = blob.type === 'video/mp4' ? 'mp4' : 'webm'; // Додаємо підтримку інших форматів, якщо потрібно
            const formData = new FormData();
            formData.append('file', blob, `description-video-${Date.now()}.${extension}`);
            const uploadResponse = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData
            });
            const uploadData = await uploadResponse.json();
            if (uploadData.url) {
                mediaUrls.push({ oldUrl: src, newUrl: uploadData.url });
            } else {
                throw new Error('Не вдалося завантажити відео');
            }
        } catch (err) {
            console.error('Помилка завантаження відео з опису:', err);
            showNotification('Не вдалося завантажити відео з опису: ' + err.message);
            return;
        }
    }
}

        let updatedDescription = description;
        mediaUrls.forEach(({ oldUrl, newUrl }) => {
            updatedDescription = updatedDescription.replace(oldUrl, newUrl);
        });
        product.description = updatedDescription;

        const photoFiles = productData.photos.filter(photo => photo instanceof File);
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
                if (!response.ok) {
                    throw new Error(`Помилка завантаження фото: ${response.statusText}`);
                }
                const data = await response.json();
                product.photos.push(data.url);
            } catch (err) {
                console.error('Помилка завантаження фото:', err);
                showNotification('Не вдалося завантажити фото: ' + err.message);
                return;
            }
        }

        product.photos.push(...productData.photos.filter(photo => typeof photo === 'string'));

        for (let i = 0; i < productData.colors.length; i++) {
            const color = productData.colors[i];
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
                    if (!response.ok) {
                        throw new Error(`Помилка завантаження фото кольору: ${response.statusText}`);
                    }
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

        const response = await fetchWithAuth(url, {
            method,
            body: JSON.stringify(product)
        });

        const updatedProduct = await response.json();
        if (method === 'POST') {
            products.push(updatedProduct);
        } else if (method === 'PUT') {
            const index = products.findIndex(p => p.id === productData.id);
            if (index !== -1) {
                products[index] = updatedProduct;
            }
        }

        closeModal();
        renderAdmin('products');
        showNotification(method === 'POST' ? 'Товар додано!' : 'Товар оновлено!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error(`Помилка при ${method === 'POST' ? 'додаванні' : 'оновленні'} товару:`, err, err.stack);
        showNotification(`Не вдалося ${method === 'POST' ? 'додати' : 'оновити'} товар: ` + err.message);
    }
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
} // eslint-disable-line no-unused-vars

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
        const promises = [
            loadProducts().catch(e => {
                console.error('Помилка завантаження товарів:', e);
                showNotification('Не вдалося завантажити товари: ' + e.message);
                return null;
            }),
            loadCategories().catch(e => {
                console.error('Помилка завантаження категорій:', e);
                showNotification('Не вдалося завантажити категорії: ' + e.message);
                return null;
            }),
            loadSettings().catch(e => {
                console.error('Помилка завантаження налаштувань:', e);
                showNotification('Не вдалося завантажити налаштування: ' + e.message);
                return null;
            }),
            loadOrders().catch(e => {
                console.error('Помилка завантаження замовлень:', e);
                showNotification('Не вдалося завантажити замовлення: ' + e.message);
                return null;
            }),
            loadSlides().catch(e => {
                console.error('Помилка завантаження слайдів:', e);
                showNotification('Не вдалося завантажити слайди: ' + e.message);
                return null;
            }),
            loadMaterials().catch(e => {
                console.error('Помилка завантаження матеріалів:', e);
                showNotification('Не вдалося завантажити матеріали: ' + e.message);
                return null;
            }),
            loadBrands().catch(e => {
                console.error('Помилка завантаження брендів:', e);
                showNotification('Не вдалося завантажити бренди: ' + e.message);
                return null;
            })
        ];

        await Promise.all(promises);
        console.log('Усі дані успішно ініціалізовані або оброблені помилки');
    } catch (e) {
        console.error('Критична помилка ініціалізації даних:', e);
        showNotification('Критична помилка ініціалізації: ' + e.message);
    } finally {
        isInitializing = false;
    }
}

async function checkAuth() {
    const token = localStorage.getItem('adminToken');
    const storedSession = localStorage.getItem('adminSession');
    console.log('Перевірка авторизації, токен:', token, 'сесія:', storedSession);

    if (!token || !storedSession) {
        console.log('Токен або сесія відсутні, перехід до входу');
        showSection('admin-login');
        return;
    }

    try {
        if (!window.LZString) {
            throw new Error('Бібліотека LZString не завантажена.');
        }
        session = JSON.parse(LZString.decompressFromUTF16(storedSession));
        if (!session.isActive || (Date.now() - session.timestamp) >= sessionTimeout) {
            console.log('Сесія неактивна або закінчилася');
            localStorage.removeItem('adminToken');
            session = { isActive: false, timestamp: 0 };
            localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
            showSection('admin-login');
            return;
        }

        const tokenRefreshed = await refreshToken();
        console.log('Результат оновлення токена:', tokenRefreshed);
        if (!tokenRefreshed) {
            showSection('admin-login');
            return;
        }

        showSection('admin-panel');
        await initializeData();
        connectAdminWebSocket();
        resetInactivityTimer();
    } catch (e) {
        console.error('Помилка перевірки авторизації:', e);
        showSection('admin-login');
        showNotification('Помилка перевірки авторизації: ' + e.message);
    }
}

checkAuth();



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
} // eslint-disable-line no-unused-vars

function setDefaultVideoSizes(editor, editorId) {
    const iframes = editor.root.querySelectorAll('iframe');
    iframes.forEach(iframe => {
        if (!iframe.style.width || !iframe.style.height) {
            iframe.style.width = '100%'; // Адаптивна ширина
            iframe.style.height = '315px'; // Стандартна висота для відео
            iframe.style.maxWidth = '560px'; // Обмеження ширини
            iframe.style.display = 'block'; // Для коректного відображення
            iframe.style.margin = '0 auto'; // Центрування
        }
    });
    const hiddenInput = document.getElementById(editorId);
    if (hiddenInput) {
        hiddenInput.value = editor.root.innerHTML;
    }
    unsavedChanges = true;
    resetInactivityTimer();
}

function cleanupEditor(editorInstance, editorVariableName) {
    try {
        if (editorInstance) {
            // Видаляємо слухачі подій Quill
            editorInstance.off('text-change');
            editorInstance.off('selection-change');

            // Видаляємо слухачі подій для 'click' на editor.root
            // Оскільки ми не знаємо конкретного обробника, клонуємо елемент, щоб видалити всі слухачі
            const oldRoot = editorInstance.root;
            const newRoot = oldRoot.cloneNode(true);
            oldRoot.parentNode.replaceChild(newRoot, oldRoot);
            editorInstance.root = newRoot;

            // Очищаємо контейнер редактора
            if (editorInstance.container) {
                editorInstance.container.innerHTML = '';
            }

            // Очищаємо глобальну змінну (aboutEditor або productEditor)
            if (editorVariableName === 'aboutEditor') {
                aboutEditor = null;
            } else if (editorVariableName === 'productEditor') {
                productEditor = null;
            }
        }
    } catch (e) {
        console.error(`Помилка очищення редактора (${editorVariableName}):`, e);
    }
}

function initializeEditors() {
    try {
        // Перевірка наявності бібліотеки Quill
        if (!window.Quill) {
            console.error('Бібліотека Quill не завантажена. Перевірте підключення скрипту.');
            showNotification('Бібліотека Quill не завантажена. Перевірте підключення скрипту.');
            return;
        }

        // Очищення попередніх редакторів
        if (aboutEditor) {
            cleanupEditor(aboutEditor, 'aboutEditor');
        }
        if (productEditor) {
            cleanupEditor(productEditor, 'productEditor');
        }

        // Налаштування панелі інструментів
        const toolbarOptions = [
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
            ['undo', 'redo']
        ];

        // Універсальна функція для оновлення кнопок undo/redo
        const updateButtons = (editor, container) => {
            const undoButton = container.querySelector('.ql-undo');
            const redoButton = container.querySelector('.ql-redo');
            if (undoButton && redoButton) {
                undoButton.disabled = editor.history.stack.undo.length === 0;
                redoButton.disabled = editor.history.stack.redo.length === 0;
            }
        };

        // Універсальна функція для ініціалізації редактора
        const initializeEditor = (containerId, editorVarName, hiddenInputId, initialContent) => {
            const container = document.getElementById(containerId);
            if (!container) {
                console.warn(`Контейнер для редактора (#${containerId}) не знайдено у DOM.`);
                return null;
            }

            container.innerHTML = ''; // Очищаємо контейнер перед ініціалізацією

            const editor = new Quill(container, {
                theme: 'snow',
                modules: {
                    toolbar: toolbarOptions,
                    history: {
                        delay: 1000,
                        maxStack: 500,
                        userOnly: true
                    }
                }
            });

            // Обробка зміни тексту
            editor.on('text-change', () => {
                const content = editor.root.innerHTML;
                const hiddenInput = document.getElementById(hiddenInputId);
                if (hiddenInput) {
                    hiddenInput.value = content;
                }
                unsavedChanges = true;
                updateButtons(editor, container);
                resetInactivityTimer();
            });

            // Обробка вибору медіа
            editor.on('selection-change', (range) => {
                if (range && range.length > 0) {
                    const [leaf] = editor.getLeaf(range.index);
                    if (leaf && leaf.domNode && (leaf.domNode.tagName === 'IMG' || leaf.domNode.tagName === 'IFRAME')) {
                        selectedMedia = leaf.domNode;
                        document.querySelectorAll('.quill-media-selected').forEach(el => el.classList.remove('quill-media-selected'));
                        selectedMedia.classList.add('quill-media-selected');
                    } else {
                        selectedMedia = null;
                        document.querySelectorAll('.quill-media-selected').forEach(el => el.classList.remove('quill-media-selected'));
                    }
                }
            });

            // Обробник кліків для зміни розмірів
            const handleMediaClick = (e) => {
                const target = e.target;
                if (target.tagName === 'IMG' || target.tagName === 'IFRAME') {
                    selectedMedia = target;
                    openResizeModal(target);
                }
            };
            editor.root.addEventListener('click', handleMediaClick);

            // Обробка вставки медіа через clipboard
            editor.clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
                if (node.tagName === 'IMG' || node.tagName === 'IFRAME') {
                    const src = node.getAttribute('src');
                    if (src) {
                        const insert = node.tagName === 'IMG' ? { image: src } : { video: src };
                        return { ops: [{ insert }] };
                    }
                }
                return delta;
            });

            // Завантаження початкового вмісту
            if (initialContent) {
                try {
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(initialContent, 'text/html');
                    if (doc.body) {
                        editor.root.innerHTML = initialContent;
                        console.log(`Встановлено вміст для редактора (${containerId}):`, initialContent);
                    } else {
                        throw new Error('Некоректний HTML');
                    }
                } catch (e) {
                    console.error(`Помилка при встановленні вмісту (${containerId}):`, e);
                    editor.setText(initialContent || '', 'silent');
                    showNotification(`Помилка завантаження вмісту для редактора (${containerId})`);
                }
            } else {
                editor.root.innerHTML = '';
            }

            const hiddenInput = document.getElementById(hiddenInputId);
            if (hiddenInput) {
                hiddenInput.value = initialContent || '';
            }

            // Встановлення розмірів відео
            setDefaultVideoSizes(editor, hiddenInputId);

            // Ініціалізація стану кнопок
            setTimeout(() => updateButtons(editor, container), 100);

            // Обробник для вставки зображень
            editor.getModule('toolbar').addHandler('image', () => {
                const input = document.createElement('input');
                input.setAttribute('type', 'file');
                input.setAttribute('accept', 'image/*');
                input.click();
                input.onchange = async () => {
                    const file = input.files[0];
                    if (file) {
                        const validation = validateFile(file);
                        if (!validation.valid) {
                            showNotification(validation.error);
                            return;
                        }
                        const range = editor.getSelection() || { index: 0 };
                        const url = URL.createObjectURL(file);
                        editor.insertEmbed(range.index, 'image', url);
                        const img = editor.root.querySelector(`img[src="${url}"]`);
                        if (img) {
                            img.setAttribute('alt', `Зображення ${file.name}`);
                        }
                    }
                };
            });

            // Обробник для вставки відео
            editor.getModule('toolbar').addHandler('video', () => {
                let url = prompt('Введіть URL відео (наприклад, https://www.youtube.com/watch?v=VIDEO_ID):');
                if (url) {
                    const watchRegex = /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=([^\s&]+)/;
                    const embedRegex = /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/([^\s]+)/;
                    const shortRegex = /^(https?:\/\/)?youtu\.be\/([^\s]+)/;

                    let videoId = null;
                    if (watchRegex.test(url)) {
                        videoId = url.match(watchRegex)[3];
                        url = `https://www.youtube.com/embed/${videoId}`;
                    } else if (embedRegex.test(url)) {
                        videoId = url.match(embedRegex)[3];
                        url = `https://www.youtube.com/embed/${videoId}`;
                    } else if (shortRegex.test(url)) {
                        videoId = url.match(shortRegex)[2];
                        url = `https://www.youtube.com/embed/${videoId}`;
                    } else {
                        showNotification('Введіть коректний URL для YouTube відео!');
                        return;
                    }

                    const range = editor.getSelection() || { index: 0 };
                    editor.insertEmbed(range.index, 'video', url);
                    setDefaultVideoSizes(editor, hiddenInputId);
                }
            });

            return editor;
        };

        // Ініціалізація редактора для "Про нас"
        aboutEditor = initializeEditor('about-editor', 'aboutEditor', 'about-edit', settings.about);

        // Ініціалізація редактора для товару
        productEditor = initializeEditor('product-description-editor', 'productEditor', 'product-description', '');

        // Обробники для кнопок undo/redo
        const existingUndoListeners = document.querySelectorAll('.ql-undo[data-listener]');
        const existingRedoListeners = document.querySelectorAll('.ql-redo[data-listener]');
        existingUndoListeners.forEach(button => button.removeEventListener('click', button._undoListener));
        existingRedoListeners.forEach(button => button.removeEventListener('click', button._redoListener));

        const undoButtons = document.querySelectorAll('.ql-undo');
        const redoButtons = document.querySelectorAll('.ql-redo');
        undoButtons.forEach(button => {
            const listener = () => {
                if (button.closest('#about-editor') && aboutEditor) {
                    aboutEditor.history.undo();
                    updateButtons(aboutEditor, document.getElementById('about-editor'));
                }
                if (button.closest('#product-description-editor') && productEditor) {
                    productEditor.history.undo();
                    updateButtons(productEditor, document.getElementById('product-description-editor'));
                }
            };
            button.addEventListener('click', listener);
            button._undoListener = listener;
            button.setAttribute('data-listener', 'true');
        });

        redoButtons.forEach(button => {
            const listener = () => {
                if (button.closest('#about-editor') && aboutEditor) {
                    aboutEditor.history.redo();
                    updateButtons(aboutEditor, document.getElementById('about-editor'));
                }
                if (button.closest('#product-description-editor') && productEditor) {
                    productEditor.history.redo();
                    updateButtons(productEditor, document.getElementById('product-description-editor'));
                }
            };
            button.addEventListener('click', listener);
            button._redoListener = listener;
            button.setAttribute('data-listener', 'true');
        });

        addToolbarEventListeners();
        console.log('Редактори успішно ініціалізовані');
    } catch (e) {
        console.error('Помилка ініціалізації редакторів:', e);
        showNotification('Не вдалося ініціалізувати редактори: ' + e.message);
    }
}

function addToolbarEventListeners() {
    try {
        const toolbars = document.querySelectorAll('.ql-toolbar');
        toolbars.forEach(toolbar => {
            // Обробка кнопок
            const buttons = toolbar.querySelectorAll('button');
            buttons.forEach(button => {
                // Видаляємо попередні обробники, щоб уникнути дублювання
                button.removeEventListener('click', handleToolbarInteraction);
                button.addEventListener('click', handleToolbarInteraction);
            });

            // Обробка випадаючих списків
            const selects = toolbar.querySelectorAll('select');
            selects.forEach(select => {
                select.removeEventListener('change', handleToolbarInteraction);
                select.addEventListener('change', handleToolbarInteraction);
            });
        });
    } catch (e) {
        console.error('Помилка додавання обробників панелі інструментів:', e);
    }
}

function handleToolbarInteraction() {
    resetInactivityTimer();
    unsavedChanges = true; // Позначка незбережених змін при взаємодії
}

function initializeProductEditor(description = '', descriptionDelta = null) {
    const productEditorElement = document.getElementById('product-description-editor');
    if (productEditorElement && !productEditor) {
        productEditorElement.innerHTML = ''; // Очищаємо перед ініціалізацією
        productEditor = new Quill('#product-description-editor', {
            theme: 'snow',
            modules: {
                toolbar: [
                    [{ 'header': [1, 2, 3, false] }],
                    ['bold', 'italic', 'underline'],
                    [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                    ['link', 'image'],
                    ['undo', 'redo']
                ],
                history: {
                    delay: 1000,
                    maxStack: 100
                }
            }
        });

        // Додаємо власні кнопки undo/redo
        const toolbar = productEditor.getModule('toolbar');
        toolbar.addHandler('undo', () => productEditor.history.undo());
        toolbar.addHandler('redo', () => productEditor.history.redo());

        // Завантаження вмісту
        if (description) {
            productEditor.root.innerHTML = description;
        } else if (descriptionDelta) {
            productEditor.setContents(descriptionDelta);
        }

        productEditor.on('text-change', () => {
            const content = productEditor.root.innerHTML;
            document.getElementById('product-description').value = content;
            unsavedChanges = true;
            resetInactivityTimer();
        });

        // Обробка вставки зображень
        productEditor.getModule('toolbar').addHandler('image', () => {
            const input = document.createElement('input');
            input.setAttribute('type', 'file');
            input.setAttribute('accept', 'image/*');
            input.click();
            input.onchange = async () => {
                const file = input.files[0];
                if (file) {
                    const validation = validateFile(file);
                    if (!validation.valid) {
                        showNotification(validation.error);
                        return;
                    }
                    const range = productEditor.getSelection();
                    const url = URL.createObjectURL(file);
                    productEditor.insertEmbed(range ? range.index : 0, 'image', url);
                    // Додаємо alt атрибут після вставки
                    const img = productEditor.root.querySelector(`img[src="${url}"]`);
                    if (img) {
                        img.setAttribute('alt', `Зображення ${file.name}`);
                    }
                }
            };
        });

        // Додаємо обробник для вставки відео
        toolbar.addHandler('video', () => {
            let url = prompt('Введіть URL відео (наприклад, https://www.youtube.com/watch?v=VIDEO_ID або https://www.youtube.com/embed/VIDEO_ID):');
            if (url) {
                // Перетворюємо URL у формат embed
                const watchRegex = /^(https?:\/\/)?(www\.)?youtube\.com\/watch\?v=([^\s&]+)/;
                const embedRegex = /^(https?:\/\/)?(www\.)?youtube\.com\/embed\/([^\s]+)/;
                const shortRegex = /^(https?:\/\/)?youtu\.be\/([^\s]+)/;

                let videoId = null;

                // Перевіряємо формат watch?v=
                if (watchRegex.test(url)) {
                    const match = url.match(watchRegex);
                    videoId = match[3];
                    url = `https://www.youtube.com/embed/${videoId}`;
                }
                // Перевіряємо формат embed
                else if (embedRegex.test(url)) {
                    const match = url.match(embedRegex);
                    videoId = match[3];
                    url = `https://www.youtube.com/embed/${videoId}`;
                }
                // Перевіряємо формат youtu.be
                else if (shortRegex.test(url)) {
                    const match = url.match(shortRegex);
                    videoId = match[2];
                    url = `https://www.youtube.com/embed/${videoId}`;
                }
                else {
                    showNotification('Введіть коректний URL для YouTube відео (наприклад, https://www.youtube.com/watch?v=VIDEO_ID або https://www.youtube.com/embed/VIDEO_ID)');
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

        // Додаємо обробник вибору медіа (з запропонованого виправлення)
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

        // Додаємо обробники для кнопок "Undo" і "Redo"
        setTimeout(() => {
            const toolbar = document.querySelector('#product-description-editor').previousElementSibling;
            if (toolbar && toolbar.classList.contains('ql-toolbar')) {
                const undoButton = toolbar.querySelector('.ql-undo');
                const redoButton = toolbar.querySelector('.ql-redo');
                if (undoButton) {
                    undoButton.addEventListener('click', () => {
                        productEditor.history.undo();
                    });
                }
                if (redoButton) {
                    redoButton.addEventListener('click', () => {
                        productEditor.history.redo();
                    });
                }
            } else {
                console.error('Панель інструментів для productEditor не знайдена');
            }
        }, 100);

        resetInactivityTimer();
    }
}

function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    const section = document.getElementById(sectionId);
    if (section) {
        section.classList.add('active');
    }
}

session = { isActive: false, timestamp: 0 };

async function login() {
    const username = document.getElementById('admin-username').value;
    const password = document.getElementById('admin-password').value;

    if (!username || !password) {
        showNotification('Введіть логін і пароль!');
        return;
    }

    try {
        const csrfToken = await getCsrfToken();
        if (!csrfToken) {
            showNotification('Не вдалося отримати CSRF-токен.');
            return;
        }

        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });

        if (!response.ok) {
            const text = await response.text();
            try {
                const errorData = JSON.parse(text);
                throw new Error(`Помилка входу: ${errorData.error || response.statusText}`);
            } catch {
                throw new Error(`Помилка входу: ${response.status} ${text}`);
            }
        }

        const data = await response.json();
        console.log('Отримано дані авторизації:', data); // Логування для дебагу
        const token = data.token;

        if (!token) {
            throw new Error('Токен не отримано від сервера');
        }

        localStorage.setItem('adminToken', token);
        console.log('Токен збережено:', localStorage.getItem('adminToken')); // Логування для дебагу
        session = { isActive: true, timestamp: Date.now() };
        localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));

        showSection('admin-panel');
        await initializeData();
        connectAdminWebSocket();
        resetInactivityTimer();
        showNotification('Вхід виконано успішно!');
    } catch (e) {
        console.error('Помилка входу:', e);
        showNotification('Помилка входу: ' + e.message);
    }
}

function logout() {
    localStorage.removeItem('adminToken');
    session = { isActive: false, timestamp: 0 };
    localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
    showSection('admin-login');
    showNotification('Ви вийшли з системи.');
    if (socket) {
        socket.close();
    }
    resetInactivityTimer();
} // eslint-disable-line no-unused-vars

document.addEventListener('DOMContentLoaded', () => {
    const storedSession = localStorage.getItem('adminSession');
    const token = localStorage.getItem('adminToken');

    // Перевірка авторизації
    if (storedSession && token) {
        session = JSON.parse(LZString.decompressFromUTF16(storedSession));
        if (session.isActive && (Date.now() - session.timestamp) < sessionTimeout) {
            showSection('admin-panel');
            initializeData();
            connectAdminWebSocket();
            resetInactivityTimer();
        } else {
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

    // Додаємо обробник для кнопки логіну
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        loginBtn.addEventListener('click', login);
    } else {
        console.warn("Елемент 'login-btn' не знайдено в DOM. Переконайтеся, що кнопка входу присутня в HTML.");
    }

    // Додаємо слухачі подій для полів введення
    const usernameInput = document.getElementById('admin-username');
    const passwordInput = document.getElementById('admin-password');

    if (usernameInput) {
        usernameInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                if (passwordInput) {
                    passwordInput.focus();
                } else {
                    login();
                }
            }
        });
    } else {
        console.warn("Елемент 'admin-username' не знайдено в DOM. Переконайтеся, що поле введення присутнє в HTML.");
    }

    if (passwordInput) {
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                login();
            }
        });
    } else {
        console.warn("Елемент 'admin-password' не знайдено в DOM. Переконайтеся, що поле введення присутнє в HTML.");
    }
});

async function refreshToken() {
    const token = localStorage.getItem('adminToken');
    console.log('Перевірка токена в refreshToken:', token); // Додаємо лог
    if (!token) {
        console.warn('Токен відсутній');
        return false;
    }

    try {
        const csrfToken = await getCsrfToken();
        console.log('Отримано CSRF-токен:', csrfToken); // Додаємо лог
        if (!csrfToken) {
            console.warn('Не вдалося отримати CSRF-токен');
            return false;
        }

        const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken
            },
            credentials: 'include'
        });

        console.log('Відповідь refreshToken:', response.status); // Додаємо лог
        if (!response.ok) {
            localStorage.removeItem('adminToken');
            session = { isActive: false, timestamp: 0 };
            localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
            return false;
        }

        const data = await response.json();
        console.log('Новий токен:', data.token); // Додаємо лог
        localStorage.setItem('adminToken', data.token);
        session.timestamp = Date.now();
        localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
        return true;
    } catch (e) {
        console.error('Помилка оновлення токена:', e);
        localStorage.removeItem('adminToken');
        session = { isActive: false, timestamp: 0 };
        localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
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
    notification.textContent = message;
    notification.classList.add('active');
    setTimeout(() => {
        notification.classList.remove('active');
    }, 3000);
}

function resetInactivityTimer() {
    clearTimeout(inactivityTimer);
    inactivityTimer = setTimeout(() => {
        localStorage.removeItem('adminToken');
        session = { isActive: false, timestamp: 0 };
        localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
        showSection('admin-login');
        showNotification('Сесія закінчилася через бездіяльність.');
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

        // Отримання значень полів
        const name = document.getElementById('store-name').value.trim();
        const baseUrl = document.getElementById('base-url').value.trim();
        const logoWidth = document.getElementById('logo-width').value.trim();
        const logoUrl = document.getElementById('logo-url').value.trim();
        const logoFile = document.getElementById('logo-file').files[0];
        const faviconUrl = document.getElementById('favicon-url').value.trim();
        const faviconFile = document.getElementById('favicon-file').files[0];

        // Валідація обов’язкових полів
        if (!name) {
            showNotification('Назва магазину є обов’язковою!');
            return;
        }

        // Валідація базового URL
        if (!baseUrl) {
            showNotification('Базовий URL є обов’язковим!');
            return;
        }
        const urlPattern = /^(https?:\/\/)([\w-]+(\.[\w-]+)+)(\/[\w-]*)*\/?$/;
        if (!urlPattern.test(baseUrl)) {
            showNotification('Введіть коректний базовий URL (наприклад, https://www.yourdomain.com)!');
            return;
        }

        // Валідація ширини логотипу
        let logoWidthNum = null;
        if (logoWidth) {
            logoWidthNum = parseInt(logoWidth, 10);
            if (isNaN(logoWidthNum) || logoWidthNum < 50 || logoWidthNum > 500) {
                showNotification('Ширина логотипу має бути числом від 50 до 500!');
                return;
            }
        }

        // Валідація логотипу
        if (logoFile) {
            const validation = validateFile(logoFile);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', logoFile);
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            settings.logo = data.url;
        } else if (logoUrl) {
            if (!urlPattern.test(logoUrl)) {
                showNotification('Введіть коректний URL логотипу!');
                return;
            }
            settings.logo = logoUrl;
        } else {
            settings.logo = ''; // Очищаємо, якщо нічого не введено
        }

        // Валідація favicon
        if (faviconFile) {
            const validation = validateFile(faviconFile);
            if (!validation.valid) {
                showNotification(validation.error);
                return;
            }
            const formData = new FormData();
            formData.append('file', faviconFile);
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            settings.favicon = data.url;
        } else if (faviconUrl) {
            if (!urlPattern.test(faviconUrl)) {
                showNotification('Введіть коректний URL favicon!');
                return;
            }
            settings.favicon = faviconUrl;
        } else {
            settings.favicon = ''; // Очищаємо, якщо нічого не введено
        }

        // Збереження налаштувань
        settings.name = name;
        settings.baseUrl = baseUrl;
        settings.logoWidth = logoWidthNum ? logoWidthNum.toString() : '';

        const response = await fetchWithAuth('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({
                name: settings.name,
                baseUrl: settings.baseUrl,
                logo: settings.logo,
                logoWidth: settings.logoWidth,
                favicon: settings.favicon
            })
        });

        if (!response.ok) {
            throw new Error(`Не вдалося оновити інформацію магазину: ${response.statusText}`);
        }

        showNotification('Інформацію магазину оновлено!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення інформації магазину:', err);
        showNotification('Не вдалося оновити інформацію магазину: ' + err.message);
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

        // Валідація
        if (!phones && !addresses && !schedule) {
            showNotification('Заповніть хоча б одне поле (телефони, адреси або графік)!');
            return;
        }

        const phonePattern = /^\+?\d{1,4}[\s-]?(\(\d{1,4}\))?[-\s]?\d{1,4}[-\s]?\d{1,4}[-\s]?\d{1,4}$/;
        if (phones) {
            const phoneLines = phones.split('\n').map(line => line.trim()).filter(line => line);
            for (let phone of phoneLines) {
                if (!phonePattern.test(phone)) {
                    showNotification('Введіть коректний номер телефону (наприклад, +38 (067) 123-45-67)!');
                    return;
                }
            }
        }

        settings.contacts.phones = phones;
        settings.contacts.addresses = addresses;
        settings.contacts.schedule = schedule;

        const response = await fetchWithAuth('/api/settings', {
            method: 'PUT',
            body: JSON.stringify({ contacts: settings.contacts })
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
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        // Ініціалізація редактора, якщо він ще не ініціалізований
        initializeEditors();

        const aboutContent = aboutEditor.root.innerHTML;
        const mediaUrls = [];
        const parser = new DOMParser();
        const doc = parser.parseFromString(aboutContent, 'text/html');
        const images = doc.querySelectorAll('img');

        for (let img of images) {
            const src = img.getAttribute('src');
            if (src && src.startsWith('blob:')) {
                try {
                    const response = await fetch(src);
                    const blob = await response.blob();
                    const formData = new FormData();
                    formData.append('file', blob, `about-image-${Date.now()}.png`);
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
                    console.error('Помилка завантаження зображення:', err);
                    showNotification('Не вдалося завантажити зображення: ' + err.message);
                    return;
                }
            }
        }

        let updatedContent = aboutContent;
        mediaUrls.forEach(({ oldUrl, newUrl }) => {
            updatedContent = updatedContent.replace(oldUrl, newUrl);
        });

        settings.about = updatedContent;
        const response = await fetchWithAuth('/api/settings', {
            method: 'PUT',
            body: JSON.stringify(settings)
        });

        if (!response.ok) {
            throw new Error('Не вдалося оновити розділ "Про нас"');
        }

        showNotification('Розділ "Про нас" оновлено!');
        unsavedChanges = false;
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення "Про нас":', err);
        showNotification('Помилка: ' + err.message);
    }
}

function renderAdmin(activeTab = 'site-editing') {
    console.log('Рендеринг адмін-панелі з activeTab:', activeTab, 'settings:', settings);

    const storeName = document.getElementById('store-name');
    if (storeName) storeName.value = settings.name || '';
    const baseUrl = document.getElementById('base-url');
    if (baseUrl) baseUrl.value = settings.baseUrl || '';
    const logoUrl = document.getElementById('logo-url');
    if (logoUrl) logoUrl.value = settings.logo || '';
    const logoWidth = document.getElementById('logo-width');
    if (logoWidth) logoWidth.value = settings.logoWidth || 150;
    const faviconUrl = document.getElementById('favicon-url');
    if (faviconUrl) faviconUrl.value = settings.favicon || '';

    const contacts = settings.contacts || { phones: '', addresses: '', schedule: '' };
    const contactPhones = document.getElementById('contact-phones');
    if (contactPhones) contactPhones.value = contacts.phones || '';
    const contactAddresses = document.getElementById('contact-addresses');
    if (contactAddresses) contactAddresses.value = contacts.addresses || '';
    const contactSchedule = document.getElementById('contact-schedule');
    if (contactSchedule) contactSchedule.value = contacts.schedule || '';

    if (document.getElementById('about-editor')) {
        if (!aboutEditor) {
            initializeEditors();
        }
        if (settings.aboutDelta) {
            aboutEditor.setContents(settings.aboutDelta, 'silent');
        } else if (settings.about) {
            try {
                const delta = aboutEditor.clipboard.convert(settings.about);
                aboutEditor.setContents(delta, 'silent');
            } catch (e) {
                aboutEditor.setContents([{ insert: settings.about }], 'silent');
            }
        } else {
            aboutEditor.setContents([], 'silent');
        }
        document.getElementById('about-edit').value = aboutEditor.root.innerHTML;
    } else if (document.getElementById('about-edit')) {
        document.getElementById('about-edit').value = settings.about || '';
    }

    const socialToggle = document.getElementById('social-toggle');
    if (socialToggle) socialToggle.checked = settings.showSocials !== false;
    const slideToggle = document.getElementById('slide-toggle');
    if (slideToggle) slideToggle.checked = settings.showSlides !== false;
    const slideWidth = document.getElementById('slide-width');
    if (slideWidth) slideWidth.value = settings.slideWidth || 75;
    const slideHeight = document.getElementById('slide-height');
    if (slideHeight) slideHeight.value = settings.slideHeight || 200;
    const slideInterval = document.getElementById('slide-interval');
    if (slideInterval) slideInterval.value = settings.slideInterval || 3000;
    const categoryWidth = document.getElementById('category-width');
    if (categoryWidth) categoryWidth.value = settings.categoryWidth || 200;
    const categoryHeight = document.getElementById('category-height');
    if (categoryHeight) categoryHeight.value = settings.categoryHeight || 150;
    const productWidth = document.getElementById('product-width');
    if (productWidth) productWidth.value = settings.productWidth || 300;
    const productHeight = document.getElementById('product-height');
    if (productHeight) productHeight.value = settings.productHeight || 280;

    const socialList = document.getElementById('social-list');
    if (socialList) {
        socialList.innerHTML = settings.socials.map((social, index) => `
            <div class="social-item">
                <span class="social-icon">${social.icon || '🔗'}</span> ${social.url}
                <button class="edit-btn" onclick="editSocial(${index})">Редагувати</button>
                <button class="delete-btn" onclick="deleteSocial(${index})">Видалити</button>
            </div>
        `).join('');
    }

    const catList = document.getElementById('cat-list');
    if (catList) {
        catList.innerHTML = categories.map((c, index) => `
            <div class="category-item">
                <button class="move-btn" onclick="moveCategoryUp(${index})" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="move-btn" onclick="moveCategoryDown(${index})" ${index === categories.length - 1 ? 'disabled' : ''}>↓</button>
                ${c.name} (${c.slug}) 
                <button class="edit-btn" onclick="editCategory('${c.name}')">Редагувати</button> 
                <button class="delete-btn" onclick="deleteCategory('${c.name}')">Видалити</button>
            </div>
            <div class="subcat-list">
                ${(c.subcategories || []).map((sub, subIndex) => `
                    <p>
                        <button class="move-btn" onclick="moveSubcategoryUp('${c.name}', ${subIndex})" ${subIndex === 0 ? 'disabled' : ''}>↑</button>
                        <button class="move-btn" onclick="moveSubcategoryDown('${c.name}', ${subIndex})" ${subIndex === (c.subcategories.length - 1) ? 'disabled' : ''}>↓</button>
                        ${sub.name} (${sub.slug}) 
                        <button class="edit-btn" onclick="editSubcategory('${c.name}', '${sub.name}')">Редагувати</button> 
                        <button class="delete-btn" onclick="deleteSubcategory('${c.name}', '${sub.name}')">Видалити</button>
                    </p>
                `).join('')}
            </div>
        `).join('');
    }

    const filterList = document.getElementById('filter-list-admin');
    if (filterList) {
        filterList.innerHTML = filters.map((f, index) => `
            <p>
                <button class="move-btn" onclick="moveFilterUp(${index})" ${index === 0 ? 'disabled' : ''}>↑</button>
                <button class="move-btn" onclick="moveFilterDown(${index})" ${index === filters.length - 1 ? 'disabled' : ''}>↓</button>
                ${f.label} (${f.options.sort().join(', ')}) 
                <button class="edit-btn" onclick="editFilter('${f.name}')">Редагувати</button> 
                <button class="delete-btn" onclick="deleteFilter('${f.name}')">Видалити</button>
            </p>
        `).join('');
    }

    const orderFieldList = document.getElementById('order-field-list');
    if (orderFieldList) {
        orderFieldList.innerHTML = orderFields.map(f => `
            <p>${f.label} (${f.type}${f.options ? `: ${f.options.join(', ')}` : ''}) 
                <button class="edit-btn" onclick="editOrderField('${f.name}')">Редагувати</button> 
                <button class="delete-btn" onclick="deleteOrderField('${f.name}')">Видалити</button>
            </p>
        `).join('');
    }

    const slideList = document.getElementById('slide-list');
    if (slideList) {
        slideList.innerHTML = slides.map(s => `
            <p>Слайд #${s.order} 
                <button class="edit-btn" onclick="editSlide(${s.order})">Редагувати</button>
                <button class="delete-btn" onclick="deleteSlide(${s.order})">Видалити</button>
            </p>
        `).join('');
    }

    const subcatSelect = document.getElementById('subcat-category');
    if (subcatSelect) {
        subcatSelect.innerHTML = '<option value="">Виберіть категорію</option>' + 
            categories.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
    }

    if (activeTab === 'products') {
        const productList = document.getElementById('product-list-admin');
        if (productList) {
            if (Array.isArray(products) && products.length > 0) {
                const start = (currentPage - 1) * productsPerPage;
                const end = start + productsPerPage;
                const paginatedProducts = products.slice(start, end);
                productList.innerHTML = paginatedProducts.map(p => {
                    const saleInfo = p.salePrice ? `<s>${p.price || ''} грн</s> ${p.salePrice} грн ${renderCountdown(p)}` : `${p.price || ''} грн`;
                    const type = p.type || 'simple';
                    let priceDisplay;
                    if (type === 'mattresses') {
                        priceDisplay = p.sizes && Array.isArray(p.sizes) && p.sizes.length > 0 ? Math.min(...p.sizes.map(s => s.price || Infinity)) + ' грн' : 'Н/Д';
                    } else if (type === 'group') {
                        priceDisplay = p.groupProducts && Array.isArray(p.groupProducts) && p.groupProducts.length > 0 ? Math.min(...p.groupProducts.map(pid => {
                            const prod = products.find(pr => pr.id === pid);
                            return prod ? (prod.price || Infinity) : Infinity;
                        })) + ' грн' : 'Н/Д';
                    } else {
                        priceDisplay = p.price ? p.price + ' грн' : 'Н/Д';
                    }
                    const salePriceDisplay = p.salePrice ? `${p.salePrice} грн` : '';
                    const visibilityStatus = p.visible ? 'Видимість: Так' : 'Видимість: Ні';
                    return `
                        <div class="product-admin-item">
                            <span>#${p.id}</span>
                            <span>${type}</span>
                            <span>${p.name} (${p.slug || 'без шляху'})</span>
                            <span>${p.brand || 'Без бренду'}</span>
                            <span>${priceDisplay}</span>
                            <span>${salePriceDisplay}</span>
                            <div class="status-column" title="${visibilityStatus}">
                                <div class="buttons">
                                    <button class="edit-btn" onclick="openEditProductModal(${p.id})">Редагувати</button>
                                    <button class="delete-btn" onclick="deleteProduct(${p.id})">Видалити</button>
                                    <button class="toggle-btn" onclick="toggleProductActive(${p.id})">${p.active ? 'Деактивувати' : 'Активувати'}</button>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
                renderPagination(products.length, productsPerPage, 'pagination', currentPage);
            } else {
                productList.innerHTML = '<p>Немає товарів для відображення.</p>';
            }
        }
    }

    if (activeTab === 'orders') {
        const statusFilter = document.getElementById('order-status-filter')?.value || '';
        let filteredOrders = [...orders];
        if (statusFilter) {
            filteredOrders = filteredOrders.filter(o => o.status === statusFilter);
        }
        const start = (currentPage - 1) * ordersPerPage;
        const end = start + ordersPerPage;
        const paginatedOrders = filteredOrders.slice(start, end);
        const orderList = document.getElementById('order-list');
        if (orderList) {
            orderList.innerHTML = paginatedOrders.map((o, index) => {
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
            }).join('');
            renderPagination(filteredOrders.length, ordersPerPage, 'order-pagination', currentPage);
        }
    }
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
    try {
        document.getElementById('store-name').value = settings.name || '';
        document.getElementById('base-url').value = settings.baseUrl || '';
        document.getElementById('logo-url').value = settings.logo || '';
        document.getElementById('logo-width').value = settings.logoWidth || '';
        document.getElementById('favicon-url').value = settings.favicon || '';
        document.getElementById('contact-phones').value = settings.contacts?.phones || '';
        document.getElementById('contact-addresses').value = settings.contacts?.addresses || '';
        document.getElementById('contact-schedule').value = settings.contacts?.schedule || '';
        document.getElementById('social-toggle').checked = settings.showSocials ?? true;
        document.getElementById('slide-toggle').checked = settings.showSlides ?? true;
        document.getElementById('slide-width').value = settings.slideWidth || '';
        document.getElementById('slide-height').value = settings.slideHeight || '';
        document.getElementById('slide-interval').value = settings.slideInterval || '';
        document.getElementById('category-width').value = settings.categoryWidth || '';
        document.getElementById('category-height').value = settings.categoryHeight || '';
        document.getElementById('product-width').value = settings.productWidth || '';
        document.getElementById('product-height').value = settings.productHeight || '';

        // Рендеринг списків
        renderSocialsAdmin();
        renderCategoriesAdmin();
        renderSlidesAdmin();
        renderFilters();

        resetInactivityTimer();
    } catch (e) {
        console.error('Помилка рендерингу налаштувань:', e);
        showNotification('Помилка відображення налаштувань: ' + e.message);
    }
}

function renderSlidesAdmin() {
    const slideList = document.getElementById('slide-list');
    if (slideList) {
        slideList.innerHTML = slides.map((slide, index) => `
            <div>
                ${slide.title || 'Без назви'} (${slide.order || 0})
                <button class="edit-btn" onclick="editSlide(${index})">Редагувати</button>
                <button class="delete-btn" onclick="deleteSlide(${index})">Видалити</button>
            </div>
        `).join('');
    }
    document.getElementById('slide-toggle').checked = settings.showSlides || false;
    document.getElementById('slide-width').value = settings.slideWidth || '';
    document.getElementById('slide-height').value = settings.slideHeight || '';
    document.getElementById('slide-interval').value = settings.slideInterval || '';
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
    modal.classList.remove('active');
    modal.innerHTML = '';
    // Очищаємо глобальні функції
    window.deleteGroupProduct = undefined;
    window.addProductColor = undefined;
    window.deleteProductColor = undefined;
    window.addMattressSize = undefined;
    window.deleteMattressSize = undefined;
    window.addProductPhoto = undefined;
    window.deleteProductPhoto = undefined;
    window.addGroupProduct = undefined;
    window.dragGroupProduct = undefined;
    window.allowDropGroupProduct = undefined;
    window.dropGroupProduct = undefined;
    resetInactivityTimer();
}

async function addCategory() {
    try {
        const name = document.getElementById('cat-name').value.trim();
        const slug = document.getElementById('cat-slug').value.trim();
        const imgUrl = document.getElementById('cat-img-url').value.trim();
        const imgFile = document.getElementById('cat-img-file').files[0];

        if (!name || !slug) {
            showNotification('Введіть назву та шлях категорії!');
            return;
        }

        if (!/^[a-z0-9-]+$/.test(slug)) {
            showNotification('Шлях категорії може містити лише малі латинські літери, цифри та дефіси!');
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
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            imageUrl = data.url;
        }

        const category = { name, slug, image: imageUrl || null }; // Змінюємо "img" на "image", якщо схема очікує "image"

        const response = await fetchWithAuth('/api/categories', {
            method: 'POST',
            body: JSON.stringify(category)
        });

        const newCategory = await response.json();
        categories.push(newCategory);
        renderCategoriesAdmin();
        document.getElementById('cat-name').value = '';
        document.getElementById('cat-slug').value = '';
        document.getElementById('cat-img-url').value = '';
        document.getElementById('cat-img-file').value = '';
        showNotification('Категорію додано!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка додавання категорії:', err);
        showNotification('Не вдалося додати категорію: ' + err.message);
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

async function addSubcategory() {
    try {
        const name = document.getElementById('subcat-name').value.trim();
        const slug = document.getElementById('subcat-slug').value.trim();
        const imgUrl = document.getElementById('subcat-img-url').value.trim();
        const imgFile = document.getElementById('subcat-img-file').files[0];
        const categoryName = document.getElementById('subcat-category').value;

        if (!name || !slug || !categoryName) {
            showNotification('Введіть назву, шлях та виберіть категорію!');
            return;
        }

        if (!/^[a-z0-9-]+$/.test(slug)) {
            showNotification('Шлях підкатегорії може містити лише малі латинські літери, цифри та дефіси!');
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
            const response = await fetchWithAuth('/api/upload', {
                method: 'POST',
                body: formData
            });
            const data = await response.json();
            imageUrl = data.url;
        }

        const category = categories.find(c => c.name === categoryName);
        if (!category) {
            showNotification('Категорія не знайдена!');
            return;
        }

        const subcategory = { name, slug, image: imageUrl || null }; // Змінюємо "img" на "image"
        const response = await fetchWithAuth(`/api/categories/${category._id}/subcategories`, {
            method: 'POST',
            body: JSON.stringify(subcategory)
        });

        const newSubcategory = await response.json();
        if (!category.subcategories) category.subcategories = [];
        category.subcategories.push(newSubcategory);
        renderCategoriesAdmin();
        document.getElementById('subcat-name').value = '';
        document.getElementById('subcat-slug').value = '';
        document.getElementById('subcat-img-url').value = '';
        document.getElementById('subcat-img-file').value = '';
        document.getElementById('subcat-category').value = '';
        showNotification('Підкатегорію додано!');
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

async function addFilter() {
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const name = document.getElementById('filter-name').value;
        const label = document.getElementById('filter-label').value;
        const options = document.getElementById('filter-options').value.split(',').map(opt => opt.trim());

        if (!name || !label || options.length === 0 || options[0] === '') {
            showNotification('Введіть назву, відображувану назву та опції фільтру!');
            return;
        }

        const filter = { name, label, type: 'checkbox', options };
        filters.push(filter);

        const token = localStorage.getItem('adminToken');
        const baseUrl = settings.baseUrl || 'https://mebli.onrender.com';
        const response = await fetchWithAuth(`${baseUrl}/api/settings`, {
            method: 'PUT',
            body: JSON.stringify({ ...settings, filters })
        });

        renderFilters();
        document.getElementById('filter-name').value = '';
        document.getElementById('filter-label').value = '';
        document.getElementById('filter-options').value = '';
        showNotification('Фільтр додано!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка збереження фільтра:', err);
        showNotification('Помилка збереження фільтра: ' + err.message);
        // Відкатимо зміни у разі помилки
        filters.pop();
        renderFilters();
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

const debouncedSearchGroupProducts = debounce(searchGroupProducts, 300);

async function addSlide() {
    const button = document.querySelector('button[onclick="addSlide()"]');
    button.disabled = true;
    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const imgUrl = document.getElementById('slide-img-url').value;
        const imgFile = document.getElementById('slide-img-file').files[0];
        const title = document.getElementById('slide-title').value;
        const text = document.getElementById('slide-text').value;
        const link = document.getElementById('slide-link').value;
        const linkText = document.getElementById('slide-link-text').value;
        const order = parseInt(document.getElementById('slide-order').value) || slides.length + 1;

        if (!imgUrl && !imgFile) {
            showNotification('Введіть URL зображення або виберіть файл!');
            return;
        }

        const token = localStorage.getItem('adminToken');
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
            const response = await fetch('/api/upload', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`
                },
                credentials: 'include',
                body: formData
            });
            if (!response.ok) {
                throw new Error(`Помилка завантаження зображення: ${response.statusText}`);
            }
            const data = await response.json();
            imageUrl = data.url;
        }

        const slide = {
            img: imageUrl, // Змінено з image
            title: title || '',
            text: text || '',
            link: link || '',
            linkText: linkText || '',
            order
        };

        const response = await fetchWithAuth('/api/slides', {
            method: 'POST',
            body: JSON.stringify(slide)
        });

        const newSlide = await response.json();
        slides.push(newSlide);
        renderSlidesAdmin();
        showNotification('Слайд додано!');
        unsavedChanges = false;
        resetInactivityTimer();

        // Очистка полів
        document.getElementById('slide-img-url').value = '';
        document.getElementById('slide-img-file').value = '';
        document.getElementById('slide-title').value = '';
        document.getElementById('slide-text').value = '';
        document.getElementById('slide-link').value = '';
        document.getElementById('slide-link-text').value = '';
        document.getElementById('slide-order').value = '';
} catch (err) {
        console.error('Помилка додавання слайду:', err);
        showNotification('Не вдалося додати слайд: ' + err.message);
    } finally {
        button.disabled = false;
    }
}

// Додаємо обробник з дебонсінгом до кнопки
document.getElementById('slide-img-file').parentElement.querySelector('button[onclick="addSlide()"]').onclick = debounce(addSlide, 300);

    function editSlide(order) {
        const slide = slides.find(s => s.order === order);
        if (slide) {
            const modal = document.getElementById('modal');
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
                    <input type="text" id="edit-slide-url" value="${slide.url}"><br/>
                    <label for="edit-slide-url">Посилання</label>
                    <div class="modal-actions">
                        <button id="save-slide-btn">Зберегти</button>
                        <button id="cancel-slide-btn">Скасувати</button>
                    </div>
                </div>
            `;
            modal.classList.add('active');
            document.getElementById('save-slide-btn').addEventListener('click', () => saveSlideEdit(order));
            document.getElementById('cancel-slide-btn').addEventListener('click', closeModal);
            resetInactivityTimer();
        }
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

async function importSiteBackup() {
    const fileInput = document.getElementById('import-site-file');
    const file = fileInput.files[0];
    if (!file) {
        showNotification('Виберіть файл для імпорту!');
        return;
    }

    try {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const tokenRefreshed = await refreshToken();
                if (!tokenRefreshed) {
                    showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
                    showSection('admin-login');
                    return;
                }
                const response = await fetchWithAuth('/api/settings', {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
                if (response.ok) {
                    settings = data;
                    renderSettingsAdmin();
                    showNotification('Налаштування сайту імпортовано!');
                    await updateSiteMap();
                } else {
                    throw new Error('Помилка імпорту налаштувань сайту');
                }
            } catch (parseError) {
                console.error('Помилка парсингу JSON:', parseError);
                showNotification('Файл не є коректним JSON: ' + parseError.message);
            }
        };
        reader.readAsText(file);
    } catch (e) {
        console.error('Помилка імпорту налаштувань сайту:', e);
        showNotification('Помилка імпорту налаштувань сайту: ' + e.message);
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
    // Базова URL-адреса сайту з налаштувань
    const baseUrl = settings.baseUrl || 'https://mebli.onrender.com';
    
    // Початок XML-документа
    let sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n';
    sitemap += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    // Додаємо головну сторінку
    sitemap += '  <url>\n';
    sitemap += `    <loc>${baseUrl}</loc>\n`;
    sitemap += '    <lastmod>' + new Date().toISOString().split('T')[0] + '</lastmod>\n';
    sitemap += '    <changefreq>daily</changefreq>\n';
    sitemap += '    <priority>1.0</priority>\n';
    sitemap += '  </url>\n';

    // Додаємо сторінки категорій
    categories.forEach(category => {
        sitemap += '  <url>\n';
        sitemap += `    <loc>${baseUrl}/category/${encodeURIComponent(category.name)}</loc>\n`;
        sitemap += '    <lastmod>' + new Date().toISOString().split('T')[0] + '</lastmod>\n';
        sitemap += '    <changefreq>weekly</changefreq>\n';
        sitemap += '    <priority>0.8</priority>\n';
        sitemap += '  </url>\n';

        // Додаємо підкатегорії, якщо є
        if (category.subcategories && category.subcategories.length > 0) {
            category.subcategories.forEach(subcat => {
                sitemap += '  <url>\n';
                sitemap += `    <loc>${baseUrl}/category/${encodeURIComponent(category.name)}/${encodeURIComponent(subcat)}</loc>\n`;
                sitemap += '    <lastmod>' + new Date().toISOString().split('T')[0] + '</lastmod>\n';
                sitemap += '    <changefreq>weekly</changefreq>\n';
                sitemap += '    <priority>0.7</priority>\n';
                sitemap += '  </url>\n';
            });
        }
    });

    // Додаємо сторінки товарів
    products.forEach(product => {
        if (product.active && product.visible && product.slug) {
            sitemap += '  <url>\n';
            sitemap += `    <loc>${baseUrl}/product/${encodeURIComponent(product.slug)}</loc>\n`;
            sitemap += '    <lastmod>' + new Date().toISOString().split('T')[0] + '</lastmod>\n';
            sitemap += '    <changefreq>weekly</changefreq>\n';
            sitemap += '    <priority>0.6</priority>\n';
            sitemap += '  </url>\n';
        }
    });

    // Завершуємо XML-документ
    sitemap += '</urlset>';

    return sitemap;
}

async function updateSiteMap() {
    try {
        const sitemap = generateSitemap();
        const blob = new Blob([sitemap], { type: 'application/xml' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sitemap.xml';

        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const formData = new FormData();
        formData.append('file', blob, 'sitemap.xml');
        const response = await fetchWithAuth('/api/upload-sitemap', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Не вдалося оновити sitemap');
        }

        URL.revokeObjectURL(url);
        showNotification('Sitemap оновлено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення sitemap:', err);
        showNotification('Помилка оновлення sitemap: ' + err.message);
    }
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

    let newProduct = {
        type: 'simple',
        colors: [],
        photos: [],
        sizes: [],
        groupProducts: [],
        active: true,
        visible: true
    };

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
        colors: [],
        photos: [],
        sizes: [],
        groupProducts: []
    };
    const modal = document.getElementById('modal');
    modal.innerHTML = `
        <div class="modal-content">
            <h3>Додати новий товар</h3>
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
                <button onclick="addProduct()">Зберегти</button>
                <button onclick="closeModal()">Скасувати</button>
            </div>
        </div>
    `;
    modal.classList.add('active');
    updateProductType();
    initializeProductEditor();
    document.getElementById('product-category').addEventListener('change', updateSubcategories);
    updateSubcategories();
    resetInactivityTimer();

    // Обробники для відображення прев’ю фото
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
    const categoryName = document.getElementById('product-category').value;
    const subcatSelect = document.getElementById('product-subcategory');
    if (subcatSelect) {
        const category = categories.find(c => c.name === categoryName);
        subcatSelect.innerHTML = '<option value="">Без підкатегорії</option>';
        if (category && category.subcategories && category.subcategories.length > 0) {
            subcatSelect.innerHTML += category.subcategories
                .map(sub => `<option value="${sub.name}">${sub.name}</option>`)
                .join('');
        } else {
            subcatSelect.innerHTML = '<option value="">Підкатегорії відсутні</option>';
        }
    }
}

function addProductPhoto(newProduct) {
    const url = document.getElementById('product-photo-url').value;
    const photoInput = document.getElementById('product-photo-file');
    const files = photoInput ? photoInput.files : [];

    if (url) {
        newProduct.photos.push(url);
        document.getElementById('product-photo-url').value = '';
        renderPhotoList(newProduct);
        resetInactivityTimer();
    }

    if (files.length > 0) {
        Array.from(files).forEach(file => {
            const validation = validateFile(file);
            if (!validation.valid) {
                alert(validation.error);
                return;
            }
            newProduct.photos.push(file);
        });
        photoInput.value = '';
        renderPhotoList(newProduct);
        resetInactivityTimer();
    }
}

function renderPhotoList(newProduct) {
    const photoList = document.getElementById('product-photo-list');
    photoList.innerHTML = newProduct.photos.map((photo, index) => {
        const src = typeof photo === 'string' ? photo : URL.createObjectURL(photo);
        return `
            <div class="photo-item draggable" draggable="true" ondragstart="dragPhoto(event, ${index})" ondragover="allowDropPhoto(event)" ondrop="dropPhoto(event, ${index})">
                <img src="${src}" alt="Фото товару ${index + 1}">
                <button class="delete-btn" onclick="deleteProductPhoto(${index}, newProduct)">Видалити</button>
            </div>
        `;
    }).join('');
    resetInactivityTimer();
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

function deleteProductPhoto(index, newProduct) {
    newProduct.photos.splice(index, 1);
    renderPhotoList(newProduct);
    resetInactivityTimer();
}

async function addProduct(newProduct) {
    await saveProduct(newProduct, 'POST', '/api/products');
}

function addProductColor(newProduct) {
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
            renderColorsList(newProduct);
            resetInactivityTimer();
        } else if (url) {
            color.photo = url;
            newProduct.colors.push(color);
            document.getElementById('product-color-name').value = '';
            document.getElementById('product-color-value').value = '#000000';
            document.getElementById('product-color-price-change').value = '';
            document.getElementById('product-color-photo-url').value = '';
            if (colorPhotoInput) colorPhotoInput.value = '';
            renderColorsList(newProduct);
            resetInactivityTimer();
        } else {
            newProduct.colors.push(color);
            document.getElementById('product-color-name').value = '';
            document.getElementById('product-color-value').value = '#000000';
            document.getElementById('product-color-price-change').value = '';
            document.getElementById('product-color-photo-url').value = '';
            if (colorPhotoInput) colorPhotoInput.value = '';
            renderColorsList(newProduct);
            resetInactivityTimer();
        }
    } else {
        alert('Введіть назву та виберіть колір!');
    }
}

function renderColorsList(newProduct) {
    const colorList = document.getElementById('product-color-list');
    colorList.innerHTML = newProduct.colors.map((color, index) => {
        let photoSrc = '';
        if (color.photo) {
            if (typeof color.photo === 'string') {
                photoSrc = color.photo;
            } else if (color.photo instanceof File) {
                photoSrc = URL.createObjectURL(color.photo);
            }
        }
        return `
            <div class="color-item">
                <span class="color-preview" style="background-color: ${color.value};"></span>
                ${color.name} (Зміна ціни: ${color.priceChange} грн)
                ${photoSrc ? `<img src="${photoSrc}" alt="Фото кольору ${color.name}" style="max-width: 30px;">` : ''}
                <button class="delete-btn" onclick="deleteProductColor(${index}, newProduct)">Видалити</button>
            </div>
        `;
    }).join('');
}

function deleteProductColor(index, newProduct) {
    newProduct.colors.splice(index, 1);
    renderColorsList(newProduct);
    resetInactivityTimer();
}

function addMattressSize(newProduct) {
    const name = document.getElementById('mattress-size-name').value;
    const price = parseFloat(document.getElementById('mattress-size-price').value);

    if (name && !isNaN(price) && price >= 0) {
        newProduct.sizes.push({ name, price });
        document.getElementById('mattress-size-name').value = '';
        document.getElementById('mattress-size-price').value = '';
        renderMattressSizes(newProduct);
        resetInactivityTimer();
    } else {
        alert('Введіть розмір та ціну!');
    }
}

function renderMattressSizes(newProduct) {
    const sizeList = document.getElementById('mattress-size-list');
    sizeList.innerHTML = newProduct.sizes.map((size, index) => `
        <div class="mattress-size">
            ${size.name}: ${size.price} грн
            <button class="delete-btn" onclick="deleteMattressSize(${index}, newProduct)">Видалити</button>
        </div>
    `).join('');
}

function deleteMattressSize(index, newProduct) {
    newProduct.sizes.splice(index, 1);
    renderMattressSizes(newProduct);
    resetInactivityTimer();
}

function searchGroupProducts() {
    const query = document.getElementById('group-product-search').value.toLowerCase();
    const results = document.getElementById('group-product-results');
    const filteredProducts = products.filter(p => 
        p.active && 
        p.type === 'simple' && 
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

function renderGroupProducts(newProduct) {
    const groupList = document.getElementById('group-product-list');
    if (groupList) {
        groupList.innerHTML = newProduct.groupProducts.map((pid, index) => {
            const p = products.find(pr => pr.id === pid);
            return p ? `
                <div class="group-product draggable" draggable="true" ondragstart="dragGroupProduct(event, ${index})" ondragover="allowDropGroupProduct(event)" ondrop="dropGroupProduct(event, ${index})">
                    #${p.id} ${p.name}
                    <button class="delete-btn" onclick="deleteGroupProduct(${pid}, newProduct)">Видалити</button>
                </div>
            ` : '';
        }).join('');
    }
}

function dragGroupProduct(event, index) {
    event.dataTransfer.setData('text/plain', index);
    event.target.classList.add('dragging');
} // eslint-disable-line no-unused-vars

function allowDropGroupProduct(event) {
    event.preventDefault();
} // eslint-disable-line no-unused-vars

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
} // eslint-disable-line no-unused-vars

function deleteGroupProduct(productId, newProduct) {
    newProduct.groupProducts = newProduct.groupProducts.filter(pid => pid !== productId);
    renderGroupProducts(newProduct);
    resetInactivityTimer();
} // eslint-disable-line no-unused-vars

async function saveNewProduct() {
    const newProduct = {
        type: document.getElementById('product-type').value,
        photos: [],
        colors: [],
        sizes: [],
        groupProducts: [],
        active: true
    };

    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const name = document.getElementById('product-name').value.trim();
        const slug = document.getElementById('product-slug').value.trim();
        const brand = document.getElementById('product-brand').value.trim();
        const category = document.getElementById('product-category').value;
        const subcategory = document.getElementById('product-subcategory').value;
        const material = document.getElementById('product-material').value.trim();
        let price = null;
        let salePrice = null;
        if (newProduct.type === 'simple') {
            const priceValue = document.getElementById('product-price')?.value.trim();
            price = priceValue ? parseFloat(priceValue) : null;
            const salePriceValue = document.getElementById('product-sale-price')?.value.trim();
            salePrice = salePriceValue ? parseFloat(salePriceValue) : null;
        }
        const saleEnd = document.getElementById('product-sale-end').value;
        const visible = document.getElementById('product-visible').value === 'true';
        const description = document.getElementById('product-description').value || '';
        const widthCm = parseFloat(document.getElementById('product-width-cm').value) || null;
        const depthCm = parseFloat(document.getElementById('product-depth-cm').value) || null;
        const heightCm = parseFloat(document.getElementById('product-height-cm').value) || null;
        const lengthCm = parseFloat(document.getElementById('product-length-cm').value)

        // Валідація
        if (!name || !slug || !category) {
            showNotification('Заповніть назву, шлях і категорію товару!');
            return;
        }

        if (slug && !/^[a-z0-9-]+$/.test(slug)) {
            showNotification('Шлях товару може містити лише малі латинські літери, цифри та дефіси!');
            return;
        }

        // Перевірка унікальності slug
        try {
            const slugCheck = await fetchWithAuth(`/api/products?slug=${encodeURIComponent(slug)}`);
            const existingProducts = await slugCheck.json();
            if (existingProducts.some(p => p.slug === slug)) {
                showNotification('Шлях товару має бути унікальним!');
                return;
            }
        } catch (err) {
            console.error('Помилка перевірки унікальності:', err);
            showNotification('Помилка перевірки унікальності: ' + err.message);
            return;
        }

        if (newProduct.type === 'simple' && (isNaN(price) || price < 0)) {
            showNotification('Введіть коректну ціну для простого товару!');
            return;
        }

        if (salePrice !== null && (isNaN(salePrice) || salePrice < 0)) {
            showNotification('Введіть коректну акційну ціну!');
            return;
        }

        if (saleEnd) {
            const saleEndDate = new Date(saleEnd);
            if (isNaN(saleEndDate.getTime())) {
                showNotification('Введіть коректну дату закінчення акції!');
                return;
            }
            if (saleEndDate < new Date()) {
                showNotification('Дата закінчення акції не може бути в минулому!');
                return;
            }
        }

        if (newProduct.type === 'mattresses' && newProduct.sizes.length === 0) {
            showNotification('Додайте хоча б один розмір для матрацу!');
            return;
        }

        if (newProduct.type === 'group' && newProduct.groupProducts.length === 0) {
            showNotification('Додайте хоча б один товар до групового товару!');
            return;
        }

        if (widthCm !== null && (widthCm <= 0 || isNaN(widthCm))) {
            showNotification('Ширина товару має бути більше 0!');
            return;
        }

        if (depthCm !== null && (depthCm <= 0 || isNaN(depthCm))) {
            showNotification('Глибина товару має бути більше 0!');
            return;
        }

        if (heightCm !== null && (heightCm <= 0 || isNaN(heightCm))) {
            showNotification('Висота товару має бути більше 0!');
            return;
        }

        if (lengthCm !== null && (lengthCm <= 0 || isNaN(lengthCm))) {
            showNotification('Довжина товару має бути більше 0!');
            return;
        }

        // Додавання бренду, якщо його немає
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

        // Додавання матеріалу, якщо його немає
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
                priceChange: Number(color.priceChange) || 0,
                photo: null
            })),
            sizes: newProduct.sizes.map(size => ({
                name: size.name,
                price: Number(size.price) || 0
            })),
            groupProducts: newProduct.groupProducts,
            active: true,
            visible: visible
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
                if (!response.ok) {
                    throw new Error(`Помилка завантаження фото: ${response.statusText}`);
                }
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
                    if (!response.ok) {
                        throw new Error(`Помилка завантаження фото кольору: ${response.statusText}`);
                    }
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

        // Збереження товару (без поля id, нехай сервер генерує)
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
        console.error('Помилка при додаванні товару:', err, err.stack);
        showNotification('Не вдалося додати товар: ' + err.message);
    }
}

function openEditProductModal(productId) {
    const product = products.find(p => p.id === productId);
    if (product) {
        const newProduct = { ...product, colors: [...product.colors], photos: [...product.photos], sizes: [...product.sizes], groupProducts: [...product.groupProducts] };
        const escapedName = product.name.replace(/"/g, '&quot;');
        const modal = document.getElementById('modal');

        // Визначаємо функції, які використовують newProduct
        window.deleteGroupProduct = function(pid) {
            newProduct.groupProducts = newProduct.groupProducts.filter(p => p !== pid);
            renderGroupProducts(newProduct);
            resetInactivityTimer();
        };

         window.addProductColor = function() {
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
                    renderColorsList(newProduct);
                    resetInactivityTimer();
                } else if (url) {
                    color.photo = url;
                    newProduct.colors.push(color);
                    document.getElementById('product-color-name').value = '';
                    document.getElementById('product-color-value').value = '#000000';
                    document.getElementById('product-color-price-change').value = '';
                    document.getElementById('product-color-photo-url').value = '';
                    if (colorPhotoInput) colorPhotoInput.value = '';
                    renderColorsList(newProduct);
                    resetInactivityTimer();
                } else {
                    newProduct.colors.push(color);
                    document.getElementById('product-color-name').value = '';
                    document.getElementById('product-color-value').value = '#000000';
                    document.getElementById('product-color-price-change').value = '';
                    document.getElementById('product-color-photo-url').value = '';
                    if (colorPhotoInput) colorPhotoInput.value = '';
                    renderColorsList(newProduct);
                    resetInactivityTimer();
                }
            } else {
                alert('Введіть назву та виберіть колір!');
            }
        }; // eslint-disable-line no-unused-vars

        window.deleteProductColor = function(index) {
            newProduct.colors.splice(index, 1);
            renderColorsList(newProduct);
            resetInactivityTimer();
        }; // eslint-disable-line no-unused-vars

        window.addMattressSize = function() {
            const name = document.getElementById('mattress-size-name').value;
            const price = parseFloat(document.getElementById('mattress-size-price').value);

            if (name && !isNaN(price) && price >= 0) {
                newProduct.sizes.push({ name, price });
                document.getElementById('mattress-size-name').value = '';
                document.getElementById('mattress-size-price').value = '';
                renderMattressSizes(newProduct);
                resetInactivityTimer();
            } else {
                alert('Введіть розмір та ціну!');
            }
        }; // eslint-disable-line no-unused-vars

        window.deleteMattressSize = function(index) {
            newProduct.sizes.splice(index, 1);
            renderMattressSizes(newProduct);
            resetInactivityTimer();
        }; // eslint-disable-line no-unused-vars

        window.addProductPhoto = function() {
            const url = document.getElementById('product-photo-url').value;
            const photoInput = document.getElementById('product-photo-file');
            const files = photoInput ? photoInput.files : [];

            if (url) {
                newProduct.photos.push(url);
                document.getElementById('product-photo-url').value = '';
                renderPhotoList(newProduct);
                resetInactivityTimer();
            }

            if (files.length > 0) {
                Array.from(files).forEach(file => {
                    const validation = validateFile(file);
                    if (validation.valid) {
                        newProduct.photos.push(file);
                    } else {
                        showNotification(validation.error);
                    }
                });
                photoInput.value = '';
                renderPhotoList(newProduct);
                resetInactivityTimer();
            }
        }; // eslint-disable-line no-unused-vars

        window.deleteProductPhoto = function(index) {
            newProduct.photos.splice(index, 1);
            renderPhotoList(newProduct);
            resetInactivityTimer();
        }; // eslint-disable-line no-unused-vars

        window.addGroupProduct = function(productId) {
            if (!newProduct.groupProducts.includes(productId)) {
                newProduct.groupProducts.push(productId);
                renderGroupProducts(newProduct);
                document.getElementById('group-product-search').value = '';
                document.getElementById('group-product-results').innerHTML = '';
                resetInactivityTimer();
            }
        }; // eslint-disable-line no-unused-vars

        window.dragGroupProduct = function(event, index) {
            event.dataTransfer.setData('text/plain', index);
            event.target.classList.add('dragging');
        };

        window.allowDropGroupProduct = function(event) {
            event.preventDefault();
        };

        window.dropGroupProduct = function(event, targetIndex) {
            event.preventDefault();
            const sourceIndex = parseInt(event.dataTransfer.getData('text/plain'));
            if (sourceIndex !== targetIndex) {
                const [movedProduct] = newProduct.groupProducts.splice(sourceIndex, 1);
                newProduct.groupProducts.splice(targetIndex, 0, movedProduct);
                renderGroupProducts(newProduct);
                unsavedChanges = true;
                resetInactivityTimer();
            }
            document.querySelectorAll('.group-product').forEach(item => item.classList.remove('dragging'));
        };

        modal.innerHTML = `
            <div class="modal-content">
                <h3>Редагувати товар #${product.id}</h3>
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
                    <button onclick="saveEditedProduct(${product.id}, newProduct)">Зберегти</button>
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
        renderColorsList(newProduct);
        renderPhotoList(newProduct);
        renderMattressSizes(newProduct);
        renderGroupProducts(newProduct);

        const photoInput = document.getElementById('product-photo-file');
        photoInput.addEventListener('change', () => {
            const files = photoInput.files;
            Array.from(files).forEach(file => {
                if (!newProduct.photos.includes(file)) {
                    newProduct.photos.push(file);
                }
            });
            renderPhotoList(newProduct);
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
                    renderColorsList(newProduct);
                    resetInactivityTimer();
                }
            }
        });

        resetInactivityTimer();
    }
}

async function saveEditedProduct(productId, newProduct) {
    if (!productId || isNaN(parseInt(productId))) {
        showNotification('Некоректний ID товару!');
        return;
    }
    newProduct.id = productId; // Додаємо ID для перевірки унікальності
    await saveProduct(newProduct, 'PUT', `/api/products/${productId}`);
}

async function deleteProduct(productId) {
    if (confirm('Ви впевнені, що хочете видалити цей товар?')) {
        try {
            const response = await fetchWithAuth(`/api/products/${productId}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Помилка при видаленні товару: ' + response.statusText);
            }

            products = products.filter(p => p.id !== productId);
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
    const product = products.find(p => p.id === productId);
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
        } else {
            valA = a[key];
            valB = b[key];
            if (typeof valA === 'string') {
                return order === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valB);
            }
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
    const file = document.getElementById('bulk-price-file').files[0];
    if (!file) {
        showNotification('Виберіть файл для завантаження!');
        return;
    }

    try {
        const tokenRefreshed = await refreshToken();
        if (!tokenRefreshed) {
            showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
            showSection('admin-login');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (e) => {
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
                                throw new Error(`Помилка оновлення товару #${id}`);
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
                                    throw new Error(`Помилка оновлення товару #${id}`);
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
    } catch (e) {
        console.error('Помилка оновлення цін:', e);
        showNotification('Помилка оновлення цін: ' + e.message);
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
        if (!order || !order._id) {
            showNotification('Замовлення не знайдено або недійсне!');
            return;
        }

        const newStatus = document.getElementById('new-order-status').value;
        if (!newStatus) {
            showNotification('Виберіть новий статус!');
            return;
        }

        // Очищаємо items від системних полів
        const cleanedItems = (order.items || []).map(item => {
            const { _id, ...cleanedItem } = item;
            return cleanedItem;
        });

        const updatedOrder = {
            status: newStatus,
            date: order.date,
            total: order.total || 0,
            customer: order.customer || {},
            items: cleanedItems
        };

        const response = await fetchWithAuth(`/api/orders/${order._id}`, {
            method: 'PUT',
            body: JSON.stringify(updatedOrder)
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(`Помилка оновлення статусу: ${errorData.error || response.statusText}`);
        }

        // Оновлюємо локальний масив orders
        orders[index] = { ...order, ...updatedOrder };
        closeModal();
        renderAdmin('orders');
        showNotification('Статус замовлення змінено!');
        resetInactivityTimer();
    } catch (err) {
        console.error('Помилка оновлення статусу замовлення:', err, err.stack);
        showNotification('Не вдалося оновити статус замовлення: ' + err.message);
    }
}

async function deleteOrder(index) {
    if (confirm('Ви впевнені, що хочете видалити це замовлення?')) {
        try {
            const tokenRefreshed = await refreshToken();
            if (!tokenRefreshed) {
                showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
                showSection('admin-login');
                return;
            }

            const order = orders[index];
            if (!order || !order._id) {
                showNotification('Замовлення не знайдено або недійсне!');
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
        } catch (e) {
            console.error('Помилка видалення замовлення:', e);
            showNotification('Помилка видалення замовлення: ' + e.message);
        }
    }
}

    function filterOrders() {
        currentPage = 1;
        renderAdmin('orders');
        resetInactivityTimer();
    }

function connectAdminWebSocket(attempt = 1, maxAttempts = 10) {
    const wsUrl = window.location.hostname === 'localhost'
        ? 'ws://localhost:3000'
        : 'wss://mebli.onrender.com';
    const token = localStorage.getItem('adminToken');

    if (!token) {
        console.warn('Токен відсутній, WebSocket не підключено');
        showSection('admin-login');
        showNotification('Токен відсутній. Будь ласка, увійдіть знову.');
        return;
    }

    if (socket && socket.readyState === WebSocket.OPEN) {
        console.log('WebSocket уже підключено');
        return;
    }

    if (attempt > maxAttempts) {
        console.error('Досягнуто максимальну кількість спроб підключення до WebSocket');
        showNotification('Не вдалося підключитися до WebSocket після кількох спроб.');
        return;
    }

    socket = new WebSocket(`${wsUrl}?token=${encodeURIComponent(token)}`);

    socket.onopen = () => {
        console.log('Адмін підключено до WebSocket');
        const subscriptions = ['products', 'categories', 'settings', 'orders', 'slides', 'materials', 'brands', 'filters'];
        subscriptions.forEach(type => {
            if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type, action: 'subscribe' }));
            }
        });
        resetInactivityTimer();
    };

    socket.onmessage = (event) => {
        try {
            const { type, data } = JSON.parse(event.data);
            console.log(`Отримано WebSocket оновлення для ${type}:`, data);
            if (type === 'settings') {
                settings = { ...settings, ...data };
                renderSettingsAdmin();
            } else if (type === 'products') {
                products = data;
                renderAdmin('products');
            } else if (type === 'categories') {
                categories = data;
                renderCategoriesAdmin();
            } else if (type === 'orders') {
                orders = data;
                renderAdmin('orders');
            } else if (type === 'slides') {
                slides = data;
                renderSlidesAdmin();
            } else if (type === 'materials') {
                materials = data;
                updateMaterialOptions();
            } else if (type === 'brands') {
                brands = data;
                updateBrandOptions();
            } else if (type === 'filters') {
                filters = data;
                renderFilters();
            }
            resetInactivityTimer();
        } catch (e) {
            console.error('Помилка обробки WebSocket повідомлення:', e);
        }
    };

    socket.onclose = (event) => {
        console.log(`WebSocket закрито, код: ${event.code}, причина: ${event.reason}`);
        if (event.code === 4001) { // Код 4001 для помилки авторизації
            localStorage.removeItem('adminToken');
            session = { isActive: false, timestamp: 0 };
            localStorage.setItem('adminSession', LZString.compressToUTF16(JSON.stringify(session)));
            showSection('admin-login');
            showNotification('Сесія закінчилася. Будь ласка, увійдіть знову.');
        } else {
            const delay = Math.min(1000 * Math.pow(2, attempt), 30000);
            console.log(`Спроба перепідключення ${attempt}/${maxAttempts} через ${delay}мс...`);
            setTimeout(() => connectAdminWebSocket(attempt + 1, maxAttempts), delay);
        }
    };

    socket.onerror = (error) => {
        console.error('Помилка WebSocket:', error);
        showNotification('Помилка підключення до WebSocket. Перевірте з’єднання.');
    };
}

document.getElementById('import-site-file').addEventListener('change', async function() {
    const file = this.files[0];
    if (file) {
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const data = JSON.parse(e.target.result);
                const tokenRefreshed = await refreshToken();
                if (!tokenRefreshed) {
                    showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
                    showSection('admin-login');
                    return;
                }
                const response = await fetchWithAuth('/api/settings', {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
                if (response.ok) {
                    settings = data;
                    renderSettingsAdmin();
                    showNotification('Налаштування сайту імпортовано!');
                    // Оновлюємо sitemap після імпорту
                    await updateSiteMap();
                } else {
                    throw new Error('Помилка імпорту налаштувань сайту');
                }
            };
            reader.readAsText(file);
        } catch (e) {
            console.error('Помилка імпорту налаштувань сайту:', e);
            showNotification('Помилка імпорту налаштувань сайту: ' + e.message);
        }
    }
});

document.getElementById('import-products-file').addEventListener('change', async function() {
    const file = this.files[0];
    if (file) {
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const data = JSON.parse(e.target.result);
                const tokenRefreshed = await refreshToken();
                if (!tokenRefreshed) {
                    showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
                    showSection('admin-login');
                    return;
                }
                const response = await fetchWithAuth('/api/products/bulk', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                if (response.ok) {
                    products = data;
                    renderAdmin('products');
                    showNotification('Товари імпортовано!');
                    // Оновлюємо sitemap після імпорту
                    await updateSiteMap();
                } else {
                    throw new Error('Помилка імпорту товарів');
                }
            };
            reader.readAsText(file);
        } catch (e) {
            console.error('Помилка імпорту товарів:', e);
            showNotification('Помилка імпорту товарів: ' + e.message);
        }
    }
});

document.getElementById('import-orders-file').addEventListener('change', async function() {
    const file = this.files[0];
    if (file) {
        try {
            const reader = new FileReader();
            reader.onload = async (e) => {
                const data = JSON.parse(e.target.result);
                const tokenRefreshed = await refreshToken();
                if (!tokenRefreshed) {
                    showNotification('Токен відсутній або недійсний. Будь ласка, увійдіть знову.');
                    showSection('admin-login');
                    return;
                }
                const response = await fetchWithAuth('/api/orders/bulk', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                if (response.ok) {
                    orders = data;
                    renderAdmin('orders');
                    showNotification('Замовлення імпортовано!');
                    // Оновлюємо sitemap після імпорту
                    await updateSiteMap();
                } else {
                    throw new Error('Помилка імпорту замовлень');
                }
            };
            reader.readAsText(file);
        } catch (e) {
            console.error('Помилка імпорту замовлень:', e);
            showNotification('Помилка імпорту замовлень: ' + e.message);
        }
    }
});

document.getElementById('bulk-price-file').addEventListener('change', function() {
    uploadBulkPrices();
});

window.addEventListener('beforeunload', (e) => {
    if (unsavedChanges) {
        const confirmationMessage = 'У вас є незбережені зміни. Ви впевнені, що хочете залишити сторінку?';
        e.returnValue = confirmationMessage;
        return confirmationMessage;
    }
});