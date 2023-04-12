import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaService } from 'src/prisma.service';

@Module({
  controllers: [ProductsController],
  exports: [ProductsService],
  providers: [ProductsService, PrismaService],
})
export class ProductsModule {}
