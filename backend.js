const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { RegExpMatcher, englishDataset, englishRecommendedTransformers } = require('obscenity');
const crypto = require('crypto');

const app = express();
const port = process.env.PORT || 5001;

const NEWSAPI_API_KEY = 'ADD YOUR OWN API KEY HERE';
const ONE_MONTH_IN_MS = 30 * 24 * 60 * 60 * 1000;

app.use(express.json({ limit: '50mb' }));
app.use(cors());

const ordersFile = 'pendingOrders.json';
const usersDataFile = 'usersData.json';
const transactionsFile = 'transactionsFile.json';
const dailyNewUsersFile = 'dailyNewUsers.json';
const profilePicturesDir = 'profile_pictures';
const newsCacheFile = 'cachednews.json';

if (!fs.existsSync(profilePicturesDir)) {
    fs.mkdirSync(profilePicturesDir);
}

let allUsersData = {};
let usernameMap = {};
let stockPricesCache = {};
let transactions = [];
let pendingOrders = [];
let dailyNewUsersData = {};
let newsCache = {};

const profanityMatcher = new RegExpMatcher({
    ...englishDataset.build(),
                                           ...englishRecommendedTransformers,
});

const isProfane = (username) => {
    if (!username || typeof username !== 'string') {
        return false;
    }
    return profanityMatcher.hasMatch(username);
};

const loadDailyNewUsersData = () => {
    try {
        if (fs.existsSync(dailyNewUsersFile)) {
            const data = fs.readFileSync(dailyNewUsersFile, 'utf8');
            if (data) {
                const parsedData = JSON.parse(data);
                if (typeof parsedData === 'object' && parsedData !== null) {
                    dailyNewUsersData = parsedData;
                } else {
                    dailyNewUsersData = {};
                    saveDailyNewUsersData();
                }
            } else {
                dailyNewUsersData = {};
                saveDailyNewUsersData();
            }
        } else {
            dailyNewUsersData = {};
            saveDailyNewUsersData();
        }
    } catch (error) {
        dailyNewUsersData = {};
        saveDailyNewUsersData();
    }
};

const saveDailyNewUsersData = () => {
    try {
        fs.writeFileSync(dailyNewUsersFile, JSON.stringify(dailyNewUsersData, null, 2), 'utf8');
    } catch (error) {
    }
};

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
                        if (!user.portfolio) {
                            user.portfolio = {};
                        }
                        for (const symbol in user.portfolio) {
                            if (!Array.isArray(user.portfolio[symbol]) && typeof user.portfolio[symbol] === 'number') {
                                user.portfolio[symbol] = [{
                                    quantity: user.portfolio[symbol],
                                    purchasePrice: 0,
                                    purchaseDate: new Date().toISOString()
                                }];
                            } else if (!Array.isArray(user.portfolio[symbol])) {
                                user.portfolio[symbol] = [];
                            }
                        }
                    }
                } else {
                    allUsersData = {};
                    usernameMap = {};
                    saveAllUsersData();
                }
            } else {
                allUsersData = {};
                usernameMap = {};
                saveAllUsersData();
            }
        } else {
            allUsersData = {};
            usernameMap = {};
            saveAllUsersData();
        }
    } catch (error) {
        allUsersData = {};
        usernameMap = {};
        saveAllUsersData();
    }
};

const saveAllUsersData = () => {
    try {
        fs.writeFileSync(usersDataFile, JSON.stringify(allUsersData, null, 2), 'utf8');
    } catch (error) {
    }
};

const loadPendingOrders = () => {
    try {
        if (fs.existsSync(ordersFile)) {
            const data = fs.readFileSync(ordersFile, 'utf8');
            return JSON.parse(data);
        }
        return [];
    }
    catch (error) {
        return [];
    }
};

const savePendingOrders = () => {
    fs.writeFileSync(ordersFile, JSON.stringify(pendingOrders, null, 2), 'utf8');
};

