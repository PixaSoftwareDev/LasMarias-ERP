import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettingEntity } from '../settings/app-setting.entity';
import { BackupRunEntity } from './backup-run.entity';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Module({
  imports: [TypeOrmModule.forFeature([BackupRunEntity, AppSettingEntity])],
  controllers: [BackupsController],
  providers: [BackupsService],
})
export class BackupsModule {}
