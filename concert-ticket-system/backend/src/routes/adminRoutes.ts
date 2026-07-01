import { Router } from 'express';
import {
  getAdminStatsHandler,
  getActiveHoldsHandler,
  addSlotsHandler,
} from '../controllers/ticketController';
import { requireAdminKey } from '../middleware/adminAuth';

const router = Router();

router.use(requireAdminKey);

router.get('/stats', getAdminStatsHandler);
router.get('/holds', getActiveHoldsHandler);
// POST /api/admin/ticket-types/:id/slots — add available inventory to a ticket type
router.post('/ticket-types/:id/slots', addSlotsHandler);

export default router;
