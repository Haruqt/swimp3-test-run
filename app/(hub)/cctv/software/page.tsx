export default function CctvSoftwarePage() {
  return (
    <div className="p-8">
      <h1 className="font-display text-2xl font-semibold text-mist">Software</h1>

      <div className="mt-6 space-y-8">
        <div className="rounded-xl bg-white/5 p-6">
          <h2 className="font-display text-lg font-semibold text-mist">
            Download Easy VMS Desktop Software
          </h2>
          <p className="mt-2 text-sm text-mist/70">
            This generic VMS software can help you manage your IP cameras and DVRs.
          </p>
          <p className="mt-2 font-mono text-xs text-mist/50">
            version: EasyVMS_v3.0.0.9450_RC20211112
          </p>
          <button className="mt-4 rounded-lg bg-moss px-5 py-2 text-sm font-medium text-white transition hover:bg-moss-light">
            Download
          </button>
          <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-mist/60">
            <li>Download the Easy VMS Software.</li>
            <li>Extract the zip file. Password: 1234.</li>
            <li>Run the downloaded .exe to start installation.</li>
          </ol>
        </div>

        <div className="rounded-xl bg-white/5 p-6">
          <h2 className="font-display text-lg font-semibold text-mist">
            Download P6SLite on Android Devices
          </h2>
          <p className="mt-2 text-sm text-mist/70">
            P2P video transmission software supporting IPC/NVR/DVR — device management,
            video preview, and playback.
          </p>
          <button className="mt-4 rounded-lg bg-moss px-5 py-2 text-sm font-medium text-white transition hover:bg-moss-light">
            Download on app store
          </button>
        </div>
      </div>
    </div>
  );
}
