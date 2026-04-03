const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const Image = require('./models/Image');
require('dotenv').config();

// 👇 Points to your public folder images
const IMAGE_FOLDER = path.join(__dirname, '../public/images/2026-03-30');

function parseFilename(filename) {
  const match = filename.match(/batch_(\d+)_imgs_(\d+-\d+)_(\d+)persons/);
  if (!match) return {};
  return {
    batchNumber: parseInt(match[1]),
    imgRange: match[2],
    personCount: parseInt(match[3])
  };
}

async function bulkUpload() {
  await mongoose.connect('mongodb://127.0.0.1:27017/yolo_images'); 
  console.log('✅ Connected to MongoDB');

  const files = fs.readdirSync(IMAGE_FOLDER)
    .filter(f => /\.(jpg|jpeg|png)$/i.test(f));

  console.log(`📁 Found ${files.length} images...`);

  for (const file of files) {
    const buffer = fs.readFileSync(path.join(IMAGE_FOLDER, file));
    const parsed = parseFilename(file);
    await Image.create({
      name: file,
      data: buffer.toString('base64'),
      contentType: 'image/jpeg',
      date: '2026-03-30',
      ...parsed
    });
    console.log(`✅ ${file} — ${parsed.personCount} persons`);
  }

  console.log('🎉 Done! All images in MongoDB.');
  mongoose.disconnect();
}

bulkUpload().catch(console.error);