const express = require('express');
const Settings = require('../models/Settings');
const authenticateToken = require('../middleware/auth');
const { broadcast } = require('../utils/websocket');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const settings = await Settings.findOne();
        res.json(settings || {});
    } catch (error) {
        res.status(500).json({ error: 'Помилка сервера', details: error.message });
    }
});

router.put('/', authenticateToken, async (req, res) => {
    try {
        const updateData = req.body;
        const settings = await Settings.findOneAndUpdate(
            {},
            { $set: updateData },
            { new: true, upsert: true, runValidators: true }
        );
        broadcast(req.app.get('wss'), 'settings', settings); // Передаємо wss через req.app
        res.json(settings);
    } catch (error) {
        res.status(400).json({ error: 'Помилка оновлення налаштувань', details: error.message });
    }
});

module.exports = router;