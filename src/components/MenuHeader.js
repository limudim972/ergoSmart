export function MenuHeader(props) {
    if(props.state === "Calibration"){
      const isSideView = props.viewMode === "side";
      return(
        <div className="text-neon-blue">
          <h3 className="text-2xl font-bold mb-4">הוראות</h3>
          <ol className="list-decimal list-inside space-y-2">
            <li>{isSideView ? "השאירו את הראש, הכתף והזרוע בתוך הפריים" : "שבו זקוף עם יציבה טובה, כשהראש והכתפיים בפריים"}</li>
            <li>לחצו על כפתור "כיול" למטה</li>
            <li>המשיכו לעבוד כרגיל. נעדכן אתכם אם תתכופפו</li>
          </ol>
        </div>
      );
    } else if(props.state === "Tracking"){
      return(
        <div className="text-neon-green">
          <h3 className="text-2xl font-bold mb-4">מעקב יציבה פעיל</h3>
          <p>לכיול מחדש שבו זקוף ולחצו שוב על "כיול".</p>
        </div>
      );
    }
}
