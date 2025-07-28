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

async function scrapeMiroMarkFixed() {
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    const products = [];
    
    try {
        console.log('🔍 Починаю збір товарів з MiroMark (виправлена версія)...');
        
        // Переходимо на головну сторінку
        await page.goto('https://miromark.shop/ua', { waitUntil: 'networkidle2' });
        
        // Отримуємо всі категорії товарів
        const categories = await page.evaluate(() => {
            const categoryLinks = Array.from(document.querySelectorAll('a[href*="/ua/"]'));
            return categoryLinks
                .map(link => link.href)
                .filter(href => {
                    // Фільтруємо тільки категорії товарів, виключаємо сторінки інформації
                    const excludePages = [
                        '/dostavka', '/oplata', '/garantiya', '/kredyt-ta-rozstrochka',
                        '/pro-nas', '/dogovir-publichnoyi-oferty', '/povernennya',
                        '/index.php?route=account/wishlist', '/index.php?route=product/compare',
                        '/index.php?route=checkout/simplecheckout', '/index.php?route=information/contact',
                        '/index.php?route=product/special'
                    ];
                    
                    return href.includes('/ua/') && 
                           !href.includes('#') && 
                           !href.includes('mailto') &&
                           !excludePages.some(page => href.includes(page));
                })
                .filter((href, index, arr) => arr.indexOf(href) === index);
        });
        
        console.log(`📂 Знайдено ${categories.length} категорій для обробки`);
        
        // Обробляємо кожну категорію
        for (let i = 0; i < categories.length; i++) {
            const categoryUrl = categories[i];
            console.log(`\n📁 Обробляю категорію ${i + 1}/${categories.length}: ${categoryUrl}`);
            
            try {
                await page.goto(categoryUrl, { waitUntil: 'networkidle2' });
                
                // Чекаємо завантаження сторінки
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Отримуємо всі товари з поточної сторінки
                const categoryProducts = await page.evaluate(() => {
                    // Шукаємо товари в різних селекторах
                    const productSelectors = [
                        '.product-item',
                        '.catalog-item', 
                        '[class*="product"]',
                        '.item',
                        '.product',
                        '.product-thumb',
                        '.product-layout',
                        '.product-grid'
                    ];
                    
                    let productElements = [];
                    for (const selector of productSelectors) {
                        const elements = document.querySelectorAll(selector);
                        if (elements.length > 0) {
                            productElements = Array.from(elements);
                            break;
                        }
                    }
                    
                    // Якщо не знайшли товари, шукаємо посилання на товари
                    if (productElements.length === 0) {
                        const productLinks = document.querySelectorAll('a[href*="/ua/"][href*="product"], a[href*="/ua/"][href*="lizhko"], a[href*="/ua/"][href*="vitalnya"], a[href*="/ua/"][href*="shafa"], a[href*="/ua/"][href*="komod"], a[href*="/ua/"][href*="dzerkalo"], a[href*="/ua/"][href*="kuhnya"]');
                        productElements = Array.from(productLinks);
                    }
                    
                    return productElements.map(product => {
                        // Назва товару
                        const nameSelectors = [
                            'h1', 'h2', 'h3', 'h4',
                            '.product-name', '.item-name', '.name',
                            '[class*="name"]', '[class*="title"]',
                            '.product-title', '.item-title'
                        ];
                        let name = '';
                        for (const selector of nameSelectors) {
                            const element = product.querySelector(selector);
                            if (element && element.textContent.trim()) {
                                name = element.textContent.trim();
                                break;
                            }
                        }
                        
                        // Якщо не знайшли назву, беремо текст посилання
                        if (!name && product.tagName === 'A') {
                            name = product.textContent.trim();
                        }
                        
                        // Ціна
                        const priceSelectors = [
                            '.price', '.product-price', '[class*="price"]',
                            '.current-price', '.new-price', '.regular-price'
                        ];
                        let price = null;
                        for (const selector of priceSelectors) {
                            const element = product.querySelector(selector);
                            if (element) {
                                const priceText = element.textContent.replace(/[^\d]/g, '');
                                if (priceText) {
                                    price = parseInt(priceText);
                                    break;
                                }
                            }
                        }
                        
                        // Акційна ціна
                        const salePriceSelectors = [
                            '.sale-price', '.discount-price', '[class*="sale"]',
                            '.old-price', '.special-price'
                        ];
                        let salePrice = null;
                        for (const selector of salePriceSelectors) {
                            const element = product.querySelector(selector);
                            if (element) {
                                const saleText = element.textContent.replace(/[^\d]/g, '');
                                if (saleText) {
                                    salePrice = parseInt(saleText);
                                    break;
                                }
                            }
                        }
                        
                        // Фото
                        const imageSelectors = [
                            'img', '.product-image img', '.item-image img',
                            '[class*="image"] img', '.gallery img'
                        ];
                        let photo = null;
                        for (const selector of imageSelectors) {
                            const element = product.querySelector(selector);
                            if (element && element.src) {
                                photo = element.src;
                                break;
                            }
                        }
                        
                        // URL товару
                        let productUrl = '';
                        if (product.tagName === 'A') {
                            productUrl = product.href;
                        } else {
                            const link = product.querySelector('a');
                            if (link) {
                                productUrl = link.href;
                            }
                        }
                        
                        return {
                            name,
                            price,
                            salePrice,
                            photo,
                            productUrl
                        };
                    }).filter(product => product.name && product.name.length > 0);
                });
                
                console.log(`✅ Знайдено ${categoryProducts.length} товарів в категорії`);
                products.push(...categoryProducts);
                
                // Затримка між запитами
                await new Promise(resolve => setTimeout(resolve, 1000));
                
            } catch (error) {
                console.error(`❌ Помилка при обробці категорії ${categoryUrl}:`, error.message);
            }
        }
        
        // Видаляємо дублікати товарів
        const uniqueProducts = products.filter((product, index, self) => 
            index === self.findIndex(p => p.name === product.name)
        );
        
        console.log(`\n🎉 Збір завершено! Знайдено ${uniqueProducts.length} унікальних товарів`);
        
        // Конвертуємо в формат вашого сайту
        const convertedProducts = uniqueProducts.map((product, index) => {
            // Генеруємо унікальний slug
            const slug = product.name
                .toLowerCase()
                .replace(/[^а-яa-z0-9\s]/g, '')
                .replace(/\s+/g, '-')
                .substring(0, 50) + '-' + (index + 1);
            
            // Визначаємо матеріал на основі назви
            let material = SITE_CONFIG.material;
            if (product.name.toLowerCase().includes('дуб')) material = 'Дуб';
            if (product.name.toLowerCase().includes('ясен')) material = 'Ясен';
            if (product.name.toLowerCase().includes('сосна')) material = 'Сосна';
            if (product.name.toLowerCase().includes('мдф')) material = 'МДФ';
            if (product.name.toLowerCase().includes('крафт')) material = 'Дуб Крафт';
            
            // Визначаємо розміри
            let widthCm = null, depthCm = null, heightCm = null;
            const sizeMatch = product.name.match(/(\d+)[xх](\d+)/);
            if (sizeMatch) {
                widthCm = parseInt(sizeMatch[1]);
                depthCm = parseInt(sizeMatch[2]);
            }
            
            // Визначаємо кольори
            const colors = [];
            const colorMatch = product.name.match(/(білий|чорний|коричневий|дуб|ясен|сосна|венге|графіт|лава|антрацит)/i);
            if (colorMatch) {
                colors.push({
                    name: colorMatch[1].charAt(0).toUpperCase() + colorMatch[1].slice(1),
                    value: '#000000',
                    photo: null,
                    priceChange: 0
                });
            }
            
            return {
                name: product.name,
                category: SITE_CONFIG.category,
                subcategory: SITE_CONFIG.subcategory,
                price: product.price,
                salePrice: product.salePrice,
                saleEnd: null,
                brand: SITE_CONFIG.brand,
                material: material,
                filters: [],
                photos: product.photo ? [product.photo] : [],
                visible: true,
                active: true,
                slug: slug,
                type: SITE_CONFIG.type,
                sizes: [],
                colors: colors,
                groupProducts: [],
                description: `<p>${product.name}</p>`,
                widthCm: widthCm,
                depthCm: depthCm,
                heightCm: heightCm,
                lengthCm: null,
                popularity: 0,
                metaDescription: '',
                metaKeywords: '',
                metaTitle: ''
            };
        });
        
        // Зберігаємо результат
        const outputFile = 'miromark-products-fixed.json';
        fs.writeFileSync(outputFile, JSON.stringify(convertedProducts, null, 2));
        
        console.log(`\n💾 Результат збережено в файл: ${outputFile}`);
        console.log(`📊 Статистика:`);
        console.log(`   - Всього товарів: ${convertedProducts.length}`);
        console.log(`   - З цінами: ${convertedProducts.filter(p => p.price).length}`);
        console.log(`   - З акційними цінами: ${convertedProducts.filter(p => p.salePrice).length}`);
        console.log(`   - З фото: ${convertedProducts.filter(p => p.photos.length > 0).length}`);
        console.log(`   - З матеріалами: ${convertedProducts.filter(p => p.material !== SITE_CONFIG.material).length}`);
        
        return convertedProducts;
        
    } catch (error) {
        console.error('❌ Помилка при зборі даних:', error);
        throw error;
    } finally {
        await browser.close();
    }
}

// Запуск скрипта
if (require.main === module) {
    scrapeMiroMarkFixed()
        .then(products => {
            console.log('\n✅ Експорт завершено успішно!');
            console.log('📝 Тепер ви можете імпортувати файл miromark-products-fixed.json через адмінку');
        })
        .catch(error => {
            console.error('❌ Помилка:', error);
            process.exit(1);
        });
}

module.exports = { scrapeMiroMarkFixed }; 