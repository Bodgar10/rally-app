# Scheduler de fase de grupos

**Estado:** implementado en `src/lib/engine/schedule/grupos.ts`, con tests en `__tests__/grupos.test.ts` y `__tests__/grupos-cimepa.test.ts`.
**Módulo:** lógica pura y determinista, como `bloques.ts` y `knockout.ts`. Su única dependencia es `grafoDeHermandad`, que se exporta de `knockout.ts` sin cambiarla.
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

**Consecuencia para el scheduler:** el bloque corrido es el único modo. La alternativa —espaciar los partidos a lo largo del día para que nadie encadene— se descartó al implementar: ver §5.4. No cabe dentro de un bloque, así que espaciar significa sacar partidos del horario que la pareja eligió, y eso rompe lo único que se le prometió.

En cada grupo de 3 encadenan **dos** de las tres parejas, no una. Con tres turnos y dos partidos por pareja, dos de ellas caen en turnos seguidos por aritmética pura. La descripción de arriba —"el del medio comparte pareja con el de antes y el de después"— es correcta; lo que no se puede es contarlo como un solo encadenamiento.

### 2.4 Los grupos no se parten, salvo cuando la cancha se ocupa

En Cimepa pasó dos veces. En ambas se movió **el último partido del bloque**, nunca el primero ni el del medio.

Tiene sentido y es la regla: mover el primero desplaza los otros dos; mover el del medio parte el bloque en dos trozos y obliga a las tres parejas a esperar. Mover el último solo afecta a las dos parejas que lo juegan, y una de ellas ya iba a jugar seguido de todas formas.

**Consecuencia para el scheduler:** cuando un carril no alcanza para los 3 partidos, el que se desplaza es siempre el tercero. Nunca el primero, nunca el segundo.

### 2.5 Hay jugadores en dos categorías

El mismo concepto que ya resuelve `knockout.ts`: **dos categorías son hermanas si comparten al menos un jugador**. En eliminatorias el caso fue Santiago Cantillo, con semifinal de 2ª y final de 3ª a las 17:00 — no eran dos parejas en conflicto, era una persona que no puede estar en dos canchas.

En fase de grupos el conflicto es peor: no es un partido de una hora, son **tres horas seguidas**. Si sus dos grupos caen en el mismo bloque, esa persona no puede jugar ninguno de los dos completos.

**Consecuencia para el scheduler: detectar y avisar. Nada más.** No hay nada que optimizar, y conviene entender por qué, porque en eliminatorias sí lo había.

En el cuadro, separar es barato: cada categoría ocupa pocas franjas del último día, así que mover una ronda media hora casi siempre encuentra hueco. En fase de grupos **cada categoría tiene un grupo en casi todos los bloques** —Cimepa: 2ª y 3ª Fuerza comparten 7 de los 8—, así que coincidir es la norma, no la excepción.

Y dentro de un bloque el conflicto es irreducible por dos razones que se acumulan:

1. Todos los grupos del bloque ocupan **las mismas tres horas**, en canchas distintas. Cambiar de cancha no cambia la hora.
2. Reordenar los partidos tampoco: en un grupo de 3, cada pareja juega **2 de los 3 turnos**, y dos subconjuntos de tamaño 2 sobre 3 elementos siempre se cruzan. No existe el orden que salve a esa persona.

Moverlo de bloque sí lo arreglaría, y por eso está prohibido: deshace el horario que la pareja eligió, que es la única promesa que se le hizo (§9).

Así que se detecta con `grafoDeHermandad` —exportada de `knockout.ts` sin tocarla—, se nombra el par de categorías y el bloque, y se avisa. **La persona que juega dos categorías va a tener que elegir, y quien se lo dice es el organizador, no el algoritmo.**

---

## 3. Entradas

