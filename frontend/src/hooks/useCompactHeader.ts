import { useEffect, useState } from "react"

/** True once the page is scrolled past `threshold` pixels (header collapses). */
export function useCompactHeader(threshold = 60): boolean {
  const [isCompact, setIsCompact] = useState(false)

  useEffect(() => {
    const handleScroll = () => setIsCompact(window.scrollY > threshold)
    handleScroll()
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [threshold])

  return isCompact
}
