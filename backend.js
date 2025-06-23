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
const transactionsFile = 'transactions.json';

let allUsersData = {};
let usernameMap = {};
let stockPricesCache = {};
let transactions = [];

const loadAllUsersData = () => {
    try {
        if (fs.existsSync(usersDataFile)) {
            const data = fs.readFileSync(usersDataFile, 'utf8');
            if (data) {
                const parsedData = JSON.parse(data);
                if (typeof parsedData === 'object' && parsedData !== null) {
                    allUsersData = parsedData;
                    usernameMap = {};
                    for (const userId in allUsersData) {
                        const user = allUsersData[userId];
                        if (user.username) {
                            usernameMap[user.username.toLowerCase()] = userId;
                        }
                    }
                    console.log('All users data loaded successfully.');
                } else {
                    console.warn('usersData.json has an invalid format. Initializing with empty object.');
                    allUsersData = {};
                    usernameMap = {};
                    saveAllUsersData();
                }
            } else {
                console.log('usersData.json is empty. Initializing with empty object.');
                allUsersData = {};
                usernameMap = {};
                saveAllUsersData();
            }
        } else {
            console.log('usersData.json not found. Creating with empty object.');
            allUsersData = {};
            usernameMap = {};
            saveAllUsersData();
        }
    } catch (error) {
        console.error('Error loading all user data:', error);
        console.warn('Initializing all user data with empty object due to error.');
        allUsersData = {};
        usernameMap = {};
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

const loadTransactions = () => {
    try {
        if (fs.existsSync(transactionsFile)) {
            const data = fs.readFileSync(transactionsFile, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        console.error('Error loading transactions:', error);
        return [];
    }
};

const saveTransactions = () => {
    try {
        fs.writeFileSync(transactionsFile, JSON.stringify(transactions, null, 2), 'utf8');
        console.log('Transactions saved successfully.');
    } catch (error) {
        console.error('Error saving transactions:', error);
    }
};


loadAllUsersData();
limitOrders = loadLimitOrders();
transactions = loadTransactions();

const authenticateToken = (req, res, next) => {
    req.user = { uid: req.headers['x-user-id'] };
    next();
};

app.use(authenticateToken);

const getUserId = (req) => {
    return req.user?.uid;
};

const getUserName = (req) => {
    return req.headers['x-user-name'];
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend.html'));
});

app.get('/api/user-data', (req, res) => {
    const userId = getUserId(req);
    let userName = getUserName(req);

    if (typeof userName === 'string' && (userName.toLowerCase() === 'null' || userName.toLowerCase() === 'undefined')) {
        userName = null;
    } else if (typeof userName === 'string') {
        userName = userName.trim();
    } else {
        userName = null;
    }

    if (!userId) {
        return res.status(400).json({ error: 'User ID missing.' });
    }

    const normalizedNewUserName = userName ? userName.toLowerCase() : null;

    if (allUsersData[userId]) {
        if (!userName || userName.trim() === '') {
            const oldUsername = allUsersData[userId].username;
            const normalizedOldUsername = oldUsername ? oldUsername.toLowerCase() : null;
            if (normalizedOldUsername && usernameMap[normalizedOldUsername] === userId) {
                delete usernameMap[normalizedOldUsername];
            }
            delete allUsersData[userId];
            saveAllUsersData();
            console.log(`Deleted user data for userId: ${userId} due to invalid/missing username in request.`);
            return res.status(401).json({ error: 'Your user session is invalid. Please restart the app or set a new username.' });
        }

        if (allUsersData[userId].username !== userName) {
            const oldUsername = allUsersData[userId].username;
            const normalizedOldUsername = oldUsername ? oldUsername.toLowerCase() : null;

            if (normalizedNewUserName && usernameMap[normalizedNewUserName] && usernameMap[normalizedNewUserName] !== userId) {
                return res.status(409).json({ error: 'Username already taken. Please choose a different one.' });
            }

            if (normalizedOldUsername && usernameMap[normalizedOldUsername] === userId) {
                delete usernameMap[normalizedOldUsername];
            }
            allUsersData[userId].username = userName;
            usernameMap[userName.toLowerCase()] = userId;
            saveAllUsersData();
            console.log(`Updated username for userId: ${userId} from "${oldUsername}" to "${userName}"`);
        }
    } else {
        if (normalizedNewUserName && normalizedNewUserName !== null && usernameMap[normalizedNewUserName]) {
            return res.status(409).json({ error: 'Username already taken. Please choose a different one.' });
        }
        allUsersData[userId] = {
            cash: 100000,
            portfolio: {},
            username: userName || `User-${userId.substring(0, 4)}`
        };
        usernameMap[allUsersData[userId].username.toLowerCase()] = userId;
        saveAllUsersData();
        console.log(`Initialized new user data for userId: ${userId} with username: ${allUsersData[userId].username}`);
    }
    res.json(allUsersData[userId]);
});

app.post('/api/buy-stock', (req, res) => {
    const userId = getUserId(req);
    const { symbol, amount, currentPrice } = req.body;

    if (!userId) {
        return res.status(401).json({ error: 'Authentication required for this action.' });
    }
    if (!symbol || typeof amount !== 'number' || amount <= 0 || typeof currentPrice !== 'number' || currentPrice <= 0) {
        return res.status(400).json({ error: 'Invalid input for buying stock.' });
    }

    const totalCost = amount * currentPrice;

    if (allUsersData[userId] && allUsersData[userId].cash >= totalCost) {
        allUsersData[userId].cash -= totalCost;
        allUsersData[userId].portfolio[symbol] = (allUsersData[userId].portfolio[symbol] || 0) + amount;
        
        saveAllUsersData();
        transactions.push({
            userId,
            type: 'buy',
            symbol,
            amount,
            price: currentPrice,
            timestamp: new Date().toISOString(),
            status: 'success'
        });
        saveTransactions();

        res.json({ success: true, cash: allUsersData[userId].cash, portfolio: allUsersData[userId].portfolio });
    } else {
        transactions.push({
            userId,
            type: 'buy',
            symbol,
            amount,
            price: currentPrice,
            timestamp: new Date().toISOString(),
            status: 'failed',
            reason: 'Insufficient cash'
        });
        saveTransactions();
        res.status(400).json({ error: 'Insufficient cash.' });
    }
});

app.post('/api/sell-stock', (req, res) => {
    const userId = getUserId(req);
    const { symbol, amount, currentPrice } = req.body;

    if (!userId) {
        return res.status(401).json({ error: 'Authentication required for this action.' });
    }
    if (!symbol || typeof amount !== 'number' || amount <= 0 || typeof currentPrice !== 'number' || currentPrice <= 0) {
        return res.status(400).json({ error: 'Invalid input for selling stock.' });
    }

    if (allUsersData[userId] && allUsersData[userId].portfolio[symbol] && allUsersData[userId].portfolio[symbol] >= amount) {
        const totalRevenue = amount * currentPrice;
        allUsersData[userId].cash += totalRevenue;
        allUsersData[userId].portfolio[symbol] -= amount;

        if (allUsersData[userId].portfolio[symbol] < 0.001) {
            delete allUsersData[userId].portfolio[symbol];
        }
        saveAllUsersData();
        transactions.push({
            userId,
            type: 'sell',
            symbol,
            amount,
            price: currentPrice,
            timestamp: new Date().toISOString(),
            status: 'success'
        });
        saveTransactions();

        res.json({ success: true, cash: allUsersData[userId].cash, portfolio: allUsersData[userId].portfolio });
    } else {
        transactions.push({
            userId,
            type: 'sell',
            symbol,
            amount,
            price: currentPrice,
            timestamp: new Date().toISOString(),
            status: 'failed',
            reason: 'Insufficient stock or stock not held'
        });
        saveTransactions();
        res.status(400).json({ error: 'Insufficient stock or stock not held.' });
    }
});

app.post('/change_username', (req, res) => {
    const userId = getUserId(req);
    const { newUsername } = req.body;

    if (!userId) {
        return res.status(401).json({ error: 'Authentication required for this action.' });
    }
    if (!newUsername || typeof newUsername !== 'string' || newUsername.trim() === '') {
        return res.status(400).json({ error: 'Invalid new username provided.' });
    }

    const trimmedNewUsername = newUsername.trim();
    const normalizedNewUsername = trimmedNewUsername.toLowerCase();

    if (normalizedNewUsername === 'null' || normalizedNewUsername === 'undefined') {
        return res.status(400).json({ error: 'Username cannot be "null" or "undefined".' });
    }

    if (usernameMap[normalizedNewUsername] && usernameMap[normalizedNewUsername] !== userId) {
        return res.status(409).json({ error: 'This username is already taken. Please choose a different one.' });
    }

    if (!allUsersData[userId]) {
        return res.status(404).json({ error: 'User not found.' });
    }

    const oldUsername = allUsersData[userId].username;
    const normalizedOldUsername = oldUsername ? oldUsername.toLowerCase() : null;

    allUsersData[userId].username = trimmedNewUsername;

    if (normalizedOldUsername && usernameMap[normalizedOldUsername] === userId) {
        delete usernameMap[normalizedOldUsername];
    }
    usernameMap[normalizedNewUsername] = userId;

    saveAllUsersData();
    console.log(`User ${userId} changed username from "${oldUsername}" to "${trimmedNewUsername}"`);
    res.json({ success: true, message: `Username successfully changed to ${trimmedNewUsername}.` });
});

app.post('/api/reset-account', (req, res) => {
    const userId = getUserId(req);
    const { confirm } = req.body;

    if (!userId) {
        return res.status(401).json({ error: 'Authentication required for this action.' });
    }
    if (confirm !== true) {
        return res.status(400).json({ error: 'Confirmation required to reset account. Set confirm to true.' });
    }

    if (!allUsersData[userId]) {
        return res.status(404).json({ error: 'User not found.' });
    }

    const oldUsername = allUsersData[userId].username;
    const normalizedOldUsername = oldUsername ? oldUsername.toLowerCase() : null;

    allUsersData[userId] = {
        cash: 100000,
        portfolio: {},
        username: `User-${userId.substring(0, 4)}`
    };

    if (normalizedOldUsername && usernameMap[normalizedOldUsername] === userId) {
        delete usernameMap[normalizedOldUsername];
    }
    usernameMap[allUsersData[userId].username.toLowerCase()] = userId;

    limitOrders = limitOrders.filter(order => order.userId !== userId);
    saveLimitOrders();

    saveAllUsersData();
    console.log(`User ${userId} account reset. Old username: "${oldUsername}", New username: "${allUsersData[userId].username}"`);
    res.json({ success: true, message: 'Account has been reset to initial state.' });
});


app.get('/stock-data', async (req, res) => {
    const symbol = req.query.symbol || 'AAPL';
    const timeframe = req.query.timeframe || 'ALL';

    let range;
    let interval = '1d';

    switch (timeframe) {
        case '1D':
            range = '1d';
            interval = '1m';
            break;
        case '1W':
            range = '5d';
            interval = '30m';
            break;
        case '1M':
            range = '1mo';
            interval = '1d';
            break;
        case '3M':
            range = '3mo';
            interval = '1d';
            break;
        case '6M':
            range = '6mo';
            interval = '1d';
            break;
        case '1Y':
            range = '1y';
            interval = '1d';
            break;
        case '2Y':
            range = '2y';
            interval = '1wk';
            break;
        case '5Y':
            range = '5y';
            interval = '1wk';
            break;
        case '10Y':
            range = '10y';
            interval = '1mo';
            break;
        case 'YTD':
            range = 'ytd';
            interval = '1d';
            break;
        case 'MAX':
            range = 'max';
            interval = '3mo';
            break;
        case 'ALL':
            range = 'max';
            interval = '3mo';
            break;
        case 'live':
            range = '1d';
            interval = '1m';
            break;
        default:
            range = '1d';
            interval = '1d';
    }

    const yahooApiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?region=US&lang=en-US&includePrePost=false&interval=${interval}&range=${range}`;

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

        const chartResult = data.chart?.result?.[0];
        const meta = chartResult?.meta;
        const currentPrice = meta?.regularMarketPrice;
        const marketState = meta?.marketState;

        if (currentPrice !== undefined) {
            stockPricesCache[symbol] = { price: currentPrice, lastUpdated: Date.now() };
        }

        if (chartResult) {
            res.json({
                chart: data.chart,
                marketState: marketState
            });
        } else {
            res.status(404).json({ error: 'Stock not supported or invalid data format' });
        }
    } catch (error) {
        console.error('Error fetching stock data:', error);
        res.status(500).json({ error: error.message || 'Error fetching stock data' });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    const leaderboard = [];
    const symbolsToFetch = new Set();

    for (const userId in allUsersData) {
        for (const symbol in allUsersData[userId].portfolio) {
            symbolsToFetch.add(symbol);
        }
    }

    const fetchPromises = Array.from(symbolsToFetch).map(async (symbol) => {
        const yahooApiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?region=US&lang=en-US&includePrePost=false&interval=1m&range=1d`;
        try {
            const response = await fetch(yahooApiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (response.ok) {
                const data = await response.json();
                const currentPrice = data.chart?.result?.[0]?.meta?.regularMarketPrice;
                if (currentPrice !== undefined) {
                    stockPricesCache[symbol] = { price: currentPrice, lastUpdated: Date.now() };
                }
            } else {
                console.warn(`Failed to fetch fresh price for ${symbol} for leaderboard: HTTP status ${response.status}`);
            }
        } catch (error) {
            console.error(`Error fetching fresh price for ${symbol} for leaderboard:`, error);
        }
    });

    await Promise.all(fetchPromises);

    for (const userId in allUsersData) {
        const user = allUsersData[userId];
        let netWorth = user.cash;
        for (const symbol in user.portfolio) {
            const quantity = user.portfolio[symbol];
            const cachedPrice = stockPricesCache[symbol]?.price;
            if (cachedPrice !== undefined) {
                netWorth += quantity * cachedPrice;
            } else {
                console.warn(`Price for ${symbol} not found in cache for user ${user.username} (${userId}). Using 0 for calculation.`);
            }
        }
        leaderboard.push({ username: user.username, netWorth: netWorth });
    }

    leaderboard.sort((a, b) => b.netWorth - a.netWorth);

    res.json(leaderboard);
});


const checkLimitOrders = async () => {
    for (let i = limitOrders.length - 1; i >= 0; i--) {
        const order = limitOrders[i];
        const yahooApiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${order.symbol}?region=US&lang=en-US&includePrePost=false&interval=1m&range=1d`;
        try {
            const response = await fetch(yahooApiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            if (!response.ok) {
                console.warn(`Failed to fetch data for ${order.symbol}: HTTP status ${response.status}`);
                continue;
            }
            const data = await response.json();
            const currentPrice = data.chart?.result?.[0]?.meta?.regularMarketPrice;

            if (currentPrice !== undefined) {
                stockPricesCache[order.symbol] = { price: currentPrice, lastUpdated: Date.now() };
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
                            transactions.push({
                                userId: order.userId,
                                type: 'buyLimit',
                                symbol: order.symbol,
                                amount: order.amount,
                                price: currentPrice,
                                timestamp: new Date().toISOString(),
                                status: 'executed'
                            });
                        } else {
                            console.warn(`Limit buy order for ${order.symbol} at $${order.limitPrice} for user ${order.userId} failed due to insufficient cash.`);
                            transactions.push({
                                userId: order.userId,
                                type: 'buyLimit',
                                symbol: order.symbol,
                                amount: order.amount,
                                price: currentPrice,
                                timestamp: new Date().toISOString(),
                                status: 'failed',
                                reason: 'Insufficient cash on limit order execution'
                            });
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
                            transactions.push({
                                userId: order.userId,
                                type: 'sellLimit',
                                symbol: order.symbol,
                                amount: order.amount,
                                price: currentPrice,
                                timestamp: new Date().toISOString(),
                                status: 'executed'
                            });
                        } else {
                            console.warn(`Limit sell order for ${order.symbol} at $${order.limitPrice} for user ${order.userId} failed due to insufficient stock.`);
                            transactions.push({
                                userId: order.userId,
                                type: 'sellLimit',
                                symbol: order.symbol,
                                amount: order.amount,
                                price: currentPrice,
                                timestamp: new Date().toISOString(),
                                status: 'failed',
                                reason: 'Insufficient stock on limit order execution'
                            });
                        }
                    }
                    saveAllUsersData();
                    saveTransactions();
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

setInterval(() => {
    console.log('Running periodic data integrity check for all users...');
}, 300000);

app.post('/limit-buy', (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required for this action.' });
    }
    const { symbol, limitPrice, amount } = req.body;
    if (!symbol || !limitPrice || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'Missing required fields: symbol, limitPrice, or amount' });
    }
    limitOrders.push({ userId, type: 'buy', symbol, limitPrice, amount });
    saveLimitOrders();
    transactions.push({
        userId,
        type: 'buyLimitOrderPlaced',
        symbol,
        amount,
        limitPrice,
        timestamp: new Date().toISOString(),
        status: 'pending'
    });
    saveTransactions();
    res.json({ success: true, message: `Limit buy order added for ${symbol} for ${amount} shares at $${limitPrice}` });
});

app.post('/limit-sell', (req, res) => {
    const userId = getUserId(req);
    if (!userId) {
        return res.status(401).json({ error: 'Authentication required for this action.' });
    }
    const { symbol, limitPrice, amount } = req.body;
    if (!symbol || !limitPrice || typeof amount !== 'number' || amount <= 0) {
        return res.status(400).json({ error: 'Missing required fields: symbol, limitPrice, or amount' });
    }
    limitOrders.push({ userId, type: 'sell', symbol, limitPrice, amount });
    saveLimitOrders();
    transactions.push({
        userId,
        type: 'sellLimitOrderPlaced',
        symbol,
        amount,
        limitPrice,
        timestamp: new Date().toISOString(),
        status: 'pending'
    });
    saveTransactions();
    res.json({ success: true, message: `Limit sell order added for ${symbol} for ${amount} shares at $${limitPrice}` });
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
