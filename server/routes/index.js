const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const signupRoutes = require('./signupRoutes');
const subscriptionRoutes = require('./subscriptionRoutes');
const tenantRoutes = require('./tenantRoutes');
const equipmentRoutes = require('./equipmentRoutes');
const workOrderRoutes = require('./workOrderRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const preventiveRoutes = require('./preventiveRoutes');
const uploadRoutes = require('./uploadRoutes');
const billingRoutes = require('./billingRoutes');
const planRoutes = require('./planRoutes');
const importRoutes = require('./importRoutes');

router.use(authRoutes);
router.use(signupRoutes);
router.use(subscriptionRoutes); // antes dos demais: aceita o token restrito de faturamento
router.use(tenantRoutes);
router.use(importRoutes);
router.use(equipmentRoutes);
router.use(workOrderRoutes);
router.use(inventoryRoutes);
router.use(preventiveRoutes);
router.use(uploadRoutes);
router.use(billingRoutes);
router.use(planRoutes);

module.exports = router;
