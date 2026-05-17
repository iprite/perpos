import { IsEmail, IsEnum, IsUrl } from 'class-validator';

export class InviteUserDto {
  @IsEmail()
  email!: string;

  @IsEnum(['admin', 'user'])
  role!: 'admin' | 'user';

  @IsUrl()
  redirectTo!: string;
}
