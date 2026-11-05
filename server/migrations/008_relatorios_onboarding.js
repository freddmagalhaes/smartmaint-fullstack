// Bloco 5: guia de primeiros passos (o administrador pode ocultá-lo) e índices dos relatórios.
module.exports = {
  id: '008_relatorios_onboarding',
  up: async (q, h) => {
    await h.addColumn('tenants', 'onboarding_dismissed_at', 'DATETIME NULL');
    // Relatórios filtram por período
    await h.addIndex('work_orders', 'idx_wo_tenant_created', '(tenant_id, data_criacao)');
    await h.addIndex('failures', 'idx_failures_equipment_date', '(equipment_id, data_falha)');
    await h.addIndex('repairs', 'idx_repairs_equipment_date', '(equipment_id, data_reparo)');
  },
};
