const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const sanitizeHtml = require('sanitize-html');
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

const { Product } = require('./models/Product');
const Order = require('./models/Order');
const Category = require('./models/Category');
const Slide = require('./models/Slide');
const Settings = require('./models/Settings');
const Material = require('./models/Material');
const Brand = require('./models/Brand');
const { Cart } = require('./models/Cart');
const OrderField = require('./models/OrderField');

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

if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
    logger.error('Змінні середовища для Cloudinary не визначені');
    process.exit(1);
}
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

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
        fileSize: 5 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Дозволені лише файли JPEG, PNG, GIF або WebP'), false);
        }
        cb(null, true);
    }
});

const uploadPath = path.join(__dirname, 'uploads');
try {
    if (!fs.existsSync(uploadPath)) {
        fs.mkdirSync(uploadPath, { recursive: true });
        logger.info(`Створено директорію uploads: ${uploadPath}`);
    }
} catch (err) {
    logger.error(`Не вдалося створити директорію uploads: ${uploadPath}`, err);
    process.exit(1);
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
        fileSize: 10 * 1024 * 1024
    },
    fileFilter: (req, file, cb) => {
        if (file.mimetype !== 'application/json') {
            return cb(new Error('Дозволені лише JSON-файли'), false);
        }
        cb(null, true);
    }
});

app.set('case sensitive routing', false);
app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());

const csrfProtection = csurf({
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60
    },
    ignoreMethods: ['GET', 'HEAD', 'OPTIONS'],
    value: (req) => {
        const token = req.headers['x-csrf-token'];
        if (!token) {
            logger.warn('CSRF-токен відсутній у заголовку X-CSRF-Token');
        }
        return token;
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

const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 500,
    message: 'Занадто багато запитів з вашої IP-адреси, спробуйте знову через 15 хвилин',
    skip: (req) => {
        const staticPaths = ['/admin.html', '/favicon.ico', '/index.html'];
        return req.path === '/api/csrf-token' || staticPaths.includes(req.path);
    }
});

app.use(globalLimiter);

const publicApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 200,
    message: 'Занадто багато запитів до API, спробуйте знову через 15 хвилин'
});

app.use('/api/public', publicApiLimiter);
app.use('/api/cart', publicApiLimiter);

app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
});

app.use((req, res, next) => {
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    logger.info(`${req.method} ${req.path} - IP: ${clientIp} - Query: ${JSON.stringify(req.query)} - Body: ${JSON.stringify(req.body)} - ${new Date().toISOString()}`);
    next();
});

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
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
        if (path.endsWith('.ico') || path.endsWith('.png') || path.endsWith('.jpg')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000');
        }
    }
}));

app.get('/admin', (req, res) => {
    logger.info('Отримано запит на /admin');
    res.sendFile(adminPath, (err) => {
        if (err) {
            logger.error('Помилка при відправці admin.html:', err);
            res.status(500).send('Помилка при відображенні admin.html');
        } else {
            logger.info('admin.html успішно відправлено');
        }
    });
});

app.get('/test-admin', (req, res) => {
    logger.info('Отримано запит на /test-admin');
    res.send('Це тестовий маршрут для адміна');
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: 'Занадто багато спроб входу, спробуйте знову через 15 хвилин'
});

const refreshTokenLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    skipSuccessfulRequests: false,
    keyGenerator: (req) => {
        const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        return clientIp;
    },
    handler: (req, res) => {
        res.status(429).json({
            error: 'Занадто багато запитів',
            details: 'Перевищено ліміт запитів на оновлення токена. Спробуйте знову через 15 хвилин'
        });
    }
});

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

const productSchemaValidation = Joi.object({
    id: Joi.number().optional(),
    name: Joi.string().min(1).max(255).required().trim(),
    category: Joi.string().max(100).required().trim(),
    subcategory: Joi.string().max(255).optional().allow('').trim(),
    price: Joi.number().min(0).when('type', { is: 'simple', then: Joi.required(), otherwise: Joi.allow(null) }),
    salePrice: Joi.number().min(0).when('type', { is: 'simple', then: Joi.allow(null), otherwise: Joi.allow(null) }),
    saleEnd: Joi.date().allow(null),
    brand: Joi.string().max(100).allow('').trim(),
    material: Joi.string().max(100).allow('').trim(),
    filters: Joi.array().items(
        Joi.object({
            name: Joi.string().required(),
            value: Joi.string().required()
        })
    ).default([]),
    photos: Joi.array().items(Joi.string().uri().allow('')).default([]),
    visible: Joi.boolean().default(true),
    active: Joi.boolean().default(true),
    slug: Joi.string().min(1).max(255).required().trim(),
    type: Joi.string().valid('simple', 'mattresses', 'group').required(),
    sizes: Joi.array().items(
        Joi.object({
            name: Joi.string().max(100).required().trim(),
            price: Joi.number().min(0).required()
        })
    ).default([]),
    colors: Joi.array().items(
        Joi.object({
            name: Joi.string().max(100).required().trim(),
            value: Joi.string().max(100).required().trim(),
            priceChange: Joi.number().default(0),
            photo: Joi.string().uri().allow('', null)
        })
    ).default([]),
    groupProducts: Joi.array().items(Joi.string().pattern(/^[0-9a-fA-F]{24}$/)).default([]),
    description: Joi.string().allow('').trim(),
    widthCm: Joi.number().min(0).allow(null),
    depthCm: Joi.number().min(0).allow(null),
    heightCm: Joi.number().min(0).allow(null),
    lengthCm: Joi.number().min(0).allow(null),
    popularity: Joi.number().min(0).default(0)
}).unknown(false);

const orderSchemaValidation = Joi.object({
    id: Joi.number().optional(),
    cartId: Joi.string().default(''),
    date: Joi.date().default(Date.now),
    customer: Joi.object({
        name: Joi.string().min(1).max(255).required(),
        surname: Joi.string().min(1).max(255).optional(),
        email: Joi.string().email().allow('').optional(),
        phone: Joi.string()
            .pattern(/^(0\d{9})$|^(\+?\d{10,15})$/)
            .allow('')
            .optional(),
        address: Joi.string().allow('').optional(),
        payment: Joi.string().allow('').optional()
    }).required(),
    items: Joi.array().items(
        Joi.object({
            id: Joi.number().required(),
            name: Joi.string().required(),
            quantity: Joi.number().min(1).required(),
            price: Joi.number().min(0).required(),
            photo: Joi.string().uri().allow('').optional(),
            color: Joi.object({
                name: Joi.string().allow('').optional(),
                value: Joi.string().allow('').optional(),
                priceChange: Joi.number().default(0),
                photo: Joi.string().uri().allow('', null).optional(),
                size: Joi.string().allow('', null).optional()
            }).allow(null).optional().unknown(false),
            _id: Joi.any().optional()
        }).unknown(false)
    ).required(),
    total: Joi.number().min(0).required(),
    status: Joi.string()
        .valid('Нове замовлення', 'В обробці', 'Відправлено', 'Доставлено', 'Скасовано')
        .default('Нове замовлення')
});

const settingsSchemaValidation = Joi.object({
    name: Joi.string().allow(''),
    baseUrl: Joi.string().uri().allow(''),
    logo: Joi.string().uri().allow(''),
    logoWidth: Joi.number().min(0).default(150),
    favicon: Joi.string().uri().allow(''),
    contacts: Joi.object({
        phones: Joi.string().allow(''),
        addresses: Joi.string().allow(''),
        schedule: Joi.string().allow('')
    }).default({ phones: '', addresses: '', schedule: '' }),
    socials: Joi.array().items(
        Joi.object({
            name: Joi.string().allow(''),
            url: Joi.string().uri().required(),
            icon: Joi.string().allow('')
        })
    ).default([]),
    showSocials: Joi.boolean().default(true),
    about: Joi.string().allow(''),
    categoryWidth: Joi.number().min(0).default(0),
    categoryHeight: Joi.number().min(0).default(0),
    productWidth: Joi.number().min(0).default(0),
    productHeight: Joi.number().min(0).default(0),
    filters: Joi.array().items(
        Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().required(),
            options: Joi.array().items(Joi.string().min(1)).default([])
        })
    ).default([]),
    orderFields: Joi.array().items(
        Joi.object({
            name: Joi.string().required(),
            label: Joi.string().required(),
            type: Joi.string().required(),
            options: Joi.array().items(Joi.string().min(1)).default([])
        })
    ).default([]),
    slideWidth: Joi.number().min(0).default(0),
    slideHeight: Joi.number().min(0).default(0),
    slideInterval: Joi.number().min(0).default(3000),
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
    id: Joi.number().required(),
    photo: Joi.string().uri().allow('').optional(),
    name: Joi.string().allow(''),
    link: Joi.string().uri().allow('').optional(),
    title: Joi.string().allow(''),
    text: Joi.string().allow(''),
    linkText: Joi.string().allow(''),
    order: Joi.number().min(0).default(0)
});

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

const server = app.listen(process.env.PORT || 3000, () => logger.info(`Сервер запущено на порту ${process.env.PORT || 3000}`));
const wss = new WebSocket.Server({ server });

setInterval(async () => {
    try {
        const deletedCount = await cleanupOldCarts();
        if (deletedCount > 0) {
            logger.info(`Автоматичне очищення старих кошиків: видалено ${deletedCount} кошиків`);
        }
    } catch (err) {
        logger.error('Помилка при автоматичному очищенні старих кошиків:', err);
    }
}, 24 * 60 * 60 * 1000);

setInterval(async () => {
    try {
        const files = await fs.promises.readdir(uploadPath);
        const thresholdDate = Date.now() - 24 * 60 * 60 * 1000;
        const filesToDelete = [];

        for (const file of files) {
            const filePath = path.join(uploadPath, file);
            const stats = await fs.promises.stat(filePath);
            if (stats.mtimeMs < thresholdDate) {
                filesToDelete.push(filePath);
            }
        }

        await Promise.all(filesToDelete.map(async (filePath) => {
            try {
                await fs.promises.unlink(filePath);
                logger.info(`Видалено застарілий файл: ${filePath}`);
            } catch (unlinkErr) {
                logger.error(`Не вдалося видалити застарілий файл ${filePath}:`, unlinkErr);
            }
        }));

        if (filesToDelete.length > 0) {
            logger.info(`Автоматичне очищення uploads/: видалено ${filesToDelete.length} файлів`);
        }
    } catch (err) {
        logger.error('Помилка при автоматичному очищенні папки uploads/:', err);
    }
}, 24 * 60 * 60 * 1000);

