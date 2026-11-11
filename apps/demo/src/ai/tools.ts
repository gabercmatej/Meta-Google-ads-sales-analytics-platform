import type { ToolCall } from './types';

/** Records every query the assistant runs, so the answer can show its tool calls. */
export class Tracer {
  readonly calls: ToolCall[] = [];
  run<T>(tool: string, args: Record<string, unknown>, fn: () => T, note: (r: T) => string = () => 'ok'): T {
    const result = fn();
    this.calls.push({ tool, args: JSON.stringify(args), result: note(result) });
    return result;
  }
}
