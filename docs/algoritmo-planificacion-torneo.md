# RALLY · Algoritmo de planificación de torneo

Especificación del motor que decide el formato de todas las categorías de un torneo
en función de la capacidad real del club.

Sustituye a la lógica donde `computeFormat(n)` decidía categoría por categoría
mirando solo el número de parejas.

> **Este documento vive en el repo a propósito.** Estuvo meses en `~/Downloads`,
> fuera de git, y se desfasó sin que nada lo delatara: mantenía una restricción que
> el código ya no tiene y verificaba Cimepa con un número que el motor nunca produjo.
> Implementación: `src/lib/engine/planner/index.ts`. Contrato fijado en
> `src/lib/engine/planner/__tests__/planner.test.ts` — si este texto y esos tests se
> contradicen, mandan los tests.

---

## 1. El problema

Ocho categorías compiten por las mismas canchas. Cada una elegía su formato sin
saber qué eligieron las demás, así que el torneo podía no caber y nadie se enteraba
hasta que la gente estaba esperando en el club.

Evidencia: el Sexto Torneo Cimepa corrió su fase de grupos al límite y los jugadores
esperaron de 30 a 60 minutos para entrar a cancha. El formato "cabía" en el papel y
no cabía en la realidad.

---

## 2. Restricciones duras

Vienen del deporte, no del código.

**R1 · Mínimo 2 partidos asegurados por pareja.**
Ningún grupo de menos de 3. Un torneo donde puedes jugar un solo partido y volverte
a casa no es un torneo.

**R2 · Grupos y eliminatorias no comparten día.**
La fase de grupos ocupa todos los días menos el último. Las eliminatorias ocupan
solo el último.

Consecuencia: son **dos presupuestos independientes**, y ambos tienen que caber. Que
sobre tiempo el domingo no ayuda si el sábado va apretado.

**R3 · El número de clasificados es CUALQUIERA ≥ 2, no una potencia de 2.**

> Esta restricción existía y se quitó. La versión anterior de este documento decía
> *"el número de clasificados por categoría es potencia de 2 [...] no hay byes"*, y
> era falso en los dos sentidos.

En el padel real los byes son la norma. Cimepa armó 5ª Fuerza con 12 clasificados en
un cuadro de 16: cuatro byes y cuatro partidos de octavos. Forzar la potencia de 2
obligaba a inventar repescados que nadie se había ganado, o a dejar fuera a quien sí.

El cuadro es la menor potencia de 2 que contiene a los clasificados, y la diferencia
son byes que se llevan los mejores sembrados:

```
bracketSize = 2 ^ ceil(log2(clasificados))
byes        = bracketSize − clasificados
partidosPrimeraRonda = clasificados − bracketSize / 2
```

Un bye no es un partido pendiente: es un resultado conocido desde que se siembra el
cuadro. Nace `finished`, con la pareja presente como ganadora y sin `played_at`
—nadie lo jugó, y ponerle hora sería inventarla— y el avance lo lee sin recalcularlo.
Ver la migración 045 y `src/lib/engine/bracket/avance-captura.ts`.

**R4 · Un partido ocupa una cancha durante un bloque completo.**
Se planifica a `minutosPorPartido` (60 por defecto), aunque en la práctica dure
entre 60 y 90. Lo que se hace con esa diferencia está en §7.

---

## 3. Entradas

```ts
interface VentanaDia {
  fecha: string;   // 'YYYY-MM-DD'
  desde: string;   // 'HH:MM'
  hasta: string;   // 'HH:MM' — hora a la que TERMINA el último partido
}

interface Capacidad {
  canchas: number;
  ventanas: VentanaDia[];       // una por día, en orden cronológico
  minutosPorPartido: number;    // default 60
}

interface CategoriaEntrada {
  id: string;
  parejas: number;
  /** Ids de los jugadores inscritos. Opcional. Ver §6, paso 2. */
  jugadores?: string[];
}
```

`hasta` es la hora de **fin** del último partido, no la de su inicio. Una ventana
14:00–23:00 con partidos de 60 minutos admite uno que arranca a las 22:00. Cimepa
tuvo partidos empezando a las 22:00: sus ventanas llegaban a las 23:00.

---

## 4. Cálculo de presupuesto

```
slotsDeDia(v) = canchas × floor(minutos(v.hasta − v.desde) / minutosPorPartido)

presupuestoGrupos      = Σ slotsDeDia(v) para v en ventanas[0 .. n−2]
presupuestoEliminacion = slotsDeDia(ventanas[n−1])
```

Con un solo día en `ventanas`, R2 no puede cumplirse. Ese caso se trata aparte (§9).

