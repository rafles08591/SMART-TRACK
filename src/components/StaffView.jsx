<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Panel Staff — SMART-TRACK</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/tabler-icons/2.47.0/iconfont/tabler-icons.min.css" />
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
  :root{
    --bg-0:#05060b;
    --bg-1:#090b16;
    --glass:rgba(255,255,255,.035);
    --glass-strong:rgba(255,255,255,.06);
    --border-glass:rgba(255,255,255,.08);
    --border-glass-strong:rgba(255,255,255,.14);
    --gold:#e8b969;
    --gold-soft:#f2cc8f;
    --cyan:#3fd9e8;
    --magenta:#b98af0;
    --emerald:#3fe0ae;
    --coral:#ef7b6b;
    --text-1:#f2f3f7;
    --text-2:#9aa1b5;
    --text-3:#5c6580;
  }
  *{box-sizing:border-box;}
  html,body{
    background:var(--bg-0);
    font-family:'Inter',sans-serif;
    color:var(--text-1);
    -webkit-font-smoothing:antialiased;
  }
  .font-display{font-family:'Space Grotesk',sans-serif;}
  .font-mono{font-family:'JetBrains Mono',monospace;}

  .bg-aurora{
    position:fixed; inset:0; z-index:0; pointer-events:none;
    background:
      radial-gradient(60% 50% at 15% 0%, rgba(63,217,232,.10) 0%, transparent 60%),
      radial-gradient(50% 45% at 85% 10%, rgba(185,138,240,.10) 0%, transparent 60%),
      radial-gradient(70% 60% at 50% 100%, rgba(232,185,105,.05) 0%, transparent 60%),
      linear-gradient(180deg, #05060b 0%, #090a16 45%, #0a0714 100%);
  }
  .noise{
    position:fixed; inset:0; z-index:1; pointer-events:none; opacity:.025; mix-blend-mode:overlay;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  }

  .glass{
    background:var(--glass);
    border:1px solid var(--border-glass);
    backdrop-filter:blur(20px);
    -webkit-backdrop-filter:blur(20px);
  }
  .glass-strong{
    background:var(--glass-strong);
    border:1px solid var(--border-glass-strong);
    backdrop-filter:blur(24px);
    -webkit-backdrop-filter:blur(24px);
  }

  .card-hover{
    transition:transform .35s cubic-bezier(.2,.8,.2,1), border-color .35s ease, background .35s ease, box-shadow .35s ease;
  }
  .card-hover:hover{
    transform:translateY(-3px);
    border-color:var(--border-glass-strong);
    background:var(--glass-strong);
  }

  .glow-cyan:hover{ box-shadow:0 0 0 1px rgba(63,217,232,.25), 0 20px 40px -20px rgba(63,217,232,.35); }
  .glow-gold:hover{ box-shadow:0 0 0 1px rgba(232,185,105,.3), 0 20px 40px -20px rgba(232,185,105,.4); }
  .glow-magenta:hover{ box-shadow:0 0 0 1px rgba(185,138,240,.28), 0 20px 40px -20px rgba(185,138,240,.4); }
  .glow-emerald:hover{ box-shadow:0 0 0 1px rgba(63,224,174,.25), 0 20px 40px -20px rgba(63,224,174,.35); }
  .glow-coral:hover{ box-shadow:0 0 0 1px rgba(239,123,107,.3), 0 20px 40px -20px rgba(239,123,107,.4); }

  .tab-active{
    background:linear-gradient(135deg, rgba(232,185,105,.16), rgba(232,185,105,.04));
    border:1px solid rgba(232,185,105,.35);
    color:var(--gold-soft);
  }

  .btn-primary{
    background:linear-gradient(135deg, var(--gold) 0%, #d9a24f 100%);
    color:#241705;
  }
  .btn-primary:hover{ filter:brightness(1.08); }

  @keyframes floatIn{
    from{ opacity:0; transform:translateY(10px); }
    to{ opacity:1; transform:translateY(0); }
  }
  .enter{ animation:floatIn .5s cubic-bezier(.2,.8,.2,1) both; }

  @keyframes pulseSoft{
    0%,100%{ opacity:1; }
    50%{ opacity:.5; }
  }
  @media (prefers-reduced-motion: no-preference){
    .pulse-dot{ animation:pulseSoft 2.2s ease-in-out infinite; }
  }
  @media (prefers-reduced-motion: reduce){
    .enter{ animation:none; }
  }

  .progress-track{ background:rgba(255,255,255,.06); }
  .scrollbar-thin::-webkit-scrollbar{ height:6px; width:6px; }
  .scrollbar-thin::-webkit-scrollbar-thumb{ background:rgba(255,255,255,.12); border-radius:99px; }
</style>
</head>
<body class="min-h-screen relative">
<div class="bg-aurora"></div>
<div class="noise"></div>

<div class="relative z-10 max-w-[1400px] mx-auto px-6 md:px-10 py-8">

  <!-- ============ HEADER ============ -->
  <header class="flex flex-col md:flex-row md:items-center md:justify-between gap-5 mb-8 enter">
    <div>
      <div class="flex items-center gap-3">
        <div class="w-9 h-9 rounded-xl glass-strong flex items-center justify-center">
          <i class="ti ti-hexagon-letter-s text-[18px]" style="color:var(--gold-soft)"></i>
        </div>
        <h1 class="font-display text-[26px] md:text-[30px] font-semibold tracking-tight text-white">Panel Staff</h1>
      </div>
      <p class="mt-1.5 text-[13px] font-mono text-[var(--text-3)] pl-12">
        periodo <span class="text-[var(--text-2)]">2026-08-01</span> → <span class="text-[var(--text-2)]">2026-08-31</span>
        <span class="mx-2 opacity-40">/</span>
        <span style="color:var(--cyan)">14 días hábiles restantes</span>
        <span class="text-[var(--text-3)]"> (lun–sáb)</span>
      </p>
    </div>

    <div class="flex items-center gap-3">
      <button class="glass card-hover rounded-xl px-4 py-2.5 text-[13px] font-medium text-[var(--text-1)] flex items-center gap-2">
        <i class="ti ti-refresh text-[16px]" style="color:var(--cyan)"></i>
        Refrescar
      </button>
      <button class="glass card-hover rounded-xl px-4 py-2.5 text-[13px] font-medium text-[var(--text-2)] flex items-center gap-2">
        <i class="ti ti-logout text-[16px]"></i>
        Salir
      </button>
    </div>
  </header>

  <!-- ============ TABS ============ -->
  <nav class="glass rounded-2xl p-1.5 flex items-center gap-1 w-fit mb-6 enter" style="animation-delay:.05s">
    <button class="tab-active rounded-xl px-5 py-2.5 text-[13px] font-medium font-display">Resumen</button>
    <button class="rounded-xl px-5 py-2.5 text-[13px] font-medium text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors">Proyectado</button>
    <button class="rounded-xl px-5 py-2.5 text-[13px] font-medium text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors">Objetivos</button>
    <button class="rounded-xl px-5 py-2.5 text-[13px] font-medium text-[var(--text-2)] hover:text-[var(--text-1)] transition-colors">Cargar datos</button>
  </nav>

  <!-- ============ MODULE GROUPS ============ -->
  <section class="space-y-5 mb-6 enter" style="animation-delay:.1s">

    <!-- Group: Objetivos del día -->
    <div>
      <p class="text-[11px] font-mono uppercase tracking-wider text-[var(--text-3)] mb-2.5 pl-1">Objetivos</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <button class="tab-active rounded-2xl px-4 py-4 text-left card-hover glow-gold">
          <p class="font-display text-[14px] font-semibold">Día</p>
          <p class="text-[11px] text-[var(--text-3)] mt-0.5">Foco activo</p>
        </button>
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-cyan">
          <p class="font-display text-[14px] font-medium text-[var(--text-1)]">Max</p>
          <p class="text-[11px] text-[var(--text-3)] mt-0.5">Techo mensual</p>
        </button>
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-cyan">
          <p class="font-display text-[14px] font-medium text-[var(--text-1)]">Open</p>
          <p class="text-[11px] text-[var(--text-3)] mt-0.5">Meta abierta</p>
        </button>
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-magenta">
          <p class="font-display text-[14px] font-medium text-[var(--text-1)]">Champions</p>
          <p class="text-[11px] text-[var(--text-3)] mt-0.5">Ranking élite</p>
        </button>
      </div>
    </div>

    <!-- Group: Operación de ruta -->
    <div>
      <p class="text-[11px] font-mono uppercase tracking-wider text-[var(--text-3)] mb-2.5 pl-1">Operación de ruta</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-cyan">
          <i class="ti ti-map-2 text-[16px] mb-2 block" style="color:var(--cyan)"></i>
          <p class="text-[13px] font-medium text-[var(--text-1)]">Mesa de control</p>
        </button>
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-cyan">
          <i class="ti ti-ticket text-[16px] mb-2 block" style="color:var(--cyan)"></i>
          <p class="text-[13px] font-medium text-[var(--text-1)]">Cuponera</p>
        </button>
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-cyan">
          <i class="ti ti-clock-hour-4 text-[16px] mb-2 block" style="color:var(--cyan)"></i>
          <p class="text-[13px] font-medium text-[var(--text-1)]">Tiempos</p>
        </button>
        <button class="rounded-2xl px-4 py-4 text-left card-hover glow-coral" style="background:rgba(239,123,107,.08); border:1px solid rgba(239,123,107,.3)">
          <i class="ti ti-truck text-[16px] mb-2 block" style="color:var(--coral)"></i>
          <p class="text-[13px] font-semibold" style="color:var(--coral)">Unidades</p>
        </button>
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-cyan">
          <i class="ti ti-map-pin-cog text-[16px] mb-2 block" style="color:var(--cyan)"></i>
          <p class="text-[13px] font-medium text-[var(--text-1)]">Rutas</p>
        </button>
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-cyan">
          <i class="ti ti-building-warehouse text-[16px] mb-2 block" style="color:var(--cyan)"></i>
          <p class="text-[13px] font-medium text-[var(--text-1)]">Tepic</p>
        </button>
      </div>
    </div>

    <!-- Group: Personal & actividad -->
    <div>
      <p class="text-[11px] font-mono uppercase tracking-wider text-[var(--text-3)] mb-2.5 pl-1">Personal y actividad</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-emerald">
          <i class="ti ti-report-money text-[16px] mb-2 block" style="color:var(--emerald)"></i>
          <p class="text-[13px] font-medium text-[var(--text-1)]">Nómina</p>
        </button>
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-emerald">
          <i class="ti ti-user-x text-[16px] mb-2 block" style="color:var(--emerald)"></i>
          <p class="text-[13px] font-medium text-[var(--text-1)]">Sin visita</p>
        </button>
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-emerald">
          <i class="ti ti-activity text-[16px] mb-2 block" style="color:var(--emerald)"></i>
          <p class="text-[13px] font-medium text-[var(--text-1)]">Actividad</p>
        </button>
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-emerald">
          <i class="ti ti-fingerprint text-[16px] mb-2 block" style="color:var(--emerald)"></i>
          <p class="text-[13px] font-medium text-[var(--text-1)]">Reloj checador</p>
        </button>
        <button class="rounded-2xl px-4 py-4 text-left card-hover glow-magenta" style="background:rgba(185,138,240,.08); border:1px solid rgba(185,138,240,.3)">
          <i class="ti ti-calendar-event text-[16px] mb-2 block" style="color:var(--magenta)"></i>
          <p class="text-[13px] font-medium" style="color:var(--magenta)">Actividades día</p>
        </button>
        <button class="rounded-2xl px-4 py-4 text-left card-hover glow-magenta" style="background:rgba(185,138,240,.08); border:1px solid rgba(185,138,240,.3)">
          <i class="ti ti-calendar-week text-[16px] mb-2 block" style="color:var(--magenta)"></i>
          <p class="text-[13px] font-medium" style="color:var(--magenta)">Actividades semana</p>
        </button>
      </div>
    </div>

    <!-- Group: Comercial -->
    <div>
      <p class="text-[11px] font-mono uppercase tracking-wider text-[var(--text-3)] mb-2.5 pl-1">Comercial</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <button class="rounded-2xl px-4 py-4 text-left card-hover glow-magenta" style="background:rgba(185,138,240,.08); border:1px solid rgba(185,138,240,.3)">
          <i class="ti ti-calendar-month text-[16px] mb-2 block" style="color:var(--magenta)"></i>
          <p class="text-[13px] font-medium" style="color:var(--magenta)">Actividades mes</p>
        </button>
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-cyan">
          <i class="ti ti-calculator text-[16px] mb-2 block" style="color:var(--cyan)"></i>
          <p class="text-[13px] font-medium text-[var(--text-1)]">Cotizador</p>
        </button>
        <button class="rounded-2xl px-4 py-4 text-left card-hover glow-emerald" style="background:rgba(63,224,174,.08); border:1px solid rgba(63,224,174,.3)">
          <i class="ti ti-flag-3 text-[16px] mb-2 block" style="color:var(--emerald)"></i>
          <p class="text-[13px] font-medium" style="color:var(--emerald)">Rally OTC</p>
        </button>
        <button class="rounded-2xl px-4 py-4 text-left card-hover glow-gold relative overflow-hidden" style="background:rgba(232,185,105,.1); border:1px solid rgba(232,185,105,.35)">
          <span class="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full pulse-dot" style="background:var(--gold-soft)"></span>
          <i class="ti ti-bell-ringing text-[16px] mb-2 block" style="color:var(--gold-soft)"></i>
          <p class="text-[13px] font-semibold" style="color:var(--gold-soft)">Avisos</p>
        </button>
        <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-cyan">
          <i class="ti ti-file-invoice text-[16px] mb-2 block" style="color:var(--cyan)"></i>
          <p class="text-[13px] font-medium text-[var(--text-1)]">Facturas</p>
        </button>
        <button class="rounded-2xl px-4 py-4 text-left card-hover glow-emerald" style="background:rgba(63,224,174,.08); border:1px solid rgba(63,224,174,.3)">
          <i class="ti ti-credit-card text-[16px] mb-2 block" style="color:var(--emerald)"></i>
          <p class="text-[13px] font-medium" style="color:var(--emerald)">Créditos</p>
        </button>
      </div>
    </div>

    <div class="flex gap-3">
      <button class="glass rounded-2xl px-4 py-4 text-left card-hover glow-cyan flex-1 max-w-[220px]">
        <i class="ti ti-upload text-[16px] mb-2 block" style="color:var(--cyan)"></i>
        <p class="text-[13px] font-medium text-[var(--text-1)]">Cargas</p>
      </button>
    </div>
  </section>

  <!-- ============ PWST BRAND STRIP ============ -->
  <div class="glass rounded-xl py-2.5 text-center mb-8 enter" style="animation-delay:.15s">
    <span class="font-mono text-[11px] tracking-[0.3em] text-[var(--text-3)]">PWST</span>
  </div>

  <!-- ============ ALERT (elegante, no agresiva) ============ -->
  <div class="rounded-2xl p-5 md:p-6 mb-8 enter card-hover" style="background:rgba(239,123,107,.06); border:1px solid rgba(239,123,107,.22); animation-delay:.2s">
    <div class="flex items-start gap-4">
      <div class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style="background:rgba(239,123,107,.14)">
        <i class="ti ti-alert-triangle text-[18px]" style="color:var(--coral)"></i>
      </div>
      <div class="flex-1">
        <div class="flex items-center justify-between mb-1">
          <p class="font-display text-[14px] font-semibold" style="color:var(--coral)">Bajo desempeño hoy</p>
          <span class="font-mono text-[11px] text-[var(--text-3)]">avance del 2026-08-15</span>
        </div>
        <div class="grid sm:grid-cols-2 gap-3 mt-3">
          <div class="rounded-xl px-4 py-3" style="background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.06)">
            <p class="text-[13px] text-[var(--text-1)]">Ruta <span class="font-mono" style="color:var(--coral)">J201</span> · Francisco Javier</p>
            <p class="text-[12px] text-[var(--text-3)] mt-0.5">46 paq. vendidos · meta del día ~111 paq.</p>
          </div>
          <div class="rounded-xl px-4 py-3" style="background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.06)">
            <p class="text-[13px] text-[var(--text-1)]">Ruta <span class="font-mono" style="color:var(--coral)">J207</span> · Alfredo Juárez</p>
            <p class="text-[12px] text-[var(--text-3)] mt-0.5">92 paq. vendidos · meta del día ~199 paq.</p>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- ============ KPI GRID ============ -->
  <section class="enter" style="animation-delay:.25s">
    <div class="flex items-center justify-between mb-3 pl-1">
      <p class="text-[11px] font-mono uppercase tracking-wider text-[var(--text-3)]">Métricas de hoy</p>
      <p class="font-mono text-[11px] text-[var(--text-3)]">2026-08-15</p>
    </div>

    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">

      <!-- Volumen (hero KPI, wider feel via color) -->
      <div class="glass-strong rounded-2xl p-5 card-hover glow-gold col-span-2 lg:col-span-1">
        <div class="flex items-center gap-2 mb-3">
          <i class="ti ti-target-arrow text-[15px]" style="color:var(--gold-soft)"></i>
          <p class="text-[12px] text-[var(--text-2)]">Volumen (hoy)</p>
        </div>
        <p class="font-display text-[26px] font-semibold text-white leading-none">750 <span class="text-[14px] font-normal text-[var(--text-3)]">/ 1,229 paq.</span></p>
        <div class="h-1.5 rounded-full progress-track mt-4 overflow-hidden">
          <div class="h-full rounded-full" style="width:61%; background:linear-gradient(90deg, var(--gold), var(--gold-soft))"></div>
        </div>
        <p class="text-[11px] font-mono mt-1.5" style="color:var(--gold-soft)">61% del objetivo</p>
      </div>

      <div class="glass rounded-2xl p-5 card-hover glow-cyan">
        <div class="flex items-center gap-2 mb-3">
          <i class="ti ti-snowflake text-[15px]" style="color:var(--cyan)"></i>
          <p class="text-[12px] text-[var(--text-2)]">Ice Mix</p>
        </div>
        <p class="font-display text-[22px] font-semibold text-white leading-none">44 <span class="text-[13px] font-normal text-[var(--text-3)]">/ 41 paq.</span></p>
        <div class="h-1.5 rounded-full progress-track mt-4 overflow-hidden">
          <div class="h-full rounded-full" style="width:100%; background:var(--emerald)"></div>
        </div>
        <p class="text-[11px] font-mono mt-1.5" style="color:var(--emerald)">meta superada</p>
      </div>

      <div class="glass rounded-2xl p-5 card-hover glow-cyan">
        <div class="flex items-center gap-2 mb-3">
          <i class="ti ti-flower text-[15px]" style="color:var(--cyan)"></i>
          <p class="text-[12px] text-[var(--text-2)]">Blossom Mix</p>
        </div>
        <p class="font-display text-[22px] font-semibold text-white leading-none">17 <span class="text-[13px] font-normal text-[var(--text-3)]">/ 13 paq.</span></p>
        <div class="h-1.5 rounded-full progress-track mt-4 overflow-hidden">
          <div class="h-full rounded-full" style="width:100%; background:var(--emerald)"></div>
        </div>
        <p class="text-[11px] font-mono mt-1.5" style="color:var(--emerald)">meta superada</p>
      </div>

      <div class="glass rounded-2xl p-5 card-hover glow-cyan">
        <div class="flex items-center gap-2 mb-3">
          <i class="ti ti-sun text-[15px]" style="color:var(--cyan)"></i>
          <p class="text-[12px] text-[var(--text-2)]">Summer Mix</p>
        </div>
        <p class="font-display text-[22px] font-semibold text-white leading-none">20 <span class="text-[13px] font-normal text-[var(--text-3)]">/ 15 paq.</span></p>
        <div class="h-1.5 rounded-full progress-track mt-4 overflow-hidden">
          <div class="h-full rounded-full" style="width:100%; background:var(--emerald)"></div>
        </div>
        <p class="text-[11px] font-mono mt-1.5" style="color:var(--emerald)">meta superada</p>
      </div>

      <div class="glass rounded-2xl p-5 card-hover glow-magenta">
        <div class="flex items-center gap-2 mb-3">
          <i class="ti ti-award text-[15px]" style="color:var(--magenta)"></i>
          <p class="text-[12px] text-[var(--text-2)]">Faronet</p>
        </div>
        <p class="font-display text-[22px] font-semibold text-white leading-none">109 <span class="text-[13px] font-normal text-[var(--text-3)]">paq.</span></p>
      </div>

      <div class="glass rounded-2xl p-5 card-hover glow-gold">
        <div class="flex items-center gap-2 mb-3">
          <i class="ti ti-currency-dollar text-[15px]" style="color:var(--gold-soft)"></i>
          <p class="text-[12px] text-[var(--text-2)]">OTC</p>
        </div>
        <p class="font-display text-[22px] font-semibold text-white leading-none">$7,746</p>
      </div>

      <div class="glass rounded-2xl p-5 card-hover glow-emerald">
        <div class="flex items-center gap-2 mb-3">
          <i class="ti ti-route text-[15px]" style="color:var(--emerald)"></i>
          <p class="text-[12px] text-[var(--text-2)]">OTC sin Vuala</p>
        </div>
        <p class="font-display text-[22px] font-semibold text-white leading-none">7 <span class="text-[13px] font-normal text-[var(--text-3)]">/ 7 rutas</span></p>
      </div>

      <div class="glass rounded-2xl p-5 card-hover glow-cyan">
        <div class="flex items-center gap-2 mb-3">
          <i class="ti ti-map-pin-check text-[15px]" style="color:var(--cyan)"></i>
          <p class="text-[12px] text-[var(--text-2)]">Visitas efectivas</p>
        </div>
        <p class="font-display text-[22px] font-semibold text-white leading-none">277</p>
      </div>

    </div>
  </section>

</div>
</body>
</html>
