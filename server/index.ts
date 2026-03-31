import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import marketRoutes from './routes/market.js';
import sectorRoutes from './routes/sector.js';
import tickerRoutes from './routes/ticker.js';
import aiRoutes from './routes/ai.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  const keys = {
    alphaVantage: !!process.env.ALPHA_VANTAGE_KEY,
    finnhub: !!process.env.FINNHUB_KEY,
    anthropic: !!process.env.ANTHROPIC_API_KEY,
  };
  res.json({ status: 'ok', providers: keys });
});

// API routes
app.use('/api/market', marketRoutes);
app.use('/api/sector', sectorRoutes);
app.use('/api/ticker', tickerRoutes);
app.use('/api/ai', aiRoutes);

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log('Configured providers:');
  console.log(`  Alpha Vantage: ${process.env.ALPHA_VANTAGE_KEY ? 'Yes' : 'No'}`);
  console.log(`  Finnhub:       ${process.env.FINNHUB_KEY ? 'Yes' : 'No'}`);
  console.log(`  Yahoo Finance: Yes (no key needed)`);
});
