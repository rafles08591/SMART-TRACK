import { useState, memo } from "react";

const SW = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };

function TileIcon({ name, ...props }) {
  const p = { viewBox: "0 0 24 24", ...SW, ...props };
  switch (name) {
    case "calendar": return (<svg {...p}><rect x="3.5" y="5" width="17" height="15.5" rx="2.2"/><path d="M3.5 9.5h17"/><path d="M8 3v3.6M16 3v3.6"/><circle cx="15.3" cy="14.4" r="1.3" fill="currentColor" stroke="none"/></svg>);
    case "ladder": return (<svg {...p}><path d="M8 3v18M16 3v18"/><path d="M8 7h8M8 11h8M8 15h8M8 19h8"/></svg>);
    case "dashboard": return (<svg {...p}><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M7 20h10M12 17v3"/><path d="M6.5 13.5l2.5-3 2 2 3.5-4.5"/></svg>);
    case "rocket": return (<svg {...p}><path d="M12 2.5c3 2 4.5 5.6 4.5 9.3 0 2-.5 3.7-1.2 5l-3.3 3-3.3-3c-.7-1.3-1.2-3-1.2-5 0-3.7 1.5-7.3 4.5-9.3Z"/><circle cx="12" cy="10.5" r="1.7"/><path d="M8.3 15.3 5.5 17l.6-3.6M15.7 15.3l2.8 1.7-.6-3.6"/><path d="M10.3 19.8 9.5 22M13.7 19.8l.8 2.2"/></svg>);
    case "trophy": return (<svg {...p}><path d="M7 4h10v5a5 5 0 0 1-10 0V4Z"/><path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5"/><path d="M12 14v3M8.5 21h7M9.5 17.5h5l.5 3.5h-6l.5-3.5Z"/></svg>);
    case "flag": return (<svg {...p}><path d="M5 3v18"/><path d="M5 4h5l1.2 1.6L12.4 4H17l-1.5 3.5L17 11h-4.6l-1.2-1.6L10 11H5V4Z"/></svg>);
    case "cart": return (<svg {...p}><path d="M3 4h2.2L8 15h9l2-8H6.4"/><circle cx="9.5" cy="19.5" r="1.4"/><circle cx="16.5" cy="19.5" r="1.4"/></svg>);
    case "receipt": return (<svg {...p}><path d="M6 3h12v18l-2-1.3L14 21l-2-1.3L10 21l-2-1.3L6 21V3Z"/><path d="M9 8h6M9 12h6M9 16h3.5"/></svg>);
    case "card": return (<svg {...p}><rect x="3" y="6" width="18" height="13" rx="2.2"/><path d="M3 10.5h18"/><path d="M6.5 15h4"/></svg>);
    case "warning": return (<svg {...p}><path d="M12 3.5 22 20.5H2L12 3.5Z"/><path d="M12 10v4.2"/><circle cx="12" cy="17.2" r="1" fill="currentColor" stroke="none"/></svg>);
    case "userplus": return (<svg {...p}><circle cx="9.5" cy="8.5" r="3.6"/><path d="M3.5 20.5c1-3.6 3.5-5.5 6-5.5s5 1.9 6 5.5"/><path d="M18.5 8v5M16 10.5h5"/></svg>);
    case "ticket": return (<svg {...p}><path d="M3.5 9.5a2 2 0 0 0 0-4V4h17v1.5a2 2 0 0 0 0 4v1a2 2 0 0 0 0 4v1a2 2 0 0 0 0 4V20h-17v-1.5a2 2 0 0 0 0-4v-1a2 2 0 0 0 0-4Z"/><path d="M14 5v14" strokeDasharray="2.2 2.2"/></svg>);
    case "truck": return (<svg {...p}><rect x="2.5" y="7.5" width="11" height="9"/><path d="M13.5 10.5H17l3.5 3.2v2.8h-3"/><circle cx="7" cy="18.5" r="1.6"/><circle cx="16.5" cy="18.5" r="1.6"/></svg>);
    case "monstertruck": return (
      <svg {...p}>
        <path d="M3 13.2V10.8h3l1.7-2.7h6.4l1.5 2.7H21v2.4" />
        <path d="M8.2 8.1h5.6" />
        <path d="M4 13.2h16" />
        <path d="M6.3 13.2v2.2M17.7 13.2v2.2" />
        <circle cx="7.2" cy="18.2" r="2.4" />
        <circle cx="16.8" cy="18.2" r="2.4" />
        <circle cx="7.2" cy="18.2" r=".7" fill="currentColor" stroke="none" />
        <circle cx="16.8" cy="18.2" r=".7" fill="currentColor" stroke="none" />
        <path d="M19.5 10.8V8.4h2.2" />
      </svg>
    );
    case "cash": return (<svg {...p}><rect x="2.5" y="6.5" width="19" height="12" rx="1.8"/><circle cx="12" cy="12.5" r="3"/></svg>);
    case "clock": return (<svg {...p}><circle cx="12" cy="12.5" r="8.5"/><path d="M12 7.5v5l3.3 2"/><path d="M9 2.5h6"/></svg>);
    case "box": return (<svg {...p}><path d="M12 3 21 7.5v9L12 21 3 16.5v-9L12 3Z"/><path d="M3 7.5 12 12l9-4.5M12 12v9"/></svg>);
    case "road": return (<svg {...p}><path d="M8 3 4 21M16 3l4 18"/><path d="M12 3v2.5M12 9v2.5M12 15v2.5"/></svg>);
    case "noentry": return (<svg {...p}><circle cx="12" cy="12" r="8.5"/><path d="M6.5 12h11"/></svg>);
    case "map": return (<svg {...p}><path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z"/><path d="M9 4v14M15 6v14"/><circle cx="17.3" cy="10" r="1" fill="currentColor" stroke="none"/></svg>);
    case "pin": return (<svg {...p}><path d="M12 21.5S5 14.7 5 9.5a7 7 0 0 1 14 0c0 5.2-7 12-7 12Z"/><circle cx="12" cy="9.5" r="2.6"/></svg>);
    case "bell": return (<svg {...p}><path d="M12 3.5a5.5 5.5 0 0 0-5.5 5.5v3.2L4.5 16h15L17.5 12.2V9A5.5 5.5 0 0 0 12 3.5Z"/><path d="M10 19a2.2 2.2 0 0 0 4 0"/></svg>);
    case "piggy": return (<svg {...p}><path d="M4.5 12.5a6.5 6.5 0 0 1 6.5-6.5h3a5 5 0 0 1 5 5v.5l2 1.5-2 1v1a2 2 0 0 1-2 2h-1v2h-3v-2H9.5v2h-3v-3.2A6.5 6.5 0 0 1 4.5 12.5Z"/><circle cx="15" cy="10.5" r="0.9" fill="currentColor" stroke="none"/><path d="M7 6.5 5.5 4.5M9.5 6 8.5 4"/></svg>);
    case "checklist": return (<svg {...p}><rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="M8 8.5l1.4 1.4L12 7.3M8 14.5l1.4 1.4L12 13.3"/><path d="M14 8.5h4M14 14.5h4"/></svg>);
    case "calc": return (<svg {...p}><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M7.5 7h9"/><circle cx="8" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="16" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="8" cy="16.5" r=".9" fill="currentColor" stroke="none"/><circle cx="12" cy="16.5" r=".9" fill="currentColor" stroke="none"/><circle cx="16" cy="16.5" r=".9" fill="currentColor" stroke="none"/></svg>);
    default: return (<svg {...p}><rect x="4" y="4" width="16" height="16" rx="3"/></svg>);
  }
}

const META = {
  dia:               { icon: "calendar",      color: "#38bdf8", fam: "🏠 Inicio" },
  escalera:          { icon: "ladder",        color: "#c084fc", fam: "🏠 Inicio" },
  mesa:              { icon: "dashboard",     color: "#60a5fa", fam: "🏠 Inicio" },
  carreras:          { icon: "monstertruck",  color: "#ff6b00", fam: "🏠 Inicio" },

  max:               { icon: "rocket",   color: "#f472b6", fam: "🎯 Avances" },
  open:              { icon: "unlock",   color: "#fb923c", fam: "🎯 Avances", img: "https://jxyosutthiuzbrmdznoa.supabase.co/storage/v1/object/public/promociones/OPEN.jpeg" },
  champions:         { icon: "trophy",   color: "#fbbf24", fam: "🎯 Avances" },
  rally_otc:         { icon: "flag",     color: "#4ade80", fam: "🎯 Avances" },
  otc_ventas:        { icon: "cart",     color: "#2dd4bf", fam: "🎯 Avances" },

  facturas:          { icon: "receipt",  color: "#38bdf8", fam: "💰 Ventas" },
  creditos:          { icon: "card",     color: "#a78bfa", fam: "💰 Ventas" },
  cartera_vencida:   { icon: "warning",  color: "#f87171", fam: "💰 Ventas" },
  altas_cliente:     { icon: "userplus", color: "#34d399", fam: "💰 Ventas" },
  alta_cliente:      { icon: "userplus", color: "#34d399", fam: "💰 Ventas" },

  cuponera:          { icon: "ticket",   color: "#fb923c", fam: "🎟️ Promociones" },

  unidades:          { icon: "truck",    color: "#f87171", fam: "📋 Operación" },
  nomina:            { icon: "cash",     color: "#4ade80", fam: "📋 Operación" },
  reloj_checador:    { icon: "clock",    color: "#38bdf8", fam: "📋 Operación" },
  cargas:            { icon: "box",      color: "#fbbf24", fam: "📋 Operación" },
  km:                { icon: "road",     color: "#a78bfa", fam: "📋 Operación" },
  sin_visita:        { icon: "noentry",  color: "#f87171", fam: "📋 Operación" },
  rutas:             { icon: "map",      color: "#2dd4bf", fam: "📋 Operación" },
  tepic:             { icon: "pin",      color: "#60a5fa", fam: "📋 Operación" },
  tiempos:           { icon: "clock",    color: "#7dd3fc", fam: "📋 Operación" },
  actividad:         { icon: "checklist",color: "#a3e635", fam: "📋 Operación" },
  actividades_dia:   { icon: "checklist",color: "#4ade80", fam: "📋 Operación" },
  actividades_semana:{ icon: "checklist",color: "#38bdf8", fam: "📋 Operación" },
  actividades_mes:   { icon: "checklist",color: "#a78bfa", fam: "📋 Operación" },
  cotizador:         { icon: "calc",     color: "#fbbf24", fam: "📋 Operación" },
  pwst:              { icon: "box",      color: "#94a3b8", fam: "📋 Operación" },

  avisos:            { icon: "bell",     color: "#f87171", fam: "🔔 Avisos" },

  mi_fondo:          { icon: "piggy",    color: "#fbbf24", fam: "⚙️ Configuración" },
};

const FAMILY_ORDER = ["🏠 Inicio", "🎯 Avances", "💰 Ventas", "🎟️ Promociones", "📋 Operación", "🔔 Avisos", "⚙️ Configuración"];

function statusOverride(status) {
  switch (status) {
    case "pendiente_urgente":
    case "aviso_nuevo":
      return { color: "#f87171", pulse: true, badge: true };
    case "parpadeo_verde":
      return { color: "#4ade80", pulse: true, badge: false };
    case "completo":
      return { color: "#4ade80", pulse: false, badge: false };
    case "aviso_azul":
      return { color: "#60a5fa", pulse: true, badge: true };
    default:
      return null;
  }
}

const Tile = memo(function Tile({ tKey, label, icon, img, color, active, pulse, badge, onSelect }) {
  const [pressed, setPressed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => onSelect(tKey)}
      onTouchStart={() => setPressed(true)}
      onTouchEnd={() => setPressed(false)}
      onMouseDown={() => setPressed(true)}
      onMouseUp={() => setPressed(false)}
      onMouseLeave={() => setPressed(false)}
      style={{
        position: "relative",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
        gap: 7, padding: "14px 6px", borderRadius: 14, cursor: "pointer", textAlign: "center",
        border: `1px solid ${active ? color : color + "38"}`,
        background: `radial-gradient(120% 140% at 50% -10%, ${color}22, transparent 60%), linear-gradient(155deg, #0e1626 0%, #0a1220 100%)`,
        boxShadow: active ? `0 0 16px -3px ${color}` : "none",
        transform: pressed ? "scale(0.93)" : "scale(1)",
        transition: "transform .12s ease, border-color .2s ease",
        touchAction: "manipulation",
      }}
    >
      {pulse && (
        <span
          aria-hidden
          style={{
            position: "absolute", inset: -1, borderRadius: 14,
            boxShadow: `0 0 16px -2px ${color}`,
            animation: "neonPulse 2.1s ease-in-out infinite",
            pointerEvents: "none",
            willChange: "opacity",
          }}
        />
      )}

      {badge && (
        <span style={{
          position: "absolute", top: 6, right: 6, width: 8, height: 8, borderRadius: "50%",
          background: color, boxShadow: `0 0 6px ${color}`,
        }} />
      )}

      <span style={{
        width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
        color, borderRadius: 8, boxShadow: `0 0 8px -1px ${color}90`,
      }}>
        {img ? (
          <img src={img} alt={label} style={{ width: 24, height: "auto", borderRadius: 4 }} />
        ) : (
          <TileIcon name={icon} width={22} height={22} />
        )}
      </span>

      <span style={{
        fontSize: 10.5, fontWeight: 700, lineHeight: 1.15, color,
        textShadow: `0 0 4px ${color}90`,
      }}>
        {label}
      </span>
    </button>
  );
});

export default function NeonObjetivoTabs({ tab, setTab, tabs, estadoTabs = {} }) {
  const grouped = FAMILY_ORDER.map((fam) => ({
    fam,
    items: (tabs || []).filter((t) => (META[t.key]?.fam || "📋 Operación") === fam),
  })).filter((g) => g.items.length > 0);

  return (
    <div style={{ marginBottom: 6 }}>
      {grouped.map((g) => (
        <div key={g.fam} style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase", color: "#cbd5e1", marginBottom: 8 }}>
            {g.fam}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(84px, 1fr))", gap: 10 }}>
            {g.items.map((t) => {
              const meta = META[t.key] || { icon: "box", color: "#94a3b8" };
              const status = statusOverride(estadoTabs[t.key]);
              const color = status ? status.color : meta.color;

              return (
                <Tile
                  key={t.key}
                  tKey={t.key}
                  label={t.label}
                  icon={meta.icon}
                  img={meta.img}
                  color={color}
                  active={tab === t.key}
                  pulse={!!status?.pulse}
                  badge={!!status?.badge}
                  onSelect={setTab}
                />
              );
            })}
          </div>
        </div>
      ))}
      <style>{`
        @keyframes neonPulse {
          0%, 100% { opacity: 0.25; }
          50% { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
