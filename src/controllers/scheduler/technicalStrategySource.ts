// This code defines a function to retrieve active technical indicators from a database using Prisma.
// It queries for conditions associated with active strategies, ensuring uniqueness by distinct fields.
// The function returns a list of unique technical indicators, each represented by a specific set of attributes.

import { PrismaClient, Prisma} from '@prisma/client';

const prisma = new PrismaClient();

interface TechnicalIndicatorIdentifier {
    function: string;
    indicatorType: string;
    symbol: string;
    interval: string;
    parameters: Record<string, any>; // Prisma stores Json as object
    dataSource?: string | null; 
    dataKey?: string | null;
}

export const getTechnicalActiveIndicators = async (): Promise<TechnicalIndicatorIdentifier[]> => {
    const activeConditions = await prisma.condition.findMany({
        where: {
            // Ensure the condition is actually used in an active strategy's block tree
            strategyBlocks: {
                some: { // Check if this condition is linked to AT LEAST ONE block...
                    strategy: { // ...where that block's strategy...
                        isActive: true, // ...is active.
                    },
                },
            },
            // Add filters for specific indicator types if needed, e.g.,
            // NOT: { indicatorType: 'STOCK_PRICE' } // if stock price isn't fetched this way
        },
        select: {
            indicatorType: true,
            symbol: true,
            interval: true,
            parameters: true,
            dataSource: true, // Include new fields if needed by caching/fetching
            dataKey: true,
        },
        // Distinct based on the unique properties of the data source needed
        distinct: ['indicatorType', 'symbol', 'interval', 'parameters', /* 'dataSource', 'dataKey' */],
    });

    // Post-fetch filtering for robustness (especially with JSON parameters)
    const technicalIndicators = new Map<string, TechnicalIndicatorIdentifier>();
    activeConditions.forEach(cond => {
        // Create a stable key for uniqueness check
        const paramKey = JSON.stringify(cond.parameters || {});
        // Include symbol/interval which might be null now in the schema
        const key = `${cond.indicatorType}|${cond.symbol || 'NOSYMBOL'}|${cond.interval || 'NOINTERVAL'}|${paramKey}`; // Handle potential nulls

        if (!technicalIndicators.has(key)) {
            // Ensure parameters is an object, handle potential nulls for symbol/interval
            const paramsObject = typeof cond.parameters === 'object' && cond.parameters !== null
                                ? cond.parameters as Record<string, any>
                                : {};
            const symbol = cond.symbol ?? ''; // Default to empty string or handle error if required
            const interval = cond.interval ?? ''; // Default or handle error

            if (!symbol || !interval) {
               console.warn(`Condition found with missing symbol or interval, skipping for scheduling: ${key}`, cond);
               return; // Don't schedule indicators missing required fields
            }

            technicalIndicators.set(key, {
                function: cond.indicatorType, // Map indicatorType to 'function' if that's how fetcher expects it
                indicatorType: cond.indicatorType,
                symbol: symbol,
                interval: interval,
                parameters: paramsObject,
                dataSource: cond.dataSource,
                dataKey: cond.dataKey,
            });
        }
    });

    return Array.from(technicalIndicators.values());
};