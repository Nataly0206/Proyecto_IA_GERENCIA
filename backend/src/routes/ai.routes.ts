import { Router } from 'express';
import { chat } from '../controllers/ai.controller';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.post('/chat', asyncHandler(chat));

export default router;
