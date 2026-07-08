import {
  Component,
  input,
  output,
  signal,
  effect,
  inject,
  OnDestroy,
  ViewChild,
  ElementRef,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe, NgClass } from '@angular/common';
import { finalize } from 'rxjs';
import { LucideAngularModule } from 'lucide-angular';
import { UiButtonComponent } from '@/components/ui/button';
import { UiInputDirective } from '@/components/ui/input';
import { ChatService, ChatMessage, idOf } from '../../../core/services/chat.service';
import { SocketService } from '../../../core/services/socket.service';
import { normalizeOrderId } from '../../../shared/utils/order-utils';
import type { TransportOrder } from '../../../core/services/orders.service';

const POLL_INTERVAL_MS = 5000;

@Component({
  selector: 'app-chat-window',
  standalone: true,
  imports: [FormsModule, DatePipe, NgClass, LucideAngularModule, UiInputDirective, UiButtonComponent],
  templateUrl: './chat-window.component.html',
  styleUrl: './chat-window.component.css',
  host: {
    class: 'block min-h-0 w-full flex flex-col min-w-0',
    '[class.flex-1]': 'fillParent()',
    '[class.h-full]': 'fillParent()',
  },
})
export class ChatWindowComponent implements OnDestroy {
  order = input.required<TransportOrder>();
  currentUserId = input.required<string>();
  /** When true (e.g. inside right drawer), expands to fill parent height. */
  fillParent = input(false);

  /** Emitted when user closes chat (× or delegated from drawer). Parent/drawer may animate before destroying. */
  closeDrawer = output<void>();

  @ViewChild('messagesEnd') messagesEndRef?: ElementRef<HTMLDivElement>;
  @ViewChild('messageInput') messageInputRef?: ElementRef<HTMLInputElement>;

  private chatService = inject(ChatService);
  private socketService = inject(SocketService);

  messages = signal<ChatMessage[]>([]);
  newText = signal('');
  sending = signal(false);
  error = signal('');
  /** True when the message input has focus (user is typing); used to mark as read on poll. */
  inputFocused = signal(false);
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private unsubscribeChatRead?: () => void;

  constructor() {
    this.unsubscribeChatRead = this.socketService.onChatMessagesRead((payload) => {
      const o = this.order();
      const oid = o?._id != null ? normalizeOrderId(o._id) : '';
      if (!oid || payload.orderId !== oid) return;
      this.applyReadReceipt(payload.readByUserId);
    });

    effect(() => {
      const list = this.messages();
      untracked(() => {
        if (list.length) setTimeout(() => this.scrollToBottom(), 0);
      });
    });

    effect(() => {
      const o = this.order();
      if (o?._id) {
        const id = normalizeOrderId(o._id);
        if (!id) return;
        this.socketService.connect();
        this.socketService.emitViewingChat(id);
        this.socketService.emitMarkMessagesRead(id);

        this.chatService.markAsReadThenFetchMessages(id).subscribe({
          next: (res) => {
            if (normalizeOrderId(this.order()._id) !== id) return;
            this.messages.set(res.messages ?? []);
            this.scrollToBottom();
            this.chatService.getUnreadCounts().subscribe();
            this.startPollingAfterOpen();
            this.focusMessageInputDebounced();
          },
          error: () => {
            if (normalizeOrderId(this.order()._id) !== id) return;
            this.messages.set([]);
            this.loadMessages();
            this.startPollingAfterOpen();
          },
        });
      }
      return () => {
        this.stopPolling();
        if (o?._id) {
          this.socketService.emitLeftChat(normalizeOrderId(o._id));
        }
      };
    });
  }

  ngOnDestroy(): void {
    this.unsubscribeChatRead?.();
    this.stopPolling();
  }

  get otherPartyName(): string {
    const o = this.order();
    const uid = this.currentUserId();
    if (!o) return '';
    const cust = o.customerId && typeof o.customerId === 'object' ? o.customerId : null;
    const driver = o.driverId && typeof o.driverId === 'object' ? o.driverId : null;
    if (cust && String((cust as { _id?: string })._id) !== uid) return (cust as { name?: string }).name ?? 'Customer';
    if (driver && String((driver as { _id?: string })._id) !== uid) return (driver as { name?: string }).name ?? 'Driver';
    return 'Other';
  }

