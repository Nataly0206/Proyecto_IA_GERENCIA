import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { requirePermission } from '../middleware/sessionAuth';
import { getPurchaseOrders } from '../services/purchase-orders.service';

const router = Router();
router.use(requirePermission('ordenes_compra'));
router.get('/', asyncHandler(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await getPurchaseOrders());
}));
export default router;