```ts
export interface GrupoAProgramar {
  id:          string;   // groups.id
  categoryId:  string;
  nombre:      string;   // 'A', 'B', …
  /**
   * Los partidos ya creados, tal como los emitió `generateRoundRobin`, CON su
   * número de ronda. De ahí sale la huella del grupo — ver §5.0 —, así que las
   * parejas y los carriles no hacen falta como entrada: se derivan.
   */
  partidos:    { matchId: string; pairAId: string; pairBId: string; ronda: number }[];
  /**
   * Bloque en el que juega. Lo fija `close-registration`: el de sus parejas, o
   * el de la mayoría si el grupo se armó con restos (§6.3).
   * Null solo si ninguna de sus parejas eligió horario (§6.2).
   */
  bloqueId:    string | null;
}

export interface EntradaSchedulerGrupos {
  /** La retícula, tal cual la emite `generarBloques`. El scheduler no la recalcula. */
  bloques:     Bloque[];
  minutosPorPartido: number;
  grupos:      GrupoAProgramar[];
  /** Por categoría, los jugadores que la juegan. Alimenta el grafo de hermandad. */
  jugadoresPorCategoria: Record<string, string[]>;
  /** Solo 'corrido'. Ver §5.4: el modo espaciado se descartó. */
  modo?: 'corrido';
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
  /** Turno DENTRO DEL BLOQUE, 0-based. No es el índice del partido en el grupo:
   *  un grupo de 4 juega dos partidos en el mismo turno, en dos canchas. */
  ordenEnBloque: number;
  /** El partido cayó en un bloque posterior al del grupo. Solo grupos de 5. Ver §5.5. */
  desplazado: boolean;
}

export type MotivoSinProgramar =
  | 'sin_bloque'            // ninguna de sus parejas eligió horario (§6.2)
  | 'bloque_desconocido'    // eligieron un bloque que ya no existe (§6.2)
  | 'bloque_sobrevendido'   // el bloque no tiene carriles libres (§6.1)
  | 'no_cabe_en_el_bloque'; // necesita más turnos de los que quedan (§5.5)

export interface CalendarioGrupos {
  partidos: PartidoDeGrupo[];

  /** Grupos que no se pudieron colocar. Vacío es el caso bueno. */
  sinProgramar: { groupId: string; categoryId: string; motivo: MotivoSinProgramar }[];

  /** Categorías hermanas con grupos en el mismo bloque. Informativo: ver §2.5. */
  empalmes: { bloqueId: string; categoriaA: string; categoriaB: string }[];

  /** Bloques que piden más carriles de los que tienen. Ver §6.1. */
  sobrevendidos: { bloqueId: string; carrilesPedidos: number; carriles: number; grupos: number }[];

  /** Dato, no objetivo. Ver §2.2. */
  ocupacion: { canchasHoraUsadas: number; canchasHoraDisponibles: number; porcentaje: number };

  /** Canchas ocupadas en cada bloque, para pintar el calendario. */
  ocupacionPorBloque: { bloqueId: string; canchasUsadas: number; carriles: number }[];

  avisos: string[];
}
```

**`bloque_desconocido` y `no_cabe_en_el_bloque` no estaban en la primera versión.** Se separaron de `sin_bloque` al implementar porque son problemas distintos con soluciones distintas: uno se arregla reubicando a esa gente tras un cambio de horarios; el otro, alargando el día o partiendo la categoría de otra forma. Meterlos bajo el mismo nombre escondía cuál de los dos había pasado.

### Dónde se escribe

Directo en `matches.scheduled_at` y `matches.court_label`. **No** en `match_schedule`: esa tabla existe porque las rondas de eliminatorias se materializan una a una y el plan cubre partidos que todavía no tienen fila (ver la cabecera de la migración 047), y de hecho tiene un check que prohíbe `stage = 'group'`. Los partidos de grupo existen desde `close-registration`, así que no hay nada que planificar en el aire.

---

## 5. El algoritmo

Determinista: misma entrada, misma salida. El orden de la entrada no debe cambiar el resultado — se ordena canónicamente antes de empezar, como hace `generarBloques` con las ventanas.