  get receiverId(): string {
    const o = this.order();
    const uid = this.currentUserId();
    if (!o) return '';
    const custId = custIdFromOrder(o);
    const driverId = driverIdFromOrder(o);
    if (custId !== uid) return custId;
    if (driverId) return driverId;
    return '';
  }

  loadMessages(): void {
    const o = this.order();
    if (!o?._id) return;
    const id = normalizeOrderId(o._id);
    if (!id) return;
    this.chatService.getMessages(id).subscribe({
      next: (res) => {
        this.messages.set(res.messages ?? []);
        this.scrollToBottom();
        const unread = res.unreadCount ?? 0;
        if (unread > 0 && this.inputFocused()) {
          this.socketService.emitMarkMessagesRead(id);
          this.chatService.markAsRead(id).subscribe(() => this.chatService.getUnreadCounts().subscribe());
        }
      },
      error: () => this.messages.set([]),
    });
  }

  onInputFocus(): void {
    this.inputFocused.set(true);
    const o = this.order();
    if (!o?._id) return;
    const id = normalizeOrderId(o._id);
    if (!id) return;
    if (this.chatService.getUnreadCount(id) > 0) {
      this.socketService.emitMarkMessagesRead(id);
      this.chatService.markAsRead(id).subscribe(() => this.chatService.getUnreadCounts().subscribe());
    }
  }

  onInputBlur(): void {
    this.inputFocused.set(false);
  }

  private startPollingAfterOpen(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => this.loadMessages(), POLL_INTERVAL_MS);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /** Focus composer after drawer animation + initial HTTP round-trip. */
  private focusMessageInputDebounced(): void {
    const delay = this.fillParent() ? 340 : 0;
    setTimeout(() => this.messageInputRef?.nativeElement?.focus(), delay);
  }

  sendMessage(): void {
    const o = this.order();
    const status = o?.status ?? '';
    if (status === 'completed' || status === 'cancelled') return;

    const text = this.newText().trim();
    const orderId = o?._id != null ? normalizeOrderId(o._id) : '';
    const senderId = String(this.currentUserId() ?? '').trim();
    const receiverId = this.receiverId;

    if (!text || !orderId || !senderId || !receiverId) {
      if (!senderId) this.error.set('You must be signed in to send messages.');
      else if (!receiverId) this.error.set('Cannot send: the other party is not available on this order yet.');
      else this.error.set('');
      return;
    }

    this.sending.set(true);
    this.error.set('');
    this.chatService
      .sendMessage(orderId, receiverId, text)
      .pipe(finalize(() => this.sending.set(false)))
      .subscribe({
        next: (res) => {
          this.messages.update((list) => [...list, res.data]);
          this.newText.set('');
          this.scrollToBottom();
          this.chatService.getUnreadCounts().subscribe();
        },
        error: (err) => this.error.set(err?.error?.message ?? 'Failed to send'),
      });
  }

  close(): void {
    this.closeDrawer.emit();
  }

  isMe(msg: ChatMessage): boolean {
    return idOf(msg.senderId ?? msg.sender) === String(this.currentUserId());
  }

  /** True when the other party has read this message (double tick). */
  messageIsRead(msg: ChatMessage): boolean {
    return Boolean(msg.isRead ?? msg.read);
  }

  /** Receiver opened chat — messages I sent to them are now read (double ticks). */
  private applyReadReceipt(readByUserId: string): void {
    const rid = String(readByUserId);
    this.messages.update((list) =>
      list.map((msg) => {
        if (!this.isMe(msg)) return msg;
        const recv = idOf(msg.receiverId ?? msg.receiver);
        if (recv === rid) {
          return { ...msg, read: true, isRead: true };
        }
        return msg;
      }),
    );
  }

  private scrollToBottom(): void {
    setTimeout(() => this.messagesEndRef?.nativeElement?.scrollIntoView({ behavior: 'smooth', block: 'end' }), 50);
  }
}

function custIdFromOrder(o: TransportOrder): string {
  const c = o.customerId;
  return c && typeof c === 'object' ? String(c._id ?? '') : String(c ?? '');
}
function driverIdFromOrder(o: TransportOrder): string {
  const d = o.driverId;
  return d && typeof d === 'object' ? String(d._id ?? '') : String(d ?? '');
}
