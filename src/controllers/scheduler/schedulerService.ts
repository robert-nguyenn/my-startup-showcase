/**
 * This module manages the scheduling of tasks to fetch technical indicators (strategies that are submitted) at regular intervals.
 * It uses cron jobs to periodically discover active indicators that need to be fetched and schedules
 * them accordingly. The scheduler ensures that the Redis client is initialized before starting the
 * scheduling process. It maintains a map of scheduled jobs to avoid duplicate scheduling and provides
 * functionality to stop all scheduled tasks when needed.
 * 
 * To: Johnson, Do i really need this code!? We can directly deoploy the strategies that come to the strategy db, but should maintain
 * something like, if the strategy is not active, then we should not deploy it. ### Look into it.
 */

import cron from 'node-cron';
import { getTechnicalActiveIndicators } from './technicalStrategySource';
import { scheduleIndicatorFetch } from './fetchOrchestrator';
import { initRedis } from '../../utils/redisClient';
import { generateCacheKey } from '../technicalIndicators/cache';

// A map to store scheduled cron jobs, using a unique string key for each job
const scheduledJobs = new Map<string, cron.ScheduledTask>();

export const startScheduler = async () => {
    console.log('Starting scheduler...');
    await initRedis(); // Make sure Redis client is connected

    // Run periodically (e.g., every 5 minutes) to discover new/removed strategies/indicators
    cron.schedule('*/1 * * * *', async () => {
        console.log('Running indicator discovery task...');
        try {
            const indicatorsToSchedule = await getTechnicalActiveIndicators();
            console.log(`Found ${indicatorsToSchedule.length} unique active indicators to schedule.`);

            // Create a set of new job keys
            const newJobKeys = new Set<string>();

            indicatorsToSchedule.forEach(indicatorParams => {
                // Use generateCacheKey to create a unique job key
                const jobKey = generateCacheKey(indicatorParams);
                newJobKeys.add(jobKey);

                if (!scheduledJobs.has(jobKey)) {
                    // Schedule the actual fetch based on interval
                    const task = scheduleIndicatorFetch(indicatorParams);
                    if (task) {
                        scheduledJobs.set(jobKey, task);
                        console.log(`Scheduled job for ${jobKey}`);
                    }
                }
            });

            // Prune jobs that are no longer needed
            scheduledJobs.forEach((task, key) => {
                if (!newJobKeys.has(key)) {
                    task.stop();
                    scheduledJobs.delete(key);
                    console.log(`Removed job for ${key}`);
                }
            });

        } catch (error) {
            console.error('Error during indicator discovery:', error);
        }
    });
    console.log('Scheduler started. Indicator discovery runs every 5 minutes.');
};

export const stopScheduler = () => {
    console.log("Stopping scheduler...");
    scheduledJobs.forEach((task, key) => {
        task.stop();
        scheduledJobs.delete(key);
    });
    console.log("Scheduler stopped.");
}