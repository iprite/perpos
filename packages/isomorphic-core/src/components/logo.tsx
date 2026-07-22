import Image from "next/image";

interface IconProps {
  iconOnly?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function Logo({ iconOnly = false, className, style }: IconProps) {
  return (
    <Image
      src="/brand/perpos-icon-512.png"
      alt="PERPOS"
      width={iconOnly ? 40 : 48}
      height={iconOnly ? 40 : 48}
      className={className}
      style={{ objectFit: "contain", ...style }}
      priority
      unoptimized
    />
  );
}
