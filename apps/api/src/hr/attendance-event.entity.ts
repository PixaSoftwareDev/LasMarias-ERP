import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EmployeeEntity } from './employee.entity';

@Entity({ name: 'attendance_events' })
@Index(['employeeId', 'timestamp'])
@Index(['timestamp'])
export class AttendanceEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'employee_id' })
  employeeId!: string;

  @ManyToOne(() => EmployeeEntity)
  @JoinColumn({ name: 'employee_id' })
  employee!: EmployeeEntity;

  @Column({ type: 'varchar', length: 4 })
  type!: 'in' | 'out';

  @Column({ type: 'timestamptz' })
  timestamp!: Date;

  @Column({ type: 'varchar', length: 16 })
  source!: 'biometric' | 'manual';

  @Column({ type: 'varchar', length: 50, name: 'device_id', nullable: true })
  deviceId!: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, name: 'geo_lat', nullable: true })
  geoLat!: string | null;

  @Column({ type: 'numeric', precision: 9, scale: 6, name: 'geo_lng', nullable: true })
  geoLng!: string | null;

  @CreateDateColumn({ type: 'timestamptz', name: 'created_at' })
  createdAt!: Date;
}
