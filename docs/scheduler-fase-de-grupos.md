# Scheduler de fase de grupos

**Estado:** especificación. No hay código todavía.
**Módulo previsto:** `src/lib/engine/schedule/grupos.ts` — lógica pura y determinista, sin dependencias, como `bloques.ts` y `knockout.ts`.
**Hermano:** el scheduler de eliminatorias (`src/lib/engine/schedule/knockout.ts`), que reparte el ÚLTIMO día. Este reparte los anteriores.

---

## 1. Qué problema resuelve, y cuál no

Cuando el organizador cierra inscripciones, cada categoría queda partida en grupos —de 3 casi siempre, de 4 cuando el número de parejas no es múltiplo de 3— y cada grupo tiene sus partidos creados en `matches`. Lo que no tienen es **hora ni cancha**. Este scheduler se las pone.

**Lo que NO hace:** repartir parejas entre horarios. Eso ya ocurrió en la inscripción — la pareja eligió su bloque y quedó guardado en `pair_block_choices` (migración 051). El scheduler recibe la asignación hecha y decide dos cosas dentro de cada bloque: **qué cancha** ocupa cada grupo y **en qué orden** juega sus partidos.

Esa frontera es deliberada. El momento de negociar el horario con la gente es cuando la gente está delante — inscribiéndose —, no tres días después cuando el organizador arma el calendario y ya no puede preguntar nada.

### El bloque, la unidad

Un grupo de 3 parejas es un round robin: 3 partidos. A 60 minutos por partido, eso es un **bloque de 3 horas seguidas en una sola cancha**.

No es una convención elegida en una pizarra. En el Sexto Torneo Cimepa, **52 de 55 grupos se jugaron exactamente así**. Los 3 restantes se partieron, y más abajo está por qué.

Un bloque tiene tantos **carriles** como canchas tenga el torneo. Un carril-bloque mide **3 partidos**: exactamente lo que dura un grupo de 3. Cimepa: 8 bloques × 8 canchas = 64 carriles.

Un grupo cuesta `n(n−1)/2` partidos, así que **no todos los grupos valen un carril**:

| Parejas | Partidos | Carriles |
|---|---|---|
| 2 | 1 | 1 (el carril no se parte) |
| 3 | 3 | 1 |
| 4 | 6 | 2 |
| 5 | 10 | 4 |

`computeFormat` produce grupos de 4 en cuanto el número de parejas no es múltiplo de 3 — 20 parejas dan `[4,4,3,3,3,3]` —, así que esto no es un caso raro. Ver `carrilesDeGrupo` en `src/lib/engine/schedule/bloques.ts`.

```
BLOQUE  sábado 08:00–11:00
┌──────────┬───────────────────────────────────────────────┐
│ Cancha 1 │ Grupo A de MxD:  A1-A2 · A1-A3 · A2-A3        │  ← un carril
│ Cancha 2 │ Grupo B de MxD:  B1-B2 · B1-B3 · B2-B3        │
│ Cancha 3 │ Grupo A de 2ªF:  ...                          │
│   …      │                                               │
│ Cancha 8 │ Grupo D de MxD:  ...                          │
└──────────┴───────────────────────────────────────────────┘
   08:00        09:00        10:00        11:00
```

---

## 2. Lo que el torneo real ya decidió

Cinco hechos de Cimepa que este documento trata como **restricciones dadas**, no como opciones a reconsiderar.

### 2.1 Las categorías ocupan carriles, no huecos sueltos

Mixtos D tuvo la Cancha 8 catorce horas del sábado. 2ª Fuerza tuvo la Cancha 3. No es casualidad ni pereza del organizador: mantener una categoría en una cancha hace que el juez, la mesa y los jugadores sepan a dónde ir sin consultar nada.

**Consecuencia para el scheduler:** al asignar carriles debe preferir mantener una categoría en la misma cancha entre bloques consecutivos. Es una preferencia, no una restricción dura: si estorba, se rompe.

### 2.2 La ocupación real fue 85 %, y ese techo es real

192 canchas-hora disponibles, 28 ociosas. **El scheduler no debe prometer que las recupera.**

Las 28 horas no son desperdicio corregible. La mayor parte es el viernes de 14:00 a 17:00, con 3 canchas ocupadas de 8, porque a esa hora la gente trabaja. Compactar ahí significa poner gente a jugar a una hora a la que no puede ir.

