const handleQueryError = (res, err, defaultMessage = 'Erro interno no servidor') => {
  console.error('[DB Error]', err.message);
  // Em produção não retornamos o erro SQL
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ error: defaultMessage });
  }
  return res.status(500).json({ error: defaultMessage, details: err.message });
};

module.exports = { handleQueryError };
