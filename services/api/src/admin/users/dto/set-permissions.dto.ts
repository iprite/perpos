import { IsUUID, IsArray, ValidateNested, IsString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

class PermissionItem {
  @IsString()
  function_key!: string;

  @IsBoolean()
  allowed!: boolean;
}

export class SetPermissionsDto {
  @IsUUID()
  userId!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PermissionItem)
  items: PermissionItem[] = [];
}