**Consecuencia para el scheduler:** su métrica de éxito NO es la ocupación. Un calendario al 85 % con la gente en el horario que eligió es mejor que uno al 98 % con gente que no llega. Si el scheduler reporta ocupación, la reporta como dato, nunca como objetivo a maximizar.

### 2.3 Una pareja SIEMPRE juega dos partidos seguidos

En un grupo de 3 corrido, el partido del medio comparte una pareja con el de antes y otra con el de después. Es aritmética, no un fallo del reparto:

```
09:00  A vs B      ← A juega
10:00  A vs C      ← A juega otra vez, seguida
11:00  B vs C      ← B jugó a las 9 y otra vez a las 11
```

Con 3 parejas y 3 partidos, alguna encadena dos. Siempre.

Cimepa **aceptó ese costo a propósito**: a cambio, la pareja está 3 horas en el club y no 6. Es una preferencia legítima de un torneo amateur donde la gente tiene sábado y familia.

**Consecuencia para el scheduler:** el bloque corrido es el modo por defecto, pero la alternativa —espaciar los partidos del grupo a lo largo del día para que nadie encadene— tiene que existir como **opción explícita del organizador**, no quedar prohibida por el diseño. El motor expone la preferencia; no arbitra cuál es la correcta.

### 2.4 Los grupos no se parten, salvo cuando la cancha se ocupa

En Cimepa pasó dos veces. En ambas se movió **el último partido del bloque**, nunca el primero ni el del medio.

Tiene sentido y es la regla: mover el primero desplaza los otros dos; mover el del medio parte el bloque en dos trozos y obliga a las tres parejas a esperar. Mover el último solo afecta a las dos parejas que lo juegan, y una de ellas ya iba a jugar seguido de todas formas.

**Consecuencia para el scheduler:** cuando un carril no alcanza para los 3 partidos, el que se desplaza es siempre el tercero. Nunca el primero, nunca el segundo.

### 2.5 Hay jugadores en dos categorías

El mismo concepto que ya resuelve `knockout.ts`: **dos categorías son hermanas si comparten al menos un jugador**. En eliminatorias el caso fue Santiago Cantillo, con semifinal de 2ª y final de 3ª a las 17:00 — no eran dos parejas en conflicto, era una persona que no puede estar en dos canchas.

En fase de grupos el conflicto es peor: no es un partido de una hora, son **tres horas seguidas**. Si sus dos grupos caen en el mismo bloque, esa persona no puede jugar ninguno de los dos completos.

**Consecuencia para el scheduler:** dos grupos de categorías hermanas no deben coincidir en el mismo bloque si se puede evitar. Se reutiliza `grafoDeHermandad` de `knockout.ts` sin cambiarlo — hoy es privada; habrá que exportarla o levantarla a un módulo compartido.

Y el mismo límite que allí: es una **preferencia fuerte, no una restricción**. Un grafo de hermandad denso no puede dejar carriles vacíos indefinidamente. Cuando no se puede evitar, se coloca igual y se reporta el empalme.

---

## 3. Entradas

```ts
export interface GrupoAProgramar {
  id:          string;   // groups.id
  categoryId:  string;
  nombre:      string;   // 'A', 'B', …
  /** Ids de pareja. 3 en el caso normal, 4 o 5 en categorías chicas (§6.4). */
  parejas:     string[];
  /** Los partidos ya creados, tal como los emitió `generateRoundRobin`. */
  partidos:    { matchId: string; pairAId: string; pairBId: string; ronda: number }[];
  /**
   * Bloque en el que juega. Lo fija `close-registration`: el de sus parejas, o
   * el de la mayoría si el grupo se armó con restos (§6.3).
   * Null solo si ninguna de sus parejas eligió horario (§6.2).
   */
  bloqueId:    string | null;
  /** Carriles que consume: `carrilesDeGrupo(parejas.length)`. 3→1, 4→2, 5→4. */
  carriles:    number;
}

export interface EntradaSchedulerGrupos {
  /** La retícula, tal cual la emite `generarBloques`. El scheduler no la recalcula. */
  bloques:     Bloque[];
  minutosPorPartido: number;
  grupos:      GrupoAProgramar[];
  /** Por categoría, los jugadores que la juegan. Alimenta el grafo de hermandad. */
  jugadoresPorCategoria: Record<string, string[]>;
  /**
   * 'corrido'  — los partidos del grupo seguidos (por defecto, lo de Cimepa).
   * 'espaciado' — un partido por ronda a lo largo del día, nadie encadena.
   * Ver §2.3: es decisión del organizador, no del motor.
   */
  modo?: 'corrido' | 'espaciado';
}
```

