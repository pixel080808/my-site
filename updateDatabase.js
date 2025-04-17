const mongoose = require('mongoose');
require('dotenv').config();

// Підключення до MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB підключено');
        // Викликаємо функцію оновлення після успішного підключення
        updateDatabase();
    })
    .catch(err => {
        console.error('Помилка підключення до MongoDB:', err);
        process.exit(1);
    });

// Функція для оновлення бази даних
async function updateDatabase() {
    try {
        // Перейменування поля img на image у slides
        const slideResult = await mongoose.connection.db.collection('slides').updateMany(
            {},
            { $rename: { "img": "image" } }
        );
        console.log('Оновлення slides:', slideResult);

        // Перейменування поля img на image у categories
        const categoryResult = await mongoose.connection.db.collection('categories').updateMany(
            {},
            { $rename: { "img": "image" } }
        );
        console.log('Оновлення categories:', categoryResult);

        console.log('Оновлення завершено!');
    } catch (err) {
        console.error('Помилка оновлення бази даних:', err);
    } finally {
        mongoose.connection.close();
    }
}