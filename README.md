Investment Portfolio & Stock Trading Application
This is a dynamic web application that simulates a stock trading platform, allowing users to manage a virtual investment portfolio, track stock prices in real-time, execute trades, and view their performance on a global leaderboard.

Features
Portfolio Overview: View your current cash balance and a visual representation of your stock holdings.

Real-time Stock Trading:

Search and load historical and live price data for various stock symbols (powered by a hypothetical backend API).

View current stock price, daily change, and percentage change.

Toggle between "Buy" and "Sell" modes.

Specify the number of shares for trade.

"Buy All" and "Sell All" buttons for quick transactions.

Estimated cost/proceeds calculation before trade execution.

Interactive Stock Charts:

Visualize stock price trends across different timeframes (Live, 1D, 1W, 1M, 3M, YTD, 1Y, 5Y, MAX).

Charts smoothly connect data points across market closures for a continuous line.

Global Leaderboard: See how your net worth compares to other users.

User Management:

Set and change your username.

Local storage for user ID and username.

Anti-cheat mechanism.

Personalized Settings:

Toggle Dark Mode for a comfortable viewing experience.

Placeholder for notifications (future functionality).

Option to reset your account data.

Responsive Design: Optimized for seamless experience across various devices (mobile, tablet, desktop).

Frontend


Chart.js: Powerful charting library for displaying stock and portfolio data.

Luxon: JavaScript library for working with dates and times, used for chart axis formatting.


Setup and Installation
This project primarily consists of a frontend web application. To run it locally, you will need a web browser.


git clone https://github.com/Ronan615/stock-trading-app.git
cd stock-trading-app

Just have to run the backend.js files and use npm to install dependences 



Trade Stocks:

On the "Trade Stocks" page, enter a stock symbol (e.g., AAPL, TSLA, SPY) and click "Load Chart" to fetch its data.

Use the "Live", "1D", "1W", etc., buttons to change the chart timeframe.

Toggle between "Buy" and "Sell" using the buttons.

Enter the number of shares you wish to trade. Use "Buy All" or "Sell All" to quickly fill the input.

Click "Trade now" to execute the simulated transaction.

Leaderboard: Check your rank and net worth against other users on the "Leaderboard" page.

Settings: Adjust dark mode, change your username, or reset your account data.

Contributing
Contributions are welcome! If you have suggestions for improvements or find any issues, please feel free to:

Fork the repository.

Create a new branch.

Make your changes.

Commit your changes (git commit -m 'Add new feature').

Push to the branch (git push origin feature/your-feature-name).

Open a Pull Request.
