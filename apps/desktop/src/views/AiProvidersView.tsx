import {
  LmStudioProvider,
  LocalAgentRuntime,
  OllamaProvider,
  publicError,
  type AgentActivity,
  type AgentMessage,
  type LocalModelProvider,
} from "@gielinor/agent-runtime";
import { useEffect, useState, type FormEvent } from "react";

import {
  EmptyState,
  InlineAlert,
  LoadingBlock,
  PageHeader,
  StatusPill,
} from "../components/Common.js";
import { Icon } from "../components/Icon.js";
import type { CompanionBridge, DesktopProfile } from "../types.js";

type ProviderId = "none" | "ollama" | "lm-studio";
type ActiveProviderId = Exclude<ProviderId, "none">;

export type LocalAiSettings = {
  providerId: ProviderId;
  endpoints: Record<ActiveProviderId, string>;
  model: string;
  timeoutMs: number;
  maxToolLoops: number;
};

const STORAGE_KEY = "gielinor-companion-local-ai-v1";
const DEFAULT_SETTINGS: LocalAiSettings = {
  providerId: "none",
  endpoints: {
    ollama: "http://127.0.0.1:11434",
    "lm-studio": "http://127.0.0.1:1234",
  },
  model: "",
  timeoutMs: 30_000,
  maxToolLoops: 4,
};

const PROVIDERS = {
  ollama: {
    name: "Ollama",
    description: "Run installed models through Ollama's local chat API.",
    setup: "Start Ollama, install a tool-capable model, then discover models here.",
  },
  "lm-studio": {
    name: "LM Studio",
    description: "Use LM Studio's local OpenAI-compatible server.",
    setup: "Load a tool-capable model and start the Local Server in LM Studio.",
  },
} as const;

function boundedInteger(value: unknown, minimum: number, maximum: number): number | undefined {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= minimum &&
    value <= maximum
    ? value
    : undefined;
}

