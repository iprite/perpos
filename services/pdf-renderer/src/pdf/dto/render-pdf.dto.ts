import { IsString, MinLength, MaxLength } from 'class-validator';

export class RenderPdfDto {
  @IsString()
  @MinLength(20)
  @MaxLength(1_500_000)
  html!: string;

  @IsString()
  filename: string = 'document';
}
