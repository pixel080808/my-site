const puppeteer = require('puppeteer');

async function testCategoryDebug() {
    const browser = await puppeteer.launch({ 
        headless: false,
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
            '--disable-notifications',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection'
        ]
    });

    try {
        const page = await browser.newPage();
        
        // Встановлюємо user agent
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
        
        // Відключаємо webdriver
        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined,
            });
        });

        console.log('🔍 Тестую категорію: https://miromark.shop/ua/mebli-dlya-vitalni');
        
        await page.goto('https://miromark.shop/ua/mebli-dlya-vitalni', { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });
        
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Тестуємо різні способи пошуку товарів
        const results = await page.evaluate(() => {
            const debug = {
                totalLinks: 0,
                productLinks: [],
                productElements: [],
                categoryLinks: []
            };
            
            // Всі посилання
            const allLinks = document.querySelectorAll('a[href*="/ua/"]');
            debug.totalLinks = allLinks.length;
            
            console.log('📊 Всього посилань:', allLinks.length);
            
            // Шукаємо товарні елементи
            const productSelectors = [
                '.product-item', '.catalog-item', '[class*="product"]',
                '.item', '.product', '.product-thumb', '.product-layout',
                '.product-grid', '.product-card', '.catalog-card',
                '[class*="item"]', '[class*="card"]'
            ];
            
            for (const selector of productSelectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    console.log(`✅ Знайдено ${elements.length} елементів з селектором: ${selector}`);
                    debug.productElements.push({
                        selector: selector,
                        count: elements.length,
                        links: Array.from(elements).map(el => {
                            const link = el.querySelector('a[href*="/ua/"]');
                            return link ? link.href : null;
                        }).filter(href => href)
                    });
                }
            }
            
            // Шукаємо посилання на товари
            const productKeywords = [
                'lizhko', 'shafa', 'komod', 'dzerkalo', 'kuhnya', 'vitalnya',
                'stil', 'tumba', 'servant', 'zhurnalniy', 'obidniy', 'stilets',
                'penal', 'karkas', 'tualetniy', 'sekciya', 'panel', 'fasad'
            ];
            
            allLinks.forEach(link => {
                const href = link.href;
                if (href.includes('/ua/') && 
                    !href.includes('#') && 
                    !href.includes('mailto') &&
                    !href.includes('/dostavka') && 
                    !href.includes('/oplata') && 
                    !href.includes('/garantiya') &&
                    !href.includes('/pro-nas') &&
                    !href.includes('/dogovir') &&
                    !href.includes('/povernennya') &&
                    !href.includes('/kontakty') &&
                    !href.includes('/index.php?route=') &&
                    href.split('/').length > 4) {
                    
                    // Перевіряємо чи це товар
                    const isProduct = productKeywords.some(keyword => href.includes(keyword));
                    if (isProduct) {
                        debug.productLinks.push(href);
                    } else {
                        debug.categoryLinks.push(href);
                    }
                }
            });
            
            return debug;
        });
        
        console.log('\n📊 Результати тестування:');
        console.log(`   Всього посилань: ${results.totalLinks}`);
        console.log(`   Знайдено товарних посилань: ${results.productLinks.length}`);
        console.log(`   Знайдено категорій: ${results.categoryLinks.length}`);
        console.log(`   Знайдено товарних елементів: ${results.productElements.length}`);
        
        if (results.productLinks.length > 0) {
            console.log('\n🔍 Перші 5 товарних посилань:');
            results.productLinks.slice(0, 5).forEach((link, index) => {
                console.log(`   ${index + 1}. ${link}`);
            });
        }
        
        if (results.productElements.length > 0) {
            console.log('\n🔍 Товарні елементи:');
            results.productElements.forEach((element, index) => {
                console.log(`   ${index + 1}. ${element.selector}: ${element.count} елементів`);
                if (element.links.length > 0) {
                    console.log(`      Перші посилання: ${element.links.slice(0, 3).join(', ')}`);
                }
            });
        }
        
        if (results.categoryLinks.length > 0) {
            console.log('\n🔍 Перші 5 категорій:');
            results.categoryLinks.slice(0, 5).forEach((link, index) => {
                console.log(`   ${index + 1}. ${link}`);
            });
        }
        
    } catch (error) {
        console.error('❌ Помилка:', error);
    } finally {
        await browser.close();
    }
}

testCategoryDebug().catch(console.error); 