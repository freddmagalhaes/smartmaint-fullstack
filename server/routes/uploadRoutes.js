const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const crypto = require('crypto');
const authMiddleware = require('../middleware/auth');

// Configuração do Multer para Uploads Seguros
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    // Usando randomUUID para garantir nomes únicos e difíceis de adivinhar
    const uniqueSuffix = crypto.randomUUID();
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname).toLowerCase());
  }
});

// Filtro para aceitar apenas imagens e documentos seguros
const fileFilter = (req, file, cb) => {
  const allowedExtensions = ['.png', '.jpg', '.jpeg', '.pdf', '.doc', '.docx'];
  const ext = path.extname(file.originalname).toLowerCase();
  
  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Extensão de arquivo não permitida. Apenas imagens e documentos são aceitos.'));
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 } // 5MB
});

// --- UPLOADS ---
router.post('/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  }
  res.json({ url: `/uploads/${req.file.filename}` });
});

// Handler de erros do Multer (opcional, para capturar fileFilter)
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message.includes('não permitida')) {
    return res.status(400).json({ error: err.message });
  }
  next(err);
});

module.exports = router;
