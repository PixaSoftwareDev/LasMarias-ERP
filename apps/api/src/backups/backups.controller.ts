import { createReadStream } from 'node:fs';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Patch, Res, StreamableFile, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { updateBackupConfigInputSchema, type UpdateBackupConfigInput } from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { BackupsService } from './backups.service';

// Copias de seguridad: SOLO admin (el dump contiene toda la base).
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('backups')
export class BackupsController {
  constructor(private readonly backups: BackupsService) {}

  @Get()
  overview() {
    return this.backups.overview();
  }

  @Patch('config')
  updateConfig(
    @Body(new ZodValidationPipe(updateBackupConfigInputSchema)) body: UpdateBackupConfigInput,
  ) {
    return this.backups.updateConfig(body);
  }

  @Post('run')
  runNow() {
    return this.backups.runBackup('manual');
  }

  @Get(':id/download')
  async download(@Param('id', ParseUUIDPipe) id: string, @Res({ passthrough: true }) res: Response) {
    const { path, fileName } = await this.backups.getFile(id);
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${fileName}"`,
    });
    return new StreamableFile(createReadStream(path));
  }
}
