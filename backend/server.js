const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const Image = require('./models/Image');
require('dotenv').config();

const app = express();
app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch(err => console.error('❌ MongoDB error:', err));

app.get('/api/images', async (req, res) => {
  const images = await Image.find().sort({ batchNumber: 1 });
  res.json(images);
});

app.delete('/api/images/:id', async (req, res) => {
  await Image.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

app.listen(process.env.PORT || 5000, () =>
  console.log(`🚀 Server on http://localhost:5000`)
);