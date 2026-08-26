/**
 * RALLY · Categorías del torneo
 *
 * Selección MÚLTIPLE con chips, en vez del alta de una en una que había antes.
 * El organizador ve de un vistazo qué va a abrir y lo confirma en un guardado.
 *
 * LOS TRES GÉNEROS
 *   Varonil, Femenil y Mixto, los tres del enum ('male','female','mixed').
 *
 *   Hubo una versión que escondía Varonil suponiendo que en el padel mexicano
 *   los hombres solo compiten en mixto. Es falso: el Sexto Torneo Cimepa (We
 *   All Padel, 165 parejas) reparte 2A a 6A Fuerza —todas varoniles— más 5A
 *   Femenil y Mixtos C/D. Las varoniles eran 126 de las 165 parejas.
 *
 * BORRAR CATEGORÍAS
 *   Deseleccionar una categoría la ELIMINA, y eso arrastra en cascada sus
 *   parejas, grupos, partidos y registros de pago. Por eso, antes de borrar
 *   nada, se cuenta qué hay dentro:
 *     · sin parejas               → se borra sin preguntar
 *     · con parejas, ninguna pagada en línea → confirmación con el conteo
 *     · con alguna pagada en línea → NO se borra; se avisa y se conserva
 *   La garantía de verdad está en el trigger de la migración 033; esto es la
 *   cortesía que evita llegar hasta el error.
 */