**De dónde sale `bloqueId`.** Lo garantiza `close-registration`, que desde `repartirPorBloque` (`src/lib/engine/schedule/reparto.ts`) arma los grupos **dentro de cada bloque**. Antes repartía con un snake sobre `created_at` que ignoraba la elección por completo, y un grupo podía salir con tres parejas de tres bloques distintos.

Lo que ese reparto garantiza, y en lo que el scheduler puede apoyarse:

- Un grupo sale de un solo bloque siempre que sus parejas den para llenarlo.
- Cuando no, se arma con los **restos** de varios bloques y su bloque es el de la **mayoría** (empate al bloque más temprano; un bloque real siempre gana a "sin bloque"). Ver §6.3.
- **Nunca** queda una pareja fuera de un grupo. Sin grupo no juega, y ya pagó.
- El número y el tamaño de los grupos no cambian: siguen siendo los de `plan.groupSizes`, porque de ahí salen el cuadro de eliminatorias y `advancePerGroup`.

---

## 4. Salidas

```ts
export interface PartidoDeGrupo {
  matchId:    string;
  groupId:    string;
  categoryId: string;
  bloqueId:   string;
  /** 'YYYY-MM-DDTHH:MM' local del torneo. Va a matches.scheduled_at. */
  inicio:     string;
  /** 1..canchas. Se escribe como `Cancha ${n}`, igual que el knockout. */
  cancha:     number;
  /** 0, 1 o 2: posición dentro del bloque. */
  ordenEnBloque: number;
  /** true si se desplazó fuera de su bloque por falta de carril. Ver §5.5. */
  desplazado: boolean;
}

export interface CalendarioGrupos {
  partidos: PartidoDeGrupo[];

  /** Grupos que no se pudieron colocar. Vacío es el caso bueno. */
  sinProgramar: { groupId: string; motivo: 'sin_bloque' | 'bloque_sobrevendido' }[];

  /** Grupos de categorías hermanas que aun así quedaron en el mismo bloque. */
  empalmes: { bloqueId: string; categoriaA: string; categoriaB: string }[];

  /** Bloques con más grupos que carriles. Ver §5.4. */
  sobrevendidos: { bloqueId: string; grupos: number; carriles: number }[];

  /** Dato, no objetivo. Ver §2.2. */
  ocupacion: { canchasHoraUsadas: number; canchasHoraDisponibles: number; porcentaje: number };

  avisos: string[];
}
```

### Dónde se escribe

Directo en `matches.scheduled_at` y `matches.court_label`. **No** en `match_schedule`: esa tabla existe porque las rondas de eliminatorias se materializan una a una y el plan cubre partidos que todavía no tienen fila (ver la cabecera de la migración 047), y de hecho tiene un check que prohíbe `stage = 'group'`. Los partidos de grupo existen desde `close-registration`, así que no hay nada que planificar en el aire.

---

## 5. El algoritmo

Determinista: misma entrada, misma salida. El orden de la entrada no debe cambiar el resultado — se ordena canónicamente antes de empezar, como hace `generarBloques` con las ventanas.

### 5.1 Agrupar por bloque

Los grupos se indexan por `bloqueId`. Los de `bloqueId === null` salen a `sinProgramar` con motivo `sin_bloque` y no estorban al resto (§6.2).

### 5.2 Ordenar los bloques y los grupos dentro de cada uno

Bloques en orden cronológico. Dentro de cada bloque, los grupos se ordenan por:

1. **Categoría con más grupos primero.** Una categoría grande necesita carriles contiguos para cumplir §2.1; si se coloca al final, ya solo quedan huecos sueltos.
2. A igualdad, por `categoryId` y luego por nombre de grupo. Solo para romper empates de forma estable.

### 5.3 Asignar carril (cancha) a cada grupo

Para cada bloque, en orden, y para cada grupo:

