// models/Settings.js
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  baseUrl: { type: String, default: '' },
  logo: { type: String, default: '' },
  logoWidth: { type: Number, default: 150 },
  favicon: { type: String, default: '' },
  contacts: {
    phones: { type: String, default: '' },
    addresses: { type: String, default: '' },
    schedule: { type: String, default: '' }
  },
  socials: [{
    name: { type: String, default: '' },
    url: { type: String, required: true },
    icon: { type: String, required: true }
  }],
  showSocials: { type: Boolean, default: true },
  about: { type: String, default: '' },
  categoryWidth: { type: Number, default: 0 },
  categoryHeight: { type: Number, default: 0 },
  productWidth: { type: Number, default: 0 },
  productHeight: { type: Number, default: 0 },
  filters: [{
    name: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, required: true },
    options: [{ type: String }]
  }],
  orderFields: [{
    name: { type: String, required: true },
    label: { type: String, required: true },
    type: { type: String, required: true },
    options: [{ type: String }]
  }],
  slideWidth: { type: Number, default: 0 },
  slideHeight: { type: Number, default: 0 },
  slideInterval: { type: Number, default: 3000 },
  showSlides: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Settings', settingsSchema);