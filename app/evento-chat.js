// app/evento-chat.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, KeyboardAvoidingView, Platform,
  StyleSheet, SafeAreaView, ActivityIndicator, Modal
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { io } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';

const BACKEND_URL = process.env.EXPO_PUBLIC_API_URL || 'https://unibackend-production-9618.up.railway.app';
//const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'https://unibackend-production-9618.up.railway.app';
const ROL_CONFIG = {
  admin:     { color: '#FF6B35', label: 'Admin',     icono: 'A' },
  creador:   { color: '#007AFF', label: 'Creador',   icono: 'C' },
  logistica: { color: '#34C759', label: 'LogÃ­stica', icono: 'L' },
};

export default function EventoChatScreen() {
  const { eventoId, userId, userRole, userName, eventoNombre } = useLocalSearchParams();

  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState('');
  const [connected, setConnected]   = useState(false);
  const [connecting, setConnecting] = useState(true);
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [showUsersModal, setShowUsersModal] = useState(false);
  // Identidad que confirma el servidor al autenticar. Los parÃ¡metros de la ruta
  // no son confiables, asÃ­ que "es mÃ­o" se decide contra esto.
  const [miId, setMiId] = useState(null);
  const idPropio = miId != null ? miId : userId;

  const socketRef   = useRef(null);
  const flatListRef = useRef(null);

  useEffect(() => {
    let socket;
    let isMounted = true;

    const conectar = async () => {
      // El servidor exige JWT en el handshake: la identidad del chat sale del
      // token, no de los parÃ¡metros userId/userRole/userName de la ruta.
      let token;
      try {
        token = Platform.OS === 'web'
          ? sessionStorage.getItem('adminAuthToken')
          : await SecureStore.getItemAsync('adminAuthToken');
      } catch (e) {
        token = null;
      }

      if (!token) {
        console.warn('evento-chat: sin token de sesiÃ³n');
        if (isMounted) { setConnected(false); setConnecting(false); }
        return;
      }

      socket = io(BACKEND_URL, { auth: { token }, transports: ['websocket'] });
      socketRef.current = socket;

      socket.on('connect', () => {
        if (!isMounted) return;
        setConnected(true);
        setConnecting(false);
        socket.emit('join_event', { eventoId: String(eventoId) });
      });

      socket.on('connect_error', (err) => {
        if (!isMounted) return;
        setConnected(false);
        setConnecting(false);
        console.warn('evento-chat: error de conexiÃ³n', err?.message);
      });

      socket.on('disconnect', () => { if (isMounted) setConnected(false); });

      socket.on('personal_channel', (p) => {
        if (isMounted && p?.userId != null) setMiId(p.userId);
      });

      socket.on('history', (historial) => {
        if (!isMounted) return;
        setMessages((historial || []).map((m, i) => ({ ...m, id: `h_${i}` })));
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 120);
      });

      socket.on('receive_message', (msg) => {
        if (!isMounted) return;
        setMessages(prev => [...prev, { ...msg, id: `m_${Date.now()}_${Math.random()}` }]);
        setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 120);
      });

      socket.on('user_joined', ({ userName: nombre, role }) => {
        if (!isMounted) return;
        setMessages(prev => [...prev, {
          id: `sys_${Date.now()}`,
          system: true,
          text: `${nombre || 'Un usuario'} (${ROL_CONFIG[role]?.label || role}) se uniÃ³`
        }]);
      });

      // âœ… NUEVO: Escuchar cuando alguien sale
      socket.on('user_left', ({ userName: nombre, role }) => {
        if (!isMounted) return;
        setMessages(prev => [...prev, {
          id: `sys_${Date.now()}`,
          system: true,
          text: `${nombre || 'Un usuario'} (${ROL_CONFIG[role]?.label || role}) saliÃ³`
        }]);
      });

      // âœ… NUEVO: Escuchar la lista de usuarios conectados
      socket.on('user_list', (users) => {
        console.log('ðŸ‘¥ Usuarios conectados:', users);
        if (isMounted) setConnectedUsers(users || []);
      });
    };

    conectar();

    return () => {
      isMounted = false;
      if (socket) {
        socket.emit('leave_event', { eventoId: String(eventoId) });
        socket.disconnect();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventoId]);

  const handleSend = () => {
    const texto = input.trim();
    if (!texto || !socketRef.current?.connected) return;
    socketRef.current.emit('send_message', {
      eventoId: String(eventoId), message: texto
    });
    setInput('');
  };

  const renderMessage = ({ item }) => {
    if (item.system) {
      return (
        <View style={styles.systemRow}>
          <Text style={styles.systemText}>{item.text}</Text>
        </View>
      );
    }

    const isMe   = String(item.userId) === String(idPropio);
    const rolCfg = ROL_CONFIG[item.role] || { color: '#888', label: item.role, icono: '?' };
    const hora   = item.timestamp
      ? new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '';

    return (
      <View style={[styles.row, isMe ? styles.rowMe : styles.rowOther]}>
        {!isMe && (
          <View style={[styles.avatar, { backgroundColor: rolCfg.color + '22' }]}>
            <Text style={[styles.avatarText, { color: rolCfg.color }]}>{rolCfg.icono}</Text>
          </View>
        )}
        <View style={styles.bubbleCol}>
          {!isMe && (
            <Text style={[styles.senderName, { color: rolCfg.color }]}>
              {item.userName || `Usuario ${item.userId}`}
              <Text style={styles.roleBadge}> Â· {rolCfg.label}</Text>
            </Text>
          )}
          <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleOther]}>
            <Text style={[styles.bubbleText, isMe && styles.bubbleTextMe]}>
              {item.message}
            </Text>
            <Text style={[styles.hora, isMe && styles.horaMe]}>{hora}</Text>
          </View>
        </View>
      </View>
    );
  };

  if (connecting) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.connectingText}>Conectando al chat...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.backText}>â†</Text>
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {eventoNombre || `Evento #${eventoId}`}
          </Text>
          <View style={styles.headerStatus}>
            <View style={[styles.statusDot, { backgroundColor: connected ? '#34C759' : '#FF3B30' }]} />
            <Text style={styles.statusText}>{connected ? 'En lÃ­nea' : 'Sin conexiÃ³n'}</Text>
          </View>
        </View>

        {/* âœ… NUEVO: BotÃ³n de usuarios conectados */}
        <TouchableOpacity 
          style={styles.usersBtn}
          onPress={() => setShowUsersModal(true)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.usersBtnIcon}>ðŸ‘¥</Text>
          {connectedUsers.length > 0 && (
            <View style={styles.usersBadge}>
              <Text style={styles.usersBadgeText}>{connectedUsers.length}</Text>
            </View>
          )}
        </TouchableOpacity>

        <View style={[styles.rolChip, { backgroundColor: (ROL_CONFIG[userRole]?.color || '#888') + '22' }]}>
          <Text style={[styles.rolChipText, { color: ROL_CONFIG[userRole]?.color || '#888' }]}>
            {ROL_CONFIG[userRole]?.label || userRole}
          </Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={item => item.id}
          renderItem={renderMessage}
          contentContainerStyle={styles.listContent}
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          removeClippedSubviews={Platform.OS === 'android'}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>AÃºn no hay mensajes.{'\n'}Â¡SÃ© el primero en escribir!</Text>
            </View>
          }
        />

        <View style={styles.inputRow}>
          <TextInput
            value={input}
            onChangeText={setInput}
            placeholder={connected ? 'Escribe un mensaje...' : 'Sin conexiÃ³n...'}
            placeholderTextColor="#999"
            accessibilityLabel="Escribe un mensaje"
            style={styles.input}
            multiline
            editable={connected}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || !connected}
            style={[styles.sendBtn, (!input.trim() || !connected) && styles.sendBtnDisabled]}
          >
            <Text style={styles.sendBtnText}>Enviar</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* âœ… NUEVO: Modal de usuarios conectados */}
      <Modal
        visible={showUsersModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowUsersModal(false)}
        accessibilityViewIsModal={true}
      >
        <TouchableOpacity 
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowUsersModal(false)}
        >
          <TouchableOpacity 
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={styles.modalContent}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                Usuarios Conectados ({connectedUsers.length})
              </Text>
              <TouchableOpacity onPress={() => setShowUsersModal(false)} accessibilityLabel="Cerrar" accessibilityRole="button" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Text style={styles.modalCloseBtn}>âœ•</Text>
              </TouchableOpacity>
            </View>
            
            <FlatList
              data={connectedUsers}
              keyExtractor={(item) => String(item.userId)}
              initialNumToRender={8}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={Platform.OS === 'android'}
              renderItem={({ item }) => {
                const rolCfg = ROL_CONFIG[item.role] || { color: '#888', label: item.role, icono: '?' };
                const isMe = String(item.userId) === String(idPropio);
                
                return (
                  <View style={styles.userRow}>
                    <View style={[styles.userAvatar, { backgroundColor: rolCfg.color + '22' }]}>
                      <Text style={[styles.userAvatarText, { color: rolCfg.color }]}>
                        {rolCfg.icono}
                      </Text>
                    </View>
                    <View style={styles.userInfo}>
                      <Text style={styles.userName}>
                        {item.userName || `Usuario ${item.userId}`}
                        {isMe && <Text style={styles.youBadge}> (TÃº)</Text>}
                      </Text>
                      <View style={styles.userRoleContainer}>
                        <View style={[styles.userRoleDot, { backgroundColor: rolCfg.color }]} />
                        <Text style={[styles.userRoleText, { color: rolCfg.color }]}>
                          {rolCfg.label}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.onlineIndicator}>
                      <View style={styles.onlineDot} />
                      <Text style={styles.onlineText}>En lÃ­nea</Text>
                    </View>
                  </View>
                );
              }}
              ListEmptyComponent={
                <View style={styles.emptyUsersBox}>
                  <Text style={styles.emptyUsersText}>No hay usuarios conectados</Text>
                </View>
              }
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F5F5F5' },
  centered:       { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  connectingText: { fontSize: 14, color: '#666' },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 12,
    backgroundColor: '#FFF',
    borderBottomWidth: 1, borderBottomColor: '#E8E8E8', gap: 8
  },
  backBtn:      { padding: 10 },
  backText:     { fontSize: 22, color: '#007AFF' },
  headerCenter: { flex: 1 },
  headerTitle:  { fontSize: 15, fontWeight: '600', color: '#1A1A1A' },
  headerStatus: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  statusDot:    { width: 7, height: 7, borderRadius: 4 },
  statusText:   { fontSize: 11, color: '#888' },
  
  // âœ… NUEVOS ESTILOS: BotÃ³n de usuarios
  usersBtn: {
    position: 'relative',
    padding: 14,
    marginRight: 4,
  },
  usersBtnIcon: { fontSize: 20 },
  usersBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#FF3B30',
    borderRadius: 10,
    minWidth: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  usersBadgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '700',
  },
  
  rolChip:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  rolChipText:  { fontSize: 12, fontWeight: '600' },
  listContent:  { padding: 16, paddingBottom: 8 },
  emptyBox:     { alignItems: 'center', paddingTop: 60 },
  emptyText:    { fontSize: 14, color: '#AAA', textAlign: 'center', lineHeight: 22 },
  systemRow:    { alignItems: 'center', marginVertical: 10 },
  systemText:   { fontSize: 12, color: '#BBB', fontStyle: 'italic' },
  row:          { flexDirection: 'row', marginVertical: 4, alignItems: 'flex-end' },
  rowMe:        { justifyContent: 'flex-end' },
  rowOther:     { justifyContent: 'flex-start' },
  avatar:       { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 8 },
  avatarText:   { fontSize: 13, fontWeight: '700' },
  bubbleCol:    { maxWidth: '75%' },
  senderName:   { fontSize: 12, fontWeight: '600', marginBottom: 3, marginLeft: 4 },
  roleBadge:    { fontWeight: '400', color: '#AAA' },
  bubble:       { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
  bubbleMe:     { backgroundColor: '#007AFF', borderBottomRightRadius: 4 },
  bubbleOther:  { backgroundColor: '#FFF', borderBottomLeftRadius: 4, shadowColor: '#000',
                  shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.07, shadowRadius: 2, elevation: 1 },
  bubbleText:   { fontSize: 15, lineHeight: 21, color: '#1A1A1A' },
  bubbleTextMe: { color: '#FFF' },
  hora:         { fontSize: 11, color: '#AAA', marginTop: 4, textAlign: 'right' },
  horaMe:       { color: 'rgba(255,255,255,0.65)' },
  inputRow:     { flexDirection: 'row', alignItems: 'flex-end', padding: 12, gap: 8,
                  backgroundColor: '#FFF', borderTopWidth: 1, borderTopColor: '#E8E8E8' },
  input:        { flex: 1, borderWidth: 1, borderColor: '#DDD', borderRadius: 22,
                  paddingHorizontal: 16, paddingVertical: 10, fontSize: 15, color: '#1A1A1A',
                  maxHeight: 100, backgroundColor: '#F9F9F9' },
  sendBtn:         { backgroundColor: '#007AFF', borderRadius: 22, paddingHorizontal: 18, paddingVertical: 10 },
  sendBtnDisabled: { backgroundColor: '#B0C4DE' },
  sendBtnText:     { color: '#FFF', fontWeight: '600', fontSize: 15 },
  
  // âœ… NUEVOS ESTILOS: Modal de usuarios
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '70%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E8E8E8',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1A1A1A',
  },
  modalCloseBtn: {
    fontSize: 24,
    color: '#999',
    padding: 4,
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  userAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  userAvatarText: {
    fontSize: 16,
    fontWeight: '700',
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A1A1A',
    marginBottom: 4,
  },
  youBadge: {
    fontSize: 13,
    color: '#888',
    fontWeight: '400',
  },
  userRoleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  userRoleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  userRoleText: {
    fontSize: 13,
    fontWeight: '600',
  },
  onlineIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34C759',
  },
  onlineText: {
    fontSize: 11,
    color: '#34C759',
    fontWeight: '600',
  },
  emptyUsersBox: {
    padding: 40,
    alignItems: 'center',
  },
  emptyUsersText: {
    fontSize: 14,
    color: '#AAA',
    textAlign: 'center',
  },
});