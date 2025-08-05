const fs = require('fs');
const path = require('path');

console.log('🔍 Checking project dependencies and files...\n');

// Перевіряємо package.json
if (!fs.existsSync('package.json')) {
    console.error('❌ package.json not found');
    process.exit(1);
}
console.log('✅ package.json exists');

// Перевіряємо server.js
if (!fs.existsSync('server.js')) {
    console.error('❌ server.js not found');
    process.exit(1);
}
console.log('✅ server.js exists');

// Перевіряємо моделі
const modelsDir = 'models';
if (!fs.existsSync(modelsDir)) {
    console.error('❌ models directory not found');
    process.exit(1);
}
console.log('✅ models directory exists');

const requiredModels = [
    'Product.js',
    'Category.js',
    'Settings.js',
    'Order.js',
    'Cart.js',
    'Slide.js',
    'Counter.js',
    'Brand.js',
    'Material.js',
    'OrderField.js'
];

for (const model of requiredModels) {
    const modelPath = path.join(modelsDir, model);
    if (!fs.existsSync(modelPath)) {
        console.error(`❌ ${model} not found`);
        process.exit(1);
    }
    console.log(`✅ ${model} exists`);
}

// Перевіряємо public директорію
const publicDir = 'public';
if (!fs.existsSync(publicDir)) {
    console.error('❌ public directory not found');
    process.exit(1);
}
console.log('✅ public directory exists');

const requiredPublicFiles = [
    'index.html',
    'admin.html',
    'css/styles.css',
    'js/script.js',
    'js/admin.js',
    'js/scroll.js'
];

for (const file of requiredPublicFiles) {
    const filePath = path.join(publicDir, file);
    if (!fs.existsSync(filePath)) {
        console.error(`❌ ${file} not found`);
        process.exit(1);
    }
    console.log(`✅ ${file} exists`);
}

// Перевіряємо конфігураційні файли
const configFiles = [
    'render.yaml',
    'Procfile',
    '.gitignore'
];

for (const file of configFiles) {
    if (!fs.existsSync(file)) {
        console.warn(`⚠️  ${file} not found (optional)`);
    } else {
        console.log(`✅ ${file} exists`);
    }
}

// Перевіряємо скрипти
const scriptFiles = [
    'test-db.js',
    'check-env.js',
    'init-db.js'
];

for (const file of scriptFiles) {
    if (!fs.existsSync(file)) {
        console.warn(`⚠️  ${file} not found (optional)`);
    } else {
        console.log(`✅ ${file} exists`);
    }
}

console.log('\n🎉 All required files are present!');
console.log('Your project is ready for deployment.'); 