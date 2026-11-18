import { Module } from '@nestjs/common';
import { UsersModule } from '@Users';
import { BloquesModule } from '@Bloques';
import { ConfiguracionModule } from '@Configuracion';
import { EntrenadoresController } from '@Entrenadores/controllers';
import { EntrenadoresService } from '@Entrenadores/services';

@Module({
    imports: [UsersModule, BloquesModule, ConfiguracionModule],
    controllers: [EntrenadoresController],
    providers: [EntrenadoresService],
    exports: [EntrenadoresService],
})
export class EntrenadoresModule { }