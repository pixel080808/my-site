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

// Роздача статичних файлів із папки public (після всіх маршрутів)
app.use(express.static(publicPath));

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
    visible: Boolean
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

// Додати товар
app.post('/api/products', upload.array('photos', 10), async (req, res) => {
    try {
        const productData = JSON.parse(req.body.product);
        const files = req.files;

        // Додаємо шляхи до фотографій
        if (files && files.length > 0) {
            productData.photos = files.map(file => `/uploads/products/${file.filename}`);
        }

        // Обробляємо фото кольорів, якщо вони є
        if (productData.colors && req.body.colorPhotos) {
            const colorPhotos = JSON.parse(req.body.colorPhotos);
            productData.colors.forEach((color, index) => {
                if (colorPhotos[index] && colorPhotos[index].filename) {
                    color.photo = `/uploads/products/${colorPhotos[index].filename}`;
                }
            });
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
app.put('/api/products/:id', upload.array('photos', 10), async (req, res) => {
    try {
        const productData = JSON.parse(req.body.product);
        const files = req.files;

        if (files && files.length > 0) {
            productData.photos = files.map(file => `/uploads/products/${file.filename}`);
        }

        if (productData.colors && req.body.colorPhotos) {
            const colorPhotos = JSON.parse(req.body.colorPhotos);
            productData.colors.forEach((color, index) => {
                if (colorPhotos[index] && colorPhotos[index].filename) {
                    color.photo = `/uploads/products/${colorPhotos[index].filename}`;
                }
            });
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