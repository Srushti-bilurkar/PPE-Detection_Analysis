import { useState, useRef, useEffect } from "react";

const API_BASE = "http://localhost:8000";

const QUICK_CHIPS = [
  "Today's compliance?",
  "Active violations",
  "Camera status",
  "Worker safety report",
];

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [badge, setBadge] = useState(0);
  const msgRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (msgRef.current) msgRef.current.scrollTop = msgRef.current.scrollHeight;
  }, [messages, loading]);

  useEffect(() => {
    if (open) {
      setBadge(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const send = async (text) => {
    const msg = text || input;
    if (!msg.trim() || loading) return;
    const today = new Date().toISOString().split("T")[0];
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: msg }]);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg, date: null , history: history.slice(-10) }),
      });
      const data = await res.json();
      const reply = data.reply || "No response.";
      setMessages((prev) => [...prev, { role: "bot", text: reply }]);
      setHistory((prev) => [
        ...prev,
        { role: "user", content: msg },
        { role: "assistant", content: reply },
      ]);
      if (!open) setBadge((b) => b + 1);
    } catch (e) {
      setMessages((prev) => [...prev, { role: "bot", text: `Connection error: ${e.message}` }]);
    }
    setLoading(false);
  };

  const handleKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const now = () => new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return (
    <>
      {/* ── Floating Action Button ── */}
      <button onClick={() => setOpen((o) => !o)} style={styles.fab} title="Safety AI Assistant">
        {open ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
          </svg>
        // REPLACE WITH
        ) : (
          <span style={{ fontSize: "22px" }}>🤖</span>
        )}
        {badge > 0 && !open && <span style={styles.badge}>{badge}</span>}
      </button>

      {/* ── Chat Panel ── */}
      {open && (
        <div style={styles.panel}>
          {/* Header */}
          <div style={styles.header}>
            <div style={styles.headerIcon}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h2v2h-2zm1-13c-2.76 0-5 2.24-5 5h2c0-1.66 1.34-3 3-3s3 1.34 3 3c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.76-2.24-5-5-5z"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <div style={styles.headerTitle}>YOLOIntel Safety Assistant</div>
              <div style={styles.headerSub}>AI-powered · Live site data</div>
            </div>
            <span style={styles.onlineDot} />
          </div>

          {/* Messages */}
          <div ref={msgRef} style={styles.messages}>
            {messages.length === 0 && (
              <div style={styles.emptyState}>
                <div style={{ fontSize: 36 }}>🦺</div>
                <p style={styles.emptyText}>
                  Ask me about PPE violations, worker safety, camera alerts, or today's compliance.
                </p>
                <div style={styles.chips}>
                  {QUICK_CHIPS.map((chip) => (
                    <button key={chip} style={styles.chip} onClick={() => send(chip)}>{chip}</button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} style={{ ...styles.msgRow, justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={m.role === "user" ? styles.bubbleUser : styles.bubbleBot}>
                  {m.text}
                </div>
              </div>
            ))}

            {loading && (
              <div style={{ ...styles.msgRow, justifyContent: "flex-start" }}>
                <div style={styles.bubbleBot}>
                  <span style={styles.dot} /><span style={{ ...styles.dot, animationDelay: "0.2s" }} /><span style={{ ...styles.dot, animationDelay: "0.4s" }} />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div style={styles.inputRow}>
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKey}
              placeholder="Ask about site safety..."
              rows={1}
              style={styles.textarea}
            />
            <button onClick={() => send()} disabled={loading || !input.trim()} style={styles.sendBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
              </svg>
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes bounce {
          0%,60%,100% { transform: translateY(0); }
          30% { transform: translateY(-5px); }
        }
      `}</style>
    </>
  );
}

const styles = {
  fab: {
    position: "fixed", bottom: 24, right: 24, zIndex: 9999,
    width: 56, height: 56, borderRadius: "50%", background: "#1a56db",
    border: "none", cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center",
    boxShadow: "0 4px 16px rgba(26,86,219,0.4)", transition: "transform 0.2s",
  },
  badge: {
    position: "absolute", top: -4, right: -4, background: "#e24b4a",
    color: "white", fontSize: 10, fontWeight: 600, width: 18, height: 18,
    borderRadius: "50%", display: "flex", alignItems: "center",
    justifyContent: "center", border: "2px solid white",
  },
  panel: {
    position: "fixed", bottom: 90, right: 24, zIndex: 9998,
    width: 360, height: "min(480px, calc(100vh - 110px))",maxHeight: "calc(100vh - 110px)", background: "#0f1117",
    border: "1px solid #2a2d3a", borderRadius: 16,
    display: "flex", flexDirection: "column", overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  },
  header: {
    background: "#1a1d2e", padding: "14px 16px",
    display: "flex", alignItems: "center", gap: 10,
    borderBottom: "1px solid #2a2d3a", flexShrink: 0,
  },
  headerIcon: {
    width: 32, height: 32, borderRadius: "50%", background: "#1a56db",
    display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
  },
  headerTitle: { fontSize: 14, fontWeight: 500, color: "#e2e8f0" },
  headerSub:   { fontSize: 11, color: "#64748b" },
  onlineDot:   { width: 8, height: 8, borderRadius: "50%", background: "#22c55e", flexShrink: 0 },
  messages: {
    flex: 1, overflowY: "auto", padding: "14px 14px 8px",
    display: "flex", flexDirection: "column", gap: 10,
  },
  emptyState: {
    flex: 1, display: "flex", flexDirection: "column",
    alignItems: "center", justifyContent: "center", gap: 12, padding: 20,
  },
  emptyText: { fontSize: 13, color: "#475569", textAlign: "center", lineHeight: 1.6 },
  chips: { display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center" },
  chip: {
    fontSize: 11, padding: "5px 10px", borderRadius: 20,
    border: "1px solid #2a2d3a", background: "#1a1d2e",
    color: "#94a3b8", cursor: "pointer",
  },
  msgRow:    { display: "flex", width: "100%" },
  bubbleUser: {
    maxWidth: "80%", padding: "9px 13px", borderRadius: 12, fontSize: 13,
    lineHeight: 1.5, background: "#1a56db", color: "#fff",
    borderBottomRightRadius: 4, whiteSpace: "pre-wrap", wordBreak: "break-word",
  },
  bubbleBot: {
    maxWidth: "80%", padding: "9px 13px", borderRadius: 12, fontSize: 13,
    lineHeight: 1.5, background: "#1e2132", color: "#cbd5e1",
    border: "1px solid #2a2d3a", borderBottomLeftRadius: 4,
    whiteSpace: "pre-wrap", wordBreak: "break-word",
    display: "flex", gap: 4, alignItems: "center",
  },
  dot: {
    display: "inline-block", width: 6, height: 6, borderRadius: "50%",
    background: "#475569", animation: "bounce 1.2s infinite",
  },
  inputRow: {
    display: "flex", gap: 8, padding: "10px 14px 14px",
    borderTop: "1px solid #2a2d3a", background: "#0f1117", flexShrink: 0,
  },
  textarea: {
    flex: 1, background: "#1a1d2e", border: "1px solid #2a2d3a",
    borderRadius: 10, padding: "9px 12px", fontSize: 13, color: "#e2e8f0",
    outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.4,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 9, background: "#1a56db",
    border: "none", cursor: "pointer", display: "flex",
    alignItems: "center", justifyContent: "center", flexShrink: 0, alignSelf: "flex-end",
  },
};