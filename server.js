const cookieParser = require('cookie-parser');
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
const rateLimit = require('express-rate-limit');
const csurf = require('csurf');
const winston = require('winston');

// Імпортуємо моделі з окремих файлів
const Product = require('./models/Product');
const Order = require('./models/Order');
const Category = require('./models/Category');
const Slide = require('./models/Slide');
const Settings = require('./models/Settings');
const Material = require('./models/Material');
const Brand = require('./models/Brand');
const Cart = require('./models/Cart');

// Налаштування логера
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' }),
        new winston.transports.Console()
    ]
});

dotenv.config();

const app = express();

// Перевірка змінних середовища для Cloudinary
if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    logger.error('Змінні середовища для Cloudinary (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) не визначені');
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

// Налаштування Express
app.set('case sensitive routing', false);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

// Налаштування CSRF-захисту (зберігання в cookie)
const csrfProtection = csurf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // true для HTTPS у продакшені
        sameSite: 'strict'
    }
});

app.use(cors({
    origin: (origin, callback) => {
        const allowedOrigins = ['https://mebli.onrender.com', 'http://localhost:3000'];
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token']
}));

// Логування всіх запитів
app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
});

// Перевірка змінних середовища
if (!process.env.MONGO_URI) {
    logger.error('MONGO_URI не визначено у змінних середовища');
    process.exit(1);
}

if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET не визначено у змінних середовища');
    process.exit(1);
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    logger.error('ADMIN_USERNAME або ADMIN_PASSWORD не визначено у змінних середовища');
    process.exit(1);
}

const ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

// Налаштування статичних файлів
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    logger.error(`Папка public не знайдена за шляхом: ${publicPath}`);
    process.exit(1);
}

const indexPath = path.join(publicPath, 'index.html');
if (!fs.existsSync(indexPath)) {
    logger.error(`index.html не знайдено за шляхом: ${indexPath}`);
    process.exit(1);
}

const adminPath = path.join(publicPath, 'admin.html');
if (!fs.existsSync(adminPath)) {
    logger.error(`admin.html не знайдено за шляхом: ${adminPath}`);
    process.exit(1);
}

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

// Маршрут для адмінки
app.get('/admin', (req, res) => {
    logger.info('Отримано запит на /admin');
    logger.info('Шлях до admin:', adminPath);
    res.sendFile(adminPath, (err) => {
        if (err) {
            logger.error('Помилка при відправці admin.html:', err);
            res.status(500).send('Помилка при відображенні admin.html');
        } else {
            logger.info('admin.html успішно відправлено');
        }
    });
});

// Тестовий маршрут
app.get('/test-admin', (req, res) => {
    logger.info('Отримано запит на /test-admin');
    res.send('Це тестовий маршрут для адміна');
});

// Підключення до MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => logger.info('MongoDB підключено'))
    .catch(err => {
        logger.error('Помилка підключення до MongoDB:', {
            message: err.message,
            stack: err.stack,
            uri: process.env.MONGO_URI
        });
        process.exit(1);
    });

// Схеми валідації
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

const orderSchemaValidation = Joi.object({
    id: Joi.number().optional(),
    date: Joi.date().default(Date.now),
    customer: Joi.object().required(),
    items: Joi.array().items(
        Joi.object({
            id: Joi.number().required(),
            name: Joi.string().required(),
            quantity: Joi.number().min(1).required(),
            price: Joi.number().min(0).required(),
            color: Joi.string().allow(''),
            _id: Joi.any().optional()
        })
    ).required(),
    total: Joi.number().min(0).required(),
    status: Joi.string().default('Нове замовлення')
});

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
            name: Joi.string().allow(''),
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
    showSlides: Joi.boolean().default(true),
    _id: Joi.any().optional(),
    __v: Joi.any().optional(),
    createdAt: Joi.any().optional(),
    updatedAt: Joi.any().optional()
}).unknown(false);

const materialSchemaValidation = Joi.object({
    name: Joi.string().trim().min(1).max(100).required()
});

