const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const storage = require('../utils/storage');
const { HttpError } = require('../utils/errorHandler');
const { MANAGERS, requireRole, tenantScope } = require('../middleware/rbac');

// Tipos aceitos, identificados pelo conteúdo do arquivo (assinatura), não pela extensão enviada
const FILE_TYPES = [
  { ext: 'png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: 'jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: 'webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP' },
  { ext: 'pdf', mime: 'application/pdf', test: (b) => b.subarray(0, 5).toString() === '%PDF-' },
];
const MIME_BY_EXT = Object.fromEntries(FILE_TYPES.map((t) => [t.ext, t.mime]));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

/**
 * Valida o arquivo pelo conteúdo e grava na pasta do cliente com nome aleatório.
 * Retorna { url, contentType, size }. Usado no upload avulso e nos anexos de O.S.
 */
const saveUploadedFile = async (file, tenantId) => {
  if (!file) throw new HttpError(400, 'Nenhum arquivo enviado');
  const type = FILE_TYPES.find((t) => t.test(file.buffer));
  if (!type) throw new HttpError(400, 'Tipo de arquivo não permitido. Envie PNG, JPG, WEBP ou PDF.');
  // Nome aleatório (UUID) torna o endereço impossível de adivinhar; a pasta separa os arquivos por cliente
  const key = `${tenantId}/${crypto.randomUUID()}.${type.ext}`;
  await storage.save(key, file.buffer, type.mime);
  return { url: `/uploads/${key}`, contentType: type.mime, size: file.size };
};

// Rotas autenticadas (montadas em /api)
const apiRouter = express.Router();

apiRouter.post('/upload', requireRole(...MANAGERS), tenantScope, upload.single('file'), async (req, res) => {
  const { url } = await saveUploadedFile(req.file, req.tenantId);
  res.status(201).json({ url });
});

// Entrega dos arquivos (montada em /uploads, pública para funcionar em <img src>)
const fileRouter = express.Router();
const SAFE_SEGMENT = /^[a-z0-9][a-z0-9._-]{0,99}$/i;

const sendFile = async (key, res) => {
  const ext = key.split('.').pop().toLowerCase();
  const mime = MIME_BY_EXT[ext === 'jpeg' ? 'jpg' : ext];
  if (!mime) return res.status(404).end();
  const stream = await storage.read(key);
  if (!stream) return res.status(404).end();
  res.set({
    'Content-Type': mime,
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, max-age=86400',
    'Content-Security-Policy': "default-src 'none'",
  });
  stream.on('error', () => res.destroy());
  stream.pipe(res);
};

fileRouter.get('/:tenant/:file', async (req, res) => {
  const { tenant, file } = req.params;
  if (!SAFE_SEGMENT.test(tenant) || !SAFE_SEGMENT.test(file) || file.includes('..')) return res.status(404).end();
  await sendFile(`${tenant}/${file}`, res);
});

// Arquivos enviados antes da separação por cliente (uploads/file-<uuid>.ext)
fileRouter.get('/:file', async (req, res) => {
  const { file } = req.params;
  if (!/^file-[0-9a-f-]{36}\.(png|jpe?g|pdf)$/i.test(file)) return res.status(404).end();
  await sendFile(file, res);
});

module.exports = { apiRouter, fileRouter, upload, saveUploadedFile };
