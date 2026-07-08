import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Centralized logging: {@linkcode log} only when not production; {@linkcode warn} / {@linkcode error} always.
 */
@Injectable({ providedIn: 'root' })
export class LoggerService {
  log(message: unknown, ...args: unknown[]): void {
    if (!environment.production) {
      console.log(message, ...args);
    }
  }

  warn(message: unknown, ...args: unknown[]): void {
    console.warn(message, ...args);
  }

  error(message: unknown, ...args: unknown[]): void {
    console.error(message, ...args);
  }
}
