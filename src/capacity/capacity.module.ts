import { Module } from '@nestjs/common';
import { CapacityService } from './capacity.service.js';
import { ProgramsController } from './programs.controller.js';

@Module({
  controllers: [ProgramsController],
  providers: [CapacityService],
  exports: [CapacityService],
})
export class CapacityModule {}
