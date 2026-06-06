import { IsString, IsUUID } from 'class-validator';

export class ProcessJobDto {
  @IsUUID()
  jobId!: string;

  @IsUUID()
  firmOrgId!: string;
}
