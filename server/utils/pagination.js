const { query } = require('./routeHelpers');
const { parse, z } = require('./validate');

const MAX_PAGE_SIZE = 200;

const pageSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(50),
  q: z.string().trim().max(100).optional(),
});

/** Lê page, pageSize e q da query string. */
const pageParams = (req) => parse(pageSchema, req.query);

/**
 * Executa uma listagem paginada. `where` é uma lista de condições SQL com `?`
 * e `params` os valores na mesma ordem. Retorna { items, total, page, pageSize }.
 */
const paginate = async ({ select, from, where = [], params = [], orderBy, page, pageSize }) => {
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [{ total }] = await query(`SELECT COUNT(*) AS total FROM ${from} ${whereSql}`, params);
  const items = await query(
    `SELECT ${select} FROM ${from} ${whereSql} ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
    [...params, pageSize, (page - 1) * pageSize]
  );
  return { items, total: Number(total), page, pageSize };
};

/** Escapa curingas do LIKE para buscas por texto. */
const like = (term) => `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

module.exports = { pageParams, paginate, like, MAX_PAGE_SIZE };
