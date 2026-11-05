// Planos comerciais: Essencial, Profissional, Industrial e Corporativo, cobrança anual e recursos por plano.
//
// Os IDs técnicos (Starter, Pro, Enterprise) NÃO mudam: assinaturas no Stripe guardam o plan_id nos
// metadados e há clientes ligados a eles. O cliente só enxerga o nome.
//
// Os planos semeados na migration 004 só são reescritos se ainda estiverem como foram criados (sem preço,
// com os limites provisórios): se o Root já os editou no Backoffice, os valores dele são preservados.
module.exports = {
  id: '010_planos_comerciais',
  up: async (q, h) => {
    await h.addColumn('plans', 'price_annual', 'DECIMAL(10,2) NULL'); // total cobrado por ano
    await h.addColumn('plans', 'has_fmea', 'BOOLEAN NOT NULL DEFAULT TRUE');
    await h.addColumn('plans', 'has_simulator', 'BOOLEAN NOT NULL DEFAULT TRUE');
    await h.addColumn('plans', 'has_import', 'BOOLEAN NOT NULL DEFAULT TRUE');
    await h.addColumn('tenants', 'billing_cycle', "ENUM('mensal', 'anual') NOT NULL DEFAULT 'mensal'");

    await q(`UPDATE plans SET name = 'Essencial', price_monthly = 297, price_annual = 2964,
               max_users = 3, max_equipments = 50, max_units = 1, trial_days = 14,
               has_fmea = FALSE, has_simulator = FALSE, has_import = FALSE, sort_order = 1
             WHERE id = 'Starter' AND name = 'Starter' AND price_monthly = 0
               AND max_users = 5 AND max_equipments = 50 AND max_units = 1`);
    await q(`UPDATE plans SET name = 'Profissional', price_monthly = 697, price_annual = 6972,
               max_users = 10, max_equipments = 300, max_units = 1, trial_days = 14, sort_order = 2
             WHERE id = 'Pro' AND name = 'Pro' AND price_monthly = 0
               AND max_users = 20 AND max_equipments = 300 AND max_units = 3`);
    await q("UPDATE plans SET name = 'Corporativo', sort_order = 4 WHERE id = 'Enterprise' AND name = 'Enterprise'");
    await q(`INSERT IGNORE INTO plans (id, name, price_monthly, price_annual, max_users, max_equipments, max_units, trial_days, sort_order)
             VALUES ('Industrial', 'Industrial', 1697, 16968, 30, 1000, 3, 14, 3)`);
  },
};
