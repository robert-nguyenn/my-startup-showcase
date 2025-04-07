import { getRedisClient } from "../../utils/redisClient";
import { ACTION_STREAM_KEY } from "../scheduler/redisStream";

const ACTION_GROUP_NAME = 'action_group';
const ACTION_CONSUMER_NAME = `action_consumer_${process.pid}`;

const redisClient = getRedisClient();

async function setupActionConsumerGroup() {
    try {
        //Create consumer group; MKSTREAM ensures the stream exists
        await redisClient.xGroupCreate(ACTION_STREAM_KEY, ACTION_GROUP_NAME, '0', { MKSTREAM: true });
        console.log(`Consumer group ${ACTION_GROUP_NAME} ensured on stream ${ACTION_STREAM_KEY}`);
    } catch (error: any) {
        if (error.message.includes('BUSYGROUP')) {
            console.log(`Consumer group ${ACTION_GROUP_NAME} already exists.`);
        } else {
            console.error('Error creating consumer group:', error);
            throw error;
        }
    }
}

export const startActionConsumer = async () => {
    await setupActionConsumerGroup(); // Ensure the group exists before starting
    console.log(`Action Consumer ${ACTION_CONSUMER_NAME} starting to listen to stream ${ACTION_STREAM_KEY}...`);

    while (true) {
        try {
            // Read pending messages for this consumer within the group
            // '>' means read messages not yet delivered to *any* consumer in the group
            const response = await redisClient.xReadGroup(
                ACTION_GROUP_NAME,
                ACTION_CONSUMER_NAME,
                { key: ACTION_STREAM_KEY, id: '>' }, // Read new messages for this group
                {
                    COUNT: 10,    // Process up to 10 messages at a time
                    BLOCK: 5000, // Wait up to 5 seconds for messages
                }
            );

            if (response) {
                for (const stream of response) { // Should only be one stream (ACTION_STREAM_KEY)
                    for (const message of stream.messages) {
                        const messageId = message.id;
                        const payload = message.message; // Payload is already an object { field: value, ... }

                        console.log(`Action Consumer ${ACTION_CONSUMER_NAME} received message ${messageId}.`);

                        // Basic validation
                        if (!payload || Object.keys(payload).length === 0) {
                            console.warn(` - Message ${messageId} has empty payload. Acknowledging and skipping.`);
                            await redisClient.xAck(ACTION_STREAM_KEY, ACTION_GROUP_NAME, messageId);
                            continue;
                        }

                        try {
                            // --- Parameter Parsing ---
                            let parsedParameters = {};
                            if (payload.parameters && typeof payload.parameters === 'string') {
                                try {
                                    parsedParameters = JSON.parse(payload.parameters);
                                } catch (parseError) {
                                    console.error(` - Error parsing parameters for message ${messageId}. Params: '${payload.parameters}'. Error:`, parseError);
                                     // Acknowledge to prevent loop, skip processing
                                     console.warn(` - Acknowledging message ${messageId} due to parameter parsing error.`);
                                     await redisClient.xAck(ACTION_STREAM_KEY, ACTION_GROUP_NAME, messageId);
                                     continue;
                                }
                            } else if (payload.parameters) {
                                // If parameters is already an object (less likely with XADD string conversion, but good practice)
                                parsedParameters = payload.parameters;
                            }

                            // --- *** Basic Action Logging (Execution Placeholder) *** ---
                            console.log(`   Action ID: ${payload.actionId}`);
                            console.log(`   Type: ${payload.actionType}`);
                            console.log(`   Strategy ID: ${payload.strategyId}`);
                            console.log(`   Parameters: ${JSON.stringify(parsedParameters)}`); // Log the parsed params
                            // console.log(`   Trigger: ${payload.triggeringIndicator}`); // Optional: Log trigger context

                            // Placeholder for actual execution logic (future step)
                            // switch(payload.actionType) {
                            //    case ActionType.EXECUTE_TRADE:
                            //        await executeTrade(parsedParameters); break;
                            //    case ActionType.SEND_NOTIFICATION:
                            //        await sendNotification(parsedParameters); break;
                            // }

                            // --- Acknowledge successful processing ---
                            await redisClient.xAck(ACTION_STREAM_KEY, ACTION_GROUP_NAME, messageId);
                            console.log(`   Acknowledged message ${messageId}`);

                        } catch (processingError) {
                            console.error(`   Error processing action message ${messageId}:`, processingError);
                            // Decide on error handling: For now, log and acknowledge to prevent infinite loops
                            // In production, consider a retry mechanism or DLQ.
                             console.warn(`   Acknowledging message ${messageId} despite processing error.`);
                            await redisClient.xAck(ACTION_STREAM_KEY, ACTION_GROUP_NAME, messageId);
                        }
                    }
                }
            }
            // No messages received or processed in this iteration, loop continues after BLOCK timeout.
        } catch (err) {
            console.error(`Action Consumer ${ACTION_CONSUMER_NAME} error reading from stream ${ACTION_STREAM_KEY}:`, err);
            // Wait before retrying to avoid spamming logs if Redis connection is down
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
};