function broadcast(type, data) {
    const batchSize = 100;
    const batches = [];
    for (let i = 0; i < data.length; i += batchSize) {
        batches.push(data.slice(i, i + batchSize));
    }
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN && client.subscriptions.has(type)) {
            batches.forEach(batch => {
                let filteredData = batch;
                if (type === 'products' && !client.isAdmin) {
                    filteredData = batch.filter(p => p.visible && p.active);
                }
                client.send(JSON.stringify({ type, data: filteredData }));
            });
        }
    });
}

wss.on('connection', (ws, req) => {
    const urlParams = new URLSearchParams(req.url.split('?')[1]);
    let token = urlParams.get('token');

    const allowedOrigins = ['https://mebli.onrender.com', 'http://localhost:3000'];
    const origin = req.headers.origin;
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    if (!allowedOrigins.includes(origin)) {
        logger.warn(`WebSocket: Підключення відхилено через недозволене походження: ${origin}, IP: ${clientIp}`);
        ws.close(1008, 'Недозволене походження');
        return;
    }

    ws.isAdmin = false;
    ws.subscriptions = new Set();

    const verifyToken = () => {
        if (!token) {
            logger.info(`WebSocket: Підключення без токена (публічний клієнт), IP: ${clientIp}`);
            return true;
        }
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded.role === 'admin') {
                ws.isAdmin = true;
                logger.info(`WebSocket: Адмін підключився з токеном, IP: ${clientIp}, Декодовані дані:`, decoded);
            }
            return true;
        } catch (err) {
            logger.error(`WebSocket: Помилка верифікації токена, IP: ${clientIp}, Помилка:`, err.message);
            ws.close(1008, 'Недійсний токен');
            return false;
        }
    };

    if (!verifyToken()) return;

    const refreshTokenWithRetry = async (retries = 3, delay = 5000) => {
        let csrfToken;
        try {
            const csrfResponse = await fetch('https://mebli.onrender.com/api/csrf-token', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (!csrfResponse.ok) {
                throw new Error(`Помилка отримання CSRF-токена: ${csrfResponse.status} ${csrfResponse.statusText}`);
            }
            const csrfData = await csrfResponse.json();
            if (!csrfData.csrfToken) {
                throw new Error('CSRF-токен не повернуто у відповіді');
            }
            csrfToken = csrfData.csrfToken;
        } catch (err) {
            logger.error(`WebSocket: Помилка отримання CSRF-токена, IP: ${clientIp}:`, err);
            ws.send(JSON.stringify({ type: 'error', error: 'Не вдалося отримати CSRF-токен. З’єднання буде закрито.' }));
            ws.close(1008, 'Помилка отримання CSRF-токена');
            return false;
        }

        for (let i = 0; i < retries; i++) {
            try {
                const response = {};
                await new Promise((resolve, reject) => {
                    app.handle(
                        {
                            ...req,
                            method: 'POST',
                            url: '/api/auth/refresh',
                            headers: { Authorization: `Bearer ${token}`, 'X-CSRF-Token': csrfToken }
                        },
                        {
                            json: (data) => {
                                response.data = data;
                                response.status = 200;
                                resolve();
                            },
                            status: (code) => ({
                                json: (data) => {
                                    response.status = code;
                                    response.data = data;
                                    reject(new Error(`HTTP помилка ${code}: ${JSON.stringify(data)}`));
                                }
                            })
                        }
                    );
                });

                if (response.status === 429) {
                    logger.warn(`WebSocket: Занадто багато запитів на оновлення токена, IP: ${clientIp}`);
                    ws.send(JSON.stringify({
                        type: 'error',
                        error: 'Занадто багато запитів. Спробуйте знову через 15 хвилин.'
                    }));
                    ws.close(1008, 'Перевищено ліміт запитів');
                    return false;
                }

                if (response.status !== 200) {
                    throw new Error(`HTTP помилка ${response.status}: ${JSON.stringify(response.data)}`);
                }

                token = response.data.token;
                logger.info(`WebSocket: Токен оновлено, IP: ${clientIp}`);
                return true;
            } catch (err) {
                logger.error(`WebSocket: Помилка оновлення токена, спроба ${i + 1}/${retries}, IP: ${clientIp}:`, {
                    message: err.message,
                    stack: err.stack
                });
                if (i === retries - 1) {
                    logger.error(`WebSocket: Не вдалося оновити токен після всіх спроб, IP: ${clientIp}`);
                    ws.send(JSON.stringify({ type: 'error', error: 'Не вдалося оновити токен. З’єднання буде закрито.' }));
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

    ws.on('close', (code, reason) => {
        if (tokenRefreshInterval) clearInterval(tokenRefreshInterval);
        ws.subscriptions.clear();
        logger.info(`Клієнт від’єднався від WebSocket, IP: ${clientIp}, Код: ${code}, Причина: ${reason || 'невідомо'}`);
    });

    ws.on('message', async (message) => {
        try {
            if (message.length > 1024 * 1024) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', error: 'Повідомлення занадто велике' }));
                }
                return;
            }

            let parsedMessage;
            try {
                parsedMessage = JSON.parse(message);
            } catch (parseErr) {
                logger.error(`WebSocket: Некоректний формат повідомлення, IP: ${clientIp}:`, parseErr);
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', error: 'Некоректний формат повідомлення', details: 'Очікується валідний JSON' }));
                }
                return;
            }

            const { type, action } = parsedMessage;
            if (!type || !action) {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', error: 'Відсутні обов’язкові поля type або action' }));
                }
                return;
            }

            logger.info(`Отримано WebSocket-повідомлення: type=${type}, action=${action}, IP: ${clientIp}`);

            if (action === 'subscribe') {
                ws.subscriptions.add(type);
                logger.info(`Клієнт підписався на ${type}, IP: ${clientIp}`);

                if (type === 'products') {
                    const products = ws.isAdmin
                        ? await Product.find()
                        : await Product.find({ visible: true, active: true });
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'products', data: products }));
                    }
                } else if (type === 'settings') {
                    const settings = await Settings.findOne();
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'settings', data: settings || {} }));
                    }
                } else if (type === 'categories') {
                    const categories = await Category.find();
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'categories', data: categories }));
                    }
                } else if (type === 'slides') {
                    const slides = await Slide.find().sort({ order: 1 });
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'slides', data: slides }));
                    }
                } else if (type === 'orders' && ws.isAdmin) {
                    const orders = await Order.find();
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'orders', data: orders }));
                    }
                } else if (type === 'materials' && ws.isAdmin) {
                    const materials = await Material.find().distinct('name');
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'materials', data: materials }));
                    }
                } else if (type === 'brands' && ws.isAdmin) {
                    const brands = await Brand.find().distinct('name');
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'brands', data: brands }));
                    }
                } else if (!ws.isAdmin && ['orders', 'materials', 'brands'].includes(type)) {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'error', error: 'Доступ заборонено для публічних клієнтів' }));
                    }
                }
            } else {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ type: 'error', error: 'Невідома дія', details: `Дія "${action}" не підтримується` }));
                }
            }
        } catch (err) {
            logger.error(`Помилка обробки WebSocket-повідомлення, IP: ${clientIp}:`, err);
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ type: 'error', error: 'Помилка обробки повідомлення', details: err.message }));
            }
        }
    });

    ws.on('error', (err) => logger.error(`Помилка WebSocket, IP: ${clientIp}:`, err));
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

app.post('/api/upload', authenticateToken, csrfProtection, (req, res, next) => {
    upload.single('file')(req, res, async (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
                logger.error('Перевищено ліміт розміру файлу:', err);
                return res.status(400).json({ error: 'Файл занадто великий', details: 'Максимальний розмір файлу: 5 МБ' });
            }
            logger.error('Multer помилка:', err);
            return res.status(400).json({ error: 'Помилка завантаження файлу', details: err.message });
        } else if (err) {
            logger.error('Помилка валідації файлу:', err);
            return res.status(400).json({ error: 'Помилка валідації файлу', details: err.message });
        }
        try {
            logger.info('Файл отримано:', req.file);
            if (!req.file || !req.file.path) {
                logger.error('Cloudinary не повернув необхідні дані файлу:', req.file);
                return res.status(500).json({ error: 'Помилка завантаження: неповні дані від Cloudinary' });
            }
            res.json({ url: req.file.path });
        } catch (cloudinaryErr) {
            logger.error('Помилка Cloudinary:', cloudinaryErr);
            if (req.file && req.file.path) {
                try {
                    const publicId = getPublicIdFromUrl(req.file.path);
                    if (publicId) {
                        await cloudinary.uploader.destroy(publicId);
                        logger.info(`Файл видалено з Cloudinary після помилки: ${publicId}`);
                    } else {
                        logger.warn('Не вдалося отримати publicId для видалення файлу:', req.file.path);
                    }
                } catch (deleteErr) {
                    logger.error(`Не вдалося видалити файл з Cloudinary: ${req.file.path}`, deleteErr);
                }
            }
            res.status(500).json({ error: 'Не вдалося завантажити файл до Cloudinary', details: cloudinaryErr.message });
        }
    });
});

