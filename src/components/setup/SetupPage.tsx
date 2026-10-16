import { useState } from "react";
import { Glyph } from "../ascii/ascii";
import { useSidecar } from "../../hooks/useSidecar";
import { completeSetup } from "../../lib/setup";
import { SetupHeader } from "./SetupHeader";
import { SetupStepCli } from "./SetupStepCli";
import { SetupStepFinish } from "./SetupStepFinish";
import { SetupStepProvider } from "./SetupStepProvider";
import { SetupStepTheme } from "./SetupStepTheme";
import { SetupStepWelcome } from "./SetupStepWelcome";
import "./setup.css";

const STEPS = ["welcome", "theme", "cli", "provider", "finish"] as const;
export type SetupStep = (typeof STEPS)[number];
const STEP_LABELS: Record<SetupStep, string> = { welcome: "welcome", theme: "theme", cli: "engine", provider: "provider", finish: "finish" };

type Props = {
  onComplete: () => void;
  initialStep?: SetupStep;
};

export function SetupPage({ onComplete, initialStep = "welcome" }: Props) {
  const [step, setStep] = useState<SetupStep>(initialStep);
  const [cliConnected, setCliConnected] = useState(false);
  const [providerReady, setProviderReady] = useState(false);
  const sidecarEnabled = step === "provider" || step === "finish";
  const { state: sidecar } = useSidecar({ enabled: sidecarEnabled });

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

  const canContinue = step === "cli" ? cliConnected : step === "provider" ? providerReady : true;

  return (
    <div className="setup-page">
      <div className="setup-card">
        {step !== "welcome" ? <SetupHeader /> : null}
        {step !== "welcome" ? (
          <ol className="setup-steps" aria-label="Setup progress">
            {STEPS.slice(1).map((s, i) => (
              <li key={s} aria-current={i + 1 === stepIndex ? "step" : undefined} data-done={i + 1 < stepIndex ? "" : undefined}>
                <Glyph state={i + 1 < stepIndex ? "pass" : i + 1 === stepIndex ? "run" : "idle"} /> {STEP_LABELS[s]}
              </li>
            ))}
          </ol>
        ) : null}

        <div className="setup-body">
          {step === "welcome" ? <SetupStepWelcome onGetStarted={goNext} /> : null}
          {step === "theme" ? <SetupStepTheme /> : null}
          {step === "cli" ? <SetupStepCli onConnectedChange={setCliConnected} /> : null}
          {step === "provider" ? <SetupStepProvider onReadyChange={setProviderReady} /> : null}
          {step === "finish" ? (
            <SetupStepFinish
              sidecar={sidecar}
              providerReady={providerReady}
              onOpen={finish}
            />
          ) : null}
        </div>

        {step !== "welcome" && step !== "finish" ? (
          <div className="setup-footer">
            <button type="button" className="btn ghost" onClick={goBack} disabled={stepIndex === 0}>
              ← Back
            </button>
            <div className="setup-footer-right">
              <button type="button" className="btn" onClick={goNext} disabled={!canContinue}>
                Continue →
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
