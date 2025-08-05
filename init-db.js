const mongoose = require('mongoose');
require('dotenv').config();

const Settings = require('./models/Settings');
const Category = require('./models/Category');
const Counter = require('./models/Counter');

async function initializeDatabase() {
    try {
        console.log('🔧 Initializing database...');
        
        if (!process.env.MONGO_URI) {
            console.error('❌ MONGO_URI is not set');
            process.exit(1);
        }

        await mongoose.connect(process.env.MONGO_URI);
        console.log('✅ Connected to database');

        // Створюємо початкові налаштування
        let settings = await Settings.findOne();
        if (!settings) {
            console.log('📝 Creating initial settings...');
            settings = new Settings({
                name: "Меблевий магазин",
                baseUrl: "https://mebli.onrender.com",
                logo: "",
                logoWidth: 150,
                favicon: "",
                contacts: { phones: "", addresses: "", schedule: "" },
                socials: [],
                showSocials: true,
                about: "",
                filters: [],
                orderFields: [],
                slideWidth: 0,
                slideHeight: 0,
                slideInterval: 3000,
                showSlides: true,
                metaTitle: "Меблевий магазин",
                metaDescription: "Широкий вибір меблів для вашого дому",
                metaKeywords: "меблі, магазин, купити"
            });
            await settings.save();
            console.log('✅ Initial settings created');
        } else {
            console.log('✅ Settings already exist');
        }

        // Створюємо початкові категорії
        const categoriesCount = await Category.countDocuments();
        if (categoriesCount === 0) {
            console.log('📝 Creating initial categories...');
            
            const initialCategories = [
                {
                    name: "Вітальні",
                    slug: "vitalni",
                    photo: "",
                    visible: true,
                    order: 1,
                    subcategories: []
                },
                {
                    name: "Спальні",
                    slug: "spalni",
                    photo: "",
                    visible: true,
                    order: 2,
                    subcategories: []
                },
                {
                    name: "Кухні",
                    slug: "kukhni",
                    photo: "",
                    visible: true,
                    order: 3,
                    subcategories: []
                },
                {
                    name: "Матраци",
                    slug: "matratsy",
                    photo: "",
                    visible: true,
                    order: 4,
                    subcategories: []
                }
            ];

            for (const categoryData of initialCategories) {
                const category = new Category(categoryData);
                await category.save();
            }
            console.log('✅ Initial categories created');
        } else {
            console.log('✅ Categories already exist');
        }

        // Створюємо лічильники
        const counters = [
            { _id: 'productId', seq: 0 },
            { _id: 'orderId', seq: 0 }
        ];

        for (const counterData of counters) {
            let counter = await Counter.findById(counterData._id);
            if (!counter) {
                counter = new Counter(counterData);
                await counter.save();
            }
        }
        console.log('✅ Counters initialized');

        console.log('🎉 Database initialization completed successfully!');
        
    } catch (error) {
        console.error('❌ Database initialization failed:', error.message);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('✅ Database connection closed');
    }
}

initializeDatabase(); 