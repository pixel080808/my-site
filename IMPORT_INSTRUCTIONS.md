# 📦 Інструкція по імпорту товарів

## Варіанти імпорту товарів

### 1. Через командний рядок (import-products.js)

**Використання:**
```bash
node import-products.js products-backup.json
```

**Що робить:**
- Читає JSON файл з товарами
- Завантажує фото на Cloudinary (якщо потрібно)
- Додає товари в базу даних

### 2. Через API (import-api.js)

**Запуск API:**
```bash
node import-api.js
```

**Імпорт через HTTP запит:**
```bash
curl -X POST http://localhost:3001/api/import-products \
  -H "Content-Type: application/json" \
  -d '{
    "products": [...],
    "apiKey": "your-secret-key"
  }'
```

**Імпорт через файл:**
```bash
curl -X POST http://localhost:3001/api/import-file \
  -F "file=@products-backup.json"
```

### 3. Через веб-інтерфейс (import.html)

**Доступ:**
- Відкрийте `http://your-site.com/import.html`
- Виберіть файл або вставте JSON
- Натисніть "Імпортувати"

## Формат JSON файлу

```json
[
  {
    "name": "Назва товару",
    "category": "vitalni",
    "subcategory": "54321",
    "price": 1000,
    "salePrice": 800,
    "brand": "Бренд",
    "material": "Матеріал",
    "photos": [
      "https://res.cloudinary.com/.../image1.jpg",
      "https://res.cloudinary.com/.../image2.jpg"
    ],
    "colors": [
      {
        "name": "Колір",
        "value": "#000000",
        "photo": "https://res.cloudinary.com/.../color.jpg",
        "priceChange": 0
      }
    ],
    "description": "<p>Опис товару</p>",
    "visible": true,
    "active": true,
    "type": "simple"
  }
]
```

## Налаштування

### 1. Підключення до бази даних

В файлі `import-products.js` змініть:
```javascript
mongoose.connect('mongodb://localhost:27017/your-database-name', {
    useNewUrlParser: true,
    useUnifiedTopology: true
});
```

### 2. API ключ

В файлі `import-api.js` встановіть змінну оточення:
```bash
export IMPORT_API_KEY="your-secret-key"
```

### 3. Cloudinary налаштування

Для завантаження фото на Cloudinary додайте в `import-products.js`:
```javascript
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'your-cloud-name',
  api_key: 'your-api-key',
  api_secret: 'your-api-secret'
});

async function uploadImageToCloudinary(imageUrl) {
  try {
    const result = await cloudinary.uploader.upload(imageUrl, {
      folder: 'products'
    });
    return result.secure_url;
  } catch (error) {
    console.error('Помилка завантаження:', error);
    return imageUrl; // Повертаємо оригінальний URL
  }
}
```

## Безпека

1. **API ключ** - обов'язково встановіть унікальний ключ
2. **Обмеження доступу** - додайте авторизацію до `/import.html`
3. **Валідація даних** - перевіряйте формат JSON перед імпортом

## Приклади використання

### Додавання товарів з іншого сайту

1. **Експорт з іншого сайту:**
```javascript
// На іншому сайті
const products = await Product.find({});
fs.writeFileSync('exported-products.json', JSON.stringify(products));
```

2. **Імпорт на ваш сайт:**
```bash
node import-products.js exported-products.json
```

### Масове оновлення цін

1. **Створіть JSON з новими цінами:**
```json
[
  {
    "name": "Товар 1",
    "price": 1500,
    "salePrice": 1200
  }
]
```

2. **Імпортуйте через API:**
```bash
curl -X POST http://localhost:3001/api/import-products \
  -H "Content-Type: application/json" \
  -d @updated-prices.json
```

## Помилки та вирішення

### "Помилка підключення до бази даних"
- Перевірте URL бази даних
- Переконайтеся, що MongoDB запущено

### "Невірний формат JSON"
- Перевірте синтаксис JSON
- Використовуйте JSON validator

### "Помилка завантаження фото"
- Перевірте налаштування Cloudinary
- Переконайтеся, що URL фото доступні

## Підтримка

Якщо виникли питання або проблеми:
1. Перевірте логи сервера
2. Переконайтеся, що всі залежності встановлено
3. Перевірте права доступу до файлів 