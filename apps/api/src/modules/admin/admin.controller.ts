import { Controller, Get, Put, Post, Patch, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '@gym-app/shared-types';
import {
  CreateGymSansDto,
  UpdateGymAccessModeDto,
  CreateAdminGymDto,
  UpdateAdminGymDto,
  ToggleGymStatusDto,
} from './dto/admin-gym.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.SUPER_ADMIN)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard-metrics')
  async getMetrics() {
    return this.adminService.getDashboardMetrics();
  }

  @Get('recent-checkins')
  async getCheckins() {
    return this.adminService.getRecentCheckins();
  }

  // ==========================================
  // GYM MANAGEMENT CRUD & OPERATIONAL DOSSIER
  // ==========================================

  @Get('gyms')
  async getGyms() {
    return this.adminService.getGymsManagementList();
  }

  @Get('gyms/:id')
  async getGymDetail(@Param('id') id: string) {
    return this.adminService.getGymDetail(id);
  }

  @Post('gyms')
  async createGym(@Body() body: CreateAdminGymDto) {
    return this.adminService.createGym(body);
  }

  @Put('gyms/:id')
  async updateGym(@Param('id') id: string, @Body() body: UpdateAdminGymDto) {
    return this.adminService.updateGym(id, body);
  }

  @Patch('gyms/:id/status')
  async toggleGymStatus(
    @Param('id') id: string,
    @Body() body: ToggleGymStatusDto,
  ) {
    return this.adminService.toggleGymStatus(id, body.isActive);
  }

  @Delete('gyms/:id')
  async removeGym(@Param('id') id: string) {
    return this.adminService.removeGym(id);
  }

  // ==========================================
  // SANS & ACCESS MODE
  // ==========================================

  @Put('gyms/:id/access-mode')
  async updateAccessMode(
    @Param('id') id: string,
    @Body() body: UpdateGymAccessModeDto,
  ) {
    return this.adminService.updateGymAccessMode(id, body.accessMode);
  }

  @Post('gyms/:id/sans')
  async addSans(
    @Param('id') id: string,
    @Body() body: CreateGymSansDto,
  ) {
    return this.adminService.addGymSans(id, body);
  }

  @Delete('gyms/:id/sans/:sansId')
  async deleteSans(
    @Param('id') id: string,
    @Param('sansId') sansId: string,
  ) {
    return this.adminService.deleteGymSans(id, sansId);
  }

  // ==========================================
  // STAFF MANAGEMENT
  // ==========================================

  @Get('staff')
  async getStaff() {
    return this.adminService.getStaffList();
  }

  @Post('staff')
  async assignStaff(@Body() body: { phone: string; firstName: string; lastName: string; assignedGymId: string }) {
    return this.adminService.assignStaff(body);
  }

  // ==========================================
  // PLATFORM CLASSES OVERVIEW
  // ==========================================

  @Get('classes')
  async getAllClasses() {
    return this.adminService.getAllClassesList();
  }
}
