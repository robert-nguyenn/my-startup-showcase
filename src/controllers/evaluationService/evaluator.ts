// src/controllers/evaluationService/evaluator.ts
import {
    PrismaClient,
    Operator,
    Condition, // Keep Condition type
    StrategyBlock, // Add StrategyBlock type
    Action,      // Keep Action type
    StrategyBlockType, ActionType // Import needed enums
} from '@prisma/client';
import { getCachedIndicatorEntry, generateCacheKey } from '../technicalIndicators/cache';
import { publishActionRequired } from '../scheduler/redisStream';

const prisma = new PrismaClient();

// --- Helper functions remain the same ---
const getLatestIndicatorValue = (indicatorData: any): number | null => {
    if (!indicatorData || typeof indicatorData !== 'object') return null;
    const dates = Object.keys(indicatorData).sort().reverse();
    if (dates.length === 0) return null;
    const latestDate = dates[0];
    // Handle cases where the latest data point might be missing or not a number
    const dataPoint = indicatorData[latestDate];
    if (!dataPoint || typeof dataPoint !== 'object') return null;
    // Find the first key whose value is numeric (common in AlphaVantage)
    const valueKey = Object.keys(dataPoint).find(k => !isNaN(parseFloat(dataPoint[k])));
    return valueKey ? parseFloat(dataPoint[valueKey]) : null;
};

const getPreviousIndicatorValue = (indicatorData: any): number | null => {
     if (!indicatorData || typeof indicatorData !== 'object') return null;
     const dates = Object.keys(indicatorData).sort().reverse();
     if (dates.length < 2) return null;
     const previousDate = dates[1];
     const dataPoint = indicatorData[previousDate];
      if (!dataPoint || typeof dataPoint !== 'object') return null;
     const valueKey = Object.keys(dataPoint).find(k => !isNaN(parseFloat(dataPoint[k])));
     return valueKey ? parseFloat(dataPoint[valueKey]) : null;
};

// --- Revised evaluateCondition to handle potential targetIndicator ---
const evaluateSingleCondition = async (
    condition: Condition,
    currentValue: number,
    previousValue: number | null
): Promise<boolean> => {

    let target: number | null = null;

    if (condition.targetIndicatorId) {
        // --- Fetch data for the target indicator ---
        const targetCondition = await prisma.condition.findUnique({
            where: { id: condition.targetIndicatorId }
        });
        if (!targetCondition) {
            console.warn(`Target indicator condition ${condition.targetIndicatorId} not found for comparison in condition ${condition.id}`);
            return false; // Cannot evaluate if target is missing
        }
        // Generate cache key for the target indicator
        const targetCacheKeyParams = {
            indicatorType: targetCondition.indicatorType,
            symbol: targetCondition.symbol,
            interval: targetCondition.interval,
            parameters: targetCondition.parameters,
            dataSource: targetCondition.dataSource,
            // dataKey: targetCondition.dataKey, // Add if needed
        };
        const targetCacheKey = generateCacheKey(targetCacheKeyParams);
        const targetCachedEntry = await getCachedIndicatorEntry<any>(targetCacheKey);

        if (!targetCachedEntry) {
            console.warn(`   Target Indicator (${targetCacheKey}): Data not found in cache for condition ${condition.id}. Evaluation fails.`);
            return false;
        }
        target = getLatestIndicatorValue(targetCachedEntry.data);
        if (target === null) {
            console.warn(`   Target Indicator (${targetCacheKey}): Could not extract latest value. Evaluation fails.`);
            return false;
        }
        // --- End Fetch data for target indicator ---
    } else if (condition.targetValue !== null && condition.targetValue !== undefined) {
        target = condition.targetValue;
    } else {
        console.warn(`Condition ${condition.id} has neither targetValue nor targetIndicatorId.`);
        return false; // Cannot evaluate without a target
    }

    // Now perform the comparison
    switch (condition.operator) {
        case Operator.GREATER_THAN:
            return currentValue > target;
        case Operator.LESS_THAN:
            return currentValue < target;
        case Operator.EQUALS:
            return Math.abs(currentValue - target) < 0.0001; // Epsilon comparison
        case Operator.NOT_EQUALS:
             return Math.abs(currentValue - target) >= 0.0001;
        case Operator.GREATER_THAN_OR_EQUAL:
            return currentValue >= target;
        case Operator.LESS_THAN_OR_EQUAL:
            return currentValue <= target;
        case Operator.CROSSES_ABOVE:
            if (previousValue === null) return false;
            // If comparing against another indicator, we might need its previous value too.
            // For simplicity now, we only support CROSSES_ABOVE/BELOW a fixed targetValue or the *current* targetIndicator value.
            // A true indicator-vs-indicator crossover requires previous values for both.
             if (condition.targetIndicatorId) {
                 console.warn(`CROSSES_ABOVE/BELOW between two indicators is not fully supported without previous target value. Comparing against current target value.`);
             }
            return previousValue <= target && currentValue > target;
        case Operator.CROSSES_BELOW:
            if (previousValue === null) return false;
             if (condition.targetIndicatorId) {
                 console.warn(`CROSSES_ABOVE/BELOW between two indicators is not fully supported without previous target value. Comparing against current target value.`);
             }
            return previousValue >= target && currentValue < target;
        default:
            console.warn(`Unsupported operator: ${condition.operator} in condition ${condition.id}`);
            return false;
    }
};


