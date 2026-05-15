import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import type { CreateUserInput, UpdateUserInput, User } from '@lasmarias/shared-schemas';
import { UserEntity } from './user.entity';

const BCRYPT_ROUNDS = 12; // CLAUDE.md §6 — bcrypt 12+

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly repo: Repository<UserEntity>,
  ) {}

  async findByEmail(email: string): Promise<UserEntity | null> {
    return this.repo.findOne({ where: { email: email.toLowerCase() } });
  }

  async findById(id: string): Promise<UserEntity> {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    return user;
  }

  async list(): Promise<User[]> {
    const rows = await this.repo.find({ order: { fullName: 'ASC' } });
    return rows.map((r) => this.toDto(r));
  }

  async create(input: CreateUserInput): Promise<User> {
    const email = input.email.toLowerCase();
    const existing = await this.findByEmail(email);
    if (existing) throw new ConflictException('Ya existe un usuario con ese email');

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const entity = this.repo.create({
      email,
      passwordHash,
      fullName: input.fullName,
      role: input.role,
      isActive: true,
    });
    const saved = await this.repo.save(entity);
    return this.toDto(saved);
  }

  async update(id: string, input: UpdateUserInput): Promise<User> {
    const user = await this.findById(id);
    if (input.email) user.email = input.email.toLowerCase();
    if (input.fullName) user.fullName = input.fullName;
    if (input.role) user.role = input.role;
    if (typeof input.isActive === 'boolean') user.isActive = input.isActive;
    const saved = await this.repo.save(user);
    return this.toDto(saved);
  }

  async verifyPassword(user: UserEntity, plain: string): Promise<boolean> {
    return bcrypt.compare(plain, user.passwordHash);
  }

  async setRefreshToken(userId: string, refreshToken: string | null): Promise<void> {
    const hash = refreshToken ? await bcrypt.hash(refreshToken, BCRYPT_ROUNDS) : null;
    await this.repo.update({ id: userId }, { refreshTokenHash: hash });
  }

  async verifyRefreshToken(userId: string, refreshToken: string): Promise<boolean> {
    const user = await this.findById(userId);
    if (!user.refreshTokenHash) return false;
    return bcrypt.compare(refreshToken, user.refreshTokenHash);
  }

  toDto(e: UserEntity): User {
    return {
      id: e.id,
      email: e.email,
      fullName: e.fullName,
      role: e.role,
      isActive: e.isActive,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
