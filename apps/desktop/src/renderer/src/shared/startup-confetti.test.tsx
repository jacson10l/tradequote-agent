// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { StartupConfetti, StartupScreen } from "./startup-confetti";

const context = {
  clearRect: vi.fn(),
  fillRect: vi.fn(),
  setTransform: vi.fn(),
  globalAlpha: 1,
  fillStyle: "",
};
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
let preference: MediaQueryList;
let reducedMotion: boolean;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(performance, "now").mockReturnValue(0);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
    context as unknown as CanvasRenderingContext2D,
  );
  frames = new Map();
  nextFrame = 0;
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn((callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    }),
  );
  vi.stubGlobal(
    "cancelAnimationFrame",
    vi.fn((frame: number) => frames.delete(frame)),
  );
  reducedMotion = false;
  preference = {
    get matches() {
      return reducedMotion;
    },
    media: "(prefers-reduced-motion: reduce)",
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  };
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => preference),
  );
  vi.stubGlobal("innerWidth", 1000);
  vi.stubGlobal("innerHeight", 800);
  vi.stubGlobal("devicePixelRatio", 2);
  context.globalAlpha = 1;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

function drawFrame(timestamp: number) {
  const callbacks = [...frames.values()];
  frames.clear();
  act(() => {
    for (const callback of callbacks) callback(timestamp);
  });
}

