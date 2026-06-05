import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import type { CreateExpenseCategoryInput, ExpenseCategory } from '@lasmarias/shared-schemas';
import { ExpenseCategoryEntity } from './expense-category.entity';

// Catálogo de categorías de gasto. Alta simple + listado para los selectores.
@Injectable()
export class ExpenseCategoriesService {
  constructor(
    @InjectRepository(ExpenseCategoryEntity)
    private readonly repo: Repository<ExpenseCategoryEntity>,
  ) {}

  async list(): Promise<ExpenseCategory[]> {
    const rows = await this.repo.find({ where: { isActive: true }, order: { name: 'ASC' } });
    return rows.map((c) => ({ id: c.id, name: c.name, isActive: c.isActive }));
  }

  async create(input: CreateExpenseCategoryInput): Promise<ExpenseCategory> {
    const name = input.name.trim();
    // Idempotente: si ya existe (activa o no), la reactiva en vez de duplicar.
    const existing = await this.repo.findOne({ where: { name } });
    if (existing) {
      if (!existing.isActive) {
        existing.isActive = true;
        await this.repo.save(existing);
      }
      return { id: existing.id, name: existing.name, isActive: existing.isActive };
    }
    const saved = await this.repo.save(this.repo.create({ name, isActive: true }));
    return { id: saved.id, name: saved.name, isActive: saved.isActive };
  }
}
