export function CalibrateBtn({onClickCallback}) {
    return (
        <button 
          className="btn mt-6 bg-neon-blue text-deep-space font-bold py-3 px-6 rounded-full 
                     hover:bg-neon-green hover:shadow-neon transition-all duration-300 ease-in-out 
                     transform hover:scale-105 uppercase tracking-wider"
          onClick={onClickCallback}
        >
          כיול
        </button>
    )
}
