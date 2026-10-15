import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CapacityService } from './capacity.service.js';
import { CreateProgramDto } from './dto/create-program.dto.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';

@ApiTags('programs')
@ApiBearerAuth()
@Controller('programs')
export class ProgramsController {
  constructor(private readonly capacity: CapacityService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProgramDto) {
    return this.capacity.upsertProgram(dto);
  }

  @Get(':id/capacity')
  getCapacity(@Param('id', ParseUUIDPipe) id: string) {
    return this.capacity.getCapacity(id);
  }

  @Get(':id/reservations')
  listReservations(@Param('id', ParseUUIDPipe) id: string) {
    return this.capacity.listReservations(id);
  }

  @Post(':id/reservations')
  @HttpCode(HttpStatus.CREATED)
  reserve(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReservationDto,
  ) {
    return this.capacity.reserve(id, dto);
  }

  @Post(':id/reservations/:invoiceId/release')
  @HttpCode(HttpStatus.OK)
  release(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('invoiceId') invoiceId: string,
  ) {
    return this.capacity.release(id, invoiceId);
  }
}