**Cimepa:**
```
Viernes 14:00–23:00 →  9 h × 8 canchas =  72
Sábado  08:00–23:00 → 15 h × 8 canchas = 120
                        presupuestoGrupos = 192

Domingo 08:00–20:00 → 12 h × 8 canchas =  96
                        presupuestoEliminacion = 96
```

El presupuesto de eliminatorias sigue calculándose, pero **ya no gobierna nada**.
Ver §6, paso 2.

---

## 5. Generación de planes candidatos por categoría

Para una categoría de N parejas, generar **todas** las particiones de N en grupos de
tamaño 3, 4 o 5, y para cada una calcular:

```
grupos      = número de grupos
costeGrupos = Σ (tamaño × (tamaño − 1) / 2)      ← round robin en cada grupo
asegurados  = min(tamaños) − 1                    ← el peor caso manda
```

Descartar toda partición con `min(tamaños) < 3` (R1).

Para cada partición, las opciones de fase final se generan variando cuántos
**segundos de grupo** se repescan:

```
clasificados     = avanzanPorGrupo × grupos + repescados
costeEliminacion = clasificados − 1
```

### `costeEliminacion = clasificados − 1`, siempre

Cada partido elimina exactamente a una pareja, y hay que eliminar a C−1 para dejar
campeón. Los byes no cambian ese número: solo cambian en qué ronda entra cada quien.

> **Este era el error del documento anterior.** Decía `costeEliminacion = Q − 1` con
> Q = tamaño del cuadro, que con clasificados no-potencia-de-2 cuenta partidos que
> nadie juega. Contra las ocho categorías de Cimepa daba **76 en vez de 47** — un 62%
> de más. Y ese porcentaje inflado no era cosmético: era lo que impedía subir de plan
> en el paso 2, así que el planificador recomendaba menos repesca de la que cabía.

### `segundosQueAvanzan`

Cuántos segundos de grupo llegan al cuadro. Es el número que decide si el torneo se
muere a la mitad: cuando de un grupo solo pasa el primero, quien pierde su primer
partido ya sabe que no avanza y juega el segundo por jugar. Cimepa metió 6 mejores
segundos en 5ª Fuerza exactamente por esto — con 10 grupos de 3 tenía 10 primeros,
que no llenan un cuadro de 16.

---

## 6. El algoritmo

### Paso 1 · Piso

Asignar a cada categoría su plan **más barato** en `costeGrupos`: todas las
particiones en grupos de 3, sin repesca.

```
if (Σ costeGrupos > presupuestoGrupos) → NO CABE (§8)
```

Si el piso no cabe, ninguna configuración cabe. Fin.

### Paso 2 · Elevar el suelo (maximin)

Mientras quepa, subir de plan a la categoría que **peor está**:

```
candidata = la categoría con menor `asegurados`
            desempate 1: la de más parejas (beneficia a más gente)
            desempate 2: id más bajo (determinismo)
```

**Por qué maximin y no maximizar el total.** Si se maximiza la suma de partidos, todas
las mejoras valen lo mismo — un partido más es un partido más, venga de donde venga —
y el resultado sería arbitrario: una categoría con grupos de 5 al lado de otra con
grupos de 3, sin razón visible para el jugador. Elevar primero al que peor está
reparte el tiempo sobrante de forma que se puede explicar en una frase.

#### Las dos fases se miden con reglas distintas

**Grupos: por ocupación.** Los partidos son independientes y corren en paralelo, así
que el porcentaje mide algo real. Se para en el 85% (§7).

**Eliminatorias: por la HORA a la que terminas, no por el porcentaje.**

> Cambio de fondo respecto al documento anterior, que decidía las dos fases por
> slots.

Un día de eliminatorias no se mide en huecos ocupados. Las rondas de una categoría
van encadenadas —no se juega la semifinal antes de los cuartos— y el cuadro se
estrecha, así que las últimas horas usan una cancha de ocho. El 84% de ocupación de
Cimepa se leía holgado y terminaba a las 22:15.

El criterio es: correr el scheduler del último día (`correrCalendario`), calcular la
hora de fin realista encadenada, y aceptar la subida solo si esa hora cae dentro de
la ventana. La ocupación en slots sobrevive en la salida como dato legible, pero no
decide.

Una subida que no toca el último día se acepta sin más. Sin esa excepción, un torneo
con la fase de grupos ya al límite —como Cimepa— no podría repescar a nadie, aunque
repescar solo gasta slots del domingo. Se estaba bloqueando una mejora gratuita por
culpa de un presupuesto ajeno.

#### Categorías hermanadas

Dos categorías son **hermanas** si comparten al menos un jugador. Con `jugadores` en
la entrada, el scheduler evita ponerles ronda a la misma hora en las rondas
tempranas: nadie puede jugar dos partidos a la vez.

