import { useMemo, useState } from "react";
import { useSidecar } from "../../hooks/useSidecar";
import { isAuthenticated } from "../../lib/license";
import { completeSetup } from "../../lib/setup";
import type { ThemeId } from "../../themes/presets";
import { SetupStepAuth } from "./SetupStepAuth";
import { SetupStepCli } from "./SetupStepCli";
import { SetupStepFinish } from "./SetupStepFinish";
import { SetupStepTheme } from "./SetupStepTheme";
import { SetupStepWelcome } from "./SetupStepWelcome";
import "./setup.css";

const STEPS = ["welcome", "auth", "theme", "cli", "finish"] as const;
export type SetupStep = (typeof STEPS)[number];

type Props = {
  themeId: ThemeId;
  onThemeChange: (id: ThemeId) => void;
  onComplete: () => void;
  initialStep?: SetupStep;
};

export function SetupPage({ themeId, onThemeChange, onComplete, initialStep = "welcome" }: Props) {
  const [step, setStep] = useState<SetupStep>(initialStep);
  const authState = useMemo(() => crypto.randomUUID(), []);
  const sidecarEnabled = step === "cli" || step === "finish";
  const { state: sidecar, refresh: refreshSidecar } = useSidecar({ enabled: sidecarEnabled });

  const stepIndex = STEPS.indexOf(step);

  const goNext = () => {
    const next = STEPS[stepIndex + 1];
    if (next) setStep(next);
  };

  const goBack = () => {
    const prev = STEPS[stepIndex - 1];
    if (prev) setStep(prev);
  };

  const finish = () => {
    completeSetup();
    onComplete();
  };

  const canContinue =
    step === "auth"
      ? isAuthenticated()
      : step === "cli"
        ? sidecar.status === "ready"
        : true;

  return (
    <div className="setup-page">
      <div className="setup-card">
        {step !== "welcome" ? (
          <div className="setup-steps" aria-hidden>
            {STEPS.filter((s) => s !== "welcome").map((s, i) => {
              const idx = i + 1;
              const currentIdx = stepIndex;
              return (
                <div
                  key={s}
                  className={`setup-step-pill ${idx === currentIdx ? "active" : ""} ${idx < currentIdx ? "done" : ""}`}
                />
              );
            })}
          </div>
        ) : null}

        <div className="setup-body">
          {step === "welcome" ? <SetupStepWelcome onGetStarted={goNext} /> : null}
          {step === "auth" ? (
            <SetupStepAuth authState={authState} />
          ) : null}
          {step === "theme" ? <SetupStepTheme themeId={themeId} onThemeChange={onThemeChange} /> : null}
          {step === "cli" ? <SetupStepCli sidecar={sidecar} onRetry={refreshSidecar} /> : null}
          {step === "finish" ? (
            <SetupStepFinish themeId={themeId} sidecar={sidecar} onOpen={finish} />
          ) : null}
        </div>

        {step !== "welcome" && step !== "finish" ? (
          <div className="setup-footer">
            <button type="button" className="btn ghost" onClick={goBack} disabled={step === "auth"}>
              Back
            </button>
            <div className="setup-footer-right">
              <button type="button" className="btn" onClick={goNext} disabled={!canContinue}>
                Continue
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
