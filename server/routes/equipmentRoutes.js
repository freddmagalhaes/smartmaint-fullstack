const express = require('express');
const { query, assertEquipmentInTenant, assertAffected, buildUpdate } = require('../utils/routeHelpers');
const { ROLES, MANAGERS, TENANT_ROLES, requireRole, tenantScope } = require('../middleware/rbac');
const { parse, z, text, optionalText, id, date, nonNegative, idParam } = require('../utils/validate');

const router = express.Router();

const today = () => new Date().toISOString().slice(0, 10);
const imageUrl = z.string().trim().max(2000).regex(/^(\/uploads\/|https:\/\/)/, 'URL de imagem inválida').nullish();
const score = z.coerce.number().int().min(1).max(10);

// --- EQUIPAMENTOS ---
const equipmentSchema = z.object({
  name: text(),
  type: optionalText(100),
  model: optionalText(100),
  serie: optionalText(100),
  image: imageUrl,
  total_op_time: nonNegative.optional(),
  data_inicio: date.nullish(),
});

router.get('/equipments', requireRole(...TENANT_ROLES), tenantScope, async (req, res) => {
  res.json(await query('SELECT * FROM equipments WHERE tenant_id = ? ORDER BY name', [req.tenantId]));
});

router.post('/equipments', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const d = parse(equipmentSchema, req.body);
  const result = await query(
    'INSERT INTO equipments (tenant_id, name, type, model, serie, image, total_op_time, data_inicio) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [req.tenantId, d.name, d.type ?? null, d.model ?? null, d.serie ?? null, d.image ?? null, d.total_op_time ?? 0, d.data_inicio ?? null]
  );
  res.status(201).json({ id: result.insertId, ...d, tenant_id: req.tenantId });
});

router.put('/equipments/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const equipmentId = idParam(req);
  const d = parse(equipmentSchema.partial(), req.body);
  const { sql, params } = buildUpdate(d, ['name', 'type', 'model', 'serie', 'image', 'total_op_time', 'data_inicio']);
  assertAffected(await query(`UPDATE equipments SET ${sql} WHERE id = ? AND tenant_id = ?`, [...params, equipmentId, req.tenantId]), 'Equipamento não encontrado');
  res.json({ message: 'Atualizado com sucesso' });
});

router.delete('/equipments/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  assertAffected(await query('DELETE FROM equipments WHERE id = ? AND tenant_id = ?', [idParam(req), req.tenantId]), 'Equipamento não encontrado');
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
  res.json(await query('SELECT * FROM failures WHERE tenant_id = ? ORDER BY data_falha DESC, id DESC', [req.tenantId]));
});

router.post('/failures', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const d = parse(failureSchema, req.body);
  await assertEquipmentInTenant(d.equipment_id, req.tenantId);
  const result = await query(
    'INSERT INTO failures (tenant_id, equipment_id, descricao, tempo_operacao, data_falha) VALUES (?, ?, ?, ?, ?)',
    [req.tenantId, d.equipment_id, d.descricao, d.tempo_operacao, d.data_falha || today()]
  );
  res.status(201).json({ id: result.insertId, ...d, tenant_id: req.tenantId });
});

router.put('/failures/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  const failureId = idParam(req);
  const d = parse(failureSchema.partial(), req.body);
  if (d.equipment_id) await assertEquipmentInTenant(d.equipment_id, req.tenantId);
  const { sql, params } = buildUpdate(d, ['equipment_id', 'descricao', 'tempo_operacao', 'data_falha']);
  assertAffected(await query(`UPDATE failures SET ${sql} WHERE id = ? AND tenant_id = ?`, [...params, failureId, req.tenantId]), 'Falha não encontrada');
  res.json({ message: 'Atualizado com sucesso' });
});

router.delete('/failures/:id', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  assertAffected(await query('DELETE FROM failures WHERE id = ? AND tenant_id = ?', [idParam(req), req.tenantId]), 'Falha não encontrada');
  res.json({ message: 'Excluído com sucesso' });
});

// --- REPAROS ---
router.get('/repairs', requireRole(...MANAGERS), tenantScope, async (req, res) => {
  res.json(await query('SELECT * FROM repairs WHERE tenant_id = ? ORDER BY data_reparo DESC, id DESC', [req.tenantId]));
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
  res.json(await query('SELECT * FROM fmea WHERE tenant_id = ?', [req.tenantId]));
});

router.post('/fmea', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const d = parse(fmeaSchema, req.body);
  await assertEquipmentInTenant(d.equipment_id, req.tenantId);
  const result = await query(
    'INSERT INTO fmea (tenant_id, equipment_id, componente, modo_falha, severity, ocorrencia, deteccao) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [req.tenantId, d.equipment_id, d.componente, d.modo_falha, d.severity, d.ocorrencia, d.deteccao]
  );
  res.status(201).json({ id: result.insertId, ...d, tenant_id: req.tenantId });
});

router.put('/fmea/:id', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const fmeaId = idParam(req);
  const d = parse(fmeaSchema.partial(), req.body);
  if (d.equipment_id) await assertEquipmentInTenant(d.equipment_id, req.tenantId);
  const { sql, params } = buildUpdate(d, ['equipment_id', 'componente', 'modo_falha', 'severity', 'ocorrencia', 'deteccao']);
  assertAffected(await query(`UPDATE fmea SET ${sql} WHERE id = ? AND tenant_id = ?`, [...params, fmeaId, req.tenantId]), 'Item FMEA não encontrado');
  res.json({ message: 'Atualizado com sucesso' });
});

router.delete('/fmea/:id', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  assertAffected(await query('DELETE FROM fmea WHERE id = ? AND tenant_id = ?', [idParam(req), req.tenantId]), 'Item FMEA não encontrado');
  res.json({ message: 'Excluído com sucesso' });
});

module.exports = router;
