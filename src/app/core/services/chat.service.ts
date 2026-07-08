import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map, of, tap, switchMap } from 'rxjs';
import { httpOptionsSkipGlobalErrorToast } from '../http/http-error-context';
import { normalizeOrderId } from '../../shared/utils/order-utils';
import { SocketService } from './socket.service';

/** Chat uses inline / silent UX; global error toasts would duplicate or spam on poll. */
const CHAT_HTTP = httpOptionsSkipGlobalErrorToast();

const API_URL = '/api/chat';

export interface ChatMessage {
  _id: string;
  /** Populated or raw id */
  senderId?: string | { _id?: string; firstName?: string; lastName?: string };
  receiverId?: string | { _id?: string; firstName?: string; lastName?: string };
  /** Legacy aliases from older clients */
  sender?: string | { _id?: string; firstName?: string; lastName?: string };
  receiver?: string | { _id?: string; firstName?: string; lastName?: string };
  orderId: string;
  text: string;
  timestamp: string;
  /** Same as `isRead`; kept for API compatibility */
  read?: boolean;
  isRead?: boolean;
}

export interface GetChatResponse {
  orderId: string;
  unreadCount: number;
  messages: ChatMessage[];
}

function idOf(
  ref: string | { _id?: string } | null | undefined,
): string {
  if (ref == null) return '';
  if (typeof ref === 'object' && ref !== null) return String(ref._id ?? '');
  return String(ref);
}

