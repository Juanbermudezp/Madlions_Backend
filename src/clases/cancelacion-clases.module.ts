import { Module } from '@nestjs/common';
import { AvisosModule } from '@Avisos';
import { ClasesModule } from './clases.module.js';
import { CancelacionClaseController } from './controllers/cancelacion-clase.controller.js';
import { CancelacionClaseService } from './services/cancelacion-clase.service.js';

/** Integra H7 con el servicio oficial H25 exportado por AvisosModule.
 * Reutiliza ClaseRepository y evita registrar una segunda instancia de H25.
 */
@Module({
    imports: [ClasesModule, AvisosModule],
    controllers: [CancelacionClaseController],
    providers: [CancelacionClaseService],
})
export class CancelacionClasesModule {}
