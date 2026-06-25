import { Module } from '@nestjs/common';
import { PrismaModule } from '../../prisma/prisma.module';
import { DraftsController } from './drafts.controller';
import { DraftsService } from './drafts.service';

@Module({
  imports: [PrismaModule],
  controllers: [DraftsController],
  providers: [DraftsService],
})
export class DraftsModule {}
