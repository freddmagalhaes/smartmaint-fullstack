const express = require('express');
const router = express.Router();
const { query, isBackoffice } = require('../utils/routeHelpers');
const { handleQueryError } = require('../utils/errorHandler');
const { createCheckoutSession } = require('../utils/stripe');
const authMiddleware = require('../middleware/auth');

router.use(authMiddleware);

// --- INVOICES (Faturas) ---
router.get('/admin/invoices', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  const { tenant_id } = req.query;
  try {
    let sql = 'SELECT i.*, t.name as tenant_name FROM invoices i JOIN tenants t ON i.tenant_id = t.id';
    let params = [];
    if (tenant_id) {
      sql += ' WHERE i.tenant_id = ?';
      params.push(tenant_id);
    }
    sql += ' ORDER BY i.vencimento DESC';
    const rows = await query(sql, params);
    res.json(rows);
  } catch (err) { handleQueryError(res, err, 'Erro ao listar faturas'); }
});

router.post('/admin/invoices', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  const { tenant_id, valor, vencimento, status, mes_ref } = req.body;
  try {
    const result = await query(
      'INSERT INTO invoices (tenant_id, valor, vencimento, status, mes_ref) VALUES (?, ?, ?, ?, ?)',
      [tenant_id, valor, vencimento, status || 'Pendente', mes_ref]
    );
    res.json({ id: result.insertId, ...req.body });
  } catch (err) { handleQueryError(res, err, 'Erro ao criar fatura'); }
});

router.put('/admin/invoices/:id/status', async (req, res) => {
  if (!isBackoffice(req)) return res.status(403).json({ error: 'Proibido' });
  try {
    const { status } = req.body;
    await query('UPDATE invoices SET status = ? WHERE id = ?', [status, req.params.id]);
    res.json({ message: 'Fatura atualizada' });
  } catch (err) { handleQueryError(res, err, 'Erro ao atualizar fatura'); }
});

// --- PAYMENTS (STRIPE) ---
router.post('/billing/checkout', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const tenants = await query('SELECT * FROM tenants WHERE id = ?', [tenant_id]);
    if (tenants.length === 0) return res.status(404).json({ error: 'Tenant não encontrado' });
    const tenant = tenants[0];

    const invoiceId = req.body.invoice_id;
    let invoices = [];
    if (invoiceId) {
      invoices = await query('SELECT * FROM invoices WHERE id = ? AND tenant_id = ?', [invoiceId, tenant_id]);
    } else {
      invoices = await query('SELECT * FROM invoices WHERE tenant_id = ? AND status = "Pendente" ORDER BY vencimento ASC LIMIT 1', [tenant_id]);
    }

    if (invoices.length === 0) return res.status(400).json({ error: 'Nenhuma fatura pendente encontrada.' });
    
    const invoice = invoices[0];
    const url = await createCheckoutSession(tenant, invoice);
    res.json({ url });
  } catch (err) { handleQueryError(res, err, 'Falha ao processar checkout'); }
});

module.exports = router;
