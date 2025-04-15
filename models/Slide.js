// models/Slide.js
const mongoose = require('mongoose');

const slideSchema = new mongoose.Schema({
  id: { type: Number, required: true },
  image: { type: String, default: '' },
  name: { type: String, default: '' },
  url: { type: String, default: '' },
  title: { type: String, default: '' },
  text: { type: String, default: '' },
  link: { type: String, default: '' },
  linkText: { type: String, default: '' },
  order: { type: Number, default: 0 }
}, { timestamps: true });

module.exports = mongoose.model('Slide', slideSchema);