const brandSchemaValidation = Joi.object({
    name: Joi.string().trim().min(1).max(100).required()
});

const cartIdSchema = Joi.string()
    .pattern(/^cart-[a-z0-9]{9}$/)
    .required()
    .messages({
        'string.pattern.base': 'cartId повинен бути у форматі "cart-" з 9 випадковими символами (a-z, 0-9)'
    });

const slideSchemaValidation = Joi.object({
    id: Joi.number().optional(),
    image: Joi.string().allow(''),
    name: Joi.string().allow(''),
    url: Joi.string().allow(''),
    title: Joi.string().allow(''),
    text: Joi.string().allow(''),
    link: Joi.string().allow(''),
    linkText: Joi.string().allow(''),
    order: Joi.number().default(0)
});

// Мідлвер для аутентифікації
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        logger.info('Токен відсутній у запиті:', req.path, 'Заголовки:', req.headers);
        return res.status(401).json({ error: 'Доступ заборонено. Токен відсутній.' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'admin') {
            logger.info('Недостатньо прав:', req.path, 'Декодовані дані:', decoded);
            return res.status(403).json({ error: 'Доступ заборонено. Потрібні права адміністратора.' });
        }
        logger.info('Токен верифіковано для шляху:', req.path, 'Декодовані дані:', decoded);
        req.user = decoded;
        next();
    } catch (err) {
        logger.error('Помилка верифікації токена:', req.path, 'Токен:', token, 'Помилка:', err.message);
        return res.status(401).json({ error: 'Недійсний або прострочений токен', details: err.message });
    }
};

// Налаштування WebSocket
const server = app.listen(process.env.PORT || 3000, () => logger.info(`Сервер запущено на порту ${process.env.PORT || 3000}`));
const wss = new WebSocket.Server({ server });

function broadcast(type, data) {
    logger.info(`Трансляція даних типу ${type}:`);
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

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    let token = urlParams.get('token');

    ws.isAdmin = false;
    ws.subscriptions = new Set();

    const verifyToken = () => {
        if (!token) {
            logger.info('WebSocket: Підключення без токена (публічний клієнт)');
            return true;
        }
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.role === 'admin') {
                ws.isAdmin = true;
                logger.info('WebSocket: Адмін підключився з токеном:', decoded);
            }
            return true;
        } catch (err) {
            logger.error('WebSocket: Помилка верифікації токена:', err.message);
            ws.close(1008, 'Недійсний токен');
            return false;
        }
    };

    if (!verifyToken()) return;

    const refreshTokenWithRetry = async (retries = 3, delay = 5000) => {
        for (let i = 0; i < retries; i++) {
            try {
                const response = await fetch('https://mebli.onrender.com/api/auth/refresh', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                if (!response.ok) throw new Error(`Помилка ${response.status}`);
                const data = await response.json();
                token = data.token;
                logger.info('WebSocket: Токен оновлено');
                return true;
            } catch (err) {
                if (i === retries - 1) {
                    logger.error('WebSocket: Не вдалося оновити токен після всіх спроб:', err);
                    ws.close(1008, 'Помилка оновлення токена');
                    return false;
                }
                await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i)));
            }
        }
    };

    let tokenRefreshInterval;
    if (ws.isAdmin) {
        tokenRefreshInterval = setInterval(async () => {
            await refreshTokenWithRetry();
        }, 25 * 60 * 1000);
    }

    ws.on('close', () => {
        if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
        logger.info('Клієнт від’єднався від WebSocket');
    });

    ws.on('message', async (message) => {
        try {
            const { type, action } = JSON.parse(message);
            logger.info(`Отримано WebSocket-повідомлення: type=${type}, action=${action}`);

            if (action === 'subscribe') {
                ws.subscriptions.add(type);
                logger.info(`Клієнт підписався на ${type}`);

                if (type === 'products') {
                    const products = ws.isAdmin
                        ? await Product.find()
                        : await Product.find({ visible: true, active: true });
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
                } else if (!ws.isAdmin && ['orders', 'materials', 'brands'].includes(type)) {
                    ws.send(JSON.stringify({ type: 'error', error: 'Доступ заборонено для публічних клієнтів' }));
                }
            }
        } catch (err) {
            logger.error('Помилка обробки WebSocket-повідомлення:', err);
            ws.send(JSON.stringify({ type: 'error', error: 'Помилка обробки підписки', details: err.message }));
        }
    });

    ws.on('error', (err) => logger.error('Помилка WebSocket:', err));
});

