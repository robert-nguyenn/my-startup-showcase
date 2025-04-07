
import { Request, Response, NextFunction } from 'express';
import prisma from '../../utils/prisma/prisma'; // Adjust path if needed
import { Prisma, StrategyBlock, Condition, Action } from '@prisma/client';
import {
  CreateStrategyDto, UpdateStrategyDto, CreateBlockDto, UpdateBlockDto,
  ConditionInputDto, ActionInputDto, StrategyBlockWithChildren // Import types
} from './strategyApiTypes'

export const createStrategyBlock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { strategyId } = req.params;
    const {
      blockType, parameters, parentId, order, conditionDetails, actionDetails
    } = req.body as CreateBlockDto;
    // TODO: Add input validation
  
    if (!blockType || parameters === undefined) {
        res.status(400).json({ error: 'blockType and parameters are required' });
        return;
    }
    // Prevent creating multiple ROOT blocks
    if (blockType === 'ROOT') {
         res.status(400).json({ error: 'Cannot manually create a ROOT block. It is created with the strategy.' });
         return;
    }
  
    try {
        // Validate strategy exists
        const strategy = await prisma.strategy.findUnique({ where: { id: strategyId } });
        if (!strategy) {
            res.status(404).json({ error: `Strategy with ID ${strategyId} not found` });
            return;
        }
  
        // Validate parent block exists and belongs to the same strategy (if parentId provided)
        if (parentId) {
            const parentBlock = await prisma.strategyBlock.findUnique({ where: { id: parentId } });
            if (!parentBlock || parentBlock.strategyId !== strategyId) {
                res.status(400).json({ error: `Parent block with ID ${parentId} not found or does not belong to strategy ${strategyId}` });
                return;
            }
        }
  
        let conditionId: string | undefined = undefined;
        let actionId: string | undefined = undefined;
  
        // Use transaction to create block and potentially condition/action
        const newBlock = await prisma.$transaction(async (tx) => {
            // Create Condition if details provided
            if (conditionDetails) {
                const newCondition = await tx.condition.create({
                    data: { ...conditionDetails } // Assumes conditionDetails matches Prisma ConditionCreateInput
                });
                conditionId = newCondition.id;
            }
  
            // Create Action if details provided
            if (actionDetails) {
                const newAction = await tx.action.create({
                    data: { ...actionDetails } // Assumes actionDetails matches Prisma ActionCreateInput
                });
                actionId = newAction.id;
            }
  
            // Create the Strategy Block
            return tx.strategyBlock.create({
                data: {
                    strategyId,
                    blockType,
                    parameters,
                    parentId: parentId || null, // Ensure null if undefined/empty string
                    order: order ?? 0,
                    conditionId, // Link if created
                    actionId,    // Link if created
                },
                include: { // Include linked items in response
                    condition: true,
                    action: true
                }
            });
        });
  
        res.status(201).json(newBlock);
  
    } catch (error) {
        next(error);
    }
  };
  
  
  export const updateStrategyBlock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      const { strategyId, blockId } = req.params;
      const { parameters, parentId, order } = req.body as UpdateBlockDto;
      // TODO: Add input validation
      // TODO: Add logic to update linked Condition/Action if needed
  
      try {
          // Validate block exists and belongs to strategy
          const block = await prisma.strategyBlock.findUnique({ where: { id: blockId } });
          if (!block || block.strategyId !== strategyId) {
              res.status(404).json({ error: `Block with ID ${blockId} not found or does not belong to strategy ${strategyId}` });
              return;
          }
  
          // Prevent changing parent of ROOT block or making another block ROOT
          if (block.blockType === 'ROOT' && parentId !== block.parentId) {
               res.status(400).json({ error: 'Cannot change the parent of a ROOT block.' });
               return;
          }
  
          // Validate new parent block exists and belongs to the same strategy (if parentId provided and changed)
          if (parentId && parentId !== block.parentId) {
              const parentBlock = await prisma.strategyBlock.findUnique({ where: { id: parentId } });
              if (!parentBlock || parentBlock.strategyId !== strategyId) {
                  res.status(400).json({ error: `New parent block with ID ${parentId} not found or does not belong to strategy ${strategyId}` });
                  return;
              }
          }
  
          const updatedBlock = await prisma.strategyBlock.update({
              where: { id: blockId },
              data: {
                  parameters,
                  // Handle parentId carefully: allow setting to null
                  parentId: parentId !== undefined ? (parentId === null ? null : parentId) : undefined,
                  order,
                  // Add logic here if updating linked condition/action is allowed
              },
               include: { // Include linked items in response
                    condition: true,
                    action: true
                }
          });
          res.status(200).json(updatedBlock);
      } catch (error) {
          // Handle specific Prisma error for record not found (though checked above)
          if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
              res.status(404).json({ error: `Block with ID ${blockId} not found` });
              return;
          }
          next(error);
      }
  };
  
  
  export const deleteStrategyBlock = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { strategyId, blockId } = req.params;
  
    try {
        // Use transaction to ensure atomicity (especially when handling ROOT block)
        await prisma.$transaction(async (tx) => {
            // Find the block to check if it exists and if it's the root
            const blockToDelete = await tx.strategyBlock.findUnique({
                where: { id: blockId },
                select: { id: true, strategyId: true, blockType: true, strategyRoot: { select: { id: true }} } // Check if it's linked as root
            });
  
            if (!blockToDelete || blockToDelete.strategyId !== strategyId) {
                // Throw an error that the error middleware will catch as 404
                throw new Prisma.PrismaClientKnownRequestError(
                    `Block with ID ${blockId} not found or does not belong to strategy ${strategyId}`,
                    { code: 'P2025', clientVersion: 'N/A'} // Mimic Prisma's not found error
                );
            }
  
            // If this block is the ROOT block for the strategy, unlink it first
            if (blockToDelete.blockType === 'ROOT' && blockToDelete.strategyRoot?.id === strategyId) {
            // if (blockToDelete.strategyRoot?.id === strategyId) { // Simpler check if only ROOT blocks can be linked
                await tx.strategy.update({
                    where: { id: strategyId },
                    data: { rootBlockId: null }
                });
            }
  
            // Delete the block. Cascading delete handles children and potentially linked Condition/Action
            // if the schema defines onDelete: Cascade for those relations FROM StrategyBlock.
            // Currently, Condition/Action are SetNull, so they won't be deleted, only unlinked.
            await tx.strategyBlock.delete({
                where: { id: blockId }
            });
        });
  
        res.status(204).send(); // No content on successful delete
    } catch (error) {
         if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
            // Catch the error explicitly thrown above or if delete fails because block was already gone
            res.status(404).json({ error: `Block with ID ${blockId} not found.` });
            return;
        }
        next(error);
    }
  };