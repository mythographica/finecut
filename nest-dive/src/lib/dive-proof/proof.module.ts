import { Module } from '@nestjs/common';
import { ProofController } from './proof.controller.js';

@Module({
	controllers : [ProofController],
})
export class ProofModule {}
