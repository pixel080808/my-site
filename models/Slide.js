// models/Slide.js
const slideSchema = new mongoose.Schema({
    id: Number, // Додано
    name: String,
    url: String,
    title: String,
    text: String,
    link: String,
    linkText: String,
    order: { type: Number, default: 0 }
}, { timestamps: true });
module.exports = mongoose.model('Slide', slideSchema);