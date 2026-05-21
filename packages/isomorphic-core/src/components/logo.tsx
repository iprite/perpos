import Image from 'next/image';

interface IconProps {
  iconOnly?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function Logo({ iconOnly = false, className, style }: IconProps) {
  return (
    <Image
      src="/tmc-logo.svg"
      alt="TMC"
      width={iconOnly ? 40 : 155}
      height={40}
      className={className}
      style={{ objectFit: 'contain', ...style }}
      priority
    />
  );
}
