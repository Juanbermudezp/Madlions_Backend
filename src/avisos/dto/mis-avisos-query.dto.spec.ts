import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  MisAvisosQueryDto,
  PAGINA_AVISOS_INVALIDA,
  SOLO_NO_LEIDOS_INVALIDO,
} from './mis-avisos-query.dto.js';

const convertir = (datos: Record<string, unknown>) =>
  plainToInstance(MisAvisosQueryDto, datos);
const mensajes = async (datos: Record<string, unknown>) =>
  (
    await validate(convertir(datos), {
      whitelist: true,
      forbidNonWhitelisted: true,
    })
  ).flatMap((e) => Object.values(e.constraints ?? {}));

describe('MisAvisosQueryDto', () => {
  it('acepta la query vacía y los valores válidos', async () => {
    for (const datos of [
      {},
      { soloNoLeidos: 'true' },
      { soloNoLeidos: 'false', pagina: '3' },
      { pagina: '1' },
    ]) {
      expect(await mensajes(datos)).toEqual([]);
    }
  });

  it('convierte los textos de la URL a booleano y número', () => {
    const dto = convertir({ soloNoLeidos: 'true', pagina: '2' });
    expect(dto.soloNoLeidos).toBe(true);
    expect(dto.pagina).toBe(2);
    expect(convertir({ soloNoLeidos: 'false' }).soloNoLeidos).toBe(false);
  });

  it.each([
    [{ soloNoLeidos: 'si' }, SOLO_NO_LEIDOS_INVALIDO],
    [{ soloNoLeidos: '1' }, SOLO_NO_LEIDOS_INVALIDO],
    [{ pagina: '0' }, PAGINA_AVISOS_INVALIDA],
    [{ pagina: '-1' }, PAGINA_AVISOS_INVALIDA],
    [{ pagina: '1.5' }, PAGINA_AVISOS_INVALIDA],
    [{ pagina: 'dos' }, PAGINA_AVISOS_INVALIDA],
  ])('rechaza %o con un solo mensaje', async (datos, mensaje) => {
    expect(await mensajes(datos)).toEqual([mensaje]);
  });

  it('rechaza parámetros que no existen, como un id de miembro', async () => {
    expect(await mensajes({ miembroId: 'x' })).toHaveLength(1);
  });
});