@Injectable({ providedIn: 'root' })
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly socket = inject(SocketService);

  /** Per-order unread count (updated by getUnreadCounts, getMessages, and markAsRead). */
  private unreadByOrder = signal<Record<string, number>>({});

  /** While set, badge for this order id stays 0 and poll/refresh must not revive it. */
  private activeChatOrderId = signal<string | null>(null);

  /** Readonly signal for templates: unreadCountByOrder()[orderId] gives the count. */
  readonly unreadCountByOrder = this.unreadByOrder.asReadonly();

  /** Called when chat drawer opens/closes — keeps badges hidden while the user is viewing that thread. */
  setChatDrawerOpenOrderId(orderId: string | null | undefined): void {
    const next = normalizeOrderId(orderId).trim();
    this.activeChatOrderId.set(next || null);
    if (next) {
      this.unreadByOrder.update((prev) => ({ ...prev, [next]: 0 }));
    }
  }

  /**
   * Unread badge count for chips / list buttons. Uses the in-memory map; optional REST fallback until
   * `getUnreadCounts` has run; returns **0** when the drawer is open for this order so the badge never flashes back.
   */
  badgeUnreadForOrder(orderId: string | undefined | null, restFallback?: number): number {
    const id = normalizeOrderId(orderId).trim();
    if (!id) return 0;
    const active = this.activeChatOrderId();
    if (active && normalizeOrderId(active) === id) return 0;
    const fromSvc = this.unreadByOrder()[id];
    if (typeof fromSvc === 'number') return Math.max(0, fromSvc);
    return Math.max(0, Number(restFallback ?? 0));
  }

  /** Unread count for a given order ID (for badge). */
  getUnreadCount(orderId: string): number {
    const id = normalizeOrderId(orderId).trim();
    if (!id) return 0;
    const active = this.activeChatOrderId();
    if (active && normalizeOrderId(active) === id) return 0;
    return this.unreadByOrder()[id] ?? 0;
  }

  constructor() {
    this.socket.onChatMessagesRead(() => {
      void this.getUnreadCounts().subscribe();
    });
  }

  /**
   * PATCH mark-read then GET history so `unreadCount` in the response reflects the server
   * after read (avoids a race where GET completes before PATCH and revives the badge).
   */
  markAsReadThenFetchMessages(orderId: string): Observable<GetChatResponse> {
    const id = normalizeOrderId(orderId).trim();
    if (!id) {
      throw new Error('markAsReadThenFetchMessages: missing orderId');
    }
    return this.markAsRead(id).pipe(switchMap(() => this.getMessages(id)));
  }

  /** Normalize API message into ChatMessage (senderId, timestamp, read flags). */
  normalizeMessage(raw: Record<string, unknown>): ChatMessage {
    const created = (raw['createdAt'] ?? raw['timestamp']) as string | Date | undefined;
    const ts =
      typeof created === 'string'
        ? created
        : created instanceof Date
          ? created.toISOString()
          : new Date(String(created ?? Date.now())).toISOString();
    const sid = raw['senderId'] ?? raw['sender'];
    const rid = raw['receiverId'] ?? raw['receiver'];
    const r = Boolean(raw['isRead'] ?? raw['read']);
    return {
      _id: String(raw['_id'] ?? ''),
      senderId: sid as ChatMessage['senderId'],
      receiverId: rid as ChatMessage['receiverId'],
      sender: sid as ChatMessage['sender'],
      receiver: rid as ChatMessage['receiver'],
      orderId: String(raw['orderId'] ?? ''),
      text: String(raw['text'] ?? ''),
      timestamp: ts,
      read: r,
      isRead: r,
    };
  }

  getMessages(orderId: string): Observable<GetChatResponse> {
    const idNorm = normalizeOrderId(orderId).trim();
    if (!idNorm) {
      throw new Error('getMessages: missing orderId');
    }
    return this.http.get<GetChatResponse>(`${API_URL}/${idNorm}`, CHAT_HTTP).pipe(
      map((res) => ({
        ...res,
        messages: (res.messages ?? []).map((m) => this.normalizeMessage(m as unknown as Record<string, unknown>)),
      })),
      tap((res) => {
        const active = this.activeChatOrderId();
        const nextCount =
          active != null && normalizeOrderId(active) === idNorm ? 0 : (res.unreadCount ?? 0);
        this.unreadByOrder.update((prev) => ({ ...prev, [idNorm]: nextCount }));
      }),
    );
  }

  sendMessage(
    orderId: string,
    receiverId: string,
    text: string,
  ): Observable<{ message: string; data: ChatMessage }> {
    return this.http
      .post<{ message: string; data: Record<string, unknown> }>(
        `${API_URL}/send`,
        {
          orderId,
          receiverId,
          text: text.trim(),
        },
        CHAT_HTTP,
      )
      .pipe(
        map((res) => ({
          message: res.message,
          data: this.normalizeMessage(res.data ?? {}),
        })),
      );
  }

  /** Fetch unread counts for all orders (for badges). */
  getUnreadCounts(): Observable<{ counts: Record<string, number> }> {
    return this.http.get<{ counts: Record<string, number> }>(`${API_URL}/unread-counts`, CHAT_HTTP).pipe(
      tap((res) => {
        const next = { ...(res.counts ?? {}) };
        const activeRaw = this.activeChatOrderId();
        const active = normalizeOrderId(activeRaw).trim();
        if (active) next[active] = 0;
        this.unreadByOrder.update(() => next);
      }),
    );
  }

  /**
   * Mark all chat messages read for `orderId` (PATCH). Zeros badge immediately, notifies via socket for other party,
   * then persists on the server. Same as {@link markAsRead} plus `mark_messages_read` emit.
   */
  markMessagesAsRead(orderId: string): Observable<{ orderId: string; modifiedCount?: number } | null> {
    const id = normalizeOrderId(orderId).trim();
    if (!id) return of(null);
    this.socket.emitMarkMessagesRead(id);
    return this.markAsRead(id);
  }

  /** Mark all messages in an order as read for the current user; clears badge immediately. */
  markAsRead(orderId: string): Observable<{ orderId: string; modifiedCount?: number }> {
    const id = normalizeOrderId(orderId).trim();
    if (!id) {
      throw new Error('markAsRead: missing orderId');
    }
    this.unreadByOrder.update((prev) => ({ ...prev, [id]: 0 }));
    return this.http
      .patch<{ orderId: string; modifiedCount?: number }>(
        `${API_URL}/mark-read/${id}`,
        {},
        CHAT_HTTP,
      )
      .pipe(
        tap(() => {
          this.unreadByOrder.update((prev) => ({ ...prev, [id]: 0 }));
        }),
      );
  }
}

export { idOf };
