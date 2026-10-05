import type {
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  Model,
} from "@earendil-works/pi-ai";
import { homedir } from "node:os";
import { join } from "node:path";

export function getAgentDir(): string {
  const envDir = process.env.PI_CODING_AGENT_DIR;
  if (envDir) return envDir;
  return join(process.env.HOME || homedir(), ".pi", "agent");
}

export function aliasMessage(message: AssistantMessage, provider: string): AssistantMessage {
  const aliased = { ...message, provider };
  if (message.deferred) aliased.deferred = { ...message.deferred, provider };
  return aliased;
}

export function aliasEvent(event: AssistantMessageEvent, provider: string): AssistantMessageEvent {
  if (event.type === "done") return { ...event, message: aliasMessage(event.message, provider) };
  if (event.type === "error") return { ...event, error: aliasMessage(event.error, provider) };
  return { ...event, partial: aliasMessage(event.partial, provider) };
}

export class LocalAssistantMessageEventStream implements AssistantMessageEventStream {
  private queue: AssistantMessageEvent[] = [];
  private waiting: ((val: IteratorResult<AssistantMessageEvent>) => void)[] = [];
  private done = false;
  private resolveResult!: (msg: AssistantMessage) => void;
  private resultPromise = new Promise<AssistantMessage>((resolve) => {
    this.resolveResult = resolve;
  });

  push(event: AssistantMessageEvent): void {
    if (this.done) return;
    if (event.type === "done") {
      this.done = true;
      this.resolveResult(event.message);
    } else if (event.type === "error") {
      this.done = true;
      this.resolveResult(event.error);
    }
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.queue.push(event);
    }
  }

  end(): void {
    this.done = true;
    while (this.waiting.length > 0) {
      this.waiting.shift()!({ value: undefined as any, done: true });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AssistantMessageEvent> {
    while (true) {
      if (this.queue.length > 0) {
        yield this.queue.shift()!;
      } else if (this.done) {
        return;
      } else {
        const item = await new Promise<IteratorResult<AssistantMessageEvent>>((resolve) =>
          this.waiting.push(resolve),
        );
        if (item.done) return;
        yield item.value;
      }
    }
  }

  result(): Promise<AssistantMessage> {
    return this.resultPromise;
  }
}

export function createAssistantMessageEventStream(): AssistantMessageEventStream {
  return new LocalAssistantMessageEventStream();
}

export function aliasStream(
  source: AssistantMessageEventStream,
  model: Model<any>,
  provider: string,
  onError?: (error: AssistantMessage) => void,
): AssistantMessageEventStream {
  const output = createAssistantMessageEventStream();
  void (async () => {
    try {
      for await (const event of source) {
        if (event.type === "error" && onError) {
          onError(event.error);
        }
        output.push(aliasEvent(event, provider));
      }
      output.end();
    } catch (error) {
      const errMessage: AssistantMessage = {
        role: "assistant",
        content: [],
        api: model.api,
        provider,
        model: model.id,
        usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
        stopReason: "error",
        errorMessage: error instanceof Error ? error.message : String(error),
        timestamp: Date.now(),
      };
      if (onError) onError(errMessage);
      output.push({
        type: "error",
        reason: "error",
        error: errMessage,
      });
      output.end();
    }
  })();
  return output;
}
