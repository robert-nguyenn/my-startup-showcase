// evaluationService/consumer.ts
import { getRedisClient } from '../../utils/redisClient';
import { STREAM_KEY } from '../scheduler/redisStream'; // Assuming this path is correct
import { evaluateStrategiesForIndicator } from './evaluator';

const GROUP_NAME = 'evaluation_group';
const CONSUMER_NAME = `evaluator_${process.pid}`;

const redisClient = getRedisClient();

async function setupConsumerGroup() {
    try {
        await redisClient.xGroupCreate(STREAM_KEY, GROUP_NAME, '0', { MKSTREAM: true });
        console.log(`Consumer group ${GROUP_NAME} ensured on stream ${STREAM_KEY}`);
    } catch (error: any) {
        if (error.message.includes('BUSYGROUP')) {
            console.log(`Consumer group ${GROUP_NAME} already exists.`);
        } else {
            console.error('Error creating consumer group:', error);
            throw error;
        }
    }
}

export const startConsumer = async () => {
    await setupConsumerGroup();
    console.log(`Consumer ${CONSUMER_NAME} starting to listen...`);

    while (true) {
        try {
            const response = await redisClient.xReadGroup(
                GROUP_NAME,
                CONSUMER_NAME,
                { key: STREAM_KEY, id: '>' },
                { COUNT: 10, BLOCK: 5000 }
            );

            if (response) {
                for (const stream of response) {
                    for (const message of stream.messages) {
                        const messageId = message.id;
                        // Use message.message directly as the payload object
                        const payload = message.message;

                        if (!payload || Object.keys(payload).length === 0) {
                             console.warn(`Consumer ${CONSUMER_NAME} received empty message ${messageId}. Skipping.`);
                             await redisClient.xAck(STREAM_KEY, GROUP_NAME, messageId);
                             continue;
                        }

                        // --- *** PARSE PARAMETERS *** ---
                        if (payload.parameters && typeof payload.parameters === 'string') {
                          try {
                            payload.parameters = JSON.parse(payload.parameters);
                          } catch (parseError) {
                            console.error(`Error parsing parameters for message ${messageId}. Parameters string: '${payload.parameters}'. Error:`, parseError);
                            // Decide how to handle: skip, log, move to DLQ?
                            // For now, acknowledge and skip processing this message to avoid loop
                            console.error(`Skipping message ${messageId} due to parameter parsing error.`);
                            await redisClient.xAck(STREAM_KEY, GROUP_NAME, messageId);
                            continue; // Skip to the next message
                          }
                        } else if (payload.parameters && typeof payload.parameters !== 'object') {
                            // Handle cases where parameters is present but neither string nor object (unexpected)
                            console.error(`Unexpected type for parameters in message ${messageId}: ${typeof payload.parameters}. Skipping.`);
                            await redisClient.xAck(STREAM_KEY, GROUP_NAME, messageId);
                            continue;
                        }
                        // --- *** END PARSE PARAMETERS *** ---


                        console.log(`Consumer ${CONSUMER_NAME} received message ${messageId}. Processing payload...`);

                        try {
                            // Now payload.parameters should be an object if it was a valid JSON string
                            await evaluateStrategiesForIndicator(payload);

                            await redisClient.xAck(STREAM_KEY, GROUP_NAME, messageId);
                            console.log(`Acknowledged message ${messageId}`);
                        } catch (processingError) {
                            console.error(`Error processing message ${messageId}:`, processingError);
                            // Consider more robust error handling (e.g., dead-letter queue)
                            // If the error is persistent (like the Prisma validation error),
                            // NOT acknowledging here could lead to infinite retries.
                            // It might be better to acknowledge after a few tries or log and acknowledge immediately.
                            // For now, leaving it unacknowledged might cause retries.
                             // Let's acknowledge to prevent loops for validation errors:
                             console.error(`Acknowledging message ${messageId} despite processing error to prevent loop.`);
                             await redisClient.xAck(STREAM_KEY, GROUP_NAME, messageId);
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Error reading from stream:', err);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};