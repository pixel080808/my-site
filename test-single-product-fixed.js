const puppeteer = require('puppeteer');
const fs = require('fs');

// Конфігурація для вашого сайту
const SITE_CONFIG = {
    category: 'vitalni',
    subcategory: 'miromark',
    brand: 'MiroMark',
    material: 'Ламіноване ДСП',
    type: 'simple'
};

// Функція для перевірки чи URL є товаром
function isProductUrl(url) {
    // Категорії та інформаційні сторінки, які НЕ є товарами
    const categoryAndInfoPages = [
        'mebli-dlya-vitalni', 'mebli-dlya-kuhni', 'dytyachi-mebli',
        'mebli-dlya-spalen', 'mebli-dlya-ofisu', 'mebli-dlya-peredpokoyu',
        'ortopedychni-matracy', 'domashnij-tekstyl', 'banketky-ta-lavky',
        'dostavka', 'oplata', 'garantiya', 'kredyt-ta-rozstrochka',
        'pro-nas', 'dogovir-publichnoyi-oferty', 'povernennya',
        'kontakty', 'about', 'contact', 'delivery', 'payment',
        'warranty', 'credit', 'return', 'terms', 'privacy'
    ];
    
    // Перевіряємо чи URL містить категорію або інформаційну сторінку
    for (const category of categoryAndInfoPages) {
        if (url.includes(category)) {
            return false;
        }
    }
    
    // Перевіряємо чи URL має достатньо сегментів (товари зазвичай мають більше сегментів)
    const urlParts = url.split('/').filter(part => part.length > 0);
    if (urlParts.length < 4) {
        return false;
    }
    
    // Перевіряємо чи останній сегмент не є категорією
    const lastSegment = urlParts[urlParts.length - 1];
    if (lastSegment.includes('mebli') || lastSegment.includes('matracy') || 
        lastSegment.includes('tekstyl') || lastSegment.includes('banketky')) {
        return false;
    }
    
    // Перевіряємо чи URL не містить параметрів сторінок
    if (url.includes('page=') || url.includes('p=') || url.includes('pagination')) {
        return false;
    }
    
    return true;
}

