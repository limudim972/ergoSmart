import './App.css';
import React, {useRef, useEffect, useState} from 'react';
import {Pose} from '@mediapipe/pose';
import * as cam from '@mediapipe/camera_utils';
import Webcam from 'react-webcam';
import {Menu, btnSelected, setBtn} from './components/Menu';
import {LoadingScreen} from './components/LoadingScreen';
import {
  changeStyleProperty,
  badPosture,
  showNotification,
  drawLine,
  drawCircle,
  shouldersLevel,
  backStraight
} from './utils/utilities'

function App() {
  const UI_SETTINGS_STORAGE_KEY = 'ergoSmart.uiSettings';
  const DEFAULT_VIEW_MODE = 'side';
  const DEFAULT_SOUND_CONFIG = {
    enabled: true,
    angleThreshold: 18,
    durationSeconds: 2
  };

  function loadUiSettings() {
    if (typeof window === 'undefined') {
      return {
        viewMode: DEFAULT_VIEW_MODE,
        soundConfig: DEFAULT_SOUND_CONFIG
      };
    }

    try {
      const raw = window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY);
      if (!raw) {
        return {
          viewMode: DEFAULT_VIEW_MODE,
          soundConfig: DEFAULT_SOUND_CONFIG
        };
      }

      const parsed = JSON.parse(raw);
      const viewMode = parsed?.viewMode === 'front' ? 'front' : DEFAULT_VIEW_MODE;
      const enabled = Boolean(parsed?.soundConfig?.enabled);
      const angleThresholdRaw = Number(parsed?.soundConfig?.angleThreshold);
      const durationSecondsRaw = Number(parsed?.soundConfig?.durationSeconds);

      const soundConfig = {
        enabled,
        angleThreshold: Number.isFinite(angleThresholdRaw) ? Math.min(90, Math.max(5, angleThresholdRaw)) : DEFAULT_SOUND_CONFIG.angleThreshold,
        durationSeconds: Number.isFinite(durationSecondsRaw) ? Math.min(60, Math.max(1, durationSecondsRaw)) : DEFAULT_SOUND_CONFIG.durationSeconds
      };

      return { viewMode, soundConfig };
    } catch (error) {
      return {
        viewMode: DEFAULT_VIEW_MODE,
        soundConfig: DEFAULT_SOUND_CONFIG
      };
    }
  }

  function saveUiSettings(settings) {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      // Ignore storage errors and keep running with in-memory state.
    }
  }

  const initialUiSettings = loadUiSettings();

  //reference to canvas & webcam
  const canvasRef = useRef(null);
  const webcamRef = useRef(null);

  //reference to the current posture
  const postureRef = useRef(null); //value of 1 is bad, 0 is good, -1 is undetected
  const goodPostureRef = useRef(null);
  const badPostureCountRef = useRef(0);
  const trackedSideRef = useRef('left');
  const viewModeRef = useRef(initialUiSettings.viewMode);
  const smoothedShoulderRef = useRef(null);
  const smoothedElbowRef = useRef(null);
  const smoothedWristRef = useRef(null);
  const smoothedSideAngleRef = useRef(null);
  const smoothedElbowAngleRef = useRef(null);
  const displayedSideAngleRef = useRef(null);

  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState(initialUiSettings.viewMode);
  const [sideConfidence, setSideConfidence] = useState({
    side: 'left',
    ear: null,
    shoulder: null
  });
  const [soundConfig, setSoundConfig] = useState(initialUiSettings.soundConfig);
  const [liveSideAngle, setLiveSideAngle] = useState(null);
  const [beepSnapshots, setBeepSnapshots] = useState([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState(null);
  const [startupStatus, setStartupStatus] = useState({
    progress: 10,
    stageText: 'טוען מודל...',
    detailText: 'מתחיל את תהליך האתחול',
    isStuck: false,
    frameCount: 0
  });

  const [postureFeedback, setPostureFeedback] = useState('');
  const angleAlertStartRef = useRef(null);
  const lastAngleAlertRef = useRef(0);
  const audioContextRef = useRef(null);
  const hasLoggedLoadedRef = useRef(false);
  const appReadyRef = useRef(false);
  const GOOD_POSTURE_FEEDBACK = "יציבה מצוינת, המשיכו כך!";
  const STARTUP_STUCK_MS = 10000;
  const ANGLE_ALERT_COOLDOWN_MS = 10000;
  const MIN_DETECTION_CONFIDENCE = 0.5;
  const MIN_TRACKING_CONFIDENCE = 0.5;
  const MODEL_COMPLEXITY = 0;
  const VISIBILITY_THRESHOLD = 0.5;
  const SHOULDER_MIN_VISIBILITY = 0.6;
  const SHOULDER_SMOOTHING_ALPHA = 0.2;
  const SHOULDER_DEADZONE_PX = 4;
  const SHOULDER_SOFT_ZONE_PX = 10;
  const SHOULDER_SOFT_ALPHA = 0.1;
  const ELBOW_MIN_VISIBILITY = 0.55;
  const ELBOW_SMOOTHING_ALPHA = 0.18;
  const ELBOW_DEADZONE_PX = 8;
  const ELBOW_SOFT_ZONE_PX = 18;
  const ELBOW_SOFT_ALPHA = 0.07;
  const WRIST_MIN_VISIBILITY = 0.5;
  const WRIST_SMOOTHING_ALPHA = 0.16;
  const WRIST_DEADZONE_PX = 9;
  const WRIST_SOFT_ZONE_PX = 20;
  const WRIST_SOFT_ALPHA = 0.06;
  const EAR_POINT_RADIUS = 30;
  const ARM_POINT_RADIUS = 30;
  const ELBOW_POINT_RADIUS = 24;
  const WRIST_POINT_RADIUS = 20;
  const LANDMARK_COLORS = {
    ear: '#ffd166',
    shoulder: '#7bffb2',
    elbow: '#8ecae6',
    wrist: '#fb8500'
  };
  const ANGLE_LINE_COLOR = '#f8f9fa';
  const ARM_LINE_COLOR = '#a8dadc';
  const ANGLE_TEXT_COLOR = '#f8f9fa';
  const SIDE_ANGLE_LINE_WIDTH = 20;
  const ARM_LINE_WIDTH = 10;
  const SIDE_ANGLE_TEXT_FONT_SIZE = 60;
  const SIDE_ANGLE_TEXT_OFFSET_PX = 130;
  const SIDE_ANGLE_SMOOTHING_ALPHA = 0.15;
  const SIDE_ANGLE_DISPLAY_STEP_DEGREES = 2;
  const ELBOW_ANGLE_SMOOTHING_ALPHA = 0.2;
  const MAX_BEEP_SNAPSHOTS = 8;
  const SIDE_LANDMARKS = {
    left: { ear: 7, shoulder: 11, elbow: 13, wrist: 15 },
    right: { ear: 8, shoulder: 12, elbow: 14, wrist: 16 }
  };
  const POINT_OFFSET_LIMIT = 0.2;
  const POINT_DRAG_HIT_RADIUS_PX = 20;
  const SIDE_POINT_OFFSETS_STORAGE_KEY = 'ergoSmart.sidePointOffsets';
  const DEFAULT_SIDE_POINT_OFFSETS = {
    ear: { x: 0, y: 0 },
    shoulder: { x: 0, y: 0 },
    elbow: { x: 0, y: 0 },
    wrist: { x: 0, y: 0 }
  };

  // Keep refs in sync immediately so frame callbacks always read latest mode.
  viewModeRef.current = viewMode;
  const soundConfigRef = useRef(soundConfig);
  soundConfigRef.current = soundConfig;
  const sidePointOffsetsRef = useRef(loadSidePointOffsets());
  const latestRawSidePointsRef = useRef({
    ear: null,
    shoulder: null,
    elbow: null,
    wrist: null
  });
  const draggingPointRef = useRef(null);
  const startupBeginTsRef = useRef(Date.now());
  const startupFrameCountRef = useRef(0);
  const modelLoadStartTsRef = useRef(null);
  const initRunIdRef = useRef(0);
  const poseRef = useRef(null);
  const cameraRef = useRef(null);
  const isSendingFrameRef = useRef(false);
  const isPoseReadyRef = useRef(false);
  const startupRetryTimerRef = useRef(null);
  const STARTUP_AUTO_RELOAD_STORAGE_KEY = 'ergoSmart.startupAutoReloadAttempts';
  const STARTUP_AUTO_RELOAD_MAX_ATTEMPTS = 1;
  const STARTUP_AUTO_RELOAD_DELAY_MS = 2000;

  const restartApp = () => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      window.sessionStorage.removeItem(STARTUP_AUTO_RELOAD_STORAGE_KEY);
    } catch (error) {
      // Ignore storage errors and continue with reload.
    }
    window.location.reload();
  };

  function playAngleAlert(severity = 1) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      return;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const now = ctx.currentTime;
    const oscillator = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const clampedSeverity = Math.max(0, Math.min(1, severity));
    const frequency = 760 + (clampedSeverity * 520);
    const volume = 0.06 + (clampedSeverity * 0.08);

    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(frequency, now);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(volume * 0.7, now + 0.25);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.58);
  }

  function isVisible(landmark) {
    if (!landmark) return false;
    if (typeof landmark.visibility === 'undefined') return true;
    return landmark.visibility > VISIBILITY_THRESHOLD;
  }

  function getVisibilityValue(landmark) {
    if (!landmark || typeof landmark.visibility !== 'number') return null;
    return landmark.visibility;
  }

  function chooseTrackedSide(landmarks) {
    const scoreSide = (side) => {
      const indices = SIDE_LANDMARKS[side];
      return [indices.shoulder, indices.ear]
        .reduce((sum, idx) => {
          const visibility = landmarks[idx]?.visibility;
          return sum + (typeof visibility === 'number' ? visibility : 0.5);
        }, 0);
    };

    return scoreSide('left') >= scoreSide('right') ? 'left' : 'right';
  }

  function getStableShoulderPoint(shoulder, canvasWidth, canvasHeight) {
    if (!shoulder) return smoothedShoulderRef.current;

    const visibility = typeof shoulder.visibility === 'number' ? shoulder.visibility : 1;
    if (visibility < SHOULDER_MIN_VISIBILITY) {
      return smoothedShoulderRef.current;
    }

    if (!smoothedShoulderRef.current) {
      smoothedShoulderRef.current = { x: shoulder.x, y: shoulder.y };
      return smoothedShoulderRef.current;
    }

    const prev = smoothedShoulderRef.current;
    const next = getAdaptiveSmoothedPoint(
      prev,
      shoulder,
      canvasWidth,
      canvasHeight,
      SHOULDER_DEADZONE_PX,
      SHOULDER_SOFT_ZONE_PX,
      SHOULDER_SOFT_ALPHA,
      SHOULDER_SMOOTHING_ALPHA
    );
    smoothedShoulderRef.current = next;
    return next;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalizeSidePointOffsets(offsets) {
    const earX = Number(offsets?.ear?.x);
    const earY = Number(offsets?.ear?.y);
    const shoulderX = Number(offsets?.shoulder?.x);
    const shoulderY = Number(offsets?.shoulder?.y);
    const elbowX = Number(offsets?.elbow?.x);
    const elbowY = Number(offsets?.elbow?.y);
    const wristX = Number(offsets?.wrist?.x);
    const wristY = Number(offsets?.wrist?.y);

    return {
      ear: {
        x: Number.isFinite(earX) ? clamp(earX, -POINT_OFFSET_LIMIT, POINT_OFFSET_LIMIT) : 0,
        y: Number.isFinite(earY) ? clamp(earY, -POINT_OFFSET_LIMIT, POINT_OFFSET_LIMIT) : 0
      },
      shoulder: {
        x: Number.isFinite(shoulderX) ? clamp(shoulderX, -POINT_OFFSET_LIMIT, POINT_OFFSET_LIMIT) : 0,
        y: Number.isFinite(shoulderY) ? clamp(shoulderY, -POINT_OFFSET_LIMIT, POINT_OFFSET_LIMIT) : 0
      },
      elbow: {
        x: Number.isFinite(elbowX) ? clamp(elbowX, -POINT_OFFSET_LIMIT, POINT_OFFSET_LIMIT) : 0,
        y: Number.isFinite(elbowY) ? clamp(elbowY, -POINT_OFFSET_LIMIT, POINT_OFFSET_LIMIT) : 0
      },
      wrist: {
        x: Number.isFinite(wristX) ? clamp(wristX, -POINT_OFFSET_LIMIT, POINT_OFFSET_LIMIT) : 0,
        y: Number.isFinite(wristY) ? clamp(wristY, -POINT_OFFSET_LIMIT, POINT_OFFSET_LIMIT) : 0
      }
    };
  }

  function getStableElbowPoint(elbow, canvasWidth, canvasHeight) {
    if (!elbow) return smoothedElbowRef.current;

    const visibility = typeof elbow.visibility === 'number' ? elbow.visibility : 1;
    if (visibility < ELBOW_MIN_VISIBILITY) {
      return smoothedElbowRef.current;
    }

    if (!smoothedElbowRef.current) {
      smoothedElbowRef.current = { ...elbow };
      return smoothedElbowRef.current;
    }

    const prev = smoothedElbowRef.current;
    const next = getAdaptiveSmoothedPoint(
      prev,
      elbow,
      canvasWidth,
      canvasHeight,
      ELBOW_DEADZONE_PX,
      ELBOW_SOFT_ZONE_PX,
      ELBOW_SOFT_ALPHA,
      ELBOW_SMOOTHING_ALPHA
    );
    smoothedElbowRef.current = next;
    return next;
  }

  function getStableWristPoint(wrist, canvasWidth, canvasHeight) {
    if (!wrist) return smoothedWristRef.current;

    const visibility = typeof wrist.visibility === 'number' ? wrist.visibility : 1;
    if (visibility < WRIST_MIN_VISIBILITY) {
      return smoothedWristRef.current;
    }

    if (!smoothedWristRef.current) {
      smoothedWristRef.current = { ...wrist };
      return smoothedWristRef.current;
    }

    const prev = smoothedWristRef.current;
    const next = getAdaptiveSmoothedPoint(
      prev,
      wrist,
      canvasWidth,
      canvasHeight,
      WRIST_DEADZONE_PX,
      WRIST_SOFT_ZONE_PX,
      WRIST_SOFT_ALPHA,
      WRIST_SMOOTHING_ALPHA
    );
    smoothedWristRef.current = next;
    return next;
  }

  function getAdaptiveSmoothedPoint(prev, incoming, canvasWidth, canvasHeight, deadzonePx, softZonePx, softAlpha, fastAlpha) {
    const deltaPx = Math.hypot(
      (incoming.x - prev.x) * canvasWidth,
      (incoming.y - prev.y) * canvasHeight
    );

    // Hold point steady while movement is inside the jitter band.
    if (deltaPx < deadzonePx) {
      return prev;
    }

    const alpha = deltaPx < softZonePx ? softAlpha : fastAlpha;
    const next = {
      ...incoming,
      x: prev.x + ((incoming.x - prev.x) * alpha),
      y: prev.y + ((incoming.y - prev.y) * alpha)
    };

    // Suppress sub-pixel tail drift after smoothing.
    const residualPx = Math.hypot(
      (next.x - prev.x) * canvasWidth,
      (next.y - prev.y) * canvasHeight
    );
    if (residualPx < 0.6) {
      return prev;
    }

    return next;
  }

  function loadSidePointOffsets() {
    if (typeof window === 'undefined') {
      return DEFAULT_SIDE_POINT_OFFSETS;
    }

    try {
      const stored = window.localStorage.getItem(SIDE_POINT_OFFSETS_STORAGE_KEY);
      if (!stored) {
        return DEFAULT_SIDE_POINT_OFFSETS;
      }
      return normalizeSidePointOffsets(JSON.parse(stored));
    } catch (error) {
      return DEFAULT_SIDE_POINT_OFFSETS;
    }
  }

  function saveSidePointOffsets(offsets) {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      window.localStorage.setItem(SIDE_POINT_OFFSETS_STORAGE_KEY, JSON.stringify(offsets));
    } catch (error) {
      // Ignore storage errors; app should keep working with in-memory values.
    }
  }

  function applyPointOffset(point, offset) {
    if (!point) return point;
    if (!offset) return point;
    return {
      ...point,
      x: clamp(point.x + offset.x, 0, 1),
      y: clamp(point.y + offset.y, 0, 1)
    };
  }

  function computeJointAngle(a, b, c) {
    if (!a || !b || !c) return null;
    const vectorBAx = a.x - b.x;
    const vectorBAy = a.y - b.y;
    const vectorBCx = c.x - b.x;
    const vectorBCy = c.y - b.y;
    const magnitudeBA = Math.hypot(vectorBAx, vectorBAy);
    const magnitudeBC = Math.hypot(vectorBCx, vectorBCy);
    if (!magnitudeBA || !magnitudeBC) return null;
    const dot = (vectorBAx * vectorBCx) + (vectorBAy * vectorBCy);
    const cosTheta = clamp(dot / (magnitudeBA * magnitudeBC), -1, 1);
    return Math.acos(cosTheta) * (180 / Math.PI);
  }

  function smoothAngleValue(nextAngle, angleRef, alpha) {
    if (typeof nextAngle !== 'number') {
      angleRef.current = null;
      return null;
    }
    if (typeof angleRef.current !== 'number') {
      angleRef.current = nextAngle;
      return nextAngle;
    }
    angleRef.current = angleRef.current + ((nextAngle - angleRef.current) * alpha);
    return angleRef.current;
  }

  function captureBeepSnapshot(canvasElement) {
    const videoElement = webcamRef.current?.video;
    if (!videoElement || !canvasElement?.width || !canvasElement?.height) {
      return;
    }
    try {
      const snapshotCanvas = document.createElement('canvas');
      snapshotCanvas.width = canvasElement.width;
      snapshotCanvas.height = canvasElement.height;
      const snapshotContext = snapshotCanvas.getContext('2d');
      snapshotContext.drawImage(videoElement, 0, 0, snapshotCanvas.width, snapshotCanvas.height);
      snapshotContext.drawImage(canvasElement, 0, 0, snapshotCanvas.width, snapshotCanvas.height);

      const snapshot = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        dataUrl: snapshotCanvas.toDataURL('image/jpeg', 0.85),
        createdAt: new Date().toLocaleTimeString('he-IL')
      };

      setBeepSnapshots((prev) => [snapshot, ...prev].slice(0, MAX_BEEP_SNAPSHOTS));
    } catch (error) {
      console.error('[Snapshot] Failed to capture beep frame:', error);
    }
  }

  function getPostureFeedback(landmarks, goodPosture) {
    let feedback = [];

    // Check head position
    const headYDiff = landmarks[0].y - goodPosture[0].y;
    if (headYDiff > 0.03) {
      feedback.push("הרימו מעט את הראש");
    } else if (headYDiff < -0.03) {
      feedback.push("הורידו מעט את הראש");
    }

    // Check shoulders
    const shoulderYDiff = Math.abs(landmarks[11].y - landmarks[12].y);
    if (shoulderYDiff > 0.02) {
      if (landmarks[11].y > landmarks[12].y) {
        feedback.push("אזנו את הכתפיים באמצעות הרמת כתף שמאל");
      } else {
        feedback.push("אזנו את הכתפיים באמצעות הרמת כתף ימין");
      }
    }

    // Check back straightness
    const midShoulder = {
      x: (landmarks[11].x + landmarks[12].x) / 2,
      y: (landmarks[11].y + landmarks[12].y) / 2
    };
    const midHip = {
      x: (landmarks[23].x + landmarks[24].x) / 2,
      y: (landmarks[23].y + landmarks[24].y) / 2
    };
    const backAngle = Math.atan2(midHip.y - midShoulder.y, midHip.x - midShoulder.x);
    const goodBackAngle = Math.atan2(
      (goodPosture[23].y + goodPosture[24].y) / 2 - (goodPosture[11].y + goodPosture[12].y) / 2,
      (goodPosture[23].x + goodPosture[24].x) / 2 - (goodPosture[11].x + goodPosture[12].x) / 2
    );

    if (Math.abs(backAngle - goodBackAngle) > 0.1) {
      if (backAngle > goodBackAngle) {
        feedback.push("יישרו את הגב על ידי ישיבה זקופה יותר");
      } else {
        feedback.push("שחררו מעט את הגב");
      }
    }

    // Check if leaning too far forward or backward
    const shoulderToHipAngle = Math.atan2(midHip.y - midShoulder.y, midHip.x - midShoulder.x);
    const goodShoulderToHipAngle = Math.atan2(
      (goodPosture[23].y + goodPosture[24].y) / 2 - (goodPosture[11].y + goodPosture[12].y) / 2,
      (goodPosture[23].x + goodPosture[24].x) / 2 - (goodPosture[11].x + goodPosture[12].x) / 2
    );

    if (shoulderToHipAngle - goodShoulderToHipAngle > 0.1) {
      feedback.push("שבו מעט לאחור, אתם נוטים יותר מדי קדימה");
    } else if (goodShoulderToHipAngle - shoulderToHipAngle > 0.1) {
      feedback.push("שבו מעט קדימה, אתם נוטים יותר מדי אחורה");
    }

    // Check for hunched shoulders
    const neckLength = Math.hypot(landmarks[0].x - midShoulder.x, landmarks[0].y - midShoulder.y);
    const goodNeckLength = Math.hypot(
      goodPosture[0].x - ((goodPosture[11].x + goodPosture[12].x) / 2),
      goodPosture[0].y - ((goodPosture[11].y + goodPosture[12].y) / 2)
    );
    if (neckLength < goodNeckLength * 0.95) {
      feedback.push("שחררו את הכתפיים ומתחו את הצוואר");
    }

    // Provide positive feedback if posture is good
    if (feedback.length === 0) {
      feedback.push(GOOD_POSTURE_FEEDBACK);
    }

    return feedback.join(". ");
  }

  //run this function when pose results are determined
  function onResults(results){
    let sideAngleDeviation = null;
    startupFrameCountRef.current += 1;
    const startupElapsedMs = Date.now() - startupBeginTsRef.current;

    if(!hasLoggedLoadedRef.current){ 
      hasLoggedLoadedRef.current = true;
      const modelLoadDurationMs = modelLoadStartTsRef.current
        ? Date.now() - modelLoadStartTsRef.current
        : null;
      console.log(
        modelLoadDurationMs === null
          ? "[MediaPipe] Pose model loaded."
          : `[MediaPipe] Pose model loaded in ${modelLoadDurationMs}ms (${(modelLoadDurationMs / 1000).toFixed(2)}s).`
      );
      setStartupStatus({
        progress: 65,
        stageText: 'מזהה תנוחה ראשונה...',
        detailText: `פריימים שנבדקו: ${startupFrameCountRef.current}`,
        isStuck: false
      });
    }
    
    // Detailed startup frame progress
    if (!appReadyRef.current && startupFrameCountRef.current % 5 === 0) {
      const elapsedSec = (startupElapsedMs / 1000).toFixed(2);
      const fps = (startupFrameCountRef.current / (startupElapsedMs / 1000)).toFixed(1);
      console.log(`[Startup Frame ${startupFrameCountRef.current}] Elapsed: ${elapsedSec}s | FPS: ${fps}`);
    }

    if (!results.poseLandmarks) { //if the model is unable to detect a pose 
      console.log("לא זוהתה תנוחה.");
      if (!appReadyRef.current) {
        const isStuck = startupElapsedMs >= STARTUP_STUCK_MS;
        const elapsedSec = (startupElapsedMs / 1000).toFixed(1);
        setStartupStatus({
          progress: isStuck ? 90 : 70,
          stageText: isStuck ? 'נראה שהתהליך נתקע בזיהוי תנוחה ראשונה' : 'מזהה תנוחה ראשונה...',
          detailText: isStuck
            ? `עברו ${elapsedSec}s ללא זיהוי. בדקו תאורה, מרחק מצלמה ושהגוף כולו בפריים`
            : `פריימים שנבדקו: ${startupFrameCountRef.current} | זמן: ${elapsedSec}s`,
          isStuck
        });
      }
      postureRef.current = -1;//change pose state to "undetected", can't track pose
      setLiveSideAngle(null);
      smoothedShoulderRef.current = null;
      smoothedElbowRef.current = null;
      smoothedWristRef.current = null;
      smoothedSideAngleRef.current = null;
      smoothedElbowAngleRef.current = null;
      displayedSideAngleRef.current = null;
      setSideConfidence({
        side: trackedSideRef.current,
        ear: null,
        shoulder: null
      });
      changeStyleProperty("--btn-color","rgba(0, 105, 237, 0.25)"); //fade out the calubrate button by reducing opacity
      return;
    }

    let landmarks = results.poseLandmarks;
    if (!appReadyRef.current) {
      appReadyRef.current = true;
      setLoaded(true);
      changeStyleProperty("--loader-display","none");
      if (typeof window !== 'undefined') {
        try {
          window.sessionStorage.removeItem(STARTUP_AUTO_RELOAD_STORAGE_KEY);
        } catch (error) {
          // Ignore storage errors.
        }
      }
      setStartupStatus({
        progress: 100,
        stageText: 'המערכת מוכנה',
        detailText: 'זוהתה תנוחה ראשונה בהצלחה',
        isStuck: false
      });
    }
    postureRef.current = null;
    changeStyleProperty("--btn-color","rgba(0, 105, 237, 1)"); //make the calibrate button solid

    canvasRef.current.width = webcamRef.current.video.videoWidth
    canvasRef.current.height = webcamRef.current.video.videoHeight

    const canvasElement = canvasRef.current;
    const canvasCtx = canvasElement.getContext("2d");  //canvas context
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    const currentViewMode = viewModeRef.current;
    canvasCtx.globalCompositeOperation = 'source-over';
    canvasCtx.restore();

    if (currentViewMode === 'side') {
      const side = goodPostureRef.current ? trackedSideRef.current : chooseTrackedSide(landmarks);
      const indices = SIDE_LANDMARKS[side];
      const shoulder = landmarks[indices.shoulder];
      const stableShoulder = getStableShoulderPoint(shoulder, canvasElement.width, canvasElement.height);
      const rawEar = landmarks[indices.ear];
      const elbow = getStableElbowPoint(landmarks[indices.elbow], canvasElement.width, canvasElement.height);
      const wrist = getStableWristPoint(landmarks[indices.wrist], canvasElement.width, canvasElement.height);
      latestRawSidePointsRef.current = {
        ear: rawEar,
        shoulder: stableShoulder,
        elbow,
        wrist
      };
      const ear = applyPointOffset(rawEar, sidePointOffsetsRef.current.ear);
      const adjustedShoulder = applyPointOffset(stableShoulder, sidePointOffsetsRef.current.shoulder);
      const adjustedElbow = applyPointOffset(elbow, sidePointOffsetsRef.current.elbow);
      const adjustedWrist = applyPointOffset(wrist, sidePointOffsetsRef.current.wrist);

      setSideConfidence({
        side,
        ear: getVisibilityValue(ear),
        shoulder: getVisibilityValue(shoulder)
      });

      if (adjustedShoulder && isVisible(adjustedElbow)) {
        drawLine(
          canvasCtx,
          adjustedShoulder.x * canvasElement.width,
          adjustedShoulder.y * canvasElement.height,
          adjustedElbow.x * canvasElement.width,
          adjustedElbow.y * canvasElement.height,
          ARM_LINE_COLOR,
          ARM_LINE_WIDTH
        );
      }
      if (isVisible(adjustedElbow) && isVisible(adjustedWrist)) {
        drawLine(
          canvasCtx,
          adjustedElbow.x * canvasElement.width,
          adjustedElbow.y * canvasElement.height,
          adjustedWrist.x * canvasElement.width,
          adjustedWrist.y * canvasElement.height,
          ARM_LINE_COLOR,
          ARM_LINE_WIDTH
        );
      }

      if (adjustedShoulder && isVisible(adjustedElbow) && isVisible(adjustedWrist)) {
        const shoulderPoint = {
          x: adjustedShoulder.x * canvasElement.width,
          y: adjustedShoulder.y * canvasElement.height
        };
        const elbowPoint = {
          x: adjustedElbow.x * canvasElement.width,
          y: adjustedElbow.y * canvasElement.height
        };
        const wristPoint = {
          x: adjustedWrist.x * canvasElement.width,
          y: adjustedWrist.y * canvasElement.height
        };
        const elbowAngle = computeJointAngle(shoulderPoint, elbowPoint, wristPoint);
        smoothAngleValue(elbowAngle, smoothedElbowAngleRef, ELBOW_ANGLE_SMOOTHING_ALPHA);
      } else {
        smoothedElbowAngleRef.current = null;
      }

      if (adjustedShoulder && isVisible(ear)) {
        const shoulderX = adjustedShoulder.x * canvasElement.width;
        const shoulderY = adjustedShoulder.y * canvasElement.height;
        const earX = ear.x * canvasElement.width;
        const earY = ear.y * canvasElement.height;

        drawLine(canvasCtx, shoulderX, shoulderY, earX, earY, ANGLE_LINE_COLOR, SIDE_ANGLE_LINE_WIDTH);

        const dx = earX - shoulderX;
        const dy = shoulderY - earY;
        const verticalDeviationAngle = Math.atan2(Math.abs(dx), Math.max(Math.abs(dy), 0.0001)) * (180 / Math.PI);
        const smoothedSideAngle = smoothAngleValue(verticalDeviationAngle, smoothedSideAngleRef, SIDE_ANGLE_SMOOTHING_ALPHA);
        sideAngleDeviation = smoothedSideAngle;
        const midX = (shoulderX + earX) / 2;
        const midY = (shoulderY + earY) / 2;
        const lineLength = Math.hypot(dx, earY - shoulderY) || 1;
        const normalX = -(earY - shoulderY) / lineLength;
        const normalY = (earX - shoulderX) / lineLength;
        const textX = midX + (normalX * SIDE_ANGLE_TEXT_OFFSET_PX);
        const textY = midY + (normalY * SIDE_ANGLE_TEXT_OFFSET_PX);

        canvasCtx.font = `900 ${SIDE_ANGLE_TEXT_FONT_SIZE}px Roboto, sans-serif`;
        canvasCtx.lineWidth = 15;
        canvasCtx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        canvasCtx.textAlign = 'center';
        canvasCtx.textBaseline = 'middle';
        const nextDisplayAngle = Math.round(smoothedSideAngle);
        if (typeof displayedSideAngleRef.current !== 'number') {
          displayedSideAngleRef.current = nextDisplayAngle;
        } else if (Math.abs(nextDisplayAngle - displayedSideAngleRef.current) >= SIDE_ANGLE_DISPLAY_STEP_DEGREES) {
          displayedSideAngleRef.current = nextDisplayAngle;
        }
        canvasCtx.strokeText(`${displayedSideAngleRef.current}°`, textX, textY);
        canvasCtx.fillStyle = ANGLE_TEXT_COLOR;
        canvasCtx.fillText(`${displayedSideAngleRef.current}°`, textX, textY);
      } else {
        smoothedSideAngleRef.current = null;
        displayedSideAngleRef.current = null;
      }

      if (adjustedShoulder) {
        drawCircle(
          canvasCtx,
          adjustedShoulder.x * canvasElement.width,
          adjustedShoulder.y * canvasElement.height,
          ARM_POINT_RADIUS,
          LANDMARK_COLORS.shoulder
        );
      }
      if (isVisible(ear)) {
        drawCircle(canvasCtx, ear.x * canvasElement.width, ear.y * canvasElement.height, EAR_POINT_RADIUS, LANDMARK_COLORS.ear);
      }
      if (isVisible(adjustedElbow)) {
        drawCircle(
          canvasCtx,
          adjustedElbow.x * canvasElement.width,
          adjustedElbow.y * canvasElement.height,
          ELBOW_POINT_RADIUS,
          LANDMARK_COLORS.elbow
        );
      }
      if (isVisible(adjustedWrist)) {
        drawCircle(
          canvasCtx,
          adjustedWrist.x * canvasElement.width,
          adjustedWrist.y * canvasElement.height,
          WRIST_POINT_RADIUS,
          LANDMARK_COLORS.wrist
        );
      }
      const roundedAngle = typeof sideAngleDeviation === 'number'
        ? Number(sideAngleDeviation.toFixed(1))
        : null;
      setLiveSideAngle((prev) => (prev === roundedAngle ? prev : roundedAngle));
    } else {
      smoothedElbowRef.current = null;
      smoothedWristRef.current = null;
      smoothedSideAngleRef.current = null;
      smoothedElbowAngleRef.current = null;
      displayedSideAngleRef.current = null;
      setLiveSideAngle((prev) => (prev === null ? prev : null));
    }

    if(btnSelected){
      goodPostureRef.current = landmarks.map((landmark) => ({...landmark})); // obtain a copy of the calibrated pose
      trackedSideRef.current = chooseTrackedSide(landmarks);
      badPostureCountRef.current = 0;
      console.log("בוצע כיול חדש ונשמרו נקודות הייחוס.");
      setBtn(false);
    }

    if(currentViewMode !== 'side' && !goodPostureRef.current){ //the calibrate button has not been selected yet
      return;
    }

    let feedback = '';
    let isBadPosture = false;

    if (currentViewMode === 'side') {
      const angleThreshold = soundConfigRef.current.angleThreshold;
      if (typeof sideAngleDeviation === 'number') {
        const roundedAngle = Number(sideAngleDeviation.toFixed(1));
        isBadPosture = roundedAngle > angleThreshold;
        feedback = isBadPosture
          ? `זווית חריגה: ${roundedAngle}° (מעל ${angleThreshold}°)`
          : GOOD_POSTURE_FEEDBACK;
      } else {
        isBadPosture = true;
        feedback = "לא ניתן לחשב זווית כרגע";
      }

      if (typeof sideAngleDeviation === 'number' && soundConfigRef.current.enabled) {
        const now = Date.now();
        const { angleThreshold, durationSeconds } = soundConfigRef.current;
        const durationMs = durationSeconds * 1000;

        if (sideAngleDeviation > angleThreshold) {
          if (!angleAlertStartRef.current) {
            angleAlertStartRef.current = now;
          }

          const sustainedMs = now - angleAlertStartRef.current;
          if (sustainedMs >= durationMs && now - lastAngleAlertRef.current >= ANGLE_ALERT_COOLDOWN_MS) {
            const severity = Math.min(1, (sideAngleDeviation - angleThreshold) / 20);
            const roundedAngleForLog = Number(sideAngleDeviation.toFixed(1));
            console.log(
              `[Beep Alert] ranAt=${new Date(now).toISOString()} angle=${roundedAngleForLog} threshold=${angleThreshold}`
            );
            playAngleAlert(severity);
            captureBeepSnapshot(canvasElement);
            lastAngleAlertRef.current = now;
          }
        } else {
          angleAlertStartRef.current = null;
        }
      } else {
        angleAlertStartRef.current = null;
      }
    } else {
      angleAlertStartRef.current = null;
      const leftShoulder = landmarks[11];
      const rightShoulder = landmarks[12];
      const shoulderColor = shouldersLevel(leftShoulder, rightShoulder) ? 'green' : 'red';
      drawLine(
        canvasCtx,
        leftShoulder.x * canvasElement.width,
        leftShoulder.y * canvasElement.height,
        rightShoulder.x * canvasElement.width,
        rightShoulder.y * canvasElement.height,
        shoulderColor,
        4
      );

      const midShoulder = {
        x: (leftShoulder.x + rightShoulder.x) / 2,
        y: (leftShoulder.y + rightShoulder.y) / 2
      };
      const midHip = {
        x: (landmarks[23].x + landmarks[24].x) / 2,
        y: (landmarks[23].y + landmarks[24].y) / 2
      };
      const midKnee = {
        x: (landmarks[25].x + landmarks[26].x) / 2,
        y: (landmarks[25].y + landmarks[26].y) / 2
      };
      const backColor = backStraight(midShoulder, midHip, midKnee) ? 'green' : 'red';
      drawLine(
        canvasCtx,
        midShoulder.x * canvasElement.width,
        midShoulder.y * canvasElement.height,
        midHip.x * canvasElement.width,
        midHip.y * canvasElement.height,
        backColor,
        4
      );
      drawLine(
        canvasCtx,
        midHip.x * canvasElement.width,
        midHip.y * canvasElement.height,
        midKnee.x * canvasElement.width,
        midKnee.y * canvasElement.height,
        backColor,
        4
      );

      const nose = landmarks[0];
      const headColor = nose.y < goodPostureRef.current[0].y ? 'green' : 'red';
      drawCircle(canvasCtx, nose.x * canvasElement.width, nose.y * canvasElement.height, 10, headColor);

      feedback = getPostureFeedback(landmarks, goodPostureRef.current);
      isBadPosture = badPosture(landmarks, goodPostureRef.current);
    }

    setPostureFeedback(feedback === GOOD_POSTURE_FEEDBACK ? '' : feedback);

    if(isBadPosture){
      badPostureCountRef.current++;
      changeStyleProperty('--posture-status',"'דורש שיפור'");
      if(badPostureCountRef.current >= 60){ // 60 frames = 2 seconds of bad posture
        showNotification("תקנו את היציבה שלכם");

        badPostureCountRef.current = 0;
      }
    } else {
      badPostureCountRef.current = 0;
      changeStyleProperty('--posture-status',"'טוב'");
    }
  }

  /* eslint-disable react-hooks/exhaustive-deps */
  useEffect(()=>{
    const runId = ++initRunIdRef.current;
    let isCancelled = false;
    const isCurrentRun = () => !isCancelled && initRunIdRef.current === runId;

    const updateStartupStage = (progress, stageText, detailText, isStuck = false) => {
      if (!isCurrentRun()) return;
      setStartupStatus((prev) => ({
        ...prev,
        progress,
        stageText,
        detailText,
        isStuck
      }));
    };

    const waitForVideoReady = (videoEl, timeoutMs = 12000) => new Promise((resolve, reject) => {
      if (!videoEl) {
        reject(new Error('Webcam video element is not available.'));
        return;
      }
      if (videoEl.readyState >= 2) {
        resolve();
        return;
      }

      const timeoutId = window.setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out waiting for camera metadata after ${timeoutMs}ms.`));
      }, timeoutMs);

      const onReady = () => {
        cleanup();
        resolve();
      };

      const cleanup = () => {
        window.clearTimeout(timeoutId);
        videoEl.removeEventListener('loadedmetadata', onReady);
        videoEl.removeEventListener('canplay', onReady);
      };

      videoEl.addEventListener('loadedmetadata', onReady);
      videoEl.addEventListener('canplay', onReady);
    });

    const initialize = async () => {
      startupBeginTsRef.current = Date.now();
      startupFrameCountRef.current = 0;
      modelLoadStartTsRef.current = Date.now();
      isPoseReadyRef.current = false;

      console.log(`[MediaPipe] Starting Pose model load at ${new Date(modelLoadStartTsRef.current).toISOString()}.`);
      updateStartupStage(20, 'טוען מנוע Pose...', 'מכין את מודול הזיהוי');

      const pose = new Pose({locateFile: (file) => {
        return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
      }});
      poseRef.current = pose;

      pose.setOptions({
        modelComplexity: MODEL_COMPLEXITY,
        smoothLandmarks: true,
        enableSegmentation: false,
        smoothSegmentation: false,
        minDetectionConfidence: MIN_DETECTION_CONFIDENCE,
        minTrackingConfidence: MIN_TRACKING_CONFIDENCE
      });
      pose.onResults(onResults);

      if (!webcamRef.current?.video) {
        throw new Error('Webcam not mounted yet.');
      }

      updateStartupStage(35, 'מפעיל מצלמה...', 'ממתין למטא-דאטה מהמצלמה');
      await waitForVideoReady(webcamRef.current.video);
      if (!isCurrentRun()) return;

      updateStartupStage(50, 'מחמם את המודל...', 'הרצה ראשונה של Pose (WASM/WebGL)');
      await pose.send({ image: webcamRef.current.video });
      if (!isCurrentRun()) return;
      isPoseReadyRef.current = true;

      updateStartupStage(70, 'מתחיל זרימת וידאו...', 'עיבוד פריימים רציף');
      const camera = new cam.Camera(webcamRef.current.video, {
        onFrame: async () => {
          if (!isPoseReadyRef.current || isSendingFrameRef.current || !poseRef.current || !webcamRef.current?.video) {
            return;
          }
          isSendingFrameRef.current = true;
          try {
            await poseRef.current.send({ image: webcamRef.current.video });
          } finally {
            isSendingFrameRef.current = false;
          }
        },
        width: 640,
        height: 480
      });
      cameraRef.current = camera;
      await camera.start();
      if (!isCurrentRun()) return;
      updateStartupStage(85, 'ממתין לזיהוי תנוחה...', 'מחפש תנוחה ראשונה בפריים');
    };

    const handleStartupFailure = (error) => {
      if (!isCurrentRun()) return;
      const rawMessage = String(error?.message || error || '');
      const isAbortSignature = /Module\.arguments|arguments_|Aborted\(/i.test(rawMessage);
      const fallbackMessage = 'טעינת המודל נכשלה. נסו לרענן או לבדוק חיבור רשת.';

      if (typeof window !== 'undefined' && isAbortSignature) {
        let attempts = 0;
        try {
          attempts = Number(window.sessionStorage.getItem(STARTUP_AUTO_RELOAD_STORAGE_KEY) || '0');
        } catch (storageError) {
          attempts = 0;
        }

        if (attempts < STARTUP_AUTO_RELOAD_MAX_ATTEMPTS) {
          try {
            window.sessionStorage.setItem(STARTUP_AUTO_RELOAD_STORAGE_KEY, String(attempts + 1));
          } catch (storageError) {
            // Ignore storage errors and still try reload.
          }
          updateStartupStage(
            100,
            'שגיאת אתחול',
            'אירעה שגיאת WASM/MediaPipe. מרענן אוטומטית בעוד 2 שניות...',
            true
          );
          startupRetryTimerRef.current = window.setTimeout(() => {
            window.location.reload();
          }, STARTUP_AUTO_RELOAD_DELAY_MS);
          return;
        }
      }

      updateStartupStage(
        100,
        'שגיאת אתחול',
        rawMessage || fallbackMessage,
        true
      );
    };

    initialize().catch((error) => {
      console.error('[MediaPipe] Startup failed:', error);
      handleStartupFailure(error);
    });

    if(!("Notification" in window)) {
      alert("הדפדפן לא תומך בהתראות שולחן עבודה");
    } else if (Notification.permission === "default") {
      // Only request if not already requested/denied
      // User must trigger this via a gesture for it to work properly
    }

    return () => {
      isCancelled = true;
      isPoseReadyRef.current = false;
      isSendingFrameRef.current = false;
      if (cameraRef.current && typeof cameraRef.current.stop === 'function') {
        cameraRef.current.stop();
      }
      cameraRef.current = null;
      if (poseRef.current && typeof poseRef.current.close === 'function') {
        poseRef.current.close();
      }
      poseRef.current = null;
      if (startupRetryTimerRef.current) {
        window.clearTimeout(startupRetryTimerRef.current);
        startupRetryTimerRef.current = null;
      }
    };
  }, []);
  /* eslint-enable react-hooks/exhaustive-deps */

  const updateDraggedPointByPointer = (clientX, clientY) => {
    const dragTarget = draggingPointRef.current;
    if (!dragTarget) return;
    const canvasEl = canvasRef.current;
    const pointBase = latestRawSidePointsRef.current[dragTarget];
    if (!canvasEl || !pointBase) return;

    const rect = canvasEl.getBoundingClientRect();
    const pointerX = clamp((clientX - rect.left) / rect.width, 0, 1);
    const pointerY = clamp((clientY - rect.top) / rect.height, 0, 1);
    sidePointOffsetsRef.current = normalizeSidePointOffsets({
      ...sidePointOffsetsRef.current,
      [dragTarget]: {
        x: clamp(pointerX - pointBase.x, -POINT_OFFSET_LIMIT, POINT_OFFSET_LIMIT),
        y: clamp(pointerY - pointBase.y, -POINT_OFFSET_LIMIT, POINT_OFFSET_LIMIT)
      }
    });
    saveSidePointOffsets(sidePointOffsetsRef.current);
  };

  const handleCanvasPointerDown = (event) => {
    if (viewModeRef.current !== 'side') return;
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    const rect = canvasEl.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    const draggablePoints = ['ear', 'shoulder', 'elbow', 'wrist'];
    let nearestPoint = null;
    let nearestDistance = Number.POSITIVE_INFINITY;

    draggablePoints.forEach((pointKey) => {
      const rawPoint = latestRawSidePointsRef.current[pointKey];
      const adjustedPoint = applyPointOffset(rawPoint, sidePointOffsetsRef.current[pointKey]);
      if (!adjustedPoint || !isVisible(adjustedPoint)) return;
      const pointX = adjustedPoint.x * rect.width;
      const pointY = adjustedPoint.y * rect.height;
      const distance = Math.hypot(pointerX - pointX, pointerY - pointY);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestPoint = pointKey;
      }
    });

    if (nearestDistance <= POINT_DRAG_HIT_RADIUS_PX) {
      draggingPointRef.current = nearestPoint;
      event.preventDefault();
      updateDraggedPointByPointer(event.clientX, event.clientY);
    }
  };

  const handleCanvasPointerMove = (event) => {
    if (!draggingPointRef.current) return;
    event.preventDefault();
    updateDraggedPointByPointer(event.clientX, event.clientY);
  };

  const stopPointDragging = () => {
    draggingPointRef.current = null;
  };

  useEffect(() => {
    saveUiSettings({
      viewMode,
      soundConfig
    });
  }, [viewMode, soundConfig]);

  useEffect(() => {
    goodPostureRef.current = null;
    badPostureCountRef.current = 0;
    smoothedShoulderRef.current = null;
    smoothedElbowRef.current = null;
    smoothedWristRef.current = null;
    smoothedSideAngleRef.current = null;
    smoothedElbowAngleRef.current = null;
    displayedSideAngleRef.current = null;
    setSideConfidence({
      side: trackedSideRef.current,
      ear: null,
      shoulder: null
    });
    postureRef.current = null;
    angleAlertStartRef.current = null;
    lastAngleAlertRef.current = 0;
    setPostureFeedback('');
    setLiveSideAngle(null);
    changeStyleProperty('--posture-status',"'לא בוצע כיול'");
  }, [viewMode]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);
  

  return (
    <div className="flex flex-col min-h-screen" dir="rtl">
      {!loaded && <LoadingScreen startupStatus={startupStatus} onRetry={restartApp} />}
      <div className={`flex-grow App bg-gradient-to-br from-deep-space to-space-gray flex flex-col items-center justify-center p-4 sm:p-8 ${!loaded ? 'hidden' : ''}`}>
        <div className="w-full max-w-7xl mx-auto flex flex-col xl:flex-row items-center justify-center space-y-8 xl:space-y-0 xl:space-x-8">
          <Menu
            postureRef={postureRef}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sideConfidence={sideConfidence}
            minDetectionConfidence={MIN_DETECTION_CONFIDENCE}
            minTrackingConfidence={MIN_TRACKING_CONFIDENCE}
            soundConfig={soundConfig}
            onSoundConfigChange={setSoundConfig}
            liveSideAngle={liveSideAngle}
          />
          <div className="w-full max-w-lg xl:max-w-xl">
            <div className="display relative rounded-3xl overflow-hidden w-full bg-deep-space">
              <div className="absolute inset-0 bg-gradient-to-r from-neon-blue to-neon-green opacity-5 z-10"></div>
              <Webcam
                ref={webcamRef}
                className="webcam rounded-3xl w-full opacity-90"
                width="100%"
                height="auto"
              />
              <canvas
                ref={canvasRef}
                className="canvas absolute top-0 left-0 rounded-3xl w-full h-full z-20"
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={stopPointDragging}
                onPointerLeave={stopPointDragging}
                onPointerCancel={stopPointDragging}
              />
              {postureFeedback && (
                <div className="absolute bottom-4 left-4 right-4 bg-deep-space bg-opacity-70 text-neon-green px-3 py-2 rounded-lg text-sm font-medium z-30 backdrop-filter backdrop-blur-sm">
                  {postureFeedback}
                </div>
              )}
            </div>
            <div className="mt-4 rounded-2xl border border-neon-blue border-opacity-30 bg-deep-space bg-opacity-70 p-3">
              <p className="text-neon-blue text-sm mb-2">גלריית צפצופים (לא נשמר לדיסק)</p>
              {beepSnapshots.length === 0 ? (
                <p className="text-xs text-neon-green opacity-80">
                  עדיין אין תמונות. תמונה תתווסף כאן כשיש צפצוף.
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {beepSnapshots.map((snapshot, index) => (
                    <div key={snapshot.id} className="rounded-lg overflow-hidden border border-neon-green border-opacity-30">
                      <button
                        type="button"
                        onClick={() => setSelectedSnapshot(snapshot)}
                        className="w-full text-left"
                      >
                        <img
                          src={snapshot.dataUrl}
                          alt={`beep-${snapshot.createdAt}`}
                          className={`w-full object-cover ${index === 0 ? 'h-48 sm:h-56' : 'h-36 sm:h-40'}`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      <footer className="bg-deep-space text-neon-blue py-2 text-center">
        <p className="text-sm">נוצר על ידי Prince</p>
      </footer>
      {selectedSnapshot && (
        <div
          className="fixed inset-0 z-[9999] bg-black bg-opacity-100 flex items-center justify-center p-4"
          onClick={() => setSelectedSnapshot(null)}
        >
          <div className="relative w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="absolute top-2 right-2 z-10 px-3 py-1 rounded bg-deep-space text-neon-blue border border-neon-blue border-opacity-60"
              onClick={() => setSelectedSnapshot(null)}
            >
              סגור
            </button>
            <img
              src={selectedSnapshot.dataUrl}
              alt={`expanded-beep-${selectedSnapshot.createdAt}`}
              className="w-full max-h-[85vh] object-contain rounded-2xl border border-neon-green border-opacity-40"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
