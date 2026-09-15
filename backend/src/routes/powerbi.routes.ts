import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { generatePowerBIEmbedConfig } from '../services/powerbi.service';

const router = Router();

router.get('/embed-token', asyncHandler(async (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json(await generatePowerBIEmbedConfig());
}));

export default router;
