import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// ✅ Load .env FIRST before anything else
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });

import express from 'express';
import cors from 'cors';

import connectDB from './config/db.js';
import { verifyEmailConfig } from './utils/emailService.js';
import authRoutes from './routes/authRoutes.js';
import resumeRoutes from './routes/resumeRoutes.js';

// Connect to database
connectDB();

// Verify email config
verifyEmailConfig();

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5174', 'http://127.0.0.1:5174', 'https://urbridge.in'],
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'UrBridge.ai API is running',
    timestamp: new Date().toISOString(),
  });
});

// Routes
app.use('/api/user', authRoutes);
app.use('/api/resume', resumeRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error',
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`  UrBridge.ai API Server`);
  console.log(`  Running on http://localhost:${PORT}`);
});

export default app;