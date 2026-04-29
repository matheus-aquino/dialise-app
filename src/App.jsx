import { useState, useEffect, useRef, useCallback } from "react";

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

const PHASES = [
  { key: "infusao",    label: "Infusão",    icon: "↓", color: "#3b82f6", lightBg: "#eff6ff", darkBg: "#1e3358", desc: "Líquido entrando" },
  { key: "permanencia",label: "Permanência",icon: "◎", color: "#8b5cf6", lightBg: "#f5f3ff", darkBg: "#2d1f5e", desc: "Líquido no corpo" },
  { key: "drenagem",   label: "Drenagem",   icon: "↑", color: "#10b981", lightBg: "#ecfdf5", darkBg: "#0d3528", desc: "Líquido saindo"  },
];

const NEXT_PHASE_LABEL = ["Iniciar Permanência", "Iniciar Drenagem", "Iniciar novo ciclo"];

const LIGHT = {
  appBg:               "linear-gradient(135deg, #f0f7ff 0%, #faf5ff 50%, #f0fdf4 100%)",
  headerBg:            "white",
  headerBorder:        "#e2e8f0",
  cardBg:              "white",
  cardShadow:          "0 4px 24px rgba(0,0,0,0.06)",
  textPrimary:         "#0f172a",
  textSecondary:       "#64748b",
  textMuted:           "#94a3b8",
  border:              "#e2e8f0",
  ringBg:              "#e2e8f0",
  rowHover:            "#f8fafc",
  inactivePill:        "#f8fafc",
  inactiveText:        "#94a3b8",
  inactiveTime:        "#cbd5e1",
  confirmBg:           "#fafafa",
  inputBg:             "white",
  inputColor:          "#0f172a",
  modalBg:             "white",
  configSummBg:        "#f8fafc",
  cancelBg:            "#f1f5f9",
  cancelColor:         "#475569",
  confirmDisabled:     "#e2e8f0",
  confirmDisabledText: "#94a3b8",
  confirmBtnColor:     "white",
  cycleColor:          "#64748b",
  pauseBg:             "#fef3c7",
  pauseColor:          "#d97706",
  resetBg:             "#fef2f2",
  resetColor:          "#ef4444",
  notifBg:             "#fffbeb",
  notifBorder:         "#fbbf24",
  notifText:           "#92400e",
};