export function loadLocalAiSettings(): LocalAiSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) {
      return DEFAULT_SETTINGS;
    }
    const value = JSON.parse(stored) as Partial<LocalAiSettings>;
    const providerId =
      value.providerId === "ollama" ||
      value.providerId === "lm-studio" ||
      value.providerId === "none"
        ? value.providerId
        : "none";
    return {
      providerId,
      endpoints: {
        ollama:
          typeof value.endpoints?.ollama === "string"
            ? value.endpoints.ollama
            : DEFAULT_SETTINGS.endpoints.ollama,
        "lm-studio":
          typeof value.endpoints?.["lm-studio"] === "string"
            ? value.endpoints["lm-studio"]
            : DEFAULT_SETTINGS.endpoints["lm-studio"],
      },
      model: typeof value.model === "string" ? value.model : "",
      timeoutMs: boundedInteger(value.timeoutMs, 1_000, 120_000) ?? 30_000,
      maxToolLoops: boundedInteger(value.maxToolLoops, 1, 10) ?? 4,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function makeProvider(
  settings: LocalAiSettings,
  bridge: CompanionBridge,
): LocalModelProvider | undefined {
  if (settings.providerId === "ollama") {
    return new OllamaProvider(settings.endpoints.ollama, bridge.localAiTransport());
  }
  if (settings.providerId === "lm-studio") {
    return new LmStudioProvider(settings.endpoints["lm-studio"], bridge.localAiTransport());
  }
  return undefined;
}

function providerStatus(providerId: ProviderId, connection: "idle" | "testing" | "ready") {
  if (providerId === "none") {
    return <StatusPill state="neutral">No-AI mode</StatusPill>;
  }
  if (connection === "ready") {
    return <StatusPill state="success">Connected locally</StatusPill>;
  }
  if (connection === "testing") {
    return <StatusPill state="warning">Testing connection</StatusPill>;
  }
  return <StatusPill state="neutral">Not connected</StatusPill>;
}

export function AiProvidersView({
  bridge,
  profile,
}: {
  bridge: CompanionBridge;
  profile: DesktopProfile;
}) {
  const [settings, setSettings] = useState<LocalAiSettings>(loadLocalAiSettings);
  const [models, setModels] = useState<string[]>([]);
  const [connection, setConnection] = useState<"idle" | "testing" | "ready">("idle");
  const [error, setError] = useState<string>();
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<AgentMessage[]>([]);
  const [activities, setActivities] = useState<AgentActivity[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    setHistory([]);
    setActivities([]);
  }, [profile.id]);

  function selectProvider(providerId: ProviderId) {
    setSettings((current) => ({ ...current, providerId, model: "" }));
    setModels([]);
    setConnection("idle");
    setError(undefined);
    setHistory([]);
    setActivities([]);
  }

  async function testConnection() {
    setConnection("testing");
    setError(undefined);
    try {
      const provider = makeProvider(settings, bridge);
      if (provider === undefined) {
        setConnection("idle");
        return;
      }
      const discovered = await provider.discoverModels(settings.timeoutMs);
      if (discovered.length === 0) {
        setConnection("idle");
        setModels([]);
        setError(
          `No tool-capable models were reported by ${provider.displayName}. ${PROVIDERS[provider.id].setup}`,
        );
        return;
      }
      setModels(discovered);
      setSettings((current) => ({
        ...current,
        model: discovered.includes(current.model) ? current.model : discovered[0]!,
      }));
      setConnection("ready");
    } catch (caught) {
      setConnection("idle");
      setModels([]);
      setError(publicError(caught).message);
    }
  }

  function updateActivity(activity: AgentActivity) {
    setActivities((current) => {
      const existing = current.findIndex((item) => item.id === activity.id);
      if (existing === -1) {
        return [...current, activity];
      }
      return current.map((item, index) => (index === existing ? activity : item));
    });
  }

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (settings.providerId === "none" || connection !== "ready" || settings.model === "") {
      setError("Connect a local provider and select an installed model before asking a question.");
      return;
    }
    setBusy(true);
    setError(undefined);
    setActivities([]);
    try {
      const provider = makeProvider(settings, bridge);
      if (provider === undefined) {
        throw new Error("No local provider is selected");
      }
      const runtime = new LocalAgentRuntime(provider, (name, arguments_, context) => {
        if (context.signal.aborted) {
          throw new Error("The request was cancelled");
        }
        return bridge.callTool(name, arguments_);
      });
      const result = await runtime.run({
        prompt,
        history,
        context:
          `The active local profile is ${profile.displayName} with profile ID ${profile.id}. ` +
          `Use this ID for profile-aware tools. The account mode is ${profile.gameMode}.`,
        model: settings.model,
        timeoutMs: settings.timeoutMs,
        maxToolLoops: settings.maxToolLoops,
        onActivity: updateActivity,
      });
      setHistory(result.messages);
      setActivities(result.activities);
      setPrompt("");
    } catch (caught) {
      setError(publicError(caught).message);
    } finally {
      setBusy(false);
    }
  }

  const visibleMessages = history.filter(
    (message) =>
      (message.role === "user" || message.role === "assistant") && message.content.trim() !== "",
  );

  return (
    <div className="page-stack">
      <PageHeader
        eyebrow="Optional local intelligence"
        title="AI providers"
        description="Ask natural-language questions while trusted companion tools keep calculations and lookups deterministic."
        actions={providerStatus(settings.providerId, connection)}
      />

      <section className="surface-card provider-selector" aria-labelledby="provider-heading">
        <div className="section-heading">
          <div>
            <h2 id="provider-heading">Choose a mode</h2>
            <p>Nothing leaves this device. Remote provider URLs and API keys are not accepted.</p>
          </div>
        </div>
        <div className="provider-choice-grid">
          <label className={settings.providerId === "none" ? "selected" : ""}>
            <input
              type="radio"
              name="ai-provider"
              value="none"
              checked={settings.providerId === "none"}
              onChange={() => selectProvider("none")}
            />
            <span className="provider-choice-content">
              <span className="provider-logo">NO</span>
              <strong>No-AI mode</strong>
              <small>Use every deterministic dashboard feature without a model.</small>
            </span>
          </label>
          {(
            Object.entries(PROVIDERS) as Array<
              [ActiveProviderId, (typeof PROVIDERS)[ActiveProviderId]]
            >
          ).map(([id, detail]) => (
            <label className={settings.providerId === id ? "selected" : ""} key={id}>
              <input
                type="radio"
                name="ai-provider"
                value={id}
                checked={settings.providerId === id}
                onChange={() => selectProvider(id)}
              />
              <span className="provider-choice-content">
                <span className="provider-logo">{detail.name.slice(0, 2)}</span>
                <strong>{detail.name}</strong>
                <small>{detail.description}</small>
              </span>
            </label>
          ))}
        </div>
      </section>

      {settings.providerId === "none" ? (
        <section className="surface-card no-ai-hero">
          <div className="no-ai-icon">
            <Icon name="spark" size={38} />
          </div>
          <div>
            <p className="eyebrow">Private by default</p>
            <h2>No model is connected</h2>
            <p>
              Profiles, quest routes, XP calculations, levelling plans and price analysis remain
              fully available through validated tools.
            </p>
          </div>
        </section>
      ) : (
        <>
          <section className="content-grid ai-settings-grid">
            <form
              className="surface-card stacked-form"
              onSubmit={(event) => {
                event.preventDefault();
                void testConnection();
              }}
            >
              <div className="section-heading">
                <div>
                  <h2>{PROVIDERS[settings.providerId].name} connection</h2>
                  <p>{PROVIDERS[settings.providerId].setup}</p>
                </div>
              </div>
              <label>
                Local endpoint
                <input
                  type="url"
                  aria-label="Local provider endpoint"
                  value={settings.endpoints[settings.providerId]}
                  onChange={(event) => {
                    setSettings((current) => ({
                      ...current,
                      endpoints: {
                        ...current.endpoints,
                        [settings.providerId]: event.target.value,
                      },
                      model: "",
                    }));
                    setModels([]);
                    setConnection("idle");
                  }}
                />
              </label>
              <div className="ai-bound-grid">
                <label>
                  Request timeout (seconds)
                  <input
                    type="number"
                    min={1}
                    max={120}
                    value={settings.timeoutMs / 1_000}
                    onChange={(event) => {
                      const seconds = Number(event.target.value);
                      if (Number.isInteger(seconds) && seconds >= 1 && seconds <= 120) {
                        setSettings((current) => ({
                          ...current,
                          timeoutMs: seconds * 1_000,
                        }));
                      }
                    }}
                  />
                </label>
                <label>
                  Maximum tool loops
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={settings.maxToolLoops}
                    onChange={(event) => {
                      const value = Number(event.target.value);
                      if (Number.isInteger(value) && value >= 1 && value <= 10) {
                        setSettings((current) => ({ ...current, maxToolLoops: value }));
                      }
                    }}
                  />
                </label>
              </div>
              <label className="toggle-row privacy-lock">
                <span>
                  Local-only privacy mode
                  <small>Only localhost and loopback addresses are permitted.</small>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Local-only privacy mode"
                  checked
                  disabled
                  readOnly
                />
              </label>
              <button className="primary-button" type="submit" disabled={connection === "testing"}>
                <Icon name="refresh" />
                {connection === "testing" ? "Testing local connection" : "Test and discover models"}
              </button>
              {connection === "testing" ? (
                <LoadingBlock label="Checking the local model server" />
              ) : null}
            </form>

            <section className="surface-card model-panel">
              <div className="section-heading">
                <div>
                  <h2>Model selection</h2>
                  <p>Choose a model that supports structured tool calling.</p>
                </div>
              </div>
              {models.length === 0 ? (
                <EmptyState
                  title="No models discovered yet"
                  description="Start the selected local provider, then test the connection."
                />
              ) : (
                <>
                  <label className="stacked-label">
                    Installed model
                    <select
                      aria-label="Installed model"
                      value={settings.model}
                      onChange={(event) =>
                        setSettings((current) => ({ ...current, model: event.target.value }))
                      }
                    >
                      {models.map((model) => (
                        <option key={model} value={model}>
                          {model}
                        </option>
                      ))}
                    </select>
                  </label>
                  <InlineAlert tone="success">
                    {models.length} local model{models.length === 1 ? "" : "s"} discovered. No cloud
                    service was contacted.
                  </InlineAlert>
                </>
              )}
            </section>
          </section>

          {error === undefined ? null : <InlineAlert tone="error">{error}</InlineAlert>}

          <section className="content-grid ai-chat-grid">
            <div className="surface-card conversation-panel">
              <div className="section-heading">
                <div>
                  <h2>Ask the companion</h2>
                  <p>Conversation history stays in memory and clears when this app closes.</p>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setHistory([]);
                    setActivities([]);
                    setError(undefined);
                  }}
                  disabled={history.length === 0 && activities.length === 0}
                >
                  Reset conversation
                </button>
              </div>
              <div
                className="conversation-log"
                aria-live="polite"
                aria-label="Local AI conversation"
              >
                {visibleMessages.length === 0 ? (
                  <EmptyState
                    title="Ask a RuneScape planning question"
                    description="Try: “What is the guide price of an abyssal whip?”"
                  />
                ) : (
                  visibleMessages.map((message, index) => (
                    <article
                      className={`chat-message chat-${message.role}`}
                      key={`${message.role}-${String(index)}`}
                    >
                      <span>{message.role === "user" ? "You" : "Companion"}</span>
                      <p>{message.content}</p>
                    </article>
                  ))
                )}
              </div>
              <form className="chat-composer" onSubmit={(event) => void ask(event)}>
                <label htmlFor="local-ai-prompt">Question</label>
                <textarea
                  id="local-ai-prompt"
                  value={prompt}
                  maxLength={20_000}
                  placeholder="Ask about skills, a quest route, levelling, or Grand Exchange data"
                  onChange={(event) => setPrompt(event.target.value)}
                  disabled={busy || connection !== "ready"}
                />
                <button
                  className="primary-button"
                  type="submit"
                  disabled={busy || connection !== "ready" || prompt.trim() === ""}
                >
                  <Icon name="spark" />
                  {busy ? "Using trusted tools" : "Ask local model"}
                </button>
              </form>
            </div>

            <aside className="surface-card activity-panel">
              <div className="section-heading">
                <div>
                  <h2>Trusted tool activity</h2>
                  <p>Only validated calls and results cross this boundary.</p>
                </div>
              </div>
              {activities.length === 0 ? (
                <EmptyState
                  title="No tool calls yet"
                  description="Tool names and validated outcomes appear here."
                />
              ) : (
                <ol className="activity-list">
                  {activities.map((activity) => (
                    <li key={activity.id}>
                      <div>
                        <code>{activity.toolName}</code>
                        <StatusPill
                          state={
                            activity.status === "succeeded"
                              ? "success"
                              : activity.status === "failed"
                                ? "failed"
                                : "warning"
                          }
                        >
                          {activity.status}
                        </StatusPill>
                      </div>
                      <p>{activity.message}</p>
                    </li>
                  ))}
                </ol>
              )}
            </aside>
          </section>
        </>
      )}
    </div>
  );
}
