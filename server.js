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
const Material = require('./models/Material');
const Brand = require('./models/Brand');

dotenv.config();

const app = express();

// Перевірка змінних середовища для Cloudinary
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

// Схема для продуктів
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    subcategory: { type: String },
    price: { type: Number, required: true },
    salePrice: { type: Number },
    saleEnd: { type: Date },
    brand: { type: String },
    material: { type: String },
    photos: [String],
    visible: { type: Boolean, default: true },
    active: { type: Boolean, default: true }, // Додано
    slug: { type: String, unique: true },
    type: { type: String, enum: ['simple', 'mattresses', 'group'] },
    sizes: [{ name: String, price: Number }],
    colors: [{ name: String, value: String, photo: String, priceChange: Number }],
    groupProducts: [{ type: Number }], // Змінено на Number
    description: String,
    widthCm: Number,
    depthCm: Number,
    heightCm: Number,
    lengthCm: Number,
    popularity: Number
}, { timestamps: true });

// Схема для замовлень
const orderSchema = new mongoose.Schema({
    id: Number,
    date: { type: Date, default: Date.now },
    customer: Object,
    items: [{
        id: Number,
        quantity: Number,
        price: Number,
        color: String
    }],
    total: Number,
    status: String
});

// Схема для категорій
const categorySchema = new mongoose.Schema({
    name: String,
    slug: String,
    image: String,
    subcategories: [{
        name: String,
        slug: String,
        image: String
    }]
});

// Схема для слайдів
const slideSchema = new mongoose.Schema({
    id: Number,
    image: String,
    title: String,
    text: String,
    link: String,
    linkText: String,
    order: Number
});

// Схема для налаштувань
const settingsSchema = new mongoose.Schema({
    storeName: String,
    baseUrl: String,
    logo: String,
    logoWidth: Number,
    favicon: String,
    contacts: {
        phones: String,
        addresses: String,
        schedule: String
    },
    socials: [{ url: String, icon: String }],
    showSocials: Boolean,
    about: String,
    categoryWidth: Number,
    categoryHeight: Number,
    productWidth: Number,
    productHeight: Number,
    filters: [{
        name: String,
        label: String,
        type: String,
        options: [String]
    }],
    orderFields: [{
        name: String,
        label: String,
        type: String,
        options: [String]
    }],
    slideWidth: Number,
    slideHeight: Number,
    slideInterval: Number,
    showSlides: Boolean
});

const Product = require('./models/Product');
const Order = require('./models/Order');
const Category = require('./models/Category');
const Slide = require('./models/Slide');
const Settings = require('./models/Settings');
const Material = require('./models/Material');
const Brand = require('./models/Brand');

// Схема валідації для продукту
const productSchemaValidation = Joi.object({
    id: Joi.number().optional(),
    type: Joi.string().valid('simple', 'mattresses', 'group').required(),
    name: Joi.string().min(1).max(255).required(),
    slug: Joi.string().min(1).max(255).required(),
    brand: Joi.string().max(100).allow(''),
    category: Joi.string().max(100).allow(''),
    subcategory: Joi.string().max(100).allow(''),
    material: Joi.string().max(100).allow(''),
    price: Joi.number().min(0).allow(null),
    salePrice: Joi.number().min(0).allow(null),
    saleEnd: Joi.string().allow(null),
    description: Joi.string().allow(''),
    descriptionDelta: Joi.object().allow(null),
    widthCm: Joi.number().min(0).allow(null),
    depthCm: Joi.number().min(0).allow(null),
    heightCm: Joi.number().min(0).allow(null),
    lengthCm: Joi.number().min(0).allow(null),
    photos: Joi.array().items(Joi.string()).default([]),
    colors: Joi.array().items(
        Joi.object({
            name: Joi.string().max(100).required(),
            value: Joi.string().max(100).required(),
            priceChange: Joi.number().default(0),
            photo: Joi.string().allow(null)
        })
    ).default([]),
    sizes: Joi.array().items(
        Joi.object({
            name: Joi.string().max(100).required(),
            price: Joi.number().min(0).required()
        })
    ).default([]),
    groupProducts: Joi.array().items(Joi.number()).default([]),
    active: Joi.boolean().default(true),
    visible: Joi.boolean().default(true),
    descriptionMedia: Joi.array().items(Joi.string()).default([])
});

