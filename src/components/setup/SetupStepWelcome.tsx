type Props = {
  onGetStarted: () => void;
};

export function SetupStepWelcome({ onGetStarted }: Props) {
  return (
    <div className="setup-welcome">
      <img src="/phonton-logo.png" alt="Phonton" className="setup-logo" />
      <h1>Phonton Desktop</h1>
      <p>Goal-driven control room for phonton-cli.</p>
      <div className="toolbar" style={{ justifyContent: "center", marginTop: 28 }}>
        <button type="button" className="btn" onClick={onGetStarted}>
          Get started
        </button>
      </div>
    </div>
  );
}
