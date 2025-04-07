// src/controllers/strategyController.ts
import { Request, Response, NextFunction } from 'express';
import prisma from '../../utils/prisma/prisma'; // Adjust path if needed
import { Prisma, StrategyBlock, Condition, Action } from '@prisma/client';
import {
  CreateStrategyDto, UpdateStrategyDto, CreateBlockDto, UpdateBlockDto,
  ConditionInputDto, ActionInputDto, StrategyBlockWithChildren // Import types
} from './strategyApiTypes'


export const createStrategy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { userId, name, description } = req.body as CreateStrategyDto;
  // TODO: Add input validation (e.g., using Zod)

  if (!userId || !name) {
    res.status(400).json({ error: 'userId and name are required' });
    return;
  }

  try {
    // Optionally: Validate userId exists if needed
    const userExists = await prisma.user.findUnique({ where: { id: userId } });
    if (!userExists) {
      res.status(404).json({ error: `User with ID ${userId} not found` });
      return
    }

    // Create Strategy and a default ROOT block in a transaction
    const strategy = await prisma.$transaction(async (tx) => {
      const newStrategy = await tx.strategy.create({
        data: {
          userId,
          name,
          description,
          isActive: false, // Default to inactive
        },
      });

      // Create the ROOT block
      const rootBlock = await tx.strategyBlock.create({
          data: {
              strategyId: newStrategy.id,
              blockType: 'ROOT',
              parameters: {}, // Root block might not need parameters initially
              order: 0,
          }
      });

      // Link the ROOT block to the strategy
      await tx.strategy.update({
          where: { id: newStrategy.id },
          data: { rootBlockId: rootBlock.id }
      });

      // Return the strategy with the rootBlockId populated
      // Fetch it again to ensure rootBlockId is included
      return tx.strategy.findUniqueOrThrow({
           where: { id: newStrategy.id },
           include: { rootBlock: true } // Include the root block in the response
      });
    });

    res.status(201).json(strategy);
  } catch (error) {
    next(error); // Pass error to error handling middleware
  }
};

export const getStrategies = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const userId = req.query.userId as string;

  if (!userId) {
    res.status(400).json({ error: 'userId query parameter is required' });
    return;
  }

  try {
    const strategies = await prisma.strategy.findMany({
      where: { userId: userId },
      orderBy: { createdAt: 'desc' },
      // Select specific fields if you want to exclude blocks in the list view
      select: {
          id: true,
          userId: true,
          name: true,
          description: true,
          isActive: true,
          rootBlockId: true,
          createdAt: true,
          updatedAt: true,
          // Exclude 'blocks' relation here for brevity
      }
    });
    res.status(200).json(strategies);
  } catch (error) {
    next(error);
  }
};

export const getStrategyById = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const { strategyId } = req.params;

    // Define a reusable include object for block details
    const blockInclude = {
        condition: true,
        action: true,
        children: {
            include: {
                condition: true,
                action: true,
                children: {
                    include: {
                        condition: true,
                        action: true,
                        children: true // Simplified to boolean for further nesting
                    },
                    orderBy: { order: 'asc' as Prisma.SortOrder } // Ensure correct SortOrder type
                }
            },
            orderBy: { order: 'asc' as Prisma.SortOrder } // Ensure correct SortOrder type
        }
    };


    try {
        // Fetch the strategy, asking Prisma to build the tree starting from rootBlock
        const strategy = await prisma.strategy.findUnique({
            where: { id: strategyId },
            include: {
                // Include the rootBlock directly with the nested structure
                rootBlock: {
                    include: blockInclude // Use the reusable include
                }
                // If you still want the flat list for some reason, keep the 'blocks' include,
                // but the tree is now primarily accessed via strategy.rootBlock
                // blocks: { include: { condition: true, action: true }, orderBy: { order: 'asc'} }
            },
        });

        if (!strategy) {
            res.status(404).json({ error: `Strategy with ID ${strategyId} not found` });
            return;
        }

        // The nested tree structure is now available under strategy.rootBlock
        // No need for the manual buildBlockTree function here

        res.status(200).json(strategy); // Return the strategy object containing the nested tree

    } catch (error) {
        next(error);
    }
};

export const updateStrategy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { strategyId } = req.params;
  const { name, description, isActive } = req.body as UpdateStrategyDto;
  // TODO: Add input validation

  try {
    const updatedStrategy = await prisma.strategy.update({
      where: { id: strategyId },
      data: {
        name,
        description,
        isActive,
      },
    });
    res.status(200).json(updatedStrategy);
  } catch (error) {
     // Handle specific Prisma error for record not found
     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: `Strategy with ID ${strategyId} not found` });
        return;
    }
    next(error);
  }
};

export const deleteStrategy = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const { strategyId } = req.params;

  try {
    // Deletion cascades based on schema (Strategy -> StrategyBlock)
    await prisma.strategy.delete({
      where: { id: strategyId },
    });
    res.status(200).json({ message: `Strategy with ID ${strategyId} has been deleted` });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        res.status(404).json({ error: `Strategy with ID ${strategyId} not found` });
        return;
    }
    next(error);
  }
};


