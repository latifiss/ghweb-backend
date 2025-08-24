require('express-async-errors');
const { connectDB } = require('./db/index');
const express = require('express');
require('dotenv').config();
const morgan = require('morgan');
const cors = require('cors');
const path = require('path');
const favicon = require('serve-favicon');

const musicRouter = require('./routes/music.routes');
const articleRouter = require('./routes/article.routes');
const movieRouter = require('./routes/movie.routes');
const reviewRouter = require('./routes/review.routes');
const opinionRouter = require('./routes/opinion.routes');
const featureRouter = require('./routes/feature.routes');
const authRouter = require('./routes/adminAuth.routes');
const feedRouter = require('./routes/feed.routes');

const app = express();

app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:3002',
];

const corsOptions = {
  origin: allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(morgan('dev'));

connectDB();

app.use('/api/music', musicRouter);
app.use('/api/article', articleRouter);
app.use('/api/movie', movieRouter);
app.use('/api/review', reviewRouter);
app.use('/api/opinion', opinionRouter);
app.use('/api/feature', featureRouter);
app.use('/api/auth', authRouter);
app.use('/api/feed', feedRouter);

app.use((err, req, res, next) => {
  res.status(500).json({ error: err.message });
});

const PORT = process.env.PORT || 8080;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});