1. **Continuidad de categoría (§2.1).** Si esta categoría ocupó canchas en el bloque anterior y alguna sigue libre, se prefiere esa. Es lo que produce el patrón "Mixtos D en la Cancha 8 todo el sábado".
2. **Hermandad (§2.5).** Si en este bloque ya hay un grupo de una categoría hermana, se intenta mover este grupo al **siguiente bloque con carril libre**. El desplazamiento tiene tope: si a los `MAX_BLOQUES_ESPERA` bloques siguientes no hay hueco limpio, se coloca aquí igual y se anota en `empalmes`. Mismo criterio que `MAX_ESPERA_POR_EMPALME` en el knockout: dejar carriles ociosos esperando un hueco perfecto es peor que el empalme que evita.

   Un grupo desplazado por hermandad **cambia de bloque**, lo cual contradice la elección de sus parejas. Por eso el desplazamiento por hermandad se hace **solo si el bloque destino tiene carril libre y el grupo no tenía preferencia firme**, y en la práctica esto casi nunca se activa: lo normal es que la hermandad se resuelva reordenando dentro del bloque, no moviendo de bloque. Cuando no se puede, gana la elección de la pareja y se reporta el empalme. **La elección del jugador pesa más que la comodidad del calendario.**
3. **Primer carril libre.** Si nada de lo anterior aplica, el de número más bajo.

Un grupo que consume más de un carril (§6.4) los reserva **juntos**: dos canchas del mismo bloque si las hay, y si no, la misma cancha en dos bloques consecutivos. Repartirlos sueltos deja al grupo jugando en horas inconexas, que es justo lo que el bloque existe para evitar.

### 5.4 Ordenar los partidos dentro del carril

Modo `corrido` (por defecto):

```
t+0·min    partidos[0]
t+1·min    partidos[1]
t+2·min    partidos[2]
```

en el orden que emitió `generateRoundRobin`, que ya es determinista (método del círculo). No se reordena para "repartir" el descanso: como dice §2.3, alguien encadena sí o sí, y reordenar solo cambia a quién le toca sin reducir el total.

Modo `espaciado`: el partido de la ronda *k* de todos los grupos de la categoría va en el bloque *k*. Nadie encadena, y a cambio la pareja pasa el día entero en el club. Esta rama consume tantos bloques como rondas tenga el grupo, así que la capacidad se divide por ese número — hay que decírselo al organizador antes de que la elija, no después.

### 5.5 Cuando el carril no alcanza: se mueve el ÚLTIMO (§2.4)

Si un bloque tiene un carril que solo cabe parcialmente —porque la ventana del día se acaba, o porque el organizador ocupó la cancha para otra cosa—, se programan los partidos que caben y el **último** se desplaza al primer hueco libre posterior, marcado `desplazado: true`. En un grupo de 3 es el tercero; en uno de 4, el sexto.

Nunca el primero, nunca los del medio. La regla no tiene excepciones: en las dos veces que pasó en Cimepa se movió el último, y es la única opción que no obliga a todas las parejas del grupo a esperar.

---

## 6. Los casos que no son el camino feliz

### 6.1 Bloque sobrevendido

Más grupos que carriles. Puede pasar por dos vías: el organizador metió parejas a la fuerza en un bloque lleno (`pair_block_choices.forzado = true`, ver §5 de la migración 051), o dos parejas tomaron el último lugar a la vez.

**No es un error y no aborta la corrida.** Se programan los grupos que caben, en el orden de §5.2. Los que sobran salen a `sinProgramar` con motivo `bloque_sobrevendido`, y el bloque entero se lista en `sobrevendidos` con las dos cifras: cuántos grupos y cuántos carriles.

El scheduler **no reubica** esos grupos a otro bloque por su cuenta. Sería deshacer la elección de las parejas sin avisarles, que es exactamente lo que este diseño vino a eliminar. Lo que hace es dejar el problema visible y con nombre para que el organizador decida: abrir otra cancha en ese horario, o hablar con esas parejas.

Esto ya tiene su pantalla: `app/(organizer)/org/torneos/[tournamentId]/bloques.tsx` marca el bloque en rojo y dice "necesita 9 canchas y solo hay 8".

### 6.2 Parejas y grupos sin bloque

Ocurre en tres situaciones reales:

- El torneo no tenía canchas ni horarios capturados cuando la gente se inscribió. La inscripción funciona igual, a propósito (§f del encargo original): una configuración que el organizador no ha hecho no puede bloquear a nadie.
- El insert de la elección falló después de crear la pareja.
- El organizador cambió las ventanas y el `bloque_id` guardado ya no existe.

En los tres, el grupo sale a `sinProgramar` con motivo `sin_bloque` y **el resto del calendario se programa normalmente**. Un grupo sin horario no puede impedir que los otros 54 tengan el suyo.

Lo que el scheduler **no** hace es inventarles un bloque. Asignar horario por su cuenta a gente que no lo eligió reintroduce justo el problema que este rediseño elimina: el organizador vuelve a ser el responsable del horario que le tocó a cada quien.

