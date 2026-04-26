/**
 * Utilitários de Cálculo - SmartMaint
 * Implementação das fórmulas de Engenharia de Confiabilidade
 */

/**
 * Taxa de Falha (λ)
 * λ = Número de falhas / Tempo total de operação
 */
export const calculateLambda = (failureCount, totalOperatingTime) => {
  if (!totalOperatingTime || totalOperatingTime <= 0) return 0;
  return failureCount / totalOperatingTime;
};

/**
 * Tempo Médio Entre Falhas (MTBF)
 * MTBF = Tempo total de operação / Número de falhas
 */
export const calculateMTBF = (totalOperatingTime, failureCount) => {
  if (!failureCount || failureCount <= 0) return totalOperatingTime;
  return totalOperatingTime / failureCount;
};

/**
 * Tempo Médio de Reparo (MTTR)
 * MTTR = Tempo total de reparo / Número de reparos
 */
export const calculateMTTR = (totalRepairTime, repairCount) => {
  if (!repairCount || repairCount <= 0) return 0;
  return totalRepairTime / repairCount;
};

/**
 * Confiabilidade R(t)
 * R(t) = e^(-λ * t)
 */
export const calculateReliability = (lambda, t) => {
  return Math.exp(-lambda * t);
};

/**
 * Disponibilidade
 * Disponibilidade = MTBF / (MTBF + MTTR)
 */
export const calculateAvailability = (mtbf, mttr) => {
  if (mtbf + mttr === 0) return 0;
  return mtbf / (mtbf + mttr);
};

/**
 * FMEA (RPN - Número de Prioridade de Risco)
 * RPN = Severidade × Ocorrência × Detecção
 */
export const calculateRPN = (severity, occurrence, detection) => {
  return severity * occurrence * detection;
};

/**
 * Formatação de Percentual
 */
export const formatPercent = (value) => {
  return (value * 100).toFixed(2) + '%';
};

/**
 * Formatação de Horas
 */
export const formatHours = (value) => {
  return value.toFixed(1) + 'h';
};
