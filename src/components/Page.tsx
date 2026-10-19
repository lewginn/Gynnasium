import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'

type Props = {
  /** Shown as the large title, and in the nav bar once it scrolls away. */
  title?: string
  /** Small caps line above the large title, like the date in Apple Fitness. */
  eyebrow?: string
  back?: { to: string; label: string }
  /** Bar items, for screens that need something other than a back button. */
  leading?: ReactNode
  trailing?: ReactNode
  children?: ReactNode
}

/** iOS navigation bar with a large title that collapses into the bar as you scroll. */
export default function Page({ title, eyebrow, back, leading, trailing, children }: Props) {
  const barRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const bar = barRef.current
    const heading = titleRef.current
    if (!bar || !heading) return
    // The title counts as gone once it has slid fully under the bar.
    const observer = new IntersectionObserver(([entry]) => setCollapsed(!entry.isIntersecting), {
      rootMargin: `-${bar.offsetHeight}px 0px 0px 0px`,
    })
    observer.observe(heading)
    return () => observer.disconnect()
  }, [title])

  return (
    <>
      <header ref={barRef} className="nav-bar" data-collapsed={collapsed || !title}>
        {back && (
          <Link to={back.to} className="nav-back glass" aria-label={`Back to ${back.label}`}>
            <Icon name="chevronLeft" size={22} />
          </Link>
        )}
        {leading}
        {title && (
          <div className="nav-title" aria-hidden="true">
            {title}
          </div>
        )}
        {trailing && <div className="nav-trailing">{trailing}</div>}
      </header>
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      {title && (
        <h1 ref={titleRef} className="large-title">
          {title}
        </h1>
      )}
      {children}
    </>
  )
}
