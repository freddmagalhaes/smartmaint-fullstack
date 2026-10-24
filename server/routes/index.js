const express = require('express');
const { authMiddleware, requireLegalAcceptance, requireSubscription } = require('../middleware/auth');
const { notFound } = require('../utils/errorHandler');

const router = express.Router();

// Rotas públicas
router.use(require('./authRoutes').router);
router.use(require('./signupRoutes').publicRouter);

// Daqui em diante todas as rotas exigem autenticação
router.use(authMiddleware);
router.use(require('./accountRoutes'));
router.use(require('./signupRoutes').legalRouter);

// Demais rotas: só depois de aceitar os documentos legais; conta sem assinatura vê só o faturamento
router.use(requireLegalAcceptance);
router.use(requireSubscription);
router.use(require('./exportRoutes'));
router.use(require('./tenantRoutes'));
router.use(require('./equipmentRoutes'));
router.use(require('./workOrderRoutes'));
router.use(require('./inventoryRoutes'));
router.use(require('./preventiveRoutes'));
router.use(require('./uploadRoutes').apiRouter);
router.use(require('./billingRoutes').router);
router.use(require('./unitRoutes'));
router.use(require('./dashboardRoutes'));
router.use(require('./auditRoutes'));
router.use(require('./planRoutes'));
router.use(require('./fiscalRoutes'));

router.use(notFound);

module.exports = router;
