import { Body, Controller, Get, Header, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import {
  createCashMovementInputSchema,
  reconcileMovementInputSchema,
  createAccountInputSchema,
  updateAccountInputSchema,
  createExpenseCategoryInputSchema,
  createChequeInputSchema,
  updateChequeStatusInputSchema,
  type CreateCashMovementInput,
  type ReconcileMovementInput,
  type CreateAccountInput,
  type UpdateAccountInput,
  type CreateExpenseCategoryInput,
  type CreateChequeInput,
  type UpdateChequeStatusInput,
} from '@lasmarias/shared-schemas';
import { Param, ParseUUIDPipe, Patch } from '@nestjs/common';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser, type JwtUserPayload } from '../common/decorators/current-user.decorator';
import { FinanceService } from './finance.service';
import { AccountsService } from './accounts.service';
import { ExpenseCategoriesService } from './expense-categories.service';
import { ChequesService } from './cheques.service';

const cashFlowQuerySchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  granularity: z.enum(['day', 'month']).default('day'),
});

const dateRangeSchema = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  accountId: z.string().uuid().optional(),
});

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('finance')
export class FinanceController {
  constructor(
    private readonly finance: FinanceService,
    private readonly accounts: AccountsService,
    private readonly categories: ExpenseCategoriesService,
    private readonly cheques: ChequesService,
  ) {}

  // --- Cuentas (caja / banco) ---
  @Get('accounts')
  @Roles('admin', 'gerente')
  listAccounts() {
    return this.accounts.list();
  }

  @Post('accounts')
  @Roles('admin', 'gerente')
  createAccount(@Body(new ZodValidationPipe(createAccountInputSchema)) body: CreateAccountInput) {
    return this.accounts.create(body);
  }

  @Patch('accounts/:id')
  @Roles('admin', 'gerente')
  updateAccount(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateAccountInputSchema)) body: UpdateAccountInput,
  ) {
    return this.accounts.update(id, body);
  }

  // --- Categorías de gasto ---
  @Get('categories')
  @Roles('admin', 'gerente')
  listCategories() {
    return this.categories.list();
  }

  @Post('categories')
  @Roles('admin', 'gerente')
  createCategory(@Body(new ZodValidationPipe(createExpenseCategoryInputSchema)) body: CreateExpenseCategoryInput) {
    return this.categories.create(body);
  }

  // --- Cheques ---
  @Get('cheques')
  @Roles('admin', 'gerente')
  listCheques() {
    return this.cheques.list();
  }

  @Post('cheques')
  @Roles('admin', 'gerente')
  createCheque(
    @Body(new ZodValidationPipe(createChequeInputSchema)) body: CreateChequeInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.cheques.create(body, user.sub);
  }

  @Patch('cheques/:id/status')
  @Roles('admin', 'gerente')
  updateChequeStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateChequeStatusInputSchema)) body: UpdateChequeStatusInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.cheques.updateStatus(id, body, user.sub);
  }

  // --- Movimientos de caja ---
  @Post('cash-movements')
  @Roles('admin', 'gerente')
  createCashMovement(
    @Body(new ZodValidationPipe(createCashMovementInputSchema)) body: CreateCashMovementInput,
    @CurrentUser() user: JwtUserPayload,
  ) {
    return this.finance.createCashMovement(body, user.sub);
  }

  @Get('cash-movements')
  @Roles('admin', 'gerente')
  listCashMovements(
    @Query(new ZodValidationPipe(dateRangeSchema)) q: { from: Date; to: Date; accountId?: string },
  ) {
    return this.finance.listCashMovements(q.from, q.to, q.accountId);
  }

  @Get('cash-movements/unreconciled')
  @Roles('admin', 'gerente')
  listUnreconciled(@Query('accountId', new ParseUUIDPipe()) accountId: string) {
    return this.finance.listUnreconciled(accountId);
  }

  @Patch('cash-movements/:id/reconcile')
  @Roles('admin', 'gerente')
  reconcileMovement(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(reconcileMovementInputSchema)) body: ReconcileMovementInput,
  ) {
    return this.finance.reconcileMovement(id, body);
  }

  @Get('cash-flow')
  @Roles('admin', 'gerente')
  cashFlow(
    @Query(new ZodValidationPipe(cashFlowQuerySchema))
    q: { from: Date; to: Date; granularity: 'day' | 'month' },
  ) {
    return this.finance.cashFlow(q.from, q.to, q.granularity);
  }

  @Get('export/cash-flow.xlsx')
  @Roles('admin', 'gerente')
  @Header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
  @Header('Content-Disposition', 'attachment; filename="flujo-de-caja.xlsx"')
  async exportCashFlow(
    @Query(new ZodValidationPipe(cashFlowQuerySchema))
    q: { from: Date; to: Date; granularity: 'day' | 'month' },
    @Res() res: Response,
  ) {
    const buffer = await this.finance.exportCashFlowXlsx(q.from, q.to, q.granularity);
    res.send(buffer);
  }
}
