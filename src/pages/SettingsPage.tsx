import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { getVersion } from "@tauri-apps/api/app";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { useCallback, useEffect, useState } from "react";
import { checkForAppUpdate } from "@/lib/app-updater";
import {
  extensionsList,
  extensionsRead,
  extensionsValidate,
  extensionsWrite,
  fetchConfig,
  KNOWN_PROVIDERS,
  saveConfig,
  type PhontonConfig,
} from "@/lib/config";
import { doctorRun } from "@/lib/serve";
import {
  accountUrl,
  clearCloudToken,
  clearSessionToken,
  getStoredCloudToken,
  hasCloudSyncEntitlement,
  isAuthenticated,
  sessionPlan,
  signInUrl,
  storeCloudToken,
} from "@/lib/license";
import { getActiveProject } from "@/lib/projects";
import { isTauri } from "@/lib/sidecar";
import { themePresets, type ThemeId, applyTheme } from "@/themes/presets";
import { ArrowLeft } from "lucide-react";

type SettingsSection =
  | "account"
  | "appearance"
  | "provider"
  | "budget"
  | "index"
  | "permissions"
  | "general"
  | "extensions"
  | "mcp"
  | "doctor"
  | "updates";

const NAV: { id: SettingsSection; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "appearance", label: "Appearance" },
  { id: "provider", label: "Provider" },
  { id: "budget", label: "Budget" },
  { id: "index", label: "Index" },
  { id: "permissions", label: "Permissions" },
  { id: "general", label: "General" },
  { id: "extensions", label: "Steering" },
  { id: "mcp", label: "MCP" },
  { id: "doctor", label: "Doctor" },
  { id: "updates", label: "Updates" },
];

type Props = {
  themeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
  onBack: () => void;
  onShowSetup?: () => void;
};

