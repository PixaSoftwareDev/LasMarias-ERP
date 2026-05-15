import type { CreateMilkReceptionInput, MilkReception } from '@lasmarias/shared-schemas';
import type { ProducerDto } from './types';
import { api } from '@/lib/api-client';

export const receptionsApi = {
  list: () => api<MilkReception[]>('/api/milk-receptions'),
  create: (input: CreateMilkReceptionInput) =>
    api<MilkReception>('/api/milk-receptions', { method: 'POST', body: input }),
};

export const producersApi = {
  list: () => api<ProducerDto[]>('/api/producers'),
};
