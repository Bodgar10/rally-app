/**
 * RALLY · Flujo de Inscripción a Torneo
 * 3 pasos en una sola pantalla con scroll:
 *   Paso 1 — Elegir categoría (cards seleccionables)
 *   Paso 2 — Buscar pareja por correo (estilo Uber — Doc A §8)
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

  // Paso 2 — Pareja
  const [partnerEmail, setPartnerEmail]   = useState('');
  const [searching, setSearching]         = useState(false);
  const [partnerFound, setPartnerFound]   = useState<PartnerResult | null>(null);
  const [partnerNotFound, setPartnerNotFound] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

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
      if (t) setTournament(t as Tournament);
      if (cats) setCategories(cats as Category[]);
      setLoadingData(false);
    }
    load();
  }, [tournamentId]);

  // ─── Buscar pareja por correo ────────────────────────────────────────

  async function handleSearchPartner() {
    setError(null);
    setPartnerFound(null);
    setPartnerNotFound(false);

    if (!partnerEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(partnerEmail.trim())) {
      setError('Ingresa un correo válido.');
      return;
    }

    // Verificar que no sea el correo del propio usuario
    const { data: { user } } = await supabase.auth.getUser();
    if (user?.email?.toLowerCase() === partnerEmail.trim().toLowerCase()) {
      setError('No puedes inscribirte contigo mismo.');
      return;
    }

    setSearching(true);
    const { data } = await supabase
      .from('users')
      .select('id, full_name, email, photo_url')
      .eq('email', partnerEmail.trim().toLowerCase())
      .single();

    setSearching(false);

    if (data) {
      setPartnerFound(data as PartnerResult);
      setShowConfirmModal(true);
    } else {
      setPartnerNotFound(true);
    }
  }

  // ─── Inscribir ───────────────────────────────────────────────────────

  async function handleInscribir() {
    setError(null);
    if (!selectedCategory) { setError('Elige una categoría.'); return; }
    if (!partnerFound)      { setError('Busca y confirma a tu pareja.'); return; }

    setSubmitting(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setError('Sesión expirada.'); setSubmitting(false); return; }

    // Verificar que la pareja no esté ya inscrita en esta categoría
    const { data: existing } = await supabase
      .from('pairs')
      .select('id')
      .eq('category_id', selectedCategory.id)
      .or(`player1_id.eq.${partnerFound.id},player2_id.eq.${partnerFound.id}`);

    if (existing && existing.length > 0) {
      setError('Tu pareja ya está inscrita en esta categoría.');
      setSubmitting(false);
      return;
    }

    // Crear la pareja
    const { error: pairError } = await supabase
      .from('pairs')
      .insert({
        tournament_id:       tournamentId,
        category_id:         selectedCategory.id,
        player1_id:          user.id,
        player2_id:          partnerFound.id,
        schedule_preference: schedulePref,
        payment_status:      'paid_offline', // Sprint 4: cambiar a paid_online con Connect
      });

    setSubmitting(false);

    if (pairError) {
      if (pairError.code === '23505') {
        setError('Ya estás inscrito en esta categoría.');
      } else {
        setError('No se pudo completar la inscripción. Intenta de nuevo.');
      }
      return;
    }

    // Éxito — volver al detalle del torneo
    // TODO Sprint 4: ir a patrocinadores antes de volver
    router.replace(`/(protected)/torneos/${tournamentId}`);
  }

  // ─── Render ──────────────────────────────────────────────────────────

  if (loadingData) return (
    <View style={s.loadingContainer}><ActivityIndicator color={color.gold} /></View>
  );

  const fee = selectedCategory?.fee_override ?? tournament?.registration_fee ?? 0;

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
                  setPartnerEmail('');
                }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View style={s.header}>
        <Pressable onPress={() => router.back()} style={s.back}>
          <Text style={s.backText}>← Volver</Text>
        </Pressable>
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
            // Pareja confirmada
            <View style={s.partnerConfirmed}>
              <Avatar name={partnerFound.full_name} size={40} />
              <View style={s.partnerConfirmedTexts}>
                <Text style={s.partnerName}>{partnerFound.full_name}</Text>
                <Text style={s.partnerEmail}>{partnerFound.email}</Text>
              </View>
              <Pressable
                onPress={() => { setPartnerFound(null); setPartnerEmail(''); }}
                style={s.partnerChange}
              >
                <Text style={s.partnerChangeText}>Cambiar</Text>
              </Pressable>
            </View>
          ) : (
            // Buscar pareja
            <View style={s.partnerSearch}>
              <Text style={s.partnerSearchLabel}>
                Escribe el correo con el que tu pareja se registró en RALLY
              </Text>
              <View style={s.partnerInputRow}>
                <TextInput
                  style={s.partnerInput}
                  placeholder="correo@pareja.com"
                  placeholderTextColor={color.muted}
                  value={partnerEmail}
                  onChangeText={text => {
                    setPartnerEmail(text);
                    setPartnerNotFound(false);
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  returnKeyType="search"
                  onSubmitEditing={handleSearchPartner}
                  selectionColor={color.gold}
                />
                <Pressable
                  style={[s.searchBtn, searching && { opacity: 0.6 }]}
                  onPress={handleSearchPartner}
                  disabled={searching}
                >
                  {searching
                    ? <ActivityIndicator color={color.onGold} size="small" />
                    : <Text style={s.searchBtnText}>Buscar</Text>
                  }
                </Pressable>
              </View>

              {partnerNotFound && (
                <View style={s.notFoundBox}>
                  <Text style={s.notFoundText}>
                    No encontramos ese correo en RALLY. Tu pareja debe registrarse primero.
                  </Text>
                  {/* TODO Sprint 3: enviar invitación por Resend */}
                </View>
              )}
            </View>
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
        {selectedCategory && partnerFound && (
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
                <Text style={s.summaryValue}>{partnerFound.full_name}</Text>
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

  header:   { paddingHorizontal: space[4.5], paddingTop: space[3] },
  back:     { marginBottom: space[2] },
  backText: { fontFamily: font.body, fontSize: fontSize.body, color: color.gold },
  eyebrow:  { fontFamily: font.display, fontSize: fontSize.eyebrow, color: color.gold, letterSpacing: 3, marginBottom: space[1] },
  title:    { fontFamily: font.display, fontSize: fontSize.screenH1, color: color.text, marginBottom: space[2] },

  content: { paddingHorizontal: space[4.5], paddingBottom: space[6] * 2, gap: space[3] },

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

  notFoundBox:  { backgroundColor: 'rgba(224,114,111,0.1)', borderRadius: radius.md, padding: space[3], borderWidth: 1, borderColor: 'rgba(224,114,111,0.3)' },
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
