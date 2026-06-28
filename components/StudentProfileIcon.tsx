import React, { useState } from 'react';
import LottieIcon from './LottieIcon';

/** Renders a student's animated Lottie profile icon next to their name.
 *  mode 'always' loops continuously; mode 'hover' rests and animates on hover. */
const StudentProfileIcon: React.FC<{ src?: string; size?: number; mode?: 'always' | 'hover'; className?: string }> = ({ src, size = 24, mode = 'always', className }) => {
  const [hover, setHover] = useState(false);
  if (!src) return null;
  if (mode === 'always') {
    return <LottieIcon src={src} size={size} loop autoplay playOnHover={false} className={`inline-block align-middle flex-shrink-0 ${className ?? ''}`} />;
  }
  return (
    <span
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className={`inline-flex align-middle flex-shrink-0 ${className ?? ''}`}
    >
      <LottieIcon src={src} size={size} loop play={hover} playOnHover={false} />
    </span>
  );
};

export default StudentProfileIcon;
