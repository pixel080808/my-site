const mongoose = require('mongoose');

const materialSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true, trim: true }
}, { timestamps: true });

materialSchema.pre('save', async function(next) {
    const material = this;
    if (material.isModified('name')) {
        const existing = await mongoose.models.Material.findOne({ name: material.name, _id: { $ne: material._id } });
        if (existing) {
            throw new Error('Матеріал з такою назвою вже існує');
        }
    }
    next();
});

module.exports = mongoose.model('Material', materialSchema);