### 5.0 La huella de un grupo se deriva, no se recibe

Antes de repartir nada hay que saber cuánto ocupa cada grupo. Sale de las rondas que `generateRoundRobin` ya emite, donde por construcción ninguna pareja se repite:

```
rondas  = cuántos turnos consecutivos ocupa el grupo
anchura = partidos de la ronda más cargada = canchas simultáneas
```

| Parejas | Rondas × anchura | Carriles | En el club |
|---|---|---|---|
| 2 | 1 × 1 | 1 | 1 h, y el carril no se reparte |
| 3 | 3 × 1 | 1 | 3 h |
| 4 | 3 × 2 | 2 | 3 h en **dos** canchas (§6.4 A) |
| 5 | 5 × 2 | 4 | 5 turnos: dos bloques |

Coincide con `carrilesDeGrupo` de `bloques.ts` en los cuatro casos. La primera versión de esta especificación pedía `carriles` como campo de entrada; se derivó en su lugar, porque un número que el llamador puede calcular mal es un número que acabará desincronizado. De paso, el grupo de 4 sale en la forma A de §6.4 sin ninguna rama especial.

### 5.1 Agrupar por bloque

Los grupos se indexan por `bloqueId`. Los de `bloqueId === null` salen a `sinProgramar` con motivo `sin_bloque` y no estorban al resto (§6.2).

### 5.2 Ordenar los bloques y los grupos dentro de cada uno

Bloques en orden cronológico. Dentro de cada bloque, los grupos se ordenan por:

1. **Categoría con más grupos primero.** Una categoría grande necesita carriles contiguos para cumplir §2.1; si se coloca al final, ya solo quedan huecos sueltos.
2. A igualdad, por `categoryId` y luego por nombre de grupo. Solo para romper empates de forma estable.

### 5.3 Asignar carril (cancha) a cada grupo

Para cada bloque, en orden, y para cada grupo:

1. **Continuidad de categoría (§2.1).** Si esta categoría ocupó canchas en el bloque anterior y alguna sigue libre, se prefiere esa. Es lo que produce el patrón "Mixtos D en la Cancha 8 todo el sábado".
2. **Primer carril libre.** Si lo anterior no aplica, el de número más bajo.

**La hermandad NO entra en esta decisión.** Por §2.5 no hay cancha ni orden que evite el choque, y mover de bloque está prohibido. Se calcula aparte, sobre los grupos ya repartidos, y sale en `empalmes` y en `avisos`. El calendario es idéntico con hermandad y sin ella — hay un test que lo comprueba.

Un grupo que consume más de un carril (§6.4) los reserva **juntos**: dos canchas del mismo bloque si las hay, y si no, la misma cancha en dos bloques consecutivos. Repartirlos sueltos deja al grupo jugando en horas inconexas, que es justo lo que el bloque existe para evitar.

### 5.4 Ordenar los partidos dentro del carril

Modo `corrido` (por defecto):

```
t+0·min    partidos[0]
t+1·min    partidos[1]
t+2·min    partidos[2]
```

en el orden que emitió `generateRoundRobin`, que ya es determinista (método del círculo). No se reordena para "repartir" el descanso: como dice §2.3, alguien encadena sí o sí, y reordenar solo cambia a quién le toca sin reducir el total.

**El modo `espaciado` se descartó.** La idea era poner el partido de la ronda *k* en el bloque *k* para que nadie encadenara. No cabe: un grupo de 3 tiene 3 partidos y un bloque tiene 3 turnos, así que "espaciar" significa necesariamente **sacar partidos del bloque que la pareja eligió**. Eso rompe la única promesa del diseño (§1, §9) para ahorrarle a alguien una hora de espera, y además dividiría la capacidad entre tres. El tipo de entrada acepta solo `'corrido'`.

### 5.5 Cuando el grupo no cabe en un bloque

