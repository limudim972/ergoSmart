export function changeStyleProperty(property, value){
    document.documentElement.style.setProperty(property, value);
  }
  
  export function badPosture(currLandmarks, idealLandmarks){ //returns true if the posture is bad
    //person is looking down
    let lookingDown = (currLandmarks[0]['y'] - idealLandmarks[0]['y']) >  (idealLandmarks[9]['y'] - idealLandmarks[0]['y']);
    //person face is closer to the screen
    let faceIsClose = ((idealLandmarks[0]['z'] - currLandmarks[0]['z'])>0.5);
  
    return(lookingDown || faceIsClose);
  }
  
export function showNotification(notificationText){
    new Notification(notificationText);
  }

// Helper function to draw a line on the canvas
export function drawLine(ctx, x1, y1, x2, y2, color, thickness = 2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.strokeStyle = color;
  ctx.lineWidth = thickness;
  ctx.stroke();
}

// Helper function to draw a circle on the canvas
export function drawCircle(ctx, x, y, radius, color) {
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, 2 * Math.PI);
  ctx.fillStyle = color;
  ctx.fill();
}

// Function to determine if shoulders are level
export function shouldersLevel(leftShoulder, rightShoulder, threshold = 0.05) {
  return Math.abs(leftShoulder.y - rightShoulder.y) < threshold;
}

// Function to determine if the back is straight
export function backStraight(shoulder, hip, knee, threshold = 0.1) {
  const upperAngle = Math.atan2(hip.y - shoulder.y, hip.x - shoulder.x);
  const lowerAngle = Math.atan2(knee.y - hip.y, knee.x - hip.x);
  return Math.abs(upperAngle - lowerAngle) < threshold;
}
