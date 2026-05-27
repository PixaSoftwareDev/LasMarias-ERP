import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import type {
  CreatePriceListInput,
  CreateSalesOrderInput,
  PriceList,
  SalesOrder,
  SalesOrderLine,
} from '@lasmarias/shared-schemas';
import { PriceListEntity, PriceListItemEntity } from './price-list.entity';
import { SalesOrderEntity } from './sales-order.entity';
import { ClientsService } from '../clients/clients.service';
import { ProductsService } from '../products/products.service';
import { DeliveryService } from '../delivery/delivery.service';

@Injectable()
export class SalesService {
  constructor(
    @InjectRepository(PriceListEntity)
    private readonly priceLists: Repository<PriceListEntity>,
    @InjectRepository(PriceListItemEntity)
    private readonly priceListItems: Repository<PriceListItemEntity>,
    @InjectRepository(SalesOrderEntity)
    private readonly orders: Repository<SalesOrderEntity>,
    private readonly clients: ClientsService,
    private readonly products: ProductsService,
    private readonly delivery: DeliveryService,
    private readonly dataSource: DataSource,
  ) {}

  async listPriceLists(): Promise<PriceList[]> {
    const rows = await this.priceLists.find({
      where: { isActive: true },
      relations: { items: { product: true } },
      order: { name: 'ASC' },
    });
    return rows.map((p) => this.priceListToDto(p));
  }

  async createPriceList(input: CreatePriceListInput): Promise<PriceList> {
    return this.dataSource.transaction(async (manager) => {
      const list = manager.getRepository(PriceListEntity).create({
        name: input.name,
        description: input.description ?? null,
        clientType: input.clientType,
        validFrom: input.validFrom ? new Date(input.validFrom) : null,
        validTo: input.validTo ? new Date(input.validTo) : null,
        isActive: true,
      });
      const saved = await manager.getRepository(PriceListEntity).save(list);
      if (input.items.length) {
        await manager.getRepository(PriceListItemEntity).save(
          input.items.map((i) =>
            manager.getRepository(PriceListItemEntity).create({
              priceListId: saved.id,
              productId: i.productId,
              unitPrice: String(i.unitPrice),
            }),
          ),
        );
      }
      const reloaded = await manager.getRepository(PriceListEntity).findOne({
        where: { id: saved.id },
        relations: { items: { product: true } },
      });
      return this.priceListToDto(reloaded!);
    });
  }

  // Encuentra el precio aplicable para un cliente y producto.
  // Devuelve la lista activa del tipo de cliente con vigencia actual (la primera por simplicidad).
  async resolvePriceFor(clientId: string, productId: string): Promise<number> {
    const client = await this.clients.get(clientId);
    const now = new Date();
    const list = await this.priceLists.findOne({
      where: { isActive: true, clientType: client.type },
      relations: { items: true },
    });
    if (!list) throw new BadRequestException('No hay lista de precios para este tipo de cliente');
    if (list.validFrom && list.validFrom > now) throw new BadRequestException('La lista de precios todavía no entró en vigencia');
    if (list.validTo && list.validTo < now) throw new BadRequestException('La lista de precios está vencida');
    const item = list.items.find((i) => i.productId === productId);
    if (!item) throw new BadRequestException('El producto no tiene precio en la lista activa');
    return Number(item.unitPrice);
  }

  // Igual que resolvePriceFor pero devuelve null en vez de lanzar — para cotización en vivo.
  async tryResolvePriceFor(clientId: string, productId: string): Promise<number | null> {
    try {
      return await this.resolvePriceFor(clientId, productId);
    } catch {
      return null;
    }
  }

  // Cotización sin persistir: precios, subtotales y total para mostrar en vivo
  // mientras el vendedor arma el pedido. CLAUDE.md §4.6.1 / §5.4.
  async quoteOrder(input: CreateSalesOrderInput) {
    const client = await this.clients.get(input.clientId);
    const lines: Array<{
      productId: string;
      productName: string;
      sku: string;
      unit: string;
      quantity: number;
      unitPrice: number | null;
      subtotal: number | null;
    }> = [];
    const missingPrices: string[] = [];
    let subtotal = 0;
    for (const l of input.lines) {
      const product = await this.products.get(l.productId);
      const unitPrice = await this.tryResolvePriceFor(client.id, l.productId);
      const lineSubtotal = unitPrice != null ? Math.round(unitPrice * l.quantity * 100) / 100 : null;
      if (unitPrice == null) missingPrices.push(product.name);
      else subtotal += lineSubtotal!;
      lines.push({
        productId: product.id,
        productName: product.name,
        sku: product.sku,
        unit: product.unit,
        quantity: l.quantity,
        unitPrice,
        subtotal: lineSubtotal,
      });
    }
    const discountPercent = input.discountPercent ?? 0;
    const total = Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100;
    return { lines, subtotal: Math.round(subtotal * 100) / 100, discountPercent, total, missingPrices };
  }

