const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { notFound } = require('../utils/errorHandler');

const router = express.Router();

// Rotas públicas
router.use(require('./authRoutes').router);

// Daqui em diante todas as rotas exigem autenticação
router.use(authMiddleware);
router.use(require('./accountRoutes'));
router.use(require('./tenantRoutes'));
router.use(require('./equipmentRoutes'));
router.use(require('./workOrderRoutes'));
router.use(require('./inventoryRoutes'));
router.use(require('./preventiveRoutes'));
router.use(require('./uploadRoutes').apiRouter);
router.use(require('./billingRoutes').router);

router.use(notFound);

module.exports = router;
