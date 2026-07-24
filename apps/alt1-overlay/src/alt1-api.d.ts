export {};

declare global {
  interface Window {
    alt1?: {
      version: string;
      versionint: number;
      captureInterval: number;
      permissionInstalled: boolean;
      permissionPixel: boolean;
      permissionOverlay: boolean;
      rsLinked: boolean;
      rsWidth: number;
      identifyAppUrl(url: string): void;
      overLaySetGroup(group: string): void;
      overLayText(
        text: string,
        color: number,
        size: number,
        x: number,
        y: number,
        durationMs: number,
      ): boolean;
      overLayClearGroup(group: string): void;
      clearBinds(): void;
    };
  }
}