app.get('/api/filters', authenticateToken, async (req, res) => {
    try {
        const settings = await Settings.findOne({}, { filters: 1 });
        res.json(settings?.filters || []);
    } catch (err) {
        logger.error('Помилка при отриманні фільтрів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/public/products', async (req, res) => {
    try {
        const { slug, cursor, limit = 10 } = req.query;
        const parsedLimit = parseInt(limit);

        if (isNaN(parsedLimit) || parsedLimit < 1 || parsedLimit > 100) {
            logger.error('Невірний параметр limit:', limit);
            return res.status(400).json({ error: 'Параметр limit повинен бути числом від 1 до 100' });
        }

        let query = { visible: true, active: true };
        if (slug) {
            query.slug = slug;
        }

        let products = [];
        let nextCursor = null;

        if (cursor) {
            if (!mongoose.Types.ObjectId.isValid(cursor)) {
                return res.status(400).json({ error: 'Невірний формат cursor' });
            }
            query._id = { $gt: cursor };
        }

        products = await ProductModel.find(query)
            .select('id name category subcategory price salePrice saleEnd brand material filters photos visible active slug type sizes colors groupProducts description widthCm depthCm heightCm lengthCm popularity')
            .sort({ _id: 1 })
            .limit(parsedLimit + 1)
            .lean();

        if (products.length > parsedLimit) {
            nextCursor = products[products.length - 1]._id.toString();
            products = products.slice(0, parsedLimit);
        }

        products = products.map(product => {
            const { __v, ...cleanedProduct } = product;
            return cleanedProduct;
        });

        const total = await ProductModel.countDocuments(query);
        res.json({ products, total, nextCursor, limit: parsedLimit });
    } catch (err) {
        logger.error('Помилка при отриманні товарів:', { error: err.message, stack: err.stack });
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/public/settings', async (req, res) => {
    try {
        const settings = await Settings.findOne({}, { 
            name: 1, 
            baseUrl: 1, 
            logo: 1, 
            logoWidth: 1, 
            favicon: 1, 
            contacts: 1, 
            socials: 1, 
            showSocials: 1, 
            about: 1, 
            slideWidth: 1, 
            slideHeight: 1, 
            slideInterval: 1, 
            showSlides: 1, 
            filters: 1 
        });
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
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;
        const slides = await Slide.find().sort({ order: 1 }).skip(skip).limit(parseInt(limit));
        const total = await Slide.countDocuments();
        res.json({ slides, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        logger.error('Помилка при отриманні публічних слайдів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.get('/api/products', authenticateToken, async (req, res) => {
    try {
        const { slug, page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;
        logger.info(`GET /api/products: slug=${slug}, page=${page}, limit=${limit}, user=${req.user.username}`);
        
        let query = {};
        if (slug) {
            query.slug = slug;
        }

        const products = await Product.find(query).skip(skip).limit(parseInt(limit));
        const total = await Product.countDocuments(query);
        res.json({ products, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        logger.error('Помилка при отриманні товарів:', err);
        res.status(500).json({ products: [], error: 'Помилка сервера', details: err.message });
    }
});

const getPublicIdFromUrl = (url) => {
    if (!url) return null;
    try {
        const parts = url.split('/');
        const folderIndex = parts.findIndex(part => part === 'products');
        if (folderIndex === -1) return null;
        const publicIdWithExtension = parts.slice(folderIndex + 1).join('/');
        const publicId = publicIdWithExtension.split('.')[0];
        return publicId || null;
    } catch (err) {
        logger.error('Помилка при отриманні publicId з URL:', { url, error: err.message });
        return null;
    }
};

app.post('/api/products', authenticateToken, csrfProtection, async (req, res) => {
    try {
        let productData = { ...req.body };
        logger.info('Отримано дані продукту:', JSON.stringify(productData, null, 2));

        delete productData.id;
        delete productData._id;
        delete productData.__v;

        if (productData.img && !productData.photos) {
            productData.photos = Array.isArray(productData.img) ? productData.img : [productData.img];
            delete productData.img;
        }
        if (productData.colors) {
            productData.colors = productData.colors.map(color => {
                if (color.img && !color.photo) {
                    color.photo = color.img;
                    delete color.img;
                }
                return color;
            });
        }

        const { error } = productSchemaValidation.validate(productData, { abortEarly: false });
        if (error) {
            logger.error('Помилка валідації продукту:', JSON.stringify(error.details, null, 2));
            return res.status(400).json({
                error: 'Помилка валідації',
                details: error.details.map(detail => ({
                    message: detail.message,
                    path: detail.path.join('.')
                }))
            });
        }

        const existingProduct = await Product.findOne({ slug: productData.slug });
        if (existingProduct) {
            logger.error('Продукт з таким slug вже існує:', productData.slug);
            return res.status(400).json({ error: 'Продукт з таким slug вже існує', field: 'slug' });
        }

        if (productData.brand && productData.brand.trim()) {
            const brand = await Brand.findOne({ name: productData.brand });
            if (!brand) {
                logger.error('Бренд не знайдено:', productData.brand);
                return res.status(400).json({ error: `Бренд "${productData.brand}" не знайдено`, field: 'brand' });
            }
        }

        if (productData.material && productData.material.trim()) {
            const material = await Material.findOne({ name: productData.material });
            if (!material) {
                logger.error('Матеріал не знайдено:', productData.material);
                return res.status(400).json({ error: `Матеріал "${productData.material}" не знайдено`, field: 'material' });
            }
        }

        const category = await Category.findOne({ name: productData.category });
        if (!category) {
            logger.error('Категорія не знайдено:', productData.category);
            return res.status(400).json({ error: `Категорія "${productData.category}" не знайдено`, field: 'category' });
        }

        if (productData.subcategory && productData.subcategory.trim()) {
            const categoryWithSub = await Category.findOne({
                name: productData.category,
                'subcategories.slug': productData.subcategory
            });
            if (!categoryWithSub) {
                logger.error('Підкатегорія не знайдено:', productData.subcategory);
                return res.status(400).json({
                    error: `Підкатегорія "${productData.subcategory}" не знайдено в категорії "${productData.category}"`,
                    field: 'subcategory'
                });
            }
        }

        if (productData.groupProducts && productData.groupProducts.length > 0) {
            const invalidIds = productData.groupProducts.filter(id => !mongoose.Types.ObjectId.isValid(id));
            if (invalidIds.length > 0) {
                logger.error('Некоректні ObjectId у groupProducts:', invalidIds);
                return res.status(400).json({
                    error: 'Некоректні ObjectId у groupProducts',
                    details: invalidIds,
                    field: 'groupProducts'
                });
            }

            const existingProducts = await Product.find({ _id: { $in: productData.groupProducts } });
            if (existingProducts.length !== productData.groupProducts.length) {
                const missingIds = productData.groupProducts.filter(
                    id => !existingProducts.some(p => p._id.toString() === id)
                );
                logger.error('Деякі продукти в groupProducts не знайдені:', missingIds);
                return res.status(400).json({
                    error: 'Деякі продукти в groupProducts не знайдені',
                    details: missingIds,
                    field: 'groupProducts'
                });
            }

            productData.groupProducts = productData.groupProducts.map(id => mongoose.Types.ObjectId.createFromHexString(id));
        }

        if (!productData.photos || productData.photos.length === 0) {
            const firstProduct = await Product.findOne().sort({ _id: 1 });
            if (firstProduct && firstProduct.photos && firstProduct.photos.length > 0) {
                productData.photos = [firstProduct.photos[0]];
                logger.warn('Додано перше фото з іншого продукту:', productData.photos[0]);
            } else {
                logger.error('Немає доступних фото для додавання');
                return res.status(400).json({ error: 'Немає доступних фото для продукту' });
            }
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const product = new Product(productData);
            await product.save({ session });

            const products = await Product.find().session(session);
            broadcast('products', products);

            await session.commitTransaction();
            logger.info('Продукт успішно створено:', product._id);
            res.status(201).json(product);
        } catch (err) {
            await session.abortTransaction();
            logger.error('Помилка при збереженні продукту:', err);
            throw err;
        } finally {
            session.endSession();
        }
    } catch (err) {
        logger.error('Помилка при додаванні товару:', {
            message: err.message,
            stack: err.stack,
            data: JSON.stringify(req.body, null, 2),
            mongoError: err.code ? {
                code: err.code,
                keyPattern: err.keyPattern,
                keyValue: err.keyValue
            } : null
        });

        if (err.name === 'ValidationError') {
            const errors = Object.values(err.errors).map(e => ({
                field: e.path,
                message: e.message
            }));
            return res.status(400).json({ error: 'Помилка валідації Mongoose', details: errors });
        }

        if (err.code === 11000) {
            const field = Object.keys(err.keyPattern)[0];
            const value = err.keyValue[field];
            return res.status(400).json({
                error: `Значення "${value}" для поля ${field} уже існує`,
                field,
                value
            });
        }

        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.put('/api/products/:id', authenticateToken, csrfProtection, async (req, res) => {
    try {
        let productData = { ...req.body };
        logger.info('Отримано дані для оновлення продукту:', productData);

        if (productData.img && !productData.photos) {
            productData.photos = Array.isArray(productData.img) ? productData.img : [productData.img];
            delete productData.img;
        }
        if (productData.colors) {
            productData.colors = productData.colors.map(color => {
                if (color.img && !color.photo) {
                    color.photo = color.img;
                    delete color.img;
                }
                return color;
            });
        }

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

        const existingProduct = await Product.findOne({ slug: productData.slug, _id: { $ne: req.params.id } });
        if (existingProduct) {
            logger.error('Продукт з таким slug вже існує:', productData.slug);
            return res.status(400).json({ error: 'Продукт з таким slug вже існує' });
        }

        if (productData.brand) {
            const brand = await Brand.findOne({ name: productData.brand });
            if (!brand) {
                logger.error('Бренд не знайдено:', productData.brand);
                return res.status(400).json({ error: `Бренд "${productData.brand}" не знайдено` });
            }
        }

        if (productData.material) {
            const material = await Material.findOne({ name: productData.material });
            if (!material) {
                logger.error('Матеріал не знайдено:', productData.material);
                return res.status(400).json({ error: `Матеріал "${productData.material}" не знайдено` });
            }
        }

        const category = await Category.findOne({ name: productData.category });
        if (!category) {
            logger.error('Категорія не знайдено:', productData.category);
            return res.status(400).json({ error: `Категорія "${productData.category}" не знайдено` });
        }

        if (productData.subcategory) {
            const subcategoryExists = category.subcategories.some(sub => sub.slug === productData.subcategory);
            if (!subcategoryExists) {
                logger.error('Підкатегорія не знайдено:', productData.subcategory);
                return res.status(400).json({ error: `Підкатегорія "${productData.subcategory}" не знайдено в категорії "${productData.category}"` });
            }
        }

        if (productData.groupProducts && productData.groupProducts.length > 0) {
            const invalidIds = productData.groupProducts.filter(id => !mongoose.Types.ObjectId.isValid(id));
            if (invalidIds.length > 0) {
                logger.error('Некоректні ObjectId у groupProducts:', invalidIds);
                return res.status(400).json({ error: 'Некоректні ObjectId у groupProducts', details: invalidIds });
            }

            const existingProducts = await Product.find({ _id: { $in: productData.groupProducts } });
            if (existingProducts.length !== productData.groupProducts.length) {
                logger.error('Деякі продукти в groupProducts не знайдені:', productData.groupProducts);
                return res.status(400).json({ error: 'Деякі продукти в groupProducts не знайдені' });
            }

            productData.groupProducts = productData.groupProducts.map(id => mongoose.Types.ObjectId(id));
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

app.patch('/api/products/:id/toggle-active', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const productId = req.params.id;
        logger.info(`Отримано запит на перемикання статусу активності продукту: ${productId}`);

        if (!mongoose.Types.ObjectId.isValid(productId)) {
            logger.error(`Невірний формат ID продукту: ${productId}`);
            return res.status(400).json({ error: 'Невірний формат ID продукту' });
        }

        const { error } = Joi.object({
            active: Joi.boolean().required()
        }).validate(req.body);
        if (error) {
            logger.error('Помилка валідації даних для перемикання статусу:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const { active } = req.body;

        const product = await Product.findByIdAndUpdate(
            productId,
            { active },
            { new: true }
        );

        if (!product) {
            logger.error(`Продукт не знайдено: ${productId}`);
            return res.status(404).json({ error: 'Продукт не знайдено' });
        }

        const products = await Product.find();
        broadcast('products', products);

        logger.info(`Статус активності продукту ${productId} змінено на ${active}`);
        res.json(product);
    } catch (err) {
        logger.error('Помилка при перемиканні статусу продукту:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

const categorySchemaValidation = Joi.object({
    name: Joi.string().trim().min(1).max(255).required().messages({
        'string.empty': 'Назва категорії є обов’язковою',
        'string.min': 'Назва категорії повинна містити хоча б 1 символ',
        'string.max': 'Назва категорії не може перевищувати 255 символів',
        'any.required': 'Назва категорії є обов’язковою'
    }),
    slug: Joi.string().trim().min(1).max(255).required().messages({
        'string.empty': 'Шлях категорії є обов’язковим',
        'string.min': 'Шлях категорії повинен містити хоча б 1 символ',
        'string.max': 'Шлях категорії не може перевищувати 255 символів',
        'any.required': 'Шлях категорії є обов’язковим'
    }),
    photo: Joi.string().uri().allow('').optional(),
    visible: Joi.boolean().default(true),
    order: Joi.number().integer().min(0).default(0),
    subcategories: Joi.array().items(
        Joi.object({
            _id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
            name: Joi.string().trim().min(1).max(255).required().messages({
                'string.empty': 'Назва підкатегорії є обов’язковою',
                'string.min': 'Назва підкатегорії повинна містити хоча б 1 символ',
                'string.max': 'Назва підкатегорії не може перевищувати 255 символів',
                'any.required': 'Назва підкатегорії є обов’язковою'
            }),
            slug: Joi.string().trim().min(1).max(255).required().messages({
                'string.empty': 'Шлях підкатегорії є обов’язковим',
                'string.min': 'Шлях підкатегорії повинен містити хоча б 1 символ',
                'string.max': 'Шлях підкатегорії не може перевищувати 255 символів',
                'any.required': 'Шлях підкатегорії є обов’язковим'
            }),
            photo: Joi.string().uri().allow('').optional(),
            visible: Joi.boolean().default(true),
            order: Joi.number().integer().min(0).default(0)
        })
    ).default([])
});

const subcategorySchemaValidation = Joi.object({
    _id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    name: Joi.string().trim().min(1).max(255).required().messages({
        'string.empty': 'Назва підкатегорії є обов’язковою',
        'string.min': 'Назва підкатегорії повинна містити хоча б 1 символ',
        'string.max': 'Назва підкатегорії не може перевищувати 255 символів',
        'any.required': 'Назва підкатегорії є обов’язковою'
    }),
    slug: Joi.string().trim().min(1).max(255).required().messages({
        'string.empty': 'Шлях підкатегорії є обов’язковим',
        'string.min': 'Шлях підкатегорії повинен містити хоча б 1 символ',
        'string.max': 'Шлях підкатегорії не може перевищувати 255 символів',
        'any.required': 'Шлях підкатегорії є обов’язковим'
    }),
    photo: Joi.string().uri().allow('').optional(),
    visible: Joi.boolean().default(true),
    order: Joi.number().integer().min(0).default(0)
});

app.get('/api/categories', async (req, res) => {
    try {
        const { slug, subcategorySlug } = req.query;
        let categories;
        if (slug) {
            categories = await Category.find({ slug }).sort({ order: 1 });
        } else if (subcategorySlug) {
            categories = await Category.find({ 'subcategories.slug': subcategorySlug }).sort({ order: 1 });
        } else {
            categories = await Category.find().sort({ order: 1 });
        }
        categories.forEach(category => {
            category.subcategories.sort((a, b) => a.order - b.order);
        });
        res.status(200).json(categories);
    } catch (err) {
        res.status(400).json({ error: 'Помилка отримання категорій', details: err.message });
    }
});

app.post('/api/categories', authenticateToken, csrfProtection, async (req, res) => {
    try {
        let categoryData = req.body;

        if (categoryData.img && !categoryData.photo) {
            categoryData.photo = categoryData.img;
            delete categoryData.img;
        }
        if (categoryData.subcategories) {
            categoryData.subcategories = categoryData.subcategories.map(sub => {
                if (sub.img && !sub.photo) {
                    sub.photo = sub.img;
                    delete sub.img;
                }
                return sub;
            });

            for (const subcategory of categoryData.subcategories) {
                const { error } = subcategorySchemaValidation.validate(subcategory);
                if (error) {
                    logger.error('Помилка валідації підкатегорії:', error.details);
                    return res.status(400).json({ error: 'Помилка валідації підкатегорії', details: error.details });
                }
            }
        }

        const { error } = categorySchemaValidation.validate(categoryData);
        if (error) {
            logger.error('Помилка валідації категорії:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const category = new Category(categoryData);
        await category.save();
        const categories = await Category.find();
        broadcast('categories', categories);
        res.status(201).json(category);
    } catch (err) {
        logger.error('Помилка при додаванні категорії:', err);
        if (err.code === 11000) {
            return res.status(400).json({ error: 'Категорія з таким slug уже існує' });
        }
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.put('/api/categories/:id', authenticateToken, csrfProtection, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        let categoryData = { ...req.body };
        logger.info('Отримано дані для оновлення категорії:', JSON.stringify(categoryData, null, 2));

        if (categoryData.img && !categoryData.photo) {
            categoryData.photo = categoryData.img;
            delete categoryData.img;
        }
        if (categoryData.subcategories) {
            categoryData.subcategories = categoryData.subcategories.map(sub => {
                if (sub.img && !sub.photo) {
                    sub.photo = sub.img;
                    delete sub.img;
                }
                return sub;
            });
        }

        delete categoryData._id;
        delete categoryData.__v;
        if (categoryData.subcategories) {
            categoryData.subcategories = categoryData.subcategories.map(sub => {
                const { _id, ...rest } = sub;
                return rest;
            });
        }

        const { error } = categorySchemaValidation.validate(categoryData, { abortEarly: false });
        if (error) {
            logger.error('Помилка валідації категорії:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details.map(d => d.message) });
        }

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            logger.error(`Невірний формат ID категорії: ${req.params.id}`);
            return res.status(400).json({ error: 'Невірний формат ID категорії' });
        }

        const category = await Category.findById(req.params.id).session(session);
        if (!category) {
            logger.error(`Категорію не знайдено: ${req.params.id}`);
            return res.status(404).json({ error: 'Категорію не знайдено' });
        }

        if (categoryData.name && categoryData.name !== category.name) {
            const existingCategoryByName = await Category.findOne({ name: categoryData.name, _id: { $ne: category._id } }).session(session);
            if (existingCategoryByName) {
                logger.error(`Категорія з назвою "${categoryData.name}" уже існує`);
                return res.status(400).json({ error: `Категорія з назвою "${categoryData.name}" уже існує` });
            }
        }

        if (categoryData.slug && categoryData.slug !== category.slug) {
            const existingCategoryBySlug = await Category.findOne({ slug: categoryData.slug, _id: { $ne: category._id } }).session(session);
            if (existingCategoryBySlug) {
                logger.error(`Категорія з slug "${categoryData.slug}" уже існує`);
                return res.status(400).json({ error: `Категорія з slug "${categoryData.slug}" уже існує` });
            }
        }

        if (category.photo && categoryData.photo && categoryData.photo !== category.photo) {
            const publicId = getPublicIdFromUrl(category.photo);
            if (publicId) {
                try {
                    await cloudinary.uploader.destroy(publicId);
                    logger.info(`Видалено старе зображення категорії: ${publicId}`);
                } catch (err) {
                    logger.error(`Не вдалося видалити старе зображення категорії: ${publicId}`, err);
                }
            }
        }

        const subcategories = categoryData.subcategories || [];
        const subSlugs = new Set();
        for (const sub of subcategories) {
            if (sub.slug && subSlugs.has(sub.slug)) {
                logger.error(`Дублювання slug у підкатегоріях: ${sub.slug}`);
                return res.status(400).json({ error: `Підкатегорія з slug "${sub.slug}" уже існує в цій категорії` });
            }
            subSlugs.add(sub.slug);

            const existingSub = category.subcategories.find(s => s.name === sub.name && s.slug !== sub.slug);
            if (existingSub && existingSub.photo && sub.photo && sub.photo !== existingSub.photo) {
                const publicId = getPublicIdFromUrl(existingSub.photo);
                if (publicId) {
                    try {
                        await cloudinary.uploader.destroy(publicId);
                        logger.info(`Видалено старе зображення підкатегорії: ${publicId}`);
                    } catch (err) {
                        logger.error(`Не вдалося видалити старе зображення підкатегорії: ${publicId}`, err);
                    }
                }
            }
        }

        category.name = categoryData.name || category.name;
        category.slug = categoryData.slug || category.slug;
        category.photo = categoryData.photo !== undefined ? categoryData.photo : category.photo;
        category.visible = categoryData.visible !== undefined ? categoryData.visible : category.visible;
        category.order = categoryData.order !== undefined ? categoryData.order : category.order;
        category.subcategories = subcategories.length > 0 ? subcategories : category.subcategories;

        await category.save({ session });

        const categories = await Category.find().session(session);
        broadcast('categories', categories);
        logger.info(`Категорію оновлено: ${req.params.id}`);
        await session.commitTransaction();
        res.json(category);
    } catch (err) {
        await session.abortTransaction();
        logger.error('Помилка при оновленні категорії:', err);
        res.status(400).json({ error: 'Не вдалося оновити категорію', details: err.message });
    } finally {
        session.endSession();
    }
});

const categoryOrderSchema = Joi.object({
    categories: Joi.array().items(
        Joi.object({
            _id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
            order: Joi.number().required()
        })
    ).required()
});

app.put('/api/categories/order', authenticateToken, csrfProtection, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { categories } = req.body;

        const { error } = categoryOrderSchema.validate({ categories }, { abortEarly: false });
        if (error) {
            logger.error('Помилка валідації порядку категорій:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details.map(d => d.message) });
        }

        const categoryIds = categories.map(item => item._id);
        const foundCategories = await Category.find({ _id: { $in: categoryIds } }).session(session);
        if (foundCategories.length !== categoryIds.length) {
            logger.error('Не всі категорії знайдені:', {
                requested: categoryIds,
                found: foundCategories.map(cat => cat._id.toString())
            });
            return res.status(400).json({ error: 'Одна або більше категорій не знайдені' });
        }

        const orders = categories.map(item => item.order);
        const uniqueOrders = new Set(orders);
        if (uniqueOrders.size !== orders.length) {
            logger.error('Дублювання значень order у категоріях:', orders);
            return res.status(400).json({ error: 'Значення order повинні бути унікальними' });
        }

        const bulkOps = categories.map(({ _id, order }) => ({
            updateOne: {
                filter: { _id },
                update: { $set: { order } }
            }
        }));

        await Category.bulkWrite(bulkOps, { session });

        const updatedCategories = await Category.find().sort({ order: 1 }).session(session);
        broadcast('categories', updatedCategories);
        logger.info('Порядок категорій успішно оновлено');
        await session.commitTransaction();
        res.status(200).json(updatedCategories);
    } catch (err) {
        await session.abortTransaction();
        logger.error('Помилка оновлення порядку категорій:', err);
        res.status(400).json({ error: 'Не вдалося оновити порядок', details: err.message });
    } finally {
        session.endSession();
    }
});

app.delete('/api/categories/:slug', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const category = await Category.findOneAndDelete({ slug: req.params.slug }, { session });
            if (!category) {
                await session.abortTransaction();
                return res.status(404).json({ error: 'Категорію не знайдено' });
            }

            await Product.updateMany(
                { category: category.name },
                { $set: { category: '' } },
                { session }
            );

            await Product.updateMany(
                { subcategory: { $in: category.subcategories.map(sub => sub.name) } },
                { $set: { subcategory: '' } },
                { session }
            );

            if (category.photo) {
                const publicId = getPublicIdFromUrl(category.photo);
                if (publicId) {
                    try {
                        await cloudinary.uploader.destroy(publicId);
                        logger.info(`Успішно видалено зображення категорії з Cloudinary: ${publicId}`);
                    } catch (err) {
                        logger.error(`Не вдалося видалити зображення категорії з Cloudinary: ${publicId}`, err);
                    }
                }
            }

            for (const subcategory of category.subcategories) {
                if (subcategory.photo) {
                    const publicId = getPublicIdFromUrl(subcategory.photo);
                    if (publicId) {
                        try {
                            await cloudinary.uploader.destroy(publicId);
                            logger.info(`Успішно видалено зображення підкатегорії з Cloudinary: ${publicId}`);
                        } catch (err) {
                            logger.error(`Не вдалося видалити зображення підкатегорії з Cloudinary: ${publicId}`, err);
                        }
                    }
                }
            }

            const categories = await Category.find().session(session);
            broadcast('categories', categories);

            await session.commitTransaction();
            logger.info(`Категорію видалено: ${req.params.slug}, користувач: ${req.user.username}`);
            res.json({ message: 'Категорію видалено' });
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }
    } catch (err) {
        logger.error('Помилка при видаленні категорії:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.delete('/api/categories/:categorySlug/subcategories/:subcategorySlug', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const { categorySlug, subcategorySlug } = req.params;

        const category = await Category.findOne({ slug: categorySlug });
        if (!category) {
            return res.status(404).json({ error: 'Категорію не знайдено' });
        }

        const subcategoryIndex = category.subcategories.findIndex(sub => sub.slug === subcategorySlug);
        if (subcategoryIndex === -1) {
            return res.status(404).json({ error: 'Підкатегорію не знайдено' });
        }

        const subcategory = category.subcategories[subcategoryIndex];

        if (subcategory.photo) {
            const publicId = getPublicIdFromUrl(subcategory.photo);
            if (publicId) {
                try {
                    await cloudinary.uploader.destroy(publicId);
                    logger.info(`Успішно видалено зображення підкатегорії з Cloudinary: ${publicId}`);
                } catch (err) {
                    logger.error(`Не вдалося видалити зображення підкатегорії з Cloudinary: ${publicId}`, err);
                }
            }
        }

        category.subcategories.splice(subcategoryIndex, 1);
        await category.save();

        const categories = await Category.find();
        broadcast('categories', categories);
        res.json({ message: 'Підкатегорію видалено' });
    } catch (err) {
        logger.error('Помилка при видаленні підкатегорії:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/categories/:id/subcategories', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const categoryId = req.params.id;
        let subcategoryData = req.body;

        if (subcategoryData.img && !subcategoryData.photo) {
            subcategoryData.photo = subcategoryData.img;
            delete subcategoryData.img;
        }

        const { error } = subcategorySchemaValidation.validate(subcategoryData);
        if (error) {
            logger.error('Помилка валідації підкатегорії:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const category = await Category.findById(categoryId);
        if (!category) {
            return res.status(404).json({ error: 'Категорію не знайдено' });
        }

        if (!category.subcategories) {
            category.subcategories = [];
        }

        if (category.subcategories.some(sub => sub.slug === subcategoryData.slug)) {
            return res.status(400).json({ error: 'Підкатегорія з таким slug уже існує в цій категорії' });
        }

        category.subcategories.push({
            name: subcategoryData.name,
            slug: subcategoryData.slug,
            photo: subcategoryData.photo || '',
            visible: subcategoryData.visible !== undefined ? subcategoryData.visible : true
        });

        await category.save();

        const updatedCategories = await Category.find();
        broadcast('categories', updatedCategories);
        res.status(201).json(category);
    } catch (err) {
        logger.error('Помилка при додаванні підкатегорії:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

const subcategoryOrderSchemaValidation = Joi.object({
    subcategories: Joi.array().items(
        Joi.object({
            _id: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).required(),
            order: Joi.number().integer().min(0).required()
        })
    ).required()
});

app.put('/api/categories/:categoryId/subcategories/:subcategoryId', authenticateToken, csrfProtection, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { categoryId, subcategoryId } = req.params;
        let subcategoryData = { ...req.body };

        logger.info('Отримано дані для оновлення підкатегорії:', JSON.stringify(subcategoryData, null, 2));

        if (subcategoryData.img && !subcategoryData.photo) {
            subcategoryData.photo = subcategoryData.img;
            delete subcategoryData.img;
        }

        delete subcategoryData._id;
        delete subcategoryData.__v;

        const { error } = subcategorySchemaValidation.validate(subcategoryData, { abortEarly: false });
        if (error) {
            logger.error('Помилка валідації підкатегорії:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details.map(d => d.message) });
        }

        if (!mongoose.Types.ObjectId.isValid(categoryId) || !mongoose.Types.ObjectId.isValid(subcategoryId)) {
            logger.error(`Невірний формат ID: categoryId=${categoryId}, subcategoryId=${subcategoryId}`);
            return res.status(400).json({ error: 'Невірний формат ID' });
        }

        const category = await Category.findById(categoryId).session(session);
        if (!category) {
            logger.error(`Категорію не знайдено: ${categoryId}`);
            return res.status(404).json({ error: 'Категорію не знайдено' });
        }

        const subcategory = category.subcategories.id(subcategoryId);
        if (!subcategory) {
            logger.error(`Підкатегорію не знайдено: ${subcategoryId}`);
            return res.status(404).json({ error: 'Підкатегорію не знайдено' });
        }

        if (subcategoryData.slug && subcategoryData.slug !== subcategory.slug) {
            const existingSubcategory = category.subcategories.find(sub => sub.slug === subcategoryData.slug && sub._id.toString() !== subcategoryId);
            if (existingSubcategory) {
                logger.error(`Підкатегорія з slug "${subcategoryData.slug}" уже існує в цій категорії`);
                return res.status(400).json({ error: `Підкатегорія з slug "${subcategoryData.slug}" уже існує` });
            }
        }

        if (subcategory.photo && subcategoryData.photo && subcategoryData.photo !== subcategory.photo) {
            const publicId = getPublicIdFromUrl(subcategory.photo);
            if (publicId) {
                try {
                    await cloudinary.uploader.destroy(publicId);
                    logger.info(`Видалено старе зображення підкатегорії: ${publicId}`);
                } catch (err) {
                    logger.error(`Не вдалося видалити старе зображення підкатегорії: ${publicId}`, err);
                }
            }
        }

        subcategory.name = subcategoryData.name || subcategory.name;
        subcategory.slug = subcategoryData.slug || subcategory.slug;
        subcategory.photo = subcategoryData.photo !== undefined ? subcategoryData.photo : subcategory.photo;
        subcategory.visible = subcategoryData.visible !== undefined ? subcategoryData.visible : subcategory.visible;
        subcategory.order = subcategoryData.order !== undefined ? subcategoryData.order : subcategory.order;

        await category.save({ session });

        const updatedCategories = await Category.find().session(session);
        broadcast('categories', updatedCategories);
        logger.info(`Підкатегорію оновлено: ${subcategoryId}`);
        await session.commitTransaction();
        res.json(category);
    } catch (err) {
        await session.abortTransaction();
        logger.error('Помилка при оновленні підкатегорії:', err);
        res.status(400).json({ error: 'Не вдалося оновити підкатегорію', details: err.message });
    } finally {
        session.endSession();
    }
});

app.put('/api/categories/:categoryId/subcategories/order', authenticateToken, csrfProtection, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const categoryId = req.params.categoryId;
        if (!mongoose.Types.ObjectId.isValid(categoryId)) {
            logger.error(`Невірний формат categoryId: ${categoryId}`);
            return res.status(400).json({ error: 'Невірний формат categoryId' });
        }

        const { subcategories } = req.body;
        const { error } = subcategoryOrderSchemaValidation.validate({ subcategories }, { abortEarly: false });
        if (error) {
            logger.error('Помилка валідації порядку підкатегорій:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details.map(d => d.message) });
        }

        const category = await Category.findById(categoryId).session(session);
        if (!category) {
            logger.error(`Категорію не знайдено: ${categoryId}`);
            return res.status(404).json({ error: 'Категорію не знайдено' });
        }

        const subcategoryIds = subcategories.map(item => item._id);
        const existingSubcategories = category.subcategories.filter(sub => subcategoryIds.includes(sub._id.toString()));
        if (existingSubcategories.length !== subcategoryIds.length) {
            logger.error('Не всі підкатегорії знайдені:', {
                requested: subcategoryIds,
                found: existingSubcategories.map(sub => sub._id.toString())
            });
            return res.status(400).json({ error: 'Одна або більше підкатегорій не знайдені' });
        }

        const orders = subcategories.map(item => item.order);
        const uniqueOrders = new Set(orders);
        if (uniqueOrders.size !== orders.length) {
            logger.error('Дублювання значень order у підкатегоріях:', orders);
            return res.status(400).json({ error: 'Значення order повинні бути унікальними' });
        }

        subcategories.forEach(({ _id, order }) => {
            const sub = category.subcategories.id(_id);
            if (sub) {
                sub.order = order;
            }
        });

        await category.save({ session });

        const updatedCategories = await Category.find().session(session);
        broadcast('categories', updatedCategories);
        logger.info(`Порядок підкатегорій оновлено для категорії ${categoryId}`);
        await session.commitTransaction();
        res.status(200).json(category);
    } catch (err) {
        await session.abortTransaction();
        logger.error('Помилка оновлення порядку підкатегорій:', err);
        res.status(400).json({ error: 'Не вдалося оновити порядок підкатегорій', details: err.message });
    } finally {
        session.endSession();
    }
});

app.get('/api/slides', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;
        const slides = await Slide.find().sort({ order: 1 }).skip(skip).limit(parseInt(limit));
        const total = await Slide.countDocuments();
        res.json({ slides, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        logger.error('Помилка при отриманні слайдів:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/slides', authenticateToken, csrfProtection, async (req, res) => {
    try {
        let slideData = req.body;
        logger.info('Отримано дані слайду:', slideData);

        if (slideData.img && !slideData.photo) {
            slideData.photo = slideData.img;
            delete slideData.img;
        }

        const { error } = slideSchemaValidation.validate(slideData);
        if (error) {
            logger.error('Помилка валідації слайду:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const maxIdSlide = await Slide.findOne().sort({ id: -1 }).session(session);
            slideData.id = maxIdSlide ? maxIdSlide.id + 1 : 1;
            const slide = new Slide({
                id: slideData.id,
                photo: slideData.photo,
                name: slideData.name,
                link: slideData.link,
                title: slideData.title,
                text: slideData.text,
                linkText: slideData.linkText,
                order: slideData.order
            });
            await slide.save({ session });

            const slides = await Slide.find().sort({ order: 1 }).session(session);
            broadcast('slides', slides);

            await session.commitTransaction();
            res.status(201).json(slide);
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }
    } catch (err) {
        logger.error('Помилка при додаванні слайду:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.put('/api/slides/:id', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const slideData = req.body;
        const slideId = parseInt(req.params.id);
        if (isNaN(slideId)) {
            logger.error(`Невірний формат ID слайду: ${req.params.id}`);
            return res.status(400).json({ error: 'Невірний формат ID слайду' });
        }

        if (slideData.img && !slideData.photo) {
            slideData.photo = slideData.img;
            delete slideData.img;
        }

        const { error } = slideSchemaValidation.validate(slideData);
        if (error) {
            logger.error('Помилка валідації слайду:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const slide = await Slide.findOneAndUpdate(
                { id: slideId },
                {
                    photo: slideData.photo,
                    name: slideData.name,
                    link: slideData.link,
                    title: slideData.title,
                    text: slideData.text,
                    linkText: slideData.linkText,
                    order: slideData.order
                },
                { new: true, session }
            );
            if (!slide) {
                await session.abortTransaction();
                return res.status(404).json({ error: 'Слайд не знайдено' });
            }

            if (slideData.photo && slide.photo && slideData.photo !== slide.photo) {
                const publicId = getPublicIdFromUrl(slide.photo);
                if (publicId) {
                    try {
                        await cloudinary.uploader.destroy(publicId);
                        logger.info(`Видалено старе зображення слайду: ${publicId}`);
                    } catch (err) {
                        logger.error(`Не вдалося видалити старе зображення слайду: ${publicId}`, err);
                    }
                }
            }

            const slides = await Slide.find().sort({ order: 1 }).session(session);
            broadcast('slides', slides);

            await session.commitTransaction();
            res.json(slide);
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }
    } catch (err) {
        logger.error('Помилка при оновленні слайду:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.delete('/api/slides/:id', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const slideId = parseInt(req.params.id);
        if (isNaN(slideId)) {
            logger.error(`Невірний формат ID слайду: ${req.params.id}`);
            return res.status(400).json({ error: 'Невірний формат ID слайду' });
        }

        const slide = await Slide.findOneAndDelete({ id: slideId });
        if (!slide) return res.status(404).json({ error: 'Слайд не знайдено' });

        if (slide.photo) {
            const publicId = getPublicIdFromUrl(slide.photo);
            if (publicId) {
                try {
                    await cloudinary.uploader.destroy(publicId);
                    logger.info(`Успішно видалено файл з Cloudinary: ${publicId}`);
                } catch (err) {
                    logger.error(`Не вдалося видалити файл з Cloudinary: ${publicId}`, err);
                }
            }
        }

        const slides = await Slide.find().sort({ order: 1 });
        broadcast('slides', slides);
        res.json({ message: 'Слайд видалено' });
    } catch (err) {
        logger.error('Помилка при видаленні слайду:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/auth/refresh', refreshTokenLimiter, csrfProtection, (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Некоректний заголовок Authorization:', authHeader);
        return res.status(401).json({ error: 'Некоректний заголовок Authorization', details: 'Очікується формат Bearer <token>' });
    }

    const token = authHeader.split(' ')[1];
    if (!token) {
        logger.warn('Токен відсутній у заголовку Authorization');
        return res.status(401).json({ error: 'Токен відсутній', details: 'Токен не надано' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (decoded.role !== 'admin') {
            logger.warn('Спроба оновлення токена без прав адміністратора:', decoded);
            return res.status(403).json({ error: 'Доступ заборонено', details: 'Потрібні права адміністратора' });
        }
        const newToken = jwt.sign(
            { userId: decoded.userId, username: decoded.username, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );
        logger.info('Токен успішно оновлено для користувача:', decoded.username);
        res.json({ token: newToken });
    } catch (err) {
        if (err.status === 429) {
            const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
            logger.warn(`Занадто багато запитів на оновлення токена, IP: ${clientIp}`);
            return res.status(429).json({
                error: 'Занадто багато запитів',
                details: 'Перевищено ліміт запитів на оновлення токена. Спробуйте знову через 15 хвилин'
            });
        }
        logger.error('Помилка оновлення токена:', { message: err.message, stack: err.stack });
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Токен прострочений', details: 'Будь ласка, увійдіть знову' });
        }
        if (err.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Недійсний токен', details: 'Токен некоректний або пошкоджений' });
        }
        res.status(500).json({ error: 'Помилка обробки токена', details: err.message });
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
                filters: [],
                orderFields: [],
                slideWidth: 0,
                slideHeight: 0,
                slideInterval: 3000,
                showSlides: true
            });
            try {
                await settings.save();
                logger.info('Створено початкові налаштування');
            } catch (saveErr) {
                logger.error('Помилка при збереженні початкових налаштувань:', saveErr);
                return res.status(500).json({ error: 'Не вдалося створити початкові налаштування', details: saveErr.message });
            }
        }
        res.json(settings);
    } catch (err) {
        logger.error('Помилка при отриманні налаштувань:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.put('/api/settings', authenticateToken, csrfProtection, async (req, res) => {
    try {
        let settingsData = req.body;
        logger.info('Отримано дані для оновлення налаштувань:', JSON.stringify(settingsData, null, 2));

        if (settingsData.img && !settingsData.logo) {
            settingsData.logo = settingsData.img;
            delete settingsData.img;
        }
        if (settingsData.faviconImg && !settingsData.favicon) {
            settingsData.favicon = settingsData.faviconImg;
            delete settingsData.faviconImg;
        }

        const { _id, __v, createdAt, updatedAt, ...cleanedSettingsData } = settingsData;

        const { error } = settingsSchemaValidation.validate(cleanedSettingsData, { abortEarly: false });
        if (error) {
            logger.error('Помилка валідації налаштувань:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        if (cleanedSettingsData.about) {
            cleanedSettingsData.about = sanitizeHtml(cleanedSettingsData.about, {
                allowedTags: ['b', 'i', 'em', 'strong', 'a', 'p', 'ul', 'li'],
                allowedAttributes: { 'a': ['href'] }
            });
        }
        if (cleanedSettingsData.contacts) {
            cleanedSettingsData.contacts.phones = sanitizeHtml(cleanedSettingsData.contacts.phones || '', {
                allowedTags: [],
                allowedAttributes: {}
            });
            cleanedSettingsData.contacts.addresses = sanitizeHtml(cleanedSettingsData.contacts.addresses || '', {
                allowedTags: [],
                allowedAttributes: {}
            });
            cleanedSettingsData.contacts.schedule = sanitizeHtml(cleanedSettingsData.contacts.schedule || '', {
                allowedTags: [],
                allowedAttributes: {}
            });
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
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;
        const orders = await Order.find().sort({ date: -1 }).skip(skip).limit(parseInt(limit));
        const total = await Order.countDocuments();
        res.json({ orders, total, page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
        logger.error('Помилка при отриманні замовлень:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/orders', csrfProtection, async (req, res) => {
    try {
        logger.info('Отримано запит на створення замовлення:', req.body);
        let orderData = req.body;
        const cartId = req.query.cartId;

        if (orderData.items) {
            orderData.items = orderData.items.map(item => {
                if (item.img && !item.photo) {
                    item.photo = item.img;
                    delete item.img;
                }
                return item;
            });
        }

        if (cartId) {
            const { error } = cartIdSchema.validate(cartId);
            if (error) {
                logger.error('Помилка валідації cartId:', error.details);
                return res.status(400).json({ error: 'Невірний формат cartId', details: error.details });
            }
        }

        const { error } = orderSchemaValidation.validate(orderData);
        if (error) {
            logger.error('Помилка валідації замовлення:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        if (orderData.id) {
            const existingOrder = await Order.findOne({ id: orderData.id });
            if (existingOrder) {
                logger.error('Замовлення з таким id уже існує:', orderData.id);
                return res.status(400).json({ error: 'Замовлення з таким id уже існує' });
            }
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const maxIdOrder = await Order.findOne().sort({ id: -1 }).session(session);
            orderData.id = maxIdOrder ? maxIdOrder.id + 1 : 1;

            const order = new Order(orderData);
            await order.save({ session });

            if (cartId) {
                const cart = await Cart.findOne({ cartId }).session(session);
                if (cart) {
                    cart.items = [];
                    cart.updatedAt = Date.now();
                    await cart.save({ session });
                } else {
                    logger.warn(`Кошик з cartId ${cartId} не знайдено під час створення замовлення`);
                }
            }

            const orders = await Order.find().session(session);
            broadcast('orders', orders);

            await session.commitTransaction();
            logger.info('Замовлення успішно створено:', { orderId: orderData.id, customer: orderData.customer.name });
            res.status(201).json(order);
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }
    } catch (err) {
        logger.error('Помилка при додаванні замовлення:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.get('/api/cart', async (req, res) => {
    try {
        const cartId = req.query.cartId;
        logger.info('GET /api/cart:', { cartId });

        if (!cartId || typeof cartId !== 'string') {
            logger.error('Невірний формат cartId:', cartId);
            return res.status(400).json({ error: 'Невірний формат cartId' });
        }

        let cart = await Cart.findOne({ cartId });
        if (!cart) {
            logger.info('Кошик не знайдено, створюємо новий:', { cartId });
            cart = new Cart({ cartId, items: [], updatedAt: Date.now() });
            await cart.save();
        }

        logger.info('Повертаємо кошик:', cart.items);
        res.json(cart.items || []);
    } catch (err) {
        logger.error('Помилка при отриманні кошика:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

const cartSchemaValidation = Joi.array().items(
    Joi.object({
        id: Joi.number().required(),
        name: Joi.string().required(),
        quantity: Joi.number().min(1).required(),
        price: Joi.number().min(0).required(),
        photo: Joi.string().uri().allow('').optional(),
        color: Joi.object({
            name: Joi.string().required(),
            value: Joi.string().required(),
            priceChange: Joi.number().default(0),
            photo: Joi.string().uri().allow('', null).optional()
        }).allow(null).optional()
    })
);

app.post('/api/cart', csrfProtection, async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const cartId = req.query.cartId;
        logger.info('POST /api/cart:', { cartId, body: req.body });

        const { error } = cartIdSchema.validate(cartId);
        if (error) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({ error: 'Невірний формат cartId', details: error.details });
        }

        let cartItems = req.body;

        cartItems = cartItems.map(item => {
            if (item.img && !item.photo) {
                item.photo = item.img;
                delete item.img;
            }
            return item;
        });

        const { error: cartError } = cartSchemaValidation.validate(cartItems);
        if (cartError) {
            await session.abortTransaction();
            session.endSession();
            logger.error('Помилка валідації кошика:', cartError.details);
            return res.status(400).json({ error: 'Помилка валідації кошика', details: cartError.details });
        }

        for (const item of cartItems) {
            const product = await Product.findOne({ id: item.id }).session(session);
            if (!product) {
                await session.abortTransaction();
                session.endSession();
                return res.status(400).json({ error: `Продукт з id ${item.id} не знайдено` });
            }
            if (item.color) {
                if (product.type === 'mattresses') {
                    const size = product.sizes.find(s => s.name === item.color.name);
                    if (!size) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ error: `Розмір ${item.color.name} не доступний для продукту ${item.name}` });
                    }
                    const expectedPrice = size.price;
                    if (item.price !== expectedPrice) {
                        logger.warn(`Невідповідність ціни для продукту ${item.id}, розмір ${item.color.name}: отримано ${item.price}, очікувалося ${expectedPrice}`);
                        item.price = expectedPrice;
                    }
                    item.color.priceChange = 0;
                    item.photo = item.color.photo || product.photos[0] || '';
                } else {
                    const color = product.colors.find(c => c.name === item.color.name && c.value === item.color.value);
                    if (!color) {
                        await session.abortTransaction();
                        session.endSession();
                        return res.status(400).json({ error: `Колір ${item.color.name} не доступний для продукту ${item.name}` });
                    }
                    const expectedPrice = product.price + (color.priceChange || 0);
                    if (item.price !== expectedPrice) {
                        logger.warn(`Невідповідність ціни для продукту ${item.id}, колір ${item.color.name}: отримано ${item.price}, очікувалося ${expectedPrice}`);
                        item.price = expectedPrice;
                    }
                    item.color.priceChange = color.priceChange || 0;
                    item.photo = color.photo || item.photo || product.photos[0] || '';
                    if (color.photo) {
                        logger.info(`Використано фото кольору для продукту ${item.id}: ${color.photo}`);
                    }
                }
            } else {
                if (item.price !== product.price) {
                    logger.warn(`Невідповідність ціни для продукту ${item.id}: отримано ${item.price}, очікувалося ${product.price}`);
                    item.price = product.price;
                }
                item.photo = item.photo || product.photos[0] || '';
            }
        }

        let cart = await Cart.findOne({ cartId }).session(session);
        if (!cart) {
            logger.info('Кошик не знайдено, створюємо новий:', { cartId });
            cart = new Cart({ cartId, items: cartItems, updatedAt: Date.now() });
        } else {
            logger.info('Оновлюємо існуючий кошик:', { cartId });
            cart.items = cartItems;
            cart.updatedAt = Date.now();
        }
        await cart.save({ session });

        await session.commitTransaction();
        logger.info('Кошик успішно збережено:', { cartId, itemCount: cart.items.length });
        res.status(200).json({ success: true, items: cart.items });
    } catch (err) {
        await session.abortTransaction();
        logger.error('Помилка при збереженні кошика:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    } finally {
        session.endSession();
    }
});

const cleanupOldCarts = async () => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const thresholdDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const carts = await Cart.find({ updatedAt: { $lt: thresholdDate } }).session(session);
        
        if (carts.length === 0) {
            logger.info('Немає старих кошиків для видалення');
            await session.commitTransaction();
            return 0;
        }

        const cartIds = carts.map(cart => cart.cartId);
        const orders = await Order.find({ 
            cartId: { $in: cartIds },
            status: { $in: ['Нове замовлення', 'В обробці', 'Відправлено'] }
        }).session(session);

        const activeCartIds = new Set(orders.map(order => order.cartId));
        const cartsToDelete = carts.filter(cart => !activeCartIds.has(cart.cartId));

        if (cartsToDelete.length === 0) {
            logger.info('Усі старі кошики пов’язані з активними замовленнями, видалення не виконано');
            await session.commitTransaction();
            return 0;
        }

        const cartIdsToDelete = cartsToDelete.map(cart => cart.cartId);
        const result = await Cart.deleteMany({ cartId: { $in: cartIdsToDelete } }).session(session);

        const remainingCarts = await Cart.find().session(session);
        broadcast('carts', remainingCarts);

        await session.commitTransaction();
        logger.info(`Видалено старі кошики:`, { deletedCount: result.deletedCount, cartIds: cartIdsToDelete });
        return result.deletedCount;
    } catch (err) {
        await session.abortTransaction();
        logger.error('Помилка при очищенні старих кошиків:', err);
        throw err;
    } finally {
        session.endSession();
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
        const orderId = parseInt(req.params.id);
        if (isNaN(orderId)) {
            logger.error(`Невірний формат ID замовлення: ${req.params.id}`);
            return res.status(400).json({ error: 'Невірний формат ID замовлення' });
        }

        let orderData = req.body;

        // Перевіряємо, чи є статус у даних
        if (!orderData.status || !['Нове замовлення', 'В обробці', 'Відправлено', 'Доставлено', 'Скасовано'].includes(orderData.status)) {
            logger.error('Недійсний або відсутній статус:', orderData.status);
            return res.status(400).json({ error: 'Недійсний або відсутній статус замовлення' });
        }

        const { error } = Joi.object({ status: orderSchemaValidation.extract('status') }).validate(orderData);
        if (error) {
            logger.error('Помилка валідації статусу:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const session = await mongoose.startSession();
        session.startTransaction();
        try {
            const order = await Order.findOneAndUpdate(
                { id: orderId },
                { status: orderData.status },
                { new: true, session }
            );
            if (!order) {
                await session.abortTransaction();
                return res.status(404).json({ error: 'Замовлення не знайдено' });
            }

            const orders = await Order.find().sort({ date: -1 }).session(session);
            broadcast('orders', orders);

            await session.commitTransaction();
            res.json(order);
        } catch (err) {
            await session.abortTransaction();
            throw err;
        } finally {
            session.endSession();
        }
    } catch (err) {
        logger.error('Помилка при оновленні замовлення:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.delete('/api/orders/:id', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const orderId = req.params.id;
        if (!orderId.match(/^[0-9a-fA-F]{24}$/)) {
            logger.error(`Невірний формат ID замовлення: ${orderId}`);
            return res.status(400).json({ error: 'Невірний формат ID замовлення' });
        }

        const order = await Order.findOneAndDelete({ _id: orderId });
        if (!order) {
            logger.warn(`Замовлення з _id ${orderId} не знайдено`);
            return res.status(404).json({ error: 'Замовлення не знайдено' });
        }

        const orders = await Order.find();
        broadcast('orders', orders);
        res.json({ message: 'Замовлення видалено' });
    } catch (err) {
        logger.error('Помилка при видаленні замовлення:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

const orderFieldSchemaValidation = Joi.object({
    name: Joi.string().trim().min(1).max(100).required(),
    label: Joi.string().trim().min(1).max(100).required(),
    type: Joi.string().valid('text', 'email', 'select').required(),
    options: Joi.array().items(Joi.string().trim().min(1)).default([])
});

app.get('/api/order-fields', authenticateToken, async (req, res) => {
    try {
        const fields = await OrderField.find();
        res.json(fields);
    } catch (err) {
        logger.error('Помилка при отриманні полів замовлення:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/order-fields', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const { error } = orderFieldSchemaValidation.validate(req.body);
        if (error) {
            logger.error('Помилка валідації поля замовлення:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const { name, label, type, options } = req.body;
        const existingField = await OrderField.findOne({ name });
        if (existingField) {
            logger.error('Поле замовлення з такою назвою вже існує:', name);
            return res.status(400).json({ error: `Поле з назвою "${name}" уже існує` });
        }

        const field = new OrderField({ name, label, type, options });
        await field.save();
        logger.info('Поле замовлення створено:', { name, label, type });
        res.status(201).json(field);
    } catch (err) {
        logger.error('Помилка при додаванні поля замовлення:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.put('/api/order-fields/:id', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const fieldId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(fieldId)) {
            logger.error(`Невірний формат ID поля замовлення: ${fieldId}`);
            return res.status(400).json({ error: 'Невірний формат ID поля замовлення' });
        }

        const fieldData = req.body;
        const { error } = orderFieldSchemaValidation.validate(fieldData);
        if (error) {
            logger.error('Помилка валідації поля замовлення:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const existingField = await OrderField.findOne({ name: fieldData.name, _id: { $ne: fieldId } });
        if (existingField) {
            logger.error('Поле замовлення з такою назвою вже існує:', fieldData.name);
            return res.status(400).json({ error: `Поле з назвою "${fieldData.name}" уже існує` });
        }

        const field = await OrderField.findByIdAndUpdate(
            fieldId,
            {
                name: fieldData.name,
                label: fieldData.label,
                type: fieldData.type,
                options: fieldData.options || []
            },
            { new: true }
        );
        if (!field) {
            logger.error(`Поле замовлення не знайдено: ${fieldId}`);
            return res.status(404).json({ error: 'Поле замовлення не знайдено' });
        }

        logger.info('Поле замовлення оновлено:', { id: fieldId, name: fieldData.name });
        res.json(field);
    } catch (err) {
        logger.error('Помилка при оновленні поля замовлення:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.delete('/api/order-fields/:id', authenticateToken, csrfProtection, async (req, res) => {
    try {
        const fieldId = req.params.id;
        if (!mongoose.Types.ObjectId.isValid(fieldId)) {
            logger.error(`Невірний формат ID поля замовлення: ${fieldId}`);
            return res.status(400).json({ error: 'Невірний формат ID поля замовлення' });
        }

        const field = await OrderField.findByIdAndDelete(fieldId);
        if (!field) {
            logger.error(`Поле замовлення не знайдено: ${fieldId}`);
            return res.status(404).json({ error: 'Поле замовлення не знайдено' });
        }

        logger.info('Поле замовлення видалено:', { id: fieldId, name: field.name });
        res.json({ message: 'Поле замовлення видалено' });
    } catch (err) {
        logger.error('Помилка при видаленні поля замовлення:', err);
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

        const baseUrl = settings?.baseUrl || 'https://mebli.onrender.com';
        let sitemap = `<?xml version="1.0" encoding="UTF-8"?>
        <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
            <url>
                <loc>${baseUrl}</loc>
                <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
                <priority>1.0</priority>
            </url>`;

        categories.forEach(cat => {
            sitemap += `
            <url>
                <loc>${baseUrl}/category/${cat.slug}</loc>
                <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
                <priority>0.8</priority>
            </url>`;
            cat.subcategories.forEach(subcat => {
                sitemap += `
                <url>
                    <loc>${baseUrl}/category/${cat.slug}/${subcat.slug}</loc>
                    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
                    <priority>0.7</priority>
                </url>`;
            });
        });

        products.forEach(product => {
            sitemap += `
            <url>
                <loc>${baseUrl}/product/${product.slug}</loc>
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
    let filePath;
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не завантажено' });
        }
        filePath = req.file.path;

        const maxJsonSize = 10 * 1024 * 1024;
        if (req.file.size > maxJsonSize) {
            logger.error('Розмір файлу перевищує ліміт:', { size: req.file.size });
            throw new Error(`Розмір файлу перевищує ліміт у ${maxJsonSize / (1024 * 1024)} МБ`);
        }

        const fileContent = JSON.parse(await fs.promises.readFile(filePath, 'utf8'));
        const { settings, categories, slides } = fileContent;

        if (settings) {
            const { error } = settingsSchemaValidation.validate(settings, { abortEarly: false });
            if (error) {
                logger.error('Помилка валідації налаштувань при імпорті:', error.details);
                throw new Error('Помилка валідації налаштувань: ' + JSON.stringify(error.details));
            }
            await Settings.findOneAndUpdate({}, settings, { upsert: true });
        }

        if (categories) {
            for (const category of categories) {
                const { error } = categorySchemaValidation.validate(category, { abortEarly: false });
                if (error) {
                    logger.error('Помилка валідації категорії при імпорті:', error.details);
                    throw new Error('Помилка валідації категорій: ' + JSON.stringify(error.details));
                }
            }
            await Category.deleteMany({});
            await Category.insertMany(categories);
        }

        if (slides) {
            for (const slide of slides) {
                const { error } = slideSchemaValidation.validate(slide, { abortEarly: false });
                if (error) {
                    logger.error('Помилка валідації слайду при імпорті:', error.details);
                    throw new Error('Помилка валідації слайдів: ' + JSON.stringify(error.details));
                }
            }
            await Slide.deleteMany({});
            await Slide.insertMany(slides);
        }

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
    } finally {
        if (filePath) {
            try {
                await fs.promises.unlink(filePath);
                logger.info(`Тимчасовий файл видалено: ${filePath}`);
            } catch (unlinkErr) {
                logger.error(`Не вдалося видалити тимчасовий файл ${filePath}:`, unlinkErr);
            }
        }
    }
});

app.post('/api/import/products', authenticateToken, csrfProtection, importUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не завантажено' });
        }

        let products = JSON.parse(await fs.promises.readFile(req.file.path, 'utf8'));
        products = products.map(product => {
            const { id, _id, __v, ...cleanedProduct } = product;
            return cleanedProduct;
        });

        for (const product of products) {
            const { error } = productSchemaValidation.validate(product, { abortEarly: false });
            if (error) {
                logger.error('Помилка валідації продукту при імпорті:', error.details);
                return res.status(400).json({ error: 'Помилка валідації продуктів', details: error.details });
            }
        }
        await Product.deleteMany({});
        await Product.insertMany(products);

        try {
            await fs.promises.unlink(req.file.path);
            logger.info(`Тимчасовий файл видалено: ${req.file.path}`);
        } catch (unlinkErr) {
            logger.error(`Не вдалося видалити тимчасовий файл ${req.file.path}:`, unlinkErr);
        }

        const updatedProducts = await Product.find();
        broadcast('products', updatedProducts);
        res.json({ message: 'Товари імпортовано' });
    } catch (err) {
        logger.error('Помилка при імпорті товарів:', err);
        if (req.file) {
            try {
                await fs.promises.unlink(req.file.path);
                logger.info(`Тимчасовий файл видалено після помилки: ${req.file.path}`);
            } catch (unlinkErr) {
                logger.error(`Не вдалося видалити тимчасовий файл після помилки ${req.file.path}:`, unlinkErr);
            }
        }
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/import/orders', authenticateToken, csrfProtection, importUpload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'Файл не завантажено' });
        }

        const orders = JSON.parse(await fs.promises.readFile(req.file.path, 'utf8'));
        for (const order of orders) {
            const { error } = orderSchemaValidation.validate(order, { abortEarly: false });
            if (error) {
                logger.error('Помилка валідації замовлення при імпорті:', error.details);
                return res.status(400).json({ error: 'Помилка валідації замовлень', details: error.details });
            }
        }
        await Order.deleteMany({});
        await Order.insertMany(orders);

        try {
            await fs.promises.unlink(req.file.path);
            logger.info(`Тимчасовий файл видалено: ${req.file.path}`);
        } catch (unlinkErr) {
            logger.error(`Не вдалося видалити тимчасовий файл ${req.file.path}:`, unlinkErr);
        }

        const updatedOrders = await Order.find();
        broadcast('orders', updatedOrders);
        res.json({ message: 'Замовлення імпортовано' });
    } catch (err) {
        logger.error('Помилка при імпорті замовлень:', err);
        if (req.file) {
            try {
                await fs.promises.unlink(req.file.path);
                logger.info(`Тимчасовий файл видалено після помилки: ${req.file.path}`);
            } catch (unlinkErr) {
                logger.error(`Не вдалося видалити тимчасовий файл після помилки ${req.file.path}:`, unlinkErr);
            }
        }
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

app.post('/api/auth/login', loginLimiter, csrfProtection, (req, res, next) => {
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
    if (err.code === 11000) {
        const field = Object.keys(err.keyValue)[0];
        return res.status(400).json({ error: `Значення для поля ${field} уже існує` });
    }
    if (err.code === 'EBADCSRFTOKEN') {
        logger.error('Помилка CSRF:', err);
        return res.status(403).json({ error: 'Недійсний CSRF-токен' });
    }
    if (err instanceof multer.MulterError || err.message.includes('Дозволені лише файли')) {
        logger.error('Помилка завантаження файлу:', err);
        return res.status(400).json({ error: 'Помилка завантаження файлу', details: err.message });
    }
    if (err.status === 429) {
        return res.status(429).json({
            error: 'Занадто багато запитів',
            details: err.message || 'Перевищено ліміт запитів. Спробуйте знову через 15 хвилин'
        });
    }
    logger.error('Помилка сервера:', err);
    res.status(500).json({ error: 'Внутрішня помилка сервера', details: err.message });
});