// --- *** REVISED evaluateStrategiesForIndicator Function (Simplified Approach) *** ---
export const evaluateStrategiesForIndicator = async (indicatorUpdatePayload: Record<string, any>) => {
    const {
        cacheKey: updatedCacheKey,
        indicatorType,
        symbol,
        interval,
        parameters: updatedParams,
        // Potentially add dataSource, dataKey if used in cache key generation
    } = indicatorUpdatePayload;

     // Validate essential payload fields
    if (!indicatorType || !symbol || !interval || typeof updatedParams !== 'object') {
       console.error('Invalid indicator update payload received:', indicatorUpdatePayload);
       return;
    }

    console.log(`Evaluating strategies potentially affected by update to indicator: Type=${indicatorType}, Symbol=${symbol}, Interval=${interval}, Params=${JSON.stringify(updatedParams)}`);

    // 1. Find Conditions matching the updated indicator profile
    const matchingConditions = await prisma.condition.findMany({
        where: {
            indicatorType: indicatorType,
            symbol: symbol, // Assumes symbol is always present for indicators being evaluated
            interval: interval, // Assumes interval is always present
            // We still need to filter by parameters in code as Prisma JSON equality is tricky
        },
        include: {
            // Include the blocks this condition is linked to
            strategyBlocks: {
                select: {
                    strategyId: true, // We need the strategy ID
                    strategy: { // Include strategy to check isActive
                        select: { isActive: true }
                    }
                }
            }
        }
    });

    // 2. Filter conditions by exact parameters and active strategies, collecting relevant strategy IDs
    const relevantStrategyIds = new Set<string>();
    const conditionsByStrategy = new Map<string, Condition[]>(); // Store conditions per strategy

    for (const condition of matchingConditions) {
        // Precise parameter match check
        if (JSON.stringify(condition.parameters) !== JSON.stringify(updatedParams)) {
            continue; // Skip if parameters don't match exactly
        }

        // Check if this condition is linked to any block in an active strategy
        for (const block of condition.strategyBlocks) {
            if (block.strategy?.isActive) {
                relevantStrategyIds.add(block.strategyId);

                // Store this condition for later evaluation against its strategy
                if (!conditionsByStrategy.has(block.strategyId)) {
                    conditionsByStrategy.set(block.strategyId, []);
                }
                 // Avoid adding duplicate conditions if linked to multiple blocks in the same strategy
                 if (!conditionsByStrategy.get(block.strategyId)!.some(c => c.id === condition.id)) {
                    conditionsByStrategy.get(block.strategyId)!.push(condition);
                 }
            }
        }
    }


    if (relevantStrategyIds.size === 0) {
        console.log(`No active strategies found using the exact indicator: ${indicatorType} ${symbol} ${interval} ${JSON.stringify(updatedParams)}`);
        return;
    }

    console.log(`Found ${relevantStrategyIds.size} active strategies potentially triggered.`);

    // 3. Evaluate each relevant strategy using the SIMPLIFIED approach
    for (const strategyId of relevantStrategyIds) {
        console.log(`--> Evaluating Strategy ID: ${strategyId} (Simplified Logic)`);

        // Fetch all blocks for this strategy to find *all* conditions and actions
        const strategyBlocks = await prisma.strategyBlock.findMany({
            where: { strategyId: strategyId },
            include: {
                condition: true, // Include linked condition
                action: true     // Include linked action
            },
            orderBy: { // Maintain order if needed for actions later
                order: 'asc'
            }
        });

        // Extract all unique conditions linked anywhere in this strategy's blocks
        const allStrategyConditions = strategyBlocks
            .filter(block => block.condition !== null)
            .map(block => block.condition!)
            .filter((condition, index, self) => // Ensure uniqueness
                index === self.findIndex(c => c.id === condition.id)
            );

        // Extract all unique actions linked anywhere in this strategy's blocks
        const allStrategyActions = strategyBlocks
             .filter(block => block.action !== null)
             .map(block => block.action!)
             .filter((action, index, self) => // Ensure uniqueness
                 index === self.findIndex(a => a.id === action.id)
             );

        if (allStrategyConditions.length === 0) {
            console.log(`   Strategy ${strategyId} has no conditions linked to its blocks. Skipping evaluation.`);
            // Or potentially trigger actions if no conditions is a valid state? Defaulting to skip.
            continue;
        }

        let allConditionsMet = true; // Assume AND logic

        // Evaluate all conditions found for this strategy
        for (const condition of allStrategyConditions) {
            // Generate cache key for *this specific condition*
            const conditionCacheKeyParams = {
                indicatorType: condition.indicatorType,
                symbol: condition.symbol,
                interval: condition.interval,
                parameters: condition.parameters,
                dataSource: condition.dataSource,
                // dataKey: condition.dataKey, // Add if needed for cache key
            };
            const conditionCacheKey = generateCacheKey(conditionCacheKeyParams);

            // Get data for this condition's indicator from Redis
            const cachedEntry = await getCachedIndicatorEntry<any>(conditionCacheKey);

            if (!cachedEntry) {
                console.warn(`   Condition ${condition.id} (${conditionCacheKey}): Data not found in cache. Strategy cannot be fully evaluated.`);
                allConditionsMet = false;
                break; // Cannot satisfy AND logic if one part is missing
            }

            const currentValue = getLatestIndicatorValue(cachedEntry.data);
            const previousValue = getPreviousIndicatorValue(cachedEntry.data);

            if (currentValue === null) {
                console.warn(`   Condition ${condition.id} (${conditionCacheKey}): Could not extract latest value. Strategy cannot be fully evaluated.`);
                allConditionsMet = false;
                break;
            }

            // Evaluate this specific condition (potentially against another indicator)
            const conditionMet = await evaluateSingleCondition(condition, currentValue, previousValue);
            const targetDesc = condition.targetIndicatorId
                ? `TargetIndicator(${condition.targetIndicatorId})`
                : `TargetValue(${condition.targetValue})`;
            console.log(`   Condition ${condition.id} (${condition.indicatorType} ${condition.symbol || ''} ${condition.operator} ${targetDesc}): Current=${currentValue}, Prev=${previousValue ?? 'N/A'} -> Met: ${conditionMet}`);

            if (!conditionMet) {
                allConditionsMet = false;
                break; // If any condition fails, the overall AND logic fails
            }
        } // End loop through conditions for one strategy

        // 4. If ALL conditions were met, publish all actions found
        if (allConditionsMet) {
            if (allStrategyActions.length === 0) {
                 console.log(`   ✅ Strategy ${strategyId} conditions MET, but no actions found in blocks.`);
            } else {
                console.log(`   ✅ Strategy ${strategyId} conditions MET. Publishing ${allStrategyActions.length} actions.`);
                for (const action of allStrategyActions) {
                    const actionParams = typeof action.parameters === 'object' && action.parameters !== null
                                           ? action.parameters
                                           : {};

                    await publishActionRequired({
                        actionId: action.id,
                        actionType: action.actionType, // Assumes ActionType enum matches
                        parameters: actionParams as Record<string, any>,
                        strategyId: strategyId,
                        triggeringIndicator: indicatorUpdatePayload, // Pass context
                    });
                }
            }
        } else {
             console.log(`   ❌ Strategy ${strategyId} conditions NOT fully met.`);
        }

    } // End loop through relevant strategy IDs
};

// --- TODO: Implement Full Recursive Evaluation ---
/*
async function evaluateBlockRecursively(block: StrategyBlock & { children: StrategyBlock[], condition?: Condition, action?: Action }) {
    // ... implementation needed ...
    // switch (block.blockType) {
    //    case StrategyBlockType.ROOT: ...
    //    case StrategyBlockType.GROUP: ... (check parameters for AND/OR)
    //    case StrategyBlockType.CONDITION_IF: ... (evaluate condition, recurse on THEN/ELSE children)
    //    case StrategyBlockType.ACTION: ... (publish action)
    //    ... other types
    // }
}

export const evaluateStrategiesForIndicator_Recursive = async (indicatorUpdatePayload: ...) => {
    // 1. Find relevant active strategy IDs (as done above)
    // 2. For each strategyId:
    //    Fetch the root block with nested children, conditions, actions
    //    Call evaluateBlockRecursively(strategy.rootBlock)
}
*/