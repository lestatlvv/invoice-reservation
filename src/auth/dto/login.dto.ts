import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'operator' })
  @IsString()
  @MinLength(1)
  username!: string;

  @ApiProperty({ example: 'changeme' })
  @IsString()
  @MinLength(1)
  password!: string;
}
