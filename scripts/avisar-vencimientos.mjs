/**
 * QA-24.1 · Ejecuta a mano la tarea diaria de avisos de vencimiento (H24).
 *
 * La tarea corre sola todos los días a las 06:00 (America/El_Salvador). Este
 * script la corre en el momento, con la base del .env, sin levantar la API.
 *
 *   npm run build
 *   node scripts/avisar-vencimientos.mjs              → como si fuera hoy
 *   node scripts/avisar-vencimientos.mjs 2026-11-21   → como si fuera ese día a las 06:00
 */
import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../dist/app.module.js';
import { AvisosVencimientoService } from '../dist/avisos/services/index.js';

const dia = process.argv[2];
if (dia && !/^\d{4}-\d{2}-\d{2}$/.test(dia)) {
  console.error('Uso: node scripts/avisar-vencimientos.mjs [AAAA-MM-DD]');
  process.exit(1);
}

const app = await NestFactory.createApplicationContext(AppModule, {
  logger: ['log', 'error', 'warn'],
});
try {
  const tarea = app.get(AvisosVencimientoService);
  // 06:00 en El Salvador = 12:00 UTC.
  const resultado = dia
    ? await tarea.avisarVencimientos(new Date(`${dia}T12:00:00.000Z`))
    : await tarea.ejecutar();
  console.log(resultado);
} finally {
  await app.close();
}