  async listOrders(): Promise<SalesOrder[]> {
    const rows = await this.orders.find({
      relations: { client: true, zone: true },
      order: { takenAt: 'DESC' },
      take: 200,
    });
    return rows.map((r) => this.orderToDto(r));
  }

  async listOrdersByDeliveryDate(date: string): Promise<SalesOrder[]> {
    const rows = await this.orders.find({
      where: { deliveryDate: date },
      relations: { client: true, zone: true },
      order: { takenAt: 'ASC' },
    });
    return rows.map((r) => this.orderToDto(r));
  }

  async getOrder(id: string): Promise<SalesOrder> {
    const o = await this.orders.findOne({
      where: { id },
      relations: { client: true, zone: true },
    });
    if (!o) throw new NotFoundException('Pedido no encontrado');
    return this.orderToDto(o);
  }

  async createOrder(input: CreateSalesOrderInput, userId: string): Promise<SalesOrder> {
    const client = await this.clients.get(input.clientId);
    const zoneId = client.zoneId ?? null;

    // Resolver fecha de reparto: si no la pasan, calcular según zona.
    let deliveryDate = input.deliveryDate;
    if (!deliveryDate) {
      if (!zoneId) throw new BadRequestException('El cliente no tiene zona asignada — cargá la fecha de reparto manualmente');
      deliveryDate = await this.delivery.nextDateForZone(zoneId);
    }

    return this.dataSource.transaction(async (manager) => {
      // Calcular líneas y total
      const lines: SalesOrderLine[] = [];
      let subtotal = 0;
      for (const l of input.lines) {
        const product = await this.products.get(l.productId);
        const unitPrice = await this.resolvePriceFor(client.id, l.productId);
        const lineSubtotal = unitPrice * l.quantity;
        subtotal += lineSubtotal;
        lines.push({
          productId: product.id,
          productName: product.name,
          sku: product.sku,
          quantity: l.quantity,
          unitPrice,
          unit: product.unit,
          subtotal: Math.round(lineSubtotal * 100) / 100,
        });
      }
      const discountPercent = input.discountPercent ?? 0;
      const total = Math.round(subtotal * (1 - discountPercent / 100) * 100) / 100;

      const code = await this.nextOrderCode(manager);
      const entity = manager.getRepository(SalesOrderEntity).create({
        code,
        clientId: client.id,
        zoneId,
        status: 'taken',
        takenAt: new Date(),
        deliveryDate,
        lines,
        total: String(total),
        discountPercent: String(discountPercent),
        notes: input.notes ?? null,
        createdById: userId,
      });
      const saved = await manager.getRepository(SalesOrderEntity).save(entity);
      const reloaded = await manager.getRepository(SalesOrderEntity).findOne({
        where: { id: saved.id },
        relations: { client: true, zone: true },
      });
      return this.orderToDto(reloaded!);
    });
  }

  async updateStatus(orderId: string, status: SalesOrder['status']): Promise<SalesOrder> {
    const o = await this.orders.findOne({ where: { id: orderId } });
    if (!o) throw new NotFoundException('Pedido no encontrado');
    o.status = status;
    await this.orders.save(o);
    return this.getOrder(orderId);
  }

  // Secuencia global de pedidos con advisory lock (Postgres rechaza FOR UPDATE con agregados).
  private async nextOrderCode(manager: import('typeorm').EntityManager) {
    await manager.query('SELECT pg_advisory_xact_lock(2000000001)');
    const count = await manager.getRepository(SalesOrderEntity).count();
    return `PED-${String(count + 1).padStart(6, '0')}`;
  }

  priceListToDto(l: PriceListEntity): PriceList {
    return {
      id: l.id,
      name: l.name,
      description: l.description ?? undefined,
      clientType: l.clientType,
      validFrom: l.validFrom?.toISOString(),
      validTo: l.validTo?.toISOString(),
      isActive: l.isActive,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    };
  }

  orderToDto(o: SalesOrderEntity): SalesOrder {
    return {
      id: o.id,
      code: o.code,
      clientId: o.clientId,
      clientName: o.client?.businessName ?? '',
      zoneId: o.zoneId ?? undefined,
      status: o.status,
      takenAt: o.takenAt.toISOString(),
      deliveryDate: o.deliveryDate,
      lines: o.lines,
      total: Number(o.total),
      discountPercent: Number(o.discountPercent),
      notes: o.notes ?? undefined,
      createdById: o.createdById,
      createdAt: o.createdAt.toISOString(),
      updatedAt: o.updatedAt.toISOString(),
    };
  }
}
