import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import type {
  AttendanceEvent,
  CreateEmployeeInput,
  Employee,
  IngestAttendanceInput,
  ManualAttendanceInput,
} from '@lasmarias/shared-schemas';
import { EmployeeEntity } from './employee.entity';
import { AttendanceEventEntity } from './attendance-event.entity';
import { computeWorkedHours } from './attendance-hours';

@Injectable()
export class HrService {
  constructor(
    @InjectRepository(EmployeeEntity)
    private readonly employees: Repository<EmployeeEntity>,
    @InjectRepository(AttendanceEventEntity)
    private readonly events: Repository<AttendanceEventEntity>,
  ) {}

  async listEmployees(): Promise<Employee[]> {
    const rows = await this.employees.find({ where: { isActive: true }, order: { lastName: 'ASC' } });
    return rows.map((e) => this.employeeToDto(e));
  }

  async createEmployee(input: CreateEmployeeInput): Promise<Employee> {
    const e = this.employees.create({
      externalId: input.externalId ?? null,
      firstName: input.firstName,
      lastName: input.lastName,
      documentNumber: input.documentNumber ?? null,
      sector: input.sector ?? null,
      shift: input.shift ?? null,
      hourlyCost: input.hourlyCost != null ? String(input.hourlyCost) : null,
      hiredAt: input.hiredAt ?? null,
      isActive: true,
    });
    return this.employeeToDto(await this.employees.save(e));
  }

  // Recibe eventos en batch desde el microservicio ZKTeco (CLAUDE.md §2).
  async ingestAttendance(input: IngestAttendanceInput) {
    let ingested = 0;
    let skipped = 0;
    for (const ev of input.events) {
      const employee = await this.employees.findOne({ where: { externalId: ev.externalEmployeeId } });
      if (!employee) {
        skipped++;
        continue;
      }
      await this.events.save(
        this.events.create({
          employeeId: employee.id,
          type: ev.type,
          timestamp: new Date(ev.timestamp),
          source: 'biometric',
          deviceId: ev.deviceId ?? null,
        }),
      );
      ingested++;
    }
    return { ingested, skipped };
  }

  async manualAttendance(input: ManualAttendanceInput): Promise<AttendanceEvent> {
    const employee = await this.employees.findOne({ where: { id: input.employeeId } });
    if (!employee) throw new NotFoundException('Empleado no encontrado');
    const e = await this.events.save(
      this.events.create({
        employeeId: employee.id,
        type: input.type,
        timestamp: new Date(),
        source: 'manual',
        geoLat: input.geoLat != null ? String(input.geoLat) : null,
        geoLng: input.geoLng != null ? String(input.geoLng) : null,
      }),
    );
    return {
      id: e.id,
      employeeId: e.employeeId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      type: e.type,
      timestamp: e.timestamp.toISOString(),
      source: e.source,
      deviceId: e.deviceId ?? undefined,
      geoLat: e.geoLat ? Number(e.geoLat) : undefined,
      geoLng: e.geoLng ? Number(e.geoLng) : undefined,
      createdAt: e.createdAt.toISOString(),
    };
  }

  async listEventsForDay(date: string): Promise<AttendanceEvent[]> {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59`);
    const rows = await this.events.find({
      where: { timestamp: Between(start, end) },
      relations: { employee: true },
      order: { timestamp: 'ASC' },
    });
    return rows.map((e) => ({
      id: e.id,
      employeeId: e.employeeId,
      employeeName: `${e.employee?.firstName ?? ''} ${e.employee?.lastName ?? ''}`.trim(),
      type: e.type,
      timestamp: e.timestamp.toISOString(),
      source: e.source,
      deviceId: e.deviceId ?? undefined,
      geoLat: e.geoLat ? Number(e.geoLat) : undefined,
      geoLng: e.geoLng ? Number(e.geoLng) : undefined,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  // Cálculo de horas trabajadas por empleado en un rango.
  async hoursReport(from: string, to: string) {
    if (!from || !to) throw new BadRequestException('Rango requerido');
    const start = new Date(`${from}T00:00:00`);
    const end = new Date(`${to}T23:59:59`);
    const employees = await this.employees.find({ where: { isActive: true } });
    return Promise.all(
      employees.map(async (emp) => {
        const events = await this.events.find({
          where: { employeeId: emp.id, timestamp: Between(start, end) },
          order: { timestamp: 'ASC' },
        });
        const result = computeWorkedHours(events.map((e) => ({ type: e.type, timestamp: e.timestamp })));
        const cost = emp.hourlyCost ? Number(emp.hourlyCost) * result.workedHours : null;
        return {
          employeeId: emp.id,
          employeeName: `${emp.firstName} ${emp.lastName}`,
          sector: emp.sector,
          workedHours: result.workedHours,
          unpairedEvents: result.unpairedIns.length + result.unpairedOuts.length,
          laborCost: cost != null ? Math.round(cost * 100) / 100 : null,
        };
      }),
    );
  }

  employeeToDto(e: EmployeeEntity): Employee {
    return {
      id: e.id,
      externalId: e.externalId ?? undefined,
      firstName: e.firstName,
      lastName: e.lastName,
      fullName: `${e.firstName} ${e.lastName}`,
      documentNumber: e.documentNumber ?? undefined,
      sector: e.sector ?? undefined,
      shift: e.shift ?? undefined,
      hourlyCost: e.hourlyCost ? Number(e.hourlyCost) : undefined,
      hiredAt: e.hiredAt ?? undefined,
      isActive: e.isActive,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }
}
