import { Router } from 'express';

const router = Router();

// POST /api/ai/analyze - Claude API proxy (Phase 6)
router.post('/analyze', async (_req, res) => {
  res.status(501).json({
    error: 'AI analysis not yet implemented. Coming in Phase 6.',
  });
});

export default router;
