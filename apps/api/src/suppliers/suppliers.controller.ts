import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  calculateSettlementInputSchema,
  createPurchaseOrderInputSchema,
  createSupplierInputSchema,
  type CalculateSettlementInput,
  type CreatePurchaseOrderInput,
  type CreateSupplierInput,
  type PurchaseOrderStatus,
} from '@lasmarias/shared-schemas';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { SuppliersService } from './suppliers.service';

const updateStatusSchema = z.object({
  status: z.enum(['draft', 'approved', 'received', 'invoiced', 'cancelled']),
});

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class SuppliersController {
  constructor(private readonly suppliers: SuppliersService) {}

  @Get('suppliers')
  @Roles('admin', 'gerente', 'contable')
  listSuppliers() {
    return this.suppliers.listSuppliers();
  }

  @Post('suppliers')
  @Roles('admin', 'gerente')
  createSupplier(@Body(new ZodValidationPipe(createSupplierInputSchema)) body: CreateSupplierInput) {
    return this.suppliers.createSupplier(body);
  }

  @Get('purchase-orders')
  @Roles('admin', 'gerente', 'contable')
  listPurchaseOrders() {
    return this.suppliers.listPurchaseOrders();
  }

  @Post('purchase-orders')
  @Roles('admin', 'gerente')
  createPurchaseOrder(
    @Body(new ZodValidationPipe(createPurchaseOrderInputSchema)) body: CreatePurchaseOrderInput,
  ) {
    return this.suppliers.createPurchaseOrder(body);
  }

  @Patch('purchase-orders/:id/status')
  @Roles('admin', 'gerente')
  updateStatus(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(updateStatusSchema)) body: { status: PurchaseOrderStatus },
  ) {
    return this.suppliers.updatePurchaseOrderStatus(id, body.status);
  }

  @Post('producer-settlements')
  @Roles('admin', 'gerente', 'contable')
  calculateSettlement(
    @Body(new ZodValidationPipe(calculateSettlementInputSchema)) body: CalculateSettlementInput,
  ) {
    return this.suppliers.calculateSettlement(body);
  }

  @Get('producer-settlements')
  @Roles('admin', 'gerente', 'contable')
  listSettlements() {
    return this.suppliers.listSettlements();
  }
}
