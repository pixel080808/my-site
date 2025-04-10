const jwt = require('jsonwebtoken');
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');
const fs = require('fs');
const Joi = require('joi');
const WebSocket = require('ws');

// Імпортуємо моделі з окремих файлів
const Product = require('./models/Product');
const Order = require('./models/Order');
const Category = require('./models/Category');
const Slide = require('./models/Slide');
const Settings = require('./models/Settings');
const Material = require('./models/Material');
const Brand = require('./models/Brand');
const Cart = require('./models/Cart');

dotenv.config();

const app = express();

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    console.error('Змінні середовища для Cloudinary (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) не визначені');
    process.exit(1);
}

// Налаштування Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Налаштування Multer для Cloudinary
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'products',
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif', 'webp']
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // Обмеження розміру файлу до 5 МБ
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Дозволені лише файли JPEG, PNG, GIF або WebP'), false);
        }
        cb(null, true);
    }
});

// Налаштування Multer для імпорту файлів (локальне збереження)
const uploadPath = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath);
}

const importStorage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname}`);
    }
});

const importUpload = multer({
    storage: importStorage,
    limits: {
        fileSize: 10 * 1024 * 1024 // Обмеження розміру файлу до 10 МБ
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/json') {
            return cb(new Error('Дозволені лише JSON-файли'), false);
        }
        cb(null, true);
    }
});

app.set('case sensitive routing', false);
app.use(express.json({ limit: '10mb' })); // Збільшуємо до 10 МБ
app.use(cors());
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
});

// Перевірка змінних середовища
if (!process.env.MONGO_URI) {
    console.error('MONGO_URI не визначено у змінних середовища');
    process.exit(1);
}

if (!process.env.JWT_SECRET) {
    console.error('JWT_SECRET не визначено у змінних середовища');
    process.exit(1);
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error('ADMIN_USERNAME або ADMIN_PASSWORD не визначено у змінних середовища');
    process.exit(1);
}

const ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    console.error(`Папка public не знайдена за шляхом: ${publicPath}`);
    process.exit(1);
}

const indexPath = path.join(publicPath, 'index.html');
if (!fs.existsSync(indexPath)) {
    console.error(`index.html не знайдено за шляхом: ${indexPath}`);
    process.exit(1);
}

const adminPath = path.join(publicPath, 'admin.html');
if (!fs.existsSync(adminPath)) {
    console.error(`admin.html не знайдено за шляхом: ${adminPath}`);
    process.exit(1);
}

// Налаштування роздачі статичних файлів (CSS, JS, тощо)
app.use(express.static(publicPath, {
    setHeaders: (res, path) => {
        if (path.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
            res.setHeader('Cache-Control', 'no-store');
        }
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'no-store');
        }
    }
}));

app.get('/admin', (req, res) => {
    console.log('Отримано запит на /admin');
    console.log('Шлях до admin:', adminPath);
    res.sendFile(adminPath, (err) => {
        if (err) {
            console.error('Помилка при відправці admin.html:', err);
            res.status(500).send('Помилка при відображенні admin.html');
        } else {
            console.log('admin.html успішно відправлено');
        }
    });
});

app.get('/test-admin', (req, res) => {
    console.log('Отримано запит на /test-admin');
    res.send('Це тестовий маршрут для адміна');
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB підключено'))
    .catch(err => {
        console.error('Помилка підключення до MongoDB:', err);
        process.exit(1);
    });

// Схема валідації для продукту
const productSchemaValidation = Joi.object({
    name: Joi.string().min(1).max(255).required(),
    category: Joi.string().max(100).required(),
    subcategory: Joi.string().max(100).allow(''),
    price: Joi.number().min(0).when('type', { is: 'simple', then: Joi.required(), otherwise: Joi.allow(null) }),
    salePrice: Joi.number().min(0).allow(null),
    saleEnd: Joi.date().allow(null),
    brand: Joi.string().max(100).allow(''),
    material: Joi.string().max(100).allow(''),
    photos: Joi.array().items(Joi.string()).default([]),
    visible: Joi.boolean().default(true),
    active: Joi.boolean().default(true),
    slug: Joi.string().min(1).max(255).required(),
    type: Joi.string().valid('simple', 'mattresses', 'group').required(),
    sizes: Joi.array().items(
        Joi.object({
            name: Joi.string().max(100).required(),
            price: Joi.number().min(0).required()
        })
    ).default([]),
    colors: Joi.array().items(
        Joi.object({
            name: Joi.string().max(100).required(),
            value: Joi.string().max(100).required(),
            priceChange: Joi.number().default(0),
            photo: Joi.string().allow(null)
        })
    ).default([]),
    groupProducts: Joi.array().items(Joi.string()).default([]),
    description: Joi.string().allow(''),
    widthCm: Joi.number().min(0).allow(null),
    depthCm: Joi.number().min(0).allow(null),
    heightCm: Joi.number().min(0).allow(null),
    lengthCm: Joi.number().min(0).allow(null),
    popularity: Joi.number().allow(null)
});

// Схема валідації для замовлення
const orderSchemaValidation = Joi.object({
    id: Joi.number().optional(),
    date: Joi.date().default(Date.now),
    customer: Joi.object().required(),
    items: Joi.array().items(
        Joi.object({
            id: Joi.number().required(),
            name: Joi.string().required(), // Додаємо поле name
            quantity: Joi.number().min(1).required(),
            price: Joi.number().min(0).required(),
            color: Joi.string().allow('')
        })
    ).required(),
    total: Joi.number().min(0).required(),
    status: Joi.string().default('Нове замовлення')
});

// Схема валідації для налаштувань (другий варіант)
const settingsSchemaValidation = Joi.object({
    name: Joi.string().allow(''),
    baseUrl: Joi.string().uri().allow(''),
    logo: Joi.string().allow(''),
    logoWidth: Joi.number().min(0).allow(null),
    favicon: Joi.string().allow(''),
    contacts: Joi.object({
        phones: Joi.string().allow(''),
        addresses: Joi.string().allow(''),
        schedule: Joi.string().allow('')
    }).default({ phones: '', addresses: '', schedule: '' }),
    socials: Joi.array().items(
    Joi.object({
        name: Joi.string().allow(''), // Додано
        url: Joi.string().uri().required(),
        icon: Joi.string().required()
    })
    ).default([]),
    showSocials: Joi.boolean().default(true),
    about: Joi.string().allow(''),
    categoryWidth: Joi.number().min(0).allow(null),
    categoryHeight: Joi.number().min(0).allow(null),
    productWidth: Joi.number().min(0).allow(null),
    productHeight: Joi.number().min(0).allow(null),
    filters: Joi.array().items(
        Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().required(),
            options: Joi.array().items(Joi.string()).default([])
        })
    ).default([]),
    orderFields: Joi.array().items(
        Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().required(),
            options: Joi.array().items(Joi.string()).default([])
        })
    ).default([]),
    slideWidth: Joi.number().min(0).allow(null),
    slideHeight: Joi.number().min(0).allow(null),
    slideInterval: Joi.number().min(0).allow(null),
    showSlides: Joi.boolean().default(true)
});

// Middleware для перевірки JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        console.log('Токен відсутній у запиті:', req.path);
        return res.status(401).json({ error: 'Доступ заборонено. Токен відсутній.' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('Токен верифіковано для шляху:', req.path, 'Дані:', decoded);
        req.user = decoded;
        next();
    } catch (err) {
        console.error('Помилка верифікації токена:', err.message, 'Токен:', token);
        res.status(403).json({ error: 'Недійсний токен', details: err.message });
    }
};

// Налаштування WebSocket
const server = app.listen(process.env.PORT || 3000, () => console.log(`Сервер запущено на порту ${process.env.PORT || 3000}`));
const wss = new WebSocket.Server({ server });

async function cleanupOldCarts() {
    try {
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await Cart.deleteMany({ updatedAt: { $lt: thirtyDaysAgo } });
        console.log(`Старі кошики видалено. Кількість: ${result.deletedCount}`);
        return result.deletedCount; // Повертаємо кількість видалених документів
    } catch (err) {
        console.error('Помилка при очищенні старих кошиків:', err);
        throw err; // Перекидаємо помилку для обробки в ендпоінті
    }
}

// Запускаємо очищення раз на день
setInterval(cleanupOldCarts, 24 * 60 * 60 * 1000);
cleanupOldCarts(); // Запускаємо при старті сервера

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    const token = urlParams.get('token');

    ws.isAdmin = false; // За замовчуванням клієнт не адмін
    ws.subscriptions = new Set();

    if (token) {
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.role === 'admin') {
                ws.isAdmin = true;
                console.log('WebSocket: Адмін підключився з токеном:', decoded);
            }
        } catch (err) {
            console.error('WebSocket: Помилка верифікації токена:', err.message);
            ws.close(1008, 'Недійсний токен');
            return;
        }
    } else {
        console.log('WebSocket: Публічний клієнт підключився');
    }

    ws.on('message', async (message) => {
        try {
            const { type, action } = JSON.parse(message);
            console.log(`Отримано WebSocket-повідомлення: type=${type}, action=${action}`);

            if (action === 'subscribe') {
                ws.subscriptions.add(type);
                console.log(`Клієнт підписався на ${type}`);

                if (type === 'products') {
                    const products = ws.isAdmin
                        ? await Product.find() // Адмінам усі товари
                        : await Product.find({ visible: true, active: true }); // Публіці тільки видимі
                    ws.send(JSON.stringify({ type: 'products', data: products }));
                } else if (type === 'settings') {
                    const settings = await Settings.findOne();
                    ws.send(JSON.stringify({ type: 'settings', data: settings || {} }));
                } else if (type === 'categories') {
                    const categories = await Category.find();
                    ws.send(JSON.stringify({ type: 'categories', data: categories }));
                } else if (type === 'slides') {
                    const slides = await Slide.find().sort({ order: 1 });
                    ws.send(JSON.stringify({ type: 'slides', data: slides }));
                } else if (type === 'orders' && ws.isAdmin) {
                    const orders = await Order.find();
                    ws.send(JSON.stringify({ type: 'orders', data: orders }));
                } else if (type === 'materials' && ws.isAdmin) {
                    const materials = await Material.find().distinct('name');
                    ws.send(JSON.stringify({ type: 'materials', data: materials }));
                } else if (type === 'brands' && ws.isAdmin) {
                    const brands = await Brand.find().distinct('name');
                    ws.send(JSON.stringify({ type: 'brands', data: brands }));
                }
            }
        } catch (err) {
            console.error('Помилка обробки WebSocket-повідомлення:', err);
            ws.send(JSON.stringify({ type: 'error', error: 'Помилка обробки підписки', details: err.message }));
        }
    });

    ws.on('close', () => console.log('Клієнт від’єднався від WebSocket'));
    ws.on('error', (err) => console.error('Помилка WebSocket:', err));
});

function broadcast(type, data) {
    console.log(`Трансляція даних типу ${type}:`);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.subscriptions.has(type)) {
            let filteredData = data;
            if (type === 'products' && !client.isAdmin) {
                filteredData = data.filter(p => p.visible && p.active);
            }
            client.send(JSON.stringify({ type, data: filteredData }));
        }
    });
}

// Ендпоінт для завантаження файлів
app.post('/api/upload', authenticateToken, (req, res, next) => {
    upload.single('file')(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({ error: 'Помилка завантаження файлу', details: err.message });
        } else if (err) {
            return res.status(400).json({ error: 'Помилка валідації файлу', details: err.message });
        }
        try {
            if (!req.file || !req.file.path) {
                return res.status(500).json({ error: 'Помилка завантаження: файл не отримано від Cloudinary' });
            }
            res.json({ url: req.file.path });
        } catch (cloudinaryErr) {
            console.error('Помилка Cloudinary:', cloudinaryErr);
            if (req.file && req.file.path) {
                try {
                    await cloudinary.uploader.destroy(req.file.filename);
                } catch (deleteErr) {
                    console.error('Не вдалося видалити файл після помилки:', deleteErr);
                }
            }
            res.status(500).json({ error: 'Не вдалося завантажити файл до Cloudinary', details: cloudinaryErr.message });
        }
    });
});

// GET /api/filters — повертає лише фільтри з налаштувань
app.get('/api/filters', authenticateToken, async (req, res) => {
    try {
        const settings = await Settings.findOne();
        const filters = settings ? settings.filters || [] : [];
        res.json(filters);
    } catch (err) {
        console.error('Помилка при отриманні фільтрів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

// POST /api/filters — додає новий фільтр до існуючого масиву filters
app.post('/api/filters', authenticateToken, async (req, res) => {
    try {
        const filterData = req.body;
        const filterSchema = Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().required(),
            options: Joi.array().items(Joi.string()).default([])
        });

        const { error } = filterSchema.validate(filterData);
        if (error) {
            console.error('Помилка валідації фільтру:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings({ filters: [] });
        }

        // Перевіряємо, чи фільтр із таким name уже існує
        if (settings.filters.some(f => f.name === filterData.name)) {
            return res.status(400).json({ error: 'Фільтр із таким ім’ям уже існує' });
        }

        settings.filters.push(filterData);
        await settings.save();

        broadcast('settings', settings); // Оновлюємо всіх клієнтів
        res.status(201).json(filterData);
    } catch (err) {
        console.error('Помилка при додаванні фільтру:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

// Публічний ендпоінт для перегляду товарів
app.get('/api/public/products', async (req, res) => {
    try {
        const { slug } = req.query;
        let products;
        if (slug) {
            products = await Product.find({ slug, visible: true, active: true });
        } else {
            products = await Product.find({ visible: true, active: true });
        }
        res.json(products);
    } catch (err) {
        console.error('Помилка при отриманні товарів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/public/settings', async (req, res) => {
    try {
        const settings = await Settings.findOne();
        res.json(settings || {});
    } catch (err) {
        console.error('Помилка при отриманні публічних налаштувань:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/public/categories', async (req, res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (err) {
        console.error('Помилка при отриманні публічних категорій:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/public/slides', async (req, res) => {
    try {
        const slides = await Slide.find().sort({ order: 1 });
        res.json(slides);
    } catch (err) {
        console.error('Помилка при отриманні публічних слайдів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

// Захищений ендпоінт для адмінів
app.get('/api/products', authenticateToken, async (req, res) => {
    try {
        const { slug } = req.query;
        if (slug) {
            const products = await Product.find({ slug });
            return res.json(products);
        }
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        console.error('Помилка при отриманні товарів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

// Функція для витягування publicId із URL Cloudinary
const getPublicIdFromUrl = (url) => {
    if (!url) return null;
    const parts = url.split('/');
    const versionIndex = parts.findIndex(part => part.startsWith('v') && !isNaN(part.substring(1)));
    if (versionIndex === -1) return null;
    const publicIdWithExtension = parts.slice(versionIndex + 1).join('/'); // Отримуємо "products/<publicId>.jpg"
    const publicId = publicIdWithExtension.split('.')[0]; // Видаляємо розширення
    return publicId;
};

app.post('/api/products', authenticateToken, async (req, res) => {
    try {
        const productData = req.body;
        console.log('Отримано дані продукту:', productData);

        const { error } = productSchemaValidation.validate(productData);
        if (error) {
            console.error('Помилка валідації продукту:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const product = new Product(productData);
        await product.save();

        const products = await Product.find();
        broadcast('products', products);

        res.status(201).json(product);
    } catch (err) {
        console.error('Помилка при додаванні товару:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.put('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        let productData = { ...req.body };
        console.log('Отримано дані для оновлення продукту:', productData);

        delete productData._id;
        delete productData.__v;
        if (productData.colors) {
            productData.colors = productData.colors.map(color => {
                const { _id, ...rest } = color;
                return rest;
            });
        }

        const { error } = productSchemaValidation.validate(productData);
        if (error) {
            console.error('Помилка валідації продукту:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const product = await Product.findByIdAndUpdate(req.params.id, productData, { new: true });
        if (!product) return res.status(404).json({ error: 'Товар не знайдено' });

        const products = await Product.find();
        broadcast('products', products);
        res.json(product);
    } catch (err) {
        console.error('Помилка при оновленні товару:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.delete('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ error: 'Товар не знайдено' });

        const photosToDelete = [...(product.photos || []), ...(product.colors.map(color => color.photo).filter(Boolean))];
        for (const photoUrl of photosToDelete) {
            const publicId = getPublicIdFromUrl(photoUrl);
            if (publicId) {
                try {
                    await cloudinary.uploader.destroy(publicId);
                    console.log(`Успішно видалено файл з Cloudinary: ${publicId}`);
                } catch (err) {
                    console.error(`Не вдалося видалити файл з Cloudinary: ${publicId}`, err);
                }
            }
        }

        const products = await Product.find();
        broadcast('products', products);
        res.json({ message: 'Товар видалено' });
    } catch (err) {
        console.error('Помилка при видаленні товару:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

const categorySchemaValidation = Joi.object({
    name: Joi.string().min(1).max(255).required(),
    slug: Joi.string().min(1).max(255).required(),
    img: Joi.string().allow(''),
    subcategories: Joi.array().items(
        Joi.object({
            name: Joi.string().min(1).max(255).required(),
            slug: Joi.string().min(1).max(255).required()
        })
    ).default([])
});

// Маршрути для роботи з категоріями
app.get('/api/categories', authenticateToken, async (req, res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (err) {
        console.error('Помилка при отриманні категорій:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

// Оновлений POST /api/categories
app.post('/api/categories', authenticateToken, async (req, res) => {
    try {
        const categoryData = req.body;
        console.log('Отримано дані категорії:', categoryData);

        const { error } = categorySchemaValidation.validate(categoryData);
        if (error) {
            console.error('Помилка валідації категорії:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const category = new Category(categoryData);
        await category.save();
        const categories = await Category.find();
        broadcast('categories', categories);
        res.status(201).json(category);
    } catch (err) {
        console.error('Помилка при додаванні категорії:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.put('/api/categories/:slug', authenticateToken, async (req, res) => {
    try {
        const categoryData = req.body;
        const category = await Category.findOne({ slug: req.params.slug });
        if (!category) return res.status(404).json({ error: 'Категорію не знайдено' });

        if (category.img && categoryData.img !== category.img) {
            const publicId = getPublicIdFromUrl(category.img);
            if (publicId) {
                await cloudinary.uploader.destroy(publicId);
                console.log(`Видалено старе зображення категорії: ${publicId}`);
            }
        }

        const updatedCategory = await Category.findOneAndUpdate({ slug: req.params.slug }, categoryData, { new: true });
        const categories = await Category.find();
        broadcast('categories', categories);
        res.json(updatedCategory);
    } catch (err) {
        console.error('Помилка при оновленні категорії:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.delete('/api/categories/:slug', authenticateToken, async (req, res) => {
    try {
        const category = await Category.findOneAndDelete({ slug: req.params.slug });
        if (!category) return res.status(404).json({ error: 'Категорію не знайдено' });
        const categories = await Category.find();
        broadcast('categories', categories);
        res.json({ message: 'Категорію видалено' });
    } catch (err) {
        console.error('Помилка при видаленні категорії:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

const subcategorySchemaValidation = Joi.object({
    name: Joi.string().min(1).max(255).required(),
    slug: Joi.string().min(1).max(255).required()
});

app.post('/api/categories/:slug/subcategories', authenticateToken, async (req, res) => {
    try {
        const categorySlug = req.params.slug;
        const subcategoryData = req.body;
        console.log('Отримано дані для підкатегорії:', subcategoryData);

        const { error } = subcategorySchemaValidation.validate(subcategoryData);
        if (error) {
            console.error('Помилка валідації підкатегорії:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const category = await Category.findOne({ slug: categorySlug });
        if (!category) {
            return res.status(404).json({ error: 'Категорію не знайдено' });
        }

        if (!category.subcategories) {
            category.subcategories = [];
        }

        if (category.subcategories.some(sub => sub.slug === subcategoryData.slug)) {
            return res.status(400).json({ error: 'Підкатегорія з таким slug уже існує' });
        }

        category.subcategories.push(subcategoryData);
        await category.save();

        const categories = await Category.find();
        broadcast('categories', categories);
        res.status(201).json(subcategoryData);
    } catch (err) {
        console.error('Помилка при додаванні підкатегорії:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

// Маршрути для роботи зі слайдами
app.get('/api/slides', authenticateToken, async (req, res) => {
    try {
        const slides = await Slide.find().sort({ order: 1 });
        res.json(slides);
    } catch (err) {
        console.error('Помилка при отриманні слайдів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/slides', authenticateToken, async (req, res) => {
    try {
        const slideData = req.body;
        const maxIdSlide = await Slide.findOne().sort({ id: -1 });
        slideData.id = maxIdSlide ? maxIdSlide.id + 1 : 1;
        const slide = new Slide(slideData);
        await slide.save();
        const slides = await Slide.find().sort({ order: 1 });
        broadcast('slides', slides);
        res.status(201).json(slide);
    } catch (err) {
        console.error('Помилка при додаванні слайду:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.put('/api/slides/:id', authenticateToken, async (req, res) => {
    try {
        const slideData = req.body;
        const slide = await Slide.findOneAndUpdate({ id: req.params.id }, slideData, { new: true });
        if (!slide) return res.status(404).json({ error: 'Слайд не знайдено' });
        const slides = await Slide.find().sort({ order: 1 });
        broadcast('slides', slides);
        res.json(slide);
    } catch (err) {
        console.error('Помилка при оновленні слайду:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.delete('/api/slides/:id', authenticateToken, async (req, res) => {
    try {
        const slide = await Slide.findOneAndDelete({ id: req.params.id });
        if (!slide) return res.status(404).json({ error: 'Слайд не знайдено' });
        const slides = await Slide.find().sort({ order: 1 });
        broadcast('slides', slides);
        res.json({ message: 'Слайд видалено' });
    } catch (err) {
        console.error('Помилка при видаленні слайду:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/refresh-token', (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Токен відсутній' });

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const newToken = jwt.sign(
            { userId: decoded.userId, username: decoded.username, role: decoded.role },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );
        res.json({ token: newToken });
    } catch (e) {
        res.status(403).json({ error: 'Недійсний токен' });
    }
});

// Маршрути для роботи з налаштуваннями
app.get('/api/settings', authenticateToken, async (req, res) => {
    try {
        const settings = await Settings.findOne();
        if (!settings) {
            const defaultSettings = new Settings({});
            await defaultSettings.save();
            return res.json(defaultSettings);
        }
        res.json(settings);
    } catch (err) {
        console.error('Помилка при отриманні налаштувань:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.put('/api/settings', authenticateToken, async (req, res) => {
    try {
        const settingsData = req.body;
        console.log('Отримано дані для оновлення налаштувань:', settingsData);

        const { error } = settingsSchemaValidation.validate(settingsData, { abortEarly: false });
        if (error) {
            console.error('Помилка валідації налаштувань:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings({
                name: '',
                baseUrl: '',
                logo: '',
                logoWidth: 150,
                favicon: '',
                contacts: { phones: '', addresses: '', schedule: '' },
                socials: [],
                showSocials: true,
                about: '',
                categoryWidth: 0,
                categoryHeight: 0,
                productWidth: 0,
                productHeight: 0,
                filters: [],
                orderFields: [],
                slideWidth: 0,
                slideHeight: 0,
                slideInterval: 3000,
                showSlides: true
            });
        }

        const updatedData = {
            ...settings.toObject(),
            ...settingsData,
            contacts: {
                ...settings.contacts,
                ...(settingsData.contacts || {})
            },
            socials: settingsData.socials || settings.socials,
            filters: settingsData.filters || settings.filters,
            orderFields: settingsData.orderFields || settings.orderFields,
            showSlides: settingsData.showSlides !== undefined ? settingsData.showSlides : settings.showSlides,
            slideInterval: settingsData.slideInterval !== undefined ? settingsData.slideInterval : settings.slideInterval
        };

        Object.assign(settings, updatedData);
        await settings.save();

        const settingsToSend = settings.toObject();
        delete settingsToSend._id;
        delete settingsToSend.__v;

        broadcast('settings', settingsToSend);
        res.json(settingsToSend);
    } catch (err) {
        console.error('Помилка при оновленні налаштувань:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

// Маршрути для роботи з замовленнями
app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find();
        res.json(orders);
    } catch (err) {
        console.error('Помилка при отриманні замовлень:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/orders', async (req, res) => {
    try {
        console.log('Отримано запит на створення замовлення:', req.body);
        const orderData = req.body;

        const { error } = orderSchemaValidation.validate(orderData);
        if (error) {
            console.error('Помилка валідації замовлення:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const maxIdOrder = await Order.findOne().sort({ id: -1 });
        orderData.id = maxIdOrder ? maxIdOrder.id + 1 : 1;

        const order = new Order(orderData);
        await order.save();

        console.log('Замовлення успішно створено:', order);
        const orders = await Order.find();
        broadcast('orders', orders);
        res.status(201).json(order);
    } catch (err) {
        console.error('Помилка при додаванні замовлення:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.get('/api/cart', async (req, res) => {
    try {
        const cartId = req.query.cartId;
        console.log('GET /api/cart:', { cartId });
        if (!cartId) {
            return res.status(400).json({ error: 'cartId є обов’язковим параметром' });
        }
        let cart = await Cart.findOne({ cartId });
        if (!cart) {
            console.log('Кошик не знайдено, створюємо новий:', { cartId });
            cart = new Cart({ cartId, items: [] });
            await cart.save();
        }
        console.log('Повертаємо кошик:', cart.items);
        res.json(cart.items);
    } catch (err) {
        console.error('Помилка при отриманні кошика:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/cart', async (req, res) => {
    try {
        const cartId = req.query.cartId;
        console.log('POST /api/cart:', { cartId, body: req.body });
        if (!cartId) {
            return res.status(400).json({ error: 'cartId є обов’язковим параметром' });
        }
        const cartItems = req.body;

        const cartSchemaValidation = Joi.array().items(
            Joi.object({
                id: Joi.number().required(),
                name: Joi.string().required(),
                quantity: Joi.number().min(1).required(),
                price: Joi.number().min(0).required(),
                color: Joi.string().allow(''),
                photo: Joi.string().uri().allow('') // Дозволяємо photo як URL
            })
        );

        const { error } = cartSchemaValidation.validate(cartItems);
        if (error) {
            console.error('Помилка валідації кошика:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        let cart = await Cart.findOne({ cartId });
        if (!cart) {
            console.log('Кошик не знайдено, створюємо новий:', { cartId });
            cart = new Cart({ cartId, items: cartItems });
        } else {
            console.log('Оновлюємо існуючий кошик:', { cartId });
            cart.items = cartItems;
            cart.updatedAt = Date.now();
        }
        await cart.save();

        console.log('Кошик успішно збережено:', { cartId });
        res.status(200).json({ success: true });
    } catch (err) {
        console.error('Помилка при збереженні кошика:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

// Новий ендпоінт для очищення старих кошиків
app.post('/api/cleanup-carts', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            console.log('Спроба доступу до /api/cleanup-carts без прав адміністратора:', req.user);
            return res.status(403).json({ error: 'Доступ заборонено. Потрібні права адміністратора.' });
        }

        const deletedCount = await cleanupOldCarts();
        console.log(`Адміністратор ${req.user.username} викликав очищення кошиків. Кількість видалених: ${deletedCount}`);
        res.status(200).json({ message: `Старі кошики видалено. Кількість: ${deletedCount}` });
    } catch (err) {
        console.error('Помилка при очищенні кошиків через /api/cleanup-carts:', err);
        res.status(500).json({ error: 'Помилка при очищенні кошиків', details: err.message });
    }
});

app.put('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
        const orderData = req.body;

        const { error } = orderSchemaValidation.validate(orderData);
        if (error) {
            console.error('Помилка валідації замовлення:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const order = await Order.findOneAndUpdate({ id: req.params.id }, orderData, { new: true });
        if (!order) return res.status(404).json({ error: 'Замовлення не знайдено' });

        const orders = await Order.find();
        broadcast('orders', orders);
        res.json(order);
    } catch (err) {
        console.error('Помилка при оновленні замовлення:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.delete('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
        const order = await Order.findOneAndDelete({ id: req.params.id });
        if (!order) return res.status(404).json({ error: 'Замовлення не знайдено' });

        const orders = await Order.find();
        broadcast('orders', orders);
        res.json({ message: 'Замовлення видалено' });
    } catch (err) {
        console.error('Помилка при видаленні замовлення:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

// Маршрути для роботи з матеріалами
app.get('/api/materials', authenticateToken, async (req, res) => {
    try {
        const materials = await Material.find().distinct('name');
        res.json(materials);
    } catch (err) {
        console.error('Помилка при отриманні матеріалів:', err);
        res.status(500).json({ error: 'Помилка завантаження матеріалів', details: err.message });
    }
});

app.post('/api/materials', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Назва матеріалу обов’язкова' });

        let material = await Material.findOne({ name });
        if (!material) {
            material = new Material({ name });
            await material.save();
            const materials = await Material.find().distinct('name');
            broadcast('materials', materials); // Оновлюємо клієнтів через WebSocket
        }
        res.status(201).json(material.name);
    } catch (err) {
        console.error('Помилка при додаванні матеріалу:', err);
        res.status(500).json({ error: 'Помилка додавання матеріалу', details: err.message });
    }
});

// Маршрути для роботи з брендами
app.get('/api/brands', authenticateToken, async (req, res) => {
    try {
        const brands = await Brand.find().distinct('name');
        res.json(brands);
    } catch (err) {
        console.error('Помилка при отриманні брендів:', err);
        res.status(500).json({ error: 'Помилка завантаження брендів', details: err.message });
    }
});

app.post('/api/brands', authenticateToken, async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: 'Назва бренду обов’язкова' });

        let brand = await Brand.findOne({ name });
        if (!brand) {
            brand = new Brand({ name });
            await brand.save();
            const brands = await Brand.find().distinct('name');
            broadcast('brands', brands); // Оновлюємо клієнтів через WebSocket
        }
        res.status(201).json(brand.name);
    } catch (err) {
        console.error('Помилка при додаванні бренду:', err);
        res.status(500).json({ error: 'Помилка додавання бренду', details: err.message });
    }
});

// Маршрути для експорту даних
app.get('/api/backup/site', authenticateToken, async (req, res) => {
    try {
        const settings = await Settings.findOne();
        const categories = await Category.find();
        const slides = await Slide.find();
        const backupData = { settings, categories, slides };
        res.set('Content-Type', 'application/json');
        res.set('Content-Disposition', 'attachment; filename="site-backup.json"');
        res.send(backupData);
    } catch (err) {
        console.error('Помилка при експорті даних сайту:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/backup/products', authenticateToken, async (req, res) => {
    try {
        const products = await Product.find();
        res.set('Content-Type', 'application/json');
        res.set('Content-Disposition', 'attachment; filename="products-backup.json"');
        res.send(products);
    } catch (err) {
        console.error('Помилка при експорті товарів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/backup/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find();
        res.set('Content-Type', 'application/json');
        res.set('Content-Disposition', 'attachment; filename="orders-backup.json"');
        res.send(orders);
    } catch (err) {
        console.error('Помилка при експорті замовлень:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/sitemap', authenticateToken, async (req, res) => {
    try {
        const products = await Product.find({ visible: true, active: true });
        const categories = await Category.find();
        const settings = await Settings.findOne();

        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url>
                <loc>${settings.baseUrl || 'https://mebli.onrender.com'}</loc>
                <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
                <priority>1.0</priority>
            </url>`;

        categories.forEach(cat => {
            sitemap += `
            <url>
                <loc>${settings.baseUrl || 'https://mebli.onrender.com'}/category/${cat.slug}</loc>
                <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
                <priority>0.8</priority>
            </url>`;
            cat.subcategories.forEach(subcat => {
                sitemap += `
                <url>
                    <loc>${settings.baseUrl || 'https://mebli.onrender.com'}/category/${cat.slug}/${subcat.slug}</loc>
                    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
                    <priority>0.7</priority>
                </url>`;
            });
        });

        products.forEach(product => {
            sitemap += `
            <url>
                <loc>${settings.baseUrl || 'https://mebli.onrender.com'}/product/${product.slug}</loc>
                <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
                <priority>0.6</priority>
            </url>`;
        });

        sitemap += `</urlset>`;

        res.set('Content-Type', 'application/xml');
        res.set('Content-Disposition', 'attachment; filename="sitemap.xml"');
        res.send(sitemap);
    } catch (err) {
        console.error('Помилка при створенні sitemap:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

// Маршрути для імпорту даних
app.post('/api/import/site', authenticateToken, importUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не завантажено' });
        }

        const fileContent = JSON.parse(await fs.promises.readFile(req.file.path, 'utf8'));
        const { settings, categories, slides } = fileContent;

        if (settings) {
            await Settings.findOneAndUpdate({}, settings, { upsert: true });
        }

        if (categories) {
            await Category.deleteMany({});
            await Category.insertMany(categories);
        }

        if (slides) {
            await Slide.deleteMany({});
            await Slide.insertMany(slides);
        }

        await fs.promises.unlink(req.file.path); // Видаляємо тимчасовий файл
        const updatedCategories = await Category.find();
        broadcast('categories', updatedCategories);
        const updatedSlides = await Slide.find().sort({ order: 1 });
        broadcast('slides', updatedSlides);
        const updatedSettings = await Settings.findOne();
        broadcast('settings', updatedSettings);
        res.json({ message: 'Дані сайту імпортовано' });
    } catch (err) {
        console.error('Помилка при імпорті даних сайту:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/import/products', authenticateToken, importUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не завантажено' });
        }

        const products = JSON.parse(await fs.promises.readFile(req.file.path, 'utf8'));
        await Product.deleteMany({});
        await Product.insertMany(products);

        await fs.promises.unlink(req.file.path);
        const updatedProducts = await Product.find();
        broadcast('products', updatedProducts);
        res.json({ message: 'Товари імпортовано' });
    } catch (err) {
        console.error('Помилка при імпорті товарів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/import/orders', authenticateToken, importUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не завантажено' });
        }

        const orders = JSON.parse(await fs.promises.readFile(req.file.path, 'utf8'));
        await Order.deleteMany({});
        await Order.insertMany(orders);

        await fs.promises.unlink(req.file.path);
        const updatedOrders = await Order.find();
        broadcast('orders', updatedOrders);
        res.json({ message: 'Замовлення імпортовано' });
    } catch (err) {
        console.error('Помилка при імпорті замовлень:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
        const token = jwt.sign(
            { userId: username, username: ADMIN_USERNAME, role: 'admin' }, // Додаємо userId
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );
        res.json({ token });
    } else {
        res.status(401).json({ error: 'Невірні дані для входу' });
    }
});

// Обробка всіх інших маршрутів для SPA
app.get('*', (req, res) => {
    console.log(`Отримано запит на ${req.path}, відправляємо index.html`);
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Помилка при відправці index.html:', err);
            res.status(500).send('Помилка при відображенні index.html');
        }
    });
});

// Обробка 404 для API-запитів
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
});

app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(500).json({ error: 'Файл занадто великий. Максимальний розмір — 5 МБ.' });
        }
        return res.status(400).json({ error: 'Помилка завантаження файлу', details: err.message });
    }
    console.error('Помилка сервера:', err);
    res.status(500).json({ error: 'Внутрішня помилка сервера', details: err.message });
});