Solo pasa con grupos que necesitan más turnos de los que tiene un bloque: **el de 5 parejas**, con sus 5 rondas contra los 3 turnos de un bloque de 3 h. Se estira al bloque siguiente, en las **mismas canchas**, y los partidos que caen allí salen marcados `desplazado: true`.

El tramo tiene que ser **contiguo y del mismo día**. Dormir en medio de un round robin no es partir un bloque, es partir el torneo: si el grupo empieza en el último bloque del día, no se parte — sale a `sinProgramar` con motivo `no_cabe_en_el_bloque` y se dice por qué.

Se mueve siempre la cola, nunca el principio ni el medio, que es la regla de §2.4.

**Fuera de alcance: la cancha que se cae a media tarde.** La primera versión de esta sección también contemplaba que el organizador ocupara una cancha para otra cosa. Eso no es planificación, es **reprogramación en vivo**: hay partidos ya jugándose y jugadores en el club. Va por el validador de movimientos, con la realidad delante, no por una entrada más de este motor. `generarBloques` solo emite bloques que caben enteros, así que desde aquí ese caso no existe.

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

El seed `scripts/seed-cimepa.mjs` reproduce el torneo: 165 parejas en ocho categorías de **21, 30, 30, 30, 15, 12, 18 y 9**, 8 canchas, 60 min por partido, viernes de 14:00 a 23:00 y sábado de 08:00 a 23:00.

Todas esas cifras son múltiplos de 3, así que `computeFormat` no produce **ni un solo grupo de 4**: son **55 grupos de 3 y 165 partidos**, uno por carril.

### La retícula — `src/lib/__tests__/bloques-cimepa.test.ts`

| Dato | Valor |
|---|---|
| Bloques | 8 (3 el viernes, 5 el sábado) |
| Domingo | 0 bloques — es el día de eliminatorias |
| Carriles | 64 (8 bloques × 8 canchas) |
| Capacidad nominal | 192 parejas |
| Carriles que exigen las 165 parejas | **55 de 64** |
| Minutos desperdiciados en las ventanas | 0 |

> **Corregido.** Una versión anterior decía 59, calculado sobre ocho categorías inventadas de 20 y 21 parejas que sumaban 165 y nada más. Los 20 obligan a dos grupos de 4 y cada uno vale dos carriles; el torneo real no tuvo ninguna categoría así. El test que decía "Cimepa" con esos datos también estaba mal y se arregló.
>
> Que 55 coincida con 165/3 es una propiedad de **estas** categorías, no una regla. Con 20 parejas la cuenta sube a 8 carriles: una pareja menos puede costar un carril más.

### El calendario — `src/lib/engine/schedule/__tests__/grupos-cimepa.test.ts`

| Comprobación | Resultado |
|---|---|
| Partidos colocados | **165 de 165**, ninguno sin programar |
| Grupos en un solo bloque y una sola cancha | **55 de 55** |
| Grupos partidos | **0** — ninguno de 5 parejas, así que ninguno se estira |
| Ocupación | **85,9 %** (165 de 192 canchas-hora) |
| Continuidad de categoría | Mixtos D y 2ª Fuerza, **una sola cancha el sábado entero** |
| Categorías en el mínimo de canchas posible | 7 de 8 |
| Encadenamientos | **2 por grupo** de 3 |
| Empalmes de hermanas | **7 entre 2ª y 3ª**, más 3ª↔Mixtos C y 5ª Fem↔Mixtos D |
| Determinismo | Idéntico byte a byte, y el orden de la entrada no influye |

Canchas ocupadas por franja:

| Franja | Canchas | |
|---|---|---|
| Vie 14:00–17:00 | 3 / 8 | a esa hora la gente trabaja |
| Vie 17:00–20:00 | 8 / 8 | |
| Vie 20:00–23:00 | 8 / 8 | |
| Sáb 08:00–11:00 | 8 / 8 | |
| Sáb 11:00–14:00 | 7 / 8 | |
| Sáb 14:00–17:00 | 7 / 8 | |
| Sáb 17:00–20:00 | 7 / 8 | |
| Sáb 20:00–23:00 | 7 / 8 | |

