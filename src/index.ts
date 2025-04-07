import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import Alpaca from "@alpacahq/alpaca-trade-api";
import cors from 'cors';
import { initRedis } from './utils/redisClient';
import { Prisma } from '@prisma/client';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;


import accountsRoutes from './routes/brokerRoutes/accountsRoutes';
import marketDataRoutes from './routes/marketDataRoutes/marketDataRoutes';
import tradingRoutes from './routes/brokerRoutes/tradingRoutes';
import strategyRoutes from './routes/strategyRoutes/strategyRoutes';
import userRoutes from './routes/userRoutes/userRoutes';

import connectToAlpacaMarketData from './websocket/marketDataStream';
import { getOBV, getSMA } from './controllers/technicalIndicators/technicalIndicators';



import { startScheduler, stopScheduler } from './controllers/scheduler/schedulerService';
import { startConsumer as startEvaluationConsumer } from './controllers/evaluationService/consumer';
import { startActionConsumer } from './controllers/actionService/consumer';


app.use(cors()); 
app.use(express.json());

app.get('/health', (req, res) => {
    res.json({ status: 'Server is running' });
});

app.use('/api/accounts',accountsRoutes)
app.use('/api/trading',tradingRoutes)
app.use('/api',marketDataRoutes)
app.use('/api/strategies', strategyRoutes);
app.use('/api', userRoutes);



// connectToAlpacaMarketData();
// console.log(getSMA('AAPL', 'monthly', '60', 'close'));
// (async () => {
//     // await initRedis();
//     try {
//         const smaData = await getSMA('AAPL', 'monthly', '60', 'close');
//         console.log('SMA Data:', smaData);
//     } catch (error) {
//         console.error('Error fetching SMA data:', error);
//     }
// })();


const startServer = async () => {
    try {
        // 1. Initialize Redis
        console.log('Initializing Redis...');
        await initRedis();
        console.log('Redis Initialized.');

        // 2. Start the Scheduler Service
        console.log('Starting Scheduler Service...');
        await startScheduler();
        console.log('Scheduler Service Started.');

        // 3. Start the Evaluation Service Consumer (Runs in background)
        console.log('Starting Evaluation Service Consumer...');
        startEvaluationConsumer().catch(err => {
            console.error('Evaluation Service Consumer crashed:', err);
            process.exit(1);
        });
        console.log('Evaluation Service Consumer Initiated.');

        // --- *** 4. Start the Action Service Consumer (Runs in background) *** ---
        console.log('Starting Action Service Consumer...');
        startActionConsumer().catch(err => {
             console.error('Action Service Consumer crashed:', err);
             process.exit(1); // Critical component
        });
        console.log('Action Service Consumer Initiated.');


        // 5. Start the Express server
        app.listen(PORT, () => {
            console.log(`Server running on http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('Failed to start application:', error);
        process.exit(1);
    }
};
// Graceful Shutdown Handling (Optional but Recommended)
const shutdown = async () => {
    console.log('Shutting down gracefully...');
    stopScheduler(); // Stop cron jobs
    // Add logic here to disconnect Redis client if needed (depends on client library behavior)
    // Add logic to signal consumers to stop gracefully if possible
    console.log('Shutdown complete.');
    process.exit(0);
};

// process.on('SIGTERM', shutdown);
// process.on('SIGINT', shutdown); // Catches Ctrl+C

// Start the application
// startServer();
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));