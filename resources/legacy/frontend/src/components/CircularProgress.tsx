// Not Done

const CircularProgress: React.FC<{
  accuracy: number;
  className?: string;
  radius: number;
}> = ({ accuracy, radius, className }) => {
  const accuracyPercent = Math.round(accuracy * 100);

  const stroke = 15;
  const normalizedRadius = radius - stroke / 2;
  const circumference = normalizedRadius * 2 * Math.PI;

  // Calculate how much of the circle should be filled
  const strokeDashoffset = circumference - (accuracyPercent / 100) * circumference;

  return (
    <div className={className}>
      <svg height={radius * 2} width={radius * 2} className="transform -rotate-90">
        {/* Track */}
        <circle
          stroke="var(--tw-prose-pre-bg, #E5E7EB)"
          fill="transparent"
          strokeWidth={stroke}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
        />
        {/* Progress */}
        <circle
          stroke="rgb(10 255 10)" /* Tailwind green-500 */
          fill="transparent"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          r={normalizedRadius}
          cx={radius}
          cy={radius}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
      </svg>
    </div>
  );
};

export default CircularProgress;
