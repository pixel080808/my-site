const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Product = require('./models/Product');

// Підключення до бази даних
mongoose.connect('mongodb://localhost:27017/your-database-name', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});

// Функція для завантаження зображення на Cloudinary
async function uploadImageToCloudinary(imageUrl) {
    try {
        // Тут можна додати логіку завантаження на Cloudinary
        // Поки що повертаємо оригінальний URL
        return imageUrl;
    } catch (error) {
        console.error('Помилка завантаження зображення:', error);
        return null;
    }
}

// Функція для імпорту товарів
async function importProducts(jsonFilePath) {
    try {
        // Читаємо JSON файл
        const jsonData = fs.readFileSync(jsonFilePath, 'utf8');
        const products = JSON.parse(jsonData);

        console.log(`Знайдено ${products.length} товарів для імпорту`);

        for (let i = 0; i < products.length; i++) {
            const productData = products[i];
            
            console.log(`Імпортуємо товар ${i + 1}/${products.length}: ${productData.name}`);

            // Завантажуємо фото на Cloudinary
            if (productData.photos && productData.photos.length > 0) {
                const uploadedPhotos = [];
                for (const photoUrl of productData.photos) {
                    const uploadedUrl = await uploadImageToCloudinary(photoUrl);
                    if (uploadedUrl) {
                        uploadedPhotos.push(uploadedUrl);
                    }
                }
                productData.photos = uploadedPhotos;
            }

            // Завантажуємо фото кольорів
            if (productData.colors && productData.colors.length > 0) {
                for (const color of productData.colors) {
                    if (color.photo) {
                        color.photo = await uploadImageToCloudinary(color.photo);
                    }
                }
            }

            // Створюємо новий товар
            const newProduct = new Product(productData);
            await newProduct.save();

            console.log(`✅ Товар "${productData.name}" успішно імпортовано`);
        }

        console.log('🎉 Імпорт завершено!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Помилка імпорту:', error);
        process.exit(1);
    }
}

// Запуск імпорту
const jsonFilePath = process.argv[2] || 'products-backup.json';

if (!fs.existsSync(jsonFilePath)) {
    console.error(`❌ Файл ${jsonFilePath} не знайдено`);
    process.exit(1);
}

importProducts(jsonFilePath); 