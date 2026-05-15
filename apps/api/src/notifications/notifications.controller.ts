import { Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Query('unreadOnly') unreadOnly?: string) {
    return this.notifications.list(unreadOnly === 'true');
  }

  @Get('unread-count')
  unreadCount() {
    return this.notifications.unreadCount().then((count) => ({ count }));
  }

  @Patch(':id/read')
  markRead(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.notifications.markRead(id);
  }

  @Post('read-all')
  markAllRead() {
    return this.notifications.markAllRead();
  }
}