import { useCallback, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import type { Database } from '@/lib/supabase/database.types';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';

// ── Modelo ──────────────────────────────────────────────────────────────────

/**
 * Los enums salen del esquema generado, no de literales escritos a mano. Si
 * alguien añade una división en la base y regenera los tipos, la lista de abajo
 * deja de compilar hasta que se actualice — que es exactamente lo que queremos.
 */
type Division = Database['public']['Enums']['division'];
type Genero   = Database['public']['Enums']['category_gender'];

const DIVISIONES = [
  { valor: 'sexta',   etiqueta: '6ª' },
  { valor: 'quinta',  etiqueta: '5ª' },
  { valor: 'cuarta',  etiqueta: '4ª' },
  { valor: 'tercera', etiqueta: '3ª' },
  { valor: 'segunda', etiqueta: '2ª' },
  { valor: 'primera', etiqueta: '1ª' },
] as const satisfies ReadonlyArray<{ valor: Division; etiqueta: string }>;

/** Los tres del enum. Ver cabecera. */
const GRUPOS = [
  { genero: 'male',   titulo: 'Varonil' },
  { genero: 'female', titulo: 'Femenil' },
  { genero: 'mixed',  titulo: 'Mixto'   },
] as const satisfies ReadonlyArray<{ genero: Genero; titulo: string }>;

const NOMBRE_GENERO: Record<Genero, string> = {
  male: 'Varonil', female: 'Femenil', mixed: 'Mixto',
};

/**
 * Clave estable de una categoría dentro del torneo.
 *
 * El tipo plantilla no es adorno: hace que un `Set<Clave>` solo pueda contener
 * combinaciones que existen en el esquema. Antes era `string` y cualquier cosa
 * entraba.
 */
type Clave = `${Division}|${Genero}`;

const clave = (division: Division, genero: Genero): Clave => `${division}|${genero}`;

function nombreVisible(division: Division, genero: Genero): string {
  const d = DIVISIONES.find((x) => x.valor === division)?.etiqueta ?? division;
  return `${d} ${NOMBRE_GENERO[genero] ?? genero}`;
}

interface CategoriaExistente {
  id:        string;
  division:  Division;
  gender:    Genero;
  parejas:   number;
  pagadas:   number;
}

type Confirmacion = {
  aBorrar:  CategoriaExistente[];
  bloqueadas: CategoriaExistente[];
};

// ── Pantalla ────────────────────────────────────────────────────────────────

export default function CategoriasScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [nombreTorneo, setNombreTorneo] = useState('');
  const [existentes, setExistentes] = useState<CategoriaExistente[]>([]);
  const [seleccion, setSeleccion]   = useState<Set<Clave>>(new Set());
  const [cargando, setCargando]     = useState(true);
  const [guardando, setGuardando]   = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);

  const cargar = useCallback(async () => {
    const [{ data: t }, { data: cats }] = await Promise.all([
      supabase.from('tournaments').select('name').eq('id', tournamentId).single(),
      supabase
        .from('categories')
        .select('id, division, gender')
        .eq('tournament_id', tournamentId),
    ]);

    if (t) setNombreTorneo((t as { name: string }).name);

    // Sin cast: con el cliente tipado, `division` y `gender` ya llegan como enums.
    const filas = cats ?? [];

    // Conteos por categoría: cuántas parejas y cuántas pagaron en línea.
    // Se necesitan ANTES de guardar para decidir si se puede borrar.
    const conConteos: CategoriaExistente[] = await Promise.all(
      filas.map(async (c) => {
        const [{ count: parejas }, { count: pagadas }] = await Promise.all([
          supabase.from('pairs').select('id', { count: 'exact', head: true })
            .eq('category_id', c.id),
          supabase.from('pairs').select('id', { count: 'exact', head: true })
            .eq('category_id', c.id).eq('payment_status', 'paid_online'),
        ]);
        return { ...c, parejas: parejas ?? 0, pagadas: pagadas ?? 0 };
      }),
    );

    setExistentes(conConteos);
    setSeleccion(new Set(conConteos.map((c) => clave(c.division, c.gender))));
    setCargando(false);
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  function alternar(division: Division, genero: Genero) {
    setError(null);
    setSeleccion((prev) => {
      const s = new Set(prev);
      const k = clave(division, genero);
      if (s.has(k)) s.delete(k); else s.add(k);
      return s;
    });
  }

  // Diferencia contra lo que hay en BD.
  const { aCrear, aBorrar } = useMemo(() => {
    const existentesPorClave = new Map(
      existentes.map((c) => [clave(c.division, c.gender), c]),
    );

    // Se recorre la rejilla que la UI ofrece en vez de partir la clave con
    // split('|'): split devuelve string[] y obligaría a un cast para volver a
    // los enums. Aquí los tipos salen solos de DIVISIONES/GRUPOS, y de paso una
    // clave vieja que ya no corresponda a ninguna opción no puede colarse.
    const aCrear: Array<{ division: Division; gender: Genero }> = [];
    for (const d of DIVISIONES) {
      for (const g of GRUPOS) {
        const k = clave(d.valor, g.genero);
        if (seleccion.has(k) && !existentesPorClave.has(k)) {
          aCrear.push({ division: d.valor, gender: g.genero });
        }
      }
    }

    const aBorrar = existentes.filter(
      (c) => !seleccion.has(clave(c.division, c.gender)),
    );

    return { aCrear, aBorrar };
  }, [seleccion, existentes]);

  const hayCambios = aCrear.length > 0 || aBorrar.length > 0;
  const puedeGuardar = seleccion.size > 0 && hayCambios && !guardando;

  /** Primer paso: si hay borrados con contenido, pedir confirmación. */
  function intentarGuardar() {
    setError(null);
    if (!puedeGuardar) return;

    const conParejas  = aBorrar.filter((c) => c.parejas > 0 && c.pagadas === 0);
    const bloqueadas  = aBorrar.filter((c) => c.pagadas > 0);

    if (conParejas.length > 0 || bloqueadas.length > 0) {
      setConfirmacion({ aBorrar: conParejas, bloqueadas });
      return;
    }
    void guardar([]);
  }

  /** `conservar`: categorías bloqueadas que NO se borran y vuelven a marcarse. */
  async function guardar(conservar: CategoriaExistente[]) {
    setConfirmacion(null);
    setGuardando(true);
    setError(null);

    const idsConservados = new Set(conservar.map((c) => c.id));
    const borrarDeVerdad = aBorrar.filter((c) => !idsConservados.has(c.id));

    try {
      if (aCrear.length > 0) {
        const { error: e } = await supabase.from('categories').insert(
          aCrear.map((c) => ({
            tournament_id: tournamentId,
            division:      c.division,
            gender:        c.gender,
            display_name:  nombreVisible(c.division, c.gender),
          })),
        );
        if (e) throw e;
      }

      if (borrarDeVerdad.length > 0) {
        const { error: e } = await supabase
          .from('categories')
          .delete()
          .in('id', borrarDeVerdad.map((c) => c.id));
        if (e) throw e;
      }

      router.back();
    } catch (e: unknown) {
      // El trigger de la migración 033 es la última línea de defensa: si la UI
      // dejó pasar un borrado con pagos, aquí llega su código.
      const mensaje = e instanceof Error ? e.message : '';
      setError(
        mensaje.includes('paid_registrations') || mensaje.includes('registration_is_paid')
          ? 'No se puede quitar una categoría con inscripciones ya pagadas en línea.'
          : 'No se pudieron guardar las categorías. Intenta de nuevo.',
      );
      setGuardando(false);
      // Recargar para que la selección refleje lo que de verdad quedó en BD.
      void cargar();
    }
  }

  if (cargando) {
    return <View style={s.cargando}><ActivityIndicator color={color.gold} /></View>;
  }

  return (
    <SafeAreaView style={s.safe}>
      <BotonVolver texto={nombreTorneo || 'Torneo'} />

      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Text style={s.eyebrow}>CONFIGURACIÓN</Text>
        <Text style={s.title}>Categorías</Text>
        <Text style={s.bajada}>
          Toca las que vas a abrir. Cada una tendrá su propio cuadro y su propia
          tabla.
        </Text>

        {GRUPOS.map((grupo) => (
          <View key={grupo.genero} style={s.grupo}>
            <Text style={s.grupoTitulo}>{grupo.titulo.toUpperCase()}</Text>
            <View style={s.chips}>
              {DIVISIONES.map((d) => {
                const activo = seleccion.has(clave(d.valor, grupo.genero));
                return (
                  <Pressable
                    key={d.valor}
                    onPress={() => alternar(d.valor, grupo.genero)}
                    style={[s.chip, activo && s.chipActivo]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: activo }}
                    accessibilityLabel={`${d.etiqueta} ${grupo.titulo}`}
                  >
                    <Text style={[s.chipTexto, activo && s.chipTextoActivo]}>
                      {d.etiqueta}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}


        <Text style={s.ayuda}>
          Podrás agregar o quitar categorías mientras las inscripciones sigan
          abiertas.
        </Text>

        {error && <Text style={s.error}>{error}</Text>}

        <Pressable
          onPress={intentarGuardar}
          disabled={!puedeGuardar}
          style={({ pressed }) => [
            s.btnDorado,
            !puedeGuardar && s.btnInactivo,
            pressed && { opacity: 0.85 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Guardar categorías"
          accessibilityState={{ disabled: !puedeGuardar }}
        >
          {guardando
            ? <ActivityIndicator color={color.onGold} />
            : <Text style={[s.btnTexto, !puedeGuardar && s.btnTextoInactivo]}>
                {seleccion.size === 0
                  ? 'Elige al menos una'
                  : hayCambios
                    ? `Guardar ${seleccion.size} ${seleccion.size === 1 ? 'categoría' : 'categorías'}`
                    : 'Sin cambios'}
              </Text>
          }
        </Pressable>
      </ScrollView>

      {/* ── Confirmación de borrado ─────────────────────────────── */}
      {confirmacion && (
        <View style={s.overlay}>
          <View style={s.dialogo}>
            <Text style={s.dialogoTitulo}>
              {confirmacion.aBorrar.length > 0 ? 'Vas a quitar categorías con inscritos' : 'No se pueden quitar'}
            </Text>

            {confirmacion.aBorrar.map((c) => (
              <Text key={c.id} style={s.dialogoLinea}>
                · <Text style={s.dialogoNegrita}>{nombreVisible(c.division, c.gender)}</Text>
                {' '}perderá {c.parejas} {c.parejas === 1 ? 'pareja inscrita' : 'parejas inscritas'}.
              </Text>
            ))}

            {confirmacion.bloqueadas.length > 0 && (
              <View style={s.bloqueo}>
                <Text style={s.bloqueoTitulo}>Estas se conservan</Text>
                {confirmacion.bloqueadas.map((c) => (
                  <Text key={c.id} style={s.bloqueoLinea}>
                    · <Text style={s.dialogoNegrita}>{nombreVisible(c.division, c.gender)}</Text>
                    {' '}tiene {c.pagadas} {c.pagadas === 1 ? 'inscripción pagada' : 'inscripciones pagadas'} en
                    línea. Quitarla borraría el registro del pago, pero el cargo
                    seguiría cobrado en Stripe.
                  </Text>
                ))}
              </View>
            )}

            <View style={s.dialogoBotones}>
              <Pressable
                onPress={() => setConfirmacion(null)}
                style={s.dialogoCancelar}
                accessibilityRole="button"
              >
                <Text style={s.dialogoCancelarTexto}>Cancelar</Text>
              </Pressable>

              {confirmacion.aBorrar.length > 0 && (
                <Pressable
                  onPress={() => void guardar(confirmacion.bloqueadas)}
                  style={s.dialogoConfirmar}
                  accessibilityRole="button"
                  accessibilityLabel="Confirmar y guardar"
                >
                  <Text style={s.dialogoConfirmarTexto}>Quitar de todos modos</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: color.bg },
  cargando: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },
  content:  { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  eyebrow: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3 },
  title:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  bajada:  { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20, marginBottom: space[2] },

  grupo:       { gap: space[2], marginTop: space[2] },
  grupoTitulo: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },

  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  chip: {
    minWidth:        56,
    minHeight:       touchTarget,
    paddingHorizontal: space[4],
    alignItems:      'center',
    justifyContent:  'center',
    backgroundColor: color.surface,
    borderWidth:     1,
    borderColor:     color.lineSoft,
    borderRadius:    radius.pill,
  },
  chipActivo:      { backgroundColor: 'rgba(212,175,55,0.12)', borderColor: color.gold },
  chipTexto:       { fontFamily: font.display, fontSize: fontSize.cardName, color: color.muted },
  chipTextoActivo: { color: color.gold },

  ayuda: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18, marginTop: space[3] },
  error: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },

  btnDorado: {
    backgroundColor: color.gold,
    borderWidth:     1,
    borderColor:     color.goldBright,
    borderRadius:    radius.sm,
    minHeight:       touchTarget,
    alignItems:      'center',
    justifyContent:  'center',
    marginTop:       space[2],
  },
  btnInactivo:      { backgroundColor: color.surface2, borderColor: color.line },
  btnTexto:         { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
  btnTextoInactivo: { color: color.muted },

  overlay: {
    position: 'absolute', top: 0, bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(6,6,8,0.82)',
    alignItems: 'center', justifyContent: 'center', padding: space[4.5],
  },
  dialogo: {
    width: '100%', maxWidth: 420,
    backgroundColor: color.surface,
    borderWidth: 1, borderColor: color.alive,
    borderRadius: radius.lg,
    padding: space[4], gap: space[2],
  },
  dialogoTitulo:  { fontFamily: font.display, fontSize: fontSize.cardName, fontWeight: '600', color: color.alive },
  dialogoLinea:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  dialogoNegrita: { color: color.text, fontWeight: '600' },

  bloqueo:       { backgroundColor: 'rgba(224,114,111,0.10)', borderWidth: 1, borderColor: 'rgba(224,114,111,0.30)', borderRadius: radius.md, padding: space[3], gap: space[1], marginTop: space[1] },
  bloqueoTitulo: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.danger, letterSpacing: 1.5 },
  bloqueoLinea:  { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },

  dialogoBotones:  { flexDirection: 'row', gap: space[2], marginTop: space[2] },
  dialogoCancelar: { flex: 1, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.sm },
  dialogoCancelarTexto: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },
  dialogoConfirmar: { flex: 2, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center', backgroundColor: color.alive, borderRadius: radius.sm },
  dialogoConfirmarTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.onGold },
});
