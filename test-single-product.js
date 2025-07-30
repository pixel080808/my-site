const puppeteer = require('puppeteer');
const fs = require('fs');

// Конфігурація сайту
const SITE_CONFIG = {
    brand: 'MiroMark',
    category: 'Ліжка',
    subcategory: '',
    material: 'МДФ',
    type: 'simple'
};

async function scrapeSingleProduct() {
    console.log('🔍 Пошук реального товару в категорії Ліжка...');
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    try {
        const page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        await page.setViewport({ width: 1920, height: 1080 });
        const bedsCategoryUrl = 'https://miromark.shop/ua/lizhka';
        console.log(`🔗 Переходимо на категорію: ${bedsCategoryUrl}`);
        await page.goto(bedsCategoryUrl, { waitUntil: 'networkidle2' });
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log('✅ Сторінка категорії завантажена');
        // Збираємо всі посилання
        const productLinks = await page.evaluate(() => {
            const links = Array.from(document.querySelectorAll('a[href*="/ua/"]'));
            return links
                .map(link => link.href)
                .filter((href, idx, arr) =>
                    href &&
                    href.includes('/ua/') &&
                    !href.includes('?') &&
                    !href.includes('#') &&
                    href.split('/').length > 4 &&
                    !href.match(/(dostavka|oplata|garantiya|kredit|o-nas|dogovir|kontakti|info|category|brand|material|color|filter|page)/) &&
                    arr.indexOf(href) === idx
                );
        });
        console.log(`🔗 Знайдено ${productLinks.length} потенційних посилань на товари.`);
        let found = false;
        for (const link of productLinks) {
            console.log(`➡️ Перевіряємо: ${link}`);
            try {
                await page.goto(link, { waitUntil: 'networkidle2' });
                await new Promise(resolve => setTimeout(resolve, 1500));
                // Перевіряємо наявність ціни та фото
                const isProduct = await page.evaluate(() => {
                    const priceEl = document.querySelector('.price, .product-price, [class*="price"], .current-price, .new-price, .regular-price');
                    const img = document.querySelector('img[src*="/uploads/"], img[src*="/products/"], img[src*="/product/"], img[src*="/item/"]');
                    return !!(priceEl && img);
                });
                if (isProduct) {
                    console.log(`✅ Знайдено реальний товар: ${link}`);
                    // Збираємо дані
                    const productData = await page.evaluate(() => {
                        let name = document.querySelector('h1')?.textContent?.trim() || '';
                        let price = null;
                        const priceEl = document.querySelector('.price, .product-price, [class*="price"], .current-price, .new-price, .regular-price');
                        if (priceEl) {
                            const priceText = priceEl.textContent.replace(/[^\d]/g, '');
                            if (priceText) {
                                const parsedPrice = parseInt(priceText);
                                if (parsedPrice > 0 && parsedPrice < 1000000 && !isNaN(parsedPrice)) {
                                    price = parsedPrice;
                                }
                            }
                        }
                        let salePrice = null;
                        const saleEl = document.querySelector('.sale-price, .discount-price, [class*="sale"], .old-price, .special-price, .discount');
                        if (saleEl) {
                            const saleText = saleEl.textContent.replace(/[^\d]/g, '');
                            if (saleText) {
                                const parsedSale = parseInt(saleText);
                                if (parsedSale > 0 && parsedSale < 1000000 && !isNaN(parsedSale)) {
                                    salePrice = parsedSale;
                                }
                            }
                        }
                        const photos = [];
                        const imgSelectors = [
                            '.swiper-slide img',
                            '.product-gallery img',
                            '.gallery img',
                            '.product-image img',
                            'img[src*="/uploads/"]',
                            'img[src*="/products/"]',
                            'img[src*="/product/"]',
                            'img[src*="/item/"]'
                        ];
                        imgSelectors.forEach(selector => {
                            document.querySelectorAll(selector).forEach(img => {
                                if (img.src && img.src.startsWith('http') && !photos.includes(img.src)) {
                                    photos.push(img.src);
                                }
                            });
                        });
                        let description = '';
                        const descEl = document.querySelector('.description, .product-description, [class*="description"], .details, .product-details, [class*="details"], .info, .product-info, [class*="info"]');
                        if (descEl) {
                            description = descEl.textContent.trim();
                        }
                        if (!description) {
                            const p = Array.from(document.querySelectorAll('p')).find(el => el.textContent.length > 20);
                            if (p) description = p.textContent.trim();
                        }
                        let widthCm = null, depthCm = null, heightCm = null;
                        const sizeMatch = document.body.textContent.match(/(\d+)[xх](\d+)/);
                        if (sizeMatch) {
                            widthCm = parseInt(sizeMatch[1]);
                            depthCm = parseInt(sizeMatch[2]);
                        }
                        let material = '';
                        const materialKeywords = ['дуб', 'ясен', 'сосна', 'мдф', 'дсп', 'шпон', 'масив'];
                        const bodyText = document.body.textContent.toLowerCase();
                        for (const keyword of materialKeywords) {
                            if (bodyText.includes(keyword)) {
                                material = keyword.charAt(0).toUpperCase() + keyword.slice(1);
                                break;
                            }
                        }
                        let color = '';
                        const colorKeywords = ['білий', 'чорний', 'коричневий', 'дуб', 'ясен', 'сосна', 'венге', 'графіт'];
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
                    const convertedProduct = {
                        type: productData.price ? 'simple' : 'mattresses',
                        name: productData.name || 'Тестовий товар',
                        slug: (productData.name || 'test-product')
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
                    const outputFile = 'exports/test-single-product.json';
                    fs.writeFileSync(outputFile, JSON.stringify([convertedProduct], null, 2));
                    console.log(`\n💾 Тестовий товар збережено в файл: ${outputFile}`);
                    console.log(`📊 Статистика:`);
                    console.log(`   - Назва: ${convertedProduct.name}`);
                    console.log(`   - Ціна: ${convertedProduct.price || 'немає'}`);
                    console.log(`   - Акційна ціна: ${convertedProduct.salePrice || 'немає'}`);
                    console.log(`   - Фото: ${convertedProduct.photos.length} шт.`);
                    console.log(`   - Опис: ${convertedProduct.description.length} символів`);
                    console.log(`   - Матеріал: ${convertedProduct.material}`);
                    console.log(`   - Розміри: ${convertedProduct.widthCm}x${convertedProduct.depthCm} см`);
                    found = true;
                    break;
                }
            } catch (err) {
                // ігноруємо помилки переходу
            }
            if (found) break;
        }
        if (!found) {
            console.log('❌ Не знайдено жодного реального товару в категорії ліжок!');
        } else {
            console.log('\n✅ Тестовий збір завершено успішно!');
            console.log('📝 Тепер ви можете імпортувати файл exports/test-single-product.json через адмінку');
        }
    } catch (error) {
        console.error('❌ Помилка при зборі товару:', error);
    } finally {
        await browser.close();
    }
}

if (require.main === module) {
    scrapeSingleProduct();
}

module.exports = { scrapeSingleProduct }; 