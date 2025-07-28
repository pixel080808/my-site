const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('./models/Product');

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json({ limit: '50mb' }));

// Ендпоінт для імпорту товарів через JSON
app.post('/api/import-products', async (req, res) => {
    try {
        const { products, apiKey } = req.body;

        // Перевірка API ключа (для безпеки)
        if (apiKey !== process.env.IMPORT_API_KEY) {
            return res.status(401).json({ error: 'Невірний API ключ' });
        }

        if (!products || !Array.isArray(products)) {
            return res.status(400).json({ error: 'Невірний формат даних' });
        }

        console.log(`Імпортуємо ${products.length} товарів`);

        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (const productData of products) {
            try {
                // Видаляємо _id щоб створити новий товар
                delete productData._id;
                delete productData.__v;
                delete productData.createdAt;
                delete productData.updatedAt;

                const newProduct = new Product(productData);
                await newProduct.save();

                results.push({
                    name: productData.name,
                    status: 'success',
                    id: newProduct._id
                });
                successCount++;

            } catch (error) {
                results.push({
                    name: productData.name,
                    status: 'error',
                    error: error.message
                });
                errorCount++;
            }
        }

        res.json({
            success: true,
            message: `Імпорт завершено: ${successCount} успішно, ${errorCount} помилок`,
            results
        });

    } catch (error) {
        console.error('Помилка імпорту:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

// Ендпоінт для імпорту через файл
app.post('/api/import-file', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не завантажено' });
        }

        const filePath = req.file.path;
        const jsonData = fs.readFileSync(filePath, 'utf8');
        const products = JSON.parse(jsonData);

        // Видаляємо тимчасовий файл
        fs.unlinkSync(filePath);

        // Імпортуємо товари
        const results = [];
        let successCount = 0;
        let errorCount = 0;

        for (const productData of products) {
            try {
                delete productData._id;
                delete productData.__v;
                delete productData.createdAt;
                delete productData.updatedAt;

                const newProduct = new Product(productData);
                await newProduct.save();

                results.push({
                    name: productData.name,
                    status: 'success',
                    id: newProduct._id
                });
                successCount++;

            } catch (error) {
                results.push({
                    name: productData.name,
                    status: 'error',
                    error: error.message
                });
                errorCount++;
            }
        }

        res.json({
            success: true,
            message: `Імпорт завершено: ${successCount} успішно, ${errorCount} помилок`,
            results
        });

    } catch (error) {
        console.error('Помилка імпорту файлу:', error);
        res.status(500).json({ error: 'Помилка сервера' });
    }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 API для імпорту запущено на порту ${PORT}`);
}); 