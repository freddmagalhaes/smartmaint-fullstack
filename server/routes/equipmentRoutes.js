const express = require('express');
const {
  query, assertEquipmentInTenant, assertUnitInTenant, defaultUnitId, assertAffected, buildUpdate,
} = require('../utils/routeHelpers');
const { pageParams, paginate, like } = require('../utils/pagination');
const { assertWithinLimit } = require('../utils/plans');
const { audit } = require('../utils/audit');
const { ROLES, MANAGERS, TENANT_ROLES, requireRole, tenantScope } = require('../middleware/rbac');
const { parse, z, text, optionalText, id, date, nonNegative, idParam } = require('../utils/validate');

const router = express.Router();

const today = () => new Date().toISOString().slice(0, 10);
const imageUrl = z.string().trim().max(2000).regex(/^(\/uploads\/|https:\/\/)/, 'URL de imagem inválida').nullish();
const score = z.coerce.number().int().min(1).max(10);

// Filtros comuns às listas ligadas a equipamentos
const filterSchema = z.object({
  unit_id: id.optional(),
  equipment_id: id.optional(),
  from: date.optional(),
  to: date.optional(),
});

/** Condições SQL para filtrar registros de equipamentos por unidade/equipamento (`alias` = tabela da lista). */
const equipmentFilters = (alias, f, where, params) => {
  if (f.equipment_id) {
    where.push(`${alias}.equipment_id = ?`);
    params.push(f.equipment_id);
  }
  if (f.unit_id) {
    where.push(`${alias}.equipment_id IN (SELECT id FROM equipments WHERE unit_id = ?)`);
    params.push(f.unit_id);
  }
};

// --- EQUIPAMENTOS ---
const equipmentSchema = z.object({
  unit_id: id.optional(),
  name: text(),
  type: optionalText(100),
  model: optionalText(100),
  serie: optionalText(100),
  image: imageUrl,
  total_op_time: nonNegative.optional(),
  data_inicio: date.nullish(),
});

router.get('/equipments', requireRole(...TENANT_ROLES), tenantScope, async (req, res) => {
  const { page, pageSize, q } = pageParams(req);
  const f = parse(filterSchema.extend({ type: z.string().max(100).optional() }), req.query);
  const where = ['e.tenant_id = ?'];
  const params = [req.tenantId];
  if (f.unit_id) { where.push('e.unit_id = ?'); params.push(f.unit_id); }
  if (f.type) { where.push('e.type = ?'); params.push(f.type); }
  if (q) { where.push('(e.name LIKE ? OR e.serie LIKE ? OR e.model LIKE ?)'); params.push(like(q), like(q), like(q)); }
  res.json(await paginate({
    select: `e.*, u.name AS unit_name,
      (SELECT COUNT(*) FROM failures f WHERE f.equipment_id = e.id) AS failures_count,
      (SELECT COUNT(*) FROM work_orders w WHERE w.equipment_id = e.id AND w.status = 'Em Execução') AS running_os_count`,
    from: 'equipments e JOIN units u ON u.id = e.unit_id',
    where, params, orderBy: 'e.name, e.id', page, pageSize,
  }));
});

// Lista enxuta para campos de seleção e para o simulador (sem paginação, limitada)
router.get('/equipments/options', requireRole(...TENANT_ROLES), tenantScope, async (req, res) => {
  const f = parse(filterSchema, req.query);
  const where = ['e.tenant_id = ?'];
  const params = [req.tenantId];
  if (f.unit_id) { where.push('e.unit_id = ?'); params.push(f.unit_id); }
  res.json(await query(
    `SELECT e.id, e.name, e.unit_id, e.total_op_time,
       (SELECT COUNT(*) FROM failures f WHERE f.equipment_id = e.id) AS failures_count
     FROM equipments e WHERE ${where.join(' AND ')} ORDER BY e.name LIMIT 5000`,
    params
  ));
});

