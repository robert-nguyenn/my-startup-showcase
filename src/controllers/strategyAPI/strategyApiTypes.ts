// src/types/strategyApiTypes.ts
import { StrategyBlockType, Operator, ActionType, Prisma } from '@prisma/client';

// --- Input DTOs (Data Transfer Objects) ---

export interface CreateStrategyDto {
  userId: string;
  name: string;
  description?: string;
  // Add any additional fields if needed
}

export interface UpdateStrategyDto {
  name?: string;
  description?: string;
  isActive?: boolean;
  // Add any additional fields if needed
}

// Input for creating a Condition record *when creating a block*
export interface ConditionInputDto {
  indicatorType: string;
  dataSource?: string;
  dataKey?: string;
  symbol?: string; // Ticker
  interval?: string;
  parameters: Prisma.InputJsonValue; // Use Prisma's type for JSON
  operator: Operator;
  targetValue?: number;
  targetIndicatorId?: string; // For comparing against another condition's output
}

// Input for creating an Action record *when creating a block*
export interface ActionInputDto {
  actionType: ActionType;
  parameters: Prisma.InputJsonValue; // Use Prisma's type for JSON
  order?: number;
}

export interface CreateBlockDto {
  blockType: StrategyBlockType;
  parameters: Prisma.InputJsonValue; // Use Prisma's type for JSON
  parentId?: string | null; // Can be null for root, or ID of parent
  order?: number;
  conditionDetails?: ConditionInputDto;
  actionDetails?: ActionInputDto;
  // Ensure these match the controller's expectations
}

export interface UpdateBlockDto {
  parameters?: Prisma.InputJsonValue;
  parentId?: string | null; // Allow moving the block
  order?: number;
  // Add logic if you want to allow updating the linked Condition/Action details
  // conditionDetails?: Partial<ConditionInputDto>; // Example for partial updates
  // actionDetails?: Partial<ActionInputDto>;
}

// --- Output DTOs (Potentially useful, but often Prisma types are fine) ---
// You might define specific output types if you want to reshape the data
// coming from Prisma before sending it in the response. For now, we'll
// mostly rely on Prisma's generated types for responses.

// Example: Type for returning the block tree structure
export interface StrategyBlockWithChildren extends Prisma.StrategyBlockGetPayload<{
  include: { children: true, condition: true, action: true } // Example include
}> {
  children: StrategyBlockWithChildren[]; // Recursive type
}