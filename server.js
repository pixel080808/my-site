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
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif']
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024 // Обмеження розміру файлу до 5 МБ
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Дозволені лише файли JPEG, PNG та GIF'), false);
        }
        cb(null, true);
    }
});

app.set('case sensitive routing', false);
app.use(express.json());
app.use(cors());

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

app.use(express.static(publicPath));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB підключено'))
    .catch(err => {
        console.error('Помилка підключення до MongoDB:', err);
        process.exit(1);
    });

// Схема для продуктів
const productSchema = new mongoose.Schema({
    id: Number,
    type: String,
    name: String,
    slug: String,
    brand: String,
    category: String,
    subcategory: String,
    material: String,
    price: Number,
    salePrice: Number,
    saleEnd: String,
    description: String,
    descriptionDelta: Object,
    widthCm: Number,
    depthCm: Number,
    heightCm: Number,
    lengthCm: Number,
    photos: [String],
    colors: [{
        name: String,
        value: String,
        priceChange: Number,
        photo: String
    }],
    sizes: [{
        name: String,
        price: Number
    }],
    groupProducts: [Number],
    active: Boolean,
    visible: Boolean,
    descriptionMedia: [String]
});

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

const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);

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

// Middleware для перевірки JWT
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Очікуваний формат: "Bearer <token>"

    if (!token) {
        return res.status(401).json({ error: 'Доступ заборонено. Токен відсутній.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(403).json({ error: 'Недійсний токен', details: err.message });
    }
};

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
            if (!req.file) {
                return res.status(400).json({ error: 'Файл не завантажено' });
            }
            // Перевіряємо, чи повернув Cloudinary коректний URL
            if (!req.file.path) {
                return res.status(500).json({ error: 'Cloudinary не повернув URL файлу' });
            }
            console.log('Файл успішно завантажено до Cloudinary:', req.file.path);
            res.json({ url: req.file.path });
        } catch (cloudinaryErr) {
            console.error('Помилка при завантаженні файлу до Cloudinary:', cloudinaryErr);
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

        console.log('Отримано дані продукту:', productData); // Додаємо логування для дебагу

        // Валідація даних
        const { error } = productSchemaValidation.validate(productData);
        if (error) {
            console.error('Помилка валідації продукту:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const maxIdProduct = await Product.findOne().sort({ id: -1 });
        productData.id = maxIdProduct ? maxIdProduct.id + 1 : 1;

        const product = new Product(productData);
        await product.save();
        res.status(201).json(product);
    } catch (err) {
        console.error('Помилка при додаванні товару:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.put('/api/products/:id', authenticateToken, async (req, res) => {
    try {
        const productData = req.body;

        console.log('Отримано дані для оновлення продукту:', productData); // Додаємо логування для дебагу

        // Валідація даних
        const { error } = productSchemaValidation.validate(productData);
        if (error) {
            console.error('Помилка валідації продукту:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        // Знаходимо існуючий продукт
        const existingProduct = await Product.findOne({ id: req.params.id });
        if (!existingProduct) return res.status(404).json({ error: 'Товар не знайдено' });

        // Видаляємо старі фотографії з Cloudinary
        const oldPhotos = existingProduct.photos || [];
        const oldColorPhotos = existingProduct.colors.map(color => color.photo).filter(Boolean);
        const oldDescriptionMedia = existingProduct.descriptionMedia || [];

        const photosToDelete = [...oldPhotos, ...oldColorPhotos, ...oldDescriptionMedia];
        for (const photoUrl of photosToDelete) {
            const publicId = getPublicIdFromUrl(photoUrl);
            if (publicId) {
                try {
                    await cloudinary.uploader.destroy(publicId);
                    console.log(`Успішно видалено файл з Cloudinary: ${publicId}`);
                } catch (err) {
                    console.error(`Не вдалося видалити старий файл з Cloudinary: ${publicId}`, err);
                }
            }
        }

        const product = await Product.findOneAndUpdate({ id: req.params.id }, productData, { new: true });
        if (!product) return res.status(404).json({ error: 'Товар не знайдено' });
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

        res.json({ message: 'Товар видалено' });
    } catch (err) {
        console.error('Помилка при видаленні товару:', err);
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

        // Валідація даних
        const { error } = orderSchemaValidation.validate(orderData);
        if (error) {
            console.error('Помилка валідації замовлення:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const maxIdOrder = await Order.findOne().sort({ id: -1 });
        orderData.id = maxIdOrder ? maxIdOrder.id + 1 : 1;

        const order = new Order(orderData);
        await order.save();
        res.status(201).json(order);
    } catch (err) {
        console.error('Помилка при додаванні замовлення:', err);
        res.status(400).json({ error: 'Невірні дані', details: err.message });
    }
});

app.put('/api/orders/:id', authenticateToken, async (req, res) => {
    try {
        const orderData = req.body;

        // Валідація даних
        const { error } = orderSchemaValidation.validate(orderData);
        if (error) {
            console.error('Помилка валідації замовлення:', error.details);
            return res.status(400).json({ error: 'Помилка валідації', details: error.details });
        }

        const order = await Order.findOneAndUpdate({ id: req.params.id }, orderData, { new: true });
        if (!order) return res.status(404).json({ error: 'Замовлення не знайдено' });
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
        res.json({ message: 'Замовлення видалено' });
    } catch (err) {
        console.error('Помилка при видаленні замовлення:', err);
        res.status(500).json({ error: 'Помилка сервера', details: err.message });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
        // Генеруємо JWT
        const token = jwt.sign(
            { username: ADMIN_USERNAME, role: 'admin' },
            process.env.JWT_SECRET,
            { expiresIn: '30m' }
        );
        res.json({ success: true, token });
    } else {
        res.status(401).json({ success: false, error: 'Невірні дані для входу' });
    }
});

app.get('*', (req, res) => {
    console.log(`Отримано запит на ${req.path}, відправляємо index.html`);
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Помилка при відправці index.html:', err);
            res.status(500).send('Помилка при відображенні index.html');
        }
    });
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Сервер запущено на порту ${PORT}`));