import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { HomeService } from './home.service';

const calendarQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Mes inválido (formato YYYY-MM)'),
});

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('home')
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get('summary')
  @Roles('admin', 'gerente', 'vendedor')
  summary() {
    return this.home.summary();
  }

  @Get('calendar')
  @Roles('admin', 'gerente', 'vendedor')
  calendar(@Query(new ZodValidationPipe(calendarQuerySchema)) q: { month: string }) {
    return this.home.calendar(q.month);
  }
}
