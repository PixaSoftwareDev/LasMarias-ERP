import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MaturationRecordEntity } from './maturation-record.entity';
import { BatchEntity } from '../batches/batch.entity';

export interface MaturationRecordDto {
  id: string;
  batchId: string;
  warehouseId?: string;
  checkedAt: string;
  weightKg: number;
  notes?: string;
  createdById?: string;
  createdAt: string;
}

export interface CreateMaturationRecordInput {
  batchId: string;
  warehouseId?: string;
  checkedAt: string;
  weightKg: number;
  notes?: string;
}

@Injectable()
export class MaturationService {
  constructor(
    @InjectRepository(MaturationRecordEntity)
    private readonly repo: Repository<MaturationRecordEntity>,
    @InjectRepository(BatchEntity)
    private readonly batches: Repository<BatchEntity>, // Para validar batch en create()
  ) {}

  async list(batchId?: string): Promise<MaturationRecordDto[]> {
    const rows = await this.repo.find({
      where: batchId ? { batchId } : {},
      order: { checkedAt: 'DESC' },
      take: 200,
    });
    return rows.map((r) => this.toDto(r));
  }

  async create(input: CreateMaturationRecordInput, userId: string): Promise<MaturationRecordDto> {
    const { NotFoundException } = await import('@nestjs/common');
    const batch = await this.batches.findOne({ where: { id: input.batchId } });
    if (!batch) throw new NotFoundException('Lote no encontrado');

    const entity = this.repo.create({
      batchId: input.batchId,
      warehouseId: input.warehouseId ?? null,
      checkedAt: new Date(input.checkedAt),
      weightKg: String(input.weightKg),
      notes: input.notes ?? null,
      createdById: userId,
    });
    return this.toDto(await this.repo.save(entity));
  }

  toDto(e: MaturationRecordEntity): MaturationRecordDto {
    return {
      id: e.id,
      batchId: e.batchId,
      warehouseId: e.warehouseId ?? undefined,
      checkedAt: e.checkedAt.toISOString(),
      weightKg: Number(e.weightKg),
      notes: e.notes ?? undefined,
      createdById: e.createdById ?? undefined,
      createdAt: e.createdAt.toISOString(),
    };
  }
}
