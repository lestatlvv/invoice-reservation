import { Injectable } from '@nestjs/common';

@Injectable()
export class KafkaHealthService {
  private connected = false;
  private enabled = false;

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  setConnected(connected: boolean): void {
    this.connected = connected;
  }

  snapshot(): { enabled: boolean; connected: boolean } {
    return { enabled: this.enabled, connected: this.connected };
  }

  isReady(): boolean {
    return !this.enabled || this.connected;
  }
}
