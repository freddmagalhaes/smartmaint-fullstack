const express = require('express');
const writeExcelModule = require('write-excel-file/node');
const db = require('../db');
const { ROLES, requireRole, tenantScope } = require('../middleware/rbac');
const { audit } = require('../utils/audit');

const router = express.Router();
const writeExcelFile = writeExcelModule.default || writeExcelModule;

/**
 * Cada aba da planilha: título e SQL com colunas já nomeadas em português.
 * Nunca inclui senhas, tokens nem identificadores internos de pagamento.
 */
const SHEETS = [
  ['Empresa', `SELECT name AS Nome, razao_social AS "Razão social", cnpj AS CNPJ, contact_email AS "E-mail", contact_phone AS Telefone,
     email_financeiro AS "E-mail financeiro", cep AS CEP, logradouro AS Logradouro, numero AS "Número", complemento AS Complemento,
     bairro AS Bairro, cidade AS Cidade, uf AS UF, plan_type AS Plano, status AS Status, created_at AS "Cliente desde"
     FROM tenants WHERE id = ?`],
  ['Unidades', 'SELECT id AS ID, name AS Nome, code AS "Código", created_at AS "Criada em" FROM units WHERE tenant_id = ? ORDER BY id'],
  ['Usuários', `SELECT id AS ID, name AS Nome, email AS "E-mail", role AS Perfil, created_at AS "Criado em"
     FROM users WHERE tenant_id = ? ORDER BY id`],
  ['Equipamentos', `SELECT e.id AS ID, e.name AS Nome, e.type AS Tipo, e.model AS Modelo, e.serie AS "Série", u.name AS Unidade,
     e.total_op_time AS "Horas de operação", e.data_inicio AS "Data de início", e.created_at AS "Criado em"
     FROM equipments e LEFT JOIN units u ON u.id = e.unit_id WHERE e.tenant_id = ? ORDER BY e.id`],
  ['Ordens de serviço', `SELECT w.id AS ID, w.titulo AS "Título", eq.name AS Equipamento, w.tipo AS Tipo, w.prioridade AS Prioridade,
     w.status AS Status, w.responsavel AS "Responsável", w.descricao AS "Descrição", w.tempo_reparo AS "Tempo de reparo (h)",
     w.data_criacao AS "Aberta em", w.data_conclusao AS "Concluída em"
     FROM work_orders w LEFT JOIN equipments eq ON eq.id = w.equipment_id WHERE w.tenant_id = ? ORDER BY w.id`],
  ['Comentários das O.S.', `SELECT work_order_id AS "O.S.", user_name AS Autor, body AS "Comentário", created_at AS Data
     FROM work_order_comments WHERE tenant_id = ? ORDER BY id`],
  ['Anexos das O.S.', `SELECT work_order_id AS "O.S.", filename AS Arquivo, content_type AS Tipo, size_bytes AS "Tamanho (bytes)",
     uploaded_by_name AS "Enviado por", created_at AS Data
     FROM work_order_attachments WHERE tenant_id = ? ORDER BY id`],
  ['Peças usadas', `SELECT work_order_id AS "O.S.", item_name AS "Peça", quantity AS Quantidade, unit_price AS "Preço unitário", created_at AS Data
     FROM work_order_parts WHERE tenant_id = ? ORDER BY id`],
  ['Falhas', `SELECT f.id AS ID, eq.name AS Equipamento, f.descricao AS "Descrição", f.tempo_operacao AS "Tempo de operação (h)", f.data_falha AS Data
     FROM failures f LEFT JOIN equipments eq ON eq.id = f.equipment_id WHERE f.tenant_id = ? ORDER BY f.id`],
  ['Reparos', `SELECT r.id AS ID, eq.name AS Equipamento, r.tipo AS Tipo, r.tempo_reparo AS "Tempo de reparo (h)", r.data_reparo AS Data,
     r.work_order_id AS "O.S."
     FROM repairs r LEFT JOIN equipments eq ON eq.id = r.equipment_id WHERE r.tenant_id = ? ORDER BY r.id`],
  ['FMEA', `SELECT eq.name AS Equipamento, f.componente AS Componente, f.modo_falha AS "Modo de falha", f.severity AS Severidade,
     f.ocorrencia AS "Ocorrência", f.deteccao AS "Detecção", f.severity * f.ocorrencia * f.deteccao AS RPN
     FROM fmea f LEFT JOIN equipments eq ON eq.id = f.equipment_id WHERE f.tenant_id = ? ORDER BY f.id`],
  ['Planos preventivos', `SELECT p.id AS ID, p.title AS "Título", eq.name AS Equipamento, p.description AS "Descrição",
     p.interval_days AS "Intervalo (dias)", p.last_executed AS "Última execução", p.next_due AS "Próximo vencimento", p.status AS Status
     FROM preventive_plans p LEFT JOIN equipments eq ON eq.id = p.equipment_id WHERE p.tenant_id = ? ORDER BY p.id`],
  ['Estoque', `SELECT i.id AS ID, i.name AS "Peça", i.sku AS SKU, u.name AS Unidade, i.quantity AS Quantidade,
     i.min_quantity AS "Estoque mínimo", i.unit_price AS "Preço unitário"
     FROM inventory i LEFT JOIN units u ON u.id = i.unit_id WHERE i.tenant_id = ? ORDER BY i.id`],
  ['Movimentações', `SELECT m.created_at AS Data, i.name AS "Peça", m.type AS Tipo, m.quantity AS Quantidade, m.balance_after AS "Saldo",
     m.work_order_id AS "O.S.", m.user_name AS "Usuário", m.note AS "Observação"
     FROM inventory_movements m LEFT JOIN inventory i ON i.id = m.inventory_id WHERE m.tenant_id = ? ORDER BY m.id`],
  ['Faturas', `SELECT mes_ref AS "Referência", valor AS Valor, vencimento AS Vencimento, status AS Status, paid_at AS "Paga em"
     FROM invoices WHERE tenant_id = ? ORDER BY vencimento`],
];

/** Converte as linhas do banco no formato da planilha (cabeçalho + valores). */
const toSheetData = (rows, columns) => [
  columns.map((c) => ({ value: c, fontWeight: 'bold' })),
  ...rows.map((row) => columns.map((c) => {
    const value = row[c];
    if (value === null || value === undefined) return null;
    if (value instanceof Date) return { value, type: Date, format: 'dd/mm/yyyy hh:mm' };
    if (typeof value === 'number') return { value, type: Number };
    // DECIMAL vem como texto do mysql2
    if (typeof value === 'string' && /^-?\d+\.\d+$/.test(value)) return { value: Number(value), type: Number };
    return { value: String(value), type: String };
  })),
];

/**
 * Exportação completa dos dados do cliente em .xlsx (portabilidade, LGPD art. 18, V).
 * Fotos e anexos ficam listados; os arquivos continuam disponíveis no sistema.
 */
router.get('/export', requireRole(ROLES.ADMIN), tenantScope, async (req, res) => {
  const sheets = [];
  for (const [title, sql] of SHEETS) {
    const [rows, fields] = await db.query(sql, [req.tenantId]);
    const columns = fields.map((f) => f.name);
    sheets.push({ sheet: title, data: toSheetData(rows, columns), stickyRowsCount: 1, columns: columns.map(() => ({ width: 22 })) });
  }
  const buffer = await writeExcelFile(sheets).toBuffer();

  await audit(req, { action: 'export', entity: 'tenant', entityId: req.tenantId });
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="smartmaint-${req.tenantId}-${date}.xlsx"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(buffer);
});

module.exports = router;
