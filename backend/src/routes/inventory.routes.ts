import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getInventory } from '../services/inventory.service';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  res.json({ items: await getInventory() });
}));

export default router;
