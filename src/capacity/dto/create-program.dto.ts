import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsISO4217CurrencyCode,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateProgramDto {
  @ApiPropertyOptional({ format: 'uuid' })
  @IsOptional()
  @IsUUID()
  id?: string;

  @ApiProperty({ example: 'Working Capital Facility' })
  @IsString()
  @MinLength(1)
  @MaxLength(256)
  name!: string;

  @ApiProperty({ example: 'USD' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.toUpperCase() : value,
  )
  @IsISO4217CurrencyCode()
  currency!: string;

  @ApiProperty({
    example: '10000000.0000',
    description: 'Credit limit in program currency',
  })
  @IsString()
  @Matches(/^\d+(\.\d{1,4})?$/, {
    message:
      'creditLimit must be a non-negative decimal with up to 4 fraction digits',
  })
  creditLimit!: string;
}
