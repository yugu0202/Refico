export function BrandLogo({ size }: { size: number }) {
  return (
    <span className="brand-logo" aria-hidden="true">
      <img
        className="brand-logo-light"
        src="/logo.svg?v=4"
        width={size}
        height={size}
        alt=""
      />
      <img
        className="brand-logo-dark"
        src="/logo-dark.svg?v=4"
        width={size}
        height={size}
        alt=""
      />
    </span>
  );
}
