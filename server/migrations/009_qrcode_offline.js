// Bloco 6: O.S. abertas sem internet chegam com um identificador gerado no aparelho
// (client_ref). Se o envio for repetido, a mesma O.S. é devolvida em vez de criar outra.
module.exports = {
  id: '009_qrcode_offline',
  up: async (q, h) => {
    await h.addColumn('work_orders', 'client_ref', 'VARCHAR(40) NULL');
    const rows = await q(
      "SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'work_orders' AND INDEX_NAME = 'uq_wo_client_ref'"
    );
    if (rows.length === 0) await q('ALTER TABLE work_orders ADD UNIQUE KEY uq_wo_client_ref (tenant_id, client_ref)');
  },
};