export function SettingsPage({ themeId, onThemeChange, onBack, onShowSetup }: Props) {
  const [section, setSection] = useState<SettingsSection>("account");
  const [config, setConfig] = useState<PhontonConfig | null>(null);
  const [configPath, setConfigPath] = useState<string | null>(null);
  const [configStatus, setConfigStatus] = useState("");
  const [tokenInput, setTokenInput] = useState(getStoredCloudToken() ?? "");
  const [appVersion, setAppVersion] = useState("");
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateBusy, setUpdateBusy] = useState(false);
  const [doctorJson, setDoctorJson] = useState("{}");
  const [extScope, setExtScope] = useState<"user" | "workspace">("user");
  const [extFile, setExtFile] = useState("steering.toml");
  const [extContent, setExtContent] = useState("");
  const [extStatus, setExtStatus] = useState("");

  const cloudConnected = hasCloudSyncEntitlement(getStoredCloudToken());
  const projectOpen = Boolean(getActiveProject());

  const loadConfig = useCallback(async () => {
    try {
      const result = await fetchConfig();
      setConfig(result.config);
      setConfigPath(result.path);
    } catch (err) {
      setConfigStatus(String(err));
    }
  }, []);

  useEffect(() => {
    void loadConfig();
    if (isTauri()) void getVersion().then(setAppVersion).catch(() => undefined);
  }, [loadConfig]);

  const persistConfig = async (patch: Partial<PhontonConfig>) => {
    setConfigStatus("Saving…");
    try {
      await saveConfig(patch);
      await loadConfig();
      setConfigStatus("Saved");
    } catch (err) {
      setConfigStatus(String(err));
    }
  };

  const loadExtensionFile = async (file: string, scope: "user" | "workspace") => {
    setExtFile(file);
    setExtScope(scope);
    try {
      const result = await extensionsRead(scope, file);
      setExtContent(result.content);
      setExtStatus(result.exists ? result.path : `New file at ${result.path}`);
    } catch (err) {
      setExtStatus(String(err));
    }
  };

  useEffect(() => {
    if (section === "extensions") void loadExtensionFile("steering.toml", extScope);
    if (section === "mcp") void loadExtensionFile("mcp.toml", extScope);
  }, [section, extScope]);

  const handleCheckUpdates = async () => {
    if (!isTauri()) return;
    setUpdateBusy(true);
    setUpdateStatus("Checking…");
    const result = await checkForAppUpdate();
    if (result.status === "current") setUpdateStatus("You're on the latest version.");
    else if (result.status === "available") setUpdateStatus(`Update ${result.version} available.`);
    else if (result.status === "error") setUpdateStatus(result.message);
    setUpdateBusy(false);
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <header className="flex h-12 items-center gap-3 border-b px-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 size-4" />
          Back
        </Button>
        <h1 className="text-lg font-semibold">Settings</h1>
        {configPath ? (
          <span className="text-xs text-muted-foreground truncate">Config: {configPath}</span>
        ) : null}
      </header>
      <div className="flex min-h-0 flex-1">
        <nav className="w-52 shrink-0 border-r p-3">
          <ScrollArea className="h-full">
            <div className="space-y-1">
              {NAV.map((item) => (
                <Button
                  key={item.id}
                  variant={section === item.id ? "secondary" : "ghost"}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setSection(item.id)}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </ScrollArea>
        </nav>
        <ScrollArea className="min-h-0 flex-1 p-6">
          <div className="mx-auto max-w-2xl space-y-6">
            {section === "account" ? (
              <section className="space-y-4">
                <h2 className="text-base font-medium">Account</h2>
                <p className="text-sm text-muted-foreground">
                  {isAuthenticated()
                    ? `Signed in · ${sessionPlan()} plan`
                    : "Not signed in"}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (isTauri()) void openExternal(signInUrl());
                      else window.open(signInUrl(), "_blank");
                    }}
                  >
                    Manage account
                  </Button>
                  {isAuthenticated() ? (
                    <Button
                      variant="ghost"
                      onClick={() => {
                        clearSessionToken();
                        onShowSetup?.();
                      }}
                    >
                      Sign out
                    </Button>
                  ) : null}
                </div>
                <Separator />
                <Label htmlFor="cloud-token">Cloud sync token</Label>
                <Textarea
                  id="cloud-token"
                  rows={3}
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  placeholder="Paste token from phonton.dev/account"
                />
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => {
                      const t = tokenInput.trim();
                      if (hasCloudSyncEntitlement(t)) storeCloudToken(t);
                    }}
                  >
                    Save token
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      clearCloudToken();
                      setTokenInput("");
                    }}
                  >
                    Clear
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (isTauri()) void openExternal(accountUrl());
                      else window.open(accountUrl(), "_blank");
                    }}
                  >
                    Open account
                  </Button>
                </div>
                {cloudConnected ? (
                  <Alert>
                    <AlertTitle>Cloud sync connected</AlertTitle>
                  </Alert>
                ) : null}
              </section>
            ) : null}

            {section === "appearance" ? (
              <section className="space-y-4">
                <h2 className="text-base font-medium">Appearance</h2>
                <Label>Theme</Label>
                <Select
                  value={themeId}
                  onValueChange={(id) => {
                    const next = id as ThemeId;
                    onThemeChange(next);
                    applyTheme(next);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {themePresets.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </section>
            ) : null}

            {config && section === "provider" ? (
              <section className="space-y-4">
                <h2 className="text-base font-medium">Provider</h2>
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <Select
                    value={config.provider.name}
                    onValueChange={(name: string | null) => {
                      if (!name) return;
                      setConfig({ ...config, provider: { ...config.provider, name } });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {KNOWN_PROVIDERS.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Model</Label>
                  <Input
                    value={config.provider.model ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        provider: { ...config.provider, model: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>API key {config.provider.has_api_key ? "(saved)" : ""}</Label>
                  <Input
                    type="password"
                    placeholder={config.provider.has_api_key ? "••••••••" : "sk-…"}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        provider: { ...config.provider, api_key: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Base URL</Label>
                  <Input
                    value={config.provider.base_url ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        provider: { ...config.provider, base_url: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Account ID (Cloudflare)</Label>
                  <Input
                    value={config.provider.account_id ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        provider: { ...config.provider, account_id: e.target.value },
                      })
                    }
                  />
                </div>
                <Button onClick={() => void persistConfig({ provider: config.provider })}>
                  Save provider
                </Button>
              </section>
            ) : null}

            {config && section === "budget" ? (
              <section className="space-y-4">
                <h2 className="text-base font-medium">Budget</h2>
                <div className="space-y-2">
                  <Label>Max tokens per session</Label>
                  <Input
                    type="number"
                    value={config.budget.max_tokens ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        budget: {
                          ...config.budget,
                          max_tokens: e.target.value ? Number(e.target.value) : null,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Max USD cents per session</Label>
                  <Input
                    type="number"
                    value={config.budget.max_usd_cents ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        budget: {
                          ...config.budget,
                          max_usd_cents: e.target.value ? Number(e.target.value) : null,
                        },
                      })
                    }
                  />
                </div>
                <Button onClick={() => void persistConfig({ budget: config.budget })}>
                  Save budget
                </Button>
              </section>
            ) : null}

            {config && section === "index" ? (
              <section className="space-y-4">
                <h2 className="text-base font-medium">Index</h2>
                <div className="space-y-2">
                  <Label>Backend</Label>
                  <Select
                    value={config.index.backend}
                    onValueChange={(backend: string | null) => {
                      if (!backend) return;
                      setConfig({ ...config, index: { ...config.index, backend } });
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local-hnsw">local-hnsw</SelectItem>
                      <SelectItem value="qdrant">qdrant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Qdrant URL</Label>
                  <Input
                    value={config.index.qdrant_url ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        index: { ...config.index, qdrant_url: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Qdrant collection</Label>
                  <Input
                    value={config.index.qdrant_collection ?? ""}
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        index: { ...config.index, qdrant_collection: e.target.value },
                      })
                    }
                  />
                </div>
                <Button onClick={() => void persistConfig({ index: config.index })}>
                  Save index
                </Button>
              </section>
            ) : null}

            {config && section === "permissions" ? (
              <section className="space-y-4">
                <h2 className="text-base font-medium">Permissions</h2>
                <div className="space-y-2">
                  <Label>Default mode</Label>
                  <Input
                    value={config.permissions.mode ?? ""}
                    placeholder="ask"
                    onChange={(e) =>
                      setConfig({
                        ...config,
                        permissions: { mode: e.target.value },
                      })
                    }
                  />
                </div>
                <Button onClick={() => void persistConfig({ permissions: config.permissions })}>
                  Save permissions
                </Button>
              </section>
            ) : null}

            {config && section === "general" ? (
              <section className="space-y-4">
                <h2 className="text-base font-medium">General</h2>
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-update">Auto-update CLI</Label>
                  <Switch
                    id="auto-update"
                    checked={config.general.enable_auto_update}
                    onCheckedChange={(checked) =>
                      setConfig({
                        ...config,
                        general: { enable_auto_update: checked },
                      })
                    }
                  />
                </div>
                <Button onClick={() => void persistConfig({ general: config.general })}>
                  Save general
                </Button>
                {onShowSetup ? (
                  <Button variant="ghost" onClick={onShowSetup}>
                    Show setup again
                  </Button>
                ) : null}
              </section>
            ) : null}

            {section === "extensions" || section === "mcp" ? (
              <section className="space-y-4">
                <h2 className="text-base font-medium">
                  {section === "extensions" ? "Steering" : "MCP servers"}
                </h2>
                <div className="flex gap-2">
                  <Button
                    variant={extScope === "user" ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setExtScope("user")}
                  >
                    Global
                  </Button>
                  <Button
                    variant={extScope === "workspace" ? "secondary" : "outline"}
                    size="sm"
                    disabled={!projectOpen}
                    onClick={() => setExtScope("workspace")}
                  >
                    This project
                  </Button>
                </div>
                <Textarea
                  className="min-h-[320px] font-mono text-xs"
                  value={extContent}
                  onChange={(e) => setExtContent(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    onClick={() =>
                      void extensionsWrite(extScope, extFile, extContent).then((r) =>
                        setExtStatus(`Saved ${r.path}`),
                      )
                    }
                  >
                    Save {extFile}
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      void extensionsValidate().then((r) =>
                        setExtStatus(
                          `Valid=${r.ok} steering=${r.steering_rules} mcp=${r.mcp_servers}`,
                        ),
                      )
                    }
                  >
                    Validate
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => void extensionsList().then(() => undefined)}
                  >
                    Refresh
                  </Button>
                </div>
                {extStatus ? <p className="text-xs text-muted-foreground">{extStatus}</p> : null}
              </section>
            ) : null}

            {section === "doctor" ? (
              <section className="space-y-4">
                <h2 className="text-base font-medium">Doctor</h2>
                <Button
                  onClick={() =>
                    void doctorRun(true).then((r) => setDoctorJson(JSON.stringify(r, null, 2)))
                  }
                >
                  Run doctor (with provider probe)
                </Button>
                <pre className="json-block max-h-[480px] overflow-auto">{doctorJson}</pre>
              </section>
            ) : null}

            {section === "updates" && isTauri() ? (
              <section className="space-y-4">
                <h2 className="text-base font-medium">App updates</h2>
                <p className="text-sm text-muted-foreground">
                  {appVersion ? `Phonton Desktop v${appVersion}` : "Phonton Desktop"}
                  {updateStatus ? ` · ${updateStatus}` : ""}
                </p>
                <Button disabled={updateBusy} onClick={() => void handleCheckUpdates()}>
                  {updateBusy ? "Checking…" : "Check for updates"}
                </Button>
              </section>
            ) : null}

            {configStatus ? (
              <p className="text-xs text-muted-foreground">{configStatus}</p>
            ) : null}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
