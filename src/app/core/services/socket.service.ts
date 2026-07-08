import { Injectable, inject, signal, OnDestroy } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AuthStore } from '../../store/auth.store';
import type { TransportOrder } from './orders.service';

export type ChatMessagesReadPayload = { orderId: string; readByUserId: string };

/** Server `customer_location_update` payload (driver live position). */
export type CustomerLocationPayload = {
  lat: number;
  lng: number;
  /** Degrees clockwise from north (0–360), when driver device provides it. */
  heading?: number;
};

@Injectable({ providedIn: 'root' })
export class SocketService implements OnDestroy {
  private socket: Socket | null = null;
  /** When set, each `connect` re-emits `join_order_tracking` so the room is re-joined after reconnect. */
  private pendingOrderTrackingJoinId: string | null = null;
  private orderUpdated = signal<TransportOrder | null>(null);
  private orderCompleted = signal<TransportOrder | null>(null);
  /** Incremented on each `new_order_available` socket event (driver available-jobs refresh). */
  private newOrderAvailableTick = signal(0);

  /** For live-tracking UI: show Connecting… / Driver offline when socket drops. */
  readonly socketConnectionState = signal<'connecting' | 'connected' | 'disconnected'>('disconnected');

  readonly onOrderUpdated = this.orderUpdated.asReadonly();
  readonly onOrderCompleted = this.orderCompleted.asReadonly();
  readonly onNewOrderAvailableTick = this.newOrderAvailableTick.asReadonly();

  private readonly authStore = inject(AuthStore);

