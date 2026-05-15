import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmployeeEntity } from './employee.entity';
import { AttendanceEventEntity } from './attendance-event.entity';
import { HrService } from './hr.service';
import { HrController } from './hr.controller';

@Module({
  imports: [TypeOrmModule.forFeature([EmployeeEntity, AttendanceEventEntity])],
  providers: [HrService],
  controllers: [HrController],
  exports: [HrService],
})
export class HrModule {}