const loadTransactions = () => {
    try {
        if (fs.existsSync(transactionsFile)) {
            const data = fs.readFileSync(transactionsFile, 'utf8');
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        return [];
    }
};

const saveTransactions = () => {
    try {
        fs.writeFileSync(transactionsFile, JSON.stringify(transactions, null, 2), 'utf8');
    } catch (error) {
    }
};

const loadNewsCache = () => {
    try {
        if (fs.existsSync(newsCacheFile)) {
            const data = fs.readFileSync(newsCacheFile, 'utf8');
            return JSON.parse(data);
        }
        return {};
    } catch (error) {
        return {};
    }
};

const saveNewsCache = () => {
    try {
        fs.writeFileSync(newsCacheFile, JSON.stringify(newsCache, null, 2), 'utf8');
    } catch (error) {
    }
};

loadAllUsersData();
pendingOrders = loadPendingOrders();
loadDailyNewUsersData();
transactions = loadTransactions();
newsCache = loadNewsCache();

for (const userId of Object.keys(allUsersData)) {
    const user = allUsersData[userId];
    if (user.username && isProfane(user.username)) {
        if (user.username) {
            delete usernameMap[user.username.toLowerCase()];
        }
        allUsersData[userId].username = null;
        saveAllUsersData();
    }
}

const calculateDailyNewUsers = () => {
    const newDailyData = {};
    for (const userId in allUsersData) {
        const user = allUsersData[userId];
        if (user.creationTimestamp) {
            const date = user.creationTimestamp.substring(0, 10);
            newDailyData[date] = (newDailyData[date] || 0) + 1;
        }
    }
    dailyNewUsersData = newDailyData;
    saveDailyNewUsersData();
};

calculateDailyNewUsers();

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

const fetchCurrentStockPrice = async (symbol) => {
    const yahooApiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?region=US&lang=en-US&includePrePost=false&interval=1m&range=1d`;
    try {
        const response = await fetch(yahooApiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
            },
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch current price for ${symbol}: HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        const data = await response.json();
        const currentPrice = data.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (currentPrice === undefined) {
            throw new Error(`Could not retrieve current price for ${symbol}. Data might be unavailable.`);
        }
        return currentPrice;
    } catch (error) {
        throw error;
    }
};

const fetchStockHistoricalData = async (symbol, range = '1d', interval = '1d') => {
    const yahooApiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?region=US&lang=en-US&includePrePost=false&interval=${interval}&range=${range}`;
    try {
        const response = await fetch(yahooApiUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
            },
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Failed to fetch historical data for ${symbol}: HTTP error! status: ${response.status}, message: ${errorText}`);
        }
        const data = await response.json();
        const chartResult = data.chart?.result?.[0];
        if (chartResult && chartResult.indicators && chartResult.indicators.quote && chartResult.indicators.quote[0].close) {
            const closes = chartResult.indicators.quote[0].close;
            const timestamps = chartResult.timestamp;
            const historicalData = timestamps.map((ts, index) => ({
                date: new Date(ts * 1000).toISOString().substring(0, 10),
                                                                  close: closes[index]
            }));
            return historicalData;
        }
        throw new Error(`Could not retrieve historical data for ${symbol}. Data might be unavailable.`);
    } catch (error) {
        throw error;
    }
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

    if (userName && isProfane(userName)) {
        if (allUsersData[userId]) {
            const oldUsername = allUsersData[userId].username;
            if (oldUsername) {
                delete usernameMap[oldUsername.toLowerCase()];
            }
            allUsersData[userId].username = null;
            saveAllUsersData();
        }
        return res.status(400).json({
            error: 'Username contains profane language. Please choose a different username.'
        });
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
        }
    } else {
        if (normalizedNewUserName && normalizedNewUserName !== null && usernameMap[normalizedNewUserName]) {
            return res.status(409).json({ error: 'Username already taken. Please choose a different one.' });
        }
        allUsersData[userId] = {
            cash: 100000,
            portfolio: {},
            username: userName || `User-${userId.substring(0, 4)}`,
        creationTimestamp: new Date().toISOString()
        };
        usernameMap[allUsersData[userId].username.toLowerCase()] = userId;
        saveAllUsersData();
        const today = new Date().toISOString().substring(0, 10);
        dailyNewUsersData[today] = (dailyNewUsersData[today] || 0) + 1;
        saveDailyNewUsersData();
    }
    res.json(allUsersData[userId]);
});

app.post('/api/buy-stock', async (req, res) => {
    const userId = getUserId(req);
    const { symbol, amount, orderType, price } = req.body;

    let isSuspicious = false;
    let suspicionReason = null;
    let currentPrice = 0;
    const usernameForLog = allUsersData[userId]?.username || 'Unknown User';

    if (!userId) {
        isSuspicious = true;
        suspicionReason = 'Authentication missing for buy request.';
        const logEntry = {
            userId, username: usernameForLog, type: 'buy', symbol, amount, price: currentPrice,
            timestamp: new Date().toISOString(), status: 'failed',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType || 'market'
        };
        transactions.push(logEntry);
        saveTransactions();
        return res.status(401).json({ error: 'Authentication required for this action.' });
    }
    if (typeof amount !== 'number' || amount <= 0) {
        isSuspicious = true;
        suspicionReason = 'Invalid or non-positive trade amount attempted.';
        const logEntry = {
            userId, username: usernameForLog, type: 'buy', symbol, amount, price: currentPrice,
            timestamp: new Date().toISOString(), status: 'failed',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType || 'market'
        };
        transactions.push(logEntry);
        saveTransactions();
        return res.status(400).json({ error: 'Invalid input for buying stock.' });
    }
    if (!symbol) {
        isSuspicious = true;
        suspicionReason = 'Missing stock symbol for trade.';
        const logEntry = {
            userId, username: usernameForLog, type: 'buy', symbol, amount, price: currentPrice,
            timestamp: new Date().toISOString(), status: 'failed',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType || 'market'
        };
        transactions.push(logEntry);
        saveTransactions();
        return res.status(400).json({ error: 'Stock symbol is required.' });
    }

    try {
        currentPrice = await fetchCurrentStockPrice(symbol);
        if (currentPrice <= 0) {
            isSuspicious = true;
            suspicionReason = 'Attempted trade on stock with non-positive real-time price.';
            const logEntry = {
                userId, username: usernameForLog, type: 'buy', symbol, amount, price: currentPrice,
                timestamp: new Date().toISOString(), status: 'failed',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType || 'market'
            };
            transactions.push(logEntry);
            saveTransactions();
            return res.status(400).json({ error: 'Cannot buy stock: current price is not positive.' });
        }

        if (orderType === 'limit' || orderType === 'stop') {
            if (typeof price !== 'number' || price <= 0) {
                isSuspicious = true;
                suspicionReason = `Invalid ${orderType} price provided.`;
                const logEntry = {
                    userId, username: usernameForLog, type: `buy${orderType.charAt(0).toUpperCase() + orderType.slice(1)}`, symbol, amount, price: price,
         timestamp: new Date().toISOString(), status: 'failed',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType
                };
                transactions.push(logEntry);
                saveTransactions();
                return res.status(400).json({ error: `Invalid ${orderType} price.` });
            }

            const estimatedCost = amount * price;
            if (allUsersData[userId] && allUsersData[userId].cash < estimatedCost) {
                isSuspicious = true;
                suspicionReason = `Insufficient cash to place ${orderType} buy order.`;
                const logEntry = {
                    userId, username: usernameForLog, type: `buy${orderType.charAt(0).toUpperCase() + orderType.slice(1)}`, symbol, amount, price: price,
         timestamp: new Date().toISOString(), status: 'failed',
         reason: 'Insufficient cash to place order',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType
                };
                transactions.push(logEntry);
                saveTransactions();
                return res.status(400).json({ error: `Insufficient cash to place ${orderType} buy order.` });
            }

            const orderId = crypto.randomUUID();
            pendingOrders.push({ orderId, userId, type: 'buy', symbol, triggerPrice: price, amount, orderType: orderType });
            savePendingOrders();
            const logEntry = {
                userId, username: usernameForLog, type: `buy${orderType.charAt(0).toUpperCase() + orderType.slice(1)}OrderPlaced`,
         symbol, amount, price: price, timestamp: new Date().toISOString(), status: 'pending', orderId: orderId,
         isSuspicious: false, suspicionReason: null, orderType: orderType
            };
            transactions.push(logEntry);
            saveTransactions();
            res.json({ success: true, message: `Limit buy order added for ${symbol} for ${amount} shares at $${price}`, orderId: orderId });
        } else {
            const totalCost = amount * currentPrice;

            if (allUsersData[userId] && allUsersData[userId].cash >= totalCost) {
                allUsersData[userId].cash -= totalCost;
                if (!allUsersData[userId].portfolio[symbol]) {
                    allUsersData[userId].portfolio[symbol] = [];
                }
                allUsersData[userId].portfolio[symbol].push({
                    quantity: amount,
                    purchasePrice: currentPrice,
                    purchaseDate: new Date().toISOString()
                });

                saveAllUsersData();
                const logEntry = {
                    userId, username: usernameForLog, type: 'buyMarket', symbol, amount, price: currentPrice,
                    timestamp: new Date().toISOString(), status: 'success',
         isSuspicious: false, suspicionReason: null, orderType: 'market'
                };
                transactions.push(logEntry);
                saveTransactions();
                res.json({ success: true, cash: allUsersData[userId].cash, portfolio: allUsersData[userId].portfolio });
            } else {
                isSuspicious = true;
                suspicionReason = 'Market buy trade failed due to insufficient cash.';
                const logEntry = {
                    userId, username: usernameForLog, type: 'buyMarket', symbol, amount, price: currentPrice,
                    timestamp: new Date().toISOString(), status: 'failed',
         reason: 'Insufficient cash',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: 'market'
                };
                transactions.push(logEntry);
                saveTransactions();
                res.status(400).json({ error: 'Insufficient cash.' });
            }
        }
    } catch (error) {
        isSuspicious = true;
        suspicionReason = `Backend error fetching price or processing trade: ${error.message}`;
        const logEntry = {
            userId, username: usernameForLog, type: 'buy', symbol, amount, price: currentPrice,
            timestamp: new Date().toISOString(), status: 'failed',
         reason: error.message,
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType || 'market'
        };
        transactions.push(logEntry);
        saveTransactions();
        res.status(500).json({ error: error.message || 'Error processing buy request.' });
    }
});

app.post('/api/sell-stock', async (req, res) => {
    const userId = getUserId(req);
    const { symbol, amount, orderType, price } = req.body;

    let isSuspicious = false;
    let suspicionReason = null;
    let currentPrice = 0;
    const usernameForLog = allUsersData[userId]?.username || 'Unknown User';

    if (!userId) {
        isSuspicious = true;
        suspicionReason = 'Authentication missing for sell request.';
        const logEntry = {
            userId, username: usernameForLog, type: 'sell', symbol, amount, price: currentPrice,
            timestamp: new Date().toISOString(), status: 'failed',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType || 'market'
        };
        transactions.push(logEntry);
        saveTransactions();
        return res.status(401).json({ error: 'Authentication required for this action.' });
    }
    if (typeof amount !== 'number' || amount <= 0) {
        isSuspicious = true;
        suspicionReason = 'Invalid or non-positive trade amount attempted.';
        const logEntry = {
            userId, username: usernameForLog, type: 'sell', symbol, amount, price: currentPrice,
            timestamp: new Date().toISOString(), status: 'failed',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType || 'market'
        };
        transactions.push(logEntry);
        saveTransactions();
        return res.status(400).json({ error: 'Invalid input for selling stock.' });
    }
    if (!symbol) {
        isSuspicious = true;
        suspicionReason = 'Missing stock symbol for trade.';
        const logEntry = {
            userId, username: usernameForLog, type: 'sell', symbol, amount, price: currentPrice,
            timestamp: new Date().toISOString(), status: 'failed',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType || 'market'
        };
        transactions.push(logEntry);
        saveTransactions();
        return res.status(400).json({ error: 'Stock symbol is required.' });
    }

    try {
        currentPrice = await fetchCurrentStockPrice(symbol);
        if (currentPrice <= 0) {
            isSuspicious = true;
            suspicionReason = 'Attempted trade on stock with non-positive real-time price.';
            const logEntry = {
                userId, username: usernameForLog, type: 'sell', symbol, amount, price: currentPrice,
                timestamp: new Date().toISOString(), status: 'failed',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType || 'market'
            };
            transactions.push(logEntry);
            saveTransactions();
            return res.status(400).json({ error: 'Cannot sell stock: current price is not positive.' });
        }

        if (orderType === 'limit' || orderType === 'stop') {
            if (typeof price !== 'number' || price <= 0) {
                isSuspicious = true;
                suspicionReason = `Invalid ${orderType} price provided.`;
                const logEntry = {
                    userId, username: usernameForLog, type: `sell${orderType.charAt(0).toUpperCase() + orderType.slice(1)}`, symbol, amount, price: price,
         timestamp: new Date().toISOString(), status: 'failed',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType
                };
                transactions.push(logEntry);
                saveTransactions();
                return res.status(400).json({ error: `Invalid ${orderType} price.` });
            }

            const totalHeldQuantity = allUsersData[userId]?.portfolio[symbol]?.reduce((sum, p) => sum + p.quantity, 0) || 0;
            if (!allUsersData[userId] || totalHeldQuantity < amount) {
                isSuspicious = true;
                suspicionReason = `Insufficient stock to place ${orderType} sell order.`;
                const logEntry = {
                    userId, username: usernameForLog, type: `sell${orderType.charAt(0).toUpperCase() + orderType.slice(1)}`, symbol, amount, price: price,
         timestamp: new Date().toISOString(), status: 'failed',
         reason: 'Insufficient stock to place order',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType
                };
                transactions.push(logEntry);
                saveTransactions();
                return res.status(400).json({ error: `Insufficient stock to place ${orderType} sell order.` });
            }

            const orderId = crypto.randomUUID();
            pendingOrders.push({ orderId, userId, type: 'sell', symbol, triggerPrice: price, amount, orderType: orderType });
            savePendingOrders();
            const logEntry = {
                userId, username: usernameForLog, type: `sell${orderType.charAt(0).toUpperCase() + orderType.slice(1)}OrderPlaced`,
         symbol, amount, price: price, timestamp: new Date().toISOString(), status: 'pending', orderId: orderId,
         isSuspicious: false, suspicionReason: null, orderType: orderType
            };
            transactions.push(logEntry);
            saveTransactions();
            res.json({ success: true, message: `Limit sell order added for ${symbol} for ${amount} shares at $${price}`, orderId: orderId });
        } else {
            let remainingAmountToSell = amount;
            let totalRevenue = 0;
            const userPortfolio = allUsersData[userId]?.portfolio[symbol];

            if (!userPortfolio || userPortfolio.reduce((sum, p) => sum + p.quantity, 0) < amount) {
                isSuspicious = true;
                suspicionReason = 'Market sell trade failed due to insufficient stock or stock not held.';
                const logEntry = {
                    userId, username: usernameForLog, type: 'sellMarket', symbol, amount, price: currentPrice,
                    timestamp: new Date().toISOString(), status: 'failed',
         reason: 'Insufficient stock or stock not held',
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: 'market'
                };
                transactions.push(logEntry);
                saveTransactions();
                return res.status(400).json({ error: 'Insufficient stock or stock not held.' });
            }

            while (remainingAmountToSell > 0 && userPortfolio.length > 0) {
                const oldestPurchase = userPortfolio[0];
                const sellQuantity = Math.min(remainingAmountToSell, oldestPurchase.quantity);
                totalRevenue += sellQuantity * currentPrice;
                oldestPurchase.quantity -= sellQuantity;
                remainingAmountToSell -= sellQuantity;

                if (oldestPurchase.quantity === 0) {
                    userPortfolio.shift();
                }
            }

            allUsersData[userId].cash += totalRevenue;
            if (userPortfolio.length === 0) {
                delete allUsersData[userId].portfolio[symbol];
            }
            saveAllUsersData();
            const logEntry = {
                userId, username: usernameForLog, type: 'sellMarket', symbol, amount, price: currentPrice,
                timestamp: new Date().toISOString(), status: 'success',
         isSuspicious: false, suspicionReason: null, orderType: 'market'
            };
            transactions.push(logEntry);
            saveTransactions();
            res.json({ success: true, cash: allUsersData[userId].cash, portfolio: allUsersData[userId].portfolio });
        }
    } catch (error) {
        isSuspicious = true;
        suspicionReason = `Backend error fetching price or processing trade: ${error.message}`;
        const logEntry = {
            userId, username: usernameForLog, type: 'sell', symbol, amount, price: currentPrice,
            timestamp: new Date().toISOString(), status: 'failed',
         reason: error.message,
         isSuspicious: isSuspicious, suspicionReason: suspicionReason, orderType: orderType || 'market'
        };
        transactions.push(logEntry);
        saveTransactions();
        res.status(500).json({ error: error.message || 'Error processing sell request.' });
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

    if (isProfane(trimmedNewUsername)) {
        if (allUsersData[userId]) {
            const oldUsername = allUsersData[userId].username;
            if (oldUsername) {
                delete usernameMap[oldUsername.toLowerCase()];
            }
            allUsersData[userId].username = null;
            saveAllUsersData();
        }
        return res.status(400).json({
            error: 'New username contains profane language. Please choose a different username.'
        });
    }

    if (usernameMap[normalizedNewUsername] && usernameMap[normalizedNewUserName] !== userId) {
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

    pendingOrders = pendingOrders.filter(order => order.userId !== userId);
    savePendingOrders();

    saveAllUsersData();
    res.json({ success: true, message: 'Account has been reset to initial state.' });
});

app.get('/stock-data', async (req, res) => {
    const symbol = req.query.symbol;
    const timeframe = req.query.timeframe || 'ALL';

    if (!symbol) {
        return res.status(400).json({ error: 'Stock symbol is required.' });
    }

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
            const errorText = await response.text();
            if (response.status === 404) {
                return res.status(404).json({ error: `Stock symbol '${symbol}' not found or invalid.` });
            }
            throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
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
            res.status(404).json({ error: `Could not retrieve data for stock symbol '${symbol}'. It might be invalid or not supported.` });
        }
    } catch (error) {
        res.status(500).json({ error: error.message || 'Error fetching stock data' });
    }
});

app.get('/api/leaderboard', async (req, res) => {
    const leaderboard = [];
    const symbolsToFetch = new Set();

    for (const userId in allUsersData) {
        if (allUsersData[userId].username) {
            for (const symbol in allUsersData[userId].portfolio) {
                const totalQuantity = allUsersData[userId].portfolio[symbol].reduce((sum, p) => sum + p.quantity, 0);
                if (totalQuantity > 0) {
                    symbolsToFetch.add(symbol);
                }
            }
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
            }
        } catch (error) {
        }
    });

    await Promise.all(fetchPromises);

    for (const userId in allUsersData) {
        const user = allUsersData[userId];
        if (user.username && !isProfane(user.username)) {
            let netWorth = user.cash;
            for (const symbol in user.portfolio) {
                const stockPurchases = user.portfolio[symbol];
                const totalQuantity = stockPurchases.reduce((sum, p) => sum + p.quantity, 0);

                if (totalQuantity > 0) {
                    const cachedPrice = stockPricesCache[symbol]?.price;
                    if (cachedPrice !== undefined) {
                        netWorth += totalQuantity * cachedPrice;
                    } else {
                    }
                }
            }

            let profilePictureBase64 = null;
            let profilePictureMimeType = null;
            if (user.profilePicturePath && fs.existsSync(user.profilePicturePath)) {
                try {
                    const fileContent = fs.readFileSync(user.profilePicturePath);
                    profilePictureBase64 = fileContent.toString('base64');
                    const ext = path.extname(user.profilePicturePath).toLowerCase();
                    if (ext === '.png') {
                        profilePictureMimeType = 'image/png';
                    } else if (ext === '.jpg' || ext === '.jpeg') {
                        profilePictureMimeType = 'image/jpeg';
                    } else if (ext === '.gif') {
                        profilePictureMimeType = 'image/gif';
                    } else {
                        profilePictureMimeType = 'application/octet-stream';
                    }
                } catch (error) {
                }
            }

            leaderboard.push({
                username: user.username,
                netWorth: netWorth,
                profilePicture: profilePictureBase64 ? `data:${profilePictureMimeType};base64,${profilePictureBase64}` : null
            });
        }
    }

    leaderboard.sort((a, b) => b.netWorth - a.netWorth);

    res.json(leaderboard);
});

const checkPendingOrders = async () => {
    for (let i = pendingOrders.length - 1; i >= 0; i--) {
        const order = pendingOrders[i];
        let isSuspicious = false;
        let suspicionReason = null;
        let currentPrice = 0;
        const usernameForLog = allUsersData[order.userId]?.username || 'Unknown User';

        try {
            currentPrice = await fetchCurrentStockPrice(order.symbol);

            if (currentPrice !== undefined) {
                stockPricesCache[order.symbol] = { price: currentPrice, lastUpdated: Date.now() };
                if (!allUsersData[order.userId]) {
                    isSuspicious = true;
                    suspicionReason = 'User data not found for pending order execution.';
                    const logEntry = {
                        userId: order.userId, username: usernameForLog,
                        type: `${order.type}${order.orderType.charAt(0).toUpperCase() + order.orderType.slice(1)}`,
                        symbol: order.symbol,
                        amount: order.amount,
                        price: order.triggerPrice,
                        timestamp: new Date().toISOString(),
                        status: 'failed',
                        reason: 'User data not found',
                        isSuspicious: isSuspicious,
                        suspicionReason: suspicionReason,
                        orderType: order.orderType,
                        orderId: order.orderId
                    };
                    transactions.push(logEntry);
                    saveTransactions();
                    pendingOrders.splice(i, 1);
                    savePendingOrders();
                    continue;
                }

                const userCurrentData = allUsersData[order.userId];
                let shouldExecute = false;

                if (order.type === 'buy') {
                    if (order.orderType === 'limit' && currentPrice <= order.triggerPrice) {
                        shouldExecute = true;
                    } else if (order.orderType === 'stop' && currentPrice >= order.triggerPrice) {
                        shouldExecute = true;
                    }
                } else if (order.type === 'sell') {
                    if (order.orderType === 'limit' && currentPrice >= order.triggerPrice) {
                        shouldExecute = true;
                    } else if (order.orderType === 'stop' && currentPrice <= order.triggerPrice) {
                        shouldExecute = true;
                    }
                }

                if (shouldExecute) {
                    if (order.type === 'buy') {
                        const totalCost = order.amount * currentPrice;
                        if (userCurrentData.cash >= totalCost) {
                            userCurrentData.cash -= totalCost;
                            if (!userCurrentData.portfolio[order.symbol]) {
                                userCurrentData.portfolio[order.symbol] = [];
                            }
                            userCurrentData.portfolio[order.symbol].push({
                                quantity: order.amount,
                                purchasePrice: currentPrice,
                                purchaseDate: new Date().toISOString()
                            });
                            const logEntry = {
                                userId: order.userId, username: usernameForLog,
                                type: `buy${order.orderType.charAt(0).toUpperCase() + order.orderType.slice(1)}`,
                                symbol: order.symbol,
                                amount: order.amount,
                                price: currentPrice,
                                timestamp: new Date().toISOString(),
                                status: 'executed',
                                isSuspicious: false,
                                suspicionReason: null,
                                orderType: order.orderType,
                                orderId: order.orderId
                            };
                            transactions.push(logEntry);
                        } else {
                            isSuspicious = true;
                            suspicionReason = `${order.orderType} buy order failed due to insufficient cash.`;
                            const logEntry = {
                                userId: order.userId, username: usernameForLog,
                                type: `buy${order.orderType.charAt(0).toUpperCase() + order.orderType.slice(1)}`,
                                symbol: order.symbol,
                                amount: order.amount,
                                price: currentPrice,
                                timestamp: new Date().toISOString(),
                                status: 'failed',
                                reason: 'Insufficient cash on order execution',
                                isSuspicious: isSuspicious,
                                suspicionReason: suspicionReason,
                                orderType: order.orderType,
                                orderId: order.orderId
                            };
                            transactions.push(logEntry);
                        }
                    } else if (order.type === 'sell') {
                        let remainingAmountToSell = order.amount;
                        let totalRevenue = 0;
                        const userPortfolio = userCurrentData.portfolio[order.symbol];

                        if (!userPortfolio || userPortfolio.reduce((sum, p) => sum + p.quantity, 0) < order.amount) {
                            isSuspicious = true;
                            suspicionReason = `${order.orderType} sell order failed due to insufficient stock.`;
                            const logEntry = {
                                userId: order.userId, username: usernameForLog,
                                type: `sell${order.orderType.charAt(0).toUpperCase() + order.orderType.slice(1)}`,
                                symbol: order.symbol,
                                amount: order.amount,
                                price: currentPrice,
                                timestamp: new Date().toISOString(),
                                status: 'failed',
                                reason: 'Insufficient stock on order execution',
                                isSuspicious: isSuspicious,
                                suspicionReason: suspicionReason,
                                orderType: order.orderType,
                                orderId: order.orderId
                            };
                            transactions.push(logEntry);
                        } else {
                            while (remainingAmountToSell > 0 && userPortfolio.length > 0) {
                                const oldestPurchase = userPortfolio[0];
                                const sellQuantity = Math.min(remainingAmountToSell, oldestPurchase.quantity);
                                totalRevenue += sellQuantity * currentPrice;
                                oldestPurchase.quantity -= sellQuantity;
                                remainingAmountToSell -= sellQuantity;

                                if (oldestPurchase.quantity === 0) {
                                    userPortfolio.shift();
                                }
                            }
                            userCurrentData.cash += totalRevenue;
                            if (userPortfolio.length === 0) {
                                delete userCurrentData.portfolio[order.symbol];
                            }
                            const logEntry = {
                                userId: order.userId, username: usernameForLog,
                                type: `sell${order.orderType.charAt(0).toUpperCase() + order.orderType.slice(1)}`,
                                symbol: order.symbol,
                                amount: order.amount,
                                price: currentPrice,
                                timestamp: new Date().toISOString(),
                                status: 'executed',
                                isSuspicious: false,
                                suspicionReason: null,
                                orderType: order.orderType,
                                orderId: order.orderId
                            };
                            transactions.push(logEntry);
                        }
                    }
                    saveAllUsersData();
                    saveTransactions();
                    pendingOrders.splice(i, 1);
                    savePendingOrders();
                }
            } else {
                isSuspicious = true;
                suspicionReason = 'Failed to fetch current price for pending order execution.';
                const logEntry = {
                    userId: order.userId, username: usernameForLog,
                    type: `${order.type}${order.orderType.charAt(0).toUpperCase() + order.orderType.slice(1)}`,
                    symbol: order.symbol,
                    amount: order.amount,
                    price: order.triggerPrice,
                    timestamp: new Date().toISOString(),
                    status: 'failed',
                    reason: 'Could not fetch current price for order execution.',
                    isSuspicious: isSuspicious,
                    suspicionReason: suspicionReason,
                    orderType: order.orderType,
                    orderId: order.orderId
                };
                transactions.push(logEntry);
                saveTransactions();
            }
        } catch (error) {
            isSuspicious = true;
            suspicionReason = `Backend error during pending order check: ${error.message}`;
            const logEntry = {
                userId: order.userId, username: usernameForLog,
                type: `${order.type}${order.orderType.charAt(0).toUpperCase() + order.orderType.slice(1)}`,
                symbol: order.symbol,
                amount: order.amount,
                price: order.triggerPrice,
                timestamp: new Date().toISOString(),
                status: 'failed',
                reason: `Error during order check: ${error.message}`,
                isSuspicious: isSuspicious,
                suspicionReason: suspicionReason,
                orderType: order.orderType,
                orderId: order.orderId
            };
            transactions.push(logEntry);
            saveTransactions();
        }
    }
};

setInterval(checkPendingOrders, 10000);

setInterval(() => {
}, 300000);

app.post('/api/upload-profile-picture', async (req, res) => {
    const userId = getUserId(req);
    const { profilePicture } = req.body;

    if (!userId) {
        return res.status(401).json({ error: 'Authentication required for this action.' });
    }
    if (!allUsersData[userId]) {
        return res.status(404).json({ error: 'User not found.' });
    }
    if (!profilePicture || typeof profilePicture !== 'string') {
        return res.status(400).json({ error: 'Invalid profile picture data provided.' });
    }

    const base64Prefix = 'data:image/';
    if (!profilePicture.startsWith(base64Prefix)) {
        return res.status(400).json({ error: 'Invalid Base64 image format. Must start with "data:image/..."' });
    }

    const parts = profilePicture.split(';base64,');
    if (parts.length !== 2) {
        return res.status(400).json({ error: 'Invalid Base64 image format.' });
    }
    const mimeType = parts[0].substring(base64Prefix.length, parts[0].length);
    const base64Data = parts[1];

    const maxBase64Length = 6.7 * 1024 * 1024;
    if (base64Data.length > maxBase64Length) {
        return res.status(400).json({ error: 'Profile picture size exceeds 5MB limit.' });
    }

    let fileExtension = 'png';
    if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
        fileExtension = 'jpeg';
    } else if (mimeType.includes('gif')) {
        fileExtension = 'gif';
    }

    const filename = `${userId}.${fileExtension}`;
    const filePath = path.join(profilePicturesDir, filename);

    try {
        fs.writeFileSync(filePath, base64Data, { encoding: 'base64' });
        allUsersData[userId].profilePicturePath = filePath;
        saveAllUsersData();
        res.json({ message: 'Profile picture updated successfully!', filePath: filePath });
    } catch (error) {
        res.status(500).json({ error: 'Failed to save profile picture.', details: error.message });
    }
});

app.get('/api/pending-orders/:userId', (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
    }

    const userPendingOrders = pendingOrders.filter(order => order.userId === userId);

    if (userPendingOrders.length === 0) {
        return res.status(404).json({ message: 'No pending orders found for this user.' });
    }

    res.json(userPendingOrders);
});

app.delete('/api/cancel-order/:userId/:orderId', (req, res) => {
    const { userId, orderId } = req.params;
    const usernameForLog = allUsersData[userId]?.username || 'Unknown User';

    if (!userId || !orderId) {
        return res.status(400).json({ error: 'User ID and Order ID are required for cancellation.' });
    }

    const initialLength = pendingOrders.length;
    pendingOrders = pendingOrders.filter(order => !(order.userId === userId && order.orderId === orderId));

    if (pendingOrders.length < initialLength) {
        savePendingOrders();
        const logEntry = {
            userId, username: usernameForLog, type: 'orderCancelled', orderId,
            timestamp: new Date().toISOString(), status: 'success',
           isSuspicious: false, suspicionReason: null
        };
        transactions.push(logEntry);
        saveTransactions();
        res.json({ success: true, message: `Order ${orderId} for user ${userId} cancelled successfully.` });
    } else {
        const logEntry = {
            userId, username: usernameForLog, type: 'orderCancellationAttempt', orderId,
            timestamp: new Date().toISOString(), status: 'failed',
           reason: 'Order not found or already executed/cancelled',
           isSuspicious: false, suspicionReason: null
        };
        transactions.push(logEntry);
        saveTransactions();
        res.status(404).json({ error: 'Order not found or already executed/cancelled.' });
    }
});

app.get('/api/portfolio-performance/:userId', async (req, res) => {
    const { userId } = req.params;

    if (!userId) {
        return res.status(400).json({ error: 'User ID is required.' });
    }
    if (!allUsersData[userId]) {
        return res.status(404).json({ error: 'User not found.' });
    }

    const user = allUsersData[userId];
    const portfolioDetails = [];
    let totalPortfolioValue = user.cash;
    let overallTotalInvested = 0;
    let overallDailyGainLoss = 0;

    const symbolsInPortfolio = Object.keys(user.portfolio);
    const fetchPromises = symbolsInPortfolio.map(async (symbol) => {
        try {
            const currentPrice = await fetchCurrentStockPrice(symbol);
            const historicalData = await fetchStockHistoricalData(symbol, '2d', '1d');
            const previousClosePrice = historicalData.length >= 2 ? historicalData[historicalData.length - 2].close : null;

            const stockPurchases = user.portfolio[symbol] || [];
            let totalQuantity = 0;
            let totalPurchaseCost = 0;

            stockPurchases.forEach(p => {
                totalQuantity += p.quantity;
                totalPurchaseCost += p.quantity * p.purchasePrice;
            });

            const averagePurchasePrice = totalQuantity > 0 ? totalPurchaseCost / totalQuantity : 0;
            const stockCurrentValue = totalQuantity * currentPrice;
            const stockTotalGainLoss = (currentPrice - averagePurchasePrice) * totalQuantity;
            const stockPercentageChange = (totalQuantity > 0 && averagePurchasePrice > 0) ? (stockTotalGainLoss / (averagePurchasePrice * totalQuantity)) * 100 : 0;

            let stockDailyGainLoss = 0;
            if (previousClosePrice !== null && previousClosePrice > 0) {
                stockDailyGainLoss = (currentPrice - previousClosePrice) * totalQuantity;
            } else {
            }

            totalPortfolioValue += stockCurrentValue;
            overallTotalInvested += totalPurchaseCost;
            overallDailyGainLoss += stockDailyGainLoss;

            portfolioDetails.push({
                symbol: symbol,
                totalQuantity: totalQuantity,
                averagePurchasePrice: parseFloat(averagePurchasePrice.toFixed(2)),
                                  currentPrice: parseFloat(currentPrice.toFixed(2)),
                                  previousClosePrice: previousClosePrice !== null ? parseFloat(previousClosePrice.toFixed(2)) : null,
                                  currentValue: parseFloat(stockCurrentValue.toFixed(2)),
                                  totalGainLoss: parseFloat(stockTotalGainLoss.toFixed(2)),
                                  percentageChange: parseFloat(stockPercentageChange.toFixed(2)),
                                  dailyGainLoss: parseFloat(stockDailyGainLoss.toFixed(2))
            });

        } catch (error) {
            portfolioDetails.push({
                symbol: symbol,
                error: error.message,
                totalQuantity: user.portfolio[symbol].reduce((sum, p) => sum + p.quantity, 0),
                                  currentValue: 0,
                                  totalGainLoss: 0,
                                  percentageChange: 0,
                                  dailyGainLoss: 0
            });
        }
    });

    await Promise.all(fetchPromises);

    const overallTotalGainLoss = totalPortfolioValue - (user.cash + overallTotalInvested);
    const overallPercentageChange = (overallTotalInvested > 0) ? (overallTotalGainLoss / overallTotalInvested) * 100 : 0;

    res.json({
        cash: parseFloat(user.cash.toFixed(2)),
             totalPortfolioValue: parseFloat(totalPortfolioValue.toFixed(2)),
             overallTotalGainLoss: parseFloat(overallTotalGainLoss.toFixed(2)),
             overallPercentageChange: parseFloat(overallPercentageChange.toFixed(2)),
             overallDailyGainLoss: parseFloat(overallDailyGainLoss.toFixed(2)),
             portfolioDetails: portfolioDetails
    });
});

app.post('/api/news-feed', async (req, res) => {
    const { symbols } = req.body;

    if (!symbols || !Array.isArray(symbols) || symbols.length === 0) {
        return res.status(400).json({ error: 'No symbols provided for news feed.' });
    }

    const allNewsArticles = [];
    const now = Date.now();
    const thirtyDaysAgo = new Date(now - ONE_MONTH_IN_MS).toISOString().split('T')[0];
    const requestedSymbolsSet = new Set(symbols.map(s => s.toUpperCase()));

    for (const symbol of symbols) {
        const upperSymbol = symbol.toUpperCase();

        if (newsCache[upperSymbol] && (now - newsCache[upperSymbol].timestamp < ONE_MONTH_IN_MS)) {
            allNewsArticles.push(...newsCache[upperSymbol].articles);
            continue;
        }

        const newsApiUrl = `https://newsapi.org/v2/everything?q=${upperSymbol}&language=en&sortBy=relevancy&from=${thirtyDaysAgo}&apiKey=${NEWSAPI_API_KEY}`;
        try {
            const response = await fetch(newsApiUrl);
            if (!response.ok) {
                const errorText = await response.text();
                console.error(`NewsAPI.org error for ${upperSymbol}: ${response.status}. Message: ${errorText}`);
                continue;
            }
            const data = await response.json();
            if (data.articles) {
                const fetchedArticles = data.articles.slice(0, 3).map(article => ({
                    title: article.title,
                    source: article.source.name,
                    url: article.url,
                    publishedAt: article.publishedAt,
                    summary: article.description || article.content
                }));

                newsCache[upperSymbol] = { articles: fetchedArticles, timestamp: now };

                for (const article of fetchedArticles) {
                    const articleTitle = article.title.toUpperCase();
                    for (const otherSymbol of requestedSymbolsSet) {
                        if (otherSymbol === upperSymbol) {
                            continue;
                        }

                        const regex = new RegExp(`\\b${otherSymbol}\\b`, 'i');
                        if (regex.test(articleTitle)) {
                            if (!newsCache[otherSymbol]) {
                                newsCache[otherSymbol] = { articles: [], timestamp: now };
                            }
                            const isArticleAlreadyCached = newsCache[otherSymbol].articles.some(
                                cachedArticle => cachedArticle.url === article.url
                            );
                            if (!isArticleAlreadyCached) {
                                newsCache[otherSymbol].articles.push(article);
                                newsCache[otherSymbol].timestamp = now;
                            }
                        }
                    }
                }
                saveNewsCache();
                allNewsArticles.push(...fetchedArticles);
            }
        } catch (error) {
            console.error(`Failed to fetch news for ${upperSymbol} due to network error:`, error);
            continue;
        }
    }

    allNewsArticles.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    res.json(allNewsArticles);
});

app.get('/daily-new-users', (req, res) => {
    res.json(dailyNewUsersData);
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
