import type { CreateMilkReceptionInput, MilkReception } from '@lasmarias/shared-schemas';
import type { ProducerDto } from './types';
import { api } from '@/lib/api-client';

export const receptionsApi = {
  list: () => api<MilkReception[]>('/api/milk-receptions'),
  create: (input: CreateMilkReceptionInput) =>
    api<MilkReception>('/api/milk-receptions', { method: 'POST', body: input }),
  remove: (id: string) =>
    api<{ deleted: true; code: string }>(`/api/milk-receptions/${id}`, { method: 'DELETE' }),
};

export const producersApi = {
  list: () => api<ProducerDto[]>('/api/producers'),
  create: (input: { name: string; agreedPricePerLiter?: number }) =>
    api<ProducerDto>('/api/producers', { method: 'POST', body: input }),
};