router.post('/equipments', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const d = parse(equipmentSchema, req.body);
  await assertWithinLimit(req.tenantId, 'equipments');
  const unitId = d.unit_id ?? await defaultUnitId(req.tenantId);
  await assertUnitInTenant(unitId, req.tenantId);
  const result = await query(
    'INSERT INTO equipments (tenant_id, unit_id, name, type, model, serie, image, total_op_time, data_inicio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [req.tenantId, unitId, d.name, d.type ?? null, d.model ?? null, d.serie ?? null, d.image ?? null, d.total_op_time ?? 0, d.data_inicio ?? null]
  );
  await audit(req, { action: 'create', entity: 'equipment', entityId: result.insertId, changes: d });
  res.status(201).json({ id: result.insertId, ...d, unit_id: unitId, tenant_id: req.tenantId });
});

router.put('/equipments/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const equipmentId = idParam(req);
  const d = parse(equipmentSchema.partial(), req.body);
  if (d.unit_id) await assertUnitInTenant(d.unit_id, req.tenantId);
  const { sql, params } = buildUpdate(d, ['unit_id', 'name', 'type', 'model', 'serie', 'image', 'total_op_time', 'data_inicio']);
  assertAffected(await query(`UPDATE equipments SET ${sql} WHERE id = ? AND tenant_id = ?`, [...params, equipmentId, req.tenantId]), 'Equipamento não encontrado');
  await audit(req, { action: 'update', entity: 'equipment', entityId: equipmentId, changes: d });
  res.json({ message: 'Atualizado com sucesso' });
});

router.delete('/equipments/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const equipmentId = idParam(req);
  const [eq] = await query('SELECT name FROM equipments WHERE id = ? AND tenant_id = ?', [equipmentId, req.tenantId]);
  assertAffected(await query('DELETE FROM equipments WHERE id = ? AND tenant_id = ?', [equipmentId, req.tenantId]), 'Equipamento não encontrado');
  await audit(req, { action: 'delete', entity: 'equipment', entityId: equipmentId, changes: { name: eq?.name } });
  res.json({ message: 'Excluído com sucesso' });
});

// --- FALHAS ---
const failureSchema = z.object({
  equipment_id: id,
  descricao: text(5000),
  tempo_operacao: nonNegative,
  data_falha: date.nullish(),
});

router.get('/failures', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const { page, pageSize, q } = pageParams(req);
  const f = parse(filterSchema, req.query);
  const where = ['f.tenant_id = ?'];
  const params = [req.tenantId];
  equipmentFilters('f', f, where, params);
  if (f.from) { where.push('f.data_falha >= ?'); params.push(f.from); }
  if (f.to) { where.push('f.data_falha <= ?'); params.push(f.to); }
  if (q) { where.push('f.descricao LIKE ?'); params.push(like(q)); }
  res.json(await paginate({
    select: 'f.*, e.name AS equipment_name, e.image AS equipment_image',
    from: 'failures f JOIN equipments e ON e.id = f.equipment_id',
    where, params, orderBy: 'f.data_falha DESC, f.id DESC', page, pageSize,
  }));
});

router.post('/failures', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const d = parse(failureSchema, req.body);
  await assertEquipmentInTenant(d.equipment_id, req.tenantId);
  const result = await query(
    'INSERT INTO failures (tenant_id, equipment_id, descricao, tempo_operacao, data_falha) VALUES (?, ?, ?, ?, ?)',
    [req.tenantId, d.equipment_id, d.descricao, d.tempo_operacao, d.data_falha || today()]
  );
  await audit(req, { action: 'create', entity: 'failure', entityId: result.insertId, changes: d });
  res.status(201).json({ id: result.insertId, ...d, tenant_id: req.tenantId });
});

router.put('/failures/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const failureId = idParam(req);
  const d = parse(failureSchema.partial(), req.body);
  if (d.equipment_id) await assertEquipmentInTenant(d.equipment_id, req.tenantId);
  const { sql, params } = buildUpdate(d, ['equipment_id', 'descricao', 'tempo_operacao', 'data_falha']);
  assertAffected(await query(`UPDATE failures SET ${sql} WHERE id = ? AND tenant_id = ?`, [...params, failureId, req.tenantId]), 'Falha não encontrada');
  await audit(req, { action: 'update', entity: 'failure', entityId: failureId, changes: d });
  res.json({ message: 'Atualizado com sucesso' });
});

