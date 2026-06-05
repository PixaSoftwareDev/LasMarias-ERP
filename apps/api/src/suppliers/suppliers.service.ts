import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type {
  CreateSupplierInput,
  Supplier,
  UpdateSupplierInput,
} from '@lasmarias/shared-schemas';
import { SupplierEntity } from './supplier.entity';

// Alta/edición de proveedores de insumos (maestro). La deuda vive en payables.
@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(SupplierEntity)
    private readonly repo: Repository<SupplierEntity>,
  ) {}

  async list(includeInactive = false): Promise<Supplier[]> {
    const rows = await this.repo.find({
      where: includeInactive ? {} : { isActive: true },
      order: { name: 'ASC' },
    });
    return rows.map((s) => this.toDto(s));
  }

  async get(id: string): Promise<Supplier> {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Proveedor ${id} no encontrado`);
    return this.toDto(s);
  }

  async create(input: CreateSupplierInput): Promise<Supplier> {
    const s = this.repo.create({
      name: input.name,
      taxId: input.taxId ?? null,
      phone: input.phone ?? null,
      city: input.city ?? null,
      paymentTermDays: input.paymentTermDays ?? null,
      isActive: true,
    });
    return this.toDto(await this.repo.save(s));
  }

  async update(id: string, input: UpdateSupplierInput): Promise<Supplier> {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Proveedor ${id} no encontrado`);
    if (input.name !== undefined) s.name = input.name;
    if (input.taxId !== undefined) s.taxId = input.taxId ?? null;
    if (input.phone !== undefined) s.phone = input.phone ?? null;
    if (input.city !== undefined) s.city = input.city ?? null;
    if (input.paymentTermDays !== undefined) s.paymentTermDays = input.paymentTermDays ?? null;
    if (input.isActive !== undefined) s.isActive = input.isActive;
    return this.toDto(await this.repo.save(s));
  }

  toDto(s: SupplierEntity): Supplier {
    return {
      id: s.id,
      name: s.name,
      taxId: s.taxId ?? undefined,
      phone: s.phone ?? undefined,
      city: s.city ?? undefined,
      paymentTermDays: s.paymentTermDays,
      isActive: s.isActive,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }
}
