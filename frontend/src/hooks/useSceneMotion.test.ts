import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { observeSceneMotion } from "./useSceneMotion";

describe("scene motion lifecycle", () => {
  let visibility: EventTarget & { hidden: boolean };
  let preference: EventTarget & { matches: boolean };
  let intersect: (visible: boolean) => void;
  let disconnect: ReturnType<typeof vi.fn>;
  const element = {} as HTMLElement;

  beforeEach(() => {
    visibility = Object.assign(new EventTarget(), { hidden: false });
    preference = Object.assign(new EventTarget(), { matches: false });
    disconnect = vi.fn();
    vi.stubGlobal("document", visibility);
    vi.stubGlobal("window", { matchMedia: vi.fn(() => preference) });
    vi.stubGlobal("IntersectionObserver", class {
      constructor(callback: IntersectionObserverCallback) {
        intersect = visible => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver);
      }
      observe() {}
      disconnect = disconnect;
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("runs only while the scene is visible", () => {
    const update = vi.fn();
    const dispose = observeSceneMotion(element, update);
    expect(update).toHaveBeenLastCalledWith(false);
    intersect(true);
    expect(update).toHaveBeenLastCalledWith(true);
    intersect(false);
    expect(update).toHaveBeenLastCalledWith(false);
    dispose();
  });

  it("pauses in a hidden tab and resumes when visible", () => {
    const update = vi.fn();
    const dispose = observeSceneMotion(element, update);
    intersect(true);
    visibility.hidden = true;
    visibility.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenLastCalledWith(false);
    visibility.hidden = false;
    visibility.dispatchEvent(new Event("visibilitychange"));
    expect(update).toHaveBeenLastCalledWith(true);
    dispose();
  });

  it("honors reduced motion initially and when the preference changes", () => {
    preference.matches = true;
    const update = vi.fn();
    const dispose = observeSceneMotion(element, update);
    intersect(true);
    expect(update).toHaveBeenLastCalledWith(false);
    preference.matches = false;
    preference.dispatchEvent(new Event("change"));
    expect(update).toHaveBeenLastCalledWith(true);
    preference.matches = true;
    preference.dispatchEvent(new Event("change"));
    expect(update).toHaveBeenLastCalledWith(false);
    dispose();
  });

  it("disconnects observers and listeners when leaving the page", () => {
    const update = vi.fn();
    const dispose = observeSceneMotion(element, update);
    dispose();
    expect(disconnect).toHaveBeenCalledOnce();
    update.mockClear();
    visibility.dispatchEvent(new Event("visibilitychange"));
    preference.dispatchEvent(new Event("change"));
    expect(update).not.toHaveBeenCalled();
  });

  it("keeps the scene static if visibility observation is unavailable", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const update = vi.fn();
    const dispose = observeSceneMotion(element, update);
    expect(update).toHaveBeenLastCalledWith(false);
    expect(dispose).toBeTypeOf("function");
    dispose();
  });
});
