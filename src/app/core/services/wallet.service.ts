import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface WalletSummary {
  availableBalance: number;
  totalEarned?: number;
  totalRevenue?: number;
  currency: string;
}

export interface DriverWalletResponse {
  ok: boolean;
  wallet: WalletSummary;
}

export interface PlatformWalletResponse {
  ok: boolean;
  wallet: WalletSummary;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  private readonly http = inject(HttpClient);

  getDriverWallet(): Observable<DriverWalletResponse> {
    return this.http.get<DriverWalletResponse>('/api/wallet');
  }

  getPlatformWallet(): Observable<PlatformWalletResponse> {
    return this.http.get<PlatformWalletResponse>('/api/admin/wallet');
  }
}
