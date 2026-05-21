import Image from 'next/image';

interface IconProps {
  iconOnly?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function Logo({ iconOnly = false, className, style }: IconProps) {
  if (iconOnly) {
    return (
      <Image
        src="/tmc-logo-short.svg"
        alt="TMC"
        width={40}
        height={40}
        className={className}
        style={{ objectFit: 'contain', ...style }}
        priority
        unoptimized
      />
    );
  }

  return (
    <Image
      src="/tmc-logo.svg"
      alt="TMC"
      width={155}
      height={40}
      className={className}
      style={{ objectFit: 'contain', ...style }}
      priority
      unoptimized
    />
  );
}
