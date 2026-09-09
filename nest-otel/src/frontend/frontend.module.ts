/**
 * FrontendModule — Page rendering with mnemonica chain.
 */
import { Module } from '@nestjs/common';
import { FrontendController } from './frontend.controller.js';
import { FrontendService } from './frontend.service.js';

@Module({
	controllers : [FrontendController],
	providers   : [FrontendService],
})
export class FrontendModule {}