router.delete('/failures/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const failureId = idParam(req);
  assertAffected(await query('DELETE FROM failures WHERE id = ? AND tenant_id = ?', [failureId, req.tenantId]), 'Falha não encontrada');
  await audit(req, { action: 'delete', entity: 'failure', entityId: failureId });
  res.json({ message: 'Excluído com sucesso' });
});

// --- REPAROS ---
router.get('/repairs', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const { page, pageSize } = pageParams(req);
  const f = parse(filterSchema, req.query);
  const where = ['r.tenant_id = ?'];
  const params = [req.tenantId];
  equipmentFilters('r', f, where, params);
  if (f.from) { where.push('r.data_reparo >= ?'); params.push(f.from); }
  if (f.to) { where.push('r.data_reparo <= ?'); params.push(f.to); }
  res.json(await paginate({
    select: 'r.*, e.name AS equipment_name, e.image AS equipment_image',
    from: 'repairs r JOIN equipments e ON e.id = r.equipment_id',
    where, params, orderBy: 'r.data_reparo DESC, r.id DESC', page, pageSize,
  }));
});

// --- FMEA ---
const fmeaSchema = z.object({
  equipment_id: id,
  componente: text(),
  modo_falha: text(),
  severity: score,
  ocorrencia: score,
  deteccao: score,
});

router.get('/fmea', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const { page, pageSize, q } = pageParams(req);
  const f = parse(filterSchema, req.query);
  const where = ['m.tenant_id = ?'];
  const params = [req.tenantId];
  equipmentFilters('m', f, where, params);
  if (q) { where.push('(m.componente LIKE ? OR m.modo_falha LIKE ?)'); params.push(like(q), like(q)); }
  res.json(await paginate({
    select: 'm.*, e.name AS equipment_name, (m.severity * m.ocorrencia * m.deteccao) AS rpn',
    from: 'fmea m JOIN equipments e ON e.id = m.equipment_id',
    where, params, orderBy: 'rpn DESC, m.id DESC', page, pageSize,
  }));
});

router.post('/fmea', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const d = parse(fmeaSchema, req.body);
  await assertEquipmentInTenant(d.equipment_id, req.tenantId);
  const result = await query(
    'INSERT INTO fmea (tenant_id, equipment_id, componente, modo_falha, severity, ocorrencia, deteccao) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.tenantId, d.equipment_id, d.componente, d.modo_falha, d.severity, d.ocorrencia, d.deteccao]
  );
  await audit(req, { action: 'create', entity: 'fmea', entityId: result.insertId, changes: d });
  res.status(201).json({ id: result.insertId, ...d, tenant_id: req.tenantId });
});

router.put('/fmea/:id', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const fmeaId = idParam(req);
  const d = parse(fmeaSchema.partial(), req.body);
  if (d.equipment_id) await assertEquipmentInTenant(d.equipment_id, req.tenantId);
  const { sql, params } = buildUpdate(d, ['equipment_id', 'componente', 'modo_falha', 'severity', 'ocorrencia', 'deteccao']);
  assertAffected(await query(`UPDATE fmea SET ${sql} WHERE id = ? AND tenant_id = ?`, [...params, fmeaId, req.tenantId]), 'Item FMEA não encontrado');
  await audit(req, { action: 'update', entity: 'fmea', entityId: fmeaId, changes: d });
  res.json({ message: 'Atualizado com sucesso' });
});

router.delete('/fmea/:id', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const fmeaId = idParam(req);
  assertAffected(await query('DELETE FROM fmea WHERE id = ? AND tenant_id = ?', [fmeaId, req.tenantId]), 'Item FMEA não encontrado');
  await audit(req, { action: 'delete', entity: 'fmea', entityId: fmeaId });
  res.json({ message: 'Excluído com sucesso' });
});

module.exports = router;
