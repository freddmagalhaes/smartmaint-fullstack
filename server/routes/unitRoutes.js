const express = require('express');
const { query, assertAffected, buildUpdate } = require('../utils/routeHelpers');
const { HttpError } = require('../utils/errorHandler');
const { assertWithinLimit } = require('../utils/plans');
const { audit } = require('../utils/audit');
const { ROLES, TENANT_ROLES, requireRole, tenantScope } = require('../middleware/rbac');
const { parse, z, text, optionalText, idParam } = require('../utils/validate');

const router = express.Router();

const unitSchema = z.object({ name: text(), code: optionalText(50) });

router.get('/units', requireRole(...TENANT_ROLES), tenantScope, async (req, res) => {
  res.json(await query(
    `SELECT u.id, u.name, u.code,
            (SELECT COUNT(*) FROM equipments e WHERE e.unit_id = u.id) AS equipments_count
     FROM units u WHERE u.tenant_id = ? ORDER BY u.name`,
    [req.tenantId]
  ));
});

router.post('/units', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const d = parse(unitSchema, req.body);
  await assertWithinLimit(req.tenantId, 'units');
  const result = await query('INSERT INTO units (tenant_id, name, code) VALUES (?, ?, ?)', [req.tenantId, d.name, d.code ?? null]);
  await audit(req, { action: 'create', entity: 'unit', entityId: result.insertId, changes: d });
  res.status(201).json({ id: result.insertId, ...d });
});

router.put('/units/:id', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const unitId = idParam(req);
  const d = parse(unitSchema.partial(), req.body);
  const { sql, params } = buildUpdate(d, ['name', 'code']);
  assertAffected(await query(`UPDATE units SET ${sql} WHERE id = ? AND tenant_id = ?`, [...params, unitId, req.tenantId]), 'Unidade não encontrada');
  await audit(req, { action: 'update', entity: 'unit', entityId: unitId, changes: d });
  res.json({ message: 'Unidade atualizada' });
});

router.delete('/units/:id', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const unitId = idParam(req);
  const [{ total }] = await query('SELECT COUNT(*) AS total FROM units WHERE tenant_id = ?', [req.tenantId]);
  if (Number(total) <= 1) throw new HttpError(400, 'O cliente precisa ter ao menos uma unidade');
  const [{ eqs }] = await query('SELECT COUNT(*) AS eqs FROM equipments WHERE unit_id = ? AND tenant_id = ?', [unitId, req.tenantId]);
  if (Number(eqs) > 0) throw new HttpError(409, 'Mova ou exclua os equipamentos desta unidade antes de excluí-la');
  assertAffected(await query('DELETE FROM units WHERE id = ? AND tenant_id = ?', [unitId, req.tenantId]), 'Unidade não encontrada');
  await audit(req, { action: 'delete', entity: 'unit', entityId: unitId });
  res.json({ message: 'Unidade excluída' });
});

module.exports = router;
