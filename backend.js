import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';
import fs from 'fs';

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json()); 

const ordersFile = 'limitOrders.json';

const loadLimitOrders = () => {
  try {
    const data = fs.readFileSync(ordersFile);
    return JSON.parse(data);
  } catch (error) {
    return [];
  }
};


const saveLimitOrders = () => {
  fs.writeFileSync(ordersFile, JSON.stringify(limitOrders, null, 2));
};

let limitOrders = loadLimitOrders();

app.get('/', (req, res) => {
  res.send('Welcome to the Stock api');
});

app.get('/stock-data', async (req, res) => {
  const symbol = req.query.symbol || 'AAPL'; 
  const timeframe = req.query.timeframe || 'ALL'; 

  let range;
  switch (timeframe) {
    case '1M':
      range = '1mo';
      break;
    case 'live':
      range = '1d';
      break;
    case '3M':
      range = '3mo';
      break;
    case '6M':
      range = '6mo';
      break;
    case '1Y':
      range = '1y';
      break;
    case '2Y':
      range = '2y';
      break;
    case '5Y':
      range = '5y';
      break;
    case 'ALL':
      range = 'max';
      break;
    default:
      range = '1d';
  }

  const yahooApiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?region=US&lang=en-US&includePrePost=false&interval=1d&range=${range}`;

  try {
    const response = await fetch(yahooApiUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    if (data.chart?.result?.[0]?.meta) {
      res.json(data);
    } else {
      res.status(404).json({ error: 'Stock not supported or invalid data format' });
    }
  } catch (error) {
    console.error('Error fetching stock data:', error);
    res.status(500).json({ error: error.message || 'Error fetching stock data' });
  }
});

const checkLimitOrders = async () => {
  for (let i = limitOrders.length - 1; i >= 0; i--) {
    const order = limitOrders[i];
    const yahooApiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${order.symbol}?region=US&lang=en-US&includePrePost=false&interval=1d&range=1d`;
    try {
      const response = await fetch(yahooApiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (!response.ok) continue;
      const data = await response.json();
      const currentPrice = data.chart?.result?.[0]?.meta?.regularMarketPrice;

      if (currentPrice !== undefined && ((order.type === 'buy' && currentPrice <= order.limitPrice) || (order.type === 'sell' && currentPrice >= order.limitPrice))) {
        console.log(`Executing ${order.type} order for ${order.symbol} at $${currentPrice}`);
        limitOrders.splice(i, 1);
        saveLimitOrders();
      }
    } catch (error) {
      console.error('Error fetching stock data:', error);
    }
  }
};

setInterval(checkLimitOrders, 10000);

app.post('/limit-buy', (req, res) => {
  const { symbol, limitPrice } = req.body;
  if (!symbol || !limitPrice) {
    return res.status(400).json({ error: 'Missing required fields: symbol or limitPrice' });
  }
  limitOrders.push({ type: 'buy', symbol, limitPrice });
  saveLimitOrders();
  res.json({ success: true, message: `Limit buy order added for ${symbol} at $${limitPrice}` });
});

app.post('/limit-sell', (req, res) => {
  const { symbol, limitPrice } = req.body;
  if (!symbol || !limitPrice) {
    return res.status(400).json({ error: 'Missing required fields: symbol or limitPrice' });
  }
  limitOrders.push({ type: 'sell', symbol, limitPrice });
  saveLimitOrders();
  res.json({ success: true, message: `Limit sell order added for ${symbol} at $${limitPrice}` });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});