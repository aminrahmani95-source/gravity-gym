import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ClassesService } from './classes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import {
  UserRole,
  ClassVenueType,
  ClassDifficulty,
  ClassAttendanceStatus,
  CreateClassDto,
  UpdateClassDto,
  CreateClassSessionDto,
  CreateCoachMonthlyPlanDto,
} from '@gym-app/shared-types';

@Controller('classes')
export class ClassesController {
  constructor(private readonly classesService: ClassesService) {}

  // ==========================================
  // PUBLIC DISCOVERY
  // ==========================================

  @Get('categories')
  async getCategories() {
    return this.classesService.getCategories();
  }

  @Get('venues')
  async getVenues(@Query('type') type?: ClassVenueType) {
    return this.classesService.getVenues(type);
  }

  @Get()
  async getClasses(
    @Query('category') category?: string,
    @Query('coachId') coachId?: string,
    @Query('city') city?: string,
    @Query('district') district?: string,
    @Query('venueType') venueType?: ClassVenueType,
    @Query('difficulty') difficulty?: ClassDifficulty,
    @Query('maxPrice') maxPrice?: string,
    @Query('search') search?: string,
  ) {
    return this.classesService.getClasses({
      category,
      coachId,
      city,
      district,
      venueType,
      difficulty,
      maxPrice: maxPrice ? Number(maxPrice) : undefined,
      search,
    });
  }

  // ==========================================
  // COACH-SPECIFIC ROUTES (Must precede :id)
  // ==========================================

  @Get('coach/my-classes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getCoachClasses(@CurrentUser('sub') userId: string) {
    return this.classesService.getCoachClasses(userId);
  }

  @Get('coach/my-sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getCoachSessions(@CurrentUser('sub') userId: string) {
    return this.classesService.getCoachSessions(userId);
  }

  // ==========================================
  // MEMBER PASSES & BOOKINGS (Must precede :id)
  // ==========================================

  @Get(['member/my-bookings', 'member/bookings'])
  @UseGuards(JwtAuthGuard)
  async getMemberBookings(@CurrentUser('sub') userId: string) {
    return this.classesService.getUserBookings(userId);
  }

  @Get(['member/my-plans', 'member/enrollments'])
  @UseGuards(JwtAuthGuard)
  async getMemberPlans(@CurrentUser('sub') userId: string) {
    return this.classesService.getUserEnrollments(userId);
  }

  @Post('checkin/verify-qr')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH, UserRole.GYM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async verifyQr(@Body() body: { qrToken: string }) {
    return this.classesService.verifyClassQrToken(body.qrToken);
  }

  // ==========================================
  // SESSIONS SPECIFIC ROUTES
  // ==========================================

  @Get('sessions/:sessionId')
  async getSessionById(@Param('sessionId') sessionId: string) {
    return this.classesService.getSessionById(sessionId);
  }

  @Get('sessions/:sessionId/attendees')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH, UserRole.GYM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async getSessionAttendees(
    @CurrentUser('sub') userId: string,
    @Param('sessionId') sessionId: string,
  ) {
    return this.classesService.getSessionAttendees(userId, sessionId);
  }

  @Put('sessions/:sessionId/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async cancelSession(
    @CurrentUser('sub') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { reason?: string },
  ) {
    return this.classesService.cancelSession(userId, sessionId, body.reason);
  }

  @Post('sessions/:sessionId/book-with-plan')
  @UseGuards(JwtAuthGuard)
  async bookWithPlan(
    @CurrentUser('sub') userId: string,
    @Param('sessionId') sessionId: string,
    @Body() body: { enrollmentId: string },
  ) {
    return this.classesService.bookSessionUsingMonthlyPlan(userId, sessionId, body.enrollmentId);
  }

  @Post(['bookings/:bookingId/cancel', 'member/bookings/:bookingId/cancel'])
  @UseGuards(JwtAuthGuard)
  async cancelBooking(
    @CurrentUser('sub') userId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: { reason?: string },
  ) {
    return this.classesService.cancelBooking(userId, bookingId, body.reason);
  }

  @Put('bookings/:bookingId/attendance')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH, UserRole.GYM_STAFF, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async markAttendance(
    @CurrentUser('sub') userId: string,
    @Param('bookingId') bookingId: string,
    @Body() body: { status: ClassAttendanceStatus },
  ) {
    return this.classesService.markAttendance(userId, bookingId, body.status);
  }

  // ==========================================
  // CLASS SPECIFIC & PARAMETERIZED ROUTES
  // ==========================================

  @Get(':id')
  async getClassById(@Param('id') id: string) {
    return this.classesService.getClassById(id);
  }

  @Get(':id/sessions')
  async getClassSessions(@Param('id') id: string) {
    return this.classesService.getClassSessions(id);
  }

  @Get(':id/plans')
  async getClassPlans(@Param('id') id: string) {
    return this.classesService.getMonthlyPlans(id);
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createClass(
    @CurrentUser('sub') userId: string,
    @Body() dto: CreateClassDto,
  ) {
    return this.classesService.createClass(userId, dto);
  }

  @Put(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async updateClass(
    @CurrentUser('sub') userId: string,
    @Param('id') classId: string,
    @Body() dto: UpdateClassDto,
  ) {
    return this.classesService.updateClass(userId, classId, dto);
  }

  @Post(':id/sessions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createSession(
    @CurrentUser('sub') userId: string,
    @Param('id') classId: string,
    @Body() dto: Omit<CreateClassSessionDto, 'classId'>,
  ) {
    return this.classesService.createSession(userId, { ...dto, classId });
  }

  @Post(':id/plans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COACH, UserRole.ADMIN, UserRole.SUPER_ADMIN)
  async createMonthlyPlan(
    @CurrentUser('sub') userId: string,
    @Param('id') classId: string,
    @Body() dto: Omit<CreateCoachMonthlyPlanDto, 'classId'>,
  ) {
    return this.classesService.createMonthlyPlan(userId, { ...dto, classId });
  }
}