  connect(): void {
    const token = this.authStore.token();
    if (!token) return;
    if (this.socket?.connected) {
      this.socketConnectionState.set('connected');
      return;
    }
    if (this.socket && !this.socket.connected) {
      this.socketConnectionState.set('connecting');
      this.socket.connect();
      return;
    }
    this.socketConnectionState.set('connecting');
    this.socket = io(window.location.origin, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      auth: { token },
    });
    this.attachSocketLifecycle(this.socket);
    this.attachOrderTrackingReconnect(this.socket);
    this.socket.on('order_updated', (order: TransportOrder) => {
      this.orderUpdated.set(order);
    });
    /** Server also emits `start_delivery` (same payload) when status → in-transit; web UI refreshes via `order_updated`. */
    this.socket.on('order_completed', (order: TransportOrder) => {
      this.orderCompleted.set(order);
    });
    this.socket.on('new_order_available', () => {
      this.newOrderAvailableTick.update((n) => n + 1);
    });
    this.attachChatReadListener();
  }

  private attachSocketLifecycle(s: Socket): void {
    const tagged = s as Socket & { _mmLifecycle?: boolean };
    if (tagged._mmLifecycle) return;
    tagged._mmLifecycle = true;
    s.on('connect', () => this.socketConnectionState.set('connected'));
    s.on('disconnect', () => this.socketConnectionState.set('disconnected'));
    s.io.on('reconnect_attempt', () => this.socketConnectionState.set('connecting'));
  }

  /** Re-join driver-tracking room whenever this socket reconnects (rooms are connection-scoped on the server). */
  private attachOrderTrackingReconnect(s: Socket): void {
    const tagged = s as Socket & { _mmOrderTrackingReconnect?: boolean };
    if (tagged._mmOrderTrackingReconnect) return;
    tagged._mmOrderTrackingReconnect = true;
    s.on('connect', () => {
      const oid = this.pendingOrderTrackingJoinId?.trim();
      if (oid) {
        s.emit('join_order_tracking', { orderId: oid });
      }
    });
  }

  private attachChatReadListener(): void {
    const s = this.socket;
    if (!s || (s as unknown as { _chatReadAttached?: boolean })._chatReadAttached) return;
    (s as unknown as { _chatReadAttached?: boolean })._chatReadAttached = true;
    s.on('chat_messages_read', (payload: ChatMessagesReadPayload) => {
      for (const fn of this.chatReadCallbacks) {
        try {
          fn(payload);
        } catch {
          /* ignore */
        }
      }
    });
  }

  private chatReadCallbacks = new Set<(payload: ChatMessagesReadPayload) => void>();

  /** Subscribe to read receipts (receiver marked messages read). Returns unsubscribe. */
  onChatMessagesRead(handler: (payload: ChatMessagesReadPayload) => void): () => void {
    this.connect();
    this.attachChatReadListener();
    this.chatReadCallbacks.add(handler);
    return () => this.chatReadCallbacks.delete(handler);
  }

  /** Tell the server this user has the chat UI open for this order (suppresses chat FCM for this recipient). */
  emitViewingChat(orderId: string): void {
    if (typeof window === 'undefined') return;
    const oid = String(orderId || '').trim();
    if (!oid) return;
    this.connect();
    const s = this.socket;
    if (!s) return;
    const payload = { orderId: oid };
    if (s.connected) {
      s.emit('viewing_chat', payload);
    } else {
      s.once('connect', () => s.emit('viewing_chat', payload));
    }
  }

  /** Mark messages read for this order (same as PATCH /api/chat/mark-read/:orderId). */
  emitMarkMessagesRead(orderId: string): void {
    if (typeof window === 'undefined') return;
    const oid = String(orderId || '').trim();
    if (!oid) return;
    this.connect();
    const s = this.socket;
    if (!s) return;
    const payload = { orderId: oid };
    if (s.connected) {
      s.emit('mark_messages_read', payload);
    } else {
      s.once('connect', () => s.emit('mark_messages_read', payload));
    }
  }

  /**
   * Driver emits `driver_location_update`; server validates and emits **`customer_location_update`**
   * only to Socket.io room `order:<orderId>` (no global broadcast).
   */
  emitDriverLocation(data: { orderId: string; lat: number; lng: number; heading?: number | null }): void {
    if (typeof window === 'undefined') return;
    const orderId = String(data.orderId ?? '').trim();
    const lat = Number(data.lat);
    const lng = Number(data.lng);
    if (!orderId || !Number.isFinite(lat) || !Number.isFinite(lng)) return;
    this.connect();
    const s = this.socket;
    if (!s) return;
    const heading = data.heading != null && Number.isFinite(Number(data.heading)) ? Number(data.heading) : undefined;
    const payload: { orderId: string; lat: number; lng: number; heading?: number } = { orderId, lat, lng };
    if (heading != null && heading >= 0 && heading <= 360) {
      payload.heading = heading;
    }
    if (s.connected) {
      s.emit('driver_location_update', payload);
    } else {
      s.once('connect', () => s.emit('driver_location_update', payload));
    }
  }

  /** Customer leaves room `order:<id>` (pair with {@link emitJoinOrderTracking}). */
  emitLeaveOrderTracking(orderId: string): void {
    if (typeof window === 'undefined') return;
    const oid = String(orderId || '').trim();
    if (!oid) return;
    if (this.pendingOrderTrackingJoinId === oid) {
      this.pendingOrderTrackingJoinId = null;
    }
    const s = this.socket;
    if (!s?.connected) return;
    s.emit('leave_order_tracking', { orderId: oid });
  }

  /** Customer joins Socket.io room `order:<id>` to receive `customer_location_update`. */
  emitJoinOrderTracking(orderId: string): void {
    if (typeof window === 'undefined') return;
    const oid = String(orderId || '').trim();
    if (!oid) return;
    this.pendingOrderTrackingJoinId = oid;
    this.connect();
    const s = this.socket;
    if (!s) return;
    const payload = { orderId: oid };
    if (s.connected) {
      s.emit('join_order_tracking', payload);
    } else {
      s.once('connect', () => s.emit('join_order_tracking', payload));
    }
  }

  /**
   * Subscribe to live driver coordinates for the current order room.
   * Call after {@link emitJoinOrderTracking}. Returns unsubscribe (call on destroy).
   */
  listenToLocationUpdates(handler: (payload: CustomerLocationPayload) => void): () => void {
    this.connect();
    const s = this.socket;
    if (!s) return () => {};
    const fn = (payload: CustomerLocationPayload) => {
      const lat = Number(payload?.lat);
      const lng = Number(payload?.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      const heading = Number(payload?.heading);
      const out: CustomerLocationPayload = { lat, lng };
      if (Number.isFinite(heading) && heading >= 0 && heading <= 360) {
        out.heading = heading;
      }
      handler(out);
    };
    s.on('customer_location_update', fn);
    return () => {
      s.off('customer_location_update', fn);
    };
  }

  /**
   * Subscribe to server event **`customer_location_update`** `{ lat, lng }` (after joining the room via
   * {@link emitJoinOrderTracking}). Alias of {@link listenToLocationUpdates}.
   */
  onCustomerLocationUpdate(handler: (payload: CustomerLocationPayload) => void): () => void {
    return this.listenToLocationUpdates(handler);
  }

  emitLeftChat(orderId: string): void {
    if (typeof window === 'undefined') return;
    const oid = String(orderId || '').trim();
    if (!oid) return;
    const s = this.socket;
    if (!s?.connected) return;
    s.emit('left_chat', { orderId: oid });
  }

  disconnect(): void {
    this.socketConnectionState.set('disconnected');
    this.pendingOrderTrackingJoinId = null;
    this.socket?.disconnect();
    this.socket = null;
    this.orderUpdated.set(null);
    this.orderCompleted.set(null);
  }

  /** Disconnect and connect so the server re-runs joinUserSocketRooms (e.g. after working districts change). */
  refreshConnection(): void {
    const token = this.authStore.token();
    if (!token) return;
    this.disconnect();
    this.connect();
  }

  clearOrderUpdate(): void {
    this.orderUpdated.set(null);
  }

  clearOrderCompleted(): void {
    this.orderCompleted.set(null);
  }

  ngOnDestroy(): void {
    this.disconnect();
  }

  /** Subscribe to admin-only verification events; returns unsubscribe. */
  onNewVerificationRequest(handler: (payload: Record<string, unknown>) => void): () => void {
    this.connect();
    if (!this.socket) return () => {};
    const fn = (payload: Record<string, unknown>) => handler(payload);
    this.socket.on('new_verification_request', fn);
    this.socket.on('admin_new_registration', fn);
    return () => {
      this.socket?.off('new_verification_request', fn);
      this.socket?.off('admin_new_registration', fn);
    };
  }
}
