import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Query,
  Body,
  Param,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import { AdminGuard } from '../../common/guards/admin.guard';
import { UsersService } from './users.service';
import { ListUsersQueryDto } from './dto/list-users.dto';
import { InviteUserDto } from './dto/invite-user.dto';
import { SetPermissionsDto } from './dto/set-permissions.dto';

@Controller('admin/users')
@UseGuards(AdminGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('list')
  async list(@Query() query: ListUsersQueryDto) {
    return this.users.listUsers(query.page, query.perPage);
  }

  @Post('invite')
  async invite(@Body() body: InviteUserDto) {
    return this.users.inviteUser(body);
  }

  @Post('delete')
  @HttpCode(200)
  async delete(@Body() body: { userId: string }) {
    return this.users.deleteUser(body.userId);
  }

  @Get('permissions')
  async getPermissions(@Query('userId') userId: string) {
    return this.users.getPermissions(userId);
  }

  @Put('permissions')
  async setPermissions(@Body() body: SetPermissionsDto) {
    return this.users.setPermissions(body.userId, body.items);
  }

  @Get('orgs')
  async getOrgs(@Query('userId') userId: string) {
    return this.users.getOrgMemberships(userId);
  }

  @Put('orgs')
  async upsertOrg(@Body() body: { userId: string; orgId: string; role: 'owner' | 'admin' | 'member' }) {
    return this.users.upsertOrgMembership(body.userId, body.orgId, body.role);
  }

  @Delete('orgs')
  async removeOrg(@Body() body: { userId: string; orgId: string }) {
    return this.users.removeOrgMembership(body.userId, body.orgId);
  }
}
