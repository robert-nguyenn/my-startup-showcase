// src/routes/strategyRoutes.ts
import { Router } from 'express';
import * as strategyController from '../../controllers/strategyAPI/strategyController'; 
import * as strategyBlockController from '../../controllers/strategyAPI/strategyBlockController';
const router = Router();

// --- Strategy Routes ---
router.post('/', strategyController.createStrategy);
router.get('/', strategyController.getStrategies); // Requires ?userId=...
router.get('/:strategyId', strategyController.getStrategyById);
router.patch('/:strategyId', strategyController.updateStrategy);
router.delete('/:strategyId', strategyController.deleteStrategy);

// --- Strategy Block Routes ---
// Note: These are nested under a specific strategy
router.post('/:strategyId/blocks', strategyBlockController.createStrategyBlock);
router.patch('/:strategyId/blocks/:blockId', strategyBlockController.updateStrategyBlock);
router.delete('/:strategyId/blocks/:blockId', strategyBlockController.deleteStrategyBlock);
// GET for specific block isn't usually needed if GET /:strategyId returns the tree

export default router;