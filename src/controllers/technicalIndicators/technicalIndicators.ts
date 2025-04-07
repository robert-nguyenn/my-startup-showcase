/**
 * This module is responsible for fetching technical indicator data from the Alpha Vantage API.
 * It handles caching the response data in Redis to minimize redundant API calls and improve performance.
 * Upon successfully fetching and caching new data, it publishes an "IndicatorDataUpdated" message to a Redis stream.
 * 
 * Technical Perspective:
 * - Caches responses in Redis with a time-to-live (TTL) based on the indicator's interval.
 * - Publishes updates to a Redis stream to notify other services of new data availability.
 * - Ensures timely and efficient retrieval of market data for user strategies.
 * - Reduces operational costs by minimizing API calls through effective caching.
 * - Provides real-time updates to downstream systems, enhancing the platform's responsiveness to market changes.
 */

import axios from 'axios';
import dotenv from 'dotenv';
import { generateCacheKey, setCachedIndicatorData, getCachedIndicatorEntry } from "./cache"; 
import { initRedis } from "../../utils/redisClient";
import { publishIndicatorUpdate } from '../scheduler/redisStream'; 

dotenv.config();

const apikey = process.env.ALPHA_VANTAGE_API_KEY;
// console.log(apikey);
const alphaVantageBaseUrl = 'https://www.alphavantage.co/query';

export interface TechnicalIndicator {
    function: string;
    symbol: string;
    interval: string;
    time_period?: string; // Only required for some functions
    series_type?: string;
    [key: string]: any;
}

export const getTechnicalIndicator = async (params: TechnicalIndicator, forceRefresh: boolean = false): Promise<any> => {
    await initRedis(); // Ensure Redis is ready
    const cacheKey = generateCacheKey(params);

    if (!forceRefresh) {
        const cachedEntry = await getCachedIndicatorEntry<any>(cacheKey);
        if (cachedEntry) {
            // Optional: Add logic here to check if cached data is stale based on metadata['Last Refreshed']
            // and the interval, potentially forcing a refresh even if cache hit.
            // For now, return cached data if found.
            return cachedEntry.data;
        }
    }

    try {
        const { function: func, symbol, interval, parameters } = params;
        const apiParams = {
        function: func,
        symbol,
        interval,
        ...parameters
        };
        console.log(`Fetching fresh data for ${cacheKey}`);
        console.log('params:', apiParams);
        const response = await axios.get(alphaVantageBaseUrl, {
            params: { ...apiParams, apikey },
        });

        const data = response.data;

        // Basic validation
        if (!data || typeof data !== 'object' || data["Error Message"] || !data['Meta Data']) {
             console.error('Invalid data received from Alpha Vantage:', data);
             // Check for rate limit message
             if (typeof data === 'object' && data !== null && (data["Note"] || data["Information"])?.includes("API call frequency")) {
                console.warn(`Rate limit likely hit for ${cacheKey}. Data not cached.`);
                // Optional: Implement backoff logic here for subsequent fetches of this indicator
             }
             throw new Error(`Invalid or error data received from Alpha Vantage for ${cacheKey}.`);
        }

        const metadata = data['Meta Data'] || {};
        const actualIndicatorData = Object.values(data).find(val => typeof val === 'object' && val !== null && !val.hasOwnProperty('1: Symbol')); // Find the actual data part

        if(!actualIndicatorData){
             console.error('Could not extract actual indicator data from response:', data);
             throw new Error(`Could not extract actual indicator data for ${cacheKey}.`);
        }

        const lastRefreshedAV = metadata['3: Last Refreshed']; // Get AV's last refreshed time

        // Determine TTL based on interval
        let ttlSeconds = 86400; // default: 24 hours
        if (params.interval === '1min') ttlSeconds = 60 * 5; // Cache slightly longer than interval
        else if (params.interval === '5min') ttlSeconds = 300 * 2;
        // Add other intervals: 15min, 30min, 60min if supported/needed
        else if (params.interval === 'daily') ttlSeconds = 86400 + 3600; // Cache daily for > 24h
        else if (params.interval === 'weekly') ttlSeconds = 86400 * 7 + 3600;
        else if (params.interval === 'monthly') ttlSeconds = 86400 * 30 + 3600;

        // Store data and metadata
        await setCachedIndicatorData(cacheKey, actualIndicatorData, { ...metadata, alphaVantageLastRefreshed: lastRefreshedAV }, ttlSeconds);

        // Publish an event indicating the data has been updated
        await publishIndicatorUpdate({
            cacheKey: cacheKey,
            indicatorType: params.function,
            symbol: params.symbol,
            interval: params.interval,
            parameters: params,
            lastRefreshed: lastRefreshedAV,
            fetchTime: new Date().toISOString()
        });


        return actualIndicatorData; // Return only the data part, not metadata

    } catch (error: any) {
        console.error(`Error fetching Technical Indicator data for key ${cacheKey}:`, error.response?.data || error.message);
        // Don't re-throw immediately, maybe return null or specific error object
        // Let the scheduler handle retry logic based on the error
         return null; // Or throw a specific error type
    }
};

export const getSMA = (symbol: string, interval: string, time_period: string, series_type: string): Promise<any> => {
    return getTechnicalIndicator({
        function: 'SMA',
        symbol,
        interval,
        time_period,
        series_type
    })
};

export const getEMA = (symbol: string, interval: string, time_period: string, series_type: string): Promise<any> => {
    return getTechnicalIndicator({
        function: 'EMA',
        symbol,
        interval,
        time_period,
        series_type
    })
}

export const getMACD = (symbol: string, interval: string, series_type: string): Promise<any> => {
    return getTechnicalIndicator({
        function: 'MACD',
        symbol,
        interval,
        series_type
    })
}

export const getSTOCH = (symbol: string, interval: string, series_type: string): Promise<any> => {
    return getTechnicalIndicator({
        function: 'STOCH',
        symbol,
        interval,
    })
}

export const getRSI = (symbol: string, interval: string, time_period: string, series_type: string): Promise<any> => {
    return getTechnicalIndicator({
        function: 'RSI',
        symbol,
        interval,
        time_period,
        series_type
    })
}

export const getADX = (symbol: string, interval: string, time_period: string): Promise<any> => {
    return getTechnicalIndicator({
        function: 'ADX',
        symbol,
        interval,
        time_period
    })
}

export const getCCI = (symbol: string, interval: string, time_period: string): Promise<any> => {
    return getTechnicalIndicator({
        function: 'CCI',
        symbol,
        interval,
        time_period
    })
}

export const getAROON = (symbol: string, interval: string, time_period: string): Promise<any> => {
    return getTechnicalIndicator({
        function: 'AROON',
        symbol,
        interval,
        time_period
    })
}

export const getBBANDS = (symbol: string, interval: string, time_period: string, series_type: string): Promise<any> => {
    return getTechnicalIndicator({
        function: 'BBANDS',
        symbol,
        interval,
        time_period,
        series_type
    })
}

export const getAD = (symbol: string, interval: string): Promise<any> => {
    return getTechnicalIndicator({
        function: 'AD',
        symbol,
        interval
    })
}

export const getOBV = (symbol: string, interval: string): Promise<any> => {
    return getTechnicalIndicator({
        function: 'OBV',
        symbol,
        interval
    })
}