// Функція для генерації унікального slug
function generateUniqueSlug(url, existingSlugs = new Set()) {
    const urlParts = url.split('/').filter(part => part.length > 0);
    let slug = urlParts[urlParts.length - 1];
    
    // Якщо останній сегмент порожній, беремо попередній
    if (!slug || slug.length === 0) {
        slug = urlParts[urlParts.length - 2] || 'product';
    }
    
    // Очищаємо slug від параметрів
    slug = slug.replace(/\?.*$/, '').replace(/#.*/, '');
    
    // Якщо slug є категорією, генеруємо унікальний
    const categorySlugs = [
        'mebli-dlya-vitalni', 'mebli-dlya-kuhni', 'dytyachi-mebli',
        'mebli-dlya-spalen', 'mebli-dlya-ofisu', 'mebli-dlya-peredpokoyu',
        'ortopedychni-matracy', 'domashnij-tekstyl', 'banketky-ta-lavky'
    ];
    
    if (categorySlugs.includes(slug)) {
        slug = `product-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    }
    
    // Перевіряємо унікальність
    let uniqueSlug = slug;
    let counter = 1;
    while (existingSlugs.has(uniqueSlug)) {
        uniqueSlug = `${slug}-${counter}`;
        counter++;
    }
    
    return uniqueSlug;
}

async function testSingleProduct() {
    const browser = await puppeteer.launch({ 
        headless: true, // Швидше для тестування
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-web-security',
            '--disable-features=VizDisplayCompositor',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--disable-extensions',
            '--no-first-run',
            '--disable-default-apps',
            '--disable-popup-blocking',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-field-trial-config',
            '--disable-ipc-flooding-protection',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        ]
    });
    
    const page = await browser.newPage();
    const products = [];
    const existingSlugs = new Set();
    
    try {
        // Встановлюємо user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Приховуємо автоматизацію
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
            
            window.chrome = {
                runtime: {},
            };
            
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            Object.defineProperty(navigator, 'languages', {
                get: () => ['uk-UA', 'uk', 'en-US', 'en'],
            });
        });
        
        console.log('🧪 Починаю тестування на одному товарі...');
        
        // Використовуємо конкретний URL товару для тестування
        const testProductUrl = 'https://miromark.shop/ua/lizhko-dzhennifer-miromark';
        console.log(`🔍 Тестую конкретний товар: ${testProductUrl}`);
        
        // Перевіряємо чи це дійсно товар
        if (!isProductUrl(testProductUrl)) {
            console.log('❌ URL не є товаром за нашими критеріями');
            console.log('URL частини:', testProductUrl.split('/').filter(part => part.length > 0));
            return;
        }
        
        console.log('✅ URL пройшов перевірку як товар');
        
        // Переходимо на сторінку товару
        await page.goto(testProductUrl, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Збираємо детальну інформацію про товар
        const productData = await page.evaluate(() => {
            // Назва товару
            const nameSelectors = [
                'h1', '.product-name', '.item-name', '.name',
                '[class*="name"]', '[class*="title"]', '.product-title'
            ];
            let name = '';
            for (const selector of nameSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.trim()) {
                    name = element.textContent.trim();
                    break;
                }
            }
            
            // Ціна - покращені селектори
            let price = null;
            const priceSelectors = [
                '.price', '.product-price', '[class*="price"]',
                '.current-price', '.new-price', '.regular-price',
                '.product-cost', '[class*="cost"]', '.price-value',
                '.product-price-value', '.price-new', '.price-current',
                '.product__price', '.product__price--new', '.product__price--old',
                '.product__price--current', '.product__price--discount', '.product__price--main',
                '.product__price--sale', '.product__price--regular', '.product__price--special',
                '.product__price--final', '.product__price--actual', '.product__price--real',
                '.product__price--now', '.product-old-price', '.product-new-price',
                '.product-price-value', '.product-price-amount', '.product-price-final',
                '.product-price-current', '.product-price-main', '.product-price-discount',
                '.product-price-sale', '.product-price-regular', '.product-price-special',
                '.product-price-final', '.product-price-actual', '.product-price-real',
                '.product-price-now', '.price-block', '.price-box', '.price-wrapper',
                '.price__value', '.price__main', '.price__current', '.price__discount',
                '.price__sale', '.price__regular', '.price__special', '.price__final',
                '.price__actual', '.price__real', '.price__now', '.price-amount',
                '.price-final', '.price-current', '.price-main', '.price-discount',
                '.price-sale', '.price-regular', '.price-special', '.price-final',
                '.price-actual', '.price-real', '.price-now', '.product-price__value',
                '.product-price__main', '.product-price__current', '.product-price__discount',
                '.product-price__sale', '.product-price__regular', '.product-price__special',
                '.product-price__final', '.product-price__actual', '.product-price__real',
                '.product-price__now', '.product__main-price', '.product__discount-price',
                '.product__sale-price', '.product__regular-price', '.product__special-price',
                '.product__final-price', '.product__actual-price', '.product__real-price',
                '.product__now-price', '.product__price-amount', '.product__price-final',
                '.product__price-current', '.product__price-main', '.product__price-discount',
                '.product__price-sale', '.product__price-regular', '.product__price-special',
                '.product__price-final', '.product__price-actual', '.product__price-real',
                '.product__price-now', '.product__price-block', '.product__price-box',
                '.product__price-wrapper', '.product__price__value', '.product__price__main',
                '.product__price__current', '.product__price__discount', '.product__price__sale',
                '.product__price__regular', '.product__price__special', '.product__price__final',
                '.product__price__actual', '.product__price__real', '.product__price__now'
            ];
            for (const selector of priceSelectors) {
                const priceEl = document.querySelector(selector);
                if (priceEl) {
                    const priceText = priceEl.textContent.replace(/[^\d]/g, '');
                    if (priceText) {
                        const parsedPrice = parseInt(priceText);
                        if (parsedPrice > 100 && parsedPrice < 1000000 && !isNaN(parsedPrice)) {
                            price = parsedPrice;
                            break;
                        }
                    }
                }
            }
            // Якщо не знайдено ціну — резервний пошук по всій сторінці
            if (!price) {
                const allText = document.body.innerText;
                const priceMatches = allText.match(/(\d{3,6})\s*грн/g);
                if (priceMatches && priceMatches.length > 0) {
                    for (const match of priceMatches) {
                        const num = parseInt(match.replace(/[^\d]/g, ''));
                        if (num > 100 && num < 1000000) {
                            price = num;
                            break;
                        }
                    }
                } else {
                    // Шукаємо просто великі числа (можливо без "грн")
                    const numMatches = allText.match(/\d{4,6}/g);
                    if (numMatches) {
                        for (const n of numMatches) {
                            const num = parseInt(n);
                            if (num > 100 && num < 1000000) {
                                price = num;
                                break;
                            }
                        }
                    }
                }
            }
            if (!price) {
                console.log('❗️ Не знайдено ціну для товару:', name, window.location.href);
                price = 1;
            }
            
            // Акційна ціна
            let salePrice = null;
            const saleSelectors = [
                '.sale-price', '.discount-price', '[class*="sale"]',
                '.old-price', '.special-price', '.discount',
                '.price-old', '.product-old-price', '.price-special'
            ];
            
            for (const selector of saleSelectors) {
                const saleEl = document.querySelector(selector);
                if (saleEl) {
                    const saleText = saleEl.textContent.replace(/[^\d]/g, '');
                    if (saleText) {
                        const parsedSale = parseInt(saleText);
                        if (parsedSale > 0 && parsedSale < 1000000 && !isNaN(parsedSale)) {
                            salePrice = parsedSale;
                            break;
                        }
                    }
                }
            }
            
            // Всі фото товару - покращена логіка
            const allPhotos = [];
            const photoSelectors = [
                'img[src*="miromark"]', 'img[src*="/uploads/"]', 'img[src*="/products/"]',
                'img[src*="/product/"]', 'img[src*="/item/"]', '.product-image img',
                '.gallery img', '.product-photo img', '.main-image img',
                '.product-images img', '.image-gallery img', '.swiper-slide img',
                '.product-gallery img', '.photos img', '.images img'
            ];
            
            for (const selector of photoSelectors) {
                const images = document.querySelectorAll(selector);
                images.forEach(img => {
                    if (img.src && img.src.startsWith('http') && 
                        !img.src.includes('logo') && 
                        !img.src.includes('banner') &&
                        !allPhotos.includes(img.src)) {
                        allPhotos.push(img.src);
                    }
                });
            }
            
            // Якщо не знайшли фото, шукаємо будь-які зображення
            if (allPhotos.length === 0) {
                const allImages = document.querySelectorAll('img[src*="http"]');
                allImages.forEach(img => {
                    if (img.src && 
                        !img.src.includes('logo') && 
                        !img.src.includes('banner') &&
                        !img.src.includes('icon') &&
                        !allPhotos.includes(img.src)) {
                        allPhotos.push(img.src);
                    }
                });
            }
            
            // Опис товару
            let description = '';
            const descSelectors = [
                '.description', '.product-description', '.item-description',
                '[class*="description"]', '.content', '.product-content',
                '.details', '.product-details', '.info', '.product-info'
            ];
            
            for (const selector of descSelectors) {
                const element = document.querySelector(selector);
                if (element && element.innerHTML.trim()) {
                    description = element.innerHTML.trim();
                    break;
                }
            }
            
            // Матеріал
            let material = '';
            const materialSelectors = [
                '.material', '.product-material', '[class*="material"]',
                '.characteristics', '.product-characteristics',
                '.specifications', '.product-specifications'
            ];
            
            for (const selector of materialSelectors) {
                const element = document.querySelector(selector);
                if (element && element.textContent.includes('матеріал')) {
                    const text = element.textContent.toLowerCase();
                    if (text.includes('дуб')) material = 'Дуб';
                    else if (text.includes('сосна')) material = 'Сосна';
                    else if (text.includes('ясен')) material = 'Ясен';
                    else if (text.includes('мдф')) material = 'МДФ';
                    else if (text.includes('дсп')) material = 'ДСП';
                    else if (text.includes('шпон')) material = 'Шпон';
                    break;
                }
            }
            
            // Розміри
            let widthCm = null, depthCm = null, heightCm = null;
            const sizeText = document.body.textContent;
            const sizeMatches = sizeText.match(/(\d+)\s*[xх]\s*(\d+)/g);
            if (sizeMatches && sizeMatches.length > 0) {
                const firstSize = sizeMatches[0].match(/(\d+)\s*[xх]\s*(\d+)/);
                if (firstSize) {
                    widthCm = parseInt(firstSize[1]);
                    depthCm = parseInt(firstSize[2]);
                }
            }
            
            return {
                name,
                price,
                salePrice,
                photos: allPhotos,
                description,
                material,
                widthCm,
                depthCm,
                heightCm
            };
        });
        
        console.log('📊 Дані товару:');
        console.log('   Назва:', productData.name);
        console.log('   Ціна:', productData.price);
        console.log('   Акційна ціна:', productData.salePrice);
        console.log('   Кількість фото:', productData.photos.length);
        console.log('   Матеріал:', productData.material);
        console.log('   Розміри:', `${productData.widthCm}x${productData.depthCm}x${productData.heightCm}`);
        
        // Визначаємо тип товару
        const productType = 'simple';
        
        // Переконуємося що всі обов'язкові поля присутні
        if (productData.name && productData.name.length > 0) {
            // Генеруємо унікальний slug
            const slug = generateUniqueSlug(testProductUrl, existingSlugs);
            existingSlugs.add(slug);
            
            console.log('🔗 Згенерований slug:', slug);

            const convertedProduct = {
                type: productType,
                name: productData.name,
                slug: slug,
                brand: SITE_CONFIG.brand,
                category: SITE_CONFIG.category,
                subcategory: SITE_CONFIG.subcategory,
                material: productData.material || SITE_CONFIG.material,
                price: productData.price,
                salePrice: productData.salePrice,
                saleEnd: null,
                description: productData.description || `<p>${productData.name}</p>`,
                widthCm: productData.widthCm,
                depthCm: productData.depthCm,
                heightCm: productData.heightCm,
                lengthCm: null,
                photos: productData.photos,
                colors: [],
                sizes: [],
                groupProducts: [],
                active: true,
                visible: true,
                filters: [],
                popularity: 0,
                metaDescription: '',
                metaKeywords: '',
                metaTitle: ''
            };
            
            products.push(convertedProduct);
            console.log(`✅ Товар успішно оброблено: ${productData.name} (${productType})`);
        } else {
            console.log('❌ Не вдалося отримати назву товару');
        }
        
        console.log(`\n📊 Тестування завершено! Зібрано ${products.length} товарів`);
        
        // Зберігаємо результат
        const outputPath = 'exports/test-single-product-fixed.json';
        fs.writeFileSync(outputPath, JSON.stringify(products, null, 2));
        
        console.log(`💾 Результат збережено в: ${outputPath}`);
        
        // Показуємо детальну інформацію про товар
        if (products.length > 0) {
            const product = products[0];
            console.log(`\n📋 Детальна інформація про товар:`);
            console.log(`   Тип: ${product.type}`);
            console.log(`   Назва: ${product.name}`);
            console.log(`   Slug: ${product.slug}`);
            console.log(`   Бренд: ${product.brand}`);
            console.log(`   Категорія: ${product.category}`);
            console.log(`   Підкатегорія: ${product.subcategory}`);
            console.log(`   Матеріал: ${product.material}`);
            console.log(`   Ціна: ${product.price}`);
            console.log(`   Акційна ціна: ${product.salePrice}`);
            console.log(`   Кількість фото: ${product.photos.length}`);
            console.log(`   Розміри: ${product.widthCm}x${product.depthCm}x${product.heightCm}`);
            console.log(`   Активний: ${product.active}`);
            console.log(`   Видимий: ${product.visible}`);
        }
        
    } catch (error) {
        console.error('❌ Помилка при виконанні тесту:', error);
    } finally {
        await browser.close();
    }
}

// Запускаємо тест
testSingleProduct().catch(console.error); 