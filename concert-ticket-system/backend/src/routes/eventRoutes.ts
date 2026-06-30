import { Router } from 'express';
import { getActiveEvent } from '../controllers/eventController';

const router = Router();

router.get('/active', getActiveEvent);

export default router;
