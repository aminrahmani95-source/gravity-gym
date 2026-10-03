import { Controller, Get, Param, Query } from '@nestjs/common';
import { GymsService } from './gyms.service';
import { GymDiscoveryQueryDto } from './dto/gym.dto';

@Controller('gyms')
export class GymsController {
  constructor(private readonly gymsService: GymsService) {}

  @Get()
  async getAll(@Query() query: GymDiscoveryQueryDto) {
    return this.gymsService.findAll(query);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.gymsService.findById(id);
  }

  @Get(':id/sans')
  async getSans(@Param('id') id: string) {
    return this.gymsService.getGymSans(id);
  }
}
