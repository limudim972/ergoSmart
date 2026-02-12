import { useEffect, useState } from "react";
import { MenuHeader } from "./MenuHeader";
import { CalibrateBtn } from "./CalibrateBtn";
import { PostureStatus } from "./PostureStatus";

export let btnSelected = false;
export function setBtn(value) {
  btnSelected = value;
}

export function Menu(props) {
  const [state, setState] = useState("Calibration");
  const confidence = props.sideConfidence || {};
  const angleMin = 5;
  const angleMax = 90;
  const liveAngleValue = typeof props.liveSideAngle === "number" ? props.liveSideAngle : null;
  const liveAnglePercent = liveAngleValue === null
    ? null
    : Math.min(100, Math.max(0, ((liveAngleValue - angleMin) / (angleMax - angleMin)) * 100));

  const formatConfidence = (value) => {
    if (typeof value !== "number") return "לא זמין";
    return value.toFixed(2);
  };

  const calibratePose = () => {
    if (props.postureRef.current === -1) {
      console.log("לא ניתן לבצע כיול. לא זוהתה תנוחה.");
    } else {
      btnSelected = true;
      setState("Tracking");
    }
  };

  const updateSoundConfig = (patch) => {
    props.onSoundConfigChange((prev) => ({ ...prev, ...patch }));
  };

  useEffect(() => {
    setState("Calibration");
  }, [props.viewMode]);

  return (
    <div className="menu bg-deep-space bg-opacity-80 backdrop-filter backdrop-blur-lg rounded-3xl p-6 sm:p-8 mb-4 sm:mb-8 w-full max-w-md mx-auto border border-neon-blue border-opacity-30">
      <MenuHeader state={state} viewMode={props.viewMode} />
      <div className="rounded-xl border border-neon-blue border-opacity-30 bg-space-gray bg-opacity-40 p-3 mb-4 text-sm">
        <p className="text-white mb-1">צד במעקב: <span className="text-neon-green uppercase">{confidence.side || "לא זמין"}</span></p>
        <p className="text-white mb-1">אוזן: <span className="text-neon-green">{formatConfidence(confidence.ear)}</span></p>
        <p className="text-white mb-2">כתף: <span className="text-neon-green">{formatConfidence(confidence.shoulder)}</span></p>
      </div>
      <div className="rounded-xl border border-neon-green border-opacity-30 bg-space-gray bg-opacity-40 p-3 mb-4 text-sm">
        <label className="flex items-center gap-2 text-white mb-3">
          <input
            type="checkbox"
            checked={props.soundConfig.enabled}
            onChange={(e) => updateSoundConfig({ enabled: e.target.checked })}
          />
          התראת צליל לפי זווית
        </label>
        <div className="grid grid-cols-1 gap-3">
          <label className="text-white">
            זווית (°): <span className="text-neon-blue">{props.soundConfig.angleThreshold}</span>
            <div className="relative mt-1" dir="ltr">
              <input
                type="range"
                min={angleMin}
                max={angleMax}
                step="1"
                value={props.soundConfig.angleThreshold}
                onChange={(e) => updateSoundConfig({ angleThreshold: Number(e.target.value) })}
                className="w-full"
              />
              {liveAnglePercent !== null && (
                <span
                  className="pointer-events-none absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full border border-white shadow"
                  style={{ left: `calc(${liveAnglePercent}% - 6px)`, backgroundColor: "#ffd166" }}
                  aria-hidden="true"
                />
              )}
            </div>
            <p className="text-xs text-neon-green mt-1 opacity-90">
              זווית נוכחית: <span className="text-white">{liveAngleValue === null ? "לא זמין" : `${liveAngleValue.toFixed(1)}°`}</span>
            </p>
          </label>
          {props.viewMode !== "side" && (
            <label className="text-white">
              משך יציבה לקויה לפני צליל (שניות): <span className="text-neon-blue">{props.soundConfig.durationSeconds}</span>
              <div dir="ltr">
                <input
                  type="range"
                  min="1"
                  max="60"
                  step="1"
                  value={props.soundConfig.durationSeconds}
                  onChange={(e) => updateSoundConfig({ durationSeconds: Number(e.target.value) })}
                  className="mt-1 w-full"
                />
              </div>
              <p className="text-xs text-neon-blue mt-1 opacity-80">הצליל יושמע רק אם יש יציבה לקויה והזווית נשארת מעל הסף למשך הזמן הזה.</p>
            </label>
          )}
        </div>
      </div>
      <PostureStatus state={state} />
      {props.viewMode !== "side" && (
        <div className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4 mt-6">
          <CalibrateBtn state={state} onClickCallback={calibratePose} />
        </div>
      )}
    </div>
  );
}
