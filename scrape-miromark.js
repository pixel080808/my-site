const puppeteer = require('puppeteer');
const fs = require('fs');

// Конфігурація для вашого сайту
const SITE_CONFIG = {
    category: 'vitalni', // Категорія на вашому сайті
    subcategory: 'miromark', // Підкатегорія
    brand: 'MiroMark', // Бренд
    material: 'Ламіноване ДСП', // Матеріал за замовчуванням
    type: 'simple' // Тип товару
};

async function scrapeMiroMark() {
    const browser = await puppeteer.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const page = await browser.newPage();
    const products = [];
    
    try {
        console.log('🔍 Починаю збір товарів з MiroMark...');
        
        // Переходимо на головну сторінку
        await page.goto('https://miromark.shop/ua', { waitUntil: 'networkidle2' });
        
        // Отримуємо всі категорії
        const categories = await page.evaluate(() => {
            const categoryLinks = Array.from(document.querySelectorAll('a[href*="/ua/"]'));
            return categoryLinks
                .map(link => link.href)
                .filter(href => href.includes('/ua/') && !href.includes('#') && !href.includes('mailto'))
                .filter((href, index, arr) => arr.indexOf(href) === index); // Унікальні URL
        });
        
        console.log(`📂 Знайдено ${categories.length} категорій для обробки`);
        
        // Обробляємо кожну категорію
        for (let i = 0; i < categories.length; i++) {
            const categoryUrl = categories[i];
            console.log(`\n📁 Обробляю категорію ${i + 1}/${categories.length}: ${categoryUrl}`);
            
            try {
                await page.goto(categoryUrl, { waitUntil: 'networkidle2' });
                
                // Отримуємо товари з поточної сторінки
                const categoryProducts = await page.evaluate(() => {
                    const productElements = Array.from(document.querySelectorAll('.product-item, .catalog-item, [class*="product"]'));
                    
                    return productElements.map(product => {
                        // Назва товару
                        const nameElement = product.querySelector('h1, h2, h3, .product-name, .item-name, [class*="name"]');
                        const name = nameElement ? nameElement.textContent.trim() : '';
                        
                        // Ціна
                        const priceElement = product.querySelector('.price, .product-price, [class*="price"]');
                        let price = null;
                        if (priceElement) {
                            const priceText = priceElement.textContent.replace(/[^\d]/g, '');
                            price = priceText ? parseInt(priceText) : null;
                        }
                        
                        // Акційна ціна
                        const salePriceElement = product.querySelector('.sale-price, .discount-price, [class*="sale"]');
                        let salePrice = null;
                        if (salePriceElement) {
                            const saleText = salePriceElement.textContent.replace(/[^\d]/g, '');
                            salePrice = saleText ? parseInt(saleText) : null;
                        }
                        
                        // Фото
                        const imageElement = product.querySelector('img');
                        const photo = imageElement ? imageElement.src : null;
                        
                        // Опис (якщо є)
                        const descriptionElement = product.querySelector('.description, .product-description, [class*="desc"]');
                        const description = descriptionElement ? descriptionElement.textContent.trim() : '';
                        
                        // Розміри (якщо є)
                        const sizeElement = product.querySelector('.size, .dimensions, [class*="size"]');
                        const size = sizeElement ? sizeElement.textContent.trim() : '';
                        
                        // Колір (якщо є)
                        const colorElement = product.querySelector('.color, [class*="color"]');
                        const color = colorElement ? colorElement.textContent.trim() : '';
                        
                        return {
                            name,
                            price,
                            salePrice,
                            photo,
                            description,
                            size,
                            color,
                            categoryUrl
                        };
                    }).filter(product => product.name && product.name.length > 0);
                });
                
                console.log(`✅ Знайдено ${categoryProducts.length} товарів в категорії`);
                products.push(...categoryProducts);
                
                // Невелика затримка між запитами
                await page.waitForTimeout(1000);
                
            } catch (error) {
                console.error(`❌ Помилка при обробці категорії ${categoryUrl}:`, error.message);
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
            
            // Визначаємо матеріал на основі назви
            let material = SITE_CONFIG.material;
            if (product.name.toLowerCase().includes('дуб')) material = 'Дуб';
            if (product.name.toLowerCase().includes('ясен')) material = 'Ясен';
            if (product.name.toLowerCase().includes('сосна')) material = 'Сосна';
            if (product.name.toLowerCase().includes('мдф')) material = 'МДФ';
            
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
                    name: product.color,
                    value: '#000000', // За замовчуванням
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
                description: product.description ? `<p>${product.description}</p>` : '<p><br></p>',
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
        const outputFile = 'miromark-products.json';
        fs.writeFileSync(outputFile, JSON.stringify(convertedProducts, null, 2));
        
        console.log(`\n💾 Результат збережено в файл: ${outputFile}`);
        console.log(`📊 Статистика:`);
        console.log(`   - Всього товарів: ${convertedProducts.length}`);
        console.log(`   - З цінами: ${convertedProducts.filter(p => p.price).length}`);
        console.log(`   - З акційними цінами: ${convertedProducts.filter(p => p.salePrice).length}`);
        console.log(`   - З фото: ${convertedProducts.filter(p => p.photos.length > 0).length}`);
        
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
    scrapeMiroMark()
        .then(products => {
            console.log('\n✅ Експорт завершено успішно!');
            console.log('📝 Тепер ви можете імпортувати файл miromark-products.json через адмінку');
        })
        .catch(error => {
            console.error('❌ Помилка:', error);
            process.exit(1);
        });
}

module.exports = { scrapeMiroMark }; 