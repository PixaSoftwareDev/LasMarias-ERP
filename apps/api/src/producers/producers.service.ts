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

export interface UpdateProducerInput {
  name?: string;
  taxId?: string;
  phone?: string;
  address?: string;
  city?: string;
  agreedPricePerLiter?: number;
  notes?: string;
  isActive?: boolean;
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
    if (!p) throw new NotFoundException(`Productor ${id} no encontrado`);
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

  // Edición de productor: mergea solo los campos provistos (CLAUDE.md §4.5).
  async update(id: string, input: UpdateProducerInput): Promise<ProducerDto> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Productor ${id} no encontrado`);
    if (input.name !== undefined) p.name = input.name;
    if (input.taxId !== undefined) p.taxId = input.taxId;
    if (input.phone !== undefined) p.phone = input.phone;
    if (input.address !== undefined) p.address = input.address;
    if (input.city !== undefined) p.city = input.city;
    if (input.agreedPricePerLiter !== undefined)
      p.agreedPricePerLiter = String(input.agreedPricePerLiter);
    if (input.notes !== undefined) p.notes = input.notes;
    if (input.isActive !== undefined) p.isActive = input.isActive;
    return this.toDto(await this.repo.save(p));
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
