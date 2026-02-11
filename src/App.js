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
  //reference to canvas & webcam
  const canvasRef = useRef(null);
  const webcamRef = useRef(null);

  //reference to the current posture
  const postureRef = useRef(null); //value of 1 is bad, 0 is good, -1 is undetected
  const goodPostureRef = useRef(null);
  const badPostureCountRef = useRef(0);
  const trackedSideRef = useRef('left');
  const viewModeRef = useRef('side');
  const smoothedShoulderRef = useRef(null);

  const [loaded, setLoaded] = useState(false);
  const [viewMode, setViewMode] = useState('side');
  const [sideConfidence, setSideConfidence] = useState({
    side: 'left',
    ear: null,
    shoulder: null
  });
  const [soundConfig, setSoundConfig] = useState({
    enabled: true,
    angleThreshold: 18,
    durationSeconds: 2
  });

  const [postureFeedback, setPostureFeedback] = useState('');
  const angleAlertStartRef = useRef(null);
  const lastAngleAlertRef = useRef(0);
  const audioContextRef = useRef(null);
  const GOOD_POSTURE_FEEDBACK = "יציבה מצוינת, המשיכו כך!";
  const ANGLE_ALERT_COOLDOWN_MS = 60000;
  const MIN_DETECTION_CONFIDENCE = 0.5;
  const MIN_TRACKING_CONFIDENCE = 0.5;
  const VISIBILITY_THRESHOLD = 0.5;
  const SHOULDER_MIN_VISIBILITY = 0.6;
  const SHOULDER_SMOOTHING_ALPHA = 0.2;
  const SHOULDER_DEADZONE_PX = 3;
  const EAR_POINT_RADIUS = 3;
  const ARM_POINT_RADIUS = 4;
  const LANDMARK_COLORS = {
    ear: '#ffd166',
    shoulder: '#7bffb2'
  };
  const ANGLE_LINE_COLOR = '#f8f9fa';
  const ANGLE_TEXT_COLOR = '#f8f9fa';
  const SIDE_LANDMARKS = {
    left: { ear: 7, shoulder: 11 },
    right: { ear: 8, shoulder: 12 }
  };
  const POINT_OFFSET_LIMIT = 0.2;
  const POINT_DRAG_HIT_RADIUS_PX = 20;

  // Keep refs in sync immediately so frame callbacks always read latest mode.
  viewModeRef.current = viewMode;
  const soundConfigRef = useRef(soundConfig);
  soundConfigRef.current = soundConfig;
  const sidePointOffsetsRef = useRef({
    ear: { x: 0, y: 0 },
    shoulder: { x: 0, y: 0 }
  });
  const latestRawSidePointsRef = useRef({
    ear: null,
    shoulder: null
  });
  const draggingPointRef = useRef(null);

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
    const frequency = 420 + (clampedSeverity * 260);
    const volume = 0.04 + (clampedSeverity * 0.05);

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, now);
    gainNode.gain.setValueAtTime(0.0001, now);
    gainNode.gain.exponentialRampToValueAtTime(volume, now + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);

    oscillator.connect(gainNode);
    gainNode.connect(ctx.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.22);
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
    const deltaPx = Math.hypot(
      (shoulder.x - prev.x) * canvasWidth,
      (shoulder.y - prev.y) * canvasHeight
    );

    if (deltaPx < SHOULDER_DEADZONE_PX) {
      return prev;
    }

    const next = {
      x: prev.x + ((shoulder.x - prev.x) * SHOULDER_SMOOTHING_ALPHA),
      y: prev.y + ((shoulder.y - prev.y) * SHOULDER_SMOOTHING_ALPHA)
    };
    smoothedShoulderRef.current = next;
    return next;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
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

  function getSidePostureFeedback(landmarks, baseline, side) {
    const indices = SIDE_LANDMARKS[side];
    const feedback = [];
    const ear = applyPointOffset(landmarks[indices.ear], sidePointOffsetsRef.current.ear);
    const baseEar = applyPointOffset(baseline[indices.ear], sidePointOffsetsRef.current.ear);
    const shoulder = applyPointOffset(landmarks[indices.shoulder], sidePointOffsetsRef.current.shoulder);
    const baseShoulder = applyPointOffset(baseline[indices.shoulder], sidePointOffsetsRef.current.shoulder);

    if (isVisible(ear) && isVisible(baseEar)) {
      const headYDiff = ear.y - baseEar.y;
      if (headYDiff > 0.03) {
        feedback.push("הרימו מעט את הראש");
      } else if (headYDiff < -0.03) {
        feedback.push("הורידו מעט את הראש");
      }
    }

    if (isVisible(ear) && isVisible(shoulder) && isVisible(baseEar) && isVisible(baseShoulder)) {
      const headForward = Math.abs(ear.x - shoulder.x);
      const baselineForward = Math.abs(baseEar.x - baseShoulder.x);
      if (headForward - baselineForward > 0.04) {
        feedback.push("החזירו את הראש לקו הכתפיים");
      }
    }

    if (feedback.length === 0) {
      feedback.push(GOOD_POSTURE_FEEDBACK);
    }

    return feedback.join(". ");
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

    if(!loaded){ 
      setLoaded(true);
      console.log("מודל זיהוי התנוחה נטען בהצלחה.");
      changeStyleProperty("--loader-display","none");
    }

    if (!results.poseLandmarks) { //if the model is unable to detect a pose 
      console.log("לא זוהתה תנוחה.");
      postureRef.current = -1;//change pose state to "undetected", can't track pose
      smoothedShoulderRef.current = null;
      setSideConfidence({
        side: trackedSideRef.current,
        ear: null,
        shoulder: null
      });
      changeStyleProperty("--btn-color","rgba(0, 105, 237, 0.25)"); //fade out the calubrate button by reducing opacity
      return;
    }

    let landmarks = results.poseLandmarks;
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
      latestRawSidePointsRef.current = {
        ear: rawEar,
        shoulder: stableShoulder
      };
      const ear = applyPointOffset(rawEar, sidePointOffsetsRef.current.ear);
      const adjustedShoulder = applyPointOffset(stableShoulder, sidePointOffsetsRef.current.shoulder);

      setSideConfidence({
        side,
        ear: getVisibilityValue(ear),
        shoulder: getVisibilityValue(shoulder)
      });

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

      if (adjustedShoulder && isVisible(ear)) {
        const shoulderX = adjustedShoulder.x * canvasElement.width;
        const shoulderY = adjustedShoulder.y * canvasElement.height;
        const earX = ear.x * canvasElement.width;
        const earY = ear.y * canvasElement.height;

        drawLine(canvasCtx, shoulderX, shoulderY, earX, earY, ANGLE_LINE_COLOR, 2);

        const dx = earX - shoulderX;
        const dy = shoulderY - earY;
        const verticalDeviationAngle = Math.atan2(Math.abs(dx), Math.max(Math.abs(dy), 0.0001)) * (180 / Math.PI);
        sideAngleDeviation = verticalDeviationAngle;
        const textX = ((shoulderX + earX) / 2) + 8;
        const textY = ((shoulderY + earY) / 2) - 8;

        canvasCtx.font = 'bold 14px Roboto, sans-serif';
        canvasCtx.fillStyle = ANGLE_TEXT_COLOR;
        canvasCtx.fillText(`${verticalDeviationAngle.toFixed(1)}°`, textX, textY);
      }
    }

    if(btnSelected){
      goodPostureRef.current = landmarks.map((landmark) => ({...landmark})); // obtain a copy of the calibrated pose
      trackedSideRef.current = chooseTrackedSide(landmarks);
      badPostureCountRef.current = 0;
      sidePointOffsetsRef.current = {
        ear: { x: 0, y: 0 },
        shoulder: { x: 0, y: 0 }
      };
      console.log("בוצע כיול חדש ונשמרו נקודות הייחוס.");
      setBtn(false);
    }

    if(!goodPostureRef.current){ //the calibrate button has not been selected yet
      return;
    }

    let feedback = '';
    let isBadPosture = false;

    if (currentViewMode === 'side') {
      const side = trackedSideRef.current;
      feedback = getSidePostureFeedback(landmarks, goodPostureRef.current, side);
      isBadPosture = !feedback.includes(GOOD_POSTURE_FEEDBACK);

      if (typeof sideAngleDeviation === 'number' && soundConfigRef.current.enabled) {
        const now = Date.now();
        const { angleThreshold, durationSeconds } = soundConfigRef.current;
        const durationMs = durationSeconds * 1000;

        if (sideAngleDeviation >= angleThreshold) {
          if (!angleAlertStartRef.current) {
            angleAlertStartRef.current = now;
          }

          const sustainedMs = now - angleAlertStartRef.current;
          if (sustainedMs >= durationMs && now - lastAngleAlertRef.current >= ANGLE_ALERT_COOLDOWN_MS) {
            const severity = Math.min(1, (sideAngleDeviation - angleThreshold) / 20);
            playAngleAlert(severity);
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

    setPostureFeedback(feedback);

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
    const pose = new Pose({locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`;
    }});
    pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      smoothSegmentation: false,
      minDetectionConfidence: MIN_DETECTION_CONFIDENCE,
      minTrackingConfidence: MIN_TRACKING_CONFIDENCE
    });
    pose.onResults(onResults);
    
    if(
      typeof webcamRef.current !== 'undefined' &&
      webcamRef.current !== null
    ) {
      const camera = new cam.Camera(webcamRef.current.video, {
        onFrame: async () => { //this block runs once every frame
          await pose.send({image: webcamRef.current.video});
        },
        width: 640,
        height: 480
      });
      camera.start();
    }

    if(!("Notification" in window)) {
      alert("הדפדפן לא תומך בהתראות שולחן עבודה");
    } else {
      Notification.requestPermission();
    }

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
    sidePointOffsetsRef.current = {
      ...sidePointOffsetsRef.current,
      [dragTarget]: {
        x: clamp(pointerX - pointBase.x, -POINT_OFFSET_LIMIT, POINT_OFFSET_LIMIT),
        y: clamp(pointerY - pointBase.y, -POINT_OFFSET_LIMIT, POINT_OFFSET_LIMIT)
      }
    };
  };

  const handleCanvasPointerDown = (event) => {
    if (viewModeRef.current !== 'side') return;
    const canvasEl = canvasRef.current;
    const rawEar = latestRawSidePointsRef.current.ear;
    const rawShoulder = latestRawSidePointsRef.current.shoulder;
    if (!canvasEl || !rawEar || !rawShoulder) return;

    const adjustedEar = applyPointOffset(rawEar, sidePointOffsetsRef.current.ear);
    const adjustedShoulder = applyPointOffset(rawShoulder, sidePointOffsetsRef.current.shoulder);
    if (!isVisible(adjustedEar)) return;

    const rect = canvasEl.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;
    const earX = adjustedEar.x * rect.width;
    const earY = adjustedEar.y * rect.height;
    const shoulderX = adjustedShoulder.x * rect.width;
    const shoulderY = adjustedShoulder.y * rect.height;
    const earDistance = Math.hypot(pointerX - earX, pointerY - earY);
    const shoulderDistance = Math.hypot(pointerX - shoulderX, pointerY - shoulderY);
    const nearestPoint = earDistance <= shoulderDistance ? 'ear' : 'shoulder';
    const nearestDistance = Math.min(earDistance, shoulderDistance);

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
    goodPostureRef.current = null;
    badPostureCountRef.current = 0;
    smoothedShoulderRef.current = null;
    setSideConfidence({
      side: trackedSideRef.current,
      ear: null,
      shoulder: null
    });
    postureRef.current = null;
    angleAlertStartRef.current = null;
    lastAngleAlertRef.current = 0;
    setPostureFeedback('');
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
      {!loaded && <LoadingScreen />}
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
          />
          <div className="display relative rounded-3xl overflow-hidden w-full max-w-lg xl:max-w-xl bg-deep-space">
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
        </div>
      </div>
      <footer className="bg-deep-space text-neon-blue py-2 text-center">
        <p className="text-sm">נוצר על ידי Prince</p>
      </footer>
    </div>
  );
}

export default App;
