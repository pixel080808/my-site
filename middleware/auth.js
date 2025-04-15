// middleware/auth.js
const jwt = require('jsonwebtoken');
const winston = require('winston');

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

module.exports = authenticateToken;