const DARK = {
  appBg:               "linear-gradient(135deg, #0a0f1e 0%, #150f2e 50%, #0a1a12 100%)",
  headerBg:            "#111827",
  headerBorder:        "#1f2937",
  cardBg:              "#111827",
  cardShadow:          "0 4px 24px rgba(0,0,0,0.4)",
  textPrimary:         "#f1f5f9",
  textSecondary:       "#94a3b8",
  textMuted:           "#475569",
  border:              "#1f2937",
  ringBg:              "#1f2937",
  rowHover:            "#1a2235",
  inactivePill:        "#1f2937",
  inactiveText:        "#4b5563",
  inactiveTime:        "#374151",
  confirmBg:           "#1a2235",
  inputBg:             "#1f2937",
  inputColor:          "#f1f5f9",
  modalBg:             "#111827",
  configSummBg:        "#1f2937",
  cancelBg:            "#1f2937",
  cancelColor:         "#94a3b8",
  confirmDisabled:     "#1f2937",
  confirmDisabledText: "#374151",
  confirmBtnColor:     "#0f172a",
  cycleColor:          "#64748b",
  pauseBg:             "#2d2310",
  pauseColor:          "#fbbf24",
  resetBg:             "#2d1515",
  resetColor:          "#f87171",
  notifBg:             "#2d2310",
  notifBorder:         "#854d0e",
  notifText:           "#fde68a",
};

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, "0");
  const s = (seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

function formatDateTime(date) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function DialiseApp() {
  const [dark, setDark] = useState(false);
  const T = dark ? DARK : LIGHT;

  const [config, setConfig] = useState({ infusao: 10, permanencia: 30, drenagem: 20, volume: 10 });
  const [editConfig, setEditConfig] = useState({ ...config });
  const [configOpen, setConfigOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [phaseComplete, setPhaseComplete] = useState(false);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [cycleCount, setCycleCount] = useState(1);
  const [history, setHistory] = useState([]);
  const [notifPermission, setNotifPermission] = useState("default");
  const [drainedVolume, setDrainedVolume] = useState("");

  const intervalRef = useRef(null);
  const alarmRef = useRef(null);
  const audioCtx = useRef(null);

  const windowWidth = useWindowWidth();
  const isDesktop = windowWidth >= 768;

  const currentPhase = PHASES[phaseIndex];
  const phaseBg = dark ? currentPhase.darkBg : currentPhase.lightBg;
  const phaseDuration = config[currentPhase.key] * 60;
  const progress = Math.min((elapsed / phaseDuration) * 100, 100);
  const circumference = 2 * Math.PI * 54;
  const strokeDash = circumference - (progress / 100) * circumference;

  useEffect(() => {
    if ("Notification" in window) setNotifPermission(Notification.permission);
  }, []);

  const requestNotifPermission = async () => {
    if (!("Notification" in window)) return;
    try { const r = await Notification.requestPermission(); setNotifPermission(r); }
    catch { Notification.requestPermission((r) => setNotifPermission(r)); }
  };

  const sendNotification = useCallback((title, body) => {
    if ("Notification" in window && Notification.permission === "granted")
      new Notification(title, { body, icon: "💧", tag: "dialise-alert" });
  }, []);

  const playTone = useCallback((freq = 880, dur = 0.35, vol = 0.4) => {
    try {
      if (!audioCtx.current) audioCtx.current = new (window.AudioContext || window.webkitAudioContext)();
      const ctx = audioCtx.current;
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = freq; osc.type = "sine";
      gain.gain.setValueAtTime(vol, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime + dur);
    } catch {}
  }, []);

  const stopAlarm = () => { if (alarmRef.current) { clearInterval(alarmRef.current); alarmRef.current = null; } };

  const startAlarm = useCallback(() => {
    stopAlarm();
    const doBeeps = () => { playTone(880,0.2,0.5); setTimeout(()=>playTone(880,0.2,0.5),300); setTimeout(()=>playTone(1100,0.4,0.6),600); };
    doBeeps();
    alarmRef.current = setInterval(doBeeps, 2500);
  }, [playTone]);

  const onPhaseEnd = useCallback((phaseIdx, actualElapsed, cycle) => {
    clearInterval(intervalRef.current);
    setRunning(false); setPhaseComplete(true); setDrainedVolume("");
    const phase = PHASES[phaseIdx];
    setHistory((h) => [{ id: Date.now(), ciclo: cycle, fase: phase.label,
      volume: phaseIdx === 0 ? config.volume : null,
      duracao: Math.round(actualElapsed / 60 * 10) / 10,
      hora: formatDateTime(new Date()), phaseKey: phase.key,
      pendingDrainage: phaseIdx === 2 }, ...h]);
    startAlarm();
    sendNotification(`⏰ ${phase.label} concluída!`, `Fase ${phaseIdx+1}/3 finalizada. Toque para continuar.`);
  }, [config.volume, startAlarm, sendNotification]);

  useEffect(() => {
    if (!running) return;
    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;
        if (next >= phaseDuration) {
          setPhaseIndex((pi) => { setCycleCount((cc) => { setTimeout(() => onPhaseEnd(pi, next, cc), 0); return cc; }); return pi; });
          return phaseDuration;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(intervalRef.current);
  }, [running, phaseDuration, onPhaseEnd]);

  const handleStart = () => { requestNotifPermission(); setRunning(true); };
  const handlePause = () => setRunning(false);
  const handleConfirmNext = () => {
    stopAlarm();
    if (phaseIndex === 2)
      setHistory((h) => h.map((e, i) => i === 0 && e.pendingDrainage
        ? { ...e, volume: drainedVolume !== "" ? parseFloat(drainedVolume) : null, pendingDrainage: false } : e));
    setPhaseComplete(false); setDrainedVolume(""); setElapsed(0);
    setPhaseIndex((pi) => { const next = (pi+1)%3; if (pi===2) setCycleCount((cc)=>cc+1); return next; });
  };
  const handleReset = () => {
    stopAlarm(); setRunning(false); setPhaseComplete(false);
    clearInterval(intervalRef.current);
    setPhaseIndex(0); setElapsed(0); setCycleCount(1);
  };
  const handleSaveConfig = () => { setConfig({ ...editConfig }); setConfigOpen(false); };

  const totalIn  = history.filter(h => h.phaseKey==="infusao"  && h.volume).reduce((s,h)=>s+h.volume,0);
  const totalOut = history.filter(h => h.phaseKey==="drenagem" && h.volume).reduce((s,h)=>s+h.volume,0);

  const inputStyle = { width:"100%", padding:"10px 14px", border:`2px solid ${T.border}`, borderRadius:10, fontSize:15, fontFamily:"'DM Mono',monospace", outline:"none", background:T.inputBg, color:T.inputColor, transition:"background 0.3s,border-color 0.3s" };

  return (
    <div style={{ minHeight:"100vh", background:T.appBg, fontFamily:"'DM Sans','Segoe UI',sans-serif", transition:"background 0.3s" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Mono:wght@400;500&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        .btn { cursor:pointer; border:none; font-family:inherit; font-weight:600; border-radius:12px; transition:all 0.2s; }
        .btn:hover { transform:translateY(-1px); filter:brightness(1.08); }
        .btn:active { transform:translateY(0); }
        .phase-pill { padding:6px 14px; border-radius:20px; font-size:13px; font-weight:600; }
        ::-webkit-scrollbar { width:6px; } ::-webkit-scrollbar-track { background:transparent; } ::-webkit-scrollbar-thumb { background:#475569; border-radius:3px; }
        .history-row:hover { background:${T.rowHover}; }
        .ring-bg { fill:none; stroke:${T.ringBg}; stroke-width:8; }
        .ring-progress { fill:none; stroke-width:8; stroke-linecap:round; transition:stroke-dashoffset 0.8s ease,stroke 0.5s; transform:rotate(-90deg); transform-origin:60px 60px; }
        .pulse { animation:pulse 2s ease-in-out infinite; }
        @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.4} }
        .confirm-btn { position:relative; overflow:hidden; }
        .confirm-btn::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg,transparent,rgba(255,255,255,0.08),transparent); transform:translateX(-100%); animation:shimmer 2s ease-in-out infinite; }
        @keyframes shimmer { 0%{transform:translateX(-100%)} 100%{transform:translateX(100%)} }
        .fade-in { animation:fadeIn 0.4s ease; }
        @keyframes fadeIn { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .modal-bg { position:fixed;inset:0;background:rgba(0,0,0,0.55);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;z-index:100; }
        input[type=number]::-webkit-inner-spin-button { opacity:0.4; }
      `}</style>

      {/* Header */}
      <div style={{ background:T.headerBg, borderBottom:`1px solid ${T.headerBorder}`, padding:"14px 24px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:50, transition:"background 0.3s,border-color 0.3s" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ width:36, height:36, background:"linear-gradient(135deg,#3b82f6,#8b5cf6)", borderRadius:10, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18 }}>💧</div>
          <div>
            <div style={{ fontSize:17, fontWeight:700, color:T.textPrimary, letterSpacing:"-0.3px" }}>DiáliSe</div>
            <div style={{ fontSize:12, color:T.textMuted, fontWeight:500 }}>Controle de Diálise Peritoneal</div>
          </div>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <div style={{ fontSize:13, color:T.cycleColor }}>Ciclo <strong style={{ color:T.textPrimary, fontFamily:"'DM Mono'" }}>{cycleCount}</strong></div>

          {/* Theme switch */}
          <button onClick={() => setDark(d=>!d)} style={{ display:"flex", alignItems:"center", gap:7, background:"none", border:"none", cursor:"pointer", padding:"4px 2px" }} title={dark ? "Tema claro" : "Tema escuro"}>
            <span style={{ fontSize:14 }}>{dark ? "🌙" : "☀️"}</span>
            <div style={{ width:40, height:22, borderRadius:11, background: dark ? "#3b82f6" : "#d1d5db", position:"relative", transition:"background 0.3s", flexShrink:0 }}>
              <div style={{ position:"absolute", top:3, left: dark ? 21 : 3, width:16, height:16, borderRadius:"50%", background:"white", transition:"left 0.3s", boxShadow:"0 1px 4px rgba(0,0,0,0.25)" }} />
            </div>
          </button>

          <button className="btn" onClick={() => { setEditConfig({...config}); setConfigOpen(true); }} style={{ background:T.cancelBg, color:T.cancelColor, padding:"8px 16px", fontSize:13 }}>⚙️ Configurar</button>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ padding: isDesktop?"24px 32px 0":"20px 16px 0" }}>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr 1fr", gap: isDesktop?14:10 }}>
          {[
            { label:"Volume/ciclo", value:`${config.volume} mL`, icon:"💧", color:"#3b82f6" },
            { label:"Ciclos",       value: cycleCount,            icon:"🔄", color:"#8b5cf6" },
            { label:"Vol. total in", value:`${totalIn} mL`,       icon:"↓",  color:"#3b82f6" },
            { label:"Vol. total out",value:`${totalOut} mL`,      icon:"↑",  color:"#10b981" },
          ].map((item) => (
            <div key={item.label} className="fade-in" style={{ background:T.cardBg, boxShadow:T.cardShadow, borderRadius:20, padding: isDesktop?"16px 14px":"12px 10px", textAlign:"center", transition:"background 0.3s" }}>
              <div style={{ fontSize: isDesktop?20:16, marginBottom:4 }}>{item.icon}</div>
              <div style={{ fontFamily:"'DM Mono'", fontSize: isDesktop?16:14, fontWeight:600, color:item.color, lineHeight:1.2 }}>{item.value}</div>
              <div style={{ fontSize: isDesktop?12:10, color:T.textMuted, marginTop:3, lineHeight:1.2 }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main grid */}
      <div style={{ padding: isDesktop?"20px 32px 32px":"16px 16px 32px",
        display: isDesktop?"grid":"flex", gridTemplateColumns: isDesktop?"minmax(340px, 30%) 1fr":undefined,
        flexDirection: isDesktop?undefined:"column", gap: isDesktop?24:16, alignItems:"start" }}>

        {/* Timer card */}
        <div className="fade-in" style={{ background:T.cardBg, boxShadow:T.cardShadow, borderRadius:20, padding: isDesktop?36:28, display:"flex", flexDirection:"column", alignItems:"center", gap:22, width:"100%", transition:"background 0.3s" }}>

          <div style={{ textAlign:"center" }}>
            <div className="phase-pill" style={{ background:phaseBg, color:currentPhase.color, display:"inline-block", marginBottom:8 }}>{currentPhase.icon} {currentPhase.label}</div>
            <div style={{ fontSize:14, color:T.textSecondary }}>{currentPhase.desc}</div>
          </div>

          {/* Ring timer */}
          <div style={{ position:"relative", width: isDesktop?180:140, height: isDesktop?180:140 }}>
            <svg width={isDesktop?180:140} height={isDesktop?180:140} viewBox="0 0 120 120">
              <circle className="ring-bg" cx="60" cy="60" r="54" />
              <circle className="ring-progress" cx="60" cy="60" r="54" stroke={currentPhase.color} strokeDasharray={circumference} strokeDashoffset={strokeDash} />
            </svg>
            <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
              <div style={{ fontFamily:"'DM Mono'", fontSize: isDesktop?34:28, fontWeight:500, color:T.textPrimary, lineHeight:1 }}>{formatTime(elapsed)}</div>
              <div style={{ fontSize:12, color:T.textMuted, marginTop:2 }}>de {formatTime(phaseDuration)}</div>
            </div>
          </div>

          {/* Phase indicators */}
          <div style={{ display:"flex", gap:8, width:"100%" }}>
            {PHASES.map((p, i) => {
              const active = i === phaseIndex;
              return (
                <div key={p.key} style={{ flex:1, padding:"8px 4px", borderRadius:10, textAlign:"center", background: active?(dark?p.darkBg:p.lightBg):T.inactivePill, border:`2px solid ${active?p.color:"transparent"}`, transition:"all 0.3s" }}>
                  <div style={{ fontSize:16 }}>{p.icon}</div>
                  <div style={{ fontSize:11, fontWeight:600, color: active?p.color:T.inactiveText, marginTop:2 }}>{p.label}</div>
                  <div style={{ fontFamily:"'DM Mono'", fontSize:12, color: active?p.color:T.inactiveTime }}>{config[p.key]}min</div>
                </div>
              );
            })}
          </div>

          {/* Phase complete */}
          {phaseComplete && (
            <div style={{ width:"100%", padding:20, borderRadius:16, background:T.confirmBg, border:`1px solid ${T.border}`, textAlign:"center" }}>
              <div style={{ width:8, height:8, borderRadius:"50%", background:T.textMuted, margin:"0 auto 14px", animation:"pulse 1.5s ease-in-out infinite" }} />
              <div style={{ fontSize:15, fontWeight:600, color:T.textPrimary, marginBottom:4 }}>{currentPhase.label} concluída</div>
              <div style={{ fontSize:13, color:T.textMuted, marginBottom: phaseIndex===2?16:18 }}>Próxima fase: {NEXT_PHASE_LABEL[phaseIndex]}</div>

              {phaseIndex === 2 && (
                <div style={{ marginBottom:16, textAlign:"left" }}>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:T.textSecondary, marginBottom:6, letterSpacing:"0.04em", textTransform:"uppercase" }}>Volume drenado (mL)</label>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <input type="number" min="0" placeholder={`Esperado: ${config.volume} mL`} value={drainedVolume}
                      onChange={(e) => setDrainedVolume(e.target.value)} autoFocus
                      style={{ ...inputStyle, textAlign:"center", fontSize:20 }} />
                    <span style={{ fontSize:14, color:T.textMuted }}>mL</span>
                  </div>
                  {drainedVolume !== "" && (
                    <div style={{ marginTop:6, fontSize:12, fontWeight:500, color: parseFloat(drainedVolume)<config.volume?"#f59e0b":"#10b981" }}>
                      {parseFloat(drainedVolume)<config.volume ? `↓ ${config.volume-parseFloat(drainedVolume)} mL abaixo do esperado` : `✓ Volume adequado`}
                    </div>
                  )}
                </div>
              )}

              <button className="btn confirm-btn" onClick={handleConfirmNext}
                disabled={phaseIndex===2 && drainedVolume===""}
                style={{ width:"100%", padding:"13px", fontSize:14, borderRadius:12, letterSpacing:"0.01em",
                  background: phaseIndex===2&&drainedVolume===""?T.confirmDisabled:T.textPrimary,
                  color: phaseIndex===2&&drainedVolume===""?T.confirmDisabledText:T.confirmBtnColor,
                  cursor: phaseIndex===2&&drainedVolume===""?"not-allowed":"pointer" }}>
                {NEXT_PHASE_LABEL[phaseIndex]} →
              </button>
              {phaseIndex===2 && drainedVolume==="" && (
                <div style={{ marginTop:8, fontSize:11, color:T.textMuted }}>Informe o volume drenado para continuar</div>
              )}
            </div>
          )}

          {/* Running status */}
          {running && !phaseComplete && (
            <div style={{ width:"100%", padding:"10px 14px", borderRadius:12, background:phaseBg, border:`1px solid ${currentPhase.color}44`, display:"flex", alignItems:"center", gap:10 }}>
              <div className="pulse" style={{ width:8, height:8, borderRadius:"50%", background:currentPhase.color, flexShrink:0 }} />
              <div style={{ fontSize:13, color:currentPhase.color, fontWeight:600 }}>
                Restam <span style={{ fontFamily:"'DM Mono'" }}>{formatTime(phaseDuration-elapsed)}</span> — Fase {phaseIndex+1}/3
              </div>
            </div>
          )}

          {/* Notif banner */}
          {notifPermission==="default" && !running && !phaseComplete && (
            <div style={{ width:"100%", padding:"10px 14px", borderRadius:12, background:T.notifBg, border:`1px solid ${T.notifBorder}`, display:"flex", alignItems:"center", gap:10 }}>
              <span style={{ fontSize:16 }}>🔔</span>
              <div style={{ flex:1, fontSize:12, color:T.notifText }}>Ative notificações para alertas mesmo com a tela bloqueada</div>
              <button className="btn" onClick={requestNotifPermission} style={{ padding:"6px 12px", fontSize:12, background:"#f59e0b", color:"white" }}>Ativar</button>
            </div>
          )}

          {/* Controls */}
          {!phaseComplete && (
            <div style={{ display:"flex", gap:10, width:"100%" }}>
              {!running
                ? <button className="btn" onClick={handleStart} style={{ flex:1, padding:"14px", fontSize:15, background:`linear-gradient(135deg,${currentPhase.color},#8b5cf6)`, color:"white" }}>▶ {elapsed===0?"Iniciar":"Retomar"}</button>
                : <button className="btn" onClick={handlePause} style={{ flex:1, padding:"14px", fontSize:15, background:T.pauseBg, color:T.pauseColor }}>⏸ Pausar</button>}
              <button className="btn" onClick={handleReset} style={{ padding:"14px 18px", fontSize:15, background:T.resetBg, color:T.resetColor }}>↺</button>
            </div>
          )}
        </div>

        {/* History card */}
        <div className="fade-in" style={{ background:T.cardBg, boxShadow:T.cardShadow, borderRadius:20, padding: isDesktop?28:24, width:"100%", transition:"background 0.3s" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
            <div style={{ fontSize:15, fontWeight:700, color:T.textPrimary }}>📋 Histórico</div>
            <div style={{ fontSize:13, color:T.textMuted }}>{history.length} registros</div>
          </div>

          {history.length===0 ? (
            <div style={{ textAlign:"center", padding:"40px 20px", color:T.textMuted }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
              <div style={{ fontSize:14 }}>Nenhum registro ainda. Inicie o cronômetro para começar.</div>
            </div>
          ) : (
            <div style={{ overflowX:"auto" }}>
              <table style={{ width:"100%", borderCollapse:"collapse", fontSize:14 }}>
                <thead>
                  <tr style={{ borderBottom:`2px solid ${T.border}` }}>
                    {["Ciclo","Fase","Volume","Duração real","Horário"].map((h) => (
                      <th key={h} style={{ padding:"8px 12px", textAlign:"left", color:T.textSecondary, fontWeight:600, fontSize:12, textTransform:"uppercase", letterSpacing:"0.05em" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {history.map((row, idx) => {
                    const phase = PHASES.find((p) => p.key===row.phaseKey);
                    const isNewCycle = idx>0 && history[idx-1].ciclo!==row.ciclo;
                    const vol = row.volume;
                    const volColor = row.phaseKey==="drenagem" && vol!=null
                      ? vol<config.volume ? "#ef4444" : "#10b981"
                      : T.textPrimary;
                    const pad = isNewCycle?"14px 12px 10px":"10px 12px";
                    return (
                      <tr key={row.id} className="history-row" style={{ borderBottom:`1px solid ${T.border}`, borderTop: isNewCycle?`2px solid ${T.border}`:undefined }}>
                        <td style={{ padding:pad, fontFamily:"'DM Mono'", color:T.textSecondary }}>#{row.ciclo}</td>
                        <td style={{ padding:pad }}>
                          <span className="phase-pill" style={{ background: dark?phase?.darkBg:phase?.lightBg, color:phase?.color }}>{phase?.icon} {row.fase}</span>
                        </td>
                        <td style={{ padding:pad, fontFamily:"'DM Mono'" }}>
                          {vol!=null ? <span style={{ color:volColor, fontWeight:600 }}>{vol} mL</span> : <span style={{ color:T.inactiveTime }}>—</span>}
                        </td>
                        <td style={{ padding:pad, fontFamily:"'DM Mono'", color:T.textPrimary }}>{row.duracao} min</td>
                        <td style={{ padding:pad, color:T.textSecondary }}>{row.hora}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Config Modal */}
      {configOpen && (
        <div className="modal-bg" onClick={(e)=>e.target===e.currentTarget&&setConfigOpen(false)}>
          <div style={{ background:T.modalBg, borderRadius:24, padding:32, width:"min(480px,90vw)", boxShadow:"0 24px 64px rgba(0,0,0,0.3)", animation:"fadeIn 0.3s ease" }}>
            <div style={{ fontSize:20, fontWeight:700, color:T.textPrimary, marginBottom:4 }}>⚙️ Configurações</div>
            <div style={{ fontSize:14, color:T.textSecondary, marginBottom:24 }}>Personalize os parâmetros do ciclo de diálise</div>

            {PHASES.map((p) => (
              <div key={p.key} style={{ marginBottom:18 }}>
                <label style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6, fontSize:14, fontWeight:600, color:T.textPrimary }}>
                  <span className="phase-pill" style={{ background:dark?p.darkBg:p.lightBg, color:p.color }}>{p.icon} {p.label}</span>
                  <span style={{ color:T.textMuted, fontWeight:400 }}>duração (minutos)</span>
                </label>
                <input type="number" min="1" max="999" value={editConfig[p.key]}
                  onChange={(e)=>setEditConfig((c)=>({...c,[p.key]:parseInt(e.target.value)||1}))}
                  style={inputStyle} />
              </div>
            ))}

            <div style={{ marginBottom:24 }}>
              <label style={{ display:"block", marginBottom:6, fontSize:14, fontWeight:600, color:T.textPrimary }}>💧 Volume por ciclo (mL)</label>
              <input type="number" min="1" max="9999" value={editConfig.volume}
                onChange={(e)=>setEditConfig((c)=>({...c,volume:parseInt(e.target.value)||1}))}
                style={inputStyle} />
            </div>

            <div style={{ background:T.configSummBg, borderRadius:12, padding:"12px 16px", marginBottom:20, fontSize:13, color:T.textSecondary }}>
              Duração total por ciclo: <strong style={{ fontFamily:"'DM Mono'", color:T.textPrimary }}>{editConfig.infusao+editConfig.permanencia+editConfig.drenagem} minutos</strong>
            </div>

            <div style={{ display:"flex", gap:10 }}>
              <button className="btn" onClick={()=>setConfigOpen(false)} style={{ flex:1, padding:"12px", background:T.cancelBg, color:T.cancelColor, fontSize:14 }}>Cancelar</button>
              <button className="btn" onClick={handleSaveConfig} style={{ flex:2, padding:"12px", background:"linear-gradient(135deg,#3b82f6,#8b5cf6)", color:"white", fontSize:14 }}>Salvar configurações</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
