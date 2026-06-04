const express = require('express');
const router = express.Router();

const authRoutes = require('./authRoutes');
const tenantRoutes = require('./tenantRoutes');
const equipmentRoutes = require('./equipmentRoutes');
const workOrderRoutes = require('./workOrderRoutes');
const inventoryRoutes = require('./inventoryRoutes');
const preventiveRoutes = require('./preventiveRoutes');
const uploadRoutes = require('./uploadRoutes');
const billingRoutes = require('./billingRoutes');

router.use(authRoutes);
router.use(tenantRoutes);
router.use(equipmentRoutes);
router.use(workOrderRoutes);
router.use(inventoryRoutes);
router.use(preventiveRoutes);
router.use(uploadRoutes);
router.use(billingRoutes);

module.exports = router;
