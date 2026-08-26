/**
 * RALLY · Flujo de Inscripción a Torneo
 * 3 pasos en una sola pantalla con scroll:
 *   Paso 1 — Elegir categoría (cards seleccionables)
 *   Paso 2 — Buscar pareja por nombre o correo, y crearle cuenta si no la tiene
 *
 * ANTES ERA UN MURO
 *   Buscaba por correo EXACTO y, si no existía, decía "tu pareja debe
 *   registrarse primero". Mismo problema que ya se resolvió en el flujo del
 *   organizador: si tu pareja no tiene cuenta, no te puedes inscribir.
 *   Ahora se la creas tú, igual que hace el organizador.
 *
 * El alta va por la Edge Function `pair-register-self`: crear usuarios exige
 * service_role, y auth.users no comparte transacción con pairs (la función
 * compensa borrando lo que creó si el insert falla).
 *   Paso 3 — Preferencia de horario + confirmar
 *
 * Sprint 4 agregará el checkout de Stripe Connect.
 * Por ahora inscribe con payment_status = 'paid_offline'.
 */

import { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TextInput, Pressable,
  ActivityIndicator, StyleSheet, SafeAreaView, Modal,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { supabase }                             from '@/lib/supabase/client';
import { Button, Card, Badge, SectionLabel, Avatar } from '@/components/ui';
import { color, font, fontSize, space, radius, touchTarget } from '@/lib/design-tokens';
import { webContentColumn, bottomInset } from '@/lib/web-layout';
import BotonVolver from '@/components/ui/BotonVolver';
import BuscadorDeUsuario, { type UsuarioEncontrado } from '@/components/ui/BuscadorDeUsuario';

// ─── Tipos ───────────────────────────────────────────────────────────────

interface Category {
  id:           string;
  display_name: string;
  division:     string;
  gender:       string;
  status:       string;
  fee_override: number | null;
}

interface Tournament {
  id:               string;
  name:             string;
  registration_fee: number;
}

interface PartnerResult {
  id:        string;
  full_name: string;
  email:     string;
  photo_url: string | null;
}

/** Datos de la cuenta que se le crea a la pareja. `nombre` es el del JUGADOR. */
interface ParejaNueva {
  nombre:   string;
  /** Del tutor si esMenor; de la propia pareja si no. */
  correo:   string;
  telefono: string;
  esMenor:  boolean;
}

const PAREJA_VACIA: ParejaNueva = { nombre: '', correo: '', telefono: '', esMenor: false };

const RE_CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

/** Sin https:// ni barra final: es una dirección que se dicta en voz alta. */
const SITIO = (process.env.EXPO_PUBLIC_SITE_URL ?? 'rally-app-theta-three.vercel.app')
  .replace(/^https?:\/\//, '')
  .replace(/\/+$/, '');

/** Códigos de la Edge Function traducidos. Nunca se enseña el código crudo. */
const MENSAJE: Record<string, string> = {
  unauthenticated:          'Tu sesión expiró. Vuelve a entrar.',
  registration_closed:      'Este torneo ya cerró inscripciones.',
  category_closed:          'Esa categoría ya cerró inscripciones.',
  category_not_found:       'La categoría ya no existe. Recarga la pantalla.',
  tournament_not_found:     'El torneo ya no existe. Recarga la pantalla.',
  invalid_name:             'El nombre debe tener al menos 3 caracteres.',
  invalid_email:            'El correo no tiene un formato válido.',
  same_player_twice:        'No puedes inscribirte contigo mismo.',
  pair_duplicate:           'Uno de los dos ya está inscrito en esta categoría.',
  create_user_failed:       'No se pudo crear la cuenta de tu pareja. Intenta de nuevo.',
  age_declaration_required: 'Falta declarar si tu pareja es menor de edad.',
};
const MENSAJE_GENERICO = 'No se pudo completar la inscripción. Intenta de nuevo.';

type SchedulePref = 'morning' | 'afternoon' | 'any';

const SCHEDULE_OPTIONS: { value: SchedulePref; label: string; sub: string }[] = [
  { value: 'morning',   label: 'Mañana',  sub: 'Antes de las 2pm' },
  { value: 'afternoon', label: 'Tarde',   sub: 'Después de las 2pm' },
  { value: 'any',       label: 'Cualquier hora', sub: 'Sin preferencia' },
];

// ─── Pantalla ────────────────────────────────────────────────────────────

export default function InscripcionScreen() {
  const { tournamentId } = useLocalSearchParams<{ tournamentId: string }>();
  const router = useRouter();

  // Datos del torneo
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  // Paso 1 — Categoría
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);

  // Paso 2 — Pareja. Dos caminos excluyentes: una cuenta que ya existe, o una
  // que se crea aquí mismo.
  const [partnerFound, setPartnerFound] = useState<PartnerResult | null>(null);
  const [parejaNueva, setParejaNueva]   = useState<ParejaNueva | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [miId, setMiId] = useState<string | undefined>(undefined);

  /** Se creó la cuenta de la pareja: hay que decirle a quien inscribe cómo entra. */
  const [cuentaCreada, setCuentaCreada] = useState<{ nombre: string; siguiente: () => void } | null>(null);

  // Paso 3 — Horario
  const [schedulePref, setSchedulePref] = useState<SchedulePref>('any');

  // Envío
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  // ─── Cargar datos ────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [{ data: t }, { data: cats }] = await Promise.all([
        supabase
          .from('tournaments')
          .select('id, name, registration_fee')
          .eq('id', tournamentId)
          .single(),
        supabase
          .from('categories')
          .select('id, display_name, division, gender, status, fee_override')
          .eq('tournament_id', tournamentId)
          .eq('status', 'open')
          .order('division'),
      ]);
      const { data: { user } } = await supabase.auth.getUser();
      setMiId(user?.id);

      if (t) setTournament(t as Tournament);
      if (cats) setCategories(cats as Category[]);
      setLoadingData(false);
    }
    load();
  }, [tournamentId]);

  // ─── Elegir pareja ───────────────────────────────────────────────────

  function elegirExistente(u: UsuarioEncontrado) {
    setError(null);
    if (u.id === miId) { setError('No puedes inscribirte contigo mismo.'); return; }
    setParejaNueva(null);
    setPartnerFound({
      id: u.id, full_name: u.full_name, email: u.email, photo_url: u.photo_url,
    });
    setShowConfirmModal(true);
  }

  const parejaNuevaValida =
    !!parejaNueva
    && parejaNueva.nombre.trim().length >= 3
    && RE_CORREO.test(parejaNueva.correo.trim());

  /** Hay pareja resuelta, venga de donde venga. */
  const parejaLista = !!partnerFound || parejaNuevaValida;


  // ─── Inscribir ───────────────────────────────────────────────────────

  async function handleInscribir() {
    setError(null);
    if (!selectedCategory) { setError('Elige una categoría.'); return; }
    if (!parejaLista)      { setError('Elige a tu pareja o créale una cuenta.'); return; }

    setSubmitting(true);

    // Todo va por la Edge Function: crear la cuenta de la pareja exige
    // service_role, y auth.users no comparte transacción con pairs — si el
    // insert fallara, la función borra la cuenta que acaba de crear.
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setError('Tu sesión expiró. Vuelve a entrar.'); setSubmitting(false); return; }

      const partner = partnerFound
        ? { mode: 'existing' as const, user_id: partnerFound.id }
        : {
            mode:      'new' as const,
            full_name: parejaNueva!.nombre.trim(),
            email:     parejaNueva!.correo.trim().toLowerCase(),
            phone:     parejaNueva!.telefono.trim(),
            is_minor:  parejaNueva!.esMenor,
          };

      const res = await fetch(
        `${process.env.EXPO_PUBLIC_SUPABASE_URL}/functions/v1/pair-register-self`,
        {
          method:  'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization:  `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            tournament_id:       tournamentId,
            category_id:         selectedCategory.id,
            partner,
            schedule_preference: schedulePref,
          }),
        },
      );

      const json = await res.json().catch(() => null);
      setSubmitting(false);

      if (!res.ok || !json?.ok) {
        const codigo = typeof json?.error === 'string' ? json.error : '';

        // Correo ya usado: se equivocó de rama, no de dato.
        if (codigo === 'email_already_exists' && json?.existing_user) {
          setError(
            `Ya hay una cuenta con ese correo: ${json.existing_user.full_name}. ` +
            'Búscala por su nombre y selecciónala en vez de crear una nueva.',
          );
          setParejaNueva(null);
          return;
        }

        console.error('[inscripcion] fallo:', { status: res.status, json });
        setError(MENSAJE[codigo] ?? MENSAJE_GENERICO);
        return;
      }

      // Con cuota > 0 → checkout de Stripe Connect. Gratis → upsell.
      const siguiente = () => {
        if (json.requires_payment) {
          router.push(`/(protected)/inscripcion/${tournamentId}/pago`);
        } else {
          router.replace(`/(protected)/inscripcion/${tournamentId}/patrocinadores`);
        }
      };

      // Si se creó la cuenta, primero hay que decirle cómo entra: el correo
      // puede no llegarle, y quien inscribe la tiene delante ahora mismo.
      if (json.partner_is_new) {
        setCuentaCreada({ nombre: partner.mode === 'new' ? partner.full_name : '', siguiente });
        return;
      }

      siguiente();
    } catch {
      setSubmitting(false);
      setError('Sin conexión con el servidor. Revisa tu internet.');
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────

  if (loadingData) return (
    <View style={s.loadingContainer}><ActivityIndicator color={color.gold} /></View>
  );

  const fee = selectedCategory?.fee_override ?? tournament?.registration_fee ?? 0;

  // Se creó la cuenta de la pareja: antes de seguir al pago hay que decirle a
  // quien inscribe cómo entra. El correo puede no llegarle nunca (spam, dominio
  // mal escrito), y ahora mismo tiene a su pareja delante.
  if (cuentaCreada) {
    return (
      <SafeAreaView style={s.safe}>
        <ScrollView contentContainerStyle={s.content}>
          <Text style={s.comoEntrarTitulo}>Listo, ya está inscrita</Text>

          <View style={s.comoEntrarCaja}>
            <Text style={s.comoEntrarTitulo}>Dile cómo entrar</Text>
            <Text style={s.comoEntrarTexto}>
              Que entre a <Text style={s.comoEntrarFuerte}>{SITIO}</Text> y ponga
              su correo. La app la reconoce y le pide crear su contraseña. Nada más.
            </Text>
            <Text style={s.comoEntrarNota}>
              También le mandamos un correo con estos datos, pero es más rápido
              decírselo tú.
            </Text>
          </View>

          <Button
            label={fee > 0 ? 'Continuar al pago' : 'Continuar'}
            variant="primary"
            onPress={cuentaCreada.siguiente}
          />
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Modal confirmación de pareja */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>¿Esta es tu pareja?</Text>
            <View style={s.modalPartnerRow}>
              <Avatar name={partnerFound?.full_name ?? '?'} size={52} />
              <View style={s.modalPartnerTexts}>
                <Text style={s.modalPartnerName}>{partnerFound?.full_name}</Text>
                <Text style={s.modalPartnerEmail}>{partnerFound?.email}</Text>
              </View>
            </View>
            <View style={s.modalBtns}>
              <Button
                label="Sí, es mi pareja"
                variant="primary"
                onPress={() => setShowConfirmModal(false)}
              />
              <Button
                label="No, buscar otro"
                variant="secondary"
                onPress={() => {
                  setShowConfirmModal(false);
                  setPartnerFound(null);
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={s.header}>
        <BotonVolver texto="Volver" />
        <Text style={s.eyebrow}>INSCRIPCIÓN</Text>
        <Text style={s.title}>{tournament?.name}</Text>
      </View>

      <ScrollView contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

        {/* ── Paso 1: Categoría ───────────────────────────────────────── */}
        <SectionLabel title="1 · Elige tu categoría" />

        {categories.length === 0 && (
          <Card variant="standard">
            <Text style={s.emptyText}>No hay categorías abiertas en este torneo.</Text>
          </Card>
        )}

        {categories.map(cat => (
          <Pressable
            key={cat.id}
            onPress={() => setSelectedCategory(cat)}
            style={({ pressed }) => [pressed && { opacity: 0.8 }]}
          >
            <View style={[s.categoryCard, selectedCategory?.id === cat.id && s.categoryCardActive]}>
              {selectedCategory?.id === cat.id && (
                <View style={s.categoryCheckmark}>
                  <Text style={s.categoryCheckmarkText}>✓</Text>
                </View>
              )}
              <Text style={[s.categoryName, selectedCategory?.id === cat.id && s.categoryNameActive]}>
                {cat.display_name}
              </Text>
              <Text style={s.categoryFee}>
                {(cat.fee_override ?? tournament?.registration_fee ?? 0) > 0
                  ? `$${(cat.fee_override ?? tournament?.registration_fee ?? 0).toLocaleString('es-MX')} MXN / pareja`
                  : 'Gratuito'}
              </Text>
            </View>
          </Pressable>
        ))}

        {/* ── Paso 2: Pareja ──────────────────────────────────────────── */}
        <SectionLabel title="2 · Busca a tu pareja" />

        <Card variant="standard">
          {partnerFound ? (
            <View style={s.partnerConfirmed}>
              <Avatar name={partnerFound.full_name} size={40} />
              <View style={s.partnerConfirmedTexts}>
                <Text style={s.partnerName}>{partnerFound.full_name}</Text>
                <Text style={s.partnerEmail}>{partnerFound.email}</Text>
              </View>
              <Pressable
                onPress={() => setPartnerFound(null)}
                style={s.partnerChange}
                accessibilityRole="button"
              >
                <Text style={s.partnerChangeText}>Cambiar</Text>
              </Pressable>
            </View>
          ) : parejaNueva ? (
            // Formulario de cuenta nueva
            <View style={s.nuevaCaja}>
              <View style={s.nuevaCabecera}>
                <Text style={s.nuevaTitulo}>CUENTA NUEVA</Text>
                <Pressable onPress={() => setParejaNueva(null)} style={s.partnerChange} accessibilityRole="button">
                  <Text style={s.partnerChangeText}>Cancelar</Text>
                </Pressable>
              </View>

              {/* El aviso va ANTES de los campos: si apareciera después, ya
                  habrías escrito el correo del chico. */}
              <View style={s.avisoMenor}>
                <Text style={s.avisoMenorTexto}>
                  Si tu pareja es menor de 18 años, usa el correo del padre, madre
                  o tutor. Ellos activarán la cuenta y verán los partidos.
                </Text>
              </View>

              <Pressable
                style={s.checkRow}
                onPress={() => setParejaNueva({ ...parejaNueva, esMenor: !parejaNueva.esMenor })}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: parejaNueva.esMenor }}
              >
                <View style={[s.check, parejaNueva.esMenor && s.checkMarcado]}>
                  {parejaNueva.esMenor && <Text style={s.checkPalomita}>✓</Text>}
                </View>
                <Text style={s.checkLabel}>Es menor de edad</Text>
              </Pressable>

              <View style={s.campo}>
                <Text style={s.campoEtiqueta}>Nombre completo de tu pareja</Text>
                <TextInput
                  style={s.partnerInput}
                  placeholder="Juan Pérez"
                  placeholderTextColor={color.muted}
                  value={parejaNueva.nombre}
                  onChangeText={(v) => setParejaNueva({ ...parejaNueva, nombre: v })}
                  autoCapitalize="words"
                  autoCorrect={false}
                  selectionColor={color.gold}
                  accessibilityLabel="Nombre completo de tu pareja"
                />
                {parejaNueva.esMenor && (
                  <Text style={s.campoAyuda}>
                    El nombre del jugador, no el del tutor: es quien aparece en el cuadro.
                  </Text>
                )}
              </View>

              <View style={s.campo}>
                <Text style={s.campoEtiqueta}>
                  {parejaNueva.esMenor ? 'Correo del padre, madre o tutor' : 'Correo'}
                </Text>
                <TextInput
                  style={s.partnerInput}
                  placeholder="correo@ejemplo.com"
                  placeholderTextColor={color.muted}
                  value={parejaNueva.correo}
                  onChangeText={(v) => setParejaNueva({ ...parejaNueva, correo: v })}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  selectionColor={color.gold}
                  accessibilityLabel="Correo"
                />
              </View>

              <View style={s.campo}>
                <Text style={s.campoEtiqueta}>Teléfono (opcional)</Text>
                <TextInput
                  style={s.partnerInput}
                  placeholder="81 1234 5678"
                  placeholderTextColor={color.muted}
                  value={parejaNueva.telefono}
                  onChangeText={(v) => setParejaNueva({ ...parejaNueva, telefono: v })}
                  keyboardType="phone-pad"
                  autoCapitalize="none"
                  selectionColor={color.gold}
                  accessibilityLabel="Teléfono"
                />
              </View>
            </View>
          ) : (
            <BuscadorDeUsuario
              label="Nombre o correo de tu pareja"
              placeholder="Nombre o correo"
              ayuda="Escribe al menos 3 letras. Si no tiene cuenta, créasela aquí."
              yaElegidos={miId ? [miId] : []}
              textoYaElegido="Eres tú"
              onElegir={elegirExistente}
              accionSecundaria={(consulta) => (
                <Pressable
                  onPress={() => setParejaNueva(
                    // Lo tecleado se aprovecha: si parece correo va al campo de
                    // correo, y si no, al de nombre.
                    RE_CORREO.test(consulta)
                      ? { ...PAREJA_VACIA, correo: consulta }
                      : { ...PAREJA_VACIA, nombre: consulta },
                  )}
                  style={({ pressed }) => [s.crearCuenta, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                  accessibilityLabel="Crearle cuenta en RALLY"
                >
                  <Text style={s.crearCuentaTexto}>+  Crearle cuenta en RALLY</Text>
                </Pressable>
              )}
            />
          )}
        </Card>

        {/* ── Paso 3: Preferencia de horario ──────────────────────────── */}
        <SectionLabel title="3 · Preferencia de horario" />
        <Card variant="standard">
          <Text style={s.scheduleNote}>
            Es una preferencia suave — el organizador la considera al armar el calendario.
          </Text>
          <View style={s.scheduleOptions}>
            {SCHEDULE_OPTIONS.map(opt => (
              <Pressable
                key={opt.value}
                style={[s.scheduleOpt, schedulePref === opt.value && s.scheduleOptActive]}
                onPress={() => setSchedulePref(opt.value)}
              >
                <Text style={[s.scheduleOptLabel, schedulePref === opt.value && s.scheduleOptLabelActive]}>
                  {opt.label}
                </Text>
                <Text style={s.scheduleOptSub}>{opt.sub}</Text>
              </Pressable>
            ))}
          </View>
        </Card>

        {/* ── Resumen y confirmar ─────────────────────────────────────── */}
        {selectedCategory && parejaLista && (
          <>
            <SectionLabel title="Resumen" />
            <Card variant="feature">
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Categoría</Text>
                <Text style={s.summaryValue}>{selectedCategory.display_name}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Pareja</Text>
                <Text style={s.summaryValue}>{partnerFound?.full_name ?? parejaNueva?.nombre.trim()}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Horario</Text>
                <Text style={s.summaryValue}>
                  {SCHEDULE_OPTIONS.find(o => o.value === schedulePref)?.label}
                </Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryRow}>
                <Text style={s.summaryLabel}>Cuota</Text>
                <Text style={s.summaryFee}>
                  {fee > 0 ? `$${fee.toLocaleString('es-MX')} MXN` : 'Gratuito'}
                </Text>
              </View>
              {fee > 0 && (
                <Text style={s.summaryPayNote}>
                  💡 El pago se coordinará con el organizador. Sprint 4 habilitará pago en línea.
                </Text>
              )}
            </Card>
          </>
        )}

        {/* Error */}
        {error && <Text style={s.errorText}>{error}</Text>}

        {/* Botón confirmar */}
        <View style={s.submitWrapper}>
          <Button
            label={submitting ? 'Inscribiendo…' : 'Confirmar inscripción'}
            variant="primary"
            loading={submitting}
            disabled={!selectedCategory || !partnerFound}
            onPress={handleInscribir}
          />
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Estilos ──────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:             { flex: 1, backgroundColor: color.bg },
  loadingContainer: { flex: 1, backgroundColor: color.bg, alignItems: 'center', justifyContent: 'center' },

  // Hermano del ScrollView: aporta su propia columna, que no hereda.
  header:   { paddingHorizontal: space[4.5], paddingTop: space[3], ...webContentColumn },
  eyebrow:  { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[1] },
  title:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, marginBottom: space[2] },

  content: { paddingHorizontal: space[4.5], paddingBottom: bottomInset, gap: space[3], ...webContentColumn },

  emptyText: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, textAlign: 'center' },

  // Categorías
  categoryCard: {
    backgroundColor:  color.surface,
    borderWidth:      1,
    borderColor:      color.lineSoft,
    borderRadius:     radius.xl,
    padding:          space[4],
    flexDirection:    'row',
    alignItems:       'center',
    justifyContent:   'space-between',
  },
  categoryCardActive: { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  categoryCheckmark:  { width: 22, height: 22, borderRadius: 11, backgroundColor: color.gold, alignItems: 'center', justifyContent: 'center', marginRight: space[3] },
  categoryCheckmarkText: { fontSize: 13, color: color.onGold, fontWeight: '700' },
  categoryName:       { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text, flex: 1 },
  categoryNameActive: { color: color.goldBright },
  categoryFee:        { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },

  // Pareja
  partnerSearch:      { gap: space[3] },
  partnerSearchLabel: { fontFamily: font.body, fontSize: fontSize.body, color: color.muted, lineHeight: 20 },
  partnerInputRow:    { flexDirection: 'row', gap: space[2] },
  partnerInput: {
    flex:              1,
    backgroundColor:   color.surface2,
    borderWidth:       1,
    borderColor:       color.lineSoft,
    borderRadius:      radius.md,
    minHeight:         touchTarget,
    paddingHorizontal: space[4],
    fontFamily:        font.body,
    fontSize:          fontSize.body,
    color:             color.text,
  },
  searchBtn: {
    backgroundColor:   color.gold,
    borderRadius:      radius.sm,
    minHeight:         touchTarget,
    paddingHorizontal: space[4],
    alignItems:        'center',
    justifyContent:    'center',
    borderWidth:       1,
    borderColor:       color.goldBright,
  },
  searchBtnText: { fontFamily: font.body, fontSize: 13, fontWeight: '600', color: color.onGold },

  // Alta de cuenta de la pareja
  crearCuenta:      { minHeight: touchTarget, justifyContent: 'center', paddingHorizontal: space[3], borderWidth: 1, borderColor: color.line, borderStyle: 'dashed', borderRadius: radius.md, marginTop: space[1] },
  crearCuentaTexto: { fontFamily: font.body, fontSize: fontSize.body, fontWeight: '600', color: color.gold },

  nuevaCaja:      { gap: space[3] },
  nuevaCabecera:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nuevaTitulo:    { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.champagne, letterSpacing: 1.4 },

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

  // "Diles cómo entrar", tras crear la cuenta de la pareja
  comoEntrarCaja:   { backgroundColor: color.surface, borderWidth: 1, borderColor: color.line, borderRadius: radius.lg, padding: space[4], gap: space[2] },
  comoEntrarTitulo: { fontFamily: font.display, fontSize: fontSize.cardName, color: color.champagne },
  comoEntrarTexto:  { fontFamily: font.body, fontSize: fontSize.body, color: color.text, lineHeight: 22 },
  comoEntrarFuerte: { color: color.goldBright, fontWeight: '600' },
  comoEntrarNota:   { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, lineHeight: 17 },
  notFoundText: { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, lineHeight: 18 },

  partnerConfirmed:      { flexDirection: 'row', alignItems: 'center', gap: space[3] },
  partnerConfirmedTexts: { flex: 1 },
  partnerName:           { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  partnerEmail:          { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  partnerChange:         { padding: space[2] },
  partnerChangeText:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.gold },

  // Horario
  scheduleNote:    { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginBottom: space[3], lineHeight: 18 },
  scheduleOptions: { gap: space[2] },
  scheduleOpt: {
    backgroundColor: color.surface2,
    borderWidth:     1,
    borderColor:     color.lineSoft,
    borderRadius:    radius.md,
    padding:         space[3],
  },
  scheduleOptActive:      { borderColor: color.gold, backgroundColor: 'rgba(212,175,55,0.08)' },
  scheduleOptLabel:       { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  scheduleOptLabelActive: { color: color.goldBright },
  scheduleOptSub:         { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: 2 },

  // Resumen
  summaryRow:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: space[2] },
  summaryDivider: { height: 1, backgroundColor: color.lineSoft },
  summaryLabel:   { fontFamily: font.body, fontSize: fontSize.body, color: color.muted },
  summaryValue:   { fontFamily: font.body, fontSize: fontSize.body, color: color.text },
  summaryFee:     { fontFamily: font.display, fontSize: fontSize.metric, color: color.goldBright },
  summaryPayNote: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted, marginTop: space[3], lineHeight: 18 },

  errorText:     { fontFamily: font.body, fontSize: fontSize.caption, color: color.danger, textAlign: 'center' },
  submitWrapper: { marginTop: space[2] },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: space[5] },
  modalCard:    { backgroundColor: color.surface, borderRadius: radius.xl2, padding: space[5], width: '100%', gap: space[4], borderWidth: 1, borderColor: color.line },
  modalTitle:   { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, textAlign: 'center' },
  modalPartnerRow:   { flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: color.surface2, borderRadius: radius.xl, padding: space[3] },
  modalPartnerTexts: { flex: 1 },
  modalPartnerName:  { fontFamily: font.display, fontSize: fontSize.cardName, color: color.text },
  modalPartnerEmail: { fontFamily: font.body, fontSize: fontSize.caption, color: color.muted },
  modalBtns:    { gap: space[2] },
});
