/**
 * EngineModule — Admin API routes.
 */
import { Module } from '@nestjs/common';
import { EngineController } from './engine.controller.js';
import { EngineService } from './engine.service.js';

@Module({
	controllers : [EngineController],
	providers   : [EngineService],
})
export class EngineModule {}
