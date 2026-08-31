/**
 * RALLY · Registrar pareja a mano (organizador)
 *
 * QUÉ CAMBIÓ RESPECTO A LA VERSIÓN ANTERIOR
 *   Antes los dos jugadores TENÍAN que existir ya en public.users, y se
 *   buscaban por correo exacto en dos pasos separados. Para un torneo de 12
 *   parejas eso significaba pedirle a 24 personas que se registraran antes.
 *   Ahora el organizador puede crear la cuenta él mismo.
 *
 * POR QUÉ LOS DOS JUGADORES EN UNA SOLA PANTALLA (3 pasos, no 4)
 *   Con el alta de cuentas, cada jugador deja de ser "busca y selecciona" y
 *   pasa a ser un mini-formulario. El caso más común es el MIXTO — uno ya
 *   tiene cuenta y el otro no — y con pasos separados obligaba a ir y volver
 *   para verlo entero. Lado a lado se lee de un vistazo.
 *
 * MENORES DE EDAD
 *   Un chico de 15 años no gestiona su cuenta: va con su familia al club y el
 *   padre resuelve con el organizador ahí mismo. Por eso al marcar "es menor"
 *   el correo que se captura es el del TUTOR, y el nombre sigue siendo el del
 *   jugador (es quien sale en el cuadro y en el ranking).
 *
 * TODO EL ALTA VA POR UNA EDGE FUNCTION
 *   `pair-register-manual`. auth.users y public.pairs no comparten
 *   transacción: si se creara la cuenta desde aquí y luego fallara el insert
 *   de la pareja, quedarían cuentas fantasma. La función compensa borrando lo
 *   que creó. Además, crear usuarios exige service_role, que nunca puede vivir
 *   en el bundle.
 *
 * EL BLOQUE HORARIO, Y POR QUÉ AQUÍ SÍ SE PUEDE ELEGIR UNO LLENO
 *   El jugador solo ve los bloques con cupo; los agotados se le ocultan. El
 *   organizador ve TODOS y puede meter una pareja en uno lleno, porque esa
 *   pareja ya le pagó y decirle que no cabe no es una respuesta. Lo que se le
 *   debe es el aviso de la consecuencia ANTES de guardar —quedaría sin grupo
 *   completo— y que la fila quede marcada como forzada, para que la pantalla de
 *   ocupación pueda explicar después por qué ese bloque está sobrevendido.
 */

import { useCallback, useState } from 'react';
import {
  View, Text, TextInput, ScrollView, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView,
} from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';

import { supabase } from '@/lib/supabase/client';
import { color, radius, space, font, fontSize, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset, inputFontSize } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';
import BuscadorDeUsuario, { type UsuarioEncontrado } from '@/components/ui/BuscadorDeUsuario';
import SelectorDeBloque from '@/components/tournament/SelectorDeBloque';
import { cargarBloquesDelTorneo, guardarEleccionDeBloque, type BloquesDelTorneo } from '@/lib/bloques-torneo';
import { rangoLegible } from '@/lib/bloques-formato';
import { formatearConDia } from '@/lib/fechas';
import { fallo } from '@/lib/errores-red';

// ── Modelo ──────────────────────────────────────────────────────────────────

interface Categoria {
  id:           string;
  display_name: string;
}

/** Datos de una cuenta por crear. `nombre` es SIEMPRE el del jugador. */
interface Nuevo {
  nombre:   string;
  /** Del tutor si esMenor; del jugador si no. */
  correo:   string;
  telefono: string;
  esMenor:  boolean;
}

type Slot =
  | { t: 'vacio' }
  | { t: 'existente'; u: UsuarioEncontrado }
  | { t: 'nuevo';     d: Nuevo };

type Paso = 'categoria' | 'jugadores' | 'bloque' | 'confirmar' | 'guardando' | 'listo';

/** Estado de un correo en public.email_outbox. Ver migración 037. */
interface FilaCorreo {
  id:         string;
  kind:       'account_created' | 'minor_account_created' | 'registered' | 'minor_registered';
  to_email:   string;
  status:     'pending' | 'sent' | 'failed';
  last_error: string | null;
}

const NUEVO_VACIO: Nuevo = { nombre: '', correo: '', telefono: '', esMenor: false };

const RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Sin https:// ni barra final: es una dirección que se dicta en voz alta. */
const SITIO = (process.env.EXPO_PUBLIC_SITE_URL ?? 'rally-app-theta-three.vercel.app')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');

function nuevoValido(d: Nuevo): boolean {
  return d.nombre.trim().length >= 3 && RE_CORREO.test(d.correo.trim());
}

