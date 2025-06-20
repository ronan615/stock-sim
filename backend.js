const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const ordersFile = 'limitOrders.json';
const usersDataFile = 'usersData.json';

let allUsersData = {};

const loadAllUsersData = () => {
    try {
        if (fs.existsSync(usersDataFile)) {
            const data = fs.readFileSync(usersDataFile, 'utf8');
            if (data) {
                const parsedData = JSON.parse(data);
                if (typeof parsedData === 'object' && parsedData !== null) {
                    allUsersData = parsedData;
                    console.log('All users data loaded successfully.');
                } else {
                    console.warn('usersData.json has an invalid format. Initializing with empty object.');
                    allUsersData = {};
                    saveAllUsersData();
                }
            } else {
                console.warn('usersData.json is empty. Initializing with empty object.');
                allUsersData = {};
                saveAllUsersData();
            }
        } else {
            console.log('usersData.json not found. Creating with empty object.');
            allUsersData = {};
            saveAllUsersData();
        }
    } catch (error) {
        console.error('Error loading all user data:', error);
        console.warn('Initializing all user data with empty object due to error.');
        allUsersData = {};
        saveAllUsersData();
    }
};

const saveAllUsersData = () => {
    try {
        fs.writeFileSync(usersDataFile, JSON.stringify(allUsersData, null, 2), 'utf8');
        console.log('All users data saved successfully.');
    } catch (error) {
        console.error('Error saving all user data:', error);
    }
};

let limitOrders = [];

const loadLimitOrders = () => {
    try {
        if (fs.existsSync(ordersFile)) {
            const data = fs.readFileSync(ordersFile, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('Error loading limit orders:', error);
        return [];
    }
};

const saveLimitOrders = () => {
    fs.writeFileSync(ordersFile, JSON.stringify(limitOrders, null, 2), 'utf8');
};

loadAllUsersData();
limitOrders = loadLimitOrders();

const getUserId = (req) => {
    return req.headers['x-user-id'];
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend.html'));
});

app.get('/api/user-data', (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(400).json({ error: 'User ID missing in headers.' });
    }

    if (!allUsersData[userId]) {
        allUsersData[userId] = { cash: 100000, portfolio: {} };
        saveAllUsersData();
        console.log(`Initialized new user data for userId: ${userId}`);
    }

    res.json(allUsersData[userId]);
});

app.post('/api/buy-stock', (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(400).json({ error: 'User ID missing in headers.' });
    }
    if (!allUsersData[userId]) {
        return res.status(404).json({ error: 'User data not found for provided ID.' });
    }

    const { symbol, amount, currentPrice } = req.body;

    if (!symbol || typeof amount !== 'number' || amount <= 0 || typeof currentPrice !== 'number' || currentPrice <= 0) {
        return res.status(400).json({ error: 'Invalid input for buying stock.' });
    }

    const totalCost = amount * currentPrice;

    if (allUsersData[userId].cash >= totalCost) {
        allUsersData[userId].cash -= totalCost;
        allUsersData[userId].portfolio[symbol] = (allUsersData[userId].portfolio[symbol] || 0) + amount;
        saveAllUsersData();
        res.json({ success: true, cash: allUsersData[userId].cash, portfolio: allUsersData[userId].portfolio });
    } else {
        res.status(400).json({ error: 'Insufficient cash.' });
    }
});