Semifinales y finales quedan exentas **a propósito**. Al final del día todas las
categorías convergen, y separarlas retrasaría el torneo entero para proteger un caso
que quizá no ocurra — perjudica a 165 parejas por una. Lo que quede empalmado se
lista para que lo resuelva el organizador, con los nombres de quienes lo provocan.

Esa separación alarga el día, así que **cambia el plan**: sin `jugadores` el
planificador recomienda más repesca de la que cabe en el calendario que se va a
jugar. Es opcional para no romper llamadas antiguas, pero omitirlo significa decidir
contra un día más optimista que el real.

### Paso 3 · Reportar la ocupación

| Ocupación de grupos | Zona | Qué se le dice al organizador |
|---|---|---|
| ≤ 70% | Cómodo | Cabe con margen para retrasos. |
| 70–85% | Ajustado | Cabe, pero un retraso de media hora se nota. |
| 85–100% | Al límite | Va a haber esperas. Considera más canchas u horas. |
| > 100% | No cabe | Ver §8. |

---

## 7. Margen: dónde se aplica y dónde no

Un partido planificado a 60 minutos dura en promedio 69. `FACTOR_RETRASO = 1.25`.

**En grupos, como margen de ocupación.** El umbral del 85% deja el 15% restante para
lo que siempre pasa. Con 8 canchas y 165 partidos, la desviación son unas 41
horas-cancha.

**En eliminatorias, estirando la cadena de rondas.**

> El documento anterior aplicaba el mismo margen porcentual a las dos fases. Es el
> modelo equivocado para un día encadenado.

El retraso se acumula **ronda a ronda, no partido a partido**. Se planifica a la
duración normal y luego se estira cada cadena:

```
exceso = minutosPorPartido × (FACTOR_RETRASO − 1)
finDeCadena = ultimoInicio + minutosPorPartido + rondas × exceso
```

Replanificar todo a 75 minutos recompactaría el día y daría una hora que nadie va a
ver: los huecos ociosos absorben parte del retraso en vez de heredarlo.

Y **no se suma el umbral del 85% encima de la hora**: `minutosPorPartido` ya va
multiplicado por `FACTOR_RETRASO` ahí dentro, y añadirlo otra vez sería contar el
mismo retraso dos veces.

Tres números para la misma pregunta, en orden histórico, sobre Cimepa:

| Repesca | Criterio | Qué pasaba |
|---|---|---|
| 81 | 85% de slots, `floor(96 × 0.85)` | No miraba la hora: terminaba 22:15 reales |
| 72 | Hora, retraso replanificando a 75 min | Sobreestimaba y dejaba capacidad sin usar |
| **80** | Hora, retraso **encadenado** | El modelo correcto |

**El margen no bloquea.** Si el organizador quiere correr al límite como hizo Cimepa,
puede — el torneo se jugó y funcionó. Lo que no puede es hacerlo sin saberlo.

---

## 8. Cuando no cabe

```
faltanSlots      = Σ coste − presupuesto × 0.85
canchasQueFaltan = ceil(faltanSlots / horasDisponibles)
horasQueFaltan   = ceil(faltanSlots / canchas)
parejasQueSobran = mínimo k tal que quitando k parejas el piso cabe
```

Redactado para el organizador:

> **No cabe en el fin de semana.**
> Faltan 37 partidos de espacio en la fase de grupos.
> Puedes: usar 2 canchas más, alargar 5 horas por día, o quitar 20 parejas.

Las tres son accionables. "No cabe" a secas no lo es.

---

## 9. Casos límite

**Un solo día.** R2 no puede cumplirse. El presupuesto es único y compartido, y se
vuelve al criterio de slots también para eliminatorias: con las dos fases en la misma
cancha el scheduler solo modela el cuadro, así que no puede responder la pregunta de
la hora. Se avisa al organizador.

**Categoría con menos de 3 parejas.** No se puede formar grupo. Excluirla y
señalarla: "3ª Femenil tiene 2 parejas, no alcanza para un grupo."

**Categoría con exactamente 3, 4 o 5 parejas.** Un solo grupo, round robin, final
directa entre los dos primeros.

**Camino crítico del último día.** Las rondas son secuenciales: con 16 clasificados
una categoría necesita 4 rondas encadenadas, o sea 4 horas mínimo aunque hubiera 100
canchas libres. Es una restricción que rara vez muerde pero cuyo fallo es imposible
de diagnosticar desde la capacidad agregada. El criterio por hora del paso 2 la cubre
de forma natural.

**Determinismo.** Los desempates están fijados para que el mismo torneo dé siempre el
mismo plan.

---

## 10. Salida

