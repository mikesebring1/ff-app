import { useRef, useEffect, useState } from 'react'

/**
 * Hook to detect score changes and trigger animations
 * @param {number} currentScore - The current score value
 * @returns {object} Animation state and classes
 */
export function useScoreAnimation(currentScore) {
  const previousScore = useRef(currentScore)
  const [isAnimating, setIsAnimating] = useState(false)
  const [animationType, setAnimationType] = useState(null) // 'increase' | 'decrease' | null
  
  useEffect(() => {
    const prev = previousScore.current
    const current = parseFloat(currentScore)
    const prevFloat = parseFloat(prev)
    
    // Only trigger animation if score actually changed and both values are valid numbers
    if (!isNaN(current) && !isNaN(prevFloat) && current !== prevFloat) {
      const type = current > prevFloat ? 'increase' : 'decrease'
      setAnimationType(type)
      setIsAnimating(true)
      
      // Clear animation after duration
      const timer = setTimeout(() => {
        setIsAnimating(false)
        setAnimationType(null)
      }, 1000) // 1 second animation duration
      
      // Update the ref for next comparison
      previousScore.current = current
      
      return () => clearTimeout(timer)
    } else if (prev !== current) {
      // Update ref even if no animation (for initial render or invalid values)
      previousScore.current = current
    }
  }, [currentScore])
  
  // Generate CSS classes based on animation state
  const getAnimationClasses = () => {
    if (!isAnimating) return ''
    
    const baseClasses = 'transition-all duration-1000 ease-out'
    
    if (animationType === 'increase') {
      return `${baseClasses} animate-pulse bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 scale-105`
    } else if (animationType === 'decrease') {
      return `${baseClasses} animate-pulse bg-red-100 dark:bg-red-900/20 text-red-800 dark:text-red-200 scale-105`
    }
    
    return baseClasses
  }
  
  return {
    isAnimating,
    animationType,
    animationClasses: getAnimationClasses(),
    scoreChanged: isAnimating
  }
}

/**
 * Hook specifically for animating team total scores
 * @param {number} totalScore - Team's total score
 * @returns {object} Animation state and classes for team scores
 */
export function useTeamScoreAnimation(totalScore) {
  const { isAnimating, animationType, scoreChanged } = useScoreAnimation(totalScore)
  
  const getTeamAnimationClasses = () => {
    if (!isAnimating) return ''
    
    const baseClasses = 'transition-all duration-700 ease-out'
    
    if (animationType === 'increase') {
      return `${baseClasses} bg-green-50 dark:bg-green-900/10 text-green-600 dark:text-green-400 font-bold scale-110`
    } else if (animationType === 'decrease') {
      return `${baseClasses} bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 font-bold scale-110`
    }
    
    return baseClasses
  }
  
  return {
    isAnimating,
    animationType,
    animationClasses: getTeamAnimationClasses(),
    scoreChanged
  }
}
