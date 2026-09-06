import type { Model, SimulationSettings } from "./model";
import { simulate } from "./simulation";

interface SimulationRequest {
  model: Model;
  initial?: Record<string, number>;
  clamped?: Record<string, number>;
  settings?: Partial<SimulationSettings>;
}

self.onmessage = (event: MessageEvent<SimulationRequest>) => {
  try {
    const { model, initial, clamped, settings } = event.data;
    self.postMessage({ result: simulate(model, initial, clamped, settings) });
  } catch (error: unknown) {
    self.postMessage({
      error: error instanceof Error ? error.message : "Simulation failed.",
    });
  }
};
