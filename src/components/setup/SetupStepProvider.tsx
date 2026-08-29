import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { fetchConfig, KNOWN_PROVIDERS, saveConfig, type PhontonConfig } from "../../lib/config";
import { doctorRun } from "../../lib/serve";

type Props = {
  onReadyChange: (ready: boolean) => void;
};

type DoctorCheck = {
  id: string;
  severity: string;
  title: string;
  detail: string;
  next_step?: string | null;
};

type DoctorReport = {
  checks?: DoctorCheck[];
};

function providerChecksReady(report: DoctorReport | null): boolean {
  if (!report?.checks?.length) return false;
  const relevant = report.checks.filter((c) => c.id.startsWith("provider."));
  if (!relevant.length) return false;
  return relevant.every((c) => c.severity !== "fail");
}

export function SetupStepProvider({ onReadyChange }: Props) {
  const [config, setConfig] = useState<PhontonConfig | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Connect the CLI first, then save a key.");
  const [ready, setReady] = useState(false);

  const markReady = (next: boolean) => {
    setReady(next);
    onReadyChange(next);
  };

  const loadConfig = async () => {
    try {
      const result = await fetchConfig();
      setConfig(result.config);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void loadConfig();
  }, []);

  const persistAndProbe = async () => {
    if (!config) return;
    setBusy(true);
    setError("");
    setStatus("Saving provider settings…");
    try {
      const provider = { ...config.provider };
      if (apiKey.trim()) provider.api_key = apiKey.trim();
      await saveConfig({ provider });
      setApiKey("");
      setStatus("Running phonton doctor --provider…");
      const report = (await doctorRun(true)) as DoctorReport;
      const ok = providerChecksReady(report);
      markReady(ok);
      const fails = (report.checks ?? []).filter(
        (c) => c.id.startsWith("provider.") && c.severity === "fail",
      );
      if (ok) {
        setStatus("Provider key is local and the probe succeeded.");
      } else {
        setStatus(
          fails[0]?.next_step ||
            fails[0]?.detail ||
            "Doctor reported a provider failure. Save a key and probe again.",
        );
      }
      await loadConfig();
    } catch (err) {
      markReady(false);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Could not save or probe the provider.");
    } finally {
      setBusy(false);
    }
  };

  const probeOnly = async () => {
    setBusy(true);
    setError("");
    setStatus("Running phonton doctor --provider…");
    try {
      const report = (await doctorRun(true)) as DoctorReport;
      const ok = providerChecksReady(report);
      markReady(ok);
      const fails = (report.checks ?? []).filter(
        (c) => c.id.startsWith("provider.") && c.severity === "fail",
      );
      setStatus(
        ok
          ? "Provider probe succeeded. Keys stay on this machine."
          : fails[0]?.next_step ||
              fails[0]?.detail ||
              "No usable provider key yet. Save one locally, then probe.",
      );
    } catch (err) {
      markReady(false);
      setError(err instanceof Error ? err.message : String(err));
      setStatus("Doctor probe failed. Is phonton serve running?");
    } finally {
      setBusy(false);
    }
  };

  const icon = ready ? (
    <CheckCircle2 size={20} color="var(--ph-ok)" />
  ) : error ? (
    <XCircle size={20} color="var(--ph-danger)" />
  ) : busy ? (
    <Loader2 size={20} style={{ animation: "spin 1s linear infinite" }} />
  ) : (
    <XCircle size={20} color="var(--ph-warn)" />
  );

  return (
    <div>
      <h2 className="setup-section-title">Provider key</h2>
      <p className="setup-section-desc">
        Phonton is BYOK. Keys are stored in local CLI config and never sent to Phonton Cloud. Doctor must
        probe the provider before you finish setup.
      </p>
      <div className="cli-status-card">
        <div className="cli-status-row">
          {icon}
          <span className="cli-status-label">{ready ? "Provider ready" : "Provider not verified"}</span>
        </div>
        <p className="cli-status-detail">{status}</p>
      </div>
      {config ? (
        <div className="field" style={{ marginTop: 16 }}>
          <label htmlFor="setup-provider">Provider</label>
          <select
            id="setup-provider"
            className="goal-input"
            value={config.provider.name}
            onChange={(e) =>
              setConfig({ ...config, provider: { ...config.provider, name: e.target.value } })
            }
          >
            {KNOWN_PROVIDERS.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          <label htmlFor="setup-model">Model (optional cheap default)</label>
          <input
            id="setup-model"
            className="goal-input"
            value={config.provider.model ?? ""}
            onChange={(e) =>
              setConfig({ ...config, provider: { ...config.provider, model: e.target.value } })
            }
            placeholder="Leave blank to use the provider default"
          />
          <label htmlFor="setup-key">
            API key {config.provider.has_api_key ? "(already saved locally)" : ""}
          </label>
          <input
            id="setup-key"
            className="goal-input"
            type="password"
            autoComplete="off"
            placeholder={config.provider.has_api_key ? "••••••••" : "sk-…"}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </div>
      ) : (
        <p className="cli-hint">Waiting for config from phonton serve…</p>
      )}
      <div className="toolbar" style={{ marginTop: 12 }}>
        <button type="button" className="btn" onClick={() => void persistAndProbe()} disabled={busy || !config}>
          {busy ? "Working…" : "Save and probe"}
        </button>
        <button type="button" className="btn secondary" onClick={() => void probeOnly()} disabled={busy}>
          Probe existing key
        </button>
      </div>
      {error ? (
        <p className="cli-hint" style={{ color: "var(--ph-danger)" }}>
          {error}
        </p>
      ) : (
        <p className="cli-hint">
          Equivalent CLI: <code className="mono">phonton doctor --provider</code>. Browser preview cannot spawn
          the engine; use the Tauri app or start serve yourself.
        </p>
      )}
    </div>
  );
}
