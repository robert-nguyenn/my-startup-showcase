// cache.ts
import { getRedisClient } from "../../utils/redisClient";

export const generateCacheKey = (params: Record<string, any>): string => {
    // Include relevant fields from the new Condition schema if needed
    const keyParams = {
        indicatorType: params.indicatorType,
        symbol: params.symbol,
        interval: params.interval,
        parameters: params.parameters,
        dataSource: params.dataSource, // Add if relevant
        // dataKey: params.dataKey      // Add if relevant
    };
    const sortedKeys = Object.keys(keyParams).sort();
    // ... rest of the key generation logic ...
    const entries = sortedKeys.map(key => {
         const value = keyParams[key as keyof typeof keyParams];
         if (value === undefined || value === null) return null; // Skip null/undefined parts
         const stringValue = typeof value === 'object'
             ? JSON.stringify(value)
             : String(value);
         return `${key}:${stringValue}`;
     }).filter(part => part !== null).join('|'); // Filter out null parts

    return `indicator:${entries}`;
};

// Store both data and metadata (like lastRefreshed timestamp)
export const setCachedIndicatorData = async (
  key: string,
  data: any,
  metadata: Record<string, any>,
  ttlSeconds: number
) => {
  const redisClient = getRedisClient(); // Moved inside the function
  const cacheEntry = {
    data: data,
    metadata: metadata, // Store metadata like "Last Refreshed"
    fetchedAt: new Date().toISOString(), // Track when we fetched it
  };
  console.log(`Setting cache for key: ${key} with TTL: ${ttlSeconds} seconds`);
  await redisClient.set(key, JSON.stringify(cacheEntry), { EX: ttlSeconds });
};

// Retrieve the full cache entry including metadata
export const getCachedIndicatorEntry = async <T>(
  key: string
): Promise<{ data: T; metadata: Record<string, any>; fetchedAt: string } | null> => {
  const redisClient = getRedisClient(); 
  console.log('Checking cache for key: ' + key);
  const cached = await redisClient.get(key);
  if (!cached) {
    console.log('Cache miss: ' + key);
    return null;
  }
  console.log('Cache hit: ' + key);
  try {
    return JSON.parse(cached);
  } catch (error) {
    console.error('Error parsing cached indicator entry:', error);
    // Optional: Delete invalid cache entry
    // await redisClient.del(key);
    return null;
  }
};

// Existing function kept for compatibility or simpler use cases
export const getCachedData = async <T>(key: string): Promise<T | null> => {
  const entry = await getCachedIndicatorEntry<T>(key);
  return entry ? entry.data : null;
};