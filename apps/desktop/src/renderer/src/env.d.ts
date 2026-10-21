import type { DesktopClient } from "@tradequote/contracts";

declare global {
  interface Window {
    tradequote: DesktopClient;
  }
}
