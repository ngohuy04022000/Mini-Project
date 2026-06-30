import { Router } from 'express';
import { processPaymentHandler } from '../controllers/ticketController';

const router = Router();

// POST /api/payments/process - Process payment (mock)
router.post('/process', processPaymentHandler);

export default router;
