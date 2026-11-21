import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateUserDto } from './create-user.dto.js';

// Las mismas opciones del ValidationPipe global de main.ts.
const opciones = { whitelist: true, forbidNonWhitelisted: true };

const valido = {
  email: 'maria@example.com',
  password: 'Str0ngPass',
  nombre: 'María',
  apellido: 'López',
  telefono: '70001234',
};

async function erroresDe(datos: Record<string, unknown>) {
  const errores = await validate(plainToInstance(CreateUserDto, datos), opciones);
  return errores.map((e) => e.property);
}

describe('CreateUserDto', () => {
  it('acepta un registro válido', async () => {
    expect(await erroresDe(valido)).toEqual([]);
  });

  it('rechaza que el cliente envíe su propio rol', async () => {
    expect(await erroresDe({ ...valido, rol: 'ADMINISTRADOR' })).toContain('rol');
  });

  it('rechaza un nombre de menos de 2 caracteres', async () => {
    expect(await erroresDe({ ...valido, nombre: 'A' })).toContain('nombre');
  });

  it('rechaza un apellido de más de 50 caracteres', async () => {
    expect(await erroresDe({ ...valido, apellido: 'x'.repeat(51) })).toContain('apellido');
  });

  it.each(['1234567', '123456789', '7000-1234', 'abcdefgh'])(
    'rechaza el teléfono %s',
    async (telefono) => {
      expect(await erroresDe({ ...valido, telefono })).toContain('telefono');
    },
  );
});