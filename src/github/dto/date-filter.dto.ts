import { IsDateString, IsOptional } from 'class-validator';

export class DateFilterDto {
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
