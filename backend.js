const dotenv = require('dotenv');
dotenv.config();
const express = require('express');
const fetch = require('node-fetch');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // Import crypto module for checksum

const app = express();
const port = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const ordersFile = 'limitOrders.json';
const usersDataFile = 'usersData.json';

let allUsersData = {};
let usernameMap = {}; // Map to store username -> userId for quick lookup and uniqueness check
let stockPricesCache = {};

// Function to calculate SHA256 checksum of user's financial data
const calculateChecksum = (userData) => {
    // Only include financial data in the checksum to prevent issues with other properties
    const dataToHash = {
        cash: userData.cash,
        portfolio: userData.portfolio
    };
    return crypto.createHash('sha256').update(JSON.stringify(dataToHash)).digest('hex');
};

const loadAllUsersData = () => {
    try {
        if (fs.existsSync(usersDataFile)) {
            const data = fs.readFileSync(usersDataFile, 'utf8');
            if (data) {
                const parsedData = JSON.parse(data);
                if (typeof parsedData === 'object' && parsedData !== null) {
                    allUsersData = parsedData;
                    // Rebuild usernameMap and ensure checksums exist for all users
                    usernameMap = {};
                    for (const userId in allUsersData) {
                        const user = allUsersData[userId];
                        if (user.username) {
                            usernameMap[user.username.toLowerCase()] = userId;
                        }
                        // Add checksum if missing (for existing data from previous versions)
                        if (!user.checksum) {
                            user.checksum = calculateChecksum(user);
                        }
                    }
                    console.log('All users data loaded successfully.');
                } else {
                    console.warn('usersData.json has an invalid format. Initializing with empty object.');
                    allUsersData = {};
                    usernameMap = {};
                    saveAllUsersData(); // Save empty data
                }
            } else {
                console.log('usersData.json not found. Creating with empty object.');
                allUsersData = {};
                usernameMap = {};
                saveAllUsersData(); // Save empty data
            }
        } else {
            console.log('usersData.json not found. Creating with empty object.');
            allUsersData = {};
            usernameMap = {};
            saveAllUsersData(); // Save empty data
        }
    } catch (error) {
        console.error('Error loading all user data:', error);
        console.warn('Initializing all user data with empty object due to error.');
        allUsersData = {};
        usernameMap = {};
        saveAllUsersData(); // Save empty data
    }
};

const saveAllUsersData = () => {
    try {
        // Recalculate checksums before saving to ensure consistency
        for (const userId in allUsersData) {
            allUsersData[userId].checksum = calculateChecksum(allUsersData[userId]);
        }
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

const getUserName = (req) => {
    return req.headers['x-user-name'];
};

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend.html'));
});

// Endpoint to get/initialize user data, with username uniqueness check
app.get('/api/user-data', (req, res) => {
    const userId = getUserId(req);
    const userName = getUserName(req);

    if (!userId) {
        return res.status(400).json({ error: 'User ID missing in headers.' });
    }

    const normalizedNewUserName = userName ? userName.toLowerCase() : null;

    // Case 1: New user or existing user with no username set yet
    if (!allUsersData[userId]) {
        // Check for username uniqueness only if a username is provided
        if (normalizedNewUserName && usernameMap[normalizedNewUserName]) {
            return res.status(409).json({ error: 'Username already taken. Please choose a different one.' });
        }
        allUsersData[userId] = {
            cash: 100000,
            portfolio: {},
            username: userName || `User-${userId.substring(0, 4)}` // Assign default if no username is provided
        };
        allUsersData[userId].checksum = calculateChecksum(allUsersData[userId]);
        usernameMap[allUsersData[userId].username.toLowerCase()] = userId; // Add to username map
        saveAllUsersData();
        console.log(`Initialized new user data for userId: ${userId} with username: ${allUsersData[userId].username}`);
    }
    // Case 2: Existing user trying to update their username
    else if (userName && allUsersData[userId].username !== userName) {
        const oldUsername = allUsersData[userId].username;
        const normalizedOldUsername = oldUsername ? oldUsername.toLowerCase() : null;

        // Check for username uniqueness
        if (normalizedNewUserName && usernameMap[normalizedNewUserName] && usernameMap[normalizedNewUserName] !== userId) {
            return res.status(409).json({ error: 'Username already taken. Please choose a different one.' });
        }

        // Update username in user data and usernameMap
        if (normalizedOldUsername && usernameMap[normalizedOldUsername] === userId) {
            delete usernameMap[normalizedOldUsername]; // Remove old username from map
        }
        allUsersData[userId].username = userName;
        usernameMap[userName.toLowerCase()] = userId; // Add new username to map
        allUsersData[userId].checksum = calculateChecksum(allUsersData[userId]); // Recalculate checksum after username change
        saveAllUsersData();
        console.log(`Updated username for userId: ${userId} from "${oldUsername}" to "${userName}"`);
    } else if (!allUsersData[userId].username && userName) {
        // User exists but previously had no username, now setting one
        if (normalizedNewUserName && usernameMap[normalizedNewUserName]) {
            return res.status(409).json({ error: 'Username already taken. Please choose a different one.' });
        }
        allUsersData[userId].username = userName;
        usernameMap[userName.toLowerCase()] = userId;
        allUsersData[userId].checksum = calculateChecksum(allUsersData[userId]);
        saveAllUsersData();
        console.log(`Set username for userId: ${userId} to "${userName}"`);
    }
    // For all other cases (e.g., existing user just fetching data, no username change)
    res.json(allUsersData[userId]);
});

