/**
 * RALLY · Setup global de Jest — zona horaria fija
 *
 * POR QUÉ EXISTE
 *   Los tests de fechas dependen del offset UTC de la máquina. Sin fijarlo,
 *   `new Date('2026-07-12')` da el 12 en cualquier TZ con offset POSITIVO
 *   (Madrid, Berlín) y el 11 en las de offset NEGATIVO (México, Bogotá).
 *   Es decir: en un CI en UTC, un test del bug pasaría sin probar nada.
 *
 *   Se fija America/Mexico_City (UTC-6) porque es el mercado del producto y
 *   porque su offset negativo es justo el que reproduce el desplazamiento.
 *   Un test que pasa aquí, pasa en cualquier sitio.
 *
 * Se hace en globalSetup y no en el script de npm para que funcione igual en
 * macOS, Linux y Windows: `TZ=x jest` no es sintaxis válida en cmd.exe.
 */

module.exports = async () => {
  process.env.TZ = 'America/Mexico_City';
};
