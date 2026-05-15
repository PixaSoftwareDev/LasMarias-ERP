import { Column, Entity, Index } from 'typeorm';
import type { UserRole } from '@lasmarias/shared-schemas';
import { BaseEntity } from '../database/base.entity';

@Entity({ name: 'users' })
export class UserEntity extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 254 })
  email!: string;

  @Column({ type: 'varchar', name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 120, name: 'full_name' })
  fullName!: string;

  @Column({ type: 'varchar', length: 32 })
  role!: UserRole;

  @Column({ type: 'boolean', name: 'is_active', default: true })
  isActive!: boolean;

  @Column({ type: 'varchar', name: 'refresh_token_hash', nullable: true })
  refreshTokenHash!: string | null;
}
