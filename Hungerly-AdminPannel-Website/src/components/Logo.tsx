/**
 * The Hungerly mark, redrawn as SVG from the app icon (Hungerly-UserApplication/apps/customer/assets/icon.png):
 * a geometric white "h" with a saffron dot on terracotta. Keep the two in sync.
 */
export function LogoMark({ size = 36, radius = 0.28 }: { size?: number; radius?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 1024 1024" role="img" aria-label="Hungerly" style={{ flex: 'none', display: 'block' }}>
      <rect width="1024" height="1024" rx={1024 * radius} fill="#C2410C" />
      <path
        d="M341 306h104v184c28-31 66-45 110-45 82 0 135 57 135 146v246H585V611c0-43-25-70-66-70-45 0-74 31-74 79v217H341z"
        fill="#FFFFFF"
      />
      <circle cx="690" cy="300" r="62" fill="#E8A13A" />
    </svg>
  );
}

export function Logo({ sub, collapsed, inverse = true }: { sub?: string; collapsed?: boolean; inverse?: boolean }) {
  return (
    <div className="brand">
      <LogoMark size={36} />
      {!collapsed && (
        <div className="brand-words">
          <div className="brand-name" style={{ color: inverse ? '#fff' : 'var(--text-primary)' }}>
            hungerly
          </div>
          {sub && <div className="brand-sub">{sub}</div>}
        </div>
      )}
    </div>
  );
}