### 6.3 Grupos mezclados: los restos

Es el caso normal, no una anomalía. Un bloque con 7 parejas de una categoría da dos grupos y deja una suelta; esa pareja se junta con los restos de los otros bloques de su categoría.

`close-registration` ya resuelve a qué bloque pertenece ese grupo: **el de la mayoría de sus parejas**, con el empate roto hacia el bloque más temprano. El scheduler lo recibe con `bloqueId` puesto y lo programa como cualquier otro; no tiene que decidir nada.

Lo que sí cambia es fuera del scheduler: **a las parejas en minoría les cambió la hora respecto a la que eligieron, y hay que avisarles.** Esa es la única promesa que este diseño rompe, y se rompe conscientemente, porque la alternativa —dejarlas sin grupo— es peor. El parte del cierre de inscripciones lo dice por categoría, y es el único momento en que ese dato existe: `pair_block_choices` guarda lo que cada pareja eligió, no en qué grupo acabó, y `groups` no tiene columna de bloque.

**Pendiente de producto, no de motor:** hoy ese aviso lo lee el organizador una sola vez, en la pantalla de cierre. Si se quiere que la pareja se entere sola, hace falta o una columna de bloque en `groups` o un correo al cerrar. Anotado en §8.

### 6.4 Grupos que no son de 3

`computeFormat` produce grupos de 4 en cuanto el número de parejas no es múltiplo de 3, y de 5 en categorías muy chicas. Cuesta **dos carriles**, no uno (§1), y `cupoDeBloque` ya lo cuenta así: un bloque vacío de 8 canchas ofrece 16 lugares a una categoría de grupos de 4, no los 24 que anunciaba antes.

**Un grupo de 4 tiene dos formas de gastar sus dos carriles, y el scheduler debe preferir la primera:**

```
A) DOS CANCHAS, UN BLOQUE (3 h)          B) UNA CANCHA, DOS BLOQUES (6 h)
   Cancha 1   A-B   A-C   A-D               Cancha 1   A-B  A-C  A-D  B-C  B-D  C-D
   Cancha 2   C-D   B-D   B-C
   Un round robin de 4 son 3 rondas de       Todo seguido, pero la gente pasa
   2 partidos: se juegan en paralelo.        seis horas en el club.
```

(A) respeta §2.3 — 3 horas en el club, no 6 — que es exactamente por lo que Cimepa aceptó el encadenamiento de partidos. (B) es el recurso cuando no hay dos canchas libres en el mismo bloque. Si no cabe ninguna de las dos, el grupo sale a `sinProgramar`.

**Grupo de 2:** 1 partido, 1 hora. Ocupa un carril entero igual, porque el carril es la unidad de reserva. Las 2 horas sobrantes se cuentan como ociosas y no se rellenan con otro grupo: partir el carril rompe §2.1 y complica la vida al juez por una hora de cancha.

### 6.5 Sin bloques en absoluto

`bloques` vacío —sin canchas o sin ventanas capturadas—. El scheduler devuelve un calendario vacío con todos los grupos en `sinProgramar` y un aviso claro. No lanza. Mismo criterio que `cargarBloquesDelTorneo`.

### 6.6 Correr dos veces

Idempotente sobre la misma entrada: mismo reparto, mismas canchas, mismas horas. Reprogramar sobrescribe `scheduled_at` y `court_label` de los partidos que toca; los que ya se jugaron (`status = 'finished'`) **no se tocan** — su hora es un hecho histórico, no un plan.

---

## 7. Verificación contra Cimepa

El seed `scripts/seed-cimepa.mjs` reproduce el torneo: 165 parejas, 8 categorías, 8 canchas, 60 min. Las cifras de la retícula ya están fijadas como test en `src/lib/__tests__/bloques-cimepa.test.ts`:

| Dato | Valor | Estado |
|---|---|---|
| Bloques | 8 (3 el viernes, 5 el sábado) | ✅ verificado |
| Domingo | 0 bloques — es el día de eliminatorias | ✅ verificado |
| Carriles | 64 (8 bloques × 8 canchas) | ✅ verificado |
| Capacidad | 192 parejas | ✅ verificado |
| Carriles que exigen 165 parejas | 59 de 64 | ✅ verificado |
| Minutos desperdiciados en las ventanas | 0 | ✅ verificado |