app.get('/api/csrf-token', csrfProtection, (req, res) => {
    try {
        const token = req.csrfToken();
        logger.info('Згенеровано CSRF-токен:', token);
        res.json({ csrfToken: token });
    } catch (err) {
        logger.error('Помилка генерації CSRF-токена:', err);
        res.status(500).json({ error: 'Не вдалося згенерувати CSRF-токен', details: err.message });
    }
});

// Маршрути з CSRF-захистом
app.post('/api/upload', authenticateToken, csrfProtection, (req, res, next) => {
    upload.single('file')(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            logger.error('Multer помилка:', err);
            return res.status(400).json({ error: 'Помилка завантаження файлу', details: err.message });
        } else if (err) {
            logger.error('Помилка валідації файлу:', err);
            return res.status(400).json({ error: 'Помилка валідації файлу', details: err.message });
        }
        try {
            logger.info('Файл отримано:', req.file);
            if (!req.file || !req.file.path) {
                logger.error('Cloudinary не повернув шлях файлу:', req.file);
                return res.status(500).json({ error: 'Помилка завантаження: файл не отриміано від Cloudinary' });
            }
            res.json({ url: req.file.path });
        } catch (cloudinaryErr) {
            logger.error('Помилка Cloudinary:', cloudinaryErr);
            if (req.file && req.file.path) {
                try {
                    await cloudinary.uploader.destroy(req.file.filename);
                } catch (deleteErr) {
                    logger.error('Не вдалося видалити файл після помилки:', deleteErr);
                }
            }
            res.status(500).json({ error: 'Не вдалося завантажити файл до Cloudinary', details: cloudinaryErr.message });
        }
    });
});

