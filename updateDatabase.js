const mongoose = require('mongoose');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log('MongoDB підключено');
        updateDatabase();
    })
    .catch(err => {
        console.error('Помилка підключення до MongoDB:', err);
        process.exit(1);
    });

async function updateDatabase() {
    try {
        const slideResult = await mongoose.connection.db.collection('slides').updateMany(
            {},
            { $rename: { "img": "image" } }
        );
        console.log('Оновлення slides:', slideResult);

        const categoryResult = await mongoose.connection.db.collection('categories').updateMany(
            {},
            { $rename: { "img": "image" } }
        );
        console.log('Оновлення categories:', categoryResult);

<<<<<<< HEAD
=======
        // Встановлення (або оновлення) налаштувань сайту: назва, логотип, фавікон
>>>>>>> 451743e (Оновлення)
        const settingsCol = mongoose.connection.db.collection('settings');
        const absoluteBase = 'https://mebli.onrender.com';
        const update = {
            name: 'Prostir Mebliv',
            logo: `${absoluteBase}/assets/logo/prostirmebliv-logo-horizontal.svg`,
            logoWidth: 220,
            favicon: `${absoluteBase}/favicon.svg`,
        };
        const settingsResult = await settingsCol.updateOne(
            {},
            { $set: update },
            { upsert: true }
        );
        console.log('Оновлення settings:', settingsResult);

        console.log('Оновлення завершено!');
    } catch (err) {
        console.error('Помилка оновлення бази даних:', err);
    } finally {
        mongoose.connection.close();
    }
}