// Схема валідації для замовлення
const orderSchemaValidation = Joi.object({
    id: Joi.number().optional(),
    date: Joi.date().default(Date.now),
    customer: Joi.object().required(),
    items: Joi.array().items(
        Joi.object({
            id: Joi.number().required(),
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
    storeName: Joi.string().allow(''),
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
    upload.single('file')(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                return res.status(400).json({ error: 'Файл занадто великий. Максимальний розмір — 5 МБ.' });
            }
            return res.status(400).json({ error: 'Помилка завантаження файлу', details: err.message });
        } else if (err) {
            return res.status(400).json({ error: 'Помилка валідації файлу', details: err.message });
        }
        try {
            if (!req.file || !req.file.path) {
                return res.status(500).json({ error: 'Помилка завантаження: файл не отримано від Cloudinary' });
            }
            console.log('Файл успішно завантажено до Cloudinary:', req.file.path);
            res.json({ url: req.file.path });
        } catch (cloudinaryErr) {
            console.error('Помилка Cloudinary:', cloudinaryErr);
            res.status(500).json({ error: 'Не вдалося завантажити файл до Cloudinary', details: cloudinaryErr.message });
        }
    });
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

        const maxIdProduct = await Product.findOne().sort({ id: -1 });
        productData.id = maxIdProduct ? maxIdProduct.id + 1 : 1;

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

        // Видаляємо системні поля
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

        const product = await Product.findOneAndUpdate({ id: req.params.id }, productData, { new: true });
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
        const product = await Product.findOneAndDelete({ id: req.params.id });
        if (!product) return res.status(404).json({ error: 'Товар не знайдено' });

        // Видаляємо пов’язані фотографії з Cloudinary
        const photosToDelete = [...(product.photos || []), ...(product.colors.map(color => color.photo).filter(Boolean)), ...(product.descriptionMedia || [])];
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

app.post('/api/categories', authenticateToken, async (req, res) => {
    try {
        const categoryData = req.body;
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
        const category = await Category.findOneAndUpdate({ slug: req.params.slug }, categoryData, { new: true });
        if (!category) return res.status(404).json({ error: 'Категорію не знайдено' });
        const categories = await Category.find();
        broadcast('categories', categories);
        res.json(category);
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

app.post('/api/categories/:slug/subcategories', authenticateToken, async (req, res) => {
    try {
        const categorySlug = req.params.slug;
        const subcategoryData = req.body;
        console.log('Отримано дані для підкатегорії:', subcategoryData);

        const category = await Category.findOne({ slug: categorySlug });
        if (!category) {
            return res.status(404).json({ error: 'Категорію не знайдено' });
        }

        if (!category.subcategories) {
            category.subcategories = [];
        }

        // Перевірка унікальності slug підкатегорії
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

        // Валідація за допомогою Joi (оновлена схема відповідно до Settings.js)
        const settingsSchemaValidation = Joi.object({
            name: Joi.string().allow(''),
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
                    name: Joi.string().required(),
                    url: Joi.string().uri().required(),
                    icon: Joi.string().required()
                })
            ).default([]),
            showSocials: Joi.boolean().default(true),
            about: Joi.string().allow(''),
            showSlides: Joi.boolean().default(true),
            slideInterval: Joi.number().min(0).default(3000)
        });

        const { error } = settingsSchemaValidation.validate(settingsData, { abortEarly: false });
        if (error) {
            console.error('Помилка валідації налаштувань:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        let settings = await Settings.findOne();
        if (!settings) {
            settings = new Settings({
                name: '',
                logo: '',
                logoWidth: 150,
                favicon: '',
                contacts: { phones: '', addresses: '', schedule: '' },
                socials: [],
                showSocials: true,
                about: '',
                showSlides: true,
                slideInterval: 3000
            });
        }

        // Оновлюємо тільки передані поля
        const updatedData = {
            ...settings.toObject(),
            ...settingsData,
            contacts: {
                ...settings.contacts,
                ...(settingsData.contacts || {})
            },
            socials: settingsData.socials || settings.socials,
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

app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
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

        const orders = await Order.find();
        broadcast('orders', orders);
        res.status(201).json(order);
    } catch (err) {
        console.error('Помилка при додаванні замовлення:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
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
            { username: ADMIN_USERNAME, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        res.json({ token }); // Змінено формат відповіді
    } else {
        res.status(401).json({ error: 'Невірні дані для входу' }); // Змінено формат помилки
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