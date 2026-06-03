import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CreateProductInput, Product, UpdateProductInput } from '@lasmarias/shared-schemas';
import { ProductEntity } from './product.entity';

@Injectable()
export class ProductsService {
  constructor(
    @InjectRepository(ProductEntity)
    private readonly repo: Repository<ProductEntity>,
  ) {}

  async list(): Promise<Product[]> {
    const rows = await this.repo.find({ order: { name: 'ASC' } });
    return rows.map((r) => this.toDto(r));
  }

  async get(id: string): Promise<Product> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Producto ${id} no encontrado`);
    return this.toDto(p);
  }

  async create(input: CreateProductInput): Promise<Product> {
    const entity = this.repo.create({
      sku: input.sku,
      name: input.name,
      description: input.description ?? null,
      category: input.category,
      unit: input.unit,
      trackBatches: input.trackBatches,
      minStockLevel: input.minStockLevel != null ? String(input.minStockLevel) : null,
      isActive: true,
    });
    return this.toDto(await this.repo.save(entity));
  }

  async update(id: string, input: UpdateProductInput): Promise<Product> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Producto ${id} no encontrado`);
    Object.assign(p, {
      ...(input.sku !== undefined && { sku: input.sku }),
      ...(input.name !== undefined && { name: input.name }),
      ...(input.description !== undefined && { description: input.description }),
      ...(input.category !== undefined && { category: input.category }),
      ...(input.unit !== undefined && { unit: input.unit }),
      ...(input.trackBatches !== undefined && { trackBatches: input.trackBatches }),
      ...(input.minStockLevel !== undefined && {
        minStockLevel: input.minStockLevel != null ? String(input.minStockLevel) : null,
      }),
      ...(input.isActive !== undefined && { isActive: input.isActive }),
    });
    return this.toDto(await this.repo.save(p));
  }

  toDto(e: ProductEntity): Product {
    return {
      id: e.id,
      sku: e.sku,
      name: e.name,
      description: e.description ?? undefined,
      category: e.category,
      unit: e.unit,
      trackBatches: e.trackBatches,
      minStockLevel: e.minStockLevel != null ? Number(e.minStockLevel) : undefined,
      isActive: e.isActive,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
