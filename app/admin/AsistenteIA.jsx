import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '../../utils/apiConfig';

const TOKEN_KEY = 'adminAuthToken';

const getTokenAsync = async () => {
  if (Platform.OS === 'web') {
    try {
      const sessionToken = sessionStorage.getItem(TOKEN_KEY);
      if (sessionToken) return sessionToken;
      const localToken = localStorage.getItem(TOKEN_KEY);
      if (localToken) return localToken;
      return null;
    } catch (e) {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch (e) {
    return null;
  }
};

const QUICK_ACTIONS = [
  { label: 'Crear evento', icon: '➕', action: 'Crear evento' },
  { label: 'Resumen del día', icon: '📋', action: 'Resumen del día' },
  { label: 'Pendientes', icon: '⏳', action: 'Qué tengo pendiente' },
  { label: 'Eventos cercanos', icon: '📅', action: 'Eventos cercanos' },
  { label: 'Sugerencias', icon: '💡', action: 'Sugerencias' },
  { label: 'Ayuda', icon: '❓', action: 'ayuda' },
];

const WELCOME_MESSAGE =
  '¡Hola! Soy tu asistente virtual. Puedo ayudarte con:\n\n' +
  '➕ Crear evento:\n  • "Crear evento" - Registrar un nuevo evento\n\n' +
  '📋 Consultas:\n  • Resumen del día\n  • Qué tengo pendiente\n  • Eventos cercanos\n  • Sugerencias\n\n' +
  '📊 Reportes y Telegram:\n  • Reporte del evento\n  • Enviar resumen/ficha por Telegram\n\n' +
  'Escribe "ayuda" para ver todo.';

const COLORS = {
  primary: '#C44200',
  surface: '#FFFFFF',
  background: '#F6F7F9',
  border: '#E6E9EF',
  textPrimary: '#1F2937',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',
  success: '#047857',
  botBg: '#F3E5F5',
  botBorder: '#9B59B622',
  botText: '#7B1FA2',
};

export default function AsistenteIAScreen() {
  const { eventId } = useLocalSearchParams();
  const router = useRouter();

  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      userId: 0,
      userName: '🤖 Asistente IA',
      message: WELCOME_MESSAGE,
      esBot: true,
      timestamp: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [creandoEvento, setCreandoEvento] = useState(false);
  const [userIdentity, setUserIdentity] = useState({ id: null, name: null });
  const flatListRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await getTokenAsync();
        if (!token) return;
        const res = await fetch(`${API_BASE_URL}/profile`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const u = await res.json();
        setUserIdentity({
          id: String(u.id || u.idusuario || u.user_id || u.iduser || ''),
          name: u.nombre || '',
        });
      } catch (e) {
        console.warn('[AsistenteIA] No se pudo obtener el perfil:', e.message);
      }
    })();
  }, []);

  const scrollToEnd = () => flatListRef.current?.scrollToEnd({ animated: true });

  const handleSend = async (textoOverride) => {
    const texto = (textoOverride || input).trim();
    if (!texto) return;

    const sender = userIdentity.id || 'invitado';

    setMessages((prev) => [
      ...prev,
      {
        id: `user_${Date.now()}`,
        userId: 1,
        userName: userIdentity.name || 'Tú',
        message: texto,
        esBot: false,
        timestamp: new Date().toISOString(),
      },
    ]);

    if (!textoOverride) setInput('');

    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 40000);

    try {
      const response = await fetch(`${API_BASE_URL}/bot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: texto,
          sender,
          eventId: eventId && eventId !== 'null' && eventId !== 'undefined' ? eventId : null,
          history: messages.slice(-6).map((m) => ({
            role: m.esBot ? 'bot' : 'user',
            text: m.message,
          })),
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const data = await response.json();
      const reply = data.reply || 'Lo siento, no entendí. Prueba con "ayuda"';

      setMessages((prev) => [
        ...prev,
        {
          id: `bot_${Date.now()}`,
          userId: 0,
          userName: '🤖 Asistente IA',
          message: reply,
          esBot: true,
          timestamp: new Date().toISOString(),
        },
      ]);

      const creacionTerminada =
        Boolean(data.abrirFormulario) ||
        /(creación cancelada|creado con éxito|te llevaré al formulario|no tienes una creación de evento en curso)/i.test(reply);
      const creacionIniciada = /vamos a crear tu evento/i.test(reply);
      if (creacionTerminada) setCreandoEvento(false);
      else if (creacionIniciada) setCreandoEvento(true);

      if (data.abrirFormulario) {
        setTimeout(() => router.push(data.abrirFormulario), 900);
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[AsistenteIA] Error:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error_${Date.now()}`,
          userId: 0,
          userName: '🤖 Asistente IA',
          message:
            error.name === 'AbortError'
              ? '⏱️ La IA tardó demasiado en responder. Inténtalo de nuevo.'
              : 'Error de conexión. Verifica tu internet e intenta de nuevo.',
          esBot: true,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(scrollToEnd, 100);
    }
  };

  const renderQuickActions = () => (
    <View style={styles.quickActionsWrap}>
      <Text style={styles.quickActionsLabel}>ACCIONES RÁPIDAS</Text>
      <View style={styles.quickActionsRow}>
        {QUICK_ACTIONS.map((qa) => (
          <TouchableOpacity
            key={qa.label}
            onPress={() => handleSend(qa.action)}
            style={styles.quickActionChip}
          >
            <Text style={styles.quickActionChipIcon}>{qa.icon}</Text>
            <Text style={styles.quickActionChipText}>{qa.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );

  const renderMessage = ({ item }) => {
    const isBot = item.esBot || item.userId === 0;
    return (
      <View style={[styles.messageRow, { justifyContent: isBot ? 'flex-start' : 'flex-end' }]}>
        <View style={styles.messageContent}>
          {!isBot && (
            <Text style={[styles.messageUser, styles.messageUserRight]}>
              {item.userName}
            </Text>
          )}
          {isBot && <Text style={styles.messageBotLabel}>{item.userName}</Text>}
          <View
            style={[
              styles.bubble,
              {
                backgroundColor: isBot ? COLORS.botBg : COLORS.primary,
                borderBottomLeftRadius: isBot ? 2 : 16,
                borderBottomRightRadius: isBot ? 16 : 2,
                borderLeftWidth: isBot ? 3 : 0,
                borderLeftColor: isBot ? '#9B59B6' : 'transparent',
              },
            ]}
          >
            <Text style={{ fontSize: 14, color: isBot ? COLORS.textPrimary : '#FFFFFF', lineHeight: 20 }}>
              {item.message}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerAvatar}>
          <Ionicons name="hardware-chip-outline" size={22} color="#FFFFFF" />
        </View>
        <View style={styles.headerInfo}>
          <Text style={styles.headerTitle}>Asistente IA</Text>
          <Text style={styles.headerStatus}>● En línea</Text>
        </View>
      </View>

      {renderQuickActions()}

      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.messageList}
        renderItem={renderMessage}
        initialNumToRender={12}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={Platform.OS === 'android'}
        onContentSizeChange={scrollToEnd}
        ListFooterComponent={
          loading ? (
            <View style={styles.typingRow}>
              <View style={styles.typingAvatar}>
                <Ionicons name="hardware-chip-outline" size={14} color="#9B59B6" />
              </View>
              <Text style={styles.typingText}>Asistente IA está escribiendo...</Text>
            </View>
          ) : null
        }
      />

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder="Escribe tu mensaje..."
            placeholderTextColor={COLORS.textTertiary}
            accessibilityLabel="Escribe un mensaje"
            multiline
            onSubmitEditing={() => handleSend()}
            returnKeyType="send"
            style={styles.input}
          />
          <TouchableOpacity
            onPress={() => handleSend()}
            disabled={!input.trim() || loading}
            style={[
              styles.sendButton,
              { backgroundColor: input.trim() && !loading ? COLORS.primary : COLORS.textTertiary },
            ]}
            accessibilityLabel="Enviar mensaje"
            accessibilityRole="button"
          >
            {loading ? (
              <Ionicons name="ellipsis-horizontal" size={18} color="#FFFFFF" />
            ) : (
              <Ionicons name="send" size={18} color="#FFFFFF" />
            )}
          </TouchableOpacity>
        </View>

        {creandoEvento && (
          <TouchableOpacity
            onPress={() => handleSend('Cancelar')}
            style={styles.cancelButton}
            accessibilityLabel="Cancelar creación de evento"
            accessibilityRole="button"
          >
            <Ionicons name="close-circle-outline" size={16} color="#DC2626" />
            <Text style={styles.cancelButtonText}>Cancelar</Text>
          </TouchableOpacity>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
    backgroundColor: COLORS.surface, borderBottomWidth: 1, borderColor: COLORS.border,
  },
  headerAvatar: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: '#9B59B6', justifyContent: 'center', alignItems: 'center',
  },
  headerInfo: { flex: 1 },
  headerTitle: { fontSize: 16, fontWeight: '700', color: COLORS.textPrimary },
  headerStatus: { fontSize: 12, color: COLORS.success },
  quickActionsWrap: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 2 },
  quickActionsLabel: {
    fontSize: 11, color: COLORS.textTertiary, fontWeight: '600',
    marginBottom: 6, marginLeft: 4,
  },
  quickActionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  quickActionChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: COLORS.botBg, paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.botBorder,
  },
  quickActionChipIcon: { fontSize: 12 },
  quickActionChipText: { fontSize: 11, color: COLORS.botText, fontWeight: '600' },
  messageList: { padding: 16, paddingBottom: 10 },
  messageRow: { flexDirection: 'row', marginVertical: 4 },
  messageContent: { maxWidth: '80%' },
  messageUser: { fontSize: 11, color: COLORS.textSecondary, marginBottom: 2 },
  messageUserRight: { textAlign: 'right' },
  messageBotLabel: {
    fontSize: 11, color: '#9B59B6', fontWeight: '600', marginBottom: 2, marginLeft: 2,
  },
  bubble: {
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: 16,
  },
  typingRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: 6, marginLeft: 2,
  },
  typingAvatar: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: COLORS.botBg, justifyContent: 'center', alignItems: 'center',
  },
  typingText: { fontSize: 11, color: COLORS.textSecondary, fontStyle: 'italic' },
  inputRow: {
    flexDirection: 'row', padding: 12, backgroundColor: COLORS.surface,
    borderTopWidth: 1, borderColor: COLORS.border, gap: 8, alignItems: 'center',
  },
  input: {
    flex: 1, borderWidth: 1, borderColor: COLORS.border, borderRadius: 24,
    paddingHorizontal: 16, paddingVertical: 10, fontSize: 14,
    backgroundColor: COLORS.background, maxHeight: 100,
  },
  sendButton: {
    borderRadius: 24, width: 44, height: 44,
    justifyContent: 'center', alignItems: 'center',
  },
  cancelButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    marginHorizontal: 12, marginBottom: 10,
    backgroundColor: '#FDE8E8', borderRadius: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: '#EF444466',
  },
  cancelButtonText: { fontSize: 13, color: '#DC2626', fontWeight: '700' },
});