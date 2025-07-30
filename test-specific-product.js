const puppeteer = require('puppeteer');
const fs = require('fs');

const SITE_CONFIG = {
    brand: 'MiroMark',
    category: 'Ліжка',
    subcategory: '',
    material: 'МДФ',
    type: 'simple'
};

async function scrapeSpecificProduct() {
    console.log('🔍 Тестування конкретного товару: Ліжко Рамона...');
    
    const browser = await puppeteer.launch({ 
        headless: true, 
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--no-first-run',
            '--no-zygote',
            '--single-process'
        ] 
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });

        const productUrl = 'https://miromark.shop/ua/mebli-dlya-spalen/lizhka/lizhko-ramona-z-yashykom-dlya-bilyzny-miromark';
        console.log(`🔗 Переходимо на товар: ${productUrl}`);
        
        await page.goto(productUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 5000));
        console.log('✅ Сторінка товару завантажена');

        // Збираємо дані товару
        const productData = await page.evaluate(() => {
            // Назва товару
            let name = document.querySelector('h1')?.textContent?.trim() || '';
            
            // Ціна - покращені селектори
            let price = null;
            const priceSelectors = [
                '.price',
                '.product-price', 
                '[class*="price"]',
                '.current-price',
                '.new-price',
                '.regular-price',
                '.product-cost',
                '[class*="cost"]',
                '.price-value',
                '.product-price-value'
            ];
            
            for (const selector of priceSelectors) {
                const priceEl = document.querySelector(selector);
                if (priceEl) {
                    const priceText = priceEl.textContent.replace(/[^\d]/g, '');
                    if (priceText) {
                        const parsedPrice = parseInt(priceText);
                        if (parsedPrice > 0 && parsedPrice < 1000000 && !isNaN(parsedPrice)) {
                            price = parsedPrice;
                            break;
                        }
                    }
                }
            }
            
            // Акційна ціна
            let salePrice = null;
            const saleSelectors = [
                '.sale-price',
                '.discount-price',
                '[class*="sale"]',
                '.old-price',
                '.special-price',
                '.discount',
                '.price-old',
                '.product-old-price'
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
            
            // Фото товару - покращені селектори
            const photos = [];
            const imgSelectors = [
                '.swiper-slide img',
                '.product-gallery img',
                '.gallery img',
                '.product-image img',
                'img[src*="/uploads/"]',
                'img[src*="/products/"]',
                'img[src*="/product/"]',
                'img[src*="/item/"]',
                '.product-photo img',
                '.main-image img',
                '.product-images img',
                '.image-gallery img',
                'img[src*="miromark"]',
                'img[alt*="товар"]',
                'img[alt*="ліжко"]',
                'img[alt*="рамона"]'
            ];
            
            imgSelectors.forEach(selector => {
                document.querySelectorAll(selector).forEach(img => {
                    if (img.src && img.src.startsWith('http') && !photos.includes(img.src)) {
                        photos.push(img.src);
                    }
                });
            });
            
            // Якщо фото не знайдено, спробуємо знайти будь-які зображення
            if (photos.length === 0) {
                document.querySelectorAll('img').forEach(img => {
                    if (img.src && img.src.startsWith('http') && img.src.includes('miromark') && !photos.includes(img.src)) {
                        photos.push(img.src);
                    }
                });
            }
            
            // Опис товару
            let description = '';
            const descSelectors = [
                '.description',
                '.product-description', 
                '[class*="description"]',
                '.details',
                '.product-details',
                '[class*="details"]',
                '.info',
                '.product-info',
                '[class*="info"]',
                '.characteristics',
                '.product-characteristics',
                '.product-text',
                '.product-content'
            ];
            
            for (const selector of descSelectors) {
                const descEl = document.querySelector(selector);
                if (descEl && descEl.textContent.trim().length > 20) {
                    description = descEl.textContent.trim();
                    break;
                }
            }
            
            // Розміри
            let widthCm = null, depthCm = null, heightCm = null;
            const sizeMatch = document.body.textContent.match(/(\d+)[xх](\d+)/);
            if (sizeMatch) {
                widthCm = parseInt(sizeMatch[1]);
                depthCm = parseInt(sizeMatch[2]);
            }
            
            // Матеріал
            let material = '';
            const materialKeywords = ['дуб', 'ясен', 'сосна', 'мдф', 'дсп', 'шпон', 'масив', 'крафт'];
            const bodyText = document.body.textContent.toLowerCase();
            for (const keyword of materialKeywords) {
                if (bodyText.includes(keyword)) {
                    material = keyword.charAt(0).toUpperCase() + keyword.slice(1);
                    break;
                }
            }
            
            // Колір
            let color = '';
            const colorKeywords = ['білий', 'чорний', 'коричневий', 'дуб', 'ясен', 'сосна', 'венге', 'графіт', 'крафт', 'лава'];
            for (const keyword of colorKeywords) {
                if (bodyText.includes(keyword)) {
                    color = keyword.charAt(0).toUpperCase() + keyword.slice(1);
                    break;
                }
            }
            
            return {
                name,
                price,
                salePrice,
                photos,
                description,
                widthCm,
                depthCm,
                heightCm,
                material,
                color,
                url: window.location.href
            };
        });

        console.log('📊 Зібрані дані:');
        console.log(`   - Назва: ${productData.name}`);
        console.log(`   - Ціна: ${productData.price || 'немає'}`);
        console.log(`   - Акційна ціна: ${productData.salePrice || 'немає'}`);
        console.log(`   - Фото: ${productData.photos.length} шт.`);
        console.log(`   - Опис: ${productData.description.length} символів`);
        console.log(`   - Матеріал: ${productData.material}`);
        console.log(`   - Колір: ${productData.color}`);
        console.log(`   - Розміри: ${productData.widthCm}x${productData.depthCm} см`);

        // Конвертуємо в формат для імпорту
        const convertedProduct = {
            type: productData.price ? 'simple' : 'mattresses',
            name: productData.name || 'Ліжко Рамона',
            slug: (productData.name || 'lizhko-ramona')
                .toLowerCase()
                .replace(/[^а-яa-z0-9\s]/g, '')
                .replace(/\s+/g, '-')
                .substring(0, 50) + '-test',
            brand: SITE_CONFIG.brand,
            category: SITE_CONFIG.category,
            subcategory: SITE_CONFIG.subcategory,
            material: productData.material || SITE_CONFIG.material,
            price: productData.price,
            salePrice: productData.salePrice,
            saleEnd: null,
            description: productData.description ? `<p>${productData.description}</p>` : `<p>${productData.name}</p>`,
            widthCm: productData.widthCm,
            depthCm: productData.depthCm,
            heightCm: productData.heightCm,
            lengthCm: null,
            photos: productData.photos.length > 0 ? productData.photos : [],
            colors: productData.color ? [{
                name: productData.color,
                value: '#000000',
                photo: null,
                priceChange: 0
            }] : [],
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

        const outputFile = 'exports/test-ramona-bed.json';
        fs.writeFileSync(outputFile, JSON.stringify([convertedProduct], null, 2));
        
        console.log(`\n💾 Тестовий товар збережено в файл: ${outputFile}`);
        console.log('✅ Тестування завершено успішно!');
        console.log('📝 Тепер ви можете імпортувати файл exports/test-ramona-bed.json через адмінку');
        
        return convertedProduct;
        
    } catch (error) {
        console.error('❌ Помилка при зборі товару:', error);
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    scrapeSpecificProduct();
}

module.exports = { scrapeSpecificProduct }; 