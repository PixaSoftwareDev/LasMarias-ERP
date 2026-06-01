import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { Client, CreateClientInput, UpdateClientInput } from '@lasmarias/shared-schemas';
import { ClientEntity } from './client.entity';

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(ClientEntity)
    private readonly repo: Repository<ClientEntity>,
  ) {}

  async list(): Promise<Client[]> {
    const rows = await this.repo.find({
      order: { businessName: 'ASC' },
      where: { isActive: true },
    });
    return rows.map((r) => this.toDto(r));
  }

  async get(id: string): Promise<Client> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    return this.toDto(c);
  }

  async create(input: CreateClientInput): Promise<Client> {
    const entity = this.repo.create({
      businessName: input.businessName,
      taxId: input.taxId ?? null,
      type: input.type,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      paymentTermDays: input.paymentTermDays ?? null,
      notes: input.notes ?? null,
      isActive: true,
    });
    return this.toDto(await this.repo.save(entity));
  }

  async update(id: string, input: UpdateClientInput): Promise<Client> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException('Cliente no encontrado');
    Object.assign(c, {
      ...(input.businessName !== undefined && { businessName: input.businessName }),
      ...(input.taxId !== undefined && { taxId: input.taxId }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.paymentTermDays !== undefined && { paymentTermDays: input.paymentTermDays }),
      ...(input.notes !== undefined && { notes: input.notes }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });
    return this.toDto(await this.repo.save(c));
  }

  toDto(e: ClientEntity): Client {
    return {
      id: e.id,
      businessName: e.businessName,
      taxId: e.taxId ?? undefined,
      type: e.type,
      email: e.email ?? undefined,
      phone: e.phone ?? undefined,
      address: e.address ?? undefined,
      city: e.city ?? undefined,
      paymentTermDays: e.paymentTermDays ?? null,
      notes: e.notes ?? undefined,
      isActive: e.isActive,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
