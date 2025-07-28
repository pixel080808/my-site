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

async function scrapeMiroMarkAdvanced() {
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    const products = [];
    
    try {
        console.log('🔍 Починаю збір товарів з MiroMark (покращена версія)...');
        
        // Переходимо на головну сторінку
        await page.goto('https://miromark.shop/ua', { waitUntil: 'networkidle2' });
        
        // Отримуємо всі посилання на товари
        const productUrls = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/ua/"]'));
            return links
                .map(link => link.href)
                .filter(href => href.includes('/ua/') && !href.includes('#') && !href.includes('mailto'))
                .filter((href, index, arr) => arr.indexOf(href) === index);
        });
        
        console.log(`📂 Знайдено ${productUrls.length} посилань для обробки`);
        
        // Обробляємо кожне посилання
        for (let i = 0; i < productUrls.length; i++) {
            const productUrl = productUrls[i];
            console.log(`\n📦 Обробляю товар ${i + 1}/${productUrls.length}: ${productUrl}`);
            
            try {
                await page.goto(productUrl, { waitUntil: 'networkidle2' });
                
                // Отримуємо детальну інформацію про товар
                const productData = await page.evaluate(() => {
                    // Назва товару
                    const nameSelectors = [
                        'h1',
                        '.product-title',
                        '.item-title',
                        '[class*="title"]',
                        '[class*="name"]'
                    ];
                    let name = '';
                    for (const selector of nameSelectors) {
                        const element = document.querySelector(selector);
                        if (element && element.textContent.trim()) {
                            name = element.textContent.trim();
                            break;
                        }
                    }
                    
                    // Ціна
                    const priceSelectors = [
                        '.price',
                        '.product-price',
                        '[class*="price"]',
                        '.current-price'
                    ];
                    let price = null;
                    for (const selector of priceSelectors) {
                        const element = document.querySelector(selector);
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
                        '.sale-price',
                        '.discount-price',
                        '[class*="sale"]',
                        '.old-price'
                    ];
                    let salePrice = null;
                    for (const selector of salePriceSelectors) {
                        const element = document.querySelector(selector);
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
                        '.product-image img',
                        '.item-image img',
                        '[class*="image"] img',
                        '.gallery img',
                        'img[src*="product"]'
                    ];
                    let photo = null;
                    for (const selector of imageSelectors) {
                        const element = document.querySelector(selector);
                        if (element && element.src) {
                            photo = element.src;
                            break;
                        }
                    }
                    
                    // Опис
                    const descriptionSelectors = [
                        '.description',
                        '.product-description',
                        '[class*="desc"]',
                        '.item-description'
                    ];
                    let description = '';
                    for (const selector of descriptionSelectors) {
                        const element = document.querySelector(selector);
                        if (element && element.textContent.trim()) {
                            description = element.textContent.trim();
                            break;
                        }
                    }
                    
                    // Характеристики
                    const specsSelectors = [
                        '.specifications',
                        '.characteristics',
                        '[class*="spec"]',
                        '.product-info'
                    ];
                    let specifications = '';
                    for (const selector of specsSelectors) {
                        const element = document.querySelector(selector);
                        if (element && element.textContent.trim()) {
                            specifications = element.textContent.trim();
                            break;
                        }
                    }
                    
                    // Розміри
                    const sizeMatch = (name + ' ' + specifications).match(/(\d+)[xх](\d+)/);
                    let size = '';
                    if (sizeMatch) {
                        size = `${sizeMatch[1]}x${sizeMatch[2]}`;
                    }
                    
                    // Матеріал
                    const materialMatch = (name + ' ' + specifications).match(/(дуб|ясен|сосна|мдф|дсп)/i);
                    let material = '';
                    if (materialMatch) {
                        material = materialMatch[1];
                    }
                    
                    // Колір
                    const colorMatch = (name + ' ' + specifications).match(/(білий|чорний|коричневий|дуб|ясен|сосна|венге)/i);
                    let color = '';
                    if (colorMatch) {
                        color = colorMatch[1];
                    }
                    
                    return {
                        name,
                        price,
                        salePrice,
                        photo,
                        description,
                        specifications,
                        size,
                        material,
                        color,
                        url: window.location.href
                    };
                });
                
                if (productData.name && productData.name.length > 0) {
                    console.log(`✅ Знайдено товар: ${productData.name}`);
                    products.push(productData);
                }
                
                // Затримка між запитами
                await page.waitForTimeout(500);
                
            } catch (error) {
                console.error(`❌ Помилка при обробці ${productUrl}:`, error.message);
            }
        }
        
        console.log(`\n🎉 Збір завершено! Знайдено ${products.length} товарів`);
        
        // Конвертуємо в формат вашого сайту
        const convertedProducts = products.map((product, index) => {
            // Генеруємо унікальний slug
            const slug = product.name
                .toLowerCase()
                .replace(/[^а-яa-z0-9\s]/g, '')
                .replace(/\s+/g, '-')
                .substring(0, 50) + '-' + (index + 1);
            
            // Визначаємо матеріал
            let material = SITE_CONFIG.material;
            if (product.material) {
                material = product.material.charAt(0).toUpperCase() + product.material.slice(1);
            } else if (product.name.toLowerCase().includes('дуб')) material = 'Дуб';
            else if (product.name.toLowerCase().includes('ясен')) material = 'Ясен';
            else if (product.name.toLowerCase().includes('сосна')) material = 'Сосна';
            else if (product.name.toLowerCase().includes('мдф')) material = 'МДФ';
            
            // Визначаємо розміри
            let widthCm = null, depthCm = null, heightCm = null;
            if (product.size) {
                const sizeMatch = product.size.match(/(\d+)[xх](\d+)/);
                if (sizeMatch) {
                    widthCm = parseInt(sizeMatch[1]);
                    depthCm = parseInt(sizeMatch[2]);
                }
            }
            
            // Створюємо кольори
            const colors = [];
            if (product.color) {
                colors.push({
                    name: product.color.charAt(0).toUpperCase() + product.color.slice(1),
                    value: '#000000',
                    photo: null,
                    priceChange: 0
                });
            }
            
            // Формуємо опис
            let description = '<p><br></p>';
            if (product.description) {
                description = `<p>${product.description}</p>`;
            }
            if (product.specifications) {
                description += `<p><strong>Характеристики:</strong></p><p>${product.specifications}</p>`;
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
                description: description,
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
        const outputFile = 'miromark-products-advanced.json';
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
    scrapeMiroMarkAdvanced()
        .then(products => {
            console.log('\n✅ Експорт завершено успішно!');
            console.log('📝 Тепер ви можете імпортувати файл miromark-products-advanced.json через адмінку');
        })
        .catch(error => {
            console.error('❌ Помилка:', error);
            process.exit(1);
        });
}

module.exports = { scrapeMiroMarkAdvanced }; 