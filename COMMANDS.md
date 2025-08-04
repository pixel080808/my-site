# Команди для запуску скриптів

## Основні команди

### 🚀 Повний процес (рекомендовано)
```bash
node script/run_full_process.js
```
Запускає весь процес: тестування сайту → скрапінг → імпорт → завантаження зображень

### 📡 Тестування доступності сайту
```bash
node script/test_site_access.js
```
Перевіряє чи доступний сайт MiroMark

### 🕷️ Скрапінг даних
```bash
node script/miromark_scraper_enhanced.js
```
Витягує дані з сайту MiroMark (покращена версія)

### 🕷️ Скрапінг для робочого сайту
```bash
node script/miromark_scraper_working.js
```
Витягує дані з сайту MiroMark (оптимізований для робочого сайту)

### 🕷️ Фінальний скрапінг
```bash
node script/miromark_scraper_final.js
```
Витягує дані з сайту MiroMark (фінальна версія з покращеною обробкою)

### 🕷️ HTTP скрапінг (рекомендовано для MiroMark)
```bash
node script/miromark_scraper_http.js
```
Витягує дані з сайту MiroMark з примусовим використанням HTTP

### 🎭 Демо-дані
```bash
node script/demo_scraper.js
```
Створює демо-дані для тестування (якщо сайт недоступний)

### 📊 Імпорт та конвертація
```bash
node script/import_miromark_data.js
```
Конвертує дані в формат для імпорту в адмінку

### 🖼️ Завантаження зображень
```bash
node script/download_images.js
```
Завантажує зображення товарів локально

## Альтернативні команди

### Стара версія скрапера
```bash
node script/miromark_scraper.js
```

### Проста версія скрапера
```bash
node script/miromark_scraper_simple.js
```

## Результати

Всі файли зберігаються в папці `exports/`:
- `miromark_import_*.json` - дані для імпорту в адмінку
- `miromark_report_*.json` - звіти про скрапінг
- `miromark_import_*.csv` - CSV файли для імпорту

## Примітки

- Всі товари створюються з типом `"simple"`
- Дані конвертуються в формат, сумісний з вашою адмінкою
- Якщо сайт недоступний, використовуються демо-дані
- Зображення завантажуються в папку `uploads/products/` 