const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');
const multer = require('multer');
const fs = require('fs');

dotenv.config();

const app = express();

// Налаштування Express для нечутливості до регістру в маршрутах
app.set('case sensitive routing', false);

// Парсинг JSON для API-запитів
app.use(express.json());

// Дозволяємо CORS для всіх запитів (корисно для тестування)
app.use(cors());

// Перевірка MONGO_URI
if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not defined in environment variables');
    process.exit(1);
}

// Перевірка ADMIN_USERNAME і ADMIN_PASSWORD
const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error('ADMIN_USERNAME or ADMIN_PASSWORD is not defined in environment variables');
    process.exit(1);
}

const ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

// Налаштування Multer для завантаження файлів
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'public/uploads/products');
        // Створюємо папку, якщо вона не існує
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage });

// Перевірка наявності папки public
const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    console.error(`Public directory not found at: ${publicPath}`);
    process.exit(1);
}

// Перевірка наявності index.html
const indexPath = path.join(publicPath, 'index.html');
if (!fs.existsSync(indexPath)) {
    console.error(`index.html not found at: ${indexPath}`);
    process.exit(1);
}

// Перевірка наявності admin.html
const adminPath = path.join(publicPath, 'admin.html');
if (!fs.existsSync(adminPath)) {
    console.error(`admin.html not found at: ${adminPath}`);
    process.exit(1);
}

// Маршрут для адмін-панелі (розміщений до express.static для пріоритету)
app.get('/admin', (req, res) => {
    console.log('Request received for /admin');
    console.log('Admin path:', adminPath);
    res.sendFile(adminPath, (err) => {
        if (err) {
            console.error('Error sending admin.html:', err);
            res.status(500).send('Error serving admin.html');
        } else {
            console.log('Successfully sent admin.html');
        }
    });
});

// Тестовий маршрут для перевірки роботи маршрутизації
app.get('/test-admin', (req, res) => {
    console.log('Request received for /test-admin');
    res.send('This is a test admin route');
});

// Роздача статичних файлів із папки public
app.use(express.static(publicPath));

// Якщо файл у /uploads/ не знайдено, повертаємо 404
app.use((req, res, next) => {
    if (req.path.startsWith('/uploads/') && !fs.existsSync(path.join(publicPath, req.path))) {
        return res.status(404).send('File not found');
    }
    next();
});

// Підключення до MongoDB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

// Схема для товарів
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
    descriptionMedia: [String] // Додаємо поле для медіа в описі
});

const Product = mongoose.model('Product', productSchema);

// API для товарів
// Отримати всі товари
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// Маршрут для завантаження медіа з опису
app.post('/api/upload-media', upload.single('descriptionMedia'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    const url = `/uploads/products/${req.file.filename}`;
    res.json({ url });
});

// Додати товар
app.post('/api/products', upload.fields([
    { name: 'photos', maxCount: 10 },
    { name: 'colorPhoto0', maxCount: 1 },
    { name: 'colorPhoto1', maxCount: 1 },
    { name: 'colorPhoto2', maxCount: 1 },
    { name: 'colorPhoto3', maxCount: 1 },
    { name: 'colorPhoto4', maxCount: 1 },
    { name: 'descriptionMedia', maxCount: 10 }
]), async (req, res) => {
    try {
        const productData = JSON.parse(req.body.product);
        const files = req.files;

        // Обробка основних фото товару
        if (files['photos']) {
            productData.photos = files['photos'].map(file => `/uploads/products/${file.filename}`);
        }

        // Обробка фото кольорів
        if (productData.colors) {
            productData.colors.forEach((color, index) => {
                const colorPhotoField = files[`colorPhoto${index}`];
                if (colorPhotoField && colorPhotoField[0]) {
                    color.photo = `/uploads/products/${colorPhotoField[0].filename}`;
                }
            });
        }

        // Обробка медіа в описі
        if (files['descriptionMedia']) {
            productData.descriptionMedia = files['descriptionMedia'].map(file => `/uploads/products/${file.filename}`);
        }

        // Знаходимо максимальний ID
        const maxIdProduct = await Product.findOne().sort({ id: -1 });
        productData.id = maxIdProduct ? maxIdProduct.id + 1 : 1;

        const product = new Product(productData);
        await product.save();
        res.status(201).json(product);
    } catch (err) {
        console.error('Error adding product:', err);
        res.status(400).json({ error: 'Invalid data', details: err.message });
    }
});

// Оновити товар
app.put('/api/products/:id', upload.fields([
    { name: 'photos', maxCount: 10 },
    { name: 'colorPhoto0', maxCount: 1 },
    { name: 'colorPhoto1', maxCount: 1 },
    { name: 'colorPhoto2', maxCount: 1 },
    { name: 'colorPhoto3', maxCount: 1 },
    { name: 'colorPhoto4', maxCount: 1 },
    { name: 'descriptionMedia', maxCount: 10 }
]), async (req, res) => {
    try {
        const productData = JSON.parse(req.body.product);
        const files = req.files;

        // Обробка основних фото товару
        if (files['photos']) {
            productData.photos = files['photos'].map(file => `/uploads/products/${file.filename}`);
        }

        // Обробка фото кольорів
        if (productData.colors) {
            productData.colors.forEach((color, index) => {
                const colorPhotoField = files[`colorPhoto${index}`];
                if (colorPhotoField && colorPhotoField[0]) {
                    color.photo = `/uploads/products/${colorPhotoField[0].filename}`;
                }
            });
        }

        // Обробка медіа в описі
        if (files['descriptionMedia']) {
            productData.descriptionMedia = files['descriptionMedia'].map(file => `/uploads/products/${file.filename}`);
        }

        const product = await Product.findOneAndUpdate({ id: req.params.id }, productData, { new: true });
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(400).json({ error: 'Invalid data', details: err.message });
    }
});

// Видалити товар
app.delete('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findOneAndDelete({ id: req.params.id });
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json({ message: 'Product deleted' });
    } catch (err) {
        console.error('Error deleting product:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

// Простий логін для адмінки
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

// Обробка всіх інших маршрутів — повертаємо index.html
app.get('*', (req, res) => {
    console.log(`Request received for ${req.path}, serving index.html`);
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            res.status(500).send('Error serving index.html');
        }
    });
});

// Глобальний обробник помилок
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));