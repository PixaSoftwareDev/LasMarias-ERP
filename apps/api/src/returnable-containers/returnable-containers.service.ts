import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReturnableContainerEntity } from './returnable-container.entity';
import { ReturnableContainerMovementEntity } from './returnable-container-movement.entity';

export interface ReturnableContainerDto {
  id: string;
  name: string;
  code: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateContainerInput {
  name: string;
  code: string;
}

export interface ReturnableMovementDto {
  id: string;
  containerId: string;
  clientId: string;
  salesOrderId?: string;
  quantityOut: number;
  quantityIn: number;
  movementDate: string;
  notes?: string;
  createdById?: string;
  createdAt: string;
}

export interface CreateMovementInput {
  containerId: string;
  clientId: string;
  salesOrderId?: string;
  quantityOut: number;
  quantityIn: number;
  movementDate: string;
  notes?: string;
}

@Injectable()
export class ReturnableContainersService {
  constructor(
    @InjectRepository(ReturnableContainerEntity)
    private readonly repo: Repository<ReturnableContainerEntity>,
    @InjectRepository(ReturnableContainerMovementEntity)
    private readonly movRepo: Repository<ReturnableContainerMovementEntity>,
  ) {}

  async list(): Promise<ReturnableContainerDto[]> {
    const rows = await this.repo.find({ where: { isActive: true }, order: { name: 'ASC' } });
    return rows.map((r) => this.toDto(r));
  }

  async create(input: CreateContainerInput): Promise<ReturnableContainerDto> {
    const entity = this.repo.create({ name: input.name, code: input.code, isActive: true });
    return this.toDto(await this.repo.save(entity));
  }

  async listMovements(clientId: string): Promise<ReturnableMovementDto[]> {
    const rows = await this.movRepo.find({
      where: { clientId },
      order: { movementDate: 'DESC' },
      take: 200,
    });
    return rows.map((r) => this.toMovDto(r));
  }

  async createMovement(input: CreateMovementInput, userId: string): Promise<ReturnableMovementDto> {
    const container = await this.repo.findOne({ where: { id: input.containerId } });
    if (!container) throw new NotFoundException('Envase no encontrado');

    const entity = this.movRepo.create({
      containerId: input.containerId,
      clientId: input.clientId,
      salesOrderId: input.salesOrderId ?? null,
      quantityOut: input.quantityOut,
      quantityIn: input.quantityIn,
      movementDate: input.movementDate,
      notes: input.notes ?? null,
      createdById: userId,
    });
    return this.toMovDto(await this.movRepo.save(entity));
  }

  // Balance por cliente: cuántos envases de cada tipo debe devolver
  async balanceByClient(clientId: string): Promise<{ containerId: string; balance: number }[]> {
    const rows = await this.movRepo
      .createQueryBuilder('m')
      .select('m.container_id', 'containerId')
      .addSelect('SUM(m.quantity_out) - SUM(m.quantity_in)', 'balance')
      .where('m.client_id = :clientId', { clientId })
      .groupBy('m.container_id')
      .getRawMany();

    return rows.map((r) => ({ containerId: r.containerId as string, balance: Number(r.balance) }));
  }

  toDto(e: ReturnableContainerEntity): ReturnableContainerDto {
    return {
      id: e.id,
      name: e.name,
      code: e.code,
      isActive: e.isActive,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  toMovDto(e: ReturnableContainerMovementEntity): ReturnableMovementDto {
    return {
      id: e.id,
      containerId: e.containerId,
      clientId: e.clientId,
      salesOrderId: e.salesOrderId ?? undefined,
      quantityOut: e.quantityOut,
      quantityIn: e.quantityIn,
      movementDate: e.movementDate,
      notes: e.notes ?? undefined,
      createdById: e.createdById ?? undefined,
      createdAt: e.createdAt.toISOString(),
    };
  }
}
