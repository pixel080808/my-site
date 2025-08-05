# MiroMark Scraper & Web Application

Це веб-додаток для управління меблями з функціоналом скрапінгу даних з сайту MiroMark.

## Локальний запуск

1. Встановіть залежності:
```bash
npm install
```

2. Створіть файл `.env` з наступними змінними:
```
MONGO_URI=mongodb+srv://username:password@cluster.mongodb.net/database_name
JWT_SECRET=your-super-secret-jwt-key-here
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
NODE_ENV=development
PORT=3000
```

3. Запустіть сервер:
```bash
npm start
```

## Розгортання на Render

1. Підключіть ваш GitHub репозиторій до Render
2. Створіть новий Web Service
3. Налаштуйте змінні середовища в Render Dashboard:
   - `MONGO_URI` - URI вашої MongoDB бази даних
   - `JWT_SECRET` - секретний ключ для JWT токенів
   - `CLOUDINARY_CLOUD_NAME` - назва вашого Cloudinary аккаунту
   - `CLOUDINARY_API_KEY` - API ключ Cloudinary
   - `CLOUDINARY_API_SECRET` - API секрет Cloudinary
   - `NODE_ENV=production`
   - `PORT=10000`

### Важливі моменти для Render:

- Переконайтеся, що всі змінні середовища встановлені в Render Dashboard
- База даних MongoDB повинна бути доступна з інтернету
- Cloudinary аккаунт повинен бути налаштований
- Файл `render.yaml` вже налаштований для автоматичного розгортання

### Перевірка розгортання:

1. Після розгортання перевірте логи в Render Dashboard
2. Якщо є помилки, перевірте:
   - Чи всі змінні середовища встановлені
   - Чи доступна база даних
   - Чи правильно налаштований Cloudinary

## Структура проекту

- `server.js` - основний сервер Express
- `models/` - моделі MongoDB
- `public/` - статичні файли
- `script/` - скрипти для скрапінгу
- `uploads/` - завантажені файли

## API Endpoints

- `GET /` - головна сторінка
- `GET /admin` - адміністративна панель
- `GET /api/public/products` - публічні товари
- `POST /api/auth/login` - авторизація
- `GET /api/products` - товари (потребує авторизації)
- `POST /api/products` - додавання товару
- `PUT /api/products/:id` - оновлення товару
- `DELETE /api/products/:id` - видалення товару

## Скрипти

- `npm start` - запуск сервера
- `npm run dev` - запуск в режимі розробки
- `npm run test-db` - тестування з'єднання з базою даних
- `npm run check-env` - перевірка змінних середовища
- `npm run check-deps` - перевірка залежностей проекту
- `npm run init-db` - ініціалізація бази даних
- `npm run scrape` - запуск скрапера
- `npm run import` - імпорт даних
- `npm run test-site` - тестування доступу до сайту

## Тестування перед розгортанням

1. Перевірте залежності проекту:
```bash
npm run check-deps
```

2. Перевірте змінні середовища:
```bash
npm run check-env
```

3. Тестуйте з'єднання з базою даних:
```bash
npm run test-db
```

4. Ініціалізуйте базу даних (опціонально):
```bash
npm run init-db
```

5. Запустіть сервер локально:
```bash
npm start
``` 