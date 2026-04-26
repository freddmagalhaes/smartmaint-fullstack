export const MOCK_EQUIPMENTS = [
  // Empresa DELP
  { id: 1, tenant_id: 'delp', name: 'Compressor Atlas DELP', type: 'Pneumático', model: 'GA37', serie: 'DELP-001', data_inicio: '2023-01-15', total_op_time: 8500, image: 'https://images.unsplash.com/photo-1581092160562-40aa08e78837?q=80&w=300&h=200&auto=format&fit=crop' },
  { id: 2, tenant_id: 'delp', name: 'Bomba Hidráulica DELP', type: 'Hidráulico', model: 'KSB', serie: 'DELP-002', data_inicio: '2023-03-10', total_op_time: 6200, image: 'https://images.unsplash.com/photo-1590950669791-ee97852c496d?q=80&w=300&h=200&auto=format&fit=crop' },
  
  // Empresa Stellantis
  { id: 3, tenant_id: 'stellantis', name: 'Robô de Solda Stellantis', type: 'Robótica', model: 'KUKA KR210', serie: 'STELL-99', data_inicio: '2023-06-20', total_op_time: 4100, image: 'https://images.unsplash.com/photo-1537462715879-360eeb61a0ad?q=80&w=300&h=200&auto=format&fit=crop' },
  { id: 4, tenant_id: 'stellantis', name: 'Prensa Hidráulica Stellantis', type: 'Mecânico', model: 'Schuler', serie: 'STELL-100', data_inicio: '2024-01-05', total_op_time: 2100, image: 'https://images.unsplash.com/photo-1565608438257-fac3c27beb36?q=80&w=300&h=200&auto=format&fit=crop' },
];

export const MOCK_FAILURES = [
  { id: 1, tenant_id: 'delp', equipment_id: 1, data_falha: '2023-05-12', tempo_operacao: 2800, descricao: 'Vazamento de óleo DELP' },
  { id: 2, tenant_id: 'stellantis', equipment_id: 3, data_falha: '2023-11-20', tempo_operacao: 4500, descricao: 'Falha de junta robótica Stellantis' },
];

export const MOCK_REPAIRS = [
  { id: 1, tenant_id: 'delp', equipment_id: 1, data_reparo: '2023-05-13', tempo_reparo: 4.5, tipo: 'Corretiva' },
  { id: 2, tenant_id: 'stellantis', equipment_id: 3, data_reparo: '2023-11-21', tempo_reparo: 12.0, tipo: 'Corretiva' },
];

export const MOCK_FMEA = [
  { id: 1, tenant_id: 'delp', equipment_id: 1, componente: 'Motor', modo_falha: 'Queima', severidade: 9, ocorrencia: 3, deteccao: 2 },
  { id: 2, tenant_id: 'stellantis', equipment_id: 3, componente: 'Braço', modo_falha: 'Desgaste', severidade: 8, ocorrencia: 4, deteccao: 3 },
];
