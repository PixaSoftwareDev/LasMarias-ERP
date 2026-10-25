import type { CreateMilkReceptionInput, UpdateMilkReceptionInput, MilkReception } from '@lasmarias/shared-schemas';
import type { ProducerDto } from './types';
import { api } from '@/lib/api-client';

export const receptionsApi = {
  list: () => api<MilkReception[]>('/api/milk-receptions'),
  get: (id: string) => api<MilkReception>(`/api/milk-receptions/${id}`),
  create: (input: CreateMilkReceptionInput) =>
    api<MilkReception>('/api/milk-receptions', { method: 'POST', body: input }),
  // Editar una recepción cargada mal. Si la leche ya se usó, el backend limita los litros
  // a lo no consumido y no toca los silos.
  update: (id: string, input: UpdateMilkReceptionInput) =>
    api<MilkReception>(`/api/milk-receptions/${id}`, { method: 'PATCH', body: input }),
  remove: (id: string) =>
    api<{ deleted: true; code: string }>(`/api/milk-receptions/${id}`, { method: 'DELETE' }),
};

export const producersApi = {
  list: () => api<ProducerDto[]>('/api/producers'),
  create: (input: { name: string; agreedPricePerLiter?: number }) =>
    api<ProducerDto>('/api/producers', { method: 'POST', body: input }),
};