function resuelto(s: Slot): boolean {
  return s.t === 'existente' || (s.t === 'nuevo' && nuevoValido(s.d));
}

function nombreDe(s: Slot): string {
  if (s.t === 'existente') return s.u.full_name;
  if (s.t === 'nuevo')     return s.d.nombre.trim();
  return '';
}

/** Códigos de la Edge Function traducidos. Nunca se enseña el código crudo. */
const MENSAJE: Record<string, string> = {
  unauthenticated:          'Tu sesión expiró. Vuelve a entrar.',
  forbidden:                'No eres organizador de este torneo.',
  tournament_not_found:     'El torneo ya no existe. Recarga la pantalla.',
  category_not_found:       'La categoría ya no existe. Recarga la pantalla.',
  category_closed:          'Esa categoría ya cerró inscripciones.',
  invalid_name:             'El nombre debe tener al menos 3 caracteres.',
  invalid_email:            'El correo no tiene un formato válido.',
  same_player_twice:        'Los dos jugadores deben ser personas distintas.',
  pair_duplicate:           'Uno de estos jugadores ya está inscrito en esta categoría.',
  create_user_failed:       'No se pudo crear la cuenta. Intenta de nuevo.',
  age_declaration_required: 'Falta declarar si el jugador es menor de edad.',
};
const MENSAJE_GENERICO = 'No se pudo registrar la pareja. Intenta de nuevo.';

// ── Pantalla ────────────────────────────────────────────────────────────────

