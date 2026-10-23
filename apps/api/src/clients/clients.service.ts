import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
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
    if (!c) throw new NotFoundException(`Cliente ${id} no encontrado`);
    return this.toDto(c);
  }

  // El CUIT no se puede repetir (índice único). Antes chocaba contra la base y el usuario veía
  // "Ocurrió un error inesperado": en producción reintentaron 6 veces el mismo cliente con el
  // CUIT 00000000000 de VARIOS (20/10/2026). Se compara por dígitos: 20-1234… = 201234….
  private async assertCuitLibre(taxId: string | null | undefined, exceptId?: string): Promise<void> {
    if (!taxId) return;
    const digits = taxId.replace(/\D/g, '');
    const otro = await this.repo
      .createQueryBuilder('c')
      .where("regexp_replace(c.tax_id, '\\D', '', 'g') = :digits", { digits })
      .andWhere(exceptId ? 'c.id <> :exceptId' : '1=1', { exceptId })
      .getOne();
    if (otro)
      throw new ConflictException(
        `Ya hay un cliente con ese CUIT: ${otro.businessName}${otro.isActive ? '' : ' (dado de baja)'}. Si este cliente no tiene CUIT, dejá el campo vacío.`,
      );
  }

  async create(input: CreateClientInput): Promise<Client> {
    await this.assertCuitLibre(input.taxId);
    const entity = this.repo.create({
      businessName: input.businessName,
      taxId: input.taxId ?? null,
      type: input.type,
      email: input.email ?? null,
      phone: input.phone ?? null,
      address: input.address ?? null,
      city: input.city ?? null,
      paymentTermDays: input.paymentTermDays ?? null,
      ivaMode: input.ivaMode ?? 'sin_iva',
      notes: input.notes ?? null,
      isActive: true,
    });
    return this.toDto(await this.repo.save(entity));
  }

  async update(id: string, input: UpdateClientInput): Promise<Client> {
    const c = await this.repo.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Cliente ${id} no encontrado`);
    if (input.taxId !== undefined) await this.assertCuitLibre(input.taxId, id);
    Object.assign(c, {
      ...(input.businessName !== undefined && { businessName: input.businessName }),
      ...(input.taxId !== undefined && { taxId: input.taxId }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.email !== undefined && { email: input.email }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.address !== undefined && { address: input.address }),
      ...(input.city !== undefined && { city: input.city }),
      ...(input.paymentTermDays !== undefined && { paymentTermDays: input.paymentTermDays }),
      ...(input.ivaMode !== undefined && { ivaMode: input.ivaMode }),
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
      ivaMode: (e.ivaMode as Client['ivaMode']) ?? 'sin_iva',
      notes: e.notes ?? undefined,
      isActive: e.isActive,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