app.post('/api/sell-stock', (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(400).json({ error: 'User ID missing in headers.' });
    }
    if (!allUsersData[userId]) {
        return res.status(404).json({ error: 'User data not found for provided ID.' });
    }

    const { symbol, amount, currentPrice } = req.body;

    if (!symbol || typeof amount !== 'number' || amount <= 0 || typeof currentPrice !== 'number' || currentPrice <= 0) {
        return res.status(400).json({ error: 'Invalid input for selling stock.' });
    }

    if (allUsersData[userId].portfolio[symbol] && allUsersData[userId].portfolio[symbol] >= amount) {
        const totalRevenue = amount * currentPrice;
        allUsersData[userId].cash += totalRevenue;
        allUsersData[userId].portfolio[symbol] -= amount;

        if (allUsersData[userId].portfolio[symbol] < 0.001) {
            delete allUsersData[userId].portfolio[symbol];
        }
        saveAllUsersData();
        res.json({ success: true, cash: allUsersData[userId].cash, portfolio: allUsersData[userId].portfolio });
    } else {
        res.status(400).json({ error: 'Insufficient stock or stock not held.' });
    }
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
            if (!response.ok) {
                console.warn(`Failed to fetch data for ${order.symbol}: HTTP status ${response.status}`);
                continue;
            }
            const data = await response.json();
            const currentPrice = data.chart?.result?.[0]?.meta?.regularMarketPrice;

            if (currentPrice !== undefined) {
                if (!allUsersData[order.userId]) {
                    console.warn(`User data not found for userId: ${order.userId} for limit order. Skipping.`);
                    limitOrders.splice(i, 1);
                    saveLimitOrders();
                    continue;
                }

                const userCurrentData = allUsersData[order.userId];

                if ((order.type === 'buy' && currentPrice <= order.limitPrice) || (order.type === 'sell' && currentPrice >= order.limitPrice)) {
                    console.log(`Executing ${order.type} order for ${order.symbol} for user ${order.userId} at $${currentPrice}`);
                    if (order.type === 'buy') {
                        const totalCost = order.amount * currentPrice;
                        if (userCurrentData.cash >= totalCost) {
                            userCurrentData.cash -= totalCost;
                            userCurrentData.portfolio[order.symbol] = (userCurrentData.portfolio[order.symbol] || 0) + order.amount;
                            console.log(`Executed buy: ${order.amount} of ${order.symbol}. Remaining cash for ${order.userId}: ${userCurrentData.cash}`);
                        } else {
                            console.warn(`Limit buy order for ${order.symbol} at $${order.limitPrice} for user ${order.userId} failed due to insufficient cash.`);
                        }
                    } else if (order.type === 'sell') {
                        if (userCurrentData.portfolio[order.symbol] && userCurrentData.portfolio[order.symbol] >= order.amount) {
                            const totalRevenue = order.amount * currentPrice;
                            userCurrentData.cash += totalRevenue;
                            userCurrentData.portfolio[order.symbol] -= order.amount;
                            if (userCurrentData.portfolio[order.symbol] < 0.001) {
                                delete userCurrentData.portfolio[order.symbol];
                            }
                            console.log(`Executed sell: ${order.amount} of ${order.symbol}. New cash for ${order.userId}: ${userCurrentData.cash}`);
                        } else {
                            console.warn(`Limit sell order for ${order.symbol} at $${order.limitPrice} for user ${order.userId} failed due to insufficient stock.`);
                        }
                    }
                    saveAllUsersData();
                    limitOrders.splice(i, 1);
                    saveLimitOrders();
                }
            } else {
                console.warn(`Current price for ${order.symbol} is undefined.`);
            }
        } catch (error) {
            console.error(`Error checking limit order for ${order.symbol}:`, error);
        }
    }
};

setInterval(checkLimitOrders, 10000);

app.post('/limit-buy', (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(400).json({ error: 'User ID missing in headers.' });
    }
    const { symbol, limitPrice, amount } = req.body;
    if (!symbol || !limitPrice || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'Missing required fields: symbol, limitPrice, or amount' });
    }
    limitOrders.push({ userId, type: 'buy', symbol, limitPrice, amount });
    saveLimitOrders();
    res.json({ success: true, message: `Limit buy order added for ${symbol} for ${amount} shares at $${limitPrice}` });
});

app.post('/limit-sell', (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(400).json({ error: 'User ID missing in headers.' });
    }
    const { symbol, limitPrice, amount } = req.body;
    if (!symbol || !limitPrice || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'Missing required fields: symbol, limitPrice, or amount' });
    }
    limitOrders.push({ userId, type: 'sell', symbol, limitPrice, amount });
    saveLimitOrders();
    res.json({ success: true, message: `Limit sell order added for ${symbol} for ${amount} shares at $${limitPrice}` });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
