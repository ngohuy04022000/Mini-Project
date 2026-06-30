import { Router } from 'express';
import {
  holdTicketHandler,
  releaseHoldHandler,
  getHoldStatusHandler,
  lookupTicketHandler,
} from '../controllers/ticketController';
import { holdRateLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/tickets/hold - Hold a ticket for 5 minutes
router.post('/hold', holdRateLimiter, holdTicketHandler);

// POST /api/tickets/release - Release a held ticket
router.post('/release', releaseHoldHandler);

// GET /api/tickets/hold/:holdId/status - Get hold status
router.get('/hold/:holdId/status', getHoldStatusHandler);

// GET /api/tickets/lookup/:ticketCode - Look up a purchased ticket by its code
router.get('/lookup/:ticketCode', lookupTicketHandler);

export default router;