export default function AgregarParejaScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  const [paso, setPaso]             = useState<Paso>('categoria');
  const [nombreTorneo, setNombre]   = useState('');
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [categoria, setCategoria]   = useState<Categoria | null>(null);
  const [slot1, setSlot1]           = useState<Slot>({ t: 'vacio' });
  const [slot2, setSlot2]           = useState<Slot>({ t: 'vacio' });
  // Bloque horario. Con la lista vacía —sin canchas ni horarios capturados—
  // el paso se salta y la pareja queda registrada sin bloque.
  const [bloques, setBloques]       = useState<BloquesDelTorneo | null>(null);
  const [bloqueId, setBloqueId]     = useState<string | null>(null);
  /** El bloque elegido no tenía cupo. Solo el organizador puede llegar aquí. */
  const [forzado, setForzado]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [correos, setCorreos]       = useState<FilaCorreo[]>([]);
  // Los ids se guardan aparte y NO se derivan de `correos`: si la primera
  // consulta llega vacía (los correos se escriben y envían en segundo plano),
  // derivarlos dejaría a "Actualizar" preguntando por una lista vacía para
  // siempre, sin forma de recuperarse.
  const [outboxIds, setOutboxIds]   = useState<string[]>([]);

  const cargar = useCallback(async () => {
    const [{ data: t }, { data: cats }] = await Promise.all([
      supabase.from('tournaments').select('name').eq('id', tournamentId).single(),
      supabase.from('categories')
        .select('id, display_name')
        .eq('tournament_id', tournamentId)
        .eq('status', 'open')
        .order('division'),
    ]);
    if (t) setNombre(t.name);
    setCategorias(cats ?? []);
    setBloques(await cargarBloquesDelTorneo(tournamentId));
  }, [tournamentId]);

  useFocusEffect(useCallback(() => { void cargar(); }, [cargar]));

  function reiniciar() {
    setPaso('categoria');
    setCategoria(null);
    setSlot1({ t: 'vacio' });
    setSlot2({ t: 'vacio' });
    setBloqueId(null);
    setForzado(false);
    // Se relee: la pareja que se acaba de registrar ya ocupa un lugar.
    void cargarBloquesDelTorneo(tournamentId).then(setBloques);
    setError(null);
    setCorreos([]);
    setOutboxIds([]);
  }

  /** Hay algo que elegir. Con `false` el paso del bloque no existe. */
  const hayBloques = (bloques?.bloques.length ?? 0) > 0;

  const bloqueElegido = bloques?.bloques.find((b) => b.id === bloqueId) ?? null;

  async function guardar() {
    if (!categoria || !resuelto(slot1) || !resuelto(slot2)) return;
    setError(null);
    setPaso('guardando');

    const aCarga = (s: Slot) =>
      s.t === 'existente'
        ? { mode: 'existing' as const, user_id: s.u.id }
        : {
            mode:      'new' as const,
            full_name: (s as { d: Nuevo }).d.nombre.trim(),
            email:     (s as { d: Nuevo }).d.correo.trim().toLowerCase(),
            phone:     (s as { d: Nuevo }).d.telefono.trim(),
            is_minor:  (s as { d: Nuevo }).d.esMenor,
          };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError(MENSAJE.unauthenticated); setPaso('confirmar'); return; }

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/pair-register-manual`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            tournament_id: tournamentId,
            category_id:   categoria.id,
            players:       [aCarga(slot1), aCarga(slot2)],
          }),
        },
      );

      const json = await res.json().catch(() => null);

      if (!res.ok || !json?.ok) {
        const codigo = typeof json?.error === 'string' ? json.error : '';

        // Un correo ya usado NO es un error del organizador: es que se
        // equivocó de rama. Se le ofrece la persona encontrada.
        if (codigo === 'email_already_exists' && json?.existing_user) {
          setError(
            `Ya hay una cuenta con ese correo: ${json.existing_user.full_name}. ` +
            'Búscala por su nombre y selecciónala en vez de crear una cuenta nueva.',
          );
          setPaso('jugadores');
          return;
        }

        console.error('[agregar-pareja] fallo:', { status: res.status, json });
        setError(MENSAJE[codigo] ?? MENSAJE_GENERICO);
        setPaso('confirmar');
        return;
      }

      // El bloque se aparta con el id de la pareja recién creada. Si falla, la
      // pareja NO se deshace: queda sin bloque y sale así en la ocupación.
      if (hayBloques && bloqueId && json.pair_id) {
        const fallo = await guardarEleccionDeBloque({
          pairId:       json.pair_id as string,
          tournamentId: tournamentId as string,
          bloqueId,
          forzado,
        });
        if (fallo) setError(fallo);
      }

      setPaso('listo');
      // Los correos salen en segundo plano, así que al responder están en
      // 'pending'. Se consultan un momento después para enseñar el resultado.
      if (Array.isArray(json.outbox_ids) && json.outbox_ids.length > 0) {
        setOutboxIds(json.outbox_ids as string[]);
        void refrescarCorreos(json.outbox_ids as string[]);
      }
    } catch (e) {
      setError(fallo('agregar-pareja', e, 'No se pudo registrar la pareja. Intenta de nuevo.', {
        tournamentId,
      }));
      setPaso('confirmar');
    }
  }

  const refrescarCorreos = useCallback(async (ids: string[]) => {
    if (ids.length === 0) return;
    // `email_outbox` es de la migración 037 y todavía no está en los tipos
    // generados. Se acota a FilaCorreo aquí para que de aquí en adelante sí
    // haya tipos. Al correr `npm run types:db` el cast sobra.
    const { data } = await (supabase as unknown as {
      from: (t: string) => {
        select: (c: string) => {
          in: (c: string, v: string[]) => Promise<{ data: FilaCorreo[] | null }>;
        };
      };
    })
      .from('email_outbox')
      .select('id, kind, to_email, status, last_error')
      .in('id', ids);

    setCorreos(data ?? []);
  }, []);

  async function reenviar(outboxId: string) {
    // Optimista: el botón desaparece en cuanto se pulsa. Si el reenvío vuelve
    // a fallar, el refresco de abajo lo devuelve a 'failed'.
    setCorreos((prev) => prev.map((c) => c.id === outboxId ? { ...c, status: 'pending' } : c));
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    await fetch(`${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/email-resend`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body:    JSON.stringify({ outbox_id: outboxId }),
    }).catch(() => {});

    await refrescarCorreos(outboxIds);
  }

  // ── Guardando ─────────────────────────────────────────────────────────────
  if (paso === 'guardando') {
    return (
      <View style={s.centro}>
        <ActivityIndicator color={color.gold} size="large" />
        <Text style={s.centroTexto}>Registrando la pareja…</Text>
      </View>
    );
  }

  // ── Listo ─────────────────────────────────────────────────────────────────
  if (paso === 'listo') {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.contenido}>
          <Text style={s.exitoTitulo}>Pareja inscrita</Text>
          <Text style={s.exitoCuerpo}>
            {nombreDe(slot1)} y {nombreDe(slot2)} ya están en {categoria?.display_name}
            {bloqueElegido
              ? `, el ${formatearConDia(bloqueElegido.dia)} de ${rangoLegible(bloqueElegido.desde, bloqueElegido.hasta)}.`
              : '.'}
          </Text>

          {error && (
            <View style={s.errorCaja}>
              <Text style={s.errorTexto}>{error}</Text>
            </View>
          )}

          <EstadoCorreos
            filas={correos}
            onRefrescar={() => refrescarCorreos(outboxIds)}
            onReenviar={reenviar}
          />

          <View style={s.botonera}>
            <Pressable style={s.btnPerfilado} onPress={reiniciar} accessibilityRole="button">
              <Text style={s.btnPerfiladoTexto}>Agregar otra</Text>
            </Pressable>
            <Pressable style={s.btnDorado} onPress={() => router.back()} accessibilityRole="button">
              <Text style={s.btnDoradoTexto}>Volver al panel</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ── Pasos 1–3 ─────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={s.safe}>
      <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">

        <BotonVolver texto="Atrás" enScroller />

        <Text style={s.eyebrow}>{nombreTorneo.toUpperCase()}</Text>
        <Text style={s.titulo}>Registrar pareja</Text>
        <Text style={s.subtitulo}>
          El pago se recibió fuera de la plataforma. Si algún jugador no tiene
          cuenta, se la creas aquí mismo.
        </Text>

        <Pasos actual={paso} conBloque={hayBloques} />

        {error && (
          <View style={s.errorCaja}>
            <Text style={s.errorTexto}>{error}</Text>
          </View>
        )}

        {/* ── 1. Categoría ── */}
        {paso === 'categoria' && (
          <View style={s.bloque}>
            <Text style={s.seccion}>1 · CATEGORÍA</Text>
            {categorias.length === 0 ? (
              <Text style={s.vacio}>No hay categorías abiertas en este torneo.</Text>
            ) : categorias.map((c) => (
              <Pressable
                key={c.id}
                onPress={() => { setCategoria(c); setPaso('jugadores'); }}
                style={({ pressed }) => [s.filaCategoria, pressed && s.filaPulsada]}
                accessibilityRole="button"
                accessibilityLabel={c.display_name}
              >
                <Text style={s.filaCategoriaTexto}>{c.display_name}</Text>
                <Text style={s.chevron}>›</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* ── 2. Los dos jugadores ── */}
        {paso === 'jugadores' && (
          <View style={s.bloque}>
            <Text style={s.seccion}>2 · JUGADORES</Text>
            <Text style={s.categoriaElegida}>
              {categoria?.display_name}
              {'  '}
              <Text style={s.cambiar} onPress={() => setPaso('categoria')}>Cambiar</Text>
            </Text>

            <BloqueJugador
              etiqueta="Jugador 1"
              slot={slot1}
              otroId={slot2.t === 'existente' ? slot2.u.id : undefined}
              onCambio={setSlot1}
            />
            <BloqueJugador
              etiqueta="Jugador 2"
              slot={slot2}
              otroId={slot1.t === 'existente' ? slot1.u.id : undefined}
              onCambio={setSlot2}
            />

            <Pressable
              onPress={() => { setError(null); setPaso(hayBloques ? 'bloque' : 'confirmar'); }}
              disabled={!resuelto(slot1) || !resuelto(slot2)}
              style={({ pressed }) => [
                s.btnDorado,
                (!resuelto(slot1) || !resuelto(slot2)) && s.btnInactivo,
                pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[
                s.btnDoradoTexto,
                (!resuelto(slot1) || !resuelto(slot2)) && s.btnTextoInactivo,
              ]}>
                Continuar
              </Text>
            </Pressable>
          </View>
        )}

        {/* ── 3. Bloque horario ──
            Solo aparece si el torneo tiene canchas y horarios. `permitirLlenos`
            es la única diferencia con la pantalla del jugador: el organizador
            ve los agotados y puede elegirlos. */}
        {paso === 'bloque' && categoria && (
          <View style={s.bloque}>
            <Text style={s.seccion}>3 · HORARIO</Text>
            <Text style={s.categoriaElegida}>
              {categoria.display_name}
              {'  '}
              <Text style={s.cambiar} onPress={() => setPaso('jugadores')}>Cambiar</Text>
            </Text>

            <SelectorDeBloque
              bloques={bloques!.bloques}
              ocupacion={bloques!.ocupacion}
              categoriaId={categoria.id}
              valor={bloqueId}
              opcionesCupo={bloques!.opcionesCupo}
              minutosPorHorario={bloques?.reticula?.minutosPorBloque}
              permitirLlenos
              onCambio={(id, cupo) => { setBloqueId(id); setForzado(cupo <= 0); }}
            />

            <Pressable
              onPress={() => { setError(null); setPaso('confirmar'); }}
              disabled={!bloqueId}
              style={({ pressed }) => [
                s.btnDorado, !bloqueId && s.btnInactivo, pressed && { opacity: 0.85 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[s.btnDoradoTexto, !bloqueId && s.btnTextoInactivo]}>Continuar</Text>
            </Pressable>

            <Pressable onPress={() => setPaso('jugadores')} style={s.volverPaso} accessibilityRole="button">
              <Text style={s.volverPasoTexto}>Volver a los jugadores</Text>
            </Pressable>
          </View>
        )}

        {/* ── 4. Confirmar ── */}
        {paso === 'confirmar' && categoria && (
          <View style={s.bloque}>
            <Text style={s.seccion}>{hayBloques ? '4' : '3'} · CONFIRMAR</Text>

            <View style={s.resumen}>
              <FilaResumen etiqueta="Categoría" valor={categoria.display_name} />
              <FilaResumen etiqueta="Jugador 1" valor={nombreDe(slot1)} nota={notaSlot(slot1)} />
              <FilaResumen etiqueta="Jugador 2" valor={nombreDe(slot2)} nota={notaSlot(slot2)} />
              {hayBloques && (
                <FilaResumen
                  etiqueta="Horario"
                  valor={bloqueElegido
                    ? `${formatearConDia(bloqueElegido.dia)}, ${rangoLegible(bloqueElegido.desde, bloqueElegido.hasta)}`
                    : 'Sin bloque'}
                  nota={forzado ? 'BLOQUE LLENO · se registra como forzada' : undefined}
                />
              )}
              <FilaResumen etiqueta="Pago" valor="Recibido fuera de la plataforma" />
            </View>

            <View style={s.avisoCorreos}>
              <Text style={s.avisoTitulo}>Al confirmar se enviarán 2 correos</Text>
              {[slot1, slot2].map((sl, i) => (
                <Text key={i} style={s.avisoLinea}>
                  · <Text style={s.avisoNegrita}>{nombreDe(sl)}</Text>
                  {' — '}
                  {sl.t === 'nuevo'
                    ? (sl.d.esMenor
                        ? `activación de cuenta al tutor (${sl.d.correo.trim()})`
                        : 'alta de cuenta e inscripción')
                    : 'aviso de inscripción'}
                </Text>
              ))}
            </View>

            <View style={s.nota}>
              <Text style={s.notaTexto}>
                Esta inscripción es un dato de seguimiento. No registra ingreso
                económico en RALLY. La pareja participa en el cuadro igual que
                cualquier otra.
              </Text>
            </View>

            <Pressable
              onPress={guardar}
              style={({ pressed }) => [s.btnDorado, pressed && { opacity: 0.85 }]}
              accessibilityRole="button"
              accessibilityLabel="Confirmar e inscribir"
            >
              <Text style={s.btnDoradoTexto}>Confirmar e inscribir</Text>
            </Pressable>

            <Pressable
              onPress={() => setPaso(hayBloques ? 'bloque' : 'jugadores')}
              style={s.volverPaso}
              accessibilityRole="button"
            >
              <Text style={s.volverPasoTexto}>
                {hayBloques ? 'Volver al horario' : 'Volver a los jugadores'}
              </Text>
            </Pressable>
          </View>
        )}

      </ScrollView>
    </SafeAreaView>
  );
}

function notaSlot(s: Slot): string | undefined {
  if (s.t === 'existente') return 'ya tenía cuenta';
  if (s.t === 'nuevo')     return s.d.esMenor ? 'CUENTA NUEVA · menor de edad' : 'CUENTA NUEVA';
  return undefined;
}

// ── Bloque de un jugador ────────────────────────────────────────────────────

function BloqueJugador({
  etiqueta, slot, otroId, onCambio,
}: {
  etiqueta: string;
  slot:     Slot;
  /** Para no dejar elegir dos veces a la misma persona. */
  otroId?:  string;
  onCambio: (s: Slot) => void;
}) {
  // Ya elegido: tarjeta compacta con salida.
  if (slot.t === 'existente') {
    return (
      <View style={s.jugadorCaja}>
        <Text style={s.jugadorEtiqueta}>{etiqueta.toUpperCase()}</Text>
        <View style={s.elegidoFila}>
          <View style={s.elegidoTextos}>
            <Text style={s.elegidoNombre} numberOfLines={1}>{slot.u.full_name}</Text>
            <Text style={s.elegidoCorreo} numberOfLines={1}>{slot.u.email}</Text>
          </View>
          <Pressable onPress={() => onCambio({ t: 'vacio' })} accessibilityRole="button" style={s.quitar}>
            <Text style={s.quitarTexto}>Cambiar</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  // Formulario de cuenta nueva.
  if (slot.t === 'nuevo') {
    const d = slot.d;
    const set = (parche: Partial<Nuevo>) => onCambio({ t: 'nuevo', d: { ...d, ...parche } });

    return (
      <View style={s.jugadorCaja}>
        <View style={s.jugadorCabecera}>
          <Text style={s.jugadorEtiqueta}>{etiqueta.toUpperCase()} · CUENTA NUEVA</Text>
          <Pressable onPress={() => onCambio({ t: 'vacio' })} accessibilityRole="button" style={s.quitar}>
            <Text style={s.quitarTexto}>Cancelar</Text>
          </Pressable>
        </View>

        {/* El aviso va ANTES de los campos: si apareciera después, el
            organizador ya habría escrito el correo del chico. */}
        <View style={s.avisoMenor}>
          <Text style={s.avisoMenorTexto}>
            Si el jugador es menor de 18 años, usa el correo del padre, madre o
            tutor. Ellos activarán la cuenta y verán los partidos.
          </Text>
        </View>

        <Pressable
          style={s.checkRow}
          onPress={() => set({ esMenor: !d.esMenor })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: d.esMenor }}
        >
          <View style={[s.check, d.esMenor && s.checkMarcado]}>
            {d.esMenor && <Text style={s.checkPalomita}>✓</Text>}
          </View>
          <Text style={s.checkLabel}>Es menor de edad</Text>
        </Pressable>

        <Campo
          etiqueta="Nombre completo del jugador"
          valor={d.nombre}
          onCambio={(v) => set({ nombre: v })}
          placeholder="Juan Pérez"
          autoCapitalize="words"
          ayuda={d.esMenor ? 'El nombre del chico, no el del tutor: es quien aparece en el cuadro.' : undefined}
        />
        <Campo
          etiqueta={d.esMenor ? 'Correo del padre, madre o tutor' : 'Correo'}
          valor={d.correo}
          onCambio={(v) => set({ correo: v })}
          placeholder="correo@ejemplo.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <Campo
          etiqueta="Teléfono (opcional)"
          valor={d.telefono}
          onCambio={(v) => set({ telefono: v })}
          placeholder="81 1234 5678"
          keyboardType="phone-pad"
          autoCapitalize="none"
        />
      </View>
    );
  }

  // Vacío: buscador con la salida a "crear cuenta" siempre visible.
  return (
    <View style={s.jugadorCaja}>
      <BuscadorDeUsuario
        label={etiqueta}
        placeholder="Nombre o correo"
        ayuda="Escribe al menos 3 letras. Si no aparece, créale la cuenta."
        yaElegidos={otroId ? [otroId] : []}
        textoYaElegido="Ya es el otro jugador"
        onElegir={(u) => onCambio({ t: 'existente', u })}
        accionSecundaria={(consulta) => (
          <Pressable
            onPress={() => onCambio({
              t: 'nuevo',
              // Lo tecleado se aprovecha: si parece correo va al campo de
              // correo, y si no, al de nombre. Ahorra volver a escribirlo.
              d: RE_CORREO.test(consulta)
                ? { ...NUEVO_VACIO, correo: consulta }
                : { ...NUEVO_VACIO, nombre: consulta },
            })}
            style={({ pressed }) => [s.crearCuenta, pressed && s.filaPulsada]}
            accessibilityRole="button"
            accessibilityLabel="Crearle cuenta en RALLY"
          >
            <Text style={s.crearCuentaTexto}>+  Crearle cuenta en RALLY</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

// ── Piezas ──────────────────────────────────────────────────────────────────

function Campo({
  etiqueta, valor, onCambio, placeholder, ayuda,
  keyboardType, autoCapitalize,
}: {
  etiqueta:        string;
  valor:           string;
  onCambio:        (v: string) => void;
  placeholder:     string;
  ayuda?:          string;
  keyboardType?:   'email-address' | 'phone-pad';
  autoCapitalize?: 'none' | 'words';
}) {
  return (
    <View style={s.campo}>
      <Text style={s.campoEtiqueta}>{etiqueta}</Text>
      <TextInput
        style={s.input}
        value={valor}
        onChangeText={onCambio}
        placeholder={placeholder}
        placeholderTextColor={color.muted}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        selectionColor={color.gold}
        accessibilityLabel={etiqueta}
      />
      {ayuda ? <Text style={s.campoAyuda}>{ayuda}</Text> : null}
    </View>
  );
}

function Pasos({ actual, conBloque }: { actual: Paso; conBloque: boolean }) {
  // Sin canchas ni horarios capturados no hay paso de bloque, y los puntos
  // tienen que contar los pasos que de verdad se van a recorrer.
  const orden: Paso[] = conBloque
    ? ['categoria', 'jugadores', 'bloque', 'confirmar']
    : ['categoria', 'jugadores', 'confirmar'];
  const i = orden.indexOf(actual);
  return (
    <View style={s.pasos}>
      {orden.map((p, n) => (
        <View key={p} style={[s.pasoPunto, n <= i && s.pasoPuntoActivo]} />
      ))}
    </View>
  );
}

function FilaResumen({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <View style={s.resumenFila}>
      <Text style={s.resumenEtiqueta}>{etiqueta}</Text>
      <View style={s.resumenDerecha}>
        <Text style={s.resumenValor}>{valor}</Text>
        {nota ? <Text style={s.resumenNota}>{nota}</Text> : null}
      </View>
    </View>
  );
}

/**
 * Qué decirle al organizador sobre los correos.
 *
 * ANTES SALÍA EL ERROR CRUDO — "No salió — missing_RESEND_API_KEY" — y eso no
 * le sirve de nada: no lo puede arreglar, no sabe qué significa y lo único que
 * consigue es hacerle dudar de si la inscripción quedó bien.
 *
 * Lo que sí necesita es una frase que pueda repetir de memoria en la cancha,
 * porque ese es el escenario real: tiene a la pareja delante y quiere decirles
 * cómo entrar. Y funciona haya salido el correo o no — desde el login en dos
 * pasos (migración 043), escribir el correo basta: la app reconoce la cuenta y
 * les pide crear su contraseña.
 *
 * El detalle técnico del fallo se queda en email_outbox, que es para nosotros.
 */
function EstadoCorreos({
  filas, onRefrescar, onReenviar,
}: {
  filas:       FilaCorreo[];
  onRefrescar: () => void;
  onReenviar:  (id: string) => void;
}) {
  const fallidos = filas.filter((f) => f.status === 'failed');

  return (
    <View style={s.correosCaja}>
      <Text style={s.correosTitulo}>Diles cómo entrar</Text>

      <Text style={s.instruccion}>
        Que entren a <Text style={s.instruccionFuerte}>{SITIO}</Text> y pongan su
        correo. La app los reconoce y les pide crear su contraseña. Nada más.
      </Text>

      <Text style={s.correosNota}>
        {fallidos.length === 0
          ? 'También les mandamos un correo con estos datos.'
          : 'Les mandamos un correo, pero por si no les llega, es más rápido decírselo tú.'}
      </Text>

      {/* Discreto y sin el error crudo: reenviar es útil, pero no es lo que
          resuelve el momento. */}
      {fallidos.length > 0 && (
        <View style={s.reenvios}>
          {fallidos.map((f) => (
            <View key={f.id} style={s.correoFila}>
              <Text style={s.correoDestino} numberOfLines={1}>{f.to_email}</Text>
              <Pressable onPress={() => onReenviar(f.id)} style={s.quitar} accessibilityRole="button">
                <Text style={s.reenviarTexto}>Reenviar</Text>
              </Pressable>
            </View>
          ))}
          <Pressable onPress={onRefrescar} accessibilityRole="button">
            <Text style={s.correosActualizar}>Actualizar</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

// ── Estilos ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: color.bg },
  contenido: { paddingHorizontal: space[4.5], paddingTop: space[3], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  centro:      { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center', gap: space[4] },
  centroTexto: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },

  eyebrow:   { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 2 },
  titulo:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text },
  subtitulo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18, marginBottom: space[1] },

  pasos:           { flexDirection: 'row', gap: space[1], marginBottom: space[2] },
  pasoPunto:       { flex: 1, height: 2, borderRadius: 1, backgroundColor: color.lineSoft },
  pasoPuntoActivo: { backgroundColor: color.gold },

  seccion: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 1.6 },
  bloque:  { gap: space[3] },
  vacio:   { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },

  filaCategoria:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: touchTarget + 8, paddingHorizontal: space[4], backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md },
  filaCategoriaTexto: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  filaPulsada:        { backgroundColor: color.surface2 },
  chevron:            { fontFamily: font.body, fontSize: 22, color: color.gold },

  categoriaElegida: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  cambiar:          { color: color.gold },

  jugadorCaja:     { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.lg, padding: space[4], gap: space[3] },
  jugadorCabecera: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  jugadorEtiqueta: { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 1.4 },

  elegidoFila:   { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  elegidoTextos: { flex: 1, minWidth: 0, gap: 2 },
  elegidoNombre: { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  elegidoCorreo: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  quitar:      { paddingHorizontal: space[3], paddingVertical: space[2], borderRadius: radius.sm, borderWidth: 1, borderColor: color.lineSoft, flexShrink: 0 },
  quitarTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  crearCuenta:      { minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: space[3], borderWidth: 1, borderColor: color.line, borderStyle: 'dashed', borderRadius: radius.md, marginTop: space[1] },
  crearCuentaTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.gold },

  avisoMenor:      { backgroundColor: color.surface2, borderRadius: radius.md, padding: space[3] },
  avisoMenorTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, lineHeight: 17 },

  checkRow:      { flexDirection: 'row', alignItems: 'center', gap: space[2], minHeight: touchTarget },
  check:         { width: 20, height: 20, borderRadius: radius.xs, borderWidth: 1, borderColor: color.gold, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  checkMarcado:  { backgroundColor: color.gold },
  checkPalomita: { fontSize: 12, color: color.onGold, fontWeight: '700' },
  checkLabel:    { fontFamily: font.body, fontSize: fontSize.body, color: color.text },

  campo:         { gap: space[1] },
  campoEtiqueta: { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, letterSpacing: 0.3 },
  campoAyuda:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, opacity: 0.8, lineHeight: 16 },
  input:         { backgroundColor: color.surface2, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, minHeight: touchTarget, paddingHorizontal: space[4], paddingVertical: space[3], fontFamily: font.body, fontSize: inputFontSize(fontSize.body), color: color.text },

  resumen:         { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, padding: space[4], gap: space[3] },
  resumenFila:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: space[3] },
  resumenEtiqueta: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, flex: 1 },
  resumenDerecha:  { flex: 2, alignItems: 'flex-end', gap: 2 },
  resumenValor:    { fontFamily: font.body, fontSize: fontSize.body, color: color.text, textAlign: 'right' },
  resumenNota:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.champagne, textAlign: 'right' },

  avisoCorreos:  { backgroundColor: color.surface2, borderRadius: radius.md, padding: space[3], gap: space[1] },
  avisoTitulo:   { fontFamily: font.display, fontSize: fontSize.caption, color: color.champagne, marginBottom: 2 },
  avisoLinea:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 18 },
  avisoNegrita:  { color: color.text, fontWeight: '600' },

  nota:      { backgroundColor: color.surface, borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.md, padding: space[3] },
  notaTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

  errorCaja:  { backgroundColor: 'rgba(224,114,111,0.10)', borderWidth: 1, borderColor: color.danger, borderRadius: radius.md, padding: space[3] },
  errorTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, lineHeight: 18 },

  exitoTitulo: { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.live, marginTop: space[5] },
  exitoCuerpo: { fontFamily: font.body, fontSize: fontSize.body, color: color.text, lineHeight: 21 },

  correosCaja:       { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, padding: space[4], gap: space[2], marginTop: space[2] },
  correosTitulo:     { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne },
  instruccion:       { fontFamily: font.body, fontSize: fontSize.body, color: color.text, lineHeight: 22 },
  instruccionFuerte: { color: color.goldBright, fontWeight: '600' },
  correosActualizar: { fontFamily: font.body, fontSize: fontSize.caption, color: color.gold },
  reenvios:          { gap: space[2], marginTop: space[2], paddingTop: space[2], borderTopWidth: 1, borderTopColor: color.lineSoft },
  correoFila:        { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  correoDestino:     { flex: 1, minWidth: 0, fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  reenviarTexto:     { fontFamily: font.body, fontSize: fontSize.caption, fontWeight: '600', color: color.gold },
  correosNota:       { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },

  botonera:          { gap: space[2], marginTop: space[4] },
  btnDorado:         { backgroundColor: color.gold, borderWidth: 1, borderColor: color.goldBright, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  btnDoradoTexto:    { fontFamily: font.body, fontSize: 15, fontWeight: '600', color: color.onGold, letterSpacing: 0.3 },
  btnInactivo:       { backgroundColor: color.surface2, borderColor: color.line },
  btnTextoInactivo:  { color: color.muted },
  btnPerfilado:      { borderWidth: 1, borderColor: color.lineSoft, borderRadius: radius.sm, minHeight: touchTarget, alignItems: 'center', justifyContent: 'center' },
  btnPerfiladoTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.gold },

  volverPaso:      { alignItems: 'center', paddingVertical: space[2] },
  volverPasoTexto: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
});