**Por qué 59 y no 55.** Dividir 165 entre 3 da 55 y anuncia capacidad que no existe. La cuenta sale del reparto real de `computeFormat`:

- Las cinco categorías de 21 parejas se reparten en sietes de 3 → 7 carriles cada una → **35**
- Las tres de 20 parejas dan `[4,4,3,3,3,3]`, y cada grupo de 4 vale dos carriles → 8 cada una → **24**

Una pareja *menos* puede costar un carril *más*: 21 cierra en grupos de 3 y 20 obliga a dos de 4. No es un error de redondeo, es la forma del reparto.

El scheduler tendrá que reproducir además:

| Comprobación | Criterio de aceptación |
|---|---|
| Grupos en un solo bloque | ≥ 52 de 55 grupos con sus partidos en el mismo bloque y consecutivos |
| Grupos mezclados | Los que salgan del reparto por restos, cada uno programado en el bloque de su mayoría |
| Grupos partidos | ≤ 3, y en todos el desplazado es `ordenEnBloque === 2` |
| Continuidad de categoría | Mixtos D y 2ª Fuerza cada una en una sola cancha durante el sábado |
| Ocupación | ≈ 85 %. **Un resultado muy por encima es sospechoso**, no una mejora: significa que se compactó el viernes por la tarde, que es la hora a la que la gente trabaja |
| Encadenamientos | En modo `corrido`, exactamente 1 por grupo. Si sale 0, hay un error: es aritméticamente imposible |
| Empalmes de hermanas | 0 en el caso de Cimepa. Si aparecen, se listan con nombre |
| Determinismo | Dos corridas sobre la misma entrada, byte a byte iguales |

La comprobación de ocupación es la que más fácil se lee al revés. Está escrita como cota superior a propósito: **el scheduler no está compitiendo por llenar canchas.**

---

## 8. Pendientes antes de escribir el motor

### Cerrados

1. ~~`close-registration` tiene que formar grupos por bloque.~~ **Hecho.** `repartirPorBloque` (`src/lib/engine/schedule/reparto.ts`) arma los grupos dentro de cada bloque, junta los restos y nunca deja una pareja fuera. Con tests. Era el bloqueante real.
2. ~~`cupoDeBloque` asume grupos de 3.~~ **Hecho.** El coste se cuenta en partidos: `carrilesDeGrupo(n) = ceil(n(n−1)/2 / partidosPorCarril)`. La pantalla de ocupación ya no anuncia lugares que no existen.

### Abiertos

1. **`grafoDeHermandad` es privada en `knockout.ts`.** Hay que exportarla o levantarla a un módulo compartido. No cambiarla: funciona y tiene tests.
2. **El grupo mezclado no queda registrado en ningún sitio consultable.** Hoy el aviso vive en la respuesta de `close-registration` y se enseña una vez, en el parte del cierre. Si se quiere que la pareja se entere sola del cambio de hora, hace falta una columna de bloque en `groups` (una migración) o un correo al cerrar. Decisión de producto, no de motor.
3. **Zona horaria.** `matches.scheduled_at` es `timestamptz` y los bloques son horas locales del club. Ya existe `ZONA_TORNEO = 'America/Mexico_City'` en `src/lib/fechas.ts`; el motor debe emitir hora local y dejar la conversión al llamador, como hace el knockout.
4. **Decidir dónde vive el disparador.** El knockout va por la Edge Function `schedule-knockout`. Lo simétrico es una `schedule-groups`, lo cual obliga a regenerar `engine.bundle.js` (`npm run build:engine`). Ojo: `close-registration` no usa el bundle sino su propio shim, así que el reparto por bloque no lo necesitó.

---

## 9. Decisiones confirmadas

Dos puntos que quedaron abiertos en la primera versión y ya están resueltos. Se dejan escritos porque son los que más fácil se revierten sin querer.

**La hermandad no mueve a nadie de bloque (§5.3).** Cuando dos grupos de categorías hermanas caen en el mismo bloque y no se pueden separar reordenando, se colocan igual y se reporta el empalme. La pareja eligió su horario y moverla contradice lo único que le prometimos. El scheduler informa; no arbitra a costa del jugador.

**La ocupación es una cota superior, no un objetivo (§2.2).** Cimepa fue al 85 %, con 28 canchas-hora ociosas, la mayoría el viernes de 14:00 a 17:00. Compactar ahí es poner gente a jugar cuando trabaja. Un resultado muy por encima del 85 % es motivo de sospecha, no de celebración.
