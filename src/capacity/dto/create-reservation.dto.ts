import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsISO4217CurrencyCode,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateReservationDto {
  @ApiProperty({ example: 'INV-1001' })
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  invoiceId!: string;

  @ApiProperty({ example: '15000.0000' })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message: 'amount must be a positive decimal with up to 4 fraction digits',
  })
  amount!: string;

  @ApiProperty({ example: 'EUR' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsISO4217CurrencyCode()
  currency!: string;
}
