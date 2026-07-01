import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { ClientPriceItem, UpsertClientPricesInput } from '@lasmarias/shared-schemas';
import { ClientPriceItemEntity } from './client-price-item.entity';

@Injectable()
export class ClientPricesService {
  constructor(
    @InjectRepository(ClientPriceItemEntity)
    private readonly repo: Repository<ClientPriceItemEntity>,
  ) {}

  // Precios particulares vigentes de un cliente, con datos del producto para la grilla.
  async listByClient(clientId: string): Promise<ClientPriceItem[]> {
    const rows = await this.repo.find({
      where: { clientId, isActive: true },
      relations: { product: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => ({
      productId: r.productId,
      productName: r.product?.name ?? '',
      sku: r.product?.sku ?? '',
      unit: r.product?.unit ?? '',
      unitPrice: Number(r.unitPrice),
      currency: (r.currency as ClientPriceItem['currency']) ?? 'ARS',
    }));
  }

  // Upsert masivo: desactiva los precios particulares vigentes del cliente y crea los nuevos.
  async upsert(clientId: string, input: UpsertClientPricesInput): Promise<ClientPriceItem[]> {
    await this.repo.manager.transaction(async (manager) => {
      const repo = manager.getRepository(ClientPriceItemEntity);
      await repo.update({ clientId, isActive: true }, { isActive: false });
      const currency = input.currency ?? 'ARS';
      for (const item of input.items) {
        await repo.save(
          repo.create({
            clientId,
            productId: item.productId,
            unitPrice: String(item.unitPrice),
            currency,
            isActive: true,
          }),
        );
      }
    });
    return this.listByClient(clientId);
  }
}