### Dos cifras que la primera versión tenía mal

**Los encadenamientos son 2 por grupo, no 1.** Con tres turnos y dos partidos por pareja, dos de las tres caen en turnos seguidos. Con los partidos que emite `generateRoundRobin` para `[a,b,c]` —`b-c`, `a-c`, `a-b`— encadenan *a* (turnos 1 y 2) y *c* (turnos 0 y 1). La descripción de §2.3 era correcta; la cuenta no.

**Los empalmes de hermanas NO son 0, y no pueden serlo.** Cada categoría tiene un grupo en casi todos los bloques, así que dos hermanas coinciden casi siempre: 2ª y 3ª Fuerza comparten 7 de los 8. No es un fallo del reparto ni algo que el scheduler pueda mejorar — ver §2.5. Se listan con nombre y se avisa.

### La ocupación se lee al revés

165 partidos entre 192 canchas-hora **es una identidad, no un logro**: los partidos son los que son y la retícula es la que es. Lo único que subiría ese número es usar menos bloques, o sea, mover gente del horario que eligió. Por eso el test la fija como **cota superior** (`< 90 %`) y no como objetivo.

---

## 8. Estado de los pendientes

### Cerrados

1. ~~`close-registration` tiene que formar grupos por bloque.~~ **Hecho.** `repartirPorBloque` (`src/lib/engine/schedule/reparto.ts`) arma los grupos dentro de cada bloque, junta los restos y nunca deja una pareja fuera.
2. ~~`cupoDeBloque` asume grupos de 3.~~ **Hecho.** El coste se cuenta en partidos: `carrilesDeGrupo(n) = ceil(n(n−1)/2 / partidosPorCarril)`.
3. ~~`grafoDeHermandad` es privada en `knockout.ts`.~~ **Hecho.** Se exportó tal cual, sin tocar su cuerpo ni sus tests.
4. ~~Decidir dónde vive el disparador.~~ **Hecho.** Edge Function `schedule-groups`, simétrica a `schedule-knockout`, y `close-registration` dispara las dos al terminar.

### Abiertos

1. **El grupo mezclado no queda registrado en ningún sitio consultable.** Hoy el aviso vive en la respuesta de `close-registration` y se enseña una vez, en el parte del cierre. Si se quiere que la pareja se entere sola del cambio de hora, hace falta una columna de bloque en `groups` (una migración) o un correo al cerrar. Decisión de producto, no de motor.
2. **Zona horaria.** El motor emite hora local del club (`'YYYY-MM-DDTHH:MM'`) y la conversión a `timestamptz` la hace el llamador con `ZONA_TORNEO = 'America/Mexico_City'`, igual que el knockout.

### Fuera de alcance

**La cancha que el organizador ocupa a media tarde.** Es reprogramación en vivo, con partidos jugándose y jugadores en el club, no planificación. Va por el validador de movimientos. Ver §5.5.

---

## 9. Decisiones confirmadas

Dos puntos que quedaron abiertos en la primera versión y ya están resueltos. Se dejan escritos porque son los que más fácil se revierten sin querer.

**La hermandad no mueve a nadie de bloque (§5.3).** Cuando dos grupos de categorías hermanas caen en el mismo bloque y no se pueden separar reordenando, se colocan igual y se reporta el empalme. La pareja eligió su horario y moverla contradice lo único que le prometimos. El scheduler informa; no arbitra a costa del jugador.

**La ocupación es una cota superior, no un objetivo (§2.2).** Cimepa fue al 85 %, con 28 canchas-hora ociosas, la mayoría el viernes de 14:00 a 17:00. Compactar ahí es poner gente a jugar cuando trabaja. Un resultado muy por encima del 85 % es motivo de sospecha, no de celebración.