```ts
interface PlanTorneo {
  cabe: boolean;
  planes: Map<string, PlanCategoria>;   // por category_id

  grupos: Fase;
  /** INFORMATIVO. Ya no gobierna: manda la hora de `ultimoDia`. */
  eliminacion: Fase;
  /** A qué hora termina de verdad el último día. */
  ultimoDia: {
    finEstimado: string | null;
    finRealista: string | null;
    finRealistaUnaCanchaMenos: string | null;
  } | null;

  avisos: string[];
  diagnostico?: Diagnostico;            // solo si cabe === false
}
```

`finRealistaUnaCanchaMenos` responde a la pregunta que el organizador hace de verdad:
qué pasa si se cae una cancha. Si el formato solo termina a tiempo usando las ocho,
eso hay que decirlo antes.

---

## 11. Verificación contra Cimepa

Fijado en `planner.test.ts`, §11.

```
Entrada:  8 canchas, 60 min
          Vie 14:00–23:00 / Sáb 08:00–23:00 / Dom 08:00–20:00
          Categorías: 21, 30, 30, 30, 15, 12, 18, 9  (165 parejas)

Piso (todo en grupos de 3, sin repesca):
  costeGrupos      = 21+30+30+30+15+12+18+9 = 165
  costeEliminacion = 47          ← C−1 por categoría, NO 76

Grupos:  165 / 192 = 86%  → zona 'limite'
         Ninguna categoría sube de tamaño de grupo: al límite no cabe uno más.

Eliminatorias: el paso 2 sube la repesca de 47 a 80 y ahí para.
         Uno más y la hora realista se iría de las 20:00.
         Ocupación en slots: 83% — informativa.

5ª Fuerza: 10 grupos de 3, 6 repescados, 16 clasificados, cuadro de 16, 0 byes.
           Cimepa puso 2 a mano; medida la capacidad caben 6.

cabe: true
aviso: "La fase de grupos va al límite..."
```

**Esto es lo que RALLY le habría dicho a Cimepa antes del torneo.** El formato que
eligieron era el único que cabía en grupos, y aun así iba apretado; en cambio dejaron
domingo sin usar. La app no habría cambiado el cuadro: habría avisado, y habría
repescado a más gente.

> Con las ventanas viejas (cierre a las 22:00) los números eran 165/176 = 94%. El
> cierre real era a las 23:00 — hubo partidos empezando a las 22:00 — y la zona sigue
> siendo `limite` porque 86% supera el umbral del 85%.

---

## 12. Contraste: torneo chico

```
Entrada:  4 canchas, Sáb 9-21 / Dom 9-18, 60 min · una categoría de 12 parejas
Presupuestos: grupos 12h × 4 = 48 · eliminación 9h × 4 = 36

Piso:   4 grupos de 3 → coste 12, asegurados 2.  25%
Paso 2: sube a 3 grupos de 4 → coste 18, asegurados 3.  38%  ✓
Salida: 3 grupos de 4, 3 partidos asegurados, zona 'comodo'
```

Con capacidad de sobra el algoritmo **no** elige grupos de 3. Ese es el punto: la
preferencia por grupos de 3 no es una regla, es lo que sale cuando el presupuesto
aprieta.

---

## 13. Qué se conserva del motor actual

`computeFormat(n)` sigue existiendo como primitiva y como fallback: cuando no hay
datos de capacidad, el planificador cae a la lógica de siempre y lo señala en
`avisos`.

La tabla literal de `rules.ts` deja de ser la fuente de verdad y pasa a ser el
generador de candidatos.

---

## 14. Huecos conocidos

**El tercer lugar no entra en el presupuesto.** `costeEliminacion = clasificados − 1`
cuenta el cuadro, y `partidosPorRonda` tampoco lo incluye. Pero el tercer lugar SÍ se
crea al cerrar semifinales — lo hace `generate-bracket` y también
`record_knockout_result` (migración 050). Son 8 partidos más en un torneo de ocho
categorías, todos en la transición de semis a final, justo cuando el día va más
cargado. El planificador está subestimando el último día en esa cantidad.

No se ha corregido todavía porque la decisión no es solo aritmética: hay que decidir
si el tercer lugar es opcional por torneo antes de meterlo en el presupuesto.

**El scheduler de la fase de grupos no existe.** Solo se programa el último día. Los
partidos de grupo no tienen `scheduled_at` ni `court_label`, y la pantalla del
organizador lo dice en vez de inventarlos. La retícula de bloques
(`src/lib/engine/schedule/bloques.ts`) es el punto de partida: un grupo de 3 se juega
como un bloque de 3 horas consecutivas en una sola cancha, que es lo que hicieron 52
de los 55 grupos de Cimepa.
