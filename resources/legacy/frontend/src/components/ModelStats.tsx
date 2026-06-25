'use client'

import React from 'react'

interface ModelStatsProps {
  accuracy: number
  loss: number
}

const ModelStats: React.FC<ModelStatsProps> = ({ accuracy, loss }) => {
  const accuracyPercent = Math.round(accuracy * 100)

  // SVG circle setup
  const radius = 50
  const stroke = 8
  const normalizedRadius = radius - stroke / 2
  const circumference = normalizedRadius * 2 * Math.PI

  // Calculate how much of the circle should be filled
  const strokeDashoffset = circumference - (accuracyPercent / 100) * circumference

  return (
    <div className="flex flex-col items-center justify-center p-4">
      {/* Circular progress */}
      <div className="relative flex flex-col gap-2 items-center justify-center">
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
        <h2 className="text-lg text-gray-300">{`Accuracy ${accuracyPercent}%`}</h2>
      </div>

      {/* Loss text */}
      <div className="text-lg text-gray-400">
        <span className="font-medium">Loss:</span> {loss.toFixed(4)}
      </div>
    </div>
  )
}
export default ModelStats
