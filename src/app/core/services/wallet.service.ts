import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface WalletSummary {
  availableBalance: number;
  totalEarned?: number;
  totalRevenue?: number;
  totalWithdrawn: number;
  currency: string;
}

export interface PayoutRecord {
  _id: string;
  amount: number;
  currency: string;
  status: string;
  note?: string;
  createdAt: string;
  completedAt?: string;
}

export interface DriverWalletResponse {
  ok: boolean;
  wallet: WalletSummary;
  recentPayouts: PayoutRecord[];
}

export interface PlatformWalletResponse {
  ok: boolean;
  wallet: WalletSummary;
  recentPayouts: PayoutRecord[];
}

export interface WithdrawResponse {
  ok: boolean;
  payout: PayoutRecord;
  wallet: WalletSummary;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly http = inject(HttpClient);

  getDriverWallet(): Observable<DriverWalletResponse> {
    return this.http.get<DriverWalletResponse>('/api/wallet');
  }

  withdrawDriverFunds(amount: number, note?: string): Observable<WithdrawResponse> {
    return this.http.post<WithdrawResponse>('/api/wallet/withdraw', { amount, note });
  }

  getPlatformWallet(): Observable<PlatformWalletResponse> {
    return this.http.get<PlatformWalletResponse>('/api/admin/wallet');
  }

  withdrawPlatformFunds(amount: number, note?: string): Observable<WithdrawResponse> {
    return this.http.post<WithdrawResponse>('/api/admin/wallet/withdraw', { amount, note });
  }
}