// Middleware for anti-cheat checksum verification
const verifyChecksum = (req, res, next) => {
    const userId = getUserId(req);
    const clientChecksum = req.headers['x-user-checksum'];

    if (!allUsersData[userId]) {
        console.error(`Anti-cheat: User data not found for userId: ${userId}`);
        return res.status(404).json({ error: 'User data not found for anti-cheat verification.' });
    }

    const serverCalculatedChecksum = calculateChecksum(allUsersData[userId]);

    if (serverCalculatedChecksum !== clientChecksum) {
        console.warn(`Anti-cheat detected for user ${allUsersData[userId].username} (${userId})! Client checksum: ${clientChecksum}, Server checksum: ${serverCalculatedChecksum}`);
        // Consider more severe actions here, e.g., resetting user data or flagging
        return res.status(403).json({ error: 'Anti-cheat detected: Data mismatch. Transaction rejected. Your portfolio has been reset.' });
        // Optional: Reset user data upon cheat detection
        // allUsersData[userId] = { cash: 100000, portfolio: {}, username: allUsersData[userId].username, checksum: calculateChecksum({ cash: 100000, portfolio: {} }) };
        // saveAllUsersData();
    }
    next(); // Proceed to the next middleware/route handler
};

app.post('/api/buy-stock', verifyChecksum, (req, res) => {
    const userId = getUserId(req);
    const { symbol, amount, currentPrice } = req.body;

    if (!symbol || typeof amount !== 'number' || amount <= 0 || typeof currentPrice !== 'number' || currentPrice <= 0) {
        return res.status(400).json({ error: 'Invalid input for buying stock.' });
    }

    const totalCost = amount * currentPrice;

    if (allUsersData[userId].cash >= totalCost) {
        allUsersData[userId].cash -= totalCost;
        allUsersData[userId].portfolio[symbol] = (allUsersData[userId].portfolio[symbol] || 0) + amount;
        
        allUsersData[userId].checksum = calculateChecksum(allUsersData[userId]); // Recalculate checksum
        saveAllUsersData();
        res.json({ success: true, cash: allUsersData[userId].cash, portfolio: allUsersData[userId].portfolio, checksum: allUsersData[userId].checksum });
    } else {
        res.status(400).json({ error: 'Insufficient cash.' });
    }
});

app.post('/api/sell-stock', verifyChecksum, (req, res) => {
    const userId = getUserId(req);
    const { symbol, amount, currentPrice } = req.body;

    if (!symbol || typeof amount !== 'number' || amount <= 0 || typeof currentPrice !== 'number' || currentPrice <= 0) {
        return res.status(400).json({ error: 'Invalid input for selling stock.' });
    }

    if (allUsersData[userId].portfolio[symbol] && allUsersData[userId].portfolio[symbol] >= amount) {
        const totalRevenue = amount * currentPrice;
        allUsersData[userId].cash += totalRevenue;
        allUsersData[userId].portfolio[symbol] -= amount;

        if (allUsersData[userId].portfolio[symbol] < 0.001) { // Clean up tiny remnants
            delete allUsersData[userId].portfolio[symbol];
        }
        allUsersData[userId].checksum = calculateChecksum(allUsersData[userId]); // Recalculate checksum
        saveAllUsersData();
        res.json({ success: true, cash: allUsersData[userId].cash, portfolio: allUsersData[userId].portfolio, checksum: allUsersData[userId].checksum });
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
        const currentPrice = data.chart?.result?.[0]?.meta?.regularMarketPrice;
        if (currentPrice !== undefined) {
            stockPricesCache[symbol] = { price: currentPrice, lastUpdated: Date.now() };
        }

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

app.get('/api/leaderboard', async (req, res) => {
    const leaderboard = [];
    const symbolsToFetch = new Set();

    for (const userId in allUsersData) {
        for (const symbol in allUsersData[userId].portfolio) {
            symbolsToFetch.add(symbol);
        }
    }

    const fetchPromises = Array.from(symbolsToFetch).map(async (symbol) => {
        const yahooApiUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?region=US&lang=en-US&includePrePost=false&interval=1d&range=1d`;
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
                    saveAllUsersData(); // Save changes after trade
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

setInterval(checkLimitOrders, 10000); // Check limit orders every 10 seconds

// Periodic background checksum verification (anti-cheat)
const checkAllUsersChecksums = () => {
    console.log('Running periodic checksum verification for all users...');
    for (const userId in allUsersData) {
        const user = allUsersData[userId];
        const storedChecksum = user.checksum;
        const liveChecksum = calculateChecksum(user);
        if (storedChecksum !== liveChecksum) {
            console.error(`CRITICAL ANTI-CHEAT WARNING: User ${user.username} (${userId}) has a checksum mismatch in stored data! Stored: ${storedChecksum}, Live: ${liveChecksum}`);
            // In a real application, you might want to:
            // 1. Log this incident to a separate security log.
            // 2. Temporarily suspend the user's account.
            // 3. Reset their portfolio to a known good state.
            // For this simulation, we'll just log an error.
        }
    }
};
setInterval(checkAllUsersChecksums, 300000); // Check all users' checksums every 5 minutes

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
