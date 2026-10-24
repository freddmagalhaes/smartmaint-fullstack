const fs = require('fs');
const path = require('path');
const { config } = require('../config');

/**
 * Armazenamento de arquivos enviados. Com S3_BUCKET definido usa o S3 (recomendado em produção,
 * pois o disco do container é perdido a cada deploy); caso contrário grava em disco local.
 */
let s3;
const getS3 = () => {
  if (!s3) {
    const { S3Client } = require('@aws-sdk/client-s3');
    s3 = new S3Client({ region: config.uploads.s3Region });
  }
  return s3;
};

const localPath = (key) => {
  const full = path.resolve(config.uploads.dir, key);
  if (!full.startsWith(path.resolve(config.uploads.dir) + path.sep)) throw new Error('Caminho de arquivo inválido');
  return full;
};

const save = async (key, buffer, contentType) => {
  if (config.uploads.s3Bucket) {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await getS3().send(new PutObjectCommand({ Bucket: config.uploads.s3Bucket, Key: key, Body: buffer, ContentType: contentType }));
    return;
  }
  const full = localPath(key);
  await fs.promises.mkdir(path.dirname(full), { recursive: true });
  await fs.promises.writeFile(full, buffer);
};

/** Retorna um stream legível do arquivo, ou null se não existir. */
const read = async (key) => {
  if (config.uploads.s3Bucket) {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    try {
      const obj = await getS3().send(new GetObjectCommand({ Bucket: config.uploads.s3Bucket, Key: key }));
      return obj.Body;
    } catch (err) {
      if (err.name === 'NoSuchKey') return null;
      throw err;
    }
  }
  const full = localPath(key);
  try {
    await fs.promises.access(full);
  } catch {
    return null;
  }
  return fs.createReadStream(full);
};

module.exports = { save, read };
