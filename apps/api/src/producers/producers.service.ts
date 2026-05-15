import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProducerEntity } from './producer.entity';

export interface ProducerDto {
  id: string;
  name: string;
  taxId?: string;
  phone?: string;
  address?: string;
  city?: string;
  agreedPricePerLiter?: number;
  notes?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProducerInput {
  name: string;
  taxId?: string;
  phone?: string;
  address?: string;
  city?: string;
  agreedPricePerLiter?: number;
  notes?: string;
}

@Injectable()
export class ProducersService {
  constructor(
    @InjectRepository(ProducerEntity)
    private readonly repo: Repository<ProducerEntity>,
  ) {}

  async list(): Promise<ProducerDto[]> {
    const rows = await this.repo.find({ where: { isActive: true }, order: { name: 'ASC' } });
    return rows.map((r) => this.toDto(r));
  }

  async get(id: string): Promise<ProducerEntity> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException('Productor no encontrado');
    return p;
  }

  async create(input: CreateProducerInput): Promise<ProducerDto> {
    const entity = this.repo.create({
      name: input.name,
      taxId: input.taxId ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      agreedPricePerLiter: input.agreedPricePerLiter != null ? String(input.agreedPricePerLiter) : null,
      notes: input.notes ?? null,
      isActive: true,
    });
    return this.toDto(await this.repo.save(entity));
  }

  toDto(e: ProducerEntity): ProducerDto {
    return {
      id: e.id,
      name: e.name,
      taxId: e.taxId ?? undefined,
      phone: e.phone ?? undefined,
      address: e.address ?? undefined,
      city: e.city ?? undefined,
      agreedPricePerLiter: e.agreedPricePerLiter ? Number(e.agreedPricePerLiter) : undefined,
      notes: e.notes ?? undefined,
      isActive: e.isActive,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
