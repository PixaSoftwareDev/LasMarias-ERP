import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationEntity } from './notification.entity';
import { AuditLogEntity } from './audit-log.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([NotificationEntity, AuditLogEntity])],
  providers: [NotificationsService],
  controllers: [NotificationsController],
  exports: [NotificationsService, TypeOrmModule],
})
export class NotificationsModule {}
