import { useState } from "react"

function Popup() {
  const [cacheCleared, setCacheCleared] = useState(false)

  async function handleClearCache() {
    await new Promise<void>((resolve) => {
      chrome.storage.local.remove("propsight_cache", resolve)
    })
    setCacheCleared(true)
    setTimeout(() => setCacheCleared(false), 2000)
  }

  return (
    <div
      style={{
        width: 300,
        padding: 20,
        fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        backgroundColor: "#FAFAFA",
      }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 24, marginRight: 8 }}>🔍</span>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: 18,
              fontWeight: 700,
              color: "#1F2937",
            }}>
            PropSight
          </h1>
          <p style={{ margin: 0, fontSize: 12, color: "#6B7280" }}>
            SG Rental Copilot
          </p>
        </div>
      </div>

      {/* Info */}
      <div
        style={{
          padding: "10px 12px",
          background: "#DCFCE7",
          borderRadius: 8,
          marginBottom: 16,
          fontSize: 12,
          color: "#166534",
          lineHeight: 1.5,
        }}>
        Tags are extracted client-side using pattern matching — no backend
        or API keys needed. Results are cached locally for 24 hours.
      </div>

      {/* Clear Cache */}
      <button
        onClick={handleClearCache}
        style={{
          width: "100%",
          padding: "10px 16px",
          background: cacheCleared ? "#16A34A" : "#4F46E5",
          color: "white",
          border: "none",
          borderRadius: 8,
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
          transition: "background 0.2s",
        }}>
        {cacheCleared ? "✓ Cache Cleared!" : "Clear Tag Cache"}
      </button>

      {/* Usage hint */}
      <p
        style={{
          marginTop: 12,
          marginBottom: 0,
          fontSize: 11,
          color: "#9CA3AF",
          textAlign: "center",
        }}>
        Browse PropertyGuru rental listings to see tags appear automatically.
      </p>
    </div>
  )
}

export default Popup
