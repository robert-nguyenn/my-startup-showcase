import { createClient } from 'redis';
import { Queue  } from 'bullmq';


let redisClient: ReturnType<typeof createClient>;

// A simple init function that can be called in an app's startup
export const initRedis = async () => {
    if (!redisClient) {
        redisClient = createClient({
            // Provide config if needed, e.g., URL, password, etc.
            url: 'redis://localhost:6379', 
        });

        redisClient.on('error', (err) => console.error('Redis Error:', err));
        await redisClient.connect();
        // console.log('Redis connected');
    }
};

export const getRedisClient = () => {
    if (!redisClient) {
        throw new Error('Redis not initialized. Call initRedis() first.');
    }
    return redisClient;
};

const connection = {
    host: 'localhost',
    port: 6379,
}

export const indicatorQueue = new Queue('indicatorQueue', { connection });