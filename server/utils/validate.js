const { z } = require('zod');
const { HttpError } = require('./errorHandler');

/** Valida `data` com o schema zod; em caso de erro lança 400 com a primeira mensagem. */
const parse = (schema, data) => {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    const field = issue.path.join('.');
    throw new HttpError(400, field ? `Campo "${field}" inválido: ${issue.message}` : issue.message);
  }
  return result.data;
};

const text = (max = 255) => z.string().trim().min(1, 'obrigatório').max(max);
const optionalText = (max = 255) => z.string().trim().max(max).nullish();
const id = z.coerce.number().int().positive();
// Aceita 'YYYY-MM-DD' ou ISO completo e normaliza para 'YYYY-MM-DD'
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'data inválida').transform((v) => v.slice(0, 10));
const nonNegative = z.coerce.number().min(0);
const password = z.string().min(8, 'a senha deve ter ao menos 8 caracteres').max(128);
const email = z.string().trim().toLowerCase().email('e-mail inválido').max(255);

const idParam = (req) => parse(z.object({ id }), req.params).id;

module.exports = { z, parse, text, optionalText, id, date, nonNegative, password, email, idParam };
