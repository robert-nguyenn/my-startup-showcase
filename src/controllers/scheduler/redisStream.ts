import { createClient } from "redis"; // Assuming you might need this elsewhere, but initRedis handles client creation
import { getRedisClient, initRedis } from "../../utils/redisClient";
import { PrismaClient, Prisma, ActionType } from '@prisma/client';

initRedis(); // Ensure Redis is initialized
const redisClient = getRedisClient();

export const STREAM_KEY = 'indicatorUpdates';

interface IndicatorUpdatePayload {
    cacheKey: string;
    indicatorType: string;
    symbol: string;
    interval: string;
    parameters: Record<string, any>; // This is an object
    lastRefreshed?: string;
    fetchTime: string;
}

export const publishIndicatorUpdate = async (payload: IndicatorUpdatePayload) => {
    if (!redisClient || !redisClient.isReady) {
         console.error('Redis client not ready. Cannot publish indicator update.');
         // Optionally throw an error or implement retry logic
         return;
     }

    try {
        // Convert payload correctly for Redis Stream (XADD expects field-value pairs)
        const streamData: Record<string, string> = {}; // Explicitly define as string->string map

        for (const [key, value] of Object.entries(payload)) {
            if (value === undefined || value === null) {
                // Skip undefined/null values or decide how to handle them
                continue;
            }

            if (key === 'parameters' && typeof value === 'object') {
                // *** Correctly serialize the parameters object to a JSON string ***
                streamData[key] = JSON.stringify(value);
            } else {
                // Convert other values to strings
                // Using String() is generally safer than .toString() for various types
                streamData[key] = String(value);
            }
        }

        // Debug log to see what's being sent
        // console.log("Publishing streamData:", streamData);

        // Use the correctly prepared streamData object
        await redisClient.xAdd(STREAM_KEY, '*', streamData);

        // Log using a property that is guaranteed to be a simple string, like cacheKey
        console.log(`Published update to ${STREAM_KEY} for ${payload.cacheKey}`);
    } catch (error) {
        console.error('Error publishing to Redis Stream:', error);
        // Consider logging the payload that failed (but be careful with sensitive data)
        // console.error('Failed payload:', payload); // For debugging
    }
};

export const ACTION_STREAM_KEY = 'actionRequired';

interface ActionRequiredPayload {
    actionId: string;
    actionType: ActionType;
    parameters: Record<string, any>; // This is an object
    strategyId: string;
    triggeringIndicator: Record<string, any>;

}

export const publishActionRequired = async(payload: ActionRequiredPayload) => {
    if (!redisClient || !redisClient.isReady) {
        console.error("Redis client not ready. Cannot publish required action");
        return;
    }

    try {
        const streamData: Record<string, string> = {};

        for (const [key, value] of Object.entries(payload)) {
            if (value === undefined || value === null) continue;

            //Parameters and triggeringIndicator are likely objects
            if (key === "parameters" || key === "triggeringIndicator") {
                streamData[key] = JSON.stringify(value);
            }
            else {
                streamData[key] = String(value);
            }
        }
        await redisClient.xAdd(ACTION_STREAM_KEY, "*", streamData);
        console.log(`Published action required to ${ACTION_STREAM_KEY} for action ${payload.actionId} (strategy ${payload.strategyId})`);
        } catch (error) {
            console.error("Error publishing to Redis Stream:", error
        );
    }
}