it("draws 120 decorative particles on a high-DPI canvas and fades out", () => {
  const { container } = render(<StartupConfetti />);
  const canvas = container.querySelector("canvas");
  expect(canvas).toHaveAttribute("aria-hidden", "true");
  expect(canvas?.width).toBe(2000);
  expect(canvas?.height).toBe(1600);
  expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
  drawFrame(0);
  expect(context.fillRect).toHaveBeenCalledTimes(120);
  expect(context.fillRect).toHaveBeenNthCalledWith(1, 500, 544, 6, 6);
  drawFrame(2000);
  expect(context.globalAlpha).toBeCloseTo(0.5);
  act(() => vi.advanceTimersByTime(2200));
  expect(container.querySelector("canvas")).toBeNull();
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("uses elapsed time rather than frame count for gravity and velocity", () => {
  vi.spyOn(Math, "random").mockReturnValue(0.25);
  render(<StartupConfetti />);
  drawFrame(0);
  drawFrame(500);
  expect(context.fillRect).toHaveBeenLastCalledWith(440, 589, 6, 6);
  drawFrame(1000);
  expect(context.fillRect.mock.lastCall?.[0]).toBeCloseTo(380);
  expect(context.fillRect.mock.lastCall?.[1]).toBeCloseTo(904);
});

it("resizes the backing bitmap and preserves CSS-space drawing", () => {
  const { container } = render(<StartupConfetti />);
  vi.stubGlobal("innerWidth", 800);
  vi.stubGlobal("innerHeight", 640);
  act(() => window.dispatchEvent(new Event("resize")));
  const canvas = container.querySelector("canvas");
  expect(canvas?.width).toBe(1600);
  expect(canvas?.height).toBe(1280);
  drawFrame(0);
  expect(context.clearRect).toHaveBeenLastCalledWith(0, 0, 800, 640);
});

it("skips the animation for reduced motion without allocating a context", () => {
  reducedMotion = true;
  const { container } = render(<StartupConfetti />);
  expect(container.querySelector("canvas")).toBeNull();
  expect(HTMLCanvasElement.prototype.getContext).not.toHaveBeenCalled();
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("ends immediately when reduced motion becomes enabled", () => {
  const { container } = render(<StartupConfetti />);
  const listener = vi.mocked(preference.addEventListener).mock.calls[0]?.[1];
  reducedMotion = true;
  act(() => {
    if (typeof listener === "function") listener(new Event("change"));
  });
  expect(container.querySelector("canvas")).toBeNull();
  expect(frames.size).toBe(0);
  expect(preference.removeEventListener).toHaveBeenCalledWith("change", listener);
});

it("skips gracefully when Canvas 2D is unavailable", () => {
  vi.mocked(HTMLCanvasElement.prototype.getContext).mockReturnValue(null);
  const { container } = render(<StartupConfetti />);
  expect(container.querySelector("canvas")).toBeNull();
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});

it("cleans up on unmount and keeps only one live loop under StrictMode", () => {
  const removeListener = vi.spyOn(window, "removeEventListener");
  const { unmount } = render(
    <StrictMode>
      <StartupConfetti />
    </StrictMode>,
  );
  expect(frames.size).toBe(1);
  expect(vi.getTimerCount()).toBe(1);
  unmount();
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
  expect(removeListener).toHaveBeenCalledWith("resize", expect.any(Function));
});

it("does not replay after rerenders or after its end", () => {
  const { container, rerender } = render(<StartupConfetti />);
  rerender(<StartupConfetti />);
  expect(HTMLCanvasElement.prototype.getContext).toHaveBeenCalledTimes(1);
  drawFrame(2200);
  expect(container.querySelector("canvas")).toBeNull();
  rerender(<StartupConfetti />);
  expect(frames.size).toBe(0);
  expect(container.querySelector("canvas")).toBeNull();
});

it("shows a dedicated branded screen before fading in the already mounted workbench", () => {
  const { container } = render(
    <StartupScreen>
      <button type="button">工作台操作</button>
    </StartupScreen>,
  );
  const main = container.querySelector(".startup-main");
  expect(container.querySelector(".startup-experience")).toHaveAttribute("data-phase", "intro");
  expect(container.querySelector(".startup-screen h1")).toHaveTextContent("TradeQuote");
  expect(container.querySelector(".startup-screen canvas")).not.toBeNull();
  expect(main).toHaveAttribute("inert");
  expect(main).toHaveAttribute("aria-hidden", "true");
  act(() => vi.advanceTimersByTime(2200));
  expect(container.querySelector("canvas")).toBeNull();
  expect(container.querySelector(".startup-experience")).toHaveAttribute("data-phase", "entering");
  expect(main).not.toHaveAttribute("inert");
  expect(main).not.toHaveAttribute("aria-hidden");
  act(() => vi.advanceTimersByTime(650));
  expect(container.querySelector(".startup-screen")).toBeNull();
  expect(container.querySelector(".startup-experience")).toHaveAttribute("data-phase", "ready");
  expect(vi.getTimerCount()).toBe(0);
  expect(frames.size).toBe(0);
});

it("keeps child state and does not replay the splash on route-like rerenders", () => {
  const { container, rerender } = render(
    <StartupScreen>
      <input defaultValue="草稿" />
    </StartupScreen>,
  );
  const input = container.querySelector("input");
  act(() => vi.advanceTimersByTime(2850));
  rerender(
    <StartupScreen>
      <input defaultValue="下一页" />
    </StartupScreen>,
  );
  expect(container.querySelector("input")).toBe(input);
  expect(input?.value).toBe("草稿");
  expect(container.querySelector(".startup-screen")).toBeNull();
});

it("skips the entire intro and handoff for reduced motion", () => {
  reducedMotion = true;
  const { container } = render(
    <StartupScreen>
      <button type="button">工作台操作</button>
    </StartupScreen>,
  );
  expect(container.querySelector(".startup-screen")).toBeNull();
  expect(container.querySelector(".startup-main")).not.toHaveAttribute("inert");
  expect(vi.getTimerCount()).toBe(0);
});

it("unlocks the workbench immediately when reduced motion changes during startup", () => {
  const { container } = render(<StartupScreen>工作台</StartupScreen>);
  reducedMotion = true;
  const listeners = vi.mocked(preference.addEventListener).mock.calls.map((call) => call[1]);
  act(() => {
    for (const listener of listeners) {
      if (typeof listener === "function") listener(new Event("change"));
    }
  });
  expect(container.querySelector(".startup-screen")).toBeNull();
  expect(container.querySelector(".startup-main")).not.toHaveAttribute("inert");
  expect(vi.getTimerCount()).toBe(0);
  expect(frames.size).toBe(0);
});

it("cleans up the screen and particle resources under StrictMode and early unmount", () => {
  const { unmount } = render(
    <StrictMode>
      <StartupScreen>工作台</StartupScreen>
    </StrictMode>,
  );
  expect(frames.size).toBe(1);
  expect(vi.getTimerCount()).toBe(3);
  unmount();
  expect(frames.size).toBe(0);
  expect(vi.getTimerCount()).toBe(0);
});