app.get('/api/filters', authenticateToken, async (req, res) => {
    try {
        const settings = await Settings.findOne();
        const filters = settings ? settings.filters || [] : [];
        res.json(filters);
    } catch (err) {
        logger.error('Помилка при отриманні фільтрів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/public/products', async (req, res) => {
    try {
        const { slug, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;
        let query = { visible: true, active: true };
        if (slug) query.slug = slug;
        const products = await Product.find(query).skip(skip).limit(parseInt(limit));
        const total = await Product.countDocuments(query);
        res.json({ products, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        logger.error('Помилка при отриманні товарів:', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/public/settings', async (req, res) => {
    try {
        const settings = await Settings.findOne();
        res.json(settings || {});
    } catch (err) {
        logger.error('Помилка при отриманні публічних налаштувань:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/public/categories', async (req, res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (err) {
        logger.error('Помилка при отриманні публічних категорій:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/public/search', async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.status(400).json({ error: 'Параметр query обов’язковий' });
        const products = await Product.find({
            $or: [
                { name: { $regex: query, $options: 'i' } },
                { description: { $regex: query, $options: 'i' } }
            ],
            visible: true,
            active: true
        });
        res.json(products);
    } catch (err) {
        logger.error('Помилка при пошуку продуктів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/public/slides', async (req, res) => {
    try {
        const slides = await Slide.find().sort({ order: 1 });
        res.json(slides);
    } catch (err) {
        logger.error('Помилка при отриманні публічних слайдів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/products', authenticateToken, async (req, res) => {
    try {
        const { slug } = req.query;
        logger.info(`GET /api/products: slug=${slug}, user=${req.user.username}`);
        if (slug) {
            const products = await Product.find({ slug });
            return res.json(products);
        }
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        logger.error('Помилка при отриманні товарів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

const getPublicIdFromUrl = (url) => {
    if (!url) return null;
    const parts = url.split('/');
    const versionIndex = parts.findIndex(part => part.startsWith('v') && !isNaN(part.substring(1)));
    if (versionIndex === -1) return null;
    const publicIdWithExtension = parts.slice(versionIndex + 1).join('/');
    const publicId = publicIdWithExtension.split('.')[0];
    return publicId;
};

app.post('/api/products', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const productData = req.body;
        logger.info('Отримано дані продукту:', productData);

        const { error } = productSchemaValidation.validate(productData);
        if (error) {
            logger.error('Помилка валідації продукту:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const product = new Product(productData);
        await product.save();

        const products = await Product.find();
        broadcast('products', products);

        res.status(201).json(product);
    } catch (err) {
        logger.error('Помилка при додаванні товару:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.put('/api/products/:id', authenticateToken, csrfProtection, async (req, res) => {
    try {
        let productData = { ...req.body };
        logger.info('Отримано дані для оновлення продукту:', productData);

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
            logger.error('Помилка валідації продукту:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const product = await Product.findByIdAndUpdate(req.params.id, productData, { new: true });
        if (!product) return res.status(404).json({ error: 'Товар не знайдено' });

        const products = await Product.find();
        broadcast('products', products);
        res.json(product);
    } catch (err) {
        logger.error('Помилка при оновленні товару:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.delete('/api/products/:id', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const product = await Product.findByIdAndDelete(req.params.id);
        if (!product) return res.status(404).json({ error: 'Товар не знайдено' });

        const photosToDelete = [...(product.photos || []), ...(product.colors.map(color => color.photo).filter(Boolean))];
        for (const photoUrl of photosToDelete) {
            const publicId = getPublicIdFromUrl(photoUrl);
            if (publicId) {
                try {
                    await cloudinary.uploader.destroy(publicId);
                    logger.info(`Успішно видалено файл з Cloudinary: ${publicId}`);
                } catch (err) {
                    logger.error(`Не вдалося видалити файл з Cloudinary: ${publicId}`, err);
                }
            }
        }

        const products = await Product.find();
        broadcast('products', products);
        res.json({ message: 'Товар видалено' });
    } catch (err) {
        logger.error('Помилка при видаленні товару:', err);
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
            slug: Joi.string().min(1).max(255).required(),
            image: Joi.string().allow('')
        })
    ).default([])
});

app.get('/api/categories', authenticateToken, async (req, res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (err) {
        logger.error('Помилка при отриманні категорій:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/categories', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const categoryData = req.body;
        logger.info('Отримано дані категорії:', categoryData);

        const { error } = categorySchemaValidation.validate(categoryData);
        if (error) {
            logger.error('Помилка валідації категорії:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const existingCategoryByName = await Category.findOne({ name: categoryData.name });
        if (existingCategoryByName) {
            return res.status(400).json({ error: 'Категорія з такою назвою вже існує' });
        }

        const existingCategoryBySlug = await Category.findOne({ slug: categoryData.slug });
        if (existingCategoryBySlug) {
            return res.status(400).json({ error: 'Категорія з таким slug вже існує' });
        }

        const category = new Category(categoryData);
        await category.save();
        const categories = await Category.find();
        broadcast('categories', categories);
        res.status(201).json(category);
    } catch (err) {
        logger.error('Помилка при додаванні категорії:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.put('/api/categories/:slug', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const categoryData = req.body;
        const category = await Category.findOne({ slug: req.params.slug });
        if (!category) return res.status(404).json({ error: 'Категорію не знайдено' });

        if (category.img && categoryData.img !== category.img) {
            const publicId = getPublicIdFromUrl(category.img);
            if (publicId) {
                await cloudinary.uploader.destroy(publicId);
                logger.info(`Видалено старе зображення категорії: ${publicId}`);
            }
        }

        const updatedCategory = await Category.findOneAndUpdate({ slug: req.params.slug }, categoryData, { new: true });
        const categories = await Category.find();
        broadcast('categories', categories);
        res.json(updatedCategory);
    } catch (err) {
        logger.error('Помилка при оновленні категорії:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.delete('/api/categories/:slug', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const category = await Category.findOneAndDelete({ slug: req.params.slug });
        if (!category) return res.status(404).json({ error: 'Категорію не знайдено' });
        const categories = await Category.find();
        broadcast('categories', categories);
        logger.info(`Категорію видалено: ${req.params.slug}, користувач: ${req.user.username}`);
        res.json({ message: 'Категорію видалено' });
    } catch (err) {
        logger.error('Помилка при видаленні категорії:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

const subcategorySchemaValidation = Joi.object({
    name: Joi.string().min(1).max(255).required(),
    slug: Joi.string().min(1).max(255).required(),
    image: Joi.string().allow('')
});

app.post('/api/categories/:slug/subcategories', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const categorySlug = req.params.slug;
        const subcategoryData = req.body;
        logger.info('Отримано дані для підкатегорії:', subcategoryData);

        const { error } = subcategorySchemaValidation.validate(subcategoryData);
        if (error) {
            logger.error('Помилка валідації підкатегорії:', error.details);
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
        logger.error('Помилка при додаванні підкатегорії:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.get('/api/slides', authenticateToken, async (req, res) => {
    try {
        const slides = await Slide.find().sort({ order: 1 });
        res.json(slides);
    } catch (err) {
        logger.error('Помилка при отриманні слайдів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/slides', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const slideData = req.body;
        logger.info('Отримано дані слайду:', slideData);

        const { error } = slideSchemaValidation.validate(slideData);
        if (error) {
            logger.error('Помилка валідації слайду:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const maxIdSlide = await Slide.findOne().sort({ id: -1 });
        slideData.id = maxIdSlide ? maxIdSlide.id + 1 : 1;
        const slide = new Slide(slideData);
        await slide.save();
        const slides = await Slide.find().sort({ order: 1 });
        broadcast('slides', slides);
        res.status(201).json(slide);
    } catch (err) {
        logger.error('Помилка при додаванні слайду:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.put('/api/slides/:id', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const slideData = req.body;

        // Валідація даних
        const { error } = slideSchemaValidation.validate(slideData);
        if (error) {
            logger.error('Помилка валідації слайду:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        // Перевірка обов’язкового поля url
        if (!slideData.url) {
            return res.status(400).json({ error: 'URL зображення є обов’язковим' });
        }

        // Оновлення слайду за _id
        const slide = await Slide.findByIdAndUpdate(
            req.params.id,
            slideData,
            { new: true, runValidators: true }
        );

        if (!slide) {
            return res.status(404).json({ error: 'Слайд не знайдено' });
        }

        // Оновлення всіх слайдів для WebSocket
        const slides = await Slide.find().sort({ order: 1 });
        broadcast('slides', slides);

        res.json(slide);
    } catch (err) {
        logger.error('Помилка при оновленні слайду:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.delete('/api/slides/:id', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const slide = await Slide.findOneAndDelete({ id: req.params.id });
        if (!slide) return res.status(404).json({ error: 'Слайд не знайдено' });
        const slides = await Slide.find().sort({ order: 1 });
        broadcast('slides', slides);
        res.json({ message: 'Слайд видалено' });
    } catch (err) {
        logger.error('Помилка при видаленні слайду:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/auth/refresh', csrfProtection, (req, res) => {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ error: 'Токен відсутній' });
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'admin') {
            return res.status(403).json({ error: 'Доступ заборонено. Потрібні права адміністратора.' });
        }
        const newToken = jwt.sign(
            { userId: decoded.userId, username: decoded.username, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );
        logger.info('Токен успішно оновлено для користувача:', decoded.username);
        res.json({ token: newToken });
    } catch (err) {
        logger.error('Помилка оновлення токена:', err.message);
        res.status(401).json({ error: 'Недійсний або прострочений токен' });
    }
});

app.get('/api/settings', authenticateToken, async (req, res) => {
    try {
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
            await settings.save();
        }
        res.json(settings);
    } catch (err) {
        logger.error('Помилка при отриманні налаштувань:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.put('/api/settings', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const settingsData = req.body;
        logger.info('Отримано дані для оновлення налаштувань:', JSON.stringify(settingsData, null, 2));

        const { _id, __v, createdAt, updatedAt, ...cleanedSettingsData } = settingsData;

        const { error } = settingsSchemaValidation.validate(cleanedSettingsData, { abortEarly: false });
        if (error) {
            logger.error('Помилка валідації налаштувань:', error.details);
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
            ...cleanedSettingsData,
            contacts: {
                ...settings.contacts,
                ...(cleanedSettingsData.contacts || {})
            },
            socials: cleanedSettingsData.socials || settings.socials,
            filters: cleanedSettingsData.filters || settings.filters,
            orderFields: cleanedSettingsData.orderFields || settings.orderFields,
            showSlides: cleanedSettingsData.showSlides !== undefined ? cleanedSettingsData.showSlides : settings.showSlides,
            slideInterval: cleanedSettingsData.slideInterval !== undefined ? cleanedSettingsData.slideInterval : settings.slideInterval
        };

        Object.assign(settings, updatedData);
        await settings.save();

        const settingsToSend = settings.toObject();
        delete settingsToSend._id;
        delete settingsToSend.__v;

        broadcast('settings', settingsToSend);
        res.json(settingsToSend);
    } catch (err) {
        logger.error('Помилка при оновленні налаштувань:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find();
        res.json(orders);
    } catch (err) {
        logger.error('Помилка при отриманні замовлень:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/orders', csrfProtection, async (req, res) => {
    try {
        logger.info('Отримано запит на створення замовлення:', req.body);
        const orderData = req.body;
        const cartId = req.query.cartId;

        const { error } = orderSchemaValidation.validate(orderData);
        if (error) {
            logger.error('Помилка валідації замовлення:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const maxIdOrder = await Order.findOne().sort({ id: -1 }).session(session);
            orderData.id = maxIdOrder ? maxIdOrder.id + 1 : 1;

            const order = new Order(orderData);
            await order.save({ session });

            if (cartId) {
                await Cart.findOneAndUpdate({ cartId }, { items: [] }, { session });
            }

            await session.commitTransaction();
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }

        logger.info('Замовлення успішно створено:', { orderId: orderData.id, customer: orderData.customer.name });
        const orders = await Order.find();
        broadcast('orders', orders);
        res.status(201).json(orderData);
    } catch (err) {
        logger.error('Помилка при додаванні замовлення:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.get('/api/cart', async (req, res) => {
    try {
        const cartId = req.query.cartId;
        logger.info('GET /api/cart:', { cartId });
        const { error } = cartIdSchema.validate(cartId);
        if (error) {
            return res.status(400).json({ error: 'Невірний формат cartId', details: error.details });
        }
        let cart = await Cart.findOne({ cartId });
        if (!cart) {
            logger.info('Кошик не знайдено, створюємо новий:', { cartId });
            cart = new Cart({ cartId, items: [], updatedAt: Date.now() });
            await cart.save();
        }
        logger.info('Повертаємо кошик:', cart.items);
        res.json(cart.items);
    } catch (err) {
        logger.error('Помилка при отриманні кошика:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/cart', csrfProtection, async (req, res) => {
    try {
        const cartId = req.query.cartId;
        logger.info('POST /api/cart:', { cartId, body: req.body });
        const { error } = cartIdSchema.validate(cartId);
        if (error) {
            return res.status(400).json({ error: 'Невірний формат cartId', details: error.details });
        }
        const cartItems = req.body;

        const cartSchemaValidation = Joi.array().items(
            Joi.object({
                id: Joi.number().required(),
                name: Joi.string().required(),
                quantity: Joi.number().min(1).required(),
                price: Joi.number().min(0).required(),
                color: Joi.string().allow(''),
                photo: Joi.string().uri().allow('')
            })
        );

        const { error: cartError } = cartSchemaValidation.validate(cartItems);
        if (cartError) {
            logger.error('Помилка валідації кошика:', cartError.details);
            return res.status(400).json({ error: 'Помилка валідації', details: cartError.details });
        }

        let cart = await Cart.findOne({ cartId });
        if (!cart) {
            logger.info('Кошик не знайдено, створюємо новий:', { cartId });
            cart = new Cart({ cartId, items: cartItems });
        } else {
            logger.info('Оновлюємо існуючий кошик:', { cartId });
            cart.items = cartItems;
            cart.updatedAt = Date.now();
        }
        await cart.save();

        logger.info('Кошик успішно збережено:', { cartId });
        res.status(200).json({ success: true });
    } catch (err) {
        logger.error('Помилка при збереженні кошика:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

const cleanupOldCarts = async () => {
    try {
        const thresholdDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const result = await Cart.deleteMany({ updatedAt: { $lt: thresholdDate } });
        return result.deletedCount;
    } catch (err) {
        logger.error('Помилка при очищенні старих кошиків:', err);
        throw err;
    }
};

app.post('/api/cleanup-carts', authenticateToken, csrfProtection, async (req, res) => {
    try {
        if (req.user.role !== 'admin') {
            logger.info('Спроба доступу до /api/cleanup-carts без прав адміністратора:', req.user);
            return res.status(403).json({ error: 'Доступ заборонено. Потрібні права адміністратора.' });
        }

        const deletedCount = await cleanupOldCarts();
        logger.info(`Адміністратор ${req.user.username} викликав очищення кошиків. Кількість видалених: ${deletedCount}`);
        res.status(200).json({ message: `Старі кошики видалено. Кількість: ${deletedCount}` });
    } catch (err) {
        logger.error('Помилка при очищенні кошиків через /api/cleanup-carts:', err);
        res.status(500).json({ error: 'Помилка при очищенні кошиків', details: err.message });
    }
});

app.put('/api/orders/:id', authenticateToken, csrfProtection, async (req, res) => {
    try {
        let orderData = req.body;

        if (orderData.items) {
            orderData.items = orderData.items.map(item => {
                const { _id, ...rest } = item;
                return rest;
            });
        }

        const { error } = orderSchemaValidation.validate(orderData);
        if (error) {
            logger.error('Помилка валідації замовлення:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const order = await Order.findByIdAndUpdate(req.params.id, orderData, { new: true });
        if (!order) return res.status(404).json({ error: 'Замовлення не знайдено' });

        const orders = await Order.find();
        broadcast('orders', orders);
        res.json(order);
    } catch (err) {
        logger.error('Помилка при оновленні замовлення:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.delete('/api/orders/:id', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const order = await Order.findOneAndDelete({ id: req.params.id });
        if (!order) return res.status(404).json({ error: 'Замовлення не знайдено' });

        const orders = await Order.find();
        broadcast('orders', orders);
        res.json({ message: 'Замовлення видалено' });
    } catch (err) {
        logger.error('Помилка при видаленні замовлення:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/materials', authenticateToken, async (req, res) => {
    try {
        const materials = await Material.find().distinct('name');
        res.json(materials);
    } catch (err) {
        logger.error('Помилка при отриманні матеріалів:', err);
        res.status(500).json({ error: 'Помилка завантаження матеріалів', details: err.message });
    }
});

app.post('/api/materials', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const { error } = materialSchemaValidation.validate(req.body);
        if (error) {
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const { name } = req.body;
        let material = await Material.findOne({ name });
        if (material) {
            return res.status(200).json({ message: 'Матеріал уже існує', name: material.name });
        }

        material = new Material({ name });
        await material.save();
        const materials = await Material.find().distinct('name');
        broadcast('materials', materials);
        res.status(201).json({ message: 'Матеріал створено', name: material.name });
    } catch (err) {
        logger.error('Помилка при додаванні матеріалу:', err);
        res.status(500).json({ error: 'Помилка додавання матеріалу', details: err.message });
    }
});

app.get('/api/brands', authenticateToken, async (req, res) => {
    try {
        const brands = await Brand.find().distinct('name');
        res.json(brands);
    } catch (err) {
        logger.error('Помилка при отриманні брендів:', err);
        res.status(500).json({ error: 'Помилка завантаження брендів', details: err.message });
    }
});

app.post('/api/brands', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const { error } = brandSchemaValidation.validate(req.body);
        if (error) {
            logger.error('Помилка валідації бренду:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const { name } = req.body;
        let brand = await Brand.findOne({ name });
        if (brand) {
            return res.status(200).json({ message: 'Бренд уже існує', name: brand.name });
        }

        brand = new Brand({ name });
        await brand.save();
        const brands = await Brand.find().distinct('name');
        broadcast('brands', brands);
        res.status(201).json({ message: 'Бренд створено', name: brand.name });
    } catch (err) {
        logger.error('Помилка при додаванні бренду:', err);
        res.status(500).json({ error: 'Помилка додавання бренду', details: err.message });
    }
});

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
        logger.error('Помилка при експорті даних сайту:', err);
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
        logger.error('Помилка при експорті товарів:', err);
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
        logger.error('Помилка при експорті замовлень:', err);
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
        logger.error('Помилка при створенні sitemap:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/import/site', authenticateToken, csrfProtection, importUpload.single('file'), async (req, res) => {
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

        await fs.promises.unlink(req.file.path);
        const updatedCategories = await Category.find();
        broadcast('categories', updatedCategories);
        const updatedSlides = await Slide.find().sort({ order: 1 });
        broadcast('slides', updatedSlides);
        const updatedSettings = await Settings.findOne();
        broadcast('settings', updatedSettings);
        res.json({ message: 'Дані сайту імпортовано' });
    } catch (err) {
        logger.error('Помилка при імпорті даних сайту:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/import/products', authenticateToken, csrfProtection, importUpload.single('file'), async (req, res) => {
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
        logger.error('Помилка при імпорті товарів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/import/orders', authenticateToken, csrfProtection, importUpload.single('file'), async (req, res) => {
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
        logger.error('Помилка при імпорті замовлень:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('*', (req, res) => {
    logger.info(`Отримано запит на ${req.path}, відправляємо index.html`);
    res.sendFile(indexPath, (err) => {
        if (err) {
            logger.error('Помилка при відправці index.html:', err);
            res.status(500).send('Помилка при відображенні index.html');
        }
    });
});

app.use((req, res, next) => {
    logger.info(`${req.method} ${req.path} - ${new Date().toISOString()}`);
    next();
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Занадто багато спроб входу, спробуйте знову через 15 хвилин'
});

app.post('/api/auth/login', loginLimiter, csrfProtection, (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
        return res.status(400).json({ error: 'Логін і пароль обов’язкові', message: 'Логін і пароль обов’язкові' });
    }

    if (username === ADMIN_USERNAME && bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
        const token = jwt.sign(
            { userId: username, username: ADMIN_USERNAME, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );
        res.json({ token });
    } else {
        logger.warn(`Невдала спроба входу: username=${username}, IP=${req.ip}`);
        res.status(401).json({ error: 'Невірні дані для входу', message: 'Невірні дані для входу' });
    }
});

app.use((err, req, res, next) => {
    if (err.code === 'EBADCSRFTOKEN') {
        logger.error('Помилка CSRF:', err);
        return res.status(403).json({ error: 'Недійсний CSRF-токен' });
    }
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({ error: 'Файл занадто великий. Максимальний розмір — 5 МБ.' });
        }
        return res.status(400).json({ error: 'Помилка завантаження файлу', details: err.message });
    }
    logger.error('Помилка сервера:', err);
    res.status(500).json({ error: 'Внутрішня помилка сервера', details: err.message });
});