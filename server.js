const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const dotenv = require('dotenv');
const path = require('path');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

dotenv.config();

const app = express();

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
        folder: 'products', // Папка в Cloudinary
        allowed_formats: ['jpg', 'png', 'jpeg', 'gif']
    }
});
const upload = multer({ storage });

app.set('case sensitive routing', false);
app.use(express.json());
app.use(cors());

// Перевірка змінних середовища
if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not defined in environment variables');
    process.exit(1);
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
    console.error('ADMIN_USERNAME or ADMIN_PASSWORD is not defined in environment variables');
    process.exit(1);
}

const ADMIN_PASSWORD_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

const publicPath = path.join(__dirname, 'public');
if (!fs.existsSync(publicPath)) {
    console.error(`Public directory not found at: ${publicPath}`);
    process.exit(1);
}

const indexPath = path.join(publicPath, 'index.html');
if (!fs.existsSync(indexPath)) {
    console.error(`index.html not found at: ${indexPath}`);
    process.exit(1);
}

const adminPath = path.join(publicPath, 'admin.html');
if (!fs.existsSync(adminPath)) {
    console.error(`admin.html not found at: ${adminPath}`);
    process.exit(1);
}

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

app.get('/test-admin', (req, res) => {
    console.log('Request received for /test-admin');
    res.send('This is a test admin route');
});

app.use(express.static(publicPath));

mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('MongoDB connected'))
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });

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

const Product = mongoose.model('Product', productSchema);

// Додаємо ендпоінт /api/upload
app.post('/api/upload', upload.single('file'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
    }
    res.json({ url: req.file.path }); // Cloudinary повертає URL у req.file.path
});

app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find();
        res.json(products);
    } catch (err) {
        console.error('Error fetching products:', err);
        res.status(500).json({ error: 'Server error', details: err.message });
    }
});

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

        if (files['photos']) {
            productData.photos = files['photos'].map(file => file.path);
        }

        if (productData.colors) {
            productData.colors.forEach((color, index) => {
                const colorPhotoField = files[`colorPhoto${index}`];
                if (colorPhotoField && colorPhotoField[0]) {
                    color.photo = colorPhotoField[0].path;
                }
            });
        }

        if (files['descriptionMedia']) {
            productData.descriptionMedia = files['descriptionMedia'].map(file => file.path);
        }

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

        if (files['photos']) {
            productData.photos = files['photos'].map(file => file.path);
        }

        if (productData.colors) {
            productData.colors.forEach((color, index) => {
                const colorPhotoField = files[`colorPhoto${index}`];
                if (colorPhotoField && colorPhotoField[0]) {
                    color.photo = colorPhotoField[0].path;
                }
            });
        }

        if (files['descriptionMedia']) {
            productData.descriptionMedia = files['descriptionMedia'].map(file => file.path);
        }

        const product = await Product.findOneAndUpdate({ id: req.params.id }, productData, { new: true });
        if (!product) return res.status(404).json({ error: 'Product not found' });
        res.json(product);
    } catch (err) {
        console.error('Error updating product:', err);
        res.status(400).json({ error: 'Invalid data', details: err.message });
    }
});

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

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    if (username === ADMIN_USERNAME && bcrypt.compareSync(password, ADMIN_PASSWORD_HASH)) {
        res.json({ success: true });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

app.get('*', (req, res) => {
    console.log(`Request received for ${req.path}, serving index.html`);
    res.sendFile(indexPath, (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            res.status(500).send('Error serving index.html');
        }
    });
});

app.use((err, req, res, next) => {
    console.error('Server error:', err);
    res.status(500).json({ error: 'Internal server error